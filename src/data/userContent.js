// src/data/userContent.js — runtime half of the user content loader (PQ-172.00).
//
// The game server scans the mounted user content directory and injects the parsed payload onto
// globalThis.__SF_USER_MODS__ as a synchronous classic script BEFORE this module graph evaluates
// (scripts/lib/userContentStore.cjs). That ordering is load-bearing: this file's siblings export
// definition arrays that ~70 consumers snapshot into Maps at import-eval time, so mod content must
// already be visible here when those modules evaluate. A fetch() in main.js would be too late.
//
// This module is deliberately a THIN transport + bookkeeping layer:
//   * It normalizes the payload into per-kind candidate lists with provenance ({modId, file}).
//   * Merge sites in weapons.js / modules.js / encounters.js / sectorZones.js run the real
//     field/vocab validation (they own their own vocabularies) and call accept/reject here so
//     the settings screen can show what loaded and what was refused.
//   * Node checks/tests install a payload by assigning globalThis.__SF_USER_MODS__ before
//     importing the data modules (see scripts/check-data.mjs --user-content-dir).
//
// No imports — stays dependency-free so every data module can import it without cycles.
// Pure data + pure helpers: no RNG, no Date, no side effects beyond this module's own bookkeeping.

const PAYLOAD_SCHEMA = 'spaceface.userContent.v1';
export const USER_CONTENT_KINDS = Object.freeze(['weapons', 'modules', 'encounters', 'places']);

function normalizePayload(raw) {
  if (!raw || typeof raw !== 'object' || raw.schema !== PAYLOAD_SCHEMA || !Array.isArray(raw.mods)) {
    return { source: null, mods: [], malformed: raw == null ? false : true };
  }
  const mods = [];
  for (const entry of raw.mods) {
    if (!entry || typeof entry !== 'object') continue;
    const content = {};
    for (const kind of USER_CONTENT_KINDS) {
      const list = Array.isArray(entry.content?.[kind]) ? entry.content[kind] : [];
      content[kind] = list.filter((c) => c && typeof c === 'object' && c.data != null);
    }
    mods.push({
      id: String(entry.id || ''),
      name: String(entry.name || entry.id || ''),
      version: String(entry.version || ''),
      description: String(entry.description || ''),
      author: String(entry.author || ''),
      dir: typeof entry.dir === 'string' ? entry.dir : '',
      workshopItemId: typeof entry.workshopItemId === 'string' ? entry.workshopItemId : null,
      origin: entry.origin === 'workshop' ? 'workshop' : 'local',
      content,
      parseErrors: Array.isArray(entry.parseErrors)
        ? entry.parseErrors.filter((e) => e && typeof e === 'object')
        : [],
    });
  }
  return { source: typeof raw.source === 'string' ? raw.source : null, mods, malformed: false };
}

const PAYLOAD = normalizePayload(
  typeof globalThis !== 'undefined' ? globalThis.__SF_USER_MODS__ : null,
);

// Live bookkeeping written by the merge sites during module evaluation. All merges run before
// any UI reads listUserMods(), so mutation-after-eval is not a hazard.
const state = {
  accepted: new Map(),   // kind -> Map(id -> {modId, file})
  rejected: new Map(),   // kind -> [{modId, file, id, reason}]
};
for (const kind of USER_CONTENT_KINDS) {
  state.accepted.set(kind, new Map());
  state.rejected.set(kind, []);
}

/** Candidate records for one kind, in deterministic scan order (sorted mod dirs, sorted files). */
export function userContentCandidates(kind) {
  const out = [];
  if (!USER_CONTENT_KINDS.includes(kind)) return out;
  for (const mod of PAYLOAD.mods) {
    for (const cand of mod.content[kind]) {
      out.push({ modId: mod.id, modName: mod.name, file: cand.file, record: cand.data });
    }
  }
  return out;
}

/** Mark a candidate accepted. Called by merge sites after field validation. */
export function acceptUserContent(modId, kind, id, file = null) {
  state.accepted.get(kind)?.set(String(id), { modId, file });
}

/**
 * Mark a candidate rejected. `reason` is shown in-app — be specific ("unknown tracking 'orbit'",
 * "id collides with shipped content"). A rejected record never reaches the merged tables.
 */
export function rejectUserContent(modId, kind, id, reason, file = null) {
  state.rejected.get(kind)?.push({
    modId: String(modId || ''),
    file,
    id: id == null ? null : String(id),
    reason: String(reason || 'invalid record'),
  });
}

/**
 * Claim a content id for one kind. Returns null on success or a rejection reason string.
 * Centralizing the claim keeps cross-mod duplicate handling uniform: first sorted mod wins.
 */
export function claimUserContentId(kind, id, modId, takenIds) {
  const key = String(id || '');
  if (takenIds && takenIds.has(key)) return `id "${key}" collides with shipped content`;
  const claimed = state.accepted.get(kind);
  if (claimed && claimed.has(key)) {
    const owner = claimed.get(key);
    return `id "${key}" collides with mod "${owner.modId}"`;
  }
  return null;
}

export function hasUserContent() {
  return PAYLOAD.mods.length > 0;
}

/** Absolute path of the mounted content directory, or null when unmounted (display only). */
export function userContentDirLabel() {
  return PAYLOAD.source;
}

/**
 * Per-mod summary for the settings screen and diagnostics.
 * @returns {Array<{id:string,name:string,version:string,description:string,author:string,
 *   workshopItemId:string|null, origin:'local'|'workshop',
 *   status:'loaded'|'partial'|'rejected'|'invalid',
 *   counts:{weapons:number,modules:number,encounters:number,places:number},
 *   errors:string[], rejected:string[]}>}
 */
export function listUserMods() {
  const out = [];
  for (const mod of PAYLOAD.mods) {
    const errors = mod.parseErrors.map((e) => (e.file ? `${e.file}: ${e.error}` : e.error));
    const rejected = [];
    const counts = {};
    for (const kind of USER_CONTENT_KINDS) {
      counts[kind] = 0;
      for (const entry of state.rejected.get(kind) || []) {
        if (entry.modId === mod.id) {
          rejected.push(`${kind.slice(0, -1)}${entry.id ? ` ${entry.id}` : ''}: ${entry.reason}`);
        }
      }
      for (const [id, owner] of state.accepted.get(kind) || []) {
        if (owner.modId === mod.id) counts[kind] += 1;
      }
    }
    const acceptedTotal = Object.values(counts).reduce((a, b) => a + b, 0);
    let status;
    if (mod.id.startsWith('(dir:')) status = 'invalid';        // bad manifest → placeholder id
    else if (acceptedTotal > 0 && (errors.length || rejected.length)) status = 'partial';
    else if (errors.length || rejected.length) status = 'rejected';
    else status = 'loaded';
    out.push({
      id: mod.id, name: mod.name, version: mod.version,
      description: mod.description, author: mod.author,
      workshopItemId: mod.workshopItemId, origin: mod.origin,
      status, counts, errors, rejected,
    });
  }
  return out;
}
