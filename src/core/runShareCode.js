// Crucible run share codes (PQ-160.02).
//
// The sim is deterministic: a seed plus the build the run launched with is enough for a second
// machine to reproduce the same run. Sharing is files and codes — never a service (PQ-160
// non-goal). This module is the pure codec: it turns a compact canonical payload into a
// checksummed, paste-able text block and back. It knows nothing about DOM, storage, or rendering.
//
//   Run code:    SFC1-<base64url payload>-<checksum8>
//   Ghost block: SFG1-<base64url payload>-<checksum8>   (ghost tape canonicalization stays owned
//                by systems/survivalRecords.js; this envelope only carries the canonical tape)
//
// The checksum is FNV-1a over the canonical payload text — the same hash family the lab and the
// ghost tape already use — so a corrupted or truncated paste fails closed instead of silently
// seeding a different run.

import { hash32 } from './rng.js';

export const RUN_SHARE_PREFIX = 'SFC1';
export const GHOST_SHARE_PREFIX = 'SFG1';
export const SHARE_CODE_VERSION = 1;

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_LOOKUP = (() => {
  const table = new Map();
  for (let i = 0; i < B64_ALPHABET.length; i += 1) table.set(B64_ALPHABET[i], i);
  return table;
})();

function utf8Encode(text) {
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(text);
  const out = [];
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code < 0x80) { out.push(code); continue; }
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return Uint8Array.from(out);
}

function utf8Decode(bytes) {
  if (typeof TextDecoder === 'function') return new TextDecoder().decode(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    if (b < 0x80) { out += String.fromCharCode(b); continue; }
    if (b < 0xe0) { out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[++i] & 0x3f)); continue; }
    if (b < 0xf0) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f));
      continue;
    }
    const cp = ((b & 0x07) << 18) | ((bytes[++i] & 0x3f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f);
    out += String.fromCharCode(0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff));
  }
  return out;
}

function b64urlEncode(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : null;
    const c = i + 2 < bytes.length ? bytes[i + 2] : null;
    out += B64_ALPHABET[a >> 2];
    out += B64_ALPHABET[((a & 0x03) << 4) | (b == null ? 0 : b >> 4)];
    if (b != null) out += B64_ALPHABET[((b & 0x0f) << 2) | (c == null ? 0 : c >> 6)];
    if (c != null) out += B64_ALPHABET[c & 0x3f];
  }
  return out;
}

function b64urlDecode(text) {
  const out = [];
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < text.length; i += 1) {
    const v = B64_LOOKUP.get(text[i]);
    if (v === undefined) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

/** Canonical JSON: sorted object keys, no whitespace, so the checksum is machine-stable. */
export function stableShareJson(value) {
  if (value === null) return 'null';
  const kind = typeof value;
  if (kind === 'number') return Number.isFinite(value) ? JSON.stringify(value === 0 ? 0 : value) : 'null';
  if (kind === 'string' || kind === 'boolean') return JSON.stringify(value);
  if (kind !== 'object') return 'null';
  if (Array.isArray(value)) {
    let out = '[';
    for (let i = 0; i < value.length; i += 1) {
      if (i) out += ',';
      out += stableShareJson(value[i]);
    }
    return out + ']';
  }
  const keys = Object.keys(value).sort();
  let out = '{';
  let first = true;
  for (const key of keys) {
    const child = value[key];
    if (child === undefined) continue;
    if (!first) out += ',';
    first = false;
    out += JSON.stringify(key) + ':' + stableShareJson(child);
  }
  return out + '}';
}

function shareChecksum(prefix, payloadJson) {
  return hash32('spaceface-share-v1', prefix, payloadJson).toString(16).padStart(8, '0');
}

/**
 * Encode a payload object as `<PREFIX>-<base64url>-<checksum8>`. Returns null when the payload
 * cannot be represented (non-object input).
 */
export function encodeShareBlock(prefix, payload) {
  if (typeof prefix !== 'string' || !prefix) return null;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const json = stableShareJson(payload);
  return `${prefix}-${b64urlEncode(utf8Encode(json))}-${shareChecksum(prefix, json)}`;
}

/**
 * Decode a share block. Whitespace and line breaks inside the pasted text are stripped — a code
 * copied out of a wrapped chat line must still verify. Fails closed on a bad prefix, a malformed
 * payload, or a checksum mismatch.
 */
export function decodeShareBlock(text, expectedPrefix = null) {
  const raw = typeof text === 'string' ? text.replace(/\s+/g, '') : '';
  const firstDash = raw.indexOf('-');
  const lastDash = raw.lastIndexOf('-');
  if (firstDash <= 0 || lastDash <= firstDash + 1) {
    return { ok: false, error: 'not a share code' };
  }
  const prefix = raw.slice(0, firstDash);
  if (expectedPrefix && prefix !== expectedPrefix) {
    return { ok: false, error: `expected a ${expectedPrefix} code`, prefix };
  }
  const body = raw.slice(firstDash + 1, lastDash);
  const checksum = raw.slice(lastDash + 1);
  if (!/^[0-9a-fA-F]{8}$/.test(checksum)) {
    return { ok: false, error: 'checksum missing or malformed', prefix };
  }
  const bytes = b64urlDecode(body);
  if (!bytes) return { ok: false, error: 'payload is not valid base64url', prefix };
  let payload;
  try {
    payload = JSON.parse(utf8Decode(bytes));
  } catch {
    return { ok: false, error: 'payload is not valid JSON', prefix };
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'payload is not an object', prefix };
  }
  const canonical = stableShareJson(payload);
  if (shareChecksum(prefix, canonical) !== checksum.toLowerCase()) {
    return { ok: false, error: 'checksum mismatch — the code is corrupted or truncated', prefix };
  }
  return { ok: true, prefix, payload };
}

/* ------------------------------------------------------------------------- *
 * Run share spec: the whole launch identity of a Crucible run.
 *
 *   v  codec version (1)
 *   s  seed (uint32, 1..0xffffffff)
 *   r  ruleset ('swarm', 'scored', …)
 *   a  arenaId
 *   k  starterId  — the door's starter package; resolves hull + loadout
 *   h  hullId     — kept alongside k so a build that retired the package can still reproduce
 *   l  loadout    — [[slotIndex, defId], …] sorted by slot
 *   m  mutators   — sorted unique challenge mutator ids
 *   d  dailyDateKey  (optional; the shared run settles onto that date's board)
 *   w  weeklyMutatorId (optional)
 *   g  ghostHash  (optional uint32 — the exporter's ghost tape hash; resolves only if the
 *      receiving machine also imported the ghost block)
 * ------------------------------------------------------------------------- */

function asId(value) {
  return typeof value === 'string' && value ? value : null;
}

function asUint(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n > 0xffffffff ? 0xffffffff : n >>> 0;
}

function asHash(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return null;
  return n >>> 0;
}

function asDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/** Normalize a loose spec into the canonical share payload. Null when no usable seed. */
export function normalizeRunShareSpec(input) {
  const src = input && typeof input === 'object' ? input : {};
  const seed = asUint(src.s != null ? src.s : src.seed);
  if (seed == null) return null;
  const spec = { v: SHARE_CODE_VERSION, s: seed };
  const ruleset = asId(src.r != null ? src.r : src.ruleset);
  if (ruleset) spec.r = ruleset;
  const arenaId = asId(src.a != null ? src.a : src.arenaId);
  if (arenaId) spec.a = arenaId;
  const starterId = asId(src.k != null ? src.k : src.starterId);
  if (starterId) spec.k = starterId;
  const hullId = asId(src.h != null ? src.h : src.hullId);
  if (hullId) spec.h = hullId;
  const loadoutIn = src.l != null ? src.l : src.loadout;
  if (Array.isArray(loadoutIn) && loadoutIn.length) {
    const pairs = [];
    for (const entry of loadoutIn) {
      const slot = Array.isArray(entry) ? entry[0] : (entry && entry.slotIndex);
      const defId = Array.isArray(entry) ? entry[1] : (entry && entry.defId);
      if (!Number.isInteger(slot) || slot < 0 || typeof defId !== 'string' || !defId) continue;
      pairs.push([slot, defId]);
    }
    pairs.sort((a, b) => (a[0] - b[0]) || a[1].localeCompare(b[1]));
    if (pairs.length) spec.l = pairs;
  }
  const mutatorsIn = src.m != null ? src.m : src.mutators;
  if (Array.isArray(mutatorsIn) && mutatorsIn.length) {
    const seen = new Set();
    const list = [];
    for (const item of mutatorsIn) {
      const id = asId(item);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      list.push(id);
    }
    list.sort();
    if (list.length) spec.m = list;
  }
  const dailyDateKey = asDateKey(src.d != null ? src.d : src.dailyDateKey);
  if (dailyDateKey) spec.d = dailyDateKey;
  const weeklyMutatorId = asId(src.w != null ? src.w : src.weeklyMutatorId);
  if (weeklyMutatorId) spec.w = weeklyMutatorId;
  const ghostHash = asHash(src.g != null ? src.g : src.ghostHash);
  if (ghostHash != null) spec.g = ghostHash;
  return spec;
}

/** Encode a run share spec. Null when the spec has no usable seed. */
export function encodeRunShareCode(spec) {
  const normalized = normalizeRunShareSpec(spec);
  if (!normalized) return null;
  return encodeShareBlock(RUN_SHARE_PREFIX, normalized);
}

/** Decode a run share code into a normalized spec: { ok, spec } or { ok:false, error }. */
export function decodeRunShareCode(code) {
  const res = decodeShareBlock(code, RUN_SHARE_PREFIX);
  if (!res.ok) return { ok: false, error: res.error || 'invalid run code' };
  const spec = normalizeRunShareSpec(res.payload);
  if (!spec) return { ok: false, error: 'code carries no run seed' };
  return { ok: true, spec };
}

/** Long-form field names for callers that want the door's vocabulary. */
export function runShareSpecFields(spec) {
  const s = spec && typeof spec === 'object' ? spec : {};
  return {
    seed: Number.isInteger(s.s) ? s.s >>> 0 : null,
    ruleset: asId(s.r),
    arenaId: asId(s.a),
    starterId: asId(s.k),
    hullId: asId(s.h),
    loadout: Array.isArray(s.l) ? s.l.map((pair) => ({ slotIndex: pair[0], defId: pair[1] })) : [],
    mutators: Array.isArray(s.m) ? s.m.slice() : [],
    dailyDateKey: asDateKey(s.d),
    weeklyMutatorId: asId(s.w),
    ghostHash: asHash(s.g),
  };
}
