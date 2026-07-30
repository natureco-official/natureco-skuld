'use strict';
/**
 * GEZGİN — düz liste değil, gezinilebilir yüzey.
 *
 * Kullanıcı: *"help komutunun görünüşü de hâlâ eski, ben düz listeler
 * sevmiyorum."*
 *
 * Haklı: nokta doldurma bir listeyi güzelleştirir ama liste olmaktan
 * çıkarmaz. 73 komutu dikey olarak dökmek, kullanıcıya "sen ara" demektir.
 *
 * ── Fikir ─────────────────────────────────────────────────────────────────
 *
 * Yardım bir SAYFA değil, bir YÜZEY olsun: solda alanlar, sağda o alanın
 * içeriği. Ok tuşlarıyla alanlar arasında geçiliyor, yazmaya başlayınca
 * doğrudan süzülüyor. Ekran kaymıyor — aynı çerçeve içinde içerik değişiyor,
 * yani göz yerini kaybetmiyor.
 *
 * Bir terminalde bunu yapan şey yok; olan şey `less` ve o da kaydırıyor.
 * Kaydırma, ekranın bir pencere olduğunu hatırlatır. Yerinde değişen içerik
 * hatırlatmaz.
 *
 * ── Düşerek bozulma ───────────────────────────────────────────────────────
 *
 * TTY yoksa (boru, CI, `nskuld help | grep`) gezinme YOK: tüm alanlar tek
 * seferde, iki kolonlu bir harita olarak basılıyor. `grep`lenebilirlik
 * kaybedilemez — bir yardım ekranının en çok kullanılan hâli budur.
 *
 * Etkileşimli hâli de tek kolona düşüyor: 80 kolondan dar terminalde iki
 * kolon yan yana durmaz.
 */

const tema = require('./skuld-theme');
const yuzeyM = require('./yuzey');
const { CAPS } = require('./tui');

const ESC = '\x1b';
const gizleImlec = () => process.stdout.write(`${ESC}[?25l`);
const gosterImlec = () => process.stdout.write(`${ESC}[?25h`);
const temizle = () => process.stdout.write(`${ESC}[2J${ESC}[H`);

const genislik = () => Math.max(60, Math.min(process.stdout.columns || 100, 120));
const ciftKolon = () => genislik() >= 92;

/**
 * Etkileşimsiz harita: bütün alanlar, iki kolon.
 *
 * Liste yerine harita: alanlar yan yana durduğunda göz bütünü bir kerede
 * görüyor, yukarıdan aşağıya taramıyor.
 */
function harita(alanlar) {
  const s = [];
  const kolonlu = ciftKolon();
  const kolonGen = kolonlu ? Math.floor((genislik() - 8) / 2) : genislik() - 6;

  const bloklar = alanlar.map((alan) => {
    const b = [yuzeyM.etiket(alan.ad)];
    const enUzun = Math.max(...alan.ogeler.map(([k]) => k.length));
    for (const [komut, aciklama] of alan.ogeler) {
      const sol = tema.gumus(200, komut.padEnd(enUzun + 2));
      const kalan = kolonGen - enUzun - 2;
      const kisa = aciklama.length > kalan ? `${aciklama.slice(0, Math.max(0, kalan - 1))}…` : aciklama;
      b.push(sol + tema.gumus(600, kisa));
    }
    return b;
  });

  // Sırt EKLENMİYOR: `yuzey()` her satırı zaten sırta bağlıyor. İkisi birden
  // yapıldığında `│  │` görünüyordu — aynı süslemeyi iki katmanda uygulamanın
  // klasik sonucu.
  if (!kolonlu) {
    for (const b of bloklar) {
      for (const satir of b) s.push(satir);
      s.push('');
    }
    return s;
  }

  // İki kolon: bloklar sırayla sol/sağ sütuna dağıtılıyor ve satır satır
  // birleştiriliyor. Kolon dengesi için blok yükseklikleri toplanıyor.
  const sol = [];
  const sag = [];
  let solYuk = 0;
  let sagYuk = 0;
  for (const b of bloklar) {
    if (solYuk <= sagYuk) { sol.push(b); solYuk += b.length + 1; } else { sag.push(b); sagYuk += b.length + 1; }
  }
  const dizile = (bloklar2) => bloklar2.flatMap((b) => [...b, '']);
  const solSatir = dizile(sol);
  const sagSatir = dizile(sag);
  const boy = Math.max(solSatir.length, sagSatir.length);
  for (let i = 0; i < boy; i++) {
    const a = solSatir[i] || '';
    const b = sagSatir[i] || '';
    // ANSI kodları `padEnd`i bozar; görünür uzunluk ayrıca hesaplanıyor.
    const gorunur = a.replace(/\x1b\[[0-9;]*m/g, '').length;
    const bosluk = Math.max(2, kolonGen - gorunur + 2);
    s.push(a + ' '.repeat(bosluk) + b);
  }
  return s;
}

/**
 * Etkileşimli gezgin.
 *
 * @param {object} opt
 * @param {string} opt.baslik
 * @param {string} [opt.altBaslik]
 * @param {Array<{ad: string, ogeler: Array<[string, string]>}>} opt.alanlar
 * @returns {Promise<void>}
 */
async function gezgin({ baslik, altBaslik, alanlar }) {
  // Etkileşimsiz: harita bas ve çık. `grep`lenebilirlik korunuyor.
  if (!CAPS.isTTY || process.env.CI || process.env.SKULD_NO_ANIM === '1') {
    await yuzeyM.yuzey({
      baslik,
      altBaslik,
      bolumler: [{ satirlar: harita(alanlar) }],
      altNot: 'nskuld <komut> --help  ·  ayrıntı için',
    });
    return;
  }

  let secili = 0;
  let filtre = '';
  const stdin = process.stdin;
  const eskiRaw = stdin.isRaw;

  const suzulmus = () => {
    if (!filtre) return alanlar;
    const f = filtre.toLowerCase();
    return alanlar
      .map((a) => ({
        ad: a.ad,
        ogeler: a.ogeler.filter(([k, d]) =>
          k.toLowerCase().includes(f) || d.toLowerCase().includes(f)),
      }))
      .filter((a) => a.ogeler.length > 0);
  };

  const ciz = () => {
    const liste = suzulmus();
    const etkin = liste.length === 0 ? null : liste[Math.min(secili, liste.length - 1)];
    temizle();

    const s = [];
    s.push('');
    for (const satir of tema.KELIME_ISARETI) s.push('  ' + tema.gradyan(satir, 200, 500));
    s.push('');
    s.push('  ' + tema.soluk(tema.gumus(500, altBaslik || baslik)));
    s.push('');

    // Sol: alan adları, seçili olan kabarık ve vurgulu. Sağ: içerik.
    const solGen = 22;
    const enCok = Math.max(liste.length, etkin ? etkin.ogeler.length : 0);
    const enUzunKomut = etkin ? Math.max(...etkin.ogeler.map(([k]) => k.length)) : 0;

    for (let i = 0; i < enCok; i++) {
      let sol = '';
      if (i < liste.length) {
        const a = liste[i];
        const isaretci = a === etkin ? (CAPS.unicode ? '▍' : '>') : ' ';
        const ad = `${a.ad} ${tema.gumus(700, String(a.ogeler.length))}`;
        sol = (a === etkin ? tema.vurgu(isaretci) + ' ' + tema.kalin(tema.gumus(100, a.ad)) + ' ' + tema.gumus(600, String(a.ogeler.length))
          : '  ' + tema.gumus(500, ad));
      }
      const gorunur = sol.replace(/\x1b\[[0-9;]*m/g, '').length;
      sol += ' '.repeat(Math.max(1, solGen - gorunur));

      let sag = '';
      if (etkin && i < etkin.ogeler.length) {
        const [komut, aciklama] = etkin.ogeler[i];
        sag = tema.gumus(200, komut.padEnd(enUzunKomut + 2)) + tema.gumus(600, aciklama);
      }
      s.push(yuzeyM.sirtli(sol + sag, i === 0 ? 0.2 : 0.6));
    }

    s.push('');
    const ipucu = filtre
      ? `${tema.vurgu('/')}${tema.gumus(200, filtre)}${tema.gumus(700, '│')}   ${tema.gumus(600, 'esc temizle · enter çık')}`
      : tema.gumus(600, '↑↓ alan   ·   yazarak süz   ·   enter/esc çık');
    s.push('  ' + ipucu);
    s.push('');
    process.stdout.write(s.join('\n'));
  };

  return new Promise((cozul) => {
    const bitir = () => {
      try {
        stdin.removeListener('data', tus);
        if (!eskiRaw && typeof stdin.setRawMode === 'function') stdin.setRawMode(false);
        stdin.pause();
      } catch { /* terminali bıraktığımız gibi bırakmaya çalış */ }
      gosterImlec();
      process.stdout.write('\n');
      cozul();
    };

    const tus = (veri) => {
      const k = veri.toString();
      const liste = suzulmus();
      if (k === '\r' || k === '\n' || k === '\x1b' || k === '\x03' || k === 'q') return bitir();
      if (k === '\x1b[A') { secili = Math.max(0, secili - 1); return ciz(); }
      if (k === '\x1b[B') { secili = Math.min(Math.max(0, liste.length - 1), secili + 1); return ciz(); }
      if (k === '\x7f' || k === '\b') { filtre = filtre.slice(0, -1); secili = 0; return ciz(); }
      // Yazdırılabilir karakter → filtre.
      if (k.length === 1 && k >= ' ' && k <= '~') { filtre += k; secili = 0; return ciz(); }
      if (/^[a-zçğıöşü]$/i.test(k)) { filtre += k; secili = 0; return ciz(); }
    };

    try {
      if (typeof stdin.setRawMode === 'function') stdin.setRawMode(true);
      stdin.resume();
      stdin.on('data', tus);
      gizleImlec();
      ciz();
    } catch {
      bitir();
    }
  });
}

module.exports = { gezgin, harita };
