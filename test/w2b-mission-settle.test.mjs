// W2-B O10 / O18 / O19 — contracts settle correctly at the edges:
//   O10  defeat charges the wreck's recovery loss and the failed reservation ONCE
//   O18  the opening story contract cannot be abandoned, in the log or through any intent
//   O19  a throw between the status flip and the row removal cannot leave a ghost mission row
import assert from 'node:assert/strict';
import test from 'node:test';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { MISSION_TUNING } from '../src/data/missions.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { buildRecoveryPlan } from '../src/combat/playerDefeat.js';
import { combat } from '../src/systems/combat.js';
import { addCargo, removeCargo } from '../src/systems/cargo.js';
import {
  CONTRACT_47A_B0_TAG,
  CONTRACT_47A_SAMPLE_ID,
  missions as missionsProto,
} from '../src/systems/missions.js';
import { abandonSlotHtml } from '../src/ui/screens/missionLog.js';
import { STORY_SPINE_KEEP_TEXT, isStorySpineContract } from '../src/data/storySpine.js';

class Bus {
  constructor() { this.handlers = new Map(); this.log = []; }
  on(name, fn) {
    const rows = this.handlers.get(name) || [];
    rows.push(fn);
    this.handlers.set(name, rows);
    return () => this.off(name, fn);
  }
  off(name, fn) {
    this.handlers.set(name, (this.handlers.get(name) || []).filter((entry) => entry !== fn));
  }
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

const count = (bus, name, predicate = () => true) => (
  bus.log.filter((entry) => entry.name === name && predicate(entry.payload || {})).length
);

// -- O10: defeat settles the loss once ---------------------------------------------------------

const GOOD = 'cmdty_salvage_electronics';

function deathWorld() {
  const state = {
    meta: { seed: 47, playtimeS: 0 }, seed: 47, tick: 0, simTime: 100, mode: 'flight', playerId: 1,
    player: {
      credits: 5000, researchPoints: 0, stats: {},
      cargo: { items: {}, capVolume: 1000, capMass: 1000, usedVolume: 0, usedMass: 0 },
      activeShipIndex: 0, ownedShips: [{ defId: 'ship_kestrel' }], insurance: {},
    },
    missions: {
      boards: {}, active: [], completedLog: [], receipts: [], nextId: 1,
      config: JSON.parse(JSON.stringify(MISSION_TUNING)),
    },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    factions: { faction_mts: { rep: 500 } },
    world: { currentSectorId: 'sector_helios_prime', activeSector: { stations: [] } },
    entities: new Map(), entityList: [], ui: { docked: false, dockedStationId: null, trackedMissionId: null },
    nav: {}, settings: { gameplay: { tutorialHints: false } },
  };
  const bus = new Bus();
  const missions = { ...missionsProto };
  missions.init({ state, bus, helpers: { hash32, mulberry32, voice: { say: () => true } },
    registry: { get: () => null } });
  return { state, bus, missions };
}

test('10 sealed + 2 personal units, recovery loss 6: defeat takes the loss once and the personal units survive', () => {
  const { state, bus } = deathWorld();
  const offer = {
    id: 'offer_w2b_o10', type: 'cargo_delivery', stationId: 'station_helios', factionId: 'faction_mts',
    params: { cmdtyId: GOOD, qty: 10 }, reward_cr: 800, collateral_cr: 0, riskTier: 2,
    destStationId: 'station_beltout', destSectorId: 'sector_ceres_belt', distance: 1200,
    title: 'Haul the lot to Belt Outpost', source: 'careerContract', preloadedCargo: true,
  };
  bus.emit('mission:offered', offer);
  bus.emit('ui:acceptMission', { missionId: offer.id });
  const mission = state.missions.active.find((m) => m.sourceOfferId === offer.id);
  assert.ok(mission, 'the sealed delivery is live');
  assert.equal(state.player.cargo.items[GOOD], 10, 'the manifest was loaded');
  addCargo(state, GOOD, 2); // the pilot\'s own units of the same good
  assert.equal(state.player.cargo.items[GOOD], 12);

  // The recovery plan the defeat receipt carries (real math): half the hold = 6 units.
  const plan = buildRecoveryPlan(state, null);
  assert.deepEqual(plan.cargoLosses.filter((l) => l.commodityId === GOOD), [{ commodityId: GOOD, qty: 6 }]);

  // Death: the receipt is captured BEFORE player:death; missions fails the leg on that event.
  bus.emit('player:death', { recoverable: true, pos: { x: 10, z: 10 }, recovery: plan });
  const failed = bus.log.find((e) => e.name === 'mission:failed');
  assert.equal(failed.payload.reason, 'ship_lost');
  assert.equal(state.missions.active.some((m) => m.id === mission.id && m.status === 'active'), false);

  // Recovery: combat applies the receipt's plan verbatim at the berth.
  const c = Object.create(combat);
  c.state = state;
  c.bus = new Bus();
  c.restorePlayerAtRecoveryDock = () => {};
  state.entities.set(1, { id: 1, pos: { x: 0, z: 0 }, data: {} });
  c._pendingPlayerRecovery = { playerId: 1, receipt: { recovery: plan } };
  const res = c.recoverPendingPlayer({});
  assert.equal(res.ok, true);

  assert.equal(state.player.cargo.items[GOOD], 2,
    'only the surviving reserved freight was removed: the 2 personal units are still aboard');
  const receipt = state.missions.receipts.find((r) => r.missionId === mission.id);
  assert.equal(receipt.outcome, 'failed');
  assert.equal(receipt.contractCargoRemoved, 10, 'the whole manifest is accounted for on the receipt');
});

test('a loss larger than the manifest takes the personal units it should, and nothing twice', () => {
  const { state, bus } = deathWorld();
  const offer = {
    id: 'offer_w2b_o10b', type: 'cargo_delivery', stationId: 'station_helios', factionId: 'faction_mts',
    params: { cmdtyId: GOOD, qty: 4 }, reward_cr: 500, collateral_cr: 0, riskTier: 1,
    destStationId: 'station_beltout', destSectorId: 'sector_ceres_belt', distance: 1200,
    title: 'Small lot', source: 'careerContract', preloadedCargo: true,
  };
  bus.emit('mission:offered', offer);
  bus.emit('ui:acceptMission', { missionId: offer.id });
  addCargo(state, GOOD, 8); // hold of 12: 4 reserved + 8 personal, plan loss 6
  const plan = buildRecoveryPlan(state, null);
  assert.equal(plan.cargoLosses[0].qty, 6);
  bus.emit('player:death', { recoverable: true, pos: { x: 0, z: 0 }, recovery: plan });
  // Survivors (6) >= need (4): the contract is NOT failed by this death; the plan alone applies.
  assert.equal(count(bus, 'mission:failed'), 0);
  const c = Object.create(combat);
  c.state = state; c.bus = new Bus(); c.restorePlayerAtRecoveryDock = () => {};
  state.entities.set(1, { id: 1, pos: { x: 0, z: 0 }, data: {} });
  c._pendingPlayerRecovery = { playerId: 1, receipt: { recovery: plan } };
  assert.equal(c.recoverPendingPlayer({}).ok, true);
  assert.equal(state.player.cargo.items[GOOD], 6, 'one loss of 6 from 12, applied once');
});

// -- O18: the story spine cannot be abandoned ---------------------------------------------------

function openingWorld(seed = 47) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 10;
  state.playerId = 1;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 200 };
  state.entities.set(1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } });
  const asteroid = { id: 2, type: 'asteroid', alive: true, pos: { x: 180, z: -60 }, data: { typeId: 'ast_common_rock' } };
  const station = { id: 3, type: 'station', alive: true, pos: { x: -420, z: 100 }, data: { stationId: 'station_helios', name: 'Helios Station' } };
  state.entities.set(2, asteroid);
  state.entities.set(3, station);
  state.entityList.push(asteroid, station);
  state.onboarding = { active: false, finished: true };
  state.settings.gameplay.tutorialHints = false;
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (payload) => toasts.push(payload));
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers: { voice: { say: () => true },
    mulberry32: (value) => { let a = value >>> 0; return () => ((a = (a + 0x6D2B79F5) >>> 0) / 4294967296); } },
  registry: { get: () => null } });
  missions.newGame();
  return { state, bus, missions, asteroid, toasts };
}

const b0 = (h) => h.state.missions.active.find((m) => m.storyTag === CONTRACT_47A_B0_TAG);

test('the opening 47-A contract refuses every abandon path and still reaches beat 1 via mine + dock', () => {
  const h = openingWorld();
  const mission = b0(h);
  assert.ok(mission, 'new game receives the opening contract');
  assert.equal(isStorySpineContract(mission), true);

  assert.equal(h.missions.abandonMission(mission.id), false, 'direct call refused');
  h.bus.emit('ui:abandonMission', { missionId: mission.id });
  assert.equal(b0(h)?.status, 'active', 'the UI intent is refused too');
  assert.equal(h.state.missions.active.length, 1, 'the log is not emptied');
  assert.equal(h.state.missions.receipts.length, 0, 'no failure receipt was written');
  assert.ok(h.toasts.some((t) => t.text === STORY_SPINE_KEEP_TEXT), 'the pilot is told why');

  // The spine still runs: recover the sample at the marked rock, dock at Helios.
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 0, 'docking before recovery cannot skip the contract');
  h.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1, minerId: 1, pos: { ...h.asteroid.pos } });
  assert.equal(h.state.player.cargo.items[CONTRACT_47A_SAMPLE_ID], 1);
  assert.equal(h.missions.abandonMission(mission.id), false, 'still refused with the sample aboard');
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 1, 'the story reaches beat 1');
  assert.equal(b0(h), undefined, 'the contract settled normally');
});

test('ordinary contracts can still be abandoned', () => {
  const { state, bus, missions } = deathWorld();
  const offer = {
    id: 'offer_w2b_plain', type: 'cargo_delivery', stationId: 'station_helios', factionId: 'faction_mts',
    params: { cmdtyId: GOOD, qty: 2 }, reward_cr: 300, collateral_cr: 0, riskTier: 1,
    destStationId: 'station_beltout', destSectorId: 'sector_ceres_belt', distance: 1200,
    title: 'Plain haul', source: 'careerContract', preloadedCargo: true,
  };
  bus.emit('mission:offered', offer);
  bus.emit('ui:acceptMission', { missionId: offer.id });
  const mission = state.missions.active[0];
  assert.ok(mission);
  assert.equal(isStorySpineContract(mission), false);
  assert.equal(missions.abandonMission(mission.id), true);
  assert.equal(state.missions.active.length, 0);
});

test('the log shows the story note where Abandon would be, and Abandon for ordinary work', () => {
  const spine = abandonSlotHtml({ id: 'm1', storyTag: CONTRACT_47A_B0_TAG }, 'Recover the sample');
  assert.match(spine, /Part of your story/);
  assert.match(spine, /it stays on your log\./);
  assert.doesNotMatch(spine, /<button|data-act="abandon"/, 'no abandon control on the spine');
  const plain = abandonSlotHtml({ id: 'm2', storyTag: 'career:miner:1' }, 'Plain haul');
  assert.match(plain, /data-act="abandon"/);
  assert.match(plain, /aria-label="Abandon Plain haul"/);
  assert.doesNotMatch(plain, /Part of your story/);
  const bare = abandonSlotHtml({ id: 'm3' }, 'No tag');
  assert.match(bare, /data-act="abandon"/);
});

// -- O19: settlement is exception-safe ----------------------------------------------------------

function plainOffer(id) {
  return {
    id, type: 'cargo_delivery', stationId: 'station_helios', factionId: 'faction_mts',
    params: { cmdtyId: GOOD, qty: 1 }, reward_cr: 700, collateral_cr: 0, riskTier: 1,
    destStationId: 'station_beltout', destSectorId: 'sector_ceres_belt', distance: 1200,
    title: 'Plain haul ' + id, source: 'careerContract', preloadedCargo: true,
  };
}

function accept(world, offer) {
  world.bus.emit('mission:offered', offer);
  world.bus.emit('ui:acceptMission', { missionId: offer.id });
  const mission = world.state.missions.active.find((m) => m.sourceOfferId === offer.id);
  assert.ok(mission, 'accepted ' + offer.id);
  return mission;
}

const grants = (bus, id) => bus.log.filter((e) => e.name === 'economy:grantCredits'
  && e.payload.reason === `mission:${id}`);

test('a throwing debrief on completion still frees the slot and pays exactly once', () => {
  const world = deathWorld();
  const mission = accept(world, plainOffer('offer_w2b_o19a'));
  const original = world.missions._emitMissionDebrief;
  world.missions._emitMissionDebrief = () => { throw new Error('debrief blew up'); };
  const index = world.state.missions.active.indexOf(mission);
  assert.throws(() => world.missions._completeMission(mission, index), /debrief blew up/);
  assert.equal(world.state.missions.active.length, 0, 'no ghost row eats a slot');
  assert.equal(mission.status, 'completed');
  assert.equal(grants(world.bus, mission.id).length, 1, 'the reward landed once');

  // Re-settling the same instance pays nothing more.
  world.missions._emitMissionDebrief = original;
  world.missions._completeMission(mission, 0);
  assert.equal(grants(world.bus, mission.id).length, 1);
  assert.equal(world.state.missions.active.length, 0);
});

test('a throw during failure or expiry also removes the row', () => {
  const failing = deathWorld();
  const m1 = accept(failing, plainOffer('offer_w2b_o19b'));
  failing.missions._emitMissionDebrief = () => { throw new Error('boom'); };
  assert.throws(() => failing.missions._failMission(m1, 0, 'abandoned'), /boom/);
  assert.equal(failing.state.missions.active.some((r) => r.id === m1.id), false);
  assert.ok(failing.state.missions.active.every((r) => r.status === 'active'));
  assert.equal(m1.status, 'failed');

  const expiring = deathWorld();
  const m2 = accept(expiring, plainOffer('offer_w2b_o19c'));
  expiring.missions._emitMissionDebrief = () => { throw new Error('boom'); };
  assert.throws(() => expiring.missions._expireMission(m2, 0), /boom/);
  // An expired contract may leave its refiled successor behind (live, active); the expired row
  // itself is gone.
  assert.equal(expiring.state.missions.active.some((r) => r.id === m2.id), false);
  assert.ok(expiring.state.missions.active.every((r) => r.status === 'active'));
  assert.equal(m2.status, 'expired');
});

test('a settled ghost row left by an older crash is swept on the next tick and dropped on load', () => {
  const world = deathWorld();
  const mission = accept(world, plainOffer('offer_w2b_o19d'));
  mission.status = 'completed'; // the pre-fix crash artifact: settled, still listed
  world.missions.update(1 / 60, world.state);
  assert.equal(world.state.missions.active.length, 0, 'update() sweeps the ghost');

  const saved = JSON.parse(JSON.stringify({
    ...world.missions.serialize(),
    active: [{ ...mission, status: 'completed' }, { ...mission, id: 'm_keep', status: 'active' }],
  }));
  world.missions.deserialize(saved);
  assert.deepEqual(world.state.missions.active.map((m) => m.id), ['m_keep'], 'a saved ghost is not restored');
});
