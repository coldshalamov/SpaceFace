import assert from 'node:assert/strict';
import test from 'node:test';

import {
  countSignReversals,
  createFormationRecorder,
  distribution,
} from '../src/testing/formationMetrics.js';

// Controlled Chaos packet 03: the sustained-formation metrics must tell a settled member from a
// chattering one. These tests pin the instrument itself (pure functions, no physics).

function sample(tick, over = {}) {
  return {
    tick,
    id: 7,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    radius: 12,
    slot: { x: 0, z: 0 },
    slotVel: { x: 0, z: 0 },
    localSlot: { x: -72, z: 0 },
    request: { forward: 0, right: 0, torqueYaw: 0, kind: 'hold', reason: 'x' },
    ...over,
  };
}

test('sign reversals ignore rest noise and count real swings', () => {
  assert.equal(countSignReversals([0.01, -0.02, 0.05, -0.04]), 0);
  assert.equal(countSignReversals([1, 1, -1, -1, 1, 1, -1]), 3);
  assert.equal(countSignReversals([1, 0.05, 0.1, 1]), 0, 'a pause inside the dead band is not a reversal');
  assert.equal(countSignReversals([1, NaN, -1]), 1);
});

test('distribution reports p50/p95/max and survives empty input', () => {
  const d = distribution([1, 2, 3, 4, 100]);
  assert.equal(d.n, 5);
  assert.equal(d.p50, 3);
  assert.equal(d.max, 100);
  assert.deepEqual(distribution([]), { n: 0, p50: null, p95: null, max: null, mean: null });
});

test('a settled member and a chattering member separate on the sustained window', () => {
  const rec = createFormationRecorder();
  for (let t = 0; t < 600; t++) {
    // Member 1 enters the radius once early, then limit-cycles out of it: best-ever error looks fine.
    const swing = t > 120 ? 90 * Math.sin(t / 12) : 400 - t * 3;
    rec.sample(sample(t, {
      id: 1,
      pos: { x: swing, z: 0 },
      angVel: t % 20 < 10 ? 1.2 : -1.2,
      request: { forward: 1, right: 0, torqueYaw: t % 20 < 10 ? 1 : -1, kind: t % 40 < 20 ? 'hold' : 'formation', reason: 'r' },
    }));
    // Member 2 sits on its slot.
    rec.sample(sample(t, { id: 2, pos: { x: 1.5, z: 0.5 }, angVel: 0.01 }));
  }
  const summary = rec.summarize({ fromTick: 300, toTick: 600, settleRadius: 40 });
  const chatter = summary.members['1'];
  const calm = summary.members['2'];
  assert.ok(chatter.posErr.p95 > 60, 'limit cycle shows in the p95, not just the best-ever error');
  assert.ok(chatter.yaw.reversalsPerSec > 2, `yaw chatter detected: ${chatter.yaw.reversalsPerSec}`);
  assert.ok(chatter.saturatedFraction > 0.9);
  assert.ok(chatter.kindChanges >= 5);
  assert.ok(chatter.reexits >= 1, 'left the radius again after entering');
  assert.ok(calm.posErr.max < 3);
  assert.equal(calm.yaw.reversals, 0);
  assert.equal(calm.saturatedFraction, 0);
  assert.equal(calm.reexits, 0);
  assert.equal(summary.worst.posErrP95, chatter.posErr.p95);
});

test('slot jumps respect ignored membership windows and hull contacts count as episodes', () => {
  const rec = createFormationRecorder();
  for (let t = 0; t < 200; t++) {
    const jumped = t >= 100 ? { x: -72, z: 80 } : { x: -72, z: 0 };
    rec.sample(sample(t, { localSlot: jumped }));
    rec.pairSample(t, [{ a: 1, b: 2, dist: t >= 150 && t < 160 ? 20 : 60, touch: 24 }]);
  }
  const flagged = rec.summarize({ fromTick: 0, toTick: 200 });
  assert.equal(flagged.members['7'].slotJumps, 1);
  const ignored = rec.summarize({ fromTick: 0, toTick: 200, ignoreTicks: [[95, 110]] });
  assert.equal(ignored.members['7'].slotJumps, 0);
  assert.equal(flagged.geometry.contactEpisodes, 1);
  assert.equal(flagged.geometry.contactTicks, 10);
  assert.ok(flagged.geometry.minClearance < 0);
});
