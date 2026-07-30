'use strict';

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');
const { getLang } = require('../utils/i18n');
const cupertino = require('../utils/cupertino-bridge');

const L = (tr, en) => (getLang() === 'en' ? en : tr);
const ICE = '#7dd3fc';
const SESSIONS_FILE = path.join(os.homedir(), '.nskuld', 'terminal-sessions.json');

function loadSessions() {
  if (!fs.existsSync(SESSIONS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')); } catch { return []; }
}

function saveSessions(sessions) {
  fs.mkdirSync(path.dirname(SESSIONS_FILE), { recursive: true });
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function terminal(args) {
  const [action, ...params] = args || [];
  if (!action || action === 'help') return showHelp();
  if (action === 'status') return showStatus();
  if (action === 'open') return openCupertino(params.join(' ') || process.cwd());
  if (action === 'zerolink') return showZeroLink();
  if (action === 'exec') return execCmd(params.join(' '));
  if (action === 'connect') return connectSession(params[0], params.slice(1).join(' '));
  if (action === 'disconnect') return disconnectSession(params[0]);
  if (action === 'list') return listSessions();

  console.log(chalk.red(`\n  ✗ ${L('Bilinmeyen komut', 'Unknown command')}: ${action}\n`));
  console.log(chalk.gray('  nskuld terminal [status|open|zerolink|exec|connect|disconnect|list]\n'));
  process.exitCode = 1;
}

function showStatus() {
  const app = cupertino.detectCupertino();
  const target = cupertino.executionTarget();
  console.log(chalk.hex(ICE).bold('\n  Cupertino Terminal × Skuld\n'));
  console.log(`  ${L('Kurulum', 'Installed')}: ${app.installed ? chalk.hex(ICE)('✓') : chalk.gray('—')}`);
  console.log(`  ${L('Etkin terminal', 'Active terminal')}: ${app.active ? chalk.hex(ICE)(`Cupertino${app.version ? ` ${app.version}` : ''}`) : chalk.gray(L('standart terminal', 'standard terminal'))}`);
  console.log(`  ${L('Çalıştırma hedefi', 'Execution target')}: ${target.kind === 'local' ? chalk.white(target.label) : chalk.hex(ICE)(target.label)}`);
  console.log(chalk.gray('  ' + (target.kind === 'zerolink'
    ? L('Komutlar açık ZeroLink eş oturumunu hedefliyor.', 'Commands target the explicit ZeroLink peer session.')
    : L('Uzak hedef seçilmedi; komutlar yerel çalışır.', 'No remote target selected; commands run locally.'))));
  console.log('');
}

async function openCupertino(targetPath) {
  const app = cupertino.detectCupertino();
  if (!app.installed) {
    console.log(chalk.yellow('\n  ⚠ ' + L('Cupertino Terminal bulunamadı.', 'Cupertino Terminal was not found.')));
    console.log(chalk.gray('  https://natureco.me/ekosistem\n'));
    return;
  }
  const link = cupertino.directoryDeepLink(targetPath);
  try {
    await cupertino.openDeepLink(link);
    console.log(chalk.hex(ICE)(`\n  ✓ ${L('Cupertino Terminal açılıyor', 'Opening Cupertino Terminal')}`));
    console.log(chalk.gray(`  ${path.resolve(targetPath)}\n`));
  } catch (error) {
    console.log(chalk.red(`\n  ✗ ${L('Terminal açılamadı', 'Could not open terminal')}: ${error.message}\n`));
    process.exitCode = 1;
  }
}

function showZeroLink() {
  const app = cupertino.detectCupertino();
  console.log(chalk.hex(ICE).bold('\n  ZeroLink\n'));
  if (!app.installed) {
    console.log(chalk.gray('  ' + L('Önce Cupertino Terminal kurmalısın.', 'Install Cupertino Terminal first.') + '\n'));
    return;
  }
  console.log(chalk.gray('  ' + L(
    'Cupertino Terminal içinde Ctrl+L ile eşleştirme ekranını aç.',
    'Press Ctrl+L in Cupertino Terminal to open peer pairing.',
  )));
  console.log(chalk.gray('  ' + L(
    'Skuld yalnız açıkça seçilmiş bir ZeroLink oturumunu uzak hedef olarak gösterir; kendiliğinden uzak bağlantı kurmaz.',
    'Skuld only labels an explicitly selected ZeroLink session as remote; it never connects remotely by itself.',
  ) + '\n'));
}

function execCmd(cmd) {
  if (!cmd) {
    console.log(chalk.red('\n  ✗ ' + L('Komut gerekli', 'Command required') + '\n'));
    process.exitCode = 1;
    return;
  }
  console.log(chalk.hex(ICE)(`\n  $ ${cmd}\n`));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  try {
    const output = execSync(cmd, { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
    if (output) console.log(output);
    console.log(chalk.hex(ICE)(`\n  ✓ ${L('Komut başarıyla tamamlandı', 'Command completed successfully')} (${Buffer.byteLength(output || '', 'utf8')} bytes)\n`));
  } catch (error) {
    if (error.stdout) console.log(error.stdout.toString());
    if (error.stderr) console.log(chalk.red(error.stderr.toString()));
    console.log(chalk.red(`\n  ✗ ${L('Hata', 'Error')}: ${error.message}\n`));
    process.exitCode = 1;
  }
}

function connectSession(target, command) {
  if (!target) {
    console.log(chalk.red('\n  ✗ ' + L('Hedef gerekli (ör. local)', 'Target required (for example, local)') + '\n'));
    process.exitCode = 1;
    return;
  }
  const sessions = loadSessions();
  const existing = sessions.find((session) => session.target === target && session.status === 'active');
  if (existing) {
    console.log(chalk.yellow(`\n  ⚠ ${target}: ${L('zaten etkin oturum var', 'an active session already exists')} (${existing.id})\n`));
    return;
  }
  const session = {
    id: genId(), target, status: 'active', cmd: command || (process.platform === 'win32' ? 'powershell' : (process.env.SHELL || 'sh')),
    createdAt: new Date().toISOString(),
  };
  sessions.push(session);
  saveSessions(sessions);
  console.log(chalk.hex(ICE)(`\n  ✓ ${L('Oturum başlatıldı', 'Session started')}: ${session.id}\n`));
  console.log(`  ${L('Hedef', 'Target')}: ${target}`);
  console.log(`  Shell:  ${session.cmd}\n`);

  if (target === 'local' || target.startsWith('local')) {
    const child = spawn(session.cmd, [], { stdio: 'inherit', shell: true });
    child.on('exit', () => {
      session.status = 'closed';
      session.endedAt = new Date().toISOString();
      saveSessions(sessions);
      console.log(chalk.gray(`\n  ${L('Oturum sonlandı', 'Session ended')}: ${session.id}\n`));
    });
    return;
  }
  console.log(chalk.gray('  ' + L(
    'Uzak hedefler yalnız açıkça yapılandırılmış SSH/WinRM ya da Cupertino ZeroLink oturumlarıyla kullanılmalıdır.',
    'Remote targets require an explicitly configured SSH/WinRM or Cupertino ZeroLink session.',
  ) + '\n'));
}

function disconnectSession(id) {
  const sessions = loadSessions();
  const session = sessions.find((item) => item.id === id);
  if (!session) {
    console.log(chalk.red(`\n  ✗ ${L('Oturum bulunamadı', 'Session not found')}: ${id}\n`));
    process.exitCode = 1;
    return;
  }
  session.status = 'closed';
  session.endedAt = new Date().toISOString();
  saveSessions(sessions);
  console.log(chalk.gray(`\n  ■ ${L('Oturum sonlandı', 'Session ended')}: ${id} — ${session.target}\n`));
}

function listSessions() {
  const sessions = loadSessions().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  console.log(chalk.hex(ICE).bold('\n  Terminal Oturumları\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  if (!sessions.length) {
    console.log(chalk.gray('  ' + L('Oturum bulunamadı.', 'No sessions found.') + '\n'));
    return;
  }
  for (const session of sessions) {
    const icon = session.status === 'active' ? chalk.hex(ICE)('●') : chalk.gray('○');
    console.log(`  ${icon} ${chalk.white(session.target)} — ${session.cmd}`);
    console.log(chalk.gray(`     [${session.id}] ${session.createdAt.slice(0, 16)}`));
  }
  console.log('');
}

function showHelp() {
  console.log(chalk.hex(ICE).bold('\n  Cupertino Terminal × Skuld\n'));
  console.log(chalk.gray('  nskuld terminal <action> [params]\n'));
  console.log(chalk.cyan('    status') + chalk.gray('                  Cupertino ve çalışma hedefi durumu'));
  console.log(chalk.cyan('    open [path]') + chalk.gray('             Dizini Cupertino Terminal içinde aç'));
  console.log(chalk.cyan('    zerolink') + chalk.gray('                Güvenli eş bağlantısı bilgisi'));
  console.log(chalk.cyan('    exec <cmd>') + chalk.gray('              Bir shell komutu çalıştır'));
  console.log(chalk.cyan('    connect <target> [shell]') + chalk.gray('  Oturum başlat'));
  console.log(chalk.cyan('    disconnect <id>') + chalk.gray('         Oturumu kapat'));
  console.log(chalk.cyan('    list') + chalk.gray('                    Oturumları listele\n'));
}

module.exports = terminal;
