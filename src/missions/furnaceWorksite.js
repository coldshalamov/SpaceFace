// CR-FEED owns these three disposal lots; ordinary rock remains valid furnace fuel.
import { FURNACE_INTAKE } from '../data/furnace.js';
import { sectorLocalToGlobalForSector, sectorMembershipAtGlobal } from '../data/sectorCoordinates.js';

export const FURNACE_LOT_VERSION = 1;
export function furnaceMouthGlobal() {
  return sectorLocalToGlobalForSector(FURNACE_INTAKE.mouth, FURNACE_INTAKE.sectorId);
}
export function furnaceDetail(m) {
  return m?.status === 'active' && m.storyTag === 'campaign47a:b1:infested'
    && m.destSectorId === FURNACE_INTAKE.sectorId && m.params?.furnaceFeedsNeeded > 0;
}
export function furnaceLots(m) {
  if (!furnaceDetail(m)) return [];
  // Preserve accepted old-save partial disposal; do not demand those lots twice.
  if (!Array.isArray(m.params.furnaceLots)) {
    const paid = Math.min(3, Math.max(0, m.params.furnaceFeeds | 0));
    m.params.furnaceLots = Array.from({ length: 3 }, (_, slot) => ({
      slot, received: slot < paid, sectorId: FURNACE_INTAKE.sectorId,
      pos: sectorLocalToGlobalForSector({ x: 1760, z: 1740 + slot * 70 }, FURNACE_INTAKE.sectorId),
      vel: { x: 0, z: 0 }, hull: 220,
    }));
  }
  return m.params.furnaceLots;
}
export function furnaceLotSpec(m, lot) {
  return {
    type: 'payload', team: 2, pos: { ...lot.pos }, vel: { ...lot.vel }, rot: lot.rot || 0, angVel: lot.angVel || 0,
    radius: 12, mass: 40, hull: lot.hull, hullMax: 220, collides: true,
    physicsBody: { radius: 12, mass: 40, dynamic: true, ccd: true },
    homeSectorId: lot.sectorId || sectorMembershipAtGlobal(lot.pos),
    flags: { missionPinned: true },
    data: { furnaceLotVersion: FURNACE_LOT_VERSION, furnaceMissionId: m.id,
      furnaceLotSlot: lot.slot, furnaceOriginSectorId: FURNACE_INTAKE.sectorId,
      homeSectorId: lot.sectorId || sectorMembershipAtGlobal(lot.pos),
      scanLabel: `CR-FEED — quarantined ore pod ${lot.slot + 1}/3`,
      payloadType: 'furnace_ore_pod', tetherable: true, tetherPayload: true,
      // Mission ledger owns persistence; this is not a generic market pickup or world actor.
      missionPinned: true, persistenceOwner: 'missionFurnaceWorksite',
    },
  };
}
export function furnaceReceiptMatches(m, receipt, entity) {
  const d = entity?.data;
  return furnaceDetail(m) && receipt?.sectorId === FURNACE_INTAKE.sectorId
    && receipt.missionId === m.id && Number.isInteger(receipt.lotSlot)
    && receipt.lotSlot >= 0 && receipt.lotSlot < 3
    && entity?.id === receipt.entityId && entity._furnaceTaken === true
    && entity.type === 'payload' && d?.persistenceOwner === 'missionFurnaceWorksite'
    && d.furnaceLotVersion === FURNACE_LOT_VERSION && d.furnaceMissionId === m.id
    && d.furnaceLotSlot === receipt.lotSlot
    && furnaceLots(m)[receipt.lotSlot]?.entityId === entity.id
    && !furnaceLots(m)[receipt.lotSlot]?.received && !furnaceLots(m)[receipt.lotSlot]?.lost;
}

export function authoredFurnaceWorksite(m) {
  return furnaceDetail(m) && m.params.furnaceWorksiteVersion === FURNACE_LOT_VERSION;
}
export const FURNACE_HAULER_LOCAL = Object.freeze({ x: 1880, z: 1810 });
export const FURNACE_MITE_KEYS = Object.freeze(Array.from({ length: 4 }, (_, i) => `closed_refinery:suture_mite:${i}`));
export function furnaceMiteClearance(state) {
  const dead = state.world?.alienEcology?.sites?.closed_refinery?.deadFauna || {};
  return FURNACE_MITE_KEYS.filter(key => dead[key] === true);
}
export function furnaceMites(state) {
  return (state.entityList || []).filter(e => e?.alive !== false && e.type === 'fauna'
    && e.data?.ecology?.speciesId === 'suture_mite'
    && FURNACE_MITE_KEYS.includes(e.data.ecology.faunaKey));
}
export function furnaceWorksiteFocus(m, state) {
  if (!authoredFurnaceWorksite(m)) return null;
  if (m.params.furnaceLedgerInvalid) return { pos: furnaceMouthGlobal(), label: 'Refinery cargo record unavailable', reason: 'The saved cargo ledger is invalid; the detail is paused without creating replacement material or payment.' };
  const mites = furnaceMites(state);
  if (m.objectiveProgress < m.objectiveTarget) return {
    pos: mites.length ? { x: mites[0].pos.x, z: mites[0].pos.z } : sectorLocalToGlobalForSector(FURNACE_HAULER_LOCAL, m.destSectorId), targetEntityId: mites[0]?.id || null,
    label: 'Refinery hauler — repair-mite clearance',
    reason: 'Clear four marked repair-mite sites with carefully placed frag blasts. Blasts also hurt Casket worms: keep them outside the blast. Buy and load more frag at Tethys Trade Hub if needed.',
  };
  const pending = furnaceLots(m).filter(row => !row.received && !row.lost);
  const lot = pending.find(row => { const body = state.entities?.get(row.entityId); return body && (body.flags?.tethered || state.player?.tether?.targetId === body.id); }) || pending[0];
  const e = lot && state.entities?.get(lot.entityId);
  const held = e && (e.flags?.tethered || state.player?.tether?.targetId === e.id);
  return {
    pos: held || !lot ? furnaceMouthGlobal() : { ...(e?.pos || lot.pos) },
    targetEntityId: held ? null : e?.id || null,
    sectorId: held || !lot ? FURNACE_INTAKE.sectorId : sectorMembershipAtGlobal(e?.pos || lot.pos),
    label: held ? 'CR-FEED — release ore across the lip' : 'Infested hauler — disposal pods',
    reason: `${m.params.furnaceFeeds || 0}/3 hauler lots received; ${m.params.furnaceLosses || 0} lost. Tow or fling each marked pod into the open amber ring; ordinary rock does not settle these lots.`,
  };
}

export function isFurnaceOwnedLot(e, state) {
  const d = e?.data;
  const valid = e?.type === 'payload' && d?.persistenceOwner === 'missionFurnaceWorksite'
    && d.furnaceLotVersion === 1 && typeof d.furnaceMissionId === 'string' && d.furnaceMissionId.length > 0
    && Number.isInteger(d.furnaceLotSlot) && d.furnaceLotSlot >= 0 && d.furnaceLotSlot < 3
    && d.payloadType === 'furnace_ore_pod' && d.furnaceOriginSectorId === FURNACE_INTAKE.sectorId;
  if (!valid) return false;
  const active = state?.missions?.active?.find(m => furnaceDetail(m) && m.id === d.furnaceMissionId);
  const after = state?.missions?.furnaceWorksiteAftermath;
  const lots = active?.params?.furnaceLots || (after?.version === 1 && after.missionId === d.furnaceMissionId ? after.lots : null);
  const lot = lots?.[d.furnaceLotSlot];
  if (!lot || lot.slot !== d.furnaceLotSlot || lot.received || lot.lost) return false;
  if (lot.entityId != null) return lot.entityId === e.id;
  // Restore drops transient IDs before custody owners may restore a body. Preserve the
  // single stable-identity match until the mission materializer adopts it, never a clone.
  const matches = (state.entityList || []).filter(body => body?.alive !== false
    && body.type === 'payload' && body.data?.persistenceOwner === d.persistenceOwner
    && body.data.furnaceMissionId === d.furnaceMissionId && body.data.furnaceLotSlot === d.furnaceLotSlot);
  return matches.length === 1 && matches[0] === e;
}


export function furnaceAccounting(m) {
  const lots = furnaceLots(m);
  return { received: lots.filter(row => row.received === true).length,
    lost: lots.filter(row => row.lost === true && !row.received).length };
}
