import { EventEmitter } from 'events';
import { createRequire } from 'module';
import { describe, expect, it, vi } from 'vitest';

const requireCjs = createRequire(import.meta.url);
const {
  createCodeScreen,
  supportsFullscreen,
  _sequences,
} = requireCjs('../src/utils/code-screen.js');
const tui = requireCjs('../src/utils/tui.js');

function terminal({ columns = 100, rows = 30, tty = true } = {}) {
  const input = new EventEmitter();
  input.isTTY = tty;
  const output = new EventEmitter();
  output.isTTY = tty;
  output.columns = columns;
  output.rows = rows;
  output.value = '';
  output.write = vi.fn(value => {
    output.value += String(value);
    return true;
  });
  return { input, output };
}

describe('Grok-style Skuld code screen', () => {
  it('uses a fullscreen alternate buffer with reserved header and footer rows', () => {
    const { input, output } = terminal();
    const screen = createCodeScreen({
      input,
      output,
      env: {},
      lang: 'en',
      project: 'C:\\Projects\\natureco-skuld',
      branch: 'main',
      changes: 3,
      model: 'MiniMax-M2.7',
      tools: '69',
      version: '0.1.0',
    });

    expect(screen.enter()).toBe(true);
    expect(screen.active).toBe(true);
    expect(output.value).toContain(_sequences.ALT_ENTER);
    expect(output.value).toContain('\x1b[7;27r');
    expect(output.value).toContain('SKULD // CODE');
    expect(output.value).toContain('MiniMax-M2.7');
    expect(output.value).toContain('TOOLS');
    // Fare yakalandığında ipucu doğruyu söylemeli: sürükleme uygulamaya
    // gidiyor, seçim Shift ile yapılıyor. "mouse-select to copy" demek burada
    // yanlış bilgiydi.
    expect(output.value).toContain('wheel scrolls');
    expect(output.value).toContain('Shift+drag selects');
    expect(output.value).not.toContain('mouse-select to copy');
    expect((tui.stripAnsi(output.value).match(/│/g) || [])).toHaveLength(8);

    screen.dispose();
    expect(output.value).toContain(_sequences.ALT_EXIT);
  });

  // `codeMouseScroll: false` diyen kullanıcı doğal seçimi geri alır: fare
  // yakalanmaz ve ipucu da kaydırmanın klavyeyle yapıldığını söyler.
  it('gives the mouse back and says so when capture is turned off', () => {
    const { input, output } = terminal();
    const screen = createCodeScreen({
      input,
      output,
      env: {},
      lang: 'en',
      mouseCapture: false,
      project: 'C:\\Projects\\natureco-skuld',
      model: 'MiniMax-M2.7',
      tools: '69',
      version: '0.1.0',
    });

    expect(screen.enter()).toBe(true);
    expect(screen.mouseCapture).toBe(false);
    expect(output.value).toContain('mouse-select to copy');
    expect(output.value).toContain('PgUp/PgDn scrolls');
    expect(output.value).not.toContain('Shift+drag selects');

    screen.dispose();
  });

  it('switches between fullscreen and minimal modes without ending the session', () => {
    const { input, output } = terminal();
    const screen = createCodeScreen({ input, output, env: {} });
    screen.enter();

    expect(screen.setMode('minimal')).toBe(true);
    expect(screen.active).toBe(false);
    expect(screen.mode).toBe('minimal');
    expect(output.value).toContain(_sequences.ALT_EXIT);

    expect(screen.setMode('fullscreen')).toBe(true);
    expect(screen.active).toBe(true);
    expect(output.value.match(/\x1b\[\?1049h/g)).toHaveLength(2);
    screen.dispose();
  });

  it('falls back to minimal mode for pipes and undersized terminals', () => {
    const piped = terminal({ tty: false });
    const small = terminal({ columns: 40, rows: 16 });
    expect(supportsFullscreen({ ...piped, env: {} })).toBe(false);
    expect(supportsFullscreen({ ...small, env: {} })).toBe(false);
    expect(createCodeScreen({ ...small, env: {} }).enter()).toBe(false);
  });

  it('redraws chrome with live model and activity state', () => {
    const { input, output } = terminal();
    const screen = createCodeScreen({ input, output, env: {}, model: 'old' });
    screen.enter();
    output.value = '';

    screen.update({ model: 'gpt-5.2-codex', activity: 'WORKING' });

    expect(output.value).toContain('gpt-5.2-codex');
    expect(output.value).toContain('WORKING');
    expect(output.value).toContain('\x1b[s');
    expect(output.value).toContain('\x1b[u');
    screen.dispose();
  });

  it('anchors every fresh composer above the fixed footer', () => {
    const { input, output } = terminal();
    const screen = createCodeScreen({ input, output, env: {} });
    screen.enter();
    output.value = '';

    screen.anchorInput();

    expect(output.value).toBe('\x1b[27;1H\x1b[2K');
    screen.dispose();
  });

  it('scrolls only the middle viewport and returns to the live composer', () => {
    const { input, output } = terminal();
    const screen = createCodeScreen({ input, output, env: {} });
    screen.enter();
    output.value = '';
    const transcript = Array.from({ length: 60 }, (_, index) => `conversation-${index + 1}`).join('\n');

    const up = screen.scrollViewport(-6, transcript);
    expect(up.browsing).toBe(true);
    expect(output.value).toContain('conversation-');
    expect(output.value).toContain('\x1b[7;1H');
    expect(output.value).not.toContain('\x1b[1;1H');
    expect(output.value).not.toContain('\x1b[25;1H');
    expect(output.value).not.toContain('\x1b[26;1H');
    expect(output.value).not.toContain('\x1b[27;1H');

    output.value = '';
    const down = screen.scrollViewport(999, transcript);
    expect(down.browsing).toBe(false);
    expect(output.value).not.toContain('\x1b[27;1H\x1b[2K');
    screen.dispose();
  });
});
