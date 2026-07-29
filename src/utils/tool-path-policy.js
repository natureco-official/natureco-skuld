'use strict';

const path = require('path');
const os = require('os');

const SENSITIVE_READ = [
  /(^|[\\/])\.ssh[\\/]/i, /id_rsa|id_ed25519|id_ecdsa|id_dsa/i,
  /\.pem$|\.ppk$|\.key$/i, /(^|[\\/])\.aws[\\/]/i,
  /gcloud[\\/].*(credential|token)/i, /(^|[\\/])\.npmrc$/i,
  /(^|[\\/])\.git-credentials$/i, /\.natureco[\\/]config\.json$/i,
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

/** Bir yol, bu araç için hassas mı? */
function hassasMi(cozulmus, toolName) {
  const write = toolName === 'write_file' || toolName === 'edit_file' || toolName === 'structural_patch';
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
  const yollar = YOL_ALANLARI.map((ad) => args[ad]).filter(
    (v) => typeof v === 'string' && v.trim(),
  );
  if (yollar.length === 0) return { allowed: true };
  // Herhangi biri hassassa çağrı reddedilir; ilk hassas olanı bildirilir.
  const targetPath = expandPath(
    yollar.find((y) => hassasMi(expandPath(y), toolName)) || yollar[0],
  );
  // Okuma listesi ARTIK beyaz liste değil. Eskiden yalnızca `read_file`
  // denetleniyordu, yani `read_file` `~/.ssh/id_rsa`'da engellenirken
  // `grep_search` aynı içeriği döndürüyordu (doğrulandı). Hangi aracın
  // hassas yolu okuyabileceğini tek tek saymak, sayılmayanı serbest bırakır;
  // varsayılan kapalı olmalı.
  if (hassasMi(targetPath, toolName)) {
    return {
      allowed: false,
      path: targetPath,
      reason: `Hassas dosya yolu güvenlik politikasıyla engellendi: ${targetPath}`,
    };
  }
  return { allowed: true, path: targetPath };
}

module.exports = { assessToolPath, expandPath, SENSITIVE_READ, SENSITIVE_WRITE };
