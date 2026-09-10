// Survival style scoring (PQ-133.07a / PQ-174.02).
// Pure. Variety across kill causes raises the multiplier; repeating the last
// cause decays it toward 1. Direct kills never score below their base.
//
// PQ-174.02 raises the PHYSICS ceiling without lowering the gun floor. A
// player-attributed terrain, collision or explosive kill pays the PQ-137.05
// force-table ratio (concussion impulse 920 vs Pulse 84). Unattributed pileups
// stay at gun rate so Pulse cannot farm room collisions. Direct Pulse pay is
// unchanged. A shove used as a gun pays a capped force-table bonus so the
// cannon stays a shove, not a silent DPS buff.

import { killCauseFamily, killCauseFromPayload } from '../combat/killCausality.js';
import { WEAPONS } from '../data/weapons.js';

export const STYLE_WINDOW = 8;
export const STYLE_MAX_MULTIPLIER = 4;

export const PULSE_WEAPON_ID = 'wpn_pulse_laser_s';
export const SHOVE_WEAPON_ID = 'wpn_concussion_cannon_m';
export const PHYSICS_STYLE_CAUSES = Object.freeze(['explosive', 'terrain', 'collision']);
/** Direct shove-as-gun bonus cap. Rock/hull/blast kills use the full force-table ratio. */
export const DIRECT_SHOVE_SCORE_CAP = 4;

const WEAPON_BY_ID = new Map(WEAPONS.map((def) => [def.id, def]));
const STYLE_CAUSES = new Set(['explosive', 'terrain', 'collision', 'direct']);

function normalizeCause(cause) {
  if (STYLE_CAUSES.has(cause)) return cause;
  return killCauseFamily(cause);
}

export function forceTableImpulse(weaponId) {
  const def = typeof weaponId === 'string' ? WEAPON_BY_ID.get(weaponId) : null;
  const n = def && Number(def.impulsePerHit);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function pulseForceImpulse() {
  return forceTableImpulse(PULSE_WEAPON_ID);
}

/** Impulse ratio vs the free Pulse. Never below 1 — this is a ceiling, not a nerf. */
export function forceTableScoreFactor(weaponId) {
  const pulse = pulseForceImpulse();
  const impulse = forceTableImpulse(weaponId);
  if (!(pulse > 0) || !(impulse > pulse)) return 1;
  return impulse / pulse;
}

export function isPhysicsStyleCause(cause) {
  return PHYSICS_STYLE_CAUSES.includes(normalizeCause(cause));
}

/**
 * Extra board multiplier for one kill. Pulse direct stays 1. A rock kill pays
 * concussion/pulse. A shove slug that still registers as a gun pays at most 4×.
 */
export function physicsPlayScoreMult(cause, weaponId, playerCaused) {
  const shove = forceTableScoreFactor(weaponId) > 1;
  const playerPlay = playerCaused === true || shove;
  if (isPhysicsStyleCause(cause) && playerPlay) return forceTableScoreFactor(SHOVE_WEAPON_ID);
  if (shove) return Math.min(DIRECT_SHOVE_SCORE_CAP, forceTableScoreFactor(weaponId));
  return 1;
}

export function styleCauseFromKill(payload) {
  if (payload && typeof payload.styleCause === 'string') return normalizeCause(payload.styleCause);
  if (payload && typeof payload.cause === 'string' && STYLE_CAUSES.has(payload.cause)) {
    return payload.cause;
  }
  return killCauseFamily(killCauseFromPayload(payload));
}

export function emptyStyle() {
  return { multiplier: 1, recentCauses: [] };
}

export function applyStyleKill(style, cause) {
  const mapped = normalizeCause(cause);
  const recent = Array.isArray(style && style.recentCauses) ? style.recentCauses.slice() : [];
  const last = recent[recent.length - 1];
  recent.push(mapped);
  while (recent.length > STYLE_WINDOW) recent.shift();
  let multiplier = Number.isFinite(style && style.multiplier) ? style.multiplier : 1;
  if (last === mapped) {
    multiplier = 1 + (multiplier - 1) * 0.5;
  } else {
    const unique = new Set(recent).size;
    multiplier = Math.min(STYLE_MAX_MULTIPLIER, multiplier + 0.25 * unique);
  }
  if (!(multiplier >= 1)) multiplier = 1;
  return { multiplier, recentCauses: recent };
}

export function scoreWithStyle(base, multiplier, cause, weaponId, playerCaused) {
  const amount = Number.isFinite(base) ? Math.max(0, Math.round(base)) : 0;
  const mult = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  const styled = Math.round(amount * mult);
  const play = physicsPlayScoreMult(cause, weaponId, playerCaused);
  const scaled = Math.round(styled * play);
  if (normalizeCause(cause) === 'direct') return Math.max(amount, scaled);
  return Math.max(1, scaled);
}
