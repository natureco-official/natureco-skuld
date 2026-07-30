import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const requireCjs = createRequire(import.meta.url);
const git = requireCjs('../src/tools/git.js');
const calistir = vi.fn(async () => ({ cikisKodu: 0, stdout: 'cloned', stderr: '' }));
const gatewayFactory = vi.fn(async () => ({ calistir }));

let workspace;
beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'skuld-clone-'));
  calistir.mockClear();
  gatewayFactory.mockClear();
});
afterEach(() => fs.rmSync(workspace, { recursive: true, force: true }));

describe('git clone coding capability', () => {
  it('clones an HTTPS GitHub repository into a workspace child', async () => {
    const result = await git._cloneGitHubRepository({
      url: 'https://github.com/natureco-official/urdr',
      destination: 'urdr-local',
      cwd: workspace,
      gatewayFactory,
    });
    expect(result).toMatchObject({ success: true, repository: 'natureco-official/urdr' });
    expect(result.path).toBe(path.join(workspace, 'urdr-local'));
    expect(calistir).toHaveBeenCalledWith(expect.objectContaining({
      komut: 'git',
      argumanlar: ['clone', '--depth', '1', 'https://github.com/natureco-official/urdr.git', path.join(workspace, 'urdr-local')],
      cwd: workspace,
    }));
  });

  it('rejects non-GitHub URLs, traversal and existing destinations', async () => {
    await expect(git._cloneGitHubRepository({ url: 'https://example.com/a/b', cwd: workspace, gatewayFactory }))
      .resolves.toMatchObject({ success: false });
    await expect(git._cloneGitHubRepository({ url: 'https://github.com/a/b', destination: '../outside', cwd: workspace, gatewayFactory }))
      .resolves.toMatchObject({ success: false, error: expect.stringMatching(/çalışma alanı/i) });
    fs.mkdirSync(path.join(workspace, 'exists'));
    await expect(git._cloneGitHubRepository({ url: 'https://github.com/a/b', destination: 'exists', cwd: workspace, gatewayFactory }))
      .resolves.toMatchObject({ success: false, error: expect.stringMatching(/zaten var/i) });
    expect(calistir).not.toHaveBeenCalled();
  });
});
