import { fnv1a } from './checksum.js';

const encodeSessions = new Map();
const validationSessions = new Map();

export function encodeSavePayload({ descriptor, data } = {}) {
  const dataJson = JSON.stringify(data);
  const checksum = fnv1a(dataJson);
  const envelope = { ...(descriptor || {}), checksum, data };
  return { json: JSON.stringify(envelope), checksum };
}

export function validateSaveJson(raw, currentVersion) {
  if (!raw) return { ok: false, reason: 'no_save' };
  let envelope;
  try { envelope = JSON.parse(raw); }
  catch (error) { return { ok: false, reason: 'parse_failed' }; }
  if (!envelope || envelope.fmt !== 'spaceface-save') return { ok: false, reason: 'bad_format' };
  const version = envelope.version | 0;
  if (Number.isFinite(currentVersion) && version > currentVersion) return { ok: false, reason: 'newer_version' };
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

export function handleSaveWorkerRequest(message) {
  const request = message || {};
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
function validateSaveJson(raw, currentVersion) {
  if (!raw) return { ok: false, reason: 'no_save' };
  let envelope;
  try { envelope = JSON.parse(raw); } catch (error) { return { ok: false, reason: 'parse_failed' }; }
  if (!envelope || envelope.fmt !== 'spaceface-save') return { ok: false, reason: 'bad_format' };
  const version = envelope.version | 0;
  if (Number.isFinite(currentVersion) && version > currentVersion) return { ok: false, reason: 'newer_version' };
  if (!envelope.data || typeof envelope.data !== 'object') return { ok: false, reason: 'no_data' };
  if (envelope.checksum && fnv1a(JSON.stringify(envelope.data)) !== envelope.checksum) {
    return { ok: false, reason: 'checksum' };
  }
  const player = envelope.data.entities && envelope.data.entities.player;
  if (!player || typeof player !== 'object') return { ok: false, reason: 'no_player' };
  if (player.type && player.type !== 'ship') return { ok: false, reason: 'invalid_player' };
  return { ok: true, version, savedAt: envelope.savedAt || null, checksum: envelope.checksum || null };
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
