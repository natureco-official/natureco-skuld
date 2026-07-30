import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const requireCjs = createRequire(import.meta.url);
const { createScrollbackArchive } = requireCjs('../src/commands/code_v5.js')._presentation;

describe('fullscreen conversation scrollback archive', () => {
  it('keeps visible conversation after provider messages are compacted', () => {
    const archive = createScrollbackArchive();
    const messages = [
      { role: 'user', content: 'old question' },
      { role: 'assistant', content: 'old answer', tool_calls: [{ id: '1', function: { name: 'read_file' } }] },
      { role: 'tool', tool_call_id: '1', content: 'secret detailed output' },
    ];
    expect(archive.sync(messages)).toContain('old question');
    messages.splice(0, messages.length, { role: 'system', content: 'compacted summary' });
    const rendered = archive.sync(messages);
    expect(rendered).toContain('old question');
    expect(rendered).toContain('old answer');
    expect(rendered).toContain('read_file');
    expect(rendered).not.toContain('secret detailed output');
  });
});
