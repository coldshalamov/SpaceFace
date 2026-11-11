// Presentation of the existing finite disposal job. Mission, ecology, intake and economy
// retain their writers. The only durable writes here are once-per-job conversation marks.
import { FURNACE_INTAKE } from '../data/furnace.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { authoredFurnaceWorksite, furnaceMiteClearance, furnaceMouthGlobal,
  FURNACE_HAULER_LOCAL, furnaceHandlingRead, furnaceHandlingLine, furnaceReceiptMatches } from './furnaceWorksite.js';
import { normalizeFurnaceAftermath } from './furnaceWorksiteRuntime.js';

export function furnaceDetailRead(state) {
  const jobs = state?.missions?.active?.filter(authoredFurnaceWorksite) || [];
  if (jobs.length > 1) return null;
  const job = jobs[0];
  const raw = job ? { version: 1, missionId: job.id, lots: job.params.furnaceLots,
    invalid: job.params.furnaceLedgerInvalid } : state?.missions?.furnaceWorksiteAftermath;
  const record = normalizeFurnaceAftermath(raw);
  if (!record || record.invalid) return null;
  const received = record.lots.filter(lot => lot.received).length;
  const lost = record.lots.filter(lot => lot.lost && !lot.received).length;
  const receipts = (Array.isArray(state?.missions?.receipts) ? state.missions.receipts : [])
    .filter(row => row?.missionId === record.missionId);
  const receipt = receipts.length === 1 ? receipts[0] : null;
  const cleared = furnaceMiteClearance(state).length;
  const settled = !job && cleared === 4 && received + lost === 3 && receipt?.id === `${record.missionId}:completed`
    && receipt.outcome === 'completed' && receipt.type === 'patrol_clear'
    && receipt.factionId === 'faction_dmc' && receipt.destStationId === 'station_ceres'
    && receipt.destSectorId === FURNACE_INTAKE.sectorId
    && Number.isFinite(state?.simTime) && Number.isFinite(receipt.at_s)
    && receipt.at_s >= 0 && receipt.at_s <= state.simTime
    && Number.isFinite(receipt.rewardCr) && receipt.rewardCr >= 0;
  const dead = state?.world?.alienEcology?.sites?.closed_refinery?.deadFauna;
  const casketLosses = [0, 1, 2].filter(i => dead?.[`closed_refinery:casket_worm:${i}`] === true).length;
  return { missionId: record.missionId, active: !!job, received, lost, casketLosses,
    pending: 3 - received - lost, cleared, handling: furnaceHandlingRead(state),
    settled: !!settled, rewardCr: settled ? receipt.rewardCr : null };
}

export function furnaceReleasePosition() {
  const mouth = furnaceMouthGlobal();
  return { x: mouth.x + 180, z: mouth.z };
}

export function furnaceReleaseSpec(missionId) {
  return { type: 'beacon', pos: furnaceReleasePosition(), vel: { x: 0, z: 0 },
    radius: 8, mass: 1, hull: 1, hullMax: 1, collides: false, physicsBody: false,
    homeSectorId: FURNACE_INTAKE.sectorId,
    data: { furnaceReleaseGuide: true, furnaceMissionId: missionId, parentType: 'story_prop',
      circuitMark: true, ringRadius: 28, visualRadius: 28, scannerSignalKind: 'salvage',
      scanLabel: 'CR-FEED approach: aim the marked pod into the large intake ring',
      tetherable: false, masslineTetherable: false } };
}

export function removeFurnaceArrivalScene(owner) {
  for (const entity of owner.state?.entityList || []) {
    if (entity?.alive && entity.data?.furnaceReleaseGuide) owner.helpers?.removeEntity?.(entity.id);
  }
}

export function syncFurnaceArrivalScene(owner) {
  const state = owner.state;
  if (!state || owner._restoring || !owner._adventure()) return;
  const read = furnaceDetailRead(state);
  const needGuide = read?.active && read.pending > 0;
  let guide = null;
  for (const entity of [...(state.entityList || [])]) {
    if (!entity?.alive || !entity.data?.furnaceReleaseGuide) continue;
    if (needGuide && entity.data.furnaceMissionId === read.missionId && !guide) guide = entity;
    else owner.helpers?.removeEntity?.(entity.id);
  }
  if (needGuide && !guide) owner.helpers?.spawnEntity?.(furnaceReleaseSpec(read.missionId));
  const player = state.entities?.get(state.playerId);
  if (!read || state.mode !== 'flight' || state.ui?.docked || state.player?.flags?.docked
    || !player?.alive || !Number.isFinite(player.pos?.x) || !Number.isFinite(player.pos?.z)) return;
  const hauler = sectorLocalToGlobalForSector(FURNACE_HAULER_LOCAL, FURNACE_INTAKE.sectorId);
  if (Math.hypot(player.pos.x - hauler.x, player.pos.z - hauler.z) > 700) return;
  const flags = state.story?.flags;
  if (!flags) return;
  const mark = flags.furnace_detail_visit?.version === 1
    && flags.furnace_detail_visit.missionId === read.missionId ? flags.furnace_detail_visit
      : (flags.furnace_detail_visit = { version: 1, missionId: read.missionId });
  if (Number.isFinite(mark.nextAt) && state.simTime < mark.nextAt) return;
  // One authored line at a time. Neither entering the sector nor loading a save is work.
  let id, text;
  if (read.settled && !mark.returned) {
    mark.returned = true; id = 'furnace_detail_result';
    text = `Disposal record closed: ${read.received}/3 pods received, ${read.lost} lost. ${read.rewardCr} cr recorded by the contract. The four marked mite sites are cleared; the Closed Refinery remains sealed. Ceres Refinery is the working berth. Its host can read your result.`;
  } else if (read.active && !mark.arrived) {
    mark.arrived = true; id = 'furnace_detail_arrival';
    text = `Quarantine detail identified. That old hauler has no crew. Four marked repair-mite sites and three marked ore pods are your job. The mites mend these wrecks; frag also hurts Casket worms. Keep your own freight aboard. ${furnaceHandlingLine(state)}`;
  } else if (read.active && read.cleared === 4 && read.pending > 0 && !mark.clearance) {
    mark.clearance = true; id = 'furnace_detail_clearance';
    text = `Four marked mite sites cleared. ${read.pending} quarantine ${read.pending === 1 ? 'pod remains' : 'pods remain'} outside the account. ${furnaceHandlingLine(state)} The large ring is the intake; the small ring is an approach mark. Ordinary rock burns too, but it does not settle these loads. Keep the other pods out of your swing.`;
  }
  if (text) {
    mark.nextAt = (Number(state.simTime) || 0) + 12;
    owner.bus?.emit('comms:popup', { id, sender: 'CR-FEED', category: 'story', ttl: 12, persist: true, text });
  }
}

// Called before furnace:fed, while the canonical identity still has an unreceived slot.
export function furnaceReceiptLine(state, entity) {
  const job = state?.missions?.active?.find(m => authoredFurnaceWorksite(m)
    && m.id === entity.data?.furnaceMissionId);
  if (!job || job.params.furnaceLedgerInvalid || !furnaceReceiptMatches(job, {
    entityId: entity.id, missionId: job.id, lotSlot: entity.data.furnaceLotSlot,
    sectorId: FURNACE_INTAKE.sectorId,
  }, entity)) return null;
  const read = furnaceDetailRead(state);
  if (!read) return null;
  return `Quarantine pod ${entity.data.furnaceLotSlot + 1} received. ${read.received + 1}/3 through the mouth; ${read.lost} lost outside it. ${read.cleared < 4 ? `${read.cleared}/4 marked mite sites cleared. Cargo receipt is not site clearance.` : read.pending > 1 ? 'Bring the next original pod.' : 'No marked pods remain outside the account.'}`;
}
