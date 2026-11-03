// Software-GL control-probe retry (#807): the retry trigger must use the checker's own evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPlayerControl, checkRoundTransitions, probeNeedsRetry, PROBE_MIN_SAMPLES } from '../scripts/player-truth/checks.mjs';

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

function sparsePrimaryLiveRetryDeadTrace(rounds = false) {
  const samples = [];
  for (let sim = 0; sim <= 9; sim += 0.1) {
    if (sim > 1 && sim < 2 && Math.abs(sim - 1.5) > 0.001) continue;
    let x = 4; let vx = 0;
    if (Math.abs(sim - 1) < 0.001) { x = 0; vx = 0; }
    else if (Math.abs(sim - 1.5) < 0.001) { x = 2; vx = 6; }
    else if (Math.abs(sim - 2) < 0.001) { x = 4; vx = 10; }
    else if (sim > 4.1) { x = 4 + (sim - 4.1) * 0.5; vx = 0.5; }
    const p = { x, z: 0, vx, vz: 0, rot: 0, alive: true, mesh: true, vis: true, onScreen: true, tris: 1000 };
    samples.push({ sim: +sim.toFixed(1), t: sim * 1000, mode: 'flight', run: { ph: 'active' }, p });
  }
  const primaryLabel = rounds ? 'round 2 thrust' : 'spawn thrust';
  const retryLabel = `${primaryLabel} retry`;
  const primary = { label: primaryLabel, kind: 'thrust', key: 'KeyW', startSim: 1, endSim: 2, retried: true };
  const retry = { label: retryLabel, kind: 'thrust', key: 'KeyW', startSim: 2.1, endSim: 4.1, retryOf: primaryLabel, attempt: 2 };
  return {
    samples,
    probes: [primary, retry],
    rounds: [{ wave: 1, startSim: 0 }, { wave: 2, startSim: 1 }],
    meta: { rounds },
  };
}

test('a sparse live-looking primary cannot override a dense dead retry', () => {
  const trace = sparsePrimaryLiveRetryDeadTrace();
  assert.equal(probeNeedsRetry(trace, trace.probes[0]).retry, true);
  const result = checkPlayerControl(trace);
  assert.equal(result.status, 'FAIL');
  assert.match(result.value, /1\/1 probes dead/);
  assert.match(result.offenders[0].line, /retry held W/);
  assert.equal(trace.probes[0].dead, false, 'the original attempt remains recorded as apparently live');
  assert.equal(trace.probes[1].dead, true, 'the retry is the authoritative attempt');
});

test('round-start control gate also uses a performed retry as its verdict', () => {
  const trace = sparsePrimaryLiveRetryDeadTrace(true);
  const result = checkRoundTransitions(trace);
  assert.equal(result.status, 'FAIL');
  assert.match(result.value, /1\/1 round starts broken/);
  assert.match(result.offenders[0].line, /retry held W/);
});

test('round-start control gate can recover on a valid live retry', () => {
  const trace = sparsePrimaryLiveRetryDeadTrace(true);
  for (const sample of trace.samples) {
    if (sample.sim < 2.1 || sample.sim > 4.1) continue;
    sample.p.x = 4 + (sample.sim - 2.1) * 20;
    sample.p.vx = 20;
  }
  const result = checkRoundTransitions(trace);
  assert.equal(result.status, 'PASS');
});

test('an unperformed retry record cannot replace the primary attempt', () => {
  const samples = moving(0, 3).map((sample) => ({ ...sample, p: { ...sample.p, x: 0, vx: 0 } }));
  const primary = thrust(1, 2, { retried: true });
  const trace = { samples, probes: [primary] };
  assert.equal(checkPlayerControl(trace).status, 'FAIL');
  assert.equal(primary.dead, true);
});
