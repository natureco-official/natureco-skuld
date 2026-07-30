/**
 * quality-gate — CodeDNA kalite kapısı.
 *
 * İki farklı güvenilirlikte sinyal var ve KARIŞTIRILMAMALARI kapının bütün
 * meselesi:
 *
 *  1. **Korumalı modül ihlali** — yerel, kesin, BLOKLAR. Ajanın dokunmaması
 *     gereken bir dosyaya yazıp yazmadığı bir yorum değil, olgu.
 *
 *  2. **CodeDNA sezgileri** — karmaşıklık, anlama borcu, "AI yazmış olma
 *     olasılığı", güvenlik taraması. Bunlar BLOKLAMAZ, rapor eder.
 *
 * Neden 2. sınıf bloklamıyor: bu depoda `codedna security-check` üç uyarı
 * verdi ve **ikisi yanlış pozitifti** — `.gitignore` içindeki `node_modules/`
 * ve `__pycache__/` kurallarını sondaki eğik çizgi yüzünden görmedi. Yanlış
 * alarm veren bir kapı, görmezden gelinen kapıya dönüşür; bir süre sonra
 * gerçek bulguyu da kimse okumaz.
 *
 * `ai_probability` özellikle bilgi amaçlıdır. Kimin yazdığı tahmini, kodun
 * doğru ya da güvenli olduğunun kanıtı değildir.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import type { ExecutionGateway } from "@skuld/execution-gateway";

export interface DosyaOlcumu {
  readonly dosya: string;
  readonly aiOlasiligi: number;
  readonly karmasiklik: string;
  readonly satir: number;
  readonly anlamaTahmini: number | null;
}

export interface TaramaSonucu {
  readonly surum: string;
  readonly dosyaSayisi: number;
  readonly ortalamaAi: number;
  readonly dosyalar: readonly DosyaOlcumu[];
}

export interface KapiBulgusu {
  /** `blok` yalnızca korumalı modül ihlalinde kullanılır. */
  readonly seviye: "blok" | "uyari" | "bilgi";
  readonly baslik: string;
  readonly ayrinti: string;
  /** Sezgisel sinyaller işaretlenir; okuyucu ağırlığını buna göre verir. */
  readonly sezgisel: boolean;
}

export interface KapiRaporu {
  readonly bulgular: readonly KapiBulgusu[];
  readonly blokluyorMu: boolean;
  readonly codednaCalisti: boolean;
  readonly codednaYokNedeni: string | null;
}

export interface KapiAyarlari {
  readonly gateway: ExecutionGateway;
  /** `codedna` çalıştırılabilirinin yolu; yoksa kapı sezgisel kısmı atlar. */
  readonly codednaYolu: string | null;
  /**
   * Dokunulması onay gerektiren yollar (glob değil, önek eşleşmesi).
   * Kısa tutulur: uzun liste, gerçek koruma yerine gürültü üretir.
   */
  readonly korumaliYollar?: readonly string[];
  readonly zamanAsimiMs?: number;
}

/** CodeDNA çalıştırılabilirini arar; bulunamazsa null. */
export function codednaBul(): string | null {
  const configured = process.env["CODEDNA_PATH"];
  if (configured) {
    return path.isAbsolute(configured) && existsSync(configured) ? configured : null;
  }

  // `spawn(..., { shell:false })` safely resolves executable names through PATH.
  // Requiring an absolute path made every normal `pip install codedna`
  // installation look unavailable.
  return process.platform === "win32" ? "codedna.exe" : "codedna";
}

export class KaliteKapisi {
  readonly #gw: ExecutionGateway;
  readonly #codedna: string | null;
  readonly #korumali: readonly string[];
  readonly #zamanAsimi: number;

  constructor(ayar: KapiAyarlari) {
    this.#gw = ayar.gateway;
    this.#codedna = ayar.codednaYolu;
    this.#korumali = ayar.korumaliYollar ?? [];
    this.#zamanAsimi = ayar.zamanAsimiMs ?? 60_000;
  }

  /**
   * Korumalı modül kontrolü. Yerel, anlık, CodeDNA gerektirmez.
   *
   * Bu kapının BLOKLAYAN tek parçası olmasının sebebi: sonucu bir ölçüm değil,
   * bir olgu. "Bu dosyaya dokunuldu mu" sorusunun yanlış pozitifi yoktur.
   */
  korumaliIhlali(degisenDosyalar: readonly string[], ekKorumali: readonly string[] = []): KapiBulgusu[] {
    const bulgular: KapiBulgusu[] = [];
    for (const dosya of degisenDosyalar) {
      const normal = dosya.replace(/\\/g, "/");
      for (const korumali of [...this.#korumali, ...ekKorumali]) {
        const k = korumali.replace(/\\/g, "/").replace(/\/+$/, "");
        if (normal === k || normal.startsWith(k + "/")) {
          bulgular.push({
            seviye: "blok",
            baslik: "korumalı modül değiştirildi",
            ayrinti: `${normal} — koruma kuralı: ${korumali}`,
            sezgisel: false,
          });
        }
      }
    }
    return bulgular;
  }

  /** CodeDNA'nın kendi veritabanındaki aktif korumalı yolları okur. */
  async korumaliYollariOku(projeKoku: string): Promise<string[]> {
    if (!this.#codedna) return [];
    try {
      const sonuc = await this.#gw.calistir({
        komut: this.#codedna,
        argumanlar: ["export", "--repo", projeKoku, "--format", "json"],
        zamanAsimiMs: this.#zamanAsimi,
      });
      if (sonuc.cikisKodu !== 0) return [];
      const ilk = sonuc.stdout.indexOf("{");
      if (ilk < 0) return [];
      const ham = JSON.parse(sonuc.stdout.slice(ilk)) as {
        protected_modules?: Array<{ file_path?: string; is_active?: number | boolean }>;
      };
      return (ham.protected_modules ?? [])
        .filter(item => item.file_path && item.is_active !== 0 && item.is_active !== false)
        .map(item => path.relative(projeKoku, String(item.file_path)).replace(/\\/g, "/"));
    } catch {
      return [];
    }
  }

  /** `codedna scan --json` çağırır. Çalışmazsa null döner; hata fırlatmaz. */
  async tara(projeKoku: string): Promise<TaramaSonucu | null> {
    if (!this.#codedna) return null;
    try {
      const sonuc = await this.#gw.calistir({
        komut: this.#codedna,
        argumanlar: ["scan", "--repo", projeKoku, "--max", "200", "--json"],
        zamanAsimiMs: this.#zamanAsimi,
      });
      if (sonuc.cikisKodu !== 0) return null;
      const ilk = sonuc.stdout.indexOf("{");
      if (ilk < 0) return null;
      const ham = JSON.parse(sonuc.stdout.slice(ilk)) as {
        version?: string;
        file_count?: number;
        avg_ai_probability?: number;
        files?: Array<{
          file: string;
          ai_probability: number;
          complexity: string;
          lines: number;
          understanding_estimate: number | null;
        }>;
      };
      return {
        surum: ham.version ?? "?",
        dosyaSayisi: ham.file_count ?? 0,
        ortalamaAi: ham.avg_ai_probability ?? 0,
        dosyalar: (ham.files ?? []).map((f) => ({
          dosya: f.file,
          aiOlasiligi: f.ai_probability,
          karmasiklik: f.complexity,
          satir: f.lines,
          anlamaTahmini: f.understanding_estimate,
        })),
      };
    } catch {
      return null;
    }
  }

  /**
   * Değişiklik sonrası kapıyı çalıştırır.
   *
   * `taban` verilmişse ÖNCESİ/SONRASI karşılaştırılır. Verilmemişse mutlak
   * değerler raporlanır ve bunun karşılaştırma OLMADIĞI açıkça söylenir —
   * tek başına mutlak bir skor, "kötüleşti mi" sorusunu cevaplamaz.
   */
  async degerlendir(
    projeKoku: string,
    degisenDosyalar: readonly string[],
    taban: TaramaSonucu | null,
  ): Promise<KapiRaporu> {
    const codednaKorumali = await this.korumaliYollariOku(projeKoku);
    const bulgular: KapiBulgusu[] = [...this.korumaliIhlali(degisenDosyalar, codednaKorumali)];

    if (!this.#codedna) {
      return {
        bulgular,
        blokluyorMu: bulgular.some((b) => b.seviye === "blok"),
        codednaCalisti: false,
        codednaYokNedeni:
          "codedna bulunamadı — CODEDNA_PATH ayarlayın ya da `pip install codedna`. Temel ajan etkilenmez.",
      };
    }

    const sonra = await this.tara(projeKoku);
    if (!sonra) {
      return {
        bulgular,
        blokluyorMu: bulgular.some((b) => b.seviye === "blok"),
        codednaCalisti: false,
        codednaYokNedeni: "codedna çalıştı ama sonuç okunamadı",
      };
    }

    const degisenSet = new Set(degisenDosyalar.map((d) => path.resolve(projeKoku, d).replace(/\\/g, "/")));
    const ilgili = sonra.dosyalar.filter((d) => degisenSet.has(d.dosya.replace(/\\/g, "/")));

    for (const d of ilgili) {
      const goreli = path.relative(projeKoku, d.dosya).replace(/\\/g, "/");
      const oncesi = taban?.dosyalar.find((t) => t.dosya.replace(/\\/g, "/") === d.dosya.replace(/\\/g, "/"));

      if (oncesi) {
        const anlamaFarki =
          d.anlamaTahmini !== null && oncesi.anlamaTahmini !== null
            ? d.anlamaTahmini - oncesi.anlamaTahmini
            : null;
        if (oncesi.karmasiklik !== d.karmasiklik) {
          bulgular.push({
            seviye: "uyari",
            baslik: "karmaşıklık değişti",
            ayrinti: `${goreli}: ${oncesi.karmasiklik} → ${d.karmasiklik} (${oncesi.satir} → ${d.satir} satır)`,
            sezgisel: true,
          });
        }
        if (anlamaFarki !== null && anlamaFarki > 0.5) {
          bulgular.push({
            seviye: "uyari",
            baslik: "anlama borcu arttı",
            ayrinti: `${goreli}: ${oncesi.anlamaTahmini} → ${d.anlamaTahmini}`,
            sezgisel: true,
          });
        }
      } else {
        bulgular.push({
          seviye: "bilgi",
          baslik: "değişiklik ölçüldü (karşılaştırma yok)",
          ayrinti:
            `${goreli}: karmaşıklık ${d.karmasiklik}, ${d.satir} satır. ` +
            `Taban ölçüm alınmadığı için "kötüleşti mi" sorusu CEVAPLANMIYOR.`,
          sezgisel: true,
        });
      }
    }

    return {
      bulgular,
      // CodeDNA sinyalleri asla bloklamaz; yalnızca korumalı modül bloklar.
      blokluyorMu: bulgular.some((b) => b.seviye === "blok"),
      codednaCalisti: true,
      codednaYokNedeni: null,
    };
  }
}
