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

## ~~En büyük açık: kapı üründe yürürlükte değil~~ → kapandı (29.07.2026)

Bu bölüm şunu diyordu: kapı yazıldı ama hiçbir yerden çağrılmıyor, sınır
lint'i kimsenin uğramadığı bir köşeyi tarıyor, yani "tek güvenlik kapısı"
bir ilke değil bir niyet.

Bugün: kabuk, git ve kod çalıştırma yolları kapıdan geçiyor; ağ ayrı bir izin
sınıfı; sınır lint'i `src/` + `bin/` tarıyor ve envanter büyüyemiyor.

Kalan 59 dosya **kasten** geçirilmedi, unutulmadı — S1/2'deki gerekçe. İddiayı
daraltmak, tutmadığı hâlde geniş bırakmaktan iyidir.

## Sıra

### S1 — Kapıyı gerçekten devreye al ✅ (29.07.2026)

1. ✅ `bash.js`, `shell_command.js`, `git.js`, `code_execution.js` kapıdan.
2. ⊘ **Kalan 59 dosya kasten geçirilmedi.** Tek tek okundu: macOS araçları
   betiği stdin'den, veriyi `argv`'den geçiriyor (enjeksiyon yok),
   `cron_create` zaten onay istiyor, `delegate_task` alt sürece kendi
   CLI'mızı açıyor. Ölçülebilir kazanç yok, risk büyük. Gerekçe:
   [`CODEX-DENETIM.md` → S1 kapanışı](CODEX-DENETIM.md).
3. ✅ Sınır lint'i `src/` + `bin/`'i tarıyor — ama **cırcır mandalı** olarak:
   envanter dondu, liste yalnızca kısalabilir. "Önce sıfır ihlal, sonra
   kural" yerine "kural bugün, ihlal büyüyemez".
4. ✅ Ağ izin sınıfı bağlandı; onay metni hedefi, gövde boyutunu ve kimlik
   başlıklarının adlarını gösteriyor.

### S2 — Farklılaştırıcıları döngüye bağla ✅ (29.07.2026)

- **Urðr hafızası** ✅ `runAgentic` içinde RECALL ve REMEMBER.
- **Kalite kapısı** ✅ değişiklik sonrası; blokladıysa hafızaya yazılmaz.
- **Verðandi kapsülü** → pasif kalır; geri açma koşulu ölçümde
  (`benchmarks/RAPOR-2026-07-29.md`).

### S3 — Yetenek eşitliği denetimi ✅ (29.07.2026)

`npm run yetenekler` → `scripts/yetenek-denetimi.mjs`, 8/8 yeşil. Her kontrol
bir ETKİYE bakıyor: plan modu gerçekten yazmayı reddediyor mu, worktree
gerçekten açılıyor mu (geçici depoda), RECALL modele gerçekten ulaşıyor mu.

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

Dört parti de bitti: **102 → 75 komut kaydı**, `--help` açılışı %16 daha
hızlı (üç turda ölçüldü).

> **Komut listesi burada TUTULMUYOR.** Tek kaynak
> [`KOMUT-KIRPMA.md`](KOMUT-KIRPMA.md).
>
> Bu not bir üslup tercihi değil, bir hatanın karşılığı: aynı liste iki
> dosyada duruyordu, ayrıştılar, ve ben `gateway` `node` `nodes`'u burada
> kayıtlı bir kararın tersine sildim (`13b41e5` ile geri alındı). İki kopya
> "ayrışır mı" diye sorulacak bir şey değil; ne zaman ayrışacağı sorulur.

**Kalanlar** — ilk sınıflandırmada yanlışlıkla çıkarılacaklar listesindeydiler:
`dashboard` `workboard` `browser` `web-fetch` `cron` `hooks` `webhooks`
`daemon`. Hepsi kodlama döngüsüne hizmet ediyor.

`channels`, `team`, `directory`, `onboard`, `gateway`, `node`, `nodes` kırpma
listesinde **değil**: alt ajan yönetimi ve çok makineli çalışma hedefe dahil.

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

| | Fork alındığında | Bugün (29.07.2026) |
|---|---|---|
| Devralınan test | 1127 geçiyor | **1150** geçiyor / 3 atlanıyor |
| Paket testi | 0 | **42** geçiyor |
| Yetenek denetimi | yok | **8/8** (`npm run yetenekler`) |
| Komut kaydı | 102 | **75** |
| Araç | 92 | 92 |
| `--help` açılışı | 388 ms | **~325 ms** (%16, üç turda ölçüldü) |
| Kapıdan geçen çalıştırma yolu | 0 | kabuk, git, kod çalıştırma |
| Sınır lint kapsamı | `packages/` (4 dosya) | `packages/` + `src/` + `bin/` (330 dosya) |
| Hayalet komut (yardımda var, kayıtta yok) | 2 | **0** |

Fork noktasındaki 1127 testin tamamı hâlâ geçiyor. Eklenen 23 test yeni
davranışın kanıtı; devralınan hiçbiri "artık geçerli değil" diye silinmedi —
ikisi beklentisi ölçülerek çürütüldüğü için gerekçesiyle güncellendi
(`list_dir` hassas yola erişebiliyordu, `nodes` kırpılmıştı).
