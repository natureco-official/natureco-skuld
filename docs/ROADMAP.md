# ROADMAP — NatureCo Skuld

**Gözden geçirme:** 29 Temmuz 2026
**Hedef (kullanıcı tanımı):** *"Senin yapabildiğin her şeyi Skuld da yapabilmeli."*

## Önceki planın öncülü yanlıştı

Eski yol haritası Skuld'u minimal bir çekirdekten dışa doğru inşa edilecek bir
şey sayıyordu: P0-1 iskelet, P0-4 araçları taşı, P0-5 ajan döngüsü…

Fork alındıktan sonra yapılan envanter bunu çürüttü. Aşağıdakilerin **hepsi**
zaten fork'ta var ve **testleri de var**:

| Yetenek | Fork'taki karşılığı | Testi |
|---|---|---|
| Alt ajan / görev devri | `sub_agent`, `delegate_task`, `async_delegation` | `sub-agent.test.js` |
| Plan modu | `plan`, `utils/plan-mode.js` | `plan-mode.test.js` |
| Görev listesi | `todo_write` | `todo-write-tool.test.js` |
| Arka plan görevleri | `utils/background.js` | `background.test.js` |
| Worktree izolasyonu | `utils/worktree.js` | `worktree.test.js` |
| LSP | `utils/lsp-client.js` | `lsp-client.test.js` |
| Oturum sürdürme | `utils/coding-session.js`, `sessions` | `coding-session.test.js` |
| Cerrahi düzenleme | `edit_file`, `structural_patch` | ✓ |
| Arama | `grep_search`, `file_search`, `web_search`, `exa_search` | ✓ |
| Notebook | `notebook_edit` | — |
| Checkpoint | `checkpoint` | ✓ |
| Kullanıcıya soru | `clarify` | ✓ |
| Skill / plugin / MCP | `skills_*`, `plugin`, `mcp` | ✓ |
| Hafıza | `memory_tree`, `cross_session_memory` | ✓ |

**Sonuç: eksik olan yetenek değil.** İş sıfırdan inşa değil; doğrulama,
bağlama ve ayıklama.

## En büyük açık: kapı üründe yürürlükte değil

`packages/execution-gateway` yazıldı, 13 düşman testi geçiyor, sınır lint'i
yeşil. Ama:

- Hiçbir yerden **kullanılmıyor** — `src/` ve `bin/` altında tek bir
  `@skuld/*` import'u yok.
- `src/tools/` altında **26 dosya doğrudan `child_process` çağırıyor**.
- Sınır lint'i yalnızca `packages/` altını tarıyor; orası kimsenin çağırmadığı
  bir köşe olduğu için kural fiilen hiçbir şeyi korumuyor.

Yani "tek güvenlik kapısı" bugün bir ilke değil, bir niyet. Yol haritasının
ilk maddesi bu.

## Sıra

### S1 — Kapıyı gerçekten devreye al

1. `src/tools/bash.js` ve `shell_command.js` → `execution-gateway` üzerinden.
2. Kalan çağrı noktalarını tek tek geçir; her biri ayrı commit, her commit
   sonrası tam test.
3. Sınır lint'inin kapsamını `packages/` → `src/` + `bin/` olarak genişlet.
   Kapsam genişlemesi **en sona**: önce sıfır ihlal, sonra kural.
4. **Ağ izin sınıfı** (`ag`): `web-fetch`, `browser`, `http_request` bu sınıfa
   bağlanır; onay metni **hedef adresi gösterir**. ADR-0002'de T2 (prompt
   injection ile veri sızdırma) tam bu yoldan gerçekleşir ve şu an duracak
   bir şey yok.

### S2 — Farklılaştırıcıları döngüye bağla ✅ (29.07.2026)

- **Urðr hafızası** ✅ `runAgentic` içinde RECALL ve REMEMBER.
- **Kalite kapısı** ✅ değişiklik sonrası; blokladıysa hafızaya yazılmaz.
- **Verðandi kapsülü** → pasif kalır; geri açma koşulu ölçümde
  (`benchmarks/RAPOR-2026-07-29.md`).

### S3 — Yetenek eşitliği denetimi

Envanter "var" diyor; "çalışıyor" demiyor. Her yetenek için uçtan uca bir
kanıt koşumu: alt ajan gerçekten alt ajan başlatıyor mu, worktree gerçekten
izole mi, plan modu gerçekten uygulamayı engelliyor mu, LSP gerçekten bir dil
sunucusuna bağlanıyor mu.

Şimdiye kadar **çalıştırarak** bulunan üç kusur, bu denetimin neden gerektiğini
gösteriyor:

- `gatewayScreen` her çağrıda çöküyordu (`COLORS.cyan` tanımsızdı).
- Kurulum sihirbazı TTY yokken çöküyordu — kullanıcının gördüğü ilk ekran.
- Kelime işareti boruya iki kez düşüyordu.

Hiçbiri 1127 testin ürettiği bir uyarı değildi.

### S4 — Ayıklama (küçültülmüş kapsam)

Kırpma hedefi artık "minimal araç" değil, **"Claude Code'un yapmadığı ve
kodlama döngüsüne hizmet etmeyen yüzeyler"**. Bu, listeyi ciddi biçimde
kısaltıyor.

| Parti | Komutlar | Gerekçe |
|---|---|---|
| 1 ✅ | `discord` `slack` `telegram` `whatsapp` `signal` `imessage` `sms` `irc` `mattermost` `message` `voice` | Kodlama ajanının mesajlaşma köprüsü yok; dış etkili eylemler izin sınırını gereksiz genişletiyor |
| 2 | `medium` `naturehub` `seo` `wiki` `open-prose` | Yayıncılık; kodlama döngüsüne değmiyor |
| 3 | `clawbot` `crestodian` `vydra` `clickclack` `xp` | Bot kişilikleri |
| 4 | `bonjour` `dns` `proxy` `admin-rpc` `qr` | Ağ/küme yönetimi |

**Kalanlar** — ilk sınıflandırmada yanlışlıkla çıkarılacaklar listesindeydiler:
`dashboard` `workboard` `browser` `web-fetch` `cron` `hooks` `webhooks`
`daemon`. Hepsi kodlama döngüsüne hizmet ediyor; gerekçeleri
[`KOMUT-KIRPMA.md`](KOMUT-KIRPMA.md) içinde.

`bots`, `channels`, `team`, `directory`, `onboard`, `gateway`, `node`, `nodes`
kırpma listesinden **çıkarıldı**: alt ajan yönetimi ve çok makineli çalışma
hedefe dahil; önce ne yaptıklarına bakılacak, sonra karar verilecek.

### S5 — Kimlik ve ekosistem

NatureCo SSO, Developer Portal, Cupertino köprüsü, imzalı plugin kurulumu.

## Değişmeyenler

1. Local-first: hesapsız çalışır, kaynak kodu opt-in olmadan çıkmaz.
2. Kanıtsız başarı yok: ajan "tamamlandı" demeden önce ne çalıştırdığını gösterir.
3. Tek güvenlik kapısı — **S1 bitene kadar bu bir hedef, bir gerçek değil.**
4. Eksik özellik dürüstçe bildirilir.
5. Geri alınabilir değişiklikler.

## `code_execution` ağ kapısını atlıyordu ✅ (29.07.2026)

Codex tur 2, birinci soru. Doğrulandı: `code_execution` ajan modunda izinliydi,
Node kodunu kısıtsız çalıştırıyordu ve model `globalThis.fetch(...)` yazarak
ağ kapısına hiç uğramadan dışarı çıkabiliyordu.

Sandbox aramak yanlış soruydu. `vm` ya da ayrı süreç + izin devri, yeni
saldırı yüzeyi getirir ve Node'da hiçbiri gerçekten kapatmaz. Doğru cevap
sınıflandırmaydı: **rasgele kod çalıştırmak bir araç değil, kabuk gibi ayrı
bir yetenektir.** Onay her zaman sorulur, beyaz liste uygulanmaz, kodun
kendisi onay ekranında gösterilir — "ne yazdığını görmeden çalıştırma".

Yanında ikinci bir kusur çıktı: alt sürece `{ ...process.env }` gidiyordu.
Kullanıcı kodu okuyup onaylasa bile her API anahtarının oraya gitmesi için bir
neden yok. Onaylamak "bu kodu çalıştır" demektir, "anahtarlarımı da al" demek
değil. Ortam artık `ortamiTemizle()` ile süzülüyor; `PATH` geçiyor,
`*_KEY`/`*_TOKEN`/`*_SECRET` geçmiyor.

Testler: `test/tools/code-execution-kapi.test.js` (4 test) — onaysız
çalışmaz, model `onayli` bayrağını gönderemez, onaylı kod sırları görmez,
sır olmayan değişkenler geçer.

## Ölçüm

| | Değer |
|---|---|
| Devralınan test | 1127 geçiyor / 3 atlanıyor |
| Eklenen paket testi | 27 geçiyor |
| Komut | 102 → 91 |
| Araç | 92 |
| `child_process` import eden dosya (`src/`) | **61 → 59** ← S1'in hedefi |
| Bunlardan `src/tools/` altında | 26 → **24** |

### S1 ilerlemesi

| Tarih | Bağlanan | Kalan (`src/tools/`) |
|---|---|---|
| 29.07 | `bash.js`, `shell_command.js` | 24 |
