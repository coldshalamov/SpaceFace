// CR-FEED owns these three disposal lots; ordinary rock remains valid furnace fuel.
import { FURNACE_INTAKE } from '../data/furnace.js';
import { lineClassForIndex, normalizeLineProgression } from '../data/lineProgression.js';
import { sectorLocalToGlobalForSector, sectorMembershipAtGlobal } from '../data/sectorCoordinates.js';

export const FURNACE_LOT_VERSION = 1;
export const FURNACE_LOT_MASS_T = 40;
export function furnaceHandlingRead(state) {
  const line = lineClassForIndex(normalizeLineProgression(state?.lineProgression).classIndex);
  return { lineClass: line.label, limitT: line.fullControlMassT,
    podMassT: FURNACE_LOT_MASS_T, overclass: FURNACE_LOT_MASS_T > line.fullControlMassT };
}
export function furnaceHandlingLine(state) {
  const read = furnaceHandlingRead(state);
  return read.overclass
    ? `Each pod is ${read.podMassT} t. Your Line Class ${read.lineClass} is rated for ${read.limitT} t: a sustained hold overheats and snaps even at low speed. Do not attempt a long tow. The CR-FEED yard gantry has its own 40 t winch: clear the mites, right-click the gantry at the large ring, then Hail to wind one original pod at a time.`
    : `Each pod is ${read.podMassT} t, within your Line Class ${read.lineClass} rating of ${read.limitT} t. Aim the load through the large intake ring; the small ring is only an approach mark.`;
}
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
      // Fresh lots have separate pickup pockets east of the intake, clear of the old hulk.
      // Existing ledgers retain their physical positions; this is not a save migration.
      pos: sectorLocalToGlobalForSector({ x: 1760 + slot * 170, z: 1640 }, FURNACE_INTAKE.sectorId),
      vel: { x: 0, z: 0 }, hull: 220,
    }));
  }
  return m.params.furnaceLots;
}
export function furnaceLotSpec(m, lot) {
  return {
    type: 'payload', team: 2, pos: { ...lot.pos }, vel: { ...lot.vel }, rot: lot.rot || 0, angVel: lot.angVel || 0,
    radius: 12, mass: FURNACE_LOT_MASS_T, hull: lot.hull, hullMax: 220, collides: true,
    physicsBody: { radius: 12, mass: FURNACE_LOT_MASS_T, dynamic: true, ccd: true },
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
    reason: `Clear four marked repair-mite sites with carefully placed frag blasts. Blasts also hurt Casket worms: keep them outside the blast. Buy and load more frag at Tethys Trade Hub if needed. ${furnaceHandlingLine(state)}`,
  };
  const pending = furnaceLots(m).filter(row => !row.received && !row.lost);
  const lot = pending.find(row => { const body = state.entities?.get(row.entityId); return body && (body.flags?.tethered || state.player?.tether?.targetId === body.id); }) || pending[0];
  const e = lot && state.entities?.get(lot.entityId);
  const held = e && (e.flags?.tethered || state.player?.tether?.targetId === e.id);
  const gantry = (state.entityList || []).find(body => body.alive && body.data?.furnaceCapstanId === 'cr_feed_quarantine_gantry'
    && body.data.furnaceMissionId === m.id);
  if (gantry && !held && lot) return {
    pos: { x: gantry.pos.x, z: gantry.pos.z }, targetEntityId: gantry.id,
    sectorId: FURNACE_INTAKE.sectorId, label: 'CR-FEED gantry — winch the quarantine pods',
    reason: `${m.params.furnaceFeeds || 0}/3 received; ${m.params.furnaceLosses || 0} lost. Right-click the gantry and Hail: WINCH POD brings one original 40 t load through the large intake ring. The yard winch is included; your own Line rating does not change. HOLD stops the drum, RELEASE TO MANUAL cuts its cable. Stay within 650 WU. Keep your own freight and hull clear.`,
  };
  const initial = lot && sectorLocalToGlobalForSector({ x: 1760 + lot.slot * 170, z: 1640 }, FURNACE_INTAKE.sectorId);
  const bank = initial && Math.hypot((e?.pos || lot.pos).x - initial.x, (e?.pos || lot.pos).z - initial.z) < 35;
  return {
    pos: held || !lot ? furnaceMouthGlobal() : { ...(e?.pos || lot.pos) },
    targetEntityId: held ? null : e?.id || null,
    sectorId: held || !lot ? FURNACE_INTAKE.sectorId : sectorMembershipAtGlobal(e?.pos || lot.pos),
    label: held ? 'CR-FEED — release ore across the lip' : 'Infested hauler — disposal pods',
    reason: `${m.params.furnaceFeeds || 0}/3 hauler lots received; ${m.params.furnaceLosses || 0} lost. ${held ? 'The large amber ring is the intake; the smaller ring is only an approach mark.' : bank ? 'Collect the next pod from the intake-aligned east bank.' : 'Follow the current marked load position; this pod has moved.'} ${furnaceHandlingLine(state)} Only marked pods settle these lots; ordinary rock does not.`,
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
