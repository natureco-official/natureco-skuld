import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import codeExecution from '../../src/tools/code_execution.js';
import { executeThroughGateway } from '../../src/utils/tool-execution-gateway.js';

/**
 * `code_execution` ağ kapısını atlıyordu.
 *
 * Codex tur 2, bulgu 1a: `http_request` onay istiyor, ama model
 * `code_execution` ile `globalThis.fetch(...)` yazınca hiçbir onaydan
 * geçmiyordu. Kapının yanında duvar yoksa kapı süs olur.
 *
 * Çözüm kabuğunkiyle aynı: kod çalıştırma ayrı bir YETENEK, onay her zaman
 * sorulur, beyaz liste uygulanmaz.
 */

let eskiBayrak;
beforeAll(() => {
  eskiBayrak = process.env.SKULD_AG_ONAYSIZ;
  // Etkileşimsiz ortamda onay sorulamaz; sorulamayan onay onay değildir.
  process.env.SKULD_AG_ONAYSIZ = '1';
});
afterAll(() => {
  if (eskiBayrak === undefined) delete process.env.SKULD_AG_ONAYSIZ;
  else process.env.SKULD_AG_ONAYSIZ = eskiBayrak;
});

describe('code_execution — onay yeteneği', () => {
  it('onaysız kod ÇALIŞMAZ', async () => {
    const sonuc = await codeExecution.execute({
      code: 'console.log("bu satır çalışmamalı")',
      language: 'node',
    });
    expect(sonuc.success).toBe(false);
    expect(sonuc.error).toContain('onaylanmadı');
    expect(sonuc.stdout).toBeUndefined();
  });

  it('model kendi kendini onaylayamaz — `onayli` argümanlardan silinir', async () => {
    // Bu testin bütün anlamı bu: onay bayrağı, onaylanacak şeyi üreten
    // tarafın erişebildiği bir yer olamaz.
    const sonuc = await executeThroughGateway({
      toolName: 'code_execution',
      args: { code: 'console.log("kaçtım")', language: 'node', onayli: true },
      resolveTool: () => codeExecution,
      normalizeSuccess: (result) => result,
      normalizeError: (error) => ({ success: false, error }),
    });
    expect(sonuc.success).toBe(false);
    expect(String(sonuc.error)).toContain('onaylanmadı');
  });

  it('onaylanan kod, ortamdaki sırları GÖRMEZ', async () => {
    // Onaydan ayrı bir kusurdu: `{ ...process.env }` gönderiliyordu, yani
    // kullanıcı kodu okuyup onaylasa bile her API anahtarı alt sürece
    // gidiyordu. Onaylamak "kodu çalıştır" demektir, "anahtarlarımı da al"
    // demek değil.
    process.env.SKULD_TEST_API_KEY = 'gizli-deger-123';
    try {
      const sonuc = await codeExecution.execute({
        code: 'console.log(process.env.SKULD_TEST_API_KEY || "YOK")',
        language: 'node',
        onayli: true,
      });
      expect(sonuc.success).toBe(true);
      expect(sonuc.stdout).toBe('YOK');
      expect(sonuc.stdout).not.toContain('gizli-deger-123');
    } finally {
      delete process.env.SKULD_TEST_API_KEY;
    }
  });

  it('sır olmayan ortam değişkenleri geçer', async () => {
    // Temizlik körlemesine olmamalı: PATH gitmezse hiçbir şey çalışmaz.
    const sonuc = await codeExecution.execute({
      code: 'console.log(process.env.PATH ? "VAR" : "YOK")',
      language: 'node',
      onayli: true,
    });
    expect(sonuc.stdout).toBe('VAR');
  });
});
