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
  minRep: -1000,
  riskTier: 1,
  title: 'The Caved Shaft: Hardened Probe',
  brief: 'Return to the shaft and fire one close scanner pulse to drop the hardened probe.',
  summary: 'Ordinary probes come back blank. The Cut refinery has one hardened shell and wants the exact return filed, even if it is only a frame.',
  causeTag: 'landmark:caved_shaft_probe',
  causeFingerprint: 'landmark:c6:hardened-probe:v1',
  causeLine: 'The drill mast fell inward because the asteroid was hollow.',
  successText: 'Return frame filed. The probe brought back one image and no telemetry; the shaft remains unexplained.',
  artifact: Object.freeze({
    id: 'artifact_c6_shaft_return_frame',
    title: 'C6-1 · Shaft Return Frame',
    body: 'One amber-lit wall continues below the drilled cavity. The snapped auger tooth in the foreground is folded, not worn. No scale or telemetry survived the return.',
  }),
});

export const SHARD_SPHERE_SONG = Object.freeze({
  id: 'landmark_c9_reconstruct_song',
  sectorId: 'sector_phoebe_echo',
  poiId: 'poi_phoebe_echo',
  targetRef: 'landmark_c9_shard_sphere',
  stationId: 'station_phoebe_echo',
  factionId: 'faction_vael',
  targetLocalPos: Object.freeze({ x: 280, z: -960 }),
  maxRangeWu: 300,
  requiredSignalScans: 4,
  rewardCr: 1800,
  minRep: 150,
  riskTier: 2,
  title: 'The Shard Sphere: Reconstruct the Song',
  brief: 'Return to the sphere and fire one close scanner pulse while the Echo Shrine aligns the four recovered fragments.',
  summary: 'Four remembered notes now agree on the shape of the Vael schism. Trusted pilots may let the shrine play them as one sequence.',
  causeTag: 'landmark:shard_sphere_song',
  causeFingerprint: 'landmark:c9:reconstruct-song:v1',
  causeLine: 'Four shards remember enough of the schism to reconstruct the unfinished song.',
  successText: 'The four fragments resolve into one unfinished phrase. The Echo Shrine files your reconstruction and the Vael answer with payment, not explanation.',
  artifact: Object.freeze({
    id: 'artifact_c9_reconstructed_schism_song',
    title: 'C9-5 · Reconstructed Schism Song',
    body: 'Four shard-notes align into a phrase that ends before its answer. The shrine identifies the silence as part of the composition: the Vael schism removed a voice, not merely a faction.',
  }),
});

const LANDMARK_QUESTS = Object.freeze([CAVED_SHAFT_PROBE, SHARD_SPHERE_SONG]);
const LANDMARK_QUEST_BY_ID = new Map(LANDMARK_QUESTS.map((definition) => [definition.id, definition]));

function discoveryRecord(state, definition) {
  return state && state.world && state.world.discovery
    && state.world.discovery[definition.sectorId]
    && state.world.discovery[definition.sectorId].pois
    && state.world.discovery[definition.sectorId].pois[definition.poiId] || null;
}

function isFound(record) {
  return !!(record && (record.investigated || record.identified || record.defeated));
}

function signalScanCount(state, definition) {
  const stableId = `signal:poi:${definition.poiId}`;
  const record = state && state.signalInvestigation && state.signalInvestigation.records
    && state.signalInvestigation.records[stableId];
  return Math.max(0, Math.trunc(Number(record && record.scanCount) || 0));
}

function questReady(state, definition) {
  if (definition.requiredSignalScans) {
    return signalScanCount(state, definition) >= definition.requiredSignalScans;
  }
  return isFound(discoveryRecord(state, definition));
}

function questComplete(state, definition) {
  const record = discoveryRecord(state, definition);
  return !!(record && record.landmarkArtifact
    && record.landmarkArtifact.id === definition.artifact.id);
}

function buildOffer(definition) {
  return {
    id: definition.id,
    source: LANDMARK_QUEST_SOURCE,
    sourceRef: definition.targetRef,
    type: 'recon_scan',
    stationId: definition.stationId,
    factionId: definition.factionId,
    title: definition.title,
    brief: definition.brief,
    summary: definition.summary,
    cause: {
      tag: definition.causeTag,
      fingerprint: definition.causeFingerprint,
      line: definition.causeLine,
    },
    params: {
      scanTargets: 1,
      landmarkProbe: {
        questId: definition.id,
        sectorId: definition.sectorId,
        poiId: definition.poiId,
        poiLabel: definition.poiId === CAVED_SHAFT_PROBE.poiId ? 'The Caved Shaft' : 'The Shard Sphere',
        targetRef: definition.targetRef,
        targetLocalPos: { ...definition.targetLocalPos },
        maxRangeWu: definition.maxRangeWu,
        artifact: { ...definition.artifact },
        successText: definition.successText,
      },
    },
    reward_cr: definition.rewardCr,
    collateral_cr: 0,
    riskTier: definition.riskTier,
    minRep: definition.minRep,
    destStationId: null,
    destSectorId: definition.sectorId,
    distance: 600,
  };
}

/** Pure, migration-safe builder. A discovered source posts one stable local contract. */
export function buildLandmarkQuestOffers(state, filters = {}) {
  return LANDMARK_QUESTS.filter((definition) => (
    (!filters.sectorId || filters.sectorId === definition.sectorId)
    && (!filters.poiId || filters.poiId === definition.poiId)
    && (!filters.stationId || filters.stationId === definition.stationId)
    && questReady(state, definition)
    && !questComplete(state, definition)
  )).map(buildOffer);
}

export function validateLandmarkQuestOffer(offer) {
  const definition = offer && LANDMARK_QUEST_BY_ID.get(offer.id);
  const probe = offer && offer.params && offer.params.landmarkProbe;
  const artifact = probe && probe.artifact;
  if (!definition || offer.source !== LANDMARK_QUEST_SOURCE || offer.type !== 'recon_scan') return false;
  if (offer.stationId !== definition.stationId) return false;
  if (offer.destSectorId !== definition.sectorId || offer.factionId !== definition.factionId) return false;
  if (!offer.cause || offer.cause.fingerprint !== definition.causeFingerprint) return false;
  if (!probe || probe.questId !== offer.id || probe.sectorId !== offer.destSectorId) return false;
  if (probe.poiId !== definition.poiId || probe.targetRef !== definition.targetRef) return false;
  if (!probe.targetLocalPos || !Number.isFinite(probe.targetLocalPos.x) || !Number.isFinite(probe.targetLocalPos.z)) return false;
  if (!(Number(probe.maxRangeWu) > 0 && Number(probe.maxRangeWu) <= 300)) return false;
  if (!artifact || artifact.id !== definition.artifact.id || !artifact.title || !artifact.body) return false;
  return offer.params.scanTargets === 1
    && Number(offer.reward_cr) === definition.rewardCr
    && Number(offer.collateral_cr) === 0
    && Number(offer.riskTier) === definition.riskTier
    && Number(offer.minRep) === definition.minRep;
}

export default CAVED_SHAFT_PROBE;
