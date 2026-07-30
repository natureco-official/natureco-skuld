import { describe, expect, it } from 'vitest';
import tui from '../../src/utils/tui.js';

describe('TUI colour API', () => {
  it('supports the custom colour factory used by slash commands', () => {
    expect(typeof tui.C.hex).toBe('function');
    expect(typeof tui.C.hex('#7dd3fc')).toBe('function');
    expect(tui.stripAnsi(tui.C.hex('#7dd3fc')('active'))).toBe('active');
    expect(tui.stripAnsi(tui.C.cyan('cyan'))).toBe('cyan');
    expect(tui.stripAnsi(tui.C.warning('warning'))).toBe('warning');
  });
});
