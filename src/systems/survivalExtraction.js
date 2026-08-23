// Extraction experiment (PQ-133.10b).
// Cash out at a ten-wave boundary or keep the run. No UI; a bus request or
// this helper asks the run machine to end as extracted.

import { isExtractionWindow } from '../data/survivalWaves.js';

export { isExtractionWindow };

export function canExtract(run) {
  if (!run || typeof run !== 'object') return false;
  if (run.kind !== 'survival') return false;
  if (run.phase !== 'cleanup' && run.phase !== 'refit') return false;
  return isExtractionWindow(run.wave);
}

/**
 * Ask the live run to cash out. Emits run:extractionRequested when a bus is
 * present; tests can also emit that event directly.
 */
export function requestSurvivalExtraction(bus) {
  if (!bus || typeof bus.emit !== 'function') return false;
  bus.emit('run:extractionRequested', {});
  return true;
}
