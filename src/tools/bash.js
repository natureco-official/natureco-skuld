// child_process ARTIK DOĞRUDAN KULLANILMIYOR: çalıştırma execution-gateway
// üzerinden yapılıyor. Kapı şunları ekliyor ve bu dosyada hiçbiri yoktu:
// workspace sınırı, symlink kaçış kontrolü, çıktıda sır maskeleme, çıktı
// boyut sınırı. Karar hâlâ buradaki approvals katmanında alınıyor.
const { kapiAc } = require('../utils/gateway');
const os = require('os');
const chalk = require('chalk');
const { isDangerousCommand, checkCommand, isSafeCommand } = require('../utils/approvals');

module.exports = {
  name: 'bash',
  description: 'Execute bash commands in the terminal',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The bash command to execute'
      }
    },
    required: ['command']
  },
  
  async execute(params) {
    try {
      if (!params.command || !params.command.trim()) {
        return { success: false, error: 'No command provided' };
      }

      const command = params.command;

      // Skip approval checks for safe commands
      if (isSafeCommand(command)) {
        return await runCommand(command, params.cwd);
      }

      // Check command against approvals policy
      const approval = await checkCommand(command, { agentId: 'default' });

      if (!approval.allowed) {
        if (approval.reason === 'denied-by-policy') {
          return {
            success: false,
            error: 'Command execution is denied by security policy. Use "natureco security allowlist add" to allow specific commands.',
          };
        }
        if (approval.reason === 'not-in-allowlist') {
          return {
            success: false,
            error: 'Command is not in the allowlist. Use "natureco security allowlist add" to add it, or set a less restrictive policy.',
          };
        }
        return { success: false, error: `Command rejected: ${approval.reason}` };
      }

      // Check for dangerous commands that weren't already user-approved
      if (isDangerousCommand(command)) {
        console.log(chalk.yellow('\n  ⚠️  Potentially dangerous command'));
        console.log(chalk.gray('  ') + command);
        console.log('');
        return {
          success: false,
          error: 'Dangerous command blocked. Run manually after review.',
        };
      }

      return await runCommand(approval.editedCommand || command, params.cwd);
    } catch (error) {
      return {
        success: false,
        error: error?.message ?? 'Unknown error',
        stderr: error?.stderr?.toString() ?? '',
      };
    }
  }
};

/**
 * @param {string} command
 * @param {string} [cwd] çalışma dizini. Codex plan denetimi (S6): tamamlanma
 *   kapısı `cwd` geçiriyordu ama bu parametre HİÇ YOKTU, yani doğrulama komutu
 *   sürecin dizininde koşuyordu. Yanlış dizinde koşan bir test, koşmamış bir
 *   testtir — ama yeşil görünür.
 */
async function runCommand(command, cwd) {
  let cmd = command;
  if (process.platform !== 'win32') {
    cmd = cmd.replace(/\/home(\/[^\s]*)?/g, (match, subpath) => {
      return os.homedir() + (subpath || '');
    });
  }

  // Kabuk yolu bilinçli: bu araç boru ve zincir içeren komut DİZESİ alıyor.
  // Kapı bunu ayrı bir yetenek olarak tanıyor; argüman ayrıştırma yok,
  // koruma onaydan ve çıktı işlemeden geliyor.
  // `kararVerildi: true` — izin kararı yukarıdaki approvals katmanında
  // verildi; kapının aynı komut için ikinci kez sorması kullanıcıya çift
  // istem gösterirdi ve ikinci istemi gören kimse ilkini okumaz.
  const kapi = await kapiAc({ kararVerildi: true, zamanAsimiMs: 30000, ...(cwd ? { workspace: cwd } : {}) });
  const sonuc = await kapi.kabuk({ komut: cmd });

  if (sonuc.cikisKodu !== 0) {
    return {
      success: false,
      error: `Command exited with code ${sonuc.cikisKodu}${sonuc.zamanAsimi ? ' (timed out)' : ''}`,
      output: sonuc.stdout.trim(),
      stderr: sonuc.stderr.trim(),
    };
  }

  return {
    success: true,
    output: sonuc.stdout.trim(),
    ...(sonuc.kesildi ? { truncated: true } : {}),
  };
}
