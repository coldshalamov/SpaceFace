// Milestone-4 causal contracts: a pure adapter from durable POI aftermath to the normal mission
// board shape. This module owns no state and emits nothing; missions remains the board/lifecycle
// authority and livingPoiBehaviors remains the aftermath authority.

import { hash32 } from '../core/rng.js';
import { sectorLocalToGlobalForSector, sectorGlobalOrigin } from '../data/sectorCoordinates.js';
import { SECTORS } from '../data/sectors.js';

export const POI_CAUSAL_BOARD_CAP = 4;

const SECTOR_BY_ID = new Map(SECTORS.map((sector) => [sector.id, sector]));
const STATION_TO_SECTOR = new Map();
for (const sector of SECTORS) {
  for (const station of sector.stations || []) STATION_TO_SECTOR.set(station.id, sector.id);
}

function choose(list, key) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[hash32(key) % list.length];
}

function stableToken(...parts) {
  return hash32(...parts).toString(36);
}

function finitePos(pos) {
  return !!pos && Number.isFinite(pos.x) && Number.isFinite(pos.z);
}

/**
 * Build one complete, deterministic station-board offer from a resolved living-POI aftermath.
 * Identity is keyed by save seed + aftermath fingerprint; graph/list ordering is normalized.
 */
export function buildPoiCausalOffer({
  seed = 1,
  aftermath,
  stationId = null,
  factionId = null,
  zoneName = null,
} = {}) {
  if (!aftermath || !aftermath.fingerprint || !aftermath.sectorId) return null;
  const sourceSector = SECTOR_BY_ID.get(aftermath.sectorId);
  if (!sourceSector) return null;
  const fingerprint = String(aftermath.fingerprint);
  const key = `${seed}:${fingerprint}`;
  const neighbors = (sourceSector.neighbors || [])
    .filter((id) => SECTOR_BY_ID.has(id))
    .slice()
    .sort();
  const destSectorId = choose(neighbors, `${key}:destination`);
  if (!destSectorId) return null;
  const destination = SECTOR_BY_ID.get(destSectorId);
  const originStations = (sourceSector.stations || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const resolvedStationId = STATION_TO_SECTOR.get(stationId) === sourceSector.id
    ? stationId
    : choose(originStations, `${key}:origin-station`)?.id;
  if (!resolvedStationId) return null;

  const targetType = aftermath.familyId === 'anomaly_research' ? 'anomaly' : 'wreck';
  const angleUnit = hash32(key, 'target-angle') / 0x100000000;
  const radiusUnit = hash32(key, 'target-radius') / 0x100000000;
  const angle = angleUnit * Math.PI * 2;
  const radius = 720 + radiusUnit * 320;
  const targetPos = sectorLocalToGlobalForSector({
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
  }, destSectorId);
  const recordToken = stableToken(seed, fingerprint, 'target-record');
  const targetRecordId = `poicr:${destSectorId}:${recordToken}`;
  const offerId = `poi_offer:${stableToken(seed, fingerprint, 'offer')}`;
  const tier = Math.max(0, Number(destination.tier) || 0);
  const familyLabel = targetType === 'anomaly' ? 'signal' : 'registry fragment';
  const sourceName = zoneName || aftermath.zoneId || 'resolved site';
  const origin = sectorGlobalOrigin(sourceSector.id);
  const dest = sectorGlobalOrigin(destSectorId);
  const distance = Math.max(600, Math.round(Math.hypot(dest.x - origin.x, dest.z - origin.z)));

  return {
    id: offerId,
    source: 'poiBehavior',
    type: 'recon_scan',
    stationId: resolvedStationId,
    factionId: factionId || sourceSector.factionId || null,
    title: `${sourceName}: follow the ${familyLabel}`,
    summary: `The resolved site points into ${destination.name}. Classify and physically investigate the exact return.`,
    cause: {
      tag: `poi:${aftermath.familyId || 'resolved_site'}`,
      fingerprint,
      behaviorId: aftermath.behaviorId || null,
      line: aftermath.cause || null,
      outcome: aftermath.outcome || null,
    },
    params: {
      scanTargets: 1,
      poiBehaviorId: aftermath.behaviorId || null,
      zoneId: aftermath.zoneId || null,
      required: 1,
      poiSignalFollowup: {
        targetRecordId,
        targetType,
        targetLabel: targetType === 'anomaly' ? 'Linked anomaly' : 'Linked derelict',
        destSectorId,
        targetPos,
        team: 2,
        entityId: null,
      },
    },
    reward_cr: 420 + tier * 180,
    collateral_cr: 0,
    riskTier: Math.max(1, tier),
    // The player already earned this lead by resolving its exact source site. Do not turn the
    // causal chain into an unrelated standing grind at the board acceptance boundary.
    minRep: -1000,
    destStationId: null,
    destSectorId,
    distance,
    expiresAtEpoch: Math.max(1, (Number(aftermath.resolvedDay) || 0) + 4),
  };
}

/** Fail-closed validation used at the missions authority boundary. */
export function validatePoiCausalOffer(offer) {
  if (!offer || typeof offer !== 'object') return { ok: false, reason: 'bad_offer' };
  if (offer.source !== 'poiBehavior' || offer.type !== 'recon_scan') {
    return { ok: false, reason: 'bad_source_type' };
  }
  if (!offer.id || !offer.stationId || !offer.title || !offer.summary || !offer.params) {
    return { ok: false, reason: 'bad_offer_shape' };
  }
  const sourceSectorId = STATION_TO_SECTOR.get(offer.stationId);
  const sourceSector = SECTOR_BY_ID.get(sourceSectorId);
  const destination = SECTOR_BY_ID.get(offer.destSectorId);
  if (!sourceSector || !destination || !(sourceSector.neighbors || []).includes(destination.id)) {
    return { ok: false, reason: 'destination_not_connected' };
  }
  if (!offer.cause || !offer.cause.fingerprint || !offer.cause.behaviorId) {
    return { ok: false, reason: 'missing_cause' };
  }
  const follow = offer.params.poiSignalFollowup;
  if (!follow || !follow.targetRecordId || !['wreck', 'anomaly'].includes(follow.targetType)) {
    return { ok: false, reason: 'bad_signal_target' };
  }
  if (follow.destSectorId !== offer.destSectorId || follow.team !== 2 || !finitePos(follow.targetPos)) {
    return { ok: false, reason: 'bad_signal_identity' };
  }
  if (offer.params.scanTargets !== 1 || Number(offer.minRep) !== -1000
    || !(Number(offer.reward_cr) >= 0)
    || !(Number(offer.collateral_cr) >= 0) || !Number.isFinite(Number(offer.riskTier))) {
    return { ok: false, reason: 'bad_mission_terms' };
  }
  return { ok: true };
}
