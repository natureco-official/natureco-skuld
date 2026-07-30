import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tempDirs = [];
const originalCwd = process.cwd();

function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function waitFor(predicate, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = predicate();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for runtime tool');
}

afterEach(() => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
  vi.resetModules();
  while (tempDirs.length) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

describe('the 16 runtime-injected coding tools', () => {
  it('keeps the complete 15-tool runtime surface plus enable_tools', () => {
    const source = fs.readFileSync(path.resolve('src/commands/code_v5.js'), 'utf8');
    const start = source.indexOf('const virtualTools = [');
    const end = source.indexOf('toolDefs.push(...virtualTools)', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = source.slice(start, end);
    const names = [...block.matchAll(/name:\s*'([^']+)'/g)].map(match => match[1]);
    expect(names).toEqual([
      'EnterPlanMode', 'ExitPlanMode', 'EnterWorktree', 'ExitWorktree',
      'CreateTask', 'ListTasks', 'GetTaskResult', 'StopTask', 'SearchSessions',
      'RestoreFile', 'FileHistory', 'UltraReview', 'ScheduleTask',
      'ListScheduledTasks', 'RemoveScheduledTask',
    ]);
    expect(source).toContain('createEnableToolsTool(');
  });

  it('runs a real background process and exposes create/list/result/stop lifecycle', async () => {
    const home = tempDir('skuld-task-home-');
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    vi.resetModules();
    const { TaskManager } = require('../src/utils/tasks');
    const manager = new TaskManager();

    const short = manager.create('node -e "process.stdout.write(\'runtime-proof\')"', { cwd: home });
    expect(manager.list()).toEqual(expect.arrayContaining([expect.objectContaining({ id: short.id })]));
    const completed = await waitFor(() => {
      const result = manager.get(short.id);
      return result?.status === 'completed' ? result : null;
    });
    expect(completed).toMatchObject({ exitCode: 0, stdout: 'runtime-proof' });

    const long = manager.create('node -e "setTimeout(function(){},5000)"', { cwd: home });
    expect(manager.stop(long.id)).toMatchObject({ id: long.id, status: 'stopped' });
  });

  it('searches a real isolated session transcript', () => {
    const project = tempDir('skuld-session-project-');
    const sessions = path.join(project, '.nskuld', 'sessions');
    fs.mkdirSync(sessions, { recursive: true });
    fs.writeFileSync(path.join(sessions, 'proof.json'), JSON.stringify({
      messages: [{ role: 'user', content: 'runtime session marker' }],
    }), 'utf8');
    process.chdir(project);
    vi.resetModules();
    const result = require('../src/utils/session-search').search('session marker');
    expect(result).toEqual([expect.objectContaining({ id: 'proof', score: 1 })]);
  });

  it('snapshots, lists and restores a real isolated file', async () => {
    const project = tempDir('skuld-history-project-');
    const file = path.join(project, 'proof.txt');
    fs.writeFileSync(file, 'before', 'utf8');
    process.chdir(project);
    vi.resetModules();
    const history = require('../src/utils/file-history');
    history.snapshot(file, 'before');
    fs.writeFileSync(file, 'after', 'utf8');
    const snapshots = history.getHistory(file);
    expect(snapshots).toHaveLength(1);
    expect(history.restore(file, snapshots[0].timestamp)).toMatchObject({ restored: true, filePath: file });
    expect(fs.readFileSync(file, 'utf8')).toBe('before');
  });

  it('runs the real multi-focus review engine', () => {
    const review = require('../src/utils/ultra-review');
    const result = review.reviewDiff('+const password = "secret";\n+eval(input);');
    expect(result).toBeTruthy();
    expect(JSON.stringify(result).length).toBeGreaterThan(20);
  });

  it('adds, lists and removes an isolated scheduled task', () => {
    const home = tempDir('skuld-cron-home-');
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    vi.resetModules();
    const cron = require('../src/utils/cron');
    const entry = cron.addJob({ schedule: '*/5 * * * *', command: 'node -v', description: 'proof' });
    expect(cron.loadJobs()).toEqual([expect.objectContaining({ id: entry.id, enabled: true })]);
    expect(cron.removeJob(entry.id)).toBe(true);
    expect(cron.loadJobs()).toEqual([]);
  });

  it('enables a hidden schema at runtime and rejects unknown names', async () => {
    const { createEnableToolsTool } = require('../src/utils/tool-profile');
    const enabled = new Set();
    const tool = createEnableToolsTool(enabled, () => ['read_file', 'git']);
    await expect(tool.execute({ names: ['git'] })).resolves.toMatchObject({ enabled: ['git'], unknown: [] });
    expect(enabled.has('git')).toBe(true);
    await expect(tool.execute({ names: ['not-a-tool'] })).resolves.toMatchObject({ enabled: [], unknown: ['not-a-tool'] });
  });
});
