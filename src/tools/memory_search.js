/**
 * memory_search — Urðr-first durable memory search.
 *
 * Search order:
 *   1. Canonical Urðr tree (~/.codex/memory or SKULD_URDR_MEMORY_DIR)
 *   2. Skuld's scoped Urðr trees (~/.nskuld/memory/tree/*)
 *   3. Legacy JSON memory (compatibility fallback)
 *   4. Recent sessions when scope=all|sessions
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { foldTr } = require('../utils/tr-text');
const { urdrSearch } = require('../utils/urdr-engine');

function paths() {
  const home = os.homedir();
  return {
    memoryDir: path.join(home, '.nskuld', 'memory'),
    treeDir: path.join(home, '.nskuld', 'memory', 'tree'),
    sessionDir: path.join(home, '.nskuld', 'sessions'),
    canonicalUrdr: process.env.SKULD_URDR_MEMORY_DIR
      ? path.resolve(process.env.SKULD_URDR_MEMORY_DIR)
      : path.join(home, '.codex', 'memory'),
  };
}

function listFiles(dir, extension = '.json') {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((file) => file.endsWith(extension));
  } catch { return []; }
}

function searchInObject(obj, query, objectPath = '') {
  const results = [];
  if (!obj || typeof obj !== 'object') return results;
  for (const [key, value] of Object.entries(obj)) {
    const nextPath = objectPath ? `${objectPath}.${key}` : key;
    if (typeof value === 'string' && foldTr(value).includes(query)) {
      results.push({ path: nextPath, content: value.slice(0, 1000) });
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === 'string' && foldTr(item).includes(query)) {
          results.push({ path: `${nextPath}[${index}]`, content: item.slice(0, 1000) });
        } else if (item && typeof item === 'object') {
          results.push(...searchInObject(item, query, `${nextPath}[${index}]`));
        }
      });
    } else if (value && typeof value === 'object') {
      results.push(...searchInObject(value, query, nextPath));
    }
  }
  return results;
}

function listLegacyEntries(memory, filename) {
  const entries = [];
  if (memory?.name) entries.push({ source: `memory:${filename}`, path: 'memory.name', content: String(memory.name) });
  for (const [index, fact] of (memory?.facts || []).entries()) {
    const content = typeof fact === 'string' ? fact : fact?.value;
    if (content) entries.push({ source: `memory:${filename}`, path: `memory.facts[${index}].value`, content: String(content) });
  }
  for (const [index, preference] of (memory?.preferences || []).entries()) {
    const content = typeof preference === 'string' ? preference : preference?.value;
    if (content) entries.push({ source: `memory:${filename}`, path: `memory.preferences[${index}]`, content: String(content) });
  }
  return entries;
}

function markdownFiles(root) {
  try {
    // Each resolved root is already one live Urðr tree. Never descend into
    // `.urdr/generations`: those are recovery snapshots, not additional facts.
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && !/(?:^|[-_])index\.md$/i.test(entry.name))
      .map((entry) => path.join(root, entry.name));
  } catch { return []; }
}

function markdownEntries(root, label) {
  const entries = [];
  for (const file of markdownFiles(root)) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    let branch = '';
    let paragraph = [];
    const relative = path.relative(root, file).split(path.sep).join('/');
    const flush = () => {
      const content = paragraph.join(' ').replace(/\s+/g, ' ').trim();
      paragraph = [];
      if (!content || /^_(?:No entries yet\.|Henüz kayıt yok\.)_$/i.test(content)) return;
      entries.push({ source: `urdr:${label}/${relative}`, path: branch || relative, content });
    };
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (/^<!--/.test(line)) { flush(); continue; }
      const heading = line.match(/^##+\s+(.+)$/);
      if (heading) { flush(); branch = heading[1].trim(); continue; }
      if (!line || /^#\s+/.test(line)) { flush(); continue; }
      if (/^-\s+/.test(line)) {
        flush();
        paragraph = [line.replace(/^-\s+/, '')];
        flush();
      } else {
        paragraph.push(line);
      }
    }
    flush();
  }
  return entries;
}

function urdrRoots(username) {
  const resolved = paths();
  const roots = [];
  if (fs.existsSync(resolved.canonicalUrdr)) roots.push({ dir: resolved.canonicalUrdr, label: 'canonical' });
  try {
    if (fs.existsSync(resolved.treeDir)) {
      const names = username ? [foldTr(username)] : fs.readdirSync(resolved.treeDir);
      for (const name of names) {
        const dir = path.join(resolved.treeDir, name);
        if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) roots.push({ dir, label: name });
      }
    }
  } catch { /* no scoped trees */ }
  return roots;
}

function addUnique(target, seen, result) {
  const key = `${result.source}\0${result.path || ''}\0${result.content}`;
  if (seen.has(key)) return;
  seen.add(key);
  target.push(result);
}

async function searchUrdr(query, username, listAll) {
  const results = [];
  const seen = new Set();
  for (const root of urdrRoots(username)) {
    const parsed = markdownEntries(root.dir, root.label);
    if (listAll) {
      for (const entry of parsed) addUnique(results, seen, entry);
      continue;
    }
    try {
      const native = await urdrSearch(root.dir, query, { maxResults: Number.MAX_SAFE_INTEGER });
      for (const item of native?.results || []) {
        addUnique(results, seen, {
          source: `urdr:${root.label}/${item.file || 'memory'}`,
          path: item.branch || '',
          content: item.text || '',
        });
      }
    } catch { /* parser fallback below */ }
    const folded = foldTr(query);
    for (const entry of parsed) {
      if (foldTr(entry.content).includes(folded) || foldTr(entry.path).includes(folded)) addUnique(results, seen, entry);
    }
  }
  return results;
}

async function searchMemory({ query, scope = 'all', username = null, maxResults } = {}) {
  if (!query) return { success: false, error: 'query gerekli' };
  const listAll = String(query).trim() === '*';
  const limit = Number.isInteger(maxResults) && maxResults > 0 ? Math.min(maxResults, 200) : (listAll ? 100 : 20);
  const foldedQuery = foldTr(query);
  const results = [];
  const seen = new Set();
  const sources = [];
  const resolved = paths();

  if (scope === 'all' || scope === 'memory') {
    const urdrResults = await searchUrdr(query, username, listAll);
    for (const result of urdrResults) addUnique(results, seen, result);
    if (urdrResults.length) sources.push('urdr');

    const memoryFiles = username ? [`${foldTr(username)}.json`] : listFiles(resolved.memoryDir);
    for (const filename of memoryFiles) {
      try {
        const memory = JSON.parse(fs.readFileSync(path.join(resolved.memoryDir, filename), 'utf8'));
        const matches = listAll
          ? listLegacyEntries(memory, filename)
          : searchInObject(memory, foldedQuery, 'memory').map((match) => ({ source: `memory:${filename}`, ...match }));
        for (const match of matches) addUnique(results, seen, match);
        if (matches.length) sources.push('memory');
      } catch { /* invalid legacy file */ }
    }
  }

  if (!listAll && (scope === 'all' || scope === 'sessions')) {
    for (const filename of listFiles(resolved.sessionDir).slice(-10)) {
      try {
        const session = JSON.parse(fs.readFileSync(path.join(resolved.sessionDir, filename), 'utf8'));
        const matches = searchInObject(session, foldedQuery, 'session').slice(0, 3);
        for (const match of matches) addUnique(results, seen, { source: `session:${filename.slice(0, 12)}`, ...match });
        if (matches.length) sources.push('sessions');
      } catch { /* invalid session */ }
    }
  }

  return {
    success: true,
    query,
    mode: listAll ? 'list' : 'search',
    found: results.length,
    returned: Math.min(results.length, limit),
    truncated: results.length > limit,
    results: results.slice(0, limit),
    sources: [...new Set(sources)],
  };
}

module.exports = {
  name: 'memory_search',
  description: 'Urðr kalıcı hafızasında ve oturum geçmişinde ara. Tüm kalıcı kayıtları listelemek için query="*" kullan.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Aranacak metin; tüm hafıza için *' },
      scope: { type: 'string', description: 'all/memory/sessions (default: all)', enum: ['all', 'memory', 'sessions'] },
      username: { type: 'string', description: 'İsteğe bağlı kullanıcı kapsamı' },
      maxResults: { type: 'number', description: 'En fazla sonuç (arama: 20, *: 100, üst sınır: 200)' },
    },
    required: ['query'],
  },
  async execute(params) { return searchMemory(params); },
  _internal: { paths, markdownEntries, urdrRoots, listLegacyEntries, searchMemory },
};
