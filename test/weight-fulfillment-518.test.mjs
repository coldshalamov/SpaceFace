// weight-fulfillment-518 — W-FULFILLMENT (build_map §34.5 row 518, bible 02 §11).
//
// Proves the row's done-when on the real data and the runtime owner:
//   data/factions/fulfillment.js   fixed routes, derail/boarding/hitchhike constants,
//                                  Order #0000001 record, seven-digit order label
//   systems/faction_fulfillment.js trains ride their line and never deviate; derailment
//                                 spills backordered goods and re-rails; a latch tows the
//                                 player (E-25); the pod files cargo into an open order
//                                 (E-19); closing Order #0000001 ticks the counter (E-20)
//
// Run: node --test test/weight-fulfillment-518.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import {
  fulfillmentRoutes,
  spawnHauler,
  ensureFulfillmentState,
  oldestOpenOrderSeq,
  oldestOpenOrderLabel,
} from '../src/systems/faction_fulfillment.js';
import faction, {
  FULFILLMENT_ROUTES,
  FULFILLMENT_DERAIL,
  FULFILLMENT_BOARDING,
  FULFILLMENT_ORDER_ONE,
  fulfillmentOrderLabel,
} from '../src/data/factions/fulfillment.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { addCargo } from '../src/systems/cargo.js';

const SEED = 4242;
const ROUTE = FULFILLMENT_ROUTES.routes.route_charon_spine;

function boot() {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [fulfillmentRoutes] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_charon_expanse';
  state.content.commodities = COMMODITIES;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 40000, z: 40000 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  return { sim, state, bus, player };
}

test('data: routes, order label, and the faction custom contract', () => {
  assert.ok(Object.keys(FULFILLMENT_ROUTES.routes).length >= 3, 'authored fixed routes');
  for (const r of Object.values(FULFILLMENT_ROUTES.routes)) {
    assert.ok(r.waypoints.length >= 4 && r.speed > 0 && r.loop === true, `${r.id} is a closed line`);
  }
  assert.equal(fulfillmentOrderLabel(1), '#0000001', 'the oldest order reads seven digits');
  assert.equal(fulfillmentOrderLabel(27), '#0000027');
  assert.equal(FULFILLMENT_ORDER_ONE.seq, 1);
  assert.equal(faction.custom.neverFiresFirst, true);
  assert.equal(faction.custom.fliesFixedRoutesOnly, true);
  assert.equal(faction.custom.derailSpillsBackordered, true);
});

test('re-router haulers ride the fixed line at constant speed and never deviate', () => {
  const { sim, state } = boot();
  try {
    const hauler = spawnHauler(state, sim.helpers, { routeId: 'route_charon_spine', legIndex: 1 });
    const target = ROUTE.waypoints[1];
    sim.step();
    const speed = Math.hypot(hauler.vel.x, hauler.vel.z);
    assert.ok(Math.abs(speed - ROUTE.speed) < 1e-9, `constant route speed ${speed}`);
    const d0 = Math.hypot(target.x - hauler.pos.x, target.z - hauler.pos.z);
    sim.runTicks(30);
    const d1 = Math.hypot(target.x - hauler.pos.x, target.z - hauler.pos.z);
    assert.ok(d1 < d0, 'it closes on the next waypoint');

    // Knock it sideways: the line lock pulls the hull back onto the leg.
    hauler.pos.x += 300;
    sim.step();
    const prev = ROUTE.waypoints[0];
    const lx = target.x - prev.x, lz = target.z - prev.z;
    const t = ((hauler.pos.x - prev.x) * lx + (hauler.pos.z - prev.z) * lz) / (lx * lx + lz * lz);
    const off = Math.hypot(hauler.pos.x - (prev.x + lx * t), hauler.pos.z - (prev.z + lz * t));
    assert.ok(off < 100, `line lock corrected the shove (off-line ${off.toFixed(1)})`);
  } finally {
    sim.dispose();
  }
});

test('derailment (E-24): heavy mass spills backordered goods, then the train re-rails', () => {
  const { sim, state, bus } = boot();
  try {
    const hauler = spawnHauler(state, sim.helpers, { routeId: 'route_charon_spine', legIndex: 1 });
    sim.step();
    const derailed = [];
    bus.on('fulfillment:derailed', (p) => derailed.push(p));

    // A heavy, fast body across the bow knocks the train off its line.
    const rock = sim.spawn({
      type: 'asteroid', team: 2, pos: { x: hauler.pos.x + 20, z: hauler.pos.z },
      vel: { x: -40, z: 0 }, radius: 12, mass: FULFILLMENT_DERAIL.impactMassMin + 40,
      hull: 500, hullMax: 500, collides: true, data: {},
    });
    sim.step();
    assert.equal(derailed.length, 1, 'the impact derailed the train');
    const rec = ensureFulfillmentState(state).trains[hauler.id];
    assert.equal(rec.derailed, true);

    const pods = state.entityList.filter((e) => e.data?.backorderedGood === true);
    assert.ok(pods.length >= FULFILLMENT_DERAIL.spillPodsMin, `${pods.length} spilled pods`);
    assert.ok(pods.every((p) => p.data.rarity === 'Backordered'), 'the pinata pays Backordered goods');
    assert.equal(hauler.vel.x === 0 && hauler.vel.z === 0, true, 'the train is stopped cold');

    // With no escort near, the train re-rails on the slow clock and resumes the route.
    rock.pos.x += 5000; rock.vel.x = 0; // the impact body tumbles clear
    sim.runTicks(Math.ceil(FULFILLMENT_DERAIL.rerailAloneS * 60) + 2);
    assert.equal(rec.derailed, false, 'the train re-railed itself');
    sim.step();
    assert.ok(Math.hypot(hauler.vel.x, hauler.vel.z) > 0, 'back on the line at speed');
  } finally {
    sim.dispose();
  }
});

test('hitchhike (E-25): latching a live train tows the player down the route', () => {
  const { sim, state, player } = boot();
  try {
    const hauler = spawnHauler(state, sim.helpers, { routeId: 'route_charon_spine', legIndex: 1 });
    sim.step();
    assert.ok(Math.hypot(hauler.vel.x, hauler.vel.z) > 0);
    state.player.tether = { active: true, targetId: hauler.id };
    sim.step();
    assert.equal(ensureFulfillmentState(state).hitchedTrainId, hauler.id);
    assert.equal(player.vel.x, hauler.vel.x, 'the player rides at train speed');
    assert.equal(player.vel.z, hauler.vel.z);
    // Releasing the latch drops the ride.
    state.player.tether = { active: false, targetId: null };
    sim.step();
    assert.equal(ensureFulfillmentState(state).hitchedTrainId, null);
  } finally {
    sim.dispose();
  }
});

test('Administrative Boarding (E-19): the pod files player cargo into an open order', () => {
  const { sim, state, player } = boot();
  try {
    player.pos.x = 1000; player.pos.z = 1000;
    addCargo(state, 'cmdty_scrap_metal', 8);
    addCargo(state, 'cmdty_gem_ruby', 3);
    const pod = sim.spawn({
      type: 'ship', team: 1, factionId: 'faction_fulfillment',
      pos: { x: 1200, z: 1000 }, radius: 8, mass: 10, hull: 60, hullMax: 60, collides: true,
      data: { fulfillmentBoardingPod: { phase: 'approach', orderSeq: 77 } },
    });
    // Approach leg: it closes and docks.
    sim.runTicks(Math.ceil(250 / FULFILLMENT_BOARDING.podSpeed * 60) + 30);
    assert.equal(pod.data.fulfillmentBoardingPod.phase, 'filing', 'the pod attached');
    // Filing leg: it takes its units and departs.
    sim.runTicks(Math.ceil(FULFILLMENT_BOARDING.filingTimeS * 60) + 2);
    assert.equal(pod.data.fulfillmentBoardingPod.phase, 'depart');
    const f = ensureFulfillmentState(state);
    const filed = f.orders[f.nextOrderSeq - 1];
    assert.ok(filed && filed.origin === 'administrative_boarding', 'a new open order exists');
    const filedTotal = Object.values(filed.filedItems).reduce((a, b) => a + b, 0);
    assert.ok(filedTotal > 0 && filedTotal <= FULFILLMENT_BOARDING.cargoUnitsFiled,
      `${filedTotal} units filed away`);
    const held = (state.player.cargo.items.cmdty_scrap_metal || 0) + (state.player.cargo.items.cmdty_gem_ruby || 0);
    assert.equal(held, 11 - filedTotal, 'the hold lost exactly what the order gained');
  } finally {
    sim.dispose();
  }
});

test('flinging the boarding pod off before it docks keeps the cargo', () => {
  const { sim, state, player } = boot();
  try {
    player.pos.x = 0; player.pos.z = 0;
    addCargo(state, 'cmdty_scrap_metal', 8);
    const pod = sim.spawn({
      type: 'ship', team: 1, factionId: 'faction_fulfillment',
      pos: { x: 300, z: 0 }, radius: 8, mass: 10, hull: 60, hullMax: 60, collides: true,
      data: { fulfillmentBoardingPod: { phase: 'approach', orderSeq: 78 } },
    });
    pod.vel.x = FULFILLMENT_BOARDING.flingSpeed + 30; // thrown hard
    sim.step();
    assert.equal(pod.data.fulfillmentBoardingPod.phase, 'flung', 'the pod reads as thrown off');
    assert.equal(state.player.cargo.items.cmdty_scrap_metal, 8, 'cargo stayed aboard');
  } finally {
    sim.dispose();
  }
});

test('Order #0000001 (E-20): closing the oldest ticket ticks the counter', () => {
  const { sim, state, bus } = boot();
  try {
    const logs = [];
    bus.on('comms:log', (p) => logs.push(p.text || ''));
    assert.equal(oldestOpenOrderSeq(state), 1);
    assert.equal(oldestOpenOrderLabel(state), '#0000001');

    const sys = sim.registry.get('fulfillmentRoutes');
    assert.equal(sys.deliverOrderOne(state), true, 'the hand delivery closes the ticket');
    assert.equal(ensureFulfillmentState(state).orders[1].status, 'closed');
    assert.ok(logs.some((l) => l.includes('ticket 0000001 CLOSED')), 'LOG closed the ticket');
    assert.equal(oldestOpenOrderSeq(state), 2, 'the oldest-open-order counter advanced');
    assert.equal(oldestOpenOrderLabel(state), '#0000002');
    assert.equal(sys.deliverOrderOne(state), false, 'a closed ticket cannot close twice');
  } finally {
    sim.dispose();
  }
});
