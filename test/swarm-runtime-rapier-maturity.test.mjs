// Native solver check of the arrival window, not an AI/combat playthrough or FPS benchmark.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { materializeWaveBatch } from '../src/systems/waveMaterialization.js';

for (const enemyId of ['wasp_swarmer', 'reaver_pirate', 'dreadnought_boss']) {
  test(`${enemyId}: real Rapier colliders remain contact-free for the predictive arrival window`, async () => {
    const state = createGameState(17403);
    function spawnEntity(spec) {
      const entity = { ...spec, id: state.nextEntityId++, occupantGeneration: 1,
        alive: true, collides: true, flags: { ...spec.flags },
        pos: { ...spec.pos }, prevPos: { ...spec.pos }, vel: { ...spec.vel } };
      state.entities.set(entity.id, entity); state.entityList.push(entity); return entity;
    }
    const player = spawnEntity({ type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      radius: 8, mass: 400, hull: 200, hullMax: 200, data: {} });
    state.playerId = player.id;
    // This rock crosses the intended front gate, but is not on it at either endpoint.
    const rock = spawnEntity({ type: 'asteroid', pos: { x: -120, z: -165 }, vel: { x: 320, z: 0 },
      radius: 28, mass: 14000, hull: 800, data: {} });
    const budget = makeBudgetApi(state);
    const receipt = materializeWaveBatch({ state, helpers: { spawnEntity, spawnBudget: budget } }, {
      ownerId: 'swarm-rapier-proof', enemyId, count: enemyId === 'dreadnought_boss' ? 1 : 8,
      seed: 17403, wave: 10, swarm: true, distance: 165, gateGroup: 'front',
    });
    assert.ok(receipt.admitted > 0, 'must exercise actual admissions, not a vacuous empty scene');
    const physics = await createSg02DynamicBodyOwner({ publishTelemetry: false });
    try {
      physics.syncFromEntities(state.entityList);
      for (const id of receipt.spawnedIds) assert.ok(physics.records.get(id)?.colliders.length > 0);
      for (let tick = 0; tick < 45; tick++) {
        physics.step(1 / 60);
        for (const id of receipt.spawnedIds) {
          assert.deepEqual(physics.sampleSolidContacts(id), [], `spawn ${id} contacts at tick ${tick}`);
          const entity = state.entities.get(id);
          assert.ok(Math.hypot(entity.vel.x, entity.vel.z) < 0.001, 'no penetration ejection impulse');
        }
        assert.ok(Math.hypot(player.vel.x, player.vel.z) < 0.001, 'no spawn pile-up kick to pilot');
      }
      assert.ok(rock.pos.x > 90, 'the real dynamic asteroid crossed the gate during the test');
    } finally { physics.dispose(); }
  });
}
