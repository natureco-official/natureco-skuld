import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import sessionStoreModule from '../../src/utils/encrypted-session-store.js';

const { createEncryptedSessionStore, createProtectedSessionStore } = sessionStoreModule;

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function tempHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skuld-auth-'));
  roots.push(root);
  return root;
}

describe('encrypted NatureCo session store', () => {
  it('round-trips a session without writing plaintext tokens', () => {
    const root = tempHome();
    const store = createEncryptedSessionStore({ homeDir: root });
    const session = { access_token: 'secret-access', refresh_token: 'secret-refresh', user: { email: 'a@b.test' } };

    store.save(session);

    expect(store.load()).toEqual(session);
    const raw = fs.readFileSync(store.paths.sessionFile, 'utf8');
    expect(raw).not.toContain('secret-access');
    expect(raw).not.toContain('secret-refresh');
    expect(JSON.parse(raw).format).toBe('skuld-aes-256-gcm-v1');
  });

  it('migrates and removes the legacy plaintext session', () => {
    const root = tempHome();
    const legacy = path.join(root, '.nskuld', 'auth.json');
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, JSON.stringify({ access_token: 'legacy-token' }), 'utf8');

    const store = createEncryptedSessionStore({ homeDir: root });
    expect(store.load()).toEqual({ access_token: 'legacy-token' });
    expect(fs.existsSync(legacy)).toBe(false);
    expect(fs.readFileSync(store.paths.sessionFile, 'utf8')).not.toContain('legacy-token');
  });

  it('clears both encrypted and legacy storage', () => {
    const root = tempHome();
    const store = createEncryptedSessionStore({ homeDir: root });
    store.save({ access_token: 'temporary' });
    fs.writeFileSync(store.paths.legacyFile, '{}', 'utf8');

    store.clear();

    expect(store.load()).toBeNull();
    expect(fs.existsSync(store.paths.sessionFile)).toBe(false);
    expect(fs.existsSync(store.paths.legacyFile)).toBe(false);
  });

  it('migrates the encrypted fallback into an OS-protected secret store', () => {
    const root = tempHome();
    const fallback = createEncryptedSessionStore({ homeDir: root });
    fallback.save({ access_token: 'move-me' });
    const entries = new Map();
    const secretStore = {
      get: (name) => entries.has(name) ? { ok: true, value: entries.get(name) } : { ok: false },
      set: (name, value) => { entries.set(name, value); return { ok: true }; },
      delete: (name) => ({ ok: entries.delete(name) }),
    };
    const store = createProtectedSessionStore({ fallback, secretStore, platform: 'win32' });

    expect(store.load()).toEqual({ access_token: 'move-me' });
    expect(JSON.parse(entries.get('natureco-account-session'))).toEqual({ access_token: 'move-me' });
    expect(fs.existsSync(fallback.paths.sessionFile)).toBe(false);
    expect(store.info.backend).toBe('windows-dpapi');
  });
});
