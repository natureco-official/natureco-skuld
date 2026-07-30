#!/usr/bin/env node
/**
 * Provenans kapısı.
 *
 * natureco-skuld MIT lisanslı ve Skuld ondan kod alıyor. Lisans yükümlülüğü ve
 * upstream güvenlik düzeltmelerini taşıyabilmek, hangi dosyanın nereden
 * geldiğini ve HANGİ COMMIT'ten geldiğini bilmeye bağlı. Bu bilgi bir
 * geliştiricinin hafızasında durursa altı ay sonra kaybolur.
 *
 * Kural: taşınan her dosya başında bir provenans bloğu taşır ve aynı kayıt
 * docs/UPSTREAM_SYNC.md içinde bulunur. İkisi ayrışırsa bu betik düşer.
 *
 *   // @provenance natureco-skuld src/tools/edit_file.js @40b4913
 *
 * Kontrol iki yönlüdür: başlıkta olup kayıtta olmayan da, kayıtta olup
 * başlıkta olmayan da hatadır. Tek yönlü kontrol, sessizce çürüyen kayıt
 * üretir.
 */
import { readFileSync, existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KAYIT = path.join(KOK, "docs", "UPSTREAM_SYNC.md");
const PAKETLER = path.join(KOK, "packages");

const BASLIK = /@provenance\s+(\S+)\s+(\S+)\s+@([0-9a-f]{7,40})/;
const KAYNAK_UZANTI = new Set([".ts", ".mts", ".js", ".mjs", ".cjs"]);

let hata = 0;
const bildir = (ok, mesaj) => {
  if (!ok) hata++;
  console.log(`  ${ok ? "✓" : "✗"} ${mesaj}`);
};

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

// 1) Kaynak ağacındaki provenans başlıkları
const baslikta = new Map();
for await (const dosya of dosyalar(PAKETLER)) {
  const ilk = readFileSync(dosya, "utf8").slice(0, 2000);
  const m = ilk.match(BASLIK);
  if (m) {
    const goreli = path.relative(KOK, dosya).split(path.sep).join("/");
    baslikta.set(goreli, { depo: m[1], kaynak: m[2], sha: m[3] });
  }
}

// 2) Kayıt dosyasındaki satırlar: | hedef | depo | kaynak | sha |
const kayitta = new Map();
if (existsSync(KAYIT)) {
  for (const satir of readFileSync(KAYIT, "utf8").split("\n")) {
    const m = satir.match(/^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|\s*`([0-9a-f]{7,40})`\s*\|/);
    if (m) kayitta.set(m[1], { depo: m[2].trim(), kaynak: m[3], sha: m[4] });
  }
} else {
  bildir(false, `kayıt dosyası yok: docs/UPSTREAM_SYNC.md`);
}

console.log(`Provenans: kaynakta ${baslikta.size} başlık, kayıtta ${kayitta.size} satır`);

for (const [dosya, bilgi] of baslikta) {
  const k = kayitta.get(dosya);
  if (!k) {
    bildir(false, `${dosya}: başlıkta var, UPSTREAM_SYNC.md'de YOK`);
    continue;
  }
  bildir(k.sha === bilgi.sha, `${dosya}: SHA eşleşiyor (${bilgi.sha})`);
  bildir(k.kaynak === bilgi.kaynak, `${dosya}: kaynak yolu eşleşiyor`);
}

for (const dosya of kayitta.keys()) {
  if (!baslikta.has(dosya)) {
    bildir(false, `${dosya}: UPSTREAM_SYNC.md'de var, dosyada provenans başlığı YOK (silinmiş olabilir)`);
  }
}

if (baslikta.size === 0 && kayitta.size === 0) {
  console.log("  (henüz taşınmış dosya yok — kapı hazır)");
}

console.log(hata === 0 ? "\nProvenans tutarlı." : `\n${hata} provenans sorunu.`);
process.exitCode = hata === 0 ? 0 : 1;
