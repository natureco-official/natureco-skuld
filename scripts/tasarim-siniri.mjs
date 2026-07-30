#!/usr/bin/env node
/**
 * Tasarım sınırı — kutu çizen ekranlar büyümesin.
 *
 * Kullanıcının isteği: *"her sayfanın her komutun her listenin kendine özgü
 * bir tasarımı ve yapısı olmalı… insanlar terminal ekranında olduğunu tamamen
 * unutmalı."*
 *
 * Devralınan görünümün kaynağı `src/utils/tui.js`: bir kutu ve tablo motoru.
 * `╭──╮` çerçeveler bir arayüz değil arayüz TAKLİDİ, ve sabit genişlikle
 * çizildikleri için içerik uzayınca sessizce bozulurlar — `code_v5`
 * başlığında ve `setup` durumunda tam olarak bu oldu.
 *
 * Yerine `src/utils/yuzey.js` var: sırt, derinlik, taban ızgarası, kadans.
 *
 * ── Neden lint ──────────────────────────────────────────────────────────
 *
 * 11 komut dosyası hâlâ kutu çiziyor ve hepsini bir seferde çevirmek büyük bir
 * değişiklik. Sınır lint'inde öğrendiğim şeyi burada da uyguluyorum: envanteri
 * DONDUR, liste yalnızca kısalabilsin. Yeni bir ekran kutu çizerse kırılır;
 * envanterdeki bir ekran çevrilip listeden çıkarılmazsa da kırılır — ikinci
 * kural olmadan muafiyet listesi çürür.
 *
 * Belge kayar, kontrol kaymaz.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENVANTER = path.join(KOK, "docs", "tasarim-envanteri.json");

// Kutu çizim karakterleri. `│` TEK BAŞINA yasak değil — yüzey dilinin sırtı o.
// Yasak olan KÖŞELER ve KAVŞAKLAR: bir şeyi çevrelemenin işareti onlar.
const KUTU = /[╭╮╰╯┌┐└┘├┤┬┴┼╋╠╣╦╩╬]/u;

const TARANAN = ["src/commands", "src/utils"];
// `yuzey.js` ve `tui.js` kutu motorunun kendisi/karşıtı; ikisi de kod
// örneği ve karşılaştırma için bu karakterleri içerebilir.
const MUAF_DOSYA = new Set(["src/utils/yuzey.js", "src/utils/tui.js"]);

/** Yorumları ve dizeleri ayırt eden tek geçişli tarayıcı (sınır lint'iyle aynı fikir). */
function kodSatirlari(metin) {
  let cikti = "";
  let durum = "kod";
  let i = 0;
  while (i < metin.length) {
    const c = metin[i];
    const n = metin[i + 1];
    switch (durum) {
      case "kod":
        if (c === "/" && n === "/") { durum = "satirYorum"; i += 2; continue; }
        if (c === "/" && n === "*") { durum = "blokYorum"; i += 2; continue; }
        if (c === "'" || c === '"' || c === "`") durum = c;
        cikti += c; i += 1; continue;
      case "satirYorum":
        if (c === "\n") { durum = "kod"; cikti += c; }
        i += 1; continue;
      case "blokYorum":
        if (c === "*" && n === "/") { durum = "kod"; i += 2; continue; }
        if (c === "\n") cikti += c;
        i += 1; continue;
      default: {
        if (c === "\\") { cikti += c + (n ?? ""); i += 2; continue; }
        if (c === durum) durum = "kod";
        cikti += c; i += 1; continue;
      }
    }
  }
  return cikti;
}

async function* dosyalar(dizin) {
  let girisler;
  try { girisler = await readdir(dizin, { withFileTypes: true }); } catch { return; }
  for (const e of girisler) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dizin, e.name);
    if (e.isDirectory()) yield* dosyalar(p);
    else if (e.name.endsWith(".js")) yield p;
  }
}

const bulunan = new Set();
for (const kokAd of TARANAN) {
  for await (const dosya of dosyalar(path.join(KOK, kokAd))) {
    const goreli = path.relative(KOK, dosya).split(path.sep).join("/");
    if (MUAF_DOSYA.has(goreli)) continue;
    // Kutu karakteri KOD içinde mi (dize dahil — çizim dizeyle yapılır)?
    if (KUTU.test(kodSatirlari(readFileSync(dosya, "utf8")))) bulunan.add(goreli);
  }
}

if (process.argv.includes("--dondur")) {
  writeFileSync(
    ENVANTER,
    `${JSON.stringify({
      aciklama: "Hala kutu cizen ekranlar. Bu liste YALNIZCA KISALABILIR.",
      neden: "Kutu bir arayuz taklidi ve sabit genislikle cizildigi icin icerik uzayinca bozulur. Yerine src/utils/yuzey.js kullanilir.",
      dondurma: new Date().toISOString().slice(0, 10),
      kalan: [...bulunan].sort(),
    }, null, 2)}\n`,
    "utf8",
  );
  console.log(`Envanter donduruldu: ${bulunan.size} dosya.`);
  process.exit(0);
}

if (!existsSync(ENVANTER)) {
  console.error("  ✗ docs/tasarim-envanteri.json yok. `node scripts/tasarim-siniri.mjs --dondur` ile oluşturun.");
  process.exit(1);
}

const envanter = JSON.parse(readFileSync(ENVANTER, "utf8"));
const beklenen = new Set(envanter.kalan);
let ihlal = 0;

for (const yeni of [...bulunan].filter((d) => !beklenen.has(d)).sort()) {
  ihlal++;
  console.log(`  ✗ ${yeni}`);
  console.log("      YENİ kutu çizimi. Kutu yerine src/utils/yuzey.js kullanın (sırt, ızgara, oran).");
}
for (const cevrilmis of [...beklenen].filter((d) => !bulunan.has(d)).sort()) {
  ihlal++;
  console.log(`  ✗ ${cevrilmis}`);
  console.log("      Artık kutu çizmiyor — docs/tasarim-envanteri.json içinden ÇIKARIN.");
  console.log("      (Muafiyet listesi temizlenmezse muafiyet kalıcılaşır.)");
}

console.log(`Tasarım sınırı: ${bulunan.size} ekran hâlâ kutu çiziyor (dondurma: ${envanter.dondurma}), ${ihlal} ihlal.`);
if (ihlal === 0 && bulunan.size > 0) {
  console.log("Liste büyümüyor. Yüzey diline çevrildikçe kısalacak.");
}
process.exit(ihlal > 0 ? 1 : 0);
