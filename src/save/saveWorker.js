import { fnv1a } from './checksum.js';

const encodeSessions = new Map();
const validationSessions = new Map();

export function encodeSavePayload({ descriptor, data } = {}) {
  const dataJson = JSON.stringify(data);
  const checksum = fnv1a(dataJson);
  const envelope = { ...(descriptor || {}), checksum, data };
  return { json: JSON.stringify(envelope), checksum };
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
  if (request.type === 'restore_prepare') {
    const started = workerNow();
    let result;
    try {
      result = restorePrepareSaveJson(
        request.payload && request.payload.raw,
        request.payload && request.payload.currentVersion,
      );
    } catch (error) {
      result = { ok: false, reason: 'load_failed' };
    }
    return { id: request.id, type: 'restored_prepare', result, workerCpuMs: workerNow() - started };
  }
  if (request.type === 'restore_prepare_meta') {
    const started = workerNow();
    let result;
    try {
      result = restorePrepareSaveJson(
        request.payload && request.payload.raw,
        request.payload && request.payload.currentVersion,
      );
    } catch (error) {
      result = { ok: false, reason: 'load_failed' };
    }
    // Meta lane: the caller only wants the verdict — the multi-MB envelope clone must not
    // cross postMessage for a slot nobody will load.
    if (result && typeof result === 'object' && 'env' in result) {
      const { env: _env, ...meta } = result;
      void _env;
      result = meta;
    }
    return { id: request.id, type: 'restored_prepare', result, workerCpuMs: workerNow() - started };
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
    return {
      id: request.id,
      type: 'validated',
      result: validateSaveJson(session.chunks.join(''), session.currentVersion),
      workerCpuMs: workerNow() - started,
    };
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
    const encoded = encodeSavePayload(session);
    return { id: request.id, type: 'encoded', ...encoded, workerCpuMs: workerNow() - started };
  }
  if (request.type === 'encode') {
    const started = workerNow();
    const encoded = encodeSavePayload(request.payload);
    return { id: request.id, type: 'encoded', ...encoded, workerCpuMs: workerNow() - started };
  }
  if (request.type === 'validate') {
    const started = workerNow();
    return {
      id: request.id,
      type: 'validated',
      result: validateSaveJson(request.payload && request.payload.raw, request.payload && request.payload.currentVersion),
      workerCpuMs: workerNow() - started,
    };
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
      self.postMessage({
        id: request.id,
        type: 'validated',
        result: validateSaveJson(session.chunks.join(''), session.currentVersion),
        workerCpuMs: now() - started,
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
      self.postMessage(Object.assign({ id: request.id, type: 'encoded' }, encodeSavePayload(session), {
        workerCpuMs: now() - started,
      }));
      return;
    }
    if (request.type === 'restore_prepare' || request.type === 'restore_prepare_meta') {
      var startedPrepare = now();
      var prepared;
      try {
        prepared = restorePrepareSaveJson(
          request.payload && request.payload.raw,
          request.payload && request.payload.currentVersion,
        );
      } catch (error) {
        prepared = { ok: false, reason: 'load_failed' };
      }
      // Meta lane: verdict only — the multi-MB envelope clone must not cross postMessage for a
      // slot nobody will load.
      if (request.type === 'restore_prepare_meta'
          && prepared && typeof prepared === 'object' && prepared.env !== undefined) {
        var meta = {};
        for (var mk in prepared) {
          if (mk !== 'env') meta[mk] = prepared[mk];
        }
        prepared = meta;
      }
      self.postMessage({
        id: request.id,
        type: 'restored_prepare',
        result: prepared,
        workerCpuMs: now() - startedPrepare,
      });
      return;
    }
    const started = now();
    if (request.type === 'encode') {
      self.postMessage(Object.assign({ id: request.id, type: 'encoded' }, encodeSavePayload(request.payload), {
        workerCpuMs: now() - started,
      }));
      return;
    }
    if (request.type === 'validate') {
      self.postMessage({
        id: request.id,
        type: 'validated',
        result: validateSaveJson(request.payload && request.payload.raw, request.payload && request.payload.currentVersion),
        workerCpuMs: now() - started,
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
      const response = handleSaveWorkerRequest(event.data);
      if (response) self.postMessage(response);
    }
    catch (error) {
      self.postMessage({ id: event.data && event.data.id, type: 'error', reason: 'worker_failed' });
    }
  });
}
