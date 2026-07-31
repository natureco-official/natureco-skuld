import { describe, expect, it } from 'vitest';
import botClass from '../../src/utils/telegram-bot-class.js';

const { loadTelegramBotClass } = botClass;

describe('TelegramBot kurucusunun çözümlenmesi', () => {
  // Asıl regresyon: node-telegram-bot-api 1.x isimli dışa verime geçti ve depodaki
  // üç çağrı noktası da `require(...)` sonucunu doğrudan `new` ile çağırıyordu.
  // Diğer Telegram testleri sahte sınıf enjekte ettiği için gerçek modül hiç
  // yüklenmiyordu — bu yüzden bot açılışta ölürken kapı yeşil kaldı.
  it('kurulu gerçek paketten çağrılabilir bir kurucu verir', () => {
    const Bot = loadTelegramBotClass();
    expect(typeof Bot).toBe('function');
    const bot = new Bot('123:sahte-token', { polling: false });
    expect(typeof bot.sendMessage).toBe('function');
  });

  it('1.x isimli dışa verimini kabul eder', () => {
    class Fake {}
    expect(loadTelegramBotClass({ TelegramBot: Fake })).toBe(Fake);
  });

  it('0.6x doğrudan dışa verimini kabul eder', () => {
    const Fake = function Fake() {};
    expect(loadTelegramBotClass(Fake)).toBe(Fake);
  });

  it('ESM interop default alanını kabul eder', () => {
    class Fake {}
    expect(loadTelegramBotClass({ default: Fake })).toBe(Fake);
  });

  it('kurucu yoksa sessizce geçmek yerine anlaşılır hata verir', () => {
    expect(() => loadTelegramBotClass({})).toThrow(/TelegramBot kurucusu vermedi/);
    expect(() => loadTelegramBotClass(null)).toThrow(/TelegramBot kurucusu vermedi/);
  });
});
