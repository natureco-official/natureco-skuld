#!/usr/bin/env node
/**
 * Derleme sonrası: `@skuld/<ad>` çıplak import'larını göreli yola çevirir.
 *
 * Neden gerekli: paketler npm **workspace**'i ve `@skuld/shared` yalnızca
 * workspace'in kurduğu `node_modules` symlink'i sayesinde çözülüyor. Yayınlanan
 * tarball'da o symlink yok; üstelik paketler `private: true` ve sürümleri
 * `0.0.0`, yani npm'den de çözülemezler.
 *
 * Sonuç ölçüldü: paket dist dizinleri yayına dahil edildikten SONRA bile kapı
 * paket içinden yüklenemiyordu — `ERR_MODULE_NOT_FOUND: @skuld/shared`. Yani
 * dosyaları paketlemek yetmedi, içlerindeki yolların da taşınabilir olması
 * gerekiyordu. İki ayrı kusur, ikisi de "depoda çalışıyor, pakette çalışmıyor"
 * sınıfında.
 *
 * Neden paketleyici değil: depoda esbuild/rollup yok ve yalnızca bunun için
 * bir paketleyici eklemek, çözdüğü sorundan büyük bir bağımlılık olur. Üç
 * import satırını yeniden yazmak yeterli ve ne yaptığı okunabilir.
 *
 * `npm run typecheck` sonrası koşuyor (`postcompile`), ve
 * `scripts/yayin-onkontrol.mjs` sonucu paketi açıp doğruluyor.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAKETLER = path.join(KOK, "packages");

/** `@skuld/<ad>` → o paketin dist girişine göreli yol. */
function goreliYol(kaynakDosya, hedefPaket) {
  const hedef = path.join(PAKETLER, hedefPaket, "dist", "index.js");
  let r = path.relative(path.dirname(kaynakDosya), hedef).split(path.sep).join("/");
  if (!r.startsWith(".")) r = `./${r}`;
  return r;
}

function* distDosyalari() {
  if (!existsSync(PAKETLER)) return;
  for (const paket of readdirSync(PAKETLER)) {
    const dist = path.join(PAKETLER, paket, "dist");
    if (!existsSync(dist)) continue;
    for (const ad of readdirSync(dist)) {
      if (ad.endsWith(".js") || ad.endsWith(".d.ts")) yield path.join(dist, ad);
    }
  }
}

let degisen = 0;
let toplam = 0;

for (const dosya of distDosyalari()) {
  const metin = readFileSync(dosya, "utf8");
  // `from "@skuld/x"` ve `import("@skuld/x")` biçimlerinin ikisi de.
  const yeni = metin.replace(
    /(["'])@skuld\/([a-z-]+)\1/g,
    (tam, tirnak, ad) => `${tirnak}${goreliYol(dosya, ad)}${tirnak}`,
  );
  if (yeni !== metin) {
    writeFileSync(dosya, yeni, "utf8");
    degisen++;
    toplam += (metin.match(/@skuld\//g) || []).length;
  }
}

if (degisen > 0) {
  console.log(`  dist yolları: ${degisen} dosyada ${toplam} @skuld import'u göreli yola çevrildi`);
}
