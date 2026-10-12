import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { cruise, isCruising, isCharging } from '../src/systems/cruise.js';

function boot() {
  const state = createGameState(4242);
  state.mode = 'flight'; state.playerId = 1; state.input.actions = {};
  state.entities.set(1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 } });
  const bus = createBus(); const system = Object.create(cruise);
  const ctx = { state, bus, helpers: {} }; system.init(ctx);
  const drops = []; bus.on('cruise:dropped', p => drops.push(p));
  return { state, bus, system, ctx, drops };
}
for (const event of ['dock:docked', 'player:death']) {
  for (const phase of ['charging', 'cruising']) {
    test(`${event} releases ${phase} without leaving a gun lock or a yaw penalty`, () => {
      const h = boot();
      h.state.player.cruise = { phase, t: 2, stumbleT: 0.3, stumbleCdT: 1, hitLog: [{ t: 0, amt: 30 }] };
      h.system._wasCruiseAction = true;
      h.bus.emit(event, { shipId: 1 }); h.bus.emit(event, { shipId: 1 });
      assert.equal(isCruising(h.state), false);
      assert.equal(isCharging(h.state), false);
      assert.equal(h.state.player.cruise.stumbleT, 0);
      assert.equal(h.state.player.cruise.stumbleCdT, 0);
      assert.deepEqual(h.state.player.cruise.hitLog, []);
      assert.equal(h.drops.length, 1, 'one end receipt lets audio/VFX stop once');
      h.state.input.actions.cruise = true;
      h.system.update(1 / 60, h.state);
      assert.equal(isCharging(h.state), true, 'the next deliberate press works after return');
      h.system.destroy();
    });
  }
}

test('pause and normal save continuation preserve the travel phase', () => {
  const h = boot();
  h.state.player.cruise = { phase: 'cruising', t: 3, stumbleT: 0, stumbleCdT: 0 };
  h.state.mode = 'pause'; h.system.update(10, h.state);
  assert.equal(isCruising(h.state), true);
  h.bus.emit('save:loaded');
  assert.equal(isCruising(h.state), true, 'Continue does not silently change a saved travel decision');
  h.system.destroy();
});

test('reinitialization cannot count each chip twice, and destroy detaches old-world listeners', () => {
  const h = boot(); h.system.init(h.ctx); h.system.init(h.ctx);
  h.state.player.cruise = { phase: 'cruising', t: 3, stumbleT: 0, stumbleCdT: 0 };
  h.bus.emit('combat:damage', { targetId: 1, applied: 13, rawTotal: 13, origin: { kind: 'weapon' } });
  assert.equal(isCruising(h.state), true, '13 damage is not 39 damage after three initializations');
  assert.equal(h.state.player.cruise.hitLog.length, 1);
  h.system.destroy();
  h.bus.emit('combat:damage', { targetId: 1, hullDamage: 99 });
  h.bus.emit('dock:docked');
  assert.equal(isCruising(h.state), true, 'destroyed owner cannot mutate a later session');
});

test('newGame clears cruise and damage history but does not touch another player property', () => {
  const h = boot(); h.state.player.credits = 875;
  h.state.player.cruise = { phase: 'charging', t: 2, hitLog: [{ t: 99, amt: 30 }] };
  h.system.newGame();
  assert.equal(isCharging(h.state), false);
  assert.equal(h.state.player.cruise.t, 0);
  assert.equal(h.state.player.credits, 875);
  h.system.destroy();
});
