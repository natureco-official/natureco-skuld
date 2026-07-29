# Komut kırpma planı

Fork 102 komutla geldi. Skuld coding-first bir ürün; bu yüzeyin çoğu kapsam
dışı. Sınır **silerek** çiziliyor — neyin çıkarıldığı `git log`'da görünür.

## Yöntem: parti parti, her partiden sonra test

Tek seferde 60 komut silmek 1127 testin hangisini neden kırdığını
bulunamaz hâle getirir. Her parti ayrı commit, her commit sonrası tam test.

Komut **kaydı** (`bin/nskuld.js` içindeki `.command(...)` bloğu) kaldırılıyor;
`src/commands/*.js` gövdesi ilk aşamada **duruyor**. Sebep: master prompt bu
yüzeyleri "kapsam dışı" değil "P0 sonrasına bırakılabilir, plugin sınırıyla
geri gelebilir" diye tanımlıyor. Gövdeyi hemen silmek, geri getirmeyi
yeniden yazmaya çevirir. Gövdeler plugin'e taşındıkça silinecek.

## Kalanlar — coding-first çekirdek

| Alan | Komutlar |
|---|---|
| Kodlama | `code` `ask` `chat` `run` `repl` `exec-policy` |
| Ajan | `agent` `agents` `tasks` `approvals` |
| Güvenlik | `policy` `sandbox` `secrets` `security` `audit` |
| Kurulum/teşhis | `setup` `init` `config` `configure` `doctor` `health` `status` `system` `migrate` `path` `oc-path` |
| Hafıza/oturum | `memory` `sessions` `transcripts` `thread-ownership` |
| Model | `models` `infer` `cost` |
| Genişletme | `mcp` `plugins` `skills` `tools` `capability` |
| Kimlik | `login` `logout` `account` `device-pair` `devices` `pairing` |
| Kalite | `dna` (CodeDNA kapısı) `git` `logs` |
| Yaşam döngüsü | `update` `uninstall` `backup` `reset` |
| Yardım | `help` `commands` `completion` `docs` `lang` |
| Terminal | `terminal` (Cupertino köprüsü) |
| Ağ ve içerik | `web-fetch` `browser` |
| Otomasyon | `cron` `hooks` `webhooks` `daemon` |
| Görünürlük | `dashboard` `workboard` |

## Çıkarılanlar

### Parti 1 — mesajlaşma ağ geçitleri ✅ (bu commit)

`discord` `slack` `telegram` `whatsapp` `signal` `imessage` `sms` `irc`
`mattermost` `message` `voice`

Kodlama ajanının bir mesajlaşma köprüsüne ihtiyacı yok. Master prompt bunları
açıkça "ayrı paket, bağımsız permission manifest, kullanılmadığında
yüklenmeme" koşuluyla plugin'e bırakıyor. Ayrıca her biri dış etkili eylem
(mesaj gönderme) yapıyor ve coding oturumunun izin sınırında bulunmaları
gereksiz risk.

### Parti 2 — yayıncılık ve SEO ✅ (29.07.2026)

`medium` `naturehub` `seo` `wiki` `open-prose`

Kayıt sayısı 92 → 86. Gövdeler `src/commands/` altında duruyor (plugin'e
taşınana kadar).

**Bu parti bir şey öğretti:** komut kaydı silindi ama elle yazılmış yardım
bloğu `wiki` ve `open-prose`'u tanıtmaya devam etti. Aynı bilgi iki yerde
duruyordu ve biri güncellendi. Sorulacak soru "ayrışır mı" değil,
"ayrıştığında öğrenir miyiz" — cevabı hayırdı.

`scripts/yardim-tutarlilik.mjs` bunun için yazıldı ve **ilk çalıştırmasında
benim eklemediğim bir hata buldu**: `tui` yardımda tanıtılıyordu,
`nskuld tui` ise `unknown command` diyordu. Fork'tan devralınmış.

Kontrol tek yönde kırıyor. Kayıtlı olup kürasyonlu özette olmayan 17 komut
var ama bunlar hata değil: özel blok `addHelpText("after", …)` ile ekleniyor,
commander'ın kendi listesi zaten hepsini gösteriyor. Bunu ölçmeden yazsaydım
17 yanlış alarm üretirdim.

### Parti 3 — bot kişilikleri ve genel sohbet yüzeyleri ✅ (29.07.2026)

`bots` `clawbot` `crestodian` `vydra` `clickclack` `xp` `commitments`

Kayıt 86 → 79. Kullanılmayan `require` satırları da silindi: modül hâlâ
yükleniyorsa sınır çizilmemiş, yalnızca gizlenmiş olur.

**Betik bir kez fazlasını sildi.** Blokları `});` ile biten desene göre
kesiyordum; `.command('bots')` bloğu `.action(bots);` ile bittiği için desen
bir sonraki kaydı — `chat`'i — yuttu. `chat` korunacaklardandı.
`yardim-tutarlilik.mjs` bunu aynı dakikada yakaladı. Blok sınırı artık
`^program
  .command(` ile bulunuyor, bitişe bakılmıyor.

### Parti 4 — ağ/küme yönetimi ✅ (29.07.2026)

`bonjour` `dns` `node` `nodes` `proxy` `gateway` `admin-rpc` `qr`

Kayıt 79 → 72.

**`acp` bu listeden ÇIKARILDI ve geri alındı.** Adı bir ağ protokolü gibi
duruyor, o yüzden "ağ/küme" partisine yazılmıştı. Gerçekte
`src/commands/code_v5`'e yönlenen bir **kodlama takma adı** — yani tam olarak
ürünün merkezinde olan şey. Devralınan bir test (`L-02`) bunu yakaladı.

Bu, kullanıcının daha önce düzelttiği hatanın aynısı: `dashboard`,
`workboard`, `browser`, `cron` gibi yüzeyleri "kodlama değil" diye eleme
eğilimi. Ada bakarak sınıflandırmak ucuz ve yanlış.
`directory` `channels` `team` `onboard`

## Geri alınan karar — bunlar KALIYOR

İlk sınıflandırmada `dashboard` `workboard` `browser` `web-fetch` `cron`
`hooks` `webhooks` `daemon` çıkarılacaklar listesindeydi. Karar geri alındı;
gerekçe fazla dardı: "coding-first", "yalnızca dosya düzenleme" demek değil.

| Komut | Kodlama işine bağı |
|---|---|
| `hooks` | pre-commit kalite kapısı — CodeDNA zaten git hook kuruyor, bizim kapımız da oraya bağlanacak |
| `web-fetch` | belge/RFC/issue okumak sıradan bir kodlama adımı |
| `browser` | web uygulamasını gerçekten açıp test etmek |
| `cron` `daemon` | zamanlanmış koşum, arka planda çalışma |
| `webhooks` | CI ve depo olaylarıyla tetiklenme |
| `dashboard` `workboard` | ajan koşumlarının ve görevlerin görünürlüğü |

### Bunun getirdiği zorunlu iş

`web-fetch` ve `browser` **ağ erişimi** demek ve ADR-0002'de ağ ayrı bir izin
sınıfı olarak tanımlı — ama o sınıf henüz **yok**. Bu, komutu çıkarmanın
gerekçesiydi; komut kaldığına göre eksik olan sınıfın kendisi.

Yani sıraya yeni bir iş giriyor: `execution-gateway`'e `ag` izin sınıfı ve
onay akışı. Prompt injection yoluyla veri sızdırma (T2) tam olarak bu yolla
olur: model "şu dosyayı şu adrese gönder" der ve ağ izni yoksa duramaz.
Onay metni hedef adresi göstermek zorunda.

Bu iş yapılana kadar `web-fetch` ve `browser` mevcut hâlleriyle duruyor;
"ağ izni var" diye sunulmuyorlar.

## Ölçüm

| Aşama | Komut | Test |
|---|---:|---|
| Fork | 102 | 1127 ✓ |
| Parti 1 sonrası | 91 | 1127 ✓ |
