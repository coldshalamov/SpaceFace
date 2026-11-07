import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createBus } from '../src/core/eventBus.js';
import { swarmSupply } from '../src/systems/swarmSupply.js';
import { mining } from '../src/systems/mining.js';
import { physics } from '../src/core/physics.js';

function fixture() {
  const state = createGameState(4242), bus = createBus();
  state.mode = 'flight';
  state.run = Object.assign(createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    { wave: 1, phase: 'active' });
  const player = { id: state.nextEntityId++, type: 'ship', alive: true,
    hull: 20, hullMax: 100, pos: { x: 0, z: 0 }, data: {} };
  state.playerId = player.id;
  state.entities.set(player.id, player); state.entityList.push(player);
  const helpers = { spawnEntity(spec) {
    const entity = { ...spec, id: state.nextEntityId++, alive: true };
    state.entities.set(entity.id, entity); state.entityList.push(entity);
    bus.emit('entity:spawned', { entity });
    return entity;
  } };
  const supply = Object.create(swarmSupply);
  supply.init({ state, bus, helpers });
  bus.emit('swarm:broodKills', { count: 10, wave: 1, pos: { x: 320, z: -80 } });
  const cells = state.entityList.filter(e => e.type === 'pickup');
  assert.equal(cells.length, 2);
  const scoop = Object.assign(Object.create(mining), { state, bus });
  const contact = Object.assign(Object.create(physics), { _diag: { pickupCollections: 0 } });
  return { state, bus, player, supply, cells,
    scoop: cell => scoop._collectPickupViaEvent(cell, player),
    contact: cell => contact._applyPickupCollection(cell, player, bus, state) };
}

for (const route of ['scoop', 'contact']) {
  test(`${route}: the second repair cell survives a full-hull scoop and heals later damage`, () => {
    const h = fixture();
    const [first, second] = h.cells;
    const expiry = second.data.despawnAt;
    const receipts = [];
    h.bus.on('swarm:supplyCollected', p => receipts.push(p));
    h.player.hull = 90;
    h[route](first);
    assert.equal(h.player.hull, 100);
    assert.equal(first.alive, false);
    h[route](second);
    assert.equal(second.alive, true, 'unused medicine remains a physical pickup');
    assert.equal(second.data.amount, 1);
    assert.equal(second.data.despawnAt, expiry, 'no lifetime extension');
    assert.equal(receipts.length, 1, 'no false heal receipt');
    h.player.hull = 75;
    h.state.simTime = 1; // existing pickup retry cooldown, not a new supply clock
    h[route](second);
    assert.equal(h.player.hull, 97);
    assert.equal(second.alive, false);
    assert.equal(receipts.length, 2);
    h.bus.emit('pickup:collected', { pickupId: second.id, collectorId: h.player.id });
    assert.equal(h.player.hull, 97, 'duplicate receipt cannot heal twice');
    h.supply.destroy();
  });
}

test('a wrong collector does not burn the player repair claim', () => {
  const h = fixture(), cell = h.cells[0];
  const receipt = { pickupId: cell.id, collectorId: h.player.id + 100, amount: 1 };
  h.bus.emit('pickup:collected', receipt);
  assert.equal(receipt.acceptedAmount, 0);
  assert.equal(h.player.hull, 20);
  h.scoop(cell);
  assert.equal(h.player.hull, 42);
  assert.equal(cell.alive, false);
  h.supply.destroy();
});

test('an unspent full-hull cell can be reclaimed after owner reinitialization', () => {
  const h = fixture(), cell = h.cells[0];
  h.player.hull = 100;
  h.scoop(cell);
  h.supply.destroy();
  h.supply.init({ state: h.state, bus: h.bus, helpers: {} });
  h.bus.emit('entity:spawned', { entity: cell });
  h.state.simTime = 1;
  h.player.hull = 60;
  h.contact(cell);
  assert.equal(h.player.hull, 82);
  assert.equal(cell.alive, false);
  h.supply.destroy();
});
