import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { salvageActions } from '../src/systems/salvageActions.js';

function fixture() {
  const bus = createBus();
  const state = { simTime: 100, tick: 6000, playerId: 1, player: {},
    entities: new Map(), entityList: [],
    entityIndex: { __spacefaceEntityIndexV1: true, ready: true, version: 1 } };
  const hits = [];
  const system = Object.create(salvageActions);
  system.init({ state, bus, registry: { get: id => id === 'combat' ? { onHit: hit => hits.push(hit) } : null } });
  const add = (id, type, x, extra = {}) => {
    const entity = { id, type, alive: true, team: 1, radius: 8,
      pos: { x, z: 0 }, vel: { x: 0, z: 0 }, data: {}, ...extra };
    state.entities.set(id, entity); state.entityList.push(entity); return entity;
  };
  return { state, bus, system, hits, add };
}

test('shooting a safely towed reactor rearms its delayed fuse even after the quiet latch', () => {
  const h = fixture();
  const reactor = h.add(2, 'wreck', 0, { data: { unstableReactor: {
    dueAt: 104, damage: 20, towedClear: true,
  } } });
  h.add(3, 'ship', 30);
  h.system.update(1 / 60, h.state);
  assert.equal(h.state.salvageActionsRuntime.unstableQuietLatched, true);
  h.bus.emit('combat:damage', { targetId: 2, attackerId: 1, applied: 10, amount: 10 });
  assert.equal(reactor.alive, true, 'light damage starts a fuse rather than an immediate burst');
  h.state.simTime = 102.6; h.state.tick++;
  h.system.update(1 / 60, h.state);
  assert.equal(reactor.alive, false, 'the rearmed towed bomb must actually burst on time');
  assert.ok(h.hits.some(hit => hit.targetId === 3 && hit.ownerId === 1));
  h.system.destroy();
});

test('a safely towed reactor stays inert until deliberately rearmed', () => {
  const h = fixture();
  const reactor = h.add(2, 'wreck', 0, { data: { unstableReactor: {
    dueAt: 99, damage: 20, towedClear: true,
  } } });
  h.system.update(1 / 60, h.state);
  assert.equal(reactor.alive, true);
  assert.equal(h.hits.length, 0);
  h.system.destroy();
});
