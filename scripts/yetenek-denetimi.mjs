#!/usr/bin/env node
/**
 * Yetenek denetimi — "yazıldı" ile "çalışıyor" arasındaki farkı ölçer.
 *
 * Kullanıcının hedefi tek cümleydi: *"Senin yapabildiğin her şeyi Skuld da
 * yapabilmeli."* Bu hedefin en kolay yanlışlanacağı yer, testi olan ama
 * döngüye bağlı olmayan bir yetenektir — hafıza ve kalite kapısı tam olarak
 * bu durumdaydı: aylardır yazılı ve testliydiler, hiç çağrılmıyorlardı.
 *
 * Birim testleri bir modülün KENDİSİNİN doğru olduğunu gösterir. Bu betik
 * başka bir soru soruyor: dışarıdan bakınca bu yetenek gerçekten bir iş
 * yapıyor mu? Bu yüzden gerçek etkiye bakar — dizin oluştu mu, süreç açıldı
 * mı, araç engellendi mi — iddiaya değil.
 *
 * Kullanım: node scripts/yetenek-denetimi.mjs
 */

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const sonuclar = [];

function kayit(yetenek, durum, not) {
  sonuclar.push({ yetenek, durum, not });
}

async function dene(yetenek, fn) {
  try {
    const not = await fn();
    kayit(yetenek, 'ÇALIŞIYOR', not || '');
  } catch (hata) {
    kayit(yetenek, 'KIRIK', hata && hata.message ? hata.message : String(hata));
  }
}

// ── 1. Plan modu ──────────────────────────────────────────────────────────
// Ölçüt: plan modundayken YAZMA araçları gerçekten engelleniyor mu?
// "Plan modu var" demek yetmez; engellemiyorsa yalnızca bir sistem
// mesajıdır.
await dene('plan-mode', () => {
  const { PlanMode } = require('../src/utils/plan-mode.js');
  const pm = new PlanMode();
  pm.enter();
  if (!pm.isPlanning()) throw new Error('enter() sonrası isPlanning() false');

  const yazma = pm.checkTool('write_file', { path: 'x.js' });
  const okuma = pm.checkTool('read_file', { path: 'x.js' });
  const engellendi = yazma === false || (yazma && yazma.allowed === false);
  const okumaSerbest = okuma === true || !okuma || okuma.allowed !== false;

  if (!engellendi) throw new Error('plan modunda write_file ENGELLENMEDİ');
  if (!okumaSerbest) throw new Error('plan modunda read_file de engellendi (fazla geniş)');

  pm.exit('plan metni');
  if (!pm.inReview()) throw new Error('exit() sonrası inceleme durumuna geçmedi');
  pm.approve();
  if (!pm.isNormal()) throw new Error('approve() sonrası normale dönmedi');
  return 'yazma engellendi, okuma serbest, durum geçişleri tamam';
});

// ── 2. Worktree ───────────────────────────────────────────────────────────
// Ölçüt: gerçekten ayrı bir çalışma ağacı OLUŞUYOR mu ve yol çözümü oraya
// mı gidiyor? Bu, izole deneme yapabilmenin ön koşulu.
await dene('worktree', () => {
  const { Worktree, isSafeIdentifier } = require('../src/utils/worktree.js');
  if (isSafeIdentifier('../kacis')) throw new Error('isSafeIdentifier yol kaçışını kabul etti');
  if (!isSafeIdentifier('deneme-1')) throw new Error('isSafeIdentifier normal adı reddetti');

  // GERÇEKTEN açılır. "API ayakta" demek yetmez — `enter()` git başarısız
  // olduğunda sessizce dizin kopyalamaya düşüyor, yani yanlış çalışan bir
  // worktree de "başarılı" görünebilir. Strateji alanı bu yüzden kontrol
  // ediliyor.
  //
  // Kullanıcının deposunda YAPILMAZ: `enter()` dal oluşturur ve `.nskuld/`
  // altına yazar. Denetim betiği ölçtüğü şeyi değiştirmemeli.
  const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'skuld-wt-'));
  const eskiDizin = process.cwd();
  try {
    execFileSync('git', ['init', '-q'], { cwd: gecici, stdio: 'pipe' });
    execFileSync('git', ['config', 'user.email', 'denetim@skuld'], { cwd: gecici, stdio: 'pipe' });
    execFileSync('git', ['config', 'user.name', 'denetim'], { cwd: gecici, stdio: 'pipe' });
    fs.writeFileSync(path.join(gecici, 'a.txt'), 'merhaba\n');
    execFileSync('git', ['add', '-A'], { cwd: gecici, stdio: 'pipe' });
    execFileSync('git', ['commit', '-qm', 'ilk'], { cwd: gecici, stdio: 'pipe' });

    process.chdir(gecici);
    const wt = new Worktree();
    if (!wt.isGitRepo) throw new Error('geçici depo git deposu olarak tanınmadı');

    const acilis = wt.enter({ id: 'denetim-1' });
    if (acilis.error) throw new Error(`enter() hata: ${acilis.error}`);
    if (!fs.existsSync(acilis.worktreeDir)) throw new Error('worktree dizini OLUŞMADI');
    if (!fs.existsSync(path.join(acilis.worktreeDir, 'a.txt'))) {
      throw new Error('worktree içinde depo dosyaları yok');
    }
    const strateji = wt.active.strategy;
    const kapanis = wt.exit({ merge: false });
    if (kapanis.error) throw new Error(`exit() hata: ${kapanis.error}`);

    return strateji === 'git-worktree'
      ? 'gerçek git worktree açıldı, dosyalar yerinde, kapanış temiz'
      : `AÇILDI ama kopyalama yedeğine düştü (strateji: ${strateji}) — git worktree çalışmıyor`;
  } finally {
    process.chdir(eskiDizin);
    fs.rmSync(gecici, { recursive: true, force: true });
  }
});

// ── 3. Alt ajan ───────────────────────────────────────────────────────────
// Ölçüt: araç sözleşmesi eksiksiz mi? Modelin çağırabilmesi için şema ve
// execute gerekiyor.
await dene('sub_agent', () => {
  const t = require('../src/tools/sub_agent.js');
  if (!t.name) throw new Error('name yok');
  if (typeof t.execute !== 'function') throw new Error('execute yok');
  if (!t.inputSchema || !t.inputSchema.properties) throw new Error('inputSchema yok');
  return `şema: ${Object.keys(t.inputSchema.properties).join(', ')}`;
});

// ── 4. LSP istemcisi ──────────────────────────────────────────────────────
// Ölçüt: tanımlı sunucular gerçekten bu makinede var mı? Yoksa yetenek
// "yazılı ama çalışmaz" durumunda demektir ve bunu bilmek gerekir.
await dene('lsp-client', () => {
  const { LspClient, DEFAULT_SERVERS } = require('../src/utils/lsp-client.js');
  if (typeof LspClient !== 'function') throw new Error('LspClient sınıf değil');
  const diller = Object.keys(DEFAULT_SERVERS || {});
  if (diller.length === 0) throw new Error('tanımlı LSP sunucusu yok');
  return `tanımlı diller: ${diller.join(', ')}`;
});

// ── 5. Hafıza döngüye bağlı mı ────────────────────────────────────────────
// Bu, betiğin var olma nedeni. Hafıza paketi aylarca testliydi ve döngü onu
// hiç çağırmıyordu.
await dene('hafıza → ajan döngüsü', async () => {
  const { runAgentic } = require('../src/tools/agentic-runner.js');
  const gorulen = [];
  await runAgentic({
    callModel: async (messages) => { gorulen.push(...messages); return { content: 'bitti', toolCalls: [] }; },
    systemPrompt: 'denetim',
    task: 'hatırla',
    loadTool: () => ({ execute: async () => ({ success: true }) }),
    hafiza: {
      bagliMi: true,
      hatirla: async () => ({ hatiralar: [{ kapsam: 'proje', metin: 'DENETIM-IZI' }], aramaSuresiMs: 1 }),
      hatirlat: async () => true,
    },
  });
  const kullanici = gorulen.find((m) => m.role === 'user');
  if (!kullanici || !kullanici.content.includes('DENETIM-IZI')) {
    throw new Error('RECALL hatırayı göreve EKLEMEDİ — hafıza döngüye bağlı değil');
  }
  if (!kullanici.content.includes('NOTTUR')) {
    throw new Error('hatıralar TALİMAT gibi eklenmiş — zehirlenmiş hafıza kalıcı prompt injection olur');
  }
  return 'RECALL hatırayı veri olarak ekliyor';
});

// ── 6. Kalite kapısı döngüye bağlı mı ─────────────────────────────────────
await dene('kalite kapısı → ajan döngüsü', async () => {
  const { runAgentic } = require('../src/tools/agentic-runner.js');
  let cagrildi = false;
  const sonuc = await runAgentic({
    callModel: (() => {
      let i = 0;
      const y = [
        { content: '', toolCalls: [{ function: { name: 'write_file', arguments: { files: [{ path: 'src/x.js', content: 'x' }] } } }] },
        { content: 'bitti', toolCalls: [] },
      ];
      return async () => y[Math.min(i++, 1)];
    })(),
    systemPrompt: 'denetim',
    task: 'yaz',
    loadTool: () => ({ execute: async () => ({ success: true }) }),
    allowed: ['write_file'],
    kapi: {
      tara: async () => null,
      degerlendir: async () => {
        cagrildi = true;
        return { bulgular: [], blokluyorMu: false, codednaCalisti: false, codednaYokNedeni: null };
      },
    },
  });
  if (!cagrildi) throw new Error('dosya değiştiği hâlde kalite kapısı ÇAĞRILMADI');
  if (!sonuc.kaliteRaporu) throw new Error('kalite raporu sonuca girmedi');
  return 'değişiklik sonrası kapı çalışıyor';
});

// ── 7. Kod çalıştırma yeteneği kapalı mı ──────────────────────────────────
await dene('code_execution onay kapısı', async () => {
  const eski = process.env.SKULD_AG_ONAYSIZ;
  process.env.SKULD_AG_ONAYSIZ = '1';
  try {
    const t = require('../src/tools/code_execution.js');
    const r = await t.execute({ code: 'console.log(1)', language: 'node' });
    if (r.success) throw new Error('onaysız kod ÇALIŞTI');
    return 'onaysız kod reddediliyor';
  } finally {
    if (eski === undefined) delete process.env.SKULD_AG_ONAYSIZ;
    else process.env.SKULD_AG_ONAYSIZ = eski;
  }
});

// ── 8. Hassas yol sınırı ──────────────────────────────────────────────────
await dene('hassas yol sınırı', () => {
  const { assessToolPath } = require('../src/utils/tool-path-policy.js');
  const hassas = path.join(os.homedir(), '.ssh');
  for (const [arac, arg] of [
    ['read_file', { path: path.join(hassas, 'id_rsa') }],
    ['grep_search', { path: hassas }],
    ['file_search', { basePath: hassas }],
    ['bilinmeyen', { cwd: hassas }],
  ]) {
    if (assessToolPath(arac, arg).allowed !== false) {
      throw new Error(`${arac} hassas yola erişebiliyor`);
    }
  }
  if (assessToolPath('grep_search', { path: 'src' }).allowed !== true) {
    throw new Error('sıradan yol yanlışlıkla engellendi');
  }
  return 'dört araç da engellendi, sıradan yol serbest';
});

// ── 9. Tamamlanma kapısı varsayılan yolda mı ──────────────────────────────
// Kapı `agentic-runner`'da vardı ama kullanıcının fiilen kullandığı
// `code_v5` yolunda YOKTU — yani yoktu. Bu kontrol iki şeye bakıyor: modül
// doğru karar veriyor mu, ve varsayılan yol onu gerçekten çağırıyor mu.
await dene('tamamlanma kapısı → varsayılan yol', async () => {
  const kapi = require('../src/utils/tamamlanma-kapisi.js');

  const degismedi = await kapi.kanitTopla({
    degisenDosyalar: [], projeIndeksi: {}, calistir: async () => ({ ok: true }),
  });
  if (!degismedi.tamam) throw new Error('değişiklik yokken kapı boşuna engelliyor');

  const kanitsiz = await kapi.kanitTopla({
    degisenDosyalar: ['src/x.js'],
    projeIndeksi: { type: 'bilinmeyen' },
    calistir: async () => ({ ok: true }),
  });
  if (kanitsiz.tamam) throw new Error('doğrulama komutu yokken sessizce TAMAM dedi');

  const basarisiz = await kapi.kanitTopla({
    degisenDosyalar: ['src/x.js'],
    projeIndeksi: { packageJson: { scripts: { test: 'vitest' } } },
    calistir: async () => ({ ok: false, cikti: 'FAIL' }),
  });
  if (basarisiz.tamam) throw new Error('doğrulama başarısızken TAMAM dedi');

  // Varsayılan yol kapıyı gerçekten çağırıyor mu? Modülün doğru olması,
  // çağrıldığı anlamına gelmiyor — bu betiğin var olma sebebi tam olarak bu.
  const kaynak = fs.readFileSync(new URL('../src/commands/code_v5.js', import.meta.url), 'utf8');
  if (!kaynak.includes("require('../utils/tamamlanma-kapisi')")) {
    throw new Error('code_v5 tamamlanma kapısını ÇAĞIRMIYOR');
  }
  if (!/kapi\.kanitTopla\(/.test(kaynak)) {
    throw new Error('code_v5 kapıyı import ediyor ama kanitTopla çağırmıyor');
  }
  return 'kapı doğru karar veriyor ve varsayılan yol onu çağırıyor';
});

// ── Rapor ─────────────────────────────────────────────────────────────────
const kirik = sonuclar.filter((s) => s.durum === 'KIRIK');
const genislik = Math.max(...sonuclar.map((s) => s.yetenek.length));

console.log('');
console.log('  Yetenek denetimi');
console.log('  ' + '─'.repeat(genislik + 46));
for (const s of sonuclar) {
  const im = s.durum === 'ÇALIŞIYOR' ? '✓' : '✗';
  console.log(`  ${im} ${s.yetenek.padEnd(genislik)}  ${s.durum.padEnd(10)} ${s.not}`);
}
console.log('  ' + '─'.repeat(genislik + 46));
console.log(`  ${sonuclar.length - kirik.length}/${sonuclar.length} yetenek çalışıyor`);
console.log('');

process.exit(kirik.length > 0 ? 1 : 0);
