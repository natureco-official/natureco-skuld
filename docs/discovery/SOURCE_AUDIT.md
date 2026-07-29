# SOURCE_AUDIT — Kaynak depo denetimi

**Tarih:** 29 Temmuz 2026
**Kural:** Bu belgedeki her test sonucu **gerçekten çalıştırıldı**. README iddiaları kanıt sayılmadı.

## Sabitlenmiş başlangıç commit'leri

| Depo | Yerel yol | SHA | Sürüm | Lisans | Dil/Runtime |
|---|---|---|---|---|---|
| natureco-cli | `natureco_improvements/natureco-cli` | `40b4913ea66fbef7862600c1033e2a189a8e8126` | 5.71.2 | MIT | Node, CommonJS |
| urdr | `urdr-main` | `12fd5852a5a313266e7a2bcc60dea3c6a44b3221` | 1.0.1 | MIT | Node, ESM |
| verdandi | `Verðandi` | `9f490136bf47b872d284569dc3b8106dfea1d827` | 0.2.0 | MIT | Node, ESM + TS |
| codedna | `codedna_translated` | `0882685b1d2e12a1c5ffedda11a23caff5c179f7` | 0.9.7 | MIT | Python 3.12 |
| cupertino-terminal | `mac-terminal-win` | `3d0ee9124c27e2d5ef31acb4ada162ba8358241b` | 0.6.4 | MIT | Rust çekirdek + Node kabuk |

**Hepsi MIT.** Kopyalanan kod için attribution + lisans metni yükümlülüğü var, copyleft yok. `THIRD_PARTY_NOTICES.md` kökte tutulmalı (natureco-cli'de zaten var, örnek alınabilir).

### natureco-cli'nin yeri hakkında not

natureco-cli, `natureco_improvements` (natureco.me site deposu) **çalışma ağacının içinde ayrı bir git deposu** olarak duruyor. GitHub'daki `natureco-official/natureco-cli` ile aynı SHA'da ve içerik olarak birebir aynı (900 dosyalık `diff` farkı yalnızca CRLF/LF satır sonu; `tr -d '\r'` sonrası fark sıfır).

Yerel kopyada git'te olmayan üç öge var: `.codedna.db` (0 bayt), `.env.test` (2 satır), `.natureco/`. `.env.test` yalnızca `MINIMAX_API_KEY` ve `NATURECO_API_KEY` **adlarını** taşıyor; bilinen hiçbir anahtar deseniyle eşleşmiyor, yani yer tutucu. Sır sızıntısı yok.

> ⚠️ **Kalıcı kısıt:** `natureco_improvements` (natureco.me kaynağı) GitHub'a gönderilmeyecek. Skuld deposu bu ağacın içinden **hiçbir dosya kopyalamamalı**; natureco-cli'yi kendi uzak deposundan almalı.

## Test durumu — iddia vs gerçek

| Depo | package.json iddiası | Gerçekte çalıştırıldı | Sonuç |
|---|---|---|---|
| natureco-cli | `vitest run` | `npx vitest run` | ✅ **1127 geçti**, 3 atlandı, 123 dosya, 49 s |
| verdandi | `npm run build && run_tests.mjs` | `npm test` | ✅ **118 geçti**, 0 atlandı |
| codedna | — | geçici venv + `pytest -q` | ✅ **23 geçti** (4 test dosyası) |
| cupertino-terminal | `node --test test/*.test.js` | aynı komut | ✅ **6 geçti** |
| **urdr** | **test betiği YOK** | `find -name '*.test.*'` | ❌ **0 test dosyası** |

### Bulgu 1 — urdr'ın hiç otomatik testi yok

urdr README'si crash-safe işlemler, fsync'lenmiş atomik rename, event log bütünlüğü ve "event-aware readers immediately see the correct logical generation" iddiasında bulunuyor. Bu iddiaların **tek bir otomatik testi yok.**

Skuld için bu doğrudan bir risk: proje hafızası, ajanın kararlarını taşıyacak katman. Bozuk hafıza = yanlış karar. P0'da urdr adaptörü yazılırken **sözleşme testleri Skuld tarafında yazılmalı** (adaptör seviyesinde: yaz-oku-çelişki-forget-crash), yoksa doğrulanmamış bir katmanın üzerine inşa etmiş oluruz.

### Bulgu 2 — urdr'da reconcile aracı MCP'de yok

Bu oturumda canlı olarak yaşandı: Markdown'a MCP dışından yazılınca ağaç ile olay günlüğü ayrışıyor ve `urdr_append` `dirty Markdown view...; run reconciliation before retrying` diyerek duruyor. **7 MCP aracının hiçbiri reconcile değil.** Fonksiyon (`reconcileMarkdown`) `scripts/lib/transaction.mjs` içinde dışa aktarılmış, doğrudan çağrılabiliyor ve çalışıyor (`status: reconciled, conflicts: [], changedLeaves: 16/43`, kök dosyalar bayt bayt korundu).

Skuld'un memory adaptörü ya bu fonksiyonu doğrudan çağırabilmeli ya da upstream'e `urdr_reconcile` aracı eklenmeli. **Kapısı olup geçidi olmayan bir kontrol, kullanıcıyı doğrudan dosyaya yazmaya iter** — bu oturumda tam olarak bu oldu.

### Bulgu 3 — cupertino-terminal'in JS tarafı 6 testle temsil ediliyor

Ürün Rust çekirdekli; `node --test` yalnızca ince Node kabuğunu ölçüyor. ZeroLink, IPC ve terminal yetenek algılama için Skuld'un dayanacağı yüzeyin test kapsamı **bu 6 testten çıkarılamaz.** ADR-0003'te sözleşme testleri Skuld tarafında tanımlanmalı.

## natureco-cli yeniden kullanım matrisi

Toplam: 658 JS dosyası. Ölçülen dağılım:

| Alan | Dosya | Boyut | Kodlama çekirdeği | Kodlama dışı yüzey | Sınıflandırılmamış |
|---|---:|---:|---:|---:|---:|
| `src/tools/` | 92 | 495 KB | 18 dosya / 98 KB | 25 dosya / 144 KB | 49 |
| `src/commands/` | 108 | 1222 KB | 4 dosya / 115 KB | 10 dosya / 110 KB | 94 |
| `src/utils/` | 110 | — | policy katmanı (aşağıda) | — | — |
| `src/providers/` | 13 | — | `model/` 5 adaptör | `*-memory.js` 4 adaptör | — |

**Okuma:** kodlama çekirdeği toplam yüzeyin küçük bir kısmı (~213 KB / ~1.7 MB). Prompt'un "coding-first çekirdeği çıkar, gerisini opsiyonel modül yap" tezi ölçümle destekleniyor.

### Karar matrisi

| Modül | Karar | Gerekçe |
|---|---|---|
| `src/commands/code_v5.js` (1475 satır), `code.js` (689) | **doğrudan al + refactor** | Ajan döngüsünün kalbi; tek dosyada 1475 satır, `agent-core`'a bölünmeli |
| `src/tools/agentic-runner.js` (514) | **doğrudan al** | plan-act-verify iskeleti |
| `src/tools/{edit_file,bash,git,grep_search,file_search,list_dir,filesystem,file_state,checkpoint}.js` | **doğrudan al** | P0 araç seti |
| `src/utils/{permissions,sandbox,tool-guardrails,tool-path-policy}.js`, `src/tools/approval.js` | **yeniden tasarla** | Aşağıdaki Bulgu 4 |
| `src/providers/model/*` (anthropic, gemini, minimax, ollama, openai) | **adaptörle bağla** | 5 sağlayıcı hazır; `provider-core` sözleşmesine normalize edilmeli |
| `src/providers/*-memory.js` (file, mem0, rest, supermemory) | **kapsam dışı** | Skuld'un hafızası Urðr; ikinci bir hafıza katmanı çelişki üretir |
| Discord/Telegram/mac_*/browser/computer_use/image_generation/cron/kanban/dashboard | **P0 kapsamı dışı**, sonra plugin | 25 tool + 10 command, ~254 KB |
| `skills/` | **adaptörle bağla** | plugin-sdk'nın girdisi |

### Bulgu 4 — "tek güvenlik kapısı" ilkesi şu an sağlanmıyor

Ölçüm: `src/` altında **71 dosya** doğrudan komut çalıştırma çağrısı (`exec`, `spawn`, `execSync`, `spawnSync`, `execFile`) içeriyor. Bunlardan yalnızca **17'si** approval/permissions/guardrail/policy kelimelerinden birini de içeriyor.

Yani şu anki tabloda çalıştırma yolları politika katmanından **geçmiyor olabilir** — bu bir tespit, kanıt değil: 71'in içinde test dosyaları, kurulum betikleri ve dolaylı olarak gateway'i çağıran modüller de var. Ama policy katmanının toplam boyutu **51+147+60+264+55 = 577 satır** ve 71 çağrı noktası var. Bu oran, prompt'un 3. değişmez ilkesi ("bypass yolu olmamalı") ile bugünkü durumun örtüşmediğine dair güçlü bir sinyal.

**P0 eylemi:** `execution-gateway` paketi tek giriş noktası olarak yazılmalı ve **çağrı noktası sayısını sıfıra indiren bir lint kuralı** eklenmeli (gateway dışında `child_process` import etmek yasak). Bu, bu oturumda Verðandi'de kurduğumuz `ajan-tablosu-kontrol.mjs` kalıbının aynısı: kuralı belgeye değil, CI'ya yaz.

## Bağımlılık ve runtime riskleri

| Risk | Ayrıntı | Etki |
|---|---|---|
| natureco-cli CommonJS, urdr+verdandi ESM | `type: commonjs` vs `type: module` | Skuld ESM+TS seçerse fork edilen çekirdek dönüştürülmeli; tersi ESM adaptörlerini zorlaştırır |
| natureco-cli 22 runtime bağımlılığı | Supply-chain yüzeyi | P0'da denetlenmeli; kodlama dışı yüzey atılınca bir kısmı düşer |
| codedna Python | `tree_sitter_python` gibi ek bağımlılıklar `pip install -e .` gerektirdi | Python yoksa Skuld çalışmalı (ilke 6); `doctor` net kurulum önerisi vermeli |
| verdandi TypeScript-only | Diğer diller için AST yok | P0'da "tam AST desteği" iddiası yapılamaz (prompt bunu zaten yasaklıyor) |

## Provenans yükümlülükleri

- Alınan her dosyanın başına natureco-cli kaynağı ve SHA'sı düşülmeli.
- Kökte `THIRD_PARTY_NOTICES.md`.
- natureco-cli'nin MIT copyright satırı korunmalı.
- Skuld'un `package name`, `bin`, config dizini, session dizini ve update channel'ı natureco-cli'den **ayrı** olmalı; `~/.natureco` dokunulmamalı.
