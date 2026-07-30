#!/usr/bin/env node
/**
 * Yüzey dili önizlemesi — `npm run yuzey`
 *
 * Tasarımı tartışmak için ekran görüntüsü yeter, ama tasarımın DÜŞTÜĞÜNDE ne
 * olduğunu görmek için çalıştırmak gerekiyor. Bu betik aynı bileşenleri dört
 * yeteneğe göre basıyor: tam (24-bit), 256 renk, renksiz, unicode'suz.
 *
 * Sebebi somut: kutuyla çizilmiş bir arayüz renksiz terminalde hâlâ arayüz
 * gibi durur ama unicode'suz terminalde çöker. Parlaklıkla kurulmuş bir
 * arayüz ise renksizde hizalamaya, unicode'suzda ASCII'ye düşer — ikisinde de
 * okunur kalır. Bunu iddia etmek yerine göstermek istiyorum.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DURUMLAR = [
  { ad: "1 · 24-bit renk", ortam: { SKULD_TRUECOLOR: "1", FORCE_COLOR: "3" } },
  { ad: "2 · 256 renk (varsayılan)", ortam: { FORCE_COLOR: "2" } },
  { ad: "3 · renksiz", ortam: { FORCE_COLOR: "0", NO_COLOR: "1" } },
  { ad: "4 · unicode yok", ortam: { FORCE_COLOR: "2", SKULD_NO_UNICODE: "1" } },
];

const BETIK = `
const tema = require(${JSON.stringify(path.join(KOK, "src/utils/skuld-theme.js"))});
const y = require(${JSON.stringify(path.join(KOK, "src/utils/yuzey.js"))});
const { CODING_TOOL_NAMES } = require(${JSON.stringify(path.join(KOK, "src/utils/coding-surface.js"))});

// Kelime işareti — dinlenme gradyanı (animasyonun son karesi).
for (const satir of tema.KELIME_ISARETI) console.log('  ' + tema.gradyan(satir, 200, 500));
console.log('');

// Taban ızgarası: nokta doldurma, sağa hizalı değerler, durum rengi.
for (const satir of y.izgara([
  ['sağlayıcı', 'gemini-2.5-flash'],
  ['araç', String(CODING_TOOL_NAMES.size)],
  ['kapı', 'devrede', 'ok'],
  ['doğrulama', 'komut yok', 'uyari'],
  ['workspace', 'dışına yazma engelli', 'ok'],
])) console.log(y.sirtli(satir, 0.6));

console.log(y.sirtli('', 0.4));
console.log(y.sirtli(y.etiket('oran'), 0.3));
console.log(y.sirtli(y.oran(7, 10) + '  ' + tema.gumus(500, '7/10 yetenek'), 0.6));
console.log(y.sirtli(y.oran(11, 11) + '  ' + tema.gumus(500, '11/11 mutasyon'), 0.6));

console.log(y.sirtli('', 0.4));
console.log(y.sirtli(y.etiket('eğilim'), 0.3));
console.log(y.sirtli(y.kivrim([3, 5, 4, 8, 6, 9, 7, 12, 10, 14, 13, 16]) + '  ' + tema.gumus(500, 'test sayısı'), 0.6));

console.log(y.sirtli('', 0.4));
console.log(y.sirtli(y.kabarik('kabarık satır — üstü açık, altı koyu'), 0.6));
`;

for (const durum of DURUMLAR) {
  console.log("");
  console.log("  " + "─".repeat(64));
  console.log("  " + durum.ad);
  console.log("  " + "─".repeat(64));
  const r = spawnSync(process.execPath, ["-e", BETIK], {
    cwd: KOK,
    encoding: "utf8",
    env: { ...process.env, ...durum.ortam, SKULD_NO_ANIM: "1", CI: "1" },
  });
  process.stdout.write(r.stdout || "");
  if (r.stderr) process.stderr.write(r.stderr);
}
console.log("");
console.log("  Animasyonu görmek için: nskuld  (gerçek terminalde, boruya değil)");
console.log("");
