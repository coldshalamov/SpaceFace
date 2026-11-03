// Software-GL control-probe retry (#807): the retry trigger must use the checker's own evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPlayerControl, probeNeedsRetry, PROBE_MIN_SAMPLES } from '../scripts/player-truth/checks.mjs';

const moving = (from, to, step = 0.1) => {
  const S = [];
  for (let sim = from; sim <= to + 1e-9; sim += step) {
    const t = sim - from;
    S.push({ sim, t: sim * 1000, p: { x: t * 20, z: 0, vx: 10 + t * 10, vz: 0, rot: t, alive: true } });
  }
  return S;
};
const thrust = (startSim, endSim, extra = {}) => ({ label: 'spawn thrust', kind: 'thrust', key: 'KeyW', startSim, endSim, ...extra });

test('dense live window: no retry', () => {
  const trace = { samples: moving(0, 3), probes: [] };
  assert.equal(probeNeedsRetry(trace, thrust(1, 2)).retry, false);
});

test('sparse window (sampler stalled) triggers retry even though the ship moves', () => {
  // 807b: only 2 samples landed inside the probe window; live velocity read ~113 u/s.
  const trace = { samples: [{ sim: 0.9, t: 900, p: { x: 0, z: 0, vx: 113, vz: 0, rot: 0, alive: true } },
    { sim: 1.5, t: 1500, p: { x: 1, z: 0, vx: 113, vz: 0, rot: 0, alive: true } },
    { sim: 2.0, t: 2000, p: { x: 1.5, z: 0, vx: 113, vz: 0, rot: 0, alive: true } }], probes: [] };
  const r = probeNeedsRetry(trace, thrust(1, 2));
  assert.equal(r.retry, true);
  assert.match(r.why, /sparse trace/);
  assert.ok(PROBE_MIN_SAMPLES > 2);
});

test('dense but dead window (probeDead) triggers retry', () => {
  const still = [];
  for (let sim = 0; sim <= 3; sim += 0.1) still.push({ sim, t: sim * 1000, p: { x: 0, z: 0, vx: 0, vz: 0, rot: 0, alive: true } });
  const r = probeNeedsRetry({ samples: still }, thrust(1, 2));
  assert.equal(r.retry, true);
  assert.doesNotMatch(r.why, /sparse/);
});

test('probeNeedsRetry does not mutate the probe record', () => {
  const pr = thrust(1, 2);
  probeNeedsRetry({ samples: moving(0, 3) }, pr);
  assert.equal(pr.value, undefined);
});

test('checker: dead first attempt + live retry passes; without retry fails', () => {
  const still = [];
  for (let sim = 0; sim < 3; sim += 0.1) still.push({ sim, t: sim * 1000, p: { x: 0, z: 0, vx: 0, vz: 0, rot: 0, alive: true } });
  const samples = [...still, ...moving(3, 6).map((s) => ({ ...s }))];
  const yaw = { label: 'spawn yaw', kind: 'yaw', key: 'KeyD', startSim: 4, endSim: 4.8 };
  const pass = checkPlayerControl({ samples, meta: {}, probes: [thrust(1, 2, { retried: true }), { ...thrust(3.2, 4), label: 'spawn thrust retry', retryOf: 'spawn thrust', attempt: 2 }, yaw] });
  assert.equal(pass.status, 'PASS');
  const fail = checkPlayerControl({ samples, meta: {}, probes: [thrust(1, 2), { ...yaw }] });
  assert.equal(fail.status, 'FAIL');
});
