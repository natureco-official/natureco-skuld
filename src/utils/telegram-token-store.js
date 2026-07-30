'use strict';

const os = require('os');
const path = require('path');
const { createProtectedSessionStore } = require('./encrypted-session-store');

const store = createProtectedSessionStore({
  secretName: 'telegram-bot-token',
  service: 'natureco-skuld',
  root: path.join(os.homedir(), '.nskuld', 'credentials'),
  file: path.join(os.homedir(), '.nskuld', 'credentials', 'telegram-token.json'),
  keyFile: path.join(os.homedir(), '.nskuld', 'credentials', 'telegram-token.key'),
  legacyFiles: [],
});

function saveToken(token) {
  store.save({ token: String(token) });
}

function loadToken() {
  return store.load()?.token || null;
}

function configWithToken(config) {
  return { ...config, telegramToken: config.telegramToken || loadToken() };
}

function protectLegacyToken(config) {
  if (!config.telegramToken) return { config, changed: false };
  saveToken(config.telegramToken);
  const next = { ...config, telegramTokenStored: true };
  delete next.telegramToken;
  return { config: next, changed: true };
}

module.exports = { saveToken, loadToken, configWithToken, protectLegacyToken, storageInfo: () => store.info };
