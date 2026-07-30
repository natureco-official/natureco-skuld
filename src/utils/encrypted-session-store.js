'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeJsonAtomicSync } = require('./atomic-file');

const FORMAT = 'skuld-aes-256-gcm-v1';

function ensurePrivateDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); } catch { /* Windows/best effort */ }
}

function createEncryptedSessionStore(options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const root = options.root || path.join(homeDir, '.nskuld', 'credentials');
  const file = options.file || path.join(root, 'natureco-session.json');
  const keyFile = options.keyFile || path.join(root, 'natureco-session.key');
  const legacyFiles = options.legacyFiles || [path.join(homeDir, '.nskuld', 'auth.json')];

  function key() {
    ensurePrivateDir(root);
    try {
      const existing = fs.readFileSync(keyFile);
      if (existing.length === 32) return existing;
    } catch { /* create below */ }
    const created = crypto.randomBytes(32);
    try {
      fs.writeFileSync(keyFile, created, { mode: 0o600, flag: 'wx' });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const raced = fs.readFileSync(keyFile);
      if (raced.length !== 32) throw new Error('NatureCo session key is invalid', { cause: error });
      return raced;
    }
    try { fs.chmodSync(keyFile, 0o600); } catch { /* best effort */ }
    return created;
  }

  function decrypt(envelope) {
    if (!envelope || envelope.format !== FORMAT) return null;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key(),
      Buffer.from(envelope.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString('utf8'));
  }

  function load() {
    try { return decrypt(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { /* legacy below */ }
    for (const legacy of legacyFiles) {
      try {
        const session = JSON.parse(fs.readFileSync(legacy, 'utf8'));
        if (session?.access_token) {
          save(session);
          try { fs.unlinkSync(legacy); } catch { /* best effort migration */ }
          return session;
        }
      } catch { /* next legacy file */ }
    }
    return null;
  }

  function save(session) {
    ensurePrivateDir(root);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
    const data = Buffer.concat([
      cipher.update(JSON.stringify(session), 'utf8'),
      cipher.final(),
    ]);
    writeJsonAtomicSync(file, {
      format: FORMAT,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    }, { mode: 0o600 });
    try { fs.chmodSync(file, 0o600); } catch { /* best effort */ }
  }

  function clear() {
    for (const target of [file, ...legacyFiles]) {
      try { fs.unlinkSync(target); } catch { /* absent */ }
    }
  }

  return {
    load,
    save,
    clear,
    info: { backend: 'encrypted-file', format: FORMAT, file },
    paths: { root, sessionFile: file, keyFile, legacyFile: legacyFiles[0], legacyFiles: [...legacyFiles] },
  };
}

/**
 * Prefer the operating-system credential vault where Skuld has a native
 * backend. The encrypted file remains a portable fallback and migration
 * source, never a second live copy.
 */
function createProtectedSessionStore(options = {}) {
  const fallback = options.fallback || createEncryptedSessionStore(options);
  const platform = options.platform || process.platform;
  const secretName = options.secretName || 'natureco-account-session';
  let vault = options.secretStore || null;
  if (!vault && (platform === 'win32' || platform === 'darwin')) {
    try {
      const { createSecretStore } = require('./secret-store');
      vault = createSecretStore({ service: options.service || 'natureco-skuld' });
    } catch { vault = null; }
  }

  function vaultLoad() {
    if (!vault) return null;
    try {
      const result = vault.get(secretName);
      return result?.ok ? JSON.parse(result.value) : null;
    } catch { return null; }
  }

  function load() {
    const protectedValue = vaultLoad();
    if (protectedValue) return protectedValue;
    const legacy = fallback.load();
    if (legacy && vault) {
      vault.set(secretName, JSON.stringify(legacy));
      fallback.clear();
    }
    return legacy;
  }

  function save(value) {
    if (!vault) return fallback.save(value);
    vault.set(secretName, JSON.stringify(value));
    fallback.clear();
  }

  function clear() {
    try { vault?.delete(secretName); } catch { /* best effort */ }
    fallback.clear();
  }

  const backend = vault
    ? (platform === 'win32' ? 'windows-dpapi' : platform === 'darwin' ? 'macos-keychain' : 'os-keychain')
    : fallback.info.backend;
  return { load, save, clear, info: { ...fallback.info, backend, protected: Boolean(vault) } };
}

module.exports = { createEncryptedSessionStore, createProtectedSessionStore, FORMAT };
