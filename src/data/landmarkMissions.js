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
  poiLabel: 'The Caved Shaft',
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
  poiLabel: 'The Shard Sphere',
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

// PQ-048.14: this is deliberately a return survey, not another way to reveal the Obelisk. The
// ordinary physical investigation remains the sole writer of the discovery Doss later reads.
export const RESONANCE_OBELISK_SURVEY = Object.freeze({
  id: 'landmark_c2_resonance_survey',
  sectorId: 'sector_veil_nebula',
  poiId: 'poi_anomaly',
  targetRef: 'landmark_c2_resonance_obelisk',
  stationId: 'station_veil',
  factionId: null,
  targetLocalPos: Object.freeze({ x: 0, z: 0 }),
  maxRangeWu: 300,
  poiLabel: 'The Resonance Obelisk',
  signalKind: 'anomaly',
  requiresPhysicalInvestigation: true,
  rewardCr: 0,
  minRep: -1000,
  riskTier: 2,
  title: 'The Resonance Obelisk: Quiet Survey',
  brief: 'Return to the Obelisk and take one close reading. Every extra pulse brings the Vael watch forward.',
  summary: 'Research Station Veil will file one clean field record, not a salvage claim. Take the required close reading, or stay for extra pulses that bring the Vael watch forward.',
  causeTag: 'landmark:resonance_obelisk_survey',
  causeFingerprint: 'landmark:c2:resonance-survey:v1',
  causeLine: 'The Obelisk has already answered three bearings. One close reading can preserve the pattern without claiming to own it.',
  successText: 'Survey filed. The pattern remains at Veil as a field record, not a claim.',
  artifact: Object.freeze({
    id: 'artifact_c2_resonance_obelisk_survey_log',
    title: 'C2-5 · Obelisk Survey Log',
    body: 'A close reading resolves the Obelisk into intervals rather than a message. The next pulse is shorter than the last; the gaps are the only part that remains still.',
  }),
});

export const QUIESSENCE_CENSUS = Object.freeze({
  id: 'landmark_c14_quiessence_census',
  sectorId: 'sector_pallas_drift',
  poiId: 'poi_quiessence',
  targetRef: 'landmark_c14_quiessence',
  stationId: 'station_drift',
  factionId: 'faction_mts',
  // The memorial sits at a generated site; missions resolve the live POI entity first and
  // only fall back to this sector-center coordinate when the sector is not resident.
  targetLocalPos: Object.freeze({ x: 0, z: 0 }),
  maxRangeWu: 300,
  poiLabel: 'The Quiessence',
  requiredSurveyedHulls: 17,
  rewardCr: 2200,
  minRep: 50,
  riskTier: 2,
  title: 'The Quiessence: File the Census',
  brief: 'Return to the formation and fire one close scanner pulse while the Drift archive records all seventeen hull counts.',
  summary: 'Seventeen hulls, seventeen living-crew counts, no two alike. Drift Market pays for the full filed record, not an explanation.',
  causeTag: 'landmark:quiessence_census',
  causeFingerprint: 'landmark:c14:quiessence-census:v1',
  causeLine: 'Seventeen hulls hold formation around one violet buoy and every bunk is warm.',
  successText: 'Census filed. Seventeen counts agree on nothing except the formation; the archive pays for the record and asks no questions.',
  artifact: Object.freeze({
    id: 'artifact_c14_quiessence_census_record',
    title: 'C14-5 · Quiessence Census Record',
    body: 'Seventeen intact freighters, seventeen living-crew counts from zero to sixteen, every bunk warm, no transmitter answering by name. The buoy counts seventeen.',
  }),
});

// C13d — the Reach fortress on the Sker Bazaar approach. The Bazaar sells the raid stories its
// walls are welded from; a close plate-by-plate archive read is the only provenance it accepts.
export const SKERRIS_THRONE_PROVENANCE = Object.freeze({
  id: 'landmark_c13d_trophy_provenance',
  sectorId: 'sector_sker_haven',
  poiId: 'poi_sker_throne',
  targetRef: 'landmark_c13d_skerris_throne',
  stationId: 'station_sker',
  factionId: 'faction_reach',
  targetLocalPos: Object.freeze({ x: 300, z: -550 }),
  maxRangeWu: 300,
  poiLabel: 'The Skerris Throne',
  rewardCr: 2600,
  minRep: -1000,
  riskTier: 3,
  title: 'The Skerris Throne: Trophy Provenance',
  brief: 'Hold close along the fortress wall and fire one scanner pass deep enough to read the welded plate registries.',
  summary: 'Every wall of the Throne was once somebody else\'s hull, and the Bazaar sells those stories by the plate. The broker pays for a registry read done at the wall, not one invented on the berth.',
  causeTag: 'landmark:skerris_trophy_provenance',
  causeFingerprint: 'landmark:c13d:trophy-provenance:v1',
  causeLine: 'The Throne\'s walls answer the archive scan with three dead registries and one blank plate.',
  successText: 'Provenance filed. Three plate walls resolved to hull registries; the broker paid without asking which story got more expensive.',
  artifact: Object.freeze({
    id: 'artifact_c13d_trophy_provenance_ledger',
    title: 'C13d-2 · Trophy Provenance Ledger',
    body: 'The close pass returns three readable registries — a mule line-hauler, a Vael cutter, a drifter nobody claimed — and one plate that answers no registry at all. It is newer than the wall around it, and welded blank on purpose.',
  }),
});

// C12 — the eight-second sweep the Quiet schedule their crossings inside of. Margin Fence does
// not want the beam explained; it wants the off-beat window timed by something that sat inside it.
export const METRONOME_OFFBEAT_WINDOW = Object.freeze({
  id: 'landmark_c12_offbeat_window',
  sectorId: 'sector_eris_margin',
  poiId: 'poi_eris_metronome',
  targetRef: 'landmark_c12_metronome',
  stationId: 'station_eris_margin',
  factionId: 'faction_quiet',
  // The Metronome sits at a generated site; missions resolve the live POI entity first and
  // only fall back to this sector-center coordinate when the sector is not resident.
  targetLocalPos: Object.freeze({ x: 0, z: 0 }),
  maxRangeWu: 300,
  poiLabel: 'The Metronome',
  rewardCr: 1900,
  minRep: -1000,
  riskTier: 2,
  title: 'The Metronome: Off-Beat Window',
  brief: 'Sit inside the sweep and fire one close scanner pulse so the recorder catches a full eight-second cycle from under the beam.',
  summary: 'Navigators calibrate to the Metronome; the Fence sells the gap between its returns. Margin pays for one cycle timed from inside the sweep, not for a copy of the shipping schedules it already keeps.',
  causeTag: 'landmark:metronome_offbeat_window',
  causeFingerprint: 'landmark:c12:offbeat-window:v1',
  causeLine: 'The recorder rode the sweep for one cycle and caught the eighth second coming up short.',
  successText: 'Window filed. The Fence paid the moment the file confirmed the beam does not keep perfect time.',
  artifact: Object.freeze({
    id: 'artifact_c12_offbeat_window_record',
    title: 'C12-2 · Metronome Off-Beat Window',
    body: 'One full cycle from under the beam: 8.00 seconds, except the eighth, which runs short by a fixed hair. The gap has been narrowing on every recorded pass. Quiet\'s crossing logs cluster inside it.',
  }),
});

// C11 — the ring that outlived its star. The Directorate's Sedna post files readings; it pays
// for one clean pass on the dormant city grid, filed as a record, never a claim.
export const RINGWORLD_GRID_READING = Object.freeze({
  id: 'landmark_c11_grid_reading',
  sectorId: 'sector_sedna_dark',
  poiId: 'poi_sedna_ringworld',
  targetRef: 'landmark_c11_ringworld_arc',
  stationId: 'station_sedna',
  factionId: 'faction_helix',
  // The Arc sits at a generated site; missions resolve the live POI entity first and
  // only fall back to this sector-center coordinate when the sector is not resident.
  targetLocalPos: Object.freeze({ x: 0, z: 0 }),
  maxRangeWu: 300,
  poiLabel: 'The Ringworld Arc',
  rewardCr: 2100,
  minRep: -1000,
  riskTier: 2,
  title: 'The Ringworld Arc: Grid Reading',
  brief: 'Bring the reader inside the arc\'s shadow and fire one close scanner pulse across the interior face.',
  summary: 'The dead rivers and the cycling city lights have outlived their star, and the Directorate\'s rim post wants to know what still answers. One clean field record, taken from inside the arc, filed correctly.',
  causeTag: 'landmark:ringworld_grid_reading',
  causeFingerprint: 'landmark:c11:grid-reading:v1',
  causeLine: 'One street of the dead city answered the reader before the record could close.',
  successText: 'Reading filed. The post logged the street that lit as an equipment anomaly; the record says otherwise.',
  artifact: Object.freeze({
    id: 'artifact_c11_grid_reading_record',
    title: 'C11-2 · Ringworld Grid Reading',
    body: 'The close pass crosses a dry river basin and one street of the dead city lights beneath it, briefly, while the reader holds inside the shadow. The batteries answer after eighty million years — slowly, like something waking.',
  }),
});

const LANDMARK_QUESTS = Object.freeze([
  CAVED_SHAFT_PROBE,
  SHARD_SPHERE_SONG,
  RESONANCE_OBELISK_SURVEY,
  QUIESSENCE_CENSUS,
  SKERRIS_THRONE_PROVENANCE,
  METRONOME_OFFBEAT_WINDOW,
  RINGWORLD_GRID_READING,
]);
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

function hasPhysicalInvestigation(record) {
  return !!(record
    && record.discovered === true
    && record.identified === true
    && record.investigated === true
    // This is raw durable state, not a display value: zero is a valid legacy sim timestamp,
    // while coercible strings and negative/non-finite values must fail closed.
    && typeof record.investigatedAt === 'number'
    && Number.isFinite(record.investigatedAt)
    && record.investigatedAt >= 0);
}

function signalScanCount(state, definition) {
  const stableId = `signal:poi:${definition.poiId}`;
  const record = state && state.signalInvestigation && state.signalInvestigation.records
    && state.signalInvestigation.records[stableId];
  return Math.max(0, Math.trunc(Number(record && record.scanCount) || 0));
}

function questReady(state, definition) {
  const record = discoveryRecord(state, definition);
  if (definition.requiresPhysicalInvestigation) {
    return hasPhysicalInvestigation(record);
  }
  if (definition.requiredSignalScans) {
    return signalScanCount(state, definition) >= definition.requiredSignalScans;
  }
  if (definition.requiredSurveyedHulls) {
    return surveyedHullCount(state) >= definition.requiredSurveyedHulls;
  }
  return isFound(record);
}

// Distinct memorial hulls filed, mirrored from v2FlavorRuntime receipts (this file stays
// import-free): current `quiessence:hull:<index>` plus legacy `quiessence:<entityId>:<index>`.
function surveyedHullCount(state) {
  const receipts = state && state.v2Flavor && Array.isArray(state.v2Flavor.presentedReceipts)
    ? state.v2Flavor.presentedReceipts
    : [];
  const seen = new Set();
  for (const receipt of receipts) {
    if (typeof receipt !== 'string') continue;
    const parts = receipt.split(':');
    if (parts.length !== 3 || parts[0] !== 'quiessence') continue;
    const index = Number(parts[2]);
    if (Number.isInteger(index) && index >= 1 && index <= 24) seen.add(index);
  }
  return seen.size;
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
        poiLabel: definition.poiLabel,
        signalKind: definition.signalKind || 'archive',
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
  if (probe.poiLabel !== definition.poiLabel || probe.signalKind !== (definition.signalKind || 'archive')) return false;
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
