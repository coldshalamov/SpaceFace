// src/systems/asteroidFormations.js — runtime owner of DISCOVERED asteroid-formation knowledge
// (packet A02: "Formation IDs and geology persist/reconstruct without bloating saves or rerolling
// discoveries").
//
// WHAT PERSISTS AND WHAT NEVER DOES — the whole packet in two sentences:
//   • The AMBIENT formation model of a sector is TRANSIENT. It is re-derived on demand from the
//     live asteroid entities through the pure A01 kernel (buildAsteroidFormations) and is never
//     serialized — that is the "without bloating saves" half of the contract.
//   • A DISCOVERED formation is DURABLE. The moment discover() records it, its compact strategic
//     record (ids, archetype, geology/yield/risk reads, centroid) is copied verbatim into
//     state.formations and restores byte-for-byte on load — that is the "without rerolling
//     discoveries" half. A later epoch may re-roll the rock; the player's surveyed knowledge of
//     what WAS there never re-rolls out from under them. Same anchored/unanchored philosophy as
//     asteroidSites.serialize (only anchored sites ship).
//
// OWNERSHIP: this system owns state.formations and nothing else. It writes no other state, moves
// no entities, and touches no physics. The save key ('formations', additive, no version bump — a
// v11 save without it deserializes to defaults) is applied by the save owner; see saveSystem.js.
//
// DETERMINISM: derivation seed is hash32(meta.seed, sectorId, epoch, 'formations'), the same
// (seed, sectorId, epoch) recipe world.js uses for sector content, so within one epoch the same
// field derives the same formation ids (A01 kernel property: ids depend on seed + anchor key,
// structure on bodies alone). No wall clock and no ambient RNG anywhere; discovery timestamps
// use state.simTime.

import { hash32 } from '../core/rng.js';
import { buildAsteroidFormations, FORMATION_MODEL_VERSION } from './asteroidFormationModel.js';

export const FORMATIONS_SCHEMA_VERSION = 1;

/** The strategic fields a discovered record keeps. Everything else the kernel derives is
 * reconstructable from a fresh derivation; these are the reads the player actually learned. */
export const DISCOVERED_RECORD_FIELDS = Object.freeze([
  'id', 'version', 'designation', 'archetype', 'archetypeName', 'label',
  'anchorAsteroidId', 'memberIds', 'count',
  'mass', 'spanRadius', 'packing', 'elongation', 'resourceContinuity', 'dominantTypeId',
  'yieldTotal', 'richness', 'gasRisk', 'thermalRisk', 'sensorSignature', 'siteAffinity',
  'coreCandidateId', 'centroid', 'principalAxisRad', 'bestApproachBearingRad',
]);

export function makeDefaultFormations() {
  return {
    schemaVersion: FORMATIONS_SCHEMA_VERSION,
    // formationId -> discovered record (compact strategic copy + observation binding).
    discovered: {},
    // Discovery order, explicit like sites.order so save byte-layout never depends on object
    // key enumeration.
    order: [],
  };
}

/** Deterministic label seed for one sector materialization. Exported for tests. */
export function formationSeedFor(metaSeed, sectorId, epoch) {
  return hash32(metaSeed >>> 0, String(sectorId || ''), (epoch >>> 0) || 0, 'formations') >>> 0;
}

/**
 * SAVE-STABLE anchor key for one asteroid body. The A01 kernel's own JSDoc warns that the default
 * `a.id` key is only safe "if entity ids re-roll" never happens — and they DO: world.enterSector
 * rematerializes durable records under fresh entity ids, and asteroidSites._repairAnchors respawns
 * an anchored rock with a new id. Keying formations by entity id therefore re-labelled the SAME
 * physical rock after a reload (the 4891099a..edca7c7e review's central finding). Identity here is
 * physical instead: the durable world record when the body carries one, else the rock's quantized
 * pose + type + size — the same fields asteroidSites' anchor recipe treats as the durable truth of
 * "which rock this is". Two rocks inside one world unit with identical type and radius are
 * physically indistinguishable as anchors, so colliding there is correct rather than risky.
 */
export function formationBodyKey(body) {
  if (!body || typeof body !== 'object') return 'invalid';
  const data = body.data && typeof body.data === 'object' ? body.data : {};
  if (data.worldRecordId != null) return `rec:${data.worldRecordId}`;
  const pos = body.pos && typeof body.pos === 'object' ? body.pos : body;
  const x = Number.isFinite(pos.x) ? Math.round(pos.x) : 0;
  const z = Number.isFinite(pos.z) ? Math.round(pos.z) : 0;
  const typeId = typeof data.typeId === 'string' ? data.typeId : '?';
  const radius = Number.isFinite(body.radius) ? Math.round(body.radius) : 0;
  return `pos:${x}|${z}|${typeId}|${radius}`;
}

/** Compact, JSON-safe copy of one kernel formation record (strategic subset only). Pure. */
export function compactFormationRecord(formation) {
  if (!formation || typeof formation !== 'object') return null;
  const out = {};
  for (const key of DISCOVERED_RECORD_FIELDS) {
    const v = formation[key];
    out[key] = v === undefined ? null : JSON.parse(JSON.stringify(v));
  }
  return out;
}

export const asteroidFormations = {
  name: 'asteroidFormations',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    ctx.asteroidFormations = this;

    const state = this.state;
    if (!state.formations) state.formations = makeDefaultFormations();
    this._normalize(state.formations);

    // Transient caches only — never serialized.
    this._rt = { model: null, sectorId: null, epoch: -1, seed: 0 };

    this.bus.on('sector:enter', () => { this._invalidate(); });
    this.bus.on('save:loaded', () => { this._invalidate(); });
  },

  newGame() {
    this.state.formations = makeDefaultFormations();
    this._invalidate();
  },

  // ── persistence (mirrors the asteroidSites serialize/deserialize shape) ────────────────────

  serialize() {
    const src = this.state.formations || makeDefaultFormations();
    const discovered = {};
    const order = [];
    for (const id of src.order) {
      const rec = src.discovered[id];
      if (!rec) continue;
      discovered[id] = JSON.parse(JSON.stringify(rec));
      order.push(id);
    }
    return { schemaVersion: FORMATIONS_SCHEMA_VERSION, discovered, order };
  },

  deserialize(data) {
    const next = makeDefaultFormations();
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const order = Array.isArray(data.order)
        ? data.order
        : Object.keys(data.discovered || {}).sort();
      for (const id of order) {
        const rec = data.discovered && data.discovered[id];
        if (!rec || typeof rec !== 'object') continue;
        if (next.discovered[id]) continue; // duplicate id in order: first wins, never doubled
        next.discovered[id] = JSON.parse(JSON.stringify(rec));
        next.order.push(id);
      }
    }
    this.state.formations = next;
    this._normalize(next);
    this._invalidate();
  },

  _normalize(formations) {
    if (!formations.discovered || typeof formations.discovered !== 'object') formations.discovered = {};
    if (!Array.isArray(formations.order)) formations.order = Object.keys(formations.discovered).sort();
    formations.schemaVersion = FORMATIONS_SCHEMA_VERSION;
    // Every ordered id must exist; every existing id must be ordered exactly once.
    formations.order = formations.order.filter((id, i) => formations.discovered[id] && formations.order.indexOf(id) === i);
    for (const id of Object.keys(formations.discovered)) {
      if (!formations.order.includes(id)) formations.order.push(id);
    }
  },

  // ── transient derivation ───────────────────────────────────────────────────────────────────

  _invalidate() {
    this._rt = { model: null, sectorId: null, epoch: -1, seed: 0 };
  },

  _currentEpoch(sectorId) {
    const world = this.state.world;
    const rec = world && world.residentSectors && world.residentSectors[sectorId];
    return rec && Number.isFinite(rec.epoch) ? rec.epoch : 0;
  },

  /**
   * The ambient formation model for the current sector, derived from live asteroid entities and
   * cached until sector/epoch changes. Never serialized. Returns the frozen A01 kernel model.
   */
  currentModel() {
    const state = this.state;
    const sectorId = state.world && state.world.currentSectorId || null;
    const epoch = this._currentEpoch(sectorId);
    const rt = this._rt;
    if (rt.model && rt.sectorId === sectorId && rt.epoch === epoch) return rt.model;

    const metaSeed = state.meta && Number.isFinite(state.meta.seed) ? state.meta.seed : 0;
    const seed = formationSeedFor(metaSeed, sectorId, epoch);
    const asteroids = [];
    const list = state.entityList || [];
    for (const e of list) {
      if (!e || e.alive === false || e.type !== 'asteroid' || !e.pos) continue;
      asteroids.push(e);
    }
    const model = buildAsteroidFormations(asteroids, { seed, keyOf: formationBodyKey });
    this._rt = { model, sectorId, epoch, seed };
    return model;
  },

  // ── discovery (the one durable write) ──────────────────────────────────────────────────────

  /**
   * Record a formation from the current ambient model as durably discovered. Idempotent: a
   * second discovery of the same id is a no-op (knowledge does not duplicate and never
   * regresses). Returns the discovered record or null when the id is not in the ambient model.
   */
  discover(formationId) {
    const model = this.currentModel();
    const formation = model.formations.find((f) => f.id === formationId) || null;
    if (!formation) return null;

    const formations = this.state.formations;
    if (formations.discovered[formationId]) return formations.discovered[formationId];

    const record = compactFormationRecord(formation);
    record.observed = {
      sectorId: this._rt.sectorId,
      epoch: this._rt.epoch,
      seed: this._rt.seed,
      modelVersion: FORMATION_MODEL_VERSION,
      atSimTime: Number.isFinite(this.state.simTime) ? this.state.simTime : 0,
    };
    formations.discovered[formationId] = record;
    formations.order.push(formationId);
    if (this.bus) this.bus.emit('formation:discovered', { formationId, sectorId: record.observed.sectorId });
    return record;
  },

  /** Discovered record by id, or null. Reads durable knowledge only — never derives. */
  discoveredRecord(formationId) {
    const formations = this.state.formations;
    return (formations && formations.discovered[formationId]) || null;
  },

  /**
   * Re-link a discovered record to the live field: returns the CURRENT ambient formation with
   * the same id, or null when the knowledge is stale (rock re-rolled in a later epoch, field
   * mined out, different sector). The discovered record itself is never mutated by staleness.
   */
  liveFormationFor(formationId) {
    const model = this.currentModel();
    return model.formations.find((f) => f.id === formationId) || null;
  },
};
