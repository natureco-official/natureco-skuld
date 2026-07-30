/**
 * NatureCo account adapter.
 *
 * The public `natureco-sdk` owns the auth protocol. Skuld supplies a private,
 * encrypted session store so account tokens are not left as plain JSON.
 * API-key/provider login remains a separate concern.
 */
'use strict';

const os = require('os');
const path = require('path');
const { NatureCoAuth } = require('natureco-sdk');
const { createProtectedSessionStore } = require('./encrypted-session-store');

const store = createProtectedSessionStore({
  legacyFiles: [
    path.join(os.homedir(), '.nskuld', 'auth.json'),
  ],
});

const authOptions = { store };
if (process.env.SKULD_SUPABASE_URL) authOptions.url = process.env.SKULD_SUPABASE_URL;
if (process.env.SKULD_SUPABASE_ANON) authOptions.anonKey = process.env.SKULD_SUPABASE_ANON;
const auth = new NatureCoAuth(authOptions);

async function loginWithPassword(email, password) {
  return auth.loginWithPassword(email, password);
}

async function sendOtp(email) {
  return auth.sendOtp(email);
}

async function verifyOtp(email, token) {
  return auth.verifyOtp(email, token);
}

async function verifyLink(link) {
  return auth.verifyLink(link);
}

async function refresh() {
  return auth.refresh();
}

async function getAccessToken() {
  return auth.getAccessToken();
}

async function whoami() {
  return auth.whoami();
}

function isLoggedIn() {
  return auth.isLoggedIn();
}

function currentEmail() {
  return store.load()?.user?.email || null;
}

function logout() {
  auth.logout();
}

function storageInfo() {
  return { ...store.info, encrypted: true };
}

module.exports = {
  loginWithPassword,
  sendOtp,
  verifyOtp,
  verifyLink,
  refresh,
  getAccessToken,
  whoami,
  isLoggedIn,
  currentEmail,
  logout,
  storageInfo,
  SUPABASE_URL: auth.url,
};
