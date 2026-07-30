'use strict';
/**
 * Eski `NATURECO_*` ortam değişkenlerini `SKULD_*` karşılıklarına köprüler.
 *
 * natureco-cli bağı koparılırken 74 ortam değişkeni adı `NATURECO_` →
 * `SKULD_` olarak çevrildi. Bu doğru: ürünün kendi adı olmalı. Ama kullanıcının
 * `.bashrc`'sinde, CI gizli değişkenlerinde ve `docker run -e` satırlarında
 * eski adlar duruyor ve bir yeniden adlandırma yüzünden hepsinin bir gecede
 * çalışmayı bırakması, yeniden adlandırmanın kendisinden büyük bir zarar.
 *
 * Kural: **yeni ad kazanır.** İkisi de tanımlıysa `SKULD_*` kullanılır ve eski
 * ad yok sayılır — sessizce değil, `SKULD_UYUM_SESSIZ=1` verilmedikçe uyarıyla.
 * Aksi hâlde kullanıcı iki değişkeni farklı değerlere ayarlayıp hangisinin
 * geçtiğini bilemez.
 *
 * Bu köprü geçici. Kaldırma koşulu: bir majör sürüm ve CHANGELOG'da duyuru.
 * Kaldırma tarihi yazılmazsa "geçici" kalıcı olur.
 */

const ESKI_ONEK = 'NATURECO_';
const YENI_ONEK = 'SKULD_';

/**
 * @param {NodeJS.ProcessEnv} [ortam]
 * @returns {{ koprulenen: string[], catisan: string[] }}
 */
function eskiAdlariKoprule(ortam = process.env) {
  const koprulenen = [];
  const catisan = [];

  for (const eskiAd of Object.keys(ortam)) {
    if (!eskiAd.startsWith(ESKI_ONEK)) continue;
    const yeniAd = YENI_ONEK + eskiAd.slice(ESKI_ONEK.length);

    if (ortam[yeniAd] !== undefined) {
      // İkisi de var: yeni kazanır. Bu bir tercih değil zorunluluk —
      // aksi hâlde eski ad yeniyi ezer ve kullanıcı yeni adı ayarlayarak
      // hiçbir şeyi değiştiremez.
      if (ortam[yeniAd] !== ortam[eskiAd]) catisan.push(`${eskiAd} → ${yeniAd}`);
      continue;
    }
    ortam[yeniAd] = ortam[eskiAd];
    koprulenen.push(`${eskiAd} → ${yeniAd}`);
  }

  if (catisan.length > 0 && process.env.SKULD_UYUM_SESSIZ !== '1') {
    process.stderr.write(
      `[skuld] ${catisan.length} ortam değişkeni hem eski hem yeni adla tanımlı ve `
      + `DEĞERLERİ FARKLI; yeni ad kullanılıyor: ${catisan.join(', ')}\n`,
    );
  }

  return { koprulenen, catisan };
}

module.exports = { eskiAdlariKoprule, ESKI_ONEK, YENI_ONEK };
