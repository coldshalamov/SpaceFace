import { TRAILER_MOMENTS, trailerMomentMatches } from '../data/trailerMoments.js';

// Cosmetic, once-per-run approach beats. It never changes follow focus, input, time or outcomes.
// Poll at 5 Hz using one entity pass; ordinary render frames allocate nothing.
export function createTrailerStaging(state, bus) {
  const seen = new Set();
  let nextAt = -Infinity, lastAt = -Infinity, epoch = state.meta?.seed;
  const admit = (moment, e, camera, now, sectorId) => {
    if (Math.hypot(e.pos.x - state.entities.get(state.playerId).pos.x, e.pos.z - state.entities.get(state.playerId).pos.z) > moment.approachWu) return false;
    seen.add(moment.id); lastAt = now;
    const reduced = state.settings?.video?.motionReduce || state.settings?.accessibility?.reducedMotion;
    if (!reduced) camera.pushZoom(moment.camera.zoom, moment.camera.seconds);
    bus?.emit('audio:cue', { id: moment.music.cue, gain: moment.music.gain, importance: 0.55 });
    bus?.emit('setPiece:staged', {
      id: moment.id, title: moment.title, sectorId, entityId: e.id, tick: state.tick,
      simTime: now, camera: moment.camera, music: moment.music, clip: moment.clip,
    });
    return true;
  };
  return {
    seen,
    step(camera) {
      const now = Number(state.simTime) || 0;
      if (now < lastAt || epoch !== state.meta?.seed) { seen.clear(); nextAt = -Infinity; epoch = state.meta?.seed; }
      if (now < nextAt) return;
      nextAt = now + 0.2;
      const sectorId = state.world?.currentSectorId;
      const player = state.entities?.get(state.playerId);
      if (state.mode !== 'flight' || !player?.pos || player.alive === false || player.flags?.docked
        || state.render?.photoMode?.active || state.ui?.paused || state.run?.kind === 'survival') return;
      if (now - lastAt < 12) return;
      for (const moment of TRAILER_MOMENTS) {
        if (moment.sectorId === sectorId && !seen.has(moment.id) && moment.source.position
          && admit(moment, { pos: moment.source.position, id: moment.id }, camera, now, sectorId)) return;
      }
      for (const e of state.entityList || []) {
        if (!e?.pos || e.alive === false || e.id === player.id) continue;
        for (const moment of TRAILER_MOMENTS) {
          if (moment.sectorId !== sectorId || seen.has(moment.id) || !trailerMomentMatches(moment, e)) continue;
          if (admit(moment, e, camera, now, sectorId)) return;
        }
      }
    },
  };
}
