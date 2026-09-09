import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { cargo as cargoBase } from '../src/systems/cargo.js';
import { mining as miningBase } from '../src/systems/mining.js';

function bootRelease(capVolume) {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    radius: 6,
    data: { miningBeam: { tierId: 'beam_mk1', directToCargo: true } },
  };
  const asteroid = {
    id: 9,
    type: 'asteroid',
    alive: true,
    pos: { x: 8, z: 0 },
    radius: 6,
    data: { typeId: 'ast_metallic', commodityId: 'cmdty_ore_iron' },
  };
  const state = {
    playerId: player.id,
    player: { cargo: { items: {}, capVolume, capMass: 100, usedVolume: 0, usedMass: 0 } },
    entities: new Map([[player.id, player], [asteroid.id, asteroid]]),
    entityList: [player, asteroid],
    rng: () => 0,
    simTime: 10,
    tick: 600,
    meta: { seed: 1 },
  };
  const bus = createBus();
  const cargo = { ...cargoBase };
  cargo.init({ state, bus, helpers: { spawnEntity() {} } });
  const spawned = [];
  const mining = { ...miningBase };
  mining.init({
    state,
    bus,
    helpers: { spawnEntity(spec) { spawned.push(spec); } },
    registry: { get(name) { return name === 'cargo' ? cargo : null; } },
  });
  return { state, mining, asteroid, player, spawned };
}

test('direct-feed mining spills ordinary ore as pickups when the hold is full', () => {
  const full = bootRelease(0);
  full.mining._releaseOre(full.asteroid, { oreTable: { cmdty_ore_iron: 1 } }, 5, full.player);
  assert.equal(full.state.player.cargo.items.cmdty_ore_iron, undefined);
  assert.equal(full.spawned.length, 1);
  assert.equal(full.spawned[0].data.commodityId, 'cmdty_ore_iron');
  assert.equal(full.spawned[0].data.amount, 5);
});

test('direct-feed mining keeps what fits and spills only the rejected remainder', () => {
  const partial = bootRelease(2);
  partial.mining._releaseOre(partial.asteroid, { oreTable: { cmdty_ore_iron: 1 } }, 5, partial.player);
  assert.equal(partial.state.player.cargo.items.cmdty_ore_iron, 2);
  assert.equal(partial.spawned.length, 1);
  assert.equal(partial.spawned[0].data.amount, 3);
});
