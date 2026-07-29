# Yayın adımları — kullanıcının çalıştıracağı komutlar

Bu adımlar **dışa dönük ve geri alınması zor** olduğu için otomatik
yapılmadı. Hazırlık tamam: paket açılıp çalıştığı doğrulandı
(`npm run yayin` → `scripts/yayin-onkontrol.mjs`).

Sırayı bozmayın: **depo → CI yeşil → yayın**. Depo silinebilir, npm yayını
pratikte silinemez.

---

## 1. Depoyu oluştur ve push et

`git remote origin` zaten `natureco-skuld`'a çevrildi (önce fork kaynağını
gösteriyordu — bir `git push` Skuld'un commitlerini `natureco-cli` deposuna
yazardı).

**Private (önerilen ilk adım):**

```bash
cd C:/Projects/natureco-skuld
gh repo create natureco-official/natureco-skuld --private --source=. --remote=origin --push
```

**Public istiyorsanız** `--private` yerine `--public`. Bunu bilerek seçin:
396 commit ve bütün commit mesajları kalıcı olarak görünür olur — Codex
denetim bulguları ve kapatılan güvenlik kusurlarının anlatımı dahil.

`gh repo create` "already exists" derse depo vardır; yalnızca push edin:

```bash
git push -u origin main
```

## 2. CI'ın gerçekten koştuğunu gör

CI **hiç koşmadı.** Yerelde her kapı yeşil ama yalnızca Windows'ta; Linux ve
macOS'ta görülmedi. Workflow üç işletim sisteminde koşuyor ve şunları
çalıştırıyor: lint, typecheck+build, 1200 test, 42 paket testi, sınır/provenans/
yardım kapıları, yetenek denetimi, mutasyon denemesi, smoke, `npm audit`,
`npm pack`.

```bash
gh run list --limit 3
gh run watch          # koşan varsa canlı izler
```

Kırmızı çıkarsa **yayınlamayın**; hangi işletim sisteminde ne kırıldığını
paylaşın, düzeltirim.

## 3. Yayın (yalnızca CI yeşilse)

```bash
npm run yayin         # paketi açıp çalıştığını doğrular
npm publish --access public
```

`prepublishOnly` zaten şunları zorunlu kılıyor: typecheck+build, kapılar,
yetenek denetimi, yayın ön kontrolü. Yani ön kontrol atlanamaz.

**Yayın geri alınamaz.** npm `unpublish` yalnızca 72 saat içinde ve
koşullarla çalışır; sürüm numarası kalıcı olarak tükenir.

---

## Yayından önce bilinmesi gerekenler

**İki ciddi kusur yayın hazırlığında bulundu ve düzeltildi.** İkisi de "depoda
çalışıyor, pakette çalışmıyor" sınıfındaydı ve 1200 test hiçbirini göremezdi:

1. `packages/` tarball'a hiç girmiyordu → yayınlanan CLI kapıyı açamaz ve
   **hiçbir dosya yazamazdı.**
2. Paketlenen `dist` kendi kendine yeterli değildi (`@skuld/shared` çıplak
   import'u yalnızca workspace symlink'iyle çözülüyor).

Bu yüzden `npm run yayin` var ve `prepublishOnly` içinde koşuyor: `files`
listesine bakmak yetmez, paketi açıp içinden çalıştırmak gerekir.

**Hâlâ pakette olan devralınan belgeler:** `DEPLOY_v2.0.0.md`, `AUDIT.md`,
`SECURITY_AUDIT_SUMMARY.md`. Skuld'u değil `natureco-cli`'yi anlatıyorlar.
Yayını engellemiyor ama kullanıcıya başka bir ürünün sürüm notunu göndermek,
yardımın var olmayan komut tanıtmasıyla aynı sınıf hata. Silmek isterseniz
`package.json` → `files` listesinden çıkarmak yeterli.

**Sır taraması:** ağaç tarandı, 157 kritik/yüksek bulgunun **hepsi yanlış
pozitif** — `gsk_xxxx` gibi yer tutucular ve AWS desenine uyan sıradan 40
karakterlik kelimeler. Canlı kimlik bilgisi yok.
