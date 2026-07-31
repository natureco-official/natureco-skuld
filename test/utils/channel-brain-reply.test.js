import { describe, expect, it } from 'vitest';
import brain from '../../src/utils/channel-brain.js';

const { replyFromResults } = brain;

// Bu üç durum sahadan geldi: kullanıcı Telegram'dan yazdı ve sırasıyla
// "Task finished without a textual response.", "Görev tamamlandı: ✓ clarify" ve
// "✓ skills_list" gördü. Üçünde de asıl içerik sonuçların içinde duruyordu.
describe('Kanal yanıtının adım sonuçlarından üretilmesi', () => {
  it('clarify sorusunu yanıtın kendisi yapar — aracın adını değil', () => {
    const reply = replyFromResults([
      { step: 1, tool: 'clarify', status: 'done', result: { success: true, clarification: true, question: 'Hangi konuda yazmamı istersin?' } },
    ]);
    expect(reply).toBe('Hangi konuda yazmamı istersin?');
    expect(reply).not.toContain('clarify');
  });

  it('clarify seçeneklerini numaralandırır', () => {
    const reply = replyFromResults([
      { tool: 'clarify', status: 'done', result: { clarification: true, question: 'Hangisi?', options: ['Türkçe', 'İngilizce'] } },
    ]);
    expect(reply).toBe('Hangisi?\n1. Türkçe\n2. İngilizce');
  });

  it('reddedilen araç çağrısını ✓ ile değil, sebebiyle gösterir', () => {
    const reply = replyFromResults([
      { tool: 'clarify', status: 'error', error: 'Geçersiz araç argümanları: $.question: required', result: { success: false, error: 'Geçersiz araç argümanları: $.question: required' } },
    ]);
    expect(reply).toContain('✗ clarify');
    expect(reply).toContain('$.question: required');
    expect(reply).not.toContain('✓');
  });

  it('status done olsa bile success:false ise başarı gibi göstermez', () => {
    // Eski davranışın tam kırılma noktası: adım 'done' yazılmıştı ama araç reddetmişti.
    const reply = replyFromResults([
      { tool: 'memory', status: 'done', result: { success: false, error: 'Geçersiz araç argümanları: $.action: required' } },
    ]);
    expect(reply).toContain('✗ memory');
    expect(reply).toContain('$.action: required');
  });

  it('araçların ürettiği metni taşır', () => {
    const reply = replyFromResults([
      { tool: 'skills_list', status: 'done', result: { success: true, content: 'browse, qa, ship' } },
    ]);
    expect(reply).toBe('browse, qa, ship');
  });

  it('birden çok adımı sırayla birleştirir', () => {
    const reply = replyFromResults([
      { tool: 'read_file', status: 'done', result: { output: 'ilk çıktı' } },
      { tool: 'write_file', status: 'error', error: 'izin yok' },
    ]);
    expect(reply).toBe('ilk çıktı\n\n✗ write_file: izin yok');
  });

  it('sessizce başarılı adımlar arasında hatayı öne çıkarır', () => {
    // Sessiz başarı gürültüdür, hata haberdir: kullanıcı Telegram'da tek satır görüyor.
    const reply = replyFromResults([
      { tool: 'git', status: 'done', result: { success: true } },
      { tool: 'test', status: 'error' },
    ]);
    expect(reply).toBe('✗ test: bilinmeyen hata');
  });

  it('hiçbir adım metin de hata da üretmezse ad listesine düşer', () => {
    const reply = replyFromResults([
      { tool: 'git', status: 'done', result: { success: true } },
      { tool: 'skill_view', status: 'done', result: { success: true } },
    ]);
    expect(reply).toBe('Görev tamamlandı:\n✓ git\n✓ skill_view');
  });
});
