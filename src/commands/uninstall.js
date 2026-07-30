const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const readline = require('readline');
const { requireApproval, RISK } = require('../utils/dangerous');

const BASE_DIR = path.join(os.homedir(), '.nskuld');

function rlQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(query, answer => { rl.close(); resolve(answer.trim().toLowerCase()); });
  });
}

async function uninstall(params) {
  try {
    const [action] = params || [];

    if (action === 'dry-run') return cmdDryRun();

    if (!action || action === 'run') return await cmdRun();

    console.log(chalk.red(`\n  Unknown uninstall action: ${action}\n`));
    console.log(chalk.gray('  Usage: nskuld uninstall [run|dry-run]\n'));
  } catch (err) {
    console.log(chalk.red(`\n  Uninstall error: ${err.message}\n`));
  }
}

function cmdDryRun() {
  console.log(chalk.cyan('\n  Uninstall — Dry Run\n'));
  console.log(chalk.gray('  Would remove:\n'));

  if (fs.existsSync(BASE_DIR)) {
    console.log(chalk.gray('  • ') + chalk.white('~/.nskuld/') + chalk.gray(' — all config and data'));
  } else {
    console.log(chalk.gray('  • ') + chalk.white('~/.nskuld/') + chalk.gray(' — not found'));
  }

  console.log(chalk.gray('  • ') + chalk.white('npm uninstall -g natureco-skuld'));
  console.log(chalk.gray('  • ') + chalk.white('Remove global symlink\n'));
}

async function cmdRun() {
  console.log(chalk.cyan('\n  Uninstall NatureCo\n'));

  // v5.6.16: Dangerous approval (CRITICAL)
  const approved = await requireApproval('nskuld uninstall', {}, RISK.CRITICAL,
    'NatureCo Skuld ve tum kisisel veriler silinecek (geri alinamaz)');
  if (!approved) {
    console.log(chalk.gray('\n  Cancelled.\n'));
    return;
  }

  // Eski onay mekanizmasini kaldirdik, dangerous approval yeterli

  if (fs.existsSync(BASE_DIR)) {
    console.log(chalk.gray('  Removing ~/.nskuld/...'));
    fs.rmSync(BASE_DIR, { recursive: true, force: true });
    console.log(chalk.hex('#7dd3fc')('  ✓ Removed ~/.nskuld/'));
  }

  console.log(chalk.gray('  Uninstalling global package...'));
  try {
    execSync('npm uninstall -g natureco-skuld', { stdio: 'inherit' });
    console.log(chalk.hex('#7dd3fc')('  ✓ Global package uninstalled'));
  } catch (e) {
    console.log(chalk.yellow('  Could not uninstall package: ' + e.message));
    console.log(chalk.gray('  Try manually: npm uninstall -g natureco-skuld'));
  }

  console.log(chalk.hex('#7dd3fc')('\n  Uninstall complete.\n'));
}

module.exports = uninstall;
