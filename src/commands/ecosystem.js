'use strict';

const chalk = require('chalk');
const packageJson = require('../../package.json');
const account = require('../utils/natureco-account');
const cupertino = require('../utils/cupertino-bridge');
const urdr = require('../utils/urdr-engine');
const { getConfig } = require('../utils/config');
const { getLang } = require('../utils/i18n');

const L = (tr, en) => (getLang() === 'en' ? en : tr);
const ice = chalk.hex('#7dd3fc');
const URLS = Object.freeze({
  ecosystem: 'https://natureco.me/ekosistem',
  portal: 'https://developers.natureco.me',
  natureco: 'https://natureco.me',
});

function row(name, state, detail = '') {
  const mark = state === 'ok' ? ice('●') : state === 'optional' ? chalk.gray('○') : chalk.yellow('◐');
  console.log(`  ${mark} ${chalk.white(name.padEnd(20))}${detail}`);
}

async function showStatus() {
  const memory = await urdr.describeEngine();
  const terminal = cupertino.detectCupertino();
  const target = cupertino.executionTarget();
  const config = getConfig() || {};
  const telegramReady = Boolean(
    config.telegramToken
    && Array.isArray(config.telegramAllowedChats)
    && config.telegramAllowedChats.length
    && config.telegramRemoteWorkspace,
  );

  console.log(ice.bold('\n  NatureCo Ekosistemi × Skuld\n'));
  row('NatureCo Account', account.isLoggedIn() ? 'ok' : 'optional', account.isLoggedIn() ? account.currentEmail() || L('bağlı', 'connected') : L('isteğe bağlı', 'optional'));
  row('NatureCo SDK', 'ok', `v${packageJson.dependencies['natureco-sdk'].replace(/^[^\d]*/, '')}`);
  row('Developer Portal', 'ok', URLS.portal);
  row('Urðr', memory.engine === 'urdr' ? 'ok' : 'warn', memory.engine === 'urdr' ? L('etkin bellek motoru', 'active memory engine') : memory.reason);
  row('CodeDNA', 'ok', L('kodlama sonrası kalite kapısı', 'post-coding quality gate'));
  row('Cupertino Terminal', terminal.installed ? 'ok' : 'optional', terminal.active ? `v${terminal.version || '?'}` : (terminal.installed ? L('kurulu', 'installed') : L('standart terminal yedeği', 'standard-terminal fallback')));
  row('Çalıştırma hedefi', 'ok', target.kind === 'local' ? L('yerel', 'local') : `ZeroLink · ${target.label}`);
  row('Telegram Remote', telegramReady ? 'ok' : 'optional', telegramReady ? L('izin listeli proje hazır', 'allowlisted workspace ready') : L('kapalı / isteğe bağlı', 'off / optional'));
  console.log(chalk.gray(`\n  ${URLS.ecosystem}\n`));
}

function showLinks() {
  console.log(ice.bold('\n  NatureCo bağlantıları\n'));
  console.log(`  ${chalk.white('Ekosistem'.padEnd(20))}${chalk.cyan(URLS.ecosystem)}`);
  console.log(`  ${chalk.white('Developer Portal'.padEnd(20))}${chalk.cyan(URLS.portal)}`);
  console.log(`  ${chalk.white('NatureCo'.padEnd(20))}${chalk.cyan(URLS.natureco)}\n`);
}

async function ecosystem(action = 'status') {
  if (action === 'status') return showStatus();
  if (action === 'links') return showLinks();
  console.log(chalk.red('\n  ' + L('Kullanım: nskuld ecosystem [status|links]', 'Usage: nskuld ecosystem [status|links]') + '\n'));
  process.exitCode = 1;
}

ecosystem.URLS = URLS;
module.exports = ecosystem;
