// Authored landmark follow-ups that use the ordinary mission board and scanner authority.
//
// This file defines only stable content and pure offer construction. Missions owns board/active
// lifecycle and settlement; world owns discovery; scanner owns the physical reading. The first
// shipped row is C6's hardened-probe return to the already-placed Caved Shaft.

export const LANDMARK_QUEST_SOURCE = 'landmarkQuest';

export const CAVED_SHAFT_PROBE = Object.freeze({
  id: 'landmark_c6_hardened_probe',
  sectorId: 'sector_hyperion_cut',
  poiId: 'poi_hyperion_driller',
  targetRef: 'landmark_c6_caved_shaft',
  stationId: 'station_hyperion_cut',
  factionId: 'faction_dmc',
  targetLocalPos: Object.freeze({ x: 240, z: -1180 }),
  maxRangeWu: 300,
  rewardCr: 640,
  artifact: Object.freeze({
    id: 'artifact_c6_shaft_return_frame',
    title: 'C6-1 · Shaft Return Frame',
    body: 'One amber-lit wall continues below the drilled cavity. The snapped auger tooth in the foreground is folded, not worn. No scale or telemetry survived the return.',
  }),
});

function discoveryRecord(state, definition) {
  return state && state.world && state.world.discovery
    && state.world.discovery[definition.sectorId]
    && state.world.discovery[definition.sectorId].pois
    && state.world.discovery[definition.sectorId].pois[definition.poiId] || null;
}

function isFound(record) {
  return !!(record && (record.investigated || record.identified || record.defeated));
}

/** Pure, migration-safe builder. A discovered source posts one stable local contract. */
export function buildLandmarkQuestOffers(state, filters = {}) {
  const definition = CAVED_SHAFT_PROBE;
  if (filters.sectorId && filters.sectorId !== definition.sectorId) return [];
  if (filters.poiId && filters.poiId !== definition.poiId) return [];
  if (filters.stationId && filters.stationId !== definition.stationId) return [];
  const record = discoveryRecord(state, definition);
  if (!isFound(record)) return [];
  if (record.landmarkArtifact && record.landmarkArtifact.id === definition.artifact.id) return [];

  return [{
    id: definition.id,
    source: LANDMARK_QUEST_SOURCE,
    sourceRef: definition.targetRef,
    type: 'recon_scan',
    stationId: definition.stationId,
    factionId: definition.factionId,
    title: 'The Caved Shaft: Hardened Probe',
    brief: 'Return to the shaft and fire one close scanner pulse to drop the hardened probe.',
    summary: 'Ordinary probes come back blank. The Cut refinery has one hardened shell and wants the exact return filed, even if it is only a frame.',
    cause: {
      tag: 'landmark:caved_shaft_probe',
      fingerprint: 'landmark:c6:hardened-probe:v1',
      line: 'The drill mast fell inward because the asteroid was hollow.',
    },
    params: {
      scanTargets: 1,
      landmarkProbe: {
        questId: definition.id,
        sectorId: definition.sectorId,
        poiId: definition.poiId,
        poiLabel: 'The Caved Shaft',
        targetRef: definition.targetRef,
        targetLocalPos: { ...definition.targetLocalPos },
        maxRangeWu: definition.maxRangeWu,
        artifact: { ...definition.artifact },
      },
    },
    reward_cr: definition.rewardCr,
    collateral_cr: 0,
    riskTier: 1,
    minRep: -1000,
    destStationId: null,
    destSectorId: definition.sectorId,
    distance: 600,
  }];
}

export function validateLandmarkQuestOffer(offer) {
  const probe = offer && offer.params && offer.params.landmarkProbe;
  const artifact = probe && probe.artifact;
  if (!offer || offer.source !== LANDMARK_QUEST_SOURCE || offer.type !== 'recon_scan') return false;
  if (offer.id !== CAVED_SHAFT_PROBE.id || offer.stationId !== CAVED_SHAFT_PROBE.stationId) return false;
  if (offer.destSectorId !== CAVED_SHAFT_PROBE.sectorId || offer.factionId !== CAVED_SHAFT_PROBE.factionId) return false;
  if (!offer.cause || offer.cause.fingerprint !== 'landmark:c6:hardened-probe:v1') return false;
  if (!probe || probe.questId !== offer.id || probe.sectorId !== offer.destSectorId) return false;
  if (probe.poiId !== CAVED_SHAFT_PROBE.poiId || probe.targetRef !== CAVED_SHAFT_PROBE.targetRef) return false;
  if (!probe.targetLocalPos || !Number.isFinite(probe.targetLocalPos.x) || !Number.isFinite(probe.targetLocalPos.z)) return false;
  if (!(Number(probe.maxRangeWu) > 0 && Number(probe.maxRangeWu) <= 300)) return false;
  if (!artifact || artifact.id !== CAVED_SHAFT_PROBE.artifact.id || !artifact.title || !artifact.body) return false;
  return offer.params.scanTargets === 1
    && Number(offer.reward_cr) === CAVED_SHAFT_PROBE.rewardCr
    && Number(offer.collateral_cr) === 0
    && Number(offer.riskTier) === 1;
}

export default CAVED_SHAFT_PROBE;
