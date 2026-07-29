const { assessToolPath, expandPath } = require('../../src/utils/tool-path-policy');

describe('tool path policy', () => {
  test('blocks credential reads and persistence writes', () => {
    expect(assessToolPath('read_file', { path: '~/.npmrc' }).allowed).toBe(false);
    expect(assessToolPath('write_file', { path: '~/.ssh/authorized_keys' }).allowed).toBe(false);
    expect(assessToolPath('edit_file', { path: '~/.aws/credentials' }).allowed).toBe(false);
  });

  test('allows ordinary project files', () => {
    expect(assessToolPath('read_file', { path: './src/app.js' }).allowed).toBe(true);
    expect(assessToolPath('grep_search', { path: 'src' }).allowed).toBe(true);
    expect(expandPath('~/project')).toMatch(/project$/);
  });

  // BEKLENTİ DEĞİŞTİ (Skuld, 29.07.2026).
  //
  // Bu satır eskiden `list_dir` için `~/.ssh`'yi izinli sayıyordu ve başlığı
  // "irrelevant tool paths" idi. Politika okuma tarafında beyaz liste gibi
  // çalışıyordu: yalnızca `read_file` denetleniyor, adı sayılmayan her araç
  // serbest bırakılıyordu.
  //
  // Bunun "ilgisiz" olmadığı ölçülerek görüldü: `read_file` `~/.ssh/id_rsa`'yı
  // engellerken `grep_search` aynı dizini hedefleyip özel anahtarın
  // satırlarını döndürüyordu. Aynı sınıfın bir üyesini engelleyip diğerini
  // serbest bırakan liste, sınır değil gecikmedir.
  //
  // Yeni varsayılan kapalı. `list_dir` için de kapalı: hangi anahtarların
  // durduğunu bilmek keşfin kendisidir, içeriği okumak gerekmez.
  test('hassas yollar araç adına bakılmaksızın kapalı', () => {
    expect(assessToolPath('list_dir', { path: '~/.ssh' }).allowed).toBe(false);
    expect(assessToolPath('grep_search', { path: '~/.ssh' }).allowed).toBe(false);
    expect(assessToolPath('bilinmeyen_arac', { path: '~/.aws/credentials' }).allowed).toBe(false);
  });
});
