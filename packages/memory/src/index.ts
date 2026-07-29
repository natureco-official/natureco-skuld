/**
 * memory — Urðr proje hafızası adaptörü.
 *
 * Urðr MCP stdio sunucusu olarak bağlanır (ADR-0001 Karar 3). Gömülü kütüphane
 * DEĞİL, çünkü kaynak denetiminde urðr'ın **hiç otomatik testi olmadığı**
 * ölçüldü: doğrulanmamış kodu Skuld'un süreç alanına almak, oradaki bir hatayı
 * Skuld'un hatası yapar. Süreç sınırı aynı zamanda güvenlik sınırıdır.
 *
 * Bu dosyadaki sözleşme testleri (tests/integration/hafiza.test.ts) upstream'de
 * olmayan güvenceyi Skuld tarafında kurar.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { kullaniciHatasi, SkuldHatasi } from "@skuld/shared";
import { McpStdioIstemcisi } from "@skuld/execution-gateway";
import type { ExecutionGateway, JsonRpcYanit } from "@skuld/execution-gateway";

/** Hafıza kapsamı. Kapsamlar birbirine SIZMAZ (ADR-0002, T9). */
export type Kapsam = "global" | "proje" | "dal";

export interface Hatira {
  readonly metin: string;
  readonly kok: string;
  readonly dal: string;
  readonly kapsam: Kapsam;
  /** Nereden geldiği: hangi görev, hangi oturum. */
  readonly kaynak: string;
  readonly guven: number;
  readonly zaman: string;
}

export interface HatirlamaSonucu {
  readonly hatiralar: readonly Hatira[];
  readonly aramaSuresiMs: number;
}

export interface HafizaAyarlari {
  readonly gateway: ExecutionGateway;
  /** Urðr hafıza ağacının kökü. */
  readonly hafizaDizini: string;
  /** MCP sunucusunun yolu. */
  readonly sunucuYolu: string;
  /** Proje kimliği — kapsam ayrımı için. */
  readonly projeAdi: string;
  readonly dalAdi?: string;
}

/**
 * Kapsam → kök dosya eşlemesi.
 *
 * Urðr ağacı dört köklü. Skuld'un kapsamlarını bu köklere sabitliyoruz ki
 * bir projede öğrenilen şey başka projeye sızmasın: dal/proje kapsamındaki
 * her yaprak metnine kapsam etiketi yazılır ve arama o etiketle daraltılır.
 */
const KOK_DOSYA = "root-3-decisions.md";
const DAL_ADI = "Kararlar";

export class UrdrHafiza {
  readonly #istemci = new McpStdioIstemcisi();
  readonly #ayar: HafizaAyarlari;
  #bagli = false;
  #bagliDegilNedeni = "henüz bağlanılmadı";

  constructor(ayar: HafizaAyarlari) {
    this.#ayar = ayar;
  }

  get bagliMi(): boolean {
    return this.#bagli;
  }
  get bagliDegilNedeni(): string {
    return this.#bagliDegilNedeni;
  }

  /**
   * Bağlanır. Başarısız olursa HATA FIRLATMAZ — ilke 6: hafıza yoksa temel
   * ajan çalışmaya devam etmeli ve eksikliği dürüstçe bildirmeli.
   */
  async bagla(): Promise<boolean> {
    try {
      await this.#istemci.baglan(
        this.#ayar.gateway,
        process.execPath,
        [this.#ayar.sunucuYolu, "--root", this.#ayar.hafizaDizini],
        "Urðr proje hafızası",
      );
      this.#bagli = true;
      return true;
    } catch (hata) {
      this.#bagli = false;
      this.#bagliDegilNedeni = hata instanceof Error ? hata.message : String(hata);
      return false;
    }
  }

  /** Kapsam etiketi — yaprak metnine gömülür, arama bununla daraltılır. */
  #etiket(kapsam: Kapsam): string {
    switch (kapsam) {
      case "global":
        return "[skuld:global]";
      case "proje":
        return `[skuld:proje:${this.#ayar.projeAdi}]`;
      case "dal":
        return `[skuld:dal:${this.#ayar.projeAdi}@${this.#ayar.dalAdi ?? "main"}]`;
    }
  }

  /**
   * İlgili hatıraları getirir.
   *
   * ÖNEMLİ (ADR-0002, T9): dönen metin **veri**dir, talimat değil. Çağıran
   * bunu modele bağlam olarak verir; içinde "şunu çalıştır" yazsa bile bu bir
   * komut değildir. Zehirlenmiş hafıza, kalıcı prompt injection demektir.
   */
  async hatirla(gorev: string, kapsamlar: readonly Kapsam[] = ["proje", "global"]): Promise<HatirlamaSonucu> {
    if (!this.#bagli) return { hatiralar: [], aramaSuresiMs: 0 };
    const basladi = Date.now();
    const hatiralar: Hatira[] = [];

    // Görevden anahtar kelimeler — çok kısa olanlar gürültü üretir.
    const kelimeler = gorev
      .toLowerCase()
      .split(/[^\p{L}\p{N}_]+/u)
      .filter((k) => k.length >= 4)
      .slice(0, 6);
    if (kelimeler.length === 0) return { hatiralar: [], aramaSuresiMs: Date.now() - basladi };

    for (const kapsam of kapsamlar) {
      const etiket = this.#etiket(kapsam);
      for (const kelime of kelimeler) {
        let yanit: JsonRpcYanit;
        try {
          yanit = await this.#istemci.cagir("tools/call", {
            name: "urdr_search",
            arguments: {
              // memoryDir gonderilmez: sunucu --root ile zaten bu agaca bagli
              // ve mutlak yol "must be relative to the configured server root"
              // hatasi veriyor. Varsayilani "." ve dogrusu bu.
              query: kelime,
              mode: "literal",
              maxResults: 5,
            },
          });
        } catch {
          continue; // arama düşerse hafızasız devam; görevi düşürme
        }
        const metin = yanit.result?.content?.map((c) => c.text ?? "").join("\n") ?? "";
        for (const satir of metin.split("\n")) {
          if (!satir.includes(etiket)) continue;
          if (hatiralar.some((h) => h.metin === satir)) continue;
          hatiralar.push({
            metin: satir.replace(etiket, "").trim(),
            kok: KOK_DOSYA,
            dal: DAL_ADI,
            kapsam,
            kaynak: "urdr",
            guven: 0.7,
            zaman: new Date().toISOString(),
          });
        }
      }
    }

    return { hatiralar: hatiralar.slice(0, 8), aramaSuresiMs: Date.now() - basladi };
  }

  /**
   * Kalıcı değeri olan bir kararı yazar.
   *
   * Ham sohbet yazılmaz (prompt §REMEMBER). Her yaprak kaynak, zaman ve
   * kapsam etiketi taşır ki sonradan nereden geldiği bilinsin.
   */
  async hatirlat(karar: string, kapsam: Kapsam, kaynak: string): Promise<boolean> {
    if (!this.#bagli) return false;
    const temiz = karar.replace(/\r?\n/g, " ").trim();
    if (!temiz) throw kullaniciHatasi("boş hatıra yazılamaz");
    // Urðr başlık içeren yaprağı reddediyor; '#' ile başlayan satır üretmeyelim.
    if (/^#/.test(temiz)) throw kullaniciHatasi("hatıra Markdown başlığıyla başlayamaz");

    const yaprak = `- ${this.#etiket(kapsam)} **${new Date().toISOString().slice(0, 10)}:** ${temiz} _(kaynak: ${kaynak})_`;

    try {
      const yanit = await this.#istemci.cagir("tools/call", {
        name: "urdr_append",
        arguments: {
          rootFile: KOK_DOSYA,
          branch: DAL_ADI,
          leafText: yaprak,
        },
      });
      // MCP araç hatası HTTP hatası gibi görünmez: isError bayrağına bakmak
      // şart, yoksa "yazıldı" der ve hiçbir şey yazmamış oluruz.
      if (yanit.result?.isError || yanit.error) {
        this.#bagliDegilNedeni =
          yanit.error?.message ?? yanit.result?.content?.map((c) => c.text).join(" ") ?? "bilinmiyor";
        return false;
      }
      return true;
    } catch (hata) {
      this.#bagliDegilNedeni = hata instanceof Error ? hata.message : String(hata);
      return false;
    }
  }

  async kapat(): Promise<void> {
    await this.#istemci.kapat();
    this.#bagli = false;
  }
}

/** Varsayılan urðr MCP sunucu yolunu bulur; yoksa null. */
export function urdrSunucusunuBul(): string | null {
  const adaylar = [
    process.env["URDR_MCP_PATH"],
    path.join(
      process.env["APPDATA"] ?? "",
      "npm",
      "node_modules",
      "urdr-mcp-server",
      "scripts",
      "mcp-server.mjs",
    ),
    "/usr/local/lib/node_modules/urdr-mcp-server/scripts/mcp-server.mjs",
  ].filter(Boolean) as string[];

  for (const aday of adaylar) {
    if (existsSync(aday)) return aday;
  }
  return null;
}
