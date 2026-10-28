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
  signalLineIds: Object.freeze(['c9_01', 'c9_02', 'c9_03', 'c9_05']),
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

// Read-only return guidance from scanner, mission and world authorities. No new saved flags:
// old saves, rejected voice lines and revisits all resolve from the same durable evidence.
export function shardSphereSongProgress(state) {
  const definition = SHARD_SPHERE_SONG;
  const record = discoveryRecord(state, definition);
  if (!isFound(record)) return null;
  const total = definition.requiredSignalScans;
  let recovered = Math.min(total, signalScanCount(state, definition));
  if (questComplete(state, definition)) {
    return { phase: 'filed', recovered: total, total,
      text: 'Reconstruction filed at the Echo Shrine. The unfinished phrase remains in your archive; there is no second reconstruction payment.' };
  }
  const active = state?.missions?.active?.some((mission) =>
    mission?.source === LANDMARK_QUEST_SOURCE
    && mission.params?.landmarkProbe?.questId === definition.id);
  if (active) {
    return { phase: 'return', recovered, total,
      text: 'Reconstruction accepted. Return to the Shard Sphere and fire one close scanner pulse to file the song.' };
  }
  // Missions keeps an earned offer through board refresh and Save/Continue, even if
  // scanner's bounded contact history later evicts the original four-pulse record.
  const posted = state?.missions?.boards?.[definition.stationId]?.slots;
  if (Array.isArray(posted) && posted.some((offer) =>
    offer?.id === definition.id && validateLandmarkQuestOffer(offer))) recovered = total;
  if (recovered < total) {
    return { phase: 'collecting', recovered, total,
      text: `Schism fragments ${recovered}/${total}. Return to the Shard Sphere and use active scanner pulses to recover the remaining notes.` };
  }
  const rep = Number(state?.factions?.[definition.factionId]?.rep) || 0;
  return { phase: rep >= definition.minRep ? 'ready' : 'trust', recovered, total,
    text: rep >= definition.minRep
      ? 'All four fragments recovered. Dock at the Echo Shrine and accept Reconstruct the Song from its mission board, then take one close reading at the sphere.'
      : `All four fragments recovered. The Echo Shrine offers Reconstruct the Song only at Vael standing +${definition.minRep} or higher. Earn that trust before accepting the reconstruction.` };
}

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

// C3 — the starter sector's own landmark. The Candle Fleet relights twenty-four candles for
// the Pit convoy on every shift; the twenty-fifth plinth stays dark until somebody reads its
// black-box smear properly. The first hour's relighting procession walks the player out here;
// this row is the reason to come back with a scanner.
export const CANDLE_FLEET_PIT_BEARING = Object.freeze({
  id: 'landmark_c3_pit_bearing',
  sectorId: 'sector_helios_prime',
  poiId: 'poi_memorial',
  targetRef: 'landmark_c3_candle_fleet',
  stationId: 'station_helios',
  factionId: 'faction_scn',
  targetLocalPos: Object.freeze({ x: 1680, z: -820 }),
  maxRangeWu: 300,
  poiLabel: 'The Candle Fleet',
  rewardCr: 750,
  minRep: -1000,
  riskTier: 0,
  title: 'The Candle Fleet: The Dark Plinth',
  brief: 'Return to the Fleet and hold one close scanner pass on the dark twenty-fifth plinth.',
  summary: 'The tenders relight twenty-four candles every shift and leave the twenty-fifth dark. Helios will file one close reading of the plinth\'s black-box smear — taken at the Fleet, by a pilot, not copied from the archive.',
  causeTag: 'landmark:candle_fleet_pit_bearing',
  causeFingerprint: 'landmark:c3:pit-bearing:v1',
  causeLine: 'Twenty-four candles burn for the Pit convoy. The twenty-fifth plinth stays dark on purpose.',
  successText: 'Reading filed. Helios logged the smear as a course, not a scar, and paid without asking why the tenders never lit the plinth themselves.',
  artifact: Object.freeze({
    id: 'artifact_c3_pit_bearing_smear',
    title: 'C3-1 · The Twenty-Fifth Plinth Record',
    body: 'One close pass separates the plinth\'s black-box smear from candle-glow noise: the Pit convoy ran dark on purpose, riding without lights to slip the toll cut, and the twenty-fifth hull led. Its course resolves to a slow drift line off the Fleet\'s dark side — sealed relief pods, still in formation, still waiting on an escort that was sold elsewhere.',
  }),
});

// SEED-SC-05 — the Scar Bazaar's surplus move. Stolen cargo comes in under the upturned deck;
// the surplus leaves as a filed count, not a Concord warrant.
export const KEPLER_SURPLUS_MOVE = Object.freeze({
  id: 'landmark_kepler_surplus_move',
  sectorId: 'sector_kepler_scar',
  poiId: 'poi_kepler_hulk',
  targetRef: 'landmark_kepler_flight_deck',
  stationId: 'station_kepler_scar',
  factionId: 'faction_reach',
  targetLocalPos: Object.freeze({ x: 40, z: 720 }),
  maxRangeWu: 300,
  poiLabel: 'The Flight Deck',
  rewardCr: 880,
  minRep: -1000,
  riskTier: 1,
  title: 'The Flight Deck: Surplus Move',
  brief: 'Hold under the upturned deck and file one close count of what the stalls are moving out.',
  summary: 'Stolen cargo comes in under the Void-Reach. The Bazaar pays a Reach pilot to file the surplus that leaves, taken at the deck, not copied from a Concord ledger.',
  causeTag: 'landmark:kepler_surplus_move',
  causeFingerprint: 'landmark:kepler:surplus-move:v1',
  causeLine: 'The stalls under the capsized carrier move more out than they admit in.',
  successText: 'Surplus filed. The Bazaar paid for the outbound count and kept the inbound names off the sheet.',
  artifact: Object.freeze({
    id: 'artifact_kepler_surplus_tally',
    title: 'Kepler · Surplus Tally',
    body: 'One close pass under the upturned deck separates stall noise from outbound lots. The surplus is real, the names are not, and the Reach price is already on the sheet.',
  }),
});

// SEED-SC-07 — carry the shrine readings out of a sector that otherwise stays empty.
export const ORCUS_SHRINE_READINGS = Object.freeze({
  id: 'landmark_orcus_shrine_readings',
  sectorId: 'sector_orcus_shadow',
  poiId: 'poi_orcus_plinth',
  targetRef: 'landmark_orcus_shadow_plinth',
  stationId: 'station_orcus_shadow',
  factionId: 'faction_archive',
  targetLocalPos: Object.freeze({ x: 980, z: -540 }),
  maxRangeWu: 300,
  poiLabel: 'Shadow Plinth',
  rewardCr: 960,
  minRep: -1000,
  riskTier: 2,
  title: 'The Shadow Plinth: Shrine Readings',
  brief: 'Take one close reading off the plinth that faces the signal, then file it at the Shadow Cache.',
  summary: 'The Orcus Signal answers every scan one pulse late. The Cache pays for the plinth reading carried back through the shadow, not for a second station.',
  causeTag: 'landmark:orcus_shrine_readings',
  causeFingerprint: 'landmark:orcus:shrine-readings:v1',
  causeLine: 'The plinth faces a signal that has no source, and the Cache will not send its own boat.',
  successText: 'Readings filed. The Cache logged the late pulse and paid without lighting the lane.',
  artifact: Object.freeze({
    id: 'artifact_orcus_plinth_reading',
    title: 'Orcus · Plinth Reading',
    body: 'The plinth returns the same scan it was given, one pulse late. Carried to the Cache, the delay is the reading. Nothing else in the shadow answered.',
  }),
});

// SEED-SC-10 — survey the fissure and sell the fracture reading. The fissure keeps no lore id.
export const HAUMEA_FRACTURE_READING = Object.freeze({
  id: 'landmark_haumea_fracture_reading',
  sectorId: 'sector_haumea_rift',
  poiId: 'poi_haumea_fissure',
  targetRef: 'landmark_haumea_fissure',
  stationId: 'station_haumea_rift',
  factionId: 'faction_free',
  targetLocalPos: Object.freeze({ x: 0, z: 180 }),
  maxRangeWu: 300,
  poiLabel: 'Ice Fissure Signal',
  rewardCr: 720,
  minRep: -1000,
  riskTier: 1,
  title: 'The Ice Fissure Signal: Fracture Reading',
  brief: 'Hold over the fissure mouth and file one close fracture reading at the observatory.',
  summary: 'The rift is the machine. Rift Observatory buys one fracture reading taken at the mouth, not a bounty and not a second name for the ice.',
  causeTag: 'landmark:haumea_fracture_reading',
  causeFingerprint: 'landmark:haumea:fracture-reading:v1',
  causeLine: 'The fissure keeps answering in ice, and the observatory will pay for the shape of the answer.',
  successText: 'Fracture reading filed. The observatory paid for the crack and left the ice unnamed.',
  artifact: Object.freeze({
    id: 'artifact_haumea_fracture_reading',
    title: 'Haumea · Fracture Reading',
    body: 'One close pass resolves the mouth into a repeating split, deeper than the sheet and quieter than the buoy. The observatory files the shape. The fissure stays a fissure.',
  }),
});

// SEED-SC-14 — cut ice and put it on the waystation scale the same shift.
export const NEREID_SAME_SHIFT_ICE = Object.freeze({
  id: 'landmark_nereid_same_shift_ice',
  sectorId: 'sector_nereid_shoal',
  poiId: 'poi_nereid_wreck',
  targetRef: 'landmark_nereid_ice_hull',
  stationId: 'station_nereid',
  factionId: 'faction_dmc',
  targetLocalPos: Object.freeze({ x: 1280, z: 720 }),
  maxRangeWu: 300,
  poiLabel: 'Ice-Hull Wreck',
  rewardCr: 640,
  minRep: -1000,
  riskTier: 1,
  title: 'The Shoal: Same-Shift Ice',
  brief: 'Cut one close reading off the ice hull and file the weight at the waystation before the shift turns.',
  summary: 'Shoal crews sell ice the shift they cut it. The waystation scale pays for a reading taken on the hull, under the Collective cut, not for a smuggling desk.',
  causeTag: 'landmark:nereid_same_shift_ice',
  causeFingerprint: 'landmark:nereid:same-shift-ice:v1',
  causeLine: 'The ice on that hull is still the shift\'s cargo if somebody weighs it before the dock turns.',
  successText: 'Weight filed. The waystation paid the same-shift cut and sent the number to the claim.',
  artifact: Object.freeze({
    id: 'artifact_nereid_shift_weight',
    title: 'Nereid · Shift Weight',
    body: 'One close pass on the ice hull returns a weight the waystation will take before the shift ends. The claim\'s cut is already on the ticket. Nothing in the number is hidden freight.',
  }),
});

// SEED-SC-16 — sound the well and file it with the Quiet.
export const PROTEUS_WELL_SOUNDING = Object.freeze({
  id: 'landmark_proteus_well_sounding',
  sectorId: 'sector_proteus_well',
  poiId: 'poi_proteus_hulk',
  targetRef: 'landmark_proteus_funnel',
  stationId: 'station_proteus',
  factionId: 'faction_quiet',
  targetLocalPos: Object.freeze({ x: 1120, z: 860 }),
  maxRangeWu: 300,
  poiLabel: 'The Funnel',
  rewardCr: 1100,
  minRep: -1000,
  riskTier: 2,
  title: 'The Funnel: Sound the Well',
  brief: 'Hold in the funnel throat and file one close sounding at the Proteus Den.',
  summary: 'The den buys findings. One sounding taken in the well, filed with the Quiet, is the work. The berth stays gated. This is not a survey board.',
  causeTag: 'landmark:proteus_well_sounding',
  causeFingerprint: 'landmark:proteus:well-sounding:v1',
  causeLine: 'The funnel returns more mass than the hull explains, and the den will pay for the sounding.',
  successText: 'Sounding filed. The Quiet logged the extra mass and paid without opening a public board.',
  artifact: Object.freeze({
    id: 'artifact_proteus_well_sounding',
    title: 'Proteus · Well Sounding',
    body: 'A close pass down the funnel resolves a floor that returns more mass than the visible hull. The den files the difference. The well stays the well.',
  }),
});

// SEED-SC-19 — the fence's only job is the licensed plate. The black market stays.
export const EUNOMIA_LICENSED_PLATE = Object.freeze({
  id: 'landmark_eunomia_licensed_plate',
  sectorId: 'sector_eunomia_gulf',
  poiId: 'poi_eunomia_ledger',
  targetRef: 'landmark_eunomia_ledger_plate',
  stationId: 'station_eunomia',
  factionId: 'faction_understory',
  targetLocalPos: Object.freeze({ x: -920, z: 480 }),
  maxRangeWu: 300,
  poiLabel: 'Gulf Ledger Plate',
  rewardCr: 840,
  minRep: -1000,
  riskTier: 1,
  title: 'The Gulf Fence: Licensed Plate',
  brief: 'Read the ledger plate under the board seal and file the cut at the Eunomia Fence.',
  summary: 'The fence is the only reason to arrive. One plate reading, taken under the board seal and filed at the berth, is the licensed work. Concord does not post here.',
  causeTag: 'landmark:eunomia_licensed_plate',
  causeFingerprint: 'landmark:eunomia:licensed-plate:v1',
  causeLine: 'The gulf plate carries a Vael seal and a cut the fence will pay a pilot to confirm.',
  successText: 'Plate filed. The fence paid the cut and left the black-market berth exactly as it was.',
  artifact: Object.freeze({
    id: 'artifact_eunomia_plate_cut',
    title: 'Eunomia · Plate Cut',
    body: 'The ledger plate resolves under the board seal into one licensed cut and no Concord mark. The fence keeps the market. The plate keeps the seal.',
  }),
});

export const DEN_TOLL_REGISTER = Object.freeze({
  id: 'landmark_den_toll_register',
  sectorId: 'sector_pallas_drift',
  poiId: 'poi_den_arch_d',
  targetRef: 'landmark_den_toll_lamp',
  stationId: 'station_smuggler',
  factionId: 'faction_quiet',
  targetLocalPos: Object.freeze({ x: -1700, z: 2140 }),
  maxRangeWu: 300,
  poiLabel: 'Toll Hulk Lamp',
  rewardCr: 700,
  minRep: -1000,
  riskTier: 1,
  signalKind: 'salvage',
  title: 'The Toll Hulk: Lamp Register',
  brief: 'Board-scan the old Reach gunboat’s tally lamp and file the register at the den berth.',
  summary: 'The lamp still burns on a hulk with no guns left to argue for it. The house wants the toll register copied — who paid, who still owes — before somebody collects on it.',
  causeTag: 'landmark:den_toll_register',
  causeFingerprint: 'landmark:den:toll-register:v1',
  causeLine: 'The archipelago’s last gunboat kept its lamp lit and its tally honest.',
  successText: 'Register filed. The house paid without a word and struck one name from the tally.',
  artifact: Object.freeze({
    id: 'artifact_den_toll_register',
    title: 'Den · Toll Register',
    body: 'Grease-pencil tolls, wiped and rewritten for years. Most names are Quiet grey; three are Reach grey and dated after the gunboat died. The lamp keeps its own list of who still crosses.',
  }),
});

export const DEN_SPLIT_MANIFEST = Object.freeze({
  id: 'landmark_den_split_manifest',
  sectorId: 'sector_pallas_drift',
  poiId: 'poi_den_arch_c',
  targetRef: 'landmark_den_wide_door_manifest',
  stationId: 'station_drift',
  factionId: 'faction_mts',
  targetLocalPos: Object.freeze({ x: -1520, z: 1720 }),
  maxRangeWu: 300,
  poiLabel: 'Split Freighter Hold',
  rewardCr: 640,
  minRep: -1000,
  riskTier: 1,
  signalKind: 'salvage',
  title: 'The Split Freighter: Wide-Door Manifest',
  brief: 'Read the manifest sealed in the split hold and file it at the Drift Market board.',
  summary: 'The wide door under the stern is the regulars’ gap, and the hold still seals one manifest the market wants read before the Quiet sell it twice.',
  causeTag: 'landmark:den_split_manifest',
  causeFingerprint: 'landmark:den:split-manifest:v1',
  causeLine: 'The freighter broke her back on the middle rock and kept her manifest dry.',
  successText: 'Manifest filed. One Drift client now buys insurance; the den never listed the cargo at all.',
  artifact: Object.freeze({
    id: 'artifact_den_split_manifest',
    title: 'Drift · Wide-Door Manifest',
    body: 'A bulk manifest under a Concord seal nobody at the den ever broke. Every line item is rations; every tonnage figure says machinery. Somewhere between the two columns is the reason she was running dark.',
  }),
});

export const DEN_BELL_ROLL = Object.freeze({
  id: 'landmark_den_bell_roll',
  sectorId: 'sector_pallas_drift',
  poiId: 'poi_pallas_quiet_bell',
  targetRef: 'landmark_den_bell_roll',
  stationId: 'station_smuggler',
  factionId: 'faction_quiet',
  targetLocalPos: Object.freeze({ x: -950, z: 700 }),
  maxRangeWu: 300,
  poiLabel: 'The Quiet Bell',
  rewardCr: 480,
  minRep: -1000,
  riskTier: 1,
  title: 'The Quiet Bell: The Roll',
  brief: 'Scan the bell buoy once and file the one-note roll at the den.',
  summary: 'The house keeps no other record of who called. One reading of the bell’s own tally is the closest thing to a roll call the den will ever post.',
  causeTag: 'landmark:den_bell_roll',
  causeFingerprint: 'landmark:den:bell-roll:v1',
  causeLine: 'The bell answers one note with silence, and silence is a complete sentence.',
  successText: 'Roll filed. The bell said nothing back, which at the den is an acknowledgement.',
  artifact: Object.freeze({
    id: 'artifact_den_bell_roll',
    title: 'Den · Bell Roll',
    body: 'The buoy’s tally ring holds one strike per hull, worn to different depths. The deepest groove is struck from the wrong side — somebody rings the bell from inside the archipelago, and has for years.',
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
  CANDLE_FLEET_PIT_BEARING,
  KEPLER_SURPLUS_MOVE,
  ORCUS_SHRINE_READINGS,
  HAUMEA_FRACTURE_READING,
  NEREID_SAME_SHIFT_ICE,
  PROTEUS_WELL_SOUNDING,
  EUNOMIA_LICENSED_PLATE,
  DEN_TOLL_REGISTER,
  DEN_SPLIT_MANIFEST,
  DEN_BELL_ROLL,
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
  const count = Number(record && record.scanCount);
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
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

/** C6-only journal projection. No board, discovery, mission or saved state is written here. */
export function cavedShaftReturnGuidance(state) {
  const definition = CAVED_SHAFT_PROBE;
  const record = discoveryRecord(state, definition);
  if (!isFound(record)) return null;
  // The same stable artifact identity used by offer eligibility is completion authority.
  // Render authored text, not arbitrary text carried by a stale or edited artifact payload.
  if (questComplete(state, definition)) return { phase: 'returned', text: '', artifact: definition.artifact };
  const missions = state && state.missions || {};
  const active = Array.isArray(missions.active) ? missions.active : [];
  const receipts = Array.isArray(missions.receipts) ? missions.receipts : [];
  const matchesReceipt = (row) => row && (row.sourceOfferId === definition.id
    || row.causeFingerprint === definition.causeFingerprint);
  const isCanonicalMission = (row) => {
    if (!row || row.sourceOfferId !== definition.id || row.sourceRef !== definition.targetRef) return false;
    const probe = row.params && row.params.landmarkProbe;
    return validateLandmarkQuestOffer({ ...row, id: row.sourceOfferId, minRep: definition.minRep })
      && probe.targetLocalPos.x === definition.targetLocalPos.x
      && probe.targetLocalPos.z === definition.targetLocalPos.z
      && probe.maxRangeWu === definition.maxRangeWu
      && probe.artifact.title === definition.artifact.title
      && probe.artifact.body === definition.artifact.body;
  };
  // The mission owner's receipt dedupe also retires failed/abandoned contracts. A receipt is
  // not a recovered frame, and a stale active row must not promise another payout or pulse.
  if (receipts.some(matchesReceipt) || active.some(row => isCanonicalMission(row)
    && (row.status !== 'active' || row.params.landmarkProbe.returned))) {
    return { phase: 'closed', text: 'The hardened-probe contract is closed. There is nothing left to file from the shaft.', artifact: null };
  }
  if (active.some(row => row.status === 'active' && isCanonicalMission(row))) {
    return { phase: 'active', text: 'Hardened probe accepted at Cut Refinery. Fly back to the Caved Shaft and fire one close scanner pulse within 300 WU.', artifact: null };
  }
  // A lead, not an availability promise: standing, board lifecycle and acceptance remain
  // mission-owned. Merely learning the site must never accept a job or grant its reward.
  return { phase: 'lead', text: 'For hardened-probe work, check Cut Refinery’s Jobs board. Ordinary probes return blank; the refinery wants the exact reading, even if it is only a frame.', artifact: null };
}
