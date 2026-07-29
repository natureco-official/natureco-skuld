'use strict';
/**
 * execution-gateway'e CommonJS tarafından erişim.
 *
 * Kapı ESM + TypeScript, fork ise CommonJS. Köprü tek yerde duruyor ki her
 * araç kendi `import()` çağrısını yazmasın; 26 çağrı noktasını tek tek
 * geçirirken hepsinin aynı kapıyı kullandığından emin olmanın yolu bu.
 *
 * ── Onay hakkında önemli not ──────────────────────────────────────────────
 *
 * Fork'un kendi politika katmanı var (`utils/approvals`: allowlist, deny
 * policy, tehlikeli komut kontrolü). Kapının da kendi onayı var. İkisini üst
 * üste çalıştırmak kullanıcıya AYNI komut için iki soru sorardı; ikinci
 * soruyu gören insan ilkini okumaz.
 *
 * Bu yüzden iş bölümü şöyle:
 *
 *   fork'un approvals katmanı  →  KARAR verir (çalışsın mı, çalışmasın mı)
 *   kapı                       →  KARARI UYGULAR ve çevresini korur:
 *                                 workspace sınırı, symlink kaçış kontrolü,
 *                                 sır maskeleme, çıktı sınırı, zaman aşımı
 *
 * Yani kapı burada onay makamı değil, infaz noktası. Karar zaten verilmiş
 * olarak geliyor ve `kararVerildi` ile aktarılıyor. Kapının kendi onay
 * mekanizması, henüz bir politika katmanı olmayan çağrı noktaları için
 * duruyor.
 */

const path = require('path');

let kapiSozu = null;

/** ESM modülünü bir kez yükler. */
function modul() {
  if (!kapiSozu) {
    const url = require('url').pathToFileURL(
      path.join(__dirname, '..', '..', 'packages', 'execution-gateway', 'dist', 'index.js'),
    ).href;
    kapiSozu = import(url);
  }
  return kapiSozu;
}

/**
 * Kararı zaten verilmiş bir çalıştırma için kapı örneği üretir.
 *
 * @param {object} opt
 * @param {string} [opt.workspace] varsayılan: process.cwd()
 * @param {boolean} [opt.kararVerildi] true ise kapı onay sormaz (karar
 *   yukarıdaki politika katmanında alınmıştır)
 * @param {number} [opt.zamanAsimiMs]
 * @param {number} [opt.ciktiSiniri]
 */
async function kapiAc(opt = {}) {
  const { ExecutionGateway } = await modul();
  return new ExecutionGateway({
    workspace: opt.workspace || process.cwd(),
    // `kararVerildi` yoksa varsayılan REDDETMEK. Sessizce izin vermek,
    // bir çağrı noktasını bağlarken onayı bağlamayı unutmayı görünmez kılar.
    onay: opt.kararVerildi ? async () => 'izin' : async () => 'ret',
    ...(opt.zamanAsimiMs ? { zamanAsimiMs: opt.zamanAsimiMs } : {}),
    ...(opt.ciktiSiniri ? { enFazlaCiktiKarakteri: opt.ciktiSiniri } : {}),
  });
}

/** Kapının hata sınıflarına CJS tarafından erişim. */
async function hataSiniflari() {
  const m = await modul();
  return m;
}

/**
 * Ağ erişimi için onay alır. Onaysızsa fırlatır.
 *
 * Araçlar kendi `fetch`'lerini yapmaya devam eder; kapıya alınan şey istek
 * değil KARARDIR — nereye gidiliyor ve kullanıcı gördü mü.
 */
async function agOnayi({ url, yontem, amac, workspace, kararVerildi = false }) {
  const kapi = await kapiAc({ workspace, kararVerildi });
  return await kapi.agOnayla({ url, yontem, amac });
}

module.exports = { kapiAc, hataSiniflari, agOnayi };
