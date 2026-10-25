// Seal the bounded Adventure pose/force window for presentation. No simulation is replayed.
import { KILLCAM_TAPE_SCHEMA } from './killcamTape.js';

export const THEATER_FRAME_RATE = 30;
export const THEATER_WIDTH = 1280;
export const THEATER_HEIGHT = 720;
const MAX_SECONDS = 30;
const MAX_ACTORS = 48;

export function sealTheaterTape(recording, { startTick, endTick } = {}) {
  const source = recording?.poseFrames;
  if (!Array.isArray(source) || source.length < 2) return null;
  const rate = Number(recording.tickRate) || 60;
  const base = Number(recording.absoluteBaseTick ?? recording.base) || 0;
  const first = Math.max(base, Number.isFinite(startTick) ? startTick : base,
    base + Math.max(0, (recording.ticks || 0) - 1 - MAX_SECONDS * rate));
  const last = Math.min(base + (recording.ticks || 0) - 1, Number.isFinite(endTick) ? endTick : Infinity);
  const frames = source.filter((f) => f?.tick >= first && f.tick <= last).slice(-301);
  if (frames.length < 2) return null;
  const stride = Math.max(1, frames[1].tick - frames[0].tick);
  const sampleRate = rate / stride;
  const fromTick = frames[0].tick, toTick = frames.at(-1).tick;
  const actors = new Map();
  for (let s = 0; s < frames.length; s++) {
    for (const pose of frames[s].poses || []) {
      if ((!['ship', 'projectile', 'asteroid', 'wreck'].includes(pose.type)
        && !pose.visualData?.placeId && !pose.visualData?.archetypeGlb && !pose.visualData?.storyPropKind)
        || !Number.isFinite(pose.x) || !Number.isFinite(pose.z)) continue;
      const key = JSON.stringify([typeof pose.id, pose.id, pose.generation || 0]);
      let track = actors.get(key);
      if (!track) {
        if (actors.size >= MAX_ACTORS) continue;
        track = { id: pose.id, generation: pose.generation || 0, first: s, last: s, metadata: pose, poses: [] };
        actors.set(key, track);
      }
      track.last = s;
      track.poses.push({ sample: Math.round((frames[s].tick - fromTick) / stride), pose });
    }
  }
  const samples = Math.round((toTick - fromTick) / stride) + 1;
  const ships = [], rounds = [];
  for (const track of actors.values()) {
    const firstPose = track.poses[0], lastPose = track.poses.at(-1), m = track.metadata;
    const b = firstPose.sample, n = lastPose.sample - b + 1;
    const x = new Float32Array(n), z = new Float32Array(n), r = new Float32Array(n);
    let at = 0;
    for (let s = 0; s < n; s++) {
      while (at + 1 < track.poses.length && track.poses[at + 1].sample <= s + b) at++;
      const from = track.poses[at], to = track.poses[at + 1] || from;
      const a = to.sample > from.sample ? (s + b - from.sample) / (to.sample - from.sample) : 0;
      x[s] = from.pose.x + (to.pose.x - from.pose.x) * a;
      z[s] = from.pose.z + (to.pose.z - from.pose.z) * a;
      r[s] = from.pose.heading || 0;
    }
    if (m.type === 'projectile') {
      rounds.push({ team: m.team || 0, weaponId: m.weaponId || null, b, n, x, z });
      continue;
    }
    ships.push({ id: track.id, generation: track.generation, team: m.team || 0, type: m.type,
      player: m.player === true || String(m.id) === String(recording.playerId),
      visual: m.visual || m.defId || null, silhouette: m.silhouette || null, factionId: m.factionId || null,
      radius: m.radius || 6, visualData: m.visualData ? { ...m.visualData } : null, b, d: -1,
      n, x, z, r, end: b + n - 1, vx: 0, vz: 0, wz: 0 });
  }
  if (!ships.length) return null;
  const forces = frames.map((f) => ({ sample: (f.tick - fromTick) / stride,
    lines: (f.lines || []).map((line) => ({ ...line })),
    fields: (f.fields || []).map((field) => ({ ...field, center: { ...field.center }, dir: { ...field.dir } })),
  }));
  return { schema: KILLCAM_TAPE_SCHEMA, seed: recording.seed || 0, tickRate: rate, sampleRate,
    baseTick: fromTick, samples, endSample: samples - 1, windowS: samples / sampleRate,
    ships, rounds, flashes: [], forces,
    scenes: frames.filter((f) => f.scene).map((f) => ({ sample: (f.tick - fromTick) / stride,
      ...f.scene, ...(f.scene.bolusFlags ? { bolusFlags: { ...f.scene.bolusFlags } } : {}) })),
    source: 'adventure-poses' };
}
