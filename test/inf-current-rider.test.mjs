// inf-current-rider — a marked Crucible elite cuts its drive inside a room current and the
// room's own field law carries it; one hit knocks it off and the authored thrust returns.
// The stamp gate keeps the trick to law arenas — no current, no mark. Real system object,
// real field containment read, no renderer, no Math.random, no wall clock.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { swarmElites } from '../src/systems/swarmElites.js';
import { MILL_ARENA_ID } from '../src/systems/asteroidMillArena.js';
import { SWARM_AFFIXES, SWARM_AFFIX_BY_ID, swarmAffixFor } from '../src/data/swarmThreats.js';
import { affixHash } from '../src/systems/swarmElites.js';

const RIDE_COOLDOWN_TICKS = 840;

function makeHost(state, fields) {
  const bus = createBus();
  const receipts = [];
  bus.on('swarm:affixRide', (p) => receipts.push(p));
  const host = Object.create(swarmElites);
  host.init({
    state,
    bus,
    helpers: {},
    registry: { get: () => ({ kernelList: () => fields }) },
  });
  return { host, receipts, bus };
}

function riderBody(id, pos = { x: 0, z: 0 }) {
  return {
    id, alive: true, type: 'ship', pos: { x: pos.x, z: pos.z }, radius: 10,
    hull: 100, hullMax: 100, shield: 0, thrust: 42, maxSpeed: 90, combatSpeed: 60,
    data: { runCohort: 'survival', swarmAffix: 'rider' },
  };
}

function riderState({ arenaId = MILL_ARENA_ID, tick = 0, bodies = [], fields = [well()] } = {}) {
  const entities = new Map();
  for (const body of bodies) entities.set(body.id, body);
  return {
    state: {
      tick, simTime: tick / 60, playerId: 'player',
      run: { kind: 'survival', phase: 'active', ruleset: 'swarm', seed: 1, wave: 30, arenaId },
      entities,
    },
    fields,
  };
}

function well() {
  return { kind: 'well', center: { x: 0, z: 0 }, radius: 500, strength: 120, falloff: 1.2 };
}

function runRides(host, state, fromTick, toTick) {
  for (let t = fromTick; t <= toTick; t++) {
    state.tick = t;
    host._ridePass(state, state.run);
  }
}

test('the affix exists in the shipped vocabulary with its teaching line', () => {
  const row = SWARM_AFFIX_BY_ID.rider;
  assert.ok(row, 'rider is a real affix');
  assert.match(row.blurb, /current/);
  assert.match(row.blurb, /knocks it off/);
  assert.ok(SWARM_AFFIXES.some((r) => r.id === 'rider'));
});

test('inside a current the drive cuts; the hull is riding, not gliding on its own thrust', () => {
  const body = riderBody(5);
  const { state } = riderState({ bodies: [body] });
  const { host, receipts } = makeHost(state, [well()]);

  // id 5 → phase stagger (5 % 97) * 10 = 50 ticks; the ride opens on tick 51.
  runRides(host, state, 0, 51);
  assert.ok(body.data.swarmRide, 'the ride window is live');
  assert.equal(body.thrust, 0, 'the drive is cut — the room owns the motion now');
  assert.equal(receipts.filter((p) => p.phase === 'start').length, 1);

  // Riding on: the cut holds for the window (the field kernel moves the body in production).
  runRides(host, state, 52, 200);
  assert.equal(body.thrust, 0);
  assert.equal(receipts.filter((p) => p.phase === 'start').length, 1, 'no double ride');
});

test('one hit knocks it off the current and the authored thrust returns exactly', () => {
  const body = riderBody(5);
  const { state } = riderState({ bodies: [body] });
  const { host, receipts } = makeHost(state, [well()]);
  runRides(host, state, 0, 51);
  assert.equal(body.thrust, 0);

  body.hull = 90; // any real damage tears it off the current
  runRides(host, state, 52, 53);
  assert.equal(body.data.swarmRide, undefined);
  assert.equal(body.thrust, 42);
  const end = receipts.find((p) => p.phase === 'end');
  assert.equal(end.reason, 'knocked_off');
});

test('leaving the current ends the ride; so does the window expiring', () => {
  const body = riderBody(5);
  const { state } = riderState({ bodies: [body] });
  const { host, receipts } = makeHost(state, [well()]);
  runRides(host, state, 0, 51);

  body.pos.x = 900; // outside the well's radius
  runRides(host, state, 52, 53);
  assert.equal(body.data.swarmRide, undefined);
  assert.equal(body.thrust, 42);
  assert.equal(receipts.find((p) => p.phase === 'end').reason, 'current_ended');

  // Again, this time letting the window expire while still inside the current.
  body.pos.x = 0;
  body.data.swarmRideNextAt = state.tick + 1;
  runRides(host, state, state.tick + 1, state.tick + 1);
  assert.equal(body.thrust, 0);
  body.data.swarmRide.until = state.tick + 1;
  runRides(host, state, state.tick + 2, state.tick + 2);
  assert.equal(body.data.swarmRide, undefined);
  assert.equal(body.thrust, 42);
  assert.equal(receipts.filter((p) => p.reason === 'done').length, 1);
});

test('the cooldown and phase stagger keep a marked band from riding as one', () => {
  const a = riderBody(5);
  const b = riderBody(502);
  const { state } = riderState({ bodies: [a, b] });
  const { host } = makeHost(state, [well()]);
  runRides(host, state, 0, 60);
  // id 5 staggered to tick 51; id 502 staggered to (502 % 97) * 10 = 170 ticks — not yet.
  assert.ok(a.data.swarmRide, 'the first rider is up');
  assert.equal(b.data.swarmRide, undefined, 'the second rides on its own phase');
  assert.ok(b.data.swarmRideNextAt > state.tick, 'and its gate is still ahead');

  // After a ride, the cooldown holds before the next one.
  const endOfFirstRide = 51 + 240;
  runRides(host, state, 60, endOfFirstRide);
  assert.equal(a.data.swarmRide, undefined);
  assert.ok(a.data.swarmRideNextAt >= endOfFirstRide);
  const before = a.thrust;
  runRides(host, state, endOfFirstRide + 1, endOfFirstRide + RIDE_COOLDOWN_TICKS - 3);
  assert.equal(a.data.swarmRide, undefined, 'no re-ride inside the cooldown');
  assert.equal(a.thrust, before);
});

test('no law arena, no trick: a marked hull outside the law rooms never rides', () => {
  const body = riderBody(5);
  const { state } = riderState({ arenaId: 'helios_core', bodies: [body] });
  const { host } = makeHost(state, [well()]);
  runRides(host, state, 0, 600);
  assert.equal(body.data.swarmRide, undefined);
  assert.equal(body.thrust, 42);
});

test('no field installed, no ride — the mark stays quiet in an empty room', () => {
  const body = riderBody(5);
  const { state } = riderState({ bodies: [body] });
  const { host } = makeHost(state, []);
  runRides(host, state, 0, 600);
  assert.equal(body.data.swarmRide, undefined);
  assert.equal(body.thrust, 42);
});

test('the stamp gate: law rooms roll the full vocabulary, plain rooms never roll the rider', () => {
  // Find an ordinal whose seeded pick IS the rider in a law room, then drive the real
  // stamp path twice. The probe uses the fixture run's own seed (1) and wave (30).
  let ordinal = -1;
  for (let probe = 0; probe < 4096 && ordinal < 0; probe++) {
    if (swarmAffixFor(affixHash(1, 30, probe)) === 'rider') ordinal = probe;
  }
  assert.ok(ordinal >= 0, 'the seeded pick reaches the rider');

  const make = (arenaId) => {
    const body = riderBody(77);
    body.data.swarmAffix = null;
    body.data.runRole = 'elite';
    body.data.runWave = 30;
    const { state } = riderState({ arenaId, bodies: [body] });
    const { host } = makeHost(state, [well()]);
    host._affixOrdinal = ordinal;
    host._stampAffix(state, state.run, body, 21);
    return body;
  };
  const inLaw = make(MILL_ARENA_ID);
  const outside = make('helios_core');
  assert.equal(inLaw.data.swarmAffix, 'rider');
  // The plain room still marks its champion — one trick every time — but the trick it
  // carries comes from the room-agnostic head of the catalog, never the rider.
  assert.ok(SWARM_AFFIX_BY_ID[outside.data.swarmAffix], 'every champion carries one trick');
  assert.notEqual(outside.data.swarmAffix, 'rider');
});
