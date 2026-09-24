// Packet 09 focused save/restore round trip (INTEGRATION-NOTES §6 gate).
//
// Drives a REAL Iron Maw fight through the production ports into act II (wing bound, one ballast
// rock already thrown), then round-trips the save payload through the real save-system seam:
// serializeData → _restoreMissions + _spawnPersistentEntities + _restoreCapitalBossFights.
// Contract under test:
//   - the score slice restores at the SAME saved tick (exact checkpoint continuation), and the
//     in-flight cast's hit receipts survive a JSON round trip (a pulse cannot hit twice);
//   - rematerialized runtime ids are resolved through the durable role keys and the fight rebinds
//     (new bossId/targetId/wing member id; a missing wing member becomes a null tombstone slot,
//     cardinality preserved);
//   - the mission owner reconciles targetEntityIds and both issuance ledgers — and re-running the
//     spawner afterwards mints NOTHING (a spent rock is never re-minted; the wing is never
//     re-summoned; a denied/absent member is not resurrected).
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import {
  CAPITAL_BOSS,
  CAPITAL_BOSS_SOURCE,
  CAPITAL_BOSS_TYPE,
} from '../src/data/missions.js';
import { CAPITAL_BOSS_ENCOUNTER_ID } from '../src/data/encounters/capital-boss.js';
import { createCapitalBossEncounters } from '../src/systems/capitalBossEncounters.js';
import { SECTORS } from '../src/data/sectors.js';
import { missions } from '../src/systems/missions.js';
import { combat } from '../src/systems/combat.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import { save as saveDefinition } from '../src/save/saveSystem.js';

const SEED = 15220;

function stationInfo(id) {
  for (const sector of SECTORS) {
    const station = (sector.stations || []).find((row) => row.id === id);
    if (station) return { ...station, sectorId: sector.id };
  }
  return null;
}

function roleOf(entity) {
  return entity && entity.data && entity.data.physicalRole || null;
}

function makeSaveHarness(sim, systems = {}) {
  const save = Object.create(saveDefinition);
  save.state = sim.state;
  save.bus = sim.bus;
  save.registry = { get: (name) => systems[name] || sim.registry.get(name) || null };
  save.helpers = sim.helpers;
  save._restoring = false;
  save._pendingRunTransition = null;
  save._restoreSequence = 0;
  save._lastAutosaveAt = 0;
  save._lastAutosavePlaytime = 0;
  save._rollbackCaptureActive = false;
  save._rollbackInProgress = false;
  return save;
}

function bootWorld({ withBossSystem = true } = {}) {
  // Each runtime gets its own system instance wired with the PRODUCTION ports (a fresh instance
  // per sim mirrors how forks and registries own one lifecycle each).
  const bossSystem = withBossSystem ? createProductionCapitalBossEncounters() : null;
  const systems = [
    missions,
    combat,
    ...(bossSystem ? [bossSystem] : []),
  ];
  const sim = createSimulation({ seed: SEED, systems, updateOrder: [] });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 250000;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8, mass: 24,
  });
  state.playerId = player.id;
  return { sim, state, player, missionsSys: sim.registry.get('missions'), bossSystem };
}

function acceptCapital(h) {
  const dest = stationInfo(CAPITAL_BOSS.destStationId);
  const origin = stationInfo(CAPITAL_BOSS.startStationId);
  assert.ok(dest && origin, 'capital boss stations must exist');
  h.state.world.currentSectorId = dest.sectorId;
  const board = h.missionsSys.ensureBoard(origin.id);
  const offer = (board.slots || []).find((row) => (
    row && row.source === CAPITAL_BOSS_SOURCE && row.params && row.params.capitalBossId === CAPITAL_BOSS.id
  ));
  assert.ok(offer, 'capital boss must post');
  offer.collateral_cr = 0;
  assert.equal(h.missionsSys.acceptMission(offer.id), true, 'capital boss must accept');
  const mission = h.state.missions.active.find((row) => row.type === CAPITAL_BOSS_TYPE);
  assert.ok(mission, 'capital boss must be active');
  assert.equal(mission.params.encounterId, CAPITAL_BOSS_ENCOUNTER_ID);
  h.missionsSys._ensureMissionTargets(mission);
  return mission;
}

function targetsByRole(h, mission, role) {
  return (mission.targetEntityIds || []).map((id) => h.state.entities.get(id)).filter((e) => (
    e && e.alive !== false && roleOf(e) === role
  ));
}

function fightRecord(state) {
  return state.capitalBossEncounters && state.capitalBossEncounters.fights
    && Object.values(state.capitalBossEncounters.fights)[0];
}

function aliveCount(state) {
  return state.entityList.filter((e) => e && e.alive !== false).length;
}

test('capital boss save round trip: act II fight, spent rock and a wing member survive Continue', () => {
  const h = bootWorld();
  let b = null;
  try {
    const mission = acceptCapital(h);

  const boss = targetsByRole(h, mission, 'capital_hull')[0];
  const rocks = targetsByRole(h, mission, 'throw_mass');
  assert.equal(rocks.length, 3, 'the authored three-rock ballast must spawn');
  assert.ok(boss, 'the capital must spawn');
  assert.equal((boss.hullMax | 0), 680, 'the packet hull lands (IRON MAW 680)');

  // Range gate: bring the player inside the 620 WU engage radius (but well clear of the 205 WU
  // wing anchors behind the boss, so placement safety never has to deny a wing member here).
  h.player.pos.set(boss.pos.x + 500, 0, boss.pos.z);
  h.player.prevPos.copy(h.player.pos);

  // Cross into act II by hull (<= 68%) and run fixed ticks until the wing is requested and bound.
  boss.hull = Math.floor(boss.hullMax * 0.5);
  let ticks = 0;
  while (ticks < 60 * 60) {
    h.state.tick += 1;
    h.state.simTime += 1 / 60;
    h.bossSystem.update(1 / 60, h.state);
    ticks += 1;
    const record = fightRecord(h.state);
    const wing = record && record.wings && Object.values(record.wings)[0];
    if (record && record.actIndex >= 1 && wing && wing.bound
      && wing.ids.filter((id) => id != null).length >= 1) break;
  }
  const record = fightRecord(h.state);
  assert.ok(record, 'the fight record must exist after start');
  assert.ok(record.actIndex >= 1, `the fight must reach act II (got ${record.actIndex})`);
  const wing = record.wings && Object.values(record.wings)[0];
  assert.ok(wing && wing.bound, 'the act-II wing must be requested and bound');
  assert.equal(wing.ids.length, 2, 'the wing receipt is a two-slot array');
  // Consume one member after spawn (a wing loss) so exactly one stays live: the durable
  // two-slot receipt must keep the loss as a null tombstone, never a resurrection.
  const firstMember = h.state.entities.get(wing.ids[0]);
  const secondMember = h.state.entities.get(wing.ids[1]);
  assert.ok(firstMember && firstMember.alive !== false, 'wing member one is live');
  if (secondMember && secondMember.alive !== false) secondMember.alive = false;
  const savedLiveWingIds = wing.ids.filter((id) => {
    const e = h.state.entities.get(id);
    return e && e.alive !== false;
  });
  assert.equal(savedLiveWingIds.length, 1, 'exactly one wing member is live in this fixture');

  // Spend one rock the physical way: consumed/removed, its issuance slot stays issued.
  const spentRock = rocks[0];
  h.state.entities.get(spentRock.id).alive = false;
  const castBeforeSave = record.cast ? JSON.parse(JSON.stringify({
    beatId: record.cast.beatId, hitKeys: record.cast.hitKeys, shapes: record.cast.shapes,
  })) : null;

  // Serialize with the REAL save seam.
  const saveA = makeSaveHarness(h.sim);
  const data = saveA.serializeData();
  assert.ok(data.capitalBoss && data.capitalBoss.version === 1, 'score slice serialized at v1');
  const savedFight = data.capitalBoss.fights[record.fightId];
  assert.ok(savedFight, 'the live fight is in the save');
  assert.equal(savedFight.actIndex, record.actIndex, 'act II is on the save');
  assert.ok(savedFight.clock > 0, 'encounter clock advanced');
  const savedWing = Object.values(savedFight.wings || {});
  assert.ok(savedWing.length >= 1, 'the wing receipt is on the save');
  const savedWingIds = savedWing[0].ids;
  assert.equal(savedWingIds.length, 2, 'the two-slot wing receipt is on the save');
  assert.ok(savedWingIds.every((id) => id != null), 'the record retains both member ids');
  // The missions slice shape depends on the owner's serializer (legacy wrapper or system-owned);
  // both carry the active list with serialized mission params.
  const savedActiveList = (data.missions && ((data.missions.missions && data.missions.missions.active)
    || data.missions.active)) || [];
  const savedMission = savedActiveList.find((row) => row.id === mission.id);
  assert.ok(savedMission, 'mission serialized');
  assert.equal(Object.keys(savedMission.params.capitalActorLedger).length, 4,
    'capital + three rocks are durable issuance slots');
  assert.equal(Object.values(savedMission.params.capitalActorLedger)
    .filter((entry) => entry.state === 'issued').length, 4,
    'all four issued slots stay issued even with one rock spent');

  // Restore into a fresh world: new runtime ids, same saved score/mission slices. A second live
  // instance of the system stands in for the rematerializing runtime.
  b = bootWorld({ withBossSystem: false });
  const restoredBossSystem = createCapitalBossEncounters({
    observe: () => ({ boss: null, target: null, active: false }),
    spawnWing: () => [],
  });
  restoredBossSystem.init({
    state: b.state,
    bus: b.sim.bus,
    helpers: { routeCombatDamage: () => {} },
  });
  const saveB = makeSaveHarness(b.sim, { capitalBossEncounters: restoredBossSystem });
  const entityIdRemap = new Map();
  b.state.simTime = h.state.simTime;
  b.state.tick = h.state.tick;
  saveB._restoreMissions(JSON.parse(JSON.stringify(data.missions)));
  saveB._spawnPersistentEntities(data.entities && data.entities.persistent, entityIdRemap);
  saveB._restoreCapitalBossFights(JSON.parse(JSON.stringify(data.capitalBoss)));

  const restored = fightRecord(b.state);
  assert.ok(restored, 'the score record must restore');
  assert.equal(restored.clock, savedFight.clock, 'same-world restore keeps the saved tick');
  assert.equal(restored.actIndex, savedFight.actIndex, 'act II survives the round trip');
  if (castBeforeSave) {
    assert.ok(restored.cast, 'the in-flight cast survives the round trip');
    assert.deepEqual(restored.cast.hitKeys, castBeforeSave.hitKeys,
      'hit receipts survive exactly (no double pulse)');
    assert.equal(restored.cast.beatId, castBeforeSave.beatId, 'the same beat is in flight');
  }
  // Same seed ⇒ both worlds allocate identical id sequences, so equality alone proves nothing;
  // the rebind is proven by the remap: the restored fight points at B's OWN boss entity and the
  // saved id maps to it through the persistent-entity remap.
  const restoredMission = b.state.missions.active.find((row) => row.id === mission.id);
  assert.ok(restoredMission, 'mission restored');
  const restoredBoss = targetsByRole(b, restoredMission, 'capital_hull')[0];
  assert.ok(restoredBoss, 'the capital rematerialized from the persistent list');
  assert.equal(restored.bossId, restoredBoss.id, 'boss rebinds onto the rematerialized capital');
  assert.equal(entityIdRemap.get(String(savedFight.bossId)), restoredBoss.id,
    'the saved boss id remaps onto the same rematerialized capital');
  assert.equal(restored.targetId, b.state.playerId, 'target rebinds onto the new player id');

  const restoredWing = Object.values(restored.wings || {})[0];
  assert.equal(restoredWing.ids.length, savedWingIds.length, 'wing cardinality is preserved');
  const restoredLiveIds = restoredWing.ids.filter((id) => id != null);
  assert.equal(restoredLiveIds.length, 1, 'the wing loss stays a durable null tombstone');
  assert.equal(restoredLiveIds[0], entityIdRemap.get(String(wing.ids[0])),
    'the present wing member rebinds to its rematerialized id');

  // Mission owner reconciliation: targets and ledgers point at live ids again.
  const restoredRocks = targetsByRole(b, restoredMission, 'throw_mass');
  assert.equal(restoredRocks.length, 2, 'only the two unspent rocks rematerialize');
  assert.equal(restoredRocks.every((rock) => restoredMission.targetEntityIds.includes(rock.id)), true,
    'the surviving ballast is registered on the mission again');
  assert.equal(Object.keys(restoredMission.params.capitalActorLedger).length, 4,
    'the spent rock keeps its issued slot');
  assert.equal(Object.keys(restoredMission.params.capitalWingLedger).length, 2,
    'the wing ledger keeps both slots (one live, one consumed)');

  // The critical anti-fountain assertion: re-running the spawner mints NOTHING.
  const before = aliveCount(b.state);
  b.missionsSys._ensureMissionTargets(restoredMission);
  assert.equal(aliveCount(b.state), before, 'no actor is re-minted: no rock replenish, no wing resurrection');
  b.missionsSys._ensureMissionTargets(restoredMission);
  assert.equal(aliveCount(b.state), before, 'the spawner stays inert on repeated passes');
  } finally {
    h.sim.dispose();
    if (b) b.sim.dispose();
  }
});

test('capital boss save slice without an owner throws instead of silently dropping the fight', () => {
  const h = bootWorld();
  acceptCapital(h);
  const saveA = makeSaveHarness(h.sim);
  const data = saveA.serializeData();
  assert.ok(data.capitalBoss, 'a started fight is serialized');

  const b = bootWorld({ withBossSystem: false });
  const saveB = makeSaveHarness(b.sim);
  // Simulate a runtime without the system registered.
  saveB.registry = { get: () => null };
  assert.throws(() => saveB._restoreCapitalBossFights(JSON.parse(JSON.stringify(data.capitalBoss))),
    undefined, 'a present slice without its owner is a hard error');
  h.sim.dispose();
  b.sim.dispose();
});

test('old saves without a capital slice restore cleanly (no fights, no throw)', () => {
  const h = bootWorld();
  const save = makeSaveHarness(h.sim);
  save._restoreCapitalBossFights(undefined);
  assert.ok(!fightRecord(h.state), 'no fight records appear from an absent slice');
  h.sim.dispose();
});
