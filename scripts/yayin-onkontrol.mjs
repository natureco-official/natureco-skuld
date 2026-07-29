#!/usr/bin/env node
/**
 * Yayın ön kontrolü — paketlenmiş hâlin GERÇEKTEN çalıştığını doğrular.
 *
 * Neden var: `npm pack` çıktısı incelendiğinde paketin `packages/` dizinini
 * hiç içermediği görüldü. Köprü kapıyı `packages/execution-gateway/dist`ten
 * yüklüyor, yani yayınlanan `nskuld` kapıyı açamaz, `yazmaSiniri` "sınır
 * uygulanamadı" der ve **hiçbir dosya yazamaz.** Ürün tamamen çalışmaz hâlde
 * yayınlanacaktı ve depoda 1200 test yeşildi.
 *
 * Ders: depoda çalışmak, PAKETTE çalışmak demek değil. `files` listesine
 * bakmak da yetmez — liste doğru görünüp yol yanlış olabilir. Tek güvenilir
 * kontrol paketi açıp içinden çalıştırmak.
 *
 * `prepublishOnly` içinde koşuyor, yani yayınlamayı unutulamaz biçimde
 * engelliyor.
 *
 * Kullanım: node scripts/yayin-onkontrol.mjs
 */
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Pakette bulunması ZORUNLU yollar ve neden zorunlu oldukları. */
const ZORUNLU = [
  ["bin/nskuld.js", "giriş noktası"],
  ["src/utils/gateway.js", "kapı köprüsü"],
  ["packages/execution-gateway/dist/index.js", "güvenlik kapısı — yoksa hiçbir dosya yazılamaz"],
  ["packages/shared/dist/index.js", "kapının bağımlılığı"],
  ["src/utils/tamamlanma-kapisi.js", "kanıta dayalı tamamlanma"],
  ["src/utils/farklilastiricilar.js", "hafıza + kalite kapısı köprüsü"],
];

let hata = 0;
const gecici = mkdtempSync(path.join(tmpdir(), "skuld-yayin-"));

try {
  console.log("");
  console.log("  Yayın ön kontrolü");
  console.log("  " + "─".repeat(58));

  // 1. Paketi üret ve aç.
  const paketAdi = execFileSync("npm", ["pack", "--silent", "--pack-destination", gecici], {
    cwd: KOK, encoding: "utf8", shell: process.platform === "win32",
  }).trim().split(/\r?\n/).pop();

  const tgz = path.join(gecici, paketAdi);
  if (!existsSync(tgz)) throw new Error(`paket üretilemedi: ${paketAdi}`);
  // `tar` GÖRELİ adla ve `cwd` ile çağrılıyor: Windows'ta mutlak yol verilince
  // `C:` bir uzak sunucu adı sanılıyor ("Cannot connect to C: resolve failed").
  execFileSync("tar", ["-xzf", paketAdi], { cwd: gecici, stdio: "pipe" });
  const kok = path.join(gecici, "package");
  console.log(`  paket açıldı: ${paketAdi}`);

  // 2. Zorunlu dosyalar var mı?
  for (const [yol, neden] of ZORUNLU) {
    if (existsSync(path.join(kok, yol))) {
      console.log(`  ✓ ${yol}`);
    } else {
      console.log(`  ✗ ${yol}  EKSİK — ${neden}`);
      hata++;
    }
  }

  // 3. `--version` paketten çalışıyor mu? Bağımlılıklar kurulmadığı için
  //    tam bir çalıştırma beklenmiyor; hızlı yol `require`'a girmeden yanıt
  //    veriyor ve bu, dosyanın bozulmadığını gösterir.
  const surum = spawnSync(process.execPath, [path.join(kok, "bin", "nskuld.js"), "--version"], {
    encoding: "utf8", timeout: 30000,
  });
  if (surum.status === 0 && /\d+\.\d+\.\d+/.test(surum.stdout || "")) {
    console.log(`  ✓ paketten --version: ${surum.stdout.trim()}`);
  } else {
    console.log("  ✗ paketten --version çalışmadı");
    hata++;
  }

  // 4. Kapı paket içinden YÜKLENEBİLİYOR mu? Kritik kontrol bu: dosyanın
  //    varlığı yetmez, import edilebilmesi gerekiyor.
  const kapiYolu = path.join(kok, "packages", "execution-gateway", "dist", "index.js");
  if (existsSync(kapiYolu)) {
    const yukleme = spawnSync(
      process.execPath,
      ["--input-type=module", "-e",
        `const m = await import(${JSON.stringify(new URL(`file:///${kapiYolu.replace(/\\/g, "/")}`).href)});`
        + "if (typeof m.ExecutionGateway !== 'function') { console.error('ExecutionGateway yok'); process.exit(1); }"
        + "console.log('ok');"],
      { encoding: "utf8", timeout: 30000, cwd: kok },
    );
    if (yukleme.status === 0) {
      console.log("  ✓ kapı paket içinden yüklenebiliyor");
    } else {
      console.log(`  ✗ kapı YÜKLENEMİYOR: ${(yukleme.stderr || "").trim().split("\n")[0]}`);
      hata++;
    }
  }

  // 5. Fork'tan devralınan, artık yanlış ürünü anlatan belgeler yayına
  //    girmemeli. Kullanıcıya başka bir ürünün sürüm notunu göndermek,
  //    yardımın var olmayan komut tanıtmasıyla aynı sınıf hata.
  const devralinan = ["DEPLOY_v2.0.0.md", "SECURITY_AUDIT_SUMMARY.md", "AUDIT.md"];
  const bulunan = devralinan.filter((d) => existsSync(path.join(kok, d)));
  if (bulunan.length > 0) {
    console.log(`  · uyarı: fork'tan devralınan belgeler pakette: ${bulunan.join(", ")}`);
    console.log("           (engellemiyor — ama Skuld'u değil natureco-cli'yi anlatıyorlar)");
  }

  console.log("  " + "─".repeat(58));
  if (hata > 0) {
    console.log(`  ${hata} sorun — YAYINLAMAYIN.`);
    console.log("");
    process.exit(1);
  }
  console.log(`  Paket çalışır durumda (${readdirSync(kok).length} üst düzey giriş).`);
  console.log("");
} finally {
  rmSync(gecici, { recursive: true, force: true });
}
