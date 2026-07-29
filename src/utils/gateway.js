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
 * Ağ hedefini kullanıcıya sorar.
 *
 * Codex denetimi (29.07.2026, tur 2, bulgu 1b) bunu bulmuştu: model onay
 * bayrağı gönderemesin diye `tool-execution-gateway` `agOnayli`yi
 * argümanlardan siliyor — doğrusu bu. Ama `kararVerildi` yoksa köprü sabit
 * "ret" döndüğü için ONAYLAMANIN HİÇBİR YOLU KALMAMIŞTI. Ağ araçları
 * kullanıcı ne yaparsa yapsın reddediyordu.
 *
 * Bir kapının kilitli olması iyidir; anahtarının olmaması kapı değil duvardır.
 * Burası anahtar: kararı modelden değil insandan alır.
 */
async function agOnayiSor(istek) {
  // Etkileşimsiz ortamda (CI, boru hattı, test) soru sorulamaz. Sessizce
  // izin vermek yerine reddetmek gerekir — sorulamayan onay, onay değildir.
  if (!process.stdin.isTTY || process.env.SKULD_AG_ONAYSIZ === '1') return 'ret';

  const chalk = require('chalk');
  const inquirer = require('inquirer');

  console.log('');
  console.log(chalk.yellow('  🌐 Ağ erişimi onayı isteniyor'));
  console.log(chalk.gray('  ─'.repeat(30)));
  console.log(chalk.white('  ') + istek.komut);
  if (istek.gerekce) console.log(chalk.gray('  ') + istek.gerekce);
  console.log(chalk.gray('  ─'.repeat(30)));

  process.stdin.resume();
  const { karar } = await inquirer.prompt([{
    type: 'list',
    name: 'karar',
    message: 'Bu isteğe izin verilsin mi?',
    choices: [
      { value: 'ret', name: 'Hayır' },
      { value: 'izin', name: 'Evet, bir kez' },
    ],
  }]);
  return karar;
}

/**
 * Ağ erişimi için onay alır. Onaysızsa fırlatır.
 *
 * Araçlar kendi `fetch`'lerini yapmaya devam eder; kapıya alınan şey istek
 * değil KARARDIR — nereye gidiliyor ve kullanıcı gördü mü.
 *
 * `govdeBayt` ve `baslikAdlari` onay metnine girer: nereye gidildiği kadar
 * ne gittiği de kararın parçası.
 */
async function agOnayi(istek = {}) {
  // `onay` gerçek bir parametre: kendi onay yüzeyi olan çağıranlar (fork'un
  // approvals katmanı, testler) kendi karar vericisini geçebilir. Varsayılan
  // etkileşimli sorudur.
  //
  // Modelden gelemez: araçlar bu nesneyi alan alan KENDİLERİ kuruyor, model
  // argümanlarını buraya yaymıyorlar. Yine de `onay`
  // `tool-execution-gateway`'in temizlediği bayraklara eklendi — onay
  // makamını seçme yetkisi, onaylanacak şeyi üretenin eline geçemez.
  const { workspace, kararVerildi = false, onay, ...agIstegi } = istek;
  const { ExecutionGateway } = await modul();
  const kapi = new ExecutionGateway({
    workspace: workspace || process.cwd(),
    onay: onay || (kararVerildi ? async () => 'izin' : agOnayiSor),
  });
  // İstek OLDUĞU GİBİ geçiyor, alan alan sayılmıyor.
  //
  // Codex doğrulama turu: `govdeOnizleme`yi araca eklemiştim ama burada
  // listeye yazmayı unutunca köprü alanı sessizce düşürdü — düzeltme onay
  // ekranına hiç ulaşmadı. Kendi testim TS fonksiyonunu doğrudan çağırdığı
  // için köprüyü hiç görmedi; yanlış katmanı ölçmüştüm.
  //
  // Elle tutulan alan listesi, her yeni alanda aynı hatayı davet eder.
  // `workspace` ve `kararVerildi` köprüye ait; gerisi kapının.
  return await kapi.agOnayla(agIstegi);
}

/**
 * Rasgele kod çalıştırma onayı.
 *
 * `code_execution` bir araç değil bir YETENEK: modelin yazdığı kod alt
 * süreçte kısıtsız çalışır, dosya sistemine ve ağa doğrudan erişir. Codex
 * (29.07.2026, tur 2, bulgu 1a) bunun ağ kapısını tamamen anlamsız
 * kıldığını gösterdi — model `globalThis.fetch()` yazınca kapı hiç devreye
 * girmiyordu. Kapının yanında duvar yoksa kapı süs olur.
 *
 * Bu yüzden kabuk gibi ele alınır: onay HER ZAMAN sorulur, beyaz liste
 * uygulanmaz. "Ne yazdığını görmeden çalıştırma" kuralı burada da geçerli,
 * o yüzden kodun kendisi onay ekranında gösterilir.
 */
async function kodOnayiSor({ dil, kod, cwd }) {
  if (!process.stdin.isTTY || process.env.SKULD_AG_ONAYSIZ === '1') return 'ret';

  const chalk = require('chalk');
  const inquirer = require('inquirer');
  const kirpik = kod.length > 1200
    ? kod.slice(0, 1200) + String.fromCharCode(10) + '… (' + (kod.length - 1200) + ' karakter daha)'
    : kod;

  console.log('');
  console.log(chalk.yellow(`  ⚡ Kod çalıştırma onayı — ${dil}`));
  console.log(chalk.gray('  Bu kod kısıtsız çalışır: dosya sistemi ve ağ erişimi vardır.'));
  console.log(chalk.gray(`  Dizin: ${cwd}`));
  console.log(chalk.gray('  ─'.repeat(30)));
  for (const satir of kirpik.split(/\r?\n/)) console.log(chalk.white('  ') + satir);
  console.log(chalk.gray('  ─'.repeat(30)));

  process.stdin.resume();
  const { karar } = await inquirer.prompt([{
    type: 'list',
    name: 'karar',
    message: 'Bu kod çalıştırılsın mı?',
    choices: [
      { value: 'ret', name: 'Hayır' },
      { value: 'izin', name: 'Evet, bir kez' },
    ],
  }]);
  return karar;
}

/**
 * Alt sürece geçecek ortamdan sır benzeri değişkenleri ayıklar.
 *
 * `code_execution` `{ ...process.env }` gönderiyordu; yani modelin yazdığı
 * üç satırlık kod `process.env.GEMINI_API_KEY`'i okuyup basabiliyordu.
 * Onaydan bağımsız ayrı bir kusur: kullanıcı kodu okuyup onaylasa bile
 * ortamın tamamının oraya gitmesi gerekmez.
 */
const SIR_ANAHTARI =
  // Alt çizgiyle ayrılmış sonekler.
  /(_KEY|_TOKEN|_SECRET|_PASSWORD|_PASS|_CREDENTIAL|API_KEY|AUTH|_DSN|_WEBHOOK|_URI|_SALT|_SIGNING|SERVICE_ROLE|SESSION|COOKIE|PRIVATE)$/i;

/**
 * Ayıraçsız yazılan kimlik değişkenleri.
 *
 * Codex tur 3, bulgu 2: `PGPASSWORD` süzgeçten geçiyordu ve doğrulandı.
 * `_PASSWORD$` alt çizgi bekliyor, `PGPASSWORD` ise tek kelime. Aynı biçim
 * `MYSQL_PWD`, `PGPASSFILE`, `REDISCLI_AUTH` gibi standart adlarda da var —
 * yani araçların kendi belgelerinde önerdiği adlar tam olarak süzgecin
 * göremediği adlar.
 *
 * Sonek listesine güvenmenin sınırı bu: sır, onu adlandıran aracın
 * alışkanlığına göre adlanır, bizim desenimize göre değil.
 */
const SIR_PARCASI =
  // `AUTH` ve `_SOCK` doğrulama turunda eklendi: `DOCKER_AUTH_CONFIG` kayıt
  // defteri kimliklerini taşıyor, `SSH_AUTH_SOCK` ise sırrın kendisi değil
  // ama ona ERİŞİM — soketi olan, kullanıcının SSH anahtarlarıyla imza
  // attırabilir. Yetkiyi devretmek, anahtarı vermekle aynı kapıya çıkar.
  /(PASSWORD|PASSWD|PASSFILE|SECRET|TOKEN|APIKEY|CREDENTIAL|PRIVATEKEY|AUTH_CONFIG|AUTH_SOCK|_AUTH$|^AUTH_)/i;

const SIR_ONEKI =
  // `KUBECONFIG` ve akrabaları Codex kapanış turunda eklendi: değer bir yol
  // ama işaret ettiği dosya küme kimlik bilgilerini taşıyor. Sırra giden yolu
  // vermek, sırrı vermektir — `SSH_AUTH_SOCK` ile aynı gerekçe.
  /^(AWS_|GITHUB_TOKEN|OPENAI|ANTHROPIC|GEMINI|GROQ|MINIMAX|FIRECRAWL|SUPABASE|NPM_TOKEN|DATABASE_URL|REDIS_URL|MONGODB_URI|SENTRY_DSN|PG|MYSQL_PWD|REDISCLI_AUTH|KUBECONFIG|DOCKER_CONFIG|GOOGLE_APPLICATION_CREDENTIALS|AZURE_|GH_TOKEN|GITLAB_|VAULT_|CLOUDSDK_|GIT_ASKPASS|SSH_ASKPASS|SUDO_ASKPASS|GIT_SSH_COMMAND|NETRC)/i;

const SIR_ORTASI = /(_KEY|_TOKEN|_SECRET|_WEBHOOK|_DSN|CREDENTIAL)_/i;

function anahtarSirMi(ad) {
  // `PG` öneki geniş: `PGHOST` ve `PGPORT` sır değil, `PGPASSWORD` sır.
  // Önek tek başına yetmiyor, parça kontrolüyle birlikte anlam kazanıyor.
  if (/^PG/i.test(ad)) return SIR_PARCASI.test(ad);
  return SIR_ANAHTARI.test(ad) || SIR_PARCASI.test(ad) || SIR_ONEKI.test(ad) || SIR_ORTASI.test(ad);
}

/**
 * Değerin kendisi sır gibi mi duruyor?
 *
 * Ada bakmak yetmiyor — ölçüldü: `DATABASE_URL`, `SLACK_WEBHOOK` ve
 * `SENTRY_DSN` sonek desenlerinden geçiyordu, üçü de kimlik bilgisi taşıyor.
 * Bir sırrı adından tanımaya çalışmak, onu adlandıran kişinin dikkatine
 * güvenmektir.
 */
function degerSirMi(deger) {
  if (typeof deger !== 'string' || deger.length < 8) return false;
  // Bağlantı dizesinde gömülü kimlik: scheme://kullanici:parola@host
  if (/^[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i.test(deger)) return true;
  // Bilinen anahtar biçimleri (sk-…, ghp_…, AKIA… vb.)
  try {
    const { SECRET_PATTERNS } = require('./secret-scanner');
    for (const { regex } of SECRET_PATTERNS) {
      regex.lastIndex = 0;
      // 40 karakterlik jenerik desen burada da yanlış pozitif üretiyor;
      // ortam değişkeni bir git SHA'sı da olabilir (CI'da sık).
      if (regex.test(deger) && !/^[0-9a-f]{40}$/i.test(deger)) return true;
    }
  } catch { /* tarayıcı yoksa ada dayalı süzme yine çalışır */ }
  return false;
}

/**
 * Alt sürece geçecek ortamdan sır benzeri değişkenleri ayıklar.
 *
 * `code_execution` `{ ...process.env }` gönderiyordu; yani modelin yazdığı
 * üç satırlık kod `process.env.GEMINI_API_KEY`'i okuyup basabiliyordu.
 * Onaydan bağımsız ayrı bir kusur: kullanıcı kodu okuyup onaylasa bile
 * ortamın tamamının oraya gitmesi gerekmez.
 *
 * İki ölçüt: ADI sır gibi duran değişkenler ve DEĞERİ sır gibi duran
 * değişkenler. İkincisi olmadan `DATABASE_URL=postgres://admin:parola@…`
 * geçiyordu.
 */
function ortamiTemizle(ortam) {
  const temiz = {};
  for (const [k, v] of Object.entries(ortam)) {
    if (anahtarSirMi(k)) continue;
    if (degerSirMi(v)) continue;
    temiz[k] = v;
  }
  return temiz;
}

/**
 * Yazma sınırı: hedef workspace içinde mi, değilse onaylandı mı?
 *
 * Codex tur 5 bunu "şu anki en büyük gerçek güvenlik riski" olarak işaret etti
 * ve doğrulandı: `write_file` workspace DIŞINA onaysız yazabiliyordu. Hassas
 * yol listesi bir KARA LİSTEYDİ ve kara listeler sayılmayanı serbest bırakır —
 * Windows Startup dizini, `.bashrc`, uygulama ayar dosyaları hiçbirinde yoktu.
 *
 * Dört tur boyunca kara listeye desen ekledim. Eksik olan desen değil SINIRDI.
 * Kara liste "neyi yasaklayacağını bilmek" ister; sınır "neyin içeride
 * olduğunu bilmek" — ikincisi bilinebilir, birincisi bilinemez.
 *
 * `yoluDogrula` symlink'i `realpath` ile çözüyor ve var olmayan hedefin en
 * yakın var olan atasını buluyor. İkisi de gerekli: henüz yazılmamış dosyanın
 * kendisi çözülemez, ve symlink'li bir dizin sınırı taşıyabilir.
 *
 * @param {string} hedefYol
 * @param {object} [opt]
 * @param {boolean} [opt.onayli] iç çağıranlar için: karar zaten verildi
 * @param {string}  [opt.workspace]
 * @param {string}  [opt.amac] onay ekranında görünür
 * @returns {Promise<{izin: boolean, cozulmus?: string, hata?: string}>}
 */
async function yazmaSiniri(hedefYol, opt = {}) {
  const workspace = opt.workspace || process.cwd();
  let kapi;
  try {
    kapi = await kapiAc({ workspace, kararVerildi: true });
    const cozulmus = await kapi.yoluDogrula(hedefYol);
    return { izin: true, cozulmus };
  } catch (hata) {
    // Kapı yüklenemediyse sınır uygulanamaz; sessizce izin vermek yerine
    // reddetmek gerekir — uygulanamayan sınır, sınır değildir.
    if (!kapi) {
      return { izin: false, hata: `yazma sınırı uygulanamadı: ${hata && hata.message}` };
    }
    // Workspace dışı. Onay zaten verilmişse geç; yoksa kullanıcıya sor.
    const mutlak = path.resolve(workspace, hedefYol);
    if (opt.onayli === true) return { izin: true, cozulmus: mutlak };
    const karar = await yazmaOnayiSor(mutlak, workspace, opt.amac);
    if (karar === 'izin') return { izin: true, cozulmus: mutlak };
    return {
      izin: false,
      hata: `workspace dışına yazma onaylanmadı: ${mutlak} (workspace: ${workspace})`,
    };
  }
}

/** Workspace dışı yazma için kullanıcıya sorar. */
async function yazmaOnayiSor(hedef, workspace, amac) {
  if (!process.stdin.isTTY || process.env.SKULD_AG_ONAYSIZ === '1') return 'ret';

  const chalk = require('chalk');
  const inquirer = require('inquirer');

  console.log('');
  console.log(chalk.yellow('  📝 Workspace DIŞINA yazma onayı isteniyor'));
  console.log(chalk.gray(`  Workspace: ${workspace}`));
  console.log(chalk.gray('  ─'.repeat(30)));
  console.log(chalk.white('  ') + hedef);
  if (amac) console.log(chalk.gray('  ') + amac);
  console.log(chalk.gray('  ─'.repeat(30)));

  process.stdin.resume();
  const { karar } = await inquirer.prompt([{
    type: 'list',
    name: 'karar',
    message: 'Bu dosya yazılsın mı?',
    choices: [
      { value: 'ret', name: 'Hayır' },
      { value: 'izin', name: 'Evet, bir kez' },
    ],
  }]);
  return karar;
}

module.exports = {
  kapiAc, hataSiniflari, agOnayi, agOnayiSor, kodOnayiSor, ortamiTemizle,
  degerSirMi, yazmaSiniri, yazmaOnayiSor,
};
