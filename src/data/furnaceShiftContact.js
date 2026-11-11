// Jorah belongs to the living freight loop, never the forty-year-old quarantine hulk.
import { furnaceDetailRead } from '../missions/furnaceArrivalScene.js';

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

export function furnaceObserverReply(state, entity, offer) {
  const identity = furnaceObserver(state, entity);
  if (!identity || !(offer?.expiresAt > state.simTime)
    || identity.worldRecordId !== offer.furnaceObserver?.worldRecordId
    || identity.generation !== offer.furnaceObserver.generation) return null;
  const read = furnaceDetailRead(state);
  const place = 'JORAH · The quarantined hulk is not my ship. My freight goes to the working refinery. The Closed Refinery was sealed forty years ago; its mites are still repairing the remains.';
  if (!read) return [place, 'I cannot read a valid disposal slip for you. Keep our freight separate from that old cargo.'];
  return [place,
    `YOUR SLIP · ${read.received}/3 received, ${read.lost} lost, ${read.pending} outstanding. ${read.cleared}/4 marked mite sites cleared.`,
    read.pending ? 'Only the three marked quarantine pods settle your disposal. Ordinary rock burns, but does not settle those loads.'
      : read.lost ? 'Those losses are not deliveries. The account records which pods burned and which were lost.'
        : 'All three are recorded received. That closes the cargo account, not the whole refinery for occupation.'];
}
