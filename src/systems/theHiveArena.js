// The Hive — arena law. The room is ALIVE (SWARM-07 B4, SWARM_EXPANSION §7).
//
// The Hive's field law is a BREATH: a soft inward pull centred on the fight — the walls'
// own gravity — with light damping so everything (hulls, brood, loose rocks) drifts
// gently toward the middle, which is exactly where the hive is growing shut.
//
// The living geometry is swarm-side machinery owned by swarmArena (it needs helpers,
// the debris teardown census and the Brood engine's reserve):
//
//   * LIVING WALLS — at wave start a ring of tagged wall nubs stands around the fight
//     with one open lane; every HIVE_WALL_GROW_S a new ring lands closer in and the gap
//     turns, so the room literally grows shut around the pilot. Rings are telegraphed
//     (swarm:hiveGrowth + the one-voice alert) and made of ordinary debris: they wear,
//     fracture and die through the same physics grammar as every other rock.
//   * SPAWN SACS — HIVE_SAC_COUNT sacs pulse brood mites on a cadence, drawing down the
//     wave's own population reserve (the plan still owns the 100-400 law — sacs only
//     change WHEN the bodies arrive). A sac is a real destructible body: feed it a rock
//     and the tide stops early. It also drips acid pools under itself.
//   * ACID POOLS — seeded through the Brood engine's own pool pipeline, so the hive's
//     acid reads, burns and renders exactly like a spitter's.

import { mulberry32 } from '../core/rng.js';

export const HIVE_ARENA_ID = 'the_hive';

/** Entity-data tags the room stamps on its living geometry. */
export const HIVE_WALL_TAG = 'hiveWall';
export const HIVE_SAC_TAG = 'hiveSac';

// --- Living walls -------------------------------------------------------------------
/** Nubs in one wall ring. Smaller than field monoliths — growths, not terrain. */
export const HIVE_WALL_ROCKS = 13;
export const HIVE_WALL_SIZE = 12;
/** First ring stands this far out; each later ring lands this much closer in. */
export const HIVE_WALL_R0 = 250;
export const HIVE_WALL_RINGS = 3;
export const HIVE_WALL_STEP = 60;
/** A new ring lands on this cadence — the telegraph is the growth itself. */
export const HIVE_WALL_GROW_S = 9;
/** The open lane through each ring, in radians; the gap turns this far per ring. */
export const HIVE_WALL_GAP_RAD = 1.1;
export const HIVE_WALL_TURN = 0.5;
/** Wall nub hull — a wall you can break through, not an invulnerable cage. */
export const HIVE_WALL_HULL = 90;

// --- Spawn sacs ---------------------------------------------------------------------
export const HIVE_SAC_COUNT = 4;
export const HIVE_SAC_SIZE = 9;
/** Sacs stand inside the first wall ring — the pressure is where the walls are closing. */
export const HIVE_SAC_RING = 150;
export const HIVE_SAC_HULL = 140;
/** Birth cadence and litter size — the tide the reserve pays for. */
export const HIVE_SAC_PERIOD_S = 5;
export const HIVE_SAC_BIRTH_N = 3;
/** A sac is light enough to sling into the swarm it was feeding. */
export const HIVE_SAC_MASS_K = 8;

// --- Acid -----------------------------------------------------------------------------
/** Each sac drips a pool under itself on this cadence. */
export const HIVE_POOL_PERIOD_S = 4;

/** The seeded stream the hive's geometry draws from — same idiom as debrisStreamSeed. */
export function hiveStreamSeed(seed, wave) {
  const label = `hive-arena-v1|w${wave}`;
  let h = (seed >>> 0) ^ 0x9e3779b9;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
  }
  h = (h ^ Math.imul(Number.isInteger(wave) ? wave : 0, 0x85ebca6b)) >>> 0;
  return h || 1;
}

/**
 * PURE wall-ring recipe for one growth step. `ring` 0 is the wave-start wall; later rings
 * step inward and turn the gap, so the corridor a ring leaves open never lines up with
 * the one outside it. Deterministic off the handed rng — no ambient draws.
 */
export function hiveWallRing({ anchor, ring = 0, rng } = {}) {
  const at = {
    x: anchor && Number.isFinite(anchor.x) ? anchor.x : 0,
    z: anchor && Number.isFinite(anchor.z) ? anchor.z : 0,
  };
  const roll = typeof rng === 'function' ? rng : () => 0.5;
  const radius = Math.max(80, HIVE_WALL_R0 - ring * HIVE_WALL_STEP);
  // The gap sits on a seeded bearing and turns a fixed stride per ring — learnable.
  const gapAngle = roll() * Math.PI * 2 + ring * HIVE_WALL_TURN;
  const out = [];
  for (let i = 0; i < HIVE_WALL_ROCKS; i++) {
    const angle = gapAngle + HIVE_WALL_GAP_RAD / 2
      + (i / (HIVE_WALL_ROCKS - 1)) * (Math.PI * 2 - HIVE_WALL_GAP_RAD);
    out.push({
      x: at.x + Math.cos(angle) * radius,
      z: at.z + Math.sin(angle) * radius,
      radius: HIVE_WALL_SIZE + Math.round(roll() * 6),
      ring,
    });
  }
  return out;
}

/** PURE sac berths for one wave — a seeded ring inside the first wall. */
export function hiveSacBerths({ anchor, count = HIVE_SAC_COUNT, rng } = {}) {
  const at = {
    x: anchor && Number.isFinite(anchor.x) ? anchor.x : 0,
    z: anchor && Number.isFinite(anchor.z) ? anchor.z : 0,
  };
  const roll = typeof rng === 'function' ? rng : () => 0.5;
  const base = roll() * Math.PI * 2;
  const n = Math.max(1, Math.trunc(count) || 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const angle = base + (i / n) * Math.PI * 2 + (roll() - 0.5) * 0.5;
    const dist = HIVE_SAC_RING + roll() * 50;
    out.push({ x: at.x + Math.cos(angle) * dist, z: at.z + Math.sin(angle) * dist });
  }
  return out;
}

function along(at, bearing, distance) {
  return { x: at.x + bearing.x * distance, z: at.z + bearing.z * distance };
}

/**
 * PURE room for one Hive wave. The breath is the law on every recipe — a soft pull
 * toward the middle where the walls close — retuned per phase like the other law arenas.
 */
export function planHiveInstall({
  arenaPhase,
  at = { x: 0, z: 0 },
  lane = { x: 1, z: 0 },
  across = { x: 0, z: 1 },
  lean = { x: 0, z: 1 },
  spin = 0,
} = {}) {
  const phase = typeof arenaPhase === 'string' ? arenaPhase : 'idle';
  const out = { phase, note: '', fields: [], mines: [], cover: false };

  // The breath — always present, always centred: the hive pulls everything toward the
  // middle where its own geometry is growing shut.
  const breath = (strength, damping = 0.9) => ({
    kind: 'well',
    center: { x: at.x, z: at.z },
    radius: 580,
    strength,
    damping,
    falloff: 1.15,
  });

  switch (phase) {
    case 'idle':
      out.note = 'the hive breathes — a soft pull toward where the walls are growing';
      out.fields.push(breath(58));
      break;

    case 'shutter_slow':
      out.note = 'a shallow breath; the walls still inhale';
      out.fields.push(breath(30, 0.8));
      break;

    case 'furnace_active':
      out.note = 'the heart chamber seethes — the middle itself is hostile';
      out.fields.push({
        kind: 'repulsor',
        center: { x: at.x, z: at.z },
        radius: 300,
        strength: 150,
        falloff: 1.35,
      });
      break;

    case 'loose_plate':
      out.note = 'the breath plus sloughed cover — the hive sheds what it cannot hold';
      out.cover = true;
      out.fields.push(breath(58));
      break;

    case 'shutter_alternating':
      out.note = 'the diaphragm flexes — the rim shoves, the centre pulls';
      out.fields.push(breath(72, 0.7));
      out.fields.push({
        kind: 'repulsor',
        center: along(at, lean, 330),
        radius: 320,
        strength: 130,
        falloff: 1.25,
      });
      break;

    case 'shutter_lane_close': {
      out.note = 'a pheromone current sweeps the arrival lane, and the mouth is seeded';
      out.fields.push({
        kind: 'cone',
        center: along(at, lane, 280),
        dir: { x: across.x, z: across.z },
        radius: 540,
        strength: 120,
        falloff: 1.1,
        halfAngleRad: 0.55,
        edgeSoftRad: 0.14,
      });
      const mouth = along(at, lane, 250);
      for (let i = 0; i < 4; i++) {
        const offset = (i - 1.5) * 60;
        out.mines.push({ x: mouth.x + across.x * offset, z: mouth.z + across.z * offset });
      }
      break;
    }

    case 'absorbent_screen':
      out.note = 'the sap is thick — the whole room drinks momentum';
      out.fields.push({
        kind: 'well',
        center: { x: at.x, z: at.z },
        radius: 620,
        strength: 26,
        damping: 2.6,
        falloff: 1.05,
      });
      break;

    case 'boss': {
      out.note = 'the queen chamber — deep breath, a repulsor berm, seeded ring';
      out.cover = true;
      out.fields.push(breath(95, 0.7));
      out.fields.push({
        kind: 'repulsor',
        center: along(at, lean, 320),
        radius: 340,
        strength: 150,
        falloff: 1.3,
      });
      for (let i = 0; i < 4; i++) {
        const angle = spin + (i / 4) * Math.PI * 2;
        out.mines.push({ x: at.x + Math.cos(angle) * 200, z: at.z + Math.sin(angle) * 200 });
      }
      break;
    }

    default:
      out.note = 'inert room';
      break;
  }

  return out;
}
