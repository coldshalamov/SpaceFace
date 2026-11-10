import assert from 'node:assert/strict';
import test from 'node:test';

import { ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import { BehaviorExecutor } from '../src/ai/shipDecision.js';
import { SquadCommander } from '../src/ai/squad.js';

test('default squad tactic dwell mechanically caps churn at four transitions per ten seconds', () => {
  const commander = new SquadCommander({ seed: 47 });
  assert.ok(commander.config.minTacticTicks >= 150,
    `minimum tactic dwell ${commander.config.minTacticTicks} ticks permits more than four transitions per ten seconds`);
});

test('an identical blocked action is attempted at most three times until tactical context changes', () => {
  let canStartCalls = 0;
  const executor = new BehaviorExecutor({
    actionPort: {
      canStart() {
        canStartCalls++;
        return { ok: false, reason: 'friendly_fire_lane' };
      },
      start() { throw new Error('blocked action must not start'); },
      status() { return 'idle'; },
      interrupt() { return true; },
    },
  });
  const selected = {
    actionId: 'action_burst',
    targetId: 1,
    targetContact: { id: 1 },
    utility: 0.9,
    minCommitTicks: 1,
    switchMargin: 0,
    maneuver: {
      kind: ManeuverKind.ORBIT,
      targetId: 1,
      formationSlot: { x: 0, z: 0 },
      formationVelocity: { x: 0, z: 0 },
      formationBound: 170,
      breakFormation: true,
    },
  };
  const perception = { self: { disabled: false, hullFraction: 1 } };
  const makeDirective = (tactic) => ({
    squadId: 'sq_blocked_fixture',
    tactic,
    objective: { kind: ObjectiveKind.FOCUS, targetId: 1, reason: 'combat_doctrine:interceptor_flyby:strike' },
    formation: { slot: { x: 0, z: 0 }, velocity: { x: 0, z: 0 }, bound: 170, breakFormation: true },
  });

  let output = null;
  for (let tick = 1; tick <= 10; tick++) {
    output = executor.update({ tick, entityId: 2, selected, directive: makeDirective('swarm_pincer'), perception });
  }
  assert.equal(canStartCalls, 3);
  assert.equal(output.reason, 'blocked_retry_limit');

  executor.update({ tick: 11, entityId: 2, selected, directive: makeDirective('fighting_retreat'), perception });
  assert.equal(canStartCalls, 4, 'a real tactic change authorizes a fresh attempt budget');
});

test('a time-gated action retries exactly when its authoritative gate becomes ready', () => {
  let canStartCalls = 0;
  let startCalls = 0;
  const readyTick = 60;
  const executor = new BehaviorExecutor({
    actionPort: {
      canStart(_entityId, _actionId, request) {
        canStartCalls++;
        return request.tick < readyTick
          ? { ok: false, reason: 'engagement:response_window', retryAtTick: readyTick }
          : { ok: true, reason: 'ok' };
      },
      start() {
        startCalls++;
        return { ok: true, handle: 'action_request_1' };
      },
      status() { return 'idle'; },
      interrupt() { return true; },
    },
  });
  const selected = {
    actionId: 'action_burst',
    targetId: 1,
    targetContact: { id: 1 },
    utility: 0.9,
    minCommitTicks: 1,
    switchMargin: 0,
    maneuver: { kind: ManeuverKind.ORBIT, targetId: 1 },
  };
  const directive = {
    squadId: 'sq_response_window_fixture',
    tactic: 'swarm_pincer',
    objective: {
      kind: ObjectiveKind.FOCUS,
      targetId: 1,
      reason: 'combat_doctrine:interceptor_flyby:strike',
    },
    formation: {
      slot: { x: 0, z: 0 },
      velocity: { x: 0, z: 0 },
      bound: 170,
      breakFormation: true,
    },
  };
  const perception = { self: { disabled: false, hullFraction: 1 } };

  let output = null;
  for (let tick = 31; tick <= readyTick; tick++) {
    output = executor.update({ tick, entityId: 2, selected, directive, perception });
  }

  assert.equal(canStartCalls, 4, 'three bounded probes plus one exact ready-tick retry');
  assert.equal(startCalls, 1);
  assert.equal(output.reason, 'action_port_started');
  assert.equal(output.status, 'running');
});
