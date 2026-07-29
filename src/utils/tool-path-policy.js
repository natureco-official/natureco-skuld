'use strict';

const path = require('path');
const os = require('os');

const SENSITIVE_READ = [
  /(^|[\\/])\.ssh[\\/]/i, /id_rsa|id_ed25519|id_ecdsa|id_dsa/i,
  /\.pem$|\.ppk$|\.key$/i, /(^|[\\/])\.aws[\\/]/i,
  /gcloud[\\/].*(credential|token)/i, /(^|[\\/])\.npmrc$/i,
  /(^|[\\/])\.git-credentials$/i, /\.natureco[\\/]config\.json$/i,
  /(^|[\\/])\.netrc$/i,
];
const SENSITIVE_WRITE = [
  ...SENSITIVE_READ,
  /(^|[\\/])authorized_keys$/i, /System32[\\/]drivers[\\/]etc/i,
  /\.aws[\\/]credentials/i,
  /^[/\\](etc|usr|bin|sbin|boot|sys)[\\/]/i,
  /(^|[\\/])etc[\\/](passwd|shadow|sudoers|hosts|crontab|ssh)/i,
];

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
  const rawPath = args.path || args.filePath || args.file_path
    || args.cwd || args.directory || args.dir || args.yol
    || args.basePath || args.base_path || args.rootPath || args.root;
  if (!rawPath) return { allowed: true };
  const targetPath = expandPath(rawPath);
  const write = toolName === 'write_file' || toolName === 'edit_file' || toolName === 'structural_patch';
  // Okuma listesi ARTIK beyaz liste değil. Eskiden yalnızca `read_file`
  // denetleniyordu, yani `read_file` `~/.ssh/id_rsa`'da engellenirken
  // `grep_search` aynı içeriği döndürüyordu (doğrulandı). Hangi aracın
  // hassas yolu okuyabileceğini tek tek saymak, sayılmayanı serbest bırakır;
  // varsayılan kapalı olmalı.
  const patterns = write ? SENSITIVE_WRITE : SENSITIVE_READ;
  // Desenlerin çoğu `.ssh/` gibi ayıraçla bitiyor, çünkü dosya yolları için
  // yazıldılar. Argüman DİZİNİN kendisi olduğunda (`.../.ssh`) sondaki ayıraç
  // yok ve hiçbiri eşleşmiyordu — yani tam olarak korunmak istenen dizini
  // vermek denetimi atlatıyordu.
  const adaylar = [targetPath, targetPath + path.sep];
  if (patterns.some(pattern => adaylar.some(aday => pattern.test(aday)))) {
    return {
      allowed: false,
      path: targetPath,
      reason: `Hassas dosya yolu güvenlik politikasıyla engellendi: ${targetPath}`,
    };
  }
  return { allowed: true, path: targetPath };
}

module.exports = { assessToolPath, expandPath, SENSITIVE_READ, SENSITIVE_WRITE };
