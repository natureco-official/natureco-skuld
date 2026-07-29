/**
 * NatureCo CLI — Secret Scanner (Phase 2)
 *
 * Kod metinlerinde veya dosya içeriklerinde hardcoded API key,
 * token, password gibi hassas verilerin sızmasını önceden tespit eder.
 *
 * OpenClaw'ın en büyük güvenlik açıklarından biri buydu —
 * kullanıcı farkında olmadan key'ini GitHub'a push'luyordu.
 *
 * Bu modül:
 * - Statik metin tarama (regex)
 * - Entropy analizi (rastgele yüksek entropi = muhtemelen secret)
 * - Dosya tarama (skip: .git, node_modules, .natureco, lock dosyaları)
 * - Pre-commit hook entegrasyonu için tasarlandı
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Bilinen secret pattern'leri — provider/format eşleşmesi
const SECRET_PATTERNS = [
  { name: 'OpenAI', regex: /\bsk-[A-Za-z0-9]{20,}(?:T3BlbkFJ[A-Za-z0-9]{20,})?/g, severity: 'critical' },
  { name: 'Anthropic', regex: /\bsk-ant-[A-Za-z0-9-]{20,}/g, severity: 'critical' },
  { name: 'Groq', regex: /\bgsk_[A-Za-z0-20]{20,}/g, severity: 'critical' },
  { name: 'Google API', regex: /\bAIza[A-Za-z0-9_-]{35}/g, severity: 'critical' },
  { name: 'AWS Access Key', regex: /\bAKIA[0-9A-Z]{16}/g, severity: 'critical' },
  { name: 'AWS Secret Key', regex: /\b[A-Za-z0-9/+=]{40}\b/g, severity: 'high' }, // false positive riski yüksek
  { name: 'GitHub Token', regex: /\bgh[pousr]_[A-Za-z0-9]{36,}/g, severity: 'critical' },
  { name: 'GitHub Fine-grained', regex: /\bgithub_pat_[A-Za-z0-9_]{82}/g, severity: 'critical' },
  { name: 'Slack Token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, severity: 'critical' },
  { name: 'Stripe Live', regex: /\bsk_live_[A-Za-z0-9]{24,}/g, severity: 'critical' },
  { name: 'Stripe Test', regex: /\bsk_test_[A-Za-z0-9]{24,}/g, severity: 'medium' },
  { name: 'Tavily', regex: /\btvly-[A-Za-z0-9_-]{20,}/g, severity: 'critical' },
  { name: 'OpenAI Project', regex: /\bsk-proj-[A-Za-z0-9_-]{20,}/g, severity: 'critical' },
  { name: 'HuggingFace', regex: /\bhf_[A-Za-z0-9]{20,}/g, severity: 'critical' },
  { name: 'Replicate', regex: /\br8_[A-Za-z0-9]{40,}/g, severity: 'critical' },
  { name: 'Firecrawl', regex: /\bfc-[A-Za-z0-9]{20,}/g, severity: 'critical' },
  { name: 'NatureCo', regex: /\bnc_[A-Za-z0-9]{20,}/g, severity: 'critical' },
  { name: 'NatureCo Legacy', regex: /\bnco_[A-Za-z0-9]{20,}/g, severity: 'critical' },
  { name: 'JWT', regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, severity: 'high' },
  { name: 'Private Key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, severity: 'critical' },
  { name: 'Generic Password Assignment', regex: /(?:password|passwd|pwd|secret)\s*[=:]\s*['"]([^'"]{8,})['"]/gi, severity: 'medium' },
  { name: 'Bearer Token', regex: /\bBearer\s+[A-Za-z0-9_-]{20,}/g, severity: 'high' },
];

// Tarama dışı dosyalar
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.nskuld', 'dist', 'build',
  'coverage', '.next', '.cache', '.venv', 'venv',
]);
const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.tar', '.gz',
  '.mp4', '.mp3', '.mov', '.ico', '.woff', '.woff2', '.ttf',
  '.lock', '.bin', '.exe', '.dmg', '.dylib', '.so',
]);

// Entropy hesaplama (Shannon)
function shannonEntropy(str) {
  if (!str || str.length < 16) return 0;
  const freq = {};
  for (const c of str) freq[c] = (freq[c] || 0) + 1;
  let entropy = 0;
  const len = str.length;
  for (const c in freq) {
    const p = freq[c] / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Bir metin parçasını tarar, bulunan secret'ları döner.
 */
function scanText(text, options = {}) {
  const { minEntropy = 4.0 } = options;
  const findings = [];

  for (const { name, regex, severity } of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(text)) !== null) {
      findings.push({
        type: name,
        severity,
        match: redactSecret(m[0]),
        index: m.index,
      });
      if (!regex.global) break;
    }
  }

  // Entropy tabanlı genel tarama (bilinmeyen format)
  // Yüksek entropili 32+ karakterlik ardışık dizileri yakala
  const highEntropyRe = /[A-Za-z0-9_\-+/=]{32,}/g;
  let m;
  while ((m = highEntropyRe.exec(text)) !== null) {
    const candidate = m[0];
    if (shannonEntropy(candidate) >= minEntropy) {
      // Zaten bilinen bir pattern tarafından yakalanmadıysa ekle
      if (!findings.some(f => Math.abs(f.index - m.index) < 10)) {
        findings.push({
          type: 'HighEntropyString',
          severity: 'low',
          match: redactSecret(candidate),
          entropy: shannonEntropy(candidate).toFixed(2),
          index: m.index,
        });
      }
    }
  }

  return findings;
}

/**
 * Secret'ı güvenli şekilde maskele (ilk 4 + son 4 karakter, ortası ***).
 */
function redactSecret(secret) {
  if (!secret || secret.length < 12) return '***';
  return secret.slice(0, 4) + '***' + secret.slice(-4);
}

/**
 * Bir metindeki bilinen secret'ları yerinde maskeler.
 *
 * `scanText` bulguları RAPORLAR; bu ise metni araca geri verilebilir hâle
 * getirir. Arama araçları dosya içeriğini modele taşır ve model geçmişi
 * günlüklere, hata raporlarına, sağlayıcıya gider — bir anahtarın oraya
 * girmesi için `read_file` çağrılması gerekmiyor, `grep_search` yetiyor.
 *
 * Entropi sezgiseli BİLEREK kullanılmıyor: 40 karakterlik bir git SHA'sı da
 * eşiği geçiyor ve her commit kimliğini maskelemek aracı kullanılamaz hâle
 * getirirdi. Burada kesinlik, kapsamdan önce gelir.
 */
function maskText(text) {
  if (typeof text !== 'string' || !text) return text;
  let out = text;
  for (const { regex } of SECRET_PATTERNS) {
    const bayrak = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
    out = out.replace(
      new RegExp(regex.source, bayrak),
      (m, ...rest) => {
        const tumMetin = rest[rest.length - 1];
        const konum = rest[rest.length - 2];
        return masumMu(m, tumMetin, konum) ? m : redactSecret(m);
      },
    );
  }
  return out;
}

/**
 * Eşleşme, biçimi gereği sır OLAMAYACAK bir şey mi?
 *
 * `AWS Secret Key` deseni `\b[A-Za-z0-9/+=]{40}\b` — ayırt edici bir öneki
 * yok, yani 40 karakterlik her dize ona uyuyor. Tarayıcıda bu kabul
 * edilebilir (insan bakar, eler); metni yerinde maskelerken değil: her git
 * SHA'sı yıldızlanırsa arama aracı kullanılamaz hâle gelir.
 *
 * Deseni listeden çıkarmak kapsamı kaybettirirdi. Bunun yerine eşleşme
 * daraltılıyor: 40 haneli saf onaltılık bir dize git nesne kimliğidir. Gerçek
 * bir AWS anahtarının tesadüfen saf onaltılık çıkma olasılığı (16/64)^40.
 */
function masumMu(eslesme, tumMetin, konum) {
  if (!/^[0-9a-f]{40}$/i.test(eslesme)) return false;

  // Codex tur 3, bulgu 3: muafiyet fazla genişti ve doğrulandı.
  // `WEBHOOK_SECRET=0123456789abcdef0123456789abcdef01234567` maskelenmeden
  // geçiyordu. Bir değerin git SHA'sına BENZEMESİ onun git SHA'sı olduğunu
  // kanıtlamaz; 160 bitlik hex, HMAC ve webhook imzalama sırlarının da
  // standart biçimi.
  //
  // Biçim ikisini ayırt edemiyor, ama BAĞLAM edebiliyor: SHA'lar bir
  // atamanın sağ tarafında `SECRET=` diye durmaz.
  if (typeof tumMetin === 'string' && typeof konum === 'number') {
    const satirBasi = tumMetin.lastIndexOf('\n', konum) + 1;
    const oncesi = tumMetin.slice(satirBasi, konum);
    // `['"\`]?` ADIN SONUNDA da gerekli: JSON'da anahtar tırnaklıdır ve
    // `{"webhook_secret": "…"}` biçimi bağlam kontrolünü atlatıyordu
    // (Codex doğrulama turu). Yapılandırma dosyalarının en yaygın biçimi bu.
    if (/(secret|token|key|password|passwd|auth|signature|hmac)['"`]?\s*[:=]\s*['"`]?\s*$/i.test(oncesi)) {
      return false; // sır adıyla atanmış — SHA değil
    }

    // YAML blok skaleri ve TOML çok satırlı değer: ad ÖNCEKİ satırda kalıyor
    // ve aynı satıra bakan kontrol onu göremiyordu (Codex kapanış turu).
    //
    //     webhook_secret: >
    //       0123456789abcdef…
    //
    // Bu yüzden değer satırı girintili ve tek başınaysa, önceki iki satırda
    // blok göstergeli bir sır adı aranıyor.
    const satirIci = tumMetin.slice(satirBasi, konum);
    if (/^\s*$/.test(satirIci)) {
      const oncekiler = tumMetin.slice(0, satirBasi).split(/\r?\n/).slice(-3);
      if (oncekiler.some((s) => /(secret|token|key|password|passwd|auth|signature|hmac)['"`]?\s*[:=]\s*[>|]?\s*$/i.test(s))) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Bir dosyayı tara.
 */
function scanFile(filePath, options = {}) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 5 * 1024 * 1024) return []; // 5 MB'dan büyük dosyaları atla
    const content = fs.readFileSync(filePath, 'utf8');
    const findings = scanText(content, options);
    return findings.map(f => ({ ...f, file: filePath, line: lineFromIndex(content, f.index) }));
  } catch {
    return [];
  }
}

function lineFromIndex(text, idx) {
  return text.slice(0, idx).split('\n').length;
}

/**
 * Bir dizini recursive olarak tara.
 */
function scanDir(dirPath, options = {}) {
  const { maxFiles = 10000 } = options;
  const findings = [];
  let count = 0;

  function walk(dir) {
    if (count >= maxFiles) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (count >= maxFiles) return;
      if (SKIP_DIRS.has(entry.name)) continue;
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SKIP_EXT.has(ext)) continue;
        findings.push(...scanFile(p));
        count++;
      }
    }
  }
  walk(dirPath);
  return findings;
}

/**
 * Tarama sonuçlarını kritik/yüksek/orta/düşük olarak özetler.
 */
function summarize(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  return counts;
}

/**
 * Hızlı tahlil — verilen bir dizinde tarama yapar ve özet döner.
 */
function quickScan(dirPath) {
  const findings = scanDir(dirPath);
  return {
    dir: dirPath,
    timestamp: new Date().toISOString(),
    findings,
    summary: summarize(findings),
  };
}

module.exports = {
  scanText,
  scanFile,
  scanDir,
  summarize,
  quickScan,
  shannonEntropy,
  redactSecret,
  maskText,
  SECRET_PATTERNS,
};
