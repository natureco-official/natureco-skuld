# ADR-0002 — Veri sınırları ve tehdit modeli

**Durum:** Önerilen
**Tarih:** 29 Temmuz 2026

## Temel kural

**Varsayılan: hiçbir şey makineden çıkmaz.** Tek istisna, kullanıcının seçtiği model sağlayıcısına giden istek — ve bu da kullanıcının kendi anahtarıyla, kendi seçtiği uca gider.

NatureCo'ya giden her şey **açık opt-in**, kapatılabilir ve kapalıyken kod yolu hiç çalışmaz.

## Veri sınıflandırması

| Veri | Nerede durur | NatureCo'ya gider mi |
|---|---|---|
| Kaynak kodu, diff, sembol adları | yalnızca yerel | **asla** |
| Prompt ve model yanıtları | yerel oturum dosyası | **asla** |
| Urðr hafıza yaprakları | yerel Markdown ağacı | **asla** (P2'de opt-in şifreli senkron ayrı ADR ile) |
| Verðandi kullanım kaydı | yerel `.verdandi/usage.jsonl`, gitignored | **asla** |
| Komut çıktıları, test sonuçları | yerel | **asla** |
| Model API anahtarları | OS keychain / credential vault | **asla** |
| NatureCo oturum token'ı | OS keychain | (zaten NatureCo'nun) |
| Anonim kullanım metriği | — | **yalnızca açık opt-in** |
| Ayar/profil senkronu | — | **yalnızca açık opt-in, şifreli** |
| Çökme raporu | yerel | **yalnızca açık opt-in ve içerik gösterilerek** |

**Kırmızı çizgi:** "tek hesap deneyimi" gerekçesiyle kaynak kodu veya hafıza otomatik yüklenmeyecek.

## Model sağlayıcısına ne gider

Bu, "local-first" iddiasının en kolay çürütüldüğü yer; açık olalım:

- Kapsül (Verðandi tarafından seçilmiş **sınırlı** kaynak parçaları) modele gider. Bu ürünün çalışma biçimi.
- Skuld bunu **gizlemeyecek**: `/context` komutu o an modele ne gönderileceğini gösterebilmeli, token sayısıyla.
- `.env`, `.git/config`, kimlik dosyaları ve secret desenleri kapsüle **girmeden** maskelenmeli — bu bir gateway görevi, model adaptörünün değil.
- Yerel model (ollama) seçildiğinde hiçbir şey makineden çıkmaz; bu yol P0'da test edilmeli.

## Tehdit modeli

| # | Tehdit | Karşı önlem | P0'da test |
|---|---|---|---|
| T1 | Prompt injection → shell çalıştırma | Model çıktısı asla doğrudan komut değil; her çalıştırma gateway + onay | ✅ adversarial |
| T2 | Prompt injection → veri sızdırma (kodu bir URL'e postala) | Ağ izni ayrı sınıf; varsayılan kapalı; onay metni hedefi gösterir | ✅ |
| T3 | Command injection / argüman birleştirme | Structured spawn, kabuk string interpolasyonu yasak (lint) | ✅ |
| T4 | Path traversal, symlink escape | Workspace confinement, `realpath` sonrası kök kontrolü | ✅ |
| T5 | Case-insensitive FS farkı (Windows/macOS) | Yol karşılaştırması normalize + platform testleri | ✅ CI matris |
| T6 | Kötü niyetli repodaki `AGENTS.md`/skill/MCP config | Repo dosyaları **veri**, talimat değil; MCP/skill kurulumu trust prompt ister | ✅ |
| T7 | `.env`/secret dosyalarının modele veya loga sızması | Gateway'de secret masking; kapsül öncesi filtre | ✅ |
| T8 | MCP/plugin supply-chain | checksum/provenance, izin manifesti, varsayılan kapalı | ✅ |
| T9 | Zehirlenmiş Urðr hafızası | Her yaprak `source`+`confidence`; çelişki reconciliation akışı; hafıza **talimat değil bağlam** | ✅ |
| T10 | Bayat Verðandi patch | İçerik-hash önkoşulu; stale reddi (verdandi'de mevcut, adaptörde korunacak) | ✅ |
| T11 | CodeDNA subprocess injection | Structured spawn, timeout, çıktı sınırı | ✅ |
| T12 | Cupertino IPC spoof/replay | ADR-0003: loopback + token + origin + nonce | ✅ |
| T13 | ZeroLink local/remote hedef karışıklığı | Hedef her zaman görünür; uzak hedefte ayrı onay sınıfı | ✅ |
| T14 | Sub-agent'ın parent izin sınırını aşması | Yetki devri yalnızca **daralarak**; child parent'ın kalanından fazlasını alamaz | ✅ |
| T15 | Log/session dosyasında credential kalması | Yazmadan önce maskeleme; testte gerçek desenlerle doğrulama | ✅ |
| T16 | Update channel / paket bütünlüğü | İmza veya registry integrity; ayrı update channel | P1 |

### T9 hakkında özel not

Hafıza, ajanın gelecekteki kararlarını etkiler. Bu yüzden **hafıza içeriği asla talimat olarak yorumlanmayacak**. Urðr'dan gelen bir yaprak "şunu çalıştır" diyorsa bu bir veri satırıdır, komut değil. Bu, prompt injection'ın kalıcı hâli olduğu için T1'den daha tehlikeli: bir kez zehirlenirse her oturumda tekrar eder.

Ayrıca hafıza kapsamları (global / workspace / repo-branch) birbirine **sızmamalı**: bir projede öğrenilen "shell komutlarını onaysız çalıştır" tercihi başka projeye taşınamaz.

## Kimlik ve token

- Standart local kullanım **hesap gerektirmez**. Bu bir kabul kriteri, tercih değil.
- `skuld login` API key ile kişisel oturum kurmaz; browser/device authorization flow, state/PKCE doğrulaması.
- Token'lar OS keychain/credential vault'ta; düz dosyada asla.
- `skuld logout` hem yerel temizlik hem opsiyonel sunucu revoke.
- Token yenileme hatası **sessizce** local moda düşmemeli; kullanıcıya söylenmeli.

## Telemetri

- Varsayılan **kapalı**.
- Açıksa bile: kaynak kodu, dosya yolu, sembol adı, prompt, komut çıktısı **gönderilmez**.
- Gönderilebilecekler: sürüm, platform, komut adı, hata sınıfı, süre kovası.
- Ne gönderildiği `skuld config get telemetry --explain` ile **tam olarak** gösterilebilmeli.

## Doğrulanmamış / açık sorular

- NatureCo tarafında device authorization endpoint'inin var olup olmadığı bu denetimde **doğrulanmadı**; natureco-sdk'da `NatureCoAuth` sınıfı var ama akışın sunucu tarafı test edilmedi.
- Şifreli senkronizasyonun anahtar yönetimi (kullanıcı parolası mı, cihaz anahtarı mı) P2 ADR'sine bırakıldı.
