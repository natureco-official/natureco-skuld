#!/usr/bin/env node
/**
 * Kabuktan bağımsız test koşucusu.
 *
 * `node --test tests/**\/*.test.ts` yazmak üç yerde birden kırılıyor ve bu
 * Verðandi'de canlı olarak yaşandı:
 *   - Windows'ta npm scriptleri cmd ile çalışır; cmd glob genişletmez.
 *   - GitHub Actions Windows'ta pwsh de dış komutlar için genişletmez.
 *   - Node 20'nin test koşucusu glob'u kendisi çözmez ve deseni dosya adı sanar.
 * `shell: bash` eklemek de yetmiyor — o yalnızca adımın komutunu etkiliyor,
 * npm'in içeride açtığı kabuğu değil.
 *
 * Burada dosyalar Node ile bulunuyor ve koşucuya tek tek veriliyor.
 */
import { readdirSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_KOK = path.join(KOK, "tests");

function testDosyalari(dizin) {
  if (!existsSync(dizin)) return [];
  const bulunan = [];
  for (const e of readdirSync(dizin, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "fixtures") continue;
    const p = path.join(dizin, e.name);
    if (e.isDirectory()) bulunan.push(...testDosyalari(p));
    else if (/\.test\.(ts|mts|js|mjs)$/.test(e.name)) bulunan.push(p);
  }
  return bulunan.sort();
}

const dosyalar = testDosyalari(TEST_KOK);

if (dosyalar.length === 0) {
  // İskelet aşaması: test yokken düşmek yanlış olur. Ama sessizce "geçti"
  // demek daha yanlış — sayı görünsün ki sıfırda kaldığı fark edilsin.
  console.log("run-tests: henüz test dosyası yok (tests/ boş). 0 test.");
  process.exitCode = 0;
} else {
  // Gelen argümanlar node BAYRAĞI olarak iletiliyor (aşağıda `--test`ten
  // önce geliyorlar). Node tanımadığı bir bayrağa "bad option" deyip çıkıyor,
  // yani buraya sızan alakasız tek bir bayrak tüm koşuyu öldürüyor —
  // CI'da `--reporter=dot` (bir vitest bayrağı) tam olarak bunu yaptı ve
  // hata mesajı hangi komutun şikâyet ettiğini söylemiyordu.
  //
  // Yalnızca node test koşucusuna ait bayraklar geçirilir; gerisi sessizce
  // yutulmaz, adı söylenerek yok sayılır.
  const tumArgumanlar = process.argv.slice(2);
  const ekBayraklar = tumArgumanlar.filter((arg) => arg.startsWith('--test'));
  const yokSayilan = tumArgumanlar.filter((arg) => !arg.startsWith('--test'));
  if (yokSayilan.length > 0) {
    console.log(`run-tests: node test koşucusuna ait olmayan bayraklar yok sayıldı: ${yokSayilan.join(', ')}`);
  }
  const cocuk = spawn(
    process.execPath,
    ["--experimental-strip-types", ...ekBayraklar, "--test", ...dosyalar],
    { cwd: KOK, stdio: "inherit" },
  );
  cocuk.on("exit", (kod, sinyal) => {
    if (sinyal) {
      console.error(`run-tests: koşucu ${sinyal} sinyaliyle durdu.`);
      process.exit(1);
    }
    process.exit(kod ?? 1);
  });
}
