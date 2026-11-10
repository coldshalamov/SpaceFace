// Asteroid Mill — arena law. The room GRINDS (SWARM-07 B4, SWARM_EXPANSION §7).
//
// The Mill is the Crucible's ore seam: a dense band of monoliths the fight lives inside,
// and a GRIND PAIR — two opposed tangential cones on either flank — that slowly turns the
// whole room. Bodies on the near flank are carried down-lane, bodies on the far flank are
// carried up-lane, so debris, brood and hulls all circulate through the seam instead of
// holding formation. The grind is ambient (strength ~55), not a sluice: riding WITH the
// turn is free, crossing it is a small tax.
//
// The seam pays: the debris layout is the densest in the catalog, and every fracture
// shakes ore loose — a pickup worth run credits, spawned by the room's own break (see
// swarmArena's _millShake). Destructible rocks split into smaller rocks through the
// shipped SF-067 wear law; the Mill's distinctness is that breaking them is also the
// mid-fight economy.
//
// Machinery is none — the grind never sleeps. Field strength retunes per authored phase
// exactly like the other law arenas. The room's two field slots mean a phase carries
// either the full grind pair or one flank plus the phase's own signature.

export const MILL_ARENA_ID = 'asteroid_mill';

/** Pickup stamp the shaken ore carries (kind read by collectors, ledger key for the room). */
export const MILL_ORE_KIND = 'mill_ore';
/** Run-wallet credits one ore chunk pays on collect — brood-fodder scale, not a salary. */
export const MILL_ORE_CREDITS = 9;
/** Loose ore decays fast; the seam keeps making it. */
export const MILL_ORE_TTL_S = 20;
/** About one fracture in three shakes a second chunk loose. */
export const MILL_ORE_DOUBLE_CHANCE = 0.35;

/** The grind pair's authored cone shape — wide, gentle, ambient. */
export const MILL_GRIND_RADIUS = 500;
export const MILL_GRIND_STRENGTH = 55;
export const MILL_GRIND_FALLOFF = 1.1;
export const MILL_GRIND_HALF_ANGLE = 0.62;
export const MILL_GRIND_EDGE_SOFT = 0.16;
/** How far off-centre the two grind cones sit, along `across`. */
export const MILL_GRIND_OFFSET = 210;

function along(at, bearing, distance) {
  return { x: at.x + bearing.x * distance, z: at.z + bearing.z * distance };
}

function grindCone(at, side, dir, strength) {
  return {
    kind: 'cone',
    center: along(at, side, MILL_GRIND_OFFSET),
    dir: { x: dir.x, z: dir.z },
    radius: MILL_GRIND_RADIUS,
    strength,
    falloff: MILL_GRIND_FALLOFF,
    halfAngleRad: MILL_GRIND_HALF_ANGLE,
    edgeSoftRad: MILL_GRIND_EDGE_SOFT,
  };
}

/**
 * The grind pair: a cone on each flank pushing OPPOSITE tangential directions, so the
 * room shears around the anchor instead of blowing down one lane. `scale` retunes the
 * turn for the wave's phase without changing its shape.
 */
function grindPair(out, at, lane, across, scale) {
  const strength = Math.max(12, Math.round(MILL_GRIND_STRENGTH * scale));
  out.fields.push(grindCone(at, across, lane, strength));
  out.fields.push(grindCone(at, { x: -across.x, z: -across.z }, { x: -lane.x, z: -lane.z }, strength));
}

/** One grind flank only — the phases that need the second slot for their own signature. */
function grindFlank(out, at, lane, across, scale) {
  const strength = Math.max(12, Math.round(MILL_GRIND_STRENGTH * scale));
  out.fields.push(grindCone(at, across, lane, strength));
}

/**
 * PURE room for one Mill wave. The seam is always up — `cover` rides every phase — and
 * the grind is the law on every recipe; phases retune strength and spend the second
 * field slot on their own signature.
 */
export function planMillInstall({
  arenaPhase,
  at = { x: 0, z: 0 },
  lane = { x: 1, z: 0 },
  across = { x: 0, z: 1 },
  lean = { x: 0, z: 1 },
  spin = 0,
} = {}) {
  const phase = typeof arenaPhase === 'string' ? arenaPhase : 'idle';
  const out = { phase, note: '', fields: [], mines: [], cover: true };

  switch (phase) {
    case 'idle':
      out.note = 'the seam turns — rocks to break, and breaking them pays';
      grindPair(out, at, lane, across, 1);
      break;

    case 'shutter_slow':
      out.note = 'the mill idles — the seam barely turns';
      grindPair(out, at, lane, across, 0.4);
      break;

    case 'furnace_active':
      out.note = 'the crusher plate is lit — the middle shoves material to the seam';
      grindFlank(out, at, lane, across, 1);
      out.fields.push({
        kind: 'repulsor',
        center: { x: at.x, z: at.z },
        radius: 340,
        strength: 150,
        falloff: 1.4,
      });
      break;

    case 'loose_plate':
      out.note = 'a plate tore loose inside the seam; the grind keeps its sag';
      grindFlank(out, at, lane, across, 1);
      out.fields.push({
        kind: 'well',
        center: along(at, lean, 320),
        radius: 460,
        strength: 52,
        damping: 0.85,
        falloff: 1.15,
      });
      break;

    case 'shutter_alternating':
      out.note = 'the mill runs hot — the seam turns hard';
      grindPair(out, at, lane, across, 1.8);
      break;

    case 'shutter_lane_close': {
      out.note = 'the seam floods the arrival lane, and its mouth is mined';
      out.fields.push({
        kind: 'cone',
        center: along(at, lane, 280),
        dir: { x: across.x, z: across.z },
        radius: 540,
        strength: 135,
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
      out.note = 'slurry in the seam — the room drinks speed, the grind barely turns';
      grindFlank(out, at, lane, across, 0.3);
      out.fields.push({
        kind: 'well',
        center: { x: at.x, z: at.z },
        radius: 600,
        strength: 24,
        damping: 2.4,
        falloff: 1.05,
      });
      break;

    case 'boss': {
      out.note = 'the mill at full grind — seam, crusher well, mined ring, and cover';
      grindFlank(out, at, lane, across, 1);
      out.fields.push({
        kind: 'well',
        center: { x: at.x, z: at.z },
        radius: 520,
        strength: 120,
        damping: 0.7,
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
      out.cover = false;
      break;
  }

  return out;
}
