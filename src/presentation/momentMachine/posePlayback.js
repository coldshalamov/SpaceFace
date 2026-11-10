// Recorded-pose readback only. This does not re-simulate inputs or verify rendered pixels.
import { cleanId } from './contract.js';

const FIELDS = ['tick', 'id', 'generation', 'x', 'z', 'heading'];

function validPose(row) {
  return !!row && cleanId(row.id) != null
    && Number.isSafeInteger(row.tick) && row.tick >= 0
    && Number.isSafeInteger(row.generation) && row.generation >= 0
    && Number.isFinite(row.x) && Number.isFinite(row.z) && Number.isFinite(row.heading);
}

function copyPose(row) {
  return { tick: row.tick, id: row.id, generation: row.generation,
    x: row.x, z: row.z, heading: row.heading };
}

class PoseReader {
  #tracks = new Map();

  constructor(samples) {
    this.sampleCount = samples.length;
    this.invalidSamples = 0;
    this.duplicateSamples = 0;
    this.firstTick = null;
    this.lastTick = null;
    // Nested maps keep id/generation identity exact; delimiters and id reuse cannot alias.
    for (const row of samples) {
      if (!validPose(row)) { this.invalidSamples += 1; continue; }
      let generations = this.#tracks.get(row.id);
      if (!generations) this.#tracks.set(row.id, generations = new Map());
      let ticks = generations.get(row.generation);
      if (!ticks) generations.set(row.generation, ticks = new Map());
      if (ticks.has(row.tick)) { this.duplicateSamples += 1; continue; }
      // Snapshot once. Do not cache mutable tape arrays or retain live entity objects.
      ticks.set(row.tick, Object.freeze(copyPose(row)));
      if (this.firstTick == null || row.tick < this.firstTick) this.firstTick = row.tick;
      if (this.lastTick == null || row.tick > this.lastTick) this.lastTick = row.tick;
    }
    for (const generations of this.#tracks.values()) {
      for (const [generation, ticks] of generations) {
        generations.set(generation, [...ticks.values()].sort((a, b) => a.tick - b.tick));
      }
    }
    Object.freeze(this);
  }

  at(actor, tick) {
    if (!actor || !Number.isFinite(tick)) return null;
    const track = this.#tracks.get(actor.id)?.get(actor.generation);
    if (!track) return null;
    let lo = 0, hi = track.length;
    while (lo < hi) {
      const mid = lo + Math.floor((hi - lo) / 2);
      if (track[mid].tick <= tick) lo = mid + 1;
      else hi = mid;
    }
    return lo ? track[lo - 1] : null;
  }
}

/** Prepare one immutable reader per tape/shot, with O(log n) lookups per actor. */
export function createPoseReader(samples) {
  return new PoseReader(Array.isArray(samples) ? samples : []);
}

/** Latest stored pose at/before tick; no interpolation, extrapolation, or identity guessing. */
export function poseAt(samplesOrReader, actor, tick) {
  if (samplesOrReader instanceof PoseReader) return samplesOrReader.at(actor, tick);
  if (!actor || !Number.isFinite(tick) || !Array.isArray(samplesOrReader)) return null;
  let best = null;
  for (const row of samplesOrReader) {
    if (!validPose(row) || row.id !== actor.id || row.generation !== actor.generation || row.tick > tick) continue;
    if (!best || row.tick > best.tick) best = row;
  }
  return best;
}

/** Read every stored row through the same reader used by shot planning. O(n log n), not O(n²). */
export function playRecordedPoses(samples) {
  const rows = Array.isArray(samples) ? samples : [];
  const reader = createPoseReader(rows);
  return Array.from(rows, (row) => {
    if (!validPose(row)) return null;
    const pose = poseAt(reader, row, row.tick);
    return pose ? copyPose(pose) : null;
  });
}

/** An empty, malformed, ambiguous, truncated, or identity-mismatched tape cannot verify. */
export function verifyRecordedPoses(samples, playback = playRecordedPoses(samples)) {
  const rows = Array.isArray(samples) ? samples : [];
  const played = Array.isArray(playback) ? playback : [];
  const reader = createPoseReader(rows);
  let mismatches = Math.abs(rows.length - played.length);
  for (let i = 0; i < Math.min(rows.length, played.length); i += 1) {
    if (!validPose(rows[i]) || !validPose(played[i])
      || FIELDS.some((key) => rows[i][key] !== played[i][key])) mismatches += 1;
  }
  const reason = !rows.length ? 'tape-positions-unrecorded'
    : reader.invalidSamples ? 'invalid-recorded-pose'
      : reader.duplicateSamples ? 'duplicate-recorded-pose'
        : mismatches ? 'pose-readback-mismatch' : null;
  return {
    kind: 'recorded-pose-readback',
    verified: reason == null,
    reason,
    sampleCount: rows.length,
    playbackCount: played.length,
    invalidSamples: reader.invalidSamples,
    duplicateSamples: reader.duplicateSamples,
    mismatches,
  };
}
