// Veil rays at Quiet Ice bolt when a player scan lights them.
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

test('a player scan makes the veil rays at Quiet Ice flinch and keep fleeing', () => {
  const site = ALIEN_SITES.quiet_ice;
  const { state, world, emitLog } = makeWorld(site.sectorId);
  materializeAlienEcology(world, { id: site.sectorId }, world.active, [site]);
  const rec = ensureAlienEcologyState(state).sites[site.siteId];
  rec.state = 'awake';
  const rays = state.entityList.filter((e) => e.data?.ecology?.speciesId === 'veil_ray');
  const cyst = state.entityList.find((e) => e.data?.ecology?.speciesId === 'lantern_cyst');
  assert.ok(rays.length >= 1, 'veil rays are on the ice');
  assert.ok(cyst, 'a cyst shares the pocket and should stay put');
  const ray = rays[0];
  cyst.pos.x = ray.pos.x + 4000;
  cyst.pos.z = ray.pos.z;
  const player = {
    id: 1, type: 'player', alive: true, pos: { x: ray.pos.x + 9000, z: ray.pos.z },
    vel: { x: 0, z: 0 }, data: { fittings: [] },
  };
  state.entities.set(1, player);
  state.entityList.push(player);

  handleAlienEcologyEvent(world, 'scan:pulse', {
    source: 'player-scanner',
    pos: { x: ray.pos.x, z: ray.pos.z },
    radius: 40,
  });
  assert.equal(ray.data.ecology.driveState, 'flee');
  assert.notEqual(cyst.data.ecology.driveState, 'flee');
  assert.ok(emitLog.some((row) => row.type === 'toast'
    && row.p.text === 'The veil rays flinch — the scan lights their membranes.'));

  state.simTime += 0.5;
  tickAlienEcology(world, 0.5);
  assert.equal(ray.data.ecology.driveState, 'flee', 'the flinch holds after the ecology tick');
  assert.notEqual(cyst.data.ecology.driveState, 'flee');
});
