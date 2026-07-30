'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('../utils/inquirer-wrapper');
const { getConfig, saveConfig } = require('../utils/config');
const { maskToken } = require('./channel-helper');
const { validateRemoteConfig } = require('../utils/telegram-remote-service');
const telegramTokens = require('../utils/telegram-token-store');

const STATE_DIR = path.join(os.homedir(), '.nskuld', 'remote');
const PID_FILE = path.join(STATE_DIR, 'telegram.pid');
const LOG_FILE = path.join(STATE_DIR, 'telegram.log');
const ice = chalk.hex('#7dd3fc');

function readPid() {
  try {
    const pid = Number(fs.readFileSync(PID_FILE, 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch { return null; }
}

function isRunning(pid = readPid()) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function setup() {
  const config = getConfig();
  if (!config.providerUrl || !config.providerApiKey) {
    throw new Error('Önce kodlama sağlayıcısını kurun: nskuld setup');
  }
  const answers = await inquirer.prompt([
    {
      type: 'input', name: 'token', message: 'Telegram bot token:', default: config.telegramToken || '',
      validate: (value) => String(value).includes(':') || 'Geçerli bir BotFather tokenı girin.',
    },
    {
      type: 'input', name: 'chatId', message: 'İzin verilen Telegram Chat ID:',
      default: (config.telegramAllowedChats || [])[0] || '',
      validate: (value) => /^-?\d+$/.test(String(value).trim()) || 'Chat ID yalnızca rakamlardan oluşmalı.',
    },
    {
      type: 'input', name: 'workspace', message: 'Uzaktan çalışılacak proje dizini:',
      default: config.telegramRemoteWorkspace || process.cwd(),
      validate: (value) => {
        const target = path.resolve(String(value));
        return (fs.existsSync(target) && fs.statSync(target).isDirectory()) || 'Var olan bir dizin girin.';
      },
    },
  ]);
  telegramTokens.saveToken(String(answers.token).trim());
  delete config.telegramToken;
  config.telegramTokenStored = true;
  config.telegramAllowedChats = [String(answers.chatId).trim()];
  config.telegramRemoteWorkspace = path.resolve(String(answers.workspace));
  config.telegramRemoteEnabled = true;
  saveConfig(config);
  console.log(ice('\n✓ Telegram uzaktan kodlama ayarlandı.'));
  console.log(chalk.gray(`  Token: ${maskToken(String(answers.token).trim())} (${telegramTokens.storageInfo().backend})`));
  console.log(chalk.gray(`  Proje: ${config.telegramRemoteWorkspace}`));
  console.log(chalk.cyan('  Başlat: nskuld remote start\n'));
}

function start() {
  let config = getConfig();
  const migration = telegramTokens.protectLegacyToken(config);
  if (migration.changed) {
    config = migration.config;
    saveConfig(config);
  }
  validateRemoteConfig(telegramTokens.configWithToken(config));
  const oldPid = readPid();
  if (isRunning(oldPid)) {
    console.log(chalk.yellow(`Telegram remote zaten çalışıyor (PID ${oldPid}).`));
    return;
  }
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const logFd = fs.openSync(LOG_FILE, 'a');
  const { startTelegramRemoteWorker } = require('./gateway-server');
  const child = startTelegramRemoteWorker({ cwd: config.telegramRemoteWorkspace, logFd });
  fs.closeSync(logFd);
  fs.writeFileSync(PID_FILE, String(child.pid), 'utf8');
  console.log(ice(`✓ Telegram remote başlatıldı (PID ${child.pid}).`));
  console.log(chalk.gray(`  Proje: ${config.telegramRemoteWorkspace}`));
  console.log(chalk.gray(`  Günlük: ${LOG_FILE}`));
}

function stop() {
  const pid = readPid();
  if (!isRunning(pid)) {
    try { fs.unlinkSync(PID_FILE); } catch { /* absent */ }
    console.log(chalk.gray('Telegram remote çalışmıyor.'));
    return;
  }
  process.kill(pid, 'SIGTERM');
  try { fs.unlinkSync(PID_FILE); } catch { /* best effort */ }
  console.log(ice(`✓ Telegram remote durduruldu (PID ${pid}).`));
}

function status() {
  const config = getConfig();
  const pid = readPid();
  console.log(isRunning(pid) ? ice(`● çalışıyor (PID ${pid})`) : chalk.gray('○ durdu'));
  console.log(`Proje: ${config.telegramRemoteWorkspace || 'ayarlanmamış'}`);
  console.log(`Chat: ${(config.telegramAllowedChats || []).join(', ') || 'ayarlanmamış'}`);
  console.log(`Günlük: ${LOG_FILE}`);
}

async function remote(action = 'status') {
  if (action === 'setup') return setup();
  if (action === 'start') return start();
  if (action === 'stop') return stop();
  if (action === 'restart') { stop(); return start(); }
  if (action === 'status') return status();
  throw new Error('Kullanım: nskuld remote <setup|start|stop|restart|status>');
}

remote._internal = { readPid, isRunning, PID_FILE, LOG_FILE };
module.exports = remote;
