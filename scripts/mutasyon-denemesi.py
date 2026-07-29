"""Mutasyon denemesi: her düzeltmeyi tek tek geri al, testin kırıldığını gör.

Codex kapanış turu 4 haklıydı: beş test, düzeltme geri alındığında yeşil
kalıyordu — yani ölçtüğünü sandığı şeyi ölçmüyordu. Bunu bir daha iddiaya
bırakmamak için mutasyonlar burada duruyor ve tekrar çalıştırılabilir.
"""
import io, subprocess, shutil, sys, os

# Depo kökü betiğin konumundan türetiliyor. Sabit yol yazmak, betiği yalnızca
# tek bir makinede çalışır hâle getirirdi (Codex tur 5).
KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MUTASYONLAR = [
    # (etiket, dosya, eski, yeni)
    ('B1 durum makinesi -> eski satir sezgiseli',
     r'scripts\gateway-boundary-check.mjs',
     'function ihlalDurumu(metin) {\n  const hamVar = YASAK.some((desen) => desen.test(metin));',
     'function ihlalDurumu(metin) {\n  const hamVar = YASAK.some((desen) => desen.test(kodSatirlari(metin)));'),

    ('B2 yeni kimlik onekleri kaldirildi',
     r'src\utils\gateway.js',
     '|KUBECONFIG|DOCKER_CONFIG|GOOGLE_APPLICATION_CREDENTIALS|AZURE_|GH_TOKEN|GITLAB_|VAULT_|CLOUDSDK_|GIT_ASKPASS|SSH_ASKPASS|SUDO_ASKPASS|GIT_SSH_COMMAND|NETRC)',
     ')'),

    ('B3 YAML blok gostergesi kaldirildi',
     r'src\utils\secret-scanner.js',
     "([>|][0-9]*[-+]?)?",
     "[>|]?"),

    ('B5 tum alanlar -> yalnizca ilk alan',
     r'src\utils\tool-path-policy.js',
     'const hassas = yollar.find(({ ad, deger }) => hassasMi(expandPath(deger), toolName, ad));',
     'const hassas = null;'),

    ('B5 cikti alanlari yazma sayilmiyor',
     r'src\utils\tool-path-policy.js',
     'const write = yazanArac || (alanAdi != null && CIKTI_ALANLARI.has(alanAdi));',
     'const write = yazanArac;'),

    ('B7 sorgu alt komutu kaldirildi',
     r'src\tools\agentic-runner.js',
     'if (SORGU_ARGUMANI.test(komut) || SORGU_ALTKOMUTU.test(komut)) continue;',
     'if (SORGU_ARGUMANI.test(komut)) continue;'),
]

# Yazma sınırı mutasyonları ayrı test dosyasını hedefliyor.
MUTASYONLAR_YAZMA = [
    ('write_file sinir kontrolu kaldirildi',
     os.path.join('src', 'tools', 'write_file.js'),
     "const sinir = await _siniriDogrula(filePath, params, 'write_file aracı');",
     'const sinir = { izin: true };'),

    ('edit_file sinir kontrolu kaldirildi',
     os.path.join('src', 'tools', 'edit_file.js'),
     "const sinir = await yazmaSiniri(_expand(filePath), { onayli: onayli === true, amac: 'edit_file aracı' });",
     'const sinir = { izin: true };'),

    ('yazmaSiniri onay yerine izin veriyor',
     os.path.join('src', 'utils', 'gateway.js'),
     "const karar = await yazmaOnayiSor(mutlak, workspace, opt.amac);",
     "const karar = 'izin';"),
]

TEST = 'test/security/codex-tur3.test.js'
TEST_YAZMA = 'test/security/yazma-siniri.test.js'


def kos(test=TEST):
    r = subprocess.run(
        ['npx', 'vitest', 'run', test, '--reporter=dot'],
        cwd=KOK, capture_output=True, text=True, shell=True, timeout=900,
        encoding='utf-8', errors='replace',
    )
    return r.returncode


print('temel durum...', end=' ')
if kos() != 0:
    print('BASARISIZ — mutasyona baslamadan testler zaten kirmizi')
    sys.exit(1)
print('yesil')

hayatta_kalan = []
for etiket, dosya, eski, yeni, test in (
    [(*m, TEST) for m in MUTASYONLAR] + [(*m, TEST_YAZMA) for m in MUTASYONLAR_YAZMA]
):
    yol = os.path.join(KOK, dosya)
    yedek = yol + '.mutbak'
    shutil.copyfile(yol, yedek)
    try:
        s = io.open(yol, encoding='utf-8').read()
        if eski not in s:
            print(f'  ATLANDI  {etiket} (desen bulunamadi)')
            continue
        io.open(yol, 'w', encoding='utf-8', newline='').write(s.replace(eski, yeni, 1))
        kod = kos(test)
        if kod == 0:
            print(f'  HAYATTA  {etiket}  <- TEST KIRILMADI')
            hayatta_kalan.append(etiket)
        else:
            print(f'  oldu     {etiket}')
    finally:
        shutil.copyfile(yedek, yol)
        os.remove(yedek)

print()
if hayatta_kalan:
    print(f'{len(hayatta_kalan)} mutasyon hayatta kaldi — o testler duzeltmeyi sabitlemiyor:')
    for h in hayatta_kalan:
        print('  -', h)
    sys.exit(1)
print(f'{len(MUTASYONLAR) + len(MUTASYONLAR_YAZMA)} mutasyonun hepsi oldu — testler duzeltmeleri gercekten sabitliyor.')
