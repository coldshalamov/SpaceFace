#!/usr/bin/env node
// Motion judge: is a rigid-motion bank smooth, or does it read as "a scripted move just got called"?
//
//   node scripts/judge-motion-banks.mjs                       # every bank in assets/ships/motions
//   node scripts/judge-motion-banks.mjs --dir=<dir> --json=<out.json> --top=20
//   node scripts/judge-motion-banks.mjs --strict               # exit 1 if any clip is flagged
//
// The runtime interpolates keys piecewise (src/contracts/motionBank.js), so a bank is only as smooth
// as its key density: a sparse bank has velocity CORNERS at its keys, which is exactly the robotic,
// triggered look. Stills cannot show that; numbers can. The judge calls the runtime's OWN evaluator
// (evaluateMotionClip) at the 60 Hz the player sees, so a runtime change is judged by the same ruler.
//   kink      largest instant velocity change in one frame / the channel's peak speed. A smooth curve
//             sampled at 60 Hz scores about 2*pi*f/60 (0.1 for a 1 Hz motion); a linear ramp that
//             starts or stops dead scores ~1.0 (a reversal can score up to 2).
//   loopPop   (loop clips) pose and velocity mismatch between the last frame and the first.
//   settle    (non-loop 'rest' clips) pose mismatch between the end and the start: the part must come
//             back to where it began.
//   whip/dart peak angular speed (deg/s) and linear speed (WU/s) beyond what a heavy part can do.
// Flags: snap, loop-pop, no-settle, whip, dart. Pure data in, numbers out: no GPU, no game boot.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateMotionClip } from '../src/contracts/motionBank.js';

const FPS = 60;
export const THRESHOLDS = Object.freeze({
  snapKink: 0.5,        // instant velocity change above 50% of peak speed in one frame
  loopPosePop: 0.01,    // WU
  loopAnglePopDeg: 0.5,
  loopVelPop: 0.25,     // fraction of peak speed
  settlePos: 0.01,      // WU
  settleAngleDeg: 1.0,
  whipDegPerS: 540,
  dartWuPerS: 20,
  // A corner on a motion too small to see is harmless (the chassis idle breathes a few hundredths of a
  // WU). Channels whose PEAK speed stays under these floors are judged for pops but not for kinks.
  visibleWuPerS: 0.4,
  visibleDegPerS: 8,
});

// Angle between two unit quaternions via the relative rotation's vector part: accurate for the tiny
// per-frame steps of a slow idle, where acos(dot) rounds a 1e-4 rad step to exactly zero.
function angleBetween(p, q) {
  const rx = p[3] * q[0] - p[0] * q[3] - p[1] * q[2] + p[2] * q[1];
  const ry = p[3] * q[1] + p[0] * q[2] - p[1] * q[3] - p[2] * q[0];
  const rz = p[3] * q[2] - p[0] * q[1] + p[1] * q[0] - p[2] * q[3];
  const rw = p[3] * q[3] + p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  return 2 * Math.atan2(Math.hypot(rx, ry, rz), Math.abs(rw));
}
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

/** Per group/path pose series at the 60 Hz the player sees: Map<"group|path", number[][]>. */
export function sampleClipSeries(bank, clip) {
  const n = Math.max(2, Math.round(clip.durationS * FPS));
  const series = new Map();
  for (let k = 0; k <= n; k++) {
    // the last sample of a loop sits just before the wrap, so the closure mismatch is visible
    const t = k === n ? (clip.loop ? clip.durationS - 1e-6 : clip.durationS) : k / FPS;
    for (const [group, entry] of evaluateMotionClip(bank, clip, t)) {
      for (const path of ['translation', 'rotation']) {
        if (!entry[path]) continue;
        const key = `${group}|${path}`;
        if (!series.has(key)) series.set(key, []);
        series.get(key).push(Array.from(entry[path]));
      }
    }
  }
  return series;
}

/** Judge one pose series (translation or rotation) sampled at 60 Hz. */
export function judgeSeries(pose, rot, loop, T = THRESHOLDS) {
  const n = pose.length - 1;
  const dt = 1 / FPS;
  const step = (k) => (rot ? angleBetween(pose[k - 1], pose[k]) : dist(pose[k - 1], pose[k]));
  const v = []; for (let k = 1; k <= n; k++) v.push(step(k) / dt);     // speed magnitude per frame
  let vmax = 0; for (const x of v) vmax = Math.max(vmax, x);
  // velocity VECTOR change per frame (a reversal counts fully); rotation uses the speed difference.
  let maxDv = 0;
  for (let k = 1; k < v.length; k++) {
    if (rot) maxDv = Math.max(maxDv, Math.abs(v[k] - v[k - 1]));
    else {
      const a = [0, 1, 2].map((i) => (pose[k][i] - pose[k - 1][i]) / dt);
      const b = [0, 1, 2].map((i) => (pose[k + 1][i] - pose[k][i]) / dt);
      maxDv = Math.max(maxDv, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    }
  }
  const visible = vmax >= (rot ? (T.visibleDegPerS * Math.PI) / 180 : T.visibleWuPerS);
  const kink = visible ? maxDv / vmax : 0;
  const endMisfit = rot ? angleBetween(pose[0], pose[n]) : dist(pose[0], pose[n]);
  const loopVel = loop && visible ? Math.abs(v[0] - v[v.length - 1]) / vmax : 0;
  return { vmax, kink, endMisfit, loopVel };
}

/** Judge every clip of a bank: one row per clip. */
export function judgeBank(bank, T = THRESHOLDS) {
  const rows = [];
  for (const clip of bank.clips) {
    let worst = { kink: 0 }; let peakDeg = 0; let peakWu = 0; let endPos = 0; let endAng = 0; let loopVel = 0;
    for (const [key, pose] of sampleClipSeries(bank, clip)) {
      const [group, path] = key.split('|');
      const rot = path === 'rotation';
      const j = judgeSeries(pose, rot, clip.loop, T);
      if (rot) { peakDeg = Math.max(peakDeg, (j.vmax * 180) / Math.PI); endAng = Math.max(endAng, (j.endMisfit * 180) / Math.PI); }
      else { peakWu = Math.max(peakWu, j.vmax); endPos = Math.max(endPos, j.endMisfit); }
      if (j.kink > worst.kink) worst = { ...j, group, path };
      loopVel = Math.max(loopVel, j.loopVel);
    }
    const flags = [];
    if (worst.kink > T.snapKink) flags.push('snap');
    if (clip.loop && (endPos > T.loopPosePop || endAng > T.loopAnglePopDeg || loopVel > T.loopVelPop)) flags.push('loop-pop');
    if (!clip.loop && clip.endMode === 'rest' && (endPos > T.settlePos || endAng > T.settleAngleDeg)) flags.push('no-settle');
    if (peakDeg > T.whipDegPerS) flags.push('whip');
    if (peakWu > T.dartWuPerS) flags.push('dart');
    rows.push({
      rig: bank.rigId, clip: clip.name, loop: !!clip.loop, durationS: clip.durationS, channels: clip.channels.length,
      kink: +worst.kink.toFixed(3), kinkAt: worst.group ? `${worst.group}.${worst.path}` : '', peakDegPerS: +peakDeg.toFixed(1),
      peakWuPerS: +peakWu.toFixed(2), endPosErr: +endPos.toFixed(4), endAngErrDeg: +endAng.toFixed(2), loopVelPop: +loopVel.toFixed(3), flags,
    });
  }
  return rows;
}

// ---- CLI -------------------------------------------------------------------------------------------
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
  const dir = resolve(args.dir || 'assets/ships/motions');
  const files = readdirSync(dir).filter((f) => f.endsWith('.motion.json')).sort();
  const all = [];
  for (const f of files) {
    try { all.push(...judgeBank(JSON.parse(readFileSync(join(dir, f), 'utf8')))); } catch (err) { console.error(`skip ${f}: ${err.message}`); }
  }
  const flagged = all.filter((r) => r.flags.length);
  const top = Number(args.top || 25);
  console.log(`motion judge: ${files.length} banks, ${all.length} clips, ${flagged.length} flagged`);
  for (const key of ['snap', 'loop-pop', 'no-settle', 'whip', 'dart']) console.log(`  ${key.padEnd(10)} ${all.filter((r) => r.flags.includes(key)).length}`);
  console.log('\nworst kinks (instant velocity change / peak speed; smooth ~0.1, a dead-stop ramp ~1.0):');
  for (const r of [...all].sort((a, b) => b.kink - a.kink).slice(0, top)) {
    console.log(`  ${String(r.kink).padStart(5)}  ${r.rig}/${r.clip}${r.loop ? ' (loop)' : ''}  ${r.durationS}s  at ${r.kinkAt}  ${r.flags.join(',')}`);
  }
  if (args.json) writeFileSync(resolve(args.json), `${JSON.stringify({ thresholds: THRESHOLDS, clips: all }, null, 1)}\n`);
  if (args.strict && flagged.length) process.exit(1);
}
