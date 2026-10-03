import { fnv1a } from './checksum.js';

const encodeSessions = new Map();
const validationSessions = new Map();

// FB-093 — write-side bound mirrors the import limit object: same byte ceiling, one law.
export const SAVE_WRITE_MAX_BYTES = 12 * 1024 * 1024;
export const SAVE_GZIP_FORMAT = 'spaceface-save-gz';

export function encodeSavePayload({ descriptor, data } = {}) {
  const dataJson = JSON.stringify(data);
  const checksum = fnv1a(dataJson);
  const envelope = { ...(descriptor || {}), checksum, data };
  return { json: JSON.stringify(envelope), checksum };
}

// A stored string can be a legacy plain envelope or a gzip wrapper — the wrapper keeps
// fmt/version/savedAt/checksum top-level so slot cards and quota reads stay synchronous;
// only `data` lives inside the compressed payload. Detection needs no decode.
export function isGzippedSaveText(raw) {
  if (typeof raw !== 'string' || raw.length < 16 || raw.charCodeAt(0) !== 123) return false;
  // The wrapper writes fmt first — gate on the head of the string so multi-MB legacy
  // saves never pay a full scan. The decode path re-parses authoritatively.
  return raw.slice(0, 96).indexOf('"' + SAVE_GZIP_FORMAT + '"') !== -1;
}

function bytesToBase64(bytes) {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function gzipText(json) {
  const stream = new Blob([json]).stream()
    .pipeThrough(new CompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  return bytesToBase64(new Uint8Array(buffer));
}

async function gunzipText(payload) {
  const bytes = base64ToBytes(payload);
  const stream = new Blob([bytes]).stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

export function saveGzipAvailable() {
  return typeof CompressionStream === 'function'
    && typeof DecompressionStream === 'function'
    && typeof Blob === 'function' && typeof btoa === 'function' && typeof atob === 'function';
}

// Wrap an encoded envelope JSON string into the stored gzip form. The wrapper is itself JSON:
// compression markers and card metadata stay legible without a decode pass.
export async function gzipEnvelopeJson(json) {
  const env = JSON.parse(json);
  const payload = await gzipText(json);
  return JSON.stringify({
    fmt: SAVE_GZIP_FORMAT,
    gz: 1,
    version: env.version,
    savedAt: env.savedAt || null,
    checksum: env.checksum || null,
    payload,
  });
}

// Decode a stored string to the inner envelope JSON text (identity for legacy plain saves).
export async function decodeSaveEnvelopeText(raw) {
  if (!isGzippedSaveText(raw)) return { ok: true, text: raw };
  let outer;
  try { outer = JSON.parse(raw); } catch (error) { return { ok: false, reason: 'parse_failed' }; }
  if (!outer || outer.fmt !== SAVE_GZIP_FORMAT || typeof outer.payload !== 'string') {
    return { ok: false, reason: 'bad_format' };
  }
  if (!saveGzipAvailable()) return { ok: false, reason: 'gz_unsupported' };
  try {
    return { ok: true, text: await gunzipText(outer.payload) };
  } catch (error) {
    return { ok: false, reason: 'gz_decode_failed' };
  }
}

function readSaveVersion(version, currentVersion) {
  if (!Number.isFinite(version)) return { ok: false, reason: 'bad_format' };
  if (Number.isFinite(currentVersion) && version > currentVersion) return { ok: false, reason: 'newer_version' };
  const ver = version | 0;
  if (ver < 1 || ver !== version) return { ok: false, reason: 'bad_format' };
  return { ok: true, version: ver };
}

export function validateSaveJson(raw, currentVersion) {
  if (!raw) return { ok: false, reason: 'no_save' };
  let envelope;
  try { envelope = JSON.parse(raw); }
  catch (error) { return { ok: false, reason: 'parse_failed' }; }
  if (!envelope || envelope.fmt !== 'spaceface-save') return { ok: false, reason: 'bad_format' };
  const versionRead = readSaveVersion(envelope.version, currentVersion);
  if (!versionRead.ok) return versionRead;
  const version = versionRead.version;
  if (!envelope.data || typeof envelope.data !== 'object') return { ok: false, reason: 'no_data' };
  if (envelope.checksum && fnv1a(JSON.stringify(envelope.data)) !== envelope.checksum) {
    return { ok: false, reason: 'checksum' };
  }
  const player = envelope.data.entities && envelope.data.entities.player;
  if (!player || typeof player !== 'object') return { ok: false, reason: 'no_player' };
  if (player.type && player.type !== 'ship') return { ok: false, reason: 'invalid_player' };
  return {
    ok: true,
    version,
    savedAt: envelope.savedAt || null,
    checksum: envelope.checksum || null,
  };
}

// Gzip-aware twin: stored compressed envelopes decode inside the worker first. The sync
// validateSaveJson above stays for callers that only ever see plain text.
export async function validateSaveJsonAsync(raw, currentVersion) {
  const decoded = await decodeSaveEnvelopeText(raw);
  if (!decoded.ok) return { ok: false, reason: decoded.reason };
  return validateSaveJson(decoded.text, currentVersion);
}

// Write-side encode with the import limit object applied pre-write and gzip inside the
// worker when the platform supports it. Over-limit saves fail with the preflight reason —
// never a silent truncated write.
export async function encodeSavePayloadFinal({ descriptor, data } = {}) {
  const encoded = encodeSavePayload({ descriptor, data });
  const preflight = preflightSaveImport(JSON.parse(encoded.json));
  if (!preflight.ok) return { ok: false, reason: preflight.reason, limit: preflight.limit, actual: preflight.actual };
  if (encoded.json.length > SAVE_WRITE_MAX_BYTES) {
    return { ok: false, reason: 'save_size_limit', limit: SAVE_WRITE_MAX_BYTES, actual: encoded.json.length };
  }
  if (saveGzipAvailable()) {
    try {
      return { ok: true, json: await gzipEnvelopeJson(encoded.json), checksum: encoded.checksum, gz: true };
    } catch (error) { /* fall through to the legacy plain write */ }
  }
  return { ok: true, json: encoded.json, checksum: encoded.checksum, gz: false };
}

/**
 * Full load-lane prepare in the worker: parse, format/version check, checksum, and the player
 * sanity reads a title Continue used to run synchronously on the main thread. The returned
 * envelope crosses postMessage as a fresh structured clone — the main thread's clonePlain step
 * is redundant on this path and intentionally skipped.
 */
export function restorePrepareSaveJson(raw, currentVersion) {
  if (!raw) return { ok: false, reason: 'no_save' };
  let envelope;
  try { envelope = JSON.parse(raw); }
  catch (error) { return { ok: false, reason: 'parse_failed' }; }
  if (!envelope || envelope.fmt !== 'spaceface-save') return { ok: false, reason: 'bad_format' };
  const versionRead = readSaveVersion(envelope.version, currentVersion);
  if (!versionRead.ok) return versionRead;
  if (!envelope.data || typeof envelope.data !== 'object') return { ok: false, reason: 'no_data' };
  if (envelope.checksum && fnv1a(JSON.stringify(envelope.data)) !== envelope.checksum) {
    return { ok: false, reason: 'checksum' };
  }
  const player = envelope.data.entities && envelope.data.entities.player;
  if (!player || typeof player !== 'object') return { ok: false, reason: 'no_player' };
  if (player.type && player.type !== 'ship') return { ok: false, reason: 'invalid_player' };
  const preflight = preflightSaveImport(envelope);
  if (!preflight.ok) return preflight;
  return { ok: true, version: versionRead.version, env: envelope, preflighted: true };
}

// Gzip-aware twin for the painted Continue lane: compressed envelopes decode inside the
// worker, then take the identical prepare path.
export async function restorePrepareSaveJsonAsync(raw, currentVersion) {
  const decoded = await decodeSaveEnvelopeText(raw);
  if (!decoded.ok) return { ok: false, reason: decoded.reason };
  return restorePrepareSaveJson(decoded.text, currentVersion);
}

// Full-envelope graph bound in the worker so the multi-MB walk never reaches the main thread.
// Import-free twin of saveSystem's preflightSaveImport — identical limits, reasons, and order.
const PREFLIGHT_MAX_DEPTH = 64;
const PREFLIGHT_MAX_NODES = 200_000;
const PREFLIGHT_MAX_COLLECTION_ITEMS = 50_000;
const PREFLIGHT_MAX_PERSISTENT_ENTITIES = 2_048;
export function preflightSaveImport(value) {
  const persistent = value && typeof value === 'object'
    && value.data && typeof value.data === 'object'
    && value.data.entities && typeof value.data.entities === 'object'
    ? value.data.entities.persistent
    : null;
  if (Array.isArray(persistent) && persistent.length > PREFLIGHT_MAX_PERSISTENT_ENTITIES) {
    return { ok: false, reason: 'import_persistent_entity_limit',
      limit: PREFLIGHT_MAX_PERSISTENT_ENTITIES, actual: persistent.length };
  }
  const active = new WeakSet();
  const stack = [{ value, depth: 0, exit: false }];
  let nodes = 0;
  while (stack.length) {
    const frame = stack.pop();
    const current = frame.value;
    if (frame.exit) {
      active.delete(current);
      continue;
    }
    if (frame.depth > PREFLIGHT_MAX_DEPTH) {
      return { ok: false, reason: 'import_depth_limit', limit: PREFLIGHT_MAX_DEPTH, actual: frame.depth };
    }
    nodes++;
    if (nodes > PREFLIGHT_MAX_NODES) {
      return { ok: false, reason: 'import_node_limit', limit: PREFLIGHT_MAX_NODES, actual: nodes };
    }
    if (current === null || typeof current !== 'object') continue;
    if (active.has(current)) {
      return { ok: false, reason: 'import_cycle', limit: PREFLIGHT_MAX_DEPTH, actual: frame.depth };
    }
    active.add(current);
    stack.push({ value: current, depth: frame.depth, exit: true });
    if (Array.isArray(current)) {
      if (current.length > PREFLIGHT_MAX_COLLECTION_ITEMS) {
        return { ok: false, reason: 'import_collection_limit',
          limit: PREFLIGHT_MAX_COLLECTION_ITEMS, actual: current.length };
      }
      for (let i = current.length - 1; i >= 0; i--) {
        stack.push({ value: current[i], depth: frame.depth + 1, exit: false });
      }
      continue;
    }
    const keys = Object.keys(current);
    if (keys.length > PREFLIGHT_MAX_COLLECTION_ITEMS) {
      return { ok: false, reason: 'import_collection_limit',
        limit: PREFLIGHT_MAX_COLLECTION_ITEMS, actual: keys.length };
    }
    for (let i = keys.length - 1; i >= 0; i--) {
      stack.push({ value: current[keys[i]], depth: frame.depth + 1, exit: false });
    }
  }
  return { ok: true, nodes };
}

export function handleSaveWorkerRequest(message) {
  const request = message || {};
  return handleSaveWorkerRequestCore(request, { asyncFinal: false });
}

// Async protocol twin of handleSaveWorkerRequest: bounded+compressed encodes and gzip-aware
// validates/prepares. The sync export stays for harnesses that simulate the worker inline.
export function handleSaveWorkerRequestAsync(message) {
  const request = message || {};
  return handleSaveWorkerRequestCore(request, { asyncFinal: true });
}

function handleSaveWorkerRequestCore(request, { asyncFinal } = {}) {
  if (request.type === 'restore_prepare') {
    const started = workerNow();
    const done = (result) => ({ id: request.id, type: 'restored_prepare', result, workerCpuMs: workerNow() - started });
    if (asyncFinal) {
      return Promise.resolve().then(() => restorePrepareSaveJsonAsync(
        request.payload && request.payload.raw,
        request.payload && request.payload.currentVersion,
      )).then(done, () => done({ ok: false, reason: 'load_failed' }));
    }
    let result;
    try {
      result = restorePrepareSaveJson(
        request.payload && request.payload.raw,
        request.payload && request.payload.currentVersion,
      );
    } catch (error) {
      result = { ok: false, reason: 'load_failed' };
    }
    return done(result);
  }
  if (request.type === 'validate_begin') {
    validationSessions.set(request.id, {
      currentVersion: request.payload && request.payload.currentVersion,
      chunks: [],
    });
    return null;
  }
  if (request.type === 'validate_part') {
    const session = validationSessions.get(request.id);
    if (!session) return { id: request.id, type: 'error', reason: 'missing_validate_session' };
    session.chunks.push(String(request.payload && request.payload.chunk || ''));
    return null;
  }
  if (request.type === 'validate_finish') {
    const session = validationSessions.get(request.id);
    validationSessions.delete(request.id);
    if (!session) return { id: request.id, type: 'error', reason: 'missing_validate_session' };
    const started = workerNow();
    const done = (result) => ({ id: request.id, type: 'validated', result, workerCpuMs: workerNow() - started });
    if (asyncFinal) {
      return validateSaveJsonAsync(session.chunks.join(''), session.currentVersion).then(done);
    }
    return done(validateSaveJson(session.chunks.join(''), session.currentVersion));
  }
  if (request.type === 'encode_begin') {
    encodeSessions.set(request.id, { descriptor: request.payload && request.payload.descriptor || {}, data: {} });
    return null;
  }
  if (request.type === 'encode_part') {
    const session = encodeSessions.get(request.id);
    if (!session) return { id: request.id, type: 'error', reason: 'missing_encode_session' };
    session.data[request.payload && request.payload.key] = request.payload && request.payload.value;
    return null;
  }
  if (request.type === 'encode_finish') {
    const session = encodeSessions.get(request.id);
    encodeSessions.delete(request.id);
    if (!session) return { id: request.id, type: 'error', reason: 'missing_encode_session' };
    const started = workerNow();
    const done = (encoded) => ({ id: request.id, type: 'encoded', ...encoded, workerCpuMs: workerNow() - started });
    if (asyncFinal) return encodeSavePayloadFinal(session).then(done);
    return done(encodeSavePayload(session));
  }
  if (request.type === 'encode') {
    const started = workerNow();
    const done = (encoded) => ({ id: request.id, type: 'encoded', ...encoded, workerCpuMs: workerNow() - started });
    if (asyncFinal) return encodeSavePayloadFinal(request.payload).then(done);
    return done(encodeSavePayload(request.payload));
  }
  if (request.type === 'validate') {
    const started = workerNow();
    const done = (result) => ({ id: request.id, type: 'validated', result, workerCpuMs: workerNow() - started });
    if (asyncFinal) {
      return validateSaveJsonAsync(
        request.payload && request.payload.raw,
        request.payload && request.payload.currentVersion,
      ).then(done);
    }
    return done(validateSaveJson(request.payload && request.payload.raw, request.payload && request.payload.currentVersion));
  }
  return { id: request.id, type: 'error', reason: 'unknown_request' };
}

function workerNow() {
  // This is synchronous worker-task elapsed time, not CPU accounting. Node's Windows CPU clocks
  // advance in scheduler-sized (~15 ms) quanta and therefore report 0 for normal save payloads.
  // performance.now() matches the browser/Electron worker clock and keeps sub-millisecond work
  // observable; main-thread blocking is reported independently by saveSystem.
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now() : Date.now();
}

// Blob-backed source keeps browser, minified bundle, and Electron on one path. This literal is
// intentionally self-contained: Function#toString output is not closure-safe after minification.
export const SAVE_WORKER_SOURCE = String.raw`
'use strict';
function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
function encodeSavePayload(input) {
  const descriptor = input && input.descriptor;
  const data = input && input.data;
  const dataJson = JSON.stringify(data);
  const checksum = fnv1a(dataJson);
  return { json: JSON.stringify(Object.assign({}, descriptor || {}, { checksum, data })), checksum };
}
var SAVE_WRITE_MAX_BYTES = ${SAVE_WRITE_MAX_BYTES};
var SAVE_GZIP_FORMAT = 'spaceface-save-gz';
function saveGzipAvailable() {
  return typeof CompressionStream === 'function'
    && typeof DecompressionStream === 'function'
    && typeof Blob === 'function' && typeof btoa === 'function' && typeof atob === 'function';
}
function bytesToBase64(bytes) {
  var binary = '';
  var CHUNK = 0x8000;
  for (var i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
function base64ToBytes(text) {
  var binary = atob(text);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function gzipText(json) {
  var stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer().then(function (buffer) {
    return bytesToBase64(new Uint8Array(buffer));
  });
}
function gunzipText(payload) {
  var stream = new Blob([base64ToBytes(payload)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
function isGzippedSaveText(raw) {
  return typeof raw === 'string' && raw.length >= 16 && raw.charCodeAt(0) === 123
    && raw.slice(0, 96).indexOf('"spaceface-save-gz"') !== -1;
}
function gzipEnvelopeJson(json) {
  var env = JSON.parse(json);
  return gzipText(json).then(function (payload) {
    return JSON.stringify({
      fmt: SAVE_GZIP_FORMAT, gz: 1, version: env.version,
      savedAt: env.savedAt || null, checksum: env.checksum || null, payload: payload,
    });
  });
}
function decodeSaveEnvelopeText(raw) {
  if (!isGzippedSaveText(raw)) return Promise.resolve({ ok: true, text: raw });
  var outer;
  try { outer = JSON.parse(raw); } catch (error) { return Promise.resolve({ ok: false, reason: 'parse_failed' }); }
  if (!outer || outer.fmt !== SAVE_GZIP_FORMAT || typeof outer.payload !== 'string') {
    return Promise.resolve({ ok: false, reason: 'bad_format' });
  }
  if (!saveGzipAvailable()) return Promise.resolve({ ok: false, reason: 'gz_unsupported' });
  return gunzipText(outer.payload).then(function (text) {
    return { ok: true, text: text };
  }, function () {
    return { ok: false, reason: 'gz_decode_failed' };
  });
}
// FB-093 — bounded, worker-side compressed encode: the import limit object applies pre-write;
// over-limit saves fail with a named reason, never a silent truncated write. Plain JSON stays
// the fallback when the platform lacks CompressionStream.
function encodeSavePayloadFinal(input) {
  var encoded;
  try { encoded = encodeSavePayload(input); }
  catch (error) { return Promise.resolve({ ok: false, reason: 'stringify_failed' }); }
  var envelope;
  try { envelope = JSON.parse(encoded.json); } catch (error) { return Promise.resolve({ ok: false, reason: 'stringify_failed' }); }
  var bound = preflightSaveImport(envelope);
  if (!bound.ok) return Promise.resolve({ ok: false, reason: bound.reason, limit: bound.limit, actual: bound.actual });
  if (encoded.json.length > SAVE_WRITE_MAX_BYTES) {
    return Promise.resolve({ ok: false, reason: 'save_size_limit', limit: SAVE_WRITE_MAX_BYTES, actual: encoded.json.length });
  }
  if (!saveGzipAvailable()) {
    return Promise.resolve({ ok: true, json: encoded.json, checksum: encoded.checksum, gz: false });
  }
  return gzipEnvelopeJson(encoded.json).then(function (json) {
    return { ok: true, json: json, checksum: encoded.checksum, gz: true };
  }, function () {
    return { ok: true, json: encoded.json, checksum: encoded.checksum, gz: false };
  });
}
function readSaveVersion(version, currentVersion) {
  if (!Number.isFinite(version)) return { ok: false, reason: 'bad_format' };
  if (Number.isFinite(currentVersion) && version > currentVersion) return { ok: false, reason: 'newer_version' };
  const ver = version | 0;
  if (ver < 1 || ver !== version) return { ok: false, reason: 'bad_format' };
  return { ok: true, version: ver };
}
function validateSaveJson(raw, currentVersion) {
  if (!raw) return { ok: false, reason: 'no_save' };
  let envelope;
  try { envelope = JSON.parse(raw); } catch (error) { return { ok: false, reason: 'parse_failed' }; }
  if (!envelope || envelope.fmt !== 'spaceface-save') return { ok: false, reason: 'bad_format' };
  const versionRead = readSaveVersion(envelope.version, currentVersion);
  if (!versionRead.ok) return versionRead;
  const version = versionRead.version;
  if (!envelope.data || typeof envelope.data !== 'object') return { ok: false, reason: 'no_data' };
  if (envelope.checksum && fnv1a(JSON.stringify(envelope.data)) !== envelope.checksum) {
    return { ok: false, reason: 'checksum' };
  }
  const player = envelope.data.entities && envelope.data.entities.player;
  if (!player || typeof player !== 'object') return { ok: false, reason: 'no_player' };
  if (player.type && player.type !== 'ship') return { ok: false, reason: 'invalid_player' };
  return { ok: true, version, savedAt: envelope.savedAt || null, checksum: envelope.checksum || null };
}
function restorePrepareSaveJson(raw, currentVersion) {
  if (!raw) return { ok: false, reason: 'no_save' };
  var envelope;
  try { envelope = JSON.parse(raw); } catch (error) { return { ok: false, reason: 'parse_failed' }; }
  if (!envelope || envelope.fmt !== 'spaceface-save') return { ok: false, reason: 'bad_format' };
  var versionRead = readSaveVersion(envelope.version, currentVersion);
  if (!versionRead.ok) return versionRead;
  if (!envelope.data || typeof envelope.data !== 'object') return { ok: false, reason: 'no_data' };
  if (envelope.checksum && fnv1a(JSON.stringify(envelope.data)) !== envelope.checksum) {
    return { ok: false, reason: 'checksum' };
  }
  var player = envelope.data.entities && envelope.data.entities.player;
  if (!player || typeof player !== 'object') return { ok: false, reason: 'no_player' };
  if (player.type && player.type !== 'ship') return { ok: false, reason: 'invalid_player' };
  var preflight = preflightSaveImport(envelope);
  if (!preflight.ok) return preflight;
  return { ok: true, version: versionRead.version, env: envelope, preflighted: true };
}
// Gzip-aware twins: stored compressed envelopes decode inside the worker first, then run the
// identical validate/prepare path on the inner plain JSON.
function validateSaveJsonAsync(raw, currentVersion) {
  return decodeSaveEnvelopeText(raw).then(function (decoded) {
    if (!decoded.ok) return { ok: false, reason: decoded.reason };
    return validateSaveJson(decoded.text, currentVersion);
  });
}
function restorePrepareSaveJsonAsync(raw, currentVersion) {
  return decodeSaveEnvelopeText(raw).then(function (decoded) {
    if (!decoded.ok) return { ok: false, reason: decoded.reason };
    return restorePrepareSaveJson(decoded.text, currentVersion);
  });
}
var PREFLIGHT_MAX_DEPTH = 64;
var PREFLIGHT_MAX_NODES = 200000;
var PREFLIGHT_MAX_COLLECTION_ITEMS = 50000;
var PREFLIGHT_MAX_PERSISTENT_ENTITIES = 2048;
// Import-free twin of saveSystem's preflightSaveImport — identical limits, reasons, and order.
function preflightSaveImport(value) {
  var persistent = value && typeof value === 'object'
    && value.data && typeof value.data === 'object'
    && value.data.entities && typeof value.data.entities === 'object'
    ? value.data.entities.persistent
    : null;
  if (Array.isArray(persistent) && persistent.length > PREFLIGHT_MAX_PERSISTENT_ENTITIES) {
    return { ok: false, reason: 'import_persistent_entity_limit',
      limit: PREFLIGHT_MAX_PERSISTENT_ENTITIES, actual: persistent.length };
  }
  var active = new WeakSet();
  var stack = [{ value: value, depth: 0, exit: false }];
  var nodes = 0;
  while (stack.length) {
    var frame = stack.pop();
    var current = frame.value;
    if (frame.exit) {
      active.delete(current);
      continue;
    }
    if (frame.depth > PREFLIGHT_MAX_DEPTH) {
      return { ok: false, reason: 'import_depth_limit', limit: PREFLIGHT_MAX_DEPTH, actual: frame.depth };
    }
    nodes++;
    if (nodes > PREFLIGHT_MAX_NODES) {
      return { ok: false, reason: 'import_node_limit', limit: PREFLIGHT_MAX_NODES, actual: nodes };
    }
    if (current === null || typeof current !== 'object') continue;
    if (active.has(current)) {
      return { ok: false, reason: 'import_cycle', limit: PREFLIGHT_MAX_DEPTH, actual: frame.depth };
    }
    active.add(current);
    stack.push({ value: current, depth: frame.depth, exit: true });
    if (Array.isArray(current)) {
      if (current.length > PREFLIGHT_MAX_COLLECTION_ITEMS) {
        return { ok: false, reason: 'import_collection_limit',
          limit: PREFLIGHT_MAX_COLLECTION_ITEMS, actual: current.length };
      }
      for (var i = current.length - 1; i >= 0; i--) {
        stack.push({ value: current[i], depth: frame.depth + 1, exit: false });
      }
      continue;
    }
    var keys = Object.keys(current);
    if (keys.length > PREFLIGHT_MAX_COLLECTION_ITEMS) {
      return { ok: false, reason: 'import_collection_limit',
        limit: PREFLIGHT_MAX_COLLECTION_ITEMS, actual: keys.length };
    }
    for (var j = keys.length - 1; j >= 0; j--) {
      stack.push({ value: current[keys[j]], depth: frame.depth + 1, exit: false });
    }
  }
  return { ok: true, nodes: nodes };
}
function now() {
  // Synchronous worker-task elapsed time. Do not use process/thread CPU clocks here: on Windows
  // their scheduler-quantized readings hide ordinary sub-15 ms encodes as zero.
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
self.addEventListener('message', function (event) {
  const request = event.data || {};
  try {
    self.__saveEncodeSessions = self.__saveEncodeSessions || new Map();
    self.__saveValidationSessions = self.__saveValidationSessions || new Map();
    if (request.type === 'validate_begin') {
      self.__saveValidationSessions.set(request.id, {
        currentVersion: request.payload && request.payload.currentVersion,
        chunks: [],
      });
      return;
    }
    if (request.type === 'validate_part') {
      const session = self.__saveValidationSessions.get(request.id);
      if (!session) throw new Error('missing_validate_session');
      session.chunks.push(String(request.payload && request.payload.chunk || ''));
      return;
    }
    if (request.type === 'validate_finish') {
      const session = self.__saveValidationSessions.get(request.id);
      self.__saveValidationSessions.delete(request.id);
      if (!session) throw new Error('missing_validate_session');
      const started = now();
      validateSaveJsonAsync(session.chunks.join(''), session.currentVersion).then(function (result) {
        self.postMessage({
          id: request.id,
          type: 'validated',
          result: result,
          workerCpuMs: now() - started,
        });
      });
      return;
    }
    if (request.type === 'encode_begin') {
      self.__saveEncodeSessions.set(request.id, { descriptor: request.payload && request.payload.descriptor || {}, data: {} });
      return;
    }
    if (request.type === 'encode_part') {
      const session = self.__saveEncodeSessions.get(request.id);
      if (!session) throw new Error('missing_encode_session');
      session.data[request.payload && request.payload.key] = request.payload && request.payload.value;
      return;
    }
    if (request.type === 'encode_finish') {
      const session = self.__saveEncodeSessions.get(request.id);
      self.__saveEncodeSessions.delete(request.id);
      if (!session) throw new Error('missing_encode_session');
      const started = now();
      encodeSavePayloadFinal(session).then(function (encoded) {
        self.postMessage(Object.assign({ id: request.id, type: 'encoded' }, encoded, {
          workerCpuMs: now() - started,
        }));
      });
      return;
    }
    if (request.type === 'restore_prepare') {
      var startedPrepare = now();
      restorePrepareSaveJsonAsync(
        request.payload && request.payload.raw,
        request.payload && request.payload.currentVersion,
      ).then(function (prepared) {
        self.postMessage({
          id: request.id,
          type: 'restored_prepare',
          result: prepared,
          workerCpuMs: now() - startedPrepare,
        });
      }, function () {
        self.postMessage({
          id: request.id,
          type: 'restored_prepare',
          result: { ok: false, reason: 'load_failed' },
          workerCpuMs: now() - startedPrepare,
        });
      });
      return;
    }
    const started = now();
    if (request.type === 'encode') {
      encodeSavePayloadFinal(request.payload).then(function (encoded) {
        self.postMessage(Object.assign({ id: request.id, type: 'encoded' }, encoded, {
          workerCpuMs: now() - started,
        }));
      });
      return;
    }
    if (request.type === 'validate') {
      validateSaveJsonAsync(request.payload && request.payload.raw, request.payload && request.payload.currentVersion).then(function (result) {
        self.postMessage({
          id: request.id,
          type: 'validated',
          result: result,
          workerCpuMs: now() - started,
        });
      });
      return;
    }
    self.postMessage({ id: request.id, type: 'error', reason: 'unknown_request' });
  } catch (error) {
    self.postMessage({ id: request.id, type: 'error', reason: 'worker_failed' });
  }
});`;

if (typeof WorkerGlobalScope !== 'undefined'
  && typeof self !== 'undefined'
  && self instanceof WorkerGlobalScope) {
  self.addEventListener('message', (event) => {
    try {
      Promise.resolve(handleSaveWorkerRequestAsync(event.data)).then((response) => {
        if (response) self.postMessage(response);
      }).catch(() => {
        self.postMessage({ id: event.data && event.data.id, type: 'error', reason: 'worker_failed' });
      });
    }
    catch (error) {
      self.postMessage({ id: event.data && event.data.id, type: 'error', reason: 'worker_failed' });
    }
  });
}
