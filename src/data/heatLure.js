// SFQ-B167 — the heat notebook is the observation. One sample becomes a lure.
// Filament is the sample. Resin stands in if the filament is gone. No pile, no clock.

import { HEAT_TRIAL_NOTE } from './heatProximityTrial.js';

export const LURE_SITE_ID = 'harvest_deep';
export const LURE_FILAMENT = 'cmdty_filament_sample';
export const LURE_RESIN = 'cmdty_cyst_resin';

export const LURE_NEED = 'The notebook is filed. One filament sample or one resin lot makes the lure.';
export const LURE_MADE = 'The filament sample is now the lure. It is fitted. Leave and come back to try it.';
export const LURE_MADE_RESIN = 'The resin stands in for the lost filament. The lure is fitted. Leave and come back to try it.';
export const LURE_SHOWN = 'The maw answers the lure. A cold pass would hold. The heat brings the charge.';

export function heatLureRecipe(note, filamentQty, resinQty) {
  if (note !== HEAT_TRIAL_NOTE) return { ready: false, material: null, text: null };
  const filament = Number(filamentQty) > 0;
  const resin = Number(resinQty) > 0;
  if (filament) return { ready: true, material: LURE_FILAMENT, text: LURE_MADE };
  if (resin) return { ready: true, material: LURE_RESIN, text: LURE_MADE_RESIN };
  return { ready: false, material: null, text: LURE_NEED };
}

export function copyHeatDerivative(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const lure = raw.lure === LURE_FILAMENT || raw.lure === LURE_RESIN ? raw.lure : null;
  const next = {};
  if (lure) next.lure = lure;
  if (raw.shown === true) next.shown = true;
  if (raw.trialStarted === true) next.trialStarted = true;
  if (raw.edge === true) next.edge = true;
  if (raw.asked === true) next.asked = true;
  return Object.keys(next).length ? next : null;
}
