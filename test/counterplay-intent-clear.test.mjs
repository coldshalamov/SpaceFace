import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCounterplayIntent } from '../src/ai/counterplay/adapterPatch.js';
import { clearAIFiringIntent } from '../src/systems/aiFireIntent.js';

for (const frozen of [false, true]) {
  test(`counterplay hold clears previous firing metadata with ${frozen ? 'frozen' : 'mutable'} intent`, () => {
    const previous = { fire: true, fireGroup: 1, fireBlockReason: 'ally_in_lane', fireBlockerId: 91, aimAngle: .7, boost: true };
    if (frozen) Object.freeze(previous);
    const entity = { id: 2, rot: .3, data: { intent: previous } };
    const result = applyCounterplayIntent({ entity, decision: { doctrineId: 'cp_collateral_hold', phase: 'hold', attack: null } });
    assert.equal(result.fire.authorized, false);
    assert.equal(entity.data.intent.fire, false);
    assert.equal(entity.data.intent.fireGroup, null);
    assert.equal(entity.data.intent.fireBlockReason, null);
    assert.equal(entity.data.intent.fireBlockerId, null);
    assert.equal(entity.data.intent.aimAngle, .7);
    assert.equal(entity.data.intent.boost, true);
    if (frozen) assert.equal(previous.fire, true);
  });
}
test('canonical AI disarm clears legacy group while retaining explicit denial and steering', () => {
  const intent = { fire: true, fireGroup: 2, aimAngle: 1.1, moveX: .4 };
  clearAIFiringIntent(intent, 'squad_token', 9);
  assert.deepEqual(intent, { fire: false, fireGroup: null, aimAngle: 1.1, moveX: .4, fireBlockReason: 'squad_token', fireBlockerId: 9 });
});
