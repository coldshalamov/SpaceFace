/**
 * PQ-159.02 — rated-moment beat: 150 ms time dip, camera hold, stinger.
 * Fires on the moment detector only. Headless sim hashes stay unchanged
 * because this is a timeEffects presentation request, never a sim dt change.
 */
export const BEAT_SEED = 15902;
export const BEAT_DIP_MS = 150;
export const BEAT_DIP_S = BEAT_DIP_MS / 1000;
export const BEAT_TIME_SOURCE = 'moment:beat';
export const BEAT_STINGER = 'moment.stinger';
export const MOMENT_DETECTOR_EVENTS = Object.freeze(['moment:holyShit', 'stunt:trickDetected']);

export function isMomentDetectorEvent(eventName) {
  return MOMENT_DETECTOR_EVENTS.includes(String(eventName || ''));
}

export function resolveMomentBeat(eventName, payload = {}) {
  if (!isMomentDetectorEvent(eventName)) return null;
  if (eventName === 'stunt:trickDetected' && payload && payload.moment !== true && !payload.holyShit) {
    return null;
  }
  return {
    dipMs: BEAT_DIP_MS,
    dipS: BEAT_DIP_S,
    scale: 0.45,
    hold: true,
    stinger: BEAT_STINGER,
    death: payload.death === true || payload.kind === 'death',
    source: BEAT_TIME_SOURCE,
  };
}

export function applyMomentBeat(timeEffects, beat) {
  if (!beat || !timeEffects || typeof timeEffects.request !== 'function') return false;
  timeEffects.request(BEAT_TIME_SOURCE, { scale: beat.scale, durationS: beat.dipS });
  return true;
}
