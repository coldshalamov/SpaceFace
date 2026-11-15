// frontier-provision-freight — a player-jettisoned food pod towed into a stead's
// supply ring unloads slowly and lands exactly like a supply pod.
//
// Only the one body the player is towing is ever considered — the intake reads
// the tether, never scans the entity list. The pod must ride the ring a full
// two seconds below hauling pace; leaving the ring or speeding up resets it.
// Custody is the garden owner's own read: only the player's own jettison.
//
// Run: node --test test/frontier-provision-freight.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import {
  frontierHomesteads,
  ensureFrontierState,
  FRONTIER_BOARD,
} from '../src/systems/faction_frontier.js';
import {
  FRONTIER_FRAME,
  FRONTIER_MODULES,
  FRONTIER_BARN_RAISING,
  FRONTIER_HOMESTEAD,
  FRONTIER_HOUSEHOLD_LINES,
} from '../src/data/factions/free.js';
import { lootShards, spawnJettisonedCargoPod } from '../src/systems/lootShards.js';

const SEED = 9091;
const TICKS_PER_S = 60;

function boot() {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [frontierHomesteads, lootShards] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_io_reach';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: -40000, z: -40000 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true, data: { name: 'PLAYER' },
  });
  state.playerId = player.id;
  const logs = [];
  const grants = [];
  const reps = [];
  const delivered = [];
  bus.on('comms:log', (p) => logs.push(p));
  bus.on('economy:grantCredits', (p) => grants.push(p));
  bus.on('faction:repDelta', (p) => reps.push(p));
  bus.on('frontier:supplyDelivered', (p) => delivered.push(p));
  const owner = sim.registry.get('frontierHomesteads');
  return { sim, state, bus, player, logs, grants, reps, delivered, owner };
}

function raiseStead(h, x = 0, z = 0) {
  const f = h.sim.spawn({
    type: 'station', team: 0, factionId: 'faction_free',
    pos: { x, z }, radius: FRONTIER_FRAME.radius, mass: 1e6,
    hull: 2000, hullMax: 2000, collides: true,
    data: { homesteadFrame: true, typeId: FRONTIER_FRAME.typeId },
  });
  for (const m of FRONTIER_MODULES) {
    h.sim.spawn({
      type: 'payload', team: 0, factionId: 'faction_free',
      pos: { x: x + FRONTIER_FRAME.snapRange - 60, z: z + (m.mass % 40) - 20 },
      radius: m.radius, mass: m.mass, hull: 100, hullMax: 100, collides: true,
      data: { homesteadModule: m.id, name: m.label },
    });
  }
  h.sim.runTicks(Math.ceil(FRONTIER_BARN_RAISING.weldTimeS * 60) + 10);
  assert.equal(f.data.homestead, true, 'the frame became the homestead');
  return f;
}

const recOf = (h, entityId) =>
  ensureFrontierState(h.state).homesteads.find((r) => r.entityId === entityId);
const lineHeard = (h, text) => h.logs.filter((l) => l.text === text).length;

/** The player's own jettisoned pod — the real producer stamps custody. */
function foodPod(h, x, z, ownerId = h.state.playerId) {
  const pod = spawnJettisonedCargoPod(h.state, {
    commodityId: 'cmdty_food', amount: 4, ownerId, pos: { x, z },
  }, h.sim.helpers);
  assert.ok(pod, 'the jettison produced a pod');
  pod.vel.x = 0; pod.vel.z = 0;
  return pod;
}

/** Tow the pod through the player's tether — the honest custody channel. */
function tow(h, pod) {
  h.state.player = h.state.player || {};
  h.state.player.tether = { active: true, targetId: pod.id };
}
function dropTow(h) {
  if (h.state.player) h.state.player.tether = { active: false, targetId: null };
}

test('a player-towed food pod riding the ring unloads as supplies and pays', () => {
  const h = boot();
  try {
    const stead = raiseStead(h);
    const rec = recOf(h, stead.id);
    rec.stranded = true;
    const pod = foodPod(h, stead.pos.x + 80, stead.pos.z);
    tow(h, pod);
    h.sim.runTicks(Math.ceil(2.4 * TICKS_PER_S));
    assert.equal(pod.alive, false, 'the stead took the food aboard');
    assert.equal(rec.supplies, 1, 'it counts like a supply pod');
    assert.equal(rec.stranded, false, 'the stead steadies');
    assert.ok(h.grants.some((g) => g.reason === `frontier_supply:${stead.id}:1`),
      'the same supply fee pays');
    assert.ok(h.reps.some((r) => r.reason === 'frontier_supply_run'), 'the same standing');
    assert.ok(h.delivered.some((d) => d.homesteadId === stead.id), 'the delivery wire fires');
    assert.equal(lineHeard(h, FRONTIER_HOUSEHOLD_LINES.food), 1, 'the household thanks the food');
    assert.equal(h.state.frontier.deeds, 1, 'the delivery is a deed like any supply');
  } finally { h.sim.dispose(); }
});

test('the pod must dwell two seconds — early exit and hot speed both reset', () => {
  const h = boot();
  try {
    const stead = raiseStead(h);
    const rec = recOf(h, stead.id);
    const pod = foodPod(h, stead.pos.x + 80, stead.pos.z);
    tow(h, pod);
    // Under the wire — still unloading.
    h.sim.runTicks(Math.floor(1.5 * TICKS_PER_S));
    assert.equal(pod.alive !== false, true, 'still riding the ring');
    assert.equal(rec.supplies, 0);
    // Leave the ring: the timer starts over.
    pod.pos.x = stead.pos.x + FRONTIER_HOMESTEAD.supplyRadius + 80;
    h.sim.runTicks(5);
    pod.pos.x = stead.pos.x + 80; pod.pos.z = stead.pos.z;
    h.sim.runTicks(Math.floor(1.9 * TICKS_PER_S));
    assert.equal(rec.supplies, 0, 'the reset timer has not landed it yet');
    h.sim.runTicks(Math.ceil(0.3 * TICKS_PER_S));
    assert.equal(rec.supplies, 1, 'a fresh two-second dwell lands it');
    assert.equal(pod.alive, false);
  } finally { h.sim.dispose(); }
});

test('too fast past the ring never lands, and an untowed pod never unloads', () => {
  const h = boot();
  try {
    const stead = raiseStead(h);
    const rec = recOf(h, stead.id);
    // Towed but hot: relative speed above the hauling pace resets every tick.
    const hot = foodPod(h, stead.pos.x + 60, stead.pos.z);
    tow(h, hot);
    hot.vel.x = 40;
    h.sim.runTicks(Math.ceil(3 * TICKS_PER_S));
    assert.equal(rec.supplies, 0, 'a fast fly-through is not an unload');
    assert.equal(hot.alive !== false, true);
    dropTow(h);
    // A pod just sitting in the ring without the player's tow never lands.
    const loose = foodPod(h, stead.pos.x + 70, stead.pos.z);
    h.sim.runTicks(Math.ceil(4 * TICKS_PER_S));
    assert.equal(rec.supplies, 0, 'no tow, no intake');
    assert.equal(loose.alive !== false, true);
  } finally { h.sim.dispose(); }
});

test('only the player\'s own jettison counts — another owner\'s pod is refused', () => {
  const h = boot();
  try {
    const stead = raiseStead(h);
    const rec = recOf(h, stead.id);
    // A foreign cargo pod carries no player custody stamp — it can never feed.
    const foreign = spawnJettisonedCargoPod(h.state, {
      commodityId: 'cmdty_food', amount: 4, ownerId: 4242, pos: { x: stead.pos.x + 70, z: stead.pos.z },
    }, h.sim.helpers);
    assert.ok(foreign);
    tow(h, foreign);
    h.sim.runTicks(Math.ceil(3 * TICKS_PER_S));
    assert.equal(rec.supplies, 0, 'foreign cargo is not the player\'s offering');
    assert.equal(foreign.alive !== false, true);
  } finally { h.sim.dispose(); }
});

test('a towed food pod settles the debtor\'s open aid like a covered supply', () => {
  const h = boot();
  try {
    const a = raiseStead(h, 0, 0);
    const b = raiseStead(h, 6000, 0);
    const f = ensureFrontierState(h.state);
    const recA = recOf(h, a.id); const recB = recOf(h, b.id);
    recA.lastSupplyAt = -400; recB.lastSupplyAt = h.state.simTime; recB.supplies = 2;
    f.nextDebtAt = 0;
    h.sim.step();
    const debt = f.debts.find((d) => d.state === 'open');
    assert.ok(debt, 'the marker posted');
    const pod = foodPod(h, a.pos.x + 70, a.pos.z);
    tow(h, pod);
    h.sim.runTicks(Math.ceil(2.4 * TICKS_PER_S));
    assert.equal(debt.state, 'paid', 'the food covered the aid');
    assert.equal(debt.how, 'covered', 'the intake covered it like any supply');
    // The physical intake already counted the delivery — the debtor counts once.
    assert.equal(recA.supplies, 1);
  } finally { h.sim.dispose(); }
});

test('only a whole food load feeds — an iron pod is left alone and unpaid', () => {
  const h = boot();
  try {
    const stead = raiseStead(h);
    const rec = recOf(h, stead.id);
    rec.stranded = true;
    const iron = spawnJettisonedCargoPod(h.state, {
      commodityId: 'cmdty_ore_iron', amount: 4, ownerId: h.state.playerId,
      pos: { x: stead.pos.x + 80, z: stead.pos.z },
    }, h.sim.helpers);
    assert.ok(iron, 'the jettison produced a pod');
    iron.vel.x = 0; iron.vel.z = 0;
    tow(h, iron);
    h.sim.runTicks(Math.ceil(5 * TICKS_PER_S));
    assert.equal(iron.alive !== false, true, 'the stead leaves the mineral pod alone');
    assert.equal(rec.supplies, 0, 'no supplies for ore');
    assert.equal(h.grants.length, 0, 'no fee paid');
    assert.equal(h.state.frontier.deeds, 0, 'no deed logged');
    // A food pod in the same ring is still taken.
    dropTow(h);
    const food = foodPod(h, stead.pos.x + 80, stead.pos.z);
    tow(h, food);
    h.sim.runTicks(Math.ceil(2.4 * TICKS_PER_S));
    assert.equal(food.alive, false, 'the stead took the food aboard');
    assert.equal(rec.supplies, 1);
  } finally { h.sim.dispose(); }
});

test('a catch-net claim after the cached verdict refuses the handoff', () => {
  const h = boot();
  try {
    const stead = raiseStead(h);
    const rec = recOf(h, stead.id);
    rec.stranded = true;
    const pod = foodPod(h, stead.pos.x + 80, stead.pos.z);
    tow(h, pod);
    // The admission verdict caches while the pod rides the ring.
    h.sim.runTicks(Math.floor(1 * TICKS_PER_S));
    const key = `${pod.id}:${pod.occupantGeneration ?? 0}`;
    assert.equal(h.owner._foodVerdicts.get(key), true, 'the verdict cached');
    // An outlaw net takes custody before the unload finishes — the real writer.
    const garden = h.sim.registry.get('lootShards');
    garden._markCaughtByNet(pod, { id: 9001 });
    assert.equal(pod.data.caughtByNet, true);
    h.sim.runTicks(Math.ceil(4 * TICKS_PER_S));
    assert.equal(pod.alive !== false, true, 'the stead refuses the net-claimed pod');
    assert.equal(rec.supplies, 0, 'no supplies change hands');
    assert.equal(h.grants.length, 0, 'no fee paid');
    assert.equal(h.owner._foodDwell, null, 'the dwell timer cleared');
    assert.equal(h.owner._foodVerdicts.get(key), false, 'the pod is now ineligible');
  } finally { h.sim.dispose(); }
});

test('each pod\'s verdict is evaluated once per identity', () => {
  const h = boot();
  try {
    const stead = raiseStead(h);
    const garden = h.sim.registry.get('lootShards');
    const orig = garden.gardenFeedMass;
    let calls = 0;
    garden.gardenFeedMass = (e) => { calls++; return orig.call(garden, e); };
    const pod = foodPod(h, stead.pos.x + 70, stead.pos.z);
    tow(h, pod);
    h.sim.runTicks(30);
    assert.equal(calls, 1, 'one pod, one custody read across every tick');
    assert.equal(h.owner._foodVerdicts.get(`${pod.id}:${pod.occupantGeneration ?? 0}`), true);
    // The verdict is keyed to id+generation — a different pod asks fresh.
    const pod2 = foodPod(h, stead.pos.x + 90, stead.pos.z + 30);
    tow(h, pod2);
    h.sim.runTicks(5);
    assert.equal(calls, 2, 'a new pod identity is read once, not cached by position');
  } finally { h.sim.dispose(); }
});
