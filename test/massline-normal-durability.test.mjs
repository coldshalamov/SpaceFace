import assert from 'node:assert/strict';
import test from 'node:test';

import {
  automaticMasslineBreakAllowed,
  rebasePersistedTetherPolicy,
} from '../src/combat/attachments.js';
import {
  createMasslineRuntime,
  stepMassline,
} from '../src/core/constraints/masslineController.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';

const standard = ATTACHMENT_DEFS.find((def) => def.id === 'tether_standard');
const legacy = ATTACHMENT_DEFS.find((def) => def.id === 'attachment_massline');

test('starter Massline has ten times the former physical load envelope', () => {
  assert.equal(standard.breakTension, 10_500_000);
  assert.deepEqual(standard.break, {
    maxTension: 10_500_000,
    maxImpulse: 190_000,
    maxYank: 150_000,
    graceTicks: 4,
    stiffness: 90,
    damping: 6,
  });
});

test('ordinary endpoints keep every production Massline fail-closed', () => {
  const starter = { data: { derived: { tetherSpoolMult: 1 } } };
  const ordinaryShip = { data: {} };
  assert.equal(automaticMasslineBreakAllowed(standard, starter, ordinaryShip), false);

  const futureExtremeTarget = { data: { masslineBreakPolicy: 'extreme_overload' } };
  assert.equal(automaticMasslineBreakAllowed(standard, starter, futureExtremeTarget), true);

  const manualOnlyTarget = {
    data: { masslineBreakPolicy: 'manual_cut_only', masslineExtremeLoad: true },
  };
  assert.equal(automaticMasslineBreakAllowed(standard, starter, manualOnlyTarget), false);
  assert.equal(automaticMasslineBreakAllowed(legacy, starter, ordinaryShip), false,
    'production action_attach Masslines are also fail-closed on ordinary endpoints');
  assert.equal(
    automaticMasslineBreakAllowed(legacy, starter, futureExtremeTarget),
    true,
    'the production action_attach path retains break telemetry only through an explicit extreme endpoint',
  );
  assert.equal(
    automaticMasslineBreakAllowed(
      { id: 'future_massline_without_policy', massline: { enabled: true } },
      starter,
      futureExtremeTarget,
    ),
    false,
    'a future Massline definition cannot become breakable by omitting the explicit policy',
  );
});

test('Continue rebases old strength snapshots without losing their deployed spool rating', () => {
  const oldRatingThree = {
    break: {
      maxTension: 3_150_000,
      maxImpulse: 57_000,
      maxYank: 45_000,
      graceTicks: 4,
      stiffness: 90,
      damping: 6,
    },
    reelRate: 124.2,
  };
  const rebased = rebasePersistedTetherPolicy(standard, oldRatingThree);
  assert.equal(rebased.strengthRevision, 2);
  assert.deepEqual(
    [rebased.break.maxTension, rebased.break.maxImpulse, rebased.break.maxYank],
    [31_500_000, 570_000, 450_000],
  );
  assert.equal(rebased.reelRate, 124.2);
  assert.deepEqual(oldRatingThree.break.maxTension, 3_150_000,
    'migration never mutates the serialized snapshot');
  assert.equal(rebasePersistedTetherPolicy(standard, rebased), rebased,
    'current snapshots are idempotent');
});

test('normal-play controller survives sustained loads beyond the old snap envelope', () => {
  const def = {
    ...standard.break,
    minLength: standard.minLength,
    maxLength: standard.maxLength,
    automaticBreak: false,
  };
  let runtime = createMasslineRuntime(def);
  for (let tick = 0; tick < 180; tick += 1) {
    const result = stepMassline({
      dt: 1 / 60,
      def,
      runtime,
      telemetry: {
        attachmentId: 'starter-normal-load',
        restLength: 60,
        distance: 120,
        tension: 20_000_000,
        impulse: 250_000,
        yank: 200_000,
      },
      command: { reel: 0, hold: true, cut: false },
      ownerBody: { mass: 18 },
      targetBody: { mass: 32 },
    });
    assert.equal(result.action.cut, false, `tick ${tick} must not auto-cut a normal Massline`);
    assert.equal(result.runtime.integrity, 1, `tick ${tick} must not fatigue a non-breaking line`);
    assert.equal(result.runtime.overloadS, 0, `tick ${tick} must not accumulate phantom break debt`);
    runtime = result.runtime;
  }

  const pilotCut = stepMassline({
    dt: 1 / 60,
    def,
    runtime,
    telemetry: { attachmentId: 'starter-normal-load', restLength: 60, distance: 60 },
    command: { reel: 0, hold: true, cut: true },
  });
  assert.equal(pilotCut.action.cut, true, 'manual release remains available');
  assert.equal(pilotCut.runtime.cutReason, 'pilot');
});
