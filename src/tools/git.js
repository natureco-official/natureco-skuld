// child_process ARTIK DOĞRUDAN KULLANILMIYOR — execution-gateway üzerinden.
// Bu araç zaten sağlamdı (execFile + shell:false + alt komut beyaz listesi).
// Kapının eklediği farklı: workspace sınırı, çıktıda sır maskeleme, çıktı
// boyut sınırı ve zaman aşımı — dördü de burada yoktu.
const { kapiAc } = require('../utils/gateway');
const fs = require('fs');
const path = require('path');

// v5.38 GUVENLIK: args'i shell'e sokmadan token'lara ayir. execFileSync shell:false ile
// calisir; boylece ";", "&&", "|", "$()", backtick gibi metakarakterler ISLEM GORMEZ —
// komut enjeksiyonu imkansiz. (Eski execSync `git log ${args}` enjeksiyona aciktir.)
function tokenizeArgs(s) {
  if (!s) return [];
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(String(s))) !== null) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

module.exports = {
  name: 'git',
  description: 'Git operations including cloning a GitHub repository into the current workspace, status, diff, log, branches and commit.',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['clone', 'status', 'diff', 'log', 'branches', 'add', 'commit'],
        description: 'Git operation to perform'
      },
      args: { type: 'string', description: 'Additional arguments' },
      message: { type: 'string', description: 'Commit message (for commit operation)' },
      url: { type: 'string', description: 'HTTPS GitHub repository URL (for clone)' },
      destination: { type: 'string', description: 'Workspace-relative destination directory (for clone; defaults to repository name)' },
    },
    required: ['operation']
  },

  async execute({ operation, args = '', message = '', command = '', cwd: userCwd = '', url = '', destination = '' }) {
    // v5.6.22: Git repo otomatik bul - this baglami kayboldugu icin module-level helper kullan
    // v5.38: ajan bir cwd verdiyse ve orada .git varsa onu kullan; yoksa oradan yukari tara.
    const cwd = findGitRepo(userCwd);
    // v5.38: Esnek giris — ajanlar farkli formatlarda gonderebilir (operation yerine args/command
    // icinde "log -n 2" gibi). operation yoksa ilk token'i operation kabul et, gerisi args olur.
    if (!operation && (command || args)) {
      const raw = String(command || args).trim().replace(/^git\s+/i, '');
      const m = raw.match(/^([a-z][a-z-]*)\s*([\s\S]*)$/i);
      if (m) { operation = m[1].toLowerCase(); if (m[2].trim()) args = m[2].trim(); }
    }
    operation = String(operation || '').toLowerCase();
    const tok = tokenizeArgs(args);

    if (operation === 'clone') {
      return cloneGitHubRepository({ url: url || tok[0], destination, cwd: userCwd });
    }

    // GÜVENLİK (Codex denetimi, 29.07.2026): beyaz listedeki `diff` bile
    // kullanıcı argümanlarını Git'e aynen geçiriyordu ve Git'in `--output=`
    // seçeneği WORKSPACE DIŞINA dosya yazıyor. Kanıtlandı: 4886 baytlık bir
    // patch dosyası %TEMP% altında oluştu. Kapı yalnızca `cwd`'yi doğruluyor;
    // git'in kendi argümanlarını doğrulamıyor ve doğrulayamaz.
    //
    // Bu yüzden dosyaya yazan git bayrakları alt komuttan bağımsız yasak.
    const YAZAN_BAYRAKLAR = [
      /^--output(=|$)/i,
      /^-o$/i,
      /^--output-indicator/i,
      /^--to-file(=|$)/i,
      /^--upload-pack(=|$)/i,     // uzak komut çalıştırma zemini
      /^--exec(=|$)/i,
      /^--receive-pack(=|$)/i,
    ];
    for (const t of tok) {
      const kotu = YAZAN_BAYRAKLAR.find((r) => r.test(t));
      if (kotu) {
        return {
          success: false,
          error: `git argümanı engellendi: "${t}" — dosyaya yazan veya komut çalıştıran bayraklar yasak (workspace dışına yazma zemini)`,
        };
      }
    }
    try {
      let gitArgs;
      switch (operation) {
        case 'status':  gitArgs = ['status', '--short']; break;
        case 'diff':    gitArgs = ['diff', ...(tok.length ? tok : ['HEAD'])]; break;
        case 'log':     gitArgs = ['log', '--oneline', ...(tok.length ? tok : ['-10'])]; break;
        case 'branch':
        case 'branches': gitArgs = ['branch', '-a']; break;
        case 'add':     gitArgs = ['add', ...(tok.length ? tok : ['.'])]; break;
        case 'commit':  gitArgs = ['commit', '-m', String(message || '')]; break;
        // v5.38: yaygin salt-okunur alt-komutlar (ajan bunlari da isteyebiliyor)
        case 'show':      gitArgs = ['show', ...(tok.length ? tok : ['HEAD'])]; break;
        case 'remote': {
          // GUVENLIK: remote yazma islemleri (add/set-url/remove/rename) engelli — push
          // zeminini ve exec-allowlist bypass'ini kapatir. Sadece salt-okunur.
          const sub = (tok[0] || '').toLowerCase();
          if (['add', 'set-url', 'remove', 'rm', 'rename', 'prune', 'set-head', 'set-branches'].includes(sub)) {
            return { success: false, error: `git remote "${sub}" engellendi (guvenlik: remote yazma yasak)` };
          }
          gitArgs = ['remote', ...(tok.length ? tok : ['-v'])]; break;
        }
        case 'tag':       gitArgs = ['tag', ...tok]; break;
        case 'describe':  gitArgs = ['describe', ...(tok.length ? tok : ['--tags', '--always'])]; break;
        case 'rev-parse': gitArgs = ['rev-parse', ...(tok.length ? tok : ['HEAD'])]; break;
        default: return { success: false, error: `Bilinmeyen git islemi: "${operation}". Gecerli: status, diff, log, branch, add, commit, show, remote, tag, describe, rev-parse` };
      }
      // Kapı: yapılandırılmış yol (kabuk DEĞİL) — git argümanları zaten
      // token'lara ayrılmış durumda, tam olarak bu yola uygun.
      //
      // workspace olarak bulunan depo kökü veriliyor. findGitRepo() cwd'de
      // .git yoksa ~/Projects gibi yerlere kayabiliyor; kapıya o kökü vermek,
      // en azından o kökün DIŞINA çıkılmamasını garanti eder.
      const kapi = await kapiAc({
        workspace: cwd,
        kararVerildi: true,
        zamanAsimiMs: 60000,
      });
      const sonuc = await kapi.calistir({ komut: 'git', argumanlar: gitArgs });

      if (sonuc.cikisKodu !== 0) {
        return {
          success: false,
          error: (sonuc.stderr || `git exit ${sonuc.cikisKodu}`).trim(),
          ...(sonuc.zamanAsimi ? { timedOut: true } : {}),
        };
      }
      return {
        success: true,
        output: sonuc.stdout.trim(),
        ...(sonuc.kesildi ? { truncated: true } : {}),
      };
    } catch (err) {
      return { success: false, error: err.stderr?.toString() || err.message };
    }
  },

  // v5.38: test icin — shell'e gitmeden token'lara ayirma davranisini dogrulamak icin
  _tokenizeArgs: tokenizeArgs,

  /**
   * v5.6.22: Git repo bul - cwd'de yoksa ~/Projects ve parent dizinleri tara
   */
  _findGitRepo() {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const { execSync } = require('child_process');

    // 1. Mevcut cwd'de .git var mi?
    if (fs.existsSync(path.join(process.cwd(), '.git'))) {
      return process.cwd();
    }

    // 2. Bilinen yaygin konumlari kontrol et
    const home = os.homedir();
    const candidates = [
      path.join(home, 'Projects', 'natureco-skuld'),
      path.join(home, 'Projects'),
      path.join(home, 'projects'),
      path.join(home, 'code'),
      path.join(home, 'dev'),
      path.join(home, 'src'),
    ];

    for (const dir of candidates) {
      try {
        if (fs.existsSync(path.join(dir, '.git'))) {
          return dir;
        }
      } catch {}
    }

    // 3. cwd'den yukarı dogru 5 seviye tara
    let current = process.cwd();
    for (let i = 0; i < 5; i++) {
      const parent = path.dirname(current);
      if (parent === current) break;
      try {
        if (fs.existsSync(path.join(parent, '.git'))) {
          return parent;
        }
      } catch {}
      current = parent;
    }

    // 4. Bulamadi, cwd'yi don
    return process.cwd();
  }
};


/**
 * Git repo bul - cwd'de yoksa ~/Projects ve parent dizinleri tara
 */
function findGitRepo(startDir = '') {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  // v5.38: ajanin verdigi cwd oncelikli — orada .git varsa onu, yoksa oradan yukari tara.
  const seed = startDir && fs.existsSync(startDir) ? startDir : process.cwd();
  if (fs.existsSync(path.join(seed, '.git'))) {
    return seed;
  }

  const home = os.homedir();
  const candidates = [
    // v5.38: makineden bagimsiz — env ipuclari once (repo dizini disindan calisilsa bile bulunur)
    process.env.SKULD_PROJECT_DIR,
    process.env.INIT_CWD,
    process.env.PWD,
    path.join(home, 'Projects', 'natureco-skuld'),
    path.join(home, 'Projects'),
    path.join(home, 'projects'),
    path.join(home, 'code'),
    path.join(home, 'dev'),
    path.join(home, 'src'),
  ].filter(Boolean);

  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, '.git'))) {
        return dir;
      }
    } catch {}
  }

  let current = seed;
  for (let i = 0; i < 6; i++) {
    const parent = path.dirname(current);
    if (parent === current) break;
    try {
      if (fs.existsSync(path.join(parent, '.git'))) {
        return parent;
      }
    } catch {}
    current = parent;
  }

  return seed;
}

async function cloneGitHubRepository({ url, destination, cwd, gatewayFactory = kapiAc }) {
  let parsed;
  try { parsed = new URL(String(url || '')); } catch {
    return { success: false, error: 'Geçerli bir HTTPS GitHub depo URL\'si gerekli.' };
  }
  const parts = parsed.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com' || parts.length !== 2) {
    return { success: false, error: 'Yalnızca https://github.com/<sahip>/<depo> biçimindeki depo bağlantıları desteklenir.' };
  }
  const owner = parts[0];
  const repository = parts[1].replace(/\.git$/i, '');
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repository)) {
    return { success: false, error: 'GitHub sahibi veya depo adı güvenli değil.' };
  }

  const workspace = path.resolve(cwd || process.cwd());
  const relativeDestination = String(destination || repository).trim();
  if (!relativeDestination || path.isAbsolute(relativeDestination)) {
    return { success: false, error: 'Hedef dizin çalışma alanına göreli olmalıdır.' };
  }
  const target = path.resolve(workspace, relativeDestination);
  const relative = path.relative(workspace, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return { success: false, error: 'Hedef dizin çalışma alanının içinde ve yeni bir alt dizin olmalıdır.' };
  }
  if (fs.existsSync(target)) {
    return { success: false, error: `Hedef zaten var; üzerine yazılmadı: ${target}` };
  }

  try {
    const gateway = await gatewayFactory({ workspace, kararVerildi: true, zamanAsimiMs: 180000 });
    const result = await gateway.calistir({
      komut: 'git',
      argumanlar: ['clone', '--depth', '1', `https://github.com/${owner}/${repository}.git`, target],
      cwd: workspace,
    });
    if (result.cikisKodu !== 0) {
      return {
        success: false,
        error: (result.stderr || `git clone exit ${result.cikisKodu}`).trim(),
        ...(result.zamanAsimi ? { timedOut: true } : {}),
      };
    }
    const instructionFiles = ['AGENTS.md', 'README.md', 'README', 'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod']
      .filter(name => fs.existsSync(path.join(target, name)));
    return {
      success: true,
      repository: `${owner}/${repository}`,
      path: target,
      output: result.stdout.trim(),
      instructionFiles,
      nextStep: 'Önce AGENTS.md ve README dosyalarını oku; sonra belgelenmiş bağımlılık/kurulum komutlarını çalıştır ve doğrula.',
    };
  } catch (error) {
    return { success: false, error: error?.message || String(error) };
  }
}

module.exports._cloneGitHubRepository = cloneGitHubRepository;
