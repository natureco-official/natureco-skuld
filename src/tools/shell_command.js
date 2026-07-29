/**
 * shell_command — Tek shell komutu çalıştır (v4.9.0)
 *
 * bash.js'den farkı: tek satır, hızlı, etkileşimsiz komutlar için.
 * "find / -name *.log", "ls -la", "df -h" gibi.
 */

// child_process ARTIK DOĞRUDAN KULLANILMIYOR — execution-gateway üzerinden.
const { kapiAc } = require('../utils/gateway');
const os = require('os');
const { isSafeCommand, checkCommand, isDangerousCommand } = require('../utils/approvals');

async function runShell({ command, cwd = null, timeoutMs = 10000, onayli = false }) {
  if (!command) return { success: false, error: 'command gerekli' };

  // Çalışma kökü: istenen cwd, yoksa süreç dizini.
  //
  // Eski hâli `cwd || os.homedir()` idi — yani hiçbir dizin verilmediğinde
  // komut KULLANICININ EV DİZİNİNDE çalışıyordu. Bir kodlama aracının
  // varsayılanı projenin dışı olmamalı; ev dizini ssh anahtarlarından tarayıcı
  // profillerine kadar her şeyi içerir. Varsayılan artık process.cwd().
  const kok = cwd || process.cwd();

  try {
    // Kapı: workspace sınırı (verilen köke göre), symlink kaçış kontrolü,
    // çıktıda sır maskeleme, çıktı boyut sınırı, zaman aşımı.
    // Karar yukarıdaki approvals katmanında verildi.
    // GÜVENLİK (Codex denetimi, 29.07.2026): `_runShell` dışa açık ve eski
    // hâlinde koşulsuz `kararVerildi: true` geçiyordu — yani onay akışını
    // tamamen atlayan bir arka kapıydı. Artık karar ÇAĞIRANDAN gelmek
    // zorunda; `execute()` kendi kontrollerinden sonra `onayli: true` verir.
    // Varsayılan false: atlamak isteyen bunu çağrı yerinde YAZMAK zorunda,
    // yani atlama görünür olur.
    const kapi = await kapiAc({ workspace: kok, kararVerildi: onayli === true, zamanAsimiMs: timeoutMs });
    const sonuc = await kapi.kabuk({ komut: command });

    return {
      success: sonuc.cikisKodu === 0,
      exitCode: sonuc.cikisKodu,
      // Kırpma bu aracın MEVCUT sözleşmesi: çağıranlar stdout'u satır sonu
      // olmadan bekliyor. Kapıya bağlarken düşürmüştüm ve Windows
      // taşınabilirlik testi yakaladı — sondaki `\r\n` yüzünden regex'in `$`
      // çapası tutmadı. Kırpma kapının işi değil çağıranın; kapı ham verir.
      stdout: sonuc.stdout.trim(),
      stderr: sonuc.stderr.trim(),
      durationMs: sonuc.sureMs,
      ...(sonuc.zamanAsimi ? { timedOut: true } : {}),
      ...(sonuc.kesildi ? { truncated: true } : {}),
      ...(sonuc.cikisKodu === 0 ? {} : { error: `exit ${sonuc.cikisKodu}` }),
    };
  } catch (hata) {
    return { success: false, error: hata && hata.message ? hata.message : String(hata) };
  }
}

module.exports = {
  name: 'shell_command',
  description: 'Tek shell komutu çalıştır (find, ls, grep, cat, df, ps, vb.). Etkileşimsiz komutlar için. 10s timeout.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Çalıştırılacak shell komutu (örn: "ls -la ~/Documents")' },
      cwd: { type: 'string', description: 'Çalışma dizini' },
      timeoutMs: { type: 'number', description: 'Timeout ms (default 10000)' },
    },
    required: ['command'],
  },
  async execute(params) {
    // v5.43 GÜVENLİK: shell_command da (bash.js gibi) onay/güvenlik akışından geçer.
    // Eski hali doğrudan spawn('bash',...) yapıp checkCommand/isDangerousCommand'ı
    // ATLIYORDU → model/prompt-injection bash yerine bunu çağırıp onaysız sınırsız
    // shell erişimi kazanabiliyordu ("Dangerous Command Approval" tamamen bypass).
    const command = params && params.command;
    if (!command || !command.trim()) return { success: false, error: 'command gerekli' };
    if (!isSafeCommand(command)) {
      const approval = await checkCommand(command, { agentId: (params && params.agentId) || 'default' });
      if (!approval.allowed) {
        return { success: false, error: `Komut güvenlik politikasıyla reddedildi (${approval.reason}). "natureco security" ile politikayı görüntüle.` };
      }
      if (isDangerousCommand(command)) {
        return { success: false, error: 'Tehlikeli komut engellendi. Gözden geçirip manuel çalıştırın.' };
      }
      if (approval.editedCommand && approval.editedCommand !== command) {
        return await runShell({ ...params, command: approval.editedCommand, onayli: true });
      }
    }
    return await runShell({ ...params, onayli: true });
  },
  _runShell: runShell,
};
