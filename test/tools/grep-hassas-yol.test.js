import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import grepSearch from '../../src/tools/grep_search.js';
import { assessToolPath } from '../../src/utils/tool-path-policy.js';
import { maskText } from '../../src/utils/secret-scanner.js';

/**
 * `read_file` hassas dosyayı engellerken `grep_search` aynı içeriği
 * döndürüyordu.
 *
 * Yol politikası okuma tarafında BEYAZ LİSTE gibi çalışıyordu: yalnızca
 * `read_file` denetleniyor, geri kalan her araç serbest bırakılıyordu.
 * Sayılmayanı serbest bırakan bir liste, güvenlik sınırı değildir.
 */

let kok;
beforeAll(() => {
  kok = fs.mkdtempSync(path.join(os.tmpdir(), 'skuld-gizli-'));
  fs.mkdirSync(path.join(kok, '.ssh'), { recursive: true });
  fs.writeFileSync(
    path.join(kok, '.ssh', 'id_rsa'),
    '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----\n',
  );
});
afterAll(() => fs.rmSync(kok, { recursive: true, force: true }));

describe('yol politikası — hassas okuma her araç için geçerli', () => {
  it('grep_search hassas DİZİNİ hedefleyemez', () => {
    // Desenler `.ssh/` diye bitiyordu; argüman dizinin kendisi olunca
    // sondaki ayıraç yoktu ve hiçbiri eşleşmiyordu. Yani korunmak istenen
    // dizini doğrudan vermek denetimi atlatıyordu.
    const karar = assessToolPath('grep_search', { path: path.join(kok, '.ssh') });
    expect(karar.allowed).toBe(false);
  });

  it('grep_search hassas DOSYAYI hedefleyemez', () => {
    const karar = assessToolPath('grep_search', { path: path.join(kok, '.ssh', 'id_rsa') });
    expect(karar.allowed).toBe(false);
  });

  it('`cwd` argümanı da yol sayılır', () => {
    expect(assessToolPath('grep_search', { cwd: path.join(kok, '.ssh') }).allowed).toBe(false);
  });

  it('`basePath` gibi araca özel yol adları da sayılır', () => {
    // Anahtar adları fork boyunca tutarlı değil ve eksik bir ad, o aracın
    // denetimden TAMAMEN muaf olması demek. `file_search` `basePath`
    // kullanıyor ve tam olarak böyle kaçıyordu.
    expect(assessToolPath('file_search', { basePath: path.join(kok, '.ssh') }).allowed).toBe(false);
    expect(assessToolPath('file_search', { rootPath: path.join(kok, '.ssh') }).allowed).toBe(false);
  });

  it('sıradan yollar etkilenmez', () => {
    expect(assessToolPath('grep_search', { path: 'src' }).allowed).toBe(true);
    expect(assessToolPath('read_file', { path: 'src/index.js' }).allowed).toBe(true);
    expect(assessToolPath('file_search', { basePath: 'src' }).allowed).toBe(true);
  });
});

describe('grep_search — sonuç süzme', () => {
  it('hassas dosyadan gelen eşleşmeler sonuçlara girmez', async () => {
    // Yolu engellemek tek başına yetmiyor: `path: ~` verildiğinde arama alt
    // dizinlere kendi iniyor. Bu yüzden süzme sonuçta da yapılıyor.
    const sonuc = await grepSearch.execute({ pattern: 'PRIVATE KEY', path: path.join(kok, '.ssh') });
    expect(sonuc.results).toEqual([]);
    expect(JSON.stringify(sonuc)).not.toContain('BEGIN OPENSSH');
  });

  it('gizlenen eşleşme SAYISI bildirilir', async () => {
    // Sessizce eksik sonuç vermek aracın yalan söylemesidir; model orada bir
    // şey olduğunu ama gösterilmediğini bilmeli.
    const sonuc = await grepSearch.execute({ pattern: 'PRIVATE KEY', path: path.join(kok, '.ssh') });
    expect(sonuc.gizlenenSonuc).toBeGreaterThan(0);
    expect(sonuc.gizlemeNedeni).toContain('güvenlik politikası');
  });

  it('normal arama sonuçları bozulmadan döner', async () => {
    fs.writeFileSync(path.join(kok, 'not.txt'), 'merhaba dünya\n');
    const sonuc = await grepSearch.execute({ pattern: 'merhaba', path: kok });
    expect(sonuc.success).toBe(true);
    expect(sonuc.results.length).toBeGreaterThan(0);
    expect(sonuc.results[0].text).toContain('merhaba');
  });
});

describe('maskText', () => {
  it('bilinen anahtar biçimlerini maskeler', () => {
    const cikti = maskText('key sk-ant-api03-AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIIIJJJJKKKKLLLL son');
    expect(cikti).not.toContain('AAAABBBBCCCC');
    expect(cikti).toContain('***');
  });

  it('git SHA gibi yüksek entropili ama masum dizeleri BOZMAZ', () => {
    // Entropi sezgiseli bilerek kullanılmıyor: 40 karakterlik bir SHA da
    // eşiği geçiyor ve her commit kimliğini maskelemek aracı kullanılamaz
    // hâle getirirdi.
    const sha = 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3';
    expect(maskText(`commit ${sha}`)).toContain(sha);
  });
});
