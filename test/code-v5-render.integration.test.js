import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const requireCjs = createRequire(import.meta.url);
const tui = requireCjs('../src/utils/tui.js');
const codeV5 = requireCjs('../src/commands/code_v5.js');
const { renderToolCall } = requireCjs('../src/utils/tool-card.js');
const writeFileTool = requireCjs('../src/tools/write_file.js');
const editFileTool = requireCjs('../src/tools/edit_file.js');

const {
  captureFileSnapshot,
  createScrollbackArchive,
  displayAssistantReply,
  isEmptyAssistantReply,
  resolveMaxToolRounds,
  resolveMaxOutputTokens,
  isMaxTokensRejection,
} = codeV5._presentation;
const plain = value => tui.stripAnsi(value);
let saved;
let tempDir;

beforeEach(() => {
  saved = {
    color: tui.CAPS.color,
    trueColor: tui.CAPS.trueColor,
    noColor: process.env.NO_COLOR,
    forceColor: process.env.FORCE_COLOR,
  };
  delete process.env.NO_COLOR;
  delete process.env.FORCE_COLOR;
  tui.CAPS.color = true;
  tui.CAPS.trueColor = true;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-rock-c-'));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  tui.CAPS.color = saved.color;
  tui.CAPS.trueColor = saved.trueColor;
  if (saved.noColor === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = saved.noColor;
  if (saved.forceColor === undefined) delete process.env.FORCE_COLOR;
  else process.env.FORCE_COLOR = saved.forceColor;
});

describe('Rock C code_v5 rendering integration', () => {
  it('(g) renders all three assistant reply branches while preserving byte-identical raw history', () => {
    const source = fs.readFileSync(path.resolve('src/commands/code_v5.js'), 'utf8');
    expect(source.match(/writeFinishedReply\(fullReply\)/g) || []).toHaveLength(1);
    // İki etkileşimli dal + headless `-p` döngüsü + headless onarım döngüsü.
    // Dördüncüsü tamamlanma kapısıyla geldi: doğrulama başarısız olursa hata
    // çıktısı modele geri verilip düzeltme isteniyor.
    expect(source.match(/await streamAssistantReply\(/g) || []).toHaveLength(4);

    for (const branch of ['workflow-passthrough', 'workflow-summary', 'normal-agent']) {
      const raw = `# ${branch}\n\n**bold** \`code\`\nraw-byte:\u00a0end`;
      const messages = [];
      const display = displayAssistantReply(raw);
      messages.push({ role: 'assistant', content: raw });

      expect(plain(display)).toContain(branch);
      expect(display).toMatch(/\x1b\[/);
      expect(messages[0].content).toBe(raw);
      expect(Buffer.from(messages[0].content)).toEqual(Buffer.from(raw));
    }

    process.env.NO_COLOR = '1';
    expect(displayAssistantReply('# plain **reply**')).not.toMatch(/\x1b\[/);
  });

  it('(h) renders real before/after diffs from actual edit_file and overwrite write_file I/O', async () => {
    const editPath = path.join(tempDir, 'edit.txt');
    fs.writeFileSync(editPath, 'alpha\nold\nomega\n', 'utf8');
    // Geçici dizin workspace dışı; yazma sınırı onay istiyor (bkz. yazmaSiniri).
    const editArgs = { onayli: true, path: editPath, old_string: 'old', new_string: 'new' };
    const editBefore = captureFileSnapshot(editArgs);
    const editResult = await editFileTool.execute(editArgs);
    const editAfter = captureFileSnapshot(editArgs);
    const editCard = renderToolCall('edit_file', editArgs, editResult, {
      before: editBefore,
      after: editAfter,
      lang: 'en',
      maxLines: 30,
    });

    expect(editResult.success).toBe(true);
    expect(editAfter.content).toBe(fs.readFileSync(editPath, 'utf8'));
    expect(plain(editCard)).toContain('-old');
    expect(plain(editCard)).toContain('+new');

    const writePath = path.join(tempDir, 'write.txt');
    fs.writeFileSync(writePath, 'before\nkept\n', 'utf8');
    const writeArgs = { onayli: true, path: writePath, content: 'after\nkept\n' };
    const writeBefore = captureFileSnapshot(writeArgs);
    const writeResult = await writeFileTool.execute(writeArgs);
    const writeAfter = captureFileSnapshot(writeArgs);
    const writeCard = renderToolCall('write_file', writeArgs, writeResult, {
      before: writeBefore,
      after: writeAfter,
      lang: 'en',
      maxLines: 30,
    });

    expect(writeResult.success).toBe(true);
    expect(writeAfter.content).toBe(fs.readFileSync(writePath, 'utf8'));
    expect(plain(writeCard)).toContain('-before');
    expect(plain(writeCard)).toContain('+after');
    expect(writeCard).toContain(tui.fg(tui.PALETTE.danger));
    expect(writeCard).toContain(tui.fg(tui.PALETTE.success));
  });

  it('resolves home-prefixed snapshots like the mutation tools do', () => {
    const home = path.join(tempDir, 'home');
    fs.mkdirSync(path.join(home, 'project'), { recursive: true });
    fs.writeFileSync(path.join(home, 'project', 'edit.txt'), 'before\n', 'utf8');
    expect(captureFileSnapshot({ path: '~/project/edit.txt' }, { home })).toEqual({
      available: true,
      content: 'before\n',
    });
  });

  it('defaults long code turns to 10,000 rounds and supports unlimited', () => {
    expect(resolveMaxToolRounds({}, {})).toBe(10_000);
    expect(resolveMaxToolRounds({ codeMaxToolRounds: 25_000 }, {})).toBe(25_000);
    expect(resolveMaxToolRounds({ code: { maxToolRounds: 50_000 } }, {})).toBe(50_000);
    expect(resolveMaxToolRounds({}, { SKULD_CODE_MAX_TOOL_ROUNDS: '0' })).toBe(Infinity);
  });

  // Sohbet için ölçülmüş 2048 token'lık efor bütçesi kodlama ajanında bir
  // `write_file` çağrısının argümanını kesiyordu; kesik çağrı geçmişe girince
  // sağlayıcı boş gövde dönmeye başlıyor ve oturum ölüyordu. Tavan, efor
  // seviyesinden bağımsız olarak bir dosyayı yazmaya yetmeli.
  it('gives the coding agent an output budget a whole file fits in', () => {
    expect(resolveMaxOutputTokens({ maxTokens: 2048 }, {}, {})).toBe(16_384);
    expect(resolveMaxOutputTokens({ maxTokens: 1024 }, {}, {})).toBe(16_384);
    // Daha yüksek bir efor tavanı asla küçültülmez.
    expect(resolveMaxOutputTokens({ maxTokens: 32_000 }, {}, {})).toBe(32_000);
    // Açık ayar her şeyi geçersiz kılar; env ayardan önce gelir.
    expect(resolveMaxOutputTokens({ maxTokens: 2048 }, { codeMaxOutputTokens: 4096 }, {})).toBe(4096);
    expect(resolveMaxOutputTokens({ maxTokens: 2048 }, { code: { maxOutputTokens: 8192 } }, {})).toBe(8192);
    expect(resolveMaxOutputTokens(
      { maxTokens: 2048 },
      { codeMaxOutputTokens: 4096 },
      { SKULD_CODE_MAX_OUTPUT_TOKENS: '9000' },
    )).toBe(9000);
    // Anlamsız değerler yok sayılır, varsayılan korunur.
    expect(resolveMaxOutputTokens({ maxTokens: 2048 }, { codeMaxOutputTokens: 'abc' }, {})).toBe(16_384);
    expect(resolveMaxOutputTokens({ maxTokens: 2048 }, { codeMaxOutputTokens: -1 }, {})).toBe(16_384);
  });

  it('recognises a provider refusing the requested output ceiling', () => {
    expect(isMaxTokensRejection(new Error(
      'Anthropic API error: 400 - max_tokens: 16384 > 8192, which is the maximum allowed',
    ))).toBe(true);
    expect(isMaxTokensRejection(new Error(
      'Provider API error: 400 - {"error":{"message":"invalid max_tokens: must be <= 4096"}}',
    ))).toBe(true);
    // Uzun oturumun asıl riski: tavan modele değil, kalan bağlama sığmıyor.
    // Çare aynı olduğu için aynı kapıdan geçmeli.
    expect(isMaxTokensRejection(new Error(
      "Provider API error: 400 - This model's maximum context length is 32768 tokens, "
      + 'however you requested 40960 tokens (24576 in the messages, 16384 in the completion)',
    ))).toBe(true);
    // Alakasız hatalar bütçeyi düşürmemeli — model geri düşüş zinciri devreye
    // girmeli.
    expect(isMaxTokensRejection(new Error('Provider API error: 429 - rate limit'))).toBe(false);
    expect(isMaxTokensRejection(new Error('fetch failed'))).toBe(false);
    expect(isMaxTokensRejection(undefined)).toBe(false);
  });

  it('does not treat an empty provider reply as a completed answer', () => {
    expect(isEmptyAssistantReply({ content: '', tool_calls: [] })).toBe(true);
    expect(isEmptyAssistantReply({ content: '   ' })).toBe(true);
    expect(isEmptyAssistantReply({ content: 'done' })).toBe(false);
    expect(isEmptyAssistantReply({ content: '', tool_calls: [{ id: 'call-1' }] })).toBe(false);
  });

  it('labels rejected tool arguments as failed in visual scrollback', () => {
    const archive = createScrollbackArchive({
      formatTool: (name, status) => `${name}:${status}`,
    });
    const messages = [
      {
        role: 'assistant',
        content: 'I will edit it.',
        tool_calls: [{ id: 'call-1', function: { name: 'write_file', arguments: '{' } }],
      },
      {
        role: 'tool',
        tool_call_id: 'call-1',
        content: 'ERROR: Tool arguments are not valid JSON',
      },
    ];

    expect(archive.sync(messages)).toContain('write_file:error');
  });
});
