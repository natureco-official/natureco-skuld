import { describe, expect, it, vi } from 'vitest';
import path from 'path';
import bridge from '../../src/utils/cupertino-bridge.js';

describe('Cupertino Terminal bridge', () => {
  it('detects an active Cupertino terminal without requiring an install probe', () => {
    expect(bridge.detectCupertino({
      platform: 'win32',
      env: { TERM_PROGRAM: 'Cupertino_Terminal', TERM_PROGRAM_VERSION: '0.6.4' },
    })).toMatchObject({ active: true, installed: true, version: '0.6.4' });
  });

  it('keeps the execution target local unless ZeroLink is explicit', () => {
    expect(bridge.executionTarget({})).toMatchObject({ kind: 'local' });
    expect(bridge.executionTarget({ SKULD_ZEROLINK_SESSION: 'peer-1', SKULD_REMOTE_HOST: 'Studio' }))
      .toMatchObject({ kind: 'zerolink', label: 'Studio', session: 'peer-1' });
  });

  // Bir Windows yolu yalnızca Windows'ta mutlaktır. `path.resolve` bunu
  // Linux'ta göreli sayıp çalışma dizininin önüne ekliyor, yani sabit
  // `terminal:///C:/...` beklentisi CI'da düşüyordu — testin kendisi tek bir
  // makineye bağlıydı. Dönüşüm platformun kendi mutlak yoluyla doğrulanır.
  it('creates the terminal deep link expected by Cupertino', () => {
    const absolute = path.resolve('projects', 'natureco-skuld');
    const expected = `terminal://${absolute.replace(/\\/g, '/').replace(/^(?!\/)/, '/')}`;
    expect(bridge.directoryDeepLink(absolute)).toBe(expected);
    // Sözleşmenin özü: ters bölü yok, tek kök eğik çizgi var.
    expect(bridge.directoryDeepLink(absolute)).not.toContain('\\');
    expect(bridge.directoryDeepLink(absolute).startsWith('terminal:///')).toBe(true);
  });

  it('opens Windows links through the execution gateway without shell interpolation', async () => {
    const calistir = vi.fn(async () => ({ cikisKodu: 0, stderr: '' }));
    await bridge.openDeepLink('terminal:///C:/Projects', {
      platform: 'win32',
      gateway: { calistir },
    });
    expect(calistir).toHaveBeenCalledWith({
      komut: 'rundll32.exe',
      argumanlar: ['url.dll,FileProtocolHandler', 'terminal:///C:/Projects'],
    });
  });
});
