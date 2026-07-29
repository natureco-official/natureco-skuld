import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { ExecutionGateway } from "../../packages/execution-gateway/src/index.ts";
import { UrdrHafiza, urdrSunucusunuBul } from "../../packages/memory/src/index.ts";

/**
 * Urðr sözleşme testleri.
 *
 * Bunlar upstream'de OLMAYAN güvenceyi kuruyor: kaynak denetiminde urðr'ın
 * sıfır otomatik testi olduğu ölçüldü, oysa README'si crash-safe işlemler ve
 * event-log bütünlüğü iddia ediyor. Skuld hafızayı ajanın kararları için
 * kullanacaksa, o iddiaları kendi tarafında sınamak zorunda.
 *
 * Sunucu kurulu değilse testler ATLANIR, başarısız olmaz — ama o makinede
 * hafıza sözleşmesinin doğrulanmadığı da böylece görünür olur.
 */

const gecici: string[] = [];
after(async () => {
  for (const d of gecici) await rm(d, { recursive: true, force: true });
});

const SUNUCU = urdrSunucusunuBul();

/** Boş ama geçerli bir Urðr ağacı kurar. */
async function agacKur(): Promise<string> {
  const kok = await mkdtemp(path.join(tmpdir(), "skuld-urdr-"));
  gecici.push(kok);
  await writeFile(
    path.join(kok, "root-3-decisions.md"),
    "# Kök-3: Kararlar\n\n## Kararlar\n\n## Bekleyen İşler\n",
    "utf8",
  );
  await writeFile(path.join(kok, "root-0-index.md"), "# Kök-0: İndeks\n\n## İndeks\n", "utf8");
  return kok;
}

async function hafizaKur(proje = "deneme-proje"): Promise<{ hafiza: UrdrHafiza; kok: string }> {
  const kok = await agacKur();
  const gateway = new ExecutionGateway({
    workspace: kok,
    onay: async () => "izin",
    onaysizKomutlar: new Set([path.basename(process.execPath).replace(/\.exe$/i, "")]),
  });
  const hafiza = new UrdrHafiza({
    gateway,
    hafizaDizini: kok,
    sunucuYolu: SUNUCU!,
    projeAdi: proje,
  });
  return { hafiza, kok };
}

describe("Urðr hafıza sözleşmesi", { skip: SUNUCU === null ? "urdr-mcp-server kurulu değil" : false }, () => {
  it("bağlanır ve yazdığını geri okur", async () => {
    const { hafiza, kok } = await hafizaKur();
    assert.equal(await hafiza.bagla(), true, `bağlanamadı: ${hafiza.bagliDegilNedeni}`);
    try {
      const yazildi = await hafiza.hatirlat(
        "Bu projede paket yoneticisi olarak npm kullaniliyor, pnpm degil",
        "proje",
        "test",
      );
      assert.equal(yazildi, true, `yazılamadı: ${hafiza.bagliDegilNedeni}`);

      // Dosyada gerçekten var mı — MCP "tamam" dedi diye inanmıyoruz.
      const icerik = await readFile(path.join(kok, "root-3-decisions.md"), "utf8");
      assert.match(icerik, /paket yoneticisi/, "yaprak dosyaya yazılmamış");

      const sonuc = await hafiza.hatirla("paket yoneticisi secimi");
      assert.ok(sonuc.hatiralar.length > 0, "yazılan hatıra geri okunamadı");
      assert.match(sonuc.hatiralar[0]!.metin, /npm/);
    } finally {
      await hafiza.kapat();
    }
  });

  it("kapsamlar birbirine SIZMAZ", async () => {
    // ADR-0002 T9: bir projede öğrenilen tercih başka projeye taşınamaz.
    const { hafiza, kok } = await hafizaKur("proje-A");
    assert.equal(await hafiza.bagla(), true);
    try {
      await hafiza.hatirlat("Proje A icin ozel karar: derleme hedefi es2019", "proje", "test");
      const kendi = await hafiza.hatirla("derleme hedefi");
      assert.ok(kendi.hatiralar.length > 0, "kendi kapsamında bulunamadı");
    } finally {
      await hafiza.kapat();
    }

    // Aynı ağaç, FARKLI proje adı: A'nın kararını görmemeli.
    const gateway = new ExecutionGateway({
      workspace: kok,
      onay: async () => "izin",
      onaysizKomutlar: new Set([path.basename(process.execPath).replace(/\.exe$/i, "")]),
    });
    const digeri = new UrdrHafiza({
      gateway,
      hafizaDizini: kok,
      sunucuYolu: SUNUCU!,
      projeAdi: "proje-B",
    });
    assert.equal(await digeri.bagla(), true);
    try {
      const sonuc = await digeri.hatirla("derleme hedefi");
      assert.equal(sonuc.hatiralar.length, 0, `proje-B, proje-A'nın kararını gördü: ${JSON.stringify(sonuc.hatiralar)}`);
    } finally {
      await digeri.kapat();
    }
  });

  it("hafıza bağlı değilken ajan çalışmaya devam eder (ilke 6)", async () => {
    const kok = await agacKur();
    const gateway = new ExecutionGateway({ workspace: kok, onay: async () => "izin" });
    const hafiza = new UrdrHafiza({
      gateway,
      hafizaDizini: kok,
      sunucuYolu: path.join(kok, "kesinlikle-yok.mjs"),
      projeAdi: "x",
    });

    const bagli = await hafiza.bagla();
    assert.equal(bagli, false, "olmayan sunucuya bağlanmış görünüyor");
    assert.equal(hafiza.bagliMi, false);
    assert.ok(hafiza.bagliDegilNedeni.length > 0, "neden bildirilmemiş");

    // Ve hatırlama sessizce boş döner, HATA FIRLATMAZ.
    const sonuc = await hafiza.hatirla("herhangi bir gorev");
    assert.deepEqual(sonuc.hatiralar, []);
    assert.equal(await hafiza.hatirlat("bir sey", "proje", "test"), false);
  });

  it("başlıkla başlayan hatırayı reddeder", async () => {
    const { hafiza } = await hafizaKur();
    assert.equal(await hafiza.bagla(), true);
    try {
      await assert.rejects(() => hafiza.hatirlat("# Baslik", "proje", "test"), /başlı[kğ]/i);
      await assert.rejects(() => hafiza.hatirlat("   ", "proje", "test"), /boş/i);
    } finally {
      await hafiza.kapat();
    }
  });

  it("aynı hatıra iki kez yazılabilir ve ağaç bozulmaz", async () => {
    // Urðr'ın kendi testi olmadığı için tekrarlı yazmanın ağacı bozup
    // bozmadığını burada sınıyoruz.
    const { hafiza, kok } = await hafizaKur();
    assert.equal(await hafiza.bagla(), true);
    try {
      // Yazmanın GERÇEKTEN olduğunu doğrula. İlk hâli bunu kontrol etmiyordu
      // ve yazma sessizce başarısızken bile yeşil kalıyordu — testin ağaç
      // bozulmadı demesi, hiçbir şey yazılmadıysa anlamsız.
      assert.equal(await hafiza.hatirlat("Tekrarlanan karar metni", "proje", "test"), true);
      assert.equal(await hafiza.hatirlat("Tekrarlanan karar metni", "proje", "test"), true);

      const icerik = await readFile(path.join(kok, "root-3-decisions.md"), "utf8");
      const adet = (icerik.match(/Tekrarlanan karar metni/g) ?? []).length;
      assert.equal(adet, 2, `iki yazma bekleniyordu, ${adet} bulundu`);
      // Ağaç hâlâ geçerli: başlıklar duruyor.
      assert.match(icerik, /^## Kararlar$/m);
      assert.match(icerik, /^## Bekleyen İşler$/m);
      assert.ok(existsSync(path.join(kok, "root-0-index.md")));
    } finally {
      await hafiza.kapat();
    }
  });
});
