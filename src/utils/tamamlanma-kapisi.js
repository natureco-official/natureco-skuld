'use strict';
/**
 * Tamamlanma kapısı — "bitti" demek için kanıt gerekir.
 *
 * Codex tur 5, ürün hedefi açısından en kritik eksiği bu diye işaretledi ve
 * doğrulandı: varsayılan kodlama yolu (`code_v5`) model araç çağırmayı
 * bıraktığı anda BAŞARIYLA tamamlanıyor. Model dosyayı değiştirip "yaptım"
 * diyebiliyor; test, lint ya da build çalıştırmak zorunlu değil.
 *
 * `agentic-runner` içindeki doğrulama sezgiseli yalnızca hafıza yazmayı
 * koruyordu — varsayılan native yolu korumuyordu. Yani kanıt kuralı vardı ama
 * kullanıcının fiilen kullandığı yolda yoktu.
 *
 * Bu modülün var olma sebebi: kapı TEK olmalı ve her yürütme yüzeyi aynı
 * kapıdan geçmeli. `code_v5` içine gömmek onu bir yüzeye bağlardı.
 *
 * ── Ne yapar ──────────────────────────────────────────────────────────────
 *
 *   1. Dosya değişmediyse kapı yoktur. Salt okuma görevleri bedel ödemez.
 *   2. Değiştiyse projeye uygun doğrulama komutu seçilir (test > lint > build).
 *   3. Komut çalıştırılır. Geçerse tamamlandı, geçmezse çıktı ONARIM için
 *      geri verilir.
 *   4. Komut bulunamazsa kapı "kanıt yok" der ve bunu SAKLAMAZ — sessizce
 *      başarılı saymak, kapının olmamasıyla aynı şey.
 *
 * ── Ne yapmaz ─────────────────────────────────────────────────────────────
 *
 * Komutun göreve İLGİLİ olduğunu kanıtlamaz. `npm test` geçtiyse depo
 * yeşildir; istenen davranışın gerçekten eklendiğini göstermez. Bunu iddia
 * etmemek önemli: ölçtüğünden fazlasını söyleyen bir kapı, yanlış güven verir.
 */

const path = require('path');

/** Doğrulama sayılmayan komutlar — hiçbir şey kanıtlamazlar. */
const KANIT_DEGIL = /^\s*(echo|printf|true|:|ls|dir|pwd|cd|cat|type|whoami|date|sleep|clear|which|where|env|export|git\s+(status|log|diff|branch))\b/i;
const SORGU_ARGUMANI = /(^|\s)(--?version|-v|--?help|-h|--dry-run|--list|-V)(\s|$)/i;
const SORGU_ALTKOMUTU = /^\s*\S+\s+(version|--?v|help|info|list|ls)\s*$/i;

/** Bir komut gerçekten doğrulama yapıyor mu? */
function kanitSayilir(komut) {
  if (!komut || typeof komut !== 'string' || !komut.trim()) return false;
  if (KANIT_DEGIL.test(komut)) return false;
  if (SORGU_ARGUMANI.test(komut) || SORGU_ALTKOMUTU.test(komut)) return false;
  return true;
}

/**
 * Projeye uygun doğrulama komutlarını sırayla döner.
 *
 * Sıra kasıtlı: test davranışı kanıtlar, lint yalnızca biçimi, build yalnızca
 * derlenebilirliği. Zayıf kanıtı güçlü kanıt gibi sunmamak için hangisinin
 * kullanıldığı sonuçta bildiriliyor.
 */
function dogrulamaKomutlari(projeIndeksi) {
  const komutlar = [];
  const betikler = (projeIndeksi && projeIndeksi.packageJson && projeIndeksi.packageJson.scripts) || {};

  if (betikler.test) komutlar.push({ komut: 'npm test', tur: 'test', guc: 'davranış' });
  else {
    const tur = projeIndeksi && projeIndeksi.type;
    if (tur === 'python') komutlar.push({ komut: 'python -m pytest', tur: 'test', guc: 'davranış' });
    else if (tur === 'rust') komutlar.push({ komut: 'cargo test', tur: 'test', guc: 'davranış' });
    else if (tur === 'go') komutlar.push({ komut: 'go test ./...', tur: 'test', guc: 'davranış' });
    else if (tur === 'java') {
      const dosyalar = (projeIndeksi && projeIndeksi.files) || [];
      komutlar.push({ komut: dosyalar.includes('pom.xml') ? 'mvn test' : 'gradle test', tur: 'test', guc: 'davranış' });
    }
  }

  if (betikler.typecheck) komutlar.push({ komut: 'npm run typecheck', tur: 'typecheck', guc: 'tip' });
  if (betikler.build) komutlar.push({ komut: 'npm run build', tur: 'build', guc: 'derleme' });
  if (betikler.lint) komutlar.push({ komut: 'npm run lint', tur: 'lint', guc: 'biçim' });

  return komutlar.filter((k) => kanitSayilir(k.komut));
}

/**
 * Kanıt toplar ve tamamlanma kararı verir.
 *
 * @param {object} opt
 * @param {string[]} opt.degisenDosyalar
 * @param {object}   [opt.projeIndeksi]
 * @param {(komut: string) => Promise<{ok: boolean, cikti?: string}>} opt.calistir
 * @param {string[]} [opt.zatenCalisanlar] bu turda modelin kendi çalıştırdığı
 *   komutlar; kanıt sayılanı varsa yeniden koşmaya gerek yok
 * @param {number}   [opt.enFazlaKomut] varsayılan 1 — en güçlü kanıt yeter
 * @returns {Promise<{tamam: boolean, kanit: object|null, gerekce: string, onarimIcin?: string}>}
 */
async function kanitTopla(opt) {
  const degisen = opt.degisenDosyalar || [];

  // 1. Dosya değişmediyse kanıt aramanın anlamı yok.
  if (degisen.length === 0) {
    return { tamam: true, kanit: null, gerekce: 'dosya değişmedi — doğrulama gerekmiyor' };
  }

  // 2. Model bu turda zaten bir doğrulama komutu çalıştırdıysa onu say.
  //    Aynı testi ikinci kez koşmak yavaşlatır ve hiçbir şey eklemez.
  const zaten = (opt.zatenCalisanlar || []).find((k) => kanitSayilir(k));
  if (zaten) {
    return {
      tamam: true,
      kanit: { komut: zaten, tur: 'model', guc: 'model tarafından koşuldu' },
      gerekce: `\`${zaten}\` bu turda çalıştı ve başarılı`,
    };
  }

  const adaylar = dogrulamaKomutlari(opt.projeIndeksi);
  if (adaylar.length === 0) {
    // KANIT YOK ve bu saklanmıyor. Sessizce "tamam" demek, kapının hiç
    // olmamasıyla aynı şey — kullanıcı neye güvendiğini bilmeli.
    return {
      tamam: false,
      kanit: null,
      gerekce: `${degisen.length} dosya değişti ama bu projede doğrulama komutu tespit edilemedi `
        + '(test/typecheck/build/lint yok) — değişiklik DOĞRULANMADI',
    };
  }

  const enFazla = opt.enFazlaKomut != null ? opt.enFazlaKomut : 1;
  let sonHata = null;
  for (const aday of adaylar.slice(0, enFazla)) {
    const sonuc = await opt.calistir(aday.komut);
    if (sonuc && sonuc.ok) {
      return {
        tamam: true,
        kanit: { ...aday },
        gerekce: `\`${aday.komut}\` geçti (${aday.guc} kanıtı)`,
      };
    }
    sonHata = { aday, cikti: (sonuc && sonuc.cikti) || '' };
  }

  return {
    tamam: false,
    kanit: null,
    gerekce: `\`${sonHata.aday.komut}\` BAŞARISIZ — değişiklik doğrulanmadı`,
    // Onarım için modele geri verilecek metin. Kırpma çağıranın işi değil:
    // burada sınırlanmazsa bütün test çıktısı bağlamı doldurur.
    onarimIcin: String(sonHata.cikti).slice(-4000),
  };
}

/** Değiştirilen dosyaları araç kayıtlarından çıkarır. */
function degisenDosyalar(kayitlar) {
  return [...new Set(
    (kayitlar || [])
      .filter((r) => r && r.status !== 'error'
        && /^(write_file|edit_file|structural_patch|notebook_edit)$/.test(r.tool))
      .map((r) => (r.args && (r.args.path || r.args.file || r.args.filePath || r.args.yol)) || null)
      .filter(Boolean)
      .map((p) => path.normalize(String(p))),
  )];
}

module.exports = { kanitTopla, dogrulamaKomutlari, kanitSayilir, degisenDosyalar };
