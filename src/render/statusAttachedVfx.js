// PQ-205.01 — victim-attached burn / goo residue.
// Presentation only. Duration and stacks come from the combat status bag; this module never
// guesses a particle lifetime past expiresTick and never writes sim state.

export const STATUS_ATTACHED_BURN_ID = 'status_burning';
export const STATUS_ATTACHED_GOO_ID = 'status_goo';
export const STATUS_ATTACHED_CAP = 8;
export const STATUS_ATTACHED_TICK_HZ = 60;

export const STATUS_ATTACHED_KIND = Object.freeze({
  BURN: 'burn',
  GOO: 'goo',
});

const NO_EMIT_SPRITES = Object.freeze([]);

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
});

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
      expiresTick: 0, radius: 0, x: 0, z: 0, dist2: 0,
    };
    _rankedPool[_rankedUsed] = rec;
  }
  _rankedUsed++;
  return rec;
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
  for (const key of Object.keys(table)) {
    const runtime = table[key];
    const statuses = runtime && runtime.statuses;
    if (!statuses) continue;
    const entity = entities.get(key) || entities.get(Number(key));
    if (!entity || entity.alive === false || !entity.pos) continue;
    for (const statusId of Object.keys(STATUS_ROWS)) {
      const active = statuses[statusId];
      const remainingS = statusRemainingSeconds(active, tick);
      if (!(remainingS > 0)) continue;
      const dx = (Number(entity.pos.x) || 0) - px;
      const dz = (Number(entity.pos.z) || 0) - pz;
      const rec = _nextRankedRecord();
      rec.entityId = entity.id;
      rec.statusId = statusId;
      rec.kind = STATUS_ROWS[statusId].kind;
      rec.stacks = Math.max(1, Math.min(3, Number(active.stacks) || 1));
      rec.remainingS = remainingS;
      rec.expiresTick = active.expiresTick;
      rec.radius = Math.max(2, Number(entity.radius) || 6);
      rec.x = Number(entity.pos.x) || 0;
      rec.z = Number(entity.pos.z) || 0;
      rec.dist2 = dx * dx + dz * dz;
    }
  }
  _rankedView.length = _rankedUsed;
  for (let i = 0; i < _rankedUsed; i++) _rankedView[i] = _rankedPool[i];
  _rankedView.sort((a, b) => a.dist2 - b.dist2 || String(a.entityId).localeCompare(String(b.entityId)));
  const cap = Math.min(STATUS_ATTACHED_CAP, _rankedUsed);
  for (let i = 0; i < cap; i++) out.push(_rankedView[i]);
  return out;
}

/**
 * One cadence decision for a live victim. Sprite life is clipped to the status remaining time
 * so thermite from a bomb and thermite from another weapon share the same truthful duration.
 * Goo residue scales with actual stacks. Reduced motion drops travelling accents; reduced flash
 * keeps the hull mark and dims it.
 */
export function planStatusAttachedEmit(victim, cadenceAgeS, accessibility = {}, dt = 0) {
  const row = victim && STATUS_ROWS[victim.statusId];
  if (!row || !victim || !(victim.remainingS > 0)) {
    return Object.freeze({ emit: false, nextCadenceAgeS: 0, sprites: Object.freeze([]) });
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
    return { emit: false, nextCadenceAgeS: age, sprites: NO_EMIT_SPRITES };
  }
  const stacks = clamp(victim.stacks, 1, 3);
  const life = Math.min(row.authoredLife, victim.remainingS);
  if (!(life > 0.04)) {
    return { emit: false, nextCadenceAgeS: age, sprites: NO_EMIT_SPRITES };
  }
  const flashScale = flashReduce ? 0.32 : 1;
  const sizeScale = flashReduce ? 0.72 : 1;
  const travelling = !motionReduce;
  const sprites = [];
  if (row.kind === STATUS_ATTACHED_KIND.BURN) {
    const count = motionReduce ? 1 : (flashReduce ? 1 : 2);
    for (let i = 0; i < count; i++) {
      sprites.push({
        kind: 'combustion',
        life,
        size0: 0.7 * sizeScale * victim.radius * 0.12,
        size1: 1.8 * sizeScale * victim.radius * 0.18,
        opacity0: 0.62 * flashScale,
        opacity1: 0,
        color: i % 2 ? row.altColor : row.color,
        vx: travelling ? (i ? 4 : -3) : 0,
        vz: travelling ? (i ? -2 : 5) : 0,
        y: 0.16,
        offset: (i === 0 ? -0.25 : 0.3) * victim.radius,
      });
    }
  } else {
    const count = motionReduce ? 1 : Math.min(3, stacks);
    const stackScale = 0.65 + 0.35 * (stacks / 3);
    for (let i = 0; i < count; i++) {
      sprites.push({
        kind: 'puff',
        life: Math.min(row.authoredLife * stackScale, victim.remainingS),
        size0: 0.9 * sizeScale * stackScale * victim.radius * 0.14,
        size1: 2.4 * sizeScale * stackScale * victim.radius * 0.22,
        opacity0: 0.48 * flashScale * stackScale,
        opacity1: 0.08 * flashScale,
        color: i % 2 ? row.altColor : row.color,
        vx: travelling ? (i - 1) * 3 : 0,
        vz: travelling ? (1 - i) * 2 : 0,
        y: 0.08,
        offset: (i - 1) * 0.28 * victim.radius,
      });
    }
  }
  return { emit: true, nextCadenceAgeS: age, sprites, remainingS: victim.remainingS, stacks };
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
