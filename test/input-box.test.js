import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { describe, expect, it, vi } from 'vitest';

const requireCjs = createRequire(import.meta.url);
const tui = requireCjs('../src/utils/tui.js');
const {
  canUseInputBox,
  createTextModel,
  insertIntoModel,
  renderFrame,
  promptInput,
  getKeypressTransport,
} = requireCjs('../src/utils/input-box.js');
const codeV5 = requireCjs('../src/commands/code_v5.js');

class MiniTerminal {
  constructor() {
    this.rows = [[]];
    this.cursor = { row: 0, col: 0 };
    this.visible = true;
  }

  ensureRow(row) {
    while (this.rows.length <= row) this.rows.push([]);
  }

  write(value) {
    const source = String(value);
    let index = 0;
    while (index < source.length) {
      if (source[index] === '\x1b' && source[index + 1] === '[') {
        const match = source.slice(index).match(/^\x1b\[([0-9;?]*)([A-Za-z~])/);
        if (match) {
          const [, params, command] = match;
          const amount = Number(params || 1);
          if (command === 'm' || command === '~') {
            // styling and bracketed-paste control do not occupy cells
          } else if (command === 'A') {
            this.cursor.row = Math.max(0, this.cursor.row - amount);
          } else if (command === 'B') {
            this.cursor.row += amount;
            this.ensureRow(this.cursor.row);
          } else if (command === 'C') {
            this.cursor.col += amount;
          } else if (command === 'D') {
            this.cursor.col = Math.max(0, this.cursor.col - amount);
          } else if (command === 'G') {
            this.cursor.col = Math.max(0, amount - 1);
          } else if (command === 'K' && (params === '2' || params === '')) {
            this.ensureRow(this.cursor.row);
            this.rows[this.cursor.row] = [];
          } else if (command === 'J' && (params === '0' || params === '')) {
            this.ensureRow(this.cursor.row);
            this.rows = this.rows.slice(0, this.cursor.row + 1);
            this.rows[this.cursor.row] = this.rows[this.cursor.row].slice(0, this.cursor.col);
          } else if (command === 'h' && params === '?25') {
            this.visible = true;
          } else if (command === 'l' && params === '?25') {
            this.visible = false;
          }
          index += match[0].length;
          continue;
        }
      }
      if (source[index] === '\r') {
        this.cursor.col = 0;
        index++;
        continue;
      }
      if (source[index] === '\n') {
        this.cursor.row++;
        this.ensureRow(this.cursor.row);
        index++;
        continue;
      }
      const grapheme = Array.from(
        new Intl.Segmenter(undefined, { granularity: 'grapheme' })
          .segment(source.slice(index)),
        part => part.segment
      )[0];
      const width = tui.stringWidth(grapheme);
      this.ensureRow(this.cursor.row);
      this.rows[this.cursor.row][this.cursor.col] = grapheme;
      for (let col = 1; col < width; col++) {
        this.rows[this.cursor.row][this.cursor.col + col] = '';
      }
      this.cursor.col += width;
      index += grapheme.length;
    }
  }

  screen() {
    const lines = this.rows.map(row => {
      let last = row.length - 1;
      while (last >= 0 && (row[last] === undefined || row[last] === ' ')) last--;
      return row.slice(0, last + 1).map(cell => cell ?? ' ').join('');
    });
    while (lines.length > 1 && lines.at(-1) === '') lines.pop();
    return lines;
  }
}

function terminal(columns = 40) {
  const input = new PassThrough();
  Object.defineProperties(input, {
    isTTY: { value: true, configurable: true },
    isRaw: { value: false, writable: true, configurable: true },
  });
  input.setRawMode = vi.fn(value => {
    input.isRaw = value;
    return input;
  });
  const output = new EventEmitter();
  output.isTTY = true;
  output.columns = columns;
  output.rows = 24;
  output.value = '';
  output.emulator = new MiniTerminal();
  output.write = vi.fn(chunk => {
    output.value += String(chunk);
    output.emulator.write(chunk);
    return true;
  });
  return { input, output, screen: output.emulator };
}

function type(input, value) {
  input.write(value);
}

describe('chat-style input box', () => {
  it('updates only the changed row while typing instead of repainting the whole box', async () => {
    const { input, output } = terminal(60);
    const pending = promptInput({ stdin: input, stdout: output, color: false });
    output.value = '';

    type(input, 'a');

    expect((output.value.match(/\x1b\[2K/g) || [])).toHaveLength(1);
    expect(output.value).not.toContain('\x1b[?25l');
    expect(output.value).not.toContain('\x1b[?25h');
    type(input, '\r');
    await expect(pending).resolves.toBe('a');
  });

  it('accepts the first raw bytes when Windows keypress decoding is dormant', async () => {
    const { input, output } = terminal(60);
    const pending = promptInput({ stdin: input, stdout: output, color: false });

    // Keep only the raw fallback listener, simulating a dormant readline
    // decoder even though ConPTY still delivers `data` bytes.
    const [rawFallback, ...decoderListeners] = input.listeners('data');
    for (const listener of decoderListeners) input.removeListener('data', listener);
    expect(rawFallback).toBeTypeOf('function');

    input.emit('data', Buffer.from('ilk harf'));
    await new Promise(resolve => setImmediate(resolve));
    input.emit('data', Buffer.from('\r'));
    await expect(pending).resolves.toBe('ilk harf');
  });

  it('reactivates input after returning to a Windows Terminal tab', async () => {
    const { input, output } = terminal(60);
    const pending = promptInput({ stdin: input, stdout: output, color: false });

    expect(output.value).toContain('\x1b[?1004h');
    input.emit('data', Buffer.from('\x1b[O'));
    input.isRaw = false;
    output.value = '';
    input.emit('data', Buffer.from('\x1b[I'));

    expect(input.setRawMode).toHaveBeenLastCalledWith(true);
    expect(input.isRaw).toBe(true);
    expect(output.value).toContain('\x1b[?1004h');

    // Reproduce the observed post-tab state: ConPTY delivers bytes but the
    // readline decoder stays dormant until Enter. The raw fallback must make
    // the text editable immediately, without using Enter as a wake-up key.
    const [rawFallback, ...decoderListeners] = input.listeners('data');
    for (const listener of decoderListeners) input.removeListener('data', listener);
    expect(rawFallback).toBeTypeOf('function');
    input.emit('data', Buffer.from('sekmeden d\u00f6n\u00fc\u015f'));
    await new Promise(resolve => setImmediate(resolve));
    input.emit('data', Buffer.from('\r'));

    await expect(pending).resolves.toBe('sekmeden d\u00f6n\u00fc\u015f');
    expect(output.value).toContain('\x1b[?1004l');
  });

  it('temporarily hands keyboard ownership to a nested selection and restores it', () => {
    const { input } = terminal(45);
    const transport = getKeypressTransport(input);
    const outer = vi.fn();
    const inner = vi.fn();
    const releaseOuter = transport.acquire(outer);
    const releaseInner = transport.acquire(inner);

    type(input, 'a');
    expect(inner).toHaveBeenCalled();
    expect(outer).not.toHaveBeenCalled();

    releaseInner();
    type(input, 'b');
    expect(outer).toHaveBeenCalled();
    releaseOuter();
    expect(transport.active).toBeNull();
  });

  it('anchors at column zero and removes stale cells below the composer', async () => {
    const { input, output, screen } = terminal(45);
    output.write('partial status');
    screen.cursor.row = 2;
    screen.ensureRow(3);
    screen.rows[3] = Array.from('stale text behind composer');

    const pending = promptInput({ stdin: input, stdout: output, color: false });
    expect(screen.screen().join('\n')).not.toContain('stale text behind composer');
    expect(screen.screen()[2]).toMatch(/^╭/);

    type(input, 'safe input');
    type(input, '\r');
    await expect(pending).resolves.toBe('safe input');
  });

  it('shows and selects slash commands with arrows and Enter', async () => {
    const { input, output } = terminal(60);
    const slashCommands = [
      { value: '/help', description: 'Show help' },
      { value: '/model', description: 'Switch model' },
      { value: '/tools', description: 'List tools' },
    ];
    const pending = promptInput({ stdin: input, stdout: output, color: false, slashCommands });
    type(input, '/');
    expect(output.value).toContain('/help  Show help');
    expect(output.value).toContain('/model  Switch model');
    type(input, '\x1b[B');
    type(input, '\r');
    await expect(pending).resolves.toBe('/model');
  });

  it('keeps required slash-command arguments editable after selection', async () => {
    const { input, output } = terminal(60);
    const pending = promptInput({
      stdin: input,
      stdout: output,
      color: false,
      slashCommands: [{ value: '/run', description: 'Run command', requiresArgument: true }],
    });
    type(input, '/r');
    type(input, '\r');
    type(input, 'npm test');
    type(input, '\r');
    await expect(pending).resolves.toBe('/run npm test');
  });

  it('opens the tool transcript with Ctrl+O and toggles detail with Enter', async () => {
    const { input, output } = terminal(60);
    let expanded = false;
    const getTranscript = vi.fn(options => {
      if (Number.isInteger(options.toggleLine)) expanded = !expanded;
      return expanded ? 'Tool: edit_file\n-old\n+new' : 'Tool: edit_file\n… (+2 lines)';
    });
    const pending = promptInput({ stdin: input, stdout: output, color: false, getTranscript });
    type(input, 'draft');
    // Besteci normal terminal görünümünde: bildirim kapalı, seçme/kopyalama
    // terminalin.
    expect(output.value).not.toContain('\x1b[?1000h');
    type(input, '\x0f');
    expect(output.value).toContain('\x1b[?1049h');
    // Döküm görünümü kendi ekranıdır ve gezinmesi tamamen kart tıklaması ile
    // tekerleğe dayanır; bildirim kapalıyken ikisi de ölü koddu.
    expect(output.value).toContain('\x1b[?1000h');
    type(input, '\r');
    expect(output.value).toContain('-old');
    type(input, '\x0f');
    type(input, '\r');
    await expect(pending).resolves.toBe('draft');
  });

  it('uses an in-place transcript overlay inside the fullscreen code shell', async () => {
    const { input, output } = terminal(60);
    const onTranscriptClose = vi.fn();
    const pending = promptInput({
      stdin: input,
      stdout: output,
      color: false,
      getTranscript: () => 'Tool: read_file',
      transcriptUsesAlternateScreen: false,
      onTranscriptClose,
    });
    output.value = '';

    type(input, '\x0f');
    expect(output.value).toContain('Tool: read_file');
    expect(output.value).not.toContain('\x1b[?1049h');
    type(input, '\x0f');

    expect(onTranscriptClose).toHaveBeenCalledOnce();
    expect(output.value).not.toContain('\x1b[?1049l');
    type(input, '\r');
    await expect(pending).resolves.toBe('');
  });

  it('leaves terminal mouse reporting disabled in the main view', async () => {
    const { input, output } = terminal(60);
    const getTranscript = vi.fn(() => 'Tool');
    const pending = promptInput({ stdin: input, stdout: output, color: false, getTranscript });
    expect(output.value).not.toContain('\x1b[?1000h');
    expect(getTranscript).not.toHaveBeenCalled();
    type(input, '\r');
    await expect(pending).resolves.toBe('');
  });

  it('scrolls the transcript with PageUp and reports the mouse inside it', async () => {
    const { input, output } = terminal(60);
    const transcript = Array.from({ length: 60 }, (_, index) => `line-${index + 1}`).join('\n');
    const pending = promptInput({ stdin: input, stdout: output, color: false, getTranscript: () => transcript });
    type(input, '\x0f');
    expect(output.value).toContain('\x1b[?1000h');
    type(input, '\x1b[5~');
    expect(output.value).toContain('line-36');
    type(input, '\x0f');
    type(input, '\r');
    await expect(pending).resolves.toBe('');
  });

  it('scrolls the fullscreen viewport with PageUp and reports the mouse there', async () => {
    const { input, output } = terminal(60);
    const onViewportScroll = vi.fn(() => ({ browsing: true }));
    const onViewportReturn = vi.fn();
    const pending = promptInput({
      stdin: input,
      stdout: output,
      color: false,
      mouseScroll: true,
      onViewportScroll,
      onViewportReturn,
    });

    // `mouseScroll` = alternatif ekran etkin. Orada terminalin kendi kaydırma
    // geçmişi yoktur, yani korunacak bir seçim/kaydırma da yoktur — bildirim
    // kapalı bırakılınca tekerlek olayları hiç gelmiyor ve tam ekranda hiçbir
    // şey kaydırılamıyordu.
    expect(output.value).toContain('\x1b[?1000h');
    type(input, 'taslak');
    type(input, '\x1b[5~');
    expect(onViewportScroll).toHaveBeenCalledWith(-8);
    expect(onViewportReturn).not.toHaveBeenCalled();

    await new Promise(resolve => setImmediate(resolve));
    type(input, ' devam');
    expect(onViewportReturn).toHaveBeenCalledOnce();
    type(input, '\r');
    await expect(pending).resolves.toBe('taslak devam');
    expect(output.value).toContain('\x1b[?1000l');
  });

  // Kullanıcının bildirdiği hata: tam ekranda fareyle yukarı/aşağı kaydırma
  // hiç çalışmıyordu. Tekerleği işleyen kod vardı ama fare bildirimi hiçbir
  // yerde açılmadığı için terminal SGR paketini hiç göndermiyordu — yani o kod
  // ölüydü ve hiçbir test onu çalıştırmıyordu. Bu test paketi gerçekten
  // gönderiyor.
  it('scrolls the fullscreen viewport with the mouse wheel', async () => {
    const { input, output } = terminal(60);
    const onViewportScroll = vi.fn(() => ({ browsing: true }));
    const pending = promptInput({
      stdin: input,
      stdout: output,
      color: false,
      mouseScroll: true,
      onViewportScroll,
    });

    expect(output.value).toContain('\x1b[?1000h');
    expect(output.value).toContain('\x1b[?1006h');

    type(input, '\x1b[<64;10;5M');   // tekerlek yukarı
    expect(onViewportScroll).toHaveBeenCalledWith(-3);
    type(input, '\x1b[<65;10;5M');   // tekerlek aşağı
    expect(onViewportScroll).toHaveBeenLastCalledWith(3);

    type(input, '\r');
    await expect(pending).resolves.toBe('');
    // Çıkışta terminal her zaman kendi haline bırakılır.
    expect(output.value).toContain('\x1b[?1000l');
  });

  // Normal terminal görünümünde bildirim AÇILMAMALI: orada terminalin kendi
  // kaydırma geçmişi ve metin seçimi var, onları elinden almak bedava değil.
  it('does not report the mouse in the composer outside fullscreen', async () => {
    const { input, output } = terminal(60);
    const onViewportScroll = vi.fn(() => ({ browsing: true }));
    const pending = promptInput({
      stdin: input,
      stdout: output,
      color: false,
      mouseScroll: false,
      onViewportScroll,
    });

    expect(output.value).not.toContain('\x1b[?1000h');
    type(input, '\x1b[<64;10;5M');
    expect(onViewportScroll).not.toHaveBeenCalled();
    type(input, '\r');
    await expect(pending).resolves.toBe('');
  });

  it('does not open the tool transcript when the main viewport is scrolled', async () => {
    const { input, output } = terminal(60);
    const getTranscript = vi.fn(() => 'Tool details');
    const onViewportScroll = vi.fn(() => ({ browsing: true }));
    const pending = promptInput({
      stdin: input,
      stdout: output,
      color: false,
      mouseScroll: true,
      getTranscript,
      transcriptUsesAlternateScreen: false,
      onViewportScroll,
    });

    type(input, '\x1b[<64;10;10M');
    expect(onViewportScroll).toHaveBeenCalledWith(-3);
    expect(getTranscript).not.toHaveBeenCalled();
    expect(output.value).not.toContain('Tool details');

    type(input, '\x0f');
    expect(getTranscript).toHaveBeenCalled();
    expect(output.value).toContain('Tool details');
    type(input, '\x0f');
    type(input, '\r');
    await expect(pending).resolves.toBe('');
  });

  it('keeps delayed ConPTY mouse-coordinate fragments out of the composer', async () => {
    const { input, output } = terminal(60);
    const onViewportScroll = vi.fn(() => ({ browsing: true }));
    const pending = promptInput({
      stdin: input,
      stdout: output,
      color: false,
      mouseScroll: true,
      onViewportScroll,
    });

    type(input, '\x1b[<64;56;14M');
    await new Promise(resolve => setImmediate(resolve));
    input.emit('keypress', '64;56;14M', { sequence: '64;56;14M' });
    type(input, 'gercek yazi');
    type(input, '\r');

    expect(onViewportScroll).toHaveBeenCalledWith(-3);
    await expect(pending).resolves.toBe('gercek yazi');
  });

  it('buffers a fragmented SGR mouse packet instead of typing its coordinates', async () => {
    const { input, output } = terminal(60);
    const onViewportScroll = vi.fn(() => ({ browsing: true }));
    const pending = promptInput({
      stdin: input,
      stdout: output,
      color: false,
      mouseScroll: true,
      onViewportScroll,
    });

    type(input, '\x1b[<64;');
    type(input, '56;14M');
    await new Promise(resolve => setImmediate(resolve));
    type(input, 'temiz');
    type(input, '\r');

    expect(onViewportScroll).toHaveBeenCalledWith(-3);
    await expect(pending).resolves.toBe('temiz');
  });

  it('supports PageUp and PageDown in the fullscreen conversation viewport', async () => {
    const { input, output } = terminal(60);
    const onViewportScroll = vi.fn(delta => ({ browsing: delta < 0 }));
    const pending = promptInput({
      stdin: input,
      stdout: output,
      color: false,
      mouseScroll: true,
      onViewportScroll,
    });

    type(input, '\x1b[5~');
    type(input, '\x1b[6~');
    expect(onViewportScroll).toHaveBeenNthCalledWith(1, -8);
    expect(onViewportScroll).toHaveBeenNthCalledWith(2, 8);
    type(input, '\r');
    await expect(pending).resolves.toBe('');
  });

  it('(a) renders Turkish/emoji input and cleans the box before transcript output', async () => {
    const { input, output, screen } = terminal(45);
    const pending = promptInput({ stdin: input, stdout: output, history: [], color: false });
    type(input, 'merhaba çğşöü 🌿');
    expect(screen.screen().join('\n')).toContain('› merhaba çğşöü 🌿');
    type(input, '\r');
    const value = await pending;
    expect(value).toBe('merhaba çğşöü 🌿');
    output.write(`You ${value}\r\n`);
    expect(screen.screen()).toEqual([`You ${value}`]);
    expect(screen.cursor).toEqual({ row: 1, col: 0 });
  });

  it('(b, j) edits graphemes and keeps the cursor in the text area', async () => {
    const { input, output, screen } = terminal(30);
    const pending = promptInput({ stdin: input, stdout: output, color: false });
    type(input, 'ab🌿界');
    type(input, '\x1b[D\x1b[D');
    type(input, 'X');
    expect(screen.cursor.col).toBe(7);
    type(input, '\x1b[H');
    type(input, '\x1b[3~');
    type(input, '\x1b[F');
    type(input, '\x7f');
    type(input, '\r');
    await expect(pending).resolves.toBe('bX🌿');
  });

  it('(c, k) accepts explicit and bracketed paste, normalizing pasted newlines', async () => {
    const { input, output } = terminal();
    const pending = promptInput({ stdin: input, stdout: output, color: false });
    input.emit('keypress', 'one\r\ntwo', { sequence: 'one\r\ntwo' });
    type(input, '\x1b[200~three\nfour\x1b[201~');
    type(input, '\r');
    await expect(pending).resolves.toBe('one twothree four');
    expect(output.value).toContain('\x1b[?2004h');
    expect(output.value).toContain('\x1b[?2004l');
  });

  it('(d) recalls history, restores the draft, and collapses duplicates', async () => {
    const history = ['first', 'first', 'second'];
    const { input, output } = terminal();
    const pending = promptInput({ stdin: input, stdout: output, history, color: false });
    type(input, 'draft');
    type(input, '\x1b[A');
    type(input, '\x1b[B');
    type(input, '\r');
    await expect(pending).resolves.toBe('draft');
    expect(history).toEqual(['first', 'second', 'draft']);
  });

  it('(e) grows and shrinks wrapped rows without leaving debris', async () => {
    const { input, output, screen } = terminal(20);
    const pending = promptInput({ stdin: input, stdout: output, color: false });
    type(input, 'abcdefghijklmnop');
    expect(screen.screen()).toHaveLength(4);
    type(input, '\x7f\x7f\x7f');
    expect(screen.screen()).toHaveLength(3);
    expect(screen.screen().join('')).not.toContain('nop');
    type(input, '\r');
    await pending;
  });

  it('(f, g, k) rejects SIGINT and restores raw, pause, listeners, and cursor state', async () => {
    const { input, output, screen } = terminal();
    getKeypressTransport(input);
    const baseline = {
      raw: input.isRaw,
      paused: input.isPaused(),
      keypress: input.listeners('keypress'),
      data: input.listeners('data'),
      resize: output.listeners('resize'),
    };
    const pending = promptInput({ stdin: input, stdout: output, color: false });
    type(input, '\x03');
    await expect(pending).rejects.toMatchObject({ code: 'SIGINT' });
    expect(input.isRaw).toBe(baseline.raw);
    expect(input.isPaused()).toBe(baseline.paused);
    expect(input.listeners('keypress')).toEqual(baseline.keypress);
    expect(input.listeners('data')).toEqual(baseline.data);
    expect(output.listeners('resize')).toEqual(baseline.resize);
    expect(screen.visible).toBe(true);
    expect(output.value).toContain('\x1b[?2004l');
  });

  it('(g) funnels a render failure through the same restoration path', async () => {
    const { input, output } = terminal();
    getKeypressTransport(input);
    const baselineData = input.listeners('data');
    const originalWrite = output.write;
    let fail = false;
    output.write = vi.fn(chunk => {
      if (fail && String(chunk).includes('boom')) throw new Error('render failed');
      return originalWrite(chunk);
    });
    const pending = promptInput({ stdin: input, stdout: output, color: false });
    fail = true;
    input.emit('keypress', 'boom', { sequence: 'boom' });
    await expect(pending).rejects.toThrow('render failed');
    expect(input.isRaw).toBe(false);
    expect(input.isPaused()).toBe(true);
    expect(input.listeners('data')).toEqual(baselineData);
    expect(output.listenerCount('resize')).toBe(0);
  });

  it('(h) gates every TTY combination, width, override, and fallback construction', async () => {
    for (const stdinTTY of [false, true]) {
      for (const stdoutTTY of [false, true]) {
        expect(canUseInputBox({
          stdin: { isTTY: stdinTTY },
          stdout: { isTTY: stdoutTTY, columns: 80 },
          env: {},
        })).toBe(stdinTTY && stdoutTTY);
      }
    }
    expect(canUseInputBox({
      stdin: { isTTY: true },
      stdout: { isTTY: true, columns: 19 },
      env: {},
    })).toBe(false);
    expect(canUseInputBox({
      stdin: { isTTY: true },
      stdout: { isTTY: true, columns: 80 },
      env: { SKULD_PLAIN_INPUT: '1' },
    })).toBe(false);

    const readlineModule = { createInterface: vi.fn(() => ({
      question: (_prompt, callback) => callback('fallback'),
      close: vi.fn(),
    })) };
    const prompt = vi.fn();
    const session = codeV5._presentation.createCodeInputSession({
      stdin: { isTTY: false },
      stdout: { isTTY: true, columns: 80 },
      env: {},
      readlineModule,
      prompt,
    });
    await expect(session.read()).resolves.toBe('fallback');
    expect(readlineModule.createInterface).toHaveBeenCalledOnce();
    expect(prompt).not.toHaveBeenCalled();
    session.close();
  });

  it('(i) switches 25 -> 10 -> 25 with a long buffer intact', async () => {
    const { input, output, screen } = terminal(25);
    const value = 'this is much longer than ten';
    const pending = promptInput({ stdin: input, stdout: output, color: false });
    type(input, value);
    output.columns = 10;
    output.emit('resize');
    expect(screen.screen()).toHaveLength(1);
    expect(screen.screen()[0].startsWith('› ')).toBe(true);
    expect(tui.stringWidth(screen.screen()[0])).toBeLessThanOrEqual(9);
    output.columns = 25;
    output.emit('resize');
    expect(screen.screen()[0]).toContain('╭');
    type(input, '\r');
    await expect(pending).resolves.toBe(value);
  });

  it('queues nested selection input without creating a second stdin owner', async () => {
    const stdin = new PassThrough();
    stdin.isTTY = false;
    const stdout = new PassThrough();
    stdout.isTTY = false;
    stdout.columns = 80;
    const session = codeV5._presentation.createCodeInputSession({ stdin, stdout, env: {} });

    stdin.end('/model\n1\n/exit\n');
    await expect(session.read()).resolves.toBe('/model');
    await expect(session.read({ question: 'choose: ', echo: false })).resolves.toBe('1');
    await expect(session.read()).resolves.toBe('/exit');
    expect(stdout.read()?.toString() || '').toContain('choose: ');
    session.close();
  });

  it('accepts a model number through the same boxed keyboard transport', async () => {
    const { input, output } = terminal(80);
    const session = codeV5._presentation.createCodeInputSession({
      stdin: input,
      stdout: output,
      env: {},
    });

    const command = session.read();
    type(input, '/model\r');
    await expect(command).resolves.toBe('/model');

    const selection = session.read({ placeholder: 'Model number', echo: false });
    type(input, '2\r');
    await expect(selection).resolves.toBe('2');
    session.close();
    expect(input.listenerCount('keypress')).toBe(0);
  });

  it('(j) pure frame maps middle, wrapped, emoji, and CJK cursor positions', () => {
    const model = createTextModel();
    insertIntoModel(model, 'ab🌿界cd');
    model.cursor = 4;
    const frame = renderFrame({ model, columns: 20, color: false });
    expect(frame.mode).toBe('box');
    expect(frame.cursorRow).toBe(1);
    expect(frame.cursorCol).toBe(10);

    insertIntoModel(model, 'abcdefghijklmnop');
    model.cursor = model.graphemes.length;
    const wrapped = renderFrame({ model, columns: 20, color: false });
    expect(wrapped.cursorRow).toBeGreaterThan(1);
    expect(wrapped.cursorCol).toBeLessThan(wrapped.width - 1);
  });

  it('(l) hands real bytes to the next owner and does not grow listeners over cycles', async () => {
    const { input, output } = terminal();
    const transport = getKeypressTransport(input);
    const baseline = {
      keypress: input.listenerCount('keypress'),
      data: input.listenerCount('data'),
    };
    for (let cycle = 0; cycle < 3; cycle++) {
      const pending = promptInput({ stdin: input, stdout: output, color: false });
      type(input, `box${cycle}\r`);
      await pending;
      let received = '';
      const release = transport.acquire(text => { received += text; });
      type(input, 'D');
      expect(received).toBe('D');
      release();
      expect(input.listenerCount('keypress')).toBe(baseline.keypress);
      expect(input.listenerCount('data')).toBe(baseline.data);
    }
    transport.dispose();
  });

  it('(g2) a submitted child session disposes and exits without leaked handles', async () => {
    const script = `
      const { PassThrough } = require('stream');
      const { promptInput, getKeypressTransport } = require('./src/utils/input-box');
      const input = new PassThrough();
      Object.defineProperties(input, {
        isTTY: { value: true },
        isRaw: { value: false, writable: true }
      });
      input.setRawMode = value => { input.isRaw = value; };
      const output = new (require('events').EventEmitter)();
      output.isTTY = true; output.columns = 30; output.write = () => true;
      const transport = getKeypressTransport(input);
      promptInput({ stdin: input, stdout: output, color: false }).then(() => {
        transport.dispose();
        process.stdout.write('done');
      });
      input.write('exit\\r');
    `;
    const child = spawn(process.execPath, ['-e', script], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    expect(exitCode).toBe(0);
    expect(stdout).toBe('done');
  });
});
