import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { verboseCombatTextEnabled } from '../src/ui/floatingText.js';
import {
  HULL_CRIT_CALM_S,
  RETICLE_HIT_S,
  RETICLE_KILL_S,
  hullCriticalTreatmentActive,
  reticleHitFromDamage,
  reticleKillFromEvent,
  stepReticleFeedback,
} from '../src/ui/hud.js';

test('combat and pickup floaters are quiet by default and require an explicit opt-in', () => {
  const state = createGameState(7);
  assert.equal(state.settings.showDamageNumbers, false);
  assert.equal(verboseCombatTextEnabled(state.settings), false);
  assert.equal(verboseCombatTextEnabled({ showDamageNumbers: true }), true);
  assert.equal(verboseCombatTextEnabled({}), false);
});

test('reticle receipts are authoritative and feedback remains short and bounded', () => {
  const playerId = 11;
  assert.equal(reticleHitFromDamage({ attackerId: playerId, targetId: 22, applied: 3 }, playerId), true);
  assert.equal(reticleHitFromDamage({ attackerId: 22, targetId: playerId, applied: 3 }, playerId), false);
  assert.equal(reticleKillFromEvent({ killerId: playerId, id: 22 }, playerId), true);

  const acquired = stepReticleFeedback(null, 0, { targetId: 22, hit: false, kill: false });
  assert.ok(acquired.acquireT > 0);
  assert.equal(stepReticleFeedback(acquired, 0.19, { targetId: 22 }).acquireT, 0);
  const hit = stepReticleFeedback(acquired, 0, { targetId: 22, hit: true, kill: false });
  assert.equal(hit.hitT, RETICLE_HIT_S);
  assert.equal(RETICLE_HIT_S, 1 / 60);
  assert.equal(stepReticleFeedback(hit, 1 / 60, { targetId: 22 }).hitT, 0);

  const kill = stepReticleFeedback(hit, 0, { targetId: null, hit: false, kill: true });
  assert.equal(kill.hitT, 0);
  assert.equal(kill.killT, RETICLE_KILL_S);
  assert.equal(RETICLE_KILL_S, 0.1);
  assert.equal(stepReticleFeedback(kill, 0.11, { targetId: null }).killT, 0);
});

test('critical-hull emphasis silences after two damage-free seconds', () => {
  assert.equal(HULL_CRIT_CALM_S, 2);
  assert.equal(hullCriticalTreatmentActive(0.24, 0), true);
  assert.equal(hullCriticalTreatmentActive(0.24, 1.999), true);
  assert.equal(hullCriticalTreatmentActive(0.24, 2), false);
  assert.equal(hullCriticalTreatmentActive(0.25, 0), false);
});
