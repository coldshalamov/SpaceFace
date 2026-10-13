import assert from 'node:assert/strict';
import test from 'node:test';
import { checkSpawnMotion, CLS, VIS, THRESHOLDS } from '../scripts/player-truth/checks.mjs';

const rock = (id, speed, distance = 792) => [id, CLS.asteroid, distance, 0, speed, 0, 640, 360, 8, VIS.onscreen, -1, 0];
const frame = (f, sim, e = [], mode = 'flight') => ({ f, sim, mode, t: f * 16, p: { x: 0, z: 0 }, e });
const trace = (samples, events = []) => ({ meta: { mode: 'adventure', rounds: false, playStartSim: 0.21666666666666665 }, rounds: [], samples, events });

test('late Adventure announcement grades first observed passive states, including bodies absent at the boundary', () => {
  const samples = [frame(100, 0, [], 'loading'), frame(101, 0), frame(102, 0.033, [rock(121, 0), rock(112, 0)]),
    frame(103, 0.067, [rock(121, 5.7), rock(112, 6.7)]), frame(104, 0.217, [rock(121, 13.4), rock(112, 13)])];
  assert.equal(checkSpawnMotion(trace(samples)).status, 'PASS', 'later solver motion cannot rewrite an observed resting birth');
  const movingBirth = samples.map(s => s.f === 102 ? { ...s, e: [rock(121, 13.4), rock(112, 13)] } : s);
  const result = checkSpawnMotion(trace(movingBirth));
  assert.equal(result.status, 'FAIL'); assert.equal(result.value, '2 bodies');
  assert.equal(result.offenders[0].sim, 0.033);
  assert.equal(THRESHOLDS.spawnSpeed, 8); assert.equal(THRESHOLDS.spawnRadius, 900);
});

test('genuine first-boundary motion still fails and a late resting frame cannot erase it', () => {
  const result = checkSpawnMotion(trace([frame(100, 0, [], 'loading'), frame(101, 0, [rock(121, 8.01)]),
    frame(102, 0.217, [rock(121, 0)])]));
  assert.equal(result.status, 'FAIL'); assert.equal(result.offenders[0].sim, 0);
});

test('missing opening or a gap before first body admission stays UNKNOWN', () => {
  assert.equal(checkSpawnMotion(trace([frame(104, 0.217, [rock(121, 0)])])).status, 'UNKNOWN');
  assert.equal(checkSpawnMotion(trace([frame(100, 0, [], 'loading'), frame(101, 0),
    frame(104, 0.217, [rock(121, 0)])])).status, 'UNKNOWN');
  assert.equal(checkSpawnMotion(trace([frame(100, 0, [], 'loading')])).status, 'UNKNOWN');
  assert.equal(checkSpawnMotion(trace([frame(100, 0, [], 'loading'), frame(101, 0)])).status, 'UNKNOWN',
    'a truncated empty boundary cannot invent an observed initial admission cohort');
});

test('opening cohort ends at announcement or flight input without changing radius and speed limits', () => {
  const opening = [frame(100, 0, [], 'loading'), frame(101, 0, [rock(121, 8), rock(122, 20, 901)]),
    frame(102, 0.217, [rock(121, 8)])];
  assert.equal(checkSpawnMotion(trace([...opening, frame(103, 0.3, [rock(999, 30)])])).status, 'PASS');
  assert.equal(checkSpawnMotion(trace([opening[0], opening[1], frame(102, 0.217, [rock(999, 30)])],
    [{ ev: 'input', kind: 'keydown', code: 'KeyW', sim: 0.1 }])).status, 'PASS');
});
