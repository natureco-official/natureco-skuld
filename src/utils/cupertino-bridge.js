'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function installationCandidates(platform = process.platform, env = process.env) {
  if (platform === 'win32') {
    return [
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Cupertino Terminal', 'cupertino-terminal.exe'),
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'CupertinoTerminal', 'cupertino-terminal.exe'),
    ].filter(Boolean);
  }
  if (platform === 'darwin') return ['/Applications/Cupertino Terminal.app'];
  return [path.join(os.homedir(), '.local', 'bin', 'cupertino-terminal'), '/usr/local/bin/cupertino-terminal'];
}

function detectCupertino(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const candidates = installationCandidates(platform, env);
  const executable = candidates.find((candidate) => fs.existsSync(candidate)) || null;
  const active = /^Cupertino_Terminal$/i.test(env.TERM_PROGRAM || '');
  return {
    active,
    installed: active || Boolean(executable),
    executable,
    version: active ? (env.TERM_PROGRAM_VERSION || null) : null,
  };
}

function executionTarget(env = process.env) {
  const remote = /^zerolink$/i.test(env.SKULD_EXECUTION_TARGET || '') || Boolean(env.SKULD_ZEROLINK_SESSION);
  return {
    kind: remote ? 'zerolink' : 'local',
    label: remote ? (env.SKULD_REMOTE_HOST || 'ZeroLink eş cihazı') : 'Bu bilgisayar',
    session: remote ? (env.SKULD_ZEROLINK_SESSION || null) : null,
  };
}

function directoryDeepLink(input = process.cwd()) {
  const absolute = path.resolve(input);
  let urlPath = absolute.replace(/\\/g, '/');
  if (!urlPath.startsWith('/')) urlPath = `/${urlPath}`;
  return `terminal://${encodeURI(urlPath)}`;
}

async function openDeepLink(url, options = {}) {
  const platform = options.platform || process.platform;
  let command;
  let args;
  if (platform === 'win32') {
    command = 'rundll32.exe';
    args = ['url.dll,FileProtocolHandler', url];
  } else if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }
  let gateway = options.gateway;
  if (!gateway) {
    const { ExecutionGateway } = require('../../packages/execution-gateway/dist/index.js');
    gateway = new ExecutionGateway({
      workspace: process.cwd(),
      onay: async () => 'ret',
      onaysizKomutlar: new Set([command]),
      zamanAsimiMs: 10000,
      enFazlaCiktiKarakteri: 2000,
    });
  }
  const result = await gateway.calistir({ komut: command, argumanlar: args });
  if (result.cikisKodu !== 0) {
    throw new Error(result.stderr || `Cupertino deep link failed (${result.cikisKodu})`);
  }
}

module.exports = {
  installationCandidates,
  detectCupertino,
  executionTarget,
  directoryDeepLink,
  openDeepLink,
};
