// B8 draw-to-fly stroke speed — the instrument must measure the real path, not a typed-in cruise.
// It does not pin today's unmet feel targets — those belong on the bench bars.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { runStrokeInstrument, scenario } from '../scripts/lib/bench/scenarios/feel.stroke_speed.mjs';

const SEED = 4242;
const LONG = { timeout: 300_000 };
const STROKE_NAMES = ['corner', 'S', 'hook'];
const CLAUSE_UNITS = {
  'mean speed': 'fraction of cruise',
  'slowest point': 'fraction of cruise',
  'max deviation': 'x turn radius',
  'ordered coverage': 'fraction',
};

function assertUnmeasuredBar(bar, message = 'unmeasured bar must carry no numeric measurement') {
  assert.equal(bar.met, false, message);
  assert.equal(bar.unmeasured, true, message);
  assert.equal(bar.value, null, `${message}: value must be null, not a numeric zero`);
  assert.match(String(bar.note), /UNMEASURED/);
}

test('feel.stroke_speed exports the contracted scenario shape', () => {
  assert.equal(scenario.id, 'feel.stroke_speed');
  assert.equal(typeof scenario.label, 'string');
  assert.equal(typeof scenario.run, 'function');
  const source = readFileSync(fileURLToPath(new URL('../scripts/lib/bench/scenarios/feel.stroke_speed.mjs', import.meta.url)), 'utf8');
  assert.equal(
    /\btickAutoTarget\s*\(/.test(source),
    false,
    'the instrument must tick the registered autoTargetAssist owner, not call tickAutoTarget from a hook',
  );
});

test('the instrument measures the real path and is deterministic on a fixed seed', LONG, async () => {
  const a = await scenario.run(SEED);
  const b = await scenario.run(SEED);

  assert.deepEqual(
    a.metrics,
    b.metrics,
    'a result without a reproducible seed is an anecdote: the same seed must print identical metrics',
  );

  const m = a.metrics;
  const proof = m.realPathProof;
  assert.ok(proof, 'metrics.realPathProof is required');
  assert.equal(proof.sg02Ready, true, 'SG-02 dynamic authority must be ready — a stand-in would report false');
  assert.equal(proof.backend, 'rapier-dynamic', 'physics must report the rapier-dynamic backend');
  assert.equal(proof.physicsBackend, 'rapier-dynamic', 'gameplay physicsBackend must read rapier-dynamic');
  assert.equal(proof.flightBackend, 'v3', 'flight must report the live v3 backend');
  assert.equal(proof.profileId, 'production', 'the run must boot the production profile');

  assert.ok(Number.isFinite(m.cruiseSpeed) && m.cruiseSpeed > 0,
    'I sketch a trick move with the mouse, the ship RIPS through it: cruise must be the measured governed asymptote, not a typed-in constant');

  const owner = m.ownerProof;
  assert.ok(owner, 'metrics.ownerProof is required');
  assert.equal(owner.registered, true, 'the runtime must register autoTargetAssist, the production path-follow owner');
  assert.equal(owner.name, 'autoTargetAssist');
  assert.equal(owner.hasUpdate, true);
  assert.equal(owner.flightRegistered, true, 'flightV3 must remain the motion authority');
  assert.equal(owner.physicsRegistered, true, 'rapier-dynamic physics must remain the motion authority');
  assert.deepEqual(owner.order, ['autoTargetAssist', 'actions', 'flightV3', 'physics']);

  assert.equal(m.instrumentLive, true, 'a live instrument run must not emit unmeasured B8 clauses');
  assert.equal(m.sweepIncomplete, false, 'the 90 deg cruise sweep must complete or the instrument fails closed');

  const bars = m.bars;
  assert.ok(Array.isArray(bars), 'metrics.bars is the generic seam for B8');
  assert.equal(bars.length, 12, 'B8 prints four clauses per stroke');

  for (const name of STROKE_NAMES) {
    const stroke = m.strokes[name];
    assert.ok(stroke, `metrics.strokes.${name} is required`);
    assert.equal(stroke.unmeasured, false, `${name}: a live stroke must be measured`);
    assert.ok(stroke.sampleCount > 0, `${name}: every normal stroke must have positive along-path samples`);
    assert.ok(stroke.followerEngaged, `${name}: the registered owner must apply/advance along the ink`);
    assert.ok(stroke.pathAppliedTicks > 0, `${name}: path following must apply on the registered owner`);
    assert.ok(stroke.pathProgressS > 0, `${name}: path following must advance along the ink`);
    assert.ok(Number.isFinite(stroke.orderedCoverage) && stroke.orderedCoverage > 0,
      `${name}: ordered coverage must show progress, got ${stroke.orderedCoverage}`);
    assert.equal(stroke.ownerRegistered, true, `${name}: owner must be registered on the stroke host`);

    const clauses = bars.filter((row) => row.bar === 'B8' && String(row.label).includes(name));
    assert.equal(
      clauses.length,
      4,
      `Speed is the pass criterion; track is the constraint.: the ${name} stroke must print all four B8 clauses`,
    );
    for (const row of clauses) {
      assert.equal(row.bar, 'B8');
      assert.notEqual(row.unmeasured, true, `${row.label} must be measured on a live run`);
      assert.ok(Number.isFinite(row.value),
        `It flies like a skilled pilot would fly my sketch — fast, controlled, cutting where it should, slowing only where a real pilot must.: ${row.label} must be a finite number, got ${row.value}`);
      assert.equal(typeof row.unit, 'string');
      assert.ok(row.unit.length > 0, `${row.label} must carry a unit`);
      assert.equal(typeof row.met, 'boolean',
        `If it follows the line at walking speed, it failed, even if it stayed perfectly on it.: ${row.label} must carry a boolean verdict`);
      assert.equal(typeof row.note, 'string');
      assert.ok(row.note.includes(String(m.cruiseSpeed)) || row.note.includes('WU/s') || row.note.includes('turn radius') || row.note.includes('real path'),
        `${row.label} note must say where the number came from`);
    }

    const mean = clauses.find((row) => row.label.includes('mean speed'));
    const slowest = clauses.find((row) => row.label.includes('slowest point'));
    const deviation = clauses.find((row) => row.label.includes('max deviation'));
    const coverage = clauses.find((row) => row.label.includes('ordered coverage'));
    assert.equal(mean.unit, CLAUSE_UNITS['mean speed']);
    assert.equal(slowest.unit, CLAUSE_UNITS['slowest point']);
    assert.equal(deviation.unit, CLAUSE_UNITS['max deviation']);
    assert.equal(coverage.unit, CLAUSE_UNITS['ordered coverage']);
  }
});

test('a dead no-follower control is unmeasured, not a green zero-deviation row', LONG, async () => {
  const result = await runStrokeInstrument(SEED, { follower: false, strokes: ['corner'] });
  const m = result.metrics;
  assert.equal(m.ownerProof.registered, false, 'the dead control must not register autoTargetAssist');
  assert.equal(m.instrumentLive, false, 'missing owner is an instrument fault');
  assert.equal(m.barMet, false, 'an unmeasured stroke must not pass B8');

  const stroke = m.strokes.corner;
  assert.ok(stroke, 'dead control still names the corner stroke');
  assert.equal(stroke.unmeasured, true);
  assert.match(String(stroke.unmeasuredReason), /autoTargetAssist owner not registered/);
  assert.equal(stroke.sampleCount, 0, 'a missing owner must not score along-path samples');
  assert.equal(stroke.followerEngaged, false);
  assert.equal(stroke.meanSpeedFraction, null);
  assert.equal(stroke.maxDeviationTurnRadii, null);

  const bars = m.bars;
  assert.equal(bars.length, 4, 'dead control prints the four corner clauses as unmeasured');
  for (const row of bars) {
    assertUnmeasuredBar(row, `${row.label} must fail closed as unmeasured, not as a scored 0`);
  }
  const deviation = bars.find((row) => row.label.includes('max deviation'));
  assert.ok(deviation, 'deviation clause must still be emitted');
  assert.notEqual(deviation.met, true, 'no deviation clause may pass on an empty sample set');
  assert.equal(deviation.value, null, 'empty samples must not render as deviation 0');
});
