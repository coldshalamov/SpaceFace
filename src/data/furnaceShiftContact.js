// Jorah of the Seam Haul keeps to the living freight loop; the quarantine hulk is not his
// ship. When the player hails him he answers with one place line and the worksite's own
// slip read — never more than eight words an outcome, never a cargo or mission mutation.
import { furnaceDetailRead } from '../missions/furnaceArrivalScene.js';

/** The one authored Ceres freight hauler who will talk about the closed refinery. Every
 *  check mirrors the traffic/npcJobs records the hull already carries — no new stamp. */
export function furnaceObserver(state, entity) {
  const data = entity?.data, player = state?.entities?.get(state.playerId);
  if (state?.mode !== 'flight' || state.ui?.docked || state.world?.currentSectorId !== 'sector_ceres_belt'
    || (state.run?.kind && !['adventure', 'campaign'].includes(state.run.kind))
    || state.player?.targetId !== entity?.id || !Number.isSafeInteger(entity?.occupantGeneration)
    || entity.occupantGeneration < 1 || !player?.alive || !entity?.alive || entity.type !== 'ship'
    || entity.team !== 2 || state.entities.get(entity.id) !== entity
    || data?.namedLaneContactId !== 'lane_jorah_seam_haul'
    || data.activityActorSlotId !== 'ceres_refinery_hauler'
    || typeof data.worldRecordId !== 'string' || data.jobId !== `job:${data.worldRecordId}`
    || !Number.isFinite(player.pos?.x) || !Number.isFinite(player.pos?.z)
    || !Number.isFinite(entity.pos?.x) || !Number.isFinite(entity.pos?.z)
    || Math.hypot(player.pos.x - entity.pos.x, player.pos.z - entity.pos.z) > 900) return null;
  const entry = state.npcJobs?.byId?.[data.jobId];
  const traffic = state.traffic?.freighters?.find(row => row.id === entity.id);
  if (!traffic || traffic.role !== 'hauler' || entry?.entityId !== entity.id
    || entry.worldRecordId !== data.worldRecordId || entry.job?.id !== data.jobId
    || entry.job.kind !== 'hauler' || entry.job.materialized !== true || entry.job.corrupt
    || entry.control || entry.towAssist) return null;
  return { worldRecordId: data.worldRecordId, generation: entity.occupantGeneration };
}

/** Two lines, each eight words or fewer: the place, then the slip's own numbers. A
 *  missing or malformed record reads as no-slip, never as zero progress. */
export function furnaceObserverReply(state, entity, offer) {
  const identity = furnaceObserver(state, entity);
  if (!identity || !(offer?.expiresAt > state.simTime)
    || identity.worldRecordId !== offer.furnaceObserver?.worldRecordId
    || identity.generation !== offer.furnaceObserver.generation) return null;
  const read = furnaceDetailRead(state);
  const place = 'JORAH · The hulk is not my ship.';
  if (!read) return [place, 'No valid slip under your name.'];
  if (read.pending) return [place, `SLIP · ${read.received}/3 IN · ${read.lost} LOST · ${read.pending} OUT`];
  return [place, read.lost
    ? `SLIP · ${read.received}/3 IN · ${read.lost} LOST — losses aren't deliveries.`
    : `SLIP · ${read.received}/3 IN — account closed.`];
}
