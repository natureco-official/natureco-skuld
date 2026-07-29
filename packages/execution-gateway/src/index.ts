/**
 * execution-gateway — süreç başlatmanın TEK yeri.
 *
 * Bütün kabuk, git, test ve araç çalıştırmaları buradan geçer. Bu paketin
 * dışında `child_process` import etmek CI hatasıdır
 * (`scripts/gateway-boundary-check.mjs`).
 *
 * Neden tek kapı: kaynak denetiminde natureco-cli'de 71 dosyanın süreç
 * başlattığı, policy katmanınınsa 577 satır olduğu ölçüldü. Onay, workspace
 * sınırı, symlink kontrolü ve sır maskeleme dağıtıldığı anda biri eksik kalır.
 * Burada hepsi tek yolda.
 */
import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import {
  ciktiyiSinirla,
  politikaReddi,
  sirlariMaskele,
  kullaniciHatasi,
  SkuldHatasi,
} from "@skuld/shared";

export type IzinSinifi = "oku" | "yaz" | "calistir" | "ag";

export type OnayKarari = "izin" | "ret";

/**
 * Onay isteyen taraf. CLI bunu bir prompt'a, CI modu ise otomatik ret'e bağlar.
 * Gateway kimin onayladığını bilmez — yalnızca onay ister.
 */
export type OnayIsteyici = (istek: OnayIstegi) => Promise<OnayKarari>;

export interface OnayIstegi {
  readonly sinif: IzinSinifi;
  /** Kullanıcıya gösterilecek GERÇEK komut — kısaltılmış değil. */
  readonly komut: string;
  readonly cwd: string;
  /** Neden onay isteniyor: "dosya siliyor", "workspace dışına yazıyor" gibi. */
  readonly gerekce: string;
  readonly hedef?: string | undefined;
}

export interface GatewayAyarlari {
  /** Ajanın çalışabileceği kök. Buranın dışı varsayılan olarak yasak. */
  readonly workspace: string;
  readonly onay: OnayIsteyici;
  /** Onaysız çalışmasına izin verilen komutlar (ör. salt okunur olanlar). */
  readonly onaysizKomutlar?: ReadonlySet<string>;
  readonly zamanAsimiMs?: number;
  readonly enFazlaCiktiKarakteri?: number;
}

export interface CalistirmaIstegi {
  readonly komut: string;
  readonly argumanlar: readonly string[];
  readonly cwd?: string;
  readonly zamanAsimiMs?: number;
}

export interface CalistirmaSonucu {
  readonly komut: string;
  readonly cikisKodu: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly sureMs: number;
  readonly kesildi: boolean;
  readonly zamanAsimi: boolean;
}

/** Tehlikeli sayılan ve her hâlükârda onay isteyen desenler. */
const YIKICI_DESENLER: Array<[RegExp, string]> = [
  [/^rm$/i, "dosya siliyor"],
  [/^rmdir$/i, "dizin siliyor"],
  [/^del$/i, "dosya siliyor"],
  [/^mv$/i, "dosya taşıyor"],
  [/^dd$/i, "ham disk yazıyor"],
  [/^chmod$/i, "izin değiştiriyor"],
  [/^chown$/i, "sahiplik değiştiriyor"],
  [/^curl$/i, "ağa çıkıyor"],
  [/^wget$/i, "ağa çıkıyor"],
  [/^ssh$/i, "uzak makineye bağlanıyor"],
  [/^npm$/i, "paket yöneticisi — kurulum/yayın yapabilir"],
  [/^npx$/i, "indirilen kod çalıştırabilir"],
  [/^pip$/i, "paket yöneticisi"],
  [/^git$/i, "depo durumunu değiştirebilir"],
];

const VARSAYILAN_ZAMAN_ASIMI = 120_000;
const VARSAYILAN_CIKTI_SINIRI = 200_000;

export class ExecutionGateway {
  readonly #workspace: string;
  readonly #onay: OnayIsteyici;
  readonly #onaysiz: ReadonlySet<string>;
  readonly #zamanAsimi: number;
  readonly #ciktiSiniri: number;

  constructor(ayarlar: GatewayAyarlari) {
    this.#workspace = path.resolve(ayarlar.workspace);
    this.#onay = ayarlar.onay;
    this.#onaysiz = ayarlar.onaysizKomutlar ?? new Set();
    this.#zamanAsimi = ayarlar.zamanAsimiMs ?? VARSAYILAN_ZAMAN_ASIMI;
    this.#ciktiSiniri = ayarlar.enFazlaCiktiKarakteri ?? VARSAYILAN_CIKTI_SINIRI;
  }

  get workspace(): string {
    return this.#workspace;
  }

  /** Uzun ömürlü süreç açar (MCP stdio sunucusu gibi). */
  async surecAc(istek: SurecIstegi): Promise<SurecTutamaci> {
    return await ExecutionGatewayEk.ac(this, this.#onay, this.#onaysiz, istek);
  }

  /**
   * Bir yolun workspace içinde kaldığını doğrular.
   *
   * `realpath` ŞART: yalnızca string karşılaştırması yapmak symlink kaçışını
   * kaçırır. `workspace/link -> /etc` durumunda düz karşılaştırma "içeride"
   * der. Var olmayan yolda üst dizinden yukarı çıkarak çözülür, çünkü yeni
   * dosya yazarken hedef henüz yoktur.
   */
  async yoluDogrula(hedef: string): Promise<string> {
    const mutlak = path.resolve(this.#workspace, hedef);

    let cozulmusKok: string;
    try {
      cozulmusKok = await realpath(this.#workspace);
    } catch {
      throw kullaniciHatasi(`workspace bulunamadı: ${this.#workspace}`);
    }

    // Var olan en yakın atayı çöz; olmayan son parçaları sonra ekle.
    let mevcut = mutlak;
    const eksikParcalar: string[] = [];
    for (;;) {
      try {
        const cozulmus = await realpath(mevcut);
        const tam = path.resolve(cozulmus, ...eksikParcalar.reverse());
        const goreli = path.relative(cozulmusKok, tam);
        if (goreli.startsWith("..") || path.isAbsolute(goreli)) {
          throw politikaReddi("yol workspace dışına çıkıyor", {
            hedef: tam,
            workspace: cozulmusKok,
          });
        }
        return tam;
      } catch (hata) {
        if (hata instanceof Error && hata.name === "SkuldHatasi") throw hata;
        const ust = path.dirname(mevcut);
        if (ust === mevcut) {
          throw politikaReddi("yol çözümlenemedi", { hedef: mutlak });
        }
        eksikParcalar.push(path.basename(mevcut));
        mevcut = ust;
      }
    }
  }

  /** Komutun neden onay gerektirdiğini döndürür; gerekmiyorsa null. */
  onayGerekcesi(istek: CalistirmaIstegi): string | null {
    const temel = path.basename(istek.komut).replace(/\.(exe|cmd|bat)$/i, "");
    if (this.#onaysiz.has(temel)) return null;
    for (const [desen, gerekce] of YIKICI_DESENLER) {
      if (desen.test(temel)) return gerekce;
    }
    return "onaylı listede değil";
  }

  /**
   * Komutu çalıştırır.
   *
   * `shell: false` sabittir ve parametreleştirilmemiştir. Kabuk açmak, argüman
   * birleştirmeyi ve dolayısıyla command injection'ı geri getirir; bunun
   * "sadece bu çağrı için" açılabilmesi, kapının olmaması demektir.
   */
  async calistir(istek: CalistirmaIstegi): Promise<CalistirmaSonucu> {
    if (!istek.komut || istek.komut.trim() === "") {
      throw kullaniciHatasi("boş komut");
    }
    // Kabuk metakarakterleri komut ADINDA olamaz: `shell:false` ile zaten
    // çalışmazlar ama erken ve anlaşılır reddetmek, sessiz ENOENT'ten iyidir.
    if (/[;&|><`$(){}[\]\n\r]/.test(istek.komut)) {
      throw politikaReddi("komut adında kabuk metakarakteri var", { komut: istek.komut });
    }

    const cwd = istek.cwd ? await this.yoluDogrula(istek.cwd) : this.#workspace;
    const gosterilecek = [istek.komut, ...istek.argumanlar].join(" ");
    const gerekce = this.onayGerekcesi(istek);

    if (gerekce !== null) {
      const karar = await this.#onay({
        sinif: "calistir",
        komut: sirlariMaskele(gosterilecek),
        cwd,
        gerekce,
      });
      if (karar !== "izin") {
        throw politikaReddi("kullanıcı onaylamadı", { komut: gosterilecek, gerekce });
      }
    }

    const zamanAsimi = istek.zamanAsimiMs ?? this.#zamanAsimi;
    const basladi = Date.now();

    return await new Promise<CalistirmaSonucu>((cozumle, reddet) => {
      const cocuk = spawn(istek.komut, [...istek.argumanlar], {
        cwd,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let zamanAsimiOldu = false;

      const sayac = setTimeout(() => {
        zamanAsimiOldu = true;
        cocuk.kill("SIGTERM");
        // SIGTERM'e cevap vermeyen süreç için sert düşüş.
        setTimeout(() => cocuk.kill("SIGKILL"), 2000).unref();
      }, zamanAsimi);

      cocuk.stdout.on("data", (p) => (stdout += String(p)));
      cocuk.stderr.on("data", (p) => (stderr += String(p)));

      cocuk.on("error", (hata) => {
        clearTimeout(sayac);
        const kod = (hata as NodeJS.ErrnoException).code ?? hata.message;

        // Windows'ta npx/npm/tsc gibi araçlar .cmd kabuk sarmalayıcısıdır ve
        // `shell: false` ile çalıştırılamazlar (Node 20+ bunu CVE-2024-27980
        // nedeniyle reddediyor). Kabuk açmak çözüm DEĞİL — command injection'ı
        // geri getirir. Doğru yol, aracı doğrudan node ile çağırmak.
        const kabukSarmalayici =
          process.platform === "win32" &&
          (kod === "ENOENT" || kod === "EINVAL") &&
          /^(npx|npm|yarn|pnpm|tsc|eslint|vitest|jest)$/i.test(path.basename(istek.komut));

        reddet(
          kullaniciHatasi(
            kabukSarmalayici
              ? `\`${istek.komut}\` Windows'ta bir .cmd sarmalayıcısı ve kabuksuz çalıştırılamaz. ` +
                  `Bunun yerine doğrudan node ile çağırın: komut="node", argümanlar=["node_modules/.bin/${istek.komut}", ...]`
              : `komut çalıştırılamadı: ${istek.komut}`,
            { neden: kod, platform: process.platform },
          ),
        );
      });

      cocuk.on("close", (kod) => {
        clearTimeout(sayac);
        // Maskeleme ve sınırlama ÇIKIŞTA, tek yerde. Çağıranın hatırlamasına
        // bırakılırsa bir gün unutulur.
        const o = ciktiyiSinirla(sirlariMaskele(stdout), this.#ciktiSiniri);
        const e = ciktiyiSinirla(sirlariMaskele(stderr), this.#ciktiSiniri);
        cozumle({
          komut: gosterilecek,
          cikisKodu: kod,
          stdout: o.metin,
          stderr: e.metin,
          sureMs: Date.now() - basladi,
          kesildi: o.kesildi || e.kesildi,
          zamanAsimi: zamanAsimiOldu,
        });
      });
    });
  }
}

/** CI/non-interactive mod: hiçbir şeyi onaylamaz, sessizce geçmez. */
export const otomatikRet: OnayIsteyici = async () => "ret";

/**
 * Uzun ömürlü süreç (MCP stdio sunucuları için).
 *
 * Bunun burada olmasının sebebi: `calistir()` tek atımlık — başlat, bitir,
 * çıktıyı topla. MCP sunucusu ise oturum boyunca yaşar. Bu ihtiyaç ortaya
 * çıktığında en kolay yol `memory` paketinde doğrudan `spawn` çağırmaktı;
 * kapı sınırı kontrolü tam olarak onu engelledi. Doğru cevap kapıyı delmek
 * değil, kapıyı genişletmek.
 */
export interface SurecTutamaci {
  yaz(veri: string): void;
  /** Satır geldiğinde çağrılır (stdout). */
  satirDinle(dinleyici: (satir: string) => void): void;
  hataDinle(dinleyici: (metin: string) => void): void;
  kapat(): Promise<void>;
  readonly calisiyorMu: boolean;
}

export interface SurecIstegi {
  readonly komut: string;
  readonly argumanlar: readonly string[];
  readonly cwd?: string;
  /** Neden başlatıldığı — onay istemine ve denetim kaydına girer. */
  readonly amac: string;
}

export class ExecutionGatewayEk {
  /** İç kullanım: ExecutionGateway.surecAc bunu çağırır. */
  static async ac(
    gw: ExecutionGateway,
    onay: OnayIsteyici,
    onaysiz: ReadonlySet<string>,
    istek: SurecIstegi,
  ): Promise<SurecTutamaci> {
    if (/[;&|><`$(){}[\]\n\r]/.test(istek.komut)) {
      throw politikaReddi("komut adında kabuk metakarakteri var", { komut: istek.komut });
    }
    const cwd = istek.cwd ? await gw.yoluDogrula(istek.cwd) : gw.workspace;
    const temel = path.basename(istek.komut).replace(/\.(exe|cmd|bat)$/i, "");

    if (!onaysiz.has(temel)) {
      const karar = await onay({
        sinif: "calistir",
        komut: sirlariMaskele([istek.komut, ...istek.argumanlar].join(" ")),
        cwd,
        gerekce: `uzun ömürlü süreç: ${istek.amac}`,
      });
      if (karar !== "izin") {
        throw politikaReddi("kullanıcı onaylamadı", { komut: istek.komut, amac: istek.amac });
      }
    }

    const cocuk = spawn(istek.komut, [...istek.argumanlar], {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let tampon = "";
    const satirDinleyicileri: Array<(s: string) => void> = [];
    const hataDinleyicileri: Array<(s: string) => void> = [];
    let yasiyor = true;

    cocuk.stdout.on("data", (parca) => {
      tampon += String(parca);
      let indeks: number;
      while ((indeks = tampon.indexOf("\n")) >= 0) {
        const satir = tampon.slice(0, indeks).trim();
        tampon = tampon.slice(indeks + 1);
        if (satir) for (const d of satirDinleyicileri) d(satir);
      }
    });
    cocuk.stderr.on("data", (p) => {
      const metin = sirlariMaskele(String(p));
      for (const d of hataDinleyicileri) d(metin);
    });
    cocuk.on("close", () => {
      yasiyor = false;
    });
    cocuk.on("error", () => {
      yasiyor = false;
    });

    return {
      yaz: (veri) => {
        if (yasiyor) cocuk.stdin.write(veri);
      },
      satirDinle: (d) => satirDinleyicileri.push(d),
      hataDinle: (d) => hataDinleyicileri.push(d),
      kapat: async () => {
        if (!yasiyor) return;
        cocuk.stdin.end();
        cocuk.kill("SIGTERM");
        await new Promise((r) => setTimeout(r, 100));
        if (yasiyor) cocuk.kill("SIGKILL");
      },
      get calisiyorMu() {
        return yasiyor;
      },
    };
  }
}

export interface JsonRpcYanit {
  id?: number;
  result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
  error?: { code: number; message: string };
}

/**
 * Minimal MCP stdio istemcisi.
 *
 * Burada durmasının sebebi: süreci gateway açıyor ve iki tüketicisi var
 * (Urðr hafızası, Verðandi bağlam motoru). İkisine ayrı ayrı kopyalamak,
 * birinde düzeltilen bir hatayı diğerinde yaşatır.
 */
export class McpStdioIstemcisi {
  #surec: SurecTutamaci | undefined;
  #sonrakiId = 1;
  readonly #bekleyen = new Map<number, { coz: (y: JsonRpcYanit) => void; red: (h: Error) => void }>();
  #stderr = "";

  async baglan(gateway: ExecutionGateway, komut: string, argumanlar: string[], amac: string): Promise<void> {
    this.#surec = await gateway.surecAc({ komut, argumanlar, amac });
    this.#surec.satirDinle((satir) => {
      let mesaj: JsonRpcYanit;
      try {
        mesaj = JSON.parse(satir) as JsonRpcYanit;
      } catch {
        return; // JSON-RPC olmayan gürültüyü yok say
      }
      if (typeof mesaj.id !== "number") return;
      const bekleyen = this.#bekleyen.get(mesaj.id);
      if (!bekleyen) return;
      this.#bekleyen.delete(mesaj.id);
      bekleyen.coz(mesaj);
    });
    this.#surec.hataDinle((m) => {
      this.#stderr = (this.#stderr + m).slice(-2000);
    });

    await this.cagir("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "skuld", version: "0.0.1" },
    });
  }

  async cagir(metot: string, parametreler: unknown, zamanAsimiMs = 15_000): Promise<JsonRpcYanit> {
    const surec = this.#surec;
    if (!surec || !surec.calisiyorMu) {
      throw new SkuldHatasi("sistem", "MCP süreci çalışmıyor", { stderr: this.#stderr });
    }
    const id = this.#sonrakiId++;
    const istek = JSON.stringify({ jsonrpc: "2.0", id, method: metot, params: parametreler });

    return await new Promise<JsonRpcYanit>((coz, red) => {
      const sayac = setTimeout(() => {
        this.#bekleyen.delete(id);
        red(
          new SkuldHatasi("sistem", `MCP ${metot} ${zamanAsimiMs} ms içinde yanıt vermedi`, {
            stderr: this.#stderr.slice(-400),
          }),
        );
      }, zamanAsimiMs);

      this.#bekleyen.set(id, {
        coz: (y) => {
          clearTimeout(sayac);
          coz(y);
        },
        red: (h) => {
          clearTimeout(sayac);
          red(h);
        },
      });
      surec.yaz(istek + "\n");
    });
  }

  async kapat(): Promise<void> {
    await this.#surec?.kapat();
    this.#surec = undefined;
  }
}
