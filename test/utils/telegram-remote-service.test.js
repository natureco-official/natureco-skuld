import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import remoteModule from '../../src/utils/telegram-remote-service.js';

const { startRemoteService, MAX_TASK_CHARS } = remoteModule;
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skuld-telegram-'));
  roots.push(root);
  return root;
}

class FakeBot {
  constructor() {
    this.sendMessage = vi.fn(async () => {});
    this.sendChatAction = vi.fn(async () => {});
    this.stopPolling = vi.fn(async () => {});
  }
  on(event, handler) { if (event === 'message') this.messageHandler = handler; }
}

async function service(overrides = {}) {
  const runBrain = overrides.runBrain || vi.fn(async ({ text }) => `done:${text}`);
  const result = await startRemoteService({
    config: {
      telegramToken: '123:super-secret-token',
      telegramAllowedChats: ['42'],
      telegramRemoteWorkspace: workspace(),
    },
    TelegramBot: FakeBot,
    runBrain,
    chdir: false,
    registerSignals: false,
    minIntervalMs: 0,
    ...overrides,
  });
  return { ...result, runBrain };
}

describe('Telegram remote coding boundary', () => {
  it('ignores chats outside the explicit allowlist', async () => {
    const { onMessage, bot, runBrain } = await service();
    await onMessage({ chat: { id: 99 }, text: 'change the project' });
    expect(runBrain).not.toHaveBeenCalled();
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects oversized tasks before the coding brain', async () => {
    const { onMessage, bot, runBrain } = await service();
    await onMessage({ chat: { id: 42 }, text: 'x'.repeat(MAX_TASK_CHARS + 1) });
    expect(runBrain).not.toHaveBeenCalled();
    expect(bot.sendMessage).toHaveBeenCalledWith('42', expect.stringContaining(String(MAX_TASK_CHARS)));
  });

  it('serializes tasks from the same chat', async () => {
    const order = [];
    const runBrain = vi.fn(async ({ text }) => {
      order.push(`start:${text}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(`end:${text}`);
      return text;
    });
    const { onMessage } = await service({ runBrain });
    await Promise.all([
      onMessage({ chat: { id: 42 }, text: 'one' }),
      onMessage({ chat: { id: 42 }, text: 'two' }),
    ]);
    expect(order).toEqual(['start:one', 'end:one', 'start:two', 'end:two']);
  });

  it('does not send internal errors or tokens back to Telegram', async () => {
    const { onMessage, bot } = await service({
      runBrain: vi.fn(async () => { throw new Error('failed at 123:super-secret-token'); }),
    });
    await onMessage({ chat: { id: 42 }, text: 'task' });
    const reply = bot.sendMessage.mock.calls.at(-1)[1];
    expect(reply).toBe('Remote coding failed. Check the local Skuld remote log.');
    expect(reply).not.toContain('super-secret-token');
  });
});
