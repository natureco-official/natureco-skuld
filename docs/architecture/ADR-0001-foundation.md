# ADR-0001 — Temel: repo yapısı, fork stratejisi, entegrasyon biçimleri

**Durum:** Önerilen (karar kapısı bekliyor)
**Tarih:** 29 Temmuz 2026
**Bağlam:** [SOURCE_AUDIT](../discovery/SOURCE_AUDIT.md), [PRODUCT_GAP](../discovery/PRODUCT_GAP.md)

## Karar 1 — Runtime ve dil: Node + TypeScript strict

**Seçenekler:** (a) Node + JS (natureco-cli'nin bugünkü hâli), (b) Node + TS strict, (c) Rust/Go.

**Karar: (b).**

- (c) elenmeli: natureco-cli'den alınacak ~213 KB çalışan, testli kodlama çekirdeği tamamen yeniden yazılırdı. Prompt "büyük çaplı yeniden yazım yerine çalışan testli çekirdeği çıkar" diyor. Ayrıca urdr ve verdandi de Node.
- (a) yerine (b): Verðandi zaten TS ve `strict`; urdr ESM. natureco-cli CommonJS + JS. Karışık taban bakımı pahalı.

**Maliyet ve dürüst uyarı:** natureco-cli CommonJS (`type: commonjs`), urdr ve verdandi ESM. Alınan çekirdek **ESM'e dönüştürülmeli**. Bu mekanik ama sıfır riskli değil: 1127 testin taşınması ve yeşil kalması dönüşümün kabul kriteridir. Dönüşüm testsiz yapılırsa sessiz kırılma olur.

**Geçiş kuralı:** dosya dosya taşı, her dosyayla birlikte testini taşı, kırmızıda ilerleme.

## Karar 2 — Fork değil, seçmeli çıkarma (curated extraction)

**Seçenekler:** (a) natureco-cli'yi fork'la, gereksizi sil; (b) boş repo, modül modül taşı.

**Karar: (b), provenans korunarak.**

(a) cazip görünüyor ama 658 dosyanın 445'ini silmek demek; silinen her şeyin `git log`'u yeni depoda kalır ve 1.2 MB'lık sınıflandırılmamış yüzey "belki lazım olur" diye yaşamaya devam eder. Skuld'un ürün sınırı (PRODUCT_GAP §1) ilk günden bulanıklaşır.

(b) ile her taşınan dosya bilinçli bir karardır ve şu ikisini birlikte getirir: kaynak SHA'lı provenans başlığı + taşınan testi.

**Upstream güvenlik düzeltmelerini taşıma:** natureco-cli'nin `SECURITY.md` ve audit dosyaları takip edilecek; `docs/UPSTREAM_SYNC.md` altında taşınan dosya → kaynak SHA eşlemesi tutulacak. Upstream'de bir düzeltme çıktığında eşlemeden etkilenen dosyalar bulunacak. Otomatik merge yok — seçmeli cherry-pick.

## Karar 3 — Urðr entegrasyonu: **subprocess/MCP**, gömülü kütüphane değil

**Seçenekler:** (a) `import` ile gömülü kütüphane, (b) MCP stdio sunucusu, (c) doğrudan subprocess.

**Karar: (b) birincil, (c) kaçış yolu.**

Gerekçe:
- urdr **zaten MCP sunucusu** (`urdr-mcp` bin, 7 araç). Sözleşme hazır ve sürümlenebilir. Prompt'un 9. ilkesi "private import yerine kararlı API/MCP" diyor.
- urdr'ın **0 otomatik testi var** (SOURCE_AUDIT Bulgu 1). Gömülü kütüphane yapmak, doğrulanmamış kodu Skuld'un süreç alanına almak demek: bir hata Skuld'u düşürür.
- Süreç sınırı aynı zamanda güvenlik sınırı: hafıza deposu Skuld'un dosya sistemi yetkisinden ayrı yaşar.

**Bilinen boşluk:** `reconcileMarkdown` MCP'de araç olarak yok (SOURCE_AUDIT Bulgu 2). İki yol: (i) upstream'e `urdr_reconcile` aracı eklemek — tercih edilen, (ii) Skuld'un memory adaptöründe kaçış yolu olarak fonksiyonu doğrudan çağırmak. (ii) tek başına kalırsa Skuld urdr'ın iç yapısına bağlanır; bu yüzden (i) P0 içinde upstream PR olarak açılmalı.

## Karar 4 — Verðandi entegrasyonu: **MCP**, fallback ile

**Karar:** MCP stdio (verdandi zaten `verdandi-context-compiler` MCP sunucusu, 5 araç, resmî `@modelcontextprotocol/client@2.0.0` ile sürekli test ediliyor).

Ek gereksinimler:
- **Fallback zorunlu.** Verðandi yoksa/yanıt vermezse Skuld klasik retrieval'a düşmeli ve bunu kullanıcıya söylemeli (ilke 6).
- **Bypass eşiği.** Verðandi'nin kendi ölçümünde küçük görevlerde kapsül maliyeti **artırıyor** (T01: +%21). Skuld görev karmaşıklığına göre kapsülü atlayabilmeli; eşik tahminle değil benchmark ile konacak.
- **TypeScript dışı diller.** Verðandi TS-only. Skuld başka dillerde "AST destekli" iddiasında bulunmayacak; parser adaptör arayüzü P0'da tanımlanır, doldurulması P1.

## Karar 5 — CodeDNA entegrasyonu: **sürümlenmiş JSON subprocess sözleşmesi**

**Seçenekler:** (a) uzun ömürlü servis, (b) çağrı başına subprocess + JSON, (c) Python'u gömmek.

**Karar: (b).**

- (c) elenmeli: Node süreci içine Python gömmek çapraz platform kâbusu.
- (a) yerine (b): kalite kapısı görev başına birkaç kez çağrılır; kalıcı servis çalıştırmak boşuna karmaşıklık ve ek saldırı yüzeyi.

Sözleşme kuralları: sürüm alanı, **timeout**, **çıktı boyut sınırı**, structured spawn (kabuk string birleştirme yok — CodeDNA subprocess injection tehdidi), Python yoksa temel ajan çalışmaya devam eder ve `skuld doctor` net kurulum önerisi verir.

Kurulum gerçeği: bu denetimde codedna'yı çalıştırmak için `pip install -e .` gerekti (`tree_sitter_python` eksikti). `doctor` bunu bilmeli.

## Karar 6 — Tek güvenlik kapısı, **lint ile zorlanan**

SOURCE_AUDIT Bulgu 4: natureco-cli'de 71 dosya doğrudan komut çalıştırma çağrısı içeriyor, yalnızca 17'si policy kelimesi de içeriyor.

**Karar:** `execution-gateway` tek giriş noktası olacak ve kural belgeye değil **CI'ya** yazılacak: gateway paketi dışında `child_process` import etmek lint hatası. Aynı biçimde workspace dışına çıkan yol çözümü, symlink kaçışı ve secret masking gateway'de tek yerde.

Gerekçe: bu oturumda Verðandi'de aynı kalıp kanıtlandı — düzyazı kural kayar, kontrol kaymaz. Ajan tablosu kontrolü ilk gerçek değişiklikte hatayı yakaladı.

## Önerilen başlangıç yapısı

Prompt'un hipotezi büyük ölçüde korunuyor; iki değişiklikle:

```text
packages/
  cli/                 # komutlar, REPL
  agent-core/          # INTAKE..REMEMBER state machine
  execution-gateway/   # TEK policy/approval/sandbox/audit sınırı
  provider-core/       # 5 model adaptörünün normalize sözleşmesi
  context-engine/      # Verðandi MCP adaptörü + fallback retrieval
  memory/              # Urðr MCP adaptörü + sözleşme testleri
  quality-gate/        # CodeDNA subprocess sözleşmesi
  natureco-auth/       # device flow, keychain
  cupertino-bridge/    # ADR-0003
  plugin-sdk/          # MCP/skills/plugins
  shared/              # schema, error, telemetry
tests/{integration,e2e,security,fixtures}
benchmarks/
docs/{discovery,architecture}
```

**Değişiklik 1:** `apps/docs/` P0'da yok — dokümantasyon sitesi P1'e ertelendi, P0'ı geciktirmemeli.
**Değişiklik 2:** `benchmarks/` kök seviyeye alındı; üç iddiadan ikisi (bağlam ekonomisi, kalite kapısı) buraya bağımlı, alt klasörde saklanmamalı.

## Reddedilen alternatifler

| Alternatif | Neden reddedildi |
|---|---|
| natureco-cli'nin `natureco code` üzerine wrapper | Prompt'ta yasak; ayrıca runtime bağımlılığı yaratır |
| Ortak çekirdek paketi (P0'da) | Bağımsızlık sınırını erken bulanıklaştırır; ayrı ADR ile P2'de değerlendirilebilir |
| urdr/verdandi'yi vendor'layıp gömmek | Doğrulanmamış kodu süreç alanına alır; sürüm sürüklenmesi yaratır |
| Hafıza için natureco-cli'nin 4 sağlayıcısını taşımak | İki hafıza kaynağı çelişki üretir; Urðr tek kaynak |
