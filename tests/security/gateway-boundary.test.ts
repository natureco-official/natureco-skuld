import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { after, describe, it } from "node:test";

const calistir = promisify(execFile);
const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const KONTROL = path.join(KOK, "scripts", "gateway-boundary-check.mjs");
const IHLAL = path.join(KOK, "packages", "agent-core", "src", "__gecici_ihlal.ts");

after(async () => { await rm(IHLAL, { force: true }); });

describe("execution-gateway sınırı", () => {
  it("temiz ağaçta geçer", async () => {
    const { stdout } = await calistir(process.execPath, [KONTROL], { cwd: KOK });
    assert.match(stdout, /0 ihlal/);
  });

  it("gateway dışından child_process import edilirse DÜŞER", async () => {
    // Bu testin varlık sebebi: her zaman geçen bir kapı, kapı değildir.
    await mkdir(path.dirname(IHLAL), { recursive: true });
    await writeFile(IHLAL, 'import { spawn } from "node:child_process";\nexport const s = spawn;\n', "utf8");

    await assert.rejects(
      () => calistir(process.execPath, [KONTROL], { cwd: KOK }),
      (hata: any) => {
        assert.equal(hata.code, 1, "ihlalde çıkış kodu 1 olmalı");
        assert.match(String(hata.stdout), /__gecici_ihlal\.ts/);
        return true;
      },
    );
  });
});
