'use strict';
/**
 * Skuld görsel kimliği — gümüş.
 *
 * Tasarım kararı: tek vurgu rengi, geri kalanı gümüş rampası. Terminal
 * araçlarında "şık" görünmenin yolu renk sayısını artırmak değil azaltmaktır;
 * altı farklı parlak renk kullanan bir arayüz kalabalık görünür, iki tonlu bir
 * arayüz pahalı görünür.
 *
 * Gümüş, fırçalanmış metal gibi görünsün diye yatay bir gradyanla uygulanır.
 * Bu yalnızca truecolor'da mümkün; aşağıdaki her yardımcı dört seviyeye
 * düşer:
 *
 *   truecolor  → 24-bit gradyan
 *   256 renk   → gri rampa yaklaşımı (232-255)
 *   16 renk    → beyaz / açık gri / gri
 *   NO_COLOR   → hiç kaçış kodu yok, yalnızca metin
 *
 * Son seviye önemli: renk kapalıyken hizalama ve anlam kaybolmamalı. Bu yüzden
 * hiçbir bilgi YALNIZCA renkle taşınmaz; her durumun bir işareti de vardır.
 */

const { CAPS } = require('./tui');

// ── Palet ────────────────────────────────────────────────────────────────
// Soğuk gri rampa. Sayılar parlaklık: 100 en açık.
const GUMUS = {
  100: [241, 245, 249],
  200: [226, 232, 240],
  300: [203, 213, 225],
  400: [148, 163, 184],
  500: [100, 116, 139],
  600: [71, 85, 105],
  700: [51, 65, 85],
};

// Tek vurgu: soğuk buz mavisi. Yalnızca etkin/seçili durum için.
const VURGU = [125, 211, 252];

// Durum renkleri bilinçli olarak SOLGUN: gümüşün yanında doygun yeşil/kırmızı
// ucuz görünür.
const DURUM = {
  basari: [134, 239, 172],
  uyari: [252, 211, 77],
  hata: [253, 164, 175],
};

const renkVar = () => CAPS.color !== false;
const gercekRenk = () => CAPS.trueColor === true;

/** RGB → en yakın 256-renk gri (232..255) ya da renk küpü. */
function rgbTo256(r, g, b) {
  // Gri mi? (kanallar birbirine yakınsa gri rampası daha temiz görünür)
  if (Math.abs(r - g) < 12 && Math.abs(g - b) < 12) {
    const gri = Math.round(((r + g + b) / 3 - 8) / 247 * 24);
    return 232 + Math.max(0, Math.min(23, gri));
  }
  const k = (v) => Math.round((v / 255) * 5);
  return 16 + 36 * k(r) + 6 * k(g) + k(b);
}

/** Bir RGB'yi mevcut terminalin en iyi gösterimiyle uygular. */
function boya(rgb, metin) {
  if (!renkVar()) return metin;
  const [r, g, b] = rgb;
  if (gercekRenk()) return `[38;2;${r};${g};${b}m${metin}[39m`;
  if (CAPS.color) return `[38;5;${rgbTo256(r, g, b)}m${metin}[39m`;
  return metin;
}

const gumus = (ton, metin) => boya(GUMUS[ton] || GUMUS[300], metin);
const vurgu = (metin) => boya(VURGU, metin);
const basari = (metin) => boya(DURUM.basari, metin);
const uyari = (metin) => boya(DURUM.uyari, metin);
const hata = (metin) => boya(DURUM.hata, metin);
const kalin = (metin) => (renkVar() ? `[1m${metin}[22m` : metin);
const soluk = (metin) => (renkVar() ? `[2m${metin}[22m` : metin);

/**
 * Metne yatay gümüş gradyanı uygular — fırçalanmış metal etkisi.
 *
 * Renk yoksa metni olduğu gibi döndürür; kısaltmaz, hizalamayı bozmaz.
 */
function gradyan(metin, baslangic = 200, bitis = 500) {
  if (!renkVar() || metin.length === 0) return metin;
  const a = GUMUS[baslangic] || GUMUS[200];
  const b = GUMUS[bitis] || GUMUS[500];
  const gorunur = [...metin];
  let cikti = '';
  for (let i = 0; i < gorunur.length; i++) {
    const t = gorunur.length === 1 ? 0 : i / (gorunur.length - 1);
    const rgb = [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
    ];
    cikti += boya(rgb, gorunur[i]);
  }
  return cikti;
}

// ── Kelime işareti ───────────────────────────────────────────────────────
// İnce çizgi harfler. natureco-cli'nin kalın blok ASCII'sinden bilinçli
// olarak farklı: kalın bloklar "güçlü" değil "gürültülü" görünür.
const KELIME_ISARETI = [
  '┌─┐ ┬┌─ ┬ ┬ ┬   ┌┬┐',
  '└─┐ ├┴┐ │ │ │    ││',
  '└─┘ ┴ ┴ └─┘ ┴─┘ ─┴┘',
];

// Unicode yoksa kutu çizgileri kutu görünmez; düz ASCII'ye düş.
//
// String.raw kullanılıyor: bu harfler ters eğik çizgiyle dolu ve normal
// dizede her biri iki kez kaçırılmak zorunda. İlk sürüm tam bu yüzden fazladan
// bir `\` ile render oldu — kaçış sayısı gözle doğrulanabilir bir şey değil.
const KELIME_ISARETI_ASCII = String.raw`
 ___  _  ___   _   ___
/ __|| |/ / | | | |   \
\__ \|   <| |_| | | |) |
|___/|_|\_\\___/  |___/`
  .split('\n')
  .filter((s) => s.length > 0);

/**
 * Hero ekranı.
 *
 * @param {object} opt
 * @param {string} opt.surum
 * @param {string} [opt.altBaslik]
 * @param {boolean} [opt.kompakt] dar terminalde tek satıra düşer
 */
function hero({ surum, altBaslik = 'ne olacaksa, doğrulanmış olarak', kompakt = false } = {}) {
  const genislik = CAPS.width || 80;
  const satirlar = [];

  // Dar terminalde kelime işareti taşar; taşan bir logo şıklık değil hatadır.
  if (kompakt || genislik < 46) {
    satirlar.push('');
    satirlar.push(`  ${kalin(gradyan('SKULD', 100, 400))} ${soluk(gumus(600, surum))}`);
    satirlar.push(`  ${gumus(500, altBaslik)}`);
    satirlar.push('');
    return satirlar.join('\n');
  }

  const isaret = CAPS.unicode ? KELIME_ISARETI : KELIME_ISARETI_ASCII;
  satirlar.push('');
  for (let i = 0; i < isaret.length; i++) {
    // Satır satır hafifçe koyulaşan gradyan: üstten gelen ışık hissi.
    satirlar.push('  ' + gradyan(isaret[i], 100 + i * 100, 400 + i * 100));
  }
  satirlar.push('');
  satirlar.push(`  ${gumus(400, altBaslik)}  ${soluk(gumus(600, '·'))}  ${soluk(gumus(600, surum))}`);
  satirlar.push('');
  return satirlar.join('\n');
}

/** İnce yatay ayraç — gradyanlı. */
function ayrac(genislik) {
  const g = Math.max(8, Math.min(genislik || CAPS.width || 80, 100)) - 4;
  const cizgi = (CAPS.unicode ? '─' : '-').repeat(g);
  return '  ' + gradyan(cizgi, 600, 700);
}

/**
 * Durum satırı. Her durumun renkten BAĞIMSIZ bir işareti vardır:
 * renk kapalıyken de okunur.
 */
const ISARET = {
  ok: { u: '✓', a: '[ok]', renk: basari },
  uyari: { u: '!', a: '[!]', renk: uyari },
  hata: { u: '✗', a: '[x]', renk: hata },
  bilgi: { u: '·', a: '-', renk: (m) => gumus(500, m) },
  etkin: { u: '▸', a: '>', renk: vurgu },
};

function durum(tur, metin, not) {
  const i = ISARET[tur] || ISARET.bilgi;
  const im = CAPS.unicode ? i.u : i.a;
  const govde = `  ${i.renk(im)} ${gumus(200, metin)}`;
  return not ? `${govde}  ${soluk(gumus(600, not))}` : govde;
}

/** Anahtar/değer satırı — hizalı, gümüş tonlu. */
function alan(anahtar, deger, genislikAnahtar = 14) {
  return `  ${gumus(500, String(anahtar).padEnd(genislikAnahtar))} ${gumus(200, String(deger))}`;
}

module.exports = {
  GUMUS,
  VURGU,
  boya,
  gumus,
  vurgu,
  basari,
  uyari,
  hata,
  kalin,
  soluk,
  gradyan,
  hero,
  ayrac,
  durum,
  alan,
  KELIME_ISARETI,
};
