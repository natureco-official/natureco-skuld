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

## Çıkarılanlar

### Parti 1 — mesajlaşma ağ geçitleri ✅ (bu commit)

`discord` `slack` `telegram` `whatsapp` `signal` `imessage` `sms` `irc`
`mattermost` `message` `voice`

Kodlama ajanının bir mesajlaşma köprüsüne ihtiyacı yok. Master prompt bunları
açıkça "ayrı paket, bağımsız permission manifest, kullanılmadığında
yüklenmeme" koşuluyla plugin'e bırakıyor. Ayrıca her biri dış etkili eylem
(mesaj gönderme) yapıyor ve coding oturumunun izin sınırında bulunmaları
gereksiz risk.

### Parti 2 — yayıncılık ve SEO (sıradaki)

`medium` `naturehub` `seo` `wiki` `open-prose`

### Parti 3 — bot kişilikleri ve genel sohbet yüzeyleri

`bots` `clawbot` `crestodian` `vydra` `clickclack` `xp` `commitments`

### Parti 4 — otomasyon ve zamanlama

`cron` `hooks` `webhooks` `daemon`

### Parti 5 — ağ/küme yönetimi

`bonjour` `dns` `node` `nodes` `proxy` `gateway` `admin-rpc` `acp` `qr`
`directory` `channels` `team` `onboard`

### Parti 6 — panolar ve tarayıcı

`dashboard` `workboard` `browser` `web-fetch`

> `web-fetch` tartışmalı: bir kodlama ajanı belge okumak isteyebilir. Ama ağ
> erişimi ayrı bir izin sınıfı (ADR-0002, T2) ve şu an o sınıf yok. Sınıf
> gelene kadar çıkarılıyor; geri gelmesi bir karar, unutulmuş bir eksik değil.

## Ölçüm

| Aşama | Komut | Test |
|---|---:|---|
| Fork | 102 | 1127 ✓ |
| Parti 1 sonrası | 91 | 1127 ✓ |
