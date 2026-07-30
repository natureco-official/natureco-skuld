/**
 * Skuld — marka ve ekranlar.
 *
 * Fork edilen natureco-skuld'de bu dosya NatureCo kimliğini taşıyordu: yeşil
 * palet, yaprak emojisi, tavşan maskotu, kalın blok ASCII logo ve NatureCo
 * ürünlerine (seo, naturehub, cron) yönlendiren ipuçları. Skuld ayrı bir
 * ürün, o yüzden içerik baştan yazıldı.
 *
 * İki şey bilinçli olarak KORUNDU:
 *
 *  1. Dışa aktarım şekli (`COLORS`, `pickDailyTip`, `banner`,
 *     `firstRunScreen`, `gatewayScreen`…). Çağıranlar bu adlara bağlı;
 *     yeniden adlandırmak görsel bir işi gereksizce kırıcı bir işe çevirirdi.
 *  2. chalk kullanımı. `COLORS.primary.bold(...)` gibi zincirler var; düz
 *     fonksiyona çevirmek onları sessizce bozardı.
 *
 * Renk DEĞERLERİ `skuld-theme`'den geliyor — iki ayrı palet tutmak, birinde
 * yapılan değişikliğin diğerinde unutulması demektir.
 */

const chalk = require('chalk');
const tema = require('./skuld-theme');

/** Paletteki RGB'yi chalk'ın anlayacağı hex'e çevirir. */
const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');

const COLORS = {
  primary: chalk.hex(hex(tema.GUMUS[200])), // ana metin — gümüş
  secondary: chalk.hex(hex(tema.VURGU)), // tek vurgu — buz mavisi
  accent: chalk.hex(hex(tema.GUMUS[100])), // en parlak — başlık
  muted: chalk.hex(hex(tema.GUMUS[600])),
  danger: chalk.hex('#fda4af'),
  success: chalk.hex('#7dd3fc'),
  bold: chalk.bold,
  // `cyan` upstream'de KULLANILIYOR ama TANIMLI DEĞİLDİ: gatewayScreen
  // çağrıldığı anda "COLORS.cyan is not a function" ile çöküyordu. Hiçbir
  // yerden çağrılmadığı için fark edilmemiş. Tanımlanıyor.
  cyan: chalk.hex(hex(tema.VURGU)),
};

const SMALL_LOGO = ['  SKULD'];
const FULL_LOGO = tema.KELIME_ISARETI;

/**
 * İpuçları yalnızca GERÇEKTEN VAR OLAN komutları gösterir.
 *
 * Fork'tan gelen liste NatureCo'nun seo/naturehub/cron yüzeylerini
 * öneriyordu. Skuld coding-first; kapsam dışı bir komutu ipucu diye
 * göstermek kullanıcıyı çalışmayan bir yola sokar.
 */
const TIPS = [
  'nskuld code "<görev>"    →  bir kodlama görevini uçtan uca çalıştır',
  'nskuld doctor            →  ortamı ve bağlı bileşenleri kontrol et',
  'SKULD_KORUMALI=src/core  →  bu yollara yazılırsa çalışma politikayla durur',
  'nskuld --help            →  tüm komutlar ve çıkış kodları',
];

function pickDailyTip() {
  const gun = Math.floor(Date.now() / 86400000);
  return TIPS[gun % TIPS.length];
}

/** Kompakt başlık — komut çıktılarının üstünde. */
function banner(opts = {}) {
  const { version, subtitle } = opts;
  const s = [''];
  const surum = version ? `  ${tema.soluk(tema.gumus(600, `v${String(version).replace(/^v/, '')}`))}` : '';
  s.push('  ' + tema.kalin(tema.gradyan('SKULD', 100, 400)) + surum);
  if (subtitle) s.push('  ' + tema.gumus(500, subtitle));
  s.push('');
  return s.join('\n');
}

/** Tam logo ekranı. */
function fullLogo(opts = {}) {
  const v = opts.version ? `v${String(opts.version).replace(/^v/, '')}` : '';
  return tema.hero({ surum: v });
}

/**
 * İlk çalıştırma ekranı — setup sihirbazı çalışmadan HEMEN önce gösterilir.
 *
 * Kelime işaretini BASMAZ. Sihirbaz kendi başlığını basıyor ve ikisi arka
 * arkaya çalıştığında logo iki kez çıkıyordu. TTY'de `console.clear()` bunu
 * gizliyordu ama boruya ya da log dosyasına iki kez düşüyordu — gizlenen bir
 * kusur, düzeltilmiş kusur değildir.
 */
function firstRunScreen() {
  // Tek satır. Sihirbaz zaten "Sağlayıcı seçin ve anahtarınızı girin" diyor;
  // aynı şeyi iki kez söylemek ekranı kalabalıklaştırır.
  const s = [''];
  s.push(
    '  ' +
      tema.gumus(500, 'İlk kurulum — yerel model seçerseniz ') +
      tema.gumus(200, 'hiçbir şey makineden çıkmaz') +
      tema.gumus(500, '.'),
  );
  s.push('');
  return s.join('\n');
}

/** Gateway/servis ekranı. */
function gatewayScreen(opts = {}) {
  const s = [banner({ version: opts.version, subtitle: 'gateway' })];
  if (opts.url) s.push(tema.alan('adres', opts.url));
  if (opts.port) s.push(tema.alan('port', opts.port));
  s.push('');
  s.push('  ' + tema.soluk(tema.gumus(600, pickDailyTip())));
  s.push('');
  return s.join('\n');
}

module.exports = {
  COLORS,
  SMALL_LOGO,
  FULL_LOGO,
  TIPS,
  pickDailyTip,
  banner,
  fullLogo,
  gatewayScreen,
  firstRunScreen,
};
