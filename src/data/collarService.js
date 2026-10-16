// SFQ-B165 — the Breathing Dock's collar is one berth. A spindle carrier using it as
// lungs closes that berth. The quiet sample work and the mission desk stay open.
// No clock: only an arrival, an inhale, or a mark changes the berth.

export const COLLAR_SITE_ID = 'breathing_dock';

export const COLLAR_CLEAR = 'The collar is clear. It will take a ship.';
export const COLLAR_HELD = 'The carrier is breathing in. Berth closed. The quiet tender still lifts samples. A mark on the carrier opens the collar.';
export const COLLAR_RESTORED = 'The carrier is marked. The collar is clear again and will take a ship.';

export function collarCause(site) {
  const cast = site && site.faunaCast;
  const count = cast ? Number(cast.spindle_mother) : 0;
  return count > 0 ? 'spindle_mother' : null;
}

export function stepCollarService(stage, event) {
  const cur = stage === 'held' ? 'held' : 'open';
  if (event === 'arrive') {
    return cur === 'open' ? { stage: 'open', text: COLLAR_CLEAR } : { stage: 'held', text: null };
  }
  if (event === 'inhale') {
    return cur === 'open' ? { stage: 'held', text: COLLAR_HELD } : { stage: 'held', text: null };
  }
  if (event === 'divert') {
    return cur === 'held' ? { stage: 'open', text: COLLAR_RESTORED } : { stage: 'open', text: null };
  }
  return { stage: cur, text: null };
}

export function useCollarService(stage, serviceId) {
  const held = stage === 'held';
  if (serviceId === 'sample') {
    return { ok: true, service: 'sample', open: true, alternative: null };
  }
  if (serviceId === 'missions') {
    return { ok: true, service: 'missions', open: true, alternative: null };
  }
  if (serviceId === 'berth') {
    return held
      ? { ok: false, service: 'berth', open: false, alternative: 'sample' }
      : { ok: true, service: 'berth', open: true, alternative: null };
  }
  return { ok: false, service: serviceId || null, open: false, alternative: 'sample' };
}
