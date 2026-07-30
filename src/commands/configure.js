const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { writePrivateFile } = require('../utils/config');

const BASE_DIR = path.join(os.homedir(), '.nskuld');
const CONFIG_FILE = path.join(BASE_DIR, 'config.json');

function getConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return {}; }
}

function saveConfig(data) {
  writePrivateFile(CONFIG_FILE, JSON.stringify(data, null, 2));
}

function rlQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(query, answer => { rl.close(); resolve(answer.trim()); });
  });
}

async function configure(params) {
  try {
    const [action] = params || [];

    if (!action) return cmdMenu();
    if (action === 'gateway') return await cmdGateway();
    if (action === 'auth') return await cmdAuth();
    if (action === 'remote') return cmdRemote();
    if (action === 'plugins') return cmdPlugins();
    if (action === 'skills') return cmdSkills();

    console.log(chalk.red(`\n  Unknown configure action: ${action}\n`));
    console.log(chalk.gray('  Usage: nskuld configure [gateway|auth|remote|plugins|skills]\n'));
  } catch (err) {
    console.log(chalk.red(`\n  Configure error: ${err.message}\n`));
  }
}

function cmdMenu() {
  console.log(chalk.cyan('\n  Configure\n'));
  console.log(chalk.gray('  Run with an action:'));
  console.log(chalk.gray('    nskuld configure gateway   Update gateway config'));
  console.log(chalk.gray('    nskuld configure auth      Update provider keys'));
  console.log(chalk.gray('    nskuld configure remote     Configure optional Telegram remote coding'));
  console.log(chalk.gray('    nskuld configure plugins    Re-run plugin setup'));
  console.log(chalk.gray('    nskuld configure skills     Re-run skills setup\n'));
}

async function cmdGateway() {
  const cfg = getConfig();
  console.log(chalk.cyan('\n  Gateway Configuration\n'));
  console.log(chalk.gray('  Current: ') + chalk.white(cfg.gatewayUrl || 'not set'));

  const url = await rlQuestion(`  Gateway URL (${cfg.gatewayUrl || 'ws://localhost:3848'}): `);
  const port = await rlQuestion(`  Port (${cfg.gatewayPort || 3848}): `);

  cfg.gatewayUrl = url || cfg.gatewayUrl || 'ws://localhost:3848';
  cfg.gatewayPort = parseInt(port) || cfg.gatewayPort || 3848;
  saveConfig(cfg);

  console.log(chalk.hex('#7dd3fc')(`\n  Gateway updated: ${cfg.gatewayUrl}:${cfg.gatewayPort}\n`));
}

async function cmdAuth() {
  const cfg = getConfig();
  console.log(chalk.cyan('\n  Auth Configuration\n'));
  console.log(chalk.gray('  Current provider key: ') + chalk.white(cfg.providerApiKey ? '(set)' : '(not set)'));

  const key = await rlQuestion('  Provider API Key (leave blank to keep current): ');
  if (key) {
    cfg.providerApiKey = key;
    saveConfig(cfg);
    console.log(chalk.hex('#7dd3fc')('\n  API key updated.\n'));
  } else {
    console.log(chalk.gray('\n  No changes made.\n'));
  }
}

function cmdRemote() {
  console.log(chalk.cyan('\n  Optional Telegram Remote Coding\n'));
  console.log(chalk.gray('  Run the guarded Telegram setup:'));
  console.log(chalk.cyan('    nskuld remote setup\n'));
}

function cmdPlugins() {
  console.log(chalk.cyan('\n  Plugin Setup\n'));
  console.log(chalk.gray('  To manage plugins:'));
  console.log(chalk.cyan('    nskuld plugins list'));
  console.log(chalk.cyan('    nskuld plugins add <url>\n'));
}

function cmdSkills() {
  console.log(chalk.cyan('\n  Skills Setup\n'));
  console.log(chalk.gray('  To manage skills:'));
  console.log(chalk.cyan('    nskuld skills list'));
  console.log(chalk.cyan('    nskuld skills add <name>\n'));
}

module.exports = configure;
