#!/usr/bin/env node
/**
 * Mutasyon denemesi: her güvenlik düzeltmesini tek tek geri al, testin
 * kırıldığını gör, dosyayı geri yükle.
 *
 * Neden var: Codex denetimi BEŞ testin, düzeltme geri alındığında yeşil
 * kaldığını gösterdi. Testler geçiyordu, düzeltmeler doğruydu, ve testler
 * düzeltmeleri sabitlemiyordu — bir sonraki değişiklik onları sessizce geri
 * alabilirdi. Yeşil bir süit, korunan bir davranış demek değil.
 *
 * Bir testin değerini ölçmenin tek yolu, korumasını beklediğin şeyi bozup
 * kırılıp kırılmadığına bakmak. Bu betik onu yapıyor ve CI'da koşuyor.
 *
 * Node ile yazıldı, Python ile değil: bu bir Node projesi ve CI üç işletim
 * sisteminde koşuyor. `python` yürütülebiliri macOS koşucusunda yok — dil
 * seçimi yüzünden kırılan bir güvenlik kontrolü, olmayan bir kontroldür.
 *
 * Kullanım: node scripts/mutasyon-denemesi.mjs   (npm run mutasyon)
 */
import { readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const TUR3 = "test/security/codex-tur3.test.js";
const YAZMA = "test/security/yazma-siniri.test.js";

/**
 * Her satır: bir düzeltmeyi etkisiz kılan en küçük değişiklik.
 *
 * Mutasyon "kod bozma" değil, "düzeltmeyi geri alma" olmalı — rastgele bir
 * karakteri değiştirmek testin kırıldığını gösterir ama düzeltmenin
 * korunduğunu göstermez.
 */
const MUTASYONLAR = [
  {
    etiket: "sınır lint: ham metin kontrolü kaldırıldı",
    dosya: "scripts/gateway-boundary-check.mjs",
    eski: "  const hamVar = YASAK.some((desen) => desen.test(metin));",
    yeni: "  const hamVar = YASAK.some((desen) => desen.test(kodSatirlari(metin)));",
    test: TUR3,
  },
  {
    etiket: "ortam süzgeci: yeni kimlik önekleri kaldırıldı",
    dosya: "src/utils/gateway.js",
    eski: "|KUBECONFIG|DOCKER_CONFIG|GOOGLE_APPLICATION_CREDENTIALS|AZURE_|GH_TOKEN|GITLAB_|VAULT_|CLOUDSDK_|GIT_ASKPASS|SSH_ASKPASS|SUDO_ASKPASS|GIT_SSH_COMMAND|NETRC)",
    yeni: ")",
    test: TUR3,
  },
  {
    etiket: "maskText: YAML blok göstergesi kaldırıldı",
    dosya: "src/utils/secret-scanner.js",
    eski: "([>|](?:[0-9]*[-+]?|[-+]?[0-9]*))?",
    yeni: "[>|]?",
    test: TUR3,
  },
  {
    etiket: "yol politikası: tüm alanlar yerine yalnızca ilki",
    dosya: "src/utils/tool-path-policy.js",
    eski: "const hassas = yollar.find(({ ad, deger }) => hassasMi(expandPath(deger), toolName, ad));",
    yeni: "const hassas = null;",
    test: TUR3,
  },
  {
    etiket: "yol politikası: çıktı alanları yazma sayılmıyor",
    dosya: "src/utils/tool-path-policy.js",
    eski: "const write = yazanArac || (alanAdi != null && CIKTI_ALANLARI.has(alanAdi));",
    yeni: "const write = yazanArac;",
    test: TUR3,
  },
  {
    etiket: "doğrulama: sorgu alt komutu kontrolü kaldırıldı",
    dosya: "src/tools/agentic-runner.js",
    eski: "if (SORGU_ARGUMANI.test(komut) || SORGU_ALTKOMUTU.test(komut)) continue;",
    yeni: "if (SORGU_ARGUMANI.test(komut)) continue;",
    test: TUR3,
  },
  {
    etiket: "yazma sınırı: write_file kontrolü kaldırıldı",
    dosya: "src/tools/write_file.js",
    eski: "const sinir = await _siniriDogrula(filePath, params, 'write_file aracı');",
    yeni: "const sinir = { izin: true };",
    test: YAZMA,
  },
  {
    etiket: "yazma sınırı: edit_file kontrolü kaldırıldı",
    dosya: "src/tools/edit_file.js",
    eski: "const sinir = await yazmaSiniri(_expand(filePath), { onayli: onayli === true, amac: 'edit_file aracı' });",
    yeni: "const sinir = { izin: true };",
    test: YAZMA,
  },
  {
    etiket: "tamamlanma kapısı: kanıt yokken sessizce TAMAM",
    dosya: "src/utils/tamamlanma-kapisi.js",
    eski: "  const enFazla = opt.enFazlaKomut != null ? opt.enFazlaKomut : 1;",
    yeni: "  return { tamam: true, kanit: null, gerekce: 'mutasyon' };\n  const enFazla = opt.enFazlaKomut != null ? opt.enFazlaKomut : 1;",
    test: "test/security/tamamlanma-kapisi.test.js",
  },
  {
    etiket: "tamamlanma kapısı: kanıt olmayan komut kanıt sayılıyor",
    dosya: "src/utils/tamamlanma-kapisi.js",
    eski: "  const zaten = (opt.zatenCalisanlar || []).find((k) => kanitSayilir(k));",
    yeni: "  const zaten = (opt.zatenCalisanlar || [])[0];",
    test: "test/security/tamamlanma-kapisi.test.js",
  },
  {
    etiket: "yazma sınırı: onay yerine koşulsuz izin",
    dosya: "src/utils/gateway.js",
    eski: "const karar = await yazmaOnayiSor(mutlak, workspace, opt.amac);",
    yeni: "const karar = 'izin';",
    test: YAZMA,
  },
];

// vitest doğrudan Node ile çağrılıyor: `npx` bir `.cmd` sarmalayıcı olduğu
// için `shell: true` gerektiriyordu, o da argümanları kaçırmadan birleştiriyor
// (DEP0190). Güvenlik kontrolünün kendisi kabuk enjeksiyonuna açık olmamalı.
const VITEST = path.join(KOK, "node_modules", "vitest", "vitest.mjs");

function kos(test) {
  const r = spawnSync(process.execPath, [VITEST, "run", test, "--reporter=dot"], {
    cwd: KOK,
    encoding: "utf8",
    timeout: 900_000,
  });
  return r.status;
}

console.log("");
console.log("  Mutasyon denemesi — testler düzeltmeleri sabitliyor mu?");
console.log("  " + "─".repeat(58));

for (const test of [...new Set(MUTASYONLAR.map((m) => m.test))]) {
  if (kos(test) !== 0) {
    console.error(`  ✗ ${test} mutasyondan ÖNCE kırmızı — önce onu düzeltin.`);
    process.exit(1);
  }
}
console.log("  temel durum yeşil");
console.log("");

const hayattaKalan = [];
for (const m of MUTASYONLAR) {
  const yol = path.join(KOK, m.dosya);
  const yedek = `${yol}.mutbak`;
  copyFileSync(yol, yedek);
  try {
    const metin = readFileSync(yol, "utf8");
    if (!metin.includes(m.eski)) {
      console.log(`  ⚠ atlandı  ${m.etiket}`);
      console.log("              (desen bulunamadı — düzeltme değişmiş olabilir)");
      hayattaKalan.push(`${m.etiket} (desen bulunamadı)`);
      continue;
    }
    writeFileSync(yol, metin.replace(m.eski, m.yeni), "utf8");
    if (kos(m.test) === 0) {
      console.log(`  ✗ HAYATTA  ${m.etiket}`);
      console.log("              test KIRILMADI — bu düzeltme sabitlenmiyor");
      hayattaKalan.push(m.etiket);
    } else {
      console.log(`  ✓ öldü     ${m.etiket}`);
    }
  } finally {
    copyFileSync(yedek, yol);
    rmSync(yedek, { force: true });
  }
}

console.log("  " + "─".repeat(58));
if (hayattaKalan.length > 0) {
  console.log(`  ${hayattaKalan.length}/${MUTASYONLAR.length} mutasyon hayatta kaldı:`);
  for (const h of hayattaKalan) console.log(`    · ${h}`);
  console.log("");
  process.exit(1);
}
console.log(`  ${MUTASYONLAR.length}/${MUTASYONLAR.length} mutasyon öldü — düzeltmeler sabitlenmiş.`);
console.log("");
