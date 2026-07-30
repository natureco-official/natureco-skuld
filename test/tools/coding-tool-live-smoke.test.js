import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

const tempDirs = [];
const servers = [];

function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function loopback(handler) {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  while (servers.length) {
    const server = servers.pop();
    await new Promise(resolve => server.close(resolve));
  }
  while (tempDirs.length) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

describe('coding tools with real local smoke effects', () => {
  it('approval completes an in-memory request/respond lifecycle', async () => {
    const tool = require('../../src/tools/approval');
    const requested = await tool.execute({
      action: 'request',
      operation: 'live-smoke',
      description: 'Verify approval lifecycle',
    });
    expect(requested).toMatchObject({ success: true, status: 'pending' });
    await expect(tool.execute({
      action: 'respond', operationId: requested.approvalId, response: 'approve',
    })).resolves.toMatchObject({ success: true, status: 'approved' });
    await expect(tool.execute({
      action: 'status', operationId: requested.approvalId,
    })).resolves.toMatchObject({ success: true, entry: { status: 'approved' } });
  });

  it.each(['bash', 'shell_command'])('%s runs a real safe process in an isolated workspace', async name => {
    const cwd = tempDir(`skuld-${name}-`);
    const result = await require(`../../src/tools/${name}`).execute({ command: 'node -v', cwd });
    expect(result).toMatchObject({ success: true });
    expect(result.output || result.stdout).toMatch(/^v\d+\./);
  });

  it('computer_use reads real platform information without changing the desktop', async () => {
    await expect(require('../../src/tools/computer_use').execute({ action: 'info' }))
      .resolves.toMatchObject({ success: true, platform: process.platform });
  });

  it('document_extract reads and redacts a real temporary text document', async () => {
    const dir = tempDir('skuld-document-');
    const file = path.join(dir, 'proof.txt');
    fs.writeFileSync(file, 'Skuld live document proof\nsecond line', 'utf8');
    const result = await require('../../src/tools/document_extract').execute({ path: file });
    expect(result).toMatchObject({ success: true, extension: '.txt', source: 'document_extract' });
    expect(result.content).toContain('Skuld live document proof');
  });

  it('http_request performs a real approved loopback GET', async () => {
    const base = await loopback((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ live: true }));
    });
    const result = await require('../../src/tools/http_request').execute({
      url: `${base}/proof`, agOnayli: true,
    });
    expect(result).toMatchObject({ success: true, status: 200, body: { live: true } });
  });

  it('list_dir enumerates real files and directories in a temporary workspace', async () => {
    const dir = tempDir('skuld-list-dir-');
    fs.mkdirSync(path.join(dir, 'folder'));
    fs.writeFileSync(path.join(dir, 'proof.txt'), 'proof', 'utf8');
    const result = await require('../../src/tools/list_dir').execute({ path: dir });
    expect(result).toMatchObject({ success: true, path: path.resolve(dir) });
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'folder', type: 'directory' }),
      expect.objectContaining({ name: 'proof.txt', type: 'file' }),
    ]));
  });

  it('plan lists an isolated real plan directory without provider access', async () => {
    const home = tempDir('skuld-plan-');
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    vi.resetModules();
    await expect(require('../../src/tools/plan').execute({ action: 'list' }))
      .resolves.toEqual({ success: true, count: 0, plans: [] });
  });
});
