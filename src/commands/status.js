const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const F = require('../utils/format');
const tui = require('../utils/tui');
const fs = require('fs');
const path = require('path');
const os = require('os');

function tryRequire(mod) {
  try { return require(mod); }
  catch { return null; }
}

function status(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'run') return cmdRun();
  if (action === 'simple') return cmdSimple();
  if (action === 'usage') return cmdUsage();

  F.error(`Unknown status action: ${action}`);
  F.meta('Usage: nskuld status <action>');
  F.meta('Actions: run, simple, usage');
  process.exit(1);
}

async function cmdRun() {
  let version = '—';
  try { version = require('../../package.json').version; } catch {}

  const config = tryRequire('../utils/config');
  const cfg = config ? config.getConfig() : {};

  // ── Yüzey dili ───────────────────────────────────────────────────────
  //
  // Devralınan hâli 56 karakter genişliğinde bir kutu ve her satırda
  // `.padEnd(36)`. İki sorun: sağlayıcı URL'si 36'yı geçtiğinde kutunun sağ
  // kenarı dışa taşıyor (sabit genişlikle çizilen kutular böyle sessizce
  // bozulur), ve `Gateway` satırı ARKA PLAN rengiyle bir etiket basıyordu —
  // ANSI'nin en ucuz görünen numarası.
  //
  // Yerine sırt + taban ızgarası. Genişlik yok, o yüzden bozulacak kenar da
  // yok. Renk yalnızca durum taşıyor.
  const y = require('../utils/yuzey');

  const pidFile = path.join(os.homedir(), '.nskuld', 'gateway.pid');
  const gatewayRunning = fs.existsSync(pidFile);

  const nodesFile = path.join(os.homedir(), '.nskuld', 'nodes.json');
  let nodeCount = 0;
  if (fs.existsSync(nodesFile)) {
    try { nodeCount = Object.keys(JSON.parse(fs.readFileSync(nodesFile, 'utf8'))).length; } catch { /* bozuk dosya = 0 */ }
  }

  let skillInfo = '—';
  let skillSayi = 0;
  try {
    const { getSkills } = tryRequire('../utils/skills') || {};
    if (getSkills) {
      const all = getSkills();
      skillSayi = all.length;
      const builtin = all.filter((sk) => sk.source === 'builtin').length;
      const user = all.length - builtin;
      skillInfo = `${all.length} (${builtin} ${L('yerleşik', 'built-in')}`
        + (user > 0 ? ` + ${user} ${L('kullanıcı', 'user')}` : '') + ')';
    }
  } catch { /* skill okunamazsa tire */ }

  let toolCount = '—';
  try {
    const { loadToolManifest } = require('../utils/tool-manifest');
    toolCount = String(loadToolManifest().size);
  } catch { /* manifest yoksa tire */ }

  const { describeEngine } = require('../utils/urdr-engine');
  const memoryEngine = await describeEngine();

  let host = cfg.providerUrl || '—';
  try { if (cfg.providerUrl) host = new URL(cfg.providerUrl).hostname; } catch { /* ham değer */ }

  const bolumler = [
    {
      satirlar: y.izgara([
        ['sürüm', `v${version}`],
        ['platform', `${process.platform} ${os.release()}`],
      ]),
    },
    {
      etiket: L('sağlayıcı', 'provider'),
      satirlar: y.izgara([
        ['adres', host, cfg.providerUrl ? 'ok' : 'uyari'],
        ['model', cfg.providerModel || '—', cfg.providerModel ? 'ok' : 'uyari'],
        ['hafıza motoru', memoryEngine.engine, 'ok'],
      ].concat(cfg.botName ? [['ajan', cfg.botName]] : [])),
    },
    {
      etiket: L('yüzey', 'surface'),
      satirlar: y.izgara([
        ['araç', String(toolCount)],
        ['skill', skillInfo],
        ['düğüm', String(nodeCount)],
        [
          'gateway',
          gatewayRunning ? L('çalışıyor', 'running') : L('durmuş', 'stopped'),
          gatewayRunning ? 'ok' : undefined,
        ],
      ]),
    },
  ];

  await y.yuzey({
    baslik: L('sistem durumu', 'system status'),
    altBaslik: memoryEngine.reason,
    bolumler,
  });

}

function cmdSimple() {
  let version = '—';
  try { version = require('../../package.json').version; } catch {}

  const config = tryRequire('../utils/config');
  const cfg = config ? config.getConfig() : {};
  const pidFile = path.join(os.homedir(), '.nskuld', 'gateway.pid');
  const gatewayRunning = fs.existsSync(pidFile);

  F.dot(gatewayRunning, 'Gateway');

  const parts = [chalk.gray(`v${version}`)];
  if (cfg.providerUrl) {
    const host = cfg.providerUrl.replace('https://', '').split('/')[0];
    parts.push(chalk.white(host));
  }

  console.log(chalk.cyan.bold('  NatureCo ') + parts.join(chalk.gray(' · ')));
}

function cmdUsage() {
  const config = tryRequire('../utils/config');
  const cfg = config ? config.getConfig() : {};

  if (!cfg.providerUrl) {
    console.log('\n' + tui.C.muted(L('  Provider tanımlı değil.', '  Provider not set.')));
    return;
  }

  const usage = cfg.usage || {};
  const rows = [
    { key: 'provider', label: 'Provider', value: cfg.providerUrl },
    { key: 'model', label: 'Model', value: cfg.providerModel || '—' },
    { key: 'tokens', label: 'Tokens', value: String(usage.totalTokens || '—') },
    { key: 'requests', label: 'Requests', value: String(usage.totalRequests || '—') },
    { key: 'session', label: 'Session', value: String(usage.sessionTokens || '—') },
  ];

  console.log('\n' + tui.styled(L('  📊 Provider Kullanımı', '  📊 Provider Usage'), { color: tui.PALETTE.primary, bold: true }));
  console.log('\n' + tui.table(rows, [
    { key: 'key', label: L('Anahtar', 'Key'), minWidth: 12, render: r => tui.C.muted(r.key) },
    { key: 'value', label: L('Değer', 'Value'), minWidth: 30, render: r => tui.C.text(r.value) },
  ], { borderStyle: 'round', zebra: true }));
  console.log('');
}

module.exports = status;
