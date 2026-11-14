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
      pos: sectorLocalToGlobalForSector({ x: 1760 + slot * 170, z: 1640 }, FURNACE_INTAKE.sectorId),
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
  const bank = lot && sectorLocalToGlobalForSector({ x: 1760 + lot.slot * 170, z: 1640 }, FURNACE_INTAKE.sectorId);
  const inBank = !held && bank && Math.hypot((e?.pos || lot.pos).x - bank.x, (e?.pos || lot.pos).z - bank.z) < 1;
  return {
    pos: held || !lot ? furnaceMouthGlobal() : { ...(e?.pos || lot.pos) },
    targetEntityId: held ? null : e?.id || null,
    sectorId: held || !lot ? FURNACE_INTAKE.sectorId : sectorMembershipAtGlobal(e?.pos || lot.pos),
    label: held ? 'CR-FEED — release ore across the lip' : 'Infested hauler — disposal pods',
    reason: `${m.params.furnaceFeeds || 0}/3 hauler lots received; ${m.params.furnaceLosses || 0} lost. ${inBank ? 'The marked load is on the intake-aligned east bank; take the remaining lot nearest the intake first. ' : 'Follow the current marked load position. '}Tow or fling each marked pod into the open amber ring, or hail the yard gantry at the mouth to wind one in on its cable; ordinary rock does not settle these lots.`,
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

/** The worksite's receiving leg: clearance done, at least one lot still owed. The intake
 *  owner resolves this on mission/sector transitions; it is the only mission-row read the
 *  receiving-lane guide needs. */
export function furnaceReceivingJob(state) {
  return (state?.missions?.active || []).find(m => authoredFurnaceWorksite(m) && !m.params.furnaceLedgerInvalid
    && Number.isFinite(m.objectiveTarget) && m.objectiveTarget > 0 && m.objectiveProgress >= m.objectiveTarget
    && Array.isArray(m.params.furnaceLots) && m.params.furnaceLots.some(l => !l.received && !l.lost)) || null;
}

/** Owner-side ledger voice for one just-validated receipt — reads the mission's own ledger
 *  after the row is marked; it performs no validation of its own. */
export function furnaceLotCallout(m, lotSlot) {
  const lots = m?.params?.furnaceLots;
  const row = Array.isArray(lots) ? lots[lotSlot] : null;
  if (!row || m.params.furnaceLedgerInvalid) return null;
  const received = lots.filter(l => l.received).length;
  const lost = lots.filter(l => l.lost && !l.received).length;
  const remaining = lots.filter(l => l !== row && !l.received && !l.lost).length;
  return `CR-FEED: Quarantine lot ${row.slot + 1} received. ${received}/3 through the mouth${lost ? `; ${lost} lost outside it` : ''}. ${received === 3 ? 'All three accounted for at intake.' : remaining ? 'Keep the next marked lot clear until your line is ready.' : 'No marked lots remain outside; lost lots did not reach intake.'}`;
}

// ── cooled-casing return ─────────────────────────────────────────────────────────────────
// One optional material fact rides the worksite's finite record: after three validated
// receipts the yard owes exactly one cooled casing shell. The record's state machine is
// none (absent) → pending → issued{entityId|collected}; there is no persisted in-flight
// state, so a restored record can only retry, never silently consume the return.
export const FURNACE_CASING_MATERIAL = 'cr_feed:cooled_casing:v1';
export function newFurnaceCasingRecord() {
  return { version: 1, materialId: FURNACE_CASING_MATERIAL, state: 'pending' };
}
/** The casing ledger on whichever finite material record currently owns the worksite:
 *  the settled aftermath record first, then the still-active mission's params. */
export function furnaceCasingRecord(state) {
  const after = state?.missions?.furnaceWorksiteAftermath;
  if (after?.casing) return after.casing;
  const active = (state?.missions?.active || []).find(authoredFurnaceWorksite);
  return (active && active.params?.furnaceCasing) || null;
}
export function normalizeFurnaceCasing(raw) {
  if (raw?.version !== 1 || raw.materialId !== FURNACE_CASING_MATERIAL) return null;
  // Anything that is not a proven issue — pending, unknown, or a salvaged in-flight mark —
  // reconciles as pending: the spawn retries instead of being treated as already spent.
  const record = { version: 1, materialId: FURNACE_CASING_MATERIAL,
    state: raw.state === 'issued' ? 'issued' : 'pending' };
  if (typeof raw.entityId === 'string' && raw.entityId) record.entityId = raw.entityId;
  if (raw.collected) record.collected = raw.collected;
  if (Number.isFinite(raw.issuedAt)) record.issuedAt = raw.issuedAt;
  if (Number.isFinite(raw.nextAttemptAt)) record.nextAttemptAt = raw.nextAttemptAt;
  return record;
}
