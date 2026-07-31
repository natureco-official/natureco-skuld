'use strict';

/**
 * node-telegram-bot-api 1.x sınıfı isimli dışa veriyor ({ TelegramBot, default }),
 * 0.6x ise doğrudan module.exports olarak veriyordu. Depodaki üç çağrı noktası da
 * eski biçimi varsayıyordu; kurulu sürüm 1.x olunca `new TelegramBot(...)` açılışta
 * "TelegramBot is not a constructor" ile düşüyordu.
 *
 * Bunun sessizce kaybolmasının sebebi yerin kendisi: çökme Telegram'a bağlanmadan
 * ÖNCE olduğu için kullanıcıya giden bir hata yoktu — bot hiç var olmadı, mesajlar
 * yanıtsız kaldı. Testler de gerçek modülü hiç yüklemiyordu (hepsi sahte sınıf
 * enjekte ediyor), o yüzden kapı yeşil kaldı.
 *
 * Burada iki biçimi de kabul ediyoruz: bağımlılık geri alınırsa da, ileri giderse de
 * çağrı noktalarının tekrar dolaşması gerekmesin.
 */
function loadTelegramBotClass(mod) {
  const resolved = mod === undefined ? require('node-telegram-bot-api') : mod;
  const Bot = typeof resolved === 'function'
    ? resolved
    : (resolved && (resolved.TelegramBot || resolved.default));

  if (typeof Bot !== 'function') {
    throw new Error(
      'node-telegram-bot-api bir TelegramBot kurucusu vermedi. '
      + 'Beklenen: fonksiyon ya da { TelegramBot } — gelen: ' + typeof resolved
    );
  }
  return Bot;
}

module.exports = { loadTelegramBotClass };
