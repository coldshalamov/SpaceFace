// VERB-36 — engaging cruise on a laid route turns the bow onto the course before the burn.
//
// Seed 4242. On an active engaged route, engaging cruise more than 30° off the course holds
// the spool until the bow is on the course, then burns. Within 30° the spool runs normally.
// Without an active route the spool also runs normally.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { buildAtlasIndex } from '../src/core/atlasIndex.js';
import { cruise } from '../src/systems/cruise.js';
import { routeFollower, ROUTE_EXECUTOR_STATUS } from '../src/systems/routeFollower.js';

const SEED = 4242;
const DT = 1 / 60;
const ATLAS = buildAtlasIndex();
const DEG = Math.PI / 180;

function makeBus() {
  const handlers = new Map();
  const events = [];
  return {
    events,
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
      return () => {};
    },
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload);
    },
    of(name) {
      return events.filter((e) => e.name === name);
    },
  };
}

/** Pick a real neighbouring sector pair from the authored atlas. */
function findChain() {
  const start = 'sector_helios_prime';
  const neighbours = ATLAS.sectorNeighbors(start);
  assert.ok(neighbours.length > 0, 'atlas must have a neighbour for Helios');
  return [start, neighbours[0]];
}

function boot({ routeLegs = null, engaged = false } = {}) {
  const state = createGameState(SEED);
  state.mode = 'flight';
  const player = {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    rot: 0, angVel: 0, radius: 8, data: { defId: 'ship_kestrel' },
  };
  state.entities.set(1, player);
  state.entityList = [player];
  state.playerId = 1;
  state.player.cruise = { phase: 'off', t: 0, stumbleT: 0, stumbleCdT: 0 };
  if (!state.input) state.input = {};
  if (!state.input.actions) state.input.actions = {};
  state.input.actions.cruise = false;

  const bus = makeBus();
  const cruiseHost = Object.create(cruise);
  cruiseHost.init({ state, bus, helpers: {} });

  const follower = Object.create(routeFollower);
  follower.init({ state, bus, atlas: ATLAS });
  if (routeLegs) {
    state.nav.route = { legs: routeLegs, totalFuel: 4, totalHops: routeLegs.length };
    state.nav.autoTravel = true;
    state.world.currentSectorId = routeLegs[0].from;
    follower.engage({});
    assert.equal(state.nav.executor.engaged, true, 'route must engage for the test');
    if (!engaged) {
      // Keep an itinerary but disengage: not an active route for the spool gate.
      follower.interrupt('manual');
    }
  }
  return { state, bus, player, cruiseHost };
}

/** Aim the active leg due east from the ship, then set the bow to an off-course angle. */
function aimLegDueEast(h) {
  const leg = h.state.nav.executor.legs[h.state.nav.executor.legIndex];
  leg.target = { x: 10000, z: 0 };
}

function engageCruise(h) {
  h.state.input.actions.cruise = true;
  cruiseHostTick(h, DT);
  h.state.input.actions.cruise = false;
}

function cruiseHostTick(h, dt) {
  h.state.tick += 1;
  h.cruiseHost.update(dt, h.state);
}

test('more than 30° off an active route holds the spool until the bow is on the course', () => {
  const chain = findChain();
  const h = boot({ routeLegs: [{ from: chain[0], to: chain[1], fuel: 4, charge: 1, interdict: 0 }], engaged: true });
  aimLegDueEast(h);
  h.player.rot = 45 * DEG; // 45° off the due-east course

  engageCruise(h);
  assert.equal(h.state.player.cruise.phase, 'charging', 'V still arms the spool');

  // A full charge worth of ticks while the bow stays off course: the spool must not complete.
  for (let i = 0; i < 200; i++) cruiseHostTick(h, DT);
  assert.equal(h.state.player.cruise.phase, 'charging', 'spool holds while >30° off the course');
  assert.equal(h.state.player.cruise.t, 0, 'held spool does not bank charge time');
  assert.equal(h.bus.of('cruise:engaged').length, 0, 'no burn before the bow is on the course');

  // Turn the bow onto the course mid-spool: the burn follows after a full charge.
  h.player.rot = 10 * DEG;
  for (let i = 0; i < 200; i++) cruiseHostTick(h, DT);
  assert.equal(h.state.player.cruise.phase, 'cruising', 'spool completes once the bow is on the course');
  assert.equal(h.bus.of('cruise:engaged').length, 1, 'exactly one burn once aligned');
});

test('within 30° of the course the spool runs normally', () => {
  const chain = findChain();
  const h = boot({ routeLegs: [{ from: chain[0], to: chain[1], fuel: 4, charge: 1, interdict: 0 }], engaged: true });
  aimLegDueEast(h);
  h.player.rot = 20 * DEG;

  engageCruise(h);
  for (let i = 0; i < 200; i++) cruiseHostTick(h, DT);
  assert.equal(h.state.player.cruise.phase, 'cruising', 'a nearly-aligned bow burns without waiting');
  assert.equal(h.bus.of('cruise:engaged').length, 1);
});

test('no active route: the spool runs normally even with the bow anywhere', () => {
  const chain = findChain();
  // Itinerary plotted but never engaged: not an active route.
  const h = boot({ routeLegs: [{ from: chain[0], to: chain[1], fuel: 4, charge: 1, interdict: 0 }], engaged: false });
  assert.notEqual(h.state.nav.executor.status, ROUTE_EXECUTOR_STATUS.ARRIVED);
  h.player.rot = Math.PI; // bow anywhere at all

  engageCruise(h);
  for (let i = 0; i < 200; i++) cruiseHostTick(h, DT);
  assert.equal(h.state.player.cruise.phase, 'cruising', 'no active route means no alignment gate');
});
