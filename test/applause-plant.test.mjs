// PL-08 Applause plant tests — a thrown-body kill within 1500 WU of a station makes its dock lamps
// flash twice (on 0.15 s, off 0.15 s, on 0.15 s), at most once per station per 20 s.
// The kill payload is the canonical combat.js entity:killed receipt (cause, impactorId,
// presentation.impactLink), not a fabricated flag.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import '../src/systems/traffic.js';
import {
  APPLAUSE_PLANT_EVENT,
  APPLAUSE_FLASH_EVENT,
  APPLAUSE_PLANT_TUNING,
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
    },
    emit(event, payload) {
      events.push({ event, payload });
      for (const fn of [...(handlers.get(event) || [])]) fn(payload);
    },
    events,
  };
}

function makeStation(id = 'station_helios', { x = 0, z = 0, name = 'Helios Prime', isGate = false } = {}) {
  return { id, type: 'station', alive: true, pos: { x, z }, radius: 72, data: { stationId: id, name, dockRadius: 72, isGate } };
}

function throwKill({
  killerId = 'player_0', actorId = 'player_0', tag = 'massline_throw', appliedTick = 390,
  holdUntilTick = null, cause = 'ship_collision', impactorId = 'rock_7', pos = { x: 50, z: 50 }, id = 'enemy_1',
} = {}) {
  return {
    id, killerId, type: 'ship', pos, impactorId, cause,
    presentation: { version: 1, cause, playerCaused: killerId === 'player_0', impactLink: { actorId, tag, appliedTick, holdUntilTick } },
  };
}

const gunKill = () => ({
  id: 'enemy_1', killerId: 'player_0', type: 'ship', pos: { x: 50, z: 50 }, cause: 'kinetic',
  presentation: { version: 1, cause: 'kinetic', impactLink: null },
});

test('throw kill qualification reads the lethal body, not the player sling state', () => {
  const state = { playerId: 'player_0', simTime: 50.0, tick: 400, player: { tether: { slingshot: true } } };
  assert.equal(isSlingshotKill(state, throwKill()), true, 'fresh throw collision qualifies');
  assert.equal(isSlingshotKill(state, gunKill()), false, 'gun kill during a sling is not applause');
  state._lastSlingshotReleaseTime = 49.5;
  assert.equal(isSlingshotKill(state, gunKill()), false, 'gun kill right after a release is not applause');
  state.player.tether.slingshot = false;
  assert.equal(isSlingshotKill(state, throwKill()), true, 'throw kill qualifies with a cold sling flag');
  assert.equal(isSlingshotKill(state, throwKill({ actorId: 'enemy_2' })), false, 'someone else threw it');
  assert.equal(isSlingshotKill(state, throwKill({ appliedTick: 100 })), false, 'stale provenance');
  assert.equal(isSlingshotKill(state, throwKill({ tag: 'direct_contact' })), false, 'a hull ram is not a throw');
  assert.equal(isSlingshotKill(state, throwKill({ impactorId: null })), false, 'no impactor');
  assert.equal(isSlingshotKill(state, throwKill({ id: 'player_0' })), false, 'player death ignored');
  assert.equal(
    isSlingshotKill(state, { id: 'x', killerId: 'player_0', type: 'ship', slingshot: true, cause: 'slingshot' }),
    false,
    'fabricated flags are not honoured',
  );
});

test('findStationsInSight: 1500 WU range, ignores gates', () => {
  const state = {
    entities: new Map([
      ['station_near', makeStation('station_near', { x: 1000, z: 0 })],
      ['station_far', makeStation('station_far', { x: 2000, z: 0 })],
      ['gate_near', makeStation('gate_near', { x: 120, z: 120, isGate: true })],
    ]),
  };
  const inSight = findStationsInSight(state, { x: 0, z: 0 });
  assert.equal(APPLAUSE_PLANT_TUNING.maxSightRangeWu, 1500);
  assert.deepEqual(inSight.map((r) => r.station.id), ['station_near']);
});

test('triggerStationApplause: sets station data, emits station:applause and station:dockLampFlash', () => {
  const bus = createMockBus();
  const station = makeStation('station_vesta', { x: 200, z: 300, name: 'Vesta Forge' });
  const state = { playerId: 'player_0', simTime: 120.0 };
  assert.equal(triggerStationApplause(station, state, bus, throwKill({ id: 'raider_9', pos: { x: 250, z: 320 } }), 53.85), true);
  assert.equal(station.data.dockLampsFlashing, true);
  assert.equal(station.data.dockLampFlashUntil, 120.0 + 0.45);
  assert.equal(station.data.lastApplauseTime, 120.0);
  assert.equal(bus.events.filter((e) => e.event === APPLAUSE_PLANT_EVENT).length, 1);
  const flash = bus.events.filter((e) => e.event === APPLAUSE_FLASH_EVENT);
  assert.equal(flash.length, 1);
  assert.equal(flash[0].payload.duration, 0.45);
  assert.equal(flash[0].payload.flashes, 2);
});

test('cooldown: one flash per station per 20 s', () => {
  const bus = createMockBus();
  const station = makeStation('station_vesta');
  const state = { playerId: 'player_0', simTime: 100.0 };
  const kill = throwKill();
  assert.equal(triggerStationApplause(station, state, bus, kill, 70.7), true);
  state.simTime = 105.0;
  assert.equal(triggerStationApplause(station, state, bus, kill, 70.7), false);
  state.simTime = 119.9;
  assert.equal(triggerStationApplause(station, state, bus, kill, 70.7), false);
  state.simTime = 120.0;
  assert.equal(triggerStationApplause(station, state, bus, kill, 70.7), true);
  assert.equal(station.data.applauseCount, 2);
});

test('real route: entity:killed receipts flash only for in-range thrown-body kills', () => {
  const bus = createMockBus();
  const station = makeStation('station_ceres', { x: 0, z: 0 });
  const state = {
    playerId: 'player_0', simTime: 200.0, tick: 400,
    player: { tether: { slingshot: true } },
    entities: new Map([['station_ceres', station]]),
  };
  const sys = { state, bus, ...applausePlantOps };
  sys._initApplausePlantListeners();
  const flashes = () => bus.events.filter((e) => e.event === APPLAUSE_FLASH_EVENT).length;

  bus.emit('entity:killed', throwKill({ id: 'distant', pos: { x: 2000, z: 0 } }));
  assert.equal(flashes(), 0, '2000 WU away: no flash');
  bus.emit('entity:killed', throwKill({ id: 'npc', killerId: 'pirate_ace', actorId: 'pirate_ace', pos: { x: 200, z: 200 } }));
  assert.equal(flashes(), 0, 'another actor: no flash');
  bus.emit('entity:killed', { ...gunKill(), pos: { x: 200, z: 200 } });
  assert.equal(flashes(), 0, 'gun kill while slinging: no flash');
  bus.emit('entity:killed', throwKill({ id: 'victim', pos: { x: 1000, z: 0 } }));
  assert.equal(flashes(), 1, 'throw kill 1000 WU away: one flash');
  assert.equal(station.data.dockLampsFlashing, true);
  state.simTime = 205.0;
  bus.emit('entity:killed', throwKill({ id: 'victim2', pos: { x: 900, z: 0 } }));
  assert.equal(flashes(), 1, 'second kill 5 s later: still one flash');
});

test('station dock lamp presentation: on 0.15, off 0.15, on 0.15, then off', () => {
  const station = makeStation('station_flash_test');
  station.data.dockLampsFlashing = true;
  station.data.dockLampFlashUntil = 100.45;
  assert.equal(computeStationDockLampFlash(makeStation('calm'), 100.0, false), 1.0);
  const flash1 = computeStationDockLampFlash(station, 100.10, false);
  assert.ok(flash1 >= 4.0, 'pulse 1');
  assert.equal(computeStationDockLampFlash(station, 100.22, false), 1.0, 'off beat');
  assert.ok(computeStationDockLampFlash(station, 100.38, false) >= 4.0, 'pulse 2');
  const reduced = computeStationDockLampFlash(station, 100.10, true);
  assert.ok(reduced < flash1 && reduced > 1.4, 'reduced flash dimmer but visible');
  assert.equal(computeStationDockLampFlash(station, 100.45, false), 1.0);
  assert.equal(station.data.dockLampsFlashing, false);
});

test('applyStationDockLampFlash modulates mesh blinker emissiveIntensity', () => {
  const group = new THREE.Group();
  const lens = new THREE.Mesh(
    new THREE.SphereGeometry(0.36, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x5fffa0, emissive: new THREE.Color(0x5fffa0), emissiveIntensity: 3.4 }),
  );
  lens.userData.blink = { phase: 0, hz: 1.0, base: 3.4 };
  group.add(lens);
  const station = makeStation('station_mesh_test');
  station.data.dockLampsFlashing = true;
  station.data.dockLampFlashUntil = 100.45;
  assert.ok(applyStationDockLampFlash(group, station, 100.10, false) >= 4.0);
  assert.ok(lens.material.emissiveIntensity > 12.0);
  assert.equal(applyStationDockLampFlash(group, station, 100.22, false), 1.0);
  assert.equal(lens.material.emissiveIntensity, 3.4);
  assert.ok(applyStationDockLampFlash(group, station, 100.38, false) >= 4.0);
  assert.equal(applyStationDockLampFlash(group, station, 100.46, false), 1.0);
  assert.equal(lens.material.emissiveIntensity, 3.4);
  assert.equal(station.data.dockLampsFlashing, false);
});
