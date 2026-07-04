#!/usr/bin/env node
// Throwaway sanity check for impulseCharges system (GROK-1 WS-D2).
import assert from 'node:assert/strict';
import { createBus } from '../../../src/core/eventBus.js';
import { makeEntity } from '../../../src/core/entity.js';
import { mulberry32 } from '../../../src/core/rng.js';
import { impulseCharges } from '../../../src/systems/impulseCharges.js';

const DT = 1 / 60;

function spawnEntity(state, spec) {
  const e = makeEntity(spec);
  const id = state.nextEntityId++;
  e.id = id;
  state.entities.set(id, e);
  state.entityList.push(e);
  return e;
}

function makeState() {
  const state = {
    mode: 'flight',
    simTime: 0,
    tick: 0,
    playerId: 1,
    nextEntityId: 10,
    entities: new Map(),
    entityList: [],
    rng: mulberry32(42),
    input: {
      aimWorld: { x: 30, z: 0 },
      aimAngle: 0,
      actions: {},
    },
    player: {
      cargo: { items: { cmdty_impulse_charge: 3 }, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 100 },
    },
    content: {
      commodities: {
        cmdty_impulse_charge: { id: 'cmdty_impulse_charge', volPerU: 2, massPerU: 2 },
      },
    },
    ui: { screenStack: [] },
  };

  const player = spawnEntity(state, {
    type: 'ship',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 6,
    mass: 32,
    hull: 100,
    hullMax: 100,
    shield: 0,
    shieldMax: 0,
    team: 0,
    collides: true,
    data: {},
  });
  state.playerId = player.id;

  spawnEntity(state, {
    type: 'drone',
    pos: { x: 30, z: 0 },
    vel: { x: 0, z: 0 },
    rot: Math.PI,
    radius: 6,
    mass: 16,
    hull: 80,
    hullMax: 80,
    shield: 0,
    shieldMax: 0,
    team: 1,
    collides: true,
    data: {},
  });

  return state;
}

function run() {
  const bus = createBus();
  const state = makeState();
  const ctx = {
    state,
    bus,
    helpers: { spawnEntity: (spec) => spawnEntity(state, spec) },
    registry: null,
  };
  impulseCharges.init(ctx);

  const player = state.entities.get(state.playerId);
  const drone = state.entityList.find((e) => e.type === 'drone');

  // Throw
  state.input.actions.chargeThrow = true;
  impulseCharges.update(DT, state);
  assert.ok(state.player.cargo.items.cmdty_impulse_charge === 2, 'cargo consumed one charge');

  let stuck = false;
  for (let i = 0; i < 180 && !stuck; i++) {
    state.simTime += DT;
    impulseCharges.update(DT, state);
    const charge = state.entityList.find((e) => e.type === 'charge' && e.alive);
    if (charge && charge.data && charge.data.hostId === drone.id) {
      stuck = true;
      break;
    }
  }
  assert.ok(stuck, 'charge stuck to drone');

  const playerVelBefore = { x: player.vel.x, z: player.vel.z };
  const droneVelBefore = { x: drone.vel.x, z: drone.vel.z };

  state.input.actions.chargeDetonate = true;
  impulseCharges.update(DT, state);

  const playerDv = player.vel.x - playerVelBefore.x;
  const droneDv = drone.vel.x - droneVelBefore.x;

  console.log('player Δvx:', playerDv.toFixed(3), 'drone Δvx:', droneDv.toFixed(3));

  assert.ok(Math.abs(playerDv) > 0.5, 'player received impulse');
  assert.ok(Math.abs(droneDv) > 0.5, 'drone received impulse');
  assert.ok(playerDv < 0, 'player pushed away from blast (negative x)');
  assert.ok(droneDv > 0, 'drone pushed away from blast (positive x)');

  const chargesLeft = state.entityList.filter((e) => e.type === 'charge' && e.alive);
  assert.equal(chargesLeft.length, 0, 'detonated charge despawned');

  console.log('grok-charge-sim-check: PASS');
}

run();