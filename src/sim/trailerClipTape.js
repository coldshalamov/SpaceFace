// Bounded, presentation-only collection of an actual set-piece visit. The approach
// marker requests a window; real recorded poses and master audio supply its contents.
export const TRAILER_CLIP_SECONDS = 30;
const MAX_PENDING = 3, MAX_SEALED = 2, MAX_FRAMES = 301;

function copyFrame(frame) {
  return { tick: frame.tick,
    scene: frame.scene ? { ...frame.scene, ...(frame.scene.bolusFlags ? { bolusFlags: { ...frame.scene.bolusFlags } } : {}) } : null,
    poses: (frame.poses || []).map((pose) => ({ ...pose,
      ...(pose.visualData ? { visualData: { ...pose.visualData } } : {}) })),
    lines: (frame.lines || []).map((line) => ({ ...line })),
    fields: (frame.fields || []).map((field) => ({ ...field, center: { ...field.center }, dir: { ...field.dir } })),
  };
}

export function createTrailerClipCollector({ audioWindow = () => null, onReady = () => {}, audioWaitTicks = 0 } = {}) {
  const pending = [], sealed = [], seen = new Set();
  let lastTick = -1;
  const collector = {
    mark(marker, recording) {
      const id = typeof marker?.id === 'string' ? marker.id : null;
      if (!id || !Number.isFinite(marker.tick) || seen.has(id) || pending.length >= MAX_PENDING) return false;
      const frames = recording?.poseFrames;
      if (!Array.isArray(frames) || !frames.length) return false;
      const first = frames.find((frame) => frame.tick >= marker.tick - 60 && frame.tick <= marker.tick);
      if (!first) return false;
      const startTick = first.tick, endTick = startTick + TRAILER_CLIP_SECONDS * 60;
      pending.push({ id, label: String(marker.title || id).slice(0, 120), kind: 'set-piece',
        momentTick: marker.tick, startTick, endTick, tickRate: 60, seconds: TRAILER_CLIP_SECONDS,
        sectorId: marker.sectorId, entityId: marker.entityId, position: marker.position ? { ...marker.position } : null,
        camera: { ...marker.camera }, music: { ...marker.music }, hideUI: true,
        seed: recording.seed, playerId: recording.playerId, poseFrames: [], last: startTick - 1 });
      seen.add(id);
      collector.note(recording);
      return true;
    },
    note(recording) {
      const frames = recording?.poseFrames;
      if (!Array.isArray(frames) || !frames.length) return;
      const newest = frames.at(-1).tick;
      if (newest < lastTick) { collector.clear(); return; }
      lastTick = newest;
      for (let i = pending.length - 1; i >= 0; i--) {
        const job = pending[i];
        for (const frame of frames) {
          if (frame.tick <= job.last || frame.tick < job.startTick || frame.tick > job.endTick) continue;
          if (job.poseFrames.length >= MAX_FRAMES) break;
          job.poseFrames.push(copyFrame(frame)); job.last = frame.tick;
        }
        if (newest < job.endTick) continue;
        // Never stretch a short window to manufacture a thirty-second clip.
        if (job.last !== job.endTick || job.poseFrames[0]?.tick !== job.startTick
          || job.poseFrames.some((f, n) => n > 0 && f.tick - job.poseFrames[n - 1].tick > 12)) {
          pending.splice(i, 1); continue;
        }
        const pcm = audioWindow(job.startTick, job.endTick);
        if (!pcm && newest < job.endTick + audioWaitTicks) continue;
        pending.splice(i, 1);
        const recordingSnapshot = { seed: job.seed, playerId: job.playerId, tickRate: 60,
          absoluteBaseTick: job.startTick, ticks: job.endTick - job.startTick + 1,
          poseFrames: job.poseFrames, events: [] };
        const clip = { id: `set-piece:${job.id}:${job.momentTick}`, setPieceId: job.id,
          kind: job.kind, label: job.label, momentTick: job.momentTick,
          startTick: job.startTick, endTick: job.endTick, tickRate: 60, seconds: TRAILER_CLIP_SECONDS,
          sectorId: job.sectorId, entityId: job.entityId, position: job.position, camera: job.camera, music: job.music,
          hideUI: true, recording: recordingSnapshot, pcm, soundtrack: pcm ? 'recorded-master-bus' : 'unavailable' };
        sealed.push(clip);
        if (sealed.length > MAX_SEALED) sealed.shift();
        onReady(clip);
      }
    },
    list() { return sealed.slice(); },
    remove(id) {
      const index = sealed.findIndex((clip) => clip.id === id);
      if (index < 0) return false;
      sealed.splice(index, 1);
      return true;
    },
    get pendingCount() { return pending.length; },
    clear() { pending.length = 0; sealed.length = 0; seen.clear(); lastTick = -1; },
    census() { return { pending: pending.length, sealed: sealed.length,
      poseFrames: pending.reduce((sum, row) => sum + row.poseFrames.length, 0) }; },
  };
  return collector;
}

/** Planned camera over recorded poses; the live approach beat becomes a gentle
 * arrival from a wide establishing view. It never controls the player's camera. */
export function createTrailerCameraLease(tape, clip) {
  const target = tape.ships.find((ship) => String(ship.id) === String(clip.entityId));
  const pilot = tape.ships.find((ship) => ship.player);
  const radius = target?.radius || 60;
  const moving = target && Math.hypot(target.x.at(-1) - target.x[0], target.z.at(-1) - target.z[0]) > radius;
  if (!target && !clip.position) return null;
  const sample = (ship, tick) => {
    const at = Math.max(0, Math.min(ship.n - 1, (tick - tape.baseTick) * tape.sampleRate / 60 - ship.b));
    const lo = Math.floor(at), hi = Math.min(ship.n - 1, lo + 1), a = at - lo;
    return { x: ship.x[lo] + (ship.x[hi] - ship.x[lo]) * a,
      z: ship.z[lo] + (ship.z[hi] - ship.z[lo]) * a };
  };
  return {
    frameAt(tick) {
      const focus = target ? sample(target, tick) : clip.position;
      const player = pilot ? sample(pilot, tick) : focus;
      const context = Math.hypot(player.x - focus.x, player.z - focus.z) * 0.6;
      // A departing tanker remains the subject; a distant pilot must not turn
      // that authored body into a speck during the rest of the thirty-second shot.
      const extent = Math.max(radius, moving ? Math.min(context, radius * 2) : context);
      const t = Math.max(0, Math.min(1, (tick - clip.momentTick) / (60 * (clip.camera?.seconds || 3))));
      const amount = Math.max(0, Math.min(0.3, clip.camera?.zoom || 0.1));
      return { recorded: true, focus: { x: focus.x, z: focus.z },
        zoom: Math.max(clip.camera?.worldHeight || 150, extent * 3) * (1 + amount * (1 - t * t * (3 - 2 * t))),
        ...(Number.isFinite(clip.camera?.pitch) ? { pitch: clip.camera.pitch, yaw: clip.camera.yaw } : {}) };
    },
    release() {},
  };
}
