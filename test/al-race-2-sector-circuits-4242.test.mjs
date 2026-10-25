// Row 395 AL-RACE-2 — "Every way of life is a course" (seed 4242). Six sector-signature
// circuits expand the authored catalog to nine: each lap expresses its sector's own
// machinery cycle, timed weather or standing rock — native physics projected as cues,
// never duplicated. Covers catalog compatibility, RF-02 validation, hazard projection,
// physical solo completion, launch/lifecycle, career persistence and headless UI.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import { missions } from '../src/systems/missions.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { DEFAULT_STARTER_ID } from '../src/data/newGameDefaults.js';
import { createRacingDriver, racingDriverIntent } from '../src/ai/racingDriver.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import {
  RACE_LEVELS, SECTOR_RACE_LEVELS, RACING_CIRCUITS, RACE_CONTRACTS,
  storyContracts, circuitContracts, practiceContractForLevel, raceContractById,
  raceLevelById, raceLevelForSector, courseForLevel, racingOfferFor, racingSeedFor,
  raceGateGlobals, startLineFor,
} from '../src/data/raceLevels.js';
import { validateRacingCircuit } from '../src/data/raceCourses.js';
import { RACING_CIRCUIT_LAYOUTS } from '../src/data/racingCircuitLayouts.js';
import { racingSetPieceDefinitions } from '../src/data/racingSetPieces.js';
import { projectRacingSectorHazards } from '../src/missions/racingSectorHazards.js';
import { createRacingSetPieces } from '../src/missions/racingSetPieces.js';
import {
  configureRacingCorridorSession, isRacingCorridorSession,
  racingCorridorPlan, clearsRacingCorridor,
} from '../src/world/racingCorridor.js';
import {
  PALLAS_REEF_MINES, PALLAS_REEF_GLOBAL_POS, PALLAS_REEF_FIELD, pallasReefPhase,
  pallasReefMineId, pallasReefMinePos,
  CINDER_SLUICE_SITE_ID, CINDER_SLUICE_OPERATIONS, cinderSluicePhase,
  ALL_KILL_MACHINE_BY_ID, killMachinePhase, killMachinesForSector,
  weatherVolumesForSector, weatherPhase,
} from '../src/data/environmentalMachinery.js';
import { SECTORS } from '../src/data/sectors.js';
import { sectorLocalToGlobalForSector, globalToSectorLocalForSector } from '../src/data/sectorCoordinates.js';
import { segmentDistanceSquared } from '../src/world/arranger.js';
import { asteroidColliderRadius } from '../src/data/asteroidColliders.js';
import { stageRacingLaunch, armRacingContract, takeRacingLaunch } from '../src/ui/racingLaunch.js';
import {
  CUP_HEATS, readRacingCareer, awardCourseMedal, recordRaceMeeting, stageRacingMeeting,
} from '../src/systems/racingCareer.js';
import { fakeDom, findAll, findButtons, textLines } from './helpers/fake-dom.mjs';
import { raceBoardScreen } from '../src/ui/screens/raceBoard.js';

const DT = 1 / 60;
const SEED = 4242;
const SECTOR_IDS = SECTOR_RACE_LEVELS.map((level) => level.sectorId);
const SECTOR_BY_ID = new Map(SECTORS.map((row) => [row.id, row]));

function memoryStorage() {
  const rows = new Map();
  return {
    rows,
    getItem(k) { return rows.has(k) ? rows.get(k) : null; },
    setItem(k, v) { rows.set(k, String(v)); },
    removeItem(k) { rows.delete(k); },
  };
}

/** Production-order host: core + world + missions + flight + tactical + machinery + physics. */
async function sectorFixture(sectorId, { seed = SEED, machinery = false } = {}) {
  const state = createGameState(seed), bus = createBus(), helpers = {};
  state.mode = 'flight';
  const ctx = { state, bus, helpers, registry: { get: () => null } };
  Object.create(core).init(ctx);
  const world = Object.create(worldSystem); world.init(ctx);
  configureRacingCorridorSession(state, true);
  const spec = makeShipEntitySpec(DEFAULT_STARTER_ID, {
    isPlayer: true, player: state.player, pos: { x: 0, z: 0 }, rot: 0, team: 0,
  });
  const player = helpers.spawnEntity(spec);
  state.playerId = player.id;
  world.enterSector(sectorId);
  const flight = Object.create(flightV3); flight.init(ctx);
  const ports = Object.create(aiPorts); ports.init(ctx);
  const tactical = createTacticalAISystem(); tactical.init(ctx);
  const machine = machinery ? Object.create(environmentalMachinery) : null;
  if (machine) machine.init(ctx);
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  const dispose = () => { try { owner.dispose(); } catch {} try { tactical.destroy(); } catch {} };
  return { state, bus, helpers, ctx, world, player, flight, ports, tactical, machine, owner, dispose };
}

/** The RF-02 call the launch owner makes: fitted hull profile + authored sector solids. */
function launchVerdict(level, player) {
  const sector = SECTOR_BY_ID.get(level.sectorId);
  const solids = [];
  for (const st of sector.stations || []) {
    if (!st?.pos || !Number.isFinite(st.pos.x)) continue;
    solids.push({ id: st.id || 'station', x: st.pos.x, z: st.pos.z,
      radius: (st.size === 'L' ? 42 : st.size === 'S' ? 26 : 34) + 40 });
  }
  for (const poi of sector.pois || []) {
    if (!poi?.pos || !Number.isFinite(poi.pos.x)) continue;
    solids.push({ id: poi.id || 'poi', x: poi.pos.x, z: poi.pos.z,
      radius: Math.max(24, Number(poi.placeTargetRadius) || Number(poi.visualRadius) || 0) });
  }
  for (const machine of killMachinesForSector(sector.id) || []) {
    if (!machine?.globalPos || !machine?.mouth) continue;
    const local = globalToSectorLocalForSector(machine.globalPos, sector.id, { x: 0, z: 0 });
    solids.push({ id: machine.id, x: local.x, z: local.z, radius: Number(machine.mouth.radius) || 18 });
  }
  return validateRacingCircuit(level.course, {
    hullRadiusWU: Number(player?.physicsBody?.radius ?? player?.radius) || 32,
    profile: resolvePropulsionProfile(player, null),
    referenceSpeedsWU: { turn: 60, straight: 120 },
    solids,
  });
}

const baseCourse = () => ({
  courseId: 'fixture', kind: 'circuit', gateRadiusWU: 90,
  gates: [
    { x: 0, z: 0 }, { x: 800, z: 0 }, { x: 1200, z: 600 }, { x: 600, z: 1100 },
    { x: -300, z: 800 }, { x: -500, z: 300 }, { x: -250, z: 40 }, { x: 0, z: 0 },
  ],
});
const OPTS = { hullRadiusWU: 32, profile: {}, referenceSpeedsWU: { turn: 60, straight: 120 } };
const codes = (v) => v.errors.map((e) => e.code);

// ── 1. Catalog and compatibility ─────────────────────────────────────────────
test('nine unique circuits across the six required sectors; legacy catalog frozen', () => {
  assert.equal(RACE_LEVELS.length, 3, 'the original three export stays frozen');
  assert.equal(SECTOR_RACE_LEVELS.length, 6);
  assert.equal(RACING_CIRCUITS.length, 9);
  assert.equal(new Set(RACING_CIRCUITS.map((l) => l.id)).size, 9, 'unique level ids');
  assert.equal(new Set(RACING_CIRCUITS.map((l) => l.course.courseId)).size, 9, 'unique course ids');
  assert.deepEqual([...SECTOR_IDS].sort(), [
    'sector_ceres_belt', 'sector_haumea_rift', 'sector_kepler_scar',
    'sector_pallas_drift', 'sector_sker_haven', 'sector_vesta_forge',
  ]);
  for (const level of RACING_CIRCUITS) assert.equal(raceLevelForSector(level.sectorId), level);
  // The story roster gained a sixth contract upstream (contract_textile_rematch) after
  // this plan was written; the invariant that survives is originals + exactly three new.
  const stories = storyContracts();
  const sector = circuitContracts().filter((row) => SECTOR_RACE_LEVELS.some((l) => l.id === row.levelId));
  assert.equal(circuitContracts().length, stories.length + 3);
  assert.equal(sector.length, 3);
  assert.deepEqual(circuitContracts().filter((row) => !stories.includes(row)).map((r) => r.id).sort(),
    ['contract_pallas_reef', 'contract_sker_wreckrun', 'contract_vesta_furnace']);
  const rewards = { contract_pallas_reef: 1100, contract_vesta_furnace: 1200, contract_sker_wreckrun: 1400 };
  for (const row of sector) {
    assert.equal(row.reward_cr, rewards[row.id]);
    assert.equal(row.laps, 1); assert.equal(row.duration_s, 900);
    assert.equal(row.steerLock, 'racing'); assert.equal(row.racingKind, 'pace');
    assert.equal(row.practice, false);
  }
  assert.equal(CUP_HEATS.length, 3, 'the cup roster stays the original three');
  assert.deepEqual(CUP_HEATS.map((h) => h.levelId), RACE_LEVELS.map((l) => l.id));
  // Every practice/contract row resolves to a real course and station.
  for (const contract of RACE_CONTRACTS) {
    const level = raceLevelById(contract.levelId);
    assert.ok(level && level.course, contract.id);
    assert.ok(SECTOR_BY_ID.get(level.sectorId)?.stations?.some((s) => s.id === level.stationId), level.stationId);
    const offer = racingOfferFor(contract.id);
    assert.ok(offer && offer.params.gates.length >= 4, contract.id);
    assert.equal(offer.stationId, level.stationId);
    assert.equal(offer.destSectorId, level.sectorId);
  }
  assert.equal(RACING_CIRCUITS.filter((l) => practiceContractForLevel(l.id)).length, 9);
});

test('six new courses: distinct geometry, Time-trial-only, revision 1, 90 wu aperture', () => {
  const signatures = new Set();
  for (const level of SECTOR_RACE_LEVELS) {
    const course = level.course;
    assert.equal(level.temporaryOnly, true, level.id);
    assert.deepEqual([...level.raceModes], ['time-trial']);
    assert.equal(course.courseRevision, 1, level.id);
    assert.equal(course.gateRadiusWU, 90);
    assert.equal(course.kind, 'circuit');
    const first = course.gates[0], last = course.gates[course.gates.length - 1];
    assert.ok(Math.hypot(first.x - last.x, first.z - last.z) <= 1, `${level.id} closes on the start plane`);
    assert.ok(course.courseLengthWU > 3000);
    signatures.add(course.gates.map((g) => `${g.x}|${g.z}`).join(';'));
    const offer = racingOfferFor(`practice_${level.id}`);
    assert.equal(offer.params.temporaryOnly, true);
    assert.deepEqual(offer.params.raceModes, ['time-trial']);
    const layout = RACING_CIRCUIT_LAYOUTS[level.sectorId];
    assert.ok(layout && layout.hullRadiusWU === 32 && layout.fields, level.sectorId);
    const sectorFieldIds = new Set((SECTOR_BY_ID.get(level.sectorId).fields || []).map((f) => f.id));
    for (const fieldId of Object.keys(layout.fields)) {
      assert.ok(sectorFieldIds.has(fieldId), `${level.sectorId}:${fieldId} is a native field id`);
      for (const leg of layout.fields[fieldId]) assert.ok(leg >= 0 && leg < course.gates.length - 1, 'leg in range');
    }
    const defs = racingSetPieceDefinitions(course.courseId);
    assert.equal(defs.anchors.length, 2, `${course.courseId} carries two named anchors`);
    for (const a of defs.anchors) {
      assert.ok(a.id && a.name && a.rivalLine, 'named anchor with a rival line');
      assert.ok(a.gateIndex >= 1 && a.gateIndex <= course.gates.length - 3, 'anchor off the seam');
    }
    assert.deepEqual(Object.keys(defs.rivalAnchors).sort(), ['mira', 'rook', 'sable']);
    for (const order of Object.values(defs.rivalAnchors)) {
      assert.equal(order.length, 2, 'each rival orders both anchors');
    }
    assert.ok(Array.isArray(level.sectorHazards) && level.sectorHazards.length >= 1, 'hazard descriptors');
  }
  assert.equal(signatures.size, 6, 'six physically distinct routes');
});

// ── 2. RF-02 ──────────────────────────────────────────────────────────────────
test('RF-02 accepts all six new courses under the fitted starter profile', async () => {
  const f = await sectorFixture(SECTOR_IDS[0]);
  try {
    for (const level of SECTOR_RACE_LEVELS) {
      const verdict = launchVerdict(level, f.player);
      assert.equal(verdict.ok, true, `${level.id}: ${JSON.stringify(verdict.errors)}`);
    }
  } finally { f.dispose(); }
});

test('RF-02 rejects authoring defects with exact diagnostic codes', () => {
  const nan = baseCourse(); nan.gates[3] = { x: NaN, z: 4 };
  assert.ok(codes(validateRacingCircuit(nan, OPTS)).includes('non_finite_gate'));
  const zero = baseCourse(); zero.gates[2] = { ...zero.gates[1] };
  assert.ok(codes(validateRacingCircuit(zero, OPTS)).includes('degenerate_segment'));
  const open = baseCourse(); open.gates[open.gates.length - 1] = { x: 900, z: 900 };
  assert.ok(codes(validateRacingCircuit(open, OPTS)).includes('missing_closure'));
  const dup = baseCourse(); dup.gates[4] = { ...dup.gates[0] };
  assert.ok(codes(validateRacingCircuit(dup, OPTS)).includes('duplicate_seam'));
  const skew = baseCourse();
  skew.gates[skew.gates.length - 2] = { x: skew.gates[0].x - 60, z: skew.gates[0].z + 200 };
  assert.ok(codes(validateRacingCircuit(skew, OPTS)).includes('misaligned_seam'));
  assert.ok(codes(validateRacingCircuit(baseCourse(), { ...OPTS, hullRadiusWU: 95 }))
    .includes('invalid_gate_radius'));
  const reversal = baseCourse();
  // ~166° fold on a 14 WU in-leg — a U-turn with no room to kill approach speed.
  reversal.gates[1] = { x: 14, z: 0 };
  reversal.gates[2] = { x: -400, z: 100 };
  const rev = validateRacingCircuit(reversal, OPTS);
  assert.ok(codes(rev).includes('infeasible_reversal'), JSON.stringify(rev.errors));
  const hairpin = baseCourse();
  // ~120° turn on a 10 WU in-leg — real corner, no braking room.
  hairpin.gates[1] = { x: 10, z: 0 };
  hairpin.gates[2] = { x: -290, z: 520 };
  const tight = validateRacingCircuit(hairpin, OPTS);
  assert.ok(codes(tight).includes('insufficient_braking'), JSON.stringify(tight.errors));
  const blocked = validateRacingCircuit(baseCourse(), {
    ...OPTS, solids: [{ id: 'rock', x: 800, z: 0, radius: 70 }],
  });
  assert.ok(blocked.errors.some((e) => e.code === 'blocked_gate' && e.bodyId === 'rock'));
  const grid = baseCourse();
  const u = { x: (grid.gates[1].x - grid.gates[0].x) / 800, z: 0 };
  const gridBlock = validateRacingCircuit(grid, {
    ...OPTS, solids: [{ id: 'gridrock', x: grid.gates[0].x - u.x * 120, z: grid.gates[0].z, radius: 30 }],
  });
  assert.ok(gridBlock.errors.some((e) => e.code === 'blocked_grid' && e.bodyId === 'gridrock'));
  const branch = validateRacingCircuit(baseCourse(), { ...OPTS, branchGraph: [{ from: 1, to: 1 }] });
  assert.ok(codes(branch).includes('invalid_branch'));
  // A rejoin before the entry is not a branch — the declared "entry before rejoin"
  // contract rejects {from:4,to:2} and the 2->4,4->2 cycle with it.
  assert.ok(codes(validateRacingCircuit(baseCourse(),
    { ...OPTS, branchGraph: [{ from: 4, to: 2 }] })).includes('invalid_branch'));
  assert.ok(codes(validateRacingCircuit(baseCourse(),
    { ...OPTS, branchGraph: [{ from: 2, to: 4 }, { from: 4, to: 2 }] })).includes('invalid_branch'));
  // Four rocks ring gate 1 so no point inside its aperture fits the hull — each
  // one alone clears the single-solid strip check, but the union still blocks.
  const wall = validateRacingCircuit(baseCourse(), {
    ...OPTS, solids: [45, 135, 225, 315].map((deg, i) => ({
      id: `w${i}`, x: 800 + Math.cos((deg * Math.PI) / 180) * 95,
      z: Math.sin((deg * Math.PI) / 180) * 95, radius: 60,
    })),
  });
  assert.ok(wall.errors.some((e) => e.code === 'blocked_gate' && e.gateIndex === 1),
    `pincered gate: ${JSON.stringify(wall.errors)}`);
  // The union check must not swallow a gate that still threads around two rocks.
  const threads = validateRacingCircuit(baseCourse(), {
    ...OPTS, solids: [
      { id: 'n1', x: 800, z: 130, radius: 60 },
      { id: 'n2', x: 800, z: -140, radius: 50 },
    ],
  });
  assert.ok(!codes(threads).includes('blocked_gate'),
    `threadable pair must not block: ${JSON.stringify(threads.errors)}`);
  const boost = baseCourse(); boost.boostGateIndex = 2;
  boost.gates[3] = { x: 1250, z: 660 }; // exit leg far too short to bleed boost
  assert.ok(codes(validateRacingCircuit(boost, OPTS)).includes('insufficient_boost_exit'));
  const noBoost = validateRacingCircuit(baseCourse(), OPTS);
  assert.ok(!codes(noBoost).includes('insufficient_boost_exit'), 'no boost gate → no boost rule');
});

// ── 3. Native signature hazards ───────────────────────────────────────────────
test('Pallas: five native reef bodies materialize; surge/calm project onto the cue', async () => {
  const f = await sectorFixture('sector_pallas_drift', { machinery: true });
  try {
    const level = raceLevelById('level_pallas_reef');
    const mission = { id: 'reef-probe', type: 'race', status: 'active', params: {
      racingContractId: 'contract_pallas_reef', courseSectorId: level.sectorId,
      gates: level.course.gates, gateRadiusWU: 90, nextGate: 3, laps: 1 } };
    // Five authored reef mines ride the current — no racing copy is registered.
    const minePos = PALLAS_REEF_MINES.map((slot, i) => ({ id: pallasReefMineId(i), ...pallasReefMinePos(slot) }));
    assert.equal(minePos.length, 5);
    // The authored course leg physically intersects the reef cone.
    const globals = raceGateGlobals(mission.params);
    const reefLocal = globalToSectorLocalForSector(PALLAS_REEF_GLOBAL_POS, level.sectorId);
    const hitsCone = globals.slice(1).some((b, i) =>
      Math.sqrt(segmentDistanceSquared(PALLAS_REEF_GLOBAL_POS, globals[i], b)) <= PALLAS_REEF_FIELD.radius);
    assert.ok(hitsCone, 'a course leg crosses the reef cone');
    const cues = projectRacingSectorHazards(f.state, mission.params, level.sectorHazards, []);
    assert.equal(cues.length, 1);
    const cue = cues[0];
    assert.equal(cue.kind, 'sectorHazard');
    // Same clock: surge → active, warning → warning, calm → clear.
    const cycle = 14; // warning 2 + surge 8 + calm 4
    for (const [t, want] of [[0.5, 'warning'], [3, 'active'], [11, 'clear'], [14.5, 'warning']]) {
      f.state.simTime = t;
      const c = projectRacingSectorHazards(f.state, mission.params, level.sectorHazards, [])[0];
      const native = pallasReefPhase(t).phase;
      assert.equal(c.phase, want, `simTime ${t} (native ${native})`);
      assert.ok(Number.isFinite(c.countdownS) && c.countdownS >= 0);
    }
    // The native field strength is machinery truth: nonzero on surge, zero on calm.
    assert.ok(pallasReefPhase(3).fieldStrength > 0);
    assert.equal(pallasReefPhase(11).fieldStrength, 0);
    f.state.simTime = 0;
  } finally { f.dispose(); }
});

test('Vesta: both weather cues track the real volume clock', async () => {
  const f = await sectorFixture('sector_vesta_forge');
  try {
    const level = raceLevelById('level_vesta_furnace');
    const mission = { params: { courseSectorId: level.sectorId, gates: level.course.gates, nextGate: 5 } };
    const volumes = weatherVolumesForSector(level.sectorId);
    assert.ok(volumes.some((v) => v.id === 'vesta_radiation_belt'));
    assert.ok(volumes.some((v) => v.id === 'vesta_storm_lane'));
    const defs = level.sectorHazards;
    assert.equal(defs.length, 2);
    const seen = new Set();
    for (let t = 0; t < 400 && seen.size < 3; t += 0.5) {
      f.state.simTime = t;
      for (const cue of projectRacingSectorHazards(f.state, mission.params, defs, [])) {
        const volume = volumes.find((v) => v.id === cue.id);
        const native = weatherPhase(volume, t).phase;
        const want = native === 'surge' ? 'active' : native === 'warning' ? 'warning' : 'clear';
        assert.equal(cue.phase, want, `${cue.id} @${t}s native=${native}`);
        seen.add(cue.phase);
      }
    }
    assert.deepEqual([...seen].sort(), ['active', 'clear', 'warning'], 'the clock visits all three cue phases');
  } finally { f.dispose(); }
});

test('Ceres: cue reads the durable site record; settled sluice stays quiet', async () => {
  const f = await sectorFixture('sector_ceres_belt');
  try {
    const level = raceLevelById('level_ceres_sluice');
    const mission = { params: { courseSectorId: level.sectorId, gates: level.course.gates, nextGate: 4 } };
    f.state.sites ||= {}; f.state.sites.worldById ||= {};
    // Missing record → unavailable, never a fabricated active cue.
    delete f.state.sites.worldById[CINDER_SLUICE_SITE_ID];
    let cue = projectRacingSectorHazards(f.state, mission.params, level.sectorHazards, [])[0];
    assert.equal(cue.phase, 'unavailable');
    // Live record → the machinery phase drives the cue. The durable shape is
    // createdTick plus completed operation receipts — the same record the world owns.
    const record = { createdTick: 0 };
    f.state.sites.worldById[CINDER_SLUICE_SITE_ID] = record;
    const seen = new Set();
    for (let t = 0; t < 300 && seen.size < 3; t += 1) {
      f.state.simTime = t;
      cue = projectRacingSectorHazards(f.state, mission.params, level.sectorHazards, [])[0];
      const native = cinderSluicePhase(record, t).phase;
      const want = native === 'surge' ? 'active' : native === 'warning' ? 'warning' : 'clear';
      assert.equal(cue.phase, want, `@${t}s native=${native}`);
      seen.add(cue.phase);
    }
    // A settled site is quiet — ballast settled is a durable operation receipt,
    // and the cue never invents a surge.
    record.completedOperations = { [CINDER_SLUICE_OPERATIONS.settle]: { earnedAtS: 5 } };
    for (const t of [5, 60, 120]) {
      f.state.simTime = t;
      cue = projectRacingSectorHazards(f.state, mission.params, level.sectorHazards, [])[0];
      assert.equal(cue.phase, 'clear', `settled @${t}s`);
    }
  } finally { f.dispose(); }
});

test('Haumea, Kepler and Sker: native zones intersect their legs; the cracker cycles', async () => {
  const f = await sectorFixture('sector_haumea_rift', { machinery: true });
  try {
    const checks = [
      ['level_haumea_fissure', 2], ['level_kepler_scar', 2], ['level_sker_wreckrun', 2],
    ];
    for (const [levelId, count] of checks) {
      const level = raceLevelById(levelId);
      const sector = SECTOR_BY_ID.get(level.sectorId);
      const mission = { params: { courseSectorId: level.sectorId, gates: level.course.gates, nextGate: 1 } };
      const defs = level.sectorHazards;
      assert.equal(defs.length, count, levelId);
      const globals = raceGateGlobals(mission.params);
      let cueCount = 0;
      for (const def of defs) {
        const cue = projectRacingSectorHazards(f.state, mission.params, [def], [])[0];
        assert.ok(cue, def.id);
        if (def.kind === 'staticZone') {
          const zone = sector.hazards[def.zoneIndex];
          assert.ok(zone && Number.isFinite(zone.radius), `${def.id} resolves a real zone`);
          const zg = sectorLocalToGlobalForSector({ x: zone.center.x, z: zone.center.z }, level.sectorId);
          assert.ok(globals.slice(1).some((b, i) =>
            Math.sqrt(segmentDistanceSquared(zg, globals[i], b)) <= zone.radius + 150),
            `${def.id} zone intersects an intended leg`);
          assert.equal(cue.waitRadiusWU, 42);
        }
        cueCount++;
      }
      assert.equal(cueCount, count);
    }
    // The fissure cracker is real machinery with a phase clock — the cue reads it.
    const machine = ALL_KILL_MACHINE_BY_ID.fissure_cracker;
    assert.ok(machine && machine.sectorId === 'sector_haumea_rift');
    const level = raceLevelById('level_haumea_fissure');
    const def = level.sectorHazards.find((d) => d.kind === 'killMachine');
    const phases = new Set();
    for (let t = 0; t < 600 && phases.size < 2; t += 2) {
      f.state.simTime = t;
      const cue = projectRacingSectorHazards(f.state,
        { courseSectorId: level.sectorId, gates: level.course.gates, nextGate: 4 }, [def], [])[0];
      const native = killMachinePhase(machine, t).phase;
      const want = native === 'surge' ? 'active' : native === 'warning' ? 'warning' : 'clear';
      assert.equal(cue.phase, want, `cracker @${t}s native=${native}`);
      phases.add(native);
    }
    assert.ok(phases.size >= 2, 'the cracker actually cycles');
    // Native machinery count is unchanged by the racing session — no duplicate registration.
    const machines = killMachinesForSector('sector_haumea_rift');
    assert.equal(machines.filter((m) => m.id === 'fissure_cracker').length, 1);
  } finally { f.dispose(); }
});

test('hazard warnings announce once per transition and stay leg-scoped in run.cues', async () => {
  const f = await sectorFixture('sector_pallas_drift');
  try {
    const level = raceLevelById('level_pallas_reef');
    const warnings = [];
    f.bus.on('race:setPieceWarning', (p) => warnings.push(p));
    const mission = { id: 'cue-run', type: 'race', status: 'active', params: {
      racingContractId: 'contract_pallas_reef', raceMode: 'time-trial',
      courseId: level.course.courseId, courseSectorId: level.sectorId, levelId: level.id,
      gates: level.course.gates, gateRadiusWU: 90, nextGate: 4, laps: 1,
      gridUntilSimS: 0.5, raceStartSimS: 0.5 } };
    f.state.missions.active = [mission];
    const pieces = createRacingSetPieces(f.ctx);
    // One full reef cycle plus: warnings fire on the warning transition, once.
    let warned = 0;
    for (let tick = 0; tick < 60 * 20; tick++) {
      f.state.tick = tick; f.state.simTime = tick * DT;
      const cues = pieces.update(mission);
      const hazard = cues.filter((c) => c.kind === 'sectorHazard');
      assert.equal(hazard.length, 1);
      if (hazard[0].phase === 'warning' && tick % 60 === 0) warned++;
      // Cues live in the same array as anchors and never fabricate entities.
      assert.ok(cues.every((c) => Array.isArray(c.entityIds)));
    }
    assert.ok(warnings.length >= 1, 'a hazard warning was announced');
    const ids = warnings.map((w) => `${w.id}`);
    assert.equal(new Set(ids).size, ids.length, 'no duplicate warning ids in one cycle window');
    pieces.stop('done');
  } finally { f.dispose(); }
});

test('hazard projection holds its contract on malformed defs', async () => {
  const f = await sectorFixture('sector_kepler_scar');
  try {
    const level = raceLevelById('level_kepler_scar');
    const mission = { params: { courseSectorId: level.sectorId, gates: level.course.gates, nextGate: 3 } };
    // A repeated def id projects once — the published array never aliases a record.
    const dupes = projectRacingSectorHazards(f.state, mission.params,
      [level.sectorHazards[0], level.sectorHazards[0]], []);
    assert.equal(dupes.length, 1);
    // A served gate outside the chain waits on the hazard body, not the origin.
    const offchain = projectRacingSectorHazards(f.state, mission.params,
      [{ ...level.sectorHazards[0], gateIndex: 99 }], [])[0];
    assert.equal(offchain.waitPos.x, offchain.pos.x);
    assert.equal(offchain.waitPos.z, offchain.pos.z);
    assert.ok(Number.isFinite(offchain.waitPos.x), 'finite hold point');
    // Gate 0 of the closed lap holds on the seam approach, not at the origin.
    const zero = projectRacingSectorHazards(f.state, mission.params,
      [{ ...level.sectorHazards[0], gateIndex: 0 }], [])[0];
    assert.ok(Number.isFinite(zero.waitPos.x) && Number.isFinite(zero.waitPos.z));
    assert.ok(Math.hypot(zero.waitPos.x - zero.pos.x, zero.waitPos.z - zero.pos.z) > 1,
      'the gate-0 hold comes off the seam approach, not the hazard position');
    // A zone row with a radius but no center is unavailable — never a thrown tick.
    const sector = SECTOR_BY_ID.get(level.sectorId);
    const authored = sector.hazards[0];
    try {
      sector.hazards[0] = { type: 'radiation', radius: 400 };
      const broken = projectRacingSectorHazards(f.state, mission.params,
        [{ id: 'broken_zone', kind: 'staticZone', zoneIndex: 0, gateIndex: 7 }], [])[0];
      assert.equal(broken.phase, 'unavailable');
      // A non-finite center is treated the same way: the record keeps its prior
      // position (here the unset default) and the hold stays on the served leg.
      sector.hazards[0] = { type: 'radiation', radius: 400, center: { x: NaN, z: 10 } };
      const nanCue = projectRacingSectorHazards(f.state, mission.params,
        [{ id: 'nan_zone', kind: 'staticZone', zoneIndex: 0, gateIndex: 7 }], [])[0];
      assert.equal(nanCue.phase, 'unavailable');
      assert.ok(Number.isFinite(nanCue.pos.x) && Number.isFinite(nanCue.pos.z),
        'a non-finite source never lands in the published record');
      assert.ok(Number.isFinite(nanCue.waitPos.x) && Number.isFinite(nanCue.waitPos.z),
        'the hold point stays finite');
    } finally { sector.hazards[0] = authored; }
    // A def that resolves neither its served leg nor any hazard position emits
    // no hold point at all — the course view skips a null waitPos rather than
    // drawing a refuge marker at the world origin.
    const orphan = projectRacingSectorHazards(f.state, mission.params,
      [{ id: 'orphan_volume', kind: 'weatherVolume', volumeId: 'not_a_volume', gateIndex: 99 }], [])[0];
    assert.equal(orphan.phase, 'unavailable');
    assert.equal(orphan.waitPos, null, 'no leg and no hazard position means no refuge marker');
    // A def without a name still ships a string — the HUD uppercases it verbatim.
    const nameless = projectRacingSectorHazards(f.state, mission.params,
      [{ id: 'nameless_zone', kind: 'weatherVolume', volumeId: 'not_a_volume', gateIndex: 3 }], [])[0];
    assert.equal(nameless.name, 'nameless_zone', 'an unnamed def falls back to its id');
    assert.ok(Number.isFinite(nameless.waitPos.x), 'the named-less def still holds on its leg');
    // A courseSectorId the player is not in still projects in the course's own
    // frame — the hazard's true global position, not a fabricated local one.
    const elsewhere = await sectorFixture('sector_helios_prime');
    try {
      const cue = projectRacingSectorHazards(elsewhere.state, mission.params,
        level.sectorHazards, [])[0];
      const zone = sector.hazards[level.sectorHazards[0].zoneIndex];
      const expected = sectorLocalToGlobalForSector({ x: zone.center.x, z: zone.center.z }, level.sectorId);
      assert.equal(cue.pos.x, expected.x);
      assert.equal(cue.pos.z, expected.z);
      assert.equal(cue.phase, 'clear', 'a distant pilot does not stand inside the zone');
    } finally { elsewhere.dispose(); }
  } finally { f.dispose(); }
});

// ── 4. Physical solo completion ───────────────────────────────────────────────
async function soloRun(levelId, seed = SEED) {
  const level = raceLevelById(levelId);
  const f = await sectorFixture(level.sectorId, { seed, machinery: true });
  const { state, bus, player, flight, ports, tactical, machine, owner } = f;
  try {
    const contract = raceContractById(`practice_${level.id}`);
    const offer = racingOfferFor(contract.id);
    const start = startLineFor(offer.params);
    player.pos.x = start.x; player.pos.z = start.z; player.rot = start.heading;
    player.vel = { x: 0, z: 0 };
    const mission = {
      id: `solo-${level.id}`, type: 'race', status: 'active', title: contract.title,
      reward_cr: contract.reward_cr, destSectorId: level.sectorId, destStationId: level.stationId,
      params: { ...offer.params, nextGate: 0, gridUntilSimS: 0.5, raceStartSimS: null,
        laps: 1, raceMode: 'time-trial', raceOpponents: 0 },
    };
    state.missions.active = [mission];
    const mis = Object.create(missions); mis.init(f.ctx);
    const gates = raceGateGlobals(mission.params);
    const driver = createRacingDriver({ pace: 0.94, corner: 0.8, lane: 0, id: 'mira' }, 'club');
    const gateEvents = [];
    bus.on('mission:gateCleared', (p) => { if (p.missionId === mission.id) gateEvents.push(p.gateIndex); });
    const contacts = [];
    let finishTick = -1;
    const scratch = [];
    for (let tick = 0; tick < 60 * 600 && finishTick < 0; tick++) {
      state.tick = tick; state.simTime = tick * DT;
      // Racing driver steers the player through ordinary flight input — real V3.
      const intent = racingDriverIntent(driver, {
        entity: player, params: mission.params, gates,
        nearby: [], dt: DT, held: state.simTime < mission.params.gridUntilSimS,
      });
      const input = state.input;
      input.moveZ = Math.max(-1, Math.min(1, Number(intent.moveZ) || 0));
      input.moveX = Math.max(-1, Math.min(1, Number(intent.moveX) || 0));
      input.turnIntent = Math.max(-1, Math.min(1, Number(intent.turnIntent) || 0));
      input.boost = !!intent.boost; input.brake = !!intent.brake; input.fire = false;
      if (!input.actions) input.actions = {};
      input.actions.brake = input.brake; input.actions.autopursuit = false;
      tactical.update(DT, state);
      flight.update(DT, state);
      ports.update(DT, state);
      if (machine) machine.update(DT, state);
      owner.syncFromEntities(state.entityList.filter((e) => e && e.pos));
      owner.step(DT, tick);
      contacts.push(...owner.drainContactImpacts()
        .filter((h) => h.aId === state.playerId || h.bId === state.playerId)
        .map((h) => ({ tick, other: h.aId === state.playerId ? h.bId : h.aId })));
      mis._driveAuthoredRace(mission, 0, state, DT);
      if (Number.isFinite(mission.params.raceElapsedS) || mission.status === 'complete'
        || !state.missions.active.includes(mission)) finishTick = tick;
    }
    return { mission, player, gateEvents, finishTick, contacts, state };
  } finally { f.dispose(); }
}

test('a real V3 hull completes each sector course inside 600 s, deterministically', async () => {
  for (const level of SECTOR_RACE_LEVELS) {
    const run = await soloRun(level.id);
    const { mission, player, gateEvents, finishTick } = run;
    assert.ok(finishTick >= 0, `${level.id} finished (nextGate ${mission.params.nextGate})`);
    assert.ok(finishTick <= 60 * 600, `${level.id} inside 600 s (${(finishTick * DT).toFixed(1)}s)`);
    assert.ok(player.alive !== false, 'hull survived the hazard work');
    assert.ok(Number.isFinite(player.pos.x) && Number.isFinite(player.pos.z), 'finite state');
    const order = mission.params.lapTimesS || [];
    assert.ok(order.length >= 1 || Number.isFinite(mission.params.raceElapsedS), 'a scored finish');
    // Ordered gate events: monotonically the authored sequence (wraps to 1 on closed seam).
    let expected = 0;
    for (const g of gateEvents) {
      assert.equal(g, expected === 0 ? 0 : expected, `${level.id} gates in order: ${gateEvents.join(',')}`);
      expected = g + 1;
    }
    // Determinism: an identical host reproduces the same ordered events and finish tick.
    const repeat = await soloRun(level.id);
    assert.equal(repeat.finishTick, finishTick, `${level.id} finish tick is deterministic`);
    assert.deepEqual(repeat.gateEvents, gateEvents, `${level.id} gate events are deterministic`);
    // Incidental scenery never blocks a legal line: contacts are allowed only against
    // native hazard bodies, and the run still completes.
    for (const contact of run.contacts) {
      const other = run.state.entities.get(contact.other);
      assert.ok(other, 'contact body resolved');
    }
  }
});

// ── 5. Launch gating, lifecycle, persistence ─────────────────────────────────
test('sector circuits reject pack/cup/direct arming before any side effect', async () => {
  for (const mode of ['race', 'cup']) {
    const staged = stageRacingLaunch('practice_level_pallas_reef', { raceMode: mode });
    assert.deepEqual(staged, { ok: false, reason: 'time_trial_only' }, mode);
    assert.equal(takeRacingLaunch(), null, 'nothing staged');
  }
  const staged = stageRacingLaunch('practice_level_pallas_reef', { raceMode: 'time-trial' });
  assert.equal(staged.contractId, 'practice_level_pallas_reef');
  takeRacingLaunch();
  // Direct campaign arming: a live flight with no corridor session is refused first.
  const f = await sectorFixture('sector_helios_prime');
  try {
    configureRacingCorridorSession(f.state, false);
    const mis = Object.create(missions); mis.init(f.ctx);
    const registry = { get: (id) => ({ world: f.world, missions: mis })[id] || null };
    const ctx = { state: f.state, bus: f.bus, registry };
    const result = armRacingContract(ctx, 'contract_pallas_reef', { raceMode: 'time-trial' });
    assert.equal(result.reason, 'temporary_circuit_required');
    assert.equal(f.state.missions.active.length, 0, 'no mission accepted');
  } finally { f.dispose(); }
});

test('a live corridor arm accepts the mission and files the result; record keys carry the new ids', async () => {
  const f = await sectorFixture('sector_pallas_drift');
  try {
    const level = raceLevelById('level_pallas_reef');
    const mis = Object.create(missions); mis.init(f.ctx);
    const registry = { get: (id) => ({ world: f.world, missions: mis })[id] || null };
    const ctx = { state: f.state, bus: f.bus, registry };
    assert.equal(isRacingCorridorSession(f.state), true);
    const armed = [];
    f.bus.on('race:armed', (p) => armed.push(p));
    const result = armRacingContract(ctx, 'practice_level_pallas_reef', {
      raceMode: 'time-trial', allowEnterSector: true });
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics || result.reason));
    assert.equal(armed.length, 1);
    const mission = f.state.missions.active.find((m) => m.params?.racingContractId === 'practice_level_pallas_reef');
    assert.ok(mission, 'the race mission posted');
    assert.equal(mission.params.temporaryOnly, true);
    assert.equal(mission.params.courseSectorId, 'sector_pallas_drift');
    assert.ok(Number.isFinite(mission.params.gridUntilSimS), 'grid hold staged');
    assert.equal(mission.params.courseRevision, 1);
    // The same arm with an oversized hull fails RF-02 before acceptance.
    const big = f.helpers.spawnEntity({ type: 'ship', isPlayer: false, pos: { x: 0, z: 0 }, radius: 200 });
    const verdict = validateRacingCircuit(level.course, {
      hullRadiusWU: 200, profile: resolvePropulsionProfile(big, f.state),
      referenceSpeedsWU: { turn: 60, straight: 120 }, solids: [] });
    assert.equal(verdict.ok, false);
    assert.ok(verdict.errors.some((e) => e.code === 'invalid_gate_radius'));
    mis._racingSetPieces?.stop('done');
  } finally { f.dispose(); }
});

test('career medals, records and rival history for new ids survive a reload', () => {
  const storage = memoryStorage();
  // Gold needs to beat the course's published standard — the new catalog's medalTimes.
  const times = courseForLevel('level_pallas_reef').medalTimes;
  const elapsedS = times.gold - 1;
  const medal = awardCourseMedal({ levelId: 'level_pallas_reef', elapsedS, raceMode: 'time-trial' }, storage);
  assert.equal(medal.ok, true, JSON.stringify(medal));
  const career = readRacingCareer(storage);
  assert.equal(career.medals.level_pallas_reef.medal, 'Gold');
  // Rival history whitelists the new catalog: a meeting on a new course persists.
  // The serial is reserved through the same high-water mark the launch owner uses.
  const { raceMeetingId } = stageRacingMeeting(storage);
  const meeting = recordRaceMeeting({
    type: 'race', racingContractId: 'contract_pallas_reef', levelId: 'level_pallas_reef',
    raceMeetingId,
    raceMode: 'race', raceDifficulty: 'club', raceElapsedS: 88.5,
    raceEntrants: 4, racePosition: 2,
    raceStandings: [
      { id: 'mira', position: 1, status: 'finished', elapsedS: 80 },
      { id: 'player', player: true, position: 2, status: 'finished', elapsedS: 88.5 },
      { id: 'rook', position: 3, status: 'finished', elapsedS: 95 },
      { id: 'sable', position: 4, status: 'dnf' },
    ],
  }, storage);
  assert.equal(meeting.ok, true, JSON.stringify(meeting));
  const reloaded = readRacingCareer(memoryStorageFrom(storage));
  assert.equal(reloaded.medals.level_pallas_reef.medal, 'Gold', 'medal survives reload');
  assert.equal(reloaded.rivals.mira.lastLevelId, 'level_pallas_reef', 'rival history keeps the new course id');
  function memoryStorageFrom(src) { const m = memoryStorage(); for (const [k, v] of src.rows) m.setItem(k, v); return m; }
});

// ── 6. Headless UI ────────────────────────────────────────────────────────────
function boardDocument() {
  const doc = fakeDom();
  const make = (tag) => {
    const node = doc._make(tag);
    node.nodeType = 1;
    node.replaceChildren = (...children) => {
      for (const old of node.children) old.parentNode = null;
      node.children.length = 0; node.append(...children);
    };
    const match = (sel) => node.classList?.contains?.(sel) || node.id === sel.replace(/^#/, '');
    node.querySelector = (sel) => {
      const want = sel.replace(/^\./, '');
      const visit = (n) => {
        for (const c of n.children || []) {
          if (c.classList?.contains?.(want) || c.id === want) return c;
          const deep = visit(c); if (deep) return deep;
        }
        return null;
      };
      return visit(node);
    };
    node.querySelectorAll = (sel) => findAll(node, (n) => n.classList?.contains?.(sel.replace(/^\./, '')));
    node.contains = (o) => { let p = o; while (p) { if (p === node) return true; p = p.parentNode; } return false; };
    return node;
  };
  doc.createElement = make;
  doc.createElementNS = (_ns, tag) => make(tag);
  return doc;
}

test('the board enumerates nine circuits; sector cards are Time-trial gated', () => {
  const state = createGameState(SEED);
  state.mode = 'menu';
  const bus = createBus();
  const ctx = { state, bus, registry: { get: () => null }, screenManager: { popScreen() {} } };
  const prevDoc = globalThis.document, prevStore = globalThis.localStorage;
  const doc = boardDocument();
  globalThis.document = doc;
  globalThis.localStorage = memoryStorage();
  const root = doc.createElement('div');
  try {
    raceBoardScreen._fit = { starter: DEFAULT_STARTER_ID, drive: 'standard', raceMode: 'time-trial', raceDifficulty: 'club' };
    raceBoardScreen.mount(root, ctx);
    const text = textLines(root).join('\n');
    assert.ok(/9 circuits/.test(text), 'catalog-derived circuit count, not "three"');
    const cards = findAll(root, (n) => n.dataset?.contractId);
    assert.equal(cards.length, 18, 'nine practices plus nine contracts');
    // Time-trial mode: a sector practice card is selectable.
    const pallas = cards.find((c) => c.dataset.contractId === 'practice_level_pallas_reef');
    assert.ok(pallas, 'the Pallas card renders');
    // Pack race mode: sector cards exist but carry the exact refusal line.
    raceBoardScreen._fit.raceMode = 'race';
    raceBoardScreen.refresh(ctx);
    const packText = textLines(root).join('\n');
    assert.ok(packText.includes('Select Time trial to fly this circuit.'), 'exact refusal text');
    const entry = raceBoardScreen._entries.find((e) => e.contractId === 'practice_level_pallas_reef');
    assert.equal(entry.eligible, false, 'pack mode cannot launch a sector circuit');
    raceBoardScreen._fit.raceMode = 'time-trial';
    raceBoardScreen.refresh(ctx);
    const again = raceBoardScreen._entries.find((e) => e.contractId === 'practice_level_pallas_reef');
    assert.equal(again.eligible, true, 'time trial restores the launch');
  } finally {
    try { raceBoardScreen.unmount(); } catch {}
    globalThis.document = prevDoc;
    if (prevStore === undefined) delete globalThis.localStorage; else globalThis.localStorage = prevStore;
  }
});
