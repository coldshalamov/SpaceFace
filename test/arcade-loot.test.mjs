// Hull-burst overhaul, slice A: arcade loot (design doc section 7; flag `combat.arcadeLoot`).
//
// Owner, 2026-09-29: "there's shiny winnings that come out of them and accelerate towards you and
// bling into you ... it's a pain in the ass to have to collect them manually", and "I don't want to
// make this the kind of game wherein you kill something and then look at its loot and weigh its value
// against how much room you have in your pack and then decide to leave it there."
//
// Three rules, all for the PLAYER's own kill burst (`loot:drop` source `kill_burst`) only:
//   1. a short beat, then the loot homes to the hull from ANY distance (the ordinary magnet is 800 WU);
//   2. ore a full hold refuses converts to credits through the economy owner instead of floating;
//   3. run wallets (Survival/Crucible), ordinary pickups and the flag-off (frozen 47-A) profile are
//      untouched.
import assert from 'node:assert/strict';
import test from 'node:test';

import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { mining, MAGNET_APPROACH_MIN, MAGNET_RANGE } from '../src/systems/mining.js';

const DT = 1 / 60;
const SCRAP = COMMODITIES.find((c) => c.id === 'cmdty_scrap_metal');

function withFlag(value, fn) {
  const previous = COMBAT_FLAGS.arcadeLoot;
  COMBAT_FLAGS.arcadeLoot = value;
  try { return fn(); } finally { COMBAT_FLAGS.arcadeLoot = previous; }
}

/** A player at the origin and one pickup. `acceptUnits` simulates the cargo owner's answer. */
function harness({ pickupX = 1500, pickupData, acceptUnits = null } = {}) {
  const player = { id: 1, alive: true, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, flags: {} };
  const pickup = {
    id: 2, alive: true, type: 'pickup', pos: { x: pickupX, z: 0 }, vel: { x: 0, z: 0 }, radius: 2.2, mass: 0.1, collides: true,
    data: pickupData,
  };
  const state = {
    playerId: player.id,
    entities: new Map([[player.id, player], [pickup.id, pickup]]),
    entityList: [player, pickup],
    entityIndex: { __spacefaceEntityIndexV1: true, ready: true, pickups: [pickup] },
    player: { magnetRange: 0, miningBeam: { tierId: 'beam_mk1' }, cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 250 }, credits: 0 },
    mode: 'flight', input: { fireGroup: 0 }, simTime: 0, rng: () => 0.5,
  };
  const listeners = Object.create(null);
  const grants = [];
  const conversions = [];
  const spawned = [];
  const bus = {
    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); return () => {}; },
    emit(type, payload) {
      if (type === 'economy:grantCredits') grants.push(payload);
      if (type === 'loot:overflowConverted') conversions.push(payload);
      for (const fn of listeners[type] || []) fn(payload);
    },
  };
  mining.init({ state, bus, helpers: { spawnEntity: (spec) => { spawned.push(spec); return spec; } }, registry: { get: () => null } });
  if (acceptUnits != null) {
    // The cargo owner answers synchronously on the same payload, after mining's own listeners.
    bus.on('pickup:collected', (payload) => {
      const requested = payload.amount;
      const accepted = Math.min(requested, acceptUnits);
      payload.acceptedAmount = accepted;
      payload.rejectedAmount = requested - accepted;
    });
  }
  return { state, player, pickup, grants, conversions, spawned, bus };
}

const COMBAT_ORE = (over = {}) => ({ kind: 'ore', commodityId: 'cmdty_scrap_metal', amount: 15, combatLoot: true, homeAt: 0.5, ...over });

test('combat loot waits out its beat, then homes from far beyond the ordinary magnet range', () => {
  withFlag(true, () => {
    const { state, pickup } = harness({ pickupX: 1500, pickupData: COMBAT_ORE() });
    const startX = pickup.pos.x;
    assert.ok(1500 > MAGNET_RANGE, 'setup: the pickup is beyond the ordinary magnet');
    state.simTime = 0.2;
    for (let i = 0; i < 20; i++) mining.update(DT, state);
    assert.equal(pickup.vel.x, 0, 'the burst reads first: nothing moves during the beat');
    state.simTime = 0.6;
    for (let i = 0; i < 60; i++) mining.update(DT, state);
    assert.ok(pickup.vel.x < -MAGNET_APPROACH_MIN * 0.5,
      `after the beat it falls toward the hull from 1500 WU (vx ${pickup.vel.x.toFixed(1)})`);
    // Beyond the physics ring there is no body to push, so the pickup is stepped directly (measured on
    // the real runtime: without this a 1500 WU pickup never moved).
    assert.ok(pickup.pos.x < startX - 100, `and it actually travels (${startX} -> ${pickup.pos.x.toFixed(0)})`);
  });
});

test('ordinary pickups keep the ordinary magnet, and the flag off restores the old immediate/limited homing', () => {
  withFlag(true, () => {
    const far = harness({ pickupX: 1500, pickupData: { kind: 'ore', commodityId: 'cmdty_scrap_metal', amount: 15 } });
    far.state.simTime = 5;
    for (let i = 0; i < 30; i++) mining.update(DT, far.state);
    assert.equal(far.pickup.vel.x, 0, 'a mined/jettisoned pickup beyond 800 WU is not vacuumed');
  });
  withFlag(false, () => {
    const far = harness({ pickupX: 1500, pickupData: COMBAT_ORE() });
    far.state.simTime = 5;
    for (let i = 0; i < 30; i++) mining.update(DT, far.state);
    assert.equal(far.pickup.vel.x, 0, 'flag off: no home-from-anywhere');
    const near = harness({ pickupX: 300, pickupData: COMBAT_ORE({ homeAt: 99 }) });
    for (let i = 0; i < 30; i++) mining.update(DT, near.state);
    assert.ok(near.pickup.vel.x < 0, 'flag off: inside the magnet it homes at once, beat or no beat (the old rule)');
  });
});

test('ore a full hold refuses converts to credits through the economy owner; nothing is left floating', () => {
  withFlag(true, () => {
    const h = harness({ pickupX: 10, pickupData: COMBAT_ORE({ amount: 15 }), acceptUnits: 0 });
    h.state.simTime = 1;
    mining.update(DT, h.state);
    assert.equal(h.pickup.alive, false, 'consumed, not left to retry every 0.75 s');
    assert.equal(h.grants.length, 1, 'exactly one grant, through the economy owner');
    assert.equal(h.grants[0].amount, h.conversions[0].credits);
    assert.ok(h.grants[0].amount >= 1 && h.grants[0].amount < 15 * SCRAP.basePrice * 0.2,
      `a deep scrap discount, chip scale (${h.grants[0].amount} cr for 15 units of ${SCRAP.basePrice} cr/u)`);
    assert.match(h.grants[0].reason, /^salvage:overflow:/);
    assert.equal(h.conversions[0].units, 15);
  });
});

test('partial acceptance converts only the refused remainder', () => {
  withFlag(true, () => {
    const h = harness({ pickupX: 10, pickupData: COMBAT_ORE({ amount: 15 }), acceptUnits: 10 });
    h.state.simTime = 1;
    mining.update(DT, h.state);
    assert.equal(h.conversions.length, 1);
    assert.equal(h.conversions[0].units, 5, '10 went into the hold; the other 5 pay credits');
    assert.equal(h.pickup.alive, false);
  });
});

test('overflow never touches ordinary ore, run wallets, non-ore loot, or the flag-off profile', () => {
  withFlag(true, () => {
    const ordinary = harness({ pickupX: 10, pickupData: { kind: 'ore', commodityId: 'cmdty_scrap_metal', amount: 15 }, acceptUnits: 0 });
    ordinary.state.simTime = 1;
    mining.update(DT, ordinary.state);
    assert.equal(ordinary.grants.length, 0, 'ordinary ore a full hold refuses stays for the pilot (a mined lot is the pilot\'s to haul)');
    assert.equal(ordinary.pickup.alive, true);

    const run = harness({ pickupX: 10, pickupData: COMBAT_ORE({ wallet: 'run' }), acceptUnits: 0 });
    run.state.simTime = 1;
    mining.update(DT, run.state);
    assert.equal(run.grants.length, 0, 'a Survival/Crucible run wallet is never leaked into the campaign purse');
  });
  withFlag(false, () => {
    const off = harness({ pickupX: 10, pickupData: COMBAT_ORE(), acceptUnits: 0 });
    off.state.simTime = 1;
    mining.update(DT, off.state);
    assert.equal(off.grants.length, 0, 'flag off: the old refuse-and-retry behaviour');
    assert.equal(off.pickup.alive, true);
  });
});

test('only the player\'s own kill burst spawns combat loot', () => {
  const drop = (source) => {
    const h = harness({ pickupX: 10, pickupData: { kind: 'ore', commodityId: 'cmdty_scrap_metal', amount: 1 } });
    h.bus.emit('loot:drop', { pos: { x: 5, z: 5 }, vel: { x: 0, z: 0 }, source, items: [{ commodityId: 'cmdty_scrap_metal', qty: 12 }] });
    return h.spawned;
  };
  withFlag(true, () => {
    const burst = drop('kill_burst');
    assert.ok(burst.length > 0);
    for (const spec of burst) {
      assert.equal(spec.data.combatLoot, true);
      assert.ok(spec.data.homeAt > 0 && spec.data.homeAt <= 1, `a short beat (${spec.data.homeAt})`);
    }
    for (const spec of drop('mining')) assert.equal(spec.data.combatLoot, undefined, 'other drops are ordinary pickups');
  });
  withFlag(false, () => {
    for (const spec of drop('kill_burst')) assert.equal(spec.data.combatLoot, undefined, 'flag off: identical spawn data as before');
  });
});

function multiHarness(pickups, { acceptUnits = null } = {}) {
  const player = { id: 1, alive: true, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, flags: {} };
  const list = pickups.map((data, i) => ({
    id: 10 + i, alive: true, type: 'pickup', pos: { x: 1800 + i * 40, z: 0 }, vel: { x: 0, z: 0 }, radius: 2.2, mass: 0.1, collides: true, data,
  }));
  const state = {
    playerId: player.id,
    entities: new Map([[player.id, player], ...list.map((e) => [e.id, e])]),
    entityList: [player, ...list],
    entityIndex: { __spacefaceEntityIndexV1: true, ready: true, pickups: list },
    player: { magnetRange: 0, miningBeam: { tierId: 'beam_mk1' }, cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 250 }, credits: 0 },
    mode: 'flight', input: { fireGroup: 0 }, simTime: 5, rng: () => 0.5,
  };
  const listeners = Object.create(null);
  const grants = [];
  const bus = {
    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); return () => {}; },
    emit(type, payload) {
      if (type === 'economy:grantCredits') grants.push(payload);
      for (const fn of listeners[type] || []) fn(payload);
    },
  };
  mining.init({ state, bus, helpers: { spawnEntity: () => null }, registry: { get: () => null } });
  if (acceptUnits != null) {
    // The cargo owner only answers for ore/cargo; credit chips are the economy's concern.
    bus.on('pickup:collected', (payload) => {
      if (payload.kind !== 'ore' && payload.kind !== 'cargo') return;
      const accepted = Math.min(payload.amount, acceptUnits);
      payload.acceptedAmount = accepted;
      payload.rejectedAmount = payload.amount - accepted;
    });
  }
  return { state, list, grants, bus };
}

test('docking or jumping banks every in-flight combat pickup: chips pay, ore is held or converts, nothing is lost', () => {
  for (const event of ['dock:docked', 'jump:start', 'sector:exit']) {
    withFlag(true, () => {
      const h = multiHarness([
        { kind: 'credit_chip', amount: 60, credits: 60, combatLoot: true, homeAt: 6 },
        { kind: 'ore', commodityId: 'cmdty_scrap_metal', amount: 15, combatLoot: true, homeAt: 6 },
        { kind: 'ore', commodityId: 'cmdty_scrap_metal', amount: 15, combatLoot: true, homeAt: 6 },
        { kind: 'ore', commodityId: 'cmdty_scrap_metal', amount: 15 }, // an ordinary pickup is left alone
      ], { acceptUnits: 10 });
      h.bus.emit(event, { stationId: 'station_test' });
      const [chip, oreA, oreB, ordinary] = h.list;
      assert.equal(chip.alive, false, `${event}: the chip is banked`);
      assert.equal(oreA.alive, false, `${event}: ore is banked (10 held, 5 converted)`);
      assert.equal(oreB.alive, false);
      assert.equal(ordinary.alive, true, `${event}: an ordinary pickup is the pilot's business`);
      assert.ok(h.grants.some((g) => g.amount === 60), `${event}: the chip paid through the economy owner`);
      assert.ok(h.grants.some((g) => /^salvage:overflow:/.test(g.reason)), `${event}: refused ore paid credits`);
    });
  }
  withFlag(false, () => {
    const h = multiHarness([{ kind: 'credit_chip', amount: 60, credits: 60, combatLoot: true, homeAt: 6 }]);
    h.bus.emit('dock:docked', { stationId: 'station_test' });
    assert.equal(h.list[0].alive, true, 'flag off: unchanged');
  });
});

test('a Survival/Crucible run-wallet chip is combat loot for homing only; its wallet is untouched', () => {
  withFlag(true, () => {
    const h = harness({ pickupX: 10, pickupData: { kind: 'ore', commodityId: 'cmdty_scrap_metal', amount: 1 } });
    h.bus.emit('loot:drop', {
      pos: { x: 5, z: 5 }, vel: { x: 0, z: 0 }, source: 'kill_burst',
      items: [{ kind: 'credit_chip', credits: 50, wallet: 'run', grantReason: 'run:chip:test' }],
    });
    assert.equal(h.spawned.length, 1);
    assert.equal(h.spawned[0].data.combatLoot, true, 'it homes like any kill loot');
    assert.equal(h.spawned[0].data.wallet, 'run', 'and still settles into the run wallet, never the campaign purse');
  });
});
