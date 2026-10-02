// The offline motion judge (scripts/judge-motion-banks.mjs) is the ruler for "does this bank read as
// smooth motion or as a scripted move". It calls the runtime's own evaluateMotionClip at 60 Hz and
// flags velocity corners (snap), loop seams (loop-pop), clips that do not come home (no-settle) and
// speeds a heavy part cannot reach (whip, dart). These tests pin the ruler itself and then hold the
// shipped banks to it.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { THRESHOLDS, judgeBank, judgeSeries, sampleClipSeries } from '../scripts/judge-motion-banks.mjs';

const FPS = 60;

function bankOf(clips) {
  return { rigId: 'judge_fixture', clips };
}

function denseChannel(path, durationS, fn) {
  const n = Math.round(durationS * FPS) + 1;
  const times = []; const values = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(i / FPS, durationS);
    times.push(t);
    values.push(...fn(t));
  }
  return { group: 'g', path, times, values };
}

const rotZ = (angle) => [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];

function rowFor(clip) {
  const rows = judgeBank(bankOf([clip]));
  assert.equal(rows.length, 1);
  return rows[0];
}

test('judge: a smooth 60 fps sine bank is not flagged (loop closes, no corners)', () => {
  const D = 2;
  const clip = {
    name: 'breathe', durationS: D, loop: true, endMode: 'rest',
    channels: [
      denseChannel('translation', D, (t) => [0.4 * Math.sin((2 * Math.PI * t) / D), 0, 0]),
      denseChannel('rotation', D, (t) => rotZ(0.3 * Math.sin((2 * Math.PI * t) / D))),
    ],
  };
  const row = rowFor(clip);
  assert.deepEqual(row.flags, [], `flags ${row.flags}`);
  assert.ok(row.kink < 0.15, `a 0.5 Hz sine scores about 2*pi*f/60 = 0.05 (got ${row.kink})`);
});

test('judge: a sharp triangle wave baked at 60 fps is flagged snap (velocity reverses in one frame)', () => {
  const D = 2;
  const tri = (t) => (t < 1 ? t : 2 - t) * 0.8; // 0 -> 0.8 -> 0, a corner at t = 1
  const clip = {
    name: 'ping', durationS: D, loop: false, endMode: 'rest',
    channels: [denseChannel('translation', D, (t) => [tri(t), 0, 0])],
  };
  const row = rowFor(clip);
  assert.ok(row.flags.includes('snap'), `flags ${row.flags}`);
  assert.ok(row.kink > 1.5, `a full reversal scores about 2 (got ${row.kink})`);
});

test('judge: the same triangle keyed sparsely is smoothed by the runtime and no longer snaps', () => {
  // Five hand keys over 2 s is far under 15 keys/s, so the sampler evaluates it as a C1 cubic that
  // eases in and out of the reversal. This is the whole point of the interpolation upgrade.
  const clip = {
    name: 'ping_sparse', durationS: 2, loop: false, endMode: 'rest',
    channels: [{ group: 'g', path: 'translation', times: [0, 0.5, 1, 1.5, 2], values: [0, 0, 0, 0.4, 0, 0, 0.8, 0, 0, 0.4, 0, 0, 0, 0, 0] }],
  };
  const row = rowFor(clip);
  assert.ok(!row.flags.includes('snap'), `flags ${row.flags} kink ${row.kink}`);
  assert.ok(row.kink < 0.3, `kink ${row.kink}`);
});

test('judge: a loop that does not close, a clip that does not come home, and an over-fast part are flagged', () => {
  const D = 1;
  const openLoop = {
    name: 'open', durationS: D, loop: true, endMode: 'rest',
    channels: [denseChannel('translation', D, (t) => [t * 0.5, 0, 0])],
  };
  assert.ok(rowFor(openLoop).flags.includes('loop-pop'));

  const noHome = {
    name: 'nohome', durationS: D, loop: false, endMode: 'rest',
    channels: [denseChannel('translation', D, (t) => [Math.sin((Math.PI * t) / 2) * 0.3, 0, 0])],
  };
  assert.ok(rowFor(noHome).flags.includes('no-settle'));

  const hold = { ...noHome, name: 'hold', endMode: 'hold' };
  assert.ok(!rowFor(hold).flags.includes('no-settle'), 'a hold clip is not expected to come home');

  // Channels are rest-relative: a stow/close clip starts away from rest and must END on it. Judging
  // end-vs-start would flag every honest stow clip (the first version did, 17 times).
  const stow = {
    name: 'stow', durationS: D, loop: false, endMode: 'rest',
    channels: [denseChannel('translation', D, (t) => [0.3 * (1 - Math.sin((Math.PI * t) / 2)), 0, 0])],
  };
  assert.ok(!rowFor(stow).flags.includes('no-settle'), 'a clip that ends at rest has settled, wherever it started');

  // An overlay returns to whatever base pose runs underneath it (the gate emitter's charge surge
  // orbits the held index pose), so it is exempt from the rest test.
  const surge = { ...noHome, name: 'surge', overlay: true };
  assert.ok(!rowFor(surge).flags.includes('no-settle'), 'an overlay clip is exempt from the rest test');

  const whip = {
    name: 'whip', durationS: D, loop: true, endMode: 'rest',
    channels: [denseChannel('rotation', D, (t) => rotZ(2 * Math.PI * 2 * t))], // 2 rev/s = 720 deg/s
  };
  assert.ok(rowFor(whip).flags.includes('whip'));

  const dart = {
    name: 'dart', durationS: D, loop: true, endMode: 'rest',
    channels: [denseChannel('translation', D, (t) => [3 * Math.sin(2 * Math.PI * 4 * t), 0, 0])], // peak ~75 WU/s
  };
  assert.ok(rowFor(dart).flags.includes('dart'));
});

test('judge: judgeSeries scores a dead-stop ramp near 1 and ignores corners on motion too small to see', () => {
  const ramp = [];
  for (let k = 0; k <= 60; k++) ramp.push([Math.min(k, 30) * 0.05, 0, 0]); // 3 WU/s then stops dead
  const dead = judgeSeries(ramp, false, false);
  assert.ok(dead.kink > 0.9 && dead.kink <= 1.01, `dead stop kink ${dead.kink}`);
  const tiny = [];
  for (let k = 0; k <= 60; k++) tiny.push([Math.min(k, 30) * 0.0001, 0, 0]); // 0.006 WU/s: invisible
  assert.equal(judgeSeries(tiny, false, false).kink, 0, 'sub-visible motion is judged for pops, not kinks');
});

test('judge: sampleClipSeries samples through the runtime evaluator at 60 Hz', () => {
  const clip = {
    name: 'one', durationS: 1, loop: false, endMode: 'rest',
    channels: [{ group: 'g', path: 'translation', times: [0, 1], values: [0, 0, 0, 1, 0, 0] }],
  };
  const series = sampleClipSeries(bankOf([clip]), clip).get('g|translation');
  assert.equal(series.length, FPS + 1);
  assert.equal(series[0][0], 0);
  assert.ok(Math.abs(series[FPS][0] - 1) < 1e-12);
  assert.ok(Math.abs(series[FPS / 2][0] - 0.5) < 1e-12, 'a symmetric ease passes the midpoint at half time');
  assert.ok(series[6][0] < 0.1 * 0.99, 'eased start: slower than the linear ramp over the first tenth');
});

test('judge: the shipped banks stay smooth (snap and loop-pop counted over every clip)', () => {
  const dir = new URL('../assets/ships/motions/', import.meta.url);
  const rows = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.motion.json'))) {
    rows.push(...judgeBank(JSON.parse(readFileSync(new URL(file, dir), 'utf8')), THRESHOLDS));
  }
  assert.ok(rows.length >= 250, `judged ${rows.length} clips`);
  const count = (flag) => rows.filter((r) => r.flags.includes(flag)).length;
  // Before the cubic sampler 170 of 265 clips snapped; three authored impacts/rattles remain. Bounds are
  // proportional so a new bank landing does not trip them, while a sampler regression (every key a
  // corner again) does.
  const snaps = rows.filter((r) => r.flags.includes('snap'));
  assert.ok(snaps.length <= Math.ceil(rows.length * 0.05), `snap ${snaps.length}/${rows.length}: ${snaps.map((r) => `${r.rig}/${r.clip} ${r.kink}`).join(', ')}`);
  assert.ok(count('loop-pop') <= 2, `loop-pop ${count('loop-pop')}`);
});
