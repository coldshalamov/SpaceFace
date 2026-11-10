import { LAST_SHIFT, lastShiftBodyKey } from '../data/lastShift.js';

const FILES = Object.freeze({
  fairlead: 'places/place_last_shift_fairlead.glb',
  cargo: 'places/place_aftermath_aft_cargo_module.glb',
});

// The recorder has its own accepted Thimble boundary in visualOverrides. This seam owns
// only the two static-evidence selections shared by ordinary visual build and prewarm.
export function lastShiftPackagedFile(entity) {
  const data = entity?.data;
  if (entity?.type !== 'wreck' || data?.persistenceOwner !== LAST_SHIFT.persistenceOwner
    || data.lastShiftSiteId !== LAST_SHIFT.siteId
    || !Object.hasOwn(FILES, data.lastShiftClueId)
    || data.lastShiftBodyKey !== lastShiftBodyKey(data.lastShiftClueId)) return null;
  return FILES[data.lastShiftClueId];
}
