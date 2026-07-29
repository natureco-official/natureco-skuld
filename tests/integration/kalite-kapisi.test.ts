import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { ExecutionGateway } from "../../packages/execution-gateway/src/index.ts";
import { KaliteKapisi } from "../../packages/quality-gate/src/index.ts";

/**
 * Kalite kapısının iki sinyali farklı güvenilirlikte ve testler bu ayrımı
 * sabitliyor:
 *
 *  - korumalı modül ihlali → BLOKLAR (olgu, yanlış pozitifi yok)
 *  - CodeDNA sezgileri     → bloklamaz (bu depoda 3 uyarının 2'si yanlış
 *    pozitifti: `.gitignore` içindeki `node_modules/` ve `__pycache__/`
 *    kurallarını sondaki eğik çizgi yüzünden görmedi)
 *
 * Yanlış alarm veren kapı, görmezden gelinen kapıya dönüşür.
 */

const gecici: string[] = [];
after(async () => {
  for (const d of gecici) await rm(d, { recursive: true, force: true });
});

async function projeKur(): Promise<string> {
  const kok = await mkdtemp(path.join(tmpdir(), "skuld-kapi-"));
  gecici.push(kok);
  await mkdir(path.join(kok, "src", "cekirdek"), { recursive: true });
  await writeFile(path.join(kok, "src", "normal.ts"), "export const a = 1;\n", "utf8");
  await writeFile(path.join(kok, "src", "cekirdek", "kritik.ts"), "export const b = 2;\n", "utf8");
  return kok;
}

function kapiKur(kok: string, korumali: string[], codedna: string | null = null): KaliteKapisi {
  const gateway = new ExecutionGateway({ workspace: kok, onay: async () => "izin" });
  return new KaliteKapisi({ gateway, codednaYolu: codedna, korumaliYollar: korumali });
}

describe("kalite kapısı", () => {
  it("korumalı yola yazılırsa BLOKLAR", async () => {
    const kok = await projeKur();
    const kapi = kapiKur(kok, ["src/cekirdek"]);

    const rapor = await kapi.degerlendir(kok, ["src/cekirdek/kritik.ts"], null);
    assert.equal(rapor.blokluyorMu, true);
    const blok = rapor.bulgular.find((b) => b.seviye === "blok");
    assert.ok(blok, "blok bulgusu yok");
    assert.equal(blok.sezgisel, false, "korumalı modül ihlali sezgisel değildir");
    assert.match(blok.ayrinti, /kritik\.ts/);
  });

  it("korumasız yola yazılırsa bloklamaz", async () => {
    const kok = await projeKur();
    const kapi = kapiKur(kok, ["src/cekirdek"]);
    const rapor = await kapi.degerlendir(kok, ["src/normal.ts"], null);
    assert.equal(rapor.blokluyorMu, false);
  });

  it("korumalı yolun ÖNEKİNİ paylaşan farklı dizini bloklamaz", async () => {
    // `src/cekirdek` koruması `src/cekirdek-yedek` dosyasını yakalamamalı.
    // Düz `startsWith` kullansaydık yakalardı ve gerçek olmayan bir ihlal
    // üretirdi; kapı güvenilirliğini böyle kaybeder.
    const kok = await projeKur();
    const kapi = kapiKur(kok, ["src/cekirdek"]);
    const rapor = await kapi.degerlendir(kok, ["src/cekirdek-yedek/dosya.ts"], null);
    assert.equal(rapor.blokluyorMu, false, "önek benzerliği ihlal sayıldı");
  });

  it("CodeDNA yoksa ajan çalışmaya devam eder ve nedeni söyler (ilke 6)", async () => {
    const kok = await projeKur();
    const kapi = kapiKur(kok, [], null);
    const rapor = await kapi.degerlendir(kok, ["src/normal.ts"], null);

    assert.equal(rapor.codednaCalisti, false);
    assert.match(String(rapor.codednaYokNedeni), /codedna bulunamadı/i);
    assert.equal(rapor.blokluyorMu, false, "CodeDNA'nın yokluğu bloklama sebebi değil");
  });

  it("CodeDNA yokken bile korumalı modül kapısı çalışır", async () => {
    // Bloklayan parça CodeDNA'ya bağımlı OLMAMALI; yoksa Python kurulu
    // olmayan makinede koruma sessizce kaybolur.
    const kok = await projeKur();
    const kapi = kapiKur(kok, ["src/cekirdek"], null);
    const rapor = await kapi.degerlendir(kok, ["src/cekirdek/kritik.ts"], null);
    assert.equal(rapor.blokluyorMu, true);
    assert.equal(rapor.codednaCalisti, false);
  });

  it("taban ölçüm yoksa bunu açıkça söyler", async () => {
    const kok = await projeKur();
    const kapi = kapiKur(kok, []);
    const bulgular = kapi.korumaliIhlali(["src/normal.ts"]);
    assert.deepEqual(bulgular, [], "korumasız dosya bulgu üretmemeli");
  });
});

// NOT: "engellenen koşum hafızaya yazılmaz" testi buraya taşınmadı —
// Skuld'un kendi agent-core'una bağlıydı ve fork'un kendi ajan döngüsü var.
// Kalite kapısı ajan döngüsüne bağlanınca eşdeğeri yeniden yazılacak.
