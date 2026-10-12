import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSpawnMotion, CLS, VIS, THRESHOLDS } from '../scripts/player-truth/checks.mjs';

const sample = (sim, speed, run = { w: 2, ph: 'active' }) => ({ sim, t: sim * 1000, mode: 'flight',
  run, p: { x: 0, z: 0 }, e: [[36000427, CLS.other, 316, 0, speed, 0, 640, 360, 8, VIS.onscreen, -1, 0]] });
const trace = samples => ({ meta: { rounds: true }, rounds: [{ wave: 2, startSim: 47.683 }],
  samples, events: [{ ev: 'input', kind: 'keydown', code: 'KeyW', sim: 47.933 }] });

test('a delayed actor poll uses the matching first active frame, not later physical motion', () => {
  const result = checkSpawnMotion(trace([
    sample(46, 20, { w: 1, ph: 'active' }),
    sample(47.417, 20, { w: 2, ph: 'wave_intro' }),
    sample(47.483, 1.1), sample(47.617, 12.9), sample(47.75, 12.9),
  ]));
  assert.equal(result.status, 'PASS'); assert.equal(result.value, '0 bodies');
  assert.equal(result.detail, '1 spawn moment(s) checked');
  assert.equal(THRESHOLDS.spawnSpeed, 8);
});

test('a genuinely moving body at the real opening still fails with the existing limit', () => {
  const result = checkSpawnMotion(trace([sample(47.483, 12.9), sample(47.75, 0)]));
  assert.equal(result.status, 'FAIL'); assert.equal(result.value, '1 bodies');
  assert.equal(result.offenders[0].sim, 47.483);
  assert.match(result.threshold, />8 u\/s/);
});

test('legacy captures without run metadata retain their timestamp-based opening check', () => {
  const result = checkSpawnMotion(trace([sample(47.483, 1.1, null), sample(47.75, 12.9, null)]));
  assert.equal(result.status, 'FAIL'); assert.equal(result.offenders[0].sim, 47.75);
  const unnamedRound = trace([sample(47.483, 1.1, null), sample(47.75, 12.9, null)]);
  delete unnamedRound.rounds[0].wave;
  assert.equal(checkSpawnMotion(unnamedRound).status, 'FAIL', 'an older unnamed round still uses its round timestamp');
  const adventure = { meta: { playStartSim: 47.683 }, rounds: [], samples: [sample(47.75, 12.9, null)], events: [] };
  assert.equal(checkSpawnMotion(adventure).status, 'UNKNOWN', 'a mid-flight sample cannot invent the non-round opening');
});

test('a missing matching-wave opening cannot silently pass using a different wave', () => {
  const result = checkSpawnMotion(trace([sample(47.75, 0, { w: 1, ph: 'active' })]));
  assert.equal(result.status, 'UNKNOWN'); assert.match(result.detail, /opening frame\(s\) missing/);
});
