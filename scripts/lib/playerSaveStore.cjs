// Shared on-disk player save store for Browser and Electron.
//
// localStorage is origin-and-profile scoped: Chrome at :8123 and Electron at :41788 cannot see
// each other's slots even when they serve the same game. Both launchers therefore persist the
// same JSON files under one user-data directory and expose them on a loopback HTTP route.
'use strict';

const fs = require('node:fs');
const { createHash } = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: wait } = require('node:timers/promises');

const PLAYER_STORE_ROUTE = '/__spaceface_player_store';
const PLAYER_STORE_ORIGIN_ROUTE = '/__spaceface_player_store/origin';
const PLAYER_STORE_REL = 'player-saves';
const APP_FOLDER = 'SpaceFace';
const ALLOWED_KEY = /^(sf\.save\.[A-Za-z0-9._-]+|sf\.recovery\.[A-Za-z0-9._-]+|sf\.settings\.profile\.v1)$/;
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_KEYS = 64;
const MAX_VALUE_CHARS = 6 * 1024 * 1024;
const INDEX_KEY = 'sf.save.index';
const SAVE_KEY = /^sf\.(save|recovery)\.(?!deleted\.).+$/;
const TOMBSTONE_KEY = /^sf\.(save|recovery)\.deleted\.(.+)$/;
const ENVELOPE_STAMP = /^\s*\{\s*"fmt"\s*:\s*"spaceface-save(?:-gz)?"[^{}]*?"savedAt"\s*:\s*"([^"]+)"/;
const LOCK_WAIT_MS = 1500;
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
  // path.resolve('') is the cwd — validate the raw dir before resolving or an empty/blank
  // override silently reads (and in the writer, creates) save files in the working directory.
  const raw = String(dir || '').trim();
  if (!raw) return keys;
  const root = path.resolve(raw);
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
  try {
    fs.writeFileSync(tmp, contents, 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    // A failed write or promote must never cost the previous save: do NOT delete the
    // known-good primary to retry — that turns a transient failure into data loss. Clean up
    // only the temp this attempt created (a torn write may leave real bytes), best-effort,
    // and let the original error through.
    try { fs.rmSync(tmp, { force: true }); } catch { /* stray temp is recoverable; the save is not */ }
    throw err;
  }
}

function processExists(pid) {
  try { process.kill(pid, 0); return true; }
  catch (err) { return err.code !== 'ESRCH'; }
}

function removeEmptyLock(lock) {
  try { fs.rmdirSync(lock); }
  catch (err) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST', 'EPERM'].includes(err.code)) throw err; }
}

function withStoreWriter(root, work) {
  const lock = path.join(root, '.writer-lock');
  const stage = fs.mkdtempSync(path.join(root, `.writer-${process.pid}-`));
  const owner = path.basename(stage);
  try {
    fs.mkdirSync(path.join(stage, owner));
    try { fs.renameSync(stage, lock); }
    catch (err) {
      if (!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(err.code)) throw err;
      let owners = [];
      try { owners = fs.readdirSync(lock); }
      catch (err) { if (err.code !== 'ENOENT') throw err; }
      const marker = owners.length === 1 && /^\.writer-(\d+)-[\w-]+$/.exec(owners[0]);
      const stale = marker && !processExists(Number(marker[1]));
      if (stale) removeEmptyLock(path.join(lock, owners[0]));
      // A live lock always has a unique marker. Removing an empty directory
      // cannot remove a successor whose marker arrived after our read.
      if (!owners.length || stale) removeEmptyLock(lock);
      try { fs.renameSync(stage, lock); }
      catch (retry) {
        if (!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(retry.code)) throw retry;
        throw Object.assign(new Error('player store writer busy'), { code: 'STORE_BUSY' });
      }
    }
    try { return work(); }
    finally { fs.renameSync(lock, stage); }
  } finally {
    removeEmptyLock(path.join(stage, owner));
    removeEmptyLock(stage);
  }
}

async function writeLivePlayerStoreKeys(dir, patch, options) {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try { return writePlayerStoreKeysSync(dir, patch, options); }
    catch (error) {
      if (error?.code !== 'STORE_BUSY' || Date.now() >= deadline) throw error;
      await wait(25);
    }
  }
}

function readStoreValue(root, key) {
  try { return fs.readFileSync(path.join(root, fileNameForKey(key)), 'utf8'); }
  catch (err) { if (err.code === 'ENOENT') return null; throw err; }
}

function saveTime(raw) {
  if (typeof raw !== 'string') return 0;
  const stamp = ENVELOPE_STAMP.exec(raw.slice(0, 4096));
  if (stamp) return Date.parse(stamp[1]) || 0;
  try {
    const env = JSON.parse(raw);
    if (env?.fmt === 'spaceface-save' || env?.fmt === 'spaceface-save-gz') return Date.parse(env.savedAt) || 0;
  } catch { /* unrecognized legacy bytes have no generation */ }
  return 0;
}

function parseRecord(raw) {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

function preflightLivePatch(root, patch, expectedPrimary) {
  const conflicts = [];
  const repairs = new Set();
  const generationForKey = key => saveTime(readStoreValue(root, key));
  for (const [key, value] of Object.entries(patch)) {
    if (!isAllowedPlayerStoreKey(key) || key === INDEX_KEY) continue;
    const tombstone = TOMBSTONE_KEY.exec(key);
    if (tombstone) {
      const deletedAt = Date.parse(parseRecord(value)?.deletedAt) || 0;
      if (!deletedAt) continue;
      const previous = Date.parse(parseRecord(readStoreValue(root, key))?.deletedAt) || 0;
      if (deletedAt < previous) conflicts.push(key);
      const target = `sf.${tombstone[1]}.${tombstone[2]}`;
      if (Object.hasOwn(patch, target) && patch[target] === null && deletedAt < generationForKey(target)) {
        // A quota deletion can accompany a newer primary. Preserve the already
        // newer recovery copy without blocking that primary or filing a false delete.
        const primary = `sf.save.${tombstone[2]}`;
        if (target !== primary && saveTime(patch[primary]) > generationForKey(primary)) {
          delete patch[target];
          delete patch[key];
        } else conflicts.push(target);
      }
      continue;
    }
    if (!SAVE_KEY.test(key) || typeof value !== 'string') continue;
    const expected = Object.hasOwn(expectedPrimary, key) ? expectedPrimary[key] : undefined;
    const incomingTime = saveTime(value);
    if (!incomingTime && expected === undefined) continue;
    if (key.startsWith('sf.save.')) {
      const deletedAt = Date.parse(parseRecord(readStoreValue(root, `sf.save.deleted.${key.slice('sf.save.'.length)}`))?.deletedAt) || 0;
      if (deletedAt > 0 && deletedAt >= incomingTime) { conflicts.push(key); continue; }
    }
    const current = readStoreValue(root, key);
    if (expected !== undefined) {
      const digest = current === null ? null : createHash('sha256').update(current).digest('hex');
      if (current === value || expected === digest) repairs.add(key.slice('sf.save.'.length));
      else conflicts.push(key);
    } else if (incomingTime < saveTime(current)) {
      // A forward primary can rotate a local backup older than the drawer's
      // backup. Keep the stronger recovery copy while admitting that primary.
      const primary = key.replace(/^sf\.recovery\./, 'sf.save.');
      if (key !== primary && saveTime(patch[primary]) > generationForKey(primary)) delete patch[key];
      else conflicts.push(key);
    }
  }
  if (conflicts.length) throw Object.assign(new Error('player store generation conflict'), { code: 'GENERATION_CONFLICT', conflicts });
  if (typeof patch[INDEX_KEY] !== 'string') return;
  const incoming = parseRecord(patch[INDEX_KEY]);
  const current = parseRecord(readStoreValue(root, INDEX_KEY));
  if (!incoming || !current) return;
  let changed = false;
  for (const [slot, card] of Object.entries(current)) {
    const key = `sf.save.${slot}`;
    if (repairs.has(slot) || (Object.hasOwn(patch, key) && patch[key] == null)) continue;
    const priorTime = Date.parse(card?.savedAt) || 0;
    const nextTime = Object.hasOwn(incoming, slot) ? Date.parse(incoming[slot]?.savedAt) || 0 : 0;
    if (priorTime > nextTime) {
      Object.defineProperty(incoming, slot, { value: card, enumerable: true, configurable: true, writable: true });
      changed = true;
    }
  }
  if (changed) {
    const index = JSON.stringify(incoming);
    if (index.length > MAX_VALUE_CHARS) throw new Error(`player store value too large: ${INDEX_KEY}`);
    patch[INDEX_KEY] = index;
  }
}

function writePlayerStoreKeysSync(dir, patch, { returnKeys = true, live = false, expectedPrimary = {} } = {}) {
  const raw = String(dir || '').trim();
  if (!raw) throw new Error('player store directory is required');
  const root = path.resolve(raw);
  const entries = patch && typeof patch === 'object' ? Object.entries(patch) : [];
  if (entries.length > MAX_KEYS) throw new Error('player store patch has too many keys');
  // Reject a malformed batch before touching any slot, even if the offending
  // value follows a valid write or removal.
  for (const [key, value] of entries) {
    if (typeof value === 'string' && value.length > MAX_VALUE_CHARS && isAllowedPlayerStoreKey(key)) {
      throw new Error(`player store value too large: ${key}`);
    }
  }
  fs.mkdirSync(root, { recursive: true });
  return withStoreWriter(root, () => {
    const accepted = Object.fromEntries(entries);
    if (live) preflightLivePatch(root, accepted, expectedPrimary);
    for (const [key, value] of Object.entries(accepted)) {
      const fileName = fileNameForKey(key);
      if (!fileName) continue;
      const file = path.join(root, fileName);
      if (value == null) {
        try { fs.rmSync(file, { force: true }); } catch { /* already gone */ }
        continue;
      }
      if (typeof value !== 'string') continue;
      writeAtomicSync(file, value);
    }
    return returnKeys ? readPlayerStoreKeysSync(root) : undefined;
  });
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
    const expectedPrimary = payload.expectedPrimary === undefined ? {} : payload.expectedPrimary;
    if (!expectedPrimary || typeof expectedPrimary !== 'object' || Array.isArray(expectedPrimary)
      || Object.entries(expectedPrimary).some(([key, digest]) => key === INDEX_KEY
        || !key.startsWith('sf.save.') || !SAVE_KEY.test(key) || !isAllowedPlayerStoreKey(key)
        || !Object.hasOwn(patch, key) || typeof patch[key] !== 'string'
        || (digest !== null && (typeof digest !== 'string' || !/^[\da-f]{64}$/.test(digest))))) {
      sendJson(res, 400, { ok: false, error: 'bad_expected_primary' });
      return;
    }
    try {
      const minimal = String(req.headers?.prefer || '').split(',')
        .some((preference) => preference.trim().toLowerCase() === 'return=minimal');
      const keys = await writeLivePlayerStoreKeys(dir, patch, { returnKeys: !minimal, live: true, expectedPrimary });
      if (minimal) {
        res.writeHead(204, { 'Cache-Control': 'no-store', 'Preference-Applied': 'return=minimal' });
        res.end();
      } else {
        sendJson(res, 200, { ok: true, keys });
      }
    } catch (error) {
      if (error?.code === 'GENERATION_CONFLICT') {
        sendJson(res, 409, { ok: false, error: 'generation_conflict', keys: error.conflicts });
        return;
      }
      if (error?.code === 'STORE_BUSY') {
        sendJson(res, 503, { ok: false, error: 'store_busy' });
        return;
      }
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
