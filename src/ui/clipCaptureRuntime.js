// Session-side capture owners for Pause → Clips. This module has no screen DOM or export UI;
// main installs the bounded recorder before flight, while the Clips screen stays lazily loaded.
import { attachClipDirectorToBus, createClipDirector } from '../core/simSnapshot.js';
import { installReplayAudioTape, getReplayAudioTape } from '../audio/replayAudioTape.js';
import { createTrailerClipCollector } from '../sim/trailerClipTape.js';
import { getFlightFootage, installFlightFootage } from './screens/flightFootageCapture.js';

let clipDirector = null;
let clipUnsub = null;
let amendUnsub = null;
let resetUnsub = null;
let clipStateOf = () => null;
let trailerCollector = null;
let trailerOff = null;
let trailerRaf = null;
let clipUiLifecycle = { reset: null, dispose: null };

const amendedGradeByKey = new Map();
const GRADE_RANK = Object.freeze({ common: 1, uncommon: 2, rare: 3, legendary: 4 });

export function setClipUiLifecycleHooks(hooks = {}) {
  clipUiLifecycle = {
    reset: typeof hooks.reset === 'function' ? hooks.reset : null,
    dispose: typeof hooks.dispose === 'function' ? hooks.dispose : null,
  };
}

export function recordedSetPieceClips() { return trailerCollector?.list() || []; }
export function removeRecordedSetPieceClip(id) { return trailerCollector?.remove(id) || false; }
export function getClipState() { return clipStateOf(); }

/** Publish the one live clip director to the lazy Clips surface. */
export function setClipDirector(director) {
  const next = director || null;
  if (next !== clipDirector) amendedGradeByKey.clear();
  clipDirector = next;
}

export function getClipDirector() { return clipDirector; }

function gradeRank(name) { return GRADE_RANK[String(name || '').toLowerCase()] || 0; }

function reelMomentKey(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const tickSource = Number.isFinite(Number(entry.momentTick)) ? Number(entry.momentTick) : Number(entry.tick);
  if (!Number.isFinite(tickSource)) return '';
  const trickId = entry.trickId == null ? '' : String(entry.trickId);
  return Math.floor(tickSource) + '|' + trickId;
}

export function withAmendedGrade(clip) {
  if (!clip || typeof clip !== 'object') return clip;
  const key = reelMomentKey(clip);
  if (!key || !amendedGradeByKey.has(key)) return clip;
  const grade = amendedGradeByKey.get(key);
  if (gradeRank(grade) <= gradeRank(clip.rarity)) return clip;
  return { ...clip, rarity: grade };
}

function noteMomentAmendment(moment) {
  if (!moment || typeof moment !== 'object' || !clipDirector) return;
  const rank = gradeRank(moment.rarity);
  if (!rank) return;
  const key = reelMomentKey(moment);
  if (!key || typeof clipDirector.list !== 'function') return;
  const list = clipDirector.list();
  if (!Array.isArray(list) || !list.some((clip) => reelMomentKey(clip) === key)) return;
  const prev = amendedGradeByKey.get(key);
  if (prev == null || rank > gradeRank(prev)) amendedGradeByKey.set(key, String(moment.rarity).toLowerCase());
}

/**
 * Install bounded frame/audio and event capture before a flight tick. The screen and its replay
 * controls are loaded separately when the player opens Clips from Pause.
 */
export function installLiveClipDirector(bus, options = {}) {
  installFlightFootage(bus, options);
  clipStateOf = options.stateOf || (() => null);
  installReplayAudioTape(bus, options);
  trailerOff?.();
  if (trailerRaf != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(trailerRaf);
  trailerCollector = createTrailerClipCollector({ audioWaitTicks: 12,
    audioWindow: (from, to) => getReplayAudioTape()?.window(from, to) || null });
  const poseRecording = () => clipStateOf()?.replay?.recording || getFlightFootage()?.recording();
  trailerOff = bus?.on?.('setPiece:staged', (marker) => trailerCollector.mark(marker, poseRecording()));
  let trailerPoseTick = -1;
  const noteTrailer = () => {
    if (trailerCollector?.pendingCount) {
      const replay = clipStateOf()?.replay;
      const tick = replay?.recording?.poseFrames?.at(-1)?.tick ?? replay?.latestPoseSample?.tick;
      // The worker publishes one pose sample at 10 Hz. Do not clone/scan its
      // thirty-second mirror again on every presentation frame.
      if (tick !== trailerPoseTick) { trailerPoseTick = tick; trailerCollector.note(poseRecording()); }
    }
    if (typeof requestAnimationFrame === 'function') trailerRaf = requestAnimationFrame(noteTrailer);
  };
  if (typeof requestAnimationFrame === 'function') trailerRaf = requestAnimationFrame(noteTrailer);
  if (!clipDirector) clipDirector = createClipDirector();
  if (clipUnsub) {
    try { clipUnsub(); } catch { /* best-effort */ }
    clipUnsub = null;
  }
  if (amendUnsub) {
    try { amendUnsub(); } catch { /* best-effort */ }
    amendUnsub = null;
  }
  resetUnsub?.(); resetUnsub = null;
  if (bus) {
    clipUnsub = attachClipDirectorToBus(bus, clipDirector, options);
    // Re-rate the clip already on the reel. Never mark another one from the amendment.
    if (typeof bus.on === 'function') amendUnsub = bus.on('moment:amended', noteMomentAmendment);
    const off = ['game:new', 'game:load', 'game:exitToMenu'].map((event) => bus.on(event, () => {
      clipDirector.clear(); amendedGradeByKey.clear();
      trailerCollector?.clear();
      clipUiLifecycle.reset?.();
    }));
    resetUnsub = () => off.forEach((fn) => fn?.());
  }
  return clipDirector;
}

/** Drop capture subscriptions without transferring or resetting session ownership. */
export function uninstallLiveClipDirector() {
  trailerOff?.(); trailerOff = null;
  if (trailerRaf != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(trailerRaf);
  trailerRaf = null;
  getReplayAudioTape()?.dispose();
  clipStateOf = () => null;
  clipUiLifecycle.dispose?.();
  resetUnsub?.(); resetUnsub = null;
  getFlightFootage()?.dispose();
  if (clipUnsub) {
    try { clipUnsub(); } catch { /* best-effort */ }
    clipUnsub = null;
  }
  if (amendUnsub) {
    try { amendUnsub(); } catch { /* best-effort */ }
    amendUnsub = null;
  }
}
