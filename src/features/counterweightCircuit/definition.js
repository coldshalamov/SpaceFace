// Counterweight Circuit â€” authored event definitions.
//
// Seven physical skill events at the Counterweight Circuit apron in outer Pallas
// Drift (sector-local 1800,-600). Every success predicate here is a REAL physical
// observation the attempt machine verifies against live bodies â€” attachment,
// angular sweep, plane crossing, seating dwell, containment. No invisible
// triggers, no scripted velocity, no aim assist.
//
// Coordinates are sector-local offsets relative to the venue anchor. course.js
// converts them through the canonical sector-coordinate owner exactly once.

export const FEATURE_ID = 'counterweightCircuit';
export const VENUE_SECTOR_ID = 'sector_pallas_drift';
export const VENUE_LOCAL = Object.freeze({ x: 1800, z: -600 });

export const OFFER_RANGE_WU = 160;
export const DISCOVER_RANGE_WU = 760;
export const VENUE_RANGE_WU = 3000;
export const CANCEL_RANGE_WU = 2800;
export const COMMIT_RADIUS_WU = 260;
export const MAX_DYNAMIC_BODIES = 12;
export const GHOST_MAX_SAMPLES = 4096;
export const GHOST_SAMPLE_HZ = 15;

// Canonical reward: one-time first-completion credit grant per event.
export const REWARD_CR = 60;
export const REWARD_CR_FINALE = 150;

// Payloads the starter line and starter ship can honestly move. 18t practice
// loads and a 9t instrument pod are genuinely permitted bodies â€” no relabeling.
const LOAD_POD = Object.freeze({ asset: 'pod_cargo_container', file: 'pods/pod_cargo_container.glb', mass: 18, radius: 5.2, hull: 80 });
const ORE_LOAD = Object.freeze({ asset: 'place_ore_bulk_container', file: 'places/place_ore_bulk_container.glb', mass: 18, radius: 6.5, hull: 90 });
const INSTRUMENT_POD = Object.freeze({ asset: 'place_cargo_pod_hazmat', file: 'places/place_cargo_pod_hazmat.glb', mass: 9, radius: 6.1, hull: 45 });

// â”€â”€ venue structures (permanent fixture bodies, dynamic:false + invuln) â”€â”€â”€â”€â”€â”€
export const VENUE_STRUCTURES = Object.freeze([
  { role: 'registrar', asset: 'place_sensor_mast', file: 'places/place_sensor_mast.glb', radius: 8, local: { x: 0, z: 0 }, kind: 'registrar', label: 'Circuit Registrar' },
  { role: 'lane_beacon_a', asset: 'place_lane_beacon', file: 'places/place_lane_beacon.glb', radius: 4, local: { x: 160, z: 40 }, kind: 'fixture' },
  { role: 'lane_beacon_b', asset: 'place_lane_beacon', file: 'places/place_lane_beacon.glb', radius: 4, local: { x: 160, z: -40 }, kind: 'fixture' },
  { role: 'rig_derrick', asset: 'place_crusher_module', file: 'places/place_crusher_module.glb', radius: 16, local: { x: 250, z: 80 }, kind: 'fixture', label: 'Demonstration Rig' },
  { role: 'rig_extractor', asset: 'place_extraction_mast', file: 'places/place_extraction_mast.glb', radius: 16, local: { x: 350, z: -80 }, kind: 'fixture', label: 'Demonstration Rig' },
  { role: 'rig_core', asset: 'place_ore_sorter', file: 'places/place_ore_sorter.glb', radius: 15, local: { x: 450, z: 70 }, kind: 'fixture', label: 'Demonstration Rig' },
  { role: 'light_a', asset: 'place_worklight_tower', file: 'places/place_worklight_tower.glb', radius: 5, local: { x: 100, z: 60 }, kind: 'fixture' },
  { role: 'light_b', asset: 'place_worklight_tower', file: 'places/place_worklight_tower.glb', radius: 5, local: { x: 100, z: -60 }, kind: 'fixture' },
  { role: 'return_mast', asset: 'place_sensor_mast', file: 'places/place_sensor_mast.glb', radius: 8, local: { x: 680, z: 0 }, kind: 'returnMast', label: 'Return Mast' },
]);

// â”€â”€ event bodies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// kind:'load'     â€” a real dynamic practice original the player must move
// kind:'static'   â€” a real solid fixture (dynamic:false, invulnerable)
// kind:'mobile'   â€” a real dynamic feature-owned mover on a bounded itinerary
// zone            â€” non-solid success volume attached to a role (drawn, not a collider)
// gate            â€” non-solid crossing plane attached to fixed geometry (drawn)

const CRADLE = 'place_ceres_section_cradle';
const CRADLE_FILE = 'places/place_ceres_section_cradle.glb';
// The released open Ceres U has real side rails, back spine and depth keepers.
// Packaged max-dimension fit: 170 WU -> 64 WU. Mouth faces -X, back faces +X.
// 52.7 WU clear width leaves generous clearance for the full starter load hull.
const RECEIVER = Object.freeze({ asset: CRADLE, file: CRADLE_FILE, radius: 32, rot: -Math.PI/2 });
const RECEIVER_ZONE = Object.freeze({ radius: 34, receiver: true, physicalProfile: 'ceres_open',
  requireMouthEntry: true, requireSupportContact: true, relative: true,
  // A real native support receipt may bridge a tiny solver settling gap during
  // the dwell, only while the full original stays slow and beside that support.
  supportGapWu: .15, supportWitnessS: 1.5, settleSpeedWu: .5, maxSpinRad: .25 });

export const COUNTERWEIGHT_EVENTS = Object.freeze([
  {
    id: 'soft_berth', index: 0, title: 'SOFT BERTH',
    briefing: { question: 'Can you bring the load to rest in the cradle?',
      rule: 'Line the load; enter through the open mouth and settle the whole load on its support at no more than 4 u/s relative to the cradle.' },
    tagline: 'Tow the practice load into the receiving cradle — arrive gentle.',
    skill: 'Braking and relative speed',
    nextSkill: 'Line work under swing — THE LONG ARM',
    bodies: [
      { role: 'load', kind: 'load', ...LOAD_POD, local: { x: 210, z: 0 } },
      { role: 'cradle', kind: 'static', ...RECEIVER, local: { x: 520, z: 0 },
        zone: { ...RECEIVER_ZONE, label: 'Receiving cradle' } },
    ],
    legs: [
      { kind: 'attach', role: 'load', hint: 'Line the practice load' },
      { kind: 'seat', role: 'load', zone: 'cradle', maxSpeed: 4, dwellS: 1.2, hint: 'Seat the load in the cradle at ≤ 4 u/s' },
    ],
    constraints: [{ kind: 'survive', role: 'load' }],
    medals: { gold: 40, silver: 60, bronze: 90 },
    rewardCr: REWARD_CR,
    gate: null,
  },
  {
    id: 'long_arm', index: 1, title: 'THE LONG ARM',
    briefing: { question: 'Can you swing the load and release it through the gate?',
      rule: 'Keep the line taut through a 1.75-radian swing around the counterweight, then release the load through the gate within 6s.' },
    tagline: 'Swing the load around the counterweight and release it through the gate.',
    skill: 'Throw angle and release timing',
    nextSkill: 'Stand-off containment — CLEAN SLING',
    bodies: [
      { role: 'load', kind: 'load', ...LOAD_POD, local: { x: 300, z: 0 } },
      { role: 'counterweight', kind: 'static', asset: 'place_rock_metallic_ore_boulder', file: 'places/place_rock_metallic_ore_boulder.glb', radius: 20, local: { x: 420, z: 0 }, label: 'Counterweight' },
    ],
    gate: { pos: { x: 620, z: 0 }, axis: { x: 0, z: 1 }, halfWidth: 30, label: 'Release gate' },
    legs: [
      { kind: 'attach', role: 'load', hint: 'Line the practice load' },
      { kind: 'swing', role: 'load', around: 'counterweight', minSweepRad: 1.75, hint: 'Swing the load around the counterweight' },
      { kind: 'release', role: 'load', hint: 'Release on the gate line' },
      { kind: 'transit', role: 'load', gate: 'gate', windowS: 6, hint: 'Send the load through the gate', onMiss: { retry: 0 } },
    ],
    constraints: [{ kind: 'survive', role: 'load' }],
    medals: { gold: 80, silver: 110, bronze: 150 },
    rewardCr: REWARD_CR,
  },
  {
    id: 'clean_sling', index: 2, title: 'CLEAN SLING',
    briefing: { question: 'Can you land the load while your ship stays outside?',
      rule: 'Line and release the load into the basin through its mouth; settle it on support at no more than 3 u/s relative to the basin. Keep your ship outside the ring.' },
    tagline: 'Redirect the load into the catch basin. Your ship stays outside the basin.',
    skill: 'Stand-off redirect and patient braking',
    nextSkill: 'Gentle hands — FRAGILE FREIGHT',
    bodies: [
      { role: 'load', kind: 'load', ...LOAD_POD, local: { x: 300, z: 60 } },
      { role: 'basin', kind: 'static', ...RECEIVER, radius: 42, local: { x: 560, z: -120 },
        zone: { ...RECEIVER_ZONE, radius: 44, label: 'Catch basin',
          approaches: [{ x: -65, z: -16 }, { x: -65, z: 16 }] } },
    ],
    exclusion: { role: 'basin', radius: 95, label: 'Basin exclusion ring' },
    legs: [
      { kind: 'attach', role: 'load', hint: 'Line the practice load' },
      { kind: 'release', role: 'load', hint: 'Sling the load toward the basin' },
      { kind: 'contain', role: 'load', zone: 'basin', maxSpeed: 3, dwellS: 1.5, hint: 'Contain the load in the basin', onMiss: { retry: 0 } },
    ],
    constraints: [
      { kind: 'survive', role: 'load' },
      { kind: 'playerOutside', role: 'basin', radius: 95, reason: 'entered_basin', label: 'Stay outside the basin ring' },
    ],
    medals: { gold: 90, silver: 130, bronze: 180 },
    rewardCr: REWARD_CR,
  },
  {
    id: 'fragile_freight', index: 3, title: 'FRAGILE FREIGHT',
    briefing: { question: 'Can you thread the pod through intact?',
      rule: 'Keep the pod on the line through the marked baffles, then enter the receiver mouth and settle it on support at no more than 4 u/s relative to the receiver.',
      condition: 'Gold needs at least 95% pod condition; silver needs at least 75%.' },
    tagline: 'Thread a real instrument pod through the baffles. It keeps its scars.',
    skill: 'Precision handling and condition keeping',
    nextSkill: 'Two-load parking — SPLIT DECISION',
    bodies: [
      { role: 'pod', kind: 'load', ...INSTRUMENT_POD, local: { x: 200, z: -60 }, fragile: true },
      { role: 'baffle_a', kind: 'static', asset: 'place_maintenance_gantry', file: 'places/place_maintenance_gantry.glb', radius: 18, local: { x: 360, z: -20 } },
      { role: 'baffle_b', kind: 'static', asset: 'place_maintenance_gantry', file: 'places/place_maintenance_gantry.glb', radius: 18, local: { x: 470, z: -130 } },
      { role: 'baffle_c', kind: 'static', asset: 'place_maintenance_gantry', file: 'places/place_maintenance_gantry.glb', radius: 18, local: { x: 580, z: -40 } },
      { role: 'receiver', kind: 'static', ...RECEIVER, local: { x: 690, z: -100 },
        zone: { ...RECEIVER_ZONE, label: 'Instrument receiver' } },
    ],
    legs: [
      { kind: 'attach', role: 'pod', hint: 'Line the instrument pod' },
      { kind: 'transit', role: 'pod', gate: 'baffle_a', attached: true, hint: 'Pass below the first baffle' },
      { kind: 'transit', role: 'pod', gate: 'baffle_b', attached: true, hint: 'Pass above the second baffle' },
      { kind: 'transit', role: 'pod', gate: 'baffle_c', attached: true, hint: 'Pass below the final baffle' },
      { kind: 'seat', role: 'pod', zone: 'receiver', maxSpeed: 4, dwellS: 1.2, hint: 'Deliver the pod to the receiver at ≤ 4 u/s' },
    ],
    constraints: [{ kind: 'survive', role: 'pod' }],
    // Tangents run Z; each plane is downlane X, beside the actual solid gantry.
    gates: {
      baffle_a: { pos: { x: 360, z: -72 }, axis: { x: 0, z: 1 }, halfWidth: 25, label: 'Below baffle A' },
      baffle_b: { pos: { x: 470, z: -78 }, axis: { x: 0, z: 1 }, halfWidth: 25, label: 'Above baffle B' },
      baffle_c: { pos: { x: 580, z: -92 }, axis: { x: 0, z: 1 }, halfWidth: 25, label: 'Below baffle C' },
    },
    conditionCaps: { gold: 0.95, silver: 0.75 },
    medals: { gold: 105, silver: 150, bronze: 210 },
    rewardCr: REWARD_CR,
  },
  {
    id: 'split_decision', index: 4, title: 'SPLIT DECISION',
    briefing: { question: 'Can you park both loads on their own shelves?',
      rule: 'Line each load, enter its shelf mouth and settle both on their supports at no more than 4 u/s relative to their shelves.',
      condition: 'Gold needs at least 95% condition on each load; silver needs at least 80%.' },
    tagline: 'Two different loads, two marked shelves. One line, one at a time.',
    skill: 'Parking, staging and load switching',
    nextSkill: 'A moving receiver — MOVING BERTH',
    bodies: [
      { role: 'load_a', kind: 'load', ...LOAD_POD, local: { x: 250, z: 40 } },
      { role: 'load_b', kind: 'load', ...ORE_LOAD, local: { x: 250, z: -40 } },
      { role: 'shelf_a', kind: 'static', ...RECEIVER, local: { x: 560, z: 60 },
        zone: { ...RECEIVER_ZONE, label: 'Shelf A' } },
      { role: 'shelf_b', kind: 'static', ...RECEIVER, local: { x: 560, z: -60 },
        zone: { ...RECEIVER_ZONE, label: 'Shelf B' } },
    ],
    legs: [
      { kind: 'parkAll', pairs: [['load_a', 'shelf_a'], ['load_b', 'shelf_b']], maxSpeed: 4, dwellS: 1.2, requireAttach: true, hint: 'Park each load on its own shelf' },
    ],
    constraints: [
      { kind: 'survive', role: 'load_a' },
      { kind: 'survive', role: 'load_b' },
      { kind: 'trackAttach', roles: ['load_a', 'load_b'] },
    ],
    medals: { gold: 95, silver: 140, bronze: 200 },
    rewardCr: REWARD_CR,
  },
  {
    id: 'moving_berth', index: 5, title: 'MOVING BERTH',
    briefing: { question: 'Can you berth a load on a moving receiver?',
      rule: 'Line the load, match the barge, enter its open mouth and settle the whole load on support at no more than 4 u/s relative to the barge.' },
    tagline: 'The receiver does not hold still. Match the barge, then seat the load.',
    skill: 'Relative-speed matching on a live itinerary',
    nextSkill: 'The full circuit — COUNTERWEIGHT FINALE',
    requires: ['soft_berth'],
    bodies: [
      { role: 'load', kind: 'load', ...LOAD_POD, local: { x: 260, z: 0 } },
      { role: 'barge', kind: 'mobile', ...RECEIVER, mass: 90, radius: 38, hull: 400, label: 'Mobile receiving barge',
        local: { x: 450, z: 60 },
        itinerary: { waypoints: [{ x: 450, z: 60 }, { x: 620, z: 60 }, { x: 620, z: -60 }, { x: 450, z: -60 }], speedWu: 6, accelerationWu: 3, brakingWu: 2, dwellS: 3 },
        zone: { ...RECEIVER_ZONE, radius: 40, label: 'Moving receiving bay' } },
    ],
    legs: [
      { kind: 'attach', role: 'load', hint: 'Line the practice load' },
      { kind: 'seat', role: 'load', zone: 'barge', maxSpeed: 4, dwellS: 1.5, relative: true, hint: 'Seat the load on the moving deck — relative ≤ 4 u/s' },
    ],
    constraints: [{ kind: 'survive', role: 'load' }],
    medals: { gold: 85, silver: 120, bronze: 180 },
    rewardCr: REWARD_CR,
  },
  {
    id: 'counterweight_finale', index: 6, title: 'COUNTERWEIGHT FINALE',
    briefing: { question: 'Can you swing, recover and berth the same load?',
      rule: 'Swing at least 1.75 radians on a taut line, release through the gate within 6s, reacquire within 14s, then settle through the cradle mouth onto support at no more than 4 u/s relative to the cradle.' },
    tagline: 'Attach, swing, release through the gate, reacquire — then berth it soft.',
    skill: 'The whole circuit in one run',
    nextSkill: 'Personal bests and a clean ghost',
    requires: ['soft_berth', 'long_arm', 'clean_sling', 'fragile_freight', 'split_decision'],
    bodies: [
      { role: 'load', kind: 'load', ...LOAD_POD, local: { x: 270, z: -20 } },
      { role: 'counterweight', kind: 'static', asset: 'place_rock_metallic_ore_boulder', file: 'places/place_rock_metallic_ore_boulder.glb', radius: 20, local: { x: 400, z: -20 }, label: 'Counterweight' },
      { role: 'cradle', kind: 'static', ...RECEIVER, local: { x: 760, z: -20 },
        zone: { ...RECEIVER_ZONE, label: 'Final cradle' } },
    ],
    gate: { pos: { x: 570, z: -20 }, axis: { x: 0, z: 1 }, halfWidth: 30, label: 'Release gate' },
    bounds: { pos: { x: 520, z: -20 }, radius: 480, label: 'Circuit field' },
    legs: [
      { kind: 'attach', role: 'load', hint: 'Line the load' },
      { kind: 'swing', role: 'load', around: 'counterweight', minSweepRad: 1.75, hint: 'Swing it around the counterweight' },
      { kind: 'release', role: 'load', hint: 'Release on the gate line' },
      { kind: 'transit', role: 'load', gate: 'gate', windowS: 6, hint: 'Through the gate', onMiss: { retry: 0 } },
      { kind: 'reacquire', role: 'load', windowS: 14, hint: 'Reacquire the load before it leaves', onMiss: { retry: 0, failIfLost: true } },
      { kind: 'seat', role: 'load', zone: 'cradle', maxSpeed: 4, dwellS: 1.2, hint: 'Berth it in the final cradle at ≤ 4 u/s' },
    ],
    constraints: [
      { kind: 'survive', role: 'load' },
      { kind: 'insideBounds', role: 'load', bounds: 'bounds', graceS: 6, reason: 'lost' },
    ],
    medals: { gold: 120, silver: 170, bronze: 240 },
    rewardCr: REWARD_CR_FINALE,
  },
]);

export const COUNTERWEIGHT_EVENT_BY_ID = Object.freeze(
  Object.fromEntries(COUNTERWEIGHT_EVENTS.map((event) => [event.id, event])),
);

// Ordered progression: every event previewable from entry; the finale unlocks
// once each of the first five is complete; event 6 opens after Soft Berth.
export function eventUnlocked(def, records) {
  if (!def || !def.requires || !def.requires.length) return true;
  for (const required of def.requires) {
    const record = records && records[required];
    if (!record || !(record.completions > 0)) return false;
  }
  return true;
}

// Count the REAL dynamic bodies an event cohort adds â€” fixtures are static and
// stay outside the â‰¤12 budget; loads and movers are the dynamics.
export function dynamicBodyCount(def) {
  return def.bodies.filter((body) => body.kind === 'load' || body.kind === 'mobile').length;
}

export function eventDefinitionById(id) {
  return COUNTERWEIGHT_EVENT_BY_ID[id] || null;
}
