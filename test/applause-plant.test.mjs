// PL-08 Applause plant tests — A slingshot kill within sight of a station makes its dock lamps flash twice.
// Asserts the reaction happens on qualifying slingshot kills within sight, and asserts it does NOT happen
// when conditions are not met (wrong distance, wrong killer, not a slingshot, gates/wormholes, too soon to repeat).

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import '../src/systems/traffic.js';
import {
  APPLAUSE_PLANT_EVENT,
  APPLAUSE_FLASH_EVENT,
  APPLAUSE_PLANT_TUNING,
  isSlingshotActive,
  isSlingshotKill,
  findStationsInSight,
  triggerStationApplause,
  applausePlantOps,
} from '../src/systems/applausePlant.js';
import {
  computeStationDockLampFlash,
  applyStationDockLampFlash,
} from '../src/render/renderer.js';

function createMockBus() {
  const handlers = new Map();
  const events = [];
  return {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
      return () => {
        const arr = handlers.get(event) || [];
        const idx = arr.indexOf(fn);
        if (idx >= 0) arr.splice(idx, 1);
      };
    },
    emit(event, payload) {
      events.push({ event, payload });
      const arr = handlers.get(event) || [];
      for (const fn of [...arr]) fn(payload);
    },
    events,
  };
}

function makeStation(id = 'station_helios', { x = 0, z = 0, name = 'Helios Prime', isGate = false } = {}) {
  return {
    id,
    type: 'station',
    alive: true,
    pos: { x, z },
    radius: 72,
    data: {
      stationId: id,
      name,
      dockRadius: 72,
      isGate,
    },
  };
}

function makePlayer({ x = 100, z = 100, slingshot = false } = {}) {
  return {
    id: 'player_0',
    type: 'ship',
    alive: true,
    pos: { x, z },
    tether: {
      active: false,
      slingshot,
      slingshotT: slingshot ? 1.0 : 0,
    },
  };
}

test('slingshot kill qualification: evaluates active tether slingshot, release memory, and stunts', () => {
  const state = {
    playerId: 'player_0',
    simTime: 50.0,
    player: makePlayer({ slingshot: false }),
  };

  // 1. Regular kill without slingshot: not qualified
  const regularKill = {
    id: 'enemy_1',
    killerId: 'player_0',
    type: 'ship',
    pos: { x: 50, z: 50 },
    victimClass: 'wasp',
  };
  assert.equal(isSlingshotKill(state, regularKill), false, 'plain kill is not slingshot kill');

  // 2. Kill while state.player.tether.slingshot is true
  state.player.tether.slingshot = true;
  assert.equal(isSlingshotKill(state, regularKill), true, 'kill while player.tether.slingshot is true qualifies');
  state.player.tether.slingshot = false;

  // 3. Kill with explicit payload slingshot flag
  const slingshotPayloadKill = { ...regularKill, slingshot: true };
  assert.equal(isSlingshotKill(state, slingshotPayloadKill), true, 'payload.slingshot qualifies');

  // 4. Kill with cause slingshot or massline_whip
  const causeKill = { ...regularKill, cause: 'slingshot' };
  assert.equal(isSlingshotKill(state, causeKill), true, 'cause slingshot qualifies');

  // 5. Kill inside slingshot release memory window (recent tether:cut slingshot)
  state._lastSlingshotReleaseTime = 49.0; // 1.0s ago (window is 2.0s)
  assert.equal(isSlingshotKill(state, regularKill), true, 'kill inside 2s release memory window qualifies');

  // Past memory window
  state._lastSlingshotReleaseTime = 47.0; // 3.0s ago
  assert.equal(isSlingshotKill(state, regularKill), false, 'kill outside memory window does not qualify');

  // 6. Kill inside stunt slingshot_golf window
  state._lastStuntTrickId = 'slingshot_golf';
  state._lastStuntTrickTime = 49.2;
  assert.equal(isSlingshotKill(state, regularKill), true, 'kill after slingshot_golf stunt qualifies');

  // 7. Non-player kill (NPC vs NPC) never qualifies
  const npcKill = { ...regularKill, killerId: 'enemy_2', slingshot: true };
  assert.equal(isSlingshotKill(state, npcKill), false, 'NPC kill is ignored');

  // 8. Player suicide is never an applause kill
  const suicideKill = { ...regularKill, id: 'player_0', slingshot: true };
  assert.equal(isSlingshotKill(state, suicideKill), false, 'player death is ignored');
});

test('findStationsInSight: identifies stations within sight range and ignores gates/wormholes', () => {
  const stationNear = makeStation('station_near', { x: 100, z: 100 });
  const stationFar = makeStation('station_far', { x: 2000, z: 2000 });
  const gateNear = makeStation('gate_near', { x: 120, z: 120, isGate: true });

  const state = {
    entities: new Map([
      ['station_near', stationNear],
      ['station_far', stationFar],
      ['gate_near', gateNear],
    ]),
  };

  const killPos = { x: 0, z: 0 };
  const inSight = findStationsInSight(state, killPos, 800);

  assert.equal(inSight.length, 1, 'only the near real station is in sight');
  assert.equal(inSight[0].station.id, 'station_near');
  assert.ok(inSight[0].distanceWu < 800);
});

test('triggerStationApplause: sets station data, emits station:applause and station:dockLampFlash', () => {
  const bus = createMockBus();
  const station = makeStation('station_vesta', { x: 200, z: 300, name: 'Vesta Forge' });
  const state = {
    playerId: 'player_0',
    simTime: 120.0,
  };

  const killPayload = {
    id: 'raider_9',
    killerId: 'player_0',
    type: 'ship',
    pos: { x: 250, z: 320 },
    victimClass: 'corsair_raider',
  };

  const ok = triggerStationApplause(station, state, bus, killPayload, 53.85);
  assert.equal(ok, true, 'applause triggered successfully');

  // Verify station state
  assert.equal(station.data.dockLampsFlashing, true);
  assert.equal(station.data.dockLampFlashUntil, 120.0 + APPLAUSE_PLANT_TUNING.flashDurationS);
  assert.equal(station.data.applauseCount, 1);
  assert.equal(station.data.lastApplauseTime, 120.0);

  // Verify emitted events
  const applauseEvents = bus.events.filter((e) => e.event === APPLAUSE_PLANT_EVENT);
  assert.equal(applauseEvents.length, 1);
  assert.equal(applauseEvents[0].payload.stationId, 'station_vesta');
  assert.equal(applauseEvents[0].payload.stationName, 'Vesta Forge');
  assert.equal(applauseEvents[0].payload.victimId, 'raider_9');
  assert.equal(applauseEvents[0].payload.flashes, 2);

  const flashEvents = bus.events.filter((e) => e.event === APPLAUSE_FLASH_EVENT);
  assert.equal(flashEvents.length, 1);
  assert.equal(flashEvents[0].payload.stationId, 'station_vesta');
  assert.equal(flashEvents[0].payload.duration, 1.6);
  assert.equal(flashEvents[0].payload.flashes, 2);
});

test('cooldown: second slingshot kill within cooldown period does NOT re-trigger applause', () => {
  const bus = createMockBus();
  const station = makeStation('station_vesta', { x: 0, z: 0 });
  const state = {
    playerId: 'player_0',
    simTime: 100.0,
  };
  const killPayload = { id: 'victim_1', killerId: 'player_0', pos: { x: 50, z: 50 } };

  // First kill: triggers
  assert.equal(triggerStationApplause(station, state, bus, killPayload, 70.7), true);

  // Second kill at 101.0s (inside 1.6s flash duration and 4.0s cooldown): refused
  state.simTime = 101.0;
  assert.equal(triggerStationApplause(station, state, bus, killPayload, 70.7), false);

  // Third kill at 103.0s (flash ended, but inside 4.0s cooldown): refused
  state.simTime = 103.0;
  assert.equal(triggerStationApplause(station, state, bus, killPayload, 70.7), false);

  // Fourth kill at 105.0s (after 4.0s cooldown): triggers again!
  state.simTime = 105.0;
  assert.equal(triggerStationApplause(station, state, bus, killPayload, 70.7), true);
  assert.equal(station.data.applauseCount, 2);
});

test('negative conditions: wrong distance, wrong killer, not slingshot do NOT trigger applause', () => {
  const bus = createMockBus();
  const station = makeStation('station_ceres', { x: 0, z: 0 });
  const state = {
    playerId: 'player_0',
    simTime: 200.0,
    player: makePlayer({ x: 0, z: 0, slingshot: true }),
    entities: new Map([['station_ceres', station]]),
  };

  const sys = {
    state,
    bus,
    ...applausePlantOps,
  };
  sys._initApplausePlantListeners();

  // 1. Wrong distance: kill is 1500 WU away (> 800 WU)
  bus.emit('entity:killed', {
    id: 'distant_enemy',
    killerId: 'player_0',
    type: 'ship',
    pos: { x: 1500, z: 0 },
    slingshot: true,
  });
  assert.equal(station.data.dockLampsFlashing, undefined, 'distant kill does not trigger applause');
  assert.equal(bus.events.some((e) => e.event === APPLAUSE_PLANT_EVENT), false);

  // 2. Wrong killer: NPC kill near station
  bus.emit('entity:killed', {
    id: 'npc_kill',
    killerId: 'pirate_ace',
    type: 'ship',
    pos: { x: 200, z: 200 },
    slingshot: true,
  });
  assert.equal(station.data.dockLampsFlashing, undefined, 'NPC kill does not trigger applause');

  // 3. Not slingshot: normal kill near station
  state.player.tether.slingshot = false;
  bus.emit('entity:killed', {
    id: 'normal_kill',
    killerId: 'player_0',
    type: 'ship',
    pos: { x: 200, z: 200 },
  });
  assert.equal(station.data.dockLampsFlashing, undefined, 'non-slingshot kill does not trigger applause');

  // 4. Slingshot kill near station: SUCCESS!
  state.player.tether.slingshot = true;
  bus.emit('entity:killed', {
    id: 'slingshot_victim',
    killerId: 'player_0',
    type: 'ship',
    pos: { x: 200, z: 200 },
  });
  assert.equal(station.data.dockLampsFlashing, true, 'slingshot kill within sight triggers applause');
  assert.equal(bus.events.some((e) => e.event === APPLAUSE_PLANT_EVENT), true);
});

test('station dock lamp presentation: two flashes, respecting reduced flash, and cleanly expires (PL-08)', () => {
  const station = makeStation('station_flash_test');
  station.data.dockLampsFlashing = true;
  station.data.dockLampFlashUntil = 101.6;

  // 1. Calm station returns neutral multiplier
  const calmStation = makeStation('station_calm');
  assert.equal(computeStationDockLampFlash(calmStation, 100.0, false), 1.0);

  // 2. Pulse 1 (elapsed 0.15s, within 0.00s - 0.30s): full flash gain
  const flash1 = computeStationDockLampFlash(station, 100.15, false);
  assert.ok(flash1 >= 4.0, 'pulse 1 delivers bright dock lamp flash');

  // 3. Gap between pulses (elapsed 0.40s, between 0.30s and 0.55s): resting floor
  const gap = computeStationDockLampFlash(station, 100.40, false);
  assert.equal(gap, 1.0, 'gap between flashes returns to resting baseline');

  // 4. Pulse 2 (elapsed 0.70s, between 0.55s and 0.85s): second flash
  const flash2 = computeStationDockLampFlash(station, 100.70, false);
  assert.ok(flash2 >= 4.0, 'pulse 2 delivers second dock lamp flash');

  // 5. Rest after pulses (elapsed 1.00s, before 1.6s expiry): resting baseline
  const rest = computeStationDockLampFlash(station, 101.00, false);
  assert.equal(rest, 1.0, 'rest after pulse 2 remains baseline until window ends');

  // 6. Reduced flash: calm, accessible radiance
  const reducedPulse = computeStationDockLampFlash(station, 100.15, true);
  assert.ok(reducedPulse < flash1, 'reduced flash is dimmer than standard flash');
  assert.ok(reducedPulse > 1.4, 'reduced flash visibly conveys the double flash');

  // 7. Expiry at or past dockLampFlashUntil: flag cleared, multiplier 1.0
  const expired = computeStationDockLampFlash(station, 101.60, false);
  assert.equal(expired, 1.0, 'expired lamp returns to resting multiplier');
  assert.equal(station.data.dockLampsFlashing, false, 'dockLampsFlashing cleared upon expiry');
});

test('applyStationDockLampFlash: traverses Three.js mesh blinkers and modulates emissiveIntensity', () => {
  const group = new THREE.Group();
  const lensMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.36, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x5fffa0, emissive: new THREE.Color(0x5fffa0), emissiveIntensity: 3.4 }),
  );
  lensMesh.userData.blink = { phase: 0, hz: 1.0, base: 3.4 };
  group.add(lensMesh);

  const station = makeStation('station_mesh_test');
  station.data.dockLampsFlashing = true;
  station.data.dockLampFlashUntil = 101.6;

  // In Pulse 1 (simTime = 100.15s):
  const mult = applyStationDockLampFlash(group, station, 100.15, false);
  assert.ok(mult >= 4.0);
  assert.ok(lensMesh.material.emissiveIntensity > 12.0, 'emissive intensity flared during pulse 1');

  // In Gap (simTime = 100.40s):
  const gapMult = applyStationDockLampFlash(group, station, 100.40, false);
  assert.equal(gapMult, 1.0);
  assert.equal(lensMesh.material.emissiveIntensity, 3.4, 'emissive intensity restored to base in gap');

  // In Pulse 2 (simTime = 100.70s):
  const mult2 = applyStationDockLampFlash(group, station, 100.70, false);
  assert.ok(mult2 >= 4.0);
  assert.ok(lensMesh.material.emissiveIntensity > 12.0, 'emissive intensity flared during pulse 2');

  // Upon expiry (simTime = 101.60s):
  const expMult = applyStationDockLampFlash(group, station, 101.60, false);
  assert.equal(expMult, 1.0);
  assert.equal(lensMesh.material.emissiveIntensity, 3.4, 'emissive intensity restored to base on expiry');
  assert.equal(station.data.dockLampsFlashing, false);
});
