// Shared on-disk player save store for Browser and Electron.
//
// localStorage is origin-and-profile scoped: Chrome at :8123 and Electron at :41788 cannot see
// each other's slots even when they serve the same game. Both launchers therefore persist the
// same JSON files under one user-data directory and expose them on a loopback HTTP route.
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const PLAYER_STORE_ROUTE = '/__spaceface_player_store';
const PLAYER_STORE_ORIGIN_ROUTE = '/__spaceface_player_store/origin';
const PLAYER_STORE_REL = 'player-saves';
const APP_FOLDER = 'SpaceFace';
const ALLOWED_KEY = /^(sf\.save\.[A-Za-z0-9._-]+|sf\.recovery\.[A-Za-z0-9._-]+|sf\.settings\.profile\.v1)$/;
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_KEYS = 64;
const MAX_VALUE_CHARS = 6 * 1024 * 1024;
const LOCAL_STORAGE_DUMP_SOURCE = [
  '(() => {',
  '  const keys = {};',
  '  try {',
  '    for (let i = 0; i < localStorage.length; i++) {',
  '      const key = localStorage.key(i);',
  '      if (!key) continue;',
  '      if (key.startsWith("sf.save.") || key.startsWith("sf.recovery.") || key.startsWith("sf.settings.")) {',
  '        keys[key] = localStorage.getItem(key);',
  '      }',
  '    }',
  '  } catch (error) {}',
  '  return keys;',
  '})()',
].join('\n');

function isAllowedPlayerStoreKey(key) {
  return typeof key === 'string' && ALLOWED_KEY.test(key);
}

function resolvePlayerSaveDir(env = process.env) {
  const override = String(env && env.SPACEFACE_PLAYER_STORE_DIR || '').trim();
  if (override) return path.resolve(override);
  if (process.platform === 'win32') {
    const appData = env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, APP_FOLDER, PLAYER_STORE_REL);
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', APP_FOLDER, PLAYER_STORE_REL);
  }
  const dataHome = env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(dataHome, APP_FOLDER, PLAYER_STORE_REL);
}

function envHasOwn(env, key) {
  if (!env) return false;
  try { return Object.prototype.hasOwnProperty.call(env, key); }
  catch { return Object.keys(env).includes(key); }
}

// Empty SPACEFACE_PLAYER_STORE_DIR is an explicit unmount (isolated harnesses).
// An unset variable still uses the machine player drawer so `npm start` matches the launchers.
function resolveMountedPlayerStoreDir(env = process.env) {
  if (envHasOwn(env, 'SPACEFACE_PLAYER_STORE_DIR')) {
    const override = String(env.SPACEFACE_PLAYER_STORE_DIR || '').trim();
    return override ? path.resolve(override) : '';
  }
  return resolvePlayerSaveDir(env);
}

function fileNameForKey(key) {
  if (!isAllowedPlayerStoreKey(key)) return null;
  return `${key}.json`;
}

function keyFromFileName(name) {
  if (typeof name !== 'string' || !name.endsWith('.json')) return null;
  const key = name.slice(0, -'.json'.length);
  return isAllowedPlayerStoreKey(key) ? key : null;
}

function readPlayerStoreKeysSync(dir) {
  const keys = {};
  const root = path.resolve(String(dir || ''));
  if (!root) return keys;
  let entries;
  try { entries = fs.readdirSync(root); }
  catch { return keys; }
  for (const name of entries) {
    const key = keyFromFileName(name);
    if (!key) continue;
    try {
      const raw = fs.readFileSync(path.join(root, name), 'utf8');
      if (typeof raw === 'string') keys[key] = raw;
    } catch { /* skip unreadable slot files */ }
  }
  return keys;
}

function playerStoreHasSaves(dir) {
  const keys = readPlayerStoreKeysSync(dir);
  for (const key of Object.keys(keys)) {
    if (key === 'sf.save.index' || key.startsWith('sf.settings.')) continue;
    if (key.startsWith('sf.save.') || key.startsWith('sf.recovery.')) return true;
  }
  return false;
}

function writeAtomicSync(file, contents) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, contents, 'utf8');
  try {
    fs.renameSync(tmp, file);
  } catch {
    try { fs.rmSync(file, { force: true }); } catch { /* replace below */ }
    fs.renameSync(tmp, file);
  }
}

function writePlayerStoreKeysSync(dir, patch) {
  const root = path.resolve(String(dir || ''));
  if (!root) throw new Error('player store directory is required');
  fs.mkdirSync(root, { recursive: true });
  const entries = patch && typeof patch === 'object' ? Object.entries(patch) : [];
  if (entries.length > MAX_KEYS) throw new Error('player store patch has too many keys');
  for (const [key, value] of entries) {
    const fileName = fileNameForKey(key);
    if (!fileName) continue;
    const file = path.join(root, fileName);
    if (value == null) {
      try { fs.rmSync(file, { force: true }); } catch { /* already gone */ }
      continue;
    }
    if (typeof value !== 'string') continue;
    if (value.length > MAX_VALUE_CHARS) throw new Error(`player store value too large: ${key}`);
    writeAtomicSync(file, value);
  }
  return readPlayerStoreKeysSync(root);
}

function jsonHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...jsonHeaders(),
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(Object.assign(new Error('payload too large'), { code: 'PAYLOAD_TOO_LARGE' }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function originDocument() {
  return '<!doctype html><meta charset="utf-8"><title>SpaceFace</title>';
}

function isPlayerStoreUrl(urlPath) {
  return urlPath === PLAYER_STORE_ROUTE
    || urlPath.startsWith(`${PLAYER_STORE_ROUTE}?`)
    || urlPath === PLAYER_STORE_ORIGIN_ROUTE;
}

async function handlePlayerStoreRequest(req, res, dir) {
  const method = req.method || 'GET';
  const url = req.url || '/';
  let urlPath;
  try {
    urlPath = decodeURIComponent(String(url).split('?')[0]);
  } catch {
    sendJson(res, 400, { ok: false, error: 'bad_url' });
    return;
  }

  if (method === 'GET' && urlPath === PLAYER_STORE_ORIGIN_ROUTE) {
    const body = originDocument();
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
    return;
  }

  if (method === 'GET' && urlPath === PLAYER_STORE_ROUTE) {
    sendJson(res, 200, { keys: readPlayerStoreKeysSync(dir) });
    return;
  }

  if (method === 'PUT' && urlPath === PLAYER_STORE_ROUTE) {
    let raw;
    try { raw = await readRequestBody(req, MAX_BODY_BYTES); }
    catch (error) {
      if (error && error.code === 'PAYLOAD_TOO_LARGE') {
        sendJson(res, 413, { ok: false, error: 'payload_too_large' });
        return;
      }
      sendJson(res, 400, { ok: false, error: 'read_failed' });
      return;
    }
    let payload;
    try { payload = JSON.parse(raw); }
    catch {
      sendJson(res, 400, { ok: false, error: 'parse_failed' });
      return;
    }
    const patch = payload && payload.keys && typeof payload.keys === 'object' ? payload.keys : null;
    if (!patch) {
      sendJson(res, 400, { ok: false, error: 'missing_keys' });
      return;
    }
    try {
      const keys = writePlayerStoreKeysSync(dir, patch);
      sendJson(res, 200, { ok: true, keys });
    } catch (error) {
      const message = error && error.message ? String(error.message) : '';
      if (message.includes('too many keys')) {
        sendJson(res, 400, { ok: false, error: 'too_many_keys' });
        return;
      }
      if (message.includes('too large')) {
        sendJson(res, 400, { ok: false, error: 'value_too_large' });
        return;
      }
      sendJson(res, 400, { ok: false, error: 'write_failed' });
    }
    return;
  }

  res.writeHead(405, { Allow: 'GET, PUT', 'Cache-Control': 'no-store' });
  res.end('Method Not Allowed');
}

function attachPlayerStore(createOpts = {}) {
  const extraRoutes = Array.isArray(createOpts.extraRoutes) ? [...createOpts.extraRoutes] : [];
  const dir = createOpts.playerStoreDir ? path.resolve(String(createOpts.playerStoreDir)) : '';
  if (!dir) return extraRoutes;
  extraRoutes.unshift({
    test(method, url) {
      let urlPath;
      try {
        urlPath = decodeURIComponent(String(url || '/').split('?')[0]);
      } catch {
        return false;
      }
      return isPlayerStoreUrl(urlPath) && (method === 'GET' || method === 'PUT' || method === 'DELETE');
    },
    handle(req, res) {
      return handlePlayerStoreRequest(req, res, dir);
    },
  });
  return extraRoutes;
}

module.exports = {
  PLAYER_STORE_ROUTE,
  PLAYER_STORE_ORIGIN_ROUTE,
  LOCAL_STORAGE_DUMP_SOURCE,
  isAllowedPlayerStoreKey,
  resolvePlayerSaveDir,
  resolveMountedPlayerStoreDir,
  readPlayerStoreKeysSync,
  writePlayerStoreKeysSync,
  playerStoreHasSaves,
  handlePlayerStoreRequest,
  attachPlayerStore,
};
