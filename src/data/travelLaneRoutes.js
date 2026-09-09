// Authored travel lanes (Universe Atlas Wave 3, ADR D8 — "a lane is optional infrastructure on an
// atlas edge").
//
// THE ATLAS EDGE IS THE CORRIDOR; THE LANE IS THE STRING BETWEEN THE PEARLS. This file authors the
// *string*: which atlas edge carries lane infrastructure, how its beacons sit on the surveyor
// lattice, how much the segment volumes multiply the pilot's own drive, and which segment is dead.
// It authors no geometry. Beacon positions are DERIVED at load time from the two endpoint sectors'
// frozen global origins (`src/data/sectorCoordinates.js`), because duplicating coordinates here
// would create a second source of spatial truth that silently drifts when an origin moves — exactly
// the class of defect ADR D2.1 and ledger RC-1 exist to prevent.
//
// ─── Deliberately NOT an authoring system ─────────────────────────────────────────────────────────
//
// ADR D8 says "minimum prototype — one packet, not a program", and D9.1 rejects the grand registry.
// So this is one authored lane on one chord with one dead segment, and the shape below is only as
// general as that one lane needs. Generalizing the authoring surface is explicitly the NEXT packet's
// decision to make, once the slice has proven itself end to end. Resist widening this file.

import { sectorGlobalOrigin } from './sectorCoordinates.js';

/**
 * Beacon spacing, in WU. This is the quarter-lattice quantum: `SECTOR_ORIGIN_LATTICE_WU` is 4096, so
 * 1024 is a quarter of the sector lattice and every beacon lands on the surveyor grid the whole
 * chart is drawn against (ADR D4 uses the same 1024 tick for deep-space graticules). Beacons are
 * infrastructure a surveyor placed, not scenery scattered at random — they sit on the grid.
 */
export const LANE_BEACON_SPACING_WU = 1024;

/**
 * Half-quantum corridor radius. A lane is a TUBE around the chord, not a line: the pilot has to fly
 * it, but does not have to thread it. 512 WU is wide enough that ordinary steering keeps you inside
 * and tight enough that wandering off the chord genuinely drops the boost.
 */
export const LANE_CORRIDOR_RADIUS_WU = LANE_BEACON_SPACING_WU / 2;

/**
 * The Helios → Tethys textile-mission chord — the route the acceptance journey already flies
 * (`scripts/lib/professionalTravelPublicRoute.mjs`, ADR D11). One lane, because D8 asked for one.
 */
export const LANE_HELIOS_TETHYS = Object.freeze({
  id: 'lane_helios_tethys',
  name: 'Helios–Tethys Textile Run',
  /** The atlas edge this lane is infrastructure ON. Endpoints stay gates; the lane is the string. */
  fromSectorId: 'sector_helios_prime',
  toSectorId: 'sector_tethys_junction',

  /**
   * Segment multipliers on the pilot's OWN drive (D8: "the lane boosts your own drive; it never
   * teleports"). These are fed to the propulsion kernel as `travelDrive.ceiling` / `.rampMult`
   * overrides — a seam the kernel already ships for exactly this purpose
   * (`propulsionKernel.js` `normalizeTravelDrive`, "so a lane volume (D8) can multiply the drive's
   * own numbers without the kernel knowing anything about lanes"). ZERO NEW PHYSICS.
   *
   * 2.5 sits mid-range of D8's stated ×2–3.
   *
   * MEASURED, and worth stating because the two families differ sharply: on `drive_reaction_m`
   * (base ceiling 438.75 WU/s) the lane lifts the cap to 1096.9 WU/s, a real +658 WU/s. On
   * `drive_torch_l` (base 1120) it lifts only to 1200, because `TRAVEL_CEILING_ABSOLUTE_WU_S` caps
   * it — a torch is already near the engineering bound, so for torch drives the *ramp* multiplier
   * is the part the pilot feels, not the ceiling. That asymmetry is correct rather than a bug: the
   * lane is worth most to the modest drives it was built to help.
   */
  ceilingMult: 2.5,
  rampMult: 2.5,

  corridorRadiusWU: LANE_CORRIDOR_RADIUS_WU,

  /**
   * The scripted disruption (D8: "ONE damaged/disabled segment"). Index into the segment list, where
   * segment i spans beacon i → beacon i+1.
   *
   * Segment 4 is chosen for a reason worth recording: it sits ~5.6k WU along a ~14.8k WU chord, so
   * it is unambiguously inside the Helios Voronoi cell rather than near the bisector. A dead segment
   * straddling the boundary would make `sectorMembershipAtGlobal` a coin-flip between two cells, and
   * `encounterDirector.requestAuthoredEncounter` hard-rejects with `wrong_sector` when the sector it
   * is handed is not the one the player is standing in. Far enough in to matter, far enough from the
   * midpoint to be deterministic.
   */
  disruptedSegments: Object.freeze([4]),

  /** The pirate shape that inherits the dead beacon. `ambush_snare` carries zoneType `ambush_lane`
   *  and `gates: {}` — a lane ambush is literally what the shipped catalogue already models. */
  ambushShapeId: 'ambush_snare',
});

export const TRAVEL_LANES = Object.freeze([LANE_HELIOS_TETHYS]);

/**
 * Derive a lane's physical beacon chain from its endpoint sectors' frozen global origins.
 *
 * Beacons are interior only: they start one full quantum in from the origin sector and stop before
 * reaching the destination, because ADR D8 keeps the GATES as the endpoints — the lane is the string
 * between the pearls, not a replacement for them. Positions are exact multiples of the spacing along
 * the chord, so the chain reads as surveyed infrastructure at any zoom.
 *
 * Pure and side-effect free: this is a derivation over frozen data, not runtime state, which is why
 * the lane needs no save-game persistence at all (see the header of `src/systems/travelLanes.js`).
 *
 * @returns {{id:string,name:string,from:{x:number,z:number},to:{x:number,z:number},
 *            axis:{x:number,z:number},lengthWU:number,radiusWU:number,
 *            beacons:Array<{index:number,alongWU:number,pos:{x:number,z:number}}>,
 *            segments:Array<{index:number,disrupted:boolean,a:object,b:object,
 *                            midpoint:{x:number,z:number},lengthWU:number}>}}
 */
export function buildLaneGeometry(lane = LANE_HELIOS_TETHYS) {
  const from = sectorGlobalOrigin(lane.fromSectorId);
  const to = sectorGlobalOrigin(lane.toSectorId);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const lengthWU = Math.sqrt(dx * dx + dz * dz);
  // A degenerate chord (identical or missing origins) yields no lane rather than a divide-by-zero.
  if (!(lengthWU > LANE_BEACON_SPACING_WU * 2)) {
    return {
      id: lane.id, name: lane.name, from, to,
      axis: { x: 0, z: 0 }, lengthWU: 0, radiusWU: lane.corridorRadiusWU,
      beacons: [], segments: [],
    };
  }
  const axis = { x: dx / lengthWU, z: dz / lengthWU };

  const beacons = [];
  for (let along = LANE_BEACON_SPACING_WU; along < lengthWU; along += LANE_BEACON_SPACING_WU) {
    beacons.push({
      index: beacons.length,
      alongWU: along,
      pos: { x: from.x + axis.x * along, z: from.z + axis.z * along },
    });
  }

  const disrupted = new Set(Array.isArray(lane.disruptedSegments) ? lane.disruptedSegments : []);
  const segments = [];
  for (let i = 0; i < beacons.length - 1; i++) {
    const a = beacons[i];
    const b = beacons[i + 1];
    segments.push({
      index: i,
      disrupted: disrupted.has(i),
      a,
      b,
      midpoint: { x: (a.pos.x + b.pos.x) / 2, z: (a.pos.z + b.pos.z) / 2 },
      lengthWU: b.alongWU - a.alongWU,
    });
  }

  return {
    id: lane.id,
    name: lane.name,
    from,
    to,
    axis,
    lengthWU,
    radiusWU: lane.corridorRadiusWU,
    beacons,
    segments,
  };
}

export default TRAVEL_LANES;
