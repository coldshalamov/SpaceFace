// PQ-027 / SF-22 — the one authored environmental machinery/current slice.
//
// The Cinder Sluice is deliberately data-small: one persistent World Site record owns its
// operations, while this module derives the transient current phase from that durable record and
// the saved simulation clock. No timer, random source, or visit-local state can reset the cycle.

import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';
import { hash32, mulberry32 } from '../core/rng.js';

export const CINDER_SLUICE_SITE_ID = 'world_site_ceres_cinder_sluice';
export const CINDER_SLUICE_SECTOR_ID = 'sector_ceres_belt';
export const CINDER_SLUICE_OPERATIONS = Object.freeze({
  regulate: 'repair_phase_regulator',
  release: 'cut_ballast_clamp',
  settle: 'settle_sluice_ballast',
});

export const CINDER_SLUICE_LOCAL_POS = Object.freeze({ x: 1950, z: -1250 });
export const CINDER_SLUICE_GLOBAL_POS = Object.freeze(
  sectorLocalToGlobalForSector(CINDER_SLUICE_LOCAL_POS, CINDER_SLUICE_SECTOR_ID),
);

// The machine faces back into the belt, while its current exhausts toward the Helios arrival side.
// The root is the apex: cutting the ballast ejects it downstream, so returning it to the receiver
// requires reading the warning/calm cycle instead of holding the site beam at a safe boundary.
const ROT = Math.PI - 0.18;
const ROOT_FORWARD = Object.freeze({ x: Math.cos(ROT), z: Math.sin(ROT) });
const DIR = Object.freeze({ x: -ROOT_FORWARD.x, z: -ROOT_FORWARD.z });

export const CINDER_SLUICE_PLACEMENT = Object.freeze({
  coordinateSpace: 'global_v1',
  pos: CINDER_SLUICE_GLOBAL_POS,
  rot: ROT,
});

export const CINDER_SLUICE_FIELD = Object.freeze({
  id: 'environment_ceres_cinder_sluice_current',
  kind: 'cone',
  center: CINDER_SLUICE_GLOBAL_POS,
  dir: DIR,
  radius: 620,
  strength: 150,
  falloff: 1.15,
  halfAngleRad: 0.32,
  edgeSoftRad: 0.12,
  sourceId: CINDER_SLUICE_SITE_ID,
  team: null,
});

// Service traffic approaches from the current's downstream side and waits here until the field is
// calm. The point sits beyond the soft cone boundary, so the same physical law that moves the
// player and ballast cannot shove a waiting hauler while it demonstrates the safe approach.
export const CINDER_SLUICE_TRAFFIC_STAGING_POS = Object.freeze({
  x: CINDER_SLUICE_FIELD.center.x + CINDER_SLUICE_FIELD.dir.x * (CINDER_SLUICE_FIELD.radius + 96),
  z: CINDER_SLUICE_FIELD.center.z + CINDER_SLUICE_FIELD.dir.z * (CINDER_SLUICE_FIELD.radius + 96),
});

const UNREGULATED_CYCLE = Object.freeze({ warningS: 2, surgeS: 7, calmS: 3 });
const REGULATED_CYCLE = Object.freeze({ warningS: 3, surgeS: 5, calmS: 7 });

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function operationTimeS(record, operationId, fallback) {
  const completed = record && record.completedOperations && record.completedOperations[operationId];
  if (!completed) return fallback;
  if (Number.isFinite(completed.earnedAtS)) return Math.max(0, completed.earnedAtS);
  return Math.max(0, finite(completed.tick) / 60);
}

function positiveModulo(value, modulus) {
  const remainder = value % modulus;
  return remainder < 0 ? remainder + modulus : remainder;
}

/**
 * Derive the current's exact state from durable operation receipts plus saved simulation time.
 * Repair starts a fresh, longer warning window; ballast settlement permanently removes the field.
 */
export function cinderSluicePhase(record, simTime, out = null) {
  const result = out || {};
  const completed = record && record.completedOperations || {};
  const regulated = !!completed[CINDER_SLUICE_OPERATIONS.regulate];
  const createdS = Math.max(0, finite(record && record.createdTick) / 60);
  const anchorS = regulated
    ? operationTimeS(record, CINDER_SLUICE_OPERATIONS.regulate, createdS)
    : createdS;

  if (completed[CINDER_SLUICE_OPERATIONS.settle]) {
    result.phase = 'quiet';
    result.regulated = true;
    result.fieldActive = false;
    result.fieldStrength = 0;
    result.anchorS = anchorS;
    result.cycleS = 0;
    result.elapsedS = 0;
    result.remainingS = Infinity;
    return result;
  }

  const cycle = regulated ? REGULATED_CYCLE : UNREGULATED_CYCLE;
  const cycleS = cycle.warningS + cycle.surgeS + cycle.calmS;
  const elapsedS = positiveModulo(finite(simTime) - anchorS, cycleS);
  let phase;
  let remainingS;
  if (elapsedS < cycle.warningS) {
    phase = 'warning';
    remainingS = cycle.warningS - elapsedS;
  } else if (elapsedS < cycle.warningS + cycle.surgeS) {
    phase = 'surge';
    remainingS = cycle.warningS + cycle.surgeS - elapsedS;
  } else {
    phase = 'calm';
    remainingS = cycleS - elapsedS;
  }
  result.phase = phase;
  result.regulated = regulated;
  result.fieldActive = phase !== 'calm';
  result.fieldStrength = phase === 'surge' ? CINDER_SLUICE_FIELD.strength : 0;
  result.anchorS = anchorS;
  result.cycleS = cycleS;
  result.elapsedS = elapsedS;
  result.remainingS = remainingS;
  return result;
}

/** Geometry predicate shared by the warning/hazard boundary and the authored Cone field. */
export function pointInsideCinderSluice(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
  const dx = point.x - CINDER_SLUICE_FIELD.center.x;
  const dz = point.z - CINDER_SLUICE_FIELD.center.z;
  const distance = Math.hypot(dx, dz);
  if (distance >= CINDER_SLUICE_FIELD.radius) return false;
  if (distance < 1e-6) return true;
  const forward = (dx * CINDER_SLUICE_FIELD.dir.x + dz * CINDER_SLUICE_FIELD.dir.z) / distance;
  if (forward <= 0) return false;
  const angle = Math.acos(Math.max(-1, Math.min(1, forward)));
  return angle < CINDER_SLUICE_FIELD.halfAngleRad + CINDER_SLUICE_FIELD.edgeSoftRad;
}

export const CINDER_SLUICE_CYCLES = Object.freeze({
  unregulated: UNREGULATED_CYCLE,
  regulated: REGULATED_CYCLE,
});

// PQ-027.00 — three Ceres machines that kill by moving mass into an anvil, then letting
// PQ-137.06's terrain crumple law finish the hull. Warning is geometry with no force; surge is
// the bite; calm is the safe window. None of these is a damage aura.
export const KILL_MACHINE_SECTOR_ID = CINDER_SLUICE_SECTOR_ID;
const KILL_MACHINE_CYCLE = Object.freeze({ warningS: 2, surgeS: 3.5, calmS: 6.5 });

function freezeVec(x, z) {
  return Object.freeze({ x, z });
}

const MACHINE_FIELD_REGION_BY_SECTOR = Object.freeze({
  sector_ceres_belt: 'ceres',
  sector_helios_prime: 'helios',
  sector_sker_haven: 'sker',
  sector_haumea_rift: 'haumea',
  sector_vesta_forge: 'vesta',
  sector_tethys_junction: 'tethys',
  sector_veil_nebula: 'veil',
  sector_charon_expanse: 'charon',
  sector_io_reach: 'io',
  sector_ashfall_reach: 'ashfall',
  sector_nyx_march: 'nyx',
  sector_hyperion_cut: 'hyperion',
  sector_orcus_shadow: 'orcus',
  sector_eris_margin: 'eris',
  sector_nereid_shoal: 'nereid',
  sector_proteus_well: 'proteus',
  sector_triton_wake: 'triton',
  sector_eunomia_gulf: 'eunomia',
});

function buildKillMachine({
  id, hazardType, placeId, localPos, rot, phaseOffsetS, anvil, fields, hazardRadius,
  mouth = null,
  sectorId = KILL_MACHINE_SECTOR_ID,
}) {
  const dir = freezeVec(Math.cos(rot), Math.sin(rot));
  const perp = freezeVec(-dir.z, dir.x);
  const globalPos = Object.freeze(sectorLocalToGlobalForSector(localPos, sectorId));
  const fieldRegion = MACHINE_FIELD_REGION_BY_SECTOR[sectorId] || 'ceres';
  const anvilAlong = finite(anvil.along);
  const anvilAcross = finite(anvil.across);
  return Object.freeze({
    id,
    hazardType,
    placeId,
    sectorId,
    localPos: Object.freeze({ x: localPos.x, z: localPos.z }),
    globalPos,
    rot,
    dir,
    perp,
    phaseOffsetS: finite(phaseOffsetS),
    cycle: KILL_MACHINE_CYCLE,
    hazardRadius: positive(hazardRadius, 90),
    anvil: Object.freeze({
      id: `${id}_anvil`,
      pos: freezeVec(
        globalPos.x + dir.x * anvilAlong + perp.x * anvilAcross,
        globalPos.z + dir.z * anvilAlong + perp.z * anvilAcross,
      ),
      radius: positive(anvil.radius, 22),
      mass: positive(anvil.mass, 8000),
    }),
    fields: Object.freeze((fields || []).map((field) => Object.freeze({
      id: `environment_${fieldRegion}_${id}_${field.idSuffix}`,
      kind: field.kind,
      radius: positive(field.radius, 90),
      strength: Math.max(0, finite(field.strength, 0)),
      falloff: positive(field.falloff, 1.1),
      halfAngleRad: positive(field.halfAngleRad, 0.35),
      edgeSoftRad: Math.max(0, finite(field.edgeSoftRad, 0.12)),
      halfWidth: positive(field.halfWidth, 32),
      along: finite(field.along),
      across: finite(field.across),
      dirAlong: field.dirAlong == null ? 1 : field.dirAlong,
    }))),
    // A machine that names a `mouth` asks the adapter to spawn its placeId shell once per
    // visit (sectors without authored dressing rows); Ceres mouths stay null — their bodies
    // come from occupationalYardDressing.js.
    mouth: mouth ? Object.freeze({
      name: String(mouth.name),
      radius: positive(mouth.radius, 18),
    }) : null,
  });
}

export const KILL_MACHINES = Object.freeze([
  buildKillMachine({
    id: 'excavator_jaws',
    hazardType: 'debris',
    placeId: 'place_crusher_module',
    localPos: { x: 470, z: -700 },
    rot: 0,
    phaseOffsetS: 0,
    hazardRadius: 110,
    anvil: { radius: 22, mass: 9000, along: 12, across: 0 },
    fields: [{
      idSuffix: 'sheet',
      kind: 'sheet',
      strength: 820,
      radius: 108,
      halfWidth: 76,
      falloff: 1.05,
      along: 0,
      across: 0,
      dirAlong: 1,
    }],
  }),
  buildKillMachine({
    id: 'furnace_mouth',
    hazardType: 'debris',
    placeId: 'place_radiator_bank',
    localPos: { x: -1236, z: 652 },
    rot: Math.PI * 0.15,
    phaseOffsetS: 4,
    hazardRadius: 96,
    anvil: { radius: 24, mass: 11000, along: 88, across: 0 },
    fields: [{
      idSuffix: 'intake',
      kind: 'cone',
      strength: 720,
      radius: 100,
      halfAngleRad: 0.52,
      edgeSoftRad: 0.12,
      falloff: 1.08,
      along: -18,
      across: 0,
      dirAlong: 1,
    }],
  }),
  buildKillMachine({
    id: 'mass_driver_breech',
    hazardType: 'debris_current',
    placeId: 'place_extraction_mast',
    localPos: { x: 900, z: -1100 },
    rot: -0.62,
    phaseOffsetS: 8,
    hazardRadius: 150,
    anvil: { radius: 26, mass: 12000, along: 108, across: 0 },
    fields: [{
      idSuffix: 'barrel',
      kind: 'cone',
      strength: 720,
      radius: 132,
      halfAngleRad: 0.26,
      edgeSoftRad: 0.1,
      falloff: 1.05,
      along: 0,
      across: 0,
      dirAlong: 1,
    }],
  }),
]);

export const KILL_MACHINE_BY_ID = Object.freeze(Object.fromEntries(
  KILL_MACHINES.map((machine) => [machine.id, machine]),
));

// F13 — one cracker in the Helios starter claim. Same shove-into-an-anvil law as the
// Ceres mouths. It stands on the −z side of the rock cluster and faces south (player
// compass: +z is north, screen up; rot −π/2 aims the mouth at −z), out of the cluster, so it does not hunt
// the pilot who is mining the middle. The jaw mesh is place_crusher_module, spawned by the adapter.
export const STARTER_FIELD_SECTOR_ID = 'sector_helios_prime';
export const STARTER_FIELD_ID = 'f_helios_starter';
export const STARTER_FIELD_MACHINE = buildKillMachine({
  id: 'helios_claim_cracker',
  hazardType: 'debris',
  placeId: 'place_crusher_module',
  sectorId: STARTER_FIELD_SECTOR_ID,
  localPos: { x: 720, z: -420 },
  rot: -Math.PI / 2,
  phaseOffsetS: 0,
  hazardRadius: 96,
  anvil: { radius: 22, mass: 11000, along: 64, across: 0 },
  mouth: { name: 'Claim Cracker', radius: 18 },
  fields: [{
    idSuffix: 'intake',
    kind: 'cone',
    strength: 720,
    radius: 100,
    halfAngleRad: 0.52,
    edgeSoftRad: 0.12,
    falloff: 1.08,
    along: -18,
    across: 0,
    dirAlong: 1,
  }],
});

// CR-FEED — one scrap baler in Sker Haven's open water, south of the Bazaar (player
// compass: +z is north, screen up; the site is −z of station_sker), outside
// every authored zone and clear of the gate-camp, the Press-Gang seams, and the Skerris Throne.
// Where the Ceres and Helios mouths drive a directional cone or sheet down a lane, the baler is
// a compactor: its intake is a WELL centred
// on the anvil itself, so it gathers loose mass from every bearing and slams it into the press.
// Warning still registers the volume at strength 0 and calm is still the safe window; the surge
// is the same short bite, and a hull that boosts out across the rim escapes the gather.
export const SKER_SCRAP_BALER_SECTOR_ID = 'sector_sker_haven';
export const SKER_SCRAP_BALER = buildKillMachine({
  id: 'sker_scrap_baler',
  hazardType: 'debris',
  placeId: 'place_crusher_module',
  sectorId: SKER_SCRAP_BALER_SECTOR_ID,
  // Nudged 180 WU west of the original (-200,-1400) site: alien-ecology cycle 2 appended
  // zone_sker_red_snow (center 400,-1800 r=780) and zone_sker_harvest_deep after the baler
  // was sited, and the old spot sat 59 WU inside Red Snow's rim. Still south of the
  // Bazaar, still in open water — >=120 WU clear of every station, gate, zone, field,
  // hazard, and POI in the sector.
  localPos: { x: -350, z: -1300 },
  rot: 0.95,
  phaseOffsetS: 6,
  hazardRadius: 130,
  anvil: { radius: 22, mass: 11000, along: 0, across: 0 },
  mouth: { name: 'Scrap Baler', radius: 18 },
  fields: [{
    idSuffix: 'intake',
    kind: 'well',
    strength: 560,
    radius: 120,
    falloff: 0.5,
    along: 0,
    across: 0,
  }],
});

// 2026-09-28 INFERENCE — one cracker on the northern frontier: the Rift Observatory's survey
// drill works the Ice Fissure, and its crack cycle throws slab shards across the fissure mouth.
// Same shove-into-an-anvil law as every mouth: warning registers quiet, surge is the short
// bite, calm is the safe window. The cold drill platform stands just off the fissure landmark
// (poi_haumea_fissure at (0,180)), aimed at it, clear of the Observatory, both ice fields, the
// range buoy, and the probe shell (north.js anchors).
export const RIFT_FISSURE_SECTOR_ID = 'sector_haumea_rift';
export const RIFT_FISSURE_CRACKER = buildKillMachine({
  id: 'fissure_cracker',
  hazardType: 'debris',
  placeId: 'place_drill_platform_cold',
  sectorId: RIFT_FISSURE_SECTOR_ID,
  localPos: { x: 180, z: 380 },
  rot: -Math.PI * 0.75,
  phaseOffsetS: 2,
  hazardRadius: 104,
  anvil: { radius: 22, mass: 10000, along: 56, across: 0 },
  mouth: { name: 'Fissure Cracker', radius: 18 },
  fields: [{
    idSuffix: 'intake',
    kind: 'cone',
    strength: 720,
    radius: 96,
    halfAngleRad: 0.48,
    edgeSoftRad: 0.12,
    falloff: 1.08,
    along: -14,
    across: 0,
    dirAlong: 1,
  }],
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// CR-FEED - non-copy kill machines for the remaining named sectors. Every machine below is a
// different KIND of object, not another mouth at a different angle. The axes that separate them
// are chosen so no two read the same at the chase camera:
//
//   vesta_shear_jaws   two opposed sheets converging on one bar  (the only converging machine)
//   tethys_weigh_clamp one reversed cone feeding a plate behind  (the only machine that kills behind its face)
//   veil_cold_draw     one off-centre well dragging across a plate (the only off-centre gather, and the only nebula)
//   charon_tailings_sweep one sheet lying ACROSS the haul road  (the only machine that drags you along your own road)
//
// Same shared law as every other mouth: warning registers the volume at strength 0, surge is the
// bite, calm is the safe window. None of these is a damage aura.
// ───────────────────────────────────────────────────────────────────────────────────────────────

// VESTA FORGE - the foundry shear. A double shear stands on the south-east approach to the works: two
// slag rams close from both ends onto one shear bar at the throat. Its rot runs along the inbound
// leg from the Helios gate so the jaws close ACROSS a ship crossing the approach, which is the
// whole read: not a mouth you fly into, a pair of jaws that meet where you are.
export const VESTA_SHEAR_SECTOR_ID = 'sector_vesta_forge';
export const VESTA_SHEAR_JAWS = buildKillMachine({
  id: 'vesta_shear_jaws',
  hazardType: 'debris',
  placeId: 'place_ore_sorter',
  sectorId: VESTA_SHEAR_SECTOR_ID,
  // South-east approach to the works (player compass, +z north): clear of both stations (975 WU to Depot Three), both belts
  // (946 WU off the radiation volume, 1388 off the storm lane), the ore winnow at f_vesta_3, the
  // dead freighter, and the runaway ladle on the foundry apron.
  localPos: { x: 250, z: -1000 },
  rot: Math.PI * 0.5,
  phaseOffsetS: 10,
  hazardRadius: 130,
  anvil: { radius: 22, mass: 11000, along: 0, across: 0 },
  mouth: { name: 'Shear Bar', radius: 20 },
  fields: [{
    // Two sheets whose sweep directions point AT each other. The forward jaw is offset ahead and
    // runs reversed; the aft jaw is offset behind and runs forward. Both meet on the bar.
    idSuffix: 'jaw_fwd',
    kind: 'sheet',
    strength: 760,
    radius: 80,
    halfWidth: 46,
    falloff: 1.05,
    along: 70,
    across: 0,
    dirAlong: -1,
  }, {
    idSuffix: 'jaw_aft',
    kind: 'sheet',
    strength: 760,
    radius: 80,
    halfWidth: 46,
    falloff: 1.05,
    along: -70,
    across: 0,
    dirAlong: 1,
  }],
});

// TETHYS JUNCTION - the weigh clamp. Every inbound ship is scanned before it reaches the core, and
// the scale plate is BEHIND the gantry: the clamp cone runs reversed, so it hands what the gate
// takes backward onto the plate. The only machine in the census that kills behind its own face,
// which is what a toll that weighs you rather than greets you should look like.
export const TETHYS_WEIGH_SECTOR_ID = 'sector_tethys_junction';
export const TETHYS_WEIGH_CLAMP = buildKillMachine({
  id: 'tethys_weigh_clamp',
  hazardType: 'debris',
  placeId: 'place_inspection_platform',
  sectorId: TETHYS_WEIGH_SECTOR_ID,
  // On the weigh site beside poi_tethys_weigh, clear of both stations (1463 WU to Customs), the
  // Tethys field, the black-market buoy, and the customs log marker.
  localPos: { x: 820, z: -1080 },
  rot: 0.75,
  phaseOffsetS: 12,
  hazardRadius: 120,
  // Down-range is behind the gantry here - the plate sits where a normal mouth would stand.
  anvil: { radius: 24, mass: 12000, along: -86, across: 0 },
  mouth: { name: 'Weigh Clamp', radius: 20 },
  fields: [{
    idSuffix: 'clamp',
    kind: 'cone',
    strength: 700,
    radius: 104,
    halfAngleRad: 0.5,
    edgeSoftRad: 0.12,
    falloff: 1.08,
    along: -30,
    across: 0,
    // Reversed: the gather runs from the gantry face backward onto the weigh plate.
    dirAlong: -1,
  }],
});

// VEIL NEBULA - the cold draw. The research station vents its helium envelope through a cold trap:
// the drain is a well, but it is NOT centred on the kill. The pressure plate sits to one side of
// the drain mouth, so anything the draw gathers is dragged ACROSS the plate on its way in. The
// only off-centre gather in the census, and the only one whose hazard reads as nebula rather than
// debris - a gas that takes you, not a piece of one.
export const VEIL_COLD_SECTOR_ID = 'sector_veil_nebula';
export const VEIL_COLD_DRAW = buildKillMachine({
  id: 'veil_cold_draw',
  hazardType: 'nebula',
  placeId: 'place_tanker_coupling',
  sectorId: VEIL_COLD_SECTOR_ID,
  // On the Io approach to Research Station Veil, clear of the station (1706 WU), the Veil field
  // and its storm lane (2907 WU), the radiation belt (1769 WU), and the anomaly landmark.
  localPos: { x: -900, z: -2200 },
  rot: 1.15,
  phaseOffsetS: 14,
  // The disc must cover the off-centre well's real reach: across 56 + radius 128 = 184 WU
  // from the machine origin - a hull inside gather force must be inside the warning disc.
  hazardRadius: 190,
  anvil: { radius: 22, mass: 9000, along: 0, across: 0 },
  mouth: { name: 'Cold Draw', radius: 20 },
  fields: [{
    idSuffix: 'draw',
    kind: 'well',
    strength: 560,
    radius: 128,
    falloff: 0.5,
    // Off-centre: the drain mouth sits 56 WU to one side of the pressure plate, so the gather
    // drags across the plate instead of straight down onto nothing.
    along: 0,
    across: 56,
  }],
});

// CHARON EXPANSE - the tailings sweep. The Abandoned Mining Colony ran a dragline that
// swept spoil off the working apron into a tailings berm parked on the haul road itself,
// and the drive still cycles on the dead colony's clock. The sheet lies ACROSS the road:
// a body holding the lane inside the sweep band is dragged along its own course into the
// berm - no mouth to fly into, no jaws closing in - the only machine in the census whose
// pull runs parallel to the direction you were already travelling.
export const CHARON_SWEEP_SECTOR_ID = 'sector_charon_expanse';
export const CHARON_TAILINGS_SWEEP = buildKillMachine({
  id: 'charon_tailings_sweep',
  hazardType: 'debris',
  placeId: 'place_conveyor_truss',
  sectorId: CHARON_SWEEP_SECTOR_ID,
  // Mid-lane on the Expanse Refinery -> colony haul road, clear of the refinery (1147 WU),
  // all three Charon fields (401 WU past f_charon_1's rim), both hazard discs (183/292 WU
  // off their rims), the colony apron (1401 WU), the nursery, and every gate (3587+ WU).
  // (Routine haulers never fly this road - one station, no station-to-station convoys; the
  // lane is real for colony-claim sling traffic and the player's own mining runs.)
  localPos: { x: 205, z: 287 },
  // The sweep axis is perpendicular to the road bearing (~126 deg), so the sheet's
  // squeeze runs along the road - toward the berm the dead dragline parked on it.
  rot: 0.63,
  phaseOffsetS: 16,
  hazardRadius: 130,
  anvil: { radius: 24, mass: 13000, along: 0, across: 0 },
  mouth: { name: 'Tailings Dragline', radius: 20 },
  fields: [{
    // One sheet spanning the road (170 WU across, centred on the berm) covering 110 WU of
    // road length - the sweep band. Surge drags lane traffic to the centreline, onto the berm.
    idSuffix: 'sweep',
    kind: 'sheet',
    strength: 720,
    radius: 170,
    halfWidth: 55,
    falloff: 1.0,
    along: -85,
    across: 0,
    dirAlong: 1,
  }],
});

// IO REACH - the bell ringer. Scavengers nesting in the Concord Vigilant's engine bells rigged
// the largest drive bell as a collection throat (poi_cruiser, "the Wreck Cathedral"). Two stages
// nobody else runs: a channel sheet down the stern corridor squeezes drifting salvage into single
// file, and a clapper well ON the anvil in the bell mouth grips whatever the line delivers. The
// Sker baler's well is also on-anvil - the ringer's claim is the separation: the only machine
// that herds with one field and holds with another, so the kill point answers to the grip alone.
// Sited aft of the hulk, clear of station_reach (1937 WU), station_io_merc (3103 WU), both Io
// field clusters (f_io_2 rim +198, f_io_1 2025), every gate and POI (>40).
export const IO_BELL_SECTOR_ID = 'sector_io_reach';

export const IO_BELL_RINGER = buildKillMachine({
  id: 'io_bell_ringer',
  hazardType: 'debris',
  placeId: 'place_aftermath_deb_ore_freighter_drive_bell',
  sectorId: IO_BELL_SECTOR_ID,
  localPos: { x: -1450, z: -854 },
  rot: -1.96,
  phaseOffsetS: 18,
  hazardRadius: 185,
  anvil: { radius: 22, mass: 12000, along: 135, across: 0 },
  mouth: { name: 'Bell Ringer', radius: 18 },
  fields: [
    {
      // The nave: a channel sheet down the corridor axis. Its lateral squeeze herds drifting
      // salvage onto the centreline - the salvage line a pilot reads as the ringer's telegraph.
      idSuffix: 'nave',
      kind: 'sheet',
      strength: 380,
      radius: 120,
      halfWidth: 55,
      falloff: 1.0,
      along: 0,
      across: 0,
      dirAlong: 1,
    },
    {
      // The clapper: a well centred ON the anvil inside the bell mouth, overlapping the nave's
      // tail (along 90-120) so a lined-up body slides off the centreline into the grip.
      idSuffix: 'clapper',
      kind: 'well',
      strength: 640,
      radius: 45,
      falloff: 0.6,
      along: 135,
      across: 0,
    },
  ],
});

// ASHFALL REACH - the claim scarecrow. The Vael do not fence a claim; they keep it hollow.
// A pole-rig inside the sector's authored debris field (the 400/300 disc) runs the one
// repulsor in the census: every surge throws loose mass outward, and what the push carries
// past the rim coasts out of the field's reach - a working scatter of pods and light rock
// a pilot can pick over on the calm tick. Every other machine gathers toward a kill point;
// the scarecrow's rig IS the point being kept clear - sprint for the heart on calm, or
// ride the surge outward, the only force in Ashfall that throws you out of the Roaming
// Burn's path instead of into a pocket.
// Sited inside the authored debris disc (136 WU off its heart, so the mouth disc stays
// nested inside it), 1302 WU from station_ashcache, 308 WU clear of f_ash_1's rim in the
// shove's path, clear of f_ash_2's rim (1660), every gate and anchor POI (nearest 807:
// poi_boss). The rig stands on the Converted Yards' south-west footprint (504 WU off its
// heart, inside the zone), and the disc's rim brushes the slag yard's west edge - the same
// debris language, so the overlap reads as one field.
export const ASHFALL_SCARECROW_SECTOR_ID = 'sector_ashfall_reach';

export const ASHFALL_CLAIM_SCARECROW = buildKillMachine({
  id: 'ashfall_claim_scarecrow',
  hazardType: 'debris',
  placeId: 'place_extraction_mast',
  sectorId: ASHFALL_SCARECROW_SECTOR_ID,
  localPos: { x: 480, z: 410 },
  rot: 0,
  phaseOffsetS: 20,
  // The mouth disc covers the whole field reach (radius below) - the map never understates
  // where the shove can bite.
  hazardRadius: 260,
  // The rig pole itself is the anvil: the repulsor's heart is the guarded claim anchor.
  // A body at centre still satisfies the census law (pointInsideKillMachine admits it) -
  // inside the field, shoved away from it.
  anvil: { radius: 20, mass: 11000, along: 0, across: 0 },
  mouth: { name: 'Claim Scarecrow', radius: 16 },
  fields: [{
    // The only repulsor-kind field in the census: radial push away from the rig, so the
    // claim stays hollow and the rim collects what the sweep throws out.
    idSuffix: 'shove',
    kind: 'repulsor',
    strength: 560,
    radius: 260,
    falloff: 1.0,
    along: 0,
    across: 0,
  }],
});

// ── AEP PR-2 — rim signature toys, wave 2 ──────────────────────────────────────────────────
// One kill machine per wave-2 rim sector, on the same law as the Ceres mouths: warning is
// geometry, surge is the shove, calm is the window. Each machine is a different KIND of
// object mechanically — the audit's identity table made physical, not eight reskins of one
// sheet. Haumea's toy (RIFT_FISSURE_CRACKER) already exists above, so the wave adds eight.

// Nyx March — the paper-burning fence. Two opposed intake cones face each other across the
// anvil: whatever crosses the floor gets bitten from both sides and folded into the shred
// chamber, the way the march folds manifests into nothing. The only scissor-geometry machine
// in the census — every other cone machine aims one mouth at one anvil.
export const NYX_SHREDDER_SECTOR_ID = 'sector_nyx_march';
export const NYX_PAPER_SHREDDER = buildKillMachine({
  id: 'nyx_paper_shredder',
  hazardType: 'debris',
  placeId: 'place_crusher_module',
  sectorId: NYX_SHREDDER_SECTOR_ID,
  // On the open march floor between the fence and the nebula rim.
  localPos: { x: 200, z: -400 },
  rot: 0.35,
  phaseOffsetS: 1,
  hazardRadius: 130,
  anvil: { radius: 22, mass: 11000, along: 0, across: 0 },
  mouth: { name: 'Paper Shredder', radius: 18 },
  fields: [
    {
      idSuffix: 'intake_port',
      kind: 'cone',
      strength: 640,
      radius: 110,
      halfAngleRad: 0.4,
      edgeSoftRad: 0.12,
      falloff: 1.06,
      along: -70,
      across: 0,
      dirAlong: 1,
    },
    {
      idSuffix: 'intake_starboard',
      kind: 'cone',
      strength: 640,
      radius: 110,
      halfAngleRad: 0.4,
      edgeSoftRad: 0.12,
      falloff: 1.06,
      along: 70,
      across: 0,
      dirAlong: -1,
    },
  ],
});

// Hyperion Cut — the open cut. The saw is the lane itself: one long thin kerf of drag lying
// down the cut axis, pulling ore and hulls along the track into the saw-head anvil. The
// longest, narrowest sheet in the census — every other sheet drags you ACROSS your road;
// this one carries you down ITS road.
export const HYPERION_SAW_SECTOR_ID = 'sector_hyperion_cut';
export const HYPERION_CUT_SAW = buildKillMachine({
  id: 'hyperion_cut_saw',
  hazardType: 'debris',
  placeId: 'place_conveyor_truss',
  sectorId: HYPERION_SAW_SECTOR_ID,
  // On the belt lane, south of the refinery zone's heart.
  localPos: { x: 380, z: -500 },
  rot: -0.15,
  phaseOffsetS: 5,
  hazardRadius: 260,
  anvil: { radius: 24, mass: 12000, along: 200, across: 0 },
  mouth: { name: 'Cut Saw', radius: 20 },
  fields: [{
    idSuffix: 'kerf',
    kind: 'sheet',
    strength: 700,
    radius: 240,
    halfWidth: 18,
    falloff: 1.04,
    along: 0,
    across: 0,
    dirAlong: 1,
  }],
});

// Orcus Shadow — the dim library. Two lamp-post wells hold a slow tide between them: bodies
// shuttle from lamp to lamp on the weak draw, and anything that settles at the midpoint
// shelf gets stamped by the anvil the lamps share. The only double-well machine — every
// other well in the census stands alone.
export const ORCUS_LAMP_SECTOR_ID = 'sector_orcus_shadow';
export const ORCUS_DIM_LAMP = buildKillMachine({
  id: 'orcus_dim_lamp',
  hazardType: 'debris',
  placeId: 'place_worklight_tower',
  sectorId: ORCUS_LAMP_SECTOR_ID,
  // On the anomaly rim between the shadow zone heart and the research station.
  localPos: { x: -200, z: -300 },
  rot: 0.9,
  phaseOffsetS: 9,
  hazardRadius: 180,
  anvil: { radius: 20, mass: 9000, along: 0, across: 0 },
  mouth: { name: 'Dim Lamp Post', radius: 12 },
  fields: [
    {
      idSuffix: 'lamp_a',
      kind: 'well',
      strength: 90,
      radius: 80,
      falloff: 1.0,
      along: -70,
      across: 0,
    },
    {
      idSuffix: 'lamp_b',
      kind: 'well',
      strength: 90,
      radius: 80,
      falloff: 1.0,
      along: 70,
      across: 0,
    },
  ],
});

// Eris Margin — the drift net, the margin's own toll: a broad trawl sheet drags the fog rim
// and a cod-end well off the lane's axis collects whatever the net swept up. The Metronome
// keeps the beat (systems/environmentalMachinery.js); the net is what the sweep collects.
// The only sheet feeding an OFF-axis well — Io's ringer feeds its bell on the sheet line.
export const ERIS_NET_SECTOR_ID = 'sector_eris_margin';
export const ERIS_DRIFT_NET = buildKillMachine({
  id: 'eris_drift_net',
  hazardType: 'debris',
  placeId: 'place_interdiction_buoy',
  sectorId: ERIS_NET_SECTOR_ID,
  // On the fog rim beside the Drift Choir line (+z is north).
  localPos: { x: 240, z: 360 },
  rot: 0.3,
  phaseOffsetS: 3,
  hazardRadius: 200,
  anvil: { radius: 22, mass: 10000, along: 60, across: 80 },
  mouth: { name: 'Drift Net Mouth', radius: 16 },
  fields: [
    {
      idSuffix: 'trawl',
      kind: 'sheet',
      strength: 620,
      radius: 190,
      halfWidth: 110,
      falloff: 1.05,
      along: 0,
      across: 0,
      dirAlong: 1,
    },
    {
      idSuffix: 'cod_end',
      kind: 'well',
      strength: 140,
      radius: 90,
      falloff: 1.1,
      along: 60,
      across: 80,
    },
  ],
});

// Nereid Shoal — the ice sled. A narrow reversed cone on the channel line: the sled's launch
// kick slings loose ice and late ore back down-channel into the scale block the waystation
// weighs it on. The only narrow reversed cone — Tethys's clamp is the wide one.
export const NEREID_SLED_SECTOR_ID = 'sector_nereid_shoal';
export const NEREID_ICE_SLED = buildKillMachine({
  id: 'nereid_ice_sled',
  hazardType: 'debris',
  placeId: 'place_transponder_gate',
  sectorId: NEREID_SLED_SECTOR_ID,
  // On the channel between the waystation and the shoal zone.
  localPos: { x: 700, z: -300 },
  rot: -0.35,
  phaseOffsetS: 7,
  hazardRadius: 170,
  anvil: { radius: 22, mass: 11000, along: -110, across: 0 },
  mouth: { name: 'Ice Sled Ramp', radius: 16 },
  fields: [{
    idSuffix: 'launch',
    kind: 'cone',
    strength: 780,
    radius: 150,
    halfAngleRad: 0.24,
    edgeSoftRad: 0.1,
    falloff: 1.05,
    along: 0,
    across: 0,
    dirAlong: -1,
  }],
});

// Proteus Well — the well bucket. The well IS the toy: a deep draw centered on its own
// anvil, with the bucket's upstroke — a small repulsor at the same heart — kicking the load
// back up the line between surges. The only two-force co-centered machine: pull and push
// share one center, and the body that survives is the one the bucket let go.
export const PROTEUS_BUCKET_SECTOR_ID = 'sector_proteus_well';
export const PROTEUS_WELL_BUCKET = buildKillMachine({
  id: 'proteus_well_bucket',
  hazardType: 'debris',
  placeId: 'place_extraction_mast',
  sectorId: PROTEUS_BUCKET_SECTOR_ID,
  // On the seams approach south-east of the den (+z is north).
  localPos: { x: 300, z: -500 },
  rot: 0,
  phaseOffsetS: 2,
  hazardRadius: 300,
  anvil: { radius: 24, mass: 14000, along: 0, across: 0 },
  mouth: { name: 'Well Bucket', radius: 18 },
  fields: [
    {
      idSuffix: 'draw',
      kind: 'well',
      strength: 220,
      radius: 280,
      falloff: 1.08,
      along: 0,
      across: 0,
    },
    {
      idSuffix: 'upstroke',
      kind: 'repulsor',
      strength: 120,
      radius: 40,
      falloff: 1.0,
      along: 0,
      across: 0,
    },
  ],
});

// Triton Wake — the wake kite. A single cone lying OFF the lane line: the glow band the
// kite-keepers ride runs parallel to the courier's road, not on it, so the pull you feel is
// the wake itself, a lane's-width off your lane. The only off-axis cone in the census.
export const TRITON_KITE_SECTOR_ID = 'sector_triton_wake';
export const TRITON_WAKE_KITE = buildKillMachine({
  id: 'triton_wake_kite',
  hazardType: 'debris',
  placeId: 'place_pirate_sensor_mast',
  sectorId: TRITON_KITE_SECTOR_ID,
  // On the wake line between the lab and the anomaly (+z is north).
  localPos: { x: 150, z: -500 },
  rot: 0.55,
  phaseOffsetS: 6,
  hazardRadius: 220,
  anvil: { radius: 22, mass: 10000, along: 150, across: 60 },
  mouth: { name: 'Wake Kite Line', radius: 14 },
  fields: [{
    idSuffix: 'glow_band',
    kind: 'cone',
    strength: 660,
    radius: 210,
    halfAngleRad: 0.42,
    edgeSoftRad: 0.12,
    falloff: 1.06,
    along: 0,
    across: 60,
    dirAlong: 1,
  }],
});

// Eunomia Gulf — the license stamp. The board's gavel is a repulsor off the block line:
// whatever drifts into the gulf lane gets hammered sideways onto the seal anvil beside it,
// the cut nobody disputes. The only repulsor that pushes toward an off-axis anvil — the
// Ashfall scarecrow pushes away from its own center instead.
export const EUNOMIA_STAMP_SECTOR_ID = 'sector_eunomia_gulf';
export const EUNOMIA_LICENSE_STAMP = buildKillMachine({
  id: 'eunomia_license_stamp',
  hazardType: 'debris',
  placeId: 'place_customs_pylon',
  sectorId: EUNOMIA_STAMP_SECTOR_ID,
  // Mid-gulf on the lane between the fence and the wreck field.
  localPos: { x: -300, z: -100 },
  rot: -0.5,
  phaseOffsetS: 4,
  hazardRadius: 180,
  anvil: { radius: 22, mass: 12000, along: 20, across: 80 },
  mouth: { name: 'License Stamp', radius: 16 },
  fields: [{
    idSuffix: 'gavel',
    kind: 'repulsor',
    strength: 380,
    radius: 160,
    falloff: 1.0,
    along: 0,
    across: -60,
  }],
});

// Every machine the adapter owns, in one list: Ceres mouths, the Helios starter cracker, the Sker
// baler, the Rift fissure cracker, and the CR-FEED machines. Per-sector slices come from
// killMachinesForSector; this is the census the runtime uses to retire fields and anvils when a
// sector deactivates or a machine is absent.
export const ALL_KILL_MACHINES = Object.freeze([
  ...KILL_MACHINES,
  STARTER_FIELD_MACHINE,
  SKER_SCRAP_BALER,
  RIFT_FISSURE_CRACKER,
  VESTA_SHEAR_JAWS,
  TETHYS_WEIGH_CLAMP,
  VEIL_COLD_DRAW,
  CHARON_TAILINGS_SWEEP,
  IO_BELL_RINGER,
  ASHFALL_CLAIM_SCARECROW,
  NYX_PAPER_SHREDDER,
  HYPERION_CUT_SAW,
  ORCUS_DIM_LAMP,
  ERIS_DRIFT_NET,
  NEREID_ICE_SLED,
  PROTEUS_WELL_BUCKET,
  TRITON_WAKE_KITE,
  EUNOMIA_LICENSE_STAMP,
]);

// The full census by stable id — Ceres trio plus the starter/baler/rift/CR-FEED machines.
// Consumers that bind a machine by world identity at fire time (SF-136 yard tow-out)
// validate against this map, not the Ceres-only KILL_MACHINE_BY_ID.
export const ALL_KILL_MACHINE_BY_ID = Object.freeze(Object.fromEntries(
  ALL_KILL_MACHINES.map((machine) => [machine.id, machine]),
));

export function killMachinesForSector(sectorId) {
  if (sectorId === KILL_MACHINE_SECTOR_ID) return KILL_MACHINES;
  if (sectorId === STARTER_FIELD_SECTOR_ID) return Object.freeze([STARTER_FIELD_MACHINE]);
  if (sectorId === SKER_SCRAP_BALER_SECTOR_ID) return Object.freeze([SKER_SCRAP_BALER]);
  if (sectorId === RIFT_FISSURE_SECTOR_ID) return Object.freeze([RIFT_FISSURE_CRACKER]);
  if (sectorId === VESTA_SHEAR_SECTOR_ID) return Object.freeze([VESTA_SHEAR_JAWS]);
  if (sectorId === TETHYS_WEIGH_SECTOR_ID) return Object.freeze([TETHYS_WEIGH_CLAMP]);
  if (sectorId === VEIL_COLD_SECTOR_ID) return Object.freeze([VEIL_COLD_DRAW]);
  if (sectorId === CHARON_SWEEP_SECTOR_ID) return Object.freeze([CHARON_TAILINGS_SWEEP]);
  if (sectorId === IO_BELL_SECTOR_ID) return Object.freeze([IO_BELL_RINGER]);
  if (sectorId === ASHFALL_SCARECROW_SECTOR_ID) return Object.freeze([ASHFALL_CLAIM_SCARECROW]);
  if (sectorId === NYX_SHREDDER_SECTOR_ID) return Object.freeze([NYX_PAPER_SHREDDER]);
  if (sectorId === HYPERION_SAW_SECTOR_ID) return Object.freeze([HYPERION_CUT_SAW]);
  if (sectorId === ORCUS_LAMP_SECTOR_ID) return Object.freeze([ORCUS_DIM_LAMP]);
  if (sectorId === ERIS_NET_SECTOR_ID) return Object.freeze([ERIS_DRIFT_NET]);
  if (sectorId === NEREID_SLED_SECTOR_ID) return Object.freeze([NEREID_ICE_SLED]);
  if (sectorId === PROTEUS_BUCKET_SECTOR_ID) return Object.freeze([PROTEUS_WELL_BUCKET]);
  if (sectorId === TRITON_KITE_SECTOR_ID) return Object.freeze([TRITON_WAKE_KITE]);
  if (sectorId === EUNOMIA_STAMP_SECTOR_ID) return Object.freeze([EUNOMIA_LICENSE_STAMP]);
  return Object.freeze([]);
}

export function killMachineFieldCenter(machine, field) {
  if (!machine || !field) return freezeVec(0, 0);
  return freezeVec(
    machine.globalPos.x + machine.dir.x * field.along + machine.perp.x * field.across,
    machine.globalPos.z + machine.dir.z * field.along + machine.perp.z * field.across,
  );
}

export function killMachineFieldDir(machine, field) {
  if (!machine || !field) return freezeVec(1, 0);
  const sign = field.dirAlong < 0 ? -1 : 1;
  return freezeVec(machine.dir.x * sign, machine.dir.z * sign);
}

/**
 * Derive warning / surge / calm from saved sim time plus an authored phase offset.
 * Warning registers the volume at strength 0; only surge writes force.
 */
export function killMachinePhase(machine, simTime, out = null) {
  const result = out || {};
  const cycle = machine && machine.cycle || KILL_MACHINE_CYCLE;
  const cycleS = cycle.warningS + cycle.surgeS + cycle.calmS;
  const elapsedS = positiveModulo(finite(simTime) - finite(machine && machine.phaseOffsetS), cycleS);
  let phase;
  let remainingS;
  if (elapsedS < cycle.warningS) {
    phase = 'warning';
    remainingS = cycle.warningS - elapsedS;
  } else if (elapsedS < cycle.warningS + cycle.surgeS) {
    phase = 'surge';
    remainingS = cycle.warningS + cycle.surgeS - elapsedS;
  } else {
    phase = 'calm';
    remainingS = cycleS - elapsedS;
  }
  result.phase = phase;
  result.fieldActive = phase !== 'calm';
  result.fieldStrengthScale = phase === 'surge' ? 1 : 0;
  result.cycleS = cycleS;
  result.elapsedS = elapsedS;
  result.remainingS = remainingS;
  return result;
}

export function pointInsideMachineField(machine, field, point) {
  if (!machine || !field || !point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) {
    return false;
  }
  const center = killMachineFieldCenter(machine, field);
  const dx = point.x - center.x;
  const dz = point.z - center.z;
  if (field.kind === 'sheet') {
    const dir = killMachineFieldDir(machine, field);
    const along = dx * dir.x + dz * dir.z;
    if (along < 0 || along >= field.radius) return false;
    const lat = Math.hypot(dx - dir.x * along, dz - dir.z * along);
    return lat <= field.halfWidth;
  }
  const distance = Math.hypot(dx, dz);
  if (distance >= field.radius) return false;
  if (field.kind !== 'cone') return true;
  if (distance < 1e-6) return true;
  const dir = killMachineFieldDir(machine, field);
  const forward = (dx * dir.x + dz * dir.z) / distance;
  if (forward <= 0) return false;
  const angle = Math.acos(Math.max(-1, Math.min(1, forward)));
  return angle < field.halfAngleRad + field.edgeSoftRad;
}

export function pointInsideKillMachine(machine, point) {
  if (!machine) return false;
  for (const field of machine.fields) {
    if (pointInsideMachineField(machine, field, point)) return true;
  }
  return false;
}

export function killMachineHazardZones(sectorId) {
  // No default: a missing/unknown id must fail closed to [], never silently serve Ceres.
  return killMachinesForSector(sectorId).map((machine) => Object.freeze({
    id: machine.id,
    type: machine.hazardType,
    center: machine.localPos,
    radius: machine.hazardRadius,
    intensity: 0.7,
  }));
}

// PQ-027.01 — Pallas Drift debris reef. An authored cone carries loose mass; a line of
// dynamic reef mines/pods ride it. One body slammed through the string pinballs the rest.
export const PALLAS_REEF_SECTOR_ID = 'sector_pallas_drift';
export const PALLAS_REEF_SITE_ID = 'pallas_debris_reef';
export const PALLAS_REEF_LOCAL_POS = Object.freeze({ x: -320, z: -620 });
export const PALLAS_REEF_ROT = 0.38;
export const PALLAS_REEF_GLOBAL_POS = Object.freeze(
  sectorLocalToGlobalForSector(PALLAS_REEF_LOCAL_POS, PALLAS_REEF_SECTOR_ID),
);
const PALLAS_REEF_DIR = freezeVec(Math.cos(PALLAS_REEF_ROT), Math.sin(PALLAS_REEF_ROT));
const PALLAS_REEF_CYCLE = Object.freeze({ warningS: 2, surgeS: 8, calmS: 4 });

export const PALLAS_REEF_FIELD = Object.freeze({
  id: 'environment_pallas_debris_reef_current',
  kind: 'cone',
  center: PALLAS_REEF_GLOBAL_POS,
  dir: PALLAS_REEF_DIR,
  radius: 420,
  strength: 340,
  falloff: 1.12,
  halfAngleRad: 0.42,
  edgeSoftRad: 0.12,
  sourceId: PALLAS_REEF_SITE_ID,
  team: null,
});

// Tight string: along-gap is just over two radii so the upstream body riding the
// stronger near-apex current actually strikes the next instead of sliding past.
export const PALLAS_REEF_MINE_BODY = Object.freeze({
  radius: 16,
  mass: 8,
});

export const PALLAS_REEF_MINES = Object.freeze([
  Object.freeze({ along: 72, across: -4 }),
  Object.freeze({ along: 108, across: 5 }),
  Object.freeze({ along: 144, across: -5 }),
  Object.freeze({ along: 180, across: 4 }),
  Object.freeze({ along: 216, across: -3 }),
]);

export function pallasReefPhase(simTime, out = null) {
  const result = out || {};
  const cycleS = PALLAS_REEF_CYCLE.warningS + PALLAS_REEF_CYCLE.surgeS + PALLAS_REEF_CYCLE.calmS;
  const elapsedS = positiveModulo(finite(simTime), cycleS);
  let phase;
  let remainingS;
  if (elapsedS < PALLAS_REEF_CYCLE.warningS) {
    phase = 'warning';
    remainingS = PALLAS_REEF_CYCLE.warningS - elapsedS;
  } else if (elapsedS < PALLAS_REEF_CYCLE.warningS + PALLAS_REEF_CYCLE.surgeS) {
    phase = 'surge';
    remainingS = PALLAS_REEF_CYCLE.warningS + PALLAS_REEF_CYCLE.surgeS - elapsedS;
  } else {
    phase = 'calm';
    remainingS = cycleS - elapsedS;
  }
  result.phase = phase;
  result.fieldActive = phase !== 'calm';
  result.fieldStrength = phase === 'surge' ? PALLAS_REEF_FIELD.strength : 0;
  result.cycleS = cycleS;
  result.elapsedS = elapsedS;
  result.remainingS = remainingS;
  return result;
}

export function pallasReefMinePos(slot) {
  return freezeVec(
    PALLAS_REEF_GLOBAL_POS.x + PALLAS_REEF_DIR.x * slot.along - PALLAS_REEF_DIR.z * slot.across,
    PALLAS_REEF_GLOBAL_POS.z + PALLAS_REEF_DIR.z * slot.along + PALLAS_REEF_DIR.x * slot.across,
  );
}

export function pallasReefMineId(index) {
  return `pallas_reef_mine_${index}`;
}

export function pallasReefHazardZone() {
  return Object.freeze({
    id: PALLAS_REEF_SITE_ID,
    type: 'debris_current',
    center: PALLAS_REEF_LOCAL_POS,
    radius: PALLAS_REEF_FIELD.radius,
    intensity: 0.55,
  });
}

export function pointInsidePallasReef(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
  const dx = point.x - PALLAS_REEF_FIELD.center.x;
  const dz = point.z - PALLAS_REEF_FIELD.center.z;
  const distance = Math.hypot(dx, dz);
  if (distance >= PALLAS_REEF_FIELD.radius) return false;
  if (distance < 1e-6) return true;
  const forward = (dx * PALLAS_REEF_FIELD.dir.x + dz * PALLAS_REEF_FIELD.dir.z) / distance;
  if (forward <= 0) return false;
  const angle = Math.acos(Math.max(-1, Math.min(1, forward)));
  return angle < PALLAS_REEF_FIELD.halfAngleRad + PALLAS_REEF_FIELD.edgeSoftRad;
}

export const PALLAS_REEF_CYCLE_S = PALLAS_REEF_CYCLE;

// PQ-027.02 — weather that shapes fights. One storm sheet and one radiation belt in each
// affected sector. Both MOVE MASS through the field kernel (shots bend, hulls drift, a stacked
// well reads louder). The belt also shrinks world POI scan. Neither is a hull-drain aura;
// `radiation` zone type is forbidden here because world.js would chew hull.
export const VEIL_WEATHER_SECTOR_ID = 'sector_veil_nebula';
export const VESTA_WEATHER_SECTOR_ID = 'sector_vesta_forge';
export const IO_REACH_WEATHER_SECTOR_ID = 'sector_io_reach';
const WEATHER_CYCLE = Object.freeze({ warningS: 2, surgeS: 6, calmS: 4 });
export const WEATHER_SCAN_SCALE_INSIDE = 0.4;

// The Feedstock Belt's winnow collects freshly cut ore, then throws a batch away from
// the foundry approach. The throat is open: a pilot can tow a pod out during loading,
// ride the discharge, or feed it a pursuing hull. No hidden conveyor or damage law.
const WINNOW_SECTOR = 'sector_vesta_forge';
const WINNOW_POS = Object.freeze(sectorLocalToGlobalForSector({ x: 120, z: 980 }, WINNOW_SECTOR));
export const VESTA_ORE_WINNOW = Object.freeze({
  id: 'vesta_ore_winnow',
  sectorId: WINNOW_SECTOR,
  zoneId: 'zone_vesta_belt',
  fieldId: 'f_vesta_3',
  localPos: freezeVec(120, 980),
  globalPos: WINNOW_POS,
  // East is clear of the foundry (west of the throat) and of the storm sheet to the south-east.
  dir: freezeVec(1, 0),
  cycle: Object.freeze({ gatherS: 5, warningS: 2, dischargeS: 3, calmS: 6 }),
  fields: Object.freeze([
    Object.freeze({
      id: 'environment_vesta_winnow_gather', kind: 'well', center: WINNOW_POS,
      radius: 190, strength: 120, falloff: 1.1, innerRadius: 24, innerSoft: 16,
      sourceId: 'vesta_ore_winnow', team: null,
    }),
    Object.freeze({
      id: 'environment_vesta_winnow_discharge', kind: 'cone',
      center: freezeVec(WINNOW_POS.x - 100, WINNOW_POS.z), dir: freezeVec(1, 0),
      radius: 420, strength: 340, falloff: 1.05, halfAngleRad: 0.5, edgeSoftRad: 0.1,
      sourceId: 'vesta_ore_winnow', team: null,
    }),
  ]),
  // Existing kit mouths flank the working lane; nothing plugs the projectile exit.
  furniture: Object.freeze([-1, 1].map((side) => Object.freeze({
    id: `vesta_winnow_bank_${side < 0 ? 'south' : 'north'}`,
    placeId: 'place_conveyor_truss',
    pos: freezeVec(WINNOW_POS.x - 30, WINNOW_POS.z + side * 76),
    rot: 0, radius: 18,
  }))),
});

/** Saved sim time keeps the shift running across visits; no visit-local timer. */
export function vestaWinnowPhase(simTime, out = null) {
  const result = out || {};
  const cycle = VESTA_ORE_WINNOW.cycle;
  const cycleS = cycle.gatherS + cycle.warningS + cycle.dischargeS + cycle.calmS;
  const elapsedS = positiveModulo(finite(simTime), cycleS);
  const warningEnd = cycle.gatherS + cycle.warningS;
  const dischargeEnd = warningEnd + cycle.dischargeS;
  result.phase = elapsedS < cycle.gatherS ? 'gather'
    : elapsedS < warningEnd ? 'warning' : elapsedS < dischargeEnd ? 'discharge' : 'calm';
  result.remainingS = (result.phase === 'gather' ? cycle.gatherS
    : result.phase === 'warning' ? warningEnd : result.phase === 'discharge' ? dischargeEnd : cycleS) - elapsedS;
  result.cycleS = cycleS;
  return result;
}

function buildWeatherVolume({
  id, role, sectorId, hazardType, localPos, rot, scanScale, field,
}) {
  const dir = freezeVec(Math.cos(finite(rot)), Math.sin(finite(rot)));
  const globalPos = Object.freeze(sectorLocalToGlobalForSector(localPos, sectorId));
  return Object.freeze({
    id,
    role,
    sectorId,
    hazardType,
    scanScale: Number.isFinite(scanScale) ? scanScale : 1,
    localPos: Object.freeze({ x: localPos.x, z: localPos.z }),
    globalPos,
    dir,
    cycle: WEATHER_CYCLE,
    field: Object.freeze({
      id: `environment_${id}`,
      kind: field.kind,
      center: globalPos,
      dir,
      radius: positive(field.radius, 220),
      strength: Math.max(0, finite(field.strength, 0)),
      falloff: positive(field.falloff, 1.1),
      halfAngleRad: positive(field.halfAngleRad, 0.4),
      edgeSoftRad: Math.max(0, finite(field.edgeSoftRad, 0.12)),
      halfWidth: positive(field.halfWidth, 72),
      innerRadius: Math.max(0, finite(field.innerRadius, 0)),
      innerSoft: Math.max(0, finite(field.innerSoft, 0)),
      sourceId: id,
      team: null,
    }),
  });
}

export const WEATHER_VOLUMES = Object.freeze([
  buildWeatherVolume({
    id: 'veil_storm_lane',
    role: 'storm',
    sectorId: VEIL_WEATHER_SECTOR_ID,
    hazardType: 'debris_current',
    localPos: { x: -280, z: 640 },
    rot: 0.42,
    scanScale: 1,
    field: {
      kind: 'sheet',
      strength: 320,
      radius: 460,
      halfWidth: 78,
      falloff: 1.05,
    },
  }),
  buildWeatherVolume({
    id: 'veil_radiation_belt',
    role: 'radiation_belt',
    sectorId: VEIL_WEATHER_SECTOR_ID,
    hazardType: 'nebula',
    localPos: { x: 380, z: -980 },
    rot: 0,
    scanScale: WEATHER_SCAN_SCALE_INSIDE,
    field: {
      kind: 'well',
      strength: 210,
      radius: 260,
      innerRadius: 78,
      innerSoft: 24,
      falloff: 1.2,
    },
  }),
  buildWeatherVolume({
    id: 'vesta_storm_lane',
    role: 'storm',
    sectorId: VESTA_WEATHER_SECTOR_ID,
    hazardType: 'debris_current',
    localPos: { x: 680, z: 320 },
    rot: -0.55,
    scanScale: 1,
    field: {
      kind: 'sheet',
      strength: 320,
      radius: 460,
      halfWidth: 78,
      falloff: 1.05,
    },
  }),
  buildWeatherVolume({
    id: 'vesta_radiation_belt',
    role: 'radiation_belt',
    sectorId: VESTA_WEATHER_SECTOR_ID,
    hazardType: 'nebula',
    localPos: { x: -540, z: -480 },
    rot: 0,
    scanScale: WEATHER_SCAN_SCALE_INSIDE,
    field: {
      kind: 'well',
      strength: 210,
      radius: 260,
      innerRadius: 78,
      innerSoft: 24,
      falloff: 1.2,
    },
  }),
  // Io Reach's war is weather. The contested floor has changed hands by the week, and the
  // fighting left two standing facts on the chart: a debris current thrown off the hulls that
  // died crossing the southern approach (shots and hulls bend inside it), and a radiation
  // belt off the west holdings nobody has held long enough to vent. Positions sit clear of
  // both stations, all four gates, both ore fields, and the named POIs in sectorAnchors.js.
  buildWeatherVolume({
    id: 'io_reach_storm_lane',
    role: 'storm',
    sectorId: IO_REACH_WEATHER_SECTOR_ID,
    hazardType: 'debris_current',
    localPos: { x: 700, z: -1750 },
    rot: -0.5,
    scanScale: 1,
    field: {
      kind: 'sheet',
      strength: 320,
      radius: 460,
      halfWidth: 78,
      falloff: 1.05,
    },
  }),
  buildWeatherVolume({
    id: 'io_reach_radiation_belt',
    role: 'radiation_belt',
    sectorId: IO_REACH_WEATHER_SECTOR_ID,
    hazardType: 'nebula',
    localPos: { x: -2350, z: 1250 },
    rot: 0,
    scanScale: WEATHER_SCAN_SCALE_INSIDE,
    field: {
      kind: 'well',
      strength: 210,
      radius: 260,
      innerRadius: 78,
      innerSoft: 24,
      falloff: 1.2,
    },
  }),
]);

export const WEATHER_SECTOR_IDS = Object.freeze(new Set([
  VEIL_WEATHER_SECTOR_ID,
  VESTA_WEATHER_SECTOR_ID,
  IO_REACH_WEATHER_SECTOR_ID,
]));

// WEATHER_VOLUMES is frozen at module load, so per-sector slices are memoized: the tick loop
// queries this every frame and every caller only iterates or maps (never mutates) the result.
const WEATHER_VOLUMES_BY_SECTOR = new Map();
export function weatherVolumesForSector(sectorId) {
  let rows = WEATHER_VOLUMES_BY_SECTOR.get(sectorId);
  if (!rows) {
    rows = Object.freeze(WEATHER_VOLUMES.filter((volume) => volume.sectorId === sectorId));
    WEATHER_VOLUMES_BY_SECTOR.set(sectorId, rows);
  }
  return rows;
}

export function weatherPhase(volume, simTime, out = null) {
  const result = out || {};
  const cycle = volume && volume.cycle || WEATHER_CYCLE;
  const cycleS = cycle.warningS + cycle.surgeS + cycle.calmS;
  const elapsedS = positiveModulo(finite(simTime), cycleS);
  let phase;
  let remainingS;
  if (elapsedS < cycle.warningS) {
    phase = 'warning';
    remainingS = cycle.warningS - elapsedS;
  } else if (elapsedS < cycle.warningS + cycle.surgeS) {
    phase = 'surge';
    remainingS = cycle.warningS + cycle.surgeS - elapsedS;
  } else {
    phase = 'calm';
    remainingS = cycleS - elapsedS;
  }
  result.phase = phase;
  result.fieldActive = phase !== 'calm';
  result.fieldStrengthScale = phase === 'surge' ? 1 : 0;
  result.cycleS = cycleS;
  result.elapsedS = elapsedS;
  result.remainingS = remainingS;
  return result;
}

export function pointInsideWeatherVolume(volume, point) {
  if (!volume || !point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
  const field = volume.field;
  const dx = point.x - field.center.x;
  const dz = point.z - field.center.z;
  if (field.kind === 'sheet') {
    const along = dx * field.dir.x + dz * field.dir.z;
    if (along < 0 || along >= field.radius) return false;
    const lat = Math.hypot(dx - field.dir.x * along, dz - field.dir.z * along);
    return lat <= field.halfWidth;
  }
  const distance = Math.hypot(dx, dz);
  if (distance >= field.radius) return false;
  if (field.innerRadius > 0 && distance < field.innerRadius) return false;
  return true;
}

// Shared scratch: weatherPhase sets every field on each call and this loop consumes the
// verdict synchronously, so no per-volume allocation is needed.
const SCAN_SCALE_PHASE_SCRATCH = {};
export function weatherScanScale(sectorId, point, simTime) {
  let scale = 1;
  for (const volume of weatherVolumesForSector(sectorId)) {
    const phase = weatherPhase(volume, simTime, SCAN_SCALE_PHASE_SCRATCH);
    if (phase.phase !== 'surge') continue;
    if (!pointInsideWeatherVolume(volume, point)) continue;
    if (volume.scanScale < scale) scale = volume.scanScale;
  }
  return scale;
}

/** The soonest readable weather window at a point, or null if the point is clear. */
export function weatherWindowAt(sectorId, point, simTime, out = null) {
  let best = null;
  for (const volume of weatherVolumesForSector(sectorId)) {
    if (!pointInsideWeatherVolume(volume, point)) continue;
    const phase = weatherPhase(volume, simTime, out);
    if (!best || phase.remainingS < best.remainingS) {
      best = {
        id: volume.id,
        role: volume.role,
        phase: phase.phase,
        remainingS: phase.remainingS,
        fieldActive: phase.fieldActive,
        fieldStrengthScale: phase.fieldStrengthScale,
      };
    }
  }
  return best;
}

export function weatherHazardZones(sectorId) {
  return weatherVolumesForSector(sectorId).map((volume) => Object.freeze({
    id: volume.id,
    type: volume.hazardType,
    center: volume.localPos,
    radius: volume.field.radius,
    intensity: 0.55,
  }));
}

// PQ-027.03 — Ceres Refinery hangar aperture. The door locks on a schedule; stuffing a hull
// into the mouth jams it. Jam is occupancy plus an inward hold cone — the field moves mass,
// it is not a spawn-flag aura. Reinforcements burning out the bay stay inside for ≥ 20 s.
export const APERTURE_SECTOR_ID = CINDER_SLUICE_SECTOR_ID;
export const APERTURE_STATION_ID = 'station_ceres';
export const APERTURE_ID = 'ceres_refinery_hangar_aperture';
export const APERTURE_JAM_HOLD_S = 20;
export const APERTURE_CYCLE = Object.freeze({ openS: 16, closingS: 2, lockedS: 10 });
export const APERTURE_LOCAL_POS = Object.freeze({ x: -990, z: 620 });
const APERTURE_ROT = 0;
export const APERTURE_DIR = freezeVec(Math.cos(APERTURE_ROT), Math.sin(APERTURE_ROT));
export const APERTURE_INTERIOR_DIR = freezeVec(-APERTURE_DIR.x, -APERTURE_DIR.z);
export const APERTURE_PERP = freezeVec(-APERTURE_DIR.z, APERTURE_DIR.x);
export const APERTURE_GLOBAL_POS = Object.freeze(
  sectorLocalToGlobalForSector(APERTURE_LOCAL_POS, APERTURE_SECTOR_ID),
);
export const APERTURE_MOUTH = Object.freeze({
  alongMin: -22,
  alongMax: 16,
  halfWidth: 34,
});
const APERTURE_HOLD_APEX_ALONG = 10;
export const APERTURE_HOLD_FIELD = Object.freeze({
  id: 'environment_ceres_hangar_aperture_hold',
  kind: 'cone',
  center: freezeVec(
    APERTURE_GLOBAL_POS.x + APERTURE_INTERIOR_DIR.x * APERTURE_HOLD_APEX_ALONG,
    APERTURE_GLOBAL_POS.z + APERTURE_INTERIOR_DIR.z * APERTURE_HOLD_APEX_ALONG,
  ),
  dir: APERTURE_INTERIOR_DIR,
  radius: 92,
  strength: 720,
  falloff: 1.08,
  halfAngleRad: 0.62,
  edgeSoftRad: 0.12,
  sourceId: APERTURE_ID,
  team: null,
});
export const APERTURE_PINCH_FIELD = Object.freeze({
  id: 'environment_ceres_hangar_aperture_pinch',
  kind: 'sheet',
  center: freezeVec(APERTURE_GLOBAL_POS.x, APERTURE_GLOBAL_POS.z),
  dir: APERTURE_DIR,
  radius: 48,
  strength: 820,
  falloff: 1.05,
  halfWidth: 52,
  sourceId: APERTURE_ID,
  team: null,
});
export const APERTURE_FIELDS = Object.freeze([APERTURE_HOLD_FIELD, APERTURE_PINCH_FIELD]);
export const APERTURE_PLUG = Object.freeze({
  id: 'ceres_refinery_hangar_aperture_plug',
  pos: freezeVec(APERTURE_GLOBAL_POS.x, APERTURE_GLOBAL_POS.z),
  radius: 30,
  mass: 11000,
});
export const APERTURE_EXIT_ALONG = APERTURE_PLUG.radius + 8;
const APERTURE_OCCUPANT_TYPES = new Set(['ship', 'wreck', 'asteroid']);

export function aperturePoint(along, across = 0) {
  return freezeVec(
    APERTURE_GLOBAL_POS.x + APERTURE_DIR.x * along + APERTURE_PERP.x * across,
    APERTURE_GLOBAL_POS.z + APERTURE_DIR.z * along + APERTURE_PERP.z * across,
  );
}

export function apertureAlong(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return NaN;
  return (point.x - APERTURE_GLOBAL_POS.x) * APERTURE_DIR.x
    + (point.z - APERTURE_GLOBAL_POS.z) * APERTURE_DIR.z;
}

export function apertureAcross(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return NaN;
  return (point.x - APERTURE_GLOBAL_POS.x) * APERTURE_PERP.x
    + (point.z - APERTURE_GLOBAL_POS.z) * APERTURE_PERP.z;
}

export function pointInsideApertureMouth(point) {
  const along = apertureAlong(point);
  if (!Number.isFinite(along)) return false;
  if (along < APERTURE_MOUTH.alongMin || along > APERTURE_MOUTH.alongMax) return false;
  return Math.abs(apertureAcross(point)) <= APERTURE_MOUTH.halfWidth;
}

export function pointInsideApertureHold(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
  const field = APERTURE_HOLD_FIELD;
  const dx = point.x - field.center.x;
  const dz = point.z - field.center.z;
  const distance = Math.hypot(dx, dz);
  if (distance >= field.radius) return false;
  if (distance < 1e-6) return true;
  const forward = (dx * field.dir.x + dz * field.dir.z) / distance;
  if (forward <= 0) return false;
  const angle = Math.acos(Math.max(-1, Math.min(1, forward)));
  return angle < field.halfAngleRad + field.edgeSoftRad;
}

export function pointInsideAperture(point) {
  return pointInsideApertureMouth(point) || pointInsideApertureHold(point);
}

export const APERTURE_SEAT_SPEED = 8;

export function isApertureOccupant(entity) {
  if (!entity || entity.alive === false) return false;
  if (entity.collides === false) return false;
  if (entity.data && entity.data.aperturePlugId) return false;
  if (!APERTURE_OCCUPANT_TYPES.has(entity.type)) return false;
  if (!pointInsideApertureMouth(entity.pos)) return false;
  if (entity.type === 'ship') {
    const vel = entity.vel;
    const speed = vel ? Math.hypot(Number(vel.x) || 0, Number(vel.z) || 0) : 0;
    if (speed > APERTURE_SEAT_SPEED) return false;
  }
  return true;
}

export function aperturePhase(simTime, jamState, out = null) {
  const result = out || {};
  const now = finite(simTime);
  const occupied = !!(jamState && jamState.occupied);
  let jammedAtS = jamState && Number.isFinite(jamState.jammedAtS) ? jamState.jammedAtS : null;
  if (occupied && jammedAtS == null) jammedAtS = now;
  if (jammedAtS != null && (occupied || (now - jammedAtS) < APERTURE_JAM_HOLD_S)) {
    const heldS = now - jammedAtS;
    result.phase = 'jam';
    result.fieldActive = true;
    result.fieldStrengthScale = 1;
    result.occupied = occupied;
    result.heldS = heldS;
    result.remainingS = occupied
      ? Math.max(APERTURE_JAM_HOLD_S, APERTURE_JAM_HOLD_S - heldS)
      : Math.max(0, APERTURE_JAM_HOLD_S - heldS);
    result.cycleS = APERTURE_CYCLE.openS + APERTURE_CYCLE.closingS + APERTURE_CYCLE.lockedS;
    result.elapsedS = heldS;
    return result;
  }
  const cycleS = APERTURE_CYCLE.openS + APERTURE_CYCLE.closingS + APERTURE_CYCLE.lockedS;
  const elapsedS = positiveModulo(now, cycleS);
  let phase;
  let remainingS;
  let fieldActive;
  let fieldStrengthScale;
  if (elapsedS < APERTURE_CYCLE.openS) {
    phase = 'open';
    remainingS = APERTURE_CYCLE.openS - elapsedS;
    fieldActive = false;
    fieldStrengthScale = 0;
  } else if (elapsedS < APERTURE_CYCLE.openS + APERTURE_CYCLE.closingS) {
    phase = 'closing';
    remainingS = APERTURE_CYCLE.openS + APERTURE_CYCLE.closingS - elapsedS;
    fieldActive = true;
    fieldStrengthScale = 0;
  } else {
    phase = 'locked';
    remainingS = cycleS - elapsedS;
    fieldActive = true;
    fieldStrengthScale = 1;
  }
  result.phase = phase;
  result.fieldActive = fieldActive;
  result.fieldStrengthScale = fieldStrengthScale;
  result.occupied = occupied;
  result.heldS = 0;
  result.remainingS = remainingS;
  result.cycleS = cycleS;
  result.elapsedS = elapsedS;
  return result;
}

export function apertureHazardZones(sectorId) {
  if (sectorId !== APERTURE_SECTOR_ID) return [];
  return [Object.freeze({
    id: APERTURE_ID,
    type: 'debris_current',
    center: APERTURE_LOCAL_POS,
    radius: 90,
    intensity: 0.6,
  })];
}

// The hangar mouth is the moving receiver. Numbers are the acceptance window, the
// unit capacity, and the two draws that share one power budget. Hulls are not spawned here.
export const APERTURE_RECEIVER = Object.freeze({
  maxRelativeSpeed: 22,
  capacity: 8,
  damagedHalfWidthScale: 0.55,
  classes: Object.freeze(['ore', 'scrap']),
  intakeClass: 'ore',
  obstructClass: 'scrap',
  powerBudget: 10,
  refineDemand: 7,
  sortDemand: 6,
  repairCommodityId: 'cmdty_scrap_metal',
  repairQty: 4,
  repairSourceId: 'station_ceres',
  bypassScale: 0.4,
});

// H1f / C12 — The Metronome (Eris Margin): an authored area-denial emitter on an
// unyielding 8.00 s sweep (depth-program BUILD_PLAN: "beam plane, sim-clocked 8s
// period, radiation damage through the hazard system, timing-crossing" — "a pulsar
// you cross on the beat"). The beam is a rotating denial cone: mass in the wedge is
// carried mouth-first out of the sweep while it burns. Deterministic off simTime —
// no RNG, no visit-local state, same law as every machine in this file. The POI is a
// charted:false scan landmark today; this table is the first thing that plays it.
export const METRONOME_SECTOR_ID = 'sector_eris_margin';
export const METRONOME_POI_ID = 'poi_eris_metronome';
export const METRONOME_LOCAL_POS = Object.freeze({ x: -60, z: 1700 }); // north.js anchor
export const METRONOME_GLOBAL_POS = Object.freeze(
  sectorLocalToGlobalForSector(METRONOME_LOCAL_POS, METRONOME_SECTOR_ID),
);
export const METRONOME_PERIOD_S = 8;
// ~0.3-0.5 s in the wedge is a real burn, not a gib — the beat is the game, not the wall.
export const METRONOME_BEAM_DPS = 60;
export const METRONOME_FIELD = Object.freeze({
  id: 'environment_eris_metronome_beam',
  kind: 'cone',
  center: METRONOME_GLOBAL_POS,
  dir: freezeVec(1, 0),
  radius: 560,
  strength: 380,
  falloff: 1.08,
  halfAngleRad: 0.10,
  edgeSoftRad: 0.06,
  sourceId: METRONOME_POI_ID,
  team: null,
});

const METRONOME_OMEGA = (Math.PI * 2) / METRONOME_PERIOD_S;
const _metronomeDirScratch = { x: 1, z: 0 };

// Beam bearing at simTime: one full counterclockwise revolution per period. Pure —
// the same saved clock drives field dir, predicate, and ETA, so all three agree.
export function metronomeBeamDir(simTime, out = null) {
  const result = out || {};
  const theta = Math.PI * 2 * positiveModulo(finite(simTime), METRONOME_PERIOD_S) / METRONOME_PERIOD_S;
  result.x = Math.cos(theta);
  result.z = Math.sin(theta);
  return result;
}

// Cone predicate vs. the beam's bearing at simTime — same shape as
// pointInsideMachineField's cone branch, keyed to the live sweep.
export function pointInsideMetronomeBeam(point, simTime) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
  const field = METRONOME_FIELD;
  const dx = point.x - field.center.x;
  const dz = point.z - field.center.z;
  const distance = Math.hypot(dx, dz);
  if (distance >= field.radius) return false;
  if (distance < 1e-6) return true;
  const dir = metronomeBeamDir(simTime, _metronomeDirScratch);
  const forward = (dx * dir.x + dz * dir.z) / distance;
  if (forward <= 0) return false;
  const angle = Math.acos(Math.max(-1, Math.min(1, forward)));
  return angle < field.halfAngleRad + field.edgeSoftRad;
}

// Seconds until the beam's leading edge next reaches the point's bearing; 0 while
// the point is already inside the wedge. The "cross on the beat" number.
export function metronomeBeamEtaAt(point, simTime) {
  if (pointInsideMetronomeBeam(point, simTime)) return 0;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return 0;
  const dx = point.x - METRONOME_FIELD.center.x;
  const dz = point.z - METRONOME_FIELD.center.z;
  const bearing = Math.atan2(dz, dx);
  const dir = metronomeBeamDir(simTime, _metronomeDirScratch);
  const beamAngle = Math.atan2(dir.z, dir.x);
  let gap = bearing - beamAngle - METRONOME_FIELD.halfAngleRad;
  while (gap <= 0) gap += Math.PI * 2;
  return gap / METRONOME_OMEGA;
}

export function metronomeHazardZone() {
  return Object.freeze({
    id: 'eris_metronome_beam',
    type: 'debris_current',
    center: METRONOME_LOCAL_POS,
    radius: METRONOME_FIELD.radius + 60,
    intensity: 0.6,
  });
}

// H1f / C12 companion — the Ashfall Roaming Burn. sectors.js charts hazard_ashfall_burn as
// `moving: true` and the ISC Lighthouse (D3) builds its whole approach on a "moving radiation
// window", but the burn itself never moved: the flag was stamped onto the live hazard row and
// the center stayed static, while the Lighthouse survey gate ran on a clock with no physical
// cause. This table IS the burn, in the same law language as every machine above: pure off
// saved simTime, no RNG draw at tick time, no visit-local state.
//
// ONE clock heart. The flare's vent/roar beat is phase-locked to the Lighthouse survey gate
// (uniqueWreckComplications.movingRadiationGate) by mirroring that gate's deterministic phase
// derivation exactly — same hash32 inputs, same mulberry32 draw — and by authoring the same
// period/window into the wreck's hazardContext (src/data/uniqueWrecks.js). The focused test
// pins gate.allowed === burn.venting across seeds and sim time, so the survey window and the
// sky can never drift apart silently.
export const ASHFALL_BURN_SECTOR_ID = 'sector_ashfall_reach';
export const ASHFALL_BURN_HAZARD_ID = 'hazard_ashfall_burn';
// The charted 2000 WU radius on the sector hazard row is this storm's ROAM ENVELOPE, not the
// burn itself: the live burn is an 840 WU core that circles the envelope on the law below, so
// the burn arrives, bites, and leaves instead of being a stationary pond.
export const ASHFALL_BURN_ENVELOPE_RADIUS = 2000;
export const ASHFALL_BURN_CORE_RADIUS = 840;
export const ASHFALL_BURN_ORBIT_RADIUS = 950;
export const ASHFALL_BURN_ROAM_PERIOD_S = 36;
// The vent/roar beat: the survey gate reads the vent as its open window (venting), the roar is
// when the burn bites at full authored intensity and the survey cannot read through it.
export const ASHFALL_BURN_SURGE_PERIOD_S = 18;
export const ASHFALL_BURN_VENT_WINDOW_S = 7;
export const ASHFALL_BURN_EBB_INTENSITY_SCALE = 0.15;

export const ASHFALL_BURN_CENTER_GLOBAL = Object.freeze(
  sectorLocalToGlobalForSector({ x: 0, z: 0 }, ASHFALL_BURN_SECTOR_ID),
);

/** Same seed resolution as the survey gate: authored program seed, else the save seed. */
export function ashfallBurnProgramSeed(state) {
  return (Number(state && state.player && state.player.uniqueWrecks
    && state.player.uniqueWrecks.programSeed) >>> 0)
    || (Number(state && state.meta && state.meta.seed) >>> 0) || 1;
}

/**
 * Mirror of uniqueWreckComplications.deterministicTimer's exact phase draw for the gate
 * (`deterministicTimer(seed, 'wreck_isc_lighthouse', 'moving-radiation:phase',
 * { minS: 0, maxS: SURGE_PERIOD_S, seedSalt: 'wreck_isc_lighthouse' })`). Keep the wreck id,
 * label, and salt strings byte-identical to movingRadiationGate's call.
 */
export function ashfallBurnPhaseOffsetS(programSeed) {
  const seed = hash32(
    (Number(programSeed) >>> 0) || 1,
    'wreck_isc_lighthouse',
    'moving-radiation:phase',
    'wreck_isc_lighthouse',
  ) || 1;
  const rng = mulberry32(seed);
  return Math.round(rng() * ASHFALL_BURN_SURGE_PERIOD_S * 1000) / 1000;
}

const _ashfallCoreScratch = { x: 0, z: 0 };
const _ashfallSurgeScratch = {};

/** The burn core's exact position at simTime: one slow lap of the roam envelope. */
export function ashfallBurnCoreAt(simTime, programSeed, out = null) {
  const result = out || { x: 0, z: 0 };
  const u = Math.PI * 2 * positiveModulo(
    finite(simTime) + ashfallBurnPhaseOffsetS(programSeed),
    ASHFALL_BURN_ROAM_PERIOD_S,
  ) / ASHFALL_BURN_ROAM_PERIOD_S;
  result.x = ASHFALL_BURN_CENTER_GLOBAL.x + Math.cos(u) * ASHFALL_BURN_ORBIT_RADIUS;
  result.z = ASHFALL_BURN_CENTER_GLOBAL.z + Math.sin(u) * ASHFALL_BURN_ORBIT_RADIUS;
  return result;
}

/** Vent/roar state at simTime — `venting` is the survey gate's open window, word for word. */
export function ashfallBurnSurgeAt(simTime, programSeed, out = null) {
  const result = out || {};
  const phaseS = positiveModulo(
    finite(simTime) + ashfallBurnPhaseOffsetS(programSeed),
    ASHFALL_BURN_SURGE_PERIOD_S,
  );
  const venting = phaseS < ASHFALL_BURN_VENT_WINDOW_S;
  result.venting = venting;
  result.intensityScale = venting ? ASHFALL_BURN_EBB_INTENSITY_SCALE : 1;
  result.phaseS = phaseS;
  result.remainingS = venting
    ? ASHFALL_BURN_VENT_WINDOW_S - phaseS
    : ASHFALL_BURN_SURGE_PERIOD_S - phaseS;
  result.periodS = ASHFALL_BURN_SURGE_PERIOD_S;
  return result;
}

/**
 * world.js tick adapter: resolve a live moving-hazard row from the law. Writes the row's
 * center (the roaming core), its live body radius, and the vent/roar intensity scale the
 * radiation tick multiplies in. Returns the row's venting state, or false for unknown ids
 * so static hazards pay one flag check and nothing else.
 */
export function movingHazardTick(row, simTime, programSeed) {
  if (!row || row.moving !== true || row.id !== ASHFALL_BURN_HAZARD_ID) return false;
  ashfallBurnCoreAt(simTime, programSeed, _ashfallCoreScratch);
  row.center.x = _ashfallCoreScratch.x;
  row.center.z = _ashfallCoreScratch.z;
  row.radius = ASHFALL_BURN_CORE_RADIUS;
  const surge = ashfallBurnSurgeAt(simTime, programSeed, _ashfallSurgeScratch);
  row.intensityScale = surge.intensityScale;
  return surge.venting;
}
