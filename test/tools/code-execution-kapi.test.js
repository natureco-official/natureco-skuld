import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import codeExecution from '../../src/tools/code_execution.js';
import { executeThroughGateway } from '../../src/utils/tool-execution-gateway.js';
import { ortamiTemizle } from '../../src/utils/gateway.js';

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

describe('ortamiTemizle — sırrı adından tanımak yetmez', () => {
  // Ölçüldü: ada dayalı sonek deseni `DATABASE_URL`, `SLACK_WEBHOOK` ve
  // `SENTRY_DSN`'i geçiriyordu; üçü de kimlik bilgisi taşıyor. Bir sırrı
  // adından tanımaya çalışmak, onu adlandıran kişinin dikkatine güvenmektir.
  it('bağlantı dizesindeki gömülü parola değerden yakalanır', () => {
    const t = ortamiTemizle({ DB: 'postgres://admin:s3cretP4ss@db.example.com:5432/prod' });
    expect(t.DB).toBeUndefined();
  });

  it('bilinen anahtar biçimi taşıyan değer, adı masum olsa da silinir', () => {
    const t = ortamiTemizle({ ZARARSIZ_AD: 'sk-ant-api03-AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIIIJJJJKKKKLLLL' });
    expect(t.ZARARSIZ_AD).toBeUndefined();
  });

  it('sonek taşımayan sır adları da kapsanır', () => {
    const t = ortamiTemizle({
      SUPABASE_SERVICE_ROLE: 'x'.repeat(40),
      SENTRY_DSN: 'https://abc@o1.ingest.sentry.io/1',
      SLACK_WEBHOOK: 'https://hooks.slack.com/services/T/B/XXXXXXXXXXXX',
    });
    expect(Object.keys(t)).toEqual([]);
  });

  it('sıradan değişkenler geçer — PATH gitmezse hiçbir şey çalışmaz', () => {
    const t = ortamiTemizle({
      PATH: '/usr/bin', HOME: '/home/x', LANG: 'tr_TR.UTF-8', NODE_ENV: 'production',
      // CI'da sık: git SHA'sı 40 karakterlik jenerik desene uyuyor ama sır değil.
      GIT_COMMIT: 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3',
    });
    expect(Object.keys(t).sort()).toEqual(['GIT_COMMIT', 'HOME', 'LANG', 'NODE_ENV', 'PATH']);
  });
});
