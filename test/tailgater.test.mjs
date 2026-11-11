// PL-06 Tailgater tests:
// 1. isLoadedHauler identifies heavy freight hulls and rejects player, lawful, hostiles, disabled
// 2. predictPlayerCutOff triggers when player cuts across bow at speed within clearance zone
// 3. predictPlayerCutOff rejects slow player, passes behind, wide lateral passes, or too far ahead
// 4. On cut-off, hauler follows player for 20 seconds with horn down
// 5. Outrunning the hauler (> 350 wu) breaks pursuit early
// 6. 20 seconds elapsing ends pursuit and enters cooldown
// 7. Full traffic system integration test via traffic update loop
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import {
  TAILGATER_TUNING,
  TAILGATER_START_EVENT,
  TAILGATER_HORN_EVENT,
  TAILGATER_END_EVENT,
  isLoadedHauler,
  predictPlayerCutOff,
  getOrCreateTailgaterRow,
  tailgaterOps,
} from '../src/systems/tailgater.js';
import { traffic } from '../src/systems/traffic.js';

function makeHauler(id = 'hauler_1', { x = 0, z = 0, rot = 0, role = 'hauler', vx = 20, vz = 0 } = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: 2,
    pos: { x, z },
    vel: { x: vx, z: vz },
    rot,
    radius: 8,
    data: {
      trafficRole: role,
      intent: { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0, brake: false },
      ai: { passive: true },
    },
  };
}

function makePlayer({ x = 0, z = 0, vx = 0, vz = 0 } = {}) {
  return {
    id: 'player_1',
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x, z },
    vel: { x: vx, z: vz },
    rot: 0,
    radius: 6,
    data: {},
  };
}

test('isLoadedHauler identifies heavy freight hulls and rejects ineligible ships', () => {
  const hauler = makeHauler('h1', { role: 'hauler' });
  assert.equal(isLoadedHauler(hauler), true, 'hauler is loaded hauler');

  const oreCarrier = makeHauler('h2', { role: 'ore_carrier' });
  assert.equal(isLoadedHauler(oreCarrier), true, 'ore carrier is loaded hauler');

  const tanker = makeHauler('h3', { role: 'tanker' });
  assert.equal(isLoadedHauler(tanker), true, 'tanker is loaded hauler');

  const freighter = makeHauler('h4', { role: 'freighter' });
  assert.equal(isLoadedHauler(freighter), true, 'freighter is loaded hauler');

  // Player is not hauler
  const player = makePlayer();
  assert.equal(isLoadedHauler(player, null, { playerId: player.id }), false, 'player is not hauler');

  // Courier is light civilian, not loaded heavy hauler
  const courier = makeHauler('c1', { role: 'courier' });
  assert.equal(isLoadedHauler(courier), false, 'courier is not heavy loaded hauler');

  // Lawful or pirate hauler does not tailgate
  const lawfulHauler = makeHauler('lh', { role: 'hauler' });
  lawfulHauler.data.ai = { lawful: true };
  assert.equal(isLoadedHauler(lawfulHauler), false, 'lawful ship does not tailgate');

  const pirateHauler = makeHauler('ph', { role: 'hauler' });
  pirateHauler.data.ai = { pirate: true };
  assert.equal(isLoadedHauler(pirateHauler), false, 'pirate does not tailgate');

  // Disabled ship does not tailgate
  const disabledHauler = makeHauler('dh', { role: 'hauler' });
  disabledHauler.data.disabled = true;
  assert.equal(isLoadedHauler(disabledHauler), false, 'disabled hauler does not tailgate');
});

test('predictPlayerCutOff triggers when player cuts across bow at speed', () => {
  // Hauler at (0, 0) facing +X (rot = 0), moving forward at 20 wu/s
  const hauler = makeHauler('h1', { x: 0, z: 0, rot: 0, vx: 20, vz: 0 });

  // Player cuts across at (35, -40), moving in +Z at 120 wu/s (vx: 20, vz: 120)
  // At tca, player crosses (35, 0) which is 35 wu ahead of hauler bow and lateral 0
  const player = makePlayer({ x: 35, z: -40, vx: 20, vz: 120 });

  const cutOff = predictPlayerCutOff(player, hauler);
  assert.ok(cutOff, 'player crossing directly in front of bow is detected as cut off');
  assert.ok(cutOff.fwdAtCa >= 14 && cutOff.fwdAtCa <= 70, 'pass is in forward corridor');
  assert.ok(cutOff.latAtCa <= 26, 'pass is within lateral threshold');
});

test('predictPlayerCutOff rejects passes that do not qualify as cutting off', () => {
  const hauler = makeHauler('h1', { x: 0, z: 0, rot: 0, vx: 20, vz: 0 });

  // 1. Slow player (< 80 wu/s)
  const slowPlayer = makePlayer({ x: 35, z: -40, vx: 20, vz: 40 });
  assert.equal(predictPlayerCutOff(slowPlayer, hauler), null, 'slow player does not cut off');

  // 2. Crossing behind hauler (fwdAtCa < 0)
  const behindPlayer = makePlayer({ x: -35, z: -40, vx: 20, vz: 120 });
  assert.equal(predictPlayerCutOff(behindPlayer, hauler), null, 'crossing behind hauler is not a cut-off');

  // 3. Wide pass (outside lateral corridor)
  const widePlayer = makePlayer({ x: 35, z: 80, vx: 120, vz: 0 });
  assert.equal(predictPlayerCutOff(widePlayer, hauler), null, 'wide pass does not cut off');

  // 4. Too far ahead (> 70 wu)
  const farPlayer = makePlayer({ x: 120, z: -40, vx: 20, vz: 120 });
  assert.equal(predictPlayerCutOff(farPlayer, hauler), null, 'pass too far ahead does not cut off');
});

test('on cut-off, hauler follows player for twenty seconds with horn down', () => {
  const bus = createBus();
  const events = [];
  bus.on(TAILGATER_START_EVENT, (p) => events.push({ type: 'start', p }));
  bus.on(TAILGATER_HORN_EVENT, (p) => events.push({ type: 'horn', p }));
  bus.on(TAILGATER_END_EVENT, (p) => events.push({ type: 'end', p }));
  bus.on('audio:cue', (p) => events.push({ type: 'audio', p }));

  const host = {
    bus,
    ...tailgaterOps,
  };
  host._initTailgater();

  const hauler = makeHauler('h1', { x: 0, z: 0, rot: 0, vx: 20, vz: 0 });
  const rec = { role: 'hauler' };
  const player = makePlayer({ x: 35, z: -30, vx: 20, vz: 120 });

  const state = {
    mode: 'flight',
    simTime: 10.0,
    playerId: player.id,
  };

  // Step 1: trigger cut-off at t = 10.0
  const reacting = host._reactTailgater(hauler, rec, [], state, player);
  assert.equal(reacting, true, 'hauler starts tailgating');

  // Audio blast lean emitted immediately
  const startAudio = events.filter((e) => e.type === 'audio' && e.p.id === 'sfx_hauler_blast_lean');
  assert.ok(startAudio.length >= 1, 'horn sounded immediately upon cut-off');

  // Hauler intent points toward player
  assert.equal(hauler.data.intent.moveZ, 1, 'hauler is thrusting forward');
  const expectedAim = Math.atan2(player.pos.z - hauler.pos.z, player.pos.x - hauler.pos.x);
  assert.ok(Math.abs(hauler.data.intent.aimAngle - expectedAim) < 1e-4, 'hauler aims directly at player');

  // Step 2: intermediate tick at t = 11.6 (1.6 s later -> horn triggers again)
  state.simTime = 11.6;
  player.pos = { x: 60, z: 50 }; // player moves ahead
  const reactingIntermediate = host._reactTailgater(hauler, rec, [], state, player);
  assert.equal(reactingIntermediate, true, 'hauler continues tailgating');
  const hornEvents = events.filter((e) => e.type === 'horn');
  assert.ok(hornEvents.length >= 1, 'sustained horn re-triggers across duration');

  // Step 3: at t = 29.9 (19.9 s into pursuit), hauler is STILL tailgating
  state.simTime = 29.9;
  player.pos = { x: 100, z: 50 };
  const reactingNearEnd = host._reactTailgater(hauler, rec, [], state, player);
  assert.equal(reactingNearEnd, true, 'still tailgating near 20 s mark');

  // Step 4: at t = 30.1 (over 20 s elapsed), pursuit ends
  state.simTime = 30.1;
  const reactingExpired = host._reactTailgater(hauler, rec, [], state, player);
  assert.equal(reactingExpired, false, 'pursuit terminates after 20 s');
  const endEvents = events.filter((e) => e.type === 'end' && e.p.reason === 'timeout');
  assert.equal(endEvents.length, 1, 'timeout end event emitted');

  // Step 5: within cooldown window (t = 40, cooldown is 60 s), another cut-off does NOT re-trigger
  state.simTime = 40.0;
  player.pos = { x: 35, z: -30 };
  player.vel = { x: 20, vz: 120 };
  const reactingCooldown = host._reactTailgater(hauler, rec, [], state, player);
  assert.equal(reactingCooldown, false, 'ineligible during cooldown window');
});

test('outrunning the hauler (> 350 wu) breaks pursuit early', () => {
  const bus = createBus();
  const events = [];
  bus.on(TAILGATER_END_EVENT, (p) => events.push(p));

  const host = {
    bus,
    ...tailgaterOps,
  };
  host._initTailgater();

  const hauler = makeHauler('h1', { x: 0, z: 0, rot: 0, vx: 20, vz: 0 });
  const rec = { role: 'hauler' };
  const player = makePlayer({ x: 35, z: -30, vx: 20, vz: 120 });
  const state = { mode: 'flight', simTime: 100.0, playerId: player.id };

  // Trigger cut-off
  assert.equal(host._reactTailgater(hauler, rec, [], state, player), true);

  // Player outruns hauler to 400 wu away at t = 105.0 (5 s into pursuit)
  state.simTime = 105.0;
  player.pos = { x: 400, z: 0 };
  const reacting = host._reactTailgater(hauler, rec, [], state, player);
  assert.equal(reacting, false, 'pursuit terminates early when outrun');

  const outrunEvent = events.find((e) => e.reason === 'outrun');
  assert.ok(outrunEvent, 'emitted outrun event');
  assert.equal(outrunEvent.entityId, hauler.id);
});

test('traffic system integration via update loop', () => {
  const bus = createBus();
  const hauler = makeHauler('freight_alpha', { x: 0, z: 0, rot: 0, role: 'hauler', vx: 20, vz: 0 });
  const player = makePlayer({ x: 30, z: -40, vx: 20, vz: 120 });
  const station = { id: 'station_alpha', type: 'station', alive: true, pos: { x: 500, z: 500 }, radius: 50, data: {} };

  const entities = new Map([
    [player.id, player],
    [hauler.id, hauler],
    [station.id, station],
  ]);
  const entityList = [player, hauler, station];

  const state = {
    mode: 'flight',
    simTime: 50.0,
    tick: 3000,
    playerId: player.id,
    entities: {
      get: (id) => entities.get(id) || null,
      has: (id) => entities.has(id),
    },
    entityList,
    traffic: {
      freighters: [
        {
          id: hauler.id,
          role: 'hauler',
          pos: { x: hauler.pos.x, z: hauler.pos.z },
          vel: { x: hauler.vel.x, z: hauler.vel.z },
          rot: 0,
        },
      ],
    },
    world: { currentSectorId: 'sector_test' },
  };

  traffic.init({ bus, state });

  let tailgaterStarted = false;
  bus.on(TAILGATER_START_EVENT, () => {
    tailgaterStarted = true;
  });

  // Run a traffic update step:
  traffic.update(1 / 60, state);

  assert.equal(tailgaterStarted, true, 'tailgater reaction triggered inside traffic.update');
  assert.equal(hauler.data.intent.moveZ, 1, 'hauler intent updated to drive towards player');
});
