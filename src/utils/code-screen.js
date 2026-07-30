'use strict';

const path = require('path');
const tui = require('./tui');
const tema = require('./skuld-theme');

const ESC = '\x1b';
const CSI = `${ESC}[`;
const ALT_ENTER = `${CSI}?1049h`;
const ALT_EXIT = `${CSI}?1049l`;
const SAVE_CURSOR = `${CSI}s`;
const RESTORE_CURSOR = `${CSI}u`;
const RESET_SCROLL_REGION = `${CSI}r`;

function requestedMode(options = {}) {
  if (options.mode === 'minimal' || options.mode === 'fullscreen') return options.mode;
  const envMode = String(options.env?.SKULD_CODE_SCREEN_MODE || '').toLowerCase();
  return envMode === 'minimal' ? 'minimal' : 'fullscreen';
}

function supportsFullscreen({ input, output, env = process.env } = {}) {
  if (!input?.isTTY || !output?.isTTY) return false;
  if (env.CI || String(env.TERM || '').toLowerCase() === 'dumb') return false;
  return (Number(output.columns) || 80) >= 50 && (Number(output.rows) || 24) >= 18;
}

function plainFit(value, width) {
  const target = Math.max(0, width);
  return tui.padTo(tui.truncateAnsi(String(value ?? ''), target), target);
}

function createCodeScreen(options = {}) {
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  const env = options.env || process.env;
  const english = options.lang === 'en';
  const state = {
    project: options.project || process.cwd(),
    branch: options.branch || '—',
    changes: Number(options.changes) || 0,
    model: options.model || '—',
    tools: options.tools || '—',
    context: options.context || '0%',
    activity: options.activity || 'READY',
    version: options.version || '',
  };
  // Tam ekranda fare bildirimi açıkken tekerlek kaydırır ama terminalin
  // sürükleyerek seçme davranışı uygulamaya geçer; seçim için Shift gerekir
  // (xterm'den beri standart olan kaçış yolu). Bunu istemeyen kullanıcı
  // `codeMouseScroll: false` ile bildirimi tamamen kapatıp doğal seçime
  // dönebilir; kaydırma o zaman PgUp/PgDn ile yapılır.
  const mouseCapture = options.mouseCapture !== false;
  let mode = requestedMode({ mode: options.mode, env });
  let active = false;
  let resizeAttached = false;
  let scrollOffset = 0;
  let browsing = false;
  let composerRows = 3;
  const headerRows = 6;
  const footerRows = 3;

  function dimensions() {
    return {
      width: Math.max(50, Number(output.columns) || 80),
      height: Math.max(18, Number(output.rows) || 24),
    };
  }

  function position(row, column = 1) {
    return `${CSI}${row};${column}H`;
  }

  function lineAt(row, content, width, style = {}) {
    const fitted = plainFit(content, width);
    return position(row) + `${CSI}2K` + tui.styled(fitted, style);
  }

  function headerLines(width) {
    const inner = width - 2;
    const projectName = path.basename(state.project) || state.project;
    const titleLeft = ` SKULD // CODE `;
    const titleRight = state.version ? ` v${state.version} ` : ' FULLSCREEN ';
    const fill = Math.max(1, inner - tui.stringWidth(titleLeft) - tui.stringWidth(titleRight));
    const top = `╭${tui.C.brand(titleLeft)}${tui.styled('━'.repeat(fill), { color: '#38bdf8' })}${tui.C.muted(titleRight)}╮`;
    const frame = content => `│${plainFit(` ${content}`, inner)}│`;
    const logo = tema.KELIME_ISARETI.map((line, index) => tema.gradyan(line, 100 + index * 120, 430 + index * 120));
    let middle;
    if (width >= 88) {
      middle = [
        frame(`${logo[0]}    ${tui.C.brand('◇')} ${tui.C.text(projectName)}  ${tui.C.muted(state.project)}`),
        frame(`${logo[1]}    ${tui.C.brand('⚡')} ${tui.C.text(state.model)}  ${tui.C.muted(english ? 'tools' : 'araç')} ${tui.C.brand(state.tools)}`),
        frame(`${logo[2]}    ${tui.C.brand('git')} ${tui.C.text(state.branch)} ${tui.C.muted(`(${state.changes})`)}  `
          + `${tui.C.muted(english ? 'context' : 'bağlam')} ${tui.C.text(state.context)}`),
      ];
    } else {
      middle = [
        frame(logo[0]),
        frame(logo[1]),
        frame(`${logo[2]}  ${tui.C.muted('·')}  ${tui.C.text(projectName)}  ${tui.C.muted('·')}  ${tui.C.text(state.model)}`),
      ];
    }
    const tagline = frame(tui.C.muted(english
      ? 'what will be, verified  ·  agentic coding workspace'
      : 'ne olacaksa, doğrulanmış olarak  ·  ajan tabanlı kodlama alanı'));
    const bottom = `╰${tui.styled('━'.repeat(inner), { color: '#0ea5e9' })}╯`;
    return [top, ...middle, tagline, bottom].map(line => plainFit(line, width));
  }

  function footerLines(width) {
    const toolLabel = tui.styled(english ? ' TOOLS ' : ' ARAÇLAR ', {
      color: '#020617',
      bg: '#38bdf8',
      bold: true,
    });
    const activity = tui.styled(` ${state.activity} `, {
      color: '#020617',
      bg: '#7dd3fc',
      bold: true,
    });
    const tools = english
      ? 'read · search · edit · terminal · git · web · memory · agents'
      : 'oku · ara · düzenle · terminal · git · web · hafıza · ajanlar';
    const first = `${toolLabel}  ${tui.C.text(tools)}  ${tui.C.muted(`· ${state.tools}`)}`;
    const second = `${activity}  ${tui.C.muted(english ? 'Skuld is watching the thread' : 'Skuld oturumu izliyor')}  `
      + `${tui.C.brand('●')} ${tui.C.text(english ? 'fullscreen' : 'tam ekran')}`;
    // İpucu ne olduğunu değil, o an ne çalıştığını söylemeli. Fare
    // yakalanıyorken "fareyle seçip kopyala" yazmak düpedüz yanlış bilgi:
    // sürükleme uygulamaya gidiyor, seçim Shift ile yapılıyor. Ayrıca
    // PgUp/PgDn geçmişte değil, görünümde geziniyor.
    const secondText = english
      ? (mouseCapture
        ? '/help commands  ·  wheel scrolls  ·  Shift+drag selects  ·  Ctrl+O tools'
        : '/help commands  ·  PgUp/PgDn scrolls  ·  mouse-select to copy  ·  Ctrl+O tools')
      : (mouseCapture
        ? '/help komutlar  ·  tekerlek kaydırır  ·  Shift+sürükle seçer  ·  Ctrl+O araçlar'
        : '/help komutlar  ·  PgUp/PgDn kaydırır  ·  fareyle seçip kopyala  ·  Ctrl+O araçlar');
    const third = `${tui.C.brand('›')} ${tui.C.muted(secondText)}`;
    return [plainFit(first, width), plainFit(second, width), plainFit(third, width)];
  }

  function redrawChrome({ preserveCursor = true } = {}) {
    if (!active) return;
    const { width, height } = dimensions();
    const bodyTop = headerRows + 1;
    const bodyBottom = height - footerRows;
    let sequence = preserveCursor ? SAVE_CURSOR : '';
    sequence += RESET_SCROLL_REGION;
    headerLines(width).forEach((line, index) => {
      sequence += lineAt(index + 1, line, width, { bg: '#020617' });
    });
    footerLines(width).forEach((line, index) => {
      sequence += lineAt(bodyBottom + 1 + index, line, width, { bg: '#020617' });
    });
    sequence += `${CSI}${bodyTop};${bodyBottom}r`;
    if (preserveCursor) sequence += RESTORE_CURSOR;
    output.write(sequence);
  }

  function onResize() {
    redrawChrome({ preserveCursor: true });
  }

  function enter() {
    if (active || mode !== 'fullscreen' || !supportsFullscreen({ input, output, env })) return false;
    active = true;
    const { height } = dimensions();
    const bodyTop = headerRows + 1;
    const bodyBottom = height - footerRows;
    output.write(`${ALT_ENTER}${CSI}?25l${CSI}2J${CSI}H`);
    redrawChrome({ preserveCursor: false });
    output.write(`${position(bodyTop, 1)}${CSI}?25h`);
    if (!resizeAttached) {
      output.on?.('resize', onResize);
      resizeAttached = true;
    }
    // Keep the first application frame inside the reserved scroll region.
    output.write(`${CSI}${bodyTop};${bodyBottom}r`);
    return true;
  }

  function exit() {
    if (!active) return false;
    active = false;
    output.write(`${RESET_SCROLL_REGION}${CSI}?25h${ALT_EXIT}`);
    return true;
  }

  function setMode(nextMode) {
    if (nextMode !== 'minimal' && nextMode !== 'fullscreen') return false;
    if (mode === nextMode && (nextMode === 'minimal' || active)) return true;
    if (active) exit();
    mode = nextMode;
    if (mode === 'fullscreen') return enter();
    return true;
  }

  function clearBody() {
    if (!active) {
      output.write(`${CSI}2J${CSI}H`);
      return;
    }
    const { height } = dimensions();
    const bodyTop = headerRows + 1;
    const bodyBottom = height - footerRows;
    let sequence = '';
    for (let row = bodyTop; row <= bodyBottom; row++) {
      sequence += `${position(row, 1)}${CSI}2K`;
    }
    sequence += `${position(bodyTop, 1)}`;
    output.write(sequence);
  }

  function transcriptLines(value, width) {
    return tui.wrapAnsi(String(value || ''), Math.max(10, width - 4)).split('\n');
  }

  function paintScrollback(value, offset = scrollOffset) {
    if (!active) return { browsing: false, offset: 0 };
    const { width, height } = dimensions();
    const bodyTop = headerRows + 1;
    const bodyBottom = height - footerRows;
    const viewportBottom = Math.max(bodyTop, bodyBottom - composerRows);
    const viewportHeight = viewportBottom - bodyTop + 1;
    const lines = transcriptLines(value, width);
    const maximumOffset = Math.max(0, lines.length - viewportHeight);
    scrollOffset = Math.max(0, Math.min(maximumOffset, offset));
    const start = Math.max(0, lines.length - viewportHeight - scrollOffset);
    const page = lines.slice(start, start + viewportHeight);
    const thumbSize = maximumOffset > 0
      ? Math.max(1, Math.round((viewportHeight / lines.length) * viewportHeight))
      : 0;
    const thumbStart = maximumOffset > 0
      ? Math.round((start / maximumOffset) * Math.max(0, viewportHeight - thumbSize))
      : 0;
    let sequence = SAVE_CURSOR + RESET_SCROLL_REGION;
    for (let index = 0; index < viewportHeight; index++) {
      const line = page[index] || '';
      sequence += `${position(bodyTop + index, 1)}${CSI}2K  ${tui.truncateAnsi(line, width - 4)}`;
      if (maximumOffset > 0) {
        const inThumb = index >= thumbStart && index < thumbStart + thumbSize;
        sequence += `${position(bodyTop + index, width)}${tui.styled(inThumb ? '┃' : '│', {
          color: inThumb ? '#7dd3fc' : '#1e3a4a',
        })}`;
      }
    }
    sequence += `${CSI}${bodyTop};${bodyBottom}r${RESTORE_CURSOR}`;
    output.write(sequence);
    return { browsing, offset: scrollOffset, maximumOffset };
  }

  function scrollViewport(delta, transcript) {
    if (!active) return { browsing: false, offset: 0 };
    const amount = Math.max(1, Math.abs(Number(delta) || 3));
    scrollOffset = delta < 0 ? scrollOffset + amount : Math.max(0, scrollOffset - amount);
    browsing = scrollOffset > 0;
    const result = paintScrollback(transcript, scrollOffset);
    browsing = result.offset > 0;
    return { ...result, browsing };
  }

  function returnToComposer(transcript) {
    if (!active) return;
    browsing = false;
    scrollOffset = 0;
    paintScrollback(transcript, 0);
  }

  function setComposerRows(rows) {
    composerRows = Math.max(1, Math.floor(Number(rows) || 3));
  }

  function composerBottom() {
    return dimensions().height - footerRows;
  }

  function anchorInput() {
    if (!active) return;
    const { height } = dimensions();
    const bodyBottom = height - footerRows;
    // Starting each composer at the bottom of the scroll region makes the
    // variable-height input push old content upward instead of repainting over
    // a previous prompt after a completed turn.
    output.write(`${position(bodyBottom, 1)}${CSI}2K`);
  }

  function update(update = {}) {
    Object.assign(state, update);
    redrawChrome({ preserveCursor: true });
  }

  function dispose() {
    if (resizeAttached) {
      output.removeListener?.('resize', onResize);
      resizeAttached = false;
    }
    exit();
  }

  return {
    enter,
    exit,
    dispose,
    update,
    clearBody,
    anchorInput,
    scrollViewport,
    returnToComposer,
    setComposerRows,
    composerBottom,
    setMode,
    redraw: redrawChrome,
    get active() { return active; },
    get mouseCapture() { return mouseCapture; },
    get mode() { return mode; },
    get state() { return { ...state }; },
    get browsing() { return browsing; },
  };
}

module.exports = {
  createCodeScreen,
  supportsFullscreen,
  requestedMode,
  _sequences: { ALT_ENTER, ALT_EXIT, RESET_SCROLL_REGION },
};
