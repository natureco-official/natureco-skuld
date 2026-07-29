# PRODUCT_GAP — Skuld'un ürün sınırı ve ayırt edici iddiaları

**Tarih:** 29 Temmuz 2026

## 1. NatureCo CLI ile Skuld arasındaki net sınır

natureco-cli bugün **genel amaçlı bir asistan**: 108 komut, 92 araç, mesajlaşma, medya üretimi, ev otomasyonu, takvim, tarayıcı kontrolü, kanban, dashboard. Kodlama bunun içinde bir yüzey (`code`, `code_v5`).

Skuld **coding-first bir ajan**: kodlama döngüsü ürünün kendisi, geri kalan her şey opsiyonel eklenti.

| | NatureCo CLI | Skuld |
|---|---|---|
| Merkez soru | "Bugün ne yapmamı istersin?" | "Bu kod tabanında bu görevi doğrulanmış şekilde bitir" |
| Başarı ölçütü | görev çeşitliliği | edit–run–verify–remember döngüsünün güvenilirliği |
| Varsayılan yüzey | 108 komut | ~15 komut |
| Hafıza | 4 farklı sağlayıcı (file/mem0/rest/supermemory) | tek: Urðr, provenanslı |
| Bağlam | tam dosya okuma | Verðandi kapsülü, ölçülmüş bütçe |
| Kalite kapısı | yok | CodeDNA diff kapısı |
| Hesap | bazı özellikler için gerekli | **local kullanım hesapsız** |

Ölçüm bu ayrımı destekliyor: kodlama çekirdeği ~213 KB, kodlama dışı yüzey ~254 KB, sınıflandırılmamış geri kalan ~1.2 MB. Yani Skuld, natureco-cli'nin **küçük ama yoğun** bir çekirdeğinden türüyor.

## 2. Claude Code / Codex sınıfı temel beklentiler

P0'da bunların hepsi olmazsa ürün "yeni bir ajan" değil, eksik bir ajan olur:

| Beklenti | natureco-cli'de var mı | Skuld P0 |
|---|---|---|
| Streaming REPL, kesilebilir | var | taşınacak |
| Dosya oku/yaz/düzenle, grep, glob | var (9 araç) | taşınacak |
| Shell çalıştırma + onay | var ama kapı dağınık (bkz. SOURCE_AUDIT Bulgu 4) | **yeniden tasarlanacak** |
| Git farkı görme, commit | var | taşınacak |
| Çoklu model sağlayıcı | 5 adaptör | normalize edilecek |
| Oturum devam ettirme | var | crash-resume eklenecek |
| Plan gösterme / onay | kısmen | state machine'e bağlanacak |
| MCP | var | plugin-sdk'ya taşınacak |
| `--json` makine çıktısı | kısmi | stabil şema gerekli |
| Checkpoint / rollback | `checkpoint.js` var | içerik-hash önkoşuluyla güçlendirilecek |

## 3. Skuld'un üç ayırt edici iddiası

Bu üçü olmazsa Skuld "bir tane daha coding agent"tır. Her biri **ölçülebilir** olmalı, çünkü üçü de bugün kanıtlanmamış durumda.

### İddia 1 — Kalıcı, açıklanabilir hafıza (Urðr)

**Vaat:** ajan oturumlar arası hatırlar; her hatırlanan öğe kaynağını, zamanını ve güvenini taşır; çelişki sessizce ezilmez.

**Bugünkü gerçek:** urdr'ın **hiç otomatik testi yok** (0 test dosyası) ve reconcile yolu MCP'de yok. Yani iddia, doğrulanmamış bir katmana dayanıyor.

**Kanıt planı:** hafıza recall@k, yanlış recall oranı, çelişki senaryosu, forget idempotency ve crash-resume testleri — Skuld'un memory adaptörü seviyesinde. Bunlar geçmeden iddia pazarlama metnine girmez.

### İddia 2 — Ölçülmüş bağlam ekonomisi (Verðandi)

**Vaat:** aynı işi belirgin biçimde daha az input token ile bitirir.

**Bugünkü gerçek:** Verðandi'nin dokuz görevlik ölçümü var — 12.441.813 → 3.469.909 input token (−%72,1). Ama bu ölçümün sınırları belgede açıkça yazılı: **tek depo, yalnızca TypeScript, yalnızca Codex CLI ile**, ve kalite eşdeğerliği için bağımsız kör değerlendirme **henüz yapılmadı**. Ayrıca küçük görevlerde kapsül ek yük: T01 görevinde maliyet **%21 arttı**.

**Kanıt planı:** Skuld'un kendi benchmark harness'ı; A/B koşulları (düz taban / +Urðr / +Verðandi / +CodeDNA / tam Skuld); bypass eşiği ölçümle belirlenecek. Başarısız görevler sonuçtan çıkarılmayacak.

### İddia 3 — Değişiklik sonrası kalite/anlama kapısı (CodeDNA)

**Vaat:** ajan bir şey değiştirdikten sonra, değişikliğin riskini ölçer: korumalı modül ihlali, karmaşıklık artışı, ownership riski, anlama borcu.

**Bugünkü gerçek:** codedna 0.9.7, 23 testi geçiyor, ama 4 test dosyası bir kalite kapısının güvenilirliğini kanıtlamaz. Ayrıca "AI tarafından yazılmıştır" skoru sezgisel; prompt bunu güvenlik/kalite kanıtı saymayı açıkça yasaklıyor.

**Kanıt planı:** pre-edit baseline / post-edit karşılaştırması; korumalı modül ihlalinde blok; false-positive oranı ölçülüp raporlanacak.

## 4. Kimsenin yapmadığı ama Skuld'un yapabileceği şey

Üç iddianın **birleşimi** ayırt edici olan: bir ajan ki

1. görev için **ne okuduğunu** bilinçli seçer ve maliyetini raporlar (Verðandi),
2. neden öyle yaptığını **kalıcı ve kaynaklı** olarak yazar (Urðr),
3. değişikliğin riskini **değişiklikten sonra** ölçer ve gerekirse durur (CodeDNA),
4. ve bunların hiçbirini kanıt göstermeden "tamamlandı" demez.

Bugün piyasadaki ajanlar 1'i kısmen, 2'yi zayıf, 3'ü hiç yapmıyor.

## 5. Kapsam dışı (bilinçli)

- Zorunlu bulut hesabı
- P0'da kendi IDE'si/editörü
- Desteklenmeyen diller için sahte AST kalitesi iddiası
- Doğrulanmamış "otonom yazılım mühendisi" pazarlaması
