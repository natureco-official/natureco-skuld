import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import writeFile from '../../src/tools/write_file.js';
import editFile from '../../src/tools/edit_file.js';
import notebookEdit from '../../src/tools/notebook_edit.js';
import structuralPatch from '../../src/tools/structural_patch.js';
import { executeThroughGateway } from '../../src/utils/tool-execution-gateway.js';

/**
 * Yazma sınırı — workspace dışına onaysız yazılamaz.
 *
 * Codex tur 5, dört tur boyunca kovaladığım dar boşlukların hiçbirinin en
 * büyük risk OLMADIĞINI söyledi ve şunu gösterdi: `write_file` workspace
 * dışına onaysız yazabiliyordu. Somut tetikleme Windows Startup dizinine
 * `.cmd` bırakmaktı — kalıcılık.
 *
 * Hassas yol listesi bir KARA LİSTEYDİ. Startup dizini, `.bashrc`, uygulama
 * ayar dosyaları hiçbirinde yoktu ve olamazdı da: kara liste "neyi
 * yasaklayacağını bilmek" ister, sınır "neyin içeride olduğunu bilmek".
 * İkincisi bilinebilir.
 */

let eskiBayrak;
let disariDizin;

beforeAll(() => {
  eskiBayrak = process.env.SKULD_AG_ONAYSIZ;
  // Etkileşimsiz ortamda onay sorulamaz → reddedilir.
  process.env.SKULD_AG_ONAYSIZ = '1';
  disariDizin = fs.mkdtempSync(path.join(os.tmpdir(), 'skuld-disari-'));
});

afterAll(() => {
  if (eskiBayrak === undefined) delete process.env.SKULD_AG_ONAYSIZ;
  else process.env.SKULD_AG_ONAYSIZ = eskiBayrak;
  fs.rmSync(disariDizin, { recursive: true, force: true });
});

const icerdeYol = (ad) => path.join(process.cwd(), 'src', 'utils', ad);

describe('yazma sınırı — write_file', () => {
  it('workspace DIŞINA onaysız yazamaz ve dosya OLUŞMAZ', async () => {
    // "Başarısız döndü" yetmez: dosyanın gerçekten oluşmadığını görmek
    // gerekiyor. Kalıcılık dosyası yazıldıktan sonra dönen hata kodu bir şeyi
    // düzeltmez.
    const hedef = path.join(disariDizin, 'kalicilik.cmd');
    const r = await writeFile.execute({ path: hedef, content: 'echo x' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('workspace');
    expect(fs.existsSync(hedef)).toBe(false);
  });

  it('workspace İÇİNE yazabilir', async () => {
    const hedef = icerdeYol('__sinir-denemesi.txt');
    try {
      const r = await writeFile.execute({ path: hedef, content: 'merhaba' });
      expect(r.success).toBe(true);
      expect(fs.readFileSync(hedef, 'utf8')).toBe('merhaba');
    } finally {
      fs.rmSync(hedef, { force: true });
    }
  });

  it('`..` ile workspace dışına çıkamaz', async () => {
    const r = await writeFile.execute({
      path: path.join(process.cwd(), '..', 'kacis-denemesi.txt'),
      content: 'x',
    });
    expect(r.success).toBe(false);
    expect(fs.existsSync(path.join(process.cwd(), '..', 'kacis-denemesi.txt'))).toBe(false);
  });

  it('model `onayli` geçirerek sınırı aşamaz', async () => {
    // Sınırın tamamı buna bağlı: onay bayrağı, onaylanacak şeyi üretenin
    // erişebildiği bir yer olamaz.
    const hedef = path.join(disariDizin, 'kendi-onayim.cmd');
    const sonuc = await executeThroughGateway({
      toolName: 'write_file',
      args: { path: hedef, content: 'echo x', onayli: true },
      resolveTool: () => writeFile,
      normalizeSuccess: (r) => r,
      normalizeError: (e) => ({ success: false, error: e }),
    });
    expect(sonuc.success).toBe(false);
    expect(fs.existsSync(hedef)).toBe(false);
  });
});

describe('yazma sınırı — diğer üç yazma aracı', () => {
  it('edit_file workspace dışında düzenleme yapamaz', async () => {
    const hedef = path.join(disariDizin, 'duzenle.txt');
    fs.writeFileSync(hedef, 'eski\n');
    const r = await editFile.execute({ path: hedef, old_string: 'eski', new_string: 'yeni' });
    expect(r.success).toBe(false);
    // Dosya DEĞİŞMEMİŞ olmalı.
    expect(fs.readFileSync(hedef, 'utf8')).toBe('eski\n');
  });

  it('structural_patch workspace dışında uygulanamaz', async () => {
    const hedef = path.join(disariDizin, 'yama.txt');
    fs.writeFileSync(hedef, 'before\n');
    const r = await structuralPatch.execute({
      action: 'apply', path: hedef, operations: [{ search: 'before', replace: 'after' }],
    });
    expect(r.success).toBe(false);
    expect(fs.readFileSync(hedef, 'utf8')).toBe('before\n');
  });

  it('notebook_edit workspace dışında yazamaz', async () => {
    const hedef = path.join(disariDizin, 'defter.ipynb');
    fs.writeFileSync(hedef, JSON.stringify({
      cells: [{ cell_type: 'markdown', source: ['önce'], metadata: {} }],
      metadata: {}, nbformat: 4, nbformat_minor: 5,
    }));
    const r = await notebookEdit.execute({
      filePath: hedef, operation: 'update', cellIndex: 0, newSource: 'sonra',
    });
    expect(r.success).toBe(false);
    expect(fs.readFileSync(hedef, 'utf8')).toContain('önce');
  });

  it('notebook_edit yol verilmediğinde KENDİ hatasını verir', async () => {
    // Sınır kontrolü ilk yazışımda `filePath` doğrulamasının önüne geçmiş ve
    // "filePath gerekli" yerine yanıltıcı bir sınır hatası dönüyordu. Doğru
    // kontrol, yanlış sırada, yanlış cevap.
    const r = await notebookEdit.execute({ operation: 'read' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/filePath/);
  });
});
