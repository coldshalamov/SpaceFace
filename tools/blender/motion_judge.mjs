#!/usr/bin/env node
// Offline motion judge (GFX-16): samples every clip in a motion bank through the same
// evaluateMotionClip path the runtime uses, then finite-differences the trajectory.
//
// Fails a bank on:
//   * POP-START  — a non-loop clip opens outside the envelope a predecessor can leave the
//                  group in (hold-clip end poses, or a loop clip's traveled range — setState
//                  has no crossfade, so an unmatched start is a visible snap)
//   * POP-END    — an endMode:'rest' clip's last key drifts from rest (the park snaps it shut)
//   * WRAP       — a loop clip's first/last pose (or wrap velocity) mismatches: seam click
//   * STEP       — an instantaneous velocity-vector step inside the clip (teleport, not motion)
//   * DRIVE      — sustained acceleration over a 33 ms window beyond the weight envelope
// Warns (does not fail) on residual end drift under the pop threshold and moderate steps.
//
// Velocity is measured per-axis (relative rotation vector / translation delta between
// consecutive samples) so a continuous spin crossing the quaternion antipode is NOT a step.
//
// No GPU, no scene load. `node tools/blender/motion_judge.mjs` (all banks) or `--bank=wasp`.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateMotionClip } from '../../src/contracts/motionBank.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MOTIONS_DIR = join(ROOT, 'assets/ships/motions');
const SAMPLE_HZ = 240; // ~4x the runtime tick — fine enough to see 2-frame pops

const REST_ANGLE_EPS = 5e-3; // rad (~0.3°) — sub-pixel residual, not a pop
const REST_POS_EPS = 1e-2;   // WU
const WRAP_ANGLE_EPS = 5e-3;
const WRAP_POS_EPS = 1e-2;
const CHAIN_EPS = 8e-3;      // a predecessor must leave the group within this of the start pose
const STEP_ANG = 5;          // rad/s instantaneous axis-aligned velocity change = visible snap
const STEP_POS = 6;          // WU/s
const ACC_ANG = 2500;        // rad/s^2 sustained over ~33 ms
const ACC_POS = 5000;        // WU/s^2
const ACC_WINDOW = 8;        // samples (~33 ms at 240 Hz)

const quatAngle = (q) => 2 * Math.acos(Math.min(1, Math.abs(q[3] ?? 1)));
const posMag = (t) => Math.hypot(t[0] || 0, t[1] || 0, t[2] || 0);
const quatConj = (q) => [-q[0], -q[1], -q[2], q[3]];
const quatMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
// Angular velocity vector of the per-sample increment qPrev^-1 * qNext.
function quatStepVelocity(a, b, dt) {
  const r = quatMul(quatConj(a), b);
  if (r[3] < 0) { r[0] *= -1; r[1] *= -1; r[2] *= -1; r[3] *= -1; }
  const s = Math.hypot(r[0], r[1], r[2]);
  if (s < 1e-9) return [0, 0, 0];
  const ang = 2 * Math.atan2(s, r[3]) / dt;
  return [(r[0] / s) * ang, (r[1] / s) * ang, (r[2] / s) * ang];
}
const vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vMag = (v) => Math.hypot(v[0], v[1], v[2]);

function* trajectories(bank, clip) {
  // One trajectory per (group, path): quaternion series for rotation, vec3 for translation.
  const frames = Math.max(4, Math.round(clip.durationS * SAMPLE_HZ) + 1);
  const dt = clip.durationS / (frames - 1);
  const series = new Map();
  for (let i = 0; i < frames; i++) {
    const deltas = evaluateMotionClip(bank, clip, i * dt);
    for (const [group, entry] of deltas) {
      if (entry.rotation) {
        const key = `${group}#rot`;
        if (!series.has(key)) series.set(key, []);
        series.get(key).push(entry.rotation);
      }
      if (entry.translation) {
        const key = `${group}#pos`;
        if (!series.has(key)) series.set(key, []);
        series.get(key).push(entry.translation);
      }
    }
  }
  for (const [key, values] of series) yield { key, values, dt };
}

function judgeClip(bank, clip, predecessors) {
  const violations = [];
  const warnings = [];
  const stats = { maxVel: 0, maxAcc: 0, maxStep: 0 };
  const clipName = clip.name;
  for (const { key, values, dt } of trajectories(bank, clip)) {
    const rot = key.endsWith('#rot');
    const [stepMax, accMax, restEps, wrapEps] = rot
      ? [STEP_ANG, ACC_ANG, REST_ANGLE_EPS, WRAP_ANGLE_EPS]
      : [STEP_POS, ACC_POS, REST_POS_EPS, WRAP_POS_EPS];
    const scalar = rot ? quatAngle : posMag;
    const seq = [];
    for (let i = 1; i < values.length; i++) {
      seq.push(rot ? quatStepVelocity(values[i - 1], values[i], dt)
        : [(values[i][0] - values[i - 1][0]) / dt,
           (values[i][1] - values[i - 1][1]) / dt,
           (values[i][2] - values[i - 1][2]) / dt]);
    }
    stats.maxVel = Math.max(stats.maxVel, seq.reduce((m, v) => Math.max(m, vMag(v)), 0));
    // Instantaneous velocity-vector step = the jerk signature of a pop.
    let step = 0;
    for (let i = 1; i < seq.length; i++) step = Math.max(step, vMag(vSub(seq[i], seq[i - 1])));
    stats.maxStep = Math.max(stats.maxStep, step);
    if (step > stepMax) {
      violations.push(`${clipName}/${key}: velocity step ${step.toFixed(2)} — instant snap, not motion`);
    } else if (step > stepMax * 0.5) {
      warnings.push(`${clipName}/${key}: velocity step ${step.toFixed(2)} — abrupt but serviceable`);
    }
    // Sustained drive: windowed acceleration that survives only when motion keeps pushing.
    let drive = 0;
    for (let i = 0; i + ACC_WINDOW <= seq.length; i++) {
      drive = Math.max(drive, vMag(vSub(seq[i + ACC_WINDOW - 1], seq[i])) / ((ACC_WINDOW - 1) * dt));
    }
    stats.maxAcc = Math.max(stats.maxAcc, drive);
    if (drive > accMax) {
      violations.push(`${clipName}/${key}: sustained acceleration ${drive.toFixed(0)} > ${accMax} — weightless`);
    }

    // Boundary behaviour.
    const start = scalar(values[0]);
    const end = scalar(values[values.length - 1]);
    if (clip.loop !== true && start > restEps) {
      const grounded = (predecessors.get(key) || [])
        .some(([lo, hi]) => start >= lo - CHAIN_EPS && start <= hi + CHAIN_EPS + restEps);
      if (!grounded) {
        if (start > restEps * 3) {
          violations.push(`${clipName}/${key}: starts ${start.toFixed(3)} off rest with no predecessor reaching it — pops on trigger`);
        } else {
          warnings.push(`${clipName}/${key}: starts ${start.toFixed(4)} off rest — mild seam on trigger`);
        }
      }
    }
    if (clip.endMode === 'rest' && !clip.loop) {
      if (end > restEps * 3) {
        violations.push(`${clipName}/${key}: 'rest' clip ends ${end.toFixed(3)} off rest — pops on settle`);
      } else if (end > restEps) {
        warnings.push(`${clipName}/${key}: 'rest' clip ends ${end.toFixed(4)} off rest — soft settle seam`);
      }
    }
    if (clip.loop === true) {
      const wrap = Math.abs(end - start);
      if (wrap > wrapEps) {
        violations.push(`${clipName}/${key}: loop wraps with ${wrap.toFixed(4)} jump — visible seam`);
      }
      if (seq.length > 1) {
        // Velocity into the wrap must equal velocity out of it (constant spin is a fixed ω).
        const vJump = vMag(vSub(seq[seq.length - 1], seq[0]));
        if (vJump > stepMax) {
          violations.push(`${clipName}/${key}: loop velocity jump ${vJump.toFixed(2)} at wrap — clicks each cycle`);
        }
      }
    }
  }
  return { violations, warnings, stats };
}

// For each (group, path): the [min,max] envelope every clip leaves that group within —
// hold clips contribute their end pose, loops contribute their traveled range. A follow-on
// clip starting inside an envelope resumes where the predecessor visibly left the part.
function predecessorEnvelopes(bank) {
  const env = new Map();
  const add = (key, value) => {
    if (!env.has(key)) env.set(key, []);
    env.get(key).push(value);
  };
  for (const clip of bank.clips || []) {
    if (clip.loop) {
      const span = new Map();
      for (const { key, values } of trajectories(bank, clip)) {
        const scalar = key.endsWith('#rot') ? quatAngle : posMag;
        span.set(key, [Math.min(...values.map(scalar)), Math.max(...values.map(scalar))]);
      }
      for (const [k, range] of span) add(k, range);
    } else if (clip.endMode === 'hold') {
      const last = evaluateMotionClip(bank, clip, clip.durationS);
      for (const [group, entry] of last) {
        if (entry.rotation) add(`${group}#rot`, [quatAngle(entry.rotation), quatAngle(entry.rotation)]);
        if (entry.translation) add(`${group}#pos`, [posMag(entry.translation), posMag(entry.translation)]);
      }
    }
  }
  return env;
}

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--bank='))?.slice('--bank='.length);
const files = readdirSync(MOTIONS_DIR)
  .filter((f) => f.endsWith('.motion.json') && (!only || f === `${only}.motion.json`));
if (only && files.length === 0) {
  console.error(`[motion-judge] no bank ${only}.motion.json under ${MOTIONS_DIR}`);
  process.exit(2);
}

let failures = 0;
let warns = 0;
let worst = { acc: 0, step: 0, vel: 0, who: '' };
for (const file of files.sort()) {
  const bank = JSON.parse(readFileSync(join(MOTIONS_DIR, file), 'utf8'));
  const predecessors = predecessorEnvelopes(bank);
  const lines = [];
  for (const clip of bank.clips || []) {
    const { violations, warnings, stats } = judgeClip(bank, clip, predecessors);
    lines.push(...violations.map((v) => `  FAIL ${v}`), ...warnings.map((w) => `  warn ${w}`));
    failures += violations.length;
    warns += warnings.length;
    if (stats.maxAcc > worst.acc) {
      worst = { acc: stats.maxAcc, step: stats.maxStep, vel: stats.maxVel, who: `${file}:${clip.name}` };
    }
  }
  const verdict = lines.some((l) => l.startsWith('  FAIL')) ? 'FAIL' : lines.length ? 'WARN' : 'PASS';
  console.log(`${verdict} ${file} (${(bank.clips || []).length} clips)`);
  for (const l of lines) console.log(l);
}
console.log(`[motion-judge] worst envelope: vel ${worst.vel.toFixed(2)}, acc ${worst.acc.toFixed(0)}, step ${worst.step.toFixed(2)} @ ${worst.who} — ${failures} failure(s), ${warns} warning(s)`);
process.exit(failures ? 1 : 0);
