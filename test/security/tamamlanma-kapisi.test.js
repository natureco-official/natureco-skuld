import { describe, it, expect } from 'vitest';
import {
  kanitTopla, dogrulamaKomutlari, kanitSayilir, degisenDosyalar,
} from '../../src/utils/tamamlanma-kapisi.js';

/**
 * Tamamlanma kapısı — "bitti" demek için kanıt gerekir.
 *
 * Codex tur 5, ürün hedefi açısından en kritik eksiği bu diye işaretledi:
 * varsayılan kodlama yolu model araç çağırmayı bıraktığı anda başarıyla
 * tamamlanıyordu. Kanıt kuralı `agentic-runner`'da vardı ama kullanıcının
 * fiilen kullandığı yolda yoktu — yani yoktu.
 */

describe('kanitSayilir', () => {
  it('doğrulama yapan komutları kabul eder', () => {
    for (const k of ['npm test', 'pytest -q', 'cargo test', 'make check', './betik.sh']) {
      expect(kanitSayilir(k), k).toBe(true);
    }
  });

  it('hiçbir şey kanıtlamayan komutları reddeder', () => {
    // Çıkış kodu sıfır olması bir şeyin doğrulandığı anlamına gelmiyor.
    for (const k of ['echo ok', 'ls -la', 'git status', 'npm --version', 'npm version',
      'java -version', 'node info', 'pwd', '']) {
      expect(kanitSayilir(k), k).toBe(false);
    }
  });
});

describe('dogrulamaKomutlari', () => {
  it('test komutunu önce sıralar — davranış kanıtı en güçlüsü', () => {
    const k = dogrulamaKomutlari({ packageJson: { scripts: { test: 'vitest', lint: 'eslint', build: 'tsc' } } });
    expect(k[0].tur).toBe('test');
    expect(k.map((x) => x.tur)).toEqual(['test', 'build', 'lint']);
  });

  it('npm betiği yoksa dil tipine göre seçer', () => {
    expect(dogrulamaKomutlari({ type: 'python' })[0].komut).toBe('python -m pytest');
    expect(dogrulamaKomutlari({ type: 'rust' })[0].komut).toBe('cargo test');
    expect(dogrulamaKomutlari({ type: 'go' })[0].komut).toBe('go test ./...');
  });

  it('hiçbir şey tespit edemezse boş döner', () => {
    expect(dogrulamaKomutlari({ type: 'bilinmeyen' })).toEqual([]);
    expect(dogrulamaKomutlari(null)).toEqual([]);
  });
});

describe('kanitTopla', () => {
  const proje = { packageJson: { scripts: { test: 'vitest' } } };

  it('dosya değişmediyse kapı yoktur', async () => {
    // Salt okuma görevleri bedel ödemez.
    let cagrildi = false;
    const r = await kanitTopla({
      degisenDosyalar: [],
      projeIndeksi: proje,
      calistir: async () => { cagrildi = true; return { ok: true }; },
    });
    expect(r.tamam).toBe(true);
    expect(cagrildi).toBe(false);
  });

  it('değişiklik varsa doğrulama ÇALIŞTIRIR', async () => {
    const kosanlar = [];
    const r = await kanitTopla({
      degisenDosyalar: ['src/a.js'],
      projeIndeksi: proje,
      calistir: async (k) => { kosanlar.push(k); return { ok: true }; },
    });
    expect(kosanlar).toEqual(['npm test']);
    expect(r.tamam).toBe(true);
    expect(r.kanit.tur).toBe('test');
  });

  it('doğrulama BAŞARISIZSA tamamlanmaz ve çıktı onarıma verilir', async () => {
    const r = await kanitTopla({
      degisenDosyalar: ['src/a.js'],
      projeIndeksi: proje,
      calistir: async () => ({ ok: false, cikti: 'FAIL: beklenen 42, gelen 41' }),
    });
    expect(r.tamam).toBe(false);
    expect(r.onarimIcin).toContain('beklenen 42');
  });

  it('model kendi doğrulamasını koştuysa YENİDEN koşulmaz', async () => {
    // Aynı testi ikinci kez koşmak yavaşlatır ve hiçbir şey eklemez.
    let cagrildi = false;
    const r = await kanitTopla({
      degisenDosyalar: ['src/a.js'],
      projeIndeksi: proje,
      zatenCalisanlar: ['npm test'],
      calistir: async () => { cagrildi = true; return { ok: true }; },
    });
    expect(r.tamam).toBe(true);
    expect(cagrildi).toBe(false);
  });

  it('modelin koştuğu komut kanıt değilse yine doğrulama koşulur', async () => {
    // `echo tamam` çıkış kodu sıfır verir ve hiçbir şey kanıtlamaz — tam
    // olarak agentic-runner'da kapatılan atlatma.
    const kosanlar = [];
    const r = await kanitTopla({
      degisenDosyalar: ['src/a.js'],
      projeIndeksi: proje,
      zatenCalisanlar: ['echo tamam', 'ls'],
      calistir: async (k) => { kosanlar.push(k); return { ok: true }; },
    });
    expect(kosanlar).toEqual(['npm test']);
    expect(r.tamam).toBe(true);
  });

  it('doğrulama komutu YOKSA sessizce başarılı SAYMAZ', async () => {
    // Sessizce "tamam" demek, kapının hiç olmamasıyla aynı şey. Kullanıcı
    // neye güvendiğini bilmeli.
    const r = await kanitTopla({
      degisenDosyalar: ['src/a.js'],
      projeIndeksi: { type: 'bilinmeyen' },
      calistir: async () => ({ ok: true }),
    });
    expect(r.tamam).toBe(false);
    expect(r.gerekce).toContain('DOĞRULANMADI');
  });
});

describe('degisenDosyalar', () => {
  it('yazma araçlarının hedeflerini çıkarır', () => {
    const d = degisenDosyalar([
      { tool: 'read_file', status: 'done', args: { path: 'src/okundu.js' } },
      { tool: 'write_file', status: 'done', args: { path: 'src/a.js' } },
      { tool: 'edit_file', status: 'done', args: { path: 'src/b.js' } },
      { tool: 'notebook_edit', status: 'done', args: { filePath: 'n.ipynb' } },
    ]);
    expect(d.map((x) => x.replace(/\\/g, '/')).sort())
      .toEqual(['n.ipynb', 'src/a.js', 'src/b.js']);
  });

  it('hata veren yazmaları saymaz', () => {
    // Başarısız bir yazma dosyayı değiştirmedi; onu doğrulanacak değişiklik
    // saymak, olmayan işi doğrulamaya çalışmak olurdu.
    expect(degisenDosyalar([{ tool: 'write_file', status: 'error', args: { path: 'src/a.js' } }]))
      .toEqual([]);
  });
});
