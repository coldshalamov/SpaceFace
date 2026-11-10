// AIR-01 second slice — a ghost wreck's black box.
//
// The wire shape is owned by the share codec (src/core/runShareCode.js): record v2 carries
// `killReplay`, the quantized pose track captureKillReplay built at the death — the fallen
// pilot's path and the nearest other hull's path over the last seconds.
//
// This module holds the two projections off that record:
//   thinBlackBoxTape     — decimate the live 60 Hz capture so the text code stays pasteable;
//   blackBoxRecording    — the deck projection: the same tape in the recording shape the
//                          Replay surface resolves (poseFrames, tick ticks, event marks).
//
// Pure projections only: no entity spawn, no state writes, no DOM.

import { normalizeBlackBoxTape } from '../core/runShareCode.js';

/**
 * Thin a live capture for the text code: keep every `stride`-th sample plus the final
 * (death) sample. 60 Hz input, stride 2 -> 30 Hz tape; the replay stage interpolates.
 */
export function thinBlackBoxTape(tape, stride = 2) {
  if (!tape || !Array.isArray(tape.samples) || tape.samples.length < 2) return null;
  const step = Number.isInteger(stride) && stride > 1 ? stride : 1;
  const samples = tape.samples.filter((_, i) => i % step === 0);
  const last = tape.samples[tape.samples.length - 1];
  if (samples[samples.length - 1] !== last) samples.push(last);
  return { ...tape, samples };
}

const headingAlong = (samples, i, ax, az) => {
  const a = samples[Math.max(0, i - 1)];
  const b = samples[Math.min(samples.length - 1, i + 1)];
  const dx = b[ax] - a[ax];
  const dz = b[az] - a[az];
  return (dx === 0 && dz === 0) ? 0 : Math.atan2(dz, dx);
};

/**
 * The deck projection: the tape in the recording shape `resolveReplayRecording` hands the
 * Replay surface — `poseFrames` for frame/moment readers, `events` for tape marks, an
 * inputRing stub (a black box records no controls), and the deck's own label.
 */
export function blackBoxRecording(tape, meta = {}) {
  const clean = normalizeBlackBoxTape(tape);
  if (!clean) return null;
  const ticks = clean.samples.length;
  const seconds = clean.durationS;
  const tickRate = Math.max(1, Math.round((ticks - 1) / seconds) || 1);
  const poseFrames = clean.samples.map((sample, i) => ({
    tick: i,
    poses: [
      { id: 'blackbox-hull', generation: 0, x: sample.x, z: sample.z, heading: headingAlong(clean.samples, i, 'x', 'z'), type: 'ship' },
      { id: 'blackbox-shadow', generation: 0, x: sample.bx, z: sample.bz, heading: headingAlong(clean.samples, i, 'bx', 'bz'), type: 'ship' },
    ],
  }));
  return {
    seed: meta.seed ?? clean.seed ?? 0,
    tickRate,
    ticks,
    seconds,
    base: 0,
    absoluteBaseTick: 0,
    poseFrames,
    events: [{ tick: ticks - 1, type: 'kill', label: meta.label || 'The pilot died here' }],
    inputRing: { read() { return { data: { boost: false } }; } },
    source: 'blackbox',
    wreckId: meta.wreckId || null,
    hullId: meta.hullId || null,
    label: meta.label || 'Black box tape',
  };
}
