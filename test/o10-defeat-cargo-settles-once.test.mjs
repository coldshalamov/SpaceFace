// O10 (BETA_PLAN_2026-10-23, save-loss risk): a defeat that carries contract freight settles the
// cargo loss and the contract freight exactly ONCE.
//
// This drives the REAL defeat path end to end on one bus:
//   combat.kill(player)            -> receipt with the recovery plan, then `player:death`
//   missions._onPlayerDeathMissions -> fails the contracts whose manifest the wreck cannot keep,
//                                      charging the wreck's loss against the sealed freight first
//   `player:recoveryRequested`     -> combat.recoverPendingPlayer applies the plan verbatim
// and asserts what the player's hold, the contract log and the credit ledger end up as.
//
// The hand-built single-contract case lives in test/w2b-mission-settle.test.mjs; this file adds the
// real kill path, the ledger/receipt/penalty counts, sibling contracts and the repeat-event guards.
import assert from 'node:assert/strict';
import test from 'node:test';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { MISSION_TUNING } from '../src/data/missions.js';
import { buildRecoveryPlan } from '../src/combat/playerDefeat.js';
import { combat } from '../src/systems/combat.js';
import { addCargo, releasableContractUnits } from '../src/systems/cargo.js';
import { missions as missionsProto } from '../src/systems/missions.js';

const GOOD = 'cmdty_salvage_electronics';
const ORE = 'cmdty_ore_iron';

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

const events = (bus, name, predicate = () => true) => bus.log
  .filter((entry) => entry.name === name && predicate(entry.payload || {}))
  .map((entry) => entry.payload || {});

function vec(x, z) {
  return {
    x, y: 0, z,
    copy(other) { this.x = other.x; this.y = other.y || 0; this.z = other.z; return this; },
  };
}

function makeWorld() {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: vec(0, 0), prevPos: vec(0, 0), vel: vec(12, -4), rot: 0, flags: {},
    data: { defId: 'ship_kestrel' },
    hull: 0, hullMax: 140, armorHp: 0, armorMax: 30, shield: 0, shieldMax: 55, cap: 0, capMax: 80,
  };
  const attacker = {
    id: 9, type: 'ship', alive: true, team: 1, factionId: 'faction_reach',
    pos: vec(0, 80),
    data: { defId: 'ship_drifter', lootTableId: 'reaver_pirate', shipClass: 'gunship' },
  };
  const state = {
    tick: 300, simTime: 100, mode: 'flight', playerId: 1, seed: 47,
    meta: { seed: 47, playtimeS: 0 },
    settings: { gameplay: { difficulty: 'standard', tutorialHints: false } },
    content: {},
    input: { actions: {} },
    player: {
      credits: 5000, researchPoints: 0, stats: {},
      insurance: { rate: 0.6, deductibleCr: 500, insuredModules: false, lastStationId: 'station_helios' },
      ownedShips: [{ defId: 'ship_kestrel', fittings: [] }],
      activeShipIndex: 0,
      cargo: { items: {}, capVolume: 1000, capMass: 1000, usedVolume: 0, usedMass: 0 },
    },
    missions: {
      boards: {}, active: [], completedLog: [], receipts: [], nextId: 1,
      config: JSON.parse(JSON.stringify(MISSION_TUNING)),
    },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0, persistentCargo: [] },
    factions: { faction_mts: { rep: 500 } },
    combat: {},
    entities: new Map([[1, player], [9, attacker]]),
    entityList: [player, attacker],
    world: {
      currentSectorId: 'sector_helios_prime',
      activeSector: { stations: [{ stationId: 'station_helios', pos: { x: 320, z: -80 } }] },
    },
    ui: { docked: false, dockedStationId: null, trackedMissionId: null },
    nav: {},
  };
  const bus = new Bus();
  // `combat` is a module singleton: clear the latches an earlier test in this file may have left.
  combat._pendingPlayerRecovery = null;
  combat._recoveryInFlight = false;
  const helpers = { hash32, mulberry32, voice: { say: () => true } };
  const registry = { get: () => null };
  const missions = { ...missionsProto };
  missions.init({ state, bus, helpers, registry });
  combat.init({ state, bus, helpers, registry });
  return { state, bus, player, missions };
}

function acceptSealed(world, id, qty) {
  const offer = {
    id, type: 'cargo_delivery', stationId: 'station_helios', factionId: 'faction_mts',
    params: { cmdtyId: GOOD, qty }, reward_cr: 800, collateral_cr: 0, riskTier: 2,
    destStationId: 'station_beltout', destSectorId: 'sector_ceres_belt', distance: 1200,
    title: `Haul ${qty} to Belt Outpost`, source: 'careerContract', preloadedCargo: true,
  };
  world.bus.emit('mission:offered', offer);
  world.bus.emit('ui:acceptMission', { missionId: offer.id });
  const mission = world.state.missions.active.find((m) => m.sourceOfferId === id);
  assert.ok(mission, `the sealed delivery ${id} is live`);
  return mission;
}

const held = (world, id = GOOD) => world.state.player.cargo.items[id] || 0;

function assertHoldSane(world) {
  const cargo = world.state.player.cargo;
  for (const [id, qty] of Object.entries(cargo.items)) {
    assert.ok(Number.isInteger(qty) && qty >= 0, `hold quantity for ${id} is a non-negative integer (${qty})`);
  }
  assert.ok(cargo.usedVolume >= 0 && cargo.usedMass >= 0, 'hold usage never goes negative');
}

const LETHAL = {
  origin: { kind: 'weapon', id: 'wpn_autocannon_s' },
  packet: { source: { weaponId: 'wpn_autocannon_s' } },
  result: { dominantLayer: 'hull' },
};

const failedFor = (world, mission) => events(world.bus, 'mission:failed', (p) => p.missionId === mission.id);
const receiptsFor = (world, mission) => world.state.missions.receipts.filter((r) => r.missionId === mission.id);
const penaltiesFor = (world) => events(world.bus, 'faction:repDelta', (p) => /^mission_failed:/.test(String(p.reason)));
const recoveryCharges = (world) => events(world.bus, 'economy:chargeCredits', (p) => /^recovery:/.test(String(p.reason)));

test('real defeat: 10 sealed + 2 personal units, wreck loss 6 - the freight settles once and the personal units survive', () => {
  const world = makeWorld();
  const mission = acceptSealed(world, 'offer_o10_main', 10);
  assert.equal(held(world), 10, 'the manifest was loaded at accept');
  addCargo(world.state, GOOD, 2); // the pilot's own units of the same good
  assert.equal(held(world), 12);

  const quote = buildRecoveryPlan(world.state, world.player);
  assert.deepEqual(quote.cargoLosses.filter((l) => l.commodityId === GOOD), [{ commodityId: GOOD, qty: 6 }],
    'documented loss: floor(half) of the 12 units held');

  // The real kill. A second lethal hit on the same wreck must not settle anything again.
  combat.kill(world.player, 9, LETHAL);
  combat.kill(world.player, 9, LETHAL);

  const deaths = events(world.bus, 'player:death');
  assert.equal(deaths.length, 1, 'one defeat, one player:death');
  assert.deepEqual(deaths[0].recovery.cargoLosses.filter((l) => l.commodityId === GOOD),
    [{ commodityId: GOOD, qty: 6 }], 'the receipt carries the plan recovery will apply verbatim');

  // The contract is failed exactly once, with one receipt and one standing penalty.
  const failed = failedFor(world, mission);
  assert.equal(failed.length, 1, 'exactly one mission:failed for the sealed contract');
  assert.equal(failed[0].reason, 'ship_lost');
  assert.equal(receiptsFor(world, mission).length, 1, 'exactly one failure receipt');
  assert.equal(receiptsFor(world, mission)[0].outcome, 'failed');
  assert.equal(penaltiesFor(world).length, 1, 'the failure standing penalty is charged once');
  assert.ok(penaltiesFor(world)[0].delta < 0);
  assert.equal(world.state.missions.active.some((m) => m.id === mission.id), false, 'the failed row left the log');

  // The reserved freight that survives the wreck's loss (10 - 6 = 4) is forfeited with the contract.
  assert.equal(held(world), 8, 'before recovery: 12 - 4 forfeited freight units');
  assertHoldSane(world);

  // Recovery (a double click must not charge or strip twice).
  world.bus.emit('player:recoveryRequested', { source: 'after_action' });
  world.bus.emit('player:recoveryRequested', { source: 'duplicate' });

  assert.equal(held(world), 2, '10 manifest units gone in total, the 2 personal units are still aboard');
  assertHoldSane(world);
  const respawns = events(world.bus, 'player:respawn');
  assert.equal(respawns.length, 1, 'one respawn');
  assert.equal(respawns[0].cargoLostQty, 6, 'the berth removed exactly the plan loss');
  assert.equal(recoveryCharges(world).length, 1, 'the berth charge lands once');
  assert.equal(events(world.bus, 'economy:grantCredits').length, 0, 'no payout, refund or reward on a lost ship');
  assert.equal(events(world.bus, 'player:recoveryFailed').filter((p) => p.reason === 'no_pending_defeat').length, 1,
    'the repeat request is refused, not applied');

  // The whole manifest is accounted for on the receipt, once.
  assert.equal(receiptsFor(world, mission)[0].contractCargoRemoved, 10);
  assert.equal(failedFor(world, mission).length, 1);
  assert.equal(receiptsFor(world, mission).length, 1);
  assert.equal(penaltiesFor(world).length, 1);

  // A replayed death payload (save/load or a duplicate relay) finds no contract left to fail.
  world.bus.emit('player:death', { ...deaths[0] });
  assert.equal(failedFor(world, mission).length, 1, 'a replayed death does not fail the contract again');
  assert.equal(held(world), 2, 'a replayed death does not strip the hold again');
  assertHoldSane(world);
});

test('personal cargo of another good follows the half-hold rule; the sealed freight is taken once on top of nothing', () => {
  const world = makeWorld();
  const mission = acceptSealed(world, 'offer_o10_other', 10);
  addCargo(world.state, ORE, 8);

  combat.kill(world.player, 9, LETHAL);
  const death = events(world.bus, 'player:death')[0];
  const lossOf = (id) => (death.recovery.cargoLosses.find((l) => l.commodityId === id) || { qty: 0 }).qty;
  assert.equal(lossOf(GOOD), 5, 'half of the 10 sealed units');
  assert.equal(lossOf(ORE), 4, 'half of the 8 personal ore');

  assert.equal(failedFor(world, mission).length, 1);
  assert.equal(held(world, ORE), 8, 'the failure only forfeits freight; personal ore waits for the berth');
  assert.equal(held(world, GOOD), 5, 'the 5 freight units the wreck does not take are forfeited with the contract');

  world.bus.emit('player:recoveryRequested', { source: 'after_action' });
  assert.equal(held(world, GOOD), 0, 'the manifest is gone exactly once (5 forfeited + 5 lost to the wreck)');
  assert.equal(held(world, ORE), 4, 'personal ore lost exactly the documented half');
  assert.equal(events(world.bus, 'player:respawn')[0].cargoLostQty, 9);
  assert.equal(receiptsFor(world, mission)[0].contractCargoRemoved, 10);
  assertHoldSane(world);
});

test('real defeat: freight that survives the wreck keeps its contract and the loss applies once', () => {
  const world = makeWorld();
  const mission = acceptSealed(world, 'offer_o10_survives', 4);
  addCargo(world.state, GOOD, 8); // hold of 12: 4 reserved + 8 personal, wreck loss 6

  combat.kill(world.player, 9, LETHAL);
  assert.equal(failedFor(world, mission).length, 0, '12 - 6 = 6 survivors still cover the 4-unit manifest');
  assert.equal(held(world), 12, 'nothing is removed at death itself');

  world.bus.emit('player:recoveryRequested', { source: 'after_action' });
  world.bus.emit('player:recoveryRequested', { source: 'duplicate' });
  assert.equal(held(world), 6, 'one loss of 6 from 12');
  const live = world.state.missions.active.find((m) => m.id === mission.id);
  assert.ok(live && live.status === 'active', 'the contract is still live');
  assert.ok(releasableContractUnits(world.state, live) >= 4, 'its 4 freight units are still aboard to deliver');
  assertHoldSane(world);
});

test('real defeat: two sealed contracts of one good - only the one the wreck breaks fails, the other keeps its freight', () => {
  const world = makeWorld();
  const a = acceptSealed(world, 'offer_o10_a', 10);
  const b = acceptSealed(world, 'offer_o10_b', 6);
  addCargo(world.state, GOOD, 2);
  assert.equal(held(world), 18);

  combat.kill(world.player, 9, LETHAL);
  const loss = events(world.bus, 'player:death')[0].recovery.cargoLosses.find((l) => l.commodityId === GOOD).qty;
  assert.equal(loss, 9);

  // 18 - 9 = 9 survivors cover B (6) but not A (10).
  assert.equal(failedFor(world, a).length, 1, 'A fails once');
  assert.equal(failedFor(world, b).length, 0, 'B is untouched');
  assert.equal(penaltiesFor(world).length, 1, 'one penalty, for A only');

  world.bus.emit('player:recoveryRequested', { source: 'after_action' });
  assert.equal(held(world), 8, 'A is gone once (1 forfeited + 9 lost); B\'s 6 and the pilot\'s 2 remain');
  assert.equal(receiptsFor(world, a)[0].contractCargoRemoved, 10);
  const liveB = world.state.missions.active.find((m) => m.id === b.id);
  assert.ok(liveB && liveB.status === 'active');
  assert.equal(releasableContractUnits(world.state, liveB), 6, 'B still has all 6 reserved units aboard');
  assertHoldSane(world);
});

// Sibling over-commit guard: each contract's "do the survivors cover my manifest?" check used to read
// the whole surviving hold, so two sealed contracts of one good could BOTH pass on the same units
// (20 held as 10 + 10, wreck loss 10 -> 10 survive; each saw 10 >= 10 and kept its row, leaving
// two live contracts over-reserved on one 10-unit pile: nothing deliverable, nothing sellable).
// The newest contract is judged first and claims its share; the older one then fails once.
test('real defeat: two full sealed contracts of one good cannot both claim the same surviving units', () => {
  const world = makeWorld();
  const a = acceptSealed(world, 'offer_o10_full_a', 10);
  const b = acceptSealed(world, 'offer_o10_full_b', 10);
  combat.kill(world.player, 9, LETHAL);
  world.bus.emit('player:recoveryRequested', { source: 'after_action' });

  assert.equal(held(world), 10);
  const live = world.state.missions.active.filter((m) => m.id === a.id || m.id === b.id);
  assert.equal(live.length, 1, 'only one of the two contracts can still be backed by the 10 surviving units');
  assert.equal(releasableContractUnits(world.state, live[0]), 10, 'the survivor can still deliver its full manifest');
  assert.equal(failedFor(world, a).length + failedFor(world, b).length, 1, 'the other one failed exactly once');
  assert.equal(live[0].id, b.id, 'the newer contract keeps its freight; the older one is the one that fails');
  assert.equal(failedFor(world, a).length, 1);
  assert.equal(receiptsFor(world, a)[0].contractCargoRemoved, 10, 'the failed manifest is accounted for once');
  assert.equal(penaltiesFor(world).length, 1, 'one penalty, for the contract that failed');
  assertHoldSane(world);
});

test('real defeat: Continue re-armed from the stored receipt applies the receipt plan, not a re-priced one', () => {
  const world = makeWorld();
  const mission = acceptSealed(world, 'offer_o10_rearm', 10);
  addCargo(world.state, GOOD, 2);

  combat.kill(world.player, 9, LETHAL);
  assert.equal(failedFor(world, mission).length, 1);
  assert.equal(held(world), 8, 'forfeited freight already left the hold');

  // A reload over the after-action sheet: the in-memory latch is gone, the saved receipt remains.
  // Re-pricing from the post-forfeit hold of 8 would take only 4 and leave 4 contract units aboard
  // as loose personal cargo (duplicated freight), so the stored plan must be applied as written.
  combat._pendingPlayerRecovery = null;
  world.bus.emit('player:recoveryRequested', { source: 'after_action' });
  world.bus.emit('player:recoveryRequested', { source: 'duplicate' });

  assert.equal(held(world), 2, 'the 2 personal units survive; no contract unit is left over');
  const respawns = events(world.bus, 'player:respawn');
  assert.equal(respawns.length, 1);
  assert.equal(respawns[0].cargoLostQty, 6, 'the berth removed the receipt plan loss exactly');
  assert.equal(recoveryCharges(world).length, 1);
  assert.equal(failedFor(world, mission).length, 1);
  assertHoldSane(world);
});
