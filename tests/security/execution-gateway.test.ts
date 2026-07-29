import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { ExecutionGateway, otomatikRet } from "../../packages/execution-gateway/src/index.ts";
import type { OnayIstegi } from "../../packages/execution-gateway/src/index.ts";

const gecici: string[] = [];
after(async () => {
  for (const d of gecici) await rm(d, { recursive: true, force: true });
});

async function workspaceKur(): Promise<string> {
  const kok = await mkdtemp(path.join(tmpdir(), "skuld-gw-"));
  gecici.push(kok);
  await mkdir(path.join(kok, "src"), { recursive: true });
  await writeFile(path.join(kok, "src", "a.ts"), "export const a = 1;\n", "utf8");
  return kok;
}

const hepsineIzin = async () => "izin" as const;

describe("execution-gateway — yol sınırı", () => {
  it("workspace içindeki yolu kabul eder", async () => {
    const kok = await workspaceKur();
    const gw = new ExecutionGateway({ workspace: kok, onay: hepsineIzin });
    const cozulmus = await gw.yoluDogrula("src/a.ts");
    assert.ok(cozulmus.endsWith(path.join("src", "a.ts")));
  });

  it("henüz var olmayan dosyayı kabul eder (yazma hedefi)", async () => {
    const kok = await workspaceKur();
    const gw = new ExecutionGateway({ workspace: kok, onay: hepsineIzin });
    const cozulmus = await gw.yoluDogrula("src/yeni/derin/dosya.ts");
    assert.ok(cozulmus.includes("yeni"));
  });

  it("`..` ile dışarı çıkmayı reddeder", async () => {
    const kok = await workspaceKur();
    const gw = new ExecutionGateway({ workspace: kok, onay: hepsineIzin });
    await assert.rejects(() => gw.yoluDogrula("../../etc/passwd"), /workspace dışına/);
  });

  it("mutlak dış yolu reddeder", async () => {
    const kok = await workspaceKur();
    const gw = new ExecutionGateway({ workspace: kok, onay: hepsineIzin });
    const dis = process.platform === "win32" ? "C:\\Windows\\System32" : "/etc";
    await assert.rejects(() => gw.yoluDogrula(dis), /workspace dışına/);
  });

  it("SYMLINK ile dışarı kaçmayı reddeder", async (t) => {
    // Bu testin sebebi: düz string karşılaştırması symlink'i kaçırır.
    // workspace/kacis -> <workspace dışı> durumunda yol "içeride" görünür.
    const kok = await workspaceKur();
    const disKok = await mkdtemp(path.join(tmpdir(), "skuld-dis-"));
    gecici.push(disKok);
    await writeFile(path.join(disKok, "gizli.txt"), "sır", "utf8");

    try {
      await symlink(disKok, path.join(kok, "kacis"), "dir");
    } catch (hata) {
      const kod = (hata as NodeJS.ErrnoException).code;
      if (kod === "EPERM" || kod === "EACCES") {
        // Windows'ta Geliştirici Modu kapalıysa symlink kurulamaz. Bu testi
        // BAŞARISIZ değil ATLANMIŞ saymak doğru; ama korumanın o makinede
        // doğrulanmadığını da söylemek gerekir.
        t.skip("symlink oluşturulamadı (Windows Geliştirici Modu kapalı olabilir)");
        return;
      }
      throw hata;
    }

    const gw = new ExecutionGateway({ workspace: kok, onay: hepsineIzin });
    await assert.rejects(() => gw.yoluDogrula("kacis/gizli.txt"), /workspace dışına/);
  });
});

describe("execution-gateway — onay", () => {
  it("yıkıcı komut onaysız çalışmaz", async () => {
    const kok = await workspaceKur();
    const gw = new ExecutionGateway({ workspace: kok, onay: otomatikRet });
    await assert.rejects(
      () => gw.calistir({ komut: "rm", argumanlar: ["-rf", "src"] }),
      /onaylamadı/,
    );
  });

  it("onay metni GERÇEK komutu, cwd'yi ve gerekçeyi taşır", async () => {
    const kok = await workspaceKur();
    const istekler: OnayIstegi[] = [];
    const gw = new ExecutionGateway({
      workspace: kok,
      onay: async (i) => {
        istekler.push(i);
        return "ret";
      },
    });
    await assert.rejects(() => gw.calistir({ komut: "rm", argumanlar: ["-rf", "/"] }));

    assert.equal(istekler.length, 1);
    const istek = istekler[0]!;
    assert.equal(istek.komut, "rm -rf /", "komut kısaltılmadan gösterilmeli");
    assert.equal(istek.cwd, await realpathish(kok));
    assert.match(istek.gerekce, /sil/);
  });

  it("onay isteminde sırlar maskelenir", async () => {
    const kok = await workspaceKur();
    let gorulen = "";
    const gw = new ExecutionGateway({
      workspace: kok,
      onay: async (i) => {
        gorulen = i.komut;
        return "ret";
      },
    });
    await assert.rejects(() =>
      gw.calistir({ komut: "curl", argumanlar: ["-H", "Authorization: sk-ant-AAAAAAAAAAAAAAAAAAAAAAAAAA"] }),
    );
    assert.ok(!gorulen.includes("AAAAAAAAAAAAAAAAAAAAAAAAAA"), `sır sızdı: ${gorulen}`);
    assert.match(gorulen, /sk-ant-\*\*\*/);
  });

  it("onaysız listedeki komut onay istemez", async () => {
    const kok = await workspaceKur();
    let soruldu = false;
    const gw = new ExecutionGateway({
      workspace: kok,
      onaysizKomutlar: new Set(["node"]),
      onay: async () => {
        soruldu = true;
        return "ret";
      },
    });
    const sonuc = await gw.calistir({ komut: process.execPath, argumanlar: ["-e", "console.log('ok')"] });
    assert.equal(soruldu, false, "onaysız listedeki komut için onay sorulmamalı");
    assert.equal(sonuc.cikisKodu, 0);
    assert.match(sonuc.stdout, /ok/);
  });
});

describe("execution-gateway — çalıştırma", () => {
  it("komut adında kabuk metakarakteri reddedilir", async () => {
    const kok = await workspaceKur();
    const gw = new ExecutionGateway({ workspace: kok, onay: hepsineIzin });
    await assert.rejects(
      () => gw.calistir({ komut: "node; rm -rf /", argumanlar: [] }),
      /metakarakter/,
    );
  });

  it("argümanlar kabuktan geçmez (injection çalışmaz)", async () => {
    const kok = await workspaceKur();
    const gw = new ExecutionGateway({
      workspace: kok,
      onaysizKomutlar: new Set(["node"]),
      onay: hepsineIzin,
    });
    // Kabuk açılsaydı `&& echo SIZDI` ayrı bir komut olarak çalışır ve kendi
    // başına bir "SIZDI" satırı basardı. shell:false ile argüman VERİ olarak
    // kalır; yani doğru davranış, metnin argv'de aynen görünmesidir.
    const sonuc = await gw.calistir({
      komut: process.execPath,
      argumanlar: ["-e", "console.log('ARG=' + process.argv[1])", "&& echo SIZDI"],
    });

    // Argüman aynen geçmiş: yorumlanmamış.
    assert.equal(sonuc.stdout.trim(), "ARG=&& echo SIZDI");
    // Ve kabuğun çalıştırdığı bağımsız bir "SIZDI" satırı YOK.
    const satirlar = sonuc.stdout.split("\n").map((s) => s.trim());
    assert.ok(!satirlar.includes("SIZDI"), `kabuk enjeksiyonu çalıştı: ${sonuc.stdout}`);
  });

  it("çıktıdaki sırlar maskelenir", async () => {
    const kok = await workspaceKur();
    const gw = new ExecutionGateway({
      workspace: kok,
      onaysizKomutlar: new Set(["node"]),
      onay: hepsineIzin,
    });
    const sonuc = await gw.calistir({
      komut: process.execPath,
      argumanlar: ["-e", "console.log('token: ghp_' + 'B'.repeat(30))"],
    });
    assert.ok(!sonuc.stdout.includes("BBBBBBBBBB"), `sır çıktıda kaldı: ${sonuc.stdout}`);
    assert.match(sonuc.stdout, /ghp_\*\*\*/);
  });

  it("zaman aşımında süreci öldürür ve bunu bildirir", async () => {
    const kok = await workspaceKur();
    const gw = new ExecutionGateway({
      workspace: kok,
      onaysizKomutlar: new Set(["node"]),
      onay: hepsineIzin,
    });
    const sonuc = await gw.calistir({
      komut: process.execPath,
      argumanlar: ["-e", "setTimeout(()=>{}, 60000)"],
      zamanAsimiMs: 700,
    });
    assert.equal(sonuc.zamanAsimi, true, "zaman aşımı bayrağı set edilmeli");
    assert.ok(sonuc.sureMs < 10_000, `çok uzun sürdü: ${sonuc.sureMs}ms`);
  });

  it("var olmayan komutta anlaşılır kullanıcı hatası verir", async () => {
    const kok = await workspaceKur();
    const gw = new ExecutionGateway({
      workspace: kok,
      onaysizKomutlar: new Set(["kesinlikleyokboylebirkomut"]),
      onay: hepsineIzin,
    });
    await assert.rejects(
      () => gw.calistir({ komut: "kesinlikleyokboylebirkomut", argumanlar: [] }),
      /çalıştırılamadı/,
    );
  });
});

/** Karşılaştırmada symlink'li tmpdir farkını (macOS /var → /private/var) yut. */
async function realpathish(p: string): Promise<string> {
  const { realpath } = await import("node:fs/promises");
  return await realpath(p);
}

describe("execution-gateway — kabuk yeteneği", () => {
  it("kabuk komutu onaysız ÇALIŞMAZ, onaysız listesi burada geçersizdir", async () => {
    const kok = await workspaceKur();
    // `node` onaysız listede olsa bile kabuk yolunda onay sorulmalı: kabuk
    // komutunda hangi programların çalışacağı önceden bilinmez.
    const gw = new ExecutionGateway({
      workspace: kok,
      onay: otomatikRet,
      onaysizKomutlar: new Set(["node", "echo"]),
    });
    await assert.rejects(() => gw.kabuk({ komut: "echo merhaba" }), /onaylamadı/);
  });

  it("onay metni kabuk olduğunu SÖYLER", async () => {
    const kok = await workspaceKur();
    const istekler: OnayIstegi[] = [];
    const gw = new ExecutionGateway({
      workspace: kok,
      onay: async (i) => {
        istekler.push(i);
        return "ret";
      },
    });
    await assert.rejects(() => gw.kabuk({ komut: "cat /etc/passwd | head -1" }));

    const istek = istekler[0]!;
    assert.match(istek.gerekce, /KABUK/, "gerekçe kabuk olduğunu söylemeli");
    // Komut kısaltılmadan gösterilmeli: kullanıcı neyi onayladığını bilmeli.
    assert.equal(istek.komut, "cat /etc/passwd | head -1");
  });

  it("onaylanınca boru ve zincir GERÇEKTEN çalışır", async () => {
    const kok = await workspaceKur();
    const gw = new ExecutionGateway({ workspace: kok, onay: async () => "izin" });
    const komut =
      process.platform === "win32"
        ? "echo bir && echo iki"
        : "echo bir && echo iki";
    const sonuc = await gw.kabuk({ komut });
    assert.equal(sonuc.cikisKodu, 0);
    // Kabuk yolunun varlık sebebi bu: `&&` bir program adı değil, kabuk
    // sözdizimi. `calistir()` bunu reddeder ve reddetmeye devam etmeli.
    assert.match(sonuc.stdout, /bir/);
    assert.match(sonuc.stdout, /iki/);
  });

  it("kabuk çıktısındaki sırlar da maskelenir", async () => {
    const kok = await workspaceKur();
    const gw = new ExecutionGateway({ workspace: kok, onay: async () => "izin" });
    const sonuc = await gw.kabuk({ komut: 'echo "token: ghp_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC"' });
    assert.ok(!sonuc.stdout.includes("CCCCCCCCCC"), `sır kabuk çıktısında kaldı: ${sonuc.stdout}`);
    assert.match(sonuc.stdout, /ghp_\*\*\*/);
  });

  it("yapılandırılmış yol kabuk sözdizimini REDDETMEYE devam eder", async () => {
    // Kabuk ayrı bir yetenek olarak eklendi diye `calistir()` gevşememeli.
    const kok = await workspaceKur();
    const gw = new ExecutionGateway({ workspace: kok, onay: async () => "izin" });
    await assert.rejects(
      () => gw.calistir({ komut: "echo bir && echo iki", argumanlar: [] }),
      /metakarakter/,
    );
  });
});

describe("Codex denetim bulguları — regresyon", () => {
  it("git dosyaya yazan bayrakları REDDEDER", async () => {
    // Kanıtlanmış kaçış: `git diff --output=<workspace dışı>` 4886 baytlık bir
    // patch dosyasını %TEMP% altına yazdı. Kapı yalnızca cwd doğruluyor;
    // git'in kendi argümanlarını doğrulayamaz, o yüzden filtre araçta.
    const git = await import("../../src/tools/git.js");
    const arac = (git as { default?: unknown }).default ?? git;
    const calistir = (arac as { execute: (p: unknown) => Promise<{ success: boolean; error?: string }> }).execute;

    for (const bayrak of ["--output=/tmp/x.patch", "-o", "--upload-pack=evil"]) {
      const r = await calistir({ operation: "diff", args: `${bayrak} HEAD` });
      assert.equal(r.success, false, `${bayrak} geçti`);
      assert.match(String(r.error), /engellendi/i);
    }
  });

  it("shell_command._runShell onaysız çalışmaz", async () => {
    // Eski hâli koşulsuz `kararVerildi: true` geçiyordu: dışa açık bir
    // fonksiyon üzerinden onay akışının tamamı atlanabiliyordu.
    const mod = await import("../../src/tools/shell_command.js");
    const arac = (mod as { default?: unknown }).default ?? mod;
    const runShell = (arac as { _runShell: (p: unknown) => Promise<{ success: boolean; error?: string }> })._runShell;

    const r = await runShell({ command: "echo arkakapi" });
    assert.equal(r.success, false, "onaysız çalıştı");
    assert.match(String(r.error), /onaylamadı/i);
  });
});
