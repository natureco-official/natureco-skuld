'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function realpathOrResolved(value) {
  const resolved = path.resolve(value);
  try { return fs.realpathSync.native(resolved); } catch { return resolved; }
}

function getSkuldPaths(options = {}) {
  const packageRoot = realpathOrResolved(path.join(__dirname, '..', '..'));
  const packageJsonPath = path.join(packageRoot, 'package.json');
  let packageJson = {};
  try { packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')); } catch {}
  const systemRoot = path.join(os.homedir(), '.nskuld');
  const rawEntry = options.argvEntry === undefined ? process.argv[1] : options.argvEntry;
  const argvEntry = rawEntry ? path.resolve(rawEntry) : null;
  const invokedFromSkuldBin = argvEntry
    && path.basename(argvEntry).toLowerCase() === 'nskuld.js'
    && path.basename(path.dirname(argvEntry)).toLowerCase() === 'bin';
  // Keep the path used by the launcher (including an npm junction) separate
  // from its real target. On the development machine the global npm package
  // is a junction into C:\Projects; ordinary users only have the npm path.
  const packageInstallRoot = invokedFromSkuldBin
    ? path.resolve(path.dirname(argvEntry), '..')
    : path.resolve(path.join(__dirname, '..', '..'));
  const entryPath = invokedFromSkuldBin ? argvEntry : path.join(packageInstallRoot, 'bin', 'nskuld.js');
  const realEntryPath = realpathOrResolved(entryPath);
  const realInstallRoot = realpathOrResolved(packageInstallRoot);
  const normalizedInstall = packageInstallRoot.replace(/\\/g, '/').toLowerCase();
  const linked = realInstallRoot.toLowerCase() !== packageInstallRoot.toLowerCase();
  const globalNpm = normalizedInstall.includes('/node_modules/natureco-skuld');
  const installType = linked ? 'development-link' : (globalNpm ? 'global-npm' : 'local-package');

  return {
    packageName: packageJson.name || 'natureco-skuld',
    version: packageJson.version || 'unknown',
    installType,
    systemRoot,
    packageInstallRoot,
    packageRoot,
    entryPath,
    realEntryPath,
    binPath: path.join(packageInstallRoot, 'bin', 'nskuld.js'),
    sourceDir: path.join(packageRoot, 'src'),
    toolsDir: path.join(packageInstallRoot, 'src', 'tools'),
    skillsDir: path.join(packageInstallRoot, 'skills'),
    // Backward-compatible alias for callers that already used dataRoot.
    dataRoot: systemRoot,
    configPath: path.join(systemRoot, 'config.json'),
    logsDir: path.join(systemRoot, 'logs'),
    currentProject: process.cwd(),
    nodeExecutable: process.execPath,
  };
}

module.exports = { getSkuldPaths };
