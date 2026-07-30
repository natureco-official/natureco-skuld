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

/**
 * Varsayılan render 256 renk.
 *
 * Terminal 24-bit destekliyor olsa bile 256-renk gri rampası KULLANILIR.
 * Sebep estetik: 24-bit gradyan her karakteri ayrı tonda boyuyor ve yakından
 * bakınca gürültülü görünüyor; 24 kademeli gri rampa daha düz, daha dövülmüş
 * bir metal hissi veriyor. Ayrıca çıktı çok daha kısa — her karakter için
 * `38;2;r;g;b` yerine `38;5;n`.
 *
 * 24-bit isteyen `SKULD_TRUECOLOR=1` ile açar.
 */
const gercekRenk = () => CAPS.trueColor === true && process.env.SKULD_TRUECOLOR === '1';

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
//
// Yarım blok karakterler: düz metinden belirgin biçimde iri, blok ASCII'den
// belirgin biçimde ince. natureco-skuld'nin altı satırlık gölgeli logosuyla
// karıştırılacak bir şey değil.
//
// Harfler ayrı ayrı tanımlanıp birleştirme kodla yapılıyor. Tek satır olarak
// elle yazıldığında bir harfin bir karakter kayması gözle fark edilmiyor;
// böyle hizalama bir iddia değil, üretim biçiminin sonucu.
const HARFLER = {
  S: ['█▀▀', '▀▀█', '▀▀▀'],
  K: ['█▄▀', '█▀▄', '▀ ▀'],
  U: ['█ █', '█ █', '▀▀▀'],
  L: ['█  ', '█  ', '▀▀▀'],
  D: ['█▀▄', '█ █', '▀▀ '],
};

function kelimeIsaretiUret(kelime = 'SKULD', bosluk = 2) {
  const satirlar = ['', '', ''];
  const harfler = [...kelime];
  harfler.forEach((h, i) => {
    const g = HARFLER[h];
    if (!g) return;
    for (let r = 0; r < 3; r++) {
      satirlar[r] += g[r] + (i < harfler.length - 1 ? ' '.repeat(bosluk) : '');
    }
  });
  return satirlar;
}

const KELIME_ISARETI = kelimeIsaretiUret();

// Unicode yoksa yarım bloklar kutuya döner; düz ASCII'ye düş.
//
// Buradaki harfler de tek tek tanımlanıyor. Çok satırlı bir şablon olarak
// yazıldığında ters eğik çizgilerin kaçışı iki kez bozuldu ve dosya
// derlenmez hâle geldi; kaçış sayısı gözle doğrulanabilecek bir şey değil.
const HARFLER_ASCII = {
  S: [' __', '(__', '__)'],
  K: ['| /', '|< ', '| \\'],
  U: ['| |', '| |', '|_|'],
  L: ['|  ', '|  ', '|__'],
  D: [' _ ', '| |', '|_/'],
};

function kelimeIsaretiAsciiUret(kelime = 'SKULD', bosluk = 2) {
  const satirlar = ['', '', ''];
  const harfler = [...kelime];
  harfler.forEach((h, i) => {
    const g = HARFLER_ASCII[h];
    if (!g) return;
    for (let r = 0; r < 3; r++) {
      satirlar[r] += g[r] + (i < harfler.length - 1 ? ' '.repeat(bosluk) : '');
    }
  });
  return satirlar;
}

const KELIME_ISARETI_ASCII = kelimeIsaretiAsciiUret();

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

  // Kompakt VARSAYILAN. Üç satırlık çizgi logo etkileyici ama her komutta
  // görülecek bir şey için fazla yer kaplıyor. Harfler aralıklı: "S K U L D"
  // sıkışık hâlinden daha sakin okunuyor ve gradyanın yayılacağı yer açılıyor.
  // Üç satırlık hâl `kompakt: false` ile istenir.
  if (kompakt || genislik < 30) {
    satirlar.push('');
    satirlar.push(
      `  ${kalin(gradyan('S K U L D', 100, 400))}${surum ? '   ' + soluk(gumus(600, surum)) : ''}`,
    );
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
  // Sürüm boşsa ayraç da basılmaz: sarkan bir "·" özensiz görünür.
  const kuyruk = surum ? `  ${soluk(gumus(600, '·'))}  ${soluk(gumus(600, surum))}` : '';
  satirlar.push(`  ${gumus(400, altBaslik)}${kuyruk}`);
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

// ── Ekranlar ─────────────────────────────────────────────────────────────

/**
 * Açılış animasyonu: kelime işaretinin üzerinden geçen gümüş parıltı.
 *
 * Kurallar:
 *  - Yalnızca TTY'de ve renk varken oynar. Boru içinde ya da NO_COLOR ile
 *    tek kare basar ve çıkar; animasyon kaçış kodları log dosyasına düşmez.
 *  - İmleç gizlenir ve HER durumda geri açılır (Ctrl+C dahil). Gizli imleç
 *    bırakan bir animasyon, kullanıcının terminalini bozar.
 *  - Toplam süre kısa: açılış ekranı gösteri değil, karşılama.
 */
async function acilis({ surum, sure = 900 } = {}) {
  const canli = CAPS.isTTY && renkVar() && !process.env.CI;
  if (!canli) {
    process.stdout.write(hero({ surum }) + '\n');
    return;
  }

  const isaret = CAPS.unicode ? KELIME_ISARETI : KELIME_ISARETI_ASCII;
  const kare = 12;
  const bekle = Math.max(20, Math.floor(sure / kare));
  let imlecGizli = false;

  const imleciAc = () => {
    if (imlecGizli) {
      process.stdout.write('\x1b[?25h');
      imlecGizli = false;
    }
  };
  // Ctrl+C animasyonun ortasında gelirse imleç gizli kalmasın.
  process.once('SIGINT', () => {
    imleciAc();
    process.exit(130);
  });

  try {
    process.stdout.write('\x1b[?25l');
    imlecGizli = true;
    process.stdout.write('\n');

    for (let k = 0; k <= kare; k++) {
      const t = k / kare;
      const satirlar = isaret.map((satir, i) => {
        const gorunur = [...satir];
        let cikti = '';
        for (let x = 0; x < gorunur.length; x++) {
          const yer = gorunur.length === 1 ? 0 : x / (gorunur.length - 1);
          // Parıltı: t konumunun etrafındaki dar bant parlar.
          const uzaklik = Math.abs(yer - t);
          const parla = Math.max(0, 1 - uzaklik * 6);
          const taban = 250 + i * 90;
          const ton = Math.round(taban - parla * 150);
          const en = ton <= 150 ? 100 : ton <= 250 ? 200 : ton <= 350 ? 300 : ton <= 450 ? 400 : 500;
          cikti += gumus(en, gorunur[x]);
        }
        return '  ' + cikti;
      });
      if (k > 0) process.stdout.write(`\x1b[${isaret.length}A`);
      process.stdout.write(satirlar.join('\n') + '\n');
      await new Promise((r) => setTimeout(r, bekle));
    }

    process.stdout.write('\n  ' + gumus(400, 'ne olacaksa, doğrulanmış olarak'));
    process.stdout.write('  ' + soluk(gumus(600, '·')) + '  ' + soluk(gumus(600, surum)) + '\n\n');
  } finally {
    imleciAc();
  }
}

/**
 * Ana ekran. Kutu çizmiyor: ağır çerçeve yerine hizalama ve boşluk.
 *
 * @param {object} opt
 * @param {string} opt.surum
 * @param {string} opt.proje
 * @param {Array<{tur:string, ad:string, not?:string}>} opt.bilesenler
 * @param {string} [opt.ipucu]
 */
function anaEkran({ surum, proje, bilesenler = [], ipucu } = {}) {
  const s = [];
  s.push('');
  s.push(`  ${kalin(gradyan('SKULD', 100, 400))}  ${soluk(gumus(600, surum))}`);
  s.push(`  ${gumus(500, proje)}`);
  s.push('');
  if (bilesenler.length) {
    for (const b of bilesenler) s.push(durum(b.tur, b.ad, b.not));
    s.push('');
  }
  if (ipucu) {
    s.push(`  ${soluk(gumus(600, ipucu))}`);
    s.push('');
  }
  return s.join('\n');
}

module.exports.acilis = acilis;
module.exports.anaEkran = anaEkran;

// ── Deneysel yüzey ───────────────────────────────────────────────────────
//
// Buradaki dört şey terminal araçlarında nadir: kabartma, akan yüzey,
// braille mikro-grafik ve yükseltilmiş seçim. Hepsi aynı fikre hizmet
// ediyor — arayüz bir metin listesi değil, ışık alan bir YÜZEY gibi
// davransın. Kutu çizmek yerine derinlik ima etmek.
//
// Hepsi renk yoksa düz metne düşer; hiçbiri bilgi taşımak için renge
// güvenmez.

/**
 * Kabartma: harflerin üst kenarı açık, alt kenarı koyu.
 *
 * Yarım blok karakterlerde `▀` üst yarımı, `▄` alt yarımı doldurur. Üsttekini
 * parlak, alttakini koyu tonlamak metale BASILMIŞ izlenimi verir; tek tonla
 * çizilen aynı harfler düz bir çıkartma gibi durur.
 */
function kabartma(satirlar, ust = 100, govde = 300, alt = 600) {
  if (!renkVar()) return satirlar.join('\n');
  return satirlar
    .map((satir) =>
      [...satir]
        .map((k) => {
          if (k === '▀') return gumus(ust, k);
          if (k === '▄') return gumus(alt, k);
          if (k === '█') return gumus(govde, k);
          return gumus(alt, k);
        })
        .join(''),
    )
    .join('\n');
}

/**
 * Akan yüzey: gradyanın tepe noktası `faz` ile kayar.
 *
 * Spinner "bekliyorum" der; akan yüzey "çalışıyorum" der. Fark, ilkinin
 * dikkat çekmesi ikincisinin ARKA PLANDA kalmasıdır — ajan uzun sürerken
 * dönen bir çark yorucu, akan bir parıltı değil.
 */
function akanSatir(metin, faz) {
  if (!renkVar() || !metin) return metin;
  const g = [...metin];
  let cikti = '';
  for (let i = 0; i < g.length; i++) {
    const yer = g.length === 1 ? 0 : i / (g.length - 1);
    const uzaklik = Math.abs(((yer - faz + 1.5) % 1) - 0.5);
    const parlaklik = Math.max(0, 1 - uzaklik * 4);
    const ton = parlaklik > 0.66 ? 100 : parlaklik > 0.33 ? 300 : 600;
    cikti += gumus(ton, g[i]);
  }
  return cikti;
}

/**
 * Braille mikro-grafik: sekiz seviye, tek satır, sayı kadar yer kaplar.
 *
 * Terminalde grafik göstermenin en az yer kaplayan yolu. Token kullanımı ya
 * da tur süreleri gibi bir dizi, cümleye gömülebilecek boyutta görünür.
 */
const BRAILLE = ['⣀', '⣄', '⣆', '⣇', '⣧', '⣷', '⣿', '⣿'];

function grafik(degerler, ton = 300) {
  if (!Array.isArray(degerler) || degerler.length === 0) return '';
  if (!CAPS.unicode) {
    // Unicode yoksa SERİNİN KENDİSİ verilir.
    //
    // Eski hâli yalnızca en yüksek değeri döndürüyordu ve yorumunda "bilgi
    // kaybolmasın" yazıyordu — oysa [1,9,2] ile [2,9,1] aynı çıktıyı
    // veriyordu, yani şeklin tamamı kayboluyordu. Yorumun iddiası koda
    // uymuyordu (Codex denetimi, 29.07.2026).
    return `[${degerler.join(' ')}]`;
  }
  const enb = Math.max(...degerler, 1);
  const s = degerler
    .map((d) => BRAILLE[Math.min(7, Math.floor((d / enb) * 7))])
    .join('');
  return gumus(ton, s);
}

/**
 * Yükseltilmiş seçim: seçili satır parlar ve ALTINA ince bir gölge düşer.
 *
 * Kutu çizmeden "bu öğe önde" demenin yolu. `>` işareti hâlâ var çünkü renk
 * kapalıyken gölge de kaybolur ve seçim yalnızca renge bırakılamaz.
 */
function secimListesi(ogeler, secili = 0) {
  const s = [];
  ogeler.forEach((o, i) => {
    const etiket = typeof o === 'string' ? o : o.etiket;
    const not = typeof o === 'string' ? '' : o.not || '';
    if (i === secili) {
      const im = CAPS.unicode ? '▸' : '>';
      s.push(`  ${vurgu(im)} ${kalin(gumus(100, etiket))}${not ? '  ' + gumus(400, not) : ''}`);
      // Gölge: seçili satırın altına, etiket genişliğince koyu bir çizgi.
      if (renkVar() && CAPS.unicode) {
        s.push(`    ${gumus(700, '▔'.repeat(Math.min(etiket.length + (not ? not.length + 2 : 0), 60)))}`);
      }
    } else {
      s.push(`    ${gumus(500, etiket)}${not ? '  ' + soluk(gumus(600, not)) : ''}`);
    }
  });
  return s.join('\n');
}

module.exports.kabartma = kabartma;
module.exports.akanSatir = akanSatir;
module.exports.grafik = grafik;
module.exports.secimListesi = secimListesi;
