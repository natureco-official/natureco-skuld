const inquirer = require('../utils/inquirer-wrapper');
const chalk = require('chalk');
const acc = require('../utils/natureco-account');
const { getLang } = require('../utils/i18n');
const { foldTr } = require('../utils/tr-text');

const L = (tr, en) => (getLang() === 'en' ? en : tr);
const PORTAL_URL = 'https://developers.natureco.me';

/**
 * NatureCo hesabı, sağlayıcı API anahtarından ayrıdır:
 * `nskuld account` kişisel ekosistem kimliğini yönetir.
 */
async function account(action) {
  const sub = foldTr(action || 'whoami');
  if (sub === 'login' || sub === 'giris') return doLogin();
  if (sub === 'logout' || sub === 'cikis') return doLogout();
  if (sub === 'portal') return showPortal();
  return doWhoami();
}

function showPortal() {
  console.log('');
  console.log(chalk.hex('#7dd3fc').bold('  NatureCo Developer Portal'));
  console.log(chalk.cyan(`  ${PORTAL_URL}`));
  console.log(chalk.gray('  ' + L(
    'API anahtarları, botlar, kullanım ve güvenlik ayarları.',
    'API keys, bots, usage and security settings.',
  )));
  console.log('');
}

async function doLogin() {
  console.log('');
  console.log(chalk.hex('#7dd3fc').bold('  (\\_/)'));
  console.log(chalk.hex('#7dd3fc').bold('  (•ᴥ•)'));
  console.log(chalk.hex('#7dd3fc')('  />🌿'));
  console.log('');
  console.log(chalk.hex('#7dd3fc').bold('  ' + L('NatureCo Hesabı — Giriş', 'NatureCo Account — Sign in')));
  console.log(chalk.gray('  ' + L(
    'natureco.me hesabınla ekosistemin her yerinde tek kimlik.',
    'One identity across the whole ecosystem with your natureco.me account.',
  ) + '\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)) + '\n');

  const { email } = await inquirer.prompt([{
    type: 'input',
    name: 'email',
    message: L('  E-posta:', '  Email:'),
    validate: (v) => (/.+@.+\..+/.test((v || '').trim()) ? true : L('Geçerli bir e-posta gir', 'Enter a valid email')),
  }]);

  const { method } = await inquirer.prompt([{
    type: 'list',
    name: 'method',
    message: L('  Giriş yöntemi:', '  Sign-in method:'),
    choices: [
      { name: L('Şifre', 'Password'), value: 'password' },
      { name: L('E-postama kod gönder (OTP)', 'Email me a code (OTP)'), value: 'otp' },
    ],
  }]);

  try {
    if (method === 'password') {
      const { password } = await inquirer.prompt([{
        type: 'password', name: 'password', message: L('  Şifre:', '  Password:'), mask: '*',
      }]);
      console.log(chalk.gray('\n  ' + L('Doğrulanıyor...', 'Verifying...')));
      await acc.loginWithPassword(email.trim(), password);
    } else {
      console.log(chalk.gray('\n  ' + L('Gönderiliyor...', 'Sending...')));
      await acc.sendOtp(email.trim());
      console.log(chalk.gray('  ') + chalk.cyan(email.trim()) + chalk.gray(L(' adresine e-posta gönderildi.', ' — email sent.')));
      console.log(chalk.gray('  ' + L(
        '6 haneli kod geldiyse kodu, giriş bağlantısı geldiyse bağlantıyı yapıştır.',
        'Paste the 6-digit code, or the sign-in link if you received one.',
      )));
      const { token } = await inquirer.prompt([{
        type: 'input',
        name: 'token',
        message: L('  Kod veya giriş bağlantısı:', '  Code or sign-in link:'),
        validate: (v) => ((v || '').trim().length >= 6 ? true : L('Kodu ya da bağlantıyı gir', 'Enter the code or link')),
      }]);
      console.log(chalk.gray('\n  ' + L('Doğrulanıyor...', 'Verifying...')));
      const value = token.trim();
      if (/^https?:\/\//i.test(value) || value.includes('token')) await acc.verifyLink(value);
      else await acc.verifyOtp(email.trim(), value);
    }
  } catch (err) {
    console.log(chalk.red(`\n  ✗ ${err.message || L('Giriş başarısız', 'Sign-in failed')}\n`));
    process.exitCode = 1;
    return;
  }

  const me = await acc.whoami();
  console.log(chalk.hex('#7dd3fc')('\n  ✓ ' + L('Giriş başarılı!', 'Signed in!')));
  if (me && me.email) console.log(chalk.gray('  ' + L('Hoş geldin, ', 'Welcome, ')) + chalk.white(me.email));
  console.log(chalk.gray('  ' + L('Oturum: şifreli yerel depo', 'Session: encrypted local store')));
  console.log('');
}

async function doLogout() {
  if (!acc.isLoggedIn()) {
    console.log(chalk.gray('\n  ' + L('Zaten giriş yapılmamış.', 'Not signed in.') + '\n'));
    return;
  }
  const email = acc.currentEmail();
  acc.logout();
  console.log(chalk.hex('#7dd3fc')(`\n  ✓ ${L('Çıkış yapıldı', 'Signed out')}${email ? ` (${email})` : ''}.\n`));
}

async function doWhoami() {
  if (!acc.isLoggedIn()) {
    console.log(chalk.gray('\n  ' + L('NatureCo hesabına giriş yapılmamış.', 'Not signed in to a NatureCo account.')));
    console.log(chalk.gray('  ' + L('Giriş: ', 'Sign in: ')) + chalk.cyan('nskuld account login') + '\n');
    return;
  }
  console.log(chalk.gray('\n  ' + L('Doğrulanıyor...', 'Verifying...')));
  const me = await acc.whoami();
  if (!me) {
    console.log(chalk.yellow('\n  ⚠ ' + L(
      'Oturumun süresi dolmuş görünüyor. Tekrar giriş yap: ',
      'Your session looks expired. Sign in again: ',
    )) + chalk.cyan('nskuld account login') + '\n');
    return;
  }
  console.log(chalk.hex('#7dd3fc').bold('\n  ⬡ ' + L('NatureCo Hesabı', 'NatureCo Account')));
  console.log(chalk.gray('  ' + L('E-posta: ', 'Email: ')) + chalk.white(me.email || '-'));
  console.log(chalk.gray('  ID:      ') + chalk.gray(me.id || '-'));
  console.log(chalk.gray('  ' + L('Depolama: ', 'Storage: ')) + chalk.white(acc.storageInfo().backend));
  console.log(chalk.gray('  Portal:  ') + chalk.cyan(PORTAL_URL));
  console.log('');
}

module.exports = account;
