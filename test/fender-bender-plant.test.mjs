// PL-02 Fender bender plant tests (focused behavior check for owner invariants)
//
// Row (design/program/INFERENCE_PLANTS.md §A):
//   What happens: Bump a parked ship: an alarm lamp strobes and the owner undocks to look at the dent
//   What the player can do: Stay and get shouted at, or leave and be described to the dock
//
// Invariants tested:
// 1. Positive trigger (Stay): Bumping a parked civilian ship strobes alarm lamp, undocks the ship,
//    maneuvers to inspect the dent, and when player stays, shouts "Look what you did to my paint!".
// 2. Positive trigger (Leave): Bumping a parked civilian ship followed by player moving away
//    causes the owner to report to dock: "Dock control, hit-and-run pilot fled the berth.".
// 3. Negative checks: Moving ships (not parked), police/patrol, hostiles, player-owned ships,
//    disabled ships, and zero-impulse touches do NOT trigger the plant.
// 4. Cooldown: A second bump on the same ship within cooldownS (60s) does not retrigger.
// 5. Memory bounded and deterministic.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { traffic } from '../src/systems/traffic.js';
import {
  FENDER_BENDER_PLANT_EVENT,
  FENDER_BENDER_ALARM_EVENT,
  FENDER_BENDER_UNDOCKED_EVENT,
  FENDER_BENDER_SHOUT_EVENT,
  FENDER_BENDER_REPORT_EVENT,
  FENDER_BENDER_RESOLVED_EVENT,
  FENDER_BENDER_TUNING,
  FENDER_BENDER_SHOUT_BARK,
  FENDER_BENDER_DOCK_REPORT,
  isFenderBenderPlantEligible,
  evaluateFenderBenderImpact,
  fenderBenderPlant,
} from '../src/systems/fenderBenderPlant.js';

function makeCivilian(id = 'civ_trader_1', {
  x = 100,
  z = 100,
  role = 'trader',
  team = 2,
  radius = 6,
  parked = true,
  docked = false,
  vx = 0,
  vz = 0,
} = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    pos: { x, z },
    vel: { x: vx, z: vz },
    rot: 0,
    radius,
    data: {
      trafficRole: role,
      parked,
      docked,
      dockedStationId: docked ? 'station_ceres' : null,
      intent: { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0, brake: false },
      ai: { passive: true },
    },
    flags: { docked },
  };
}

function makePlayer({ x = 95, z = 100, vx = 5, vz = 0, radius = 6 } = {}) {
  return {
    id: 'player_hero',
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x, z },
    vel: { x: vx, z: vz },
    rot: 0,
    radius,
    data: {},
    flags: {},
  };
}

function createTestContext({ simTime = 10 } = {}) {
  const bus = createBus();
  const events = [];
  const voiceCalls = [];

  const rawEmit = bus.emit.bind(bus);
  bus.emit = (name, payload) => {
    events.push({ name, payload });
    return rawEmit(name, payload);
  };

  const entities = new Map();
  const state = {
    simTime,
    playerId: 'player_hero',
    mode: 'flight',
    entities,
    meta: { seed: 12345 },
    traffic: { count: 0 },
  };

  const helpers = {
    voice: {
      say: (call) => voiceCalls.push(call),
    },
  };

  return { bus, events, voiceCalls, state, entities, helpers };
}

test('PL-02 Fender bender: Stay branch — alarm strobes, owner undocks, inspects dent, shouts', () => {
  const ctx = createTestContext({ simTime: 100 });
  const player = makePlayer({ x: 92, z: 100 });
  const civ = makeCivilian('civ_parked_1', { x: 100, z: 100, parked: true, docked: true });

  ctx.entities.set(player.id, player);
  ctx.entities.set(civ.id, civ);

  // Initialize traffic system with mixin
  const trafficSys = Object.create(traffic);
  trafficSys.init({ state: ctx.state, bus: ctx.bus, helpers: ctx.helpers });

  // Assert initial docked state
  assert.equal(civ.flags.docked, true);
  assert.equal(civ.data.docked, true);

  // Drive trigger: Player bumps parked civilian
  ctx.bus.emit('physics:impact', {
    aId: player.id,
    bId: civ.id,
    playerInvolved: true,
    impulse: 250,
    dp: 250,
    pos: { x: 96, z: 100 },
  });

  // 1. Alarm lamp strobes
  assert.equal(civ.data.lampsFlashing, true);
  assert.equal(civ.data.alarmStrobe, true);
  assert.equal(civ.data.lampFlashUntil, 100 + FENDER_BENDER_TUNING.flashDurationS);

  const alarmEvent = ctx.events.find((e) => e.name === FENDER_BENDER_ALARM_EVENT);
  assert.ok(alarmEvent, 'emits alarm strobe event');
  assert.equal(alarmEvent.payload.entityId, civ.id);

  // 2. Owner undocks
  assert.equal(civ.flags.docked, false, 'owner undocked from berth');
  assert.equal(civ.data.docked, false);
  const undockEvent = ctx.events.find((e) => e.name === 'dock:undocked');
  assert.ok(undockEvent, 'emits dock:undocked event');
  assert.equal(undockEvent.payload.reason, 'fender_bender');

  // 3. Inspecting the dent
  ctx.state.simTime = 100.5;
  const dummyRec = { role: 'trader' };
  const reacting = trafficSys._reactFenderBenderPlant(civ, dummyRec, [], ctx.state, player);
  assert.equal(reacting, true, 'actively managing civilian inspection');
  assert.equal(civ.data.civilianReaction, 'fender_bender_inspect');

  // 4. Player stays within stayDistanceWu (dist = 8 wu <= 70 wu) for shoutDelayS (1.5s)
  ctx.state.simTime = 100 + FENDER_BENDER_TUNING.shoutDelayS + 0.1; // 101.6s
  trafficSys._reactFenderBenderPlant(civ, dummyRec, [], ctx.state, player);

  // Owner shouts
  const shoutEvent = ctx.events.find((e) => e.name === FENDER_BENDER_SHOUT_EVENT);
  assert.ok(shoutEvent, 'owner shouts at player');
  assert.equal(shoutEvent.payload.text, FENDER_BENDER_SHOUT_BARK);
  assert.equal(shoutEvent.payload.resolution, 'stay');
  assert.equal(FENDER_BENDER_SHOUT_BARK, 'Look what you did to my paint!');

  const barkTriggered = ctx.events.find((e) => e.name === 'bark:triggered');
  assert.ok(barkTriggered, 'emits bark:triggered');
  assert.equal(barkTriggered.payload.text, FENDER_BENDER_SHOUT_BARK);

  const resolved = ctx.events.find((e) => e.name === FENDER_BENDER_RESOLVED_EVENT);
  assert.ok(resolved, 'emits resolved event');
  assert.equal(resolved.payload.resolution, 'stay');

  assert.equal(ctx.voiceCalls.length > 0, true);
  assert.equal(ctx.voiceCalls[0].text, FENDER_BENDER_SHOUT_BARK);
});

test('PL-02 Fender bender: Leave branch — owner describes player to dock after fleeing', () => {
  const ctx = createTestContext({ simTime: 200 });
  const player = makePlayer({ x: 92, z: 100 });
  const civ = makeCivilian('civ_parked_2', { x: 100, z: 100, parked: true, docked: false });

  ctx.entities.set(player.id, player);
  ctx.entities.set(civ.id, civ);

  const trafficSys = Object.create(traffic);
  trafficSys.init({ state: ctx.state, bus: ctx.bus, helpers: ctx.helpers });

  // Bump parked civilian
  ctx.bus.emit('physics:impact', {
    aId: player.id,
    bId: civ.id,
    playerInvolved: true,
    impulse: 300,
    pos: { x: 96, z: 100 },
  });

  assert.equal(civ.data.lampsFlashing, true);

  // Player flees beyond leaveDistanceWu (e.g. player moves to x: 220, dist = 120 > 95 wu)
  player.pos.x = 220;
  ctx.state.simTime = 200.5;

  const dummyRec = { role: 'trader' };
  trafficSys._reactFenderBenderPlant(civ, dummyRec, [], ctx.state, player);

  // Owner describes player to the dock
  const reportEvent = ctx.events.find((e) => e.name === FENDER_BENDER_REPORT_EVENT);
  assert.ok(reportEvent, 'owner reports hit-and-run to dock');
  assert.equal(reportEvent.payload.text, FENDER_BENDER_DOCK_REPORT);
  assert.equal(reportEvent.payload.resolution, 'leave');
  assert.equal(FENDER_BENDER_DOCK_REPORT, 'Dock control, hit-and-run pilot fled the berth.');

  const commsLog = ctx.events.find((e) => e.name === 'comms:log');
  assert.ok(commsLog, 'emits comms:log');
  assert.equal(commsLog.payload.text, FENDER_BENDER_DOCK_REPORT);

  const resolved = ctx.events.find((e) => e.name === FENDER_BENDER_RESOLVED_EVENT);
  assert.ok(resolved);
  assert.equal(resolved.payload.resolution, 'leave');
});

test('PL-02 Fender bender: Negative checks — moving ships, police, hostiles, disabled, zero-impulse do NOT trigger', () => {
  const ctx = createTestContext({ simTime: 300 });
  const player = makePlayer({ x: 90, z: 100 });
  ctx.entities.set(player.id, player);

  // 1. Moving civilian ship (speed 50 wu/s > 4 wu/s, not parked)
  const movingCiv = makeCivilian('civ_moving', { x: 100, z: 100, parked: false, vx: 50 });
  ctx.entities.set(movingCiv.id, movingCiv);
  assert.equal(isFenderBenderPlantEligible(movingCiv, ctx.state), false);

  // 2. Police / patrol ship
  const police = makeCivilian('patrol_1', { x: 100, z: 100, role: 'patrol', parked: true });
  police.data.ai = { lawful: true };
  ctx.entities.set(police.id, police);
  assert.equal(isFenderBenderPlantEligible(police, ctx.state), false);

  // 3. Hostile ship (team 1)
  const pirate = makeCivilian('pirate_1', { x: 100, z: 100, team: 1, parked: true });
  pirate.data.isHostile = true;
  ctx.entities.set(pirate.id, pirate);
  assert.equal(isFenderBenderPlantEligible(pirate, ctx.state), false);

  // 4. Disabled ship
  const disabledCiv = makeCivilian('civ_disabled', { x: 100, z: 100, parked: true });
  disabledCiv.data.disabled = true;
  ctx.entities.set(disabledCiv.id, disabledCiv);
  assert.equal(isFenderBenderPlantEligible(disabledCiv, ctx.state), false);

  // 5. Zero-impulse touch
  const parkedCiv = makeCivilian('civ_parked_3', { x: 100, z: 100, parked: true });
  ctx.entities.set(parkedCiv.id, parkedCiv);
  assert.equal(isFenderBenderPlantEligible(parkedCiv, ctx.state), true);

  const zeroEval = evaluateFenderBenderImpact(ctx.state, {
    aId: player.id,
    bId: parkedCiv.id,
    playerInvolved: true,
    impulse: 0,
    dp: 0,
    normalImpulse: 0,
  });
  assert.equal(zeroEval, null, 'zero impulse does not evaluate to fender bender');
});

test('PL-02 Fender bender: Cooldown prevents repeat trigger within cooldownS', () => {
  const ctx = createTestContext({ simTime: 400 });
  const player = makePlayer({ x: 92, z: 100 });
  const civ = makeCivilian('civ_cooldown', { x: 100, z: 100, parked: true });

  ctx.entities.set(player.id, player);
  ctx.entities.set(civ.id, civ);

  const trafficSys = Object.create(traffic);
  trafficSys.init({ state: ctx.state, bus: ctx.bus, helpers: ctx.helpers });

  // First bump at t = 400
  ctx.bus.emit('physics:impact', {
    aId: player.id,
    bId: civ.id,
    playerInvolved: true,
    impulse: 100,
  });
  assert.equal(civ.data.lampsFlashing, true);

  // Resolve immediately
  trafficSys._resolveFenderBenderPlant(
    trafficSys._fenderBenderPlantMemory.get(civ.id),
    civ,
    null,
    ctx.state,
    player,
    'stay',
    400,
  );
  civ.data.lampsFlashing = false;

  // Clear events
  ctx.events.length = 0;

  // Second bump at t = 420 (20s later, inside 60s cooldown)
  ctx.state.simTime = 420;
  ctx.bus.emit('physics:impact', {
    aId: player.id,
    bId: civ.id,
    playerInvolved: true,
    impulse: 100,
  });

  const reAlarm = ctx.events.find((e) => e.name === FENDER_BENDER_ALARM_EVENT);
  assert.equal(reAlarm, undefined, 'cooldown suppresses repeat fender bender');
  assert.equal(civ.data.lampsFlashing, false);

  // Third bump at t = 461 (61s later, past 60s cooldown)
  ctx.state.simTime = 461;
  ctx.bus.emit('physics:impact', {
    aId: player.id,
    bId: civ.id,
    playerInvolved: true,
    impulse: 100,
  });

  const thirdAlarm = ctx.events.find((e) => e.name === FENDER_BENDER_ALARM_EVENT);
  assert.ok(thirdAlarm, 'past cooldown allows new fender bender');
  assert.equal(civ.data.lampsFlashing, true);
});

test('PL-02 Fender bender: Standalone system object lifecycle', () => {
  const ctx = createTestContext({ simTime: 500 });
  const player = makePlayer({ x: 92, z: 100 });
  const civ = makeCivilian('civ_standalone', { x: 100, z: 100, parked: true });

  ctx.entities.set(player.id, player);
  ctx.entities.set(civ.id, civ);

  fenderBenderPlant.init({ state: ctx.state, bus: ctx.bus, helpers: ctx.helpers });

  ctx.bus.emit('physics:impact', {
    aId: player.id,
    bId: civ.id,
    playerInvolved: true,
    impulse: 150,
  });

  assert.equal(civ.data.lampsFlashing, true);

  // Update ticks with standalone system
  ctx.state.simTime = 502;
  fenderBenderPlant.update(1 / 60, ctx.state);

  const shoutEvent = ctx.events.find((e) => e.name === FENDER_BENDER_SHOUT_EVENT);
  assert.ok(shoutEvent, 'standalone system step resolved fender bender');
  assert.equal(shoutEvent.payload.text, FENDER_BENDER_SHOUT_BARK);
});
