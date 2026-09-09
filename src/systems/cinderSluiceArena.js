// Cinder Sluice — arena law. The room MOVES.
//
// One cone current, the same kernel primitive as the authored world Cinder Sluice
// (radius 620 / strength 150 / half-angle 0.32). Downstream is cheap; upstream is paid in speed;
// engagement range is not symmetric. This is not Helios ricochet and not Lagrange pull: there is
// no saddle, no bounce, no basin. Bodies in the wedge are driven mouth→exit along dir.
//
// Machinery is the warning/surge/calm cycle, derived from elapsed sim time the same way the world
// site derives it from the saved clock. Side pockets (outside the wedge) are quieter. Boss role is
// data; no hull. World-site field id and coordinates are never reused.

import { CINDER_SLUICE_CYCLES, CINDER_SLUICE_FIELD } from '../data/environmentalMachinery.js';

export const CINDER_ARENA_ID = 'cinder_sluice';

/** Wave-10 boss is a role over the existing dreadnought hull, not a new model. */
export const CINDER_BOSS_ROLE = Object.freeze({
  id: 'chain_tug',
  hullId: 'dreadnought_boss',
  role: 'elite',
  law: CINDER_ARENA_ID,
});

/** Same numbers as the world sluice. The arena does not inherit the world centre or field id. */
export const CINDER_CURRENT_RADIUS = CINDER_SLUICE_FIELD.radius;
export const CINDER_CURRENT_STRENGTH = CINDER_SLUICE_FIELD.strength;
export const CINDER_CURRENT_FALLOFF = CINDER_SLUICE_FIELD.falloff;
export const CINDER_CURRENT_HALF_ANGLE = CINDER_SLUICE_FIELD.halfAngleRad;
export const CINDER_CURRENT_EDGE_SOFT = CINDER_SLUICE_FIELD.edgeSoftRad;

function along(at, bearing, distance) {
  return { x: at.x + bearing.x * distance, z: at.z + bearing.z * distance };
}

function positiveModulo(value, modulus) {
  const remainder = value % modulus;
  return remainder < 0 ? remainder + modulus : remainder;
}

/**
 * PURE machinery cycle. Same warning/surge/calm KIND as the world site, keyed off elapsed seconds
 * so it is deterministic (no rng, no wall clock). Strength is 0 in warning and calm, full in surge.
 */
export function stepCinderMachinery(elapsedS, cycle = CINDER_SLUICE_CYCLES.unregulated) {
  const warningS = cycle.warningS;
  const surgeS = cycle.surgeS;
  const calmS = cycle.calmS;
  const period = warningS + surgeS + calmS;
  const t = positiveModulo(Number.isFinite(elapsedS) ? elapsedS : 0, period);
  if (t < warningS) {
    return { phase: 'warning', strength: 0, remainingS: warningS - t, periodS: period };
  }
  if (t < warningS + surgeS) {
    return {
      phase: 'surge',
      strength: CINDER_CURRENT_STRENGTH,
      remainingS: warningS + surgeS - t,
      periodS: period,
    };
  }
  return { phase: 'calm', strength: 0, remainingS: period - t, periodS: period };
}

function coneSpec(center, dir, strength) {
  return {
    kind: 'cone',
    center,
    dir: { x: dir.x, z: dir.z },
    radius: CINDER_CURRENT_RADIUS,
    strength,
    falloff: CINDER_CURRENT_FALLOFF,
    halfAngleRad: CINDER_CURRENT_HALF_ANGLE,
    edgeSoftRad: CINDER_CURRENT_EDGE_SOFT,
  };
}

/**
 * PURE room for one Cinder wave. Always the directional current; phase retunes strength and extras.
 * Apex sits upstream of the fight so the combat lane is inside the wedge.
 */
export function planCinderInstall({
  arenaPhase,
  at = { x: 0, z: 0 },
  lane = { x: 1, z: 0 },
  across = { x: 0, z: 1 },
  spin = 0,
} = {}) {
  const phase = typeof arenaPhase === 'string' ? arenaPhase : 'idle';
  const apex = along(at, lane, -200);
  const dir = { x: lane.x, z: lane.z };
  const out = { phase, note: '', fields: [], mines: [], cover: false };

  switch (phase) {
    case 'idle':
      out.note = 'a current down the lane; upstream costs, downstream is cheap';
      out.fields.push(coneSpec(apex, dir, CINDER_CURRENT_STRENGTH));
      break;

    case 'shutter_slow':
      out.note = 'the current is warning-weak; the lane still has a direction';
      out.fields.push(coneSpec(apex, dir, Math.round(CINDER_CURRENT_STRENGTH * 0.35)));
      break;

    case 'furnace_active':
      out.note = 'surge: the sluice is at full push';
      out.fields.push(coneSpec(apex, dir, CINDER_CURRENT_STRENGTH));
      break;

    case 'loose_plate':
      out.note = 'ballast cover in the current; slabs ride downstream';
      out.cover = true;
      out.fields.push(coneSpec(apex, dir, CINDER_CURRENT_STRENGTH));
      break;

    case 'shutter_alternating':
      out.note = 'the current still has one direction; the lane is the fight';
      out.fields.push(coneSpec(apex, dir, CINDER_CURRENT_STRENGTH));
      break;

    case 'shutter_lane_close': {
      out.note = 'surge down the arrival, and the mouth is mined';
      out.fields.push(coneSpec(apex, dir, CINDER_CURRENT_STRENGTH));
      const mouth = along(at, lane, 260);
      for (let i = 0; i < 4; i++) {
        const offset = (i - 1.5) * 62;
        out.mines.push({
          x: mouth.x + across.x * offset,
          z: mouth.z + across.z * offset,
        });
      }
      break;
    }

    case 'absorbent_screen':
      out.note = 'calm: residual trickle, the pockets are the hold';
      out.fields.push(coneSpec(apex, dir, Math.round(CINDER_CURRENT_STRENGTH * 0.12)));
      break;

    case 'boss': {
      out.note = 'chain tug: the current plus a ballast well, cover, mined ring';
      out.cover = true;
      out.fields.push(coneSpec(apex, dir, CINDER_CURRENT_STRENGTH));
      out.fields.push({
        kind: 'well',
        center: along(at, lane, 140),
        radius: 280,
        strength: 96,
        damping: 0.8,
        falloff: 1.2,
      });
      for (let i = 0; i < 4; i++) {
        const angle = spin + (i / 4) * Math.PI * 2;
        out.mines.push({
          x: at.x + Math.cos(angle) * 205,
          z: at.z + Math.sin(angle) * 205,
        });
      }
      break;
    }

    default:
      out.note = 'inert room';
      break;
  }

  return out;
}
