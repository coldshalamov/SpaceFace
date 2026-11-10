// scripts/lib/userContentStore.cjs — user content ("mods") directory: resolution + scan + injection.
//
// PQ-172.00. Players add content by dropping a folder of JSON records into the user content
// directory; the game server scans it once per page serve and injects the parsed payload as a
// synchronous classic script before the module graph evaluates. That ordering is the whole point:
// src/data modules (and ~70 consumers that snapshot them into Maps) evaluate at import time, so
// mod content must already be on globalThis.__SF_USER_MODS__ when the module graph runs. A runtime
// fetch in main.js would arrive after every consumer had already frozen its view.
//
// Layout of a mounted directory:
//   <dir>/<mod-dir>/mod.json                  — manifest {id, name, version, description?, author?}
//   <dir>/<mod-dir>/weapons/*.json            — one weapon record per file
//   <dir>/<mod-dir>/modules/*.json            — one module record per file
//   <dir>/<mod-dir>/encounters/*.json         — one encounter record per file
//   <dir>/<mod-dir>/places/*.json             — one authored-place zone record per file
//
// Determinism contract: mod directories and files are scanned in sorted order, so the merged
// content set is identical on every machine for the same directory contents. No filesystem
// ordering, no Date, no randomness enters the payload.
//
// Validation contract: this module only parses JSON and enforces manifest shape. Field-level
// validation (vocab, dup ids, encounter shapes) happens at the merge sites in src/data/* so mods
// run through exactly the validators shipped content uses. Rejections are recorded per mod and
// surfaced by listUserMods() (settings screen) — malformed content can never abort boot.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PAYLOAD_SCHEMA = 'spaceface.userContent.v1';
const ENV_VAR = 'SPACEFACE_USER_CONTENT_DIR';
const CONTENT_KINDS = Object.freeze(['weapons', 'modules', 'encounters', 'places']);
const MANIFEST_NAME = 'mod.json';
// PQ-172.01: sync writes this marker (containing the item id digits) into mirrored dirs so the
// loader/UI can tell a subscribed Workshop mirror from a local pack and so sync may prune safely.
const WORKSHOP_MARKER_NAME = '.sf-workshop-item';
const MAX_CONTENT_BYTES = 256 * 1024;       // per record file — JSON definitions are small
const MAX_MOD_FILES_PER_KIND = 200;         // defensive bound, not a design limit
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;  // total injected payload — it inlines into index.html

/**
 * Resolve where user content is mounted from, mirroring resolveMountedPlayerStoreDir semantics.
 *
 * @param {NodeJS.ProcessEnv|object} env
 * @param {{devDir?: string|null, platformDir?: string|null}} opts
 *   devDir       — repo-relative dev convenience dir (e.g. <root>/user-content); used when it exists
 *   platformDir  — per-user app-data dir (Electron userData/mods); the fallback default
 * @returns {string|null} absolute dir, or null when unmounted
 */
function resolveMountedUserContentDir(env = {}, { devDir = null, platformDir = null } = {}) {
  if (Object.prototype.hasOwnProperty.call(env, ENV_VAR)) {
    const raw = env[ENV_VAR];
    if (raw == null || raw === '') return null;          // explicit unmount for tests/probes
    return path.resolve(String(raw));
  }
  if (devDir && fs.existsSync(devDir) && fs.statSync(devDir).isDirectory()) {
    return path.resolve(devDir);
  }
  if (platformDir) return path.resolve(platformDir);
  return null;
}

function readJsonFileSafe(filePath) {
  let text;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return { error: 'not a regular file' };
    if (stat.size > MAX_CONTENT_BYTES) return { error: `file exceeds ${MAX_CONTENT_BYTES} bytes` };
    text = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return { error: `unreadable: ${error.message}` };
  }
  try {
    return { data: JSON.parse(text) };
  } catch (error) {
    return { error: `invalid JSON: ${error.message}` };
  }
}

function readManifest(dirPath) {
  const filePath = path.join(dirPath, MANIFEST_NAME);
  if (!fs.existsSync(filePath)) return { error: `missing ${MANIFEST_NAME}` };
  const read = readJsonFileSafe(filePath);
  if (read.error) return { error: `${MANIFEST_NAME}: ${read.error}` };
  const manifest = read.data;
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { error: `${MANIFEST_NAME}: must be an object` };
  }
  const { id, name, version } = manifest;
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(id)) {
    return { error: `${MANIFEST_NAME}: id must be a safe slug (letters, numbers, dot, underscore, hyphen)` };
  }
  if (typeof name !== 'string' || name.trim() === '') {
    return { error: `${MANIFEST_NAME}: name is required` };
  }
  if (version != null && typeof version !== 'string') {
    return { error: `${MANIFEST_NAME}: version must be a string` };
  }
  // Published packs carry their Steam Workshop item id so a re-publish updates the same item
  // instead of creating a duplicate (PQ-172.01). Optional; digits only.
  let workshopItemId = null;
  if (manifest.workshopItemId != null) {
    const raw = String(manifest.workshopItemId).trim();
    if (!/^[1-9][0-9]{0,19}$/.test(raw)) {
      return { error: `${MANIFEST_NAME}: workshopItemId must be a decimal item id` };
    }
    workshopItemId = raw;
  }
  return {
    manifest: {
      id,
      name,
      version: version || '0.0.0',
      description: typeof manifest.description === 'string' ? manifest.description : '',
      author: typeof manifest.author === 'string' ? manifest.author : '',
      workshopItemId,
    },
  };
}

/** Marker a Workshop sync writes into a mirrored dir: contains the item id digits only. */
function readWorkshopMarker(dirPath) {
  const filePath = path.join(dirPath, WORKSHOP_MARKER_NAME);
  try {
    const text = fs.readFileSync(filePath, 'utf8').trim();
    return /^[1-9][0-9]{0,19}$/.test(text) ? text : null;
  } catch (_) {
    return null;
  }
}

function scanKindDir(modDir, kind, parseErrors, budget) {
  const kindDir = path.join(modDir, kind);
  if (!fs.existsSync(kindDir)) return [];
  let entries;
  try {
    entries = fs.readdirSync(kindDir, { withFileTypes: true });
  } catch (error) {
    parseErrors.push({ file: kind, error: `unreadable directory: ${error.message}` });
    return [];
  }
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => entry.name)
    .sort();
  const out = [];
  for (const fileName of files.slice(0, MAX_MOD_FILES_PER_KIND)) {
    const rel = `${kind}/${fileName}`;
    const filePath = path.join(kindDir, fileName);
    let size = 0;
    try { size = fs.statSync(filePath).size; } catch (_) { /* readJsonFileSafe reports it */ }
    if (budget && (budget.remaining -= size) < 0) {
      parseErrors.push({ file: rel, error: `content payload exceeds ${MAX_PAYLOAD_BYTES} bytes total; later files ignored` });
      break;
    }
    const read = readJsonFileSafe(filePath);
    if (read.error) {
      parseErrors.push({ file: rel, error: read.error });
      continue;
    }
    out.push({ file: rel, data: read.data });
  }
  if (files.length > MAX_MOD_FILES_PER_KIND) {
    parseErrors.push({ file: kind, error: `more than ${MAX_MOD_FILES_PER_KIND} files; extras ignored` });
  }
  return out;
}

/**
 * Scan a mounted user content directory into the injection payload.
 * Never throws — an unreadable/malformed directory yields an empty payload with the error recorded
 * on the (rejected) mod entry so it can be listed in-app rather than breaking boot.
 */
function scanUserContentDir(dir) {
  const payload = { schema: PAYLOAD_SCHEMA, source: dir ? path.resolve(dir) : null, mods: [] };
  if (!dir) return payload;
  let entries;
  try {
    if (!fs.existsSync(dir)) return payload;
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    payload.mods.push({
      id: '(content dir)', name: path.basename(dir), version: '', description: '',
      dir, workshopItemId: null, origin: 'local',
      content: { weapons: [], modules: [], encounters: [], places: [] },
      parseErrors: [{ file: '', error: `unreadable content directory: ${error.message}` }],
    });
    return payload;
  }
  const modDirs = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
  const seenIds = new Set();
  const budget = { remaining: MAX_PAYLOAD_BYTES };
  for (const modDirName of modDirs) {
    const modDir = path.join(dir, modDirName);
    const parseErrors = [];
    const { manifest, error } = readManifest(modDir);
    // A sync mirror's marker outranks a copied manifest field: the author-published id in mod.json
    // describes the source item, while the marker says "this copy arrived via subscription".
    const mirrorItemId = readWorkshopMarker(modDir);
    const entry = {
      id: manifest ? manifest.id : `(dir: ${modDirName})`,
      name: manifest ? manifest.name : modDirName,
      version: manifest ? manifest.version : '',
      description: manifest ? manifest.description : '',
      author: manifest ? manifest.author : '',
      dir: modDir,
      workshopItemId: mirrorItemId || (manifest ? manifest.workshopItemId : null),
      origin: mirrorItemId ? 'workshop' : 'local',
      content: { weapons: [], modules: [], encounters: [], places: [] },
      parseErrors,
    };
    if (error) parseErrors.push({ file: MANIFEST_NAME, error });
    else if (seenIds.has(manifest.id)) {
      parseErrors.push({ file: MANIFEST_NAME, error: `duplicate mod id "${manifest.id}" (first seen wins)` });
    } else {
      seenIds.add(manifest.id);
      for (const kind of CONTENT_KINDS) {
        entry.content[kind] = scanKindDir(modDir, kind, parseErrors, budget);
      }
    }
    payload.mods.push(entry);
  }
  return payload;
}

/**
 * Build the synchronous classic-script source that installs the payload on globalThis.
 * `<` is escaped so the script is safe to inline into index.html even if record text contains
 * `</script>`. Frozen so merge-time code cannot accidentally mutate the shared payload.
 */
function buildUserContentScript(dir) {
  const payload = scanUserContentDir(dir);
  const json = JSON.stringify(payload).replace(/</g, '\\u003C');
  return `globalThis.__SF_USER_MODS__=${json};`;
}

module.exports = {
  PAYLOAD_SCHEMA,
  ENV_VAR,
  CONTENT_KINDS,
  MANIFEST_NAME,
  WORKSHOP_MARKER_NAME,
  resolveMountedUserContentDir,
  readManifest,
  readWorkshopMarker,
  scanUserContentDir,
  buildUserContentScript,
};
