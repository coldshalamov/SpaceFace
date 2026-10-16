// PQ-205.01 — victim-attached burn / goo residue.
// Presentation only. Duration and stacks come from the combat status bag; this module never
// guesses a particle lifetime past expiresTick and never writes sim state.

import { PINNED_STATUS_ID, UNMOORED_STATUS_ID } from '../data/combatDefs.js';

export const STATUS_ATTACHED_BURN_ID = 'status_burning';
export const STATUS_ATTACHED_GOO_ID = 'status_goo';
export const STATUS_ATTACHED_GRAVITY_ID = 'status_gravity_marked';
export const STATUS_ATTACHED_PINNED_ID = PINNED_STATUS_ID;
export const STATUS_ATTACHED_UNMOORED_ID = UNMOORED_STATUS_ID;
export const STATUS_ATTACHED_CAP = 8;
export const STATUS_ATTACHED_TICK_HZ = 60;

// PIC-31 — damaged-hull vent id and band-entry edge. The bands are owned by the integrity
// instrument (src/ui/views/hullIntegrity.js) and mirrored by src/combat/damage.js; this
// module never changes them. The vent is not a status-bag entry, so it has its own
// collector below rather than a STATUS_ROWS row.
export const STATUS_ATTACHED_VENT_ID = 'status_hull_vent';
export const HULL_VENT_ENTRY_FRACTION = 0.55;
export const HULL_VENT_CADENCE_S = 0.14;

// PIC-31 — the one status-id → matter-kind map, shared with
// src/render/vfx/statusMatterVfx.js so the loop's touch gate and this
// collector can never disagree on what draws. Unknown ids draw nothing.
export function matterKindForStatusId(statusId) {
  if (statusId === STATUS_ATTACHED_BURN_ID) return STATUS_ATTACHED_KIND.BURN;
  if (statusId === STATUS_ATTACHED_GOO_ID) return STATUS_ATTACHED_KIND.GOO;
  if (statusId === STATUS_ATTACHED_GRAVITY_ID) return STATUS_ATTACHED_KIND.GRAVITY;
  if (statusId === STATUS_ATTACHED_PINNED_ID) return STATUS_ATTACHED_KIND.PINNED;
  if (statusId === STATUS_ATTACHED_UNMOORED_ID) return STATUS_ATTACHED_KIND.UNMOORED;
  if (statusId === STATUS_ATTACHED_VENT_ID) return 'vent';
  return null;
}

export const STATUS_ATTACHED_KIND = Object.freeze({
  BURN: 'burn',
  GOO: 'goo',
  GRAVITY: 'gravity',
  PINNED: 'pinned',
  UNMOORED: 'unmoored',
});

const NO_EMIT_SPRITES = Object.freeze([]);
// The no-emit answer runs every presented frame for every victim: never allocate for it. An
// unusable victim gets one frozen shared result; a victim that is merely between cadence pulses
// gets the retained scratch below, valid only until the next plan call (the caller reads
// nextCadenceAgeS synchronously, exactly like collectStatusAttachedVictims' pooled records).
const NO_EMIT_INVALID = Object.freeze({ emit: false, nextCadenceAgeS: 0, sprites: NO_EMIT_SPRITES });
const _noEmitScratch = { emit: false, nextCadenceAgeS: 0, sprites: NO_EMIT_SPRITES };

function noEmitAt(age) {
  _noEmitScratch.nextCadenceAgeS = age;
  return _noEmitScratch;
}

function statusSeed(entityId, statusId, stacks) {
  let seed = typeof entityId === 'number' ? entityId | 0 : 2166136261;
  if (typeof entityId === 'string') {
    for (let i = 0; i < entityId.length; i++) seed = Math.imul(seed ^ entityId.charCodeAt(i), 16777619);
  }
  seed ^= statusId === STATUS_ATTACHED_BURN_ID ? 0x6d2b79f5 : 0x1b873593;
  seed = Math.imul(seed ^ (stacks | 0), 0x7feb352d);
  return ((seed ^ (seed >>> 16)) >>> 0) / 4294967296;
}

const STATUS_ROWS = Object.freeze({
  [STATUS_ATTACHED_BURN_ID]: Object.freeze({
    kind: STATUS_ATTACHED_KIND.BURN,
    cadenceS: 0.08,
    color: '#ff5a2a',
    altColor: '#ffb35c',
    authoredLife: 0.42,
  }),
  [STATUS_ATTACHED_GOO_ID]: Object.freeze({
    kind: STATUS_ATTACHED_KIND.GOO,
    cadenceS: 0.12,
    color: '#7ac043',
    altColor: '#6f8f3a',
    authoredLife: 0.7,
  }),
  [STATUS_ATTACHED_GRAVITY_ID]: Object.freeze({
    kind: STATUS_ATTACHED_KIND.GRAVITY,
    cadenceS: 0.12,
    color: '#7ee7ff',
    altColor: '#2450aa',
    authoredLife: 0.42,
  }),
  // A Well's clamp: heavy, compressed, slow, deep cool blue.
  [STATUS_ATTACHED_PINNED_ID]: Object.freeze({
    kind: STATUS_ATTACHED_KIND.PINNED,
    cadenceS: 0.16,
    color: '#3d63d6',
    altColor: '#17265e',
    authoredLife: 0.5,
  }),
  // A Repulsor's lift: light, loose, buoyant, warm pale.
  [STATUS_ATTACHED_UNMOORED_ID]: Object.freeze({
    kind: STATUS_ATTACHED_KIND.UNMOORED,
    cadenceS: 0.16,
    color: '#ffd9a0',
    altColor: '#fff3d6',
    authoredLife: 0.5,
  }),
});
// Frozen id list — Object.keys(STATUS_ROWS) inside the entity loop allocated every
// presented frame. Soft-GPU fps not claimed.
const STATUS_ROW_IDS = Object.freeze([
  STATUS_ATTACHED_BURN_ID, STATUS_ATTACHED_GOO_ID, STATUS_ATTACHED_GRAVITY_ID,
  STATUS_ATTACHED_PINNED_ID, STATUS_ATTACHED_UNMOORED_ID,
]);

function clamp(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}

export function statusRemainingSeconds(active, tick, hz = STATUS_ATTACHED_TICK_HZ) {
  if (!active || !Number.isFinite(active.expiresTick)) return 0;
  const t = Number.isInteger(tick) ? tick : 0;
  return Math.max(0, (active.expiresTick - t) / hz);
}

// Ranked records are pooled and `ranked`/`out` are caller-supplied scratch: this collector runs
// every presented frame in flight, so nothing here may allocate per call. Results are consumed
// synchronously — a returned record is only valid until the next collect call.
const _rankedPool = [];
const _rankedView = [];
let _rankedUsed = 0;

function _nextRankedRecord() {
  let rec = _rankedPool[_rankedUsed];
  if (!rec) {
    rec = {
      entityId: 0, statusId: '', kind: '', stacks: 1, remainingS: 0,
      expiresTick: 0, tick: 0, radius: 0, x: 0, z: 0, vx: 0, vz: 0, dist2: 0,
      key: 0, entityNum: 0, side: 0, dx: 0, dz: 0, hullFraction: 0,
    };
    _rankedPool[_rankedUsed] = rec;
  }
  _rankedUsed++;
  return rec;
}

// Per-victim cadence key for the caller's cooldown map: numeric when the id is numeric (the
// common case — no string alloc per frame), string-composite fallback for exotic ids.
function _victimKey(entityId, statusId) {
  if (typeof entityId === 'number') {
    return entityId * 5 + (statusId === STATUS_ATTACHED_GOO_ID ? 1 : statusId === STATUS_ATTACHED_GRAVITY_ID ? 2
      : statusId === STATUS_ATTACHED_PINNED_ID ? 3 : statusId === STATUS_ATTACHED_UNMOORED_ID ? 4 : 0);
  }
  return String(entityId) + ':' + statusId;
}

export function collectStatusAttachedVictims(state, out = []) {
  out.length = 0;
  const table = state && state.combat && state.combat.entities;
  const entities = state && state.entities;
  if (!table || typeof table !== 'object' || !entities || typeof entities.get !== 'function') {
    return out;
  }
  const tick = Number.isInteger(state.tick) ? state.tick : 0;
  const player = state.playerId != null ? entities.get(state.playerId) : null;
  const px = player && player.pos ? Number(player.pos.x) || 0 : 0;
  const pz = player && player.pos ? Number(player.pos.z) || 0 : 0;
  _rankedUsed = 0;
  // for...in over the combat table — Object.keys(table) allocated a fresh array
  // every presented frame (contradicted the alloc-free contract above). Soft-GPU
  // fps not claimed.
  for (const key in table) {
    const runtime = table[key];
    const statuses = runtime && runtime.statuses;
    if (!statuses) continue;
    const entity = entities.get(key) || entities.get(Number(key));
    if (!entity || entity.alive === false || !entity.pos) continue;
    for (let si = 0; si < STATUS_ROW_IDS.length; si++) {
      const statusId = STATUS_ROW_IDS[si];
      const active = statuses[statusId];
      const remainingS = statusRemainingSeconds(active, tick);
      if (!(remainingS > 0)) continue;
      const dx = (Number(entity.pos.x) || 0) - px;
      const dz = (Number(entity.pos.z) || 0) - pz;
      const rec = _nextRankedRecord();
      rec.entityId = entity.id;
      rec.statusId = statusId;
      rec.key = _victimKey(entity.id, statusId);
      rec.entityNum = typeof entity.id === 'number' ? entity.id : 0;
      rec.kind = STATUS_ROWS[statusId].kind;
      rec.stacks = Math.max(1, Math.min(3, Number(active.stacks) || 1));
      rec.remainingS = remainingS;
      rec.expiresTick = active.expiresTick;
      rec.tick = tick;
      rec.radius = Math.max(2, Number(entity.radius) || 6);
      rec.x = Number(entity.pos.x) || 0;
      rec.z = Number(entity.pos.z) || 0;
      rec.vx = Number.isFinite(entity.vel?.x) ? entity.vel.x : 0;
      rec.vz = Number.isFinite(entity.vel?.z) ? entity.vel.z : 0;
      rec.dist2 = dx * dx + dz * dz;
    }
  }
  // PIC-31 — venting hulls join the same ranked victim flow so the vfx.js loop
  // admits, cadences and draws them with no loop change. The latch lives on the
  // combat runtime (owned by src/combat/damage.js); this pass only admits it
  // while the hull actually sits below the entry edge and alive — the same rule
  // collectHullVentRecords pins. Pooled records, no per-frame allocation.
  for (const key in table) {
    const runtime = table[key];
    const vent = runtime && runtime.hullVent;
    if (!vent || typeof vent !== 'object') continue;
    const entity = entities.get(key) || entities.get(Number(key));
    if (!entity || entity.alive === false || !entity.pos) continue;
    const max = Number(entity.hullMax) || 0;
    if (!(max > 0)) continue;
    const fraction = Math.max(0, Number(entity.hull) || 0) / max;
    if (!(fraction < HULL_VENT_ENTRY_FRACTION)) continue;
    const dx = (Number(entity.pos.x) || 0) - px;
    const dz = (Number(entity.pos.z) || 0) - pz;
    const rec = _nextRankedRecord();
    rec.entityId = entity.id;
    rec.statusId = STATUS_ATTACHED_VENT_ID;
    rec.key = _victimKey(entity.id, STATUS_ATTACHED_VENT_ID);
    rec.entityNum = typeof entity.id === 'number' ? entity.id : 0;
    rec.kind = 'vent';
    rec.stacks = 1;
    rec.remainingS = Infinity;
    rec.expiresTick = Infinity;
    rec.tick = tick;
    rec.radius = Math.max(2, Number(entity.radius) || 6);
    rec.x = Number(entity.pos.x) || 0;
    rec.z = Number(entity.pos.z) || 0;
    rec.vx = Number.isFinite(entity.vel?.x) ? entity.vel.x : 0;
    rec.vz = Number.isFinite(entity.vel?.z) ? entity.vel.z : 0;
    rec.dist2 = dx * dx + dz * dz;
    rec.side = vent.side === -1 ? -1 : 1;
    rec.dx = (Number(vent.x) || 0) - rec.x;
    rec.dz = (Number(vent.z) || 0) - rec.z;
    rec.hullFraction = fraction;
  }
  _rankedView.length = _rankedUsed;
  for (let i = 0; i < _rankedUsed; i++) _rankedView[i] = _rankedPool[i];
  // Numeric tie-break first so the localeCompare strings only allocate on exotic id shapes.
  _rankedView.sort((a, b) => a.dist2 - b.dist2 || (a.entityNum - b.entityNum)
    || String(a.entityId).localeCompare(String(b.entityId)));
  const cap = Math.min(STATUS_ATTACHED_CAP, _rankedUsed);
  for (let i = 0; i < cap; i++) out.push(_rankedView[i]);
  return out;
}

/**
 * One cadence decision for a live victim. Sprite life is clipped to the status remaining time
 * so thermite from a bomb and thermite from another weapon share the same truthful duration.
 * Goo and burn residue scale with actual stacks. Reduced motion drops travelling accents; reduced
 * flash keeps the hull mark and dims it.
 */
export function planStatusAttachedEmit(victim, cadenceAgeS, accessibility = {}, dt = 0) {
  // PIC-31 — vent victims carry the hit seat on the pooled record; the vent
  // planner below owns their cadence. planHullVentEmit is hoisted, so the
  // forward reference is safe.
  if (victim && victim.statusId === STATUS_ATTACHED_VENT_ID) {
    return planHullVentEmit({
      kind: 'vent',
      entityId: victim.entityId,
      radius: victim.radius,
      side: victim.side,
      dx: victim.dx,
      dz: victim.dz,
      vx: victim.vx,
      vz: victim.vz,
      hullFraction: victim.hullFraction,
    }, cadenceAgeS, accessibility, dt);
  }
  const row = victim && STATUS_ROWS[victim.statusId];
  if (!row || !victim || !(victim.remainingS > 0)) {
    return NO_EMIT_INVALID;
  }
  const motionReduce = !!accessibility.motionReduce;
  const flashReduce = !!accessibility.flashReduce;
  const period = row.cadenceS;
  let age = Math.max(0, Number(cadenceAgeS) || 0) + Math.max(0, Number(dt) || 0);
  let emit = false;
  if (age >= period) {
    emit = true;
    age %= period;
  }
  if (!emit) {
    return noEmitAt(age);
  }
  const stacks = clamp(victim.stacks, 1, 3);
  const life = Math.min(row.authoredLife, victim.remainingS);
  if (!(life > 0.04)) {
    return noEmitAt(age);
  }
  // Gravity, pinned and unmoored marks are retained hull-seated geometry, never an emitted cloud.
  // Preserve the same cadence admission while StatusMatterVfx owns their distinct moving forms.
  if (row.kind === STATUS_ATTACHED_KIND.GRAVITY || row.kind === STATUS_ATTACHED_KIND.PINNED
    || row.kind === STATUS_ATTACHED_KIND.UNMOORED) {
    return { emit: true, nextCadenceAgeS: age, sprites: NO_EMIT_SPRITES, remainingS: victim.remainingS, stacks };
  }
  const flashScale = flashReduce ? 0.32 : 1;
  const sizeScale = flashReduce ? 0.72 : 1;
  const travelling = !motionReduce;
  // An emission is a parcel leaving a particular damaged hull, not an identical clip. Its
  // cadence changes the fold/peel direction, while inherited velocity keeps it with the ship.
  // Reduced motion holds a stable body mark; lifecycle time and stacks still belong to combat.
  const seed = statusSeed(victim.entityId, victim.statusId, stacks);
  const cadence = travelling ? Math.floor((Number(victim.tick) || 0) / (period * STATUS_ATTACHED_TICK_HZ)) : 0;
  const phase = seed * Math.PI * 2 + cadence * 2.399963229728653;
  const carryX = travelling ? (Number(victim.vx) || 0) * 0.72 : 0;
  const carryZ = travelling ? (Number(victim.vz) || 0) * 0.72 : 0;
  const radius = Math.max(2, Number(victim.radius) || 6);
  const sprites = [];
  if (row.kind === STATUS_ATTACHED_KIND.BURN) {
    // PB-ORD-A (SF-036): the burn reads as committed only when the picture carries the actual
    // stacks — the same law goo already follows. One stack stays a thin splash; sustained
    // contact (max 3) burns wider, brighter, with more fronts. Sprite life stays clipped to
    // the status's true remaining time above; the stacks never invent extra time.
    const burnStacks = clamp(victim.stacks, 1, 3);
    const burnScale = 0.70 + 0.30 * (burnStacks / 3);
    const burnOpacity = 0.78 + 0.22 * (burnStacks / 3);
    const count = motionReduce ? 1 : (flashReduce ? 1 : Math.min(3, burnStacks));
    for (let i = 0; i < count; i++) {
      const angle = phase + i * 2.7;
      const fold = 0.9 + 0.1 * Math.sin(angle * 1.31);
      const jet = Math.min(8, radius * 0.65) * (0.8 + seed * 0.4);
      sprites.push({
        kind: 'combustion',
        life,
        size0: 0.7 * sizeScale * burnScale * radius * 0.12 * fold,
        size1: 1.8 * sizeScale * burnScale * radius * 0.18 * fold,
        opacity0: 0.62 * flashScale * burnOpacity,
        opacity1: 0,
        color: i % 2 ? row.altColor : row.color,
        vx: travelling ? carryX + Math.cos(angle) * jet : 0,
        vz: travelling ? carryZ + Math.sin(angle) * jet : 0,
        y: 0.16,
        offset: Math.cos(angle) * 0.32 * radius,
      });
    }
  } else {
    const count = motionReduce ? 1 : Math.min(3, stacks);
    const stackScale = 0.65 + 0.35 * (stacks / 3);
    for (let i = 0; i < count; i++) {
      const angle = phase + i * 2.0943951023931953;
      const lobe = 0.92 + 0.08 * Math.cos(angle * 1.43);
      const peel = Math.min(5, radius * 0.32);
      sprites.push({
        kind: 'puff',
        life: Math.min(row.authoredLife * stackScale, victim.remainingS),
        size0: 0.9 * sizeScale * stackScale * radius * 0.14 * lobe,
        size1: 2.4 * sizeScale * stackScale * radius * 0.22 * lobe,
        opacity0: 0.48 * flashScale * stackScale,
        opacity1: 0.08 * flashScale,
        color: i % 2 ? row.altColor : row.color,
        vx: travelling ? carryX + Math.cos(angle) * peel : 0,
        vz: travelling ? carryZ + Math.sin(angle) * peel : 0,
        y: 0.08,
        offset: Math.cos(angle) * 0.34 * radius,
      });
    }
  }
  return { emit: true, nextCadenceAgeS: age, sprites, remainingS: victim.remainingS, stacks };
}

// PIC-31 — damaged-hull vent records. Presentation only: the damage router owns the
// runtime.hullVent latch; this collector only admits it while the hull actually sits
// below the damaged-band entry edge and alive. Repair above the band and death stop
// here (death also clears the latch in damage.js), so a vent never outlives trouble.
// At most one record per hull: the latch is a single slot, overwritten on re-entry.
export function collectHullVentRecords(state, out = []) {
  out.length = 0;
  const table = state && state.combat && state.combat.entities;
  const entities = state && state.entities;
  if (!table || typeof table !== 'object' || !entities || typeof entities.get !== 'function') {
    return out;
  }
  const tick = Number.isInteger(state.tick) ? state.tick : 0;
  for (const key in table) {
    const runtime = table[key];
    const vent = runtime && runtime.hullVent;
    if (!vent || typeof vent !== 'object') continue;
    const entity = entities.get(key) || entities.get(Number(key));
    if (!entity || entity.alive === false || !entity.pos) continue;
    const max = Number(entity.hullMax) || 0;
    if (!(max > 0)) continue;
    const fraction = Math.max(0, Number(entity.hull) || 0) / max;
    if (!(fraction < HULL_VENT_ENTRY_FRACTION)) continue;
    if (out.length >= STATUS_ATTACHED_CAP) break;
    out.push({
      entityId: entity.id,
      statusId: STATUS_ATTACHED_VENT_ID,
      kind: 'vent',
      side: vent.side === -1 ? -1 : 1,
      x: Number(entity.pos.x) || 0,
      z: Number(entity.pos.z) || 0,
      dx: (Number(vent.x) || 0) - (Number(entity.pos.x) || 0),
      dz: (Number(vent.z) || 0) - (Number(entity.pos.z) || 0),
      radius: Math.max(2, Number(entity.radius) || 6),
      hullFraction: fraction,
      startedTick: Number.isInteger(vent.startedTick) ? vent.startedTick : 0,
      tick,
      vx: Number.isFinite(entity.vel?.x) ? entity.vel.x : 0,
      vz: Number.isFinite(entity.vel?.z) ? entity.vel.z : 0,
    });
  }
  return out;
}

/**
 * PIC-31 — one cadence decision for a venting hull. Gas parcels peel off the recorded
 * hit point and drift outward along it, with inherited velocity keeping them with the
 * ship. Reduced motion holds a stable body mark; reduced flash keeps it dimmer.
 * Deterministic: the parcel variation hashes from (entityId, side), never Math.random.
 */
export function planHullVentEmit(vent, cadenceAgeS, accessibility = {}, dt = 0) {
  if (!vent || vent.kind !== 'vent') {
    return NO_EMIT_INVALID;
  }
  const motionReduce = !!accessibility.motionReduce;
  const flashReduce = !!accessibility.flashReduce;
  const period = HULL_VENT_CADENCE_S;
  let age = Math.max(0, Number(cadenceAgeS) || 0) + Math.max(0, Number(dt) || 0);
  let emit = false;
  if (age >= period) {
    emit = true;
    age %= period;
  }
  if (!emit) {
    return noEmitAt(age);
  }
  const radius = Math.max(2, Number(vent.radius) || 6);
  const side = vent.side === -1 ? -1 : 1;
  const travelling = !motionReduce;
  const seed = statusSeed(vent.entityId, STATUS_ATTACHED_VENT_ID, side < 0 ? 1 : 2);
  const hx = Number(vent.dx) || 0;
  const hz = Number(vent.dz) || 0;
  const hLen = Math.hypot(hx, hz) || 1;
  const carryX = travelling ? (Number(vent.vx) || 0) * 0.72 : 0;
  const carryZ = travelling ? (Number(vent.vz) || 0) * 0.72 : 0;
  const flashScale = flashReduce ? 0.32 : 1;
  const sizeScale = flashReduce ? 0.72 : 1;
  const peel = Math.min(5, radius * 0.32);
  const count = motionReduce ? 1 : (flashReduce ? 1 : 2);
  const sprites = [];
  for (let i = 0; i < count; i++) {
    const push = travelling ? peel * (0.6 + 0.4 * seed + i * 0.35) : 0;
    sprites.push({
      kind: 'puff',
      life: 0.7,
      size0: 0.9 * sizeScale * radius * 0.14,
      size1: 2.4 * sizeScale * radius * 0.22,
      opacity0: 0.48 * flashScale,
      opacity1: 0.08 * flashScale,
      color: i % 2 ? '#e8f1f8' : '#9fb3c8',
      vx: travelling ? carryX + (hx / hLen) * push : 0,
      vz: travelling ? carryZ + (hz / hLen) * push : 0,
      y: 0.08,
      offset: side * 0.5 * radius,
    });
  }
  return { emit: true, nextCadenceAgeS: age, sprites, hullFraction: vent.hullFraction, side };
}

const _ACC_NONE = Object.freeze({ motionReduce: false, flashReduce: false });
const _ACC_MOTION = Object.freeze({ motionReduce: true, flashReduce: false });
const _ACC_FLASH = Object.freeze({ motionReduce: false, flashReduce: true });
const _ACC_BOTH = Object.freeze({ motionReduce: true, flashReduce: true });

export function statusAttachedAccessibility(settings) {
  const video = (settings && settings.video) || {};
  const accessibility = (settings && settings.accessibility) || {};
  const motionReduce = !!video.motionReduce;
  const flashReduce = !!(video.flashReduce || accessibility.flashReduce || accessibility.reducedFlash);
  return motionReduce ? (flashReduce ? _ACC_BOTH : _ACC_MOTION) : (flashReduce ? _ACC_FLASH : _ACC_NONE);
}
