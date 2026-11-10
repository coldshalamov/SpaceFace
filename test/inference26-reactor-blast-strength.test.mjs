import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { salvageActions } from '../src/systems/salvageActions.js';

test('reactor and hot-core damage saturates at full strength inside a hull', () => {
  for (const kind of ['reactor', 'core']) {
    const victim = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, radius: 80 };
    const charge = { id: 2, type: kind === 'reactor' ? 'wreck' : 'pickup', alive: true,
      pos: { x: 0, z: 0 }, data: kind === 'reactor'
        ? { unstableReactor: { dueAt: 99, damage: 20 } } : { ventedCore: true, cooledAt: 125 } };
    const bus = createBus(), hits = [];
    const state = { simTime: 100, tick: 6000, playerId: 1, player: {},
      entities: new Map([[1, victim], [2, charge]]), entityList: [victim, charge] };
    const system = Object.create(salvageActions);
    system.init({ state, bus, registry: { get: id => id === 'combat' ? { onHit: hit => hits.push(hit) } : null } });
    if (kind === 'reactor') system.update(1 / 60, state);
    else bus.emit('combat:damage', { targetId: 2, attackerId: 3, applied: 1 });
    assert.equal(hits.find(row => row.targetId === 1)?.damage, kind === 'reactor' ? 20 : 8,
      'overlapping a hull must not amplify an explosion beyond its authored full damage');
    system.destroy();
  }
});
