// Needle swarms at the Cinder Nursery break their ring when the player fires.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import { handleAlienEcologyEvent, materializeAlienEcology, tickAlienEcology } from '../src/systems/alienEcology.js';

function makeWorld(sectorId) {
  const state = {
    meta: { seed: 4242 },
    simTime: 0,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: { cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 40 } },
    world: { currentSectorId: sectorId, sectors: {} },
  };
  const emitLog = [];
  const world = {
    state,
    helpers: {
      mulberry32,
      hash32,
      spawnEntity: (spec) => {
        const e = { ...spec, alive: true, pos: { x: spec.pos.x, z: spec.pos.z }, vel: spec.vel || { x: 0, z: 0 } };
        e.id = state.entities.size + 100;
        state.entities.set(e.id, e);
        state.entityList.push(e);
        return e;
      },
    },
    _toGlobal: (local) => ({ x: local.x, z: local.z }),
    _toLocal: (pos) => ({ x: pos.x, z: pos.z }),
    active: { dressing: [], pois: [] },
    bus: { emit: (type, p) => emitLog.push({ type, p }) },
  };
  return { state, world, emitLog };
}

test('player gunfire scatters the needle swarm and leaves the veil ray in place', () => {
  const site = ALIEN_SITES.cinder_nursery;
  const { state, world, emitLog } = makeWorld(site.sectorId);
  materializeAlienEcology(world, { id: site.sectorId }, world.active, [site]);
  ensureAlienEcologyState(state).sites[site.siteId].state = 'awake';
  const swarms = state.entityList.filter((e) => e.data?.ecology?.speciesId === 'needle_swarm');
  const ray = state.entityList.find((e) => e.data?.ecology?.speciesId === 'veil_ray');
  assert.ok(swarms.length >= 2, 'a ring of needles');
  assert.ok(ray, 'a veil ray shares the nursery wreck');
  const near = swarms[0];
  const far = swarms[1];
  far.pos.x = near.pos.x + 5000;
  far.pos.z = near.pos.z;
  ray.pos.x = near.pos.x + 80;
  ray.pos.z = near.pos.z;
  const player = {
    id: 1, type: 'player', alive: true, pos: { x: near.pos.x + 12000, z: near.pos.z },
    vel: { x: 0, z: 0 }, data: { fittings: [] },
  };
  state.entities.set(1, player);
  state.entityList.push(player);

  handleAlienEcologyEvent(world, 'combat:fire', {
    ownerId: state.playerId,
    origin: { x: near.pos.x, z: near.pos.z },
  });
  assert.equal(near.data.ecology.driveState, 'flee');
  assert.notEqual(far.data.ecology.driveState, 'flee');
  assert.notEqual(ray.data.ecology.driveState, 'flee');
  assert.ok(emitLog.some((row) => row.type === 'toast'
    && row.p.text === 'Gunfire scatters the needle swarm — the ring breaks and they run.'));

  state.simTime += 0.5;
  tickAlienEcology(world, 0.5);
  assert.equal(near.data.ecology.driveState, 'flee', 'the scatter holds on the next ecology tick');
  assert.notEqual(ray.data.ecology.driveState, 'flee');
  assert.notEqual(far.data.ecology.driveState, 'flee');
});
