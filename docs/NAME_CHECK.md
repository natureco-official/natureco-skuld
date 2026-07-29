# NAME_CHECK — "Skuld" adının çakışma araştırması

> ## ✅ KARAR VERİLDİ — 29 Temmuz 2026
>
> | | |
> |---|---|
> | Ürün adı | **NatureCo Skuld** |
> | npm paketi | **`natureco-skuld`** |
> | CLI komutu | **`nskuld`** |
> | GitHub | `natureco-official/natureco-skuld` |
> | Config dizini | `~/.nskuld` (`~/.natureco`'ya **dokunulmaz**) |
>
> Çıplak `skuld` paketi ve binary'si **kullanılmayacak**. Gerekçe aşağıda.
> Ticari marka kontrolü hâlâ yapılmadı — ürün duyurulmadan önce gerekli.

**Tarih:** 29 Temmuz 2026
**Yöntem:** npm registry, PyPI, GitHub API/arama üzerinden canlı sorgu. Aşağıdaki her satır bir komut çıktısıdır, tahmin değildir.

## Sonuç: **çıplak `skuld` KULLANILMAMALI**

Prompt'un kuralı "çakışma ciddi değilse Skuld ile devam et" idi. Çakışma ciddi.

---

## 1. Paket adı doğrudan alınmış

| Kayıt | Ad | Durum |
|---|---|---|
| npm | `skuld` | **ALINMIŞ** — v0.0.4, "Easy Load Test" (`github.com/bydmm/skuld`) |
| npm | `skuld-cli` | **ALINMIŞ** — v0.1.19 |
| npm | `natureco-skuld` | boş |
| PyPI | `skuld` | **ALINMIŞ** (HTTP 200) |
| PyPI | `natureco-skuld` | boş (HTTP 404) |
| GitHub | `natureco-official/skuld` | boş |

npm'de `skuld` de `skuld-cli` de alınmış olduğu için, ürün adı Skuld kalsa bile **paket adı zaten değişmek zorunda**. Bu tek başına ölümcül değil; asıl sorun aşağıda.

## 2. Ciddi olan: en popüler "Skuld" bir kimlik hırsızı

GitHub'da `skuld` aramasının ilk sırası:

| Depo | ★ | Ne |
|---|---:|---|
| **`hackirby/skuld`** | **473** | **"Next-Gen Stealer written in Go. Stealing from Discord, Chromium-Based & Firefox-Based Browsers, Crypto Wallets and more, from every user on every disk."** Konular: `malware`, `stealer`, `token-grabber`, `passwords`, `crypto-stealer`, `cookies-grabber` |
| `Factual/skuld` | 304 | Distributed task tracking system (aktif) |
| `DEEP-IMPACT-AG/skuld` | 16 | — |

Bu, herhangi bir isim benzerliği değil. Skuld'un yapacağı işi düşünün:

- kullanıcıdan **shell çalıştırma** izni ister,
- **tüm dosya sistemine** okuma/yazma erişimi ister,
- **OAuth token'larını işletim sistemi keychain'ine** yazar,
- kaynak kodu okuyup dışarıya model API'sine gönderir.

Yani tehdit profili, o malware'in yaptığı şeyle **birebir örtüşüyor**. Bir güvenlik ekibi ya da kurumsal engelleme listesi için ikisi ayırt edilemez. "skuld kur, shell erişimi ver, token'ını sakla" cümlesi, arama sonucunda ilk sırada token hırsızı çıkan bir isimle söylenemez.

Ek olarak:
- Kurumsal proxy/EDR ürünleri isim tabanlı itibar listeleri tutar; `skuld` adı bu listelerde zaten kirlenmiş olabilir.
- `hackirby/skuld` "PoC, for educational purposes only" diyor ama konu etiketleri ve 473★ ile fiilen dağıtılan bir araç.

## 3. Seçenekler

| Seçenek | npm | Arama/marka riski | Değerlendirme |
|---|---|---|---|
| **A.** Çıplak `skuld` | ✗ alınmış | **yüksek** — malware ilk sırada | Elenmeli |
| **B.** Paket `natureco-skuld`, binary `skuld` | ✓ boş | **yüksek** — kullanıcı yine `skuld` arar | Sorunu çözmez, sadece paket adını kurtarır |
| **C.** Paket `natureco-skuld`, binary `ncskuld`/`nskuld` | ✓ boş | orta | Çirkin ama güvenli |
| **D.** Norn temasını koru, farklı sözcük seç | — | düşük | Ekosistem bütünlüğü korunur |

**Önerim: D**, gerekirse C'ye düş.

Urðr ve Verðandi zaten Norn. Üçüncüsü için Skuld'un İngilizce/Eski İskandinav yazımı `Skuld` yerine **`Skulð`** kullanmak, ekosistemin `ð` geleneğini (Urðr, Verðandi) sürdürür ve arama/paket alanında çıplak `skuld` ile karışmaz. Ancak `ð` karakteri CLI komutu olarak yazılamaz — bu oturumda `C:\Projects\Verðandi` klasör adının yol işlemede sorun çıkarmadığını doğruladık, ama bir **kabuk komutu** olarak `ð` kullanıcıya yazdırılamaz.

Bu yüzden somut öneri:

- **Ürün adı:** NatureCo Skuld (marka olarak korunur)
- **npm paketi:** `natureco-skuld`
- **CLI komutu:** `nskuld` (kısa, çakışmasız) — alternatif `ncode`
- **GitHub:** `natureco-official/natureco-skuld`

## 4. Doğrulanmamış olanlar

- **Ticari marka araştırması yapılmadı.** WIPO/EUIPO/USPTO sorgusu bu kontrole dahil değildi; "Skuld" adı denizcilik sigortasında kullanılan tescilli bir marka (Assuranceforeningen Skuld) olarak biliniyor. Ürün adı kesinleşmeden önce hukuki kontrol gerekir.
- Alan adı (skuld.dev, skuld.sh vb.) sorgulanmadı.
- Homebrew/Scoop/winget formül adı çakışması sorgulanmadı.

## Karar gerekiyor

Bu, kod yazmadan önce kapatılması gereken bir karardır: repo adı, paket adı, binary adı, config dizini ve update channel'ın hepsi buna bağlı ve sonradan değiştirmek migration maliyeti doğurur.
