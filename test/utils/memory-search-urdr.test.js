import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('memory_search Urðr routing', () => {
  let home;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'skuld-memory-search-'));
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    vi.resetModules();
    const urdr = path.join(home, '.codex', 'memory');
    const legacy = path.join(home, '.nskuld', 'memory');
    fs.mkdirSync(urdr, { recursive: true });
    fs.mkdirSync(legacy, { recursive: true });
    fs.writeFileSync(path.join(urdr, 'root-0-index.md'), '# Index\n- route only\n');
    fs.writeFileSync(path.join(urdr, 'root-1-topics.md'), '# Topics\n\n## Projects\n\n- Skuld is the active coding project.\n\nA durable paragraph about Urðr memory.\n');
    const generation = path.join(urdr, '.urdr', 'generations', 'old');
    fs.mkdirSync(generation, { recursive: true });
    fs.writeFileSync(path.join(generation, 'root-1-topics.md'), '# Topics\n\n## Projects\n\n- Stale duplicate snapshot.\n');
    fs.writeFileSync(path.join(legacy, 'gencay.json'), JSON.stringify({
      name: 'gencay',
      facts: [{ value: 'Legacy compatibility fact' }],
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('searches canonical Urðr before retaining legacy compatibility', async () => {
    const tool = require('../../src/tools/memory_search');
    const result = await tool.execute({ query: 'Skuld', scope: 'memory' });
    expect(result.sources[0]).toBe('urdr');
    expect(result.results[0]).toMatchObject({ source: expect.stringMatching(/^urdr:canonical/), content: expect.stringContaining('Skuld') });
  });

  it('treats * as a list operation across Urðr and legacy memory', async () => {
    const tool = require('../../src/tools/memory_search');
    const result = await tool.execute({ query: '*', scope: 'memory' });
    expect(result).toMatchObject({ success: true, mode: 'list', truncated: false, sources: ['urdr', 'memory'] });
    expect(result.results.map((item) => item.content)).toEqual(expect.arrayContaining([
      'Skuld is the active coding project.',
      'A durable paragraph about Urðr memory.',
      'gencay',
      'Legacy compatibility fact',
    ]));
    expect(result.results.some((item) => item.content === 'route only')).toBe(false);
    expect(result.results.some((item) => item.content === 'Stale duplicate snapshot.')).toBe(false);
  });

  it('reports truncation rather than claiming the returned slice is complete', async () => {
    const tool = require('../../src/tools/memory_search');
    const result = await tool.execute({ query: '*', scope: 'memory', maxResults: 2 });
    expect(result.found).toBeGreaterThan(2);
    expect(result.returned).toBe(2);
    expect(result.truncated).toBe(true);
  });
});
