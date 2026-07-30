'use strict';

const path = require('path');
const os = require('os');

const SENSITIVE_READ = [
  /(^|[\\/])\.ssh[\\/]/i, /id_rsa|id_ed25519|id_ecdsa|id_dsa/i,
  /\.pem$|\.ppk$|\.key$/i, /(^|[\\/])\.aws[\\/]/i,
  /gcloud[\\/].*(credential|token)/i, /(^|[\\/])\.npmrc$/i,
  /(^|[\\/])\.git-credentials$/i, /\.nskuld[\\/]config\.json$/i,
  /(^|[\\/])\.netrc$/i,
  // `.env` — en yaygın sır dosyası ve listede yoktu (Codex tur 3, bulgu 5).
  // `.env.example`, `.env.sample`, `.env.template` KASTEN dışarıda: onlar
  // yer tutucu içerir, paylaşılmak için vardır ve ajanın onları okuyabilmesi
  // gerekir — projeyi kurmanın normal yolu bu.
  // `(\.[a-z0-9-]+)*` — çok parçalı sonek. Tek parça beklerken
  // `.env.production.local` eşleşmiyordu (Codex doğrulama turu) ve bu, çerçeve
  // araçlarının ürettiği en yaygın adlardan biri.
  /(^|[\\/])\.env(?!\.(example|sample|template|dist|defaults?)\b)(\.[a-z0-9-]+)*$/i,
];
const SENSITIVE_WRITE = [
  ...SENSITIVE_READ,
  /(^|[\\/])authorized_keys$/i, /System32[\\/]drivers[\\/]etc/i,
  /\.aws[\\/]credentials/i,
  /^[/\\](etc|usr|bin|sbin|boot|sys)[\\/]/i,
  /(^|[\\/])etc[\\/](passwd|shadow|sudoers|hosts|crontab|ssh)/i,
];

/**
 * Denetlenecek argüman adları.
 *
 * Fork boyunca tutarlı değiller: `path`, `basePath`, `cwd`, `outputPath`,
 * `audioPath`… Eksik bir ad, o aracın denetimden TAMAMEN muaf olması demek.
 */
const YOL_ALANLARI = [
  'path', 'filePath', 'file_path', 'cwd', 'directory', 'dir', 'yol',
  'basePath', 'base_path', 'rootPath', 'root',
  'file', 'outputPath', 'output_path', 'output',
  'dest', 'destination', 'target',
  'imagePath', 'image_path', 'audioPath', 'audio_path',
  'videoPath', 'video_path', 'savePath', 'save_path',
  'input', 'inputPath', 'input_path', 'source', 'src',
];

/**
 * ÇIKTI anlamı taşıyan alan adları — bunlara yazılır.
 *
 * Codex kapanış turu 4: yazma/okuma sınıflandırması araç ADIYLA yapılıyordu
 * (`write_file`, `edit_file`, `structural_patch`). Bu yüzden
 * `macos_screenshot({ outputPath: "/etc/hosts" })` OKUMA desenleriyle
 * değerlendirilip izin alıyor, sonra araç o yola yazıyordu.
 *
 * Bir yolun yazma yolu olduğunu aracın adı değil, ARGÜMANIN adı söyler.
 */
const CIKTI_ALANLARI = new Set([
  'outputPath', 'output_path', 'output', 'dest', 'destination', 'target',
  'savePath', 'save_path', 'file', 'imagePath', 'image_path',
  'audioPath', 'audio_path', 'videoPath', 'video_path',
]);

/** Bir yol, bu araç için hassas mı? */
function hassasMi(cozulmus, toolName, alanAdi) {
  const yazanArac = toolName === 'write_file' || toolName === 'edit_file' || toolName === 'structural_patch';
  const write = yazanArac || (alanAdi != null && CIKTI_ALANLARI.has(alanAdi));
  const patterns = write ? SENSITIVE_WRITE : SENSITIVE_READ;
  // Desenlerin çoğu `.ssh/` gibi ayıraçla bitiyor, çünkü dosya yolları için
  // yazıldılar. Argüman DİZİNİN kendisi olduğunda (`.../.ssh`) sondaki ayıraç
  // yok ve hiçbiri eşleşmiyordu — yani tam olarak korunmak istenen dizini
  // vermek denetimi atlatıyordu.
  const adaylar = [cozulmus, cozulmus + path.sep];
  return patterns.some((desen) => adaylar.some((aday) => desen.test(aday)));
}

function expandPath(value) {
  if (typeof value !== 'string' || !value.trim()) return value;
  const trimmed = value.trim();
  if (trimmed === '~') return os.homedir();
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return path.resolve(trimmed);
}

function assessToolPath(toolName, args = {}) {
  // Dizin argümanları da sayılır. `grep_search` `path` ile bir DİZİN alıyor
  // ve içindeki dosyaların satırlarını döndürüyor; yalnızca dosya
  // argümanlarına bakmak bu yolu görmüyordu.
  // Anahtar adları fork boyunca tutarlı değil: `grep_search` `path`,
  // `file_search` `basePath`, kabuk araçları `cwd` kullanıyor. Eksik bir ad,
  // o aracın denetimden tamamen muaf olması demek — `basePath` tam olarak
  // böyle kaçmıştı.
  // `file` ve `outputPath` Codex tur 3, bulgu 5 ile eklendi ve doğrulandı:
  // `computer_use({action:"screenshot", file:"~/.ssh/authorized_keys"})` ve
  // `macos_screenshot({outputPath:"…"})` politikayı tamamen atlıyordu — üstelik
  // bunlar YAZMA yolları, yani hassas bir dosyanın üzerine ekran görüntüsü
  // yazılabiliyordu.
  // TÜM yol alanları denetlenir, ilki değil.
  //
  // Codex kapanış turu: `||` zinciri ilk DOLU alanda duruyordu, yani
  // `speech_to_text({ path: "README.md", audioPath: "~/.ssh/id_rsa" })`
  // masum `path` üzerinden geçiyor, araç sonra hassas `audioPath`ı okuyup
  // gönderiyordu. Bir alan denetlenip diğerinin serbest kalması, denetimi
  // saldırganın alan seçimine bırakmak demek.
  const yollar = YOL_ALANLARI
    .map((ad) => ({ ad, deger: args[ad] }))
    .filter(({ deger }) => typeof deger === 'string' && deger.trim());
  if (yollar.length === 0) return { allowed: true };
  // Herhangi biri hassassa çağrı reddedilir; ilk hassas olanı bildirilir.
  // Alan ADI da geçiyor: `outputPath` yazma, `path` okuma anlamına geliyor ve
  // yazma listesi daha geniş.
  const hassas = yollar.find(({ ad, deger }) => hassasMi(expandPath(deger), toolName, ad));
  const secilen = hassas || yollar[0];
  const targetPath = expandPath(secilen.deger);
  // Okuma listesi ARTIK beyaz liste değil. Eskiden yalnızca `read_file`
  // denetleniyordu, yani `read_file` `~/.ssh/id_rsa`'da engellenirken
  // `grep_search` aynı içeriği döndürüyordu (doğrulandı). Hangi aracın
  // hassas yolu okuyabileceğini tek tek saymak, sayılmayanı serbest bırakır;
  // varsayılan kapalı olmalı.
  if (hassasMi(targetPath, toolName, secilen.ad)) {
    return {
      allowed: false,
      path: targetPath,
      reason: `Hassas dosya yolu güvenlik politikasıyla engellendi: ${targetPath}`,
    };
  }
  return { allowed: true, path: targetPath };
}

module.exports = { assessToolPath, expandPath, SENSITIVE_READ, SENSITIVE_WRITE };
