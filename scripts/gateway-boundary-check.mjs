#!/usr/bin/env node
/**
 * Tek güvenlik kapısı sınırı.
 *
 * Kaynak denetiminde natureco-cli'de 71 dosyanın süreç başlattığı, bunların
 * yalnızca 17'sinin bir policy/approval sembolü de içerdiği ölçüldü. Bu bir
 * kanıt değil sinyaldi — ama policy katmanı 577 satırken 71 çağrı noktası
 * olması, "tek kapı" ilkesinin düzyazıyla korunamayacağını gösteriyor.
 *
 * Kural: `child_process` (ve türevleri) YALNIZCA execution-gateway paketinden
 * import edilebilir. Başka her yer, kapıyı çağırmak zorundadır.
 *
 * Bu kuralın belgede değil burada durmasının sebebi: belge kayar, kontrol
 * kaymaz. Kaydığında da sessizce değil, kırmızıyla kayar.
 *
 * NE YAPMADIĞI: bu bir kaçış önleyici değil. `createRequire`, dize
 * birleştirme ya da `module.constructor._load` ile import gizlenebilir ve bu
 * kontrol göremez. Tehdit modeli bu değil — kastî kaçış zaten kod
 * incelemesinin işi. Buradaki tehdit KAYMA: birinin acelesi olduğunda
 * `require("child_process")` yazıp devam etmesi. Bugün depoda gizlenmiş tek
 * bir kullanım yok, arandı.
 */
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAKETLER = path.join(KOK, "packages");
const IZINLI_PAKET = "execution-gateway";

/**
 * Fork'tan devralınan taraf: `src/` ve `bin/` altında 59 dosya hâlâ doğrudan
 * `child_process` kullanıyor. Hepsini bugün kapıya almak, çalışan 1150 testi
 * riske atan büyük bir değişiklik olurdu — ve ölçüldüğünde çoğunun kapıdan
 * kazanacağı bir şey de yok: macOS araçları betiği stdin'den, veriyi
 * `argv`'den geçiriyor (enjeksiyon yok), `cron_create` zaten onay istiyor.
 *
 * O yüzden burada envanter bir CIRCIR MANDALI: liste yalnızca kısalabilir.
 * Yeni bir dosya `child_process` import ederse lint kırılır; envanterdeki bir
 * dosya kapıya alınırsa lint "listeden çıkar" der. İkinci kural olmadan liste
 * çürür — düzeltilen dosyalar muafiyet listesinde kalır ve muafiyet
 * kalıcılaşır.
 */
const ENVANTER_YOLU = path.join(KOK, "docs", "kapi-envanteri.json");

// import/require biçimlerinin hepsi: statik, dinamik, require, node: önekli.
const YASAK = [
  /\bfrom\s+["']node:child_process["']/,
  /\bfrom\s+["']child_process["']/,
  /\brequire\(\s*["'](?:node:)?child_process["']\s*\)/,
  /\bimport\(\s*["'](?:node:)?child_process["']\s*\)/,
];

const KAYNAK_UZANTI = new Set([".ts", ".mts", ".js", ".mjs", ".cjs"]);

/**
 * Yorumları ayıklar — ama blok yorum DESENİYLE DEĞİL.
 *
 * Codex tur 3, bulgu 1: eski hâli `/\/\*[\s\S]*?\*\//g` ile blok yorumları
 * siliyordu ve bu regex dizeyle yorumu ayırt edemiyor. Şu üç satır lint'i
 * tamamen kör ediyordu ve doğrulandı — "0 ihlal" dedi:
 *
 *     const baslangic = "/*";
 *     const { spawn } = require("node:child_process");
 *     const bitis = "*\/";
 *
 * İlk dizedeki `/*` ile son dizedeki `*\/` arası yorum sanılıp siliniyor,
 * arada duran gerçek import'la birlikte. Bunu "kastî kaçış" diye elemiştim;
 * değil — dizesinde `/*` geçen sıradan kod da aynı sonucu verir.
 *
 * Çözüm sözdizimi ayrıştırıcısı değil, daha dar bir tanım: yalnızca `//` ya
 * da `*` ile BAŞLAYAN satırlar atılıyor. Bir satırın başındaki bu belirteç
 * dize içinde olamaz.
 *
 * Bedeli: tek satırlık `/* … *\/` biçimindeki gerçek bir yorum artık
 * ayıklanmıyor, yani içinde gerçek bir import yazımı geçerse yanlış alarm
 * verir. Güvenlik lint'inde yanlış alarm gürültülüdür, kaçırılan ihlal
 * sessizdir; gürültülü taraf doğru taraftır.
 */
function kodSatirlari(metin) {
  return metin
    .split(/\r?\n/)
    .filter((s) => !/^\s*(\/\/|\*)/.test(s))
    .join("\n");
}

let ihlal = 0;

async function* dosyalar(dizin) {
  let girisler;
  try {
    girisler = await readdir(dizin, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of girisler) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const p = path.join(dizin, e.name);
    if (e.isDirectory()) yield* dosyalar(p);
    else if (KAYNAK_UZANTI.has(path.extname(e.name))) yield p;
  }
}

let taranan = 0;
for await (const dosya of dosyalar(PAKETLER)) {
  taranan++;
  const goreli = path.relative(KOK, dosya).split(path.sep).join("/");
  const paket = goreli.split("/")[1];
  if (paket === IZINLI_PAKET) continue;

  const metin = readFileSync(dosya, "utf8");
  const kod = kodSatirlari(metin);

  for (const desen of YASAK) {
    if (desen.test(kod)) {
      ihlal++;
      console.log(`  ✗ ${goreli}`);
      console.log(`      child_process yalnızca packages/${IZINLI_PAKET}/ içinden import edilebilir.`);
      console.log(`      Komut çalıştırmak için execution-gateway'i çağırın.`);
      break;
    }
  }
}

// ── Devralınan taraf: cırcır mandalı ──────────────────────────────────────
const envanter = JSON.parse(readFileSync(ENVANTER_YOLU, "utf8"));
const beklenen = new Set(envanter.kalan);
const bulunan = new Set();

for (const kokAd of ["src", "bin"]) {
  for await (const dosya of dosyalar(path.join(KOK, kokAd))) {
    taranan++;
    const goreli = path.relative(KOK, dosya).split(path.sep).join("/");
    const metin = readFileSync(dosya, "utf8");
    const kod = kodSatirlari(metin);
    if (YASAK.some((desen) => desen.test(kod))) bulunan.add(goreli);
  }
}

for (const yeni of [...bulunan].filter((d) => !beklenen.has(d)).sort()) {
  ihlal++;
  console.log(`  ✗ ${yeni}`);
  console.log("      YENİ doğrudan child_process kullanımı. execution-gateway'i çağırın.");
}

const duzelen = [...beklenen].filter((d) => !bulunan.has(d)).sort();
for (const d of duzelen) {
  ihlal++;
  console.log(`  ✗ ${d}`);
  console.log("      Artık child_process kullanmıyor — docs/kapi-envanteri.json içinden ÇIKARIN.");
  console.log("      (Muafiyet listesi temizlenmezse muafiyet kalıcılaşır.)");
}

console.log(`Kapı sınırı: ${taranan} dosya tarandı, ${ihlal} ihlal.`);
console.log(`Devralınan envanter: ${bulunan.size} dosya (dondurulma: ${envanter.dondurulma}). Liste yalnızca kısalabilir.`);
if (ihlal === 0) console.log("packages/ tamamen kapı üzerinden; devralınan taraf büyümüyor.");
process.exitCode = ihlal === 0 ? 0 : 1;
