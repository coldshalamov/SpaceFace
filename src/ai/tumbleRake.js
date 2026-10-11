// C10 — a tumbling heavy rakes its own battle line (THE WORLD ANSWERS, build_map §15.6).
//
// Pure geometry + a tiny record on `entity.data`; no bus, no world root, no Three.js. The caller
// (tumbleStates) owns the emits and the combat-kernel damage route, so there is still one writer
// for hull/shield damage and no new system.
//
// The honest physical version: the point-defence battery's solution is frozen in HULL-LOCAL frame
// at the instant the helm is lost (a decontrolled hull cannot slew its turrets), so the
// world-frame bearing is `rot + localBearing` and rotates with the spin the hit gave the hull.
// The beam keeps burning along that bearing for the whole (already bounded) tumble and sweeps
// across whatever stands in the arc — INCLUDING hulls on its own team. A fast spin crosses a
// hull quickly, so the damage a victim takes scales with how long the beam dwells on it.
//
// Scope law:
//   - NPC heavy / capital hulls only (mass floor = aiPorts.operationalBandsFor 'heavy' = 140).
//     Light and medium hulls never rake; the player's hull is never a source and never a victim.
//   - Victims are SAME-TEAM ships/drones. A raking hull never gains new authority to shoot
//     anyone it was not already shooting — fire authority (engagementAuthority) is untouched.
//   - The battery is the hull's own live direct-fire turrets (the flak/PD turret and the other
//     auto_turret mounts). Beams and ordnance are not part of it; a hull with none has nothing
//     to rake with.
import { WEAPONS } from '../data/weapons.js';
import { wrapAngle } from './contracts.js';

/** Heavy-band floor: aiPorts.operationalBandsFor — light <40, medium <140, heavy <700, capital. */
export const TUMBLE_RAKE_MIN_MASS = 140;
/** One victim is hit at most once per window; the salvo is the battery's output over that window. */
export const TUMBLE_RAKE_HIT_COOLDOWN_TICKS = 18;
/** Beam reach is the battery's own range, never beyond this. */
export const TUMBLE_RAKE_MAX_RANGE = 700;
/** A beam that sweeps past faster than this still lands a sliver of its salvo. */
export const TUMBLE_RAKE_MIN_DWELL_SCALE = 0.15;
/** The bark (barkDirector) only speaks while the line is near the player's picture. */
export const TUMBLE_RAKE_BARK_RANGE = 1600;

const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));
const RAY_PAD_WU = 2;
const SEED_KEY = 'tumbleRakeSeed';
const RECORD_KEY = 'tumbleRake';

function finite(v, fb = 0) { return Number.isFinite(v) ? v : fb; }

function massOf(entity) {
  const m = entity && (entity.physicsBody && entity.physicsBody.mass || entity.mass);
  return Number.isFinite(m) && m > 0 ? m : 1;
}

/** True for a non-player ship in the heavy or capital mass band. */
export function isRakeCapableHull(state, entity) {
  if (!entity || entity.alive === false || entity.type !== 'ship') return false;
  if (state && entity.id === state.playerId) return false;
  return massOf(entity) >= TUMBLE_RAKE_MIN_MASS;
}

/** Turret-class direct fire: PD/flak and the autonomous turrets. Beams and ordnance are not raked with. */
function isRakeMount(w, rec) {
  // A capital's launcher/beam row is forced onto a turret ring at spawn (tracking becomes
  // 'auto_turret'), so what the weapon IS comes from the catalog row, not the mount override.
  const def = WEAPON_BY_ID.get(w.defId || w.id) || rec;
  if (def.continuous === true || w.continuous === true || def.mount === 'launcher') return false;
  const base = def.tracking;
  if (base === 'homing' || base === 'deploy' || base === 'hitscan') return false;
  return def.intercepts === true || w.intercepts === true
    || w.facing === 'turret' || w.tracking === 'auto_turret' || base === 'auto_turret';
}

/**
 * The hull's turret / point-defence battery: live direct-fire turret mounts (flak included),
 * summed as one salvo.
 * @returns {{ mounts: number, range: number, salvoDamage: number } | null}
 */
export function rakeBatteryFor(state, entity) {
  const mounts = entity && entity.data && Array.isArray(entity.data.weapons) ? entity.data.weapons : null;
  if (!mounts || !mounts.length) return null;
  const runtime = state && state.combat && state.combat.entities
    ? state.combat.entities[String(entity.id)] : null;
  const windowS = TUMBLE_RAKE_HIT_COOLDOWN_TICKS / 60;
  let live = 0;
  let range = 0;
  let salvo = 0;
  for (const w of mounts) {
    if (!w) continue;
    // Resolved mount records carry the def fields verbatim; a bare {id} falls back to the catalog.
    const rec = w.tracking != null || w.intercepts != null ? w : (WEAPON_BY_ID.get(w.defId || w.id) || w);
    if (!isRakeMount(w, rec)) continue;
    const sub = runtime && runtime.subsystems && runtime.subsystems[w.subsystemId || 'subsystem_weapon'];
    if (sub && (sub.destroyed === true || sub.effectiveDisabled === true)) continue;
    const dmg = finite(w.dmg != null ? w.dmg : rec.dmg, 0);
    const rof = finite(w.rof != null ? w.rof : rec.rof, 0);
    if (!(dmg > 0) || !(rof > 0)) continue;
    live += 1;
    range = Math.max(range, finite(w.range != null ? w.range : rec.range, 0));
    salvo += dmg * rof * windowS;
  }
  if (!live || !(range > 0) || !(salvo > 0)) return null;
  return { mounts: live, range: Math.min(range, TUMBLE_RAKE_MAX_RANGE), salvoDamage: salvo };
}

/**
 * At helm loss: remember the last engagement bearing IF the hull was actually shooting. Called by
 * tumbleStates immediately before it silences the AI's fire intent. Never overwrites a live sweep.
 */
export function captureTumbleRakeSeed(state, entity) {
  const data = entity && entity.data;
  if (!data || !isRakeCapableHull(state, entity)) return false;
  if (data[RECORD_KEY]) return false;
  const intent = data.intent;
  if (!intent || intent.fire !== true || !Number.isFinite(intent.aimAngle)) return false;
  data[SEED_KEY] = { aim: intent.aimAngle, rot: finite(entity.rot), tick: state.tick | 0 };
  return true;
}

function promoteSeed(state, entity) {
  const data = entity.data;
  const seed = data[SEED_KEY];
  if (!seed) return null;
  delete data[SEED_KEY];
  const battery = rakeBatteryFor(state, entity);
  if (!battery) return null;
  const rec = {
    // The solution at onset, in the hull's own frame: it cannot track, so it turns with the hull.
    localBearing: wrapAngle(seed.aim - seed.rot),
    prevWorld: wrapAngle(finite(entity.rot) + wrapAngle(seed.aim - seed.rot)),
    startedTick: state.tick | 0,
    range: battery.range,
    salvoDamage: battery.salvoDamage,
    mounts: battery.mounts,
    lastHit: {},
    announced: false,
  };
  data[RECORD_KEY] = rec;
  return rec;
}

export function readTumbleRake(entity) {
  return entity && entity.data && entity.data[RECORD_KEY] || null;
}

export function clearTumbleRake(entity) {
  const data = entity && entity.data;
  if (!data) return;
  if (data[RECORD_KEY]) delete data[RECORD_KEY];
  if (data[SEED_KEY]) delete data[SEED_KEY];
}

/** World-frame bearing the frozen solution points at right now. */
export function rakeWorldBearing(entity, rec) {
  return wrapAngle(finite(entity.rot) + rec.localBearing);
}

/**
 * One tick of the sweep. Returns the friendlies the beam crossed since the last tick (each with
 * its dwell-scaled damage), in stable shipLike order. Mutates only the entity's own rake record.
 * @returns {Array<{ victim: object, damage: number, bearing: number, dwellScale: number }>}
 */
export function stepTumbleRake(state, entity, ships) {
  if (!isRakeCapableHull(state, entity)) return [];
  const data = entity.data;
  let rec = data && data[RECORD_KEY] || null;
  if (!rec) rec = promoteSeed(state, entity);
  if (!rec) return [];

  const tick = state.tick | 0;
  const now = rakeWorldBearing(entity, rec);
  const prev = rec.prevWorld;
  const delta = wrapAngle(now - prev);
  rec.prevWorld = now;
  const sweepRate = Math.abs(delta) * 60; // rad/s, this tick's hull spin projected on the beam

  const out = [];
  if (!ships) return out;
  const ox = finite(entity.pos && entity.pos.x);
  const oz = finite(entity.pos && entity.pos.z);
  for (const v of ships) {
    if (!v || v === entity || v.id === entity.id || v.alive === false) continue;
    if (v.id === state.playerId) continue;
    if (v.type !== 'ship' && v.type !== 'drone') continue;
    if (entity.team == null || v.team !== entity.team) continue;
    const dx = finite(v.pos && v.pos.x) - ox;
    const dz = finite(v.pos && v.pos.z) - oz;
    const dist = Math.hypot(dx, dz);
    const radius = Math.max(1, finite(v.radius, 1)) + RAY_PAD_WU;
    if (dist - radius > rec.range) continue;
    const last = rec.lastHit[v.id];
    if (last != null && tick - last < TUMBLE_RAKE_HIT_COOLDOWN_TICKS) continue;
    // Angular half-width the victim subtends; a hull inside the beam's origin is simply struck.
    const half = dist <= radius ? Math.PI : Math.asin(Math.min(1, radius / dist));
    const t = wrapAngle(Math.atan2(dz, dx) - prev);
    const swept = delta >= 0
      ? (t >= -half && t <= delta + half)
      : (t <= half && t >= delta - half);
    if (!swept) continue;
    const dwellS = sweepRate > 1e-6 ? (2 * half) / sweepRate : Infinity;
    const windowS = TUMBLE_RAKE_HIT_COOLDOWN_TICKS / 60;
    const dwellScale = Math.min(1, Math.max(TUMBLE_RAKE_MIN_DWELL_SCALE, dwellS / windowS));
    rec.lastHit[v.id] = tick;
    out.push({
      victim: v,
      damage: rec.salvoDamage * dwellScale,
      bearing: now,
      dwellScale,
    });
  }
  return out;
}
