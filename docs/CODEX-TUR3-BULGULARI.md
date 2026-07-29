# Codex tur 3 — bulgular (29.07.2026)

`codex exec --sandbox read-only` ile çalıştırıldı; brifing
[`CODEX-DENETIM.md`](CODEX-DENETIM.md) → "Tur 3".

**Yedi bulgu verildi, yedisi de tetiklenerek doğrulandı, yedisi de kapatıldı.**
Bu turda yanlış alarm yok — tur 1'de bir kısım bulgu şema dosyasından okunmuş
varsayımdı. Aradaki fark brifingteki kuralın tekrarı: *tetikleyemediğin şey
bulgu değildir.*

Codex ayrıca üç iddiayı **doğrulanmış** saydı: `code_execution` onay kapısını
atlayan canlı bir yol bulamadı, `grep_search`'ün model yolu süzülüyor, ve
`_grepWithNode` yalnızca testlerden çağrılıyor. Bir soruda da "EMİN DEĞİLİM"
yazıp bulgu saymadı — istenen davranış tam olarak buydu.

## Kapanış özeti

| # | Bulgu | Düzeltme |
|---|---|---|
| 1 | Dizedeki `/*` sınır lint'ini körleştiriyor | Blok yorum regex'i kaldırıldı; yalnızca satır başı belirteçleri ayıklanıyor |
| 2 | `PGPASSWORD` alt sürece geçiyor | Ada dayalı süzgeç ayıraçsız adları da kapsıyor (`PGHOST` geçmeye devam ediyor) |
| 3 | 40 haneli hex gerçek sır taşıyabilir | Muafiyet bağlama duyarlı: `SECRET=` sağındaki hex maskeleniyor, git SHA'sı değil |
| 4 | `read_file` / `document_extract` süzülmüyor | `document_extract` maskeliyor; `read_file` **maskelemiyor**, uyarıyor — gerekçe aşağıda |
| 5 | `file` / `outputPath` / `.env` kapsam dışı | Argüman adları eklendi; `.env` engelli, `.env.example` serbest |
| 6 | Onay gövdenin içeriğini göstermiyor | Maskeli önizleme eklendi |
| 7 | İlgisiz komut "doğrulama" sayılıyor | Kara liste + sıralama koşulu; kaydedilen metin komutu yazıyor |

### Bulgu 4'te Codex'in önerisi uygulanmadı — sebebi

`read_file`ı da maskelemek daha büyük bir hata olurdu. Çıktısı düzenleme
döngüsünde geri yazılır ("oku → değiştir → `write_file`"); maskelenmiş içerik
geri yazılırsa kullanıcının gerçek anahtarı `sk-a***LLLL` ile **ezilir**.
Sessiz veri kaybı, sessiz ifşadan kötüdür ve geri alınamaz.

Onun yerine içerik olduğu gibi dönüyor ve yanına `sirUyarisi` konuyor. Asıl
savunma yol politikası: `.env`, `.ssh`, `.aws` zaten engelli.

Testler: `test/security/codex-tur3.test.js` (15 test).

---

## Bulgu 1 — Yorum belirteçlerini dizeye koymak sınır lint’ini körleştiriyor

**Dosya:** `scripts/gateway-boundary-check.mjs:83`, `scripts/gateway-boundary-check.mjs:110`  
**Nasıl tetiklenir:** İzinli paket dışındaki bir kaynak dosyasına şu kodu ekleyip `node scripts/gateway-boundary-check.mjs` çalıştır:

```js
const baslangic = "/*";
const { spawn } = require("node:child_process");
const bitis = "*/";
```

Kod çalışırken `require` yürütülür. Lint ise 84/111. satırlardaki regex ile dize içindeki `/*` ile `*/` arasını yorum sanarak tamamen siler; 48–52. satırlardaki yasak desenler importu göremez.

**Neden önemli:** Dize birleştirme gibi kasıtlı kaçışların yanında, doğrudan ve normal yazılmış `require("node:child_process")` bile yorum ayıklayıcısının sözdizimi bilmemesi nedeniyle görünmez olabilir.  
**Güven:** yüksek

## Bulgu 2 — `PGPASSWORD` alt sürece aynen geçiyor

**Dosya:** `src/utils/gateway.js:183`, `src/utils/gateway.js:194`, `src/utils/gateway.js:223`  
**Nasıl tetiklenir:** Ana süreci `PGPASSWORD=correct-horse-battery` ile başlat; ardından onaylanmış `code_execution` içinde `process.env.PGPASSWORD` yazdır. Ad `SIR_ANAHTARI` desenine uymaz: `_PASSWORD` ile bitmez, yalnızca `PGPASSWORD` olur. Değer de bilinen anahtar biçimi veya gömülü bağlantı dizesi değildir.

**Neden önemli:** `PGPASSWORD`, PostgreSQL istemcilerinin yaygın ve doğrudan parola taşıyan standart ortam değişkenidir. Modelin çalıştırdığı kod parolayı okuyabilir.  
**Güven:** yüksek

## Bulgu 3 — 40 haneli onaltılık gerçek sır maskelenmeden geçirilebilir

**Dosya:** `src/utils/secret-scanner.js:28`, `src/utils/secret-scanner.js:136`, `src/utils/secret-scanner.js:158`  
**Nasıl tetiklenir:** Bir dosyaya tırnaksız, uygulamada gerçekten imzalama sırrı olarak kullanılan şu biçimde bir değer koy:

```text
WEBHOOK_SECRET=0123456789abcdef0123456789abcdef01234567
```

Ardından `grep_search` ile bu satırı getir. Değer 40 karakterlik genel desene uyar, fakat `masumMu()` saf hex olduğu için eşleşmeyi değişmeden bırakır. Tırnaksız yazıldığı için “Generic Password Assignment” deseni de devreye girmez.

**Neden önemli:** Bir değerin git SHA’sına benzemesi onun git SHA’sı olduğunu kanıtlamaz. 160 bitlik hex webhook/HMAC sırları gerçek ve geçerli kimlik bilgileri olabilir. Aynı muafiyet `degerSirMi()` içinde de `src/utils/gateway.js:205` satırında bulunuyor.  
**Güven:** yüksek

## Bulgu 4 — Dosya içeriği döndüren diğer araçlar sır süzgecinden geçmiyor

**Dosya:** `src/tools/document_extract.js:35`, `src/tools/document_extract.js:72`, `src/tools/read_file.js:74`, `src/tools/read_file.js:78`  
**Nasıl tetiklenir:** Hassas yol desenlerine uymayan `notes.txt` dosyasına bir GitHub tokeni veya yukarıdaki 40-hex sırrı koy. `document_extract({path:"notes.txt"})` ya da `read_file({path:"notes.txt"})` çağır. İçerik doğrudan `content` alanında döner; `maskText` çağrısı yoktur.

**Neden önemli:** `grep_search` sonuçları `src/tools/grep_search.js:241` üzerinden süzülürken, aynı dosya içeriği diğer araçlardan ham olarak model geçmişine ve sağlayıcıya gidebilir. `_grepWithNode` için canlı model kaçışı bulamadım: dışa açık olsa da depoda yalnızca testler çağırıyor; model yolu `execute()` üzerinden geçiyor.  
**Güven:** yüksek

## Bulgu 5 — Yol politikası `file`/`outputPath` argümanlarını ve `.env` dosyalarını görmüyor

**Dosya:** `src/utils/tool-path-policy.js:6`, `src/utils/tool-path-policy.js:39`, `src/tools/computer_use.js:116`, `src/tools/macos_screenshot.js:16`  
**Nasıl tetiklenir:**

- `computer_use({action:"screenshot", file:"~/.ssh/authorized_keys"})` çağrısında politika `file` argümanını okumaz; ekran görüntüsü aracı bu yolu çıktı dosyası olarak kullanır.
- macOS’ta `macos_screenshot({outputPath:"~/.ssh/authorized_keys"})` aynı şekilde `outputPath` üzerinden politikayı atlar.
- Projedeki `.env` dosyasını `read_file({path:".../.env"})` ile oku. `SENSITIVE_READ` içinde `.env` deseni bulunmadığından izin verilir.

**Neden önemli:** İlk iki çağrı kullanıcıya ait hassas dosyaları ekran görüntüsü verisiyle ezebilir. `.env` ise en yaygın sır dosyalarından biri olmasına rağmen hassas yol kabul edilmiyor.  
**Güven:** yüksek

## Bulgu 6 — Ağ onayı gönderilen gövdenin içeriğini göstermiyor

**Dosya:** `packages/execution-gateway/src/index.ts:694`, `packages/execution-gateway/src/index.ts:706`, `src/tools/http_request.js:21`  
**Nasıl tetiklenir:** Şu iki POST isteğini karşılaştır:

```json
{"url":"https://example.test/upload","method":"POST","body":"AAAAAAAAAAAAAAAA"}
```

```json
{"url":"https://example.test/upload","method":"POST","body":"prod-db-password"}
```

Aynı uzunluktalarsa onay ekranında ikisi için de yalnızca aynı hedef, yöntem ve “gövde 16 bayt” görünür. Gövdenin alanları, özetlenmiş/maskelenmiş önizlemesi veya veri sınıfı gösterilmez.

**Neden önemli:** Kullanıcı verinin gönderildiğini anlar ama hangi verinin gönderildiğini ayırt edemez. Boyut tek başına bilinçli sızıntı kararına yetmez.  
**Güven:** yüksek

## Bulgu 7 — İlgisiz başarılı komut “doğrulama” sayılıp yanlış hafıza yazdırıyor

**Dosya:** `src/tools/agentic-runner.js:547`, `src/tools/agentic-runner.js:568`, `src/tools/agentic-runner.js:571`  
**Nasıl tetiklenir:**

1. Görev: “`hesapla()` fonksiyonunu 42 döndürecek şekilde düzelt.”
2. Ajan dosyayı değiştirip yanlışlıkla `41` döndürsün; yazma aracı başarılı olsun.
3. Ajan doğrulama yerine güvenli `bash` komutu olarak `echo tamam` çalıştırsın. Çıkış kodu sıfır olduğundan kayıt `done` olur.
4. Statik kalite kapısı bu anlamsal hatayı bloklamasın.

`dogrulama`, değiştirilen dosyayla veya görevle ilişkisini kontrol etmeden ilk başarılı `bash|shell_command|code_execution` kaydını kabul eder. Ardından hafızaya “dosya değişti ve doğrulandı” yazılır.

**Neden önemli:** Üç biçimsel koşul da sağlandığı hâlde doğrulama gerçekte yapılmamıştır. Yanlış başarı iddiası sonraki oturumlara kalıcı proje gerçeği olarak taşınır.  
**Güven:** yüksek

## Doğrulanan iddialar

- `code_execution`: Modelin `onayli` geçirebildiği canlı yol bulamadım. Genel araç çalıştırıcı bayrağı siliyor; `agentic-runner` da `executeThroughGateway` kullanıyor. **İddia doğrulandı.**
- Ortam temizliği: `PGPASSWORD` kaçıyor. **İddia doğrulanmadı.**
- 40-hex muafiyeti: Gerçek 160 bitlik hex sır taşıyabilir. **İddia doğrulanmadı.**
- `grep_search`: Modelin kullandığı `execute()` yolu süzülüyor; `_grepWithNode` yalnızca testlerde doğrudan çağrılıyor. Ancak `read_file` ve `document_extract` aynı içerik süzmesini uygulamıyor. **Kısmen doğrulandı.**
- Yol politikası: Varsayılan olarak çağrılıyor, fakat `file`, `outputPath` ve `.env` kapsam dışında. **İddia doğrulanmadı.**
- Sınır lint’i: Normal importlarda cırcır çalışıyor; dize içindeki yorum belirteçleriyle görünmez kılınabiliyor. **Sıkılık iddiası doğrulanmadı.**
- Ağ onayı: Etkileşimli ajan aynı TTY’yi kullandığından araçlar kullanılabilir. TTY’siz/headless ajanlarda ağ araçları gerçekten reddedilir. Onay metni gövde içeriğini göstermiyor.
- Hafıza: Üç biçimsel koşul kodda uygulanıyor; “doğrulama”nın ilgili ve anlamlı olması uygulanmıyor. **Doğruluk iddiası doğrulanmadı.**
- RECALL çerçevesinin modele karşı deterministik biçimde aşılabildiğini yalnızca kod okuyarak kanıtlayamadım: **EMİN DEĞİLİM; bulgu saymadım.**

Depoda değişiklik yapılmadı.
tokens used
149.132

---

# Doğrulama turu — Codex düzeltmeleri de denetledi (29.07.2026)

Düzeltmeler yazıldıktan sonra Codex ikinci kez çalıştırıldı: *"her bulgunun
gerçekten kapandığını doğrula, kapanmadıysa söyle."*

**Yedisinin yedisinde de artık boşluk buldu.** Hepsi ölçülerek doğrulandı ve
kapatıldı:

| # | Artık boşluk | Düzeltme |
|---|---|---|
| 1 | `*gen() {…}` generator metodu satır başı `*` sanılıp siliniyordu | `*` yalnızca ardından boşluk/`/`/satır sonu gelirse yorum sayılıyor |
| 2 | `DOCKER_AUTH_CONFIG`, `SSH_AUTH_SOCK` geçiyordu | `AUTH_CONFIG`/`AUTH_SOCK` eklendi (`AUTHOR` geçmeye devam ediyor) |
| 3 | `{"webhook_secret": "<40hex>"}` bağlam kontrolünü atlatıyordu | Ad ile `:` arasındaki tırnak desene eklendi |
| 4 | `sirUyarisi` modele hiç ulaşmıyordu | `buildFeedback` uyarıyı çıktının başına koyuyor |
| 5 | `imagePath`/`audioPath` ve `.env.production.local` kapsam dışıydı | Adlar eklendi; `.env` deseni çok parçalı soneki kabul ediyor |
| 6 | **Köprü `govdeOnizleme` alanını sessizce düşürüyordu** | İstek alan alan sayılmıyor, olduğu gibi geçiyor |
| 7 | `npm --version` doğrulama sayılıyordu | Argüman deseni: `--version`, `--help`, `--dry-run`, `--list` |

## 6. madde bu turun asıl dersi

`govdeOnizleme` araca eklenmişti, TS tarafı okuyordu, testi de vardı — ve onay
ekranına **hiç ulaşmıyordu**. CJS köprüsü alanları elle sayıyordu ve listede
olmayan alan sessizce düşüyordu.

Testim TS fonksiyonunu **doğrudan** çağırdığı için köprüyü hiç görmedi.
Yeşildi ve yanıltıyordu. Yanlış katmanı ölçen bir test, hiç test olmamasından
kötüdür: yokluk belirsizlik yaratır, yanlış test kesinlik yaratır.

Düzeltme tek alan eklemek değil, sınıfı kapatmak oldu: köprü artık isteği
olduğu gibi geçiriyor. Elle tutulan alan listesi, her yeni alanda aynı hatayı
davet eder.

Yeni test bilerek **köprü üzerinden** gidiyor.

## Kalan dürüst sınır

`dogrulamaBul` hâlâ anlamsal doğruluk kanıtı DEĞİL. Komutun göreve ilgili
olduğunu kanıtlayamıyoruz; yalnızca "hiçbir şey çalıştırmadan doğrulandı
demek" kapatıldı. Kaydedilen metin artık hangi komutun koştuğunu yazıyor ki
sonraki oturum kendi kararını verebilsin. Kara liste de tanımı gereği eksik.

Testler: `test/security/codex-tur3.test.js` (22 test).

---

# Kapanış turu — Codex üçüncü kez baktı (30.07.2026)

İkinci turun düzeltmeleri de denetlendi. **İkisi kapandı (4, 6), altısında
artık boşluk vardı.** Hepsi ölçüldü, hepsi kapatıldı.

| # | Artık boşluk | Düzeltme |
|---|---|---|
| 1 | `* gen(){…}` (yıldızdan sonra BOŞLUK) hâlâ siliniyordu | Sezgisel bırakıldı; dize/yorum ayıran tek geçişli tarayıcı yazıldı |
| 2 | `KUBECONFIG` geçiyordu | `KUBECONFIG`, `DOCKER_CONFIG`, `GOOGLE_APPLICATION_CREDENTIALS`, `VAULT_`, `AZURE_`, `GITLAB_`, `CLOUDSDK_` |
| 3 | YAML blok skaleri ad bağlamını kaybediyordu | Değer satırı girintili ve tek başınaysa önceki üç satırda sır adı aranıyor |
| 5 | **Yalnızca İLK dolu yol alanı denetleniyordu** | Tüm alanlar denetleniyor; herhangi biri hassassa ret |
| 7 | `npm version` (tiresiz) doğrulama sayılıyordu | Alt komut deseni: `version`, `help`, `info`, `list`, `ls` |
| 8 | **B4 ve B6 testleri düzeltme geri alınsa kırılmıyordu** | İkisi de gerçek yola bağlandı ve geri alma denemesiyle kanıtlandı |

## 5. madde en ağırı

`assessToolPath` yol alanlarını `||` zinciriyle okuyordu, yani **ilk dolu
alanda duruyordu**. `speech_to_text({ path: "README.md", audioPath:
"~/.ssh/id_rsa" })` masum `path` üzerinden geçiyor, araç sonra hassas
`audioPath`ı okuyup gönderiyordu.

Alan adlarını eklemek yetmiyordu — mantık yanlıştı. Bir alanı denetleyip
diğerini serbest bırakmak, denetimi saldırganın alan seçimine bırakmaktır.

## 8. madde en utandırıcısı

B6 testinin yorumunda "bilerek köprü üzerinden gidiyor" yazıyordu. Gitmiyordu:
`dist/index.js`'i doğrudan çağırıyordu ve köprü düzeltmesi geri alınsa yeşil
kalıyordu. Yani bir tur önce "yanlış katmanı ölçen test" diye yazdığım hatayı,
o hatayı düzelten testte tekrarladım.

Yorum, koda bakmadan doğrulanamaz. Bu turdan sonra her iki test **geri alma
denemesiyle** sınandı: düzeltmeler geri alındığında ikisi de kırılıyor,
geri yüklendiğinde ikisi de geçiyor. Bir testin değerini ölçmenin tek yolu bu.

## 1. maddede sezgisel terk edildi

Satır başındaki `*` üzerine kurulu iki istisna üst üste kırıldı (`*gen`, sonra
`* gen`). Üçüncüsünü yazmak dördüncüsünü davet ederdi. Yerine dizeleri, satır
yorumlarını ve blok yorumlarını ayırt eden küçük bir durum makinesi kondu.
Dört kaçış biçimi de sınandı; gerçek bir blok yorum yanlış alarm vermiyor.

Testler: `test/security/codex-tur3.test.js` (24 test).

---

# Dördüncü tur — testlerin kendisi denetlendi (30.07.2026)

Codex ikisini kapalı saydı (4, 9), altısında artık boşluk buldu. Hepsi
ölçüldü, hepsi kapatıldı. Ama bu turun değeri ayrı bir yerde.

| # | Artık boşluk | Düzeltme |
|---|---|---|
| 1 | Regex literali (`/[/*]/`) durum makinesini atlatıyor | Hata yönü çevrildi: ham metin de kontrol ediliyor |
| 2 | `GIT_ASKPASS`, `SSH_ASKPASS`, `GIT_SSH_COMMAND` geçiyordu | Eklendi |
| 3 | YAML `|-`, `>2-` gibi göstergeler ad bağlamını kaybediyordu | Gösterge deseni genişletildi |
| 5 | **Yazma/okuma ayrımı araç ADIYLA yapılıyordu** | Argüman adı belirliyor: `outputPath` yazma |
| 7 | `java -version` (tek tire) yakalanmıyordu | `--?version` |
| 8 | **Beş test, düzeltme geri alınsa yeşil kalıyordu** | Mutasyon denemesiyle sınandı ve düzeltildi |

## 8. madde: testlerin değeri iddiayla ölçülmez

Codex beş testi tek tek gösterdi: B1 yalnızca `*gen` ölçüyordu, `* gen`
değil; B2 yeni önekleri değil eskilerini; B3 YAML yerine JSON'u; B5 alanları
tek tek verip asıl atlatmayı hiç tetiklemiyordu; B7 bir tur önce zaten
yakalanan `npm --version`ı.

Yani testler yeşildi, düzeltmeler doğruydu, **ve testler düzeltmeleri
sabitlemiyordu.** Bir sonraki değişiklik onları sessizce geri alabilirdi.

Bunu bir daha iddiaya bırakmamak için `scripts/mutasyon-denemesi.py` yazıldı
(`npm run mutasyon`): her düzeltmeyi tek tek geri alıyor, testin kırıldığını
doğruluyor, sonra dosyayı geri yüklüyor.

İlk koşumda **üç mutasyon hayatta kaldı** — Codex'in söylediğinin ötesinde iki
tanesi daha. Testler güçlendirildi; şimdi altısının altısı ölüyor.

## 5. maddede yine mantık yanlıştı, kapsam değil

Alan adı eklemek yetmiyordu: `hassasMi` yazma/okuma listesini araç ADINA göre
seçiyordu, o yüzden `macos_screenshot({ outputPath: "/etc/hosts" })` okuma
kurallarıyla değerlendirilip izin alıyor, sonra araç o yola yazıyordu. Bir
yolun yazma yolu olduğunu aracın adı değil, argümanın adı söyler.

## 1. maddede sözdizimi kovalamak bırakıldı

Durum makinesi de yetmedi: regex literalindeki `/*` blok yorum başlatıyor gibi
görünüyor. `/` işaretinin bölme mi literal başlangıcı mı olduğunu bilmek
JavaScript ayrıştırıcısının en can sıkıcı belirsizliği ve bunu kovalamak
bitmeyecekti.

Yerine hata yönü çevrildi: ham metin de kontrol ediliyor ve tarayıcı ile ham
metin ayrışırsa sonuç "temiz" değil **"inceleme gerekli"** oluyor — yine
kırıyor. Artık tarayıcının her kör noktası sessiz geçiş değil gürültülü uyarı.

Testler: `test/security/codex-tur3.test.js` (29 test) + `npm run mutasyon`.

---

# Beşinci tur — yakınsama ve asıl risk (30.07.2026)

Bu turda Codex'e iki şey soruldu: kapanış doğrulaması, ve **stratejik
değerlendirme** — kalan boşluklar gerçek tehdit mi yoksa azalan getiri mi, ve
kod tabanındaki en büyük gerçek risk ne.

Cevap, dört turdur yaptığım işi yerinden oynattı.

## Asıl risk: kovaladığım şeyler değildi

> *"En büyük risk bu beş küçük boşluk değil: ajanın workspace dışında sır
> listesine girmeyen dosyalara onaysız yazabilmesi."*

Somut tetikleme, Windows Startup dizinine `.cmd` bırakmak. Doğrulandı —
`write_file` workspace dışına onaysız yazıyordu ve dosya gerçekten oluştu.

Dört tur boyunca hassas yol KARA LİSTESİNE desen ekledim: `.ssh`, `.aws`,
`.env`, `imagePath`, `outputPath`… Her biri gerçek bir boşluktu ve her biri
kapandı. Ama kara liste "neyi yasaklayacağını bilmek" ister ve Startup dizini,
`.bashrc`, uygulama ayar dosyaları o listede yoktu — olamazdı da. Sınır ise
"neyin İÇERİDE olduğunu bilmek" ister ve bu bilinebilir.

Eksik olan desen değil, sınırdı. Kapının `yoluDogrula`sı en başından beri
doğru şeyi yapıyordu (symlink `realpath` ile çözülüyor, var olmayan hedefin en
yakın atası bulunuyor) — yazma araçları onu hiç çağırmıyordu.

Şimdi dördü de çağırıyor: `write_file`, `edit_file`, `structural_patch`,
`notebook_edit`. Workspace dışı yazma hedefi gösteren bir onay istiyor;
etkileşimsiz ortamda reddediyor. `onayli` iç bayrak olarak model
argümanlarından siliniyor.

**13 devralınan test kırıldı ve kırılmaları doğruydu:** hepsi geçici dizine
yazıyor, yani workspace dışına. Kararı veren taraf test olduğu için `onayli`
geçiyorlar — `bash` ve `code_execution` için kurulmuş aynı desen.

## Sabit yol ve kodlama

Codex mutasyon betiğinde iki taşınabilirlik hatası buldu: sabit `C:\Projects`
yolu ve Windows'ta `cp1254` çözme hatası. İkisi de düzeltildi; betik artık
kendi konumundan depo kökünü türetiyor ve başka dizinden çalıştırılabiliyor.

## Kabul edilen ve belgelenen sınırlar

Codex'in "kabul edilip belgelenmeli" dediği iki şey:

1. **Dize birleştirme / `createRequire` ile gizlenen `child_process`.** Sınır
   lint'i kastî kaçışı değil KAYMAYI yakalar. Bu, betiğin başındaki yorumda
   zaten yazılı.
2. **Yol alanlarının ADLA sınıflandırılması.** Yeni bir araç `downloadPath` ya
   da `to` gibi bir alan getirirse listeye eklenmesi gerekir. Doğru çözüm araç
   şemasının giriş/çıkış yol semantiğini bildirmesi; bu, ayrı bir iş.

Testler: `test/security/yazma-siniri.test.js` (8 test), `npm run mutasyon`
(9/9 mutasyon ölüyor), CI'da koşuyor.

## Ürün hedefi: tamamlanma kapısı (30.07.2026)

Codex'e "ürün hedefine göre en kritik eksik ne" diye sorulduğunda güvenlik
dışı bir cevap verdi ve doğrulandı:

> *"En kritik eksik, varsayılan kodlama akışında zorunlu, kanıta dayalı
> tamamlanma kapısı olmaması."*

`code_v5` — varsayılan `nskuld code` yolu — model araç çağırmayı bıraktığı
anda `unresolved = false` yapıp BAŞARIYLA bitiyordu. Yani model dosyayı
değiştirip "yaptım" diyebiliyordu; test, lint ya da build çalıştırmak zorunlu
değildi.

`agentic-runner`'daki doğrulama sezgiseli bunu korumuyordu: yalnızca hafızaya
yazmayı kapatıyordu. **Kanıt kuralı vardı ama kullanıcının fiilen kullandığı
yolda yoktu — yani yoktu.**

### Ne yapıldı

`src/utils/tamamlanma-kapisi.js` — ayrı modül, çünkü kapı TEK olmalı ve her
yürütme yüzeyi aynı kapıdan geçmeli. `code_v5` içine gömmek onu bir yüzeye
bağlardı.

1. Dosya değişmediyse kapı yok — salt okuma görevleri bedel ödemez.
2. Değiştiyse projeye uygun komut seçilir: **test > typecheck > build > lint**.
   Sıra kasıtlı ve hangisinin kullanıldığı bildiriliyor — test davranışı
   kanıtlar, lint yalnızca biçimi. Zayıf kanıtı güçlü gibi sunmamak gerekiyor.
3. Model bu turda zaten gerçek bir doğrulama koştuysa yeniden koşulmaz.
   `echo tamam` gerçek doğrulama sayılmaz (aynı kara liste).
4. Başarısızsa çıktı modele geri verilir ve **en fazla 2 onarım turu** tanınır.
   Sınırsız olsa döngü hiç bitmeyebilir.
5. Doğrulama komutu hiç tespit edilemezse **sessizce başarılı SAYILMAZ**;
   "DOĞRULANMADI" diye bildirilir. Sessizce tamam demek, kapının hiç
   olmamasıyla aynı şey.

Yol boyunca bulunan ek kusur: `trackFileChanges` yalnızca `write_file` ve
`edit_file`'ı sayıyordu. `structural_patch` ve `notebook_edit` ile çalışan bir
tur "hiçbir şey değişmedi" görünüyor ve kapı hiç devreye girmiyordu.

### Ne YAPMADIĞI

Komutun göreve **ilgili** olduğunu kanıtlamıyor. `npm test` geçtiyse depo
yeşildir; istenen davranışın gerçekten eklendiğini göstermez. Bunu iddia
etmemek önemli — ölçtüğünden fazlasını söyleyen bir kapı yanlış güven verir.

Etkileşimli yol henüz bağlı değil; headless (`-p`) yol bağlı. Etkileşimli
kullanıcı zaten her turu görüyor, headless olan ise görmüyor — riskin büyük
olduğu yer orası.

Testler: `test/security/tamamlanma-kapisi.test.js` (13 test),
`npm run yetenekler` (9/9), `npm run mutasyon` (11/11).
