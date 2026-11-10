import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { ships, buildSlotList } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';

function boot(player = null, tick = 321) {
  const state = createGameState(321);
  state.tick = tick;
  state.player.ownedShips = [{
    defId: 'ship_kestrel',
    fittings: Array(buildSlotList(SHIPS.find((ship) => ship.id === 'ship_kestrel')).length).fill(null),
  }];
  state.player.activeShipIndex = 0;
  state.player.moduleInventory = [];
  if (player) state.player = structuredClone(player);
  const system = Object.create(ships);
  system.init({ state, bus: createBus(), helpers: {} });
  return { state, system };
}

function allInstanceIds(player) {
  return [
    ...player.moduleInventory.map((instance) => instance.instanceId),
    ...player.ownedShips.flatMap((ship) => Object.values(ship.fittedInstances || {}).map((instance) => instance.instanceId)),
  ];
}

test('new module grants after a fresh Continue cannot reuse loose or fitted identities at the saved tick', () => {
  const first = boot();
  first.system.grantModule({ defId: 'mod_cargo_scanner_s', provenance: 'earned:first' });
  const fittedId = first.state.player.moduleInventory[0].instanceId;
  assert.equal(first.system.fitModule({ shipIndex: 0, slotIndex: 5, instanceId: fittedId }), true);
  first.system.grantModule({ defId: 'wpn_pulse_laser_s', provenance: 'earned:second' });
  const looseId = first.state.player.moduleInventory[0].instanceId;

  // Continue restores player ownership and the sim tick into a fresh owner instance.
  // While docked, new purchases/rewards share that tick with the already saved instances.
  const continued = boot(first.state.player, first.state.tick);
  assert.equal(continued.system.grantModule({ defId: 'mod_mining_laser_s', provenance: 'earned:after-continue' }), true);
  const created = continued.state.player.moduleInventory.at(-1);
  assert.notEqual(created.instanceId, fittedId);
  assert.notEqual(created.instanceId, looseId);
  assert.equal(continued.system.fitModule({ shipIndex: 0, slotIndex: 4, instanceId: created.instanceId }), true);
  assert.equal(continued.system.unfitModule({ shipIndex: 0, slotIndex: 5 }), true);
  const ids = allInstanceIds(continued.state.player);
  assert.equal(new Set(ids).size, ids.length, 'refitting after Continue must still name each physical module once');
  assert.equal(continued.state.player.moduleInventory.find((item) => item.instanceId === fittedId).provenance, 'earned:first');
});

test('identity allocation also avoids a saved fitted module on an inactive hull', () => {
  const { state, system } = boot();
  state.player.ownedShips.push({
    defId: 'ship_kestrel', fittings: [],
    fittedInstances: { 2: { instanceId: `mi_${state.tick}_1`, defId: 'mod_engine_ion_m' } },
  });
  system.grantModule({ defId: 'mod_cargo_scanner_s' });
  const savedId = state.player.ownedShips[1].fittedInstances[2].instanceId;
  assert.notEqual(state.player.moduleInventory[0].instanceId, savedId);
  assert.equal(new Set(allInstanceIds(state.player)).size, 2);
});
