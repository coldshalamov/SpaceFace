// Combat lifecycle read - the one stable answer to "what is this hull doing right now?"
//
//   'alive'     - normal capabilities, subject to damage
//   'concussed' - helm temporarily lost (tumble) or in the stabilization window after it
//   'disabled'  - a persistent capability loss (drive subsystem down): drifting, still alive
//   'dying'     - irreversibly failing: the successor wreck of a decisive kill, between the
//                 canonical kill and its single rupture
//   'wreck'     - inert aftermath
//
// PURE and TOTAL: reads state, writes nothing, never throws, draws no rng. It owns no state - the
// facts live with their existing single writers (tumbleStates/impulseKernel for the concussion,
// combat capabilities for disabled, dyingHull's runtime mirror for the dying window) and this file
// only names them, so packets 02/03 (classifier, AI recovery) and the presenters share one
// vocabulary instead of three private boolean piles.
//
// Concussion is deliberately NOT mirrored onto `entity.status`: that would be a second writer and
// a save field. Read it here: `readConcussion(state, entity)` -> { until, source, ... } | null.

import { isRecovering, readTumbleStatus } from './tumbleStatus.js';
import { hullClassForMass } from '../data/hullFractureSeams.js';

export const LIFECYCLE = Object.freeze({
  ALIVE: 'alive',
  CONCUSSED: 'concussed',
  DISABLED: 'disabled',
  DYING: 'dying',
  WRECK: 'wreck',
});

/** Name of the transient (never serialized) runtime mirror dyingHull owns. */
export const DYING_RUNTIME_KEY = 'dyingHullRuntime';

// ---- dying window ------------------------------------------------------------------------------
// A decisive kill leaves its successor wreck failing for a window shaped by the hull's mass, not by
// arbitrary cinematic length: fodder ruptures promptly, a heavy gets a clearer failure, a large hull
// the longest. Anchors are [mass, seconds]; log-interpolated, hard-capped. Prototype values (design
// 08 says tune through comparative motion review). Mass tiers match vfx DEATH_MASS_TIER_THRESHOLDS
// (light <30, medium <80, heavy <200, capital >=200).
export const DYING_WINDOW_LAW = Object.freeze({
  anchors: Object.freeze([
    Object.freeze([6, 0.35]),
    Object.freeze([16, 0.55]),
    Object.freeze([30, 0.8]),
    Object.freeze([80, 1.3]),
    Object.freeze([200, 2.2]),
    Object.freeze([600, 3.0]),
  ]),
  minS: 0.3,
  maxS: 3.0,
  fodderCapS: 1.2,
  // Kills with no mass on the receipt are sized from radius at the scout ratio (vfx's estimate).
  massPerRadius: 16 / 14,
  defaultMass: 48,
  // A massively overkilled hull comes apart sooner than one that barely failed.
  overkillFloor: 0.6,
});

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Mass used to size the window: real mass, else radius-estimated, else the default hull. */
export function dyingMassOf(mass, radius) {
  const m = Number(mass);
  // Legacy wrecks recorded no mass and carry the 1e6 sentinel; that is "unknown", not a planet.
  if (Number.isFinite(m) && m > 0 && m < 1e5) return m;
  const r = Number(radius);
  if (Number.isFinite(r) && r > 0) return r * DYING_WINDOW_LAW.massPerRadius;
  return DYING_WINDOW_LAW.defaultMass;
}

/**
 * Seconds a decisive kill's successor stays 'dying' before its single rupture.
 * @param {{mass?:number, radius?:number, overkill?:number}} input overkill in [0,1] = how far past
 *   lethal the blow went (1 = a shot that would have killed it several times over).
 */
export function dyingWindowS(input = {}) {
  const law = DYING_WINDOW_LAW;
  const mass = dyingMassOf(input.mass, input.radius);
  const a = law.anchors;
  let seconds;
  if (mass <= a[0][0]) seconds = a[0][1];
  else if (mass >= a[a.length - 1][0]) seconds = a[a.length - 1][1];
  else {
    seconds = a[a.length - 1][1];
    for (let i = 1; i < a.length; i++) {
      if (mass <= a[i][0]) {
        const lo = a[i - 1];
        const hi = a[i];
        const t = (Math.log(mass) - Math.log(lo[0])) / (Math.log(hi[0]) - Math.log(lo[0]));
        seconds = lo[1] + (hi[1] - lo[1]) * t;
        break;
      }
    }
  }
  const overkill = Math.max(0, Math.min(1, finite(input.overkill, 0)));
  seconds *= 1 - (1 - law.overkillFloor) * overkill;
  seconds = Math.max(law.minS, Math.min(law.maxS, seconds));
  // Quantize to the 60 Hz sim so the schedule is the same on every host.
  return Math.ceil(seconds * 60 - 1e-9) / 60;
}

/** 'light' | 'medium' | 'heavy' | 'capital' - the same cut points the explosion class uses. */
export function dyingHullTier(mass, radius) {
  const m = dyingMassOf(mass, radius);
  if (m >= 200) return 'capital';
  return hullClassForMass(m);
}

// ---- reads -------------------------------------------------------------------------------------

function simNow(state) {
  if (!state) return 0;
  if (Number.isFinite(state.simTime)) return state.simTime;
  return Number.isFinite(state.tick) ? state.tick / 60 : 0;
}

function entityOf(state, entityOrId) {
  if (entityOrId && typeof entityOrId === 'object') return entityOrId;
  if (entityOrId == null || !state || !state.entities || typeof state.entities.get !== 'function') return null;
  return state.entities.get(entityOrId) || null;
}

/**
 * The concussion fact, from its existing owner (status_tumbling + the stabilization stamp).
 * `phase` is 'tumble' while the helm is lost and 'recovering' during the stabilization window
 * that follows. Returns null when the hull is neither.
 */
export function readConcussion(state, entityOrId) {
  const entity = entityOf(state, entityOrId);
  if (!entity || entity.alive === false) return null;
  const status = readTumbleStatus(state, entity);
  if (status) {
    const d = status.data && typeof status.data === 'object' ? status.data : {};
    return Object.freeze({
      phase: 'tumble',
      recovering: false,
      until: finite(d.until, simNow(state)),
      startedAt: finite(d.startedAt, simNow(state)),
      source: d.source || d.cause || null,
      kind: d.kind || null,
      cause: d.cause || null,
      chainCount: Math.max(0, finite(d.chainCount, 0) | 0),
    });
  }
  if (isRecovering(state, entity)) {
    return Object.freeze({
      phase: 'recovering',
      recovering: true,
      until: finite(entity.data && entity.data.recoveringUntil, simNow(state)),
      startedAt: finite(entity.data && entity.data.lastTumbleStartedAt, simNow(state)),
      source: null,
      kind: null,
      cause: null,
      chainCount: Math.max(0, finite(entity.data && entity.data.lastTumbleChainCount, 0) | 0),
    });
  }
  return null;
}

/** True while the helm is actually lost (steering + fire channels gated), not merely recovering. */
export function isHelmLost(state, entityOrId) {
  const c = readConcussion(state, entityOrId);
  return !!c && c.phase === 'tumble';
}

/** A persistent capability loss (drive down) on a live non-player hull. */
export function isDisabledHull(state, entityOrId) {
  const entity = entityOf(state, entityOrId);
  if (!entity || entity.alive === false) return false;
  if (entity.type !== 'ship' && entity.type !== 'drone') return false;
  const runtime = state && state.combat && state.combat.entities
    ? state.combat.entities[String(entity.id)] : null;
  return !!(runtime && runtime.capabilities && runtime.capabilities.drive === false);
}

/**
 * The dying record of a wreck, or null. A record is honored only while it still names THIS body:
 * the wreck must be live, a wreck, and carry the same kill stamp the record was minted against, so a
 * reused entity id can never inherit a stranger's failure.
 */
export function readDying(state, entityOrId) {
  const entity = entityOf(state, entityOrId);
  if (!entity || entity.alive === false || entity.type !== 'wreck') return null;
  const runtime = state && state[DYING_RUNTIME_KEY];
  const byId = runtime && runtime.byWreckId;
  const rec = byId ? byId[entity.id] : null;
  if (!rec || rec.ruptured === true) return null;
  const killedAt = entity.data && entity.data.killedAt;
  if (killedAt !== rec.killedAt) return null;
  if (!(simNow(state) < rec.ruptureAt)) return null;
  return rec;
}

/** One of LIFECYCLE.* for any entity. Total: unknown or missing entities read 'alive'. */
export function lifecycleOf(state, entityOrId) {
  const entity = entityOf(state, entityOrId);
  if (!entity) return LIFECYCLE.ALIVE;
  if (entity.type === 'wreck') return readDying(state, entity) ? LIFECYCLE.DYING : LIFECYCLE.WRECK;
  if (entity.alive === false) return LIFECYCLE.WRECK;
  // A tumble outranks a drive-down: the helm is lost *now*, and the UI/AI care about the short fact.
  if (readConcussion(state, entity)) return LIFECYCLE.CONCUSSED;
  if (isDisabledHull(state, entity)) return LIFECYCLE.DISABLED;
  return LIFECYCLE.ALIVE;
}

/** Hull may still be shot at, targeted, captured or finished as a *combatant*. */
export function isCombatant(state, entityOrId) {
  const l = lifecycleOf(state, entityOrId);
  return l === LIFECYCLE.ALIVE || l === LIFECYCLE.CONCUSSED || l === LIFECYCLE.DISABLED;
}

/** Irreversibly dying: no target bracket, no combat affordances, rupture is scheduled. */
export function isIrreversiblyDying(state, entityOrId) {
  return lifecycleOf(state, entityOrId) === LIFECYCLE.DYING;
}
