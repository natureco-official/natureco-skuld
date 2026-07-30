import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const readme = fs.readFileSync(path.resolve('README.md'), 'utf8');

describe('release README stays aligned with the executable product', () => {
  it('documents every built-in coding tool and the current tool count', () => {
    const { loadToolManifest } = require('../src/utils/tool-manifest');
    const manifest = loadToolManifest({ refresh: true });
    expect(manifest.size).toBe(54);
    expect(readme).toContain('54 built-in coding tools');
    expect(readme).toContain('70 first-party coding capabilities');
    for (const name of manifest.keys()) expect(readme).toContain(`\`${name}\``);
  });

  it('documents the complete fallback provider catalogue', () => {
    const { PROVIDERS } = require('../src/utils/model-catalog');
    const providerCount = Object.keys(PROVIDERS).length;
    const modelCount = Object.values(PROVIDERS).reduce((total, provider) => total + provider.models.length, 0);
    expect(providerCount).toBe(18);
    expect(modelCount).toBe(75);
    expect(readme).toContain('18 providers and 75 model entries');
    for (const provider of Object.values(PROVIDERS)) {
      expect(readme).toContain(provider.name.replace(/\s+\([^)]*\)$/, ''));
    }
  });

  it('mentions every executable top-level command', () => {
    const help = execFileSync(process.execPath, ['bin/nskuld.js', '--help'], {
      cwd: path.resolve('.'),
      env: { ...process.env, SKULD_NO_SPLASH: '1', SKULD_NO_UPDATE_CHECK: '1', FORCE_COLOR: '0' },
      encoding: 'utf8',
      timeout: 30000,
    });
    const commands = [...help.matchAll(/^[ ]{2}([a-z][a-z0-9-]*)(?:\s|$)/gm)].map(match => match[1]);
    expect(commands.length).toBeGreaterThan(60);
    for (const command of commands) expect(readme).toContain(`\`${command}\``);
  });

  it('has no broken repository-local links', () => {
    const links = [...readme.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
      .map(match => match[1].split('#')[0])
      .filter(target => target && !/^(?:https?:|mailto:)/i.test(target));
    for (const target of links) {
      expect(fs.existsSync(path.resolve(target)), `Missing README link target: ${target}`).toBe(true);
    }
  });

  it('does not advertise removed messaging surfaces or the deferred integration', () => {
    expect(readme).not.toMatch(/WhatsApp|Slack|Discord|Verðandi/i);
  });
});
