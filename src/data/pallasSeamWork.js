import { SECTOR_ANCHORS } from './sectorAnchors.js';
import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';
import { stableRecordId, RECORD_KIND } from '../world/worldRecords.js';
export const PALLAS_SEAM = Object.freeze({ sector: 'sector_pallas_drift', field: 'f_pallas_1',
  miner: 'pallas_seam_miner', surveyor: 'pallas_seam_surveyor' });
export function pallasSeamCenter() {
  return sectorLocalToGlobalForSector(SECTOR_ANCHORS[PALLAS_SEAM.sector].fields.find(f => f.id === PALLAS_SEAM.field).center, PALLAS_SEAM.sector);
}
export function pallasSeamRecordRole(state, entry) {
  if (entry?.sectorId !== PALLAS_SEAM.sector) return null;
  for (const [role, slot] of [['miner', PALLAS_SEAM.miner], ['surveyor', PALLAS_SEAM.surveyor]]) {
    const id = stableRecordId(state.meta?.seed || 1, PALLAS_SEAM.sector, RECORD_KIND.CONVOY, `pallas:activity:${slot}`);
    if (entry.worldRecordId === id && entry.job?.id === `job:${id}`) return role;
  }
  return null;
}
export function pallasSeamRole(state, entity) {
  const slot = entity?.data?.activityActorSlotId;
  if (![PALLAS_SEAM.miner, PALLAS_SEAM.surveyor].includes(slot)) return null;
  const record = stableRecordId(state.meta?.seed || 1, PALLAS_SEAM.sector, RECORD_KIND.CONVOY, `pallas:activity:${slot}`);
  return entity.type === 'ship' && entity.hull > 0 && entity.alive !== false && entity.data.defId === 'ship_pelican'
    && !(state.entityList || []).some(other => other !== entity && other.alive !== false && other.data?.worldRecordId === record)
    && entity.data.worldRecordId === record && entity.data.authoredActivityCast === true
    && entity.data.identityKey === `pallas:activity:${slot}` && entity.data.homeSectorId === PALLAS_SEAM.sector
    && state.world?.currentSectorId === PALLAS_SEAM.sector && state.entities?.get(entity.id) === entity
    ? (slot === PALLAS_SEAM.miner ? 'miner' : 'surveyor') : null;
}
export function pallasSeamInfoLine(entity, state) {
  const role = pallasSeamRole(state, entity);
  if (!role) return null;
  const entry = state.npcJobs?.byId?.[entity.data.jobId];
  if (!entry || entry.entityId !== entity.id || entry.worldRecordId !== entity.data.worldRecordId
    || entry.job?.id !== entity.data.jobId || pallasSeamRecordRole(state, entry) !== role) return 'Independent Seam · Work unavailable';
  if (entry.job.phase === 'flee') return 'Independent Seam · Work interrupted · Avoiding danger';
  if (entry.control || entry.towAssist) return 'Independent Seam · Work paused · Vessel assigned elsewhere';
  if (role === 'miner') {
    if (entry.job.payload?.pallasSeamFinished === true) return 'Independent Seam · Cut finished · Loose ore released';
    if (entry.job.payload?.pallasSeamWaiting === true) return 'Independent Seam · No workable metallic source available';
    if (entry.job.payload?.pallasSeamUnavailable === true) return 'Independent Seam · Source lost or depleted · Work stopped';
    if (Number.isInteger(entity.data.pallasSeamStandbyTick) && state.tick >= entity.data.pallasSeamStandbyTick
      && state.tick - entity.data.pallasSeamStandbyTick <= 2) return 'Independent Seam · Standing by at workface';
    return entity.data.minerShiftActive === true ? 'Independent Seam · Cutting metallic ore · Releasing loose ore'
      : 'Independent Seam · Approaching metallic workface';
  }
  const now = state.simTime || 0;
  const mark = state.npcJobs?.surveyMarks?.[PALLAS_SEAM.sector]?.filter(m => m.fieldId === PALLAS_SEAM.field
    && Number.isFinite(m.depletion) && m.depletion >= 0 && m.depletion <= 1 && Number.isFinite(m.measuredAt) && now >= m.measuredAt && now - m.measuredAt <= 420).sort((a, b) => b.measuredAt - a.measuredAt)[0];
  return mark ? `Independent Seam · Field report · ${Math.round(mark.depletion * 100)}% depleted · ${Math.floor(now - mark.measuredAt)}s ago`
    : 'Independent Seam · Survey in progress · No fresh field reading';
}
