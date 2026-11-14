// The worksite's own record read to the player: one short arrival line (the mouth beacon,
// shoulder guide and scan labels already carry the physical marks — no second marker), and
// the shared real-record projection Jorah and the refinery host read their lines from.
// The only durable write here is the once-per-job arrival mark on story flags.
import { FURNACE_INTAKE } from '../data/furnace.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { authoredFurnaceWorksite, furnaceMiteClearance, furnaceReceiptMatches,
  FURNACE_HAULER_LOCAL } from './furnaceWorksite.js';
import { normalizeFurnaceAftermath } from './furnaceWorksiteRuntime.js';

/** One projection of the worksite's finite record: active job first, then its settled
 *  aftermath. Returns null when no single valid record can be proven — never a
 *  zero-progress reset and never a minted ledger. */
export function furnaceDetailRead(state) {
  const jobs = (state?.missions?.active || []).filter(authoredFurnaceWorksite);
  if (jobs.length > 1) return null;
  const job = jobs[0];
  const raw = job
    ? { version: 1, missionId: job.id, lots: job.params.furnaceLots,
        invalid: job.params.furnaceLedgerInvalid }
    : state?.missions?.furnaceWorksiteAftermath;
  const record = normalizeFurnaceAftermath(raw);
  if (!record || record.invalid) return null;
  const received = record.lots.filter(lot => lot.received).length;
  const lost = record.lots.filter(lot => lot.lost && !lot.received).length;
  const receipts = (Array.isArray(state?.missions?.receipts) ? state.missions.receipts : [])
    .filter(row => row?.missionId === record.missionId);
  const receipt = receipts.length === 1 ? receipts[0] : null;
  const cleared = furnaceMiteClearance(state).length;
  const settled = !job && cleared === 4 && received + lost === 3
    && receipt?.id === `${record.missionId}:completed`
    && receipt.outcome === 'completed' && receipt.type === 'patrol_clear'
    && receipt.factionId === 'faction_dmc' && receipt.destStationId === 'station_ceres'
    && receipt.destSectorId === FURNACE_INTAKE.sectorId
    && Number.isFinite(state?.simTime) && Number.isFinite(receipt.at_s)
    && receipt.at_s >= 0 && receipt.at_s <= state.simTime
    && Number.isFinite(receipt.rewardCr) && receipt.rewardCr >= 0;
  const dead = state?.world?.alienEcology?.sites?.closed_refinery?.deadFauna;
  const casketLosses = [0, 1, 2].filter(i => dead?.[`closed_refinery:casket_worm:${i}`] === true).length;
  return { missionId: record.missionId, active: !!job, settled: !!settled,
    received, lost, pending: 3 - received - lost, cleared, casketLosses,
    rewardCr: settled ? receipt.rewardCr : null };
}

/** One line per job, when the player first closes on the worksite. The physical marks —
 *  mouth ring, lot scan labels, mite marks — already exist; this is only the voice that
 *  names them. A restored session keeps the heard mark, so Continue never re-announces. */
export function noteFurnaceArrival(owner) {
  const state = owner.state, flags = state?.story?.flags;
  if (!flags || owner._restoring) return;
  const heard = flags.furnace_detail_arrival;
  if (typeof heard === 'string'
      && state.missions?.active?.some(m => m.id === heard)) return;
  const read = furnaceDetailRead(state);
  if (!read?.active || flags.furnace_detail_arrival === read.missionId) return;
  if (state.mode !== 'flight' || state.ui?.docked) return;
  const player = state.entities?.get(state.playerId);
  if (!player?.alive || !Number.isFinite(player.pos?.x) || !Number.isFinite(player.pos?.z)) return;
  const hauler = sectorLocalToGlobalForSector(FURNACE_HAULER_LOCAL, FURNACE_INTAKE.sectorId);
  if (Math.hypot(player.pos.x - hauler.x, player.pos.z - hauler.z) > 700) return;
  flags.furnace_detail_arrival = read.missionId;
  owner.bus?.emit('comms:popup', {
    id: 'furnace_detail_arrival', sender: 'CR-FEED', category: 'story', ttl: 10, persist: true,
    text: 'CR-FEED: quarantine worksite. The hulk has no crew — clear four marked mite sites, then burn three marked pods.',
  });
}

/** The intake's popup for a validated marked pod — the real receipt instead of the
 *  generic burn line. Called before `furnace:fed`, while the canonical identity still
 *  has an unreceived slot; returns null for anything the mission will not settle. */
export function furnaceReceiptLine(state, entity) {
  const job = (state?.missions?.active || []).find(m => authoredFurnaceWorksite(m)
    && m.id === entity.data?.furnaceMissionId);
  if (!job || job.params.furnaceLedgerInvalid || !furnaceReceiptMatches(job, {
    entityId: entity.id, missionId: job.id, lotSlot: entity.data.furnaceLotSlot,
    sectorId: FURNACE_INTAKE.sectorId,
  }, entity)) return null;
  const read = furnaceDetailRead(state);
  if (!read) return null;
  return `CR-FEED: quarantine pod ${entity.data.furnaceLotSlot + 1} received — ${read.received + 1}/3 through the mouth${read.lost ? `; ${read.lost} lost outside it` : ''}.`;
}
