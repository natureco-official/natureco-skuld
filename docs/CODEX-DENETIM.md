# Codex denetim brifingi — NatureCo Skuld

**Tarih:** 29 Temmuz 2026
**Denetlenen:** S1'in ilk üç adımı (execution-gateway'e bağlama)

## Ürünün amacı

Claude Code ve Codex'ten **daha yetenekli ve daha az kusurlu** bir terminal
kodlama ajanı. Bu, denetimin ölçütünü de belirliyor: "çalışıyor mu" yetmez,
"bu iki araçtan daha iyi mi" sorulmalı.

## Nereden geldi

`natureco-cli` v5.71.2 (`40b4913`) fork edildi, yeniden markalandı. Fork
noktasında 1127 test geçiyordu ve hâlâ geçiyor. Üstüne dört paket eklendi:
`shared`, `execution-gateway`, `memory` (Urðr), `quality-gate` (CodeDNA).

## Denetlenecek iddia

> Süreç başlatmanın **tek yeri** `execution-gateway` olacak.

Bugün bu **doğru değil** ve bunu saklamıyoruz: `src/` altında hâlâ 58 dosya
`child_process` import ediyor. S1'in işi bunları tek tek geçirmek.

> **Güncelleme (29.07.2026):** Kalanlar tek tek okundu ve iddia daraltıldı.
> Ayrıntı aşağıda, "S1 kapanışı" bölümünde.

Şimdiye kadar geçirilenler:

| Dosya | Kazandığı | Korunanı |
|---|---|---|
| `src/tools/bash.js` | workspace sınırı, sır maskeleme, çıktı sınırı, zaman aşımı | mevcut approvals katmanı (allowlist/deny/tehlikeli komut) |
| `src/tools/shell_command.js` | aynısı + varsayılan cwd `os.homedir()` → `process.cwd()` | aynı approvals katmanı |
| `src/tools/git.js` | aynısı | `execFile`+`shell:false`, alt komut beyaz listesi, remote yazma yasağı |

## Denetim soruları

Aşağıdakileri **kodu okuyarak** doğrula. Emin olamadığın yerde "emin değilim"
yaz; tahmin etme.

1. **Kabuk yolu gerçekten her zaman onay istiyor mu?**
   `packages/execution-gateway/src/index.ts` → `kabukCalistir`. İddia:
   `onaysizKomutlar` bu yolda geçersiz. Bir kaçış yolu var mı?

2. **`kararVerildi: true` bir arka kapı mı?**
   `src/utils/gateway.js`. Bu bayrak kapının onayını atlıyor; gerekçe, kararın
   fork'un approvals katmanında zaten verilmiş olması. Bu üç dosyada karar
   gerçekten önce alınıyor mu, yoksa atlanabildiği bir yol var mı?

3. **`yoluDogrula` symlink kaçışını gerçekten kapatıyor mu?**
   `realpath` sonrası karşılaştırma yapılıyor. Kaçırdığı bir durum var mı
   (junction, UNC yolu, büyük/küçük harf duyarsız dosya sistemi)?

4. **Sır maskeleme yeterli mi?**
   `packages/shared/src/index.ts` → `SIR_DESENLERI`. Hangi yaygın kimlik
   bilgisi biçimi kaçıyor?

5. **`git.js` beyaz listesi aşılabilir mi?**
   `tokenizeArgs` ile bölünen argümanlar `git` alt komutuna gidiyor. Beyaz
   listedeki bir alt komutla yazma yapılabilir mi? (ör. `git tag` ile,
   `git show` ile dosya yazma, `git add` ile workspace dışı)

6. **Async dönüşümü bir yerde bozuldu mu?**
   `bash.js`, `shell_command.js`, `git.js` senkron→async oldu. `await`
   unutulmuş bir çağıran var mı?

## Bilinen ve kabul edilen eksikler

Bunları bulgu olarak yazmana gerek yok, biliyoruz:

- 58 dosya hâlâ kapıdan geçmiyor (S1'in geri kalanı).
- Ağ izin sınıfı (`ag`) tanımlı ama **uygulanmamış**; `web-fetch`, `browser`,
  `http_request` kapısız.
- Sınır lint'i yalnızca `packages/` altını tarıyor.
- Verðandi kapsülü pasif (tasarruf yarı kanıtlandı).
- Kalite kapısı ve Urðr hafızası yazılı ama ajan döngüsüne bağlı değil.

## Denetim kuralı

Bulgularını **doğrulayacağız**. Önceki denetimde şema dosyalarından okuyup
canlı durumu yanlış varsaydığın için bir kısım bulgu yanlış alarm çıkmıştı.
Bu yüzden her bulgu için **dosya:satır** ve **nasıl tetiklendiği** iste.
Tetiklenemeyen bir bulgu, bulgu değildir.

---

# Tur 2 — ağ izin sınıfı + deneysel arayüz (29.07.2026)

Tur 1'de üç bulgu verdin, üçü de doğrulandı ve kapatıldı. Regresyon testleri
`tests/security/execution-gateway.test.ts` içinde.

## Bu turda eklenenler

| Ne | Nerede |
|---|---|
| `ag` izin sınıfı | `packages/execution-gateway/src/index.ts` → `agOnayi`, `agIstegi` |
| CJS köprüsü | `src/utils/gateway.js` → `agOnayi` |
| Bağlanan araçlar | `src/tools/http_request.js`, `web_readability.js`, `firecrawl.js` |
| Deneysel yüzey | `src/utils/skuld-theme.js` → `kabartma`, `akanSatir`, `grafik`, `secimListesi` |

## Sorular

1. **Ağ kapısı atlanabilir mi?** `agOnayli: true` parametresi araçlarda
   dışarıdan geliyor. Model bunu kendi araç çağrısında verebilir mi? Yani
   ajan `{"url":"...","agOnayli":true}` yazarak onayı atlayabilir mi?
   Bu sorunun cevabı **kritik** — atlanabiliyorsa kapı yok demektir.

2. **Onay metni yeterli mi?** `agOnayi` hedefi, yöntemi, şifresiz/yerel
   durumunu gösteriyor. Bir kullanıcının bilinçli karar vermesi için eksik
   olan ne?

3. **Yönlendirme.** `agIstegi` `redirect: "manual"` kullanıyor ama araçlar
   kendi `fetch`'lerini yapıyor ve onlar yönlendirme izliyor olabilir.
   Onaylanan adresten başka bir adrese gidilebilir mi?

4. **`ozelAdres()` yeterli mi?** IPv6, ondalık/onaltılık IP gösterimi
   (`http://2130706433/`), DNS rebinding gibi durumlar kaçıyor mu?

5. **Deneysel yüzey:** `kabartma`, `akanSatir`, `grafik`, `secimListesi` —
   renk kapalıyken ya da unicode yokken bilgi kaybı var mı?

## Kural aynı

Tetikleyemediğin şeyi bulgu sayma. Her bulgu için dosya:satır ve nasıl
tetiklendiği.

---

# Tur 3 — kapıların kapandığını doğrula (29.07.2026)

Tur 2'de beş bulgu verdin. **Beşi de doğrulandı ve kapatıldı.** Hiçbiri yanlış
alarm değildi; tur 1'e göre belirgin bir iyileşme.

| # | Bulgu | Kapanış |
|---|---|---|
| 1a | `code_execution` ağ kapısını atlıyor | `b0228ae` — kod çalıştırma ayrı yetenek, onay her zaman |
| 1b | Meşru onayın araca ulaşacağı yol yok | `a2d1f3e` — köprü kullanıcıya soruyor |
| 2 | Onay metni ne gönderildiğini göstermiyor | `a2d1f3e` — gövde boyutu + başlık adları |
| 3 | Yönlendirme kapıyı atlıyor | `bef3679` — üç araçta `redirect: manual` |
| 4 | `ozelAdres()` IPv6'yı görmüyor | `bef3679` — `::1`, `fc00::/7`, `fe80::/10`, `::ffff:` |
| 5 | `grafik` unicode kapalıyken seriyi kaybediyor | `bef3679` |

1a için sandbox aranmadı. `vm` de ayrı süreç + izin devri de yeni saldırı
yüzeyi getiriyor ve hiçbiri Node'u gerçekten kapatmıyor. Bunun yerine
sınıflandırma değişti: **rasgele kod çalıştırmak bir araç değil, kabuk gibi
ayrı bir yetenektir.**

## Bu turda ayrıca kapanan (bizim bulduğumuz)

Kalan `child_process` çağrılarını geçirirken çıktı, ölçülerek doğrulandı:
`read_file` `~/.ssh/id_rsa`'yı engelliyordu ama `grep_search` aynı dizini
hedefleyip özel anahtarın satırlarını döndürüyordu. Yol politikası okuma
tarafında beyaz liste gibi çalışıyordu. Ayrıntı: `c8eda0e`.

## S1 kapanışı — "58 dosya geçirilecek" iddiası daraltıldı

Kalan 22 araç dosyası tek tek okundu. Beklenen bulgu çıkmadı ve bunu
uydurmuyoruz:

- **macOS araçları** (`mac_notify`, `notes_add`, `calendar_add`,
  `reminder_add`, `mac_alarm`, `google_meet`) betiği `osascript -` ile
  stdin'den, kullanıcı verisini `argv` üzerinden geçiriyor. AppleScript
  enjeksiyonu yok; zaten doğru desen.
- **`cron_create`** kalıcılık kuruyor ama v5.43'te sertleştirilmiş:
  `isDangerousCommand` + `checkCommand` onayı.
- **`delegate_task` / `async_delegation`** alt sürece `{ ...process.env }`
  geçiriyor. `code_execution`'da bu bir kusurdu, burada değil: çocuk süreç
  **bizim kendi CLI'mız**, modelin yazdığı kod değil, ve model çağırabilmek
  için anahtarlara ihtiyacı var. Aynı kodun iki bağlamda farklı anlama
  gelmesi, kuralı körlemesine uygulamamanın nedeni.
- **`grep_search`** gerçek bir açık çıkardı — ama sorun `child_process`
  değil, yol politikasıydı. `c8eda0e`.

Yani 59 dosyayı mekanik olarak kapıya almak, 1150 testi riske atan büyük bir
değişiklik karşılığında ölçülebilir bir güvenlik kazancı vermiyor. Bunun
yerine sınır lint'i **cırcır mandalına** çevrildi: envanter dondu, liste
yalnızca kısalabilir. Yeni bir dosya `child_process` eklerse kırılır;
envanterdeki bir dosya kapıya alınıp listeden çıkarılmazsa da kırılır —
ikincisi olmadan muafiyet listesi çürür ve muafiyet kalıcılaşır.

Her iki yön de tetiklenerek doğrulandı, iddiaya bırakılmadı.

## Denetlenecek

0. **Cırcır mandalı gerçekten sıkı mı?** `scripts/gateway-boundary-check.mjs`.
   Yorum ayıklama basit: `/* */` ve satır başındaki `//`. `child_process`
   import'unu lint'e görünmez kılan bir yazım var mı? (Dize birleştirme,
   `createRequire`, `process.binding`, `module.constructor._load`…)

1. **Kod çalıştırma yeteneği gerçekten kapalı mı?**
   `src/tools/code_execution.js`. Model `onayli` bayrağını geçirebilir mi?
   `tool-execution-gateway` onu siliyor — silinmediği bir çağrı yolu var mı?
   Ajan döngüsü aracı `executeThroughGateway` dışından çağırıyor olabilir mi?

2. **Ortam temizliği yeterli mi?**
   `src/utils/gateway.js` → `ortamiTemizle`. Desen `_KEY|_TOKEN|_SECRET|...`.
   Hangi yaygın sır değişkeni bu ağdan kaçar? (İpucu: önek/sonek taşımayan
   adlar.) Kaçanı **adıyla** yaz.

3. **`maskText` daraltması doğru mu?**
   `src/utils/secret-scanner.js` → `masumMu`. 40 haneli saf onaltılık
   eşleşmeler maskelenmiyor, gerekçe git SHA'ları. Bu muafiyetle gerçek bir
   sır geçirilebilir mi?

4. **`sonuclariSuz` atlatılabilir mi?**
   `src/tools/grep_search.js`. Süzme `execute()` içinde. `_grepWithNode`
   dışa açık — süzmeden dönen bir yol var mı? Başka hangi araç dosya içeriği
   döndürüyor ve aynı süzmeden geçmiyor? (`read_many_files`, `document_extract`,
   `codebase_search` gibi adlara bak.)

5. **Ağ onayı etkileşimsiz ortamda.**
   `agOnayiSor` TTY yoksa `ret` dönüyor. Bu, ajan modunda ağ araçlarını
   tamamen kullanılamaz mı yapıyor? Kullanılabilir kalıyorsa nasıl?

6. **Hafıza döngüsü.** `src/tools/agentic-runner.js`. REMEMBER yalnızca
   dosya değiştiyse VE doğrulama başarılıysa VE kapı bloklamadıysa yazıyor.
   Üçü de doğruyken YANLIŞ bir şeyin yazıldığı bir durum kurabilir misin?
   RECALL hatıraları "NOTTUR, talimat değil" diye çerçeveliyor — bu çerçeve
   aşılabilir mi?

## Kural

Değişmedi. Tetikleyemediğin şey bulgu değildir; dosya:satır ve tetikleme
yolu iste. Emin değilsen "emin değilim" yaz.
