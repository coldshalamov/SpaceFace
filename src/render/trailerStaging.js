import { TRAILER_MOMENTS, trailerMomentMatches } from '../data/trailerMoments.js';
import { createCameraGate } from './shakeAdmission.js';
import { isHostileToPlayer } from '../systems/scannerReadModel.js';

// Cosmetic, once-per-run approach beats. It never changes follow focus, input, time or outcomes.
// HARMONY-FIX 8: the zoom asks the camera gate under the cause `establishing`, and the whole beat
// (zoom, music, caption) waits while a hostile is engaged - it stays unseen and fires later.
const ENGAGED_RANGE_WU = 700;
function hostileEngaged(state, player) {
  for (const e of state.entityList || []) {
    if (!e || e === player || e.alive === false || !e.pos || !(e.hull > 0)) continue;
    if (!isHostileToPlayer(e, player.team, state)) continue;
    const combat = e.data && e.data.combat;
    if (combat && (combat.targetId === player.id || combat.lockTarget === player.id)) return true;
    if (Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) <= ENGAGED_RANGE_WU) return true;
  }
  return false;
}
// Poll at 5 Hz using one entity pass; ordinary render frames allocate nothing.
export function createTrailerStaging(state, bus) {
  const seen = new Set();
  let nextAt = -Infinity, lastAt = -Infinity, epoch = state.meta?.seed;
  let privateGate = null, refusalNoted = false;
  const gateOf = () => state.render?.cameraGate || privateGate || (privateGate = createCameraGate());
  const admit = (moment, e, camera, now, sectorId) => {
    if (Math.hypot(e.pos.x - state.entities.get(state.playerId).pos.x, e.pos.z - state.entities.get(state.playerId).pos.z) > moment.approachWu) return false;
    const here = state.entities.get(state.playerId);
    if (hostileEngaged(state, here)) {
      if (!refusalNoted) { gateOf().refuse('establishing', now, 'zoom'); refusalNoted = true; }
      return false;
    }
    refusalNoted = false;
    seen.add(moment.id); lastAt = now;
    const reduced = state.settings?.video?.motionReduce || state.settings?.accessibility?.reducedMotion;
    if (!reduced) {
      const zoom = gateOf().motion('zoom', 'establishing', moment.camera.zoom, now);
      if (zoom !== 0) camera.pushZoom(zoom, moment.camera.seconds);
    }
    bus?.emit('audio:cue', { id: moment.music.cue, gain: moment.music.gain, importance: 0.55 });
    bus?.emit('setPiece:staged', {
      id: moment.id, title: moment.title, sectorId, entityId: e.id, tick: state.tick,
      position: { x: e.pos.x, z: e.pos.z },
      simTime: now, camera: moment.camera, music: moment.music, clip: moment.clip,
    });
    return true;
  };
  // FIRST HOUR (2026-11-21): a new Adventure game asks for one establishing shot. The sim stamps
  // state.nav.openingEstablishing at the opening seat; the camera opens pulled back over the harbour and
  // eases in to the ship. Same gate cause as the authored-place beats; reduced motion skips it.
  let openingKey = null;
  // The shot is for the player's eyes: it starts when the loading veil lifts, not when the sim
  // enters flight underneath it (the first measured run spent the whole move behind the veil).
  let veilDown = false;
  bus?.on?.('ui:loadingHidden', () => { veilDown = true; });
  bus?.on?.('game:new', () => { veilDown = false; });
  const stepOpening = (camera) => {
    const ask = state.nav && state.nav.openingEstablishing;
    if (!ask || !veilDown || state.mode !== 'flight' || ask.sectorId !== state.world?.currentSectorId) return;
    const key = `${state.meta?.seed}:${ask.sectorId}:${ask.atSimTime}`;
    if (key === openingKey) return;
    openingKey = key;
    const now = Number(state.simTime) || 0;
    // A Continue long after the opening never replays it (loading can run the sim a while).
    if (now - (Number(ask.atSimTime) || 0) > 120) return;
    const reduced = state.settings?.video?.motionReduce || state.settings?.accessibility?.reducedMotion;
    if (reduced || typeof camera?.pushZoom !== 'function') return;
    const zoom = gateOf().motion('zoom', 'establishing', Number(ask.zoom) || 3, now);
    if (zoom !== 0) camera.pushZoom(zoom, Number(ask.seconds) || 3, { from: true, holdS: Number(ask.holdS) || 0 });
    lastAt = now; // authored-place beats wait their 12 s behind the opening shot
  };
  return {
    seen,
    step(camera) {
      stepOpening(camera);
      const now = Number(state.simTime) || 0;
      if (now < lastAt || epoch !== state.meta?.seed) { seen.clear(); nextAt = -Infinity; epoch = state.meta?.seed; }
      if (now < nextAt) return;
      nextAt = now + 0.2;
      const sectorId = state.world?.currentSectorId;
      const player = state.entities?.get(state.playerId);
      if (state.mode !== 'flight' || !player?.pos || player.alive === false || player.flags?.docked
        || state.render?.photoMode?.active || state.ui?.paused
        || (state.run?.kind === 'survival' && state.run.phase !== 'inactive')) return;
      if (now - lastAt < 12) return;
      for (const moment of TRAILER_MOMENTS) {
        if (moment.sectorId === sectorId && !seen.has(moment.id) && moment.source.position
          && admit(moment, { pos: moment.source.position, id: moment.id }, camera, now, sectorId)) return;
      }
      // Static authored places live in the dressing table, outside the combat list.
      for (let pass = 0; pass < 2; pass++) {
        const list = pass ? state.world?.dressing?.rows : state.entityList;
        for (const e of list || []) {
          if (!e?.pos || e.alive === false || e.id === player.id) continue;
          for (const moment of TRAILER_MOMENTS) {
            if (moment.sectorId !== sectorId || seen.has(moment.id) || !trailerMomentMatches(moment, e)) continue;
            if (admit(moment, e, camera, now, sectorId)) return;
          }
        }
      }
    },
  };
}
