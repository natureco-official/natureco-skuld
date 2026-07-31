'use strict';

const fs = require('fs');
const path = require('path');
const { getConfig } = require('./config');
const { runBrain, chunkText } = require('./channel-brain');
const { configWithToken } = require('./telegram-token-store');
const { loadTelegramBotClass } = require('./telegram-bot-class');

const MAX_TASK_CHARS = 12000;
const MIN_MESSAGE_INTERVAL_MS = 750;

function normalizeAllowedChats(config) {
  return new Set((config.telegramAllowedChats || []).map(String).filter(Boolean));
}

function validateRemoteConfig(config) {
  if (!config.telegramToken) throw new Error('Telegram token is not configured. Run: nskuld remote setup');
  const allowed = normalizeAllowedChats(config);
  if (allowed.size === 0) throw new Error('Telegram allowlist is empty. Run: nskuld remote setup');
  const workspace = path.resolve(config.telegramRemoteWorkspace || '');
  if (!config.telegramRemoteWorkspace || !fs.existsSync(workspace) || !fs.statSync(workspace).isDirectory()) {
    throw new Error('Remote workspace is missing or invalid. Run: nskuld remote setup');
  }
  return { allowed, workspace };
}

async function startRemoteService(deps = {}) {
  const config = deps.config || configWithToken(getConfig());
  const { allowed, workspace } = validateRemoteConfig(config);
  if (deps.chdir !== false) process.chdir(workspace);
  process.env.SKULD_CHANNEL_ORIGIN = '1';

  const TelegramBot = deps.TelegramBot || loadTelegramBotClass();
  const bot = new TelegramBot(config.telegramToken, { polling: true });
  const execute = deps.runBrain || runBrain;
  const splitReply = deps.chunkText || chunkText;
  const now = deps.now || Date.now;
  const minIntervalMs = deps.minIntervalMs ?? MIN_MESSAGE_INTERVAL_MS;
  const queues = new Map();
  const lastMessageAt = new Map();

  function enqueue(chatId, task) {
    const previous = queues.get(chatId) || Promise.resolve();
    const current = previous.catch(() => {}).then(task);
    queues.set(chatId, current);
    current.finally(() => {
      if (queues.get(chatId) === current) queues.delete(chatId);
    }).catch(() => {});
    return current;
  }

  function safeLocalError(error) {
    let message = String(error?.stack || error?.message || error || 'unknown error');
    if (config.telegramToken) message = message.split(config.telegramToken).join('[REDACTED]');
    message = message.split(osHome()).join('[HOME]');
    return message.slice(0, 2000);
  }

  const onMessage = async (msg) => {
    const chatId = String(msg?.chat?.id || '');
    const text = String(msg?.text || '').trim();
    if (!text || !allowed.has(chatId)) return;

    if (text.length > MAX_TASK_CHARS) {
      await bot.sendMessage(chatId, `Task is too long. Maximum: ${MAX_TASK_CHARS} characters.`);
      return;
    }

    const timestamp = now();
    const previousAt = lastMessageAt.get(chatId) || 0;
    if (minIntervalMs > 0 && timestamp - previousAt < minIntervalMs) {
      await bot.sendMessage(chatId, 'Please wait a moment before sending another task.');
      return;
    }
    lastMessageAt.set(chatId, timestamp);

    return enqueue(chatId, async () => {
      try {
      if (text === '/status' || text === '/cwd') {
        await bot.sendMessage(chatId, `Skuld remote is running.\nProject: ${workspace}`);
        return;
      }
      if (text === '/help' || text === '/start') {
        await bot.sendMessage(chatId, 'Send a coding task in plain language. Commands: /status, /cwd, /help');
        return;
      }

      if (typeof bot.sendChatAction === 'function') await bot.sendChatAction(chatId, 'typing');
      const reply = await execute({ channel: 'telegram-remote', chatKey: chatId, text });
      for (const part of splitReply(reply || 'Task finished without a textual response.', 4000)) {
        await bot.sendMessage(chatId, part);
      }
      } catch (error) {
        process.stderr.write(`[skuld-remote] ${safeLocalError(error)}\n`);
        await bot.sendMessage(chatId, 'Remote coding failed. Check the local Skuld remote log.');
      }
    });
  };

  bot.on('message', onMessage);

  const stop = async () => {
    try { await bot.stopPolling(); } catch { /* best effort */ }
  };
  if (deps.registerSignals !== false) {
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  }
  return { bot, workspace, allowed, onMessage };
}

function osHome() {
  return require('os').homedir();
}

if (require.main === module) {
  startRemoteService().catch((error) => {
    process.stderr.write(`[skuld-remote] ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  startRemoteService,
  validateRemoteConfig,
  normalizeAllowedChats,
  MAX_TASK_CHARS,
  MIN_MESSAGE_INTERVAL_MS,
};
