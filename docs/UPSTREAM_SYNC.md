# UPSTREAM_SYNC — Türev kaydı

## Bu depo bir fork

NatureCo Skuld, **natureco-cli'nin fork'udur**. Dosya dosya taşınmadı; depo
geçmişiyle birlikte klonlandı ve yeniden markalandı.

| | |
|---|---|
| Kaynak | https://github.com/natureco-official/natureco-cli |
| Fork noktası | `40b4913ea66fbef7862600c1033e2a189a8e8126` (v5.71.2) |
| Lisans | MIT — Copyright (c) 2026 NatureCo |
| Fork tarihi | 29 Temmuz 2026 |

Fork noktasındaki test durumu **1127 geçti / 3 atlandı / 123 dosya** ve
yeniden markalama sonrası aynı kaldı. Rakamın aynı kalması kabul kriteriydi.

### Neden fork, neden dosya dosya değil

İlk karar (ADR-0001 Karar 2) "kontrollü çıkarma" idi: modül modül taşı, ürün
sınırı keskin kalsın. Uygulamada ürettiği sonuç şuydu — saatler sonunda 4 araç
ve 35 test, oysa natureco-cli'de 92 çalışan araç ve 1127 geçen test duruyordu.
Üstelik sıfırdan yazılan dosya yazma aracı dosyanın tamamını eziyordu; mevcut
`edit_file.js` cerrahi düzenleme yapıyor ve belirsiz eşleşmeyi reddediyor.

Karar geri alındı. Sınır artık **silerek** çiziliyor: neyin çıkarıldığı
`git log`'da görünür ve doğrulanabilir, neyin hiç eklenmediği görünmez.

### Yeniden markalama (fork sonrası uygulanan)

| Değişiklik | Kapsam |
|---|---|
| `.natureco` → `.nskuld` config dizini | 239 dosyada 457 eşleşme |
| `natureco-cli` → `natureco-skuld` paket adı | package.json, 0.1.0 |
| `natureco` → `nskuld` binary | `bin/nskuld.js`, program adı |

Dizin değiştirme tırnak ya da yol ayıracına sabitlendi; `api.natureco.me` ve
diğer 60 `natureco.me` URL'sine **dokunulmadı**. Körlemesine metin değiştirme
her uç noktayı sessizce kırardı.

> `~/.natureco` kullanıcı verisine **dokunulmaz**. Skuld kendi dizinini kullanır;
> göç ancak açık kullanıcı onayı ve geri alma ile yapılır (ADR-0001).

## Upstream düzeltmelerini taşıma

Otomatik merge yok. natureco-cli'de bir güvenlik düzeltmesi çıktığında:

```bash
git remote add upstream https://github.com/natureco-official/natureco-cli.git
git fetch upstream
git log --oneline 40b4913..upstream/main -- <etkilenen yol>
```

Seçmeli cherry-pick yapılır; alınan her commit aşağıya işlenir.

| Tarih | Upstream commit | Ne | Neden alındı |
|---|---|---|---|

*(henüz yok)*

## Fork dışından gelen dosyalar

Aşağıdaki tablo yalnızca **başka bir kaynaktan** gelen dosyalar içindir.
`npm run kapilar` bunu iki yönlü doğrular: başlıkta olup burada olmayan da,
burada olup başlığı silinmiş olan da hatadır.

Başlık biçimi:

```js
// @provenance <depo> <kaynak-yol> @<sha>
```

| Hedef | Kaynak depo | Kaynak yol | SHA |
|---|---|---|---|

*(henüz yok — `packages/` altındaki dört paket Skuld için yazıldı)*

## Sözleşmeyle bağlanan projeler

Kod kopyalanmıyor; MCP ya da JSON subprocess üzerinden konuşuluyor.

| Proje | Sürüm | SHA | Sözleşme |
|---|---|---|---|
| Urðr | 1.0.1 | `12fd5852a5a313266e7a2bcc60dea3c6a44b3221` | MCP stdio |
| Verðandi | 0.2.0 | `9f490136bf47b872d284569dc3b8106dfea1d827` | MCP stdio — **şu an taşınmadı** |
| CodeDNA | 0.9.7 | `0882685b1d2e12a1c5ffedda11a23caff5c179f7` | JSON subprocess |
| Cupertino Terminal | 0.6.4 | `3d0ee9124c27e2d5ef31acb4ada162ba8358241b` | ADR-0003 (henüz yok) |
