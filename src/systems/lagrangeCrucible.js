// Lagrange Crucible — arena law. The room PULLS.
//
// Two equal wells sit on opposite pylons of a line through the fight. The midpoint is a genuine
// saddle: net kernel acceleration is ~0, a step along the pylon axis runs away into a well (throw),
// and a step off-axis is restored toward the ridge (hold). Position is the resource. A sit-still
// firing post that is not on the ridge is fighting the room; a body that rides a well is faster
// than its thrust should allow.
//
// This is not Helios ricochet (no bounce, no walls) and not a single central well. It consumes the
// existing well/repulsor kernel only — no second gravity path. Boss role is data; no hull.

export const LAGRANGE_ARENA_ID = 'lagrange_crucible';

/** Wave-10 boss is a role over the existing dreadnought hull, not a new model. */
export const LAGRANGE_BOSS_ROLE = Object.freeze({
  id: 'tidal_engine',
  hullId: 'dreadnought_boss',
  role: 'elite',
  law: LAGRANGE_ARENA_ID,
  vanes: 2,
  method: 'thrown_mass',
  invulnerable: false,
});

/** Distance from the fight anchor to each pylon. Overlap at the midpoint is the saddle. */
export const LAGRANGE_PYLON_SEP = 180;
/** Room-scale, gentler than a player Well (240 / 190). */
export const LAGRANGE_WELL_RADIUS = 500;
export const LAGRANGE_WELL_STRENGTH = 110;
export const LAGRANGE_WELL_FALLOFF = 1.2;

function along(at, bearing, distance) {
  return { x: at.x + bearing.x * distance, z: at.z + bearing.z * distance };
}

function wellSpec(center, extra = {}) {
  return {
    kind: 'well',
    center,
    radius: LAGRANGE_WELL_RADIUS,
    strength: LAGRANGE_WELL_STRENGTH,
    falloff: LAGRANGE_WELL_FALLOFF,
    ...extra,
  };
}

/**
 * PURE pylon placement. Two points, equal and opposite on `axis` through `at`.
 * The midpoint is `at` — that is the authored equilibrium.
 */
export function lagrangePylons(at, axis, sep = LAGRANGE_PYLON_SEP) {
  return {
    a: along(at, axis, -sep),
    b: along(at, axis, sep),
    saddle: { x: at.x, z: at.z },
  };
}

function perpOf(bearing) {
  return { x: -bearing.z, z: bearing.x };
}

function currentToy(id, center, dir) {
  return {
    id,
    kind: 'current',
    verb: 'carry',
    hazardType: 'debris_current',
    usable: true,
    throwable: false,
    center,
    dir: { x: dir.x, z: dir.z },
    radius: 280,
    strength: 96,
    falloff: 1.15,
    halfAngleRad: 0.48,
    edgeSoftRad: 0.12,
  };
}

function placeLagrangeToys(at, throwAxis, pylons) {
  const hold = perpOf(throwAxis);
  const shutterMid = along(at, throwAxis, 10);
  const axis = { x: throwAxis.x, z: throwAxis.z };
  const back = { x: -throwAxis.x, z: -throwAxis.z };
  return [
    {
      id: 'ridge_shutter',
      kind: 'shutter',
      verb: 'cut',
      hazardType: 'debris',
      usable: true,
      throwable: false,
      a: along(shutterMid, hold, -36),
      b: along(shutterMid, hold, 36),
    },
    currentToy('throw_current', along(pylons.a, axis, 24), axis),
    currentToy('saddle_current', along(pylons.b, back, 24), back),
  ];
}

/**
 * PURE room for one Lagrange wave. Always the two-pylon law; phase retunes polarity and extras.
 * Returns the same { phase, note, fields, mines, cover, toys } shape as the Helios phase table.
 * Field ids are assigned by the caller (two-slot budget). Toys are extra furniture, not a third slot.
 */
export function planLagrangeInstall({
  arenaPhase,
  at = { x: 0, z: 0 },
  lane = { x: 1, z: 0 },
  across = { x: 0, z: 1 },
  lean = { x: 1, z: 0 },
  spin = 0,
} = {}) {
  const phase = typeof arenaPhase === 'string' ? arenaPhase : 'idle';
  const pylons = lagrangePylons(at, lane);
  let throwAxis = lane;
  let toyPylons = pylons;
  const out = { phase, note: '', fields: [], mines: [], cover: false, toys: [] };

  switch (phase) {
    // The law at rest: two equal wells. Sit on the ridge or be thrown along the axis.
    case 'idle':
    case 'shutter_slow':
      out.note = 'two pylons pull; the midpoint holds, the axis throws';
      out.fields.push(wellSpec(pylons.a), wellSpec(pylons.b));
      break;

    // Repel state: pylons shove outward. The centre becomes a recovery pocket.
    case 'furnace_active':
      out.note = 'both pylons shove; the saddle is a pocket, the rim is a throw';
      out.fields.push(
        { kind: 'repulsor', center: pylons.a, radius: 420, strength: 124, falloff: 1.2 },
        { kind: 'repulsor', center: pylons.b, radius: 420, strength: 124, falloff: 1.2 },
      );
      break;

    // Cover rocks plus the pull, so the debris is a thing you can hide in and also a thing that drifts.
    case 'loose_plate':
      out.note = 'cover on the ridge, and both pylons still pull';
      out.cover = true;
      out.fields.push(
        wellSpec(pylons.a, { damping: 0.55, strength: 96 }),
        wellSpec(pylons.b, { damping: 0.55, strength: 96 }),
      );
      break;

    // Tide: pylons shift onto the across-axis so the ridge rotates. Same KIND, new hold line.
    case 'shutter_alternating': {
      out.note = 'the ridge has rotated; hold is now across the arrival';
      const tide = lagrangePylons(at, across);
      throwAxis = across;
      toyPylons = tide;
      out.fields.push(wellSpec(tide.a), wellSpec(tide.b));
      break;
    }

    // Arrival lane is the throw axis, and the mouth is mined. Wading in is a commitment.
    case 'shutter_lane_close': {
      out.note = 'the arrival is the throw axis, and the mouth is mined';
      out.fields.push(wellSpec(pylons.a), wellSpec(pylons.b));
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

    // Heavy damping in both basins: the room holds you if you enter a well, and drinks dash.
    case 'absorbent_screen':
      out.note = 'both basins drink momentum; the ridge still holds, the axis still throws';
      out.fields.push(
        wellSpec(pylons.a, { damping: 2.2, strength: 72 }),
        wellSpec(pylons.b, { damping: 2.2, strength: 72 }),
      );
      break;

    // Tidal Engine: one pylon pulls, the other shoves. The saddle slides off the midpoint.
    // Same two kernel slots, opposite polarity — the boss is a field state, not a new hull.
    case 'boss': {
      out.note = 'tidal engine: one pylon pulls, one shoves, mined ring, cover';
      out.cover = true;
      out.fields.push(
        wellSpec(pylons.a, { strength: 150, radius: 520, damping: 0.5 }),
        { kind: 'repulsor', center: pylons.b, radius: 420, strength: 150, falloff: 1.25 },
      );
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

  if (out.note && out.note !== 'inert room') {
    out.toys = placeLagrangeToys(at, throwAxis, toyPylons);
  }
  return out;
}

/** Axis the pylons sit on for a given phase (tests use this to find the saddle). */
export function lagrangeAxisForPhase(phase, lane, across) {
  return phase === 'shutter_alternating' ? across : lane;
}
