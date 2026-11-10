// Live customs gate the picture can draw. Null when this sector has no weir.
// A sealed bore cache is noted for the picture only. The lawful scan itself runs
// in the sim and does not read this flag.

import { sealedBoreHiddenInSector } from '../systems/boreDeadDrop.js';

export function readCustomsWeir(state) {
  const live = state && state.lawSecurity && state.lawSecurity.customsWeir;
  if (!live || live.active !== true || !Array.isArray(live.segments) || live.segments.length === 0) {
    return null;
  }
  if (sealedBoreHiddenInSector(state)) return { ...live, sealedBoreHidden: true };
  return live;
}
