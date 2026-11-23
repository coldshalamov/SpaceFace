// DEMO-FIX-ADV-1 item 4 — the 47-A Skim's wreck fan never spawns against a docked hull.
//
// The lane variant opens the fan 44-93 m ahead of a moving ship, in open space, which is right.
// The dock variant resolves with the ship berthed at Helios (size L, dock radius 90 m), so the
// same fan put three 40,000-mass wrecks inside the station's own hull. The dock variant keeps the
// outward ring instead, at a range that clears the station whatever hull it is.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { missions as missionsProto } from '../src/systems/missions.js';

const SECTOR = 'sector_helios_prime';

function dockedState() {
  const state = createGameState(47);
  state.mode = 'flight';
  state.simTime = 120;
  state.world.currentSectorId = SECTOR;
  state.meta.seed = 47;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, radius: 14, rot: 0,
    pos: { x: -64, z: 8 }, vel: { x: 0, z: 0 },
  };
  // A size-L hub at the origin: its authored dock radius is 90 m (world.js), and its compound
  // proxy reaches ~0.9 of that. The berth the ship sits on is ~65 m off centre.
  const station = {
    id: 4, type: 'station', alive: true, name: 'Helios Station', radius: 42, rot: 0,
    pos: { x: 0, z: 0 },
    data: {
      stationId: 'station_helios', dockRadius: 90, collisionProxy: 'station_ring_hub',
      corridorBearingDeg: 135,
    },
  };
  state.entities = new Map([[1, player], [4, station]]);
  state.entityList = [player, station];
  state.playerId = 1;
  state.ui = { ...(state.ui || {}), docked: true, dockedStationId: 'station_helios' };
  return { state, player, station };
}

function skimWrecks(state) {
  const owner = Object.assign(Object.create(missionsProto), {
    state,
    bus: createBus(),
    helpers: {
      spawnEntity(spec) {
        const id = state.entityList.length + 10;
        const entity = { id, alive: true, ...spec, data: structuredClone(spec.data || {}) };
        state.entities.set(id, entity);
        state.entityList.push(entity);
        return entity;
      },
    },
  });
  const count = owner._spawnContract47aSkimWrecks({ id: '47-A' }, 'dock');
  return state.entityList.filter((e) => e && e.data && e.data.contract47aSkim === true);
}

test('a dock-variant Skim leaves its wrecks clear of the station it resolved at', () => {
  const { state, player, station } = dockedState();
  const wrecks = skimWrecks(state);
  assert.equal(wrecks.length, 3, 'all three casualties still spawn');
  const stationHull = station.data.dockRadius;
  for (const wreck of wrecks) {
    const toStation = Math.hypot(wreck.pos.x - station.pos.x, wreck.pos.z - station.pos.z);
    assert.ok(toStation > stationHull + 30,
      `${wreck.data.scanLabel} lies ${toStation.toFixed(0)} m from the station centre, outside its ${stationHull} m hull`);
    assert.ok(toStation >= 140, 'and at or beyond the authored outward ring floor');
    assert.ok(toStation <= 260, 'and still inside the ring, not flung across the sector');
  }
  const toShip = wrecks.map((w) => Math.hypot(w.pos.x - player.pos.x, w.pos.z - player.pos.z));
  assert.ok(toShip.every((d) => d > 100),
    'no wreck lands on top of the berthed hull');
});

test('the lane variant still opens its fan in front of a moving ship', () => {
  const { state, player } = dockedState();
  state.ui = { ...state.ui, docked: false, dockedStationId: null };
  player.vel = { x: 60, z: 0 };
  player.rot = 0;
  const owner = Object.assign(Object.create(missionsProto), {
    state,
    bus: createBus(),
    helpers: {
      spawnEntity(spec) {
        const id = state.entityList.length + 10;
        const entity = { id, alive: true, ...spec, data: structuredClone(spec.data || {}) };
        state.entities.set(id, entity);
        state.entityList.push(entity);
        return entity;
      },
    },
  });
  owner._spawnContract47aSkimWrecks({ id: '47-A' }, 'lane');
  const wrecks = state.entityList.filter((e) => e && e.data && e.data.contract47aSkim === true);
  assert.equal(wrecks.length, 3);
  for (const wreck of wrecks) {
    const dx = wreck.pos.x - player.pos.x;
    const dz = wreck.pos.z - player.pos.z;
    const dist = Math.hypot(dx, dz);
    assert.ok(dist >= 44 && dist <= 100, `lane wreck sits ${dist.toFixed(0)} m ahead, on the glass`);
    assert.ok(dx > 0, 'ahead of the ship, along its travel');
  }
});
