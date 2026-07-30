/**
 * nskuld help — Skuld'un kendi yardım ekranı.
 *
 * Bu dosya SIFIRDAN yazıldı. Devralınan hâli natureco-cli'nin ekranıydı:
 * komut adı olarak `natureco` yazıyor, "NatureCo Native" gibi bölümleri var,
 * ve **var olmayan 13 komut tanıtıyordu** — `telegram`, `whatsapp`, `discord`,
 * `slack`, `signal`, `irc`, `mattermost`, `imessage`, `sms`, `naturehub`,
 * `medium`, `seo`, `xp`. Hepsi komut kırpmada silinmişti; yardım ekranı
 * güncellenmemişti.
 *
 * Yani kullanıcı `nskuld help` yazdığında başka bir ürünün menüsünü, üstelik
 * çalışmayan komutlarla görüyordu.
 *
 * ── Tasarım ───────────────────────────────────────────────────────────────
 *
 * Görünüm Skuld'un: gümüş gradyan, yarım blok kelime işareti, kutu yok.
 * natureco-cli emoji başlıklı çerçeveli tablolar kullanıyor; burada kasten
 * öyle yapılmıyor — ayrım görünür olmalı.
 *
 * Bölümler ürünün ne OLDUĞUNA göre sıralı, alfabetik değil: kodlama döngüsü
 * önce, çevresindekiler sonra. Bir kodlama ajanının yardım ekranında ilk
 * görünen şey kodlama olmalı.
 *
 * `scripts/yardim-tutarlilik.mjs` bu dosyadaki her komutun gerçekten kayıtlı
 * olduğunu doğruluyor — hayalet komut bir daha sessizce birikemez.
 */

const tema = require('../utils/skuld-theme');
const { getConfig } = require('../utils/config');
const { getLang } = require('../utils/i18n');

const L = (tr, en) => (getLang() === 'en' ? en : tr);

function providerHostname(providerUrl) {
  if (!providerUrl) return '';
  try {
    return new URL(providerUrl).hostname;
  } catch {
    return String(providerUrl).replace(/^https?:\/\//i, '').split('/')[0];
  }
}

/**
 * Bölümler. Her `k` (komut) alanı `bin/nskuld.js` içinde KAYITLI olmalı;
 * tutarlılık kontrolü bunu zorluyor.
 */
function bolumler() {
  return [
    {
      baslik: L('Kodlama', 'Coding'),
      satirlar: [
        ['', L('(argümansız) kodlama ekranını aç', '(no arguments) open the coding screen')],
        ['code', L('Kodlama ajanı — oku, yaz, çalıştır, doğrula', 'Coding agent — read, write, run, verify')],
        ['code -p "<görev>"', L('Tek seferlik, etkileşimsiz (CI için)', 'One-shot, non-interactive (for CI)')],
        ['ask "<soru>"', L('Tek soru, araç yok', 'One question, no tools')],
        ['run <betik.md>', L('Markdown betiği çalıştır', 'Run a Markdown script')],
        ['repl', L('Etkileşimli REPL', 'Interactive REPL')],
        ['git', L('Git işlemleri (kapıdan geçer)', 'Git operations (through the gate)')],
      ],
    },
    {
      baslik: L('Ajan ve görev', 'Agents and tasks'),
      satirlar: [
        ['agent', L('Tek seferlik ajan (run|abort|tail|logs)', 'One-shot agent (run|abort|tail|logs)')],
        ['agents', L('Ajan yönetimi', 'Agent management')],
        ['tasks', L('Görev listesi', 'Task list')],
        ['team', L('Çok ajanlı çalışma', 'Multi-agent work')],
        ['approvals', L('Onay kayıtları ve beyaz liste', 'Approval records and allowlist')],
      ],
    },
    {
      baslik: L('Güvenlik', 'Security'),
      satirlar: [
        ['policy', L('Çalıştırma politikası', 'Execution policy')],
        ['exec-policy', L('Komut izinleri', 'Command permissions')],
        ['sandbox', L('Yalıtılmış çalışma alanı', 'Isolated workspace')],
        ['secrets', L('Sır yönetimi', 'Secret management')],
        ['security', L('Güvenlik denetimi', 'Security audit')],
        ['audit', L('Denetim günlüğü', 'Audit log')],
        ['dna', L('CodeDNA kalite kapısı', 'CodeDNA quality gate')],
      ],
    },
    {
      baslik: L('Hafıza ve oturum', 'Memory and sessions'),
      satirlar: [
        ['memory', L('Urðr hafızası', 'Urðr memory')],
        ['sessions', L('Oturum yönetimi', 'Session management')],
        ['transcripts', L('Konuşma kayıtları', 'Transcripts')],
      ],
    },
    {
      baslik: L('Kurulum ve teşhis', 'Setup and diagnostics'),
      satirlar: [
        ['setup', L('İlk kurulum', 'First-run setup')],
        ['onboard', L('Adım adım kurulum', 'Step-by-step onboarding')],
        ['config', L('Yapılandırma', 'Configuration')],
        ['doctor', L('Sistem sağlığı', 'System health')],
        ['status', L('Durum özeti', 'Status summary')],
        ['models', L('Model listesi ve seçimi', 'Model list and selection')],
        ['cost', L('Maliyet takibi', 'Cost tracking')],
        ['login', L('API anahtarı ile giriş', 'Sign in with an API key')],
      ],
    },
    {
      baslik: L('Genişletme', 'Extending'),
      satirlar: [
        ['mcp', L('MCP sunucuları', 'MCP servers')],
        ['skills', L('Skill yönetimi', 'Skill management')],
        ['plugins', L('Plugin yönetimi', 'Plugin management')],
        ['tools', L('Yüklü araçlar', 'Loaded tools')],
        ['hooks', L('Kanca yönetimi', 'Hook management')],
      ],
    },
    {
      baslik: L('Otomasyon ve gözlem', 'Automation and observability'),
      satirlar: [
        ['cron', L('Zamanlanmış görevler', 'Scheduled jobs')],
        ['webhooks', L('Webhook yönetimi', 'Webhook management')],
        ['daemon', L('Arka plan süreci', 'Background daemon')],
        ['dashboard', L('Web kontrol paneli', 'Web dashboard')],
        ['workboard', L('İş panosu', 'Work board')],
        ['logs', L('Günlükler', 'Logs')],
      ],
    },
    {
      baslik: L('Ağ ve içerik', 'Network and content'),
      satirlar: [
        ['web-fetch', L('URL getir (onay ister)', 'Fetch a URL (asks for approval)')],
        ['browser', L('Tarayıcı denetimi', 'Browser control')],
      ],
    },
  ];
}

function help() {
  const config = getConfig() || {};
  const surum = require('../../package.json').version;
  const genislik = 74;

  const s = [];
  s.push('');
  // Kelime işareti + sürüm. Kutu YOK: natureco-cli çerçeveli tablo kullanıyor,
  // ayrım ilk bakışta görünmeli.
  // `KELIME_ISARETI` bir DİZİ (satır başına bir eleman), dize değil.
  for (const satir of tema.KELIME_ISARETI) {
    s.push('  ' + tema.gradyan(satir, 200, 500));
  }
  s.push('');
  s.push('  ' + tema.soluk(tema.gumus(500, L(
    `v${surum} · terminal kodlama ajanı · kanıtsız "bitti" demez`,
    `v${surum} · terminal coding agent · never claims done without evidence`,
  ))));

  const saglayici = providerHostname(config.providerUrl);
  if (saglayici) {
    s.push('  ' + tema.soluk(tema.gumus(600,
      `${saglayici}${config.providerModel ? ` · ${config.providerModel}` : ''}`)));
  } else {
    s.push('  ' + tema.uyari(L('sağlayıcı ayarlı değil — `nskuld setup`', 'no provider configured — `nskuld setup`')));
  }
  s.push('');

  for (const bolum of bolumler()) {
    s.push('  ' + tema.kalin(tema.vurgu(bolum.baslik)));
    for (const [komut, aciklama] of bolum.satirlar) {
      const sol = `nskuld ${komut}`;
      s.push('    ' + tema.gumus(200, sol.padEnd(26)) + tema.soluk(tema.gumus(500, aciklama)));
    }
    s.push('');
  }

  s.push('  ' + tema.ayrac(genislik));
  s.push('  ' + tema.soluk(tema.gumus(600, L(
    'Tüm komutlar: nskuld --help   ·   Bir komutun ayrıntısı: nskuld <komut> --help',
    'All commands: nskuld --help   ·   Details for one: nskuld <command> --help',
  ))));
  s.push('  ' + tema.soluk(tema.gumus(600, 'github.com/natureco-official/natureco-skuld')));
  s.push('');

  console.log(s.join('\n'));
}

module.exports = help;
module.exports.providerHostname = providerHostname;
module.exports._bolumler = bolumler;
