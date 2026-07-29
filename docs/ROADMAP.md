# ROADMAP — Skuld

**Tarih:** 29 Temmuz 2026
**Durum:** keşif tamamlandı, P0 karar kapısı bekliyor

## P0 — Güvenilir local coding agent

Amaç: hesapsız, tek makinede, kanıt üreterek çalışan bir kodlama ajanı.

| # | İş paketi | Bağımlılık | Kabul kriteri |
|---|---|---|---|
| P0-1 | Depo iskeleti, isim kararı uygulanmış, lisans/provenans altyapısı | **NAME_CHECK kararı** | `THIRD_PARTY_NOTICES.md`, taşınan her dosyada kaynak SHA |
| P0-2 | `execution-gateway`: tek kapı, structured spawn, workspace confinement, symlink guard, secret masking | — | Gateway dışında `child_process` import'u **lint hatası**; adversarial testler geçer |
| P0-3 | `provider-core`: 5 model adaptörünün normalize sözleşmesi | P0-1 | Fake provider ile deterministik test; gerçek çağrı yok |
| P0-4 | Kodlama çekirdeğinin taşınması (`code_v5`, `agentic-runner`, 9 araç) + ESM/TS dönüşümü | P0-2, P0-3 | Taşınan her modülün testi taşındı ve yeşil |
| P0-5 | `agent-core`: INTAKE→REMEMBER state machine, resumable session | P0-4 | Çökme sonrası resume testi |
| ~~P0-6~~ ✅ | `memory`: Urðr MCP adaptörü + **sözleşme testleri** | — | **Tamamlandı 29.07.2026:** 5 sözleşme testi geçiyor; iki ayrı süreçte yaz→hatırla doğrulandı |
| P0-7 ⏸ | `context-engine`: Verðandi MCP adaptörü | — | **Yazıldı, çalışıyor, 29.07.2026'da PASİFE alındı.** Tasarruf yarı kanıtlandı: "dosya adı verilmişse atla" ölçüldü ve ek yükü sıfırladı; diğer taraftaki fark koşum dalgalanmasının (aynı görevde 84×) altında kaldı. `--kapsul` ile açılır. Dönüş koşulu aşağıda ([rapor](../benchmarks/RAPOR-2026-07-29.md)) |
| ~~P0-8~~ ✅ | `quality-gate`: CodeDNA JSON subprocess sözleşmesi | — | **Tamamlandı 29.07.2026:** korumalı modül ihlali bloklar (çıkış 3), CodeDNA sezgileri yalnızca raporlar; CodeDNA yokken kapı yine çalışır |
| P0-9 | Checkpoint/rollback, içerik-hash önkoşulu | P0-4 | Stale patch reddedilir; dirty worktree korunur |
| P0-10 | `doctor`, `--json` stabil şema, audit log, exit code'lar | P0-1 | Şema testli, exit code'lar belgeli |
| P0-11 | CI: Linux/macOS/Windows × Node destek matrisi | P0-1 | Üç platformda yeşil |
| P0-12 | `benchmarks/` harness, A/B koşulları | P0-6,7,8 | Verðandi açık/kapalı raporu üretir |
| P0-13 | Cupertino capability detection prototipi | P0-2 | Plain terminalde tam çalışır |

### P0 kabul kriterleri (prompt'tan, hepsi test edilebilir)

- [ ] Temiz fixture repo'da özellik ekler, testleri çalıştırır
- [ ] Dirty worktree'deki kullanıcı değişikliklerini korur
- [ ] Destructive komut onaysız çalışmaz
- [ ] Stale patch reddedilir
- [ ] Çökme sonrası session resume edilir
- [ ] Urðr'a kaynaklı karar yazılır, sonraki oturumda **doğru scope'ta** bulunur
- [ ] Verðandi açık/kapalı benchmark raporu üretir
- [ ] CodeDNA protected module ihlalini yakalar
- [ ] **Hesap olmadan local kullanım çalışır**

### P0-7 neden pasif ve ne zaman geri açılır

Kod, testler ve eşik yerinde duruyor; yalnızca varsayılan kapalı. Geri açma
koşulu **tek bir ölçüm**: görev başına 5-10 tekrarla, medyan üzerinden,
dosya adı vermeyen görevlerde kapsülün tasarruf sağladığının gösterilmesi.

Şu anki engel teknik değil istatistiksel: aynı görevin taban kolu bir koşumda
58.104, diğerinde 694 input token harcadı. Bu oynaklık ölçmeye çalıştığımız
etkiden büyük olduğu sürece n=1 hiçbir şey söylemez.

Kanıtlanmamış bir yolu varsayılan yapmak, ölçümü beklerken kullanıcıya
maliyet bindirmek olurdu.

## P1 — Ekosistem entegrasyonu

- NatureCo device flow + keychain token storage
- Developer Portal cihaz/oturum görünürlüğü
- Cupertino native status/diff/approval köprüsü
- MCP/plugin SDK, imzalı ve izin manifestli kurulum
- Gelişmiş context profilleri, maliyet bütçesi
- Paketleme, installer, auto-update + rollback
- Dokümantasyon sitesi

## P2 — Takım ve uzak çalışma

- Opt-in şifreli senkronizasyon (ayrı ADR)
- ZeroLink uzak coding, net hedef gösterimi — **Mac→Windows yönü önce test edilmeli**
- Takım policy paketleri, shared decisions, CodeDNA trendleri
- Background/cloud görevleri (ayrı threat model)

## P0 sonrasına bırakılan opsiyonel modüller

Mesajlaşma gateway'leri, Medium/SEO/NatureHub, medya üretimi, genel chatbot, cron/hooks/webhooks, web dashboard. Her biri: ayrı paket sınırı, bağımsız permission manifest, kullanılmadığında yüklenmeme, ayrı hafıza scope'u, dış etkili eylemlerde açık onay.

## Riskler

| Risk | Olasılık | Etki | Azaltma |
|---|---|---|---|
| **İsim çakışması** — npm/PyPI alınmış, GitHub'da en popüler "skuld" bir stealer malware | kesin | yüksek (marka + güvenlik itibarı) | NAME_CHECK kararı **kod yazmadan önce** |
| **urdr'ın 0 testi** — hafıza katmanı doğrulanmamış | kesin | yüksek | Sözleşme testleri Skuld tarafında (P0-6); upstream'e test PR'ı |
| CommonJS→ESM dönüşümünde sessiz kırılma | orta | yüksek | Dosya başına test taşıma; 1127 testin yeşil kalması kabul kriteri |
| Gateway'in gerçekten tek kapı olmaması | orta | **kritik** | Lint kuralı (P0-2), belge değil |
| Verðandi TS-only → diğer dillerde zayıf | kesin | orta | Açıkça duyurulacak; parser adaptör arayüzü P0, doldurma P1 |
| Küçük görevlerde kapsül ek yükü maliyeti artırıyor (T01 +%21) | kesin | orta | Bypass eşiği benchmark ile (P0-7,12) |
| CodeDNA Python bağımlılıkları (`tree_sitter_python`) | kesin | düşük | Graceful degradation + `doctor` |
| natureco-cli'nin 22 runtime bağımlılığı | orta | orta | Kodlama dışı yüzey atılınca azalır; kalanlar denetlenecek |
| ZeroLink Mac→Windows hiç test edilmemiş | kesin | orta | P2'ye kadar "desteklenmiyor" denecek |
| Kalite eşdeğerliği hâlâ kanıtsız (Verðandi'de de öyle) | kesin | yüksek (pazarlama riski) | Kör değerlendirme yapılmadan iddia edilmeyecek |
