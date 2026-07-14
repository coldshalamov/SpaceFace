import test from 'node:test';
import assert from 'node:assert/strict';

import { ContactKind, ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import { CombatDoctrineId, CombatDoctrineRuntime, applyCombatDoctrineToSelection } from '../src/ai/combatDoctrine.js';
import { ActivityKind, RulesOfEngagement } from '../src/ai/doctrine.js';

const EXTEND_LIVENESS_BOUND_TICKS = 180;
const REFORM_DWELL_TICKS = 45;

test('interceptor completes repeated telegraphed strike cycles when an imperfect extension stays inside 520 WU', (t) => {
  const runtime = new CombatDoctrineRuntime({ seed: 0x47a });
  const strikeReceipts = [];
  const reformReceipts = [];
  let tick = 0;

  let doctrine = update(runtime, tick, 620);
  assert.equal(doctrine.phase, 'ingress');
  doctrine = update(runtime, ++tick, 210);
  assert.equal(doctrine.phase, 'engine_flare');
  doctrine = update(runtime, tick += 30, 160);
  assert.equal(doctrine.phase, 'strike');
  strikeReceipts.push(effectiveStrike(doctrine));

  doctrine = update(runtime, tick += 24, 40, { selfX: 160, selfVx: 70, targetX: 120 });
  assert.equal(doctrine.phase, 'extend');

  // Reproduce the live failure: obstacle avoidance or a close target can keep the separation
  // below the ideal 520-WU reform radius. The readable extend still gets three seconds, but it
  // cannot own the interceptor forever.
  doctrine = update(runtime, tick += EXTEND_LIVENESS_BOUND_TICKS, 420);
  assert.equal(doctrine.phase, 'reform', 'extend has a deterministic liveness bound');
  reformReceipts.push({ tick, extendAge: EXTEND_LIVENESS_BOUND_TICKS, distance: 420, phase: doctrine.phase, cycle: doctrine.cycle });
  doctrine = update(runtime, tick += REFORM_DWELL_TICKS, 420);
  assert.equal(doctrine.phase, 'ingress');
  assert.equal(doctrine.cycle, 1);

  doctrine = update(runtime, ++tick, 210);
  assert.equal(doctrine.phase, 'engine_flare');
  doctrine = update(runtime, tick += 30, 160);
  assert.equal(doctrine.phase, 'strike');
  strikeReceipts.push(effectiveStrike(doctrine));
  doctrine = update(runtime, tick += 24, 40, { selfX: 160, selfVx: 70, targetX: 120 });
  assert.equal(doctrine.phase, 'extend');

  doctrine = update(runtime, tick += EXTEND_LIVENESS_BOUND_TICKS, 420);
  assert.equal(doctrine.phase, 'reform');
  reformReceipts.push({ tick, extendAge: EXTEND_LIVENESS_BOUND_TICKS, distance: 420, phase: doctrine.phase, cycle: doctrine.cycle });
  doctrine = update(runtime, tick += REFORM_DWELL_TICKS, 420);
  assert.equal(doctrine.phase, 'ingress');
  assert.equal(doctrine.cycle, 2);
  doctrine = update(runtime, ++tick, 210);
  doctrine = update(runtime, tick += 30, 160);
  strikeReceipts.push(effectiveStrike(doctrine));

  assert.deepEqual(strikeReceipts.map((receipt) => receipt.cycle), [0, 1, 2]);
  assert(strikeReceipts.every((receipt) => receipt.actionId === 'action_burst'),
    'every completed approach and telegraph opens the real burst action');
  t.diagnostic(JSON.stringify({ reformReceipts, strikeReceipts }));
});

test('a target that keeps separation outside the telegraph envelope still escapes every strike', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 0x47a });
  for (let tick = 0; tick <= 12 * 60; tick += 30) {
    const distance = 900 + tick * 2;
    const doctrine = update(runtime, tick, distance, { targetVx: 120 });
    assert.equal(doctrine.phase, 'ingress');
    assert.equal(doctrine.fireWindow, false);
    assert.equal(effectiveStrike(doctrine).actionId, null);
    assert.equal(doctrine.cycle, 0);
  }
});

function update(runtime, tick, distance, { selfX = 0, selfVx = 0, targetX = selfX + distance, targetVx = 0 } = {}) {
  return runtime.update({
    tick,
    entityId: 'rook_nine_fixture',
    doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: {
      self: {
        id: 'rook_nine_fixture',
        team: 1,
        pos: { x: selfX, z: 0 },
        vel: { x: selfVx, z: 0 },
        rot: 0,
        activity: {
          kind: ActivityKind.ATTACK_RUN,
          reason: 'accepted_hunter_writ_fixture',
          anchor: { x: 0, z: 0 },
          leashRadius: 2600,
          preferredRange: 180,
          startedTick: 0,
        },
        roe: RulesOfEngagement.WEAPONS_FREE,
      },
      contacts: [{
        id: 'yielding_player_fixture',
        kind: ContactKind.SHIP,
        alive: true,
        valid: true,
        visible: true,
        hostile: true,
        confidence: 1,
        threat: 0.9,
        pos: { x: targetX, z: 0 },
        vel: { x: targetVx, z: 0 },
        tethered: false,
        mobilityBand: 'medium',
        operationalMassBand: 'medium',
        cargoBand: 'empty',
        tetherabilityBand: 'good',
      }],
      events: [],
    },
    directive: {
      tick,
      squadId: 'mission:yard_writ_fixture',
      memberId: 'rook_nine_fixture',
      role: 'interceptor',
      tactic: 'swarm_pincer',
      focusTargetId: 'yielding_player_fixture',
      objective: { kind: ObjectiveKind.FOCUS, targetId: 'yielding_player_fixture', reason: 'accepted_writ' },
      formation: {
        kind: 'wedge',
        slot: { x: 0, z: 0 },
        velocity: { x: 0, z: 0 },
        bound: 170,
        breakFormation: false,
        breakReason: null,
      },
    },
  });
}

function effectiveStrike(doctrine) {
  const selected = applyCombatDoctrineToSelection({
    actionId: 'action_burst',
    targetId: 'yielding_player_fixture',
    targetContact: { id: 'yielding_player_fixture' },
    maneuver: { kind: ManeuverKind.INTERCEPT, targetId: 'yielding_player_fixture' },
  }, doctrine);
  return { tick: doctrine.phaseStartedTick, phase: doctrine.phase, cycle: doctrine.cycle, actionId: selected.actionId };
}
