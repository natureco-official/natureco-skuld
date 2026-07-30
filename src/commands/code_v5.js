/**
 * nskuld code — agentic coding mode.
 *
 * The single interactive coding agent. The v2.23 agent (src/commands/code.js,
 * still reachable via `--legacy`) is deprecated; its project indexing, project
 * memory and workflow slash commands live here now, and both it and the
 * headless agent share this file's policy through src/utils/tool-gate.js.
 *
 * - Live streaming render with Esc-interrupt and transactional per-round rollback
 * - Built-in tools plus any configured MCP server (src/utils/mcp-tools.js)
 * - Risk / plan-mode / permission / hook screening on every tool call
 * - Automatic context compaction, resumable sessions, headless one-shot mode
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");
const { execSync, execFileSync } = require("child_process");
const chalk = require("chalk");
const { getLang: _gl } = require("../utils/i18n");
const L = (tr, en) => (_gl() === "en" ? en : tr);
const tui = require("../utils/tui");
const tema = require("../utils/skuld-theme");
const {
  canUseInputBox,
  promptInput,
  getKeypressTransport,
} = require("../utils/input-box");
const { renderMarkdown } = require("../utils/render");
const { createPresentationWriter, createStreamWriter } = require("../utils/stream-render");
const { renderToolCall } = require("../utils/tool-card");
const { createCodeScreen } = require("../utils/code-screen");
const {
  streamProviderCompletion,
  stopMcpServers,
} = require("../utils/api");
const { loadMcpToolDefinitions } = require("../utils/mcp-tools");
const { supportsNativeToolCalls } = require("../utils/provider-detect");
const { getConfig, saveConfig } = require("../utils/config");
const { discoverProviderModels, resolveModelSelection } = require('./models');
const { loadToolDefinitions, executeTool, toOpenAIFormat } = require("../utils/tools");
const { runPostHooks } = require("../utils/tool-hooks");
const { createToolGate, assessRisk } = require("../utils/tool-gate");
const { getPlanMode } = require("../utils/plan-mode");
const { getWorktree } = require("../utils/worktree");
const { getLevel: getEffortLevel, getConfig: getEffortConfig } = require("../utils/effort-levels");
const { getResponseFormat } = require("../utils/structured-output");
const { getFallbackChain } = require("../utils/fallback-chain");
const { getTaskManager } = require("../utils/tasks");
const { buildTiers, assemble, discoverProjectRules } = require("../utils/system-prompt");
const { buildSkillIndex } = require("../utils/skill-index");
const {
  indexProject,
  buildIndexPrompt,
  detectTestCommand,
  loadProjectMemory,
  appendProjectMemory,
} = require("../utils/project-index");
const { saveSession, loadLastSession, listSessions, loadCommandSession } = require("../utils/sessions");
const { selectTools, buildCatalog, buildCatalogNames, createEnableToolsTool } = require("../utils/tool-profile");
const { AgentCore } = require("../utils/agent-core");
const { prepareConversationHistory } = require("../utils/conversation-context");
const { getSkuldPaths } = require('../utils/skuld-paths');
const tokenBudget = require("../utils/token-budget");

const DEFAULT_MAX_TOOL_ROUNDS = 10_000;
const EMPTY_REPLY_RETRY_LIMIT = 2;
const MAX_TRANSCRIPT_CARDS = 200;
const MAX_TRANSCRIPT_BYTES = 4 * 1024 * 1024;

function resolveMaxToolRounds(config = {}, env = process.env) {
  const raw = env.SKULD_CODE_MAX_TOOL_ROUNDS
    ?? env.NATURECO_CODE_MAX_TOOL_ROUNDS
    ?? config.codeMaxToolRounds
    ?? config.code?.maxToolRounds;
  if (raw === undefined || raw === null || raw === '') return DEFAULT_MAX_TOOL_ROUNDS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_MAX_TOOL_ROUNDS;
  if (parsed === 0) return Infinity;
  return Math.max(1, Math.floor(parsed));
}

function createScrollbackArchive(options = {}) {
  const entries = [];
  const seen = new WeakSet();
  const formatUser = options.formatUser || (content => `YOU  ${content}`);
  const formatAssistant = options.formatAssistant || (content => `SKULD  ${content}`);
  const formatTool = options.formatTool || ((name, status) =>
    `◆ ${name}  ${status === 'error' ? 'failed' : status === 'pending' ? 'pending' : 'ran'}`);

  const sync = messages => {
    const toolResults = new Map();
    for (const message of messages || []) {
      if (message?.role === 'tool' && message.tool_call_id) {
        const content = String(message.content || '');
        toolResults.set(message.tool_call_id, /^\s*ERROR:/i.test(content) ? 'error' : 'success');
      }
    }
    for (const message of messages || []) {
      if (!message || typeof message !== 'object' || seen.has(message)) continue;
      seen.add(message);
      if (message.role === 'system' || message.role === 'tool') continue;
      if (message.role === 'user') {
        const content = String(message.content || '');
        if (!/^\s*\[(?:RECALL|MEMORY|HAFIZA)\b/i.test(content)) entries.push(formatUser(content));
        continue;
      }
      if (message.role === 'assistant') {
        if (message.content) entries.push(formatAssistant(String(message.content)));
        for (const call of message.tool_calls || []) {
          entries.push(formatTool(
            call.function?.name || 'tool',
            toolResults.get(call.id) || 'pending',
          ));
        }
      }
    }
    return entries.join('\n\n');
  };

  return { sync, entries };
}

function isEmptyAssistantReply(reply) {
  return !reply?.tool_calls?.length && !String(reply?.content || '').trim();
}

function writeQualityReport(report, write = value => process.stderr.write(value)) {
  if (!report) return false;
  for (const finding of report.bulgular || []) {
    const icon = finding.seviye === 'blok' ? '⛔' : finding.seviye === 'uyari' ? '⚠' : 'ℹ';
    write(`${icon} ${finding.baslik}${finding.ayrinti ? ` — ${finding.ayrinti}` : ''}\n`);
  }
  if (!report.codednaCalisti && report.codednaYokNedeni) {
    write(`${L('CodeDNA atlandı', 'CodeDNA skipped')}: ${report.codednaYokNedeni}\n`);
  }
  return report.blokluyorMu === true;
}

const agentCore = new AgentCore({ maxIterations: DEFAULT_MAX_TOOL_ROUNDS });

/**
 * Keep the transcript under the provider's context ceiling.
 *
 * The loop appends an assistant turn plus one result per tool call every
 * iteration, so a long session grew without bound until the provider returned
 * a context-length error mid-task. Compact in place (the caller holds the same
 * array reference) once the estimate crosses the budget.
 */
function compactIfNeeded(messages, { force = false, presentation, quiet = false } = {}) {
  if (!force && !tokenBudget.needsCompaction(messages)) return null;
  const before = messages.length;
  const beforeTokens = tokenBudget.estimateMessageTokens(messages);
  const trimmed = tokenBudget.smartTrim(messages);
  if (trimmed.length >= before) return null;
  messages.splice(0, messages.length, ...trimmed);
  const summary = {
    before,
    after: messages.length,
    beforeTokens,
    afterTokens: tokenBudget.estimateMessageTokens(messages),
  };
  const line = "  " + tui.C.muted(
    `↯ ${L('bağlam sıkıştırıldı', 'context compacted')}: ${summary.before} → ${summary.after} ` +
    `(~${summary.beforeTokens} → ~${summary.afterTokens} token)`,
  ) + "\n";
  if (presentation) presentation.writeCommitted(line);
  else if (quiet) process.stderr.write(line);
  else process.stdout.write(line);
  return summary;
}

function createAbortError(message = 'The operation was aborted') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function isAbortError(error, signal) {
  return Boolean(signal?.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR');
}

function createCodeInputSession({
  stdin = process.stdin,
  stdout = process.stdout,
  env = process.env,
  readlineModule = readline,
  prompt = promptInput,
  getTranscript,
  slashCommands = [],
  screen,
  getScrollback,
} = {}) {
  const boxed = canUseInputBox({ stdin, stdout, env });
  const history = [];
  const transport = boxed ? getKeypressTransport(stdin) : null;
  const rl = boxed ? null : readlineModule.createInterface({ input: stdin, output: stdout });
  let closed = false;
  const lineQueue = [];
  const lineWaiters = [];
  const queuedLines = Boolean(rl && typeof rl.on === 'function');
  if (queuedLines) {
    rl.on('line', line => {
      const resolve = lineWaiters.shift();
      if (resolve) resolve(line);
      else lineQueue.push(line);
    });
    rl.on('close', () => {
      closed = true;
      while (lineWaiters.length) lineWaiters.shift()('');
    });
  }

  return {
    boxed,
    rl,
    async read(options = {}) {
      if (!boxed) {
        if (!queuedLines) {
          return new Promise(resolve => rl.question(options.question || "", resolve));
        }
        if (options.question) stdout.write(options.question);
        if (lineQueue.length) return lineQueue.shift();
        if (closed) return '';
        return new Promise(resolve => lineWaiters.push(resolve));
      }
      screen?.anchorInput?.();
      const value = await prompt({
        stdin,
        stdout,
        env,
        history,
        placeholder: options.placeholder || L('Bir mesaj yazın…', 'Type a message…'),
        getTranscript,
        slashCommands,
        transcriptUsesAlternateScreen: !screen?.active,
        onTranscriptClose: () => {
          if (!screen?.active) return;
          screen.clearBody();
          screen.redraw();
        },
        mouseScroll: Boolean(screen?.active && screen?.mouseCapture),
        transcriptMouse: screen ? Boolean(screen.mouseCapture) : true,
        onViewportScroll: delta => screen?.scrollViewport(delta, getScrollback?.()),
        onViewportReturn: () => screen?.returnToComposer(getScrollback?.()),
        fixedBottomRow: () => screen?.active ? screen.composerBottom() : undefined,
        onFrameLayout: rows => screen?.setComposerRows(rows),
      });
      if (options.echo !== false) {
        stdout.write("  " + tui.styled("You  ", { color: tui.PALETTE.primary, bold: true }) + value + "\n");
      }
      return value;
    },
    close() {
      if (closed) return;
      closed = true;
      rl?.close();
      transport?.dispose();
    },
  };
}

/**
 * Bir turda modele verilen ÇIKTI bütçesi.
 *
 * Efor seviyeleri sohbet için ölçeklenmişti: `medium` = 2048 token. Kodlama
 * ajanında bu bütçe bir aracın ARGÜMANLARINI da kapsıyor ve `write_file`
 * çağrısının argümanı dosyanın tamamıdır. Ölçüldü (MiniMax-M2.5 ve M2.7, aynı
 * sonuç): 100 satırlık bir HTML dosyası yazdırıldığında çağrı ~6 KB'de
 * `finish_reason: "length"` ile kesiliyor, argüman yarım JSON kalıyor ve
 * ardından gelen her istek BOŞ GÖVDE dönüyor — ekranda "Model boş yanıt
 * verdi". Yani kesilme yalnızca o turu değil, oturumun tamamını bitiriyordu.
 *
 * `max_tokens` bir tavandır, harcama değil: üretilmeyen token ücretlendirilmez.
 * Bu yüzden tavan efor seviyesinden bağımsız olarak bir dosyayı yazmaya
 * yetecek kadar yüksek tutulur; efor seviyesi sıcaklığı, araç genişliğini ve
 * tur sayısını belirlemeye devam eder.
 */
const DEFAULT_CODE_MAX_OUTPUT_TOKENS = 16_384;

function resolveMaxOutputTokens(effortCfg, config = {}, env = process.env) {
  const raw = env.SKULD_CODE_MAX_OUTPUT_TOKENS
    ?? config.codeMaxOutputTokens
    ?? config.code?.maxOutputTokens;
  if (raw !== undefined && raw !== null && raw !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return Math.max(effortCfg.maxTokens || 0, DEFAULT_CODE_MAX_OUTPUT_TOKENS);
}

/**
 * Sağlayıcı, istediğimiz çıktı tavanını reddediyor mu?
 *
 * İki ayrı gerekçe, tek çare: (1) tavan modelin çıktı sınırından yüksek,
 * (2) girdi + tavan modelin bağlam penceresini aşıyor. İkisinde de doğru
 * hamle aynı: daha küçük bir tavanla bir kez daha denemek. Bunları ayırmanın
 * bir faydası yok, o yüzden tek kapı.
 *
 * Metne bakmak kırılgan görünür ama alternatifi her sağlayıcı için model →
 * çıktı sınırı tablosu tutmak ve o tablo her yeni modelde eskiyor. Yanlış
 * pozitifin bedeli tek bir küçük bütçeli yeniden deneme; yanlış negatifin
 * bedeli turun tamamen ölmesi.
 */
function isMaxTokensRejection(error) {
  const message = String(error?.message || '');
  const konu = /max_?tokens|max output|output limit|context length|context window/i.test(message);
  if (!konu) return false;
  return /exceed|too (large|high|big|many)|greater than|at most|maximum|invalid|must be|however you requested/i
    .test(message);
}

async function sendMessageWithTools(providerUrl, providerKey, model, messages, toolDefs, options = {}) {
  const runtimeConfig = getConfig();
  // `getEffortLevel()` argümansız çağrılıyordu, yani `cfg = {}` ile her zaman
  // `medium` dönüyordu: belgelenen `effort` ayarının hiçbir etkisi yoktu.
  const effortLevel = getEffortLevel(runtimeConfig);
  const effortCfg = getEffortConfig(effortLevel);
  const fallbackChain = getFallbackChain();
  const selectedModel = fallbackChain.current || model;
  // Only the advertised subset is serialized into the request; `toolDefs` still
  // holds everything, so execution can resolve a tool the model enabled mid-turn.
  const tools = toOpenAIFormat(options.exposedTools || toolDefs);
  const responseFormat = getResponseFormat({});
  const providerConfig = {
    url: providerUrl,
    apiKey: providerKey,
    model: selectedModel,
  };

  const maxTokens = options.maxTokens ?? resolveMaxOutputTokens(effortCfg, runtimeConfig);
  try {
    return await streamProviderCompletion(providerConfig, messages, tools, {
      signal: options.signal,
      onEvent: options.onEvent,
      model: selectedModel,
      temperature: effortCfg.temperature,
      maxTokens,
      responseFormat,
    });
  } catch (error) {
    if (isAbortError(error, options.signal)) throw error;
    // Kodlama tavanı, modelin kendi çıktı sınırından yüksek olabilir (eski
    // Anthropic modellerinde 4096/8192 gibi). Sağlayıcı bunu açıkça söylüyor;
    // model tablosu tutup eskitmek yerine söylediğini dinleyip bir kez
    // efor bütçesiyle tekrar deniyoruz. Modeli değiştirmiyoruz: sorun modelde
    // değil, istediğimiz tavanda.
    if (isMaxTokensRejection(error) && maxTokens > effortCfg.maxTokens) {
      return sendMessageWithTools(providerUrl, providerKey, model, messages, toolDefs, {
        ...options,
        maxTokens: effortCfg.maxTokens,
      });
    }
    const fallback = fallbackChain.recordError(selectedModel, error);
    if (fallback.fallback) {
      console.log(tui.C.yellow(`\n  ⚠ ${selectedModel} ${L('başarısız', 'failed')} → ${fallback.nextModel} ${L('deneniyor...', 'trying...')}\n`));
      return sendMessageWithTools(
        providerUrl,
        providerKey,
        fallback.nextModel,
        messages,
        toolDefs,
        options,
      );
    }
    throw error;
  }
}

/**
 * Read a single line from the user while a turn is in flight.
 *
 * The turn owns stdin in raw mode (Esc-interrupt), so a readline interface
 * created here would fight it: keystrokes reach both consumers and the prompt
 * echoes twice. Drop raw mode for the duration of the question and restore it
 * afterwards so Esc keeps working once the answer is in.
 */
function askLine(question) {
  return new Promise(resolve => {
    const input = process.stdin;
    const wasRaw = Boolean(input.isRaw);
    if (wasRaw && typeof input.setRawMode === 'function') input.setRawMode(false);
    const rl = readline.createInterface({ input, output: process.stdout });
    rl.question(question, answer => {
      rl.close();
      if (wasRaw && typeof input.setRawMode === 'function') input.setRawMode(true);
      resolve(String(answer || '').trim());
    });
  });
}

let activeCodeInputReader = null;

/**
 * Yes/no confirmation. Defaults to NO: these prompts guard destructive tool
 * calls, so a bare Enter (or a stray newline pasted into the terminal) must
 * never be read as approval.
 */
async function confirm(prompt) {
  const question = "\n  ⚠ " + prompt + " ";
  const answer = activeCodeInputReader
    ? await activeCodeInputReader({ question: chalk.yellow(question), placeholder: question.trim(), echo: false })
    : await askLine(chalk.yellow(question));
  return /^(y|yes|e|evet)$/i.test(answer);
}

const PERMISSION_ANSWERS = {
  y: 'once', yes: 'once', e: 'once', evet: 'once',
  s: 'session', session: 'session', o: 'session', oturum: 'session',
  p: 'persistent', persistent: 'persistent', k: 'persistent', kalici: 'persistent',
};

/**
 * Permission prompt with the three grant scopes the prompt actually advertises.
 * Previously every answer collapsed to a boolean, so "p" (persistent) was read
 * as a refusal and no answer could ever grant beyond the session.
 */
async function askPermission(prompt) {
  const question = "\n  ⚠ " + prompt + " ";
  const answer = activeCodeInputReader
    ? await activeCodeInputReader({ question: chalk.yellow(question), placeholder: question.trim(), echo: false })
    : await askLine(chalk.yellow(question));
  const normalized = answer.toLowerCase().replace(/[ıİ]/g, 'i');
  return PERMISSION_ANSWERS[normalized] || 'no';
}

const FILE_SNAPSHOT_MAX_BYTES = 256 * 1024;

function captureFileSnapshot(args, { allowMissing = false, home = os.homedir() } = {}) {
  const filePath = args?.filePath || args?.path;
  if (!filePath) return { available: false, reason: 'no-path' };
  const resolved = filePath === '~' || filePath.startsWith('~/') || filePath.startsWith('~\\')
    ? path.join(home, filePath.slice(1))
    : path.resolve(filePath);
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) return { available: false, reason: 'not-file' };
    if (stat.size > FILE_SNAPSHOT_MAX_BYTES) {
      return { available: false, reason: 'over-budget' };
    }
    return { available: true, content: fs.readFileSync(resolved, 'utf8') };
  } catch (error) {
    if (allowMissing && error && error.code === 'ENOENT') {
      return { available: true, content: '' };
    }
    return { available: false, reason: 'unavailable' };
  }
}

function displayAssistantReply(raw, opts = {}) {
  return renderMarkdown(raw, opts);
}

function writeFinishedReply(raw, options = {}) {
  const writer = createStreamWriter(options);
  writer.push(String(raw));
  writer.end();
  return writer.getRaw();
}

async function streamAssistantReply(providerUrl, providerKey, model, messages, toolDefs, options = {}) {
  // `--no-stream` was accepted by the CLI and then ignored. Honour it by
  // buffering the reply and rendering it once, while keeping the transport
  // streaming so Esc-interrupt, usage events and the fallback chain still work.
  const live = options.stream !== false;
  const writer = live ? createStreamWriter(options) : null;
  options.presentation?.updateStatus({ usage: null });
  const thinking = options.presentation?.startSpinner(
    options.thinkingLabel || L('Düşünüyor', 'Thinking')
  );
  let awaitingFirstDelta = true;
  let bufferedLength = 0;
  let reply;
  try {
    reply = await sendMessageWithTools(
      providerUrl,
      providerKey,
      model,
      messages,
      toolDefs,
      {
        signal: options.signal,
        exposedTools: options.exposedTools,
        onEvent: event => {
          if (awaitingFirstDelta &&
              (event?.type === 'text_delta' || event?.type === 'tool_call_delta')) {
            awaitingFirstDelta = false;
            thinking?.stop();
          }
          if (event?.type === 'usage') {
            options.presentation?.updateStatus({ usage: event.usage || event });
          } else if (event?.type === 'text_delta') {
            bufferedLength += String(event.text || '').length;
            options.presentation?.updateStatus({
              outputTokens: (options.estimatedOutputTokens || 0) +
                Math.ceil(((writer ? writer.getRaw().length : bufferedLength)) / 4),
            });
          }
          writer?.event(event);
          if (typeof options.onEvent === 'function') options.onEvent(event);
        },
      },
    );
  } finally {
    thinking?.stop();
    writer?.end();
  }
  const raw = writer
    ? writer.getRaw()
    : (typeof reply?.content === 'string' ? reply.content : '');
  // `quiet` is the headless case: the caller owns stdout and prints the final
  // answer itself, so rendering here would emit it twice.
  if (!writer && raw && !options.quiet) writeFinishedReply(raw, options);
  if (reply && reply.content !== null && reply.content !== undefined) reply.content = raw;
  return { reply, raw };
}

async function runTransactionalRound(messages, operation, options = {}) {
  const boundary = messages.length;
  const controller = new AbortController();
  const parentSignal = options.signal;
  const abortRound = () => controller.abort(parentSignal.reason || createAbortError());
  if (parentSignal?.aborted) abortRound();
  else parentSignal?.addEventListener('abort', abortRound, { once: true });

  try {
    const value = await operation(controller.signal);
    controller.signal.throwIfAborted();
    return value;
  } catch (error) {
    if (isAbortError(error, controller.signal)) {
      messages.splice(boundary);
      throw controller.signal.reason instanceof Error
        ? controller.signal.reason
        : createAbortError();
    }
    throw error;
  } finally {
    parentSignal?.removeEventListener('abort', abortRound);
  }
}

async function runInterruptibleTurn(options) {
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  const rl = options.rl;
  const controller = new AbortController();
  const activeTools = new Set();
  const tty = Boolean(input.isTTY);
  const priorRaw = Boolean(input.isRaw);
  let cause = null;
  let releaseKeypress;
  const presentation = options.presentation || createPresentationWriter({
    output,
    ...(options.presentationOptions || {}),
  });

  rl?.pause();
  try {
    if (tty) {
      if (typeof input.setRawMode === 'function') input.setRawMode(true);
      const keypressHandler = (_text, key = {}) => {
        if (controller.signal.aborted) return;
        if (key.ctrl && key.name === 'c') {
          cause = 'sigint';
          controller.abort(createAbortError('SIGINT'));
          return;
        }
        if (key.name !== 'escape') return;
        cause = 'escape';
        if (activeTools.size > 0) {
          presentation.writeCommitted('\n  ' + tui.C.yellow(
            `⏳ ${L('iptal ediliyor — bekleniyor', 'cancelling — waiting for')} ${Array.from(activeTools).join(', ')}…`
          ) + '\n');
        }
        controller.abort(createAbortError('Interrupted'));
      };
      releaseKeypress = getKeypressTransport(input).acquire(keypressHandler);
    }

    const value = await options.body(controller.signal, activeTools, presentation);
    controller.signal.throwIfAborted();
    return { value, interrupted: false, exited: false };
  } catch (error) {
    if (!isAbortError(error, controller.signal)) throw error;
    if (cause === 'sigint') return { interrupted: false, exited: true };
    if (cause === 'escape') {
      presentation.writeCommitted('\n  ' + tui.C.yellow(L('⏹ kesildi', '⏹ interrupted')) + '\n');
      return { interrupted: true, exited: false };
    }
    throw error;
  } finally {
    presentation.dispose();
    releaseKeypress?.();
    if (tty && typeof input.setRawMode === 'function') input.setRawMode(priorRaw);
    if (cause === 'sigint') rl?.close();
    else {
      rl?.resume();
      if (rl) input.resume?.();
    }
  }
}

function writeToolCard(name, args, result, snapshots = {}, presentation, { quiet = false, transcript } = {}) {
  const isFileChange = name === 'edit_file' || name === 'write_file';
  const compact = renderToolCall(name, args, result, {
    ...snapshots,
    maxLines: isFileChange ? 2000 : 5,
    expandHint: !isFileChange,
  });
  const expanded = renderToolCall(name, args, result, {
    ...snapshots,
    maxLines: 2000,
    expandHint: false,
  });
  transcript?.push({ compact, expanded });
  if (transcript) {
    let bytes = transcript.reduce((total, item) => total + Buffer.byteLength(item.expanded), 0);
    while (transcript.length > 1 &&
           (transcript.length > MAX_TRANSCRIPT_CARDS || bytes > MAX_TRANSCRIPT_BYTES)) {
      const removed = transcript.shift();
      bytes -= Buffer.byteLength(removed.expanded);
    }
  }
  const card = '\n' + compact + '\n';
  if (presentation) presentation.writeCommitted(card);
  // Headless: progress belongs on stderr so `-p` output stays pipeable.
  else if (quiet) process.stderr.write(card);
  else process.stdout.write(card);
}

/**
 * One-shot, tool-free model call used for `/commit` messages and `/done`
 * summaries. Deliberately does not go through the agent loop.
 */
async function askModelOnce(config, prompt, systemPrompt) {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });
  const reply = await streamProviderCompletion(
    { url: config.providerUrl, apiKey: config.providerApiKey, model: config.providerModel },
    messages,
    [],
    { model: config.providerModel, maxTokens: 512 },
  );
  return String(reply?.content || '').trim();
}

async function generateCommitMessage(diff, config) {
  const system = L(
    'Sen bir git commit mesajı üreticisisin. Conventional Commits formatında (feat/fix/refactor/chore vb.) kısa ve açıklayıcı tek satırlık bir mesaj yaz. Sadece mesajı yaz.',
    'You are a git commit message generator. Write a short, descriptive single-line message in Conventional Commits format (feat/fix/refactor/chore etc.). Output only the message.',
  );
  try {
    const message = await askModelOnce(config, `Generate a commit message for this diff:\n\n${diff}`, system);
    return message.split('\n')[0].replace(/^["']|["']$/g, '') || 'chore: update files';
  } catch {
    return 'chore: update files';
  }
}

/**
 * Restore a previous transcript.
 * Sessions are stored by src/utils/sessions.js under the "code" command name.
 */
function restoreSession(cliOptions) {
  if (cliOptions.continue) {
    const last = loadLastSession('code');
    return last ? { messages: last.messages || [], id: last.id, meta: last.metadata } : null;
  }
  if (typeof cliOptions.resume === 'string' && cliOptions.resume) {
    const data = loadCommandSession('code', cliOptions.resume);
    return data ? { messages: data.messages || [], id: data.id, meta: data.metadata } : null;
  }
  if (cliOptions.resume === true) {
    const last = loadLastSession('code');
    return last ? { messages: last.messages || [], id: last.id, meta: last.metadata } : null;
  }
  return null;
}

function printSessionList() {
  const sessions = listSessions('code');
  if (!sessions.length) {
    console.log("\n  " + tui.C.muted(L('Kayıtlı code oturumu yok.', 'No saved code sessions.')));
    return;
  }
  console.log("\n  " + tui.styled(L('Kayıtlı code oturumları', 'Saved code sessions'), { color: tui.PALETTE.primary, bold: true }));
  for (const session of sessions.slice(0, 20)) {
    const when = session.savedAt ? new Date(session.savedAt).toLocaleString() : '—';
    console.log("    " + tui.C.amber(String(session.id).padEnd(12)) +
      tui.C.muted(`${when}  ${session.messageCount} msg  `) +
      tui.C.text(session.preview ? session.preview.replace(/\s+/g, ' ') : ''));
  }
  console.log("");
}

async function codeV5(targetPath, cliOptions = {}) {
  const dryRun = Boolean(cliOptions.dryRun);
  const streaming = cliOptions.stream !== false;
  // `-p "task"` runs one turn and prints only the answer, for scripts and CI.
  const headlessPrompt = typeof cliOptions.print === 'string' && cliOptions.print.trim()
    ? cliOptions.print.trim()
    : null;
  // Opt-in workflow pre-step (see the turn body for why it is no longer the default).


  if (cliOptions.list) { printSessionList(); return; }

  const config = getConfig();
  const maxToolRounds = resolveMaxToolRounds(config);

  // Sağlayıcı OpenAI biçimi `tool_calls` üretemiyorsa XML ajan yoluna
  // GEÇMEK ZORUNLU — tercih değil.
  //
  // Bu, kurulu CLI ile canlı denendiğinde ortaya çıktı ve ürünü tamamen
  // çalışmaz kılıyordu: yapılandırılmış sağlayıcı Gemini,
  // `supportsNativeToolCalls` onun için `false` dönüyor, ve `code_v5` bunu hiç
  // kontrol etmiyordu. Sonuç: `nskuld code -p "dosyayı düzenle"` modelin
  // "düzenleyeceğim" demesiyle bitiyor, hiçbir araç çağrılmıyor, dosya
  // değişmiyor ve **çıkış kodu 0** — yani başarı.
  //
  // `supportsNativeToolCalls`'ın kendi belgesi tasarımı zaten anlatıyor:
  // "When it can, the agent loop talks to it directly. When it cannot,
  // requests are routed through the workflow tool's XML agentic runner."
  // Niyet vardı, bağlantı yoktu — S2 ile aynı sınıf hata.
  const yerelAracCagrisi = supportsNativeToolCalls(
    config.providerUrl, config.providerModel, getConfig(),
  );
  const useWorkflow = cliOptions.workflow === true
    || getConfig().codeWorkflow === true
    || !yerelAracCagrisi;
  if (!config.providerUrl || !config.providerApiKey) {
    // Exit non-zero: a script or CI job that pipes `nskuld code -p …` must be
    // able to tell "not configured" from "ran successfully".
    console.error(L(
      "\n  ❌ Provider ayarlı değil. Önce: nskuld setup\n  (Bot seçilmedi. Önce `nskuld agents` komutunu çalıştırın.)\n",
      "\n  ❌ Provider not configured. First: nskuld setup\n  (No bot selected. Run `nskuld agents` first.)\n",
    ));
    process.exitCode = 1;
    return;
  }

  const cwd = targetPath ? path.resolve(targetPath) : process.cwd();
  const skuldPaths = getSkuldPaths();
  // Tools resolve relative paths against process.cwd(), so without this
  // `--dir <project>` only changed what was indexed and displayed while every
  // write still landed in whatever directory the shell happened to be in.
  if (cwd !== process.cwd()) {
    try {
      process.chdir(cwd);
    } catch (error) {
      console.error(L(
        `\n  ❌ Çalışma dizinine geçilemedi: ${cwd}\n  ${error.message}\n`,
        `\n  ❌ Could not switch to the working directory: ${cwd}\n  ${error.message}\n`,
      ));
      process.exitCode = 1;
      return;
    }
  }
  // Full project index (type, entry points, npm scripts, git state) — the v5
  // agent previously had only a one-level readdir here, so it had to spend
  // tool calls rediscovering what the legacy agent already knew.
  let projectCtx = indexProject(cwd);
  const projectMemory = loadProjectMemory(cwd);
  const toolDefs = loadToolDefinitions();
  const builtinToolCount = toolDefs.length;

  // MCP servers, if any are configured. They were previously reachable only
  // from chat/repl; the coding agent never saw them.
  const mcp = await loadMcpToolDefinitions();
  const builtinNames = new Set(toolDefs.map(t => t.name));
  let addedMcpToolCount = 0;
  for (const tool of mcp.tools) {
    if (builtinNames.has(tool.name)) continue;
    toolDefs.push(tool);
    builtinNames.add(tool.name);
    addedMcpToolCount++;
  }

  // Inject virtual tools
  const planMode = getPlanMode();
  const wt = getWorktree();
  const taskMgr = getTaskManager();

  // File tracking for summary + snapshots
  const toolTranscript = [];
  function trackFileChanges(toolName, args, result, snapshots = {}) {
    // `structural_patch` ve `notebook_edit` de dosya DEĞİŞTİRİYOR ama
    // sayılmıyorlardı: yalnızca bu ikisiyle çalışan bir tur "hiçbir şey
    // değişmedi" görünüyor ve tamamlanma kapısı devreye girmiyordu.
    if (toolName === 'write_file' || toolName === 'edit_file'
        || toolName === 'structural_patch' || toolName === 'notebook_edit') {
      const fp = args.filePath || args.path;
      if (fp && result && result.success !== false) {
        filesChanged++;
        if (!changedFiles.includes(fp)) changedFiles.push(fp);
        lastChangedFile = fp;
        // Snapshot the content as it was BEFORE the edit. Snapshotting after
        // the write stored the new content, so "undo"/RestoreFile handed back
        // exactly the version the user wanted to discard.
        try {
          if (snapshots.before?.available) {
            require('../utils/file-history').snapshot(fp, snapshots.before.content);
          }
        } catch { /* history is best-effort; never fail the tool call over it */ }
      }
    }
    if (toolName === 'bash' || toolName === 'shell_command') {
      commandsRun++;
      // Komutun KENDİSİ kaydediliyor, yalnızca sayısı değil. Tamamlanma
      // kapısı "model bu turda gerçekten bir doğrulama koştu mu" diye soruyor
      // ve buna cevap vermek için komut metni gerekiyor.
      const komut = args && (args.command || args.cmd);
      if (komut && result && result.success !== false) modelKomutlari.push(String(komut));
    }
  }

  function processToolCallsWithTracking(reply, config, toolDefs, messages, options) {
    return processToolCalls(reply, config, toolDefs, messages, trackFileChanges, {
      ...options,
      dryRun,
      transcript: toolTranscript,
    });
  }
  const virtualTools = [
    {
      name: 'EnterPlanMode',
      description: 'Switch to plan-only mode. Research and plan without making changes. Use ExitPlanMode when ready.',
      parameters: { type: 'object', properties: {}, required: [] },
      execute: async () => {
        if (planMode.enter()) return { result: 'Plan mode activated. Use ExitPlanMode when your plan is ready.' };
        return { result: 'Already in plan mode.' };
      },
    },
    {
      name: 'ExitPlanMode',
      description: 'Exit plan mode and present your plan for review.',
      parameters: { type: 'object', properties: { plan: { type: 'string' }, summary: { type: 'string' } }, required: ['plan'] },
      execute: async (args) => {
        const ok = planMode.exit(args.plan);
        if (!ok) return { error: 'Not in plan mode.' };
        console.log(tui.C.cyan(L('\n  📋 Plan sunuldu. Onay için /plan approve yazın, red için /plan reject.\n', '\n  📋 Plan submitted. Type /plan approve to approve, /plan reject to reject.\n')));
        return { result: `Plan submitted.\n\n${args.plan}` };
      },
    },
    {
      name: 'EnterWorktree',
      description: 'Create an isolated worktree for experimental changes.',
      parameters: { type: 'object', properties: { branch: { type: 'string' } } },
      execute: async (args) => wt.enter(args),
    },
    {
      name: 'ExitWorktree',
      description: 'Exit the current worktree and merge changes back.',
      parameters: { type: 'object', properties: { merge: { type: 'boolean' } } },
      execute: async (args) => wt.exit(args),
    },
    {
      name: 'CreateTask', description: 'Run a command in the background.',
      parameters: { type: 'object', properties: { command: { type: 'string' }, timeout: { type: 'number' } }, required: ['command'] },
      execute: async (args) => taskMgr.create(args.command, args),
    },
    {
      name: 'ListTasks', description: 'List all background tasks.',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ tasks: taskMgr.list() }),
    },
    {
      name: 'GetTaskResult', description: 'Get the full result of a task.',
      parameters: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] },
      execute: async (args) => { const t = taskMgr.get(args.taskId); return t || { error: 'Task not found' }; },
    },
    {
      name: 'StopTask', description: 'Stop a running task.',
      parameters: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] },
      execute: async (args) => taskMgr.stop(args.taskId),
    },
    {
      name: 'SearchSessions', description: 'Search past sessions.',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      execute: async (args) => { const { search } = require('../utils/session-search'); return { results: search(args.query, 5) }; },
    },
    {
      name: 'RestoreFile', description: 'Restore a file from snapshot history.',
      parameters: { type: 'object', properties: { filePath: { type: 'string' }, timestamp: { type: 'number' } }, required: ['filePath'] },
      execute: async (args) => { const fh = require('../utils/file-history'); const snaps = fh.getHistory(args.filePath); if (!snaps.length) return { error: 'No history' }; return fh.restore(args.filePath, args.timestamp || snaps[0].timestamp); },
    },
    {
      name: 'FileHistory', description: 'List snapshot history for a file.',
      parameters: { type: 'object', properties: { filePath: { type: 'string' } }, required: ['filePath'] },
      execute: async (args) => { const fh = require('../utils/file-history'); return { snapshots: fh.getHistory(args.filePath) }; },
    },
    {
      name: 'UltraReview', description: 'Multi-focus code review (security, style, logic, performance).',
      parameters: { type: 'object', properties: { files: { type: 'array', items: { type: 'string' } }, diff: { type: 'string' } } },
      execute: async (args) => {
        const ur = require('../utils/ultra-review');
        if (args.diff) return ur.reviewDiff(args.diff);
        if (args.files) return { reviews: args.files.map(f => { try { return ur.reviewFile(f, fs.readFileSync(f, 'utf8')); } catch { return { file: f, error: 'Not found' }; } }) };
        return { error: 'Specify files or diff' };
      },
    },
    {
      name: 'ScheduleTask', description: 'Schedule a recurring cron task.',
      parameters: { type: 'object', properties: { schedule: { type: 'string' }, command: { type: 'string' }, description: { type: 'string' } }, required: ['schedule', 'command'] },
      execute: async (args) => require('../utils/cron').addJob(args),
    },
    {
      name: 'ListScheduledTasks', description: 'List cron tasks.',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ jobs: require('../utils/cron').loadJobs() }),
    },
    {
      name: 'RemoveScheduledTask', description: 'Remove a cron task.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      execute: async (args) => { require('../utils/cron').removeJob(args.id); return { removed: true }; },
    },
  ];
  toolDefs.push(...virtualTools);

  // Token economy: advertise a core set, catalogue the rest by name, and let
  // the model load any schema it needs on demand. Execution keeps resolving
  // against `toolDefs`, so an enabled tool works the moment it is enabled.
  const sessionEnabledTools = new Set();
  const toolProfile = cliOptions.allTools === true || getConfig().toolProfile === 'all' ? 'all' : 'core';
  toolDefs.push(createEnableToolsTool(
    sessionEnabledTools,
    () => toolDefs.map(t => t.name),
    () => buildCatalogNames(selectTools(toolDefs, { profile: toolProfile, enabled: sessionEnabledTools }).hidden),
  ));
  const exposedTools = () => selectTools(toolDefs, { profile: toolProfile, enabled: sessionEnabledTools }).exposed;
  const toolCatalog = () => buildCatalog(selectTools(toolDefs, { profile: toolProfile, enabled: sessionEnabledTools }).hidden);
  const agentToolCount = toolDefs.length - builtinToolCount - addedMcpToolCount;
  const codeScreen = headlessPrompt ? null : createCodeScreen({
    input: process.stdin,
    output: process.stdout,
    env: process.env,
    lang: _gl(),
    mode: cliOptions.minimal ? 'minimal' : (cliOptions.fullscreen ? 'fullscreen' : undefined),
    // Tekerlekle kaydırma, terminalin sürükleyerek seçme davranışını
    // uygulamaya devrederek çalışır (seçim Shift ile yapılır). Bu takası
    // istemeyen `codeMouseScroll: false` diyip doğal seçime döner; kaydırma
    // PgUp/PgDn ile sürer.
    mouseCapture: config.codeMouseScroll !== false && cliOptions.mouse !== false,
    project: cwd,
    branch: projectCtx?.gitBranch,
    changes: projectCtx?.gitStatus?.length,
    model: config.providerModel,
    tools: String(toolDefs.length),
    version: require('../../package.json').version,
  });
  codeScreen?.enter();

  if (!headlessPrompt) {
  if (codeScreen?.active) {
    console.log("\n  " + tui.C.brand(L('Skuld hazır', 'Skuld ready')) + tui.C.muted(
      `  ·  ${projectCtx.type.toUpperCase()}  ·  ${projectCtx.files.length} ${L('dosya', 'files')}  ·  /help`,
    ));
    for (const error of mcp.errors) console.log("  " + tui.C.yellow(`⚠ MCP: ${error}`));
    if (dryRun) console.log("  " + tui.C.yellow(L(
      '⚠ DRY RUN — yazma ve komut araçları reddedilecek.',
      '⚠ DRY RUN — writing and command tools will be refused.',
    )));
    console.log("");
  } else {
  // NatureCo Code is the reference product. Skuld keeps the same rich boxed
  // information architecture and interaction language under its own brand.
  const fit = (value, width = 47) => {
    const text = String(value ?? '—');
    return (text.length > width ? text.slice(0, Math.max(1, width - 1)) + '…' : text).padEnd(width);
  };
  console.log("");
  if (!cliOptions.acilisYapildi || codeScreen?.active) {
    for (const line of tema.KELIME_ISARETI) console.log('  ' + tema.gradyan(line, 200, 500));
    console.log('');
  }
  console.log(tui.styled("  ╭" + "─".repeat(58) + "╮", { color: tui.PALETTE.primary }));
  const titleLead = "  ⚡ ";
  const titleText = "Skuld Code Agent v5";
  const titleSuffix = "    NatureCo Code engine";
  const titlePadding = " ".repeat(Math.max(0, 58 - tui.stringWidth(titleLead + titleText + titleSuffix)));
  console.log(
    tui.styled("  │", { color: tui.PALETTE.primary })
    + titleLead + tui.styled(titleText, { color: tui.PALETTE.primary, bold: true })
    + tui.C.muted(titleSuffix) + titlePadding
    + tui.styled("│", { color: tui.PALETTE.primary }),
  );
  console.log(tui.styled("  │", { color: tui.PALETTE.primary }) + tui.C.muted(L("  Proje:  ", "  Project: ")) + tui.styled(fit(cwd), { color: tui.PALETTE.text }) + tui.styled(" │", { color: tui.PALETTE.primary }));
  console.log(tui.styled("  │", { color: tui.PALETTE.primary }) + tui.C.muted("  Model:  ") + tui.styled(fit(config.providerModel), { color: tui.PALETTE.text }) + tui.styled(" │", { color: tui.PALETTE.primary }));
  const toolCountLabel = `${toolDefs.length} (${builtinToolCount} ${L('yerleşik', 'built-in')} + ${agentToolCount} ${L('ajan', 'agent')})`;
  console.log(tui.styled("  │", { color: tui.PALETTE.primary }) + tui.C.muted(L("  Araç:   ", "  Tools:  ")) + tui.styled(fit(toolCountLabel), { color: tui.PALETTE.success, bold: true }) + tui.styled(" │", { color: tui.PALETTE.primary }));
  if (mcp.servers.length > 0) {
    const label = `${mcp.servers.join(", ")} (${mcp.tools.length})`;
    console.log(tui.styled("  │", { color: tui.PALETTE.primary }) + tui.C.muted("  MCP:    ") + tui.styled(fit(label), { color: tui.PALETTE.text }) + tui.styled(" │", { color: tui.PALETTE.primary }));
  }
  console.log(tui.styled("  ╰" + "─".repeat(58) + "╯", { color: tui.PALETTE.primary }));
  for (const error of mcp.errors) {
    console.log("  " + tui.C.yellow(`⚠ MCP: ${error}`));
  }

  // Project context
  if (projectCtx) {
    console.log("\n  " + tui.C.muted(L("📂 Proje bağlamı:", "📂 Project context:")));
    console.log("    " + tui.C.muted(L("• Tip: ", "• Type: ")) + tui.C.text(projectCtx.type.toUpperCase()) +
      tui.C.muted(`  ·  ${projectCtx.files.length} ${L('dosya', 'files')}`));
    if (projectCtx.mainFiles.length) {
      console.log("    " + tui.C.muted(L("• Giriş: ", "• Entry: ")) + tui.C.text(projectCtx.mainFiles.join(", ")));
    }
    const scripts = Object.keys(projectCtx.packageJson?.scripts || {});
    if (scripts.length) {
      console.log("    " + tui.C.muted("• Scripts: ") + tui.C.text(scripts.slice(0, 10).join(", ")));
    }
    if (projectCtx.gitBranch) {
      console.log("    " + tui.C.muted("• Git: ") + tui.C.text(projectCtx.gitBranch) +
        tui.C.muted(`  ·  ${projectCtx.gitStatus?.length || 0} ${L('değişiklik', 'changes')}`));
    }
    if (projectMemory) {
      console.log("    " + tui.C.muted(L("• Proje hafızası yüklendi (/memory)", "• Project memory loaded (/memory)")));
    }
  }

  if (dryRun) {
    console.log("\n  " + tui.C.yellow(L(
      "⚠ DRY RUN — dosya yazma / komut çalıştırma araçları reddedilecek.",
      "⚠ DRY RUN — file-writing and command-running tools will be refused.",
    )));
  }

  console.log("\n  " + tui.C.muted(L("Komutlar: /help ile tam liste", "Commands: /help for the full list")));
  console.log("");
  }
  }

  // Three-tier system prompt (Hermes-style)
  const skillsIndexBlock = buildSkillIndex();
  const cfg = getConfig();
  const projectRules = discoverProjectRules(cwd);
  // Same reasoning as the REPL: the workflow pre-step used to pre-load
  // persistent memory, and it is now opt-in.
  let memoryTreeDigest = '';
  let memoryTreeIndex = '';
  try {
    const tree = require('../tools/memory_tree')._internal;
    memoryTreeDigest = tree.buildDigest(cfg.userName) || '';
    memoryTreeIndex = tree.buildIndex(cfg.userName) || '';
  } catch { /* no tree yet — memory_tree/memory_search still available */ }

  const promptOpts = {
    botName: 'Skuld',
    userName: cfg.userName || L('kullanıcı', 'user'),
    skillsIndexBlock,
    projectRules,
    memoryTreeDigest,
    memoryTreeIndex,
    hasHistory: false,
    userHome: os.homedir(),
  };
  const { stable, context, volatile } = buildTiers(promptOpts);
  const catalogBlock = toolCatalog();
  const systemPrompt = [
    assemble(stable, context, volatile),
    '',
    buildIndexPrompt(projectCtx),
    projectMemory ? `\nProject memory:\n${tokenBudget.trimProjectMemory(projectMemory)}` : '',
    catalogBlock ? `\n${catalogBlock}` : '',
    `\nSkuld runtime: systemRoot=${skuldPaths.systemRoot}; installedPackage=${skuldPaths.packageInstallRoot}; runtimeSource=${skuldPaths.packageRoot}; entry=${skuldPaths.entryPath}; config=${skuldPaths.configPath}; logs=${skuldPaths.logsDir}. `
      + L('Kendi sistem dosyaların sorulursa tahmin etme; skuld_system aracını kullan.', 'If asked about your own system files, do not guess; use the skuld_system tool.'),
    `\n${L(
      'Kullanıcı bir GitHub depo bağlantısını kurmanı isterse git aracının clone işlemini kullan; ardından depodaki AGENTS.md/README ve paket bildirimlerini oku, belgelenmiş kurulum adımlarını çalıştır ve gerçek bir doğrulama yapmadan başarı iddia etme.',
      'When the user asks you to install a GitHub repository, use the git tool clone operation; then read AGENTS.md/README and package manifests, run the documented setup steps, and do not claim success without a real verification.',
    )}`,
    `\n${L(
      'Depo incelemelerinde proje talimatlarını ve gerçek uygulamayı oku; tarihî plan/issue maddelerini güncel bulgu gibi sunmadan önce kod ve testlerle doğrula. "Detaylı" inceleme istenirse yalnız dosya listesiyle yetinme.',
      'For repository reviews, read project instructions and actual implementation; verify historical plan/issue items against code and tests before presenting them as current findings. A "detailed" review must go beyond listing files.',
    )}`,
    `\n${L(
      'Son Türkçe yanıtı göndermeden önce yazım ve dilbilgisi denetimi yap; yarım/bozuk kelime bırakma ve Türkçe bağlamda "agent" yerine "ajan" kullan.',
      'Proofread the final response for spelling and grammar before sending; do not leave truncated or malformed words.',
    )}`,
  ].join('\n');

  let messages = [{ role: "system", content: systemPrompt }];

  const restored = restoreSession(cliOptions);
  if (restored) {
    const carried = (restored.messages || []).filter(m => m.role !== 'system');
    messages.push(...tokenBudget.repairToolPairing(carried));
  }
  if (!headlessPrompt) {
    if (restored) {
      console.log("  " + tui.C.green(
        `↺ ${L('oturum geri yüklendi', 'session restored')}: ${restored.id} (${messages.length - 1} ${L('mesaj', 'messages')})`,
      ));
    } else if (cliOptions.continue || cliOptions.resume) {
      console.log("  " + tui.C.yellow(L('Geri yüklenecek oturum bulunamadı, yeni oturum başlatılıyor.', 'No session to restore; starting a new one.')));
    }
    console.log("");
  }

  let totalIn = 0, totalOut = 0;
  let filesChanged = 0, commandsRun = 0;
  let lastChangedFile = null;
  const changedFiles = [];
  // Modelin bu oturumda çalıştırdığı kabuk komutları. Tamamlanma kapısı
  // bunlara bakıp zaten koşulmuş bir doğrulamayı ikinci kez koşmuyor.
  const modelKomutlari = [];
  const startTime = Date.now();
  const refreshCodeScreenContext = (activity) => {
    if (!codeScreen) return;
    const budget = tokenBudget.load();
    const limit = Math.max(1, (budget.maxContextTokens || 0) - (budget.reservedTokens || 0));
    const used = tokenBudget.estimateMessageTokens(messages);
    codeScreen.update({
      context: `${Math.min(100, Math.round((used / limit) * 100))}%`,
      ...(activity ? { activity } : {}),
    });
  };
  refreshCodeScreenContext(L('HAZIR', 'READY'));

  // ── Headless one-shot (`-p "task"`) ───────────────────────────────────────
  // Same tools, same gate, same compaction as the interactive loop — only the
  // presentation and the approval prompts are removed, so it is safe to run
  // from CI or a script.
  if (headlessPrompt) {
    // ── RECALL — Urðr hafızası, VARSAYILAN yolda ─────────────────────────
    // Hafıza `runAgentic`'e bağlanmıştı ama `code_v5` `runAgentic`'i hiç
    // çağırmıyor (Codex plan denetimi, S2 = YANLIŞ). Yani hafıza ürünün
    // kullanılan yolunda yoktu. Zincirin her halkası gösterilmeden "bağlandı"
    // denemez.
    const farklilastirici = require('../utils/farklilastiricilar');
    const hafiza = await farklilastirici.hafizaAc({ projeKoku: cwd });
    const kaliteKapisi = await farklilastirici.kaliteKapisiAc({ projeKoku: cwd });
    const kaliteTabaniSozu = kaliteKapisi
      ? kaliteKapisi.tara(cwd).catch(() => null)
      : Promise.resolve(null);
    const notlar = await farklilastirici.hatirlatmaMetni(hafiza, headlessPrompt);
    if (notlar) messages.push({ role: 'user', content: notlar });

    let finalText = '';
    let unresolved = true;
    // `unresolved` üç ayrı nedenle işaretleniyor — tur sınırı, doğrulama
    // kapısı, kalite kapısı — ama çıkıştaki uyarı hepsini "tur sınırına
    // ulaşıldı" diye bildiriyordu. Görev aslında bitmiş, yalnızca projede
    // çalıştırılacak bir test/lint komutu bulunamamışken kullanıcıya turların
    // tükendiğini söylemek düpedüz yanlış bilgi. Neden, işaretiyle birlikte
    // taşınır. Varsayılan tur sınırıdır: döngü temiz bir yanıtla bittiğinde
    // `unresolved` zaten `false` oluyor.
    let tamamlanmamaNedeni = L(
      `${maxToolRounds} araç turu sınırına ulaşıldı`,
      `reached the ${maxToolRounds}-tool-round limit`,
    );
    let xmlYoluKostu = false;

    // ── Sağlayıcı yerel araç çağrısı üretemiyorsa XML yoluna geç ─────────
    // `useWorkflow` yalnızca ETKİLEŞİMLİ yolda kontrol ediliyordu; headless
    // yol onu hiç kullanmıyordu. Yani Gemini/Ollama/Groq ile `nskuld code -p`
    // hiçbir araç çağıramıyor, model "yapacağım" diyip çıkıyor ve çıkış kodu
    // 0 oluyordu. Canlı denemede üç denemenin üçünde de böyle oldu.
    if (useWorkflow) {
      process.stderr.write(L(
        `Not: ${config.providerModel} yerel araç çağrısı üretmiyor — XML ajan yolu kullanılıyor.\n`,
        `Note: ${config.providerModel} does not emit native tool calls — using the XML agent path.\n`,
      ));
      try {
        const wf = await executeTool('workflow', {
          action: 'run',
          task: headlessPrompt,
          conversationHistory: prepareConversationHistory(messages, {
            maxMessages: tokenBudget.load().conversationInContext,
            maxTokens: tokenBudget.load().workflowHistoryMaxTokens,
          }),
        }, toolDefs, {});

        const sonuc = wf && (wf.result || wf);
        const adimlar = (sonuc && sonuc.results) || [];
        for (const r of adimlar) {
          // Değişen dosyalar ve koşan komutlar tamamlanma kapısına ulaşmalı;
          // yoksa kapı "hiçbir şey değişmedi" görür ve devreye girmez.
          trackFileChanges(r.tool || r.name, r.args || {}, r.result || { success: r.status === 'done' });
        }
        if (sonuc && sonuc.reply) finalText = String(sonuc.reply);
        unresolved = false;
        xmlYoluKostu = true;
      } catch (e) {
        const mesaj = e && e.message ? e.message : String(e);
        process.stderr.write(`${mesaj}\n`);
        unresolved = true;
        tamamlanmamaNedeni = L(`XML ajan yolu hata verdi: ${mesaj}`, `the XML agent path failed: ${mesaj}`);
      }
    }

    messages.push({ role: 'user', content: headlessPrompt });
    try {
      // XML yolu koştuysa doğrudan döngü ATLANIR — ikisini birlikte koşmak
      // aynı işi iki kez yapar ve dosyaları iki kez değiştirebilir.
      for (let iter = 0; !xmlYoluKostu && iter < maxToolRounds; iter++) {
        compactIfNeeded(messages, { quiet: true });
        const { reply } = await streamAssistantReply(
          config.providerUrl, config.providerApiKey, config.providerModel,
          messages, toolDefs, { stream: false, quiet: true, exposedTools: exposedTools() },
        );
        if (reply?.content) finalText = reply.content;
        if (!reply?.tool_calls?.length) {
          if (reply?.content) messages.push({ role: 'assistant', content: reply.content });
          unresolved = false;
          break;
        }
        await processToolCalls(reply, config, toolDefs, messages, trackFileChanges, {
          dryRun,
          interactive: false,
          quiet: true,
        });
      }
      // ── TAMAMLANMA KAPISI ────────────────────────────────────────────────
      // Buraya kadar "model araç çağırmayı bıraktı" = "görev bitti" sayılıyordu.
      // Yani model dosyayı değiştirip "yaptım" diyebiliyordu; test, lint ya da
      // build çalıştırmak zorunlu değildi (Codex tur 5, ürün hedefi açısından
      // en kritik eksik).
      //
      // Kapı yalnızca dosya DEĞİŞTİYSE devreye giriyor: salt okuma görevleri
      // bedel ödemez. Başarısız doğrulama modele geri veriliyor ve sınırlı
      // sayıda onarım turu tanınıyor — sınırsız olsa döngü hiç bitmeyebilir.
      if (!unresolved && changedFiles.length > 0) {
        const kapi = require('../utils/tamamlanma-kapisi');
        const kabukCalistir = async (komut) => {
          try {
            const bash = require('../tools/bash');
            const r = await bash.execute({ command: komut, cwd, onayli: true });
            return {
              ok: r && r.success !== false && (r.exitCode == null || r.exitCode === 0),
              cikti: [r && r.stdout, r && r.stderr, r && r.output, r && r.error]
                .filter(Boolean).join('\n'),
            };
          } catch (e) {
            return { ok: false, cikti: e && e.message ? e.message : String(e) };
          }
        };

        const EN_FAZLA_ONARIM = 2;
        for (let onarim = 0; onarim <= EN_FAZLA_ONARIM; onarim++) {
          const karar = await kapi.kanitTopla({
            degisenDosyalar: changedFiles,
            projeIndeksi: projectCtx,
            zatenCalisanlar: modelKomutlari,
            calistir: kabukCalistir,
          });
          if (karar.tamam) {
            process.stderr.write(L(`Doğrulama: ${karar.gerekce}\n`, `Verification: ${karar.gerekce}\n`));
            break;
          }
          // Onarılacak bir çıktı yoksa (ör. doğrulama komutu hiç yok) modele
          // geri verilecek bir şey de yok; durum dürüstçe bildirilip çıkılıyor.
          if (!karar.onarimIcin || onarim === EN_FAZLA_ONARIM) {
            unresolved = true;
            // `gerekce` zaten tam bir cümle; başına bir açıklama daha eklemek
            // aynı şeyi iki kez söylemek oluyordu.
            tamamlanmamaNedeni = karar.gerekce;
            process.stderr.write(L(
              `Doğrulama BAŞARISIZ: ${karar.gerekce}\n`,
              `Verification FAILED: ${karar.gerekce}\n`,
            ));
            break;
          }
          // Onarım turu: hata çıktısı modele veri olarak veriliyor.
          messages.push({
            role: 'user',
            content: `${karar.gerekce}\n\nDoğrulama çıktısı:\n${karar.onarimIcin}\n\n`
              + 'Bu hatayı düzelt. Düzeltemiyorsan neyi düzeltemediğini açıkça söyle.',
          });
          // `modelKomutlari` sıfırlanıyor: önceki turun komutları bu turun
          // kanıtı sayılmamalı — değişiklik onlardan SONRA yapıldı.
          modelKomutlari.length = 0;
          for (let iter = 0; iter < maxToolRounds; iter++) {
            compactIfNeeded(messages, { quiet: true });
            const { reply } = await streamAssistantReply(
              config.providerUrl, config.providerApiKey, config.providerModel,
              messages, toolDefs, { stream: false, quiet: true, exposedTools: exposedTools() },
            );
            if (reply?.content) finalText = reply.content;
            if (!reply?.tool_calls?.length) {
              if (reply?.content) messages.push({ role: 'assistant', content: reply.content });
              break;
            }
            await processToolCalls(reply, config, toolDefs, messages, trackFileChanges, {
              dryRun, interactive: false, quiet: true,
            });
          }
        }
      }

      // ── KALİTE KAPISI + REMEMBER — VARSAYILAN yolda ─────────────────────
      // İkisi de `runAgentic` içine bağlanmıştı ve varsayılan yol onu hiç
      // çağırmıyordu. Sıra önemli: kapı BLOKLADIYSA hafızaya yazılmaz —
      // engellenen işi "böyle yapıldı" diye kaydetmek sonraki oturumu kalıcı
      // olarak yanıltır.
      if (changedFiles.length > 0) {
        let bloklandi = false;
        try {
          if (kaliteKapisi) {
            const rapor = await kaliteKapisi.degerlendir(cwd, changedFiles, await kaliteTabaniSozu);
            if (writeQualityReport(rapor)) {
              bloklandi = true;
              unresolved = true;
              tamamlanmamaNedeni = L(
                'kalite kapısı değişikliği blokladı',
                'the quality gate blocked the change',
              );
              process.stderr.write(L(
                'Kalite kapısı BLOKLADI — değişiklikler gözden geçirilmeli.\n',
                'Quality gate BLOCKED — the changes need review.\n',
              ));
            }
          }
        } catch { /* kapı düşerse görev düşmez, ama rapor da olmaz */ }

        // REMEMBER — yalnızca doğrulanmış VE bloklanmamış iş kaydedilir.
        if (hafiza && !bloklandi && !unresolved) {
          try {
            const karar = `${String(headlessPrompt).replace(/\s+/g, ' ').slice(0, 160)} `
              + `— ${changedFiles.length} dosya değişti ve doğrulandı`;
            await hafiza.hatirlat(karar, 'proje', 'skuld/code');
          } catch { /* yazamazsa görev yine tamamlanmıştır */ }
        }
      }

      process.stdout.write((finalText || L('(yanıt yok)', '(no answer)')) + '\n');
      if (unresolved) {
        process.stderr.write(L(
          `Uyarı: görev tamamlanmış sayılmadı — ${tamamlanmamaNedeni}.\n`,
          `Warning: the task was not counted as finished — ${tamamlanmamaNedeni}.\n`,
        ));
      }
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    } finally {
      if (mcp.servers.length > 0) {
        try { stopMcpServers(); } catch { /* best effort on shutdown */ }
      }
      try { await hafiza?.kapat?.(); } catch { /* best effort */ }
      // Persist here too, so `code -p …` then `code -c` continues the thread.
      persistSession({ quiet: true });
    }
    if (process.exitCode !== 1) process.exitCode = unresolved ? 2 : 0;
    return;
  }

  const farklilastirici = require('../utils/farklilastiricilar');
  const interactiveHafiza = await farklilastirici.hafizaAc({ projeKoku: cwd });
  const interactiveQuality = await farklilastirici.kaliteKapisiAc({ projeKoku: cwd });

  // Input loop
  const slashCommands = [];
  // Visual history must outlive provider-context compaction. The model message
  // list is routinely trimmed/repaired to fit a context window; using it as
  // the screen's scrollback made already-rendered conversation disappear.
  const scrollbackArchive = createScrollbackArchive({
    formatUser: content => `${tui.C.brand('YOU')}  ${content}`,
    formatAssistant: content => `${tui.C.sky('SKULD')}  ${content}`,
    formatTool: (name, status) => {
      const label = status === 'error'
        ? tui.styled(L('başarısız', 'failed'), { color: tui.PALETTE.danger })
        : status === 'pending'
          ? tui.C.muted(L('bekliyor', 'pending'))
          : tui.C.muted(L('çalıştırıldı', 'ran'));
      return `${tui.C.brand('◆')} ${name}  ${label}`;
    },
  });
  const syncScrollbackArchive = () => scrollbackArchive.sync(messages);
  const buildScrollbackTranscript = () => {
    return syncScrollbackArchive();
  };
  // Seed restored sessions before their provider context can be compacted.
  syncScrollbackArchive();
  const inputSession = createCodeInputSession({
    slashCommands,
    screen: codeScreen,
    getScrollback: buildScrollbackTranscript,
    getTranscript: ({ expanded = false, toggleLine } = {}) => {
      let cursor = 0;
      if (Number.isInteger(toggleLine) && toggleLine >= 0) {
        for (const card of toolTranscript) {
          const isExpanded = card.viewerExpanded ?? expanded;
          const lineCount = (isExpanded ? card.expanded : card.compact).split('\n').length;
          if (toggleLine >= cursor && toggleLine < cursor + lineCount) {
            card.viewerExpanded = !isExpanded;
            break;
          }
          cursor += lineCount + 2;
        }
      }
      return toolTranscript
        .map(card => (card.viewerExpanded ?? expanded) ? card.expanded : card.compact)
        .join('\n\n');
    },
  });
  activeCodeInputReader = options => inputSession.read(options);
  const { rl } = inputSession;
  const writePlainPrompt = (prefix = '') => {
    // The spacing belongs to both renderers. Previously boxed mode skipped the
    // prefix together with the plain "You" label, so the next composer border
    // was drawn directly after the final response character.
    if (prefix) process.stdout.write(prefix);
    if (!inputSession.boxed) {
      process.stdout.write(tui.styled("You  ", { color: tui.PALETTE.primary, bold: true }));
    }
  };
  writePlainPrompt("\n  ");

  const SLASH_HELP = [
    ['/help', L('Bu yardım', 'This help')],
    ['/clear', L('Ekranı temizle', 'Clear the screen')],
    ['/fullscreen', L('Tam ekran uygulama görünümü', 'Fullscreen application view')],
    ['/minimal', L('Terminal scrollback görünümü', 'Terminal scrollback view')],
    ['/compact', L('Konuşma bağlamını şimdi sıkıştır', 'Compact the conversation context now')],
    ['/context', L('Bağlam kullanımını göster', 'Show context usage')],
    ['/tools', L('Yüklü araçları listele', 'List loaded tools')],
    ['/system', L('Skuld kurulum ve sistem yollarını göster', 'Show Skuld installation and system paths')],
    ['/model [model|no]', L('Modelleri listele veya aktif modeli değiştir', 'List models or switch the active model')],
    ['/undo [dosya]', L('Son dosya değişikliğini geri al', 'Undo the last file change')],
    ['/retry', L('Son isteği tekrar çalıştır', 'Re-run the last request')],
    ['/run <komut>', L('Komutu çalıştır, çıktısını bağlama ekle', 'Run a command and add its output to context')],
    ['/test', L('Proje testlerini çalıştır', "Run the project's tests")],
    ['/git', L('Git durumu ve son commitler', 'Git status and recent commits')],
    ['/commit', L('Staged değişiklikleri AI mesajıyla commit et', 'Commit staged changes with an AI message')],
    ['/index', L('Projeyi yeniden indeksle', 'Re-index the project')],
    ['/memory', L('Proje hafızasını göster', 'Show project memory')],
    ['/plan on|approve|reject|show', L('Plan modu', 'Plan mode')],
    ['/summary', L('Oturum özeti', 'Session summary')],
    ['/done', L('Özet + kaydet + çıkış', 'Summary + save + exit')],
    ['Ctrl+O', L('Araç ayrıntılarını aç/kapat', 'Toggle detailed tool transcript')],
    ['Esc', L('Süren turu kes', 'Interrupt the running turn')],
    ['Ctrl+C', L('Çıkış', 'Exit')],
  ];
  slashCommands.push(...SLASH_HELP
    .filter(([syntax]) => syntax.startsWith('/'))
    .map(([syntax, description]) => ({
      value: syntax.split(' ')[0],
      description,
      requiresArgument: syntax.includes('<') || syntax.startsWith('/plan '),
    })));

  let lastUserMessage = null;

  const runShell = (command, label) => {
    console.log("\n  " + tui.C.muted(`▶ ${command}`));
    try {
      const output = execSync(command, { cwd, timeout: 120000, stdio: 'pipe' }).toString();
      console.log("  " + tui.C.green(L('✓ Başarılı', '✓ Success')));
      if (output.trim()) console.log(tui.C.muted("  " + output.trim().split('\n').slice(0, 40).join('\n  ')));
      return { ok: true, output };
    } catch (error) {
      const output = (error.stdout?.toString() || '') + (error.stderr?.toString() || error.message || '');
      console.log("  " + tui.C.red(L('✗ Hata', '✗ Failed')));
      console.log(tui.C.muted("  " + output.trim().split('\n').slice(0, 40).join('\n  ')));
      return { ok: false, output };
    } finally {
      if (label) commandsRun++;
    }
  };

  /**
   * Feed a command's result into the transcript so the next turn can act on it
   * without the model having to re-run the command itself.
   */
  const recordShellResult = (command, result) => {
    messages.push({
      role: 'system',
      content: `[\`${command}\` ${result.ok ? 'succeeded' : 'FAILED'}]\n${String(result.output).slice(0, 4000)}`,
    });
    console.log("  " + tui.C.muted(L(
      'Çıktı bağlama eklendi — düzeltmesi için mesaj yazın.',
      'Output added to context — send a message to have it addressed.',
    )));
  };

  /**
   * Handle an input that starts with `/`.
   * Returns 'exit' to leave the session, 'send' to forward `arg` to the model,
   * or true when fully handled here.
   */
  const handleSlash = async (raw) => {
    const [word, ...rest] = raw.slice(1).split(/\s+/);
    const arg = rest.join(' ').trim();
    switch (word.toLowerCase()) {
      case 'help':
        console.log("\n  " + tui.styled(L('Code Agent komutları', 'Code Agent commands'), { color: tui.PALETTE.primary, bold: true }));
        for (const [cmd, desc] of SLASH_HELP) {
          console.log("    " + tui.C.amber(cmd.padEnd(30)) + tui.C.muted(desc));
        }
        return true;
      case 'clear':
        if (codeScreen) codeScreen.clearBody();
        else console.clear();
        return true;
      case 'fullscreen':
        if (!codeScreen?.setMode('fullscreen')) {
          console.log("\n  " + tui.C.yellow(L(
            'Terminal boyutu tam ekran modu için yetersiz.',
            'The terminal is too small for fullscreen mode.',
          )));
        }
        return true;
      case 'minimal':
        codeScreen?.setMode('minimal');
        console.log("\n  " + tui.C.muted(L(
          'Minimal terminal görünümü etkin. /fullscreen ile geri dönebilirsiniz.',
          'Minimal terminal view enabled. Use /fullscreen to return.',
        )));
        return true;
      case 'compact': {
        syncScrollbackArchive();
        const result = compactIfNeeded(messages, { force: true });
        refreshCodeScreenContext();
        if (!result) console.log("\n  " + tui.C.muted(L('Sıkıştırılacak bir şey yok.', 'Nothing to compact.')));
        return true;
      }
      case 'context': {
        const used = tokenBudget.estimateMessageTokens(messages);
        const budget = tokenBudget.load();
        const limit = Math.max(1, (budget.maxContextTokens || 0) - (budget.reservedTokens || 0));
        const pct = Math.min(100, Math.round((used / limit) * 100));
        console.log("\n  " + tui.C.muted(L('Bağlam', 'Context') + `: ~${used} / ${limit} token (${pct}%) · ${messages.length} ${L('mesaj', 'messages')}`));
        console.log("  " + tui.C.muted(L('Otomatik sıkıştırma', 'Auto-compact') + ': ' + (budget.autoCompact ? 'on' : 'off') + ` · preset: ${budget.preset || '—'}`));
        return true;
      }
      case 'tools': {
        const names = toolDefs.map(t => t.name).sort();
        console.log("\n  " + tui.C.muted(`${names.length} ${L('araç', 'tools')}:`));
        console.log("  " + tui.C.text(names.join(', ')));
        return true;
      }
      case 'system': {
        const info = getSkuldPaths();
        console.log("\n  " + tui.styled(L('Skuld sistem yolları', 'Skuld system paths'), { color: tui.PALETTE.primary, bold: true }));
        const installLabel = {
          'development-link': L('geliştirme bağlantısı', 'development link'),
          'global-npm': L('global npm paketi', 'global npm package'),
          'local-package': L('yerel paket', 'local package'),
        }[info.installType] || info.installType;
        const rows = [
          [L('Sistem kökü', 'System root'), info.systemRoot],
          [L('Yapılandırma', 'Config'), info.configPath],
          [L('Loglar', 'Logs'), info.logsDir],
          [L('Kurulum türü', 'Install type'), installLabel],
          [L('Uygulama paketi', 'Installed package'), info.packageInstallRoot],
          [L('Giriş dosyası', 'Entry file'), info.entryPath],
          [L('Araçlar', 'Tools'), info.toolsDir],
          ['Skills', info.skillsDir],
          ...(info.installType === 'development-link'
            ? [[L('Geliştirme kaynağı', 'Development source'), info.packageRoot]]
            : []),
          [L('Aktif proje', 'Current project'), info.currentProject],
        ];
        for (const [label, value] of rows) console.log(`    ${tui.C.muted(label.padEnd(16))} ${tui.C.text(value)}`);
        return true;
      }
      case 'model': {
        let selected;
        if (arg && !/^\d+$/.test(arg)) {
          selected = resolveModelSelection(arg, []);
        } else {
          console.log("\n  " + tui.C.muted(L('Sağlayıcı modelleri taranıyor...', 'Scanning provider models...')));
          const discovery = await discoverProviderModels(config, { timeout: 5000 });
          const available = discovery.models;
          if (!available.length) {
            console.log("  " + tui.C.yellow(L('Bu sağlayıcı için model bulunamadı. `/model <model-id>` kullanabilirsiniz.', 'No models found for this provider. You can use `/model <model-id>`.')));
            return true;
          }
          console.log("\n  " + tui.styled(L('Kullanılabilir modeller', 'Available models'), { color: tui.PALETTE.primary, bold: true }));
          available.forEach((model, index) => {
            const active = model.id === config.providerModel ? tui.C.green(L(' ← aktif', ' ← active')) : '';
            const label = model.label && model.label !== model.id ? tui.C.muted(` — ${model.label}`) : '';
            console.log(`    ${tui.C.amber(String(index + 1).padStart(3) + '.')} ${tui.C.text(model.id)}${label}${active}`);
          });
          if (discovery.warning) {
            console.log("\n  " + tui.C.muted(L('Canlı liste alınamadı; güncel yerleşik katalog gösterildi.', 'Live list unavailable; showing the current built-in catalog.')));
          }
          const promptText = L('Model numarası veya ID (iptal için boş)', 'Model number or ID (blank to cancel)');
          const choice = arg || await inputSession.read({
            placeholder: promptText,
            question: `\n  ${promptText}: `,
            echo: false,
          });
          selected = resolveModelSelection(choice, available);
        }
        if (!selected) return true;
        config.providerModel = selected.id;
        saveConfig(config);
        codeScreen?.update({ model: selected.id });
        messages.push({ role: 'system', content: `[Active model changed to ${selected.id}]` });
        console.log("\n  " + tui.C.green(`✓ ${L('Model değiştirildi', 'Model switched')}: ${selected.id}`));
        return true;
      }
      case 'undo': {
        const target = arg || lastChangedFile;
        if (!target) {
          console.log("\n  " + tui.C.yellow(L('Geri alınacak değişiklik yok.', 'No change to undo.')));
          return true;
        }
        const fh = require('../utils/file-history');
        const history = fh.getHistory(target);
        if (!history.length) {
          console.log("  " + tui.C.yellow(L('Bu dosya için anlık görüntü yok: ', 'No snapshot for this file: ') + target));
          return true;
        }
        const restored = fh.restore(target, history[0].timestamp);
        console.log("  " + (restored.error
          ? tui.C.red(restored.error)
          : tui.C.green(`✓ ${L('geri alındı', 'restored')}: ${target}`)));
        return true;
      }
      case 'retry':
        if (!lastUserMessage) {
          console.log("\n  " + tui.C.yellow(L('Tekrarlanacak istek yok.', 'No request to retry.')));
          return true;
        }
        console.log("\n  " + tui.C.muted(L('Tekrar: ', 'Retrying: ') + lastUserMessage.slice(0, 80)));
        return 'send';
      case 'run': {
        const command = arg || projectCtx.packageJson?.scripts?.start && 'npm start';
        if (!command) {
          console.log("\n  " + tui.C.yellow(L('Kullanım: /run <komut>', 'Usage: /run <command>')));
          return true;
        }
        recordShellResult(command, runShell(command, 'run'));
        return true;
      }
      case 'test': {
        const command = detectTestCommand(projectCtx);
        if (!command) {
          console.log("\n  " + tui.C.yellow(L('Test komutu tespit edilemedi. /run <komut> kullanın.', 'Could not detect a test command. Use /run <command>.')));
          return true;
        }
        recordShellResult(command, runShell(command, 'test'));
        return true;
      }
      case 'git': {
        const status = runShell('git status --short', null);
        runShell('git log --oneline -5', null);
        if (!status.ok) {
          console.log("  " + tui.C.yellow(L('Bu dizin bir git deposu değil.', 'This directory is not a git repository.')));
        }
        return true;
      }
      case 'commit': {
        let diff;
        try {
          diff = execSync('git diff --staged', { cwd, stdio: 'pipe' }).toString();
        } catch {
          console.log("\n  " + tui.C.red(L('Git hatası veya depo değil.', 'Git error, or not a repository.')));
          return true;
        }
        if (!diff.trim()) {
          console.log("\n  " + tui.C.yellow(L('Staged değişiklik yok. Önce: git add .', 'No staged changes. First: git add .')));
          return true;
        }
        const message = await generateCommitMessage(diff.slice(0, 4000), config);
        console.log("\n  " + tui.C.muted(L('Önerilen: ', 'Suggested: ')) + tui.C.text(message));
        const ok = await confirm(L('Commit edilsin mi?', 'Commit?') + ' (y/N) ');
        if (!ok) {
          console.log("  " + tui.C.muted(L('İptal edildi.', 'Cancelled.')));
          return true;
        }
        try {
          execFileSync('git', ['commit', '-m', message], { cwd, stdio: 'pipe' });
          console.log("  " + tui.C.green(L('✓ Commit yapıldı.', '✓ Committed.')));
        } catch (error) {
          console.log("  " + tui.C.red(`${L('Commit başarısız', 'Commit failed')}: ${error.message}`));
        }
        return true;
      }
      case 'index': {
        projectCtx = indexProject(cwd);
        codeScreen?.update({
          branch: projectCtx?.gitBranch,
          changes: projectCtx?.gitStatus?.length,
        });
        messages[0] = { role: 'system', content: messages[0].content.replace(/Project information:[\s\S]*?(?=\n\n|$)/, buildIndexPrompt(projectCtx)) };
        console.log("\n  " + tui.C.green(`✓ ${projectCtx.files.length} ${L('dosya indekslendi', 'files indexed')} (${projectCtx.type})`));
        return true;
      }
      case 'memory': {
        const memory = loadProjectMemory(cwd);
        if (!memory) {
          console.log("\n  " + tui.C.muted(L('Henüz proje hafızası yok. /done ile kaydedilir.', 'No project memory yet. It is saved on /done.')));
          return true;
        }
        console.log("\n  " + tui.styled(L('Proje hafızası', 'Project memory'), { color: tui.PALETTE.primary, bold: true }));
        console.log(tui.C.muted("  " + memory.slice(-2000).split('\n').join('\n  ')));
        return true;
      }
      case 'summary':
        printSummary(filesChanged, commandsRun, messages.length - 1, startTime);
        return true;
      case 'done':
        printSummary(filesChanged, commandsRun, messages.length - 1, startTime);
        return 'exit';
      case 'plan': {
        const pm = getPlanMode();
        if (arg === "on" || arg === "enter") {
          if (pm.enter()) console.log(tui.C.cyan(L('\n  📋 Plan modu aktif.\n', '\n  📋 Plan mode active.\n')));
          else console.log(tui.C.yellow(L('  Zaten plan modunda.', '  Already in plan mode.')));
        } else if (arg === "approve") {
          if (pm.inReview()) { pm.approve(); console.log(tui.C.green(L('  ✓ Plan onaylandı.\n', '  ✓ Plan approved.\n'))); }
          else console.log(tui.C.yellow(L('  Onay bekleyen plan yok.', '  No plan awaiting approval.')));
        } else if (arg === "reject") {
          if (pm.inReview()) { pm.reject(); console.log(tui.C.amber(L('  ⨯ Plan reddedildi.\n', '  ⨯ Plan rejected.\n'))); }
          else console.log(tui.C.yellow(L('  Onay bekleyen plan yok.', '  No plan awaiting approval.')));
        } else if (arg === "show") {
          if (pm.planHistory.length > 0) console.log(tui.C.cyan(L('\n  📋 Son Plan:\n  ', '\n  📋 Last Plan:\n  ') + pm.planHistory[pm.planHistory.length - 1].plan.replace(/\n/g, '\n  ') + '\n'));
          else console.log(tui.C.yellow(L('  Henüz plan yok.', '  No plan yet.')));
        } else {
          console.log(tui.C.yellow(L('  Kullanım: /plan on|approve|reject|show', '  Usage: /plan on|approve|reject|show')));
        }
        return true;
      }
      default:
        console.log("\n  " + tui.C.red(L('Bilinmeyen komut: ', 'Unknown command: ') + '/' + word) +
          tui.C.muted(L('  (/help ile liste)', '  (/help for the list)')));
        return true;
    }
  };

  const ask = async () => {
    for (;;) {
      let input;
      try {
        input = await inputSession.read();
      } catch (error) {
        if (error?.code === 'SIGINT') return;
        throw error;
      }
      input = input.trim();
      if (!input) { writePlainPrompt("  "); continue; }
      if (input === "exit" || input === "quit") {
        printSummary(filesChanged, commandsRun, messages.length - 1, startTime);
        return;
      }
      if (input.startsWith("/")) {
        let outcome;
        try {
          outcome = await handleSlash(input);
        } catch (error) {
          // A local slash command is a convenience surface, not a reason to
          // tear down the PTY. Provider discovery, git, tests and plugins can
          // all fail independently; report the failure and keep the session.
          console.log("\n  " + tui.C.red(L('Komut başarısız: ', 'Command failed: ') + error.message));
          writePlainPrompt("\n  ");
          continue;
        }
        if (outcome === 'exit') return;
        if (outcome === 'send' && lastUserMessage) {
          input = lastUserMessage;
        } else {
          writePlainPrompt("\n  ");
          continue;
        }
      }
      lastUserMessage = input;
      const turnChangedStart = changedFiles.length;
      const turnCommandStart = modelKomutlari.length;
      const qualityBaseline = interactiveQuality
        ? interactiveQuality.tara(cwd).catch(() => null)
        : Promise.resolve(null);
      const recalledNote = await farklilastirici.hatirlatmaMetni(interactiveHafiza, input);

      refreshCodeScreenContext(L('ÇALIŞIYOR', 'WORKING'));
      const turnState = await runInterruptibleTurn({
        rl,
        presentationOptions: {
          model: config.providerModel,
          inputTokens: totalIn + Math.ceil(input.length / 4),
          outputTokens: totalOut,
        },
        body: async (turnSignal, activeTools, presentation) => {
      // Loop-detection counters are per user turn, matching the chat/repl path.
      // Without this the singleton kept counting across the whole session.
      agentCore.startRequest();
      syncScrollbackArchive();
      compactIfNeeded(messages, { presentation });
      if (recalledNote) messages.push({ role: 'user', content: recalledNote });

      // The workflow pre-step used to run before EVERY message: one model call
      // to classify the request as simple/complex, then either a second chat
      // call or an up-front JSON plan whose steps execute without the model in
      // the loop. Measured on a plain greeting that is 8.1s versus 2.5s for the
      // agent loop alone — and a pre-baked plan cannot adapt to what a tool
      // actually returns. The agent loop now drives by default; the pre-step
      // stays available for weaker models via `--workflow` or
      // `nskuld config set codeWorkflow true`.
      let wf = {};
      if (useWorkflow) {
        activeTools.add('workflow');
        const workflowSpinner = presentation.startSpinner(L('İş akışı çalışıyor', 'Running workflow'));
        let wfResult;
        try {
          wfResult = await executeTool('workflow', {
            action: 'run',
            task: input,
            conversationHistory: prepareConversationHistory(messages, {
              maxMessages: tokenBudget.load().conversationInContext,
              maxTokens: tokenBudget.load().workflowHistoryMaxTokens,
            }),
          }, toolDefs, { signal: turnSignal });
          turnSignal.throwIfAborted();
        } finally {
          workflowSpinner.stop();
          activeTools.delete('workflow');
        }
        wf = wfResult?.result || {};
        if (wf.success !== false) {
          const loaded = wf.skillsLoaded && wf.skillsLoaded.length > 0 ? ` [skill: ${wf.skillsLoaded.join(', ')}]` : '';
          presentation.writeCommitted(tui.styled(`  ✓ workflow${loaded}\n`, { color: tui.PALETTE.success }));
        } else {
          presentation.writeCommitted(tui.styled('  ✗ workflow\n', { color: tui.PALETTE.danger }));
        }
      }

      messages.push({ role: "user", content: input });

      if (wf.passthrough && wf.reply !== undefined && wf.reply !== null) {
        // Simple chat — workflow handled it directly
        const fullReply = String(wf.reply);
        presentation.writeCommitted('\n');
        presentation.clearTransient();
        writeFinishedReply(fullReply);
        presentation.writeCommitted('\n');
        messages.push({ role: 'assistant', content: fullReply });
        totalIn += Math.ceil(input.length / 4);
        totalOut += Math.ceil(fullReply.length / 4);
      } else if (wf.status === 'completed' || (wf.results && wf.results.length > 0)) {
        // Complex task — inject workflow report as context, then LLM crafts final reply
        const workflowSteps = wf.results || [];
        const report = workflowSteps.map(r => {
          const t = r.tool || r.name || '?';
          const s = r.status === 'done' ? '✓' : '✗';
          let summary = '';
          if (r.result) {
            try { summary = typeof r.result === 'string' ? r.result.slice(0, 400) : JSON.stringify(r.result).slice(0, 400); } catch {}
          }
          return `  ${s} ${t}: ${summary}`;
        }).join('\n');
        const skillInfo = wf.skillsLoaded && wf.skillsLoaded.length > 0
          ? `\n\n${L("Kullanilan skill'ler", 'Skills used')}: ${wf.skillsLoaded.join(', ')}`
          : '';
        const preWfLen = messages.length;
        messages.push({
          role: 'system',
          content: `=== ${L('WORKFLOW SONUÇLARI', 'WORKFLOW RESULTS')} ===\n${L('Şu araçlar çalıştı', 'These tools ran')}:\n${report}${skillInfo}\n\n${L('Kullanıcıya bu sonuçları anlamlı bir şekilde özetle.', 'Summarize these results for the user in a meaningful way.')}\n=== ${L('SONUÇ BİTTİ', 'END RESULT')} ===`,
        });

        presentation.writeCommitted("\n  " + tui.styled("AI   ", { color: tui.PALETTE.secondary, bold: true }));

        // Single LLM call to summarize workflow results
        let wfReply = null;
        try {
          wfReply = await runTransactionalRound(messages, async signal => {
            const streamed = await streamAssistantReply(
              config.providerUrl, config.providerApiKey, config.providerModel,
              messages, toolDefs, { signal, presentation, estimatedOutputTokens: totalOut, stream: streaming, exposedTools: exposedTools() }
            );
            const roundReply = streamed.reply;
            if (roundReply.content && !(roundReply.tool_calls && roundReply.tool_calls.length > 0)) {
              messages.push({ role: "assistant", content: roundReply.content });
            }
            if (roundReply.content) totalOut += Math.ceil(roundReply.content.length / 4);
            if (roundReply.tool_calls && roundReply.tool_calls.length > 0) {
              await processToolCallsWithTracking(roundReply, config, toolDefs, messages, {
                signal,
                activeTools,
                presentation,
              });
            }
            return roundReply;
          }, { signal: turnSignal });
          messages.splice(preWfLen, 1);
        } catch (e) {
          if (isAbortError(e, turnSignal)) {
            messages.splice(preWfLen);
            throw e;
          }
          presentation.writeCommitted("\n  " + tui.C.red("❌ " + e.message) + "\n");
        }

        totalIn += Math.ceil(((wfReply?.content || '') + report + skillInfo).length / 4) + Math.ceil(input.length / 4);
      } else {
        // Workflow failed or returned unexpected format — fallback to multi-turn LLM
        presentation.writeCommitted("\n  " + tui.styled("AI   ", { color: tui.PALETTE.secondary, bold: true }));
        let iter = 0;
        let hitIterationCap = false;
        let consecutiveEmptyReplies = 0;
        while (iter < maxToolRounds) {
          iter++;
          syncScrollbackArchive();
          compactIfNeeded(messages, { presentation });
          try {
            const reply = await runTransactionalRound(messages, async signal => {
              const streamed = await streamAssistantReply(
                config.providerUrl, config.providerApiKey, config.providerModel,
                messages, toolDefs, { signal, presentation, estimatedOutputTokens: totalOut, stream: streaming, exposedTools: exposedTools() }
              );
              const roundReply = streamed.reply;
              if (roundReply.content && !(roundReply.tool_calls && roundReply.tool_calls.length > 0)) {
                messages.push({ role: "assistant", content: roundReply.content });
              }
              if (roundReply.content) totalOut += Math.ceil(roundReply.content.length / 4);
              if (roundReply.tool_calls && roundReply.tool_calls.length > 0) {
                await processToolCallsWithTracking(roundReply, config, toolDefs, messages, {
                  signal,
                  activeTools,
                  presentation,
                });
              }
              return roundReply;
            }, { signal: turnSignal });

            if (reply.tool_calls && reply.tool_calls.length > 0) {
              consecutiveEmptyReplies = 0;
              if (iter >= maxToolRounds) { hitIterationCap = true; break; }
              presentation.writeCommitted("\n  " + tui.styled("AI   ", { color: tui.PALETTE.secondary, bold: true }));
              continue;
            }
            if (isEmptyAssistantReply(reply)) {
              consecutiveEmptyReplies++;
              if (consecutiveEmptyReplies <= EMPTY_REPLY_RETRY_LIMIT) {
                // Aynı geçmişi ikinci kez göndermek aynı boşluğu üretir.
                // Modelin çıktı sınırında tükendiği durumda (`finish_reason:
                // "length"`, düşünme adımı bütçeyi bitirmişse içerik hiç
                // gelmez) tek işe yarayan şey ondan daha küçük bir adım
                // istemektir — yeniden denemeye bunu ekliyoruz.
                if (reply?.finish_reason === 'length') {
                  messages.push({
                    role: 'system',
                    content: `[${L(
                      'Önceki yanıtın çıktı sınırında tükendi ve hiçbir şey üretemedi. Daha kısa bir adım at: tek bir küçük araç çağrısı yap.',
                      'Your previous response ran out of output budget and produced nothing. Take a shorter step: make a single small tool call.',
                    )}]`,
                  });
                }
                presentation.writeCommitted("\n  " + tui.C.yellow(L(
                  'Model boş yanıt verdi; görev otomatik sürdürülüyor…',
                  'The model returned an empty reply; continuing automatically…',
                )) + "\n  " + tui.styled("AI   ", { color: tui.PALETTE.secondary, bold: true }));
                continue;
              }
              const warning = L(
                'Model araç sonucundan sonra yanıt üretmedi. Görev tamamlanmadı; /retry ile yeniden deneyin.',
                'The model produced no reply after the tool result. The task is incomplete; use /retry to try again.',
              );
              presentation.writeCommitted("\n  " + tui.C.red(`✗ ${warning}`) + "\n");
              messages.push({ role: 'system', content: `[Previous turn incomplete: ${warning}]` });
            }
            break;
          } catch (e) {
            if (isAbortError(e, turnSignal)) throw e;
            presentation.writeCommitted("\n  " + tui.C.red("❌ " + e.message) + "\n");
            break;
          }
        }
        // Reaching the cap used to end the turn silently: the last thing on
        // screen was a tool card and the user had no way to tell the agent had
        // stopped mid-task rather than finished. Say so, and tell the model too
        // so a follow-up message resumes with that context.
        if (hitIterationCap) {
          presentation.writeCommitted(
            "\n  " + tui.C.yellow(L(
              `⚠ ${maxToolRounds} araç turu sınırına ulaşıldı, görev yarım kalmış olabilir. Devam etmek için tekrar yazın.`,
              `⚠ Reached the ${maxToolRounds}-tool-round limit; the task may be unfinished. Send another message to continue.`,
            )) + "\n",
          );
          messages.push({
            role: 'system',
            content: `[The agent loop stopped after ${maxToolRounds} tool rounds without a final answer. Summarize progress so far and what remains before continuing.]`,
          });
        }
        totalIn += Math.ceil(input.length / 4);
      }

      const turnFiles = [...new Set(changedFiles.slice(turnChangedStart))];
      if (turnFiles.length > 0 && interactiveQuality) {
        try {
          const report = await interactiveQuality.degerlendir(cwd, turnFiles, await qualityBaseline);
          const blocked = writeQualityReport(report, value => presentation.writeCommitted(`  ${value}`));
          if (blocked) {
            messages.push({
              role: 'system',
              content: '[Quality gate blocked the latest changes. Do not claim completion until the protected-module finding is resolved or explicitly approved.]',
            });
          } else {
            const verificationRan = modelKomutlari.slice(turnCommandStart)
              .some(command => /(?:^|\s)(?:test|lint|typecheck|check|build|pytest|vitest|jest|cargo\s+test)(?:\s|$)/i.test(command));
            if (verificationRan && interactiveHafiza) {
              const decision = `${input.replace(/\s+/g, ' ').slice(0, 160)} — ${turnFiles.length} dosya değişti ve doğrulandı`;
              await interactiveHafiza.hatirlat(decision, 'proje', 'skuld/code');
            }
          }
        } catch (error) {
          presentation.writeCommitted(`  ${tui.C.yellow(L('Kalite kapısı çalıştırılamadı', 'Quality gate could not run'))}: ${error.message}\n`);
        }
      }

        },
      });
      refreshCodeScreenContext(L('HAZIR', 'READY'));
      if (turnState.exited) return;

      // Her tamamlanan/kesilen turu hemen kaydet; uzun oturumda terminal veya
      // sağlayıcı koparsa önceki başarılı turlar `code -c` ile geri alınabilsin.
      persistSession({ quiet: true });

      writePlainPrompt("\n\n  ");
    }
  };
  try {
    await ask();
  } finally {
    activeCodeInputReader = null;
    inputSession.close();
    codeScreen?.dispose();
    // MCP servers are child processes; leaving them running would outlive the
    // session and hold the terminal open.
    if (mcp.servers.length > 0) {
      try { stopMcpServers(); } catch { /* best effort on shutdown */ }
    }
    try { await interactiveHafiza?.kapat?.(); } catch { /* best effort */ }
    persistSession();
  }

  /**
   * Persist the transcript so `--continue` / `--resume <id>` can pick it up,
   * and append a one-line note to project memory when work actually happened.
   */
  function persistSession({ quiet = false } = {}) {
    const hasWork = messages.some(m => m.role === 'user');
    if (!hasWork) return;
    try {
      saveSession('code', messages, {
        cwd,
        projectType: projectCtx?.type,
        filesChanged,
        commandsRun,
        changedFiles,
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      const warning = `  ${L('Oturum kaydedilemedi', 'Could not save session')}: ${error.message}\n`;
      if (quiet) process.stderr.write(warning);
      else console.log(tui.C.yellow(warning));
      return;
    }
    if (filesChanged === 0 && commandsRun === 0) return;
    try {
      const lines = [
        `- ${filesChanged} ${L('dosya değişti', 'files changed')}, ${commandsRun} ${L('komut çalıştı', 'commands run')}`,
        changedFiles.length ? `- ${changedFiles.slice(0, 10).join(', ')}` : '',
      ].filter(Boolean).join('\n');
      appendProjectMemory(cwd, lines);
    } catch { /* project memory is a convenience, never fail the exit on it */ }
  }
}

const PARALLEL_SAFE_TOOLS = new Set(['read_file', 'file_search', 'grep_search', 'web_search', 'web_readability', 'duckduckgo_search', 'exa_search', 'searxng_search', 'firecrawl', 'memory_search', 'memory']);

/**
 * Tools whose effects are real writes. `--dry-run` refuses these instead of
 * letting them through: the flag used to be accepted and then ignored, so a
 * "preview" run happily rewrote the working tree.
 */

async function processToolCalls(reply, config, toolDefs, messages, onToolResult, options = {}) {
  agentCore.startIteration();

  // Same policy everywhere. Interactively a human can be asked; with `-p`
  // there is nobody at the terminal, so the gate refuses instead of hanging on
  // a prompt that would never be answered.
  const interactive = options.interactive !== false;
  const screenToolCall = createToolGate({
    agentCore,
    dryRun: options.dryRun,
    ...(interactive ? { confirm, askPermission } : {}),
    log: message => {
      const line = "\n  " + (String(message).startsWith('⛔') ? tui.C.red(message) : tui.C.yellow(message)) + "\n";
      if (options.quiet) process.stderr.write(line);
      else process.stdout.write(line);
    },
  });

  const refusals = new Map();
  const runnable = [];
  // Çıktı sınırında kesilmiş çağrılar. Bunlar REDDEDİLMİŞ çağrı değil —
  // model onları tamamlayamadı — ve reddedilmiş çağrılardan farklı olarak
  // transkripte hiç girmemeleri gerekir (aşağıdaki nedene bakın).
  const kesikCagrilar = [];
  const duyurulanCagrilar = [];
  for (const tc of reply.tool_calls) {
    let args;
    try {
      args = JSON.parse(tc.function.arguments || "{}");
    } catch (error) {
      kesikCagrilar.push({ name: tc.function?.name || '?', reason: error.message });
      continue;
    }
    duyurulanCagrilar.push(tc);
    const refusal = await screenToolCall(tc.function.name, args);
    if (refusal) refusals.set(tc.id, refusal);
    else runnable.push({ name: tc.function.name, args, id: tc.id });
  }

  // Yarım JSON içeren bir araç çağrısı transkripte ASLA yazılmaz.
  //
  // Kesilen çağrıyı "argümanlar geçerli JSON değil" hatasıyla kaydetmek makul
  // görünüyor — model hatayı görür, düzeltir. Sağlayıcı tarafında öyle
  // olmuyor: bozuk `tool_calls` bir kez geçmişe girdiğinde MiniMax sonraki
  // HER isteğe HTTP 200 + tamamen boş gövde dönüyor (canlı ölçüldü). Ekranda
  // "Model boş yanıt verdi" çıkıyor, `/retry` de aynı geçmişi gönderdiği için
  // hiçbir zaman düzelmiyor: oturum kalıcı olarak ölüyor.
  //
  // Bu yüzden kesik çağrı geçmişe hiç girmez; modele bunun yerine aşağıda
  // (araç sonuçlarından SONRA, sıra bozulmasın diye) düz metin bir not
  // gönderilir. Sağlam çağrılar normal yolundan işlenmeye devam eder.
  //
  // Sağlam olan her çağrı, reddedilenler dahil, aşağıda tam olarak bir yanıt
  // alır. Reddedilen çağrıyı düşürmek transkripti onu üreten haliyle aynı
  // bırakıyor, model aynı çağrıyı yeniden veriyor ve kullanıcı tur sınırına
  // kadar tekrar tekrar onay sorusuyla karşılaşıyordu.
  if (duyurulanCagrilar.length > 0) {
    messages.push({ role: "assistant", content: reply.content || null, tool_calls: duyurulanCagrilar });
  } else {
    messages.push({
      role: "assistant",
      content: reply.content || L('(araç çağrısı çıktı sınırında kesildi)', '(tool call was cut off at the output limit)'),
    });
  }

  if (kesikCagrilar.length > 0) {
    const isimler = kesikCagrilar.map(item => item.name).join(', ');
    const line = "\n  " + tui.C.yellow(L(
      `⚠ Araç çağrısı çıktı sınırında kesildi (${isimler}) — çalıştırılmadı, modelden daha küçük bir adım isteniyor.`,
      `⚠ A tool call was cut off at the output limit (${isimler}) — it did not run; the model is being asked for a smaller step.`,
    )) + "\n";
    if (options.presentation) options.presentation.writeCommitted(line);
    else if (options.quiet) process.stderr.write(line);
    else process.stdout.write(line);
  }

  const answers = new Map();
  for (const [id, reason] of refusals) answers.set(id, "ERROR: " + reason);

  const recordOutcome = (p, result, snapshots) => {
    agentCore.record({ name: p.name, input: p.args }, result);
    if (onToolResult) onToolResult(p.name, p.args, result, snapshots);
    const out = result.error
      ? "ERROR: " + result.error
      : (typeof result.result === "string" ? result.result : JSON.stringify(result.result));
    answers.set(p.id, (out || "(empty)").slice(0, 8000));
  };

  const parallelSafe = runnable.filter(p => PARALLEL_SAFE_TOOLS.has(p.name));
  const sequential = runnable.filter(p => !PARALLEL_SAFE_TOOLS.has(p.name));

  try {
    // Run parallel-safe tools concurrently
    if (parallelSafe.length > 0) {
      const settled = await Promise.allSettled(parallelSafe.map(async (p) => {
        options.activeTools?.add(p.name);
        const spinner = options.presentation?.startSpinner(
          `${L('Çalışıyor', 'Running')} ${p.name}`
        );
        try {
          const executed = await executeTool(p.name, p.args, toolDefs, { signal: options.signal });
          options.signal?.throwIfAborted();
          const result = runPostHooks(p.name, p.args, executed);
          spinner?.stop();
          writeToolCard(p.name, p.args, result, {}, options.presentation, {
            quiet: options.quiet,
            transcript: options.transcript,
          });
          recordOutcome(p, result);
        } finally {
          spinner?.stop();
          options.activeTools?.delete(p.name);
        }
      }));
      const rejected = settled.find(item => item.status === 'rejected');
      if (rejected) throw rejected.reason;
    }

    // Run sequential tools one at a time
    for (const p of sequential) {
      const tracksFile = p.name === 'write_file' || p.name === 'edit_file';
      const before = tracksFile ? captureFileSnapshot(p.args, { allowMissing: true }) : undefined;
      options.activeTools?.add(p.name);
      const spinner = options.presentation?.startSpinner(
        `${L('Çalışıyor', 'Running')} ${p.name}`
      );
      try {
        const executed = await executeTool(p.name, p.args, toolDefs, { signal: options.signal });
        options.signal?.throwIfAborted();
        const result = runPostHooks(p.name, p.args, executed);
        const after = tracksFile ? captureFileSnapshot(p.args) : undefined;
        spinner?.stop();
        writeToolCard(p.name, p.args, result, { before, after }, options.presentation, {
          quiet: options.quiet,
          transcript: options.transcript,
        });
        recordOutcome(p, result, { before, after });
      } finally {
        spinner?.stop();
        options.activeTools?.delete(p.name);
      }
    }
  } finally {
    // Answer in the order the model announced the calls. Providers reject a
    // transcript where a tool_call has no matching result, so anything that
    // never ran (interrupt, crash) is still answered before we unwind.
    for (const tc of duyurulanCagrilar) {
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: answers.has(tc.id)
          ? answers.get(tc.id)
          : "ERROR: " + L('Araç çalıştırılmadı (tur kesildi).', 'Tool did not run (turn was interrupted).'),
      });
    }
    // Not, araç sonuçlarından SONRA gelir: `assistant(tool_calls)` ile
    // `tool` mesajları arasına bir şey girerse sağlayıcılar transkripti
    // reddediyor.
    if (kesikCagrilar.length > 0) {
      const isimler = kesikCagrilar.map(item => item.name).join(', ');
      messages.push({
        role: "system",
        content: `[${L(
          `Önceki ${isimler} çağrın çıktı sınırında kesildi ve ÇALIŞTIRILMADI. Aynı çağrıyı aynı boyutta tekrarlama. Bir dosyanın tamamını tek seferde yazmak yerine edit_file ile küçük, hedefli değişiklikler yap ya da işi birkaç çağrıya böl.`,
          `Your previous ${isimler} call was cut off at the output limit and DID NOT RUN. Do not repeat the same call at the same size. Instead of writing a whole file in one go, make small targeted changes with edit_file, or split the work across several calls.`,
        )}]`,
      });
    }
  }
}

function printSummary(files, cmds, msgs, startTime) {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const min = Math.floor(elapsed / 60);
  const sec = elapsed % 60;
  console.log("\n  " + tui.styled(L("─── Session Özeti ───", "─── Session Summary ───"), { color: tui.PALETTE.primary, bold: true }));
  console.log("  " + tui.C.green("  ✓ " + files + L(" dosya değiştirildi", " files changed")));
  console.log("  " + tui.C.green("  ✓ " + cmds + L(" komut çalıştırıldı", " commands run")));
  console.log("  " + tui.C.amber("  ✓ " + msgs + L(" mesaj değişimi", " message exchanges")));
  console.log("  " + tui.C.muted("  ⏱  " + min + L("dk ", "min ") + sec + L("sn", "s")));
  console.log("");
}

module.exports = codeV5;
module.exports._presentation = {
  captureFileSnapshot,
  displayAssistantReply,
  writeFinishedReply,
  streamAssistantReply,
  processToolCalls,
  runTransactionalRound,
  runInterruptibleTurn,
  isAbortError,
  createCodeInputSession,
  assessRisk,
  compactIfNeeded,
  resolveMaxToolRounds,
  resolveMaxOutputTokens,
  isMaxTokensRejection,
  createScrollbackArchive,
  isEmptyAssistantReply,
};
