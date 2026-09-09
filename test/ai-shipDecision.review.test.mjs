import test from 'node:test';
import assert from 'node:assert/strict';

import { ObjectiveKind } from '../src/ai/contracts.js';
import { BehaviorExecutor } from '../src/ai/shipDecision.js';

const selected = Object.freeze({
  actionId: 'action_burst',
  targetId: 'player',
  targetContact: Object.freeze({ id: 'player', kind: 'ship' }),
  utility: 0.8,
  minCommitTicks: 1,
  switchMargin: 0,
  maneuver: Object.freeze({ kind: 'intercept' }),
});

const directive = Object.freeze({
  squadId: 'raiders',
  tactic: 'attack_run',
  objective: Object.freeze({
    kind: ObjectiveKind.ENGAGE,
    targetId: 'player',
    reason: 'combat_doctrine:brawler_commit:commit',
  }),
  formation: Object.freeze({
    slot: Object.freeze({ x: 0, z: 0 }),
    velocity: Object.freeze({ x: 0, z: 0 }),
    bound: 100,
    breakFormation: true,
  }),
});

const perception = Object.freeze({
  self: Object.freeze({ disabled: false, hullFraction: 1 }),
});

test('a temporary resource denial cannot permanently latch an AI action off', () => {
  let resourceReady = false;
  let gateCalls = 0;
  let startCalls = 0;
  const executor = new BehaviorExecutor({
    actionPort: {
      canStart() {
        gateCalls++;
        return resourceReady
          ? { ok: true, reason: 'ok' }
          : { ok: false, reason: 'insufficient_capacitor' };
      },
      start() {
        startCalls++;
        return { ok: true, handle: 'burst-1' };
      },
      status() { return 'idle'; },
      interrupt() { return true; },
    },
    config: { maxIdenticalBlockedRetries: 3, blockedRetryTicks: 30 },
  });

  for (let tick = 1; tick <= 3; tick++) {
    executor.update({ tick, entityId: 'raider', selected, directive, perception });
  }
  assert.equal(gateCalls, 3);

  resourceReady = true;
  const recovered = executor.update({
    tick: 33,
    entityId: 'raider',
    selected,
    directive,
    perception,
  });

  assert.equal(gateCalls, 4, 'the executor must recheck a gate after its bounded backoff');
  assert.equal(startCalls, 1);
  assert.equal(recovered.decision, 'start');
  assert.equal(recovered.actionId, 'action_burst');
});
