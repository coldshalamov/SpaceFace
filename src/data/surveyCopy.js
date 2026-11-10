// SFQ-B168 — one copy of the heat notebook can be sold. The note stays.
// A second copy of the same page pays nothing. No clock. No campaign flag.

import { HEAT_TRIAL_NOTE } from './heatProximityTrial.js';

export const COPY_STATION_ID = 'station_ashcache';
export const COPY_SECTOR_ID = 'sector_ashfall_reach';
export const COPY_POS = Object.freeze({ x: -820, z: 480 });
export const COPY_REACH = 400;
export const COPY_PAY = 480;

export const COPY_SOLD = 'The heat note is copied. You still have it. The buyer has the same page.';
export const COPY_STALE = 'That page is already sold. The note is still yours. This copy pays nothing.';

export function surveyCopyOffer(note, soldNote) {
  if (note !== HEAT_TRIAL_NOTE) return { pay: 0, text: null, key: null };
  if (soldNote === note) return { pay: 0, text: COPY_STALE, key: note };
  return { pay: COPY_PAY, text: COPY_SOLD, key: note };
}

export function copySurveySale(raw) {
  if (!raw || raw.note !== HEAT_TRIAL_NOTE) return null;
  const next = { note: HEAT_TRIAL_NOTE };
  if (raw.edge === true) next.edge = true;
  return next;
}
