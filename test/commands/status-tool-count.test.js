const { loadToolManifest } = require('../../src/utils/tool-manifest');
const { CODING_TOOL_NAMES } = require('../../src/utils/coding-surface');

describe('status command tool count', () => {
  it('derives the tool count from the manifest, matching the real executable tool count', async () => {
    const status = require('../../src/commands/status');
    const manifestCount = loadToolManifest().size;
    expect(manifestCount).toBe(CODING_TOOL_NAMES.size);

    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    try {
      await status(['run']);
    } finally {
      console.log = originalLog;
    }
    const output = logs.join('\n');
    // SÖZLEŞME ölçülüyor, YERLEŞİM değil. Eski hâli `Tools            91`
    // arıyordu — sabit genişlikli hizalama. Yerleşimi teste sabitlemek,
    // tasarımı değiştirmeyi imkânsız kılar; oysa iddia "sayı manifestten
    // gelir" olmalı, "şu kadar boşlukla basılır" değil.
    expect(output).toMatch(/araç|Tools/);
    expect(output).toContain(String(manifestCount));
    expect(output).not.toContain('92');
  });
});
