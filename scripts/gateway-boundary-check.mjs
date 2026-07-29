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
 */
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAKETLER = path.join(KOK, "packages");
const IZINLI_PAKET = "execution-gateway";

// import/require biçimlerinin hepsi: statik, dinamik, require, node: önekli.
const YASAK = [
  /\bfrom\s+["']node:child_process["']/,
  /\bfrom\s+["']child_process["']/,
  /\brequire\(\s*["'](?:node:)?child_process["']\s*\)/,
  /\bimport\(\s*["'](?:node:)?child_process["']\s*\)/,
];

const KAYNAK_UZANTI = new Set([".ts", ".mts", ".js", ".mjs", ".cjs"]);

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
  // Yorum satırlarını çıkar: açıklamada geçen "child_process" ihlal değildir.
  const kod = metin
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((s) => !/^\s*(\/\/|\*)/.test(s))
    .join("\n");

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

console.log(`Kapı sınırı: ${taranan} dosya tarandı, ${ihlal} ihlal.`);
if (ihlal === 0) console.log("Tüm çalıştırma yolları execution-gateway üzerinden.");
process.exitCode = ihlal === 0 ? 0 : 1;
