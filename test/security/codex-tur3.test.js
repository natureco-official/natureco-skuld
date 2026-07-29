import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { ortamiTemizle } from '../../src/utils/gateway.js';
import { maskText } from '../../src/utils/secret-scanner.js';
import { assessToolPath } from '../../src/utils/tool-path-policy.js';
import readFile from '../../src/tools/read_file.js';
import documentExtract from '../../src/tools/document_extract.js';
import { runAgentic, buildFeedback } from '../../src/tools/agentic-runner.js';

/**
 * Codex tur 3 — yedi bulgu, yedisi de tetiklenerek doğrulandı.
 *
 * Bu turda hiç yanlış alarm yoktu; tur 1'de bir kısmı şema dosyasından
 * okunmuş varsayımdı. Aradaki fark, brifingte "tetikleyemediğin şey bulgu
 * değildir" kuralının tekrarlanması.
 */

const repoKok = path.resolve(import.meta.dirname, '../..');

describe('Codex tur 3 — bulgu 1: sınır lint dize/yorum ayrımı', () => {
  it('dizede geçen /* ile lint körleştirilemez', () => {
    // Eski hâli blok yorumları regex ile siliyordu ve regex dizeyle yorumu
    // ayırt edemiyor: aşağıdaki üç satır "0 ihlal" veriyordu, dosya gerçekten
    // child_process yüklerken.
    const hedef = path.join(repoKok, 'src', 'utils', '__lint-denemesi.js');
    fs.writeFileSync(
      hedef,
      'const a = "/*";\nconst { spawn } = require("node:child_process");\nconst b = "*/";\nmodule.exports = { spawn, a, b };\n',
    );
    try {
      const sonuc = spawnSync(
        process.execPath,
        [path.join(repoKok, 'scripts', 'gateway-boundary-check.mjs')],
        { cwd: repoKok, encoding: 'utf8', timeout: 60000 },
      );
      expect(sonuc.stdout).toContain('__lint-denemesi.js');
      expect(sonuc.status).not.toBe(0);
    } finally {
      fs.rmSync(hedef, { force: true });
    }
  });
});

describe('Codex tur 3 — bulgu 2: ayıraçsız kimlik değişkenleri', () => {
  it('PGPASSWORD ve akrabaları alt sürece geçmez', () => {
    // `_PASSWORD$` alt çizgi bekliyordu; `PGPASSWORD` tek kelime. Sır, onu
    // adlandıran aracın alışkanlığına göre adlanır, bizim desenimize göre
    // değil.
    const t = ortamiTemizle({
      PGPASSWORD: 'x', MYSQL_PWD: 'y', PGPASSFILE: '/p', REDISCLI_AUTH: 'z',
    });
    expect(Object.keys(t)).toEqual([]);
  });

  it('PGHOST ve PGPORT geçer — önek tek başına sır demek değil', () => {
    const t = ortamiTemizle({ PGHOST: 'db', PGPORT: '5432', PATH: '/usr/bin' });
    expect(Object.keys(t).sort()).toEqual(['PATH', 'PGHOST', 'PGPORT']);
  });
});

describe('Codex tur 3 — bulgu 3: 40 haneli hex muafiyeti', () => {
  it('sır adıyla atanmış 160 bitlik hex MASKELENİR', () => {
    // Bir değerin git SHA'sına benzemesi onun git SHA'sı olduğunu kanıtlamaz;
    // HMAC ve webhook imzalama sırları da 40 hane hex.
    const s = 'WEBHOOK_SECRET=0123456789abcdef0123456789abcdef01234567';
    expect(maskText(s)).not.toContain('0123456789abcdef0123456789abcdef01234567');
  });

  it('git SHA bozulmadan kalır — bağlam ikisini ayırıyor', () => {
    const sha = 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3';
    expect(maskText(`commit ${sha} tarafından`)).toContain(sha);
    expect(maskText(`${sha}  fix: bir şey`)).toContain(sha);
  });
});

describe('Codex tur 3 — bulgu 4: içerik döndüren diğer araçlar', () => {
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'skuld-b4-'));
  const dosya = path.join(kok, 'notes.txt');
  fs.writeFileSync(dosya, 'token: ghp_AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIII\n');

  it('document_extract içeriği maskeler', async () => {
    const r = await documentExtract.execute({ path: dosya });
    expect(r.content).not.toContain('ghp_AAAABBBB');
  });

  it('read_file içeriği BOZMAZ ama uyarır', async () => {
    // Maskeleseydik daha büyük bir hata olurdu: read_file'ın çıktısı
    // "oku → değiştir → write_file" döngüsünde geri yazılır ve maskelenmiş
    // içerik kullanıcının gerçek anahtarını EZER. Sessiz veri kaybı, sessiz
    // ifşadan kötüdür.
    const r = await readFile.execute({ path: dosya });
    expect(r.content).toContain('ghp_AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIII');
    expect(r.sirUyarisi).toContain('GitHub Token');
  });

  it('uyarı sayfalama yolunda da verilir', async () => {
    // İlk yazışta yalnızca sayfalama yolunu düzenlemiştim ve en çok
    // kullanılan varsayılan yol uyarısız kalmıştı.
    const r = await readFile.execute({ path: dosya, offset: 1, limit: 5 });
    expect(r.sirUyarisi).toContain('GitHub Token');
  });

  it('uyarı MODELE ulaşır — buildFeedback çıktısında', async () => {
    // Codex kapanış turu: eski test yalnızca aracın döndürdüğü nesneyi
    // ölçüyordu, yani `buildFeedback` düzeltmesi geri alınsa kırılmazdı.
    // Uyarının modele ulaşması ise düzeltmenin BÜTÜN amacı.
    const r = await readFile.execute({ path: dosya });
    const geri = buildFeedback('read_file', r);
    expect(geri).toContain('GitHub Token');
  });

  it('sırsız dosyada uyarı alanı hiç görünmez', async () => {
    const temiz = path.join(kok, 'temiz.txt');
    fs.writeFileSync(temiz, 'merhaba dünya\n');
    const r = await readFile.execute({ path: temiz });
    expect(r.sirUyarisi).toBeUndefined();
  });
});

describe('Codex tur 3 — bulgu 5: yol argümanları ve .env', () => {
  it('file ve outputPath yazma yolları da denetlenir', () => {
    // Bunlar YAZMA yolları: hassas bir dosyanın üzerine ekran görüntüsü
    // yazılabiliyordu.
    expect(assessToolPath('computer_use', { file: '~/.ssh/authorized_keys' }).allowed).toBe(false);
    expect(assessToolPath('macos_screenshot', { outputPath: '~/.ssh/authorized_keys' }).allowed).toBe(false);
  });

  it('.env engellenir, .env.example engellenmez', () => {
    // `.env.example` paylaşılmak için vardır ve ajanın onu okuyabilmesi
    // gerekir — projeyi kurmanın normal yolu bu.
    expect(assessToolPath('read_file', { path: '/p/.env' }).allowed).toBe(false);
    expect(assessToolPath('read_file', { path: '/p/.env.local' }).allowed).toBe(false);
    expect(assessToolPath('read_file', { path: '/p/.env.example' }).allowed).toBe(true);
    expect(assessToolPath('read_file', { path: '/p/.env.template' }).allowed).toBe(true);
    expect(assessToolPath('read_file', { path: '/p/src/env.js' }).allowed).toBe(true);
  });
});

describe('Codex tur 3 — bulgu 7: doğrulama sayılan ilgisiz komut', () => {
  const bosArac = { execute: async () => ({ success: true }) };

  function kos(komutlar, { degisiklikOnce = true } = {}) {
    const yazilanlar = [];
    const adimlar = [];
    const yazma = {
      content: '',
      toolCalls: [{ function: { name: 'write_file', arguments: { files: [{ path: 'src/x.js', content: 'x' }] } } }],
    };
    if (degisiklikOnce) adimlar.push(yazma);
    for (const k of komutlar) {
      adimlar.push({ content: '', toolCalls: [{ function: { name: 'bash', arguments: { command: k } } }] });
    }
    if (!degisiklikOnce) adimlar.push(yazma);
    adimlar.push({ content: 'bitti', toolCalls: [] });

    let i = 0;
    return runAgentic({
      callModel: async () => adimlar[Math.min(i++, adimlar.length - 1)],
      systemPrompt: 'test',
      task: 'düzelt',
      loadTool: () => bosArac,
      allowed: ['write_file', 'bash'],
      hafiza: {
        bagliMi: true,
        hatirla: async () => ({ hatiralar: [], aramaSuresiMs: 0 }),
        hatirlat: async (k) => { yazilanlar.push(k); return true; },
      },
    }).then(() => yazilanlar);
  }

  it('`echo tamam` doğrulama SAYILMAZ', async () => {
    // Çıkış kodu sıfırdır, kayıt `done` olur ve üç biçimsel koşul da
    // sağlanır — ama hiçbir şey doğrulanmamıştır.
    expect(await kos(['echo tamam'])).toEqual([]);
  });

  it('`ls -la` doğrulama SAYILMAZ', async () => {
    expect(await kos(['ls -la'])).toEqual([]);
  });

  it('`npm test` doğrulama sayılır ve komut adı kaydedilir', async () => {
    const yazilanlar = await kos(['npm test']);
    expect(yazilanlar).toHaveLength(1);
    // Kaydedilen metin hangi komutun çalıştığını yazıyor ki sonraki oturum
    // kendi kararını verebilsin.
    expect(yazilanlar[0]).toContain('npm test');
  });

  it('değişiklikten ÖNCE koşan test doğrulama sayılmaz', async () => {
    // Önce test koşup sonra dosyayı bozmak da eski üç koşulu sağlıyordu.
    expect(await kos(['npm test'], { degisiklikOnce: false })).toEqual([]);
  });
});

/**
 * Codex DOĞRULAMA turu — yedi düzeltmenin yedisinde de artık boşluk buldu.
 *
 * Bu turun asıl dersi 6. maddedeydi: `govdeOnizleme` araca eklenmişti ama
 * CJS köprüsü alanı elle sayıyordu ve sessizce düşürüyordu. Testim TS
 * fonksiyonunu DOĞRUDAN çağırdığı için köprüyü hiç görmedi — düzeltme
 * onay ekranına hiç ulaşmadan "kanıtlanmış" sayılmıştı. Yanlış katmanı
 * ölçen bir test, hiç test olmamasından daha kötüdür: yeşil yanıltır.
 */
describe('Codex doğrulama turu — artık boşluklar', () => {
  it('B1: satır başındaki generator metodu lint tarafından silinmez', () => {
    // `/^\s*\*/` fazla genişti: `*gen() { … }` geçerli sözdizimi ve
    // içindeki import'la birlikte tamamen atılıyordu.
    const hedef = path.join(repoKok, 'src', 'utils', '__gen-denemesi.js');
    fs.writeFileSync(hedef, [
      'const o = {',
      '  *gen() { const { spawn } = require("node:child_process"); return spawn; },',
      '};',
      'module.exports = o;',
      '',
    ].join('\n'));
    try {
      const sonuc = spawnSync(
        process.execPath,
        [path.join(repoKok, 'scripts', 'gateway-boundary-check.mjs')],
        { cwd: repoKok, encoding: 'utf8', timeout: 60000 },
      );
      expect(sonuc.stdout).toContain('__gen-denemesi.js');
    } finally {
      fs.rmSync(hedef, { force: true });
    }
  });

  it('B2: DOCKER_AUTH_CONFIG ve SSH_AUTH_SOCK süzülür', () => {
    // `SSH_AUTH_SOCK` sırrın kendisi değil ona ERİŞİM: soketi olan,
    // kullanıcının anahtarlarıyla imza attırabilir.
    const t = ortamiTemizle({ DOCKER_AUTH_CONFIG: '{}', SSH_AUTH_SOCK: '/tmp/a' });
    expect(Object.keys(t)).toEqual([]);
  });

  it('B2: AUTHOR gibi masum adlar süzülmez', () => {
    expect(Object.keys(ortamiTemizle({ AUTHOR: 'timur', PGHOST: 'db' })).sort())
      .toEqual(['AUTHOR', 'PGHOST']);
  });

  it('B3: JSON biçimindeki tırnaklı anahtar bağlam kontrolünü atlatamaz', () => {
    // Yapılandırma dosyalarının en yaygın biçimi; ad ile `:` arasında tırnak
    // olduğu için desen eşleşmiyordu.
    const j = '{"webhook_secret": "0123456789abcdef0123456789abcdef01234567"}';
    expect(maskText(j)).not.toContain('0123456789abcdef0123456789abcdef01234567');
  });

  it('B5: medya araçlarının yol adları ve çok parçalı .env kapsanır', () => {
    expect(assessToolPath('x', { imagePath: '~/.ssh/id_rsa' }).allowed).toBe(false);
    expect(assessToolPath('x', { audioPath: '~/.ssh/id_rsa' }).allowed).toBe(false);
    expect(assessToolPath('read_file', { path: '/p/.env.production.local' }).allowed).toBe(false);
    expect(assessToolPath('read_file', { path: '/p/.env.example' }).allowed).toBe(true);
  });

  it('B6: gövde önizlemesi KÖPRÜ üzerinden onay metnine ulaşır', async () => {
    // Codex kapanış turu bu testin ÖNCEKİ hâlini bulgu saydı ve haklıydı:
    // `dist/index.js`'teki ExecutionGateway'i doğrudan çağırıyordu, yani
    // `src/utils/gateway.js` köprüsünü hiç görmüyordu. Köprü düzeltmesi geri
    // alınsa test yeşil kalırdı — kanıtladığını sandığı şeyi kanıtlamıyordu.
    //
    // Yorumunda "köprüden geçiyor" yazıyordu. Yorum, koda bakmadan
    // doğrulanamaz.
    const { agOnayi } = await import('../../src/utils/gateway.js');
    let gorulen = null;
    await expect(
      agOnayi({
        url: 'https://x.test/u',
        yontem: 'POST',
        govdeBayt: 16,
        govdeOnizleme: 'prod-db-password',
        workspace: repoKok,
        onay: async (i) => { gorulen = i; return 'ret'; },
      }),
    ).rejects.toThrow();
    expect(gorulen).not.toBeNull();
    expect(gorulen.gerekce).toContain('prod-db-password');
  });

  it('B6: model `onay` geçirerek kendi onay makamını seçemez', async () => {
    const { executeThroughGateway } = await import('../../src/utils/tool-execution-gateway.js');
    let gecen = null;
    const sonuc = await executeThroughGateway({
      toolName: 'sahte',
      args: { x: 1, onay: async () => 'izin', agOnayli: true },
      resolveTool: () => ({
        name: 'sahte',
        execute: async (a) => { gecen = a; return { success: true }; },
      }),
      normalizeSuccess: (r) => r,
      normalizeError: (e) => ({ success: false, error: e }),
    });
    expect(sonuc.success).toBe(true);
    expect(gecen.onay).toBeUndefined();
    expect(gecen.agOnayli).toBeUndefined();
    expect(gecen.x).toBe(1);
  });

  it('B7: `npm --version` doğrulama sayılmaz, `pytest -q` sayılır', async () => {
    // Kara liste komut ADIYLA eşleşiyordu; sürüm sorgusu ARGÜMANLA yakalanıyor.
    const bosArac = { execute: async () => ({ success: true }) };
    const calistir = (komut) => {
      const yazilanlar = [];
      const adimlar = [
        { content: '', toolCalls: [{ function: { name: 'write_file', arguments: { files: [{ path: 'src/x.js', content: 'x' }] } } }] },
        { content: '', toolCalls: [{ function: { name: 'bash', arguments: { command: komut } } }] },
        { content: 'bitti', toolCalls: [] },
      ];
      let i = 0;
      return runAgentic({
        callModel: async () => adimlar[Math.min(i++, 2)],
        systemPrompt: 'test', task: 'düzelt', loadTool: () => bosArac,
        allowed: ['write_file', 'bash'],
        hafiza: {
          bagliMi: true,
          hatirla: async () => ({ hatiralar: [], aramaSuresiMs: 0 }),
          hatirlat: async (k) => { yazilanlar.push(k); return true; },
        },
      }).then(() => yazilanlar);
    };
    expect(await calistir('npm --version')).toEqual([]);
    expect(await calistir('git status')).toEqual([]);
    expect(await calistir('pytest -q')).toHaveLength(1);
  });
});
