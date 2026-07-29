# Codex denetim brifingi — NatureCo Skuld

**Tarih:** 29 Temmuz 2026
**Denetlenen:** S1'in ilk üç adımı (execution-gateway'e bağlama)

## Ürünün amacı

Claude Code ve Codex'ten **daha yetenekli ve daha az kusurlu** bir terminal
kodlama ajanı. Bu, denetimin ölçütünü de belirliyor: "çalışıyor mu" yetmez,
"bu iki araçtan daha iyi mi" sorulmalı.

## Nereden geldi

`natureco-cli` v5.71.2 (`40b4913`) fork edildi, yeniden markalandı. Fork
noktasında 1127 test geçiyordu ve hâlâ geçiyor. Üstüne dört paket eklendi:
`shared`, `execution-gateway`, `memory` (Urðr), `quality-gate` (CodeDNA).

## Denetlenecek iddia

> Süreç başlatmanın **tek yeri** `execution-gateway` olacak.

Bugün bu **doğru değil** ve bunu saklamıyoruz: `src/` altında hâlâ 58 dosya
`child_process` import ediyor. S1'in işi bunları tek tek geçirmek.

Şimdiye kadar geçirilenler:

| Dosya | Kazandığı | Korunanı |
|---|---|---|
| `src/tools/bash.js` | workspace sınırı, sır maskeleme, çıktı sınırı, zaman aşımı | mevcut approvals katmanı (allowlist/deny/tehlikeli komut) |
| `src/tools/shell_command.js` | aynısı + varsayılan cwd `os.homedir()` → `process.cwd()` | aynı approvals katmanı |
| `src/tools/git.js` | aynısı | `execFile`+`shell:false`, alt komut beyaz listesi, remote yazma yasağı |

## Denetim soruları

Aşağıdakileri **kodu okuyarak** doğrula. Emin olamadığın yerde "emin değilim"
yaz; tahmin etme.

1. **Kabuk yolu gerçekten her zaman onay istiyor mu?**
   `packages/execution-gateway/src/index.ts` → `kabukCalistir`. İddia:
   `onaysizKomutlar` bu yolda geçersiz. Bir kaçış yolu var mı?

2. **`kararVerildi: true` bir arka kapı mı?**
   `src/utils/gateway.js`. Bu bayrak kapının onayını atlıyor; gerekçe, kararın
   fork'un approvals katmanında zaten verilmiş olması. Bu üç dosyada karar
   gerçekten önce alınıyor mu, yoksa atlanabildiği bir yol var mı?

3. **`yoluDogrula` symlink kaçışını gerçekten kapatıyor mu?**
   `realpath` sonrası karşılaştırma yapılıyor. Kaçırdığı bir durum var mı
   (junction, UNC yolu, büyük/küçük harf duyarsız dosya sistemi)?

4. **Sır maskeleme yeterli mi?**
   `packages/shared/src/index.ts` → `SIR_DESENLERI`. Hangi yaygın kimlik
   bilgisi biçimi kaçıyor?

5. **`git.js` beyaz listesi aşılabilir mi?**
   `tokenizeArgs` ile bölünen argümanlar `git` alt komutuna gidiyor. Beyaz
   listedeki bir alt komutla yazma yapılabilir mi? (ör. `git tag` ile,
   `git show` ile dosya yazma, `git add` ile workspace dışı)

6. **Async dönüşümü bir yerde bozuldu mu?**
   `bash.js`, `shell_command.js`, `git.js` senkron→async oldu. `await`
   unutulmuş bir çağıran var mı?

## Bilinen ve kabul edilen eksikler

Bunları bulgu olarak yazmana gerek yok, biliyoruz:

- 58 dosya hâlâ kapıdan geçmiyor (S1'in geri kalanı).
- Ağ izin sınıfı (`ag`) tanımlı ama **uygulanmamış**; `web-fetch`, `browser`,
  `http_request` kapısız.
- Sınır lint'i yalnızca `packages/` altını tarıyor.
- Verðandi kapsülü pasif (tasarruf yarı kanıtlandı).
- Kalite kapısı ve Urðr hafızası yazılı ama ajan döngüsüne bağlı değil.

## Denetim kuralı

Bulgularını **doğrulayacağız**. Önceki denetimde şema dosyalarından okuyup
canlı durumu yanlış varsaydığın için bir kısım bulgu yanlış alarm çıkmıştı.
Bu yüzden her bulgu için **dosya:satır** ve **nasıl tetiklendiği** iste.
Tetiklenemeyen bir bulgu, bulgu değildir.
