// Row 254 remainder — FB-066 race archetype, FB-067 physical variants + career steps,
// FB-068 honest settlement when an external actor destroys a contract's objective.
// All sim-side: seeded rng, simulation time, public ownership seams (economy/faction intents,
// durable receipts), no wall clock.
import test from 'node:test';
import assert from 'node:assert/strict';

import * as missionData from '../src/data/missions.js';
import {
  PHYSICAL_MISSION_VARIANTS,
  physicalMissionVariantFor,
} from '../src/data/missions.js';
import { missions, externalTargetLoss } from '../src/systems/missions.js';
import {
  raceCourseForSector,
  raceBandForElapsed,
  RACE_BAND_MULT,
  RACE_GATE_COUNT,
} from '../src/data/raceCourses.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import {
  buildCareerContractOffer,
  ensureCareerContractState,
} from '../src/systems/careerContracts.js';
import { validateCareerContractCatalog } from '../src/data/careerContracts.js';
import { mulberry32, hash32 } from '../src/core/rng.js';

class Bus {
  constructor() { this.handlers = new Map(); this.log = []; }
  on(name, fn) { const rows = this.handlers.get(name) || []; rows.push(fn); this.handlers.set(name, rows); }
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
  of(name) { return this.log.filter((e) => e.name === name).map((e) => e.payload); }
}

const HELIOS_STATION = Object.freeze({
  id: 'station_helios', name: 'Helios Station', type: 'trade_hub', size: 'L',
  missionProfile: 'trade_hub', boardAnchorType: null,
  factionId: 'faction_scn', sectorId: 'sector_helios_prime', sectorTier: 0, security: 0.98,
});
const ASHFALL_STATION = Object.freeze({
  id: 'station_ashcache', name: 'Ash Cache', type: 'trade_hub', size: 'M',
  missionProfile: 'trade_hub', boardAnchorType: null,
  factionId: 'faction_free', sectorId: 'sector_ashfall_reach', sectorTier: 4, security: 0.05,
});

function baseState({ seed = 91 } = {}) {
  return {
    meta: { seed, playtimeS: 0 },
    seed,
    tick: 0,
    simTime: 100,
    mode: 'flight',
    playerId: 1,
    player: {
      credits: 500000,
      researchPoints: 0,
      cargo: { items: {}, capVolume: 500, capMass: 500, usedVolume: 0, usedMass: 0 },
      stats: {},
    },
    missions: {
      boards: {},
      active: [],
      completedLog: [],
      receipts: [],
      nextId: 1,
      config: JSON.parse(JSON.stringify(missionData.MISSION_TUNING)),
    },
    story: { beatIndex: 2, branch: null, flags: {}, chainProgress: 0 },
    factions: { faction_scn: { rep: 500 } },
    world: { currentSectorId: 'sector_helios_prime', activeSector: { stations: [] } },
    economy: { markets: {} },
    entities: new Map(),
    entityList: [],
    ui: { docked: false, dockedStationId: null, trackedMissionId: null },
    nav: {},
    settings: { gameplay: { tutorialHints: false } },
  };
}

let entSeq = 1000;
function boot(state) {
  const bus = new Bus();
  const sys = { ...missions };
  sys.init({
    state,
    bus,
    helpers: {
      voice: { say: () => true },
      hash32,
      mulberry32,
      spawnEntity: (spec) => {
        const ent = { id: `ent${entSeq++}`, alive: true, ...spec, data: { ...(spec.data || {}) } };
        state.entities.set(ent.id, ent);
        return ent;
      },
    },
    registry: { get: () => null },
  });
  return { bus, sys };
}

function playerShip(state, pos = { x: 0, z: 0 }) {
  const ent = { id: state.playerId, isPlayer: true, alive: true, radius: 18, pos: { ...pos }, vel: { x: 0, z: 0 }, data: {} };
  state.entities.set(state.playerId, ent);
  return ent;
}

function gateGlobal(mission, index) {
  const gate = mission.params.gates[index];
  return sectorLocalToGlobalForSector(gate, mission.params.courseSectorId || mission.destSectorId, { x: 0, z: 0 });
}

function raceMission(state, over = {}) {
  const course = raceCourseForSector('sector_helios_prime');
  return {
    id: 'm_race', type: 'race', status: 'active',
    title: 'Run the Helios–Tethys outbound gates',
    factionId: 'faction_scn', stationId: 'station_helios',
    destStationId: 'station_helios', destSectorId: 'sector_helios_prime',
    reward_cr: 1000, collateral_cr: 0, riskTier: 1, distance: 0,
    params: {
      courseId: course.courseId, courseName: course.courseName, courseKind: course.kind,
      courseSectorId: course.sectorId,
      gates: course.gates.map((g) => ({ x: g.x, z: g.z })),
      gateRadiusWU: course.gateRadiusWU,
      courseLengthWU: course.courseLengthWU,
      recordS: course.recordS,
      bandCapsS: course.bandCapsS.slice(),
      nextGate: 0,
    },
    objectiveProgress: 0, objectiveTarget: course.gates.length,
    targetEntityIds: [], needsTargets: true,
    deadline_s: null, storyTag: null,
    ...over,
  };
}

// ── FB-066: courses ─────────────────────────────────────────────────────────

test('FB-066: course derivation is deterministic, lane or ring, null where no course fits', () => {
  const a = raceCourseForSector('sector_helios_prime');
  const b = raceCourseForSector('sector_helios_prime');
  assert.ok(a && a.kind === 'lane', 'helios endpoint sector derives the lane chord course');
  assert.deepEqual(a, b, 'pure derive — same sector, same frozen record');
  assert.equal(a.gates.length, RACE_GATE_COUNT);
  assert.equal(a.sectorId, 'sector_helios_prime');
  for (const g of a.gates) {
    assert.ok(Number.isFinite(g.x) && Number.isFinite(g.z), 'gate chain is real sector-local geometry');
  }
  assert.ok(a.courseLengthWU > 0 && a.recordS > 0 && a.bandCapsS.length === 2);
  const ring = raceCourseForSector('sector_veil_nebula');
  assert.ok(ring && ring.kind === 'ring', 'scenic sector with no lane endpoint gets the buoy ring');
  assert.equal(raceCourseForSector('sector_ashfall_reach'), null, 'no lane, no scenic room → no course');
  // Bands are monotone in elapsed: faster is a better band.
  assert.equal(raceBandForElapsed(1, a), 'razor');
  assert.equal(raceBandForElapsed(a.bandCapsS[0] + 0.5, a), 'standard');
  assert.equal(raceBandForElapsed(a.bandCapsS[1] + 60, a), 'finish');
  assert.ok(RACE_BAND_MULT.razor > RACE_BAND_MULT.standard && RACE_BAND_MULT.standard > RACE_BAND_MULT.finish);
});

test('FB-066: a race offer stamps the whole course record; a course-less board declines before any rng draw', () => {
  const state = baseState();
  const { sys } = boot(state);
  const offer = sys._rollOffer('race', HELIOS_STATION, mulberry32(hash32(91, 'race-ok')), 0, 0);
  assert.ok(offer, 'helios board can post a race');
  assert.equal(offer.type, 'race');
  assert.equal(offer.destSectorId, 'sector_helios_prime', 'the course IS the destination — same sector as the board');
  assert.equal(offer.params.courseSectorId, 'sector_helios_prime');
  assert.ok(Array.isArray(offer.params.gates) && offer.params.gates.length === RACE_GATE_COUNT);
  assert.equal(offer.params.nextGate, 0);
  assert.ok(Number.isFinite(offer.params.recordS) && offer.params.recordS > 0);
  assert.ok(offer.brief.includes('gates'), 'the brief tells the player what the job physically is');
  // Deterministic: same seed stream → identical geometry.
  const twin = sys._rollOffer('race', HELIOS_STATION, mulberry32(hash32(91, 'race-ok')), 0, 0);
  assert.deepEqual(offer.params.gates, twin.params.gates);
  assert.equal(offer.reward_cr, twin.reward_cr);
  // Course-less sector: refusal BEFORE the params roll — the stream is untouched.
  const rngA = mulberry32(hash32(91, 'race-null'));
  const rngB = mulberry32(hash32(91, 'race-null'));
  assert.equal(sys._rollOffer('race', ASHFALL_STATION, rngA, 0, 0), null, 'ashfall posts no race');
  assert.equal(rngA(), rngB(), 'a declined race offer consumed no rng draws');
});

test('FB-066: gates materialize as non-colliding beacon entities, one durable slot each', () => {
  const state = baseState();
  const { sys } = boot(state);
  const m = raceMission(state);
  state.missions.active.push(m);
  sys._spawnRaceGateTargets(m);
  assert.equal(m.targetEntityIds.length, RACE_GATE_COUNT);
  const spawned = m.targetEntityIds.map((id) => state.entities.get(id));
  for (let i = 0; i < spawned.length; i++) {
    const ent = spawned[i];
    assert.ok(ent && ent.type === 'beacon', `gate ${i} is a real scene body`);
    assert.equal(ent.data.physicalRole, 'race_gate');
    assert.equal(ent.data.raceGateIndex, i);
    assert.equal(ent.collides, false, 'a gate buoy is flown THROUGH, never collided');
    const expect = gateGlobal(m, i);
    assert.ok(Math.abs(ent.pos.x - expect.x) < 0.01 && Math.abs(ent.pos.z - expect.z) < 0.01,
      `gate ${i} sits on the course's own geometry`);
  }
  // Idempotent: re-running the spawn adopts the occupied slots instead of doubling the furniture.
  sys._spawnRaceGateTargets(m);
  assert.equal(m.targetEntityIds.length, RACE_GATE_COUNT);
});

test('FB-066: gates score in order on the course clock; the band prices the payout', () => {
  const state = baseState();
  const { bus, sys } = boot(state);
  const player = playerShip(state);
  const m = raceMission(state);
  state.missions.active.push(m);
  // Wrong gate first: standing inside gate 2 while gate 1 is owed warns and counts nothing.
  player.pos = { ...gateGlobal(m, 1) };
  sys._driveRace(m, 0, state);
  assert.equal(m.params.nextGate, 0, 'a later gate does not score');
  assert.equal(m.params.orderWarnGate, 1);
  assert.ok(bus.of('toast').some((t) => /in order/.test(t.text)), 'the order cue is player-facing');
  // Gate 1 starts the clock.
  player.pos = { ...gateGlobal(m, 0) };
  sys._driveRace(m, 0, state);
  assert.equal(m.params.nextGate, 1);
  assert.equal(m.objectiveProgress, 1);
  assert.ok(Number.isFinite(m.params.raceStartSimS));
  assert.ok(bus.of('mission:gateCleared').length === 1);
  // Run the rest inside the razor window (sim time holds at the start stamp).
  for (let g = 1; g < m.params.gates.length; g++) {
    player.pos = { ...gateGlobal(m, g) };
    sys._driveRace(m, 0, state);
  }
  assert.equal(m.status, 'completed', 'last gate settles the contract');
  assert.equal(m.params.raceBand, 'razor', 'elapsed ~0 is inside the razor cap');
  assert.equal(m.reward_cr, Math.round(1000 * RACE_BAND_MULT.razor), 'razor band scales the posted pay');
  const grants = bus.of('economy:grantCredits').filter((e) => e.reason === `mission:${m.id}`);
  assert.equal(grants.length, 1);
  assert.equal(grants[0].amount, Math.round(1000 * RACE_BAND_MULT.razor));
  const receipt = state.missions.receipts.find((r) => r.missionId === m.id);
  assert.ok(receipt && receipt.outcome === 'completed');
});

test('FB-066: a slow run pays finish band, not nothing — the contract still settles honestly', () => {
  const state = baseState();
  const { sys } = boot(state);
  const player = playerShip(state);
  const m = raceMission(state);
  state.missions.active.push(m);
  player.pos = { ...gateGlobal(m, 0) };
  sys._driveRace(m, 0, state);
  // Let the clock run well past the standard cap before the last gate.
  state.simTime += m.params.bandCapsS[1] + 240;
  for (let g = 1; g < m.params.gates.length; g++) {
    player.pos = { ...gateGlobal(m, g) };
    sys._driveRace(m, 0, state);
  }
  assert.equal(m.status, 'completed');
  assert.equal(m.params.raceBand, 'finish');
  assert.equal(m.reward_cr, Math.round(1000 * RACE_BAND_MULT.finish));
});

test('FB-066: race progress is durable — params carry the whole course state across a save copy', () => {
  const state = baseState();
  const { sys } = boot(state);
  const player = playerShip(state);
  const m = raceMission(state);
  state.missions.active.push(m);
  player.pos = { ...gateGlobal(m, 0) };
  sys._driveRace(m, 0, state);
  player.pos = { ...gateGlobal(m, 1) };
  sys._driveRace(m, 0, state);
  // Round-trip the mission the way serialize/deserialize would: JSON params + no entity ids.
  const restored = JSON.parse(JSON.stringify(m));
  restored.targetEntityIds = [];
  const state2 = baseState();
  state2.missions.active.push(restored);
  const { sys: sys2 } = boot(state2);
  const player2 = playerShip(state2);
  assert.equal(restored.params.nextGate, 2);
  assert.ok(Number.isFinite(restored.params.raceStartSimS), 'the running clock survives');
  // Furniture re-materializes under the durable slots; scoring continues on the same course.
  sys2._spawnRaceGateTargets(restored);
  assert.equal(restored.targetEntityIds.length, RACE_GATE_COUNT);
  player2.pos = { ...gateGlobal(restored, 2) };
  sys2._driveRace(restored, 0, state2);
  assert.equal(restored.params.nextGate, 3, 'the resumed run continues from the same gate');
});

// ── FB-067: variants + career steps ─────────────────────────────────────────

test('FB-067: every physical archetype owns a real second row — different body, not new paint', () => {
  for (const typeId of ['tow_recovery', 'demolition', 'rescue_under_fire']) {
    const rows = PHYSICAL_MISSION_VARIANTS[typeId];
    assert.ok(Array.isArray(rows) && rows.length >= 2, `${typeId} has a second row`);
    const variant = rows[1];
    const changesBody = Number.isFinite(variant.massMult) || Number.isFinite(variant.bodyRadius)
      || Number.isFinite(variant.escortCount) || Number.isFinite(variant.podSpreadWu);
    assert.ok(changesBody, `${typeId}/${variant.id} changes the physical situation`);
    assert.ok(Array.isArray(variant.clauseIds), `${typeId}/${variant.id} names its clause rows`);
    assert.equal(physicalMissionVariantFor(typeId, variant.id), variant);
    assert.equal(physicalMissionVariantFor(typeId, 'bogus'), rows[0], 'unknown ids fall back to row zero');
  }
});

test('FB-067: the board variant pick is offer-deterministic and stamps variant terms', () => {
  const state = baseState();
  const { sys } = boot(state);
  const seen = new Set();
  // Roll a run of offers; every pick is reproducible and at least one lands the second row.
  for (let i = 0; i < 24; i++) {
    const offer = sys._rollOffer('tow_recovery', HELIOS_STATION, mulberry32(hash32(91, 'variant-scan', i)), 0, i);
    assert.ok(offer, 'tow offers roll');
    assert.ok(offer.params.variant, 'every rolled physical offer carries a variant id');
    seen.add(offer.params.variant);
    const twin = sys._rollOffer('tow_recovery', HELIOS_STATION, mulberry32(hash32(91, 'variant-scan', i)), 0, i);
    assert.equal(twin.params.variant, offer.params.variant, 'same offer id → same variant');
    if (offer.params.variant === 'drift_hulk') {
      assert.ok(offer.params.massU > 28, 'the drift hulk is a HEAVIER tow');
      assert.equal(offer.params.scanLabel, 'DEAD FREIGHTER');
      assert.ok((offer.clauses || []).some((row) => row.conditionId === 'no_slack'),
        'the variant clause row rides the offer');
    }
  }
  assert.ok(seen.size >= 2, 'both rows actually roll across a board run');
});

test('FB-067: career stages exercise the archetype variants with their authored terms', () => {
  assert.equal(validateCareerContractCatalog().ok, true, 'catalog still validates after variant stages');
  const state = baseState();
  ensureCareerContractState(state);
  state.careers = { origins: { __meta: { upgradeReceipts: {
    hauler: { defId: 'haul', status: 'inventory' },
    hunter: { defId: 'hunt', status: 'inventory' },
  } } } };
  const towOffer = buildCareerContractOffer(state, 'hauler_wreck_reclamation',
    { contractId: 'hauler_wreck_reclamation', cycle: 0, stageIndex: 2, attempt: 0, status: 'ready', completedStages: [] });
  assert.ok(towOffer && towOffer.type === 'tow_recovery', 'the reclamation ledger ends on the tow verb');
  assert.equal(towOffer.params.variant, 'drift_hulk');
  assert.equal(towOffer.params.scanLabel, 'DEAD FREIGHTER');
  assert.ok((towOffer.clauses || []).some((row) => row.conditionId === 'no_slack'),
    'career variant carries its clause row');
  const demoOffer = buildCareerContractOffer(state, 'hunter_ashfall_pursuit',
    { contractId: 'hunter_ashfall_pursuit', cycle: 0, stageIndex: 1, attempt: 0, status: 'ready', completedStages: [] });
  assert.ok(demoOffer && demoOffer.type === 'demolition');
  assert.equal(demoOffer.params.variant, 'guarded_tower');
  assert.equal(demoOffer.params.escortCount, 2, 'the picket screen rides the stage params');
  assert.ok((demoOffer.clauses || []).some((row) => row.conditionId === 'mass_on_target'));
  const pullOffer = buildCareerContractOffer(state, 'hunter_convoy_screen',
    { contractId: 'hunter_convoy_screen', cycle: 0, stageIndex: 2, attempt: 0, status: 'ready', completedStages: [] });
  assert.ok(pullOffer && pullOffer.type === 'rescue_under_fire');
  assert.equal(pullOffer.params.variant, 'pocket_pull');
  assert.equal(pullOffer.params.podSpreadWu, 90);
  assert.ok((pullOffer.clauses || []).some((row) => row.conditionId === 'soft_berth'));
});

// ── FB-068: external destruction settles honestly ───────────────────────────

function demolitionMission(over = {}) {
  return {
    id: 'm_demo', type: 'demolition', status: 'active',
    title: 'Knock down the marked tower', factionId: 'faction_scn',
    stationId: 'station_helios', destStationId: 'station_helios', destSectorId: 'sector_helios_prime',
    reward_cr: 2400, collateral_cr: 600, riskTier: 2,
    params: {}, objectiveProgress: 0, objectiveTarget: 1,
    targetEntityIds: ['tower1'], needsTargets: true, deadline_s: null, storyTag: null,
    ...over,
  };
}

function towerEntity(state, id) {
  const ent = { id, type: 'wreck', alive: true, pos: { x: 100, z: 200 }, data: { physicalRole: 'demolition_tower' } };
  state.entities.set(id, ent);
  return ent;
}

test('FB-068: predicate — objective killed id, unmet objective, live mission, no story tag', () => {
  const m = demolitionMission();
  const gone = () => true;
  assert.equal(externalTargetLoss(m, 'tower1', gone), false, 'demolition settles in the physical lanes');
  const bounty = { ...demolitionMission(), type: 'bounty_hunt', objectiveProgress: 0, objectiveTarget: 1, targetEntityIds: ['mark1'] };
  assert.equal(externalTargetLoss(bounty, 'mark1', gone), true, 'bounty marks delegate to the INF-067 check');
  assert.equal(externalTargetLoss({ ...bounty, objectiveProgress: 1 }, 'mark1', gone), false, 'an already-met objective is not a loss');
  assert.equal(externalTargetLoss({ ...bounty, storyTag: 'campaign47a:x' }, 'mark1', gone), false, 'story contracts are excluded');
  assert.equal(externalTargetLoss({ ...bounty, status: 'completed' }, 'mark1', gone), false, 'a settled mission is not a loss');
  const patrol = { ...bounty, type: 'patrol_clear', objectiveTarget: 3, targetEntityIds: ['a', 'b', 'c'] };
  assert.equal(externalTargetLoss(patrol, 'a', gone), false,
    'patrol packs top back up from vacant slots — an external kill costs time, not the contract');
});

test('FB-068: a third-party kill on the demolition tower voids with cause, refund, and no rep penalty', () => {
  const state = baseState();
  const { bus } = boot(state);
  const m = demolitionMission();
  state.missions.active.push(m);
  const tower = towerEntity(state, 'tower1');
  bus.emit('entity:killed', {
    id: 'tower1', killerId: 'npc_raider_9', type: 'wreck',
    pos: { x: tower.pos.x, z: tower.pos.z },
    presentation: { cause: 'kinetic', playerCaused: false },
  });
  assert.equal(m.status, 'failed');
  assert.ok(!state.missions.active.includes(m), 'the failed contract leaves the active list');
  assert.equal(m.params.externalCause, 'kinetic');
  assert.equal(m.params.externalCauseFamily, 'direct');
  assert.equal(m.params.externalKillerId, 'npc_raider_9');
  const receipts = state.missions.receipts.filter((r) => r.missionId === m.id);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].reason, 'failed_external');
  assert.equal(receipts[0].externalCause, 'kinetic');
  assert.equal(receipts[0].repDelta, 0, 'no rep penalty on someone else\'s kill');
  assert.ok(bus.of('economy:grantCredits').some((e) => e.reason === `collateral_refund:${m.id}`),
    'the deposit comes back');
  assert.ok(!bus.of('faction:repDelta').some((e) => e.delta < 0 && e.reason === `mission_failed:${m.type}`),
    'no fail-penalty intent was emitted');
  assert.ok(bus.of('toast').some((t) => /objective went down to gunnery/.test(t.text)),
    'the toast names what took the objective down');
  // The aftermath is physical: the loss-site stamp routes the recovery successor to the wreck.
  assert.ok(m.params.lostWreckPos && Number.isFinite(m.params.lostWreckPos.x));
});

test('FB-068: the player\'s own guns still complete the tower — cut_down, never voided', () => {
  const state = baseState();
  const { bus } = boot(state);
  const m = demolitionMission();
  state.missions.active.push(m);
  const tower = towerEntity(state, 'tower1');
  bus.emit('entity:killed', {
    id: 'tower1', killerId: state.playerId, type: 'wreck',
    pos: { x: tower.pos.x, z: tower.pos.z },
    presentation: { cause: 'kinetic', playerCaused: true },
  });
  assert.equal(m.status, 'completed');
  const receipt = state.missions.receipts.find((r) => r.missionId === m.id);
  assert.ok(receipt && receipt.outcome === 'completed' && receipt.rewardCr > 0);
  assert.ok(bus.of('economy:grantCredits').some((e) => e.reason === `mission:${m.id}`));
  assert.ok(!m.params.externalCause, 'a player kill is not an external loss');
});

test('FB-068: duplicate destruction events settle once', () => {
  const state = baseState();
  const { bus } = boot(state);
  const m = demolitionMission();
  state.missions.active.push(m);
  towerEntity(state, 'tower1');
  const kill = {
    id: 'tower1', killerId: 'npc_raider_9', type: 'wreck',
    pos: { x: 100, z: 200 }, presentation: { cause: 'explosive', playerCaused: false },
  };
  bus.emit('entity:killed', kill);
  bus.emit('entity:killed', kill);
  bus.emit('entity:destroyed', { id: 'tower1', type: 'wreck', pos: { x: 100, z: 200 }, entity: state.entities.get('tower1') });
  const receipts = state.missions.receipts.filter((r) => r.missionId === m.id);
  assert.equal(receipts.length, 1, 'one contract, one settlement');
  assert.equal(bus.of('mission:failed').filter((e) => e.missionId === m.id).length, 1);
});

test('FB-068: authored/story contracts never take the generic external lane', () => {
  const state = baseState();
  const { bus } = boot(state);
  const m = demolitionMission({ storyTag: 'campaign47a:demo', id: 'm_story' });
  state.missions.active.push(m);
  towerEntity(state, 'tower1');
  bus.emit('entity:killed', {
    id: 'tower1', killerId: 'npc_raider_9', type: 'wreck',
    pos: { x: 100, z: 200 }, presentation: { cause: 'kinetic', playerCaused: false },
  });
  assert.equal(m.status, 'active', 'the authored chain owns its own failure branches');
  assert.ok(!state.missions.receipts.some((r) => r.missionId === m.id));
});

test('FB-068: an all-external pod loss voids; a player-caused loss keeps the authored penalty', () => {
  const mkRescue = () => ({
    id: 'm_rescue', type: 'rescue_under_fire', status: 'active',
    title: 'Pull the pods', factionId: 'faction_scn',
    stationId: 'station_helios', destStationId: 'station_helios', destSectorId: 'sector_helios_prime',
    reward_cr: 2000, collateral_cr: 400, riskTier: 2,
    params: { podCount: 1 }, objectiveProgress: 0, objectiveTarget: 1,
    targetEntityIds: ['pod1'], needsTargets: true, deadline_s: null, storyTag: null,
  });
  const mkPod = (state, id) => {
    const ent = { id, type: 'wreck', alive: true, pos: { x: 50, z: 60 }, data: { physicalRole: 'life_pod' } };
    state.entities.set(id, ent);
    return ent;
  };
  // External kill → void with cause.
  {
    const state = baseState();
    const { bus } = boot(state);
    const m = mkRescue();
    state.missions.active.push(m);
    mkPod(state, 'pod1');
    bus.emit('entity:killed', { id: 'pod1', killerId: 'npc_7', type: 'wreck', pos: { x: 50, z: 60 }, presentation: { cause: 'explosive', playerCaused: false } });
    bus.emit('entity:destroyed', { id: 'pod1', type: 'wreck', pos: { x: 50, z: 60 }, entity: state.entities.get('pod1') });
    assert.equal(m.status, 'failed');
    const receipt = state.missions.receipts.find((r) => r.missionId === m.id);
    assert.equal(receipt.reason, 'failed_external');
    assert.equal(receipt.externalCause, 'explosive');
    assert.ok(bus.of('economy:grantCredits').some((e) => e.reason === `collateral_refund:${m.id}`));
  }
  // Player kill → the authored 'pods_lost' penalty stands.
  {
    const state = baseState();
    const { bus } = boot(state);
    const m = mkRescue();
    state.missions.active.push(m);
    mkPod(state, 'pod1');
    bus.emit('entity:killed', { id: 'pod1', killerId: state.playerId, type: 'wreck', pos: { x: 50, z: 60 }, presentation: { cause: 'kinetic', playerCaused: true } });
    bus.emit('entity:destroyed', { id: 'pod1', type: 'wreck', pos: { x: 50, z: 60 }, entity: state.entities.get('pod1') });
    assert.equal(m.status, 'failed');
    const receipt = state.missions.receipts.find((r) => r.missionId === m.id);
    assert.equal(receipt.reason, 'pods_lost');
    assert.ok(receipt.repDelta < 0, 'a pod the player put down keeps the fail penalty');
    assert.ok(!receipt.externalCause);
  }
});

test('FB-068: a bounty mark lost to a rival hunter keeps its INF-067 void — same honest shape', () => {
  const state = baseState();
  const { bus } = boot(state);
  const m = {
    id: 'm_bounty', type: 'bounty_hunt', status: 'active',
    title: 'Writ: marked hull', factionId: 'faction_scn',
    stationId: 'station_helios', destStationId: 'station_helios', destSectorId: 'sector_helios_prime',
    reward_cr: 3000, collateral_cr: 300, riskTier: 2,
    params: {}, objectiveProgress: 0, objectiveTarget: 1,
    targetEntityIds: ['mark1'], needsTargets: true, deadline_s: null, storyTag: null,
  };
  state.missions.active.push(m);
  bus.emit('entity:killed', { id: 'mark1', killerId: 'npc_hunter_4', type: 'ship', pos: { x: 10, z: 10 } });
  assert.equal(m.status, 'failed');
  const receipt = state.missions.receipts.find((r) => r.missionId === m.id);
  assert.equal(receipt.reason, 'target_lost');
  assert.equal(receipt.repDelta, 0);
  assert.ok(bus.of('economy:grantCredits').some((e) => e.reason === `collateral_refund:${m.id}`));
});
