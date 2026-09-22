// Presentation clocks that must freeze when the sim pauses.
//
// The render loop's wall clock keeps moving through pause, photo holds, and the
// loading shell. Drive fans and table-sized VFX read this stamp instead, which
// vfx.update refreshes from state.simTime and the live table draw radius.
import { tableVfxDrawWuFromState } from './tabletopPolicy.js';

let simTime = 0;
let tableDrawWu = NaN;

export function notePresentationFrame(state) {
  const t = Number(state && state.simTime);
  if (Number.isFinite(t)) simTime = t;
  const draw = tableVfxDrawWuFromState(state || {});
  if (Number.isFinite(draw) && draw > 0) tableDrawWu = draw;
}

export function presentationSimTime() {
  return simTime;
}

export function presentationTableDrawWu() {
  return tableDrawWu;
}

export function resetPresentationFrameClock() {
  simTime = 0;
  tableDrawWu = NaN;
}
