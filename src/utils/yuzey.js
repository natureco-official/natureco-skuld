'use strict';
/**
 * YÜZEY — Skuld'un görsel dili.
 *
 * Kullanıcının isteği: *"insanlar terminal ekranında olduğunu tamamen
 * unutmalı."* Bunu bir slogan değil bir kısıt olarak aldım ve önce şunu
 * sordum: bir terminali terminal gibi gösteren NE?
 *
 *   1. Kutular. `╭──╮` çerçeveler bir arayüz değil, bir arayüz TAKLİDİ.
 *      Üstelik sabit genişlikle çizildikleri için içerik uzayınca sessizce
 *      bozulurlar — `code_v5` başlığında tam olarak bu oldu.
 *   2. Düz renk blokları. ANSI'nin 8 rengi ucuz görünür.
 *   3. Her şeyin bir anda dökülmesi. Basılı bir sayfa gibi değil, bir günlük
 *      dosyası gibi hissettirir.
 *   4. Solda hizalı metin duvarı. Hiyerarşi yok, sadece satırlar var.
 *
 * Bu modülün dört karşı ilkesi:
 *
 *   ── SIRT (spine) ────────────────────────────────────────────────────────
 *   Solda ince, gradyanlı bir dikey ray. Bölümleri ayırmak yerine BAĞLAR:
 *   ekran ayrı bloklar değil, üzerinde şeyler duran tek bir yüzey gibi
 *   davranır. Kutu bir şeyi çevreler; sırt bir şeyi taşır.
 *
 *   ── DERİNLİK, KENAR DEĞİL ───────────────────────────────────────────────
 *   Ayrım parlaklıkla kuruluyor. Bir satırın üstü açık, gövdesi orta, altı
 *   koyu tonda basıldığında göz onu kabarık okur. Çizgi çekmeden yükseklik.
 *
 *   ── TİPOGRAFİK HİYERARŞİ ────────────────────────────────────────────────
 *   Bölüm etiketleri harf aralıklı (tracking) ve küçük; değerler sağa hizalı
 *   bir taban ızgarasında. Bir teknik föy gibi okunur, bir tablo gibi değil.
 *   Renk hiyerarşi taşımaz — renk yalnızca DURUM taşır.
 *
 *   ── KADANS ──────────────────────────────────────────────────────────────
 *   Satırlar ölçülü bir gecikmeyle görünür. Yüklenme taklidi değil: göz bir
 *   yüzeyin aydınlanmasını izler, bir günlüğün akmasını değil.
 *
 * Hepsi düşerek bozulur: renk yoksa parlaklık kaybolur ve hizalama kalır;
 * unicode yoksa sırt ASCII'ye döner; TTY yoksa kadans kapanır ve her şey tek
 * seferde basılır. Deneysellik, çalışmama hakkı vermez.
 */

const tema = require('./skuld-theme');
const { CAPS } = require('./tui');

const canliMi = () => CAPS.isTTY === true && !process.env.CI && process.env.SKULD_NO_ANIM !== '1';
const renkVar = () => CAPS.color !== false;

/** Sırt karakteri — unicode yoksa düşer. */
const SIRT = () => (CAPS.unicode ? '│' : '|');
const SIRT_BASI = () => (CAPS.unicode ? '╷' : '.');
const SIRT_SONU = () => (CAPS.unicode ? '╵' : "'");

/**
 * Bir satırı sırta bağlar.
 *
 * `derinlik` 0–1: sırtın o noktadaki parlaklığı. Bölüm başlarında açık,
 * gövdede koyu — ray yukarıdan aydınlatılmış gibi görünür.
 */
function sirtli(metin, derinlik = 0.5) {
  const ton = derinlik < 0.34 ? 300 : derinlik < 0.67 ? 500 : 700;
  return `  ${tema.gumus(ton, SIRT())}  ${metin}`;
}

/**
 * Harf aralıklı bölüm etiketi.
 *
 * Büyük harf ya da renk yerine ARALIK kullanılıyor: `A Y A R L A R`. Terminal
 * yazı tipini değiştirmeye izin vermiyor, ama aralık verebiliyoruz ve göz
 * bunu "başlık" olarak okuyor. Basılı işlerde küçük kapitallerin işi bu.
 */
function etiket(metin) {
  // `toUpperCase()` Türkçe'de yanlış: 'i' → 'I' veriyor, 'İ' değil. Sonuç
  // "EĞİLİM" yerine "EĞILIM" — ürünün arayüz dili Türkçe olduğu için bu bir
  // yazım hatası, tercih değil. `tr` yerelini vermek de yetmiyor, Node'un ICU
  // yapılandırmasına bağlı; eşleme açıkça yazılıyor.
  const TR_BUYUK = { i: 'İ', 'ı': 'I', 'ğ': 'Ğ', 'ü': 'Ü', 'ş': 'Ş', 'ö': 'Ö', 'ç': 'Ç' };
  const buyuk = String(metin)
    .split('')
    .map((ch) => TR_BUYUK[ch] || ch.toUpperCase())
    .join('');
  return tema.gumus(400, buyuk.split('').join(' '));
}

/**
 * Kabarık satır: üstü açık, gövdesi orta, altı koyu.
 *
 * Tek satır için üç ton kullanılamaz, o yüzden ilk karakter açık, gövde orta,
 * son karakter koyu basılıyor. Yakından bakınca hile, uzaktan bakınca hacim.
 */
function kabarik(metin) {
  if (!renkVar() || metin.length < 3) return tema.gumus(200, metin);
  return tema.gumus(100, metin.slice(0, 1))
    + tema.gumus(200, metin.slice(1, -1))
    + tema.gumus(400, metin.slice(-1));
}

/**
 * Taban ızgarası: etiket solda, değer sağda, arası noktalı.
 *
 * Terminal tablolarının en terminal görünen yanı dikey çizgileri. Nokta
 * doldurma (leader dots) basılı içindekiler sayfalarından gelir ve gözü
 * satırın sonuna taşır — çizgi çekmeden aynı işi yapar.
 */
function izgara(satirlar, genislik = 62) {
  const enUzunAd = Math.max(...satirlar.map(([a]) => String(a).length));
  return satirlar.map(([ad, deger, durum]) => {
    const solAd = tema.gumus(500, String(ad));
    const sagDeger = durum === 'ok' ? tema.basari(String(deger))
      : durum === 'uyari' ? tema.uyari(String(deger))
        : durum === 'hata' ? tema.hata(String(deger))
          : kabarik(String(deger));
    const dolgu = Math.max(1, genislik - enUzunAd - String(deger).length - 4);
    const noktalar = tema.gumus(700, (CAPS.unicode ? '·' : '.').repeat(dolgu));
    return `${solAd}${' '.repeat(enUzunAd - String(ad).length + 1)}${noktalar} ${sagDeger}`;
  });
}

/**
 * Oran çubuğu — sayı değil, uzunluk.
 *
 * "3/7" okunması gereken bir şey; dolu bir çubuk görülen bir şey. Yarım blok
 * karakterleriyle alt-karakter çözünürlük elde ediliyor, yani 20 karakterlik
 * bir çubuk 40 kademe gösteriyor.
 */
function oran(deger, toplam, genislik = 24) {
  const p = toplam > 0 ? Math.max(0, Math.min(1, deger / toplam)) : 0;
  if (!CAPS.unicode) {
    const dolu = Math.round(p * genislik);
    return tema.gumus(300, '#'.repeat(dolu)) + tema.gumus(700, '-'.repeat(genislik - dolu));
  }
  const tamKademe = p * genislik;
  const tam = Math.floor(tamKademe);
  const yarim = tamKademe - tam >= 0.5;
  let s = '';
  for (let i = 0; i < genislik; i++) {
    if (i < tam) s += tema.gumus(200, '█');
    else if (i === tam && yarim) s += tema.gumus(400, '▌');
    else s += tema.gumus(700, '░');
  }
  return s;
}

/**
 * Braille mikro-grafik. Sekiz noktalı hücre, karakter başına 2×4 piksel.
 *
 * Bir sayı dizisini satır içinde göstermenin en yoğun yolu. Tablo kurmadan
 * eğilim gösteriyor.
 */
function kivrim(degerler, yukseklik = 4) {
  if (!CAPS.unicode || degerler.length === 0) {
    return tema.gumus(500, degerler.join(' '));
  }
  const enBuyuk = Math.max(...degerler, 1);
  const NOKTA = [0x01, 0x02, 0x04, 0x40, 0x08, 0x10, 0x20, 0x80];
  let s = '';
  for (let i = 0; i < degerler.length; i += 2) {
    let kod = 0x2800;
    for (let sutun = 0; sutun < 2; sutun++) {
      const d = degerler[i + sutun];
      if (d == null) continue;
      const h = Math.max(1, Math.round((d / enBuyuk) * yukseklik));
      for (let y = 0; y < h; y++) {
        kod |= NOKTA[sutun * 4 + (yukseklik - 1 - y)];
      }
    }
    s += String.fromCharCode(kod);
  }
  return tema.gumus(300, s);
}

/**
 * Kadanslı basım: satırlar ölçülü aralıkla görünür.
 *
 * Yavaşlatmak amaç değil — toplam bütçe sabit (varsayılan 260 ms) ve satır
 * sayısına bölünüyor, yani uzun çıktı yavaşlamıyor. TTY yoksa ya da
 * `SKULD_NO_ANIM=1` ise tek seferde basılıyor: animasyon bir süs, doğruluk
 * değil.
 */
async function kadans(satirlar, butceMs = 260) {
  // `console.log` KULLANILIYOR, `process.stdout.write` değil: devralınan
  // testlerin çoğu `console.log`'u yakalayarak çıktıyı ölçüyor. Doğrudan
  // stdout'a yazmak onları boşa düşürüyordu — çıktıyı hiç görmeyen bir test
  // `not.toContain` iddiasını da geçer. Sessizce boşa geçen test, kırmızı
  // testten kötüdür.
  if (!canliMi() || satirlar.length === 0) {
    for (const satir of satirlar) console.log(satir);
    return;
  }
  const bekle = Math.max(6, Math.floor(butceMs / satirlar.length));
  for (const satir of satirlar) {
    console.log(satir);
    await new Promise((r) => setTimeout(r, bekle));
  }
}

/**
 * Tam bir yüzey basar: sırt + etiketli bölümler + kadans.
 *
 * @param {object} opt
 * @param {string} [opt.baslik] üst satır, kabarık
 * @param {string} [opt.altBaslik]
 * @param {Array<{etiket?: string, satirlar: string[]}>} opt.bolumler
 * @param {string} [opt.altNot]
 */
async function yuzey({ baslik, altBaslik, bolumler = [], altNot } = {}) {
  const s = [];
  s.push('');
  if (baslik) {
    s.push(`  ${tema.gumus(300, SIRT_BASI())}`);
    s.push(sirtli(kabarik(baslik), 0.1));
    if (altBaslik) s.push(sirtli(tema.gumus(600, altBaslik), 0.2));
  }
  for (const bolum of bolumler) {
    s.push(sirtli('', 0.4));
    if (bolum.etiket) s.push(sirtli(etiket(bolum.etiket), 0.3));
    for (const satir of bolum.satirlar) s.push(sirtli(satir, 0.6));
  }
  s.push(`  ${tema.gumus(700, SIRT_SONU())}`);
  if (altNot) {
    s.push('');
    s.push(`  ${tema.gumus(600, altNot)}`);
  }
  s.push('');
  await kadans(s);
}

module.exports = {
  sirtli, etiket, kabarik, izgara, oran, kivrim, kadans, yuzey,
  SIRT, canliMi,
};
