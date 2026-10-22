// Glassbacks in the Black Orchard read as scattered glass until the player closes in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import { materializeAlienEcology, refreshAlienLabels } from '../src/systems/alienEcology.js';

function makeWorld(sectorId) {
  const state = {
    meta: { seed: 4242 },
    simTime: 0,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: sectorId, sectors: {} },
  };
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
    bus: { emit: () => {} },
  };
  return { state, world };
}

test('orchard glassbacks stay scattered glass until the player is inside the close band', () => {
  const orchard = ALIEN_SITES.black_orchard;
  const { state, world } = makeWorld(orchard.sectorId);
  materializeAlienEcology(world, { id: orchard.sectorId }, world.active, [orchard]);
  const backs = state.entityList.filter((e) => e.data?.ecology?.speciesId === 'glassback'
    && e.data.ecology.siteId === orchard.siteId);
  const lung = state.entityList.find((e) => e.data?.ecology?.speciesId === 'stone_lung'
    && e.data.ecology.siteId === orchard.siteId);
  assert.ok(backs.length >= 2, 'the orchard has more than one glassback');
  assert.ok(lung, 'a stone lung shares the orchard and must keep its own name');
  for (const back of backs) {
    assert.equal(back.data.name, 'SCATTERED GLASS');
    assert.equal(back.data.scanLabel, 'SCATTERED GLASS');
  }
  assert.notEqual(lung.data.name, 'SCATTERED GLASS');

  const near = backs[0];
  const far = backs[1];
  near.pos.x = orchard.center.x;
  near.pos.z = orchard.center.z;
  far.pos.x = orchard.center.x + 2000;
  far.pos.z = orchard.center.z;
  lung.pos.x = orchard.center.x + 40;
  lung.pos.z = orchard.center.z;
  const player = {
    id: 1, type: 'player', alive: true,
    pos: { x: near.pos.x, z: near.pos.z },
    vel: { x: 0, z: 0 }, data: { fittings: [] },
  };
  state.entities.set(1, player);
  state.entityList.push(player);
  ensureAlienEcologyState(state).revelation = 2;

  refreshAlienLabels(world);
  assert.equal(near.data.name, 'Glassback');
  assert.notEqual(near.data.scanLabel, 'SCATTERED GLASS');
  assert.equal(far.data.name, 'SCATTERED GLASS');
  assert.equal(far.data.scanLabel, 'SCATTERED GLASS');
  assert.equal(lung.data.name, 'Stone Lung');

  const dock = ALIEN_SITES.breathing_dock;
  const other = makeWorld(dock.sectorId);
  materializeAlienEcology(other.world, { id: dock.sectorId }, other.world.active, [dock]);
  const plain = other.state.entityList.find((e) => e.data?.ecology?.speciesId === 'glassback');
  assert.ok(plain, 'a glassback outside the orchard');
  assert.notEqual(plain.data.name, 'SCATTERED GLASS');
  assert.notEqual(plain.data.scanLabel, 'SCATTERED GLASS');
});
