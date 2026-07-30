#!/usr/bin/env node
/**
 * Yardım metni ile gerçek komut kayıtlarının ayrışmadığını doğrular.
 *
 * `bin/nskuld.js` iki ayrı yerde komut listesi tutuyor: commander'a yapılan
 * `.command(...)` kayıtları ve elle yazılmış renkli yardım bloğu. Parti 2'de
 * beş komut silindiğinde kayıtlar gitti, yardım metni `wiki` ve `open-prose`'u
 * tanıtmaya devam etti — kullanıcıya var olmayan komut önerildi.
 *
 * Aynı bilgiyi iki yerde tutmak ayrışır; sorulacak soru "ayrışır mı" değil
 * "ayrıştığında öğrenir miyiz". Bu betik onu öğrenmenin yolu.
 *
 * İki yön var ama ağırlıkları AYNI DEĞİL, ve bunu ölçmeden yazsaydım yanlış
 * yazardım: özel blok `addHelpText("after", …)` ile ekleniyor, yani
 * commander'ın kendi komut listesinin ÜSTÜNE geliyor. Kayıtlı her komut zaten
 * görünüyor.
 *
 *   yardımda var, kayıtta yok  → HATA. Kullanıcıya var olmayan komut
 *                                tanıtılıyor; yardım yalan söylüyor.
 *   kayıtta var, blokta yok    → uyarı. Komut commander listesinde görünüyor,
 *                                yalnızca kürasyonlu özete girmemiş. Keşif
 *                                sorunu, doğruluk sorunu değil.
 *
 * Kullanım: node scripts/yardim-tutarlilik.mjs
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GIRIS = path.join(KOK, "bin", "nskuld.js");
const metin = readFileSync(GIRIS, "utf8");

// `nskuld help` AYRI bir ekran ve ayrı bir liste tutuyor. Devralınan hâli
// natureco-cli'nin menüsüydü ve komut kırpmadan sonra **var olmayan 13 komut**
// tanıtmaya devam ediyordu. İki liste + bir kürasyonlu özet = üç kopya; üçü de
// denetlenmezse biri kayar.
const YARDIM_KOMUTU = path.join(KOK, "src", "commands", "help.js");
const yardimKomutuMetni = readFileSync(YARDIM_KOMUTU, "utf8");

/**
 * Yardım metninde tanıtılmamasını kabul ettiğimiz komutlar.
 *
 * Gerekçe listenin kendisinde durmalı; muafiyetin nedeni yazılmazsa liste
 * zamanla "kırmızıyı susturma yeri" hâline gelir.
 */
const YARDIMDA_OLMAYABILIR = new Map([
  ["completion", "kabuk tamamlama kancası — insan yazmaz"],
  ["oc-path", "iç teşhis"],
  ["admin-rpc", "iç RPC"],
]);

// ── Kayıtlar ──────────────────────────────────────────────────────────────
const kayitli = new Set();
for (const m of metin.matchAll(/\.command\(\s*['"`]([a-z0-9-]+)/gi)) {
  kayitli.add(m[1]);
}

// ── Yardım metni ──────────────────────────────────────────────────────────
// Blok `${chalk.cyan('ad')}   açıklama` biçiminde.
const yardimda = new Set();
for (const m of metin.matchAll(/\$\{chalk\.cyan\(\s*['"]([a-z0-9-]+)['"]\s*\)\}\s{2,}/gi)) {
  yardimda.add(m[1]);
}

if (kayitli.size === 0 || yardimda.size === 0) {
  console.error("  ✗ Komut listesi ayrıştırılamadı — betiğin deseni kodla uyuşmuyor.");
  console.error(`    kayıtlı: ${kayitli.size}, yardımda: ${yardimda.size}`);
  process.exit(1);
}

// `help.js` içindeki `['<komut>', '<açıklama>']` satırları.
const yardimEkraninda = new Set();
for (const m of yardimKomutuMetni.matchAll(/\[\s*['"]([a-z0-9-]+)(?:\s[^'"]*)?['"]\s*,\s*L\(/g)) {
  yardimEkraninda.add(m[1]);
}

const hayalet = [...new Set([...yardimda, ...yardimEkraninda])]
  .filter((k) => !kayitli.has(k))
  .sort();
const gizli = [...kayitli]
  .filter((k) => !yardimda.has(k) && !YARDIMDA_OLMAYABILIR.has(k))
  .sort();

for (const k of hayalet) {
  console.log(`  ✗ ${k}`);
  console.log("      Yardımda tanıtılıyor ama kayıtlı DEĞİL — kullanıcıya var olmayan komut öneriliyor.");
}
if (gizli.length > 0) {
  console.log(`  · Kürasyonlu özette olmayan ${gizli.length} komut (commander listesinde görünüyorlar):`);
  console.log(`      ${gizli.join(", ")}`);
}

if (yardimEkraninda.size === 0) {
  console.error("  ✗ `help.js` komut listesi ayrıştırılamadı — betiğin deseni kodla uyuşmuyor.");
  process.exit(1);
}

console.log(
  `Yardım tutarlılığı: ${kayitli.size} kayıtlı komut, ${yardimda.size} özette, `
  + `${yardimEkraninda.size} help ekranında, ${hayalet.length} hayalet.`,
);
if (hayalet.length === 0) console.log("Yardım metni var olmayan komut tanıtmıyor.");
// Yalnızca hayaletler kırar. Kürasyon eksiği bir tercih olabilir; onu hataya
// çevirmek, betiği susturmak için özete gereksiz satır eklemeye iter.
process.exit(hayalet.length > 0 ? 1 : 0);
