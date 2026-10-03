#!/usr/bin/env node
// FB-108 — a seeded mutator fuzzes the save import/validation lanes and proves every corrupted
// envelope resolves to a named reason (or a successful load), never an uncaught exception and
// never a partially applied restore.
//
//   node scripts/fb-fuzz-save-envelope.mjs [--cases 5000] [--seed 4242] [--json]
//
// The same seed always produces the same case stream and the same reason histogram. Lanes under
// test, all production code paths:
//   * save.importString        — the sync file/string import (prepare → migrate → restore)
//   * save.importFile          — the File lane (stubbed FileReader, same import inside)
//   * validateSaveJson(Async)  — the worker's pure envelope validation (gzip-aware)
//   * restorePrepareSaveJsonAsync — the worker's decode+prepare used by the async load lane
// Plain envelopes and 'spaceface-save-gz' wrappers both flow through the existing decode
// helpers — no second gzip decoder anywhere in this harness.
import { fnv1a } from '../src/save/checksum.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { save as saveDef, SAVE_IMPORT_MAX_BYTES } from '../src/save/saveSystem.js';
import {
  gzipEnvelopeJson,
  handleSaveWorkerRequestAsync,
  isGzippedSaveText,
  restorePrepareSaveJsonAsync,
  validateSaveJson,
  validateSaveJsonAsync,
} from '../src/save/saveWorker.js';
import { mulberry32 } from '../src/core/rng.js';
import { pathToFileURL } from 'node:url';

// ── named-reason contract ──────────────────────────────────────────────────────────────────
// The eight core reasons validateSaveJson names (the spec's required histogram coverage)…
export const CORE_VALIDATE_REASONS = Object.freeze([
  'no_save', 'parse_failed', 'bad_format', 'newer_version',
  'no_data', 'checksum', 'no_player', 'invalid_player',
]);
// …plus every other named rejection the save layer can produce today. An outcome that is
// neither ok:true nor one of these strings is a contract violation.
export const NAMED_REASONS = Object.freeze([
  ...CORE_VALIDATE_REASONS,
  'migration_failed', 'load_failed',
  'import_too_large', 'import_depth_limit', 'import_node_limit',
  'import_collection_limit', 'import_persistent_entity_limit', 'import_cycle',
  'compressed_envelope', 'gz_unsupported', 'gz_decode_failed',
  'read_failed', 'import_failed', 'invalid_arg',
  'worker_failed', 'stringify_failed', 'save_size_limit',
  'superseded', 'restore_prepare_failed', 'export_failed',
]);
const NAMED_SET = new Set(NAMED_REASONS);

// ── seed envelope (seed 4242 world, real checksum) ─────────────────────────────────────────
export function seedEnvelope() {
  const data = {
    meta: { seed: 4242, playtimeS: 3600, createdAt: '2026-09-28T00:00:00.000Z', lastSavedAt: '2026-09-28T01:00:00.000Z' },
    player: { credits: 4200, activeShipIndex: 0, ownedShips: [{ defId: 'ship_kestrel', fittings: [] }] },
    cargo: { items: {}, capVolume: 40, capMass: 40 },
    economy: {},
    factions: {},
    world: {
      currentSectorId: 'sector_helios_prime',
      coordinateSchema: 'global_v1',
      frameOrigin: { x: 0, z: 0 },
      frameOriginSeq: 0,
      sectors: { sector_helios_prime: { id: 'sector_helios_prime', name: 'Helios Prime' } },
      records: { schemaId: 'spaceface.worldRecords.v1', schemaVersion: 2, byId: {} },
      resourceBodies: { schemaId: 'spaceface.resourceBodyRecords.v2', schemaVersion: 2, byId: {} },
    },
    entities: {
      player: {
        id: 'player', type: 'ship', defId: 'ship_kestrel',
        pos: { x: 512, z: -256 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
        hull: 100, flags: {}, data: {},
      },
      persistent: [{ id: 'wreck-1', type: 'wreck', pos: { x: 10, z: 10 }, flags: {}, data: {} }],
      simTime: 3600,
      tick: 216000,
    },
    missions: { active: [], completed: [] },
    crafting: { queues: {} },
    sectorSim: { sectors: {}, meta: {} },
    combat: { schemaVersion: 1, combatSchemaVersion: 1 },
    nav: { route: null, autoTravel: false, waypoint: null },
    lossLedger: { entries: [], seed: 0, ghostConvoy: { fired: {} } },
    aftermathWrecks: { schemaVersion: 1, bySector: {}, seed: 0 },
    careerOrigins: { schemaId: 'spaceface.careerOrigins.v1', schemaVersion: 1, origins: {} },
    npcJobs: { byId: {} },
    uiScreenMemory: { v: 1, bags: {} },
    provenance: { v: 1, chains: [], openIncidents: {}, nextSeq: 0 },
    settings: {},
  };
  return {
    fmt: 'spaceface-save',
    version: CURRENT_VERSION,
    savedAt: '2026-09-28T01:00:00.000Z',
    playtimeS: 3600,
    slot: '7',
    checksum: fnv1a(JSON.stringify(data)),
    data,
  };
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function fixChecksum(env) { env.checksum = fnv1a(JSON.stringify(env.data)); }
function pick(rng, list) { return list[Math.floor(rng() * list.length)]; }

// ── mutators ─────────────────────────────────────────────────────────────────────────────
// Each returns the case input: a string (plain or gz-wrapped), a non-string, or {file:true,text}
// for the importFile lane marker — decided by the driver, not the mutator.

export const MUTATORS = [
  // raw garbage / truncation / character damage → parse_failed (occasionally still parses)
  { name: 'truncate', w: 60, gen(rng, env) {
    const s = JSON.stringify(env);
    return s.slice(0, 1 + Math.floor(rng() * (s.length - 1)));
  } },
  { name: 'charflip', w: 90, gen(rng, env) {
    const chars = '"{}[],:0123456789eEtfnul \\';
    const s = JSON.stringify(env).split('');
    const flips = 1 + Math.floor(rng() * 8);
    for (let i = 0; i < flips; i++) s[Math.floor(rng() * s.length)] = chars[Math.floor(rng() * chars.length)];
    return s.join('');
  } },
  { name: 'bitflip', w: 45, gen(rng, env) {
    // XOR 1-4 single bits at seeded positions — byte corruption rather than substitution.
    const codes = JSON.stringify(env).split('').map((c) => c.charCodeAt(0));
    const flips = 1 + Math.floor(rng() * 4);
    for (let i = 0; i < flips; i++) {
      const at = Math.floor(rng() * codes.length);
      codes[at] = codes[at] ^ (1 << Math.floor(rng() * 7));
    }
    return String.fromCharCode(...codes);
  } },
  { name: 'raw_garbage', w: 30, gen(rng) {
    const alph = 'abc{}[]",: \t\n';
    let s = '';
    const n = 4 + Math.floor(rng() * 400);
    for (let i = 0; i < n; i++) s += alph[Math.floor(rng() * alph.length)];
    return s;
  } },
  { name: 'non_string', w: 30, gen(rng) {
    return pick(rng, [null, undefined, 0, 42, true, {}, [], { fmt: 'spaceface-save' }]);
  } },

  // wrong types on envelope fields — one op per case so the reason stays attributable
  { name: 'fmt_swap', w: 30, gen(rng, env) {
    const e = clone(env);
    e.fmt = pick(rng, ['spaceface-save2', 42, null, 'spaceface-achievements', 'SPACEface-save']);
    return JSON.stringify(e);
  } },
  { name: 'version_swap', w: 40, gen(rng, env) {
    const e = clone(env);
    e.version = pick(rng, [0, -3, 1.5, 'v14', '14', 2 ** 40, NaN]);
    return JSON.stringify(e);
  } },
  { name: 'newer_version', w: 40, gen(rng, env) {
    const e = clone(env);
    e.version = CURRENT_VERSION + 1 + Math.floor(rng() * 40);
    fixChecksum(e);
    return JSON.stringify(e);
  } },
  { name: 'no_data', w: 40, gen(rng, env) {
    const e = clone(env);
    if (rng() < 0.5) delete e.data;
    else e.data = pick(rng, [null, 42, 'nope', [1, 2], true]);
    return JSON.stringify(e);
  } },
  { name: 'checksum_stale', w: 50, gen(rng, env) {
    const e = clone(env);
    e.data.player.credits = -1;
    e.data.meta.playtimeS = 'a lot';
    if (rng() < 0.5) e.checksum = 'deadbeef'; // explicit wrong, else simply stale
    return JSON.stringify(e);
  } },
  { name: 'no_player', w: 40, gen(rng, env) {
    const e = clone(env);
    const op = pick(rng, [
      () => { delete e.data.entities.player; },
      () => { e.data.entities.player = null; },
      () => { e.data.entities.player = 'a string'; },
      () => { e.data.entities.player = [1]; },
      () => { e.data.entities = {}; },
    ]);
    op();
    fixChecksum(e); // checksum fixed so the walk reaches the player sanity check
    return JSON.stringify(e);
  } },
  { name: 'invalid_player', w: 40, gen(rng, env) {
    const e = clone(env);
    e.data.entities.player.type = pick(rng, ['asteroid', 'station', 'projectile', 42]);
    fixChecksum(e);
    return JSON.stringify(e);
  } },
  { name: 'field_type_swap', w: 40, gen(rng, env) {
    const e = clone(env);
    const op = pick(rng, [
      () => { e.data.entities.persistent = pick(rng, ['x', 42, {}]); },
      () => { e.data.missions.active = pick(rng, ['x', 42, {}]); },
      () => { e.data.entities.player.pos = pick(rng, ['x', 42, []]); },
      () => { e.savedAt = 12345; e.playtimeS = 'never'; },
      () => { e.data.crafting.queues = [[], []]; },
    ]);
    op();
    fixChecksum(e);
    return JSON.stringify(e);
  } },

  // graph bombs — checksum fixed so the walk reaches the bound it is testing
  { name: 'depth_bomb', w: 40, gen(rng, env) {
    const e = clone(env);
    let node = { leaf: true };
    const depth = 80 + Math.floor(rng() * 60);
    for (let i = 0; i < depth; i++) node = { next: node };
    e.data.deep = node;
    fixChecksum(e);
    return JSON.stringify(e);
  } },
  { name: 'node_bomb', w: 8, gen(rng, env) {
    const e = clone(env);
    // >200k nodes while every container stays under the 50k-item collection bound:
    // six sub-arrays of 40k primitives each ≈ 240k nodes, all cheap flat JSON.
    e.data.bomb = Array.from({ length: 6 }, () => new Array(40_000).fill(0));
    fixChecksum(e);
    return JSON.stringify(e);
  } },
  { name: 'collection_bomb', w: 30, gen(rng, env) {
    const e = clone(env);
    e.data.bomb = new Array(50_001 + Math.floor(rng() * 1000)).fill(0);
    fixChecksum(e);
    return JSON.stringify(e);
  } },
  { name: 'key_collection_bomb', w: 2, gen(rng, env) {
    const e = clone(env);
    const bomb = {};
    for (let i = 0; i < 50_001; i++) bomb[`k${i}`] = i;
    e.data.bomb = bomb;
    fixChecksum(e);
    return JSON.stringify(e);
  } },
  { name: 'persistent_bomb', w: 20, gen(rng, env) {
    const e = clone(env);
    e.data.entities.persistent = Array.from({ length: 2049 + Math.floor(rng() * 40) },
      (_, i) => ({ id: `e${i}`, type: 'drone', pos: { x: i, z: 0 } }));
    fixChecksum(e);
    return JSON.stringify(e);
  } },

  // oversized — under cap stays a valid load, over cap names import_too_large
  { name: 'oversized_string', w: 10, gen(rng, env) {
    const e = clone(env);
    e.data.note = 'x'.repeat(150_000 + Math.floor(rng() * 300_000));
    fixChecksum(e);
    return JSON.stringify(e);
  } },
  { name: 'import_too_large', w: 7, gen() {
    // Byte-bound check fires before JSON.parse — a raw oversized string is the honest case.
    return `{"fmt":"spaceface-save","version":${CURRENT_VERSION},"pad":"${'x'.repeat(13 * 1024 * 1024)}"}`;
  } },

  // key injection incl. __proto__ — own-property semantics via defineProperty so JSON emits it
  { name: 'key_injection', w: 50, gen(rng, env) {
    const e = clone(env);
    const spots = [e, e.data, e.data.entities, e.data.entities.player, e.data.world];
    const spot = pick(rng, spots.filter(Boolean));
    const key = pick(rng, ['__proto__', 'constructor', 'prototype']);
    Object.defineProperty(spot, key, {
      value: pick(rng, [{ polluted: true }, ['x'], 'polluted', { prototype: { x: 1 } }]),
      enumerable: true, writable: true, configurable: true,
    });
    fixChecksum(e);
    return JSON.stringify(e);
  } },

  // gzip wrappers — real decode helpers only; valid wraps, torn payloads, inner mutations
  { name: 'gz_valid', w: 15, async gen(rng, env) {
    return await gzipEnvelopeJson(JSON.stringify(env));
  } },
  { name: 'gz_corrupt_payload', w: 30, async gen(rng, env) {
    const outer = JSON.parse(await gzipEnvelopeJson(JSON.stringify(env)));
    const p = outer.payload.split('');
    const flips = 1 + Math.floor(rng() * 6);
    const alph = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    for (let i = 0; i < flips; i++) p[Math.floor(rng() * p.length)] = alph[Math.floor(rng() * alph.length)];
    outer.payload = p.join('');
    return JSON.stringify(outer);
  } },
  { name: 'gz_inner_mutated', w: 30, async gen(rng, env) {
    const inner = clone(env);
    const op = pick(rng, [
      () => { inner.version = CURRENT_VERSION + 3; },
      () => { delete inner.data.entities.player; fixChecksum(inner); },
      () => { inner.data.entities.player.type = 'asteroid'; fixChecksum(inner); },
      () => { inner.data.player.credits = -5; },              // stale checksum → 'checksum'
      () => { delete inner.data; },
    ]);
    op();
    return await gzipEnvelopeJson(JSON.stringify(inner));
  } },
  { name: 'gz_profile_bundle', w: 12, async gen(rng, env) {
    const outer = JSON.parse(await gzipEnvelopeJson(JSON.stringify(env)));
    outer.profile = pick(rng, [
      { achievements: { fmt: 'spaceface-achievements', data: { unlocked: {} } } },
      { achievements: 'corrupt', crucibleMeta: [1, 2] },
      'not-an-object',
      [1, 2, 3],
    ]);
    return JSON.stringify(outer);
  } },
  { name: 'gz_outer_mutated', w: 15, async gen(rng, env) {
    const outer = JSON.parse(await gzipEnvelopeJson(JSON.stringify(env)));
    const op = pick(rng, [
      () => { outer.payload = 42; },
      () => { outer.fmt = 'spaceface-save'; },           // wrapper claims to be the inner fmt
      () => { delete outer.payload; },
      () => { outer.version = CURRENT_VERSION + 9; },    // card field only — inner still valid
    ]);
    op();
    return JSON.stringify(outer);
  } },

  // valid control — the "successful load" side of the contract (incl. plain profile bundles)
  { name: 'valid_control', w: 60, gen(rng, env) {
    const e = clone(env);
    if (rng() < 0.5) {
      e.data.player.credits = Math.floor(rng() * 1e6);
      fixChecksum(e);
    }
    if (rng() < 0.15) e.profile = { achievements: { fmt: 'spaceface-achievements', schemaVersion: 1, data: { schemaVersion: 1, unlocked: { fuzz_medal: { at: 'x' } } } } };
    return JSON.stringify(e);
  } },
];

const TOTAL_WEIGHT = MUTATORS.reduce((sum, m) => sum + m.w, 0);
function pickMutator(rng) {
  let roll = rng() * TOTAL_WEIGHT;
  for (const m of MUTATORS) { roll -= m.w; if (roll < 0) return m; }
  return MUTATORS[MUTATORS.length - 1];
}

// ── harness ──────────────────────────────────────────────────────────────────────────────
function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    clear() { values.clear(); },
  };
}

function installSaveHarness() {
  const previousStorage = globalThis.localStorage;
  const previousWorker = globalThis.Worker;
  const previousFileReader = globalThis.FileReader;
  const save = Object.create(saveDef);
  const events = [];
  const restored = [];
  save.state = {
    meta: { playtimeS: 3600, lastSavedAt: '' },
    save: { currentSlot: '7' },
    player: { credits: 4200, activeShipIndex: 0, ownedShips: [{ defId: 'ship_kestrel' }] },
    world: { currentSectorId: 'sector_helios_prime' },
    nav: {}, missions: { active: [] }, story: { beatIndex: 0 }, ui: {},
    mode: 'flight', jump: { state: 'IDLE' },
  };
  save.bus = { emit(name, payload) { events.push({ name, payload }); } };
  save.registry = { get() { return null; } };
  save.helpers = null;
  save._restoring = false;
  save._rollbackInProgress = false;
  save._restoreSequence = 0;
  save._hasPlayerEntity = () => false;
  save._restore = (data, slot) => { restored.push({ data, slot }); return { restored: true, slot }; };

  globalThis.localStorage = memoryStorage();
  globalThis.Worker = class {};
  let requestId = 0;
  save._requestSaveWorker = (type, payload, onResult) => {
    const id = ++requestId;
    Promise.resolve()
      .then(() => handleSaveWorkerRequestAsync({ id, type, payload }))
      .then((response) => { if (response) onResult(response); });
    return true;
  };
  globalThis.FileReader = class {
    readAsText(file) {
      Promise.resolve()
        .then(() => (typeof file === 'string' ? file : file.text()))
        .then((text) => { this.result = text; if (this.onload) this.onload(); },
          () => { if (this.onerror) this.onerror(new Error('read failed')); });
    }
  };
  return {
    save, events, restored,
    drainEvents() { const out = events.splice(0, events.length); return out; },
    restore() {
      if (previousStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = previousStorage;
      if (previousWorker === undefined) delete globalThis.Worker;
      else globalThis.Worker = previousWorker;
      if (previousFileReader === undefined) delete globalThis.FileReader;
      else globalThis.FileReader = previousFileReader;
    },
  };
}

async function importFileAsync(save, text) {
  const file = new File([text], 'fuzz.json', { type: 'application/json' });
  return await new Promise((resolve) => {
    try { save.importFile(file, (ok) => resolve(!!ok)); }
    catch (error) { resolve({ threw: error }); }
  });
}

// ── driver ───────────────────────────────────────────────────────────────────────────────
export async function runFuzz({ cases = 5000, seed = 4242, fileLaneEvery = 24 } = {}) {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const h = installSaveHarness();
  const histogram = Object.create(null);
  const violations = [];
  let exceptions = 0;
  let accepted = 0;
  let validateOnlyOk = 0;
  const bump = (key) => { histogram[key] = (histogram[key] || 0) + 1; };
  const phases = { genMs: 0, driveMs: 0, validateMs: 0 };
  const startedAt = Date.now();
  try {
    for (let i = 0; i < cases; i++) {
      const env = seedEnvelope();
      const mutator = pickMutator(rng);
      let input;
      const phaseT0 = performance.now();
      try {
        input = await mutator.gen(rng, env);
      } catch (error) {
        exceptions++;
        violations.push({ case: i, mutator: mutator.name, kind: 'generator_throw', error: String(error && error.stack || error) });
        continue;
      }

      const restoredBefore = h.restored.length;
      const stateBefore = JSON.stringify({ slot: h.save.state.save.currentSlot, credits: h.save.state.player.credits });
      h.drainEvents();
      phases.genMs += performance.now() - phaseT0;
      let laneResult;
      const driveT0 = performance.now();
      try {
        if (i % fileLaneEvery === 0 && (typeof input === 'string')) {
          // The File lane: same importString inside, plus the byte pre-check and cb contract.
          const out = await importFileAsync(h.save, input);
          laneResult = out && out.threw ? { threw: out.threw } : { ok: out === true };
        } else {
          // importString routes compressed text through the async worker lane itself
          // (_loadEnvelopeFromStringAsync → restore_prepare → restorePrepareSaveJsonAsync),
          // so one call exercises the whole decode+prepare+restore chain.
          const out = h.save.importString(input, '7');
          laneResult = out && typeof out.then === 'function' ? { ok: await out === true } : { ok: out === true };
        }
      } catch (error) {
        exceptions++;
        violations.push({ case: i, mutator: mutator.name, kind: 'throw', error: String(error && error.stack || error) });
        continue;
      }
      if (laneResult && laneResult.threw) {
        exceptions++;
        violations.push({ case: i, mutator: mutator.name, kind: 'throw', error: String(laneResult.threw && laneResult.threw.stack || laneResult.threw) });
        continue;
      }

      phases.driveMs += performance.now() - driveT0;
      const validateT0 = performance.now();
      const events = h.drainEvents();
      const errorEvent = events.find((event) => event.name === 'save:error');
      if (laneResult.ok === true) {
        accepted++;
        bump('ok');
        if (h.restored.length !== restoredBefore + 1) {
          violations.push({ case: i, mutator: mutator.name, kind: 'restore_count', detail: `accepted case ran ${h.restored.length - restoredBefore} restores` });
        }
      } else {
        const reason = (laneResult && laneResult.reason) || (errorEvent && errorEvent.payload && errorEvent.payload.reason) || null;
        if (reason == null) {
          violations.push({ case: i, mutator: mutator.name, kind: 'reasonless_reject', detail: 'rejection carried no named reason' });
          bump('(no reason)');
        } else {
          bump(reason);
          if (!NAMED_SET.has(reason)) {
            violations.push({ case: i, mutator: mutator.name, kind: 'unnamed_reason', detail: reason });
          }
        }
        if (h.restored.length !== restoredBefore) {
          violations.push({ case: i, mutator: mutator.name, kind: 'partial_apply', detail: 'rejected case ran a restore' });
        }
        const stateAfter = JSON.stringify({ slot: h.save.state.save.currentSlot, credits: h.save.state.player.credits });
        if (stateAfter !== stateBefore) {
          violations.push({ case: i, mutator: mutator.name, kind: 'state_mutated', detail: `${stateBefore} → ${stateAfter}` });
        }
      }
      // Prototype-pollution tripwire: a __proto__ injection must never leak onto Object.
      if (Object.prototype.polluted !== undefined || ({}).polluted !== undefined) {
        violations.push({ case: i, mutator: mutator.name, kind: 'proto_pollution' });
      }
      // Cross-check the pure validation lane on every case (gzip-aware twin for wrapped text).
      // It legitimately says ok where import rejects — the worker validate does not run the
      // graph bounds or migrations that the import prepare lane owns; that delta is counted,
      // not flagged. Inputs past the hard byte cap are skipped: import rejects them before
      // parse, and a 13MB validate parse buys no new signal.
      const overByteCap = typeof input === 'string' && input.length > SAVE_IMPORT_MAX_BYTES;
      try {
        const validated = overByteCap ? null
          : typeof input === 'string'
            ? await validateSaveJsonAsync(input, CURRENT_VERSION)
            : validateSaveJson(input, CURRENT_VERSION);
        if (validated && !validated.ok && !NAMED_SET.has(validated.reason)) {
          violations.push({ case: i, mutator: mutator.name, kind: 'validate_unnamed_reason', detail: validated.reason });
        }
        if (validated && validated.ok && laneResult.ok !== true) validateOnlyOk++;
      } catch (error) {
        exceptions++;
        violations.push({ case: i, mutator: mutator.name, kind: 'validate_throw', error: String(error && error.stack || error) });
      }
      phases.validateMs += performance.now() - validateT0;
    }
  } finally {
    h.restore();
  }
  const wallMs = Date.now() - startedAt;
  return {
    ok: exceptions === 0 && violations.length === 0,
    cases,
    seed,
    accepted,
    rejected: cases - accepted - exceptions,
    exceptions,
    validateOnlyOk,
    violations: violations.slice(0, 50),
    violationCount: violations.length,
    histogram,
    phases,
    wallMs,
  };
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name, dflt) => {
    const hit = args.find((a) => a.startsWith(`${name}=`));
    if (hit) return hit.slice(name.length + 1);
    const idx = args.indexOf(name);
    return idx >= 0 ? args[idx + 1] : dflt;
  };
  const cases = Math.max(1, parseInt(opt('--cases', '5000'), 10) || 5000);
  const seed = parseInt(opt('--seed', '4242'), 10) || 4242;
  const asJson = args.includes('--json');
  runFuzz({ cases, seed }).then((report) => {
    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`fb-fuzz-save-envelope: ${report.cases} seeded cases (seed ${report.seed}) in ${report.wallMs}ms`);
      console.log(`  accepted (valid loads): ${report.accepted}`);
      console.log(`  rejected (named reasons): ${report.rejected}`);
      console.log(`  exceptions: ${report.exceptions}`);
      console.log(`  validate-ok/import-rejected lane delta: ${report.validateOnlyOk}`);
      console.log('  reason histogram:');
      const rows = Object.entries(report.histogram).sort((a, b) => b[1] - a[1]);
      for (const [reason, count] of rows) console.log(`    ${reason.padEnd(34)} ${count}`);
      const missing = CORE_VALIDATE_REASONS.filter((r) => !report.histogram[r]);
      if (missing.length) console.log(`  MISSING core reasons: ${missing.join(', ')}`);
      if (report.violations.length) {
        console.log(`  violations (${report.violationCount}, first ${report.violations.length}):`);
        for (const v of report.violations) console.log(`    case ${v.case} [${v.mutator}] ${v.kind} ${v.detail || v.error || ''}`);
      }
    }
    const missing = CORE_VALIDATE_REASONS.filter((r) => !report.histogram[r]);
    process.exitCode = report.ok && missing.length === 0 ? 0 : 1;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
