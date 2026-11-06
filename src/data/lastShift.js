import { SECTOR_ZONES } from './sectorZones.js';
import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';

export const LAST_SHIFT = Object.freeze({
  siteId: 'ceres:last-shift:v1', sectorId: 'sector_ceres_belt',
  persistenceOwner: 'lastShift', scanRangeWu: 320, discoveryRangeWu: 1200,
});
const belt = SECTOR_ZONES[LAST_SHIFT.sectorId].find(z => z.id === 'zone_ceres_belt');
// Previous authored pocket before the Belt Outpost approach was rerouted. The Last Shift owner
// uses this only to migrate an untouched live legacy body during Continue; changed or progressed
// bodies keep their saved positions.
export const LAST_SHIFT_LEGACY_POS = Object.freeze(sectorLocalToGlobalForSector({
  x: belt.center.x + 380, z: belt.center.z - 260,
}, LAST_SHIFT.sectorId));
// Keep this evidence pocket in the Ceres Belt zone, north of the Ceres field and clear of the
// refinery-to-Belt-Outpost approach. Legacy bodies are migrated only while still untouched.
export const LAST_SHIFT_POS = Object.freeze(sectorLocalToGlobalForSector({
  x: belt.center.x + 580, z: belt.center.z + 310,
}, LAST_SHIFT.sectorId));

export const LAST_SHIFT_CLUES = Object.freeze([
  Object.freeze({ id: 'fairlead', label: 'Last Shift — torn fairlead',
    fact: 'The tow fairlead tore sideways. Its inner roller has a lateral load scar; the exposed plate has no incoming-fire pits.',
    provisional: 'A side load fits this damage. The plate alone cannot identify who released the tow.',
    offset: Object.freeze({ x: 0, z: 0 }), radius: 26, mass: 1800, dynamic: false,
    parentType: 'ship', pool: Object.freeze({ cmdty_scrap_metal: 4 }) }),
  Object.freeze({ id: 'cargo', label: 'Last Shift — released ore rack',
    fact: 'The ore rack is beyond the impact scar. Its release collar was opened before the collision timestamp; the latch was not shot apart.',
    provisional: 'The load was deliberately released. This rack does not say whether that decision was a theft or a rescue.',
    offset: Object.freeze({ x: 105, z: -42 }), radius: 12, mass: 90, dynamic: true,
    parentType: 'module', pool: Object.freeze({ cmdty_ore_bronzium: 6 }) }),
  Object.freeze({ id: 'recorder', label: 'Last Shift — tug recorder',
    fact: 'Tug log: “We have the tug on the line. Do not burn yet.” Then: “Cut the load. Keep the ship. I said keep the ship.”',
    provisional: 'The crew intended to save the ship. The recorder alone cannot prove which load path failed.',
    offset: Object.freeze({ x: -42, z: 52 }), radius: 5, mass: 5, dynamic: true,
    parentType: 'communicator', pool: Object.freeze({ cmdty_salvage_electronics: 1 }) }),
]);
const BY_ID = new Map(LAST_SHIFT_CLUES.map(c => [c.id, c]));
export function lastShiftClue(id) { return BY_ID.get(id) || null; }
export function lastShiftBodyKey(id) { return `${LAST_SHIFT.siteId}:${id}`; }
export function lastShiftFactIds(values) {
  return LAST_SHIFT_CLUES.map(c => c.id).filter(id => Array.isArray(values) && values.includes(id));
}
export function lastShiftReport(knownIds, destroyedIds = []) {
  const ids = lastShiftFactIds(knownIds), missing = LAST_SHIFT_CLUES.filter(c => !ids.includes(c.id));
  const facts = ids.map(id => lastShiftClue(id).fact);
  const conclusion = ids.length === 3
    ? 'Together the three sources support a deliberate cargo release to save the tug and carrier from a lateral tow collision. The first yard rumor of a pirate strike is not supported by these recovered sources.'
    : `The final sequence remains incomplete. Unknown: ${missing.map(c => c.label.replace('Last Shift — ', '')).join(', ')}. The yard rumor of a pirate strike remains an unverified report.`;
  const lost = missing.filter(c => destroyedIds.includes(c.id));
  return [...facts, conclusion, ...(lost.length ? [`Unread sources lost: ${lost.map(c => c.id).join(', ')}.`] : [])].join(' ');
}
export function freshLastShiftRecord() {
  return { schema: 1, siteId: LAST_SHIFT.siteId, surfaced: false, discovered: false, rumorHeard: false, recoveryActive: false, lastRevisitReceiptId: null,
    knownClueIds: [], destroyedClueIds: [], revision: 0, receipts: [], bodies: {} };
}
export function lastShiftArchiveEvidence(state) {
  const row = state?.world?.lastShift;
  if (row?.schema !== 1 || row.siteId !== LAST_SHIFT.siteId || !Array.isArray(row.receipts)) return null;
  const receipt = row.receipts.at(-1);
  if (!receipt || !Number.isInteger(receipt.revision) || receipt.revision < 1
    || receipt.id !== `${LAST_SHIFT.siteId}:archive:r${receipt.revision}`
    || !Number.isFinite(receipt.at) || receipt.at < 0) return null;
  const ids = lastShiftFactIds(receipt.clueIds);
  if (!ids.length || JSON.stringify(ids) !== JSON.stringify(receipt.clueIds)
    || ids.some(id => !row.knownClueIds?.includes(id))
    || receipt.text !== lastShiftReport(ids, receipt.destroyedClueIds || [])) return null;
  return { id: 'ceres_last_shift', flag: 'doss_ceres_last_shift', title: 'The Last Shift',
    copy: `The Last Shift: ${receipt.text}`, detail: ids.length === 3 ? 'three sources' : `${ids.length} source${ids.length === 1 ? '' : 's'}` };
}

// A local conversation cites the last explicitly filed account, not newly read/unfiled clues.
// This is a pure presenter: the Last Shift owner remains the only evidence/custody writer.
export function lastShiftLocalReport(state) {
  const row = state?.world?.lastShift;
  if (!Array.isArray(row?.knownClueIds) || !Array.isArray(row?.receipts)) return null;
  const receipt = row.receipts.at(-1);
  const destroyed = receipt?.destroyedClueIds;
  if (destroyed !== undefined && (!Array.isArray(destroyed)
    || lastShiftFactIds(destroyed).length !== destroyed.length)) return null;
  const evidence = lastShiftArchiveEvidence(state);
  if (!evidence) return null;
  if (!Number.isInteger(row.revision) || receipt.revision > row.revision) return null;
  const returned = row.recorderReturn;
  const recorderReturned = !!(returned?.id === `${LAST_SHIFT.siteId}:recorder:return`
    && returned.bodyKey === lastShiftBodyKey('recorder')
    && row.bodies?.recorder?.status === 'returned'
    && row.knownClueIds.includes('recorder')
    && typeof returned.stationId === 'string' && /^[a-z0-9][a-z0-9_-]{0,95}$/.test(returned.stationId)
    && Number.isFinite(returned.at) && returned.at >= 0);
  return {
    text: receipt.text,
    recorderReturned,
    recorderStationId: recorderReturned ? returned.stationId : null,
  };
}
