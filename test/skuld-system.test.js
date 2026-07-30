import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const requireCjs = createRequire(import.meta.url);
const { getSkuldPaths } = requireCjs('../src/utils/skuld-paths.js');
const tool = requireCjs('../src/tools/skuld_system.js');

describe('Skuld runtime path discovery', () => {
  it('resolves the actual package source and user data paths', async () => {
    const info = getSkuldPaths();
    expect(JSON.parse(fs.readFileSync(path.join(info.packageRoot, 'package.json'), 'utf8')).name).toBe('natureco-skuld');
    expect(info.sourceDir).toBe(path.join(info.packageRoot, 'src'));
    expect(info.toolsDir).toBe(path.join(info.packageInstallRoot, 'src', 'tools'));
    expect(info.systemRoot).toBe(info.dataRoot);
    expect(info.configPath).toContain(path.join('.nskuld', 'config.json'));
    await expect(tool.execute()).resolves.toMatchObject({ success: true, packageRoot: info.packageRoot });
  });

  it('shows a portable npm package location on an ordinary user installation', () => {
    const installedEntry = path.join(os.tmpdir(), 'npm', 'node_modules', 'natureco-skuld', 'bin', 'nskuld.js');
    const info = getSkuldPaths({ argvEntry: installedEntry });
    expect(info.installType).toBe('global-npm');
    expect(info.packageInstallRoot).toBe(path.resolve(installedEntry, '..', '..'));
    expect(info.packageInstallRoot).not.toContain(`${path.sep}Projects${path.sep}`);
    expect(info.systemRoot).toBe(path.join(os.homedir(), '.nskuld'));
  });
});
