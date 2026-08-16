import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { physics } from '../src/core/physics.js';
import { save } from '../src/save/saveSystem.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { LOCAL_WAYPOINT_QUEUE_LIMIT, world as worldSystem } from '../src/systems/world.js';
import { localmapScreen } from '../src/ui/screens/localmap.js';

const DT = 1 / 60;

function makeBus() {
  const handlers = new Map();
  const events = [];
  return {
    events,
    on(name, fn) {
      const rows = handlers.get(name) || [];
      rows.push(fn);
      handlers.set(name, rows);
      return () => {};
    },
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload);
    },
  };
}

function makePlayer() {
  return {
    id: 1,
    type: 'ship',
    alive: true,
    isPlayer: true,
    team: 0,
    factionId: 'player',
    pos: { x: 0, z: 0 },
    prevPos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    prevRot: 0,
    angVel: 0,
    radius: 8,
    mass: 12,
    collides: true,
    flags: {},
    bank: 0,
    bankFactor: 1,
    boost: { energy: 100, max: 100, drainRate: 5, regenRate: 18, dashImpulse: 0, dashCd: 3, dashCdT: 0 },
    physicsBody: { mass: 12, inertiaY: 80, radius: 8 },
    propulsion: {
      id: 'plan54_waypoint_queue_drive',
      family: 'reaction',
      label: 'Waypoint queue test drive',
      mainAccel: 90,
      reverseAccel: 75,
      strafeAccel: 52,
      maxSpeed: 180,
      boostAccelMult: 1.5,
      yawAccel: 8,
      yawBrake: 10,
      maxYawRate: 2.4,
      bankMax: 0.5,
      assist: {
        neutralBrakeFraction: 0.18,
        lateralKillFraction: 0.18,
        commandedAxisDamping: 0,
        stopHorizonS: 6,
        driftStopHorizonS: 10,
        deadSpeed: 0.2,
        deadInput: 0.025,
      },
    },
    data: { derived: {} },
  };
}

function boot(seed = 0x54a11) {
  const state = createGameState(seed);
  const player = makePlayer();
  state.mode = 'flight';
  state.playerId = player.id;
  state.entities.clear();
  state.entityList.length = 0;
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.entityIndex = { ships: [player], weaponShips: [player], projectiles: [] };
  state.world.currentSector = {};
  state.world.currentSectorId = 'sector_helios_prime';
  state.input.actions = { autopursuit: false, brake: false };
  const bus = makeBus();
  const world = Object.create(worldSystem);
  world.init({ state, bus, helpers: {}, registry: null });
  return { state, player, bus, world };
}

function emitCourse(bus, x, z, label, queue = true) {
  bus.emit('ui:setCourse', {
    pos: { x, z },
    label,
    reason: label,
    waypointKind: 'local',
    arrivalRadius: 36,
    autopilot: true,
    queue,
  });
}

function neutralInput(state) {
  state.input.moveX = 0;
  state.input.moveZ = 0;
  state.input.turnIntent = 0;
  state.input.boost = false;
  state.input.brake = false;
  state.input.autopilot = false;
  state.input.actions.brake = false;
}

test('Shift-click local map emits a queued course and keeps the map open', () => {
  const bus = makeBus();
  let closed = 0;
  const screen = Object.assign(Object.create(localmapScreen), {
    _ctx: { bus },
    _canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    _mapTransform: { cx: 0, cy: 0, scale: 1, playerX: 0, playerZ: 0 },
    _nearestClickTarget: () => ({
      pos: { x: 180, z: -60 },
      label: 'Ore shelf',
      kind: 'asteroid',
      arrivalRadius: 64,
    }),
    _close() { closed += 1; },
  });

  screen._onCanvasClick({ clientX: 10, clientY: 10, shiftKey: true });
  const course = bus.events.find((row) => row.name === 'ui:setCourse');
  assert.equal(course.payload.queue, true);
  assert.equal(course.payload.label, 'Ore shelf');
  assert.equal(course.payload.arrivalRadius, 64);
  assert.equal(closed, 0, 'Shift-click keeps the map open for the next route point');

  screen._onCanvasClick({ clientX: 10, clientY: 10, shiftKey: false });
  assert.equal(bus.events.filter((row) => row.name === 'ui:setCourse').at(-1).payload.queue, false);
  assert.equal(closed, 1, 'ordinary click retains the existing set-and-close behavior');
});

test('world bounds the queue, Continue preserves it, and manual input cancels it', () => {
  const h = boot();
  emitCourse(h.bus, 220, 0, 'First fix');
  for (let index = 0; index < LOCAL_WAYPOINT_QUEUE_LIMIT + 2; index += 1) {
    emitCourse(h.bus, 260 + index * 20, 80 + index * 10, `Queued ${index + 1}`);
  }
  assert.equal(h.state.nav.waypoint.label, 'First fix');
  assert.equal(h.state.nav.waypointQueue.length, LOCAL_WAYPOINT_QUEUE_LIMIT);
  assert.equal(h.bus.events.some((row) => row.name === 'toast' && row.payload.text === 'Waypoint queue full'), true);

  const saveSystem = Object.create(save);
  saveSystem.init({ state: h.state, bus: h.bus, helpers: {}, registry: { get() { return null; } } });
  const data = saveSystem.serializeData();
  h.state.nav = { route: null, autoTravel: false, waypoint: null, autopilot: null };
  saveSystem._restoreNav(data.nav);
  assert.equal(h.state.nav.waypointQueue.length, LOCAL_WAYPOINT_QUEUE_LIMIT);
  assert.deepEqual(h.state.nav.waypointQueue[0].pos, { x: 260, z: 80 });

  h.state.input.moveZ = 0.5;
  const flight = Object.create(flightV3);
  flight.init({ state: h.state, bus: h.bus, helpers: {} });
  flight.update(DT, h.state);
  assert.equal(h.state.nav.autopilot.status, 'manual');
  assert.equal(h.state.nav.waypointQueue, undefined, 'manual helm input cancels the remaining hidden route');
});

test('Flight V3 and rapier-dynamic physically fly successive queued fixes', async () => {
  const h = boot(0x54b11);
  emitCourse(h.bus, 240, 0, 'Outbound');
  emitCourse(h.bus, 240, 180, 'Cross-track');

  const saveSystem = Object.create(save);
  saveSystem.init({ state: h.state, bus: h.bus, helpers: {}, registry: { get() { return null; } } });
  const serialized = saveSystem.serializeData();
  saveSystem._restoreNav(serialized.nav);

  const flight = Object.create(flightV3);
  const physicsSystem = Object.create(physics);
  flight.init({ state: h.state, bus: h.bus, helpers: {} });
  physicsSystem.init({ state: h.state, bus: h.bus, helpers: {} });
  assert.equal(await physicsSystem.prepareBackend(h.state, { reset: true }), true);

  let advancedAt = null;
  let completedAt = null;
  try {
    for (let tick = 0; tick < 3600; tick += 1) {
      h.state.tick = tick;
      h.state.simTime = tick * DT;
      neutralInput(h.state);
      flight.update(DT, h.state);
      physicsSystem.update(DT, h.state);
      if (advancedAt == null && h.state.nav.waypoint && h.state.nav.waypoint.label === 'Cross-track') {
        advancedAt = { tick, pos: { ...h.player.pos } };
      }
      if (advancedAt && h.state.nav.autopilot.active === false && h.state.nav.autopilot.status === 'arrived') {
        completedAt = { tick, pos: { ...h.player.pos }, speed: Math.hypot(h.player.vel.x, h.player.vel.z) };
        break;
      }
    }
  } finally {
    physicsSystem._disableSg02DynamicAuthority();
  }

  assert.ok(advancedAt, 'the first physical arrival must arm the second queued fix');
  assert.ok(Math.hypot(advancedAt.pos.x - 240, advancedAt.pos.z) <= 50);
  assert.ok(completedAt, 'the second physical fix must settle and release autopilot');
  assert.ok(Math.hypot(completedAt.pos.x - 240, completedAt.pos.z - 180) <= 50);
  assert.ok(completedAt.speed < 12);
  assert.equal(h.state.nav.waypointQueue, undefined);
  assert.equal(h.bus.events.filter((row) => row.name === 'nav:autopilotStopped' && row.payload.reason === 'arrived').length, 2);
});
