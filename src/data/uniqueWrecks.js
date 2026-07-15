// R2 unique-wreck registry — the authored "rumor -> bearing -> scan -> salvage" contract.
//
// Determinism contract: every placement is derived only from
//   (programSeed, wreckId, sectorId)
// through hash32 + a private mulberry32 stream. Placement never consumes state.rng, wall-clock
// time, or iteration order. `programSeed` is derived from the save's immutable meta seed. Seeded
// complications declare their own salt and run on sim time, never wall-clock time.
//
// T4c integration seam: wreckClasses.js / aftermathWrecks.js remain owner-controlled. The pure
// `promoteToAuthored(lossLike)` adapter returns the provenance/class fields a live wreck preserves.

import { hash32, mulberry32 } from '../core/rng.js';
import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';
import { wreckClassById } from './wreckClasses.js';

export const UNIQUE_WRECK_STATE_SCHEMA_VERSION = 2;
export const UNIQUE_WRECK_RECEIPT_LIMIT = 24;
export const UNIQUE_WRECK_SCAN_RADIUS = 1200;

const PROGRAM_SEED_LABEL = 'spaceface:galaxy-keeps-receipts:v1';
const REQUIRED_RUMOR_CHANNELS = Object.freeze([
  'bar', 'news', 'comms_intercept', 'bark', 'mission', 'campaign', 'loss_investigation',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function salvageDecision({
  headline,
  prompt,
  claimLabel,
  claimConsequence,
  claimTitle,
  claimDetail,
  handoverLabel,
  handoverConsequence,
  handoverTitle,
  handoverDetail,
  handoverCredits = 0,
  claimRepDelta = 0,
  handoverRepDelta = 0,
}) {
  return {
    headline,
    prompt,
    choices: [
      {
        id: 'claim_hardware',
        label: claimLabel,
        consequence: claimConsequence,
        outcome: 'claimed',
        uniqueDrop: true,
        bonusCargo: true,
        credits: 0,
        repDelta: claimRepDelta,
        receiptTitle: claimTitle,
        receiptDetail: claimDetail,
      },
      {
        id: 'authority_handover',
        label: handoverLabel,
        consequence: handoverConsequence,
        outcome: 'handed_over',
        uniqueDrop: false,
        bonusCargo: false,
        credits: handoverCredits,
        repDelta: handoverRepDelta,
        receiptTitle: handoverTitle,
        receiptDetail: handoverDetail,
      },
    ],
  };
}

function wreck(spec) {
  return {
    scanRequirement: null,
    scanGate: null,
    salvageLaw: null,
    complications: [],
    seededTimers: [],
    encounterRefs: [],
    salvagePool: { cmdty_scrap_metal: 1 },
    bonusCargo: [],
    reactor: null,
    ...spec,
  };
}

const CONCORD_RESTRICTED_SALVAGE = {
  restricted: true,
  jurisdictionFactionId: 'faction_scn',
  consequence: 'classified_salvage_fine',
  currentFenceFactionId: 'faction_quiet',
  futureFenceFactionId: 'faction_pitborn',
};

const RAW_UNIQUE_WRECKS = [
  wreck({
    id: 'wreck_isc_vigilant', programSlot: 'D1', name: 'ISC Vigilant', victimLabel: 'ISC Vigilant',
    wreckClass: 'military', sectorId: 'sector_veil_nebula', factionId: 'faction_scn',
    scanLabel: 'ISC VIGILANT · RESTRICTED SURVEY WRECK',
    scanRequirement: 'mod_survey_suite',
    scanGate: { kind: 'module', moduleId: 'mod_survey_suite', purpose: 'bearing_fix' },
    uniqueDropId: 'unique_veil_cutter',
    uniqueDrops: [{ id: 'unique_veil_cutter', kind: 'weapon', baseId: 'wpn_beam_laser_m' }],
    bearingSourceRef: 'loss.vigilant',
    rumorSources: [
      { id: 'losses_in_the_veil', sourceRef: 'news.losses_in_the_veil', channelId: 'news' },
      { id: 'vigilant_case_file', sourceRef: 'loss.vigilant', channelId: 'loss_investigation' },
    ],
    provenance: { lossId: 'loss_vigilant', incidentId: 'incident_veil_final_survey', sourceRef: 'loss.vigilant', recordType: 'survey_loss' },
    hazardContext: { label: 'Veil nebula core', anchorType: 'zone', anchorId: 'zone_veil_fog', zoneId: 'zone_veil_fog', hazardTypes: ['nebula'], placementRule: 'inside_hazard_core', approachGate: 'survey_scan_only' },
    salvageLaw: CONCORD_RESTRICTED_SALVAGE,
    bonusCargo: [{ commodityId: 'cmdty_salvage_electronics', qty: 2 }],
    placement: { anchorLocal: { x: -280, z: 640 }, minRadius: 90, maxRadius: 360, bearingRadiusMin: 420, bearingRadiusMax: 680 },
    decision: salvageDecision({
      headline: 'VIGILANT RESTRICTED RECOVERY',
      prompt: 'Choose whether to claim the prototype or file it as Concord evidence.',
      claimLabel: 'CLAIM VEIL-CUTTER',
      claimConsequence: 'Keep the unique beam weapon and classified salvage; SCN records an unlawful military claim.',
      claimTitle: 'VEIL-CUTTER CLAIMED',
      claimDetail: 'The Vigilant prototype and classified electronics entered your manifest.',
      handoverLabel: 'FILE CONCORD EVIDENCE',
      handoverConsequence: 'Surrender the prototype and black box for a lawful recovery award.',
      handoverTitle: 'VIGILANT EVIDENCE FILED',
      handoverDetail: 'Concord accepted the Vigilant black box and sealed prototype custody.',
      handoverCredits: 6800, claimRepDelta: -14, handoverRepDelta: 18,
    }),
    followup: { id: 'vigilant_recovered', text: 'VIGILANT RECOVERY ENTERS CONCORD EVIDENCE; SALVAGE FINES REMAIN PAYABLE.' },
  }),
  wreck({
    id: 'wreck_dmc_ironsong', programSlot: 'D2', name: 'DMC Ironsong', victimLabel: 'DMC Ironsong',
    wreckClass: 'military', sectorId: 'sector_nyx_march', factionId: 'faction_dmc',
    scanLabel: 'DMC IRONSONG · RESTRICTED CUT-LANE WRECK',
    uniqueDropId: 'unique_ironsong_ac',
    uniqueDrops: [{ id: 'unique_ironsong_ac', kind: 'weapon', baseId: 'wpn_autocannon_m' }],
    bearingSourceRef: 'comms.ironsing_gun',
    rumorSources: [{ id: 'ironsing_gun_intercept', sourceRef: 'comms.ironsing_gun', channelId: 'comms_intercept' }],
    provenance: { lossId: 'loss_dmc_ironsong', incidentId: 'incident_nyx_cutlane_ironsong', sourceRef: 'comms.ironsing_gun', recordType: 'cutlane_ambush' },
    hazardContext: { label: 'Hyperion Cut Lane ambush zone', anchorType: 'zone', anchorId: 'zone_nyx_cutlane', zoneId: 'zone_nyx_cutlane', hazardTypes: ['ambush_lane'], placementRule: 'inside_zone', approachGate: null },
    salvageLaw: CONCORD_RESTRICTED_SALVAGE,
    complications: [{ id: 'ironsong_cutlane_ambush', kind: 'ambient_zone', trigger: 'approach', zoneId: 'zone_nyx_cutlane' }],
    salvagePool: { cmdty_scrap_metal: 2 },
    bonusCargo: [{ commodityId: 'cmdty_salvage_electronics', qty: 2 }],
    placement: { anchorLocal: { x: 1120, z: 760 }, minRadius: 80, maxRadius: 340, bearingRadiusMin: 360, bearingRadiusMax: 620 },
    decision: salvageDecision({
      headline: 'IRONSONG RESTRICTED RECOVERY', prompt: 'Choose who keeps the gun and the recording.',
      claimLabel: 'CLAIM IRONSONG AC', claimConsequence: 'Keep the etched gun; Concord can still fine the military salvage.',
      claimTitle: 'IRONSONG AC CLAIMED', claimDetail: 'The gun and captain recording entered your manifest.',
      handoverLabel: 'SELL THROUGH QUIET', handoverConsequence: 'Let the Quiet launder the restricted recovery for a smaller clean payment.',
      handoverTitle: 'IRONSONG FENCED', handoverDetail: 'Quiet custody erased your name from the first transfer.',
      handoverCredits: 5600, claimRepDelta: -10, handoverRepDelta: 6,
    }),
    followup: { id: 'ironsong_recovered', text: 'IRONSONG GUN CHANGES HANDS; CAPTAIN RECORDING REMAINS UNCLAIMED.' },
  }),
  wreck({
    id: 'wreck_isc_lighthouse', programSlot: 'D3', name: 'ISC Lighthouse', victimLabel: 'ISC Lighthouse',
    wreckClass: 'military', sectorId: 'sector_ashfall_reach', factionId: 'faction_scn',
    scanLabel: 'ISC LIGHTHOUSE · PROTOTYPE SIEGE-BEAM WRECK',
    uniqueDropId: 'unique_lighthouse_heavy_beam',
    uniqueDrops: [{ id: 'unique_lighthouse_heavy_beam', kind: 'weapon', baseId: 'wpn_heavy_beam_l' }],
    bearingSourceRef: 'campaign.lighthouse_reveal',
    rumorSources: [{ id: 'lighthouse_campaign_reveal', sourceRef: 'campaign.lighthouse_reveal', channelId: 'campaign' }],
    provenance: { lossId: 'loss_isc_lighthouse', incidentId: 'incident_lighthouse_return_fire', sourceRef: 'campaign.lighthouse_reveal', recordType: 'prototype_weapon_loss' },
    hazardContext: { label: 'Ashfall moving radiation field', anchorType: 'hazard', anchorId: null, zoneId: null, hazardTypes: ['radiation'], hazardSelector: { type: 'radiation', moving: true }, placementRule: 'inside_moving_hazard', approachGate: 'moving_radiation_window', moving: true },
    timingGate: { id: 'lighthouse_radiation_window', kind: 'hazard_window', hazardType: 'radiation', requiresMoving: true, clock: 'sim_time' },
    salvageLaw: CONCORD_RESTRICTED_SALVAGE,
    complications: [{ id: 'lighthouse_radiation_timing', kind: 'hazard_window', trigger: 'approach', hazardType: 'radiation' }],
    salvagePool: { cmdty_scrap_metal: 2 },
    bonusCargo: [{ commodityId: 'cmdty_salvage_electronics', qty: 3 }],
    placement: { anchorLocal: { x: 0, z: 0 }, minRadius: 520, maxRadius: 1420, bearingRadiusMin: 300, bearingRadiusMax: 500 },
    decision: salvageDecision({
      headline: 'LIGHTHOUSE PROTOTYPE RECOVERY', prompt: 'Choose whether the siege-beam leaves Ashfall with you.',
      claimLabel: 'CLAIM HEAVY BEAM', claimConsequence: 'Keep the endgame prototype and inherit its restricted-custody trail.',
      claimTitle: 'LIGHTHOUSE BEAM CLAIMED', claimDetail: 'The siege-beam cleared the moving burn under your registry.',
      handoverLabel: 'SEAL WITH CONCORD', handoverConsequence: 'Return the prototype to sealed custody for the largest lawful recovery award.',
      handoverTitle: 'LIGHTHOUSE SEALED', handoverDetail: 'Concord accepted the beam without answering what returned fire.',
      handoverCredits: 18000, claimRepDelta: -18, handoverRepDelta: 24,
    }),
    followup: { id: 'lighthouse_recovered', text: 'LIGHTHOUSE PROTOTYPE REMOVED FROM ASHFALL; RETURN-FIRE SOURCE STILL SEALED.' },
  }),
  wreck({
    id: 'wreck_lanebreaker_pale_coil', programSlot: 'D4', name: 'Lanebreaker Pale-Coil', victimLabel: 'Lanebreaker Pale-Coil',
    wreckClass: 'ancient', sectorId: 'sector_phoebe_echo', factionId: 'faction_vael',
    scanLabel: 'LANEBREAKER PALE-COIL · SEALED VAEL PROTOTYPE',
    scanRequirement: 'mod_survey_suite', scanGate: { kind: 'module', moduleId: 'mod_survey_suite', purpose: 'bearing_fix' },
    uniqueDropId: 'unique_pale_coil_warp_drive',
    uniqueDrops: [{ id: 'unique_pale_coil_warp_drive', kind: 'module', baseId: 'mod_engine_warp_l' }],
    bearingSourceRef: 'mission.the_lost_coils',
    rumorSources: [{ id: 'the_lost_coils', sourceRef: 'mission.the_lost_coils', channelId: 'mission' }],
    provenance: { lossId: 'loss_lanebreaker_pale_coil', incidentId: 'incident_pale_coil_impossible_blink', sourceRef: 'mission.the_lost_coils', recordType: 'sealed_relic' },
    hazardContext: { label: 'Silent Vault', anchorType: 'poi', anchorId: 'poi_phoebe_vault', zoneId: 'zone_phoebe_shrine', hazardTypes: ['radiation', 'nebula'], placementRule: 'near_hidden_poi', approachGate: 'survey_scan_only' },
    placement: { anchorLocal: { x: -1480, z: 520 }, minRadius: 80, maxRadius: 240, bearingRadiusMin: 260, bearingRadiusMax: 460 },
    decision: salvageDecision({
      headline: 'PALE-COIL VAULT CLAIM', prompt: 'Choose whether the impossible coil flies or remains evidence.',
      claimLabel: 'CLAIM PALE-COIL', claimConsequence: 'Keep the blink-capable drive and end the Vael argument by using it.',
      claimTitle: 'PALE-COIL CLAIMED', claimDetail: 'The sealed coil entered your engine inventory.',
      handoverLabel: 'LEAVE VAEL FINDING', handoverConsequence: 'Return the coil to the shrine and receive a Vael research award.',
      handoverTitle: 'PALE-COIL PRESERVED', handoverDetail: 'The relic-or-weapon finding remains open.',
      handoverCredits: 9200, handoverRepDelta: 14,
    }),
    followup: { id: 'pale_coil_recovered', text: 'PALE-COIL VAULT OPENED; RELIC-OR-WEAPON FINDING REMAINS UNRESOLVED.' },
  }),
  wreck({
    id: 'wreck_choir_bell_aegis', programSlot: 'D5', name: 'Choir-Bell Aegis', victimLabel: 'Choir-Bell Aegis',
    wreckClass: 'ancient', sectorId: 'sector_triton_wake', factionId: 'faction_choir',
    scanLabel: 'CHOIR-BELL AEGIS · RESONANT FORTRESS SHRINE',
    uniqueDropId: 'unique_choir_bell_aegis',
    uniqueDrops: [{ id: 'unique_choir_bell_aegis', kind: 'module', baseId: 'mod_shield_aegis_l' }],
    bearingSourceRef: 'bark.singing_bell',
    rumorSources: [{ id: 'singing_bell_taunt', sourceRef: 'bark.singing_bell', channelId: 'bark' }],
    provenance: { lossId: 'loss_choir_bell_aegis', incidentId: 'incident_triton_silenced_bell', sourceRef: 'bark.singing_bell', recordType: 'fortress_loss' },
    hazardContext: { label: 'Wake Marker resonance field', anchorType: 'poi', anchorId: 'poi_triton_beacon', zoneId: 'zone_triton_glow', hazardTypes: ['nebula', 'radiation'], placementRule: 'hazard_intersection_near_poi', approachGate: 'tractor_resonance_beat' },
    timingGate: { id: 'choir_bell_resonance', kind: 'tractor_beat', periodS: 6, windowS: 1.2, failure: 'shield_discharge', clock: 'sim_time' },
    complications: [{ id: 'choir_bell_discharge', kind: 'timed_salvage', trigger: 'tractor', timingGateId: 'choir_bell_resonance' }],
    placement: { anchorLocal: { x: -600, z: -200 }, minRadius: 80, maxRadius: 260, bearingRadiusMin: 280, bearingRadiusMax: 500 },
    decision: salvageDecision({
      headline: 'CHOIR-BELL SHRINE CLAIM', prompt: 'Choose whether the ringing shield leaves the Wake.',
      claimLabel: 'CLAIM CHOIR-BELL', claimConsequence: 'Keep the reactive Aegis; the Vael mark the shrine as broken.',
      claimTitle: 'CHOIR-BELL CLAIMED', claimDetail: 'The shield answered one final tractor beat.',
      handoverLabel: 'PRESERVE THE SHRINE', handoverConsequence: 'Leave the Aegis ringing and receive Vael standing.',
      handoverTitle: 'SHRINE PRESERVED', handoverDetail: 'The Wake continues to ring around an unlooted fortress.',
      handoverCredits: 7600, handoverRepDelta: 16,
    }),
    followup: { id: 'choir_bell_recovered', text: 'WAKE SHRINE FALLS SILENT; AEGIS RESONANCE NOW TRAVELS WITH A PILOT.' },
  }),
  wreck({
    id: 'wreck_gravhand_tideline', programSlot: 'D6', name: 'Gravhand Tideline', victimLabel: 'Gravhand Tideline',
    wreckClass: 'ancient', sectorId: 'sector_eunomia_gulf', factionId: 'faction_dmc',
    scanLabel: 'GRAVHAND TIDELINE · TRACTOR COUPLING STILL LIVE',
    uniqueDropId: 'unique_tideline_tractor',
    uniqueDrops: [{ id: 'unique_tideline_tractor', kind: 'module', baseId: 'mod_tractor_beam_m' }],
    bearingSourceRef: 'news.hand_that_fed_the_gulf',
    rumorSources: [{ id: 'hand_that_fed_the_gulf', sourceRef: 'news.hand_that_fed_the_gulf', channelId: 'news' }],
    provenance: { lossId: 'loss_gravhand_tideline', incidentId: 'incident_tideline_held_mass', sourceRef: 'news.hand_that_fed_the_gulf', recordType: 'recovery_tug_loss' },
    hazardContext: { label: 'Gulf Hulk debris chain', anchorType: 'poi', anchorId: 'poi_eunomia_hulk', zoneId: 'zone_eunomia_hulk', hazardTypes: ['debris'], placementRule: 'along_debris_chain', approachGate: null },
    complications: [{ id: 'tideline_held_mass', kind: 'authored_encounter', trigger: 'wreck_fixed', encounterRef: 'unique_wreck_tideline_held_mass', role: 'held_mass_boss' }],
    encounterRefs: ['unique_wreck_tideline_held_mass'],
    placement: { anchorLocal: { x: 1180, z: 720 }, minRadius: 100, maxRadius: 300, bearingRadiusMin: 320, bearingRadiusMax: 560 },
    decision: salvageDecision({
      headline: 'TIDELINE COUPLING CLAIM', prompt: 'Choose whether to cut the tractor or preserve its final hold.',
      claimLabel: 'CLAIM TIDELINE TRACTOR', claimConsequence: 'Take the tractor after confronting what remains on its line.',
      claimTitle: 'TIDELINE TRACTOR CLAIMED', claimDetail: 'The Gulf coupling released into your manifest.',
      handoverLabel: 'FILE THE HELD MASS', handoverConsequence: 'Leave the coupling intact and sell the full survey record.',
      handoverTitle: 'TIDELINE FILED', handoverDetail: 'The recovery record names what the old report omitted.',
      handoverCredits: 9800, handoverRepDelta: 10,
    }),
    followup: { id: 'tideline_recovered', text: 'TIDELINE TRACTOR RELEASED; GULF RECOVERY NOTICE WITHHOLDS WHAT IT HELD.' },
  }),
  wreck({
    id: 'wreck_nestbreaker', programSlot: 'D7', name: "Corsair-King Vrael's Nestbreaker", victimLabel: "Vrael's Nestbreaker",
    wreckClass: 'battlefield', sectorId: 'sector_sker_haven', factionId: 'faction_reach',
    scanLabel: 'NESTBREAKER · CORSAIR-KING BATTLEFIELD SHRINE',
    uniqueDropId: 'unique_nestbreaker_rack',
    uniqueDrops: [{ id: 'unique_nestbreaker_rack', kind: 'weapon', baseId: 'wpn_missile_rack_m' }],
    bearingSourceRef: 'bar.sker.nestbreaker',
    rumorSources: [{ id: 'vraels_nestbreaker_legend', sourceRef: 'bar.sker.nestbreaker', channelId: 'bar' }],
    provenance: { lossId: 'loss_nestbreaker', incidentId: 'incident_vrael_fourth_nest', sourceRef: 'bar.sker.nestbreaker', recordType: 'battlefield_loss' },
    hazardContext: { label: 'Bounty Wrecks asteroid field', anchorType: 'zone', anchorId: 'zone_sker_belt', zoneId: 'zone_sker_belt', hazardTypes: ['dense_asteroid'], placementRule: 'inside_dense_field', approachGate: null },
    complications: [{ id: 'nestbreaker_admirers', kind: 'bounty_escalation', trigger: 'salvaged', factionId: 'faction_reach' }],
    salvagePool: { cmdty_scrap_metal: 2 },
    placement: { anchorLocal: { x: 720, z: -420 }, minRadius: 100, maxRadius: 360, bearingRadiusMin: 300, bearingRadiusMax: 520 },
    decision: salvageDecision({
      headline: 'NESTBREAKER SHRINE CLAIM', prompt: 'Choose whether to take the rack from a Reach shrine.',
      claimLabel: 'CLAIM NESTBREAKER', claimConsequence: 'Keep the split-missile rack and accept the admirers\' bounties.',
      claimTitle: 'NESTBREAKER CLAIMED', claimDetail: 'Vrael\'s rack entered your manifest under your name.',
      handoverLabel: 'LEAVE THE SHRINE', handoverConsequence: 'Preserve the wreck and take a Reach honor payment.',
      handoverTitle: 'SHRINE LEFT INTACT', handoverDetail: 'Sker records that you read the legend and left it whole.',
      handoverCredits: 8200, handoverRepDelta: 14,
    }),
    followup: { id: 'nestbreaker_recovered', text: 'NESTBREAKER SHRINE LOOTED; ADMIRERS POST PRIVATE RECOVERY BOUNTIES.' },
  }),
  wreck({
    id: 'wreck_deepsurvey', programSlot: 'D8', name: "Pell Okar's Deepsurvey", victimLabel: "Okar's Deepsurvey",
    wreckClass: 'battlefield', sectorId: 'sector_haumea_rift', factionId: 'faction_free',
    scanLabel: 'DEEPSURVEY · REPEATING ICE-FISSURE PING',
    uniqueDropId: 'unique_deepsurvey_suite',
    uniqueDrops: [{ id: 'unique_deepsurvey_suite', kind: 'module', baseId: 'mod_survey_suite' }],
    bearingSourceRef: 'bar.rift_observatory.deepsurvey',
    rumorSources: [{ id: 'okars_deep_ping', sourceRef: 'bar.rift_observatory.deepsurvey', channelId: 'bar' }],
    provenance: { lossId: 'loss_deepsurvey', incidentId: 'incident_okar_third_ping', sourceRef: 'bar.rift_observatory.deepsurvey', recordType: 'survey_loss' },
    hazardContext: { label: 'Burned Survey Cache at the Ice Fissure', anchorType: 'poi', anchorId: 'poi_haumea_fissure', zoneId: 'zone_haumea_fissure', hazardTypes: ['dense_asteroid', 'anomaly_deep'], placementRule: 'near_ice_fissure', approachGate: null },
    complications: [{ id: 'deepsurvey_repeated_ping', kind: 'authored_encounter', trigger: 'equipped_scan_pulse_threshold', threshold: 3, requiredPings: 3, encounterRef: 'unique_wreck_deepsurvey_ping_elite', role: 'ping_summoned_elite' }],
    encounterRefs: ['unique_wreck_deepsurvey_ping_elite'],
    salvagePool: { cmdty_scrap_metal: 2 },
    placement: { anchorLocal: { x: 0, z: 180 }, minRadius: 90, maxRadius: 260, bearingRadiusMin: 280, bearingRadiusMax: 500 },
    decision: salvageDecision({
      headline: 'DEEPSURVEY RECOVERY', prompt: 'Choose whether Okar\'s deep-ping returns to service.',
      claimLabel: 'CLAIM DEEPSURVEY', claimConsequence: 'Keep the suite; repeated pings may call the ice again.',
      claimTitle: 'DEEPSURVEY CLAIMED', claimDetail: 'Okar\'s final ping now belongs to your scanner.',
      handoverLabel: 'RETURN TO OBSERVATORY', handoverConsequence: 'Give the suite and its warning to the Rift Observatory.',
      handoverTitle: 'DEEPSURVEY RETURNED', handoverDetail: 'The Observatory filed the third ping as evidence.',
      handoverCredits: 7000, handoverRepDelta: 12,
    }),
    followup: { id: 'deepsurvey_recovered', text: 'DEEPSURVEY PING RETURNS TO SERVICE; RIFT OBSERVATORY ADVISES RESTRAINT.' },
  }),
  wreck({
    id: 'wreck_smokesong', programSlot: 'D9', name: "Ana Tirr's Smokesong", victimLabel: "Tirr's Smokesong",
    wreckClass: 'battlefield', sectorId: 'sector_io_reach', factionId: 'faction_reach',
    scanLabel: 'SMOKESONG · TRACER-FLECHETTE BATTLEFIELD WRECK',
    uniqueDropId: 'unique_smokesong_chaff',
    uniqueDrops: [{ id: 'unique_smokesong_chaff', kind: 'module', baseId: 'mod_chaff_dispenser_m' }],
    bearingSourceRef: 'bar.io_mercenary.smokesong',
    rumorSources: [{ id: 'tirrs_smokesong', sourceRef: 'bar.io_mercenary.smokesong', channelId: 'bar' }],
    provenance: { lossId: 'loss_smokesong', incidentId: 'incident_tirr_tracer_cloud', sourceRef: 'bar.io_mercenary.smokesong', recordType: 'battlefield_loss' },
    hazardContext: { label: 'Mercenary Outpost nebula', anchorType: 'poi', anchorId: 'poi_merc', zoneId: 'zone_io_merc', hazardTypes: ['nebula'], placementRule: 'inside_nebula_near_outpost', approachGate: null },
    salvagePool: { cmdty_scrap_metal: 2 },
    placement: { anchorLocal: { x: 1280, z: 620 }, minRadius: 100, maxRadius: 340, bearingRadiusMin: 260, bearingRadiusMax: 460 },
    decision: salvageDecision({
      headline: 'SMOKESONG RECOVERY', prompt: 'Choose whether Tirr\'s smoke joins your countermeasures.',
      claimLabel: 'CLAIM SMOKESONG', claimConsequence: 'Keep the broad chaff cloud and its long reset.',
      claimTitle: 'SMOKESONG CLAIMED', claimDetail: 'Tracer flechettes were cut free before installation.',
      handoverLabel: 'RETURN TO THE MERCS', handoverConsequence: 'Return the dispenser to Tirr\'s old outpost.',
      handoverTitle: 'SMOKESONG RETURNED', handoverDetail: 'The mercenaries put her name back over the berth.',
      handoverCredits: 6200, handoverRepDelta: 10,
    }),
    followup: { id: 'smokesong_recovered', text: 'SMOKESONG CHAFF RECOVERED; CUSTOMS TRACER LOT REMAINS UNACCOUNTED.' },
  }),
  wreck({
    id: 'wreck_choir_tender', programSlot: 'D10', name: 'Relief-Freighter Choir-Tender', victimLabel: 'Choir-Tender',
    wreckClass: 'fresh', sectorId: 'sector_helios_prime', factionId: 'faction_choir',
    scanLabel: 'RELIEF-FREIGHTER CHOIR-TENDER · REACTOR LEAK',
    uniqueDropId: 'unique_knitbots',
    uniqueDrops: [{ id: 'unique_knitbots', kind: 'module', baseId: 'mod_repair_nanobots_m' }],
    bearingSourceRef: 'news.tragedy_at_helios',
    rumorSources: [{ id: 'tragedy_at_helios', sourceRef: 'news.tragedy_at_helios', channelId: 'news' }],
    provenance: { lossId: 'loss_choir_tender', incidentId: 'incident_helios_relief_reactor', sourceRef: 'news.tragedy_at_helios', recordType: 'fresh_civilian_loss' },
    hazardContext: { label: 'Helios outer yard', anchorType: 'sector', anchorId: 'sector_helios_prime', zoneId: 'zone_helios_core', hazardTypes: [], placementRule: 'near_spawn_outer_yard', approachGate: null },
    complications: [
      { id: 'choir_tender_reactor_leak', kind: 'reactor', trigger: 'wreck_fixed', gentle: true },
      { id: 'choir_tender_investigator', kind: 'report_or_loot', trigger: 'salvaged', factionId: 'faction_scn' },
    ],
    bonusCargo: [{ commodityId: 'cmdty_medical', qty: 50 }], reactor: { timerS: 60, damage: 12 },
    placement: { anchorLocal: { x: 0, z: 0 }, minRadius: 700, maxRadius: 920, bearingRadiusMin: 260, bearingRadiusMax: 420 },
    decision: salvageDecision({
      headline: 'CHOIR-TENDER RECOVERY CLAIM',
      prompt: 'Choose who receives the relief freighter\'s surviving systems.',
      claimLabel: 'CLAIM KNITBOTS',
      claimConsequence: 'Keep the unique repair swarm and recovered medical cargo; SCN records an adverse salvage claim.',
      claimTitle: 'KNITBOTS CLAIMED',
      claimDetail: 'Choir-Tender repair swarm and relief cargo entered your manifest.',
      handoverLabel: 'RETURN RELIEF CLAIM',
      handoverConsequence: 'Return the intact systems to SCN relief control for payment and standing.',
      handoverTitle: 'RELIEF CLAIM RETURNED',
      handoverDetail: 'SCN relief control accepted the Choir-Tender recovery manifest.',
      handoverCredits: 3200, claimRepDelta: -6, handoverRepDelta: 12,
    }),
    followup: { id: 'choir_tender_recovered', text: 'CHOIR-TENDER RECOVERED; RELIEF CARGO CLAIM FILED BY INDEPENDENT PILOT.' },
  }),
  wreck({
    id: 'wreck_mts_silver_draft', programSlot: 'D11', name: 'Courier MTS Silver-Draft', victimLabel: 'MTS Silver-Draft',
    wreckClass: 'fresh', sectorId: 'sector_helios_prime', factionId: 'faction_mts',
    scanLabel: 'MTS SILVER-DRAFT · COURIER WRECK · CLEANER INBOUND',
    uniqueDropId: 'unique_truesight_scanner',
    uniqueDrops: [
      { id: 'unique_lost_ledger', kind: 'story_commodity', name: 'Lost Ledger', flagKey: 'uniqueWreck.lostLedger', qty: 1, choices: ['sell_meridian', 'file_concord', 'publish_independent'] },
      { id: 'unique_truesight_scanner', kind: 'module', baseId: 'mod_cargo_scanner_s' },
    ],
    bearingSourceRef: 'bar.helios_meridian.silver_draft',
    rumorSources: [{ id: 'silver_draft_clerk', sourceRef: 'bar.helios_meridian.silver_draft', channelId: 'bar' }],
    provenance: { lossId: 'loss_mts_silver_draft', incidentId: 'incident_silver_draft_ledger', sourceRef: 'bar.helios_meridian.silver_draft', recordType: 'courier_loss' },
    hazardContext: { label: 'Helios outer field', anchorType: 'sector', anchorId: 'sector_helios_prime', zoneId: null, hazardTypes: [], placementRule: 'outer_field', approachGate: null },
    complications: [{
      id: 'silver_draft_cleaner',
      kind: 'cleaner_pursuit',
      trigger: 'bearing_recorded',
      role: 'meridian_cleaner',
      encounterRef: 'unique_wreck_silver_draft_cleaner',
    }],
    encounterRefs: ['unique_wreck_silver_draft_cleaner'],
    seededTimers: [{ id: 'silver_draft_cleaner', trigger: 'bearing_recorded', minS: 180, maxS: 300, seedSalt: 'wreck_mts_silver_draft:cleaner:v1', clock: 'sim_time' }],
    placement: { anchorLocal: { x: 0, z: 0 }, minRadius: 1350, maxRadius: 1850, bearingRadiusMin: 320, bearingRadiusMax: 520 },
    decision: salvageDecision({
      headline: 'SILVER-DRAFT LEDGER CLAIM', prompt: 'Choose whether the ledger leaves with you or the cleaner.',
      claimLabel: 'CLAIM LEDGER + TRUESIGHT', claimConsequence: 'Keep the evidence and scanner; three buyers will ask what truth costs.',
      claimTitle: 'LOST LEDGER CLAIMED', claimDetail: 'The ledger and Truesight scanner entered your manifest.',
      handoverLabel: 'LET THE CLEANER FILE IT', handoverConsequence: 'Surrender the courier record before its deadline.',
      handoverTitle: 'LEDGER SANITIZED', handoverDetail: 'Meridian paid for a record it now denies existed.',
      handoverCredits: 8400, handoverRepDelta: 12,
    }),
    followup: { id: 'silver_draft_recovered', text: 'SILVER-DRAFT LEDGER MISSED SANITIZATION; THREE BUYERS DENY INTEREST.' },
  }),
  wreck({
    id: 'wreck_choir_cassandra', programSlot: 'D12', name: 'Diplomat-Yacht Choir-Cassandra', victimLabel: 'Choir-Cassandra',
    wreckClass: 'fresh', sectorId: 'sector_haumea_rift', factionId: 'faction_choir',
    scanLabel: 'CHOIR-CASSANDRA · DIPLOMATIC WRECK · TREATY DATA LIVE',
    uniqueDropId: 'unique_quietcloak',
    uniqueDrops: [
      { id: 'unique_cassandra_treaty', kind: 'story_data', name: 'Cassandra Treaty', flagKey: 'uniqueWreck.cassandraTreaty', unlockFlag: 'crossRep.choirVaelTreaty' },
      { id: 'unique_quietcloak', kind: 'module', baseId: 'mod_cloak_mk2' },
    ],
    bearingSourceRef: 'campaign.cassandra_reveal',
    rumorSources: [{ id: 'cassandra_thread_reveal', sourceRef: 'campaign.cassandra_reveal', channelId: 'campaign' }],
    provenance: { lossId: 'loss_choir_cassandra', incidentId: 'incident_cassandra_treaty_sabotage', sourceRef: 'campaign.cassandra_reveal', recordType: 'diplomatic_loss' },
    hazardContext: { label: 'Ice Fissure Signal', anchorType: 'poi', anchorId: 'poi_haumea_fissure', zoneId: 'zone_haumea_fissure', hazardTypes: ['dense_asteroid', 'anomaly_deep'], placementRule: 'inside_ice_fissure', approachGate: null },
    complications: [{
      id: 'cassandra_hardliners',
      kind: 'story_reward_pursuit',
      trigger: 'story_reward_granted',
      requiredRewardId: 'unique_cassandra_treaty',
      factionIds: ['faction_choir', 'faction_vael'],
      encounterRef: 'unique_wreck_cassandra_hardliners',
    }],
    encounterRefs: ['unique_wreck_cassandra_hardliners'],
    placement: { anchorLocal: { x: 0, z: 180 }, minRadius: 280, maxRadius: 460, bearingRadiusMin: 300, bearingRadiusMax: 520 },
    decision: salvageDecision({
      headline: 'CASSANDRA TREATY CLAIM', prompt: 'Choose whether the peace draft travels or disappears.',
      claimLabel: 'CLAIM TREATY + QUIETCLOAK', claimConsequence: 'Keep the proof and unlock a Choir–Vael cross-reputation path; hardliners will follow.',
      claimTitle: 'CASSANDRA TREATY CLAIMED', claimDetail: 'The draft and cloak telemetry survived together.',
      handoverLabel: 'RETURN DIPLOMATIC CUSTODY', handoverConsequence: 'Surrender the draft before either hardline wing can burn it.',
      handoverTitle: 'TREATY RETURNED', handoverDetail: 'Diplomatic custody accepted a peace neither side admits drafting.',
      handoverCredits: 11000, handoverRepDelta: 16,
    }),
    followup: { id: 'cassandra_recovered', text: 'CASSANDRA TREATY SURVIVES; CHOIR AND VAEL HARDLINERS DENY THE DRAFT.' },
  }),
];

export const UNIQUE_WRECKS = deepFreeze(RAW_UNIQUE_WRECKS);
const UNIQUE_WRECK_BY_ID = new Map(UNIQUE_WRECKS.map((entry) => [entry.id, entry]));
const UNIQUE_WRECK_BY_SOURCE = new Map();
const UNIQUE_WRECK_BY_DROP = new Map();
for (const def of UNIQUE_WRECKS) {
  for (const source of def.rumorSources) UNIQUE_WRECK_BY_SOURCE.set(source.sourceRef, def);
  for (const drop of def.uniqueDrops) UNIQUE_WRECK_BY_DROP.set(drop.id, def);
}

export function uniqueWreckById(id) {
  return UNIQUE_WRECK_BY_ID.get(id) || null;
}

export function uniqueWreckForSource(sourceRef) {
  return UNIQUE_WRECK_BY_SOURCE.get(sourceRef) || null;
}

export function uniqueWreckForDrop(dropId) {
  return UNIQUE_WRECK_BY_DROP.get(dropId) || null;
}

export function programSeedFor(metaSeed) {
  return hash32((Number(metaSeed) >>> 0) || 1, PROGRAM_SEED_LABEL) || 1;
}

function rounded(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function point(x, z) {
  return Object.freeze({ x: rounded(x), z: rounded(z) });
}

/** Pure deterministic placement and non-exact bearing geometry for one authored wreck. */
export function placementForUniqueWreck(programSeed, wreckId, sectorId) {
  const def = uniqueWreckById(wreckId);
  if (!def) throw new RangeError(`Unknown unique wreck: ${wreckId}`);
  if (sectorId !== def.sectorId) throw new RangeError(`${wreckId} belongs to ${def.sectorId}, not ${sectorId}`);
  const seed = hash32((Number(programSeed) >>> 0) || 1, wreckId, sectorId) || 1;
  const rng = mulberry32(seed);
  const profile = def.placement;
  const anchor = profile.anchorLocal || { x: 0, z: 0 };
  const angle = rng() * Math.PI * 2;
  const distance = profile.minRadius + rng() * (profile.maxRadius - profile.minRadius);
  const exactLocal = point(anchor.x + Math.cos(angle) * distance, anchor.z + Math.sin(angle) * distance);
  const radius = rounded(profile.bearingRadiusMin + rng() * (profile.bearingRadiusMax - profile.bearingRadiusMin));
  const offsetAngle = angle + (0.35 + rng() * 0.75) * (rng() < 0.5 ? -1 : 1);
  const offsetDistance = radius * (0.38 + rng() * 0.28);
  const bearingCenterLocal = point(
    exactLocal.x + Math.cos(offsetAngle) * offsetDistance,
    exactLocal.z + Math.sin(offsetAngle) * offsetDistance,
  );
  const exactGlobalRaw = sectorLocalToGlobalForSector(exactLocal, sectorId);
  const centerGlobalRaw = sectorLocalToGlobalForSector(bearingCenterLocal, sectorId);
  return deepFreeze({
    coordSpace: 'global_v1', seed, sectorId, exactLocal,
    exactGlobal: point(exactGlobalRaw.x, exactGlobalRaw.z),
    bearingCenterLocal,
    bearingCenterGlobal: point(centerGlobalRaw.x, centerGlobalRaw.z),
    radius,
  });
}

/** Normalize an authored loss into the class/provenance shape consumed by T4c readers. */
export function promoteToAuthored(lossLike) {
  const input = lossLike && typeof lossLike === 'object' ? lossLike : {};
  const def = uniqueWreckById(input.authoredWreckId || input.wreckId || null);
  if (!def) return null;
  const cls = wreckClassById(def.wreckClass) || {};
  return deepFreeze({
    markerId: `authored:${def.id}`,
    authoredRef: def.id,
    parentType: def.wreckClass === 'military' ? 'military' : 'ship',
    wreckClass: def.wreckClass,
    wreckClassLabel: cls.label || def.wreckClass,
    wreckClassBlurb: cls.blurb || '',
    scanLabel: def.scanLabel || cls.scanLabel || def.name,
    victimLabel: def.victimLabel,
    quiet: true,
    provenance: {
      source: 'authored-unique',
      authoredWreckId: def.id,
      lossId: input.lossId || def.provenance.lossId,
      incidentId: input.incidentId || def.provenance.incidentId,
      sectorId: input.sectorId || def.sectorId,
      factionId: input.factionId || def.factionId || null,
      sourceRef: input.sourceRef || def.provenance.sourceRef || def.bearingSourceRef,
      recordType: def.provenance.recordType,
    },
  });
}

export function validateUniqueWreckRegistry() {
  const errors = [];
  const ids = new Set();
  const slots = new Set();
  const sources = new Set();
  const drops = new Set();
  const channels = new Set();
  for (const def of UNIQUE_WRECKS) {
    if (!def.id || ids.has(def.id)) errors.push(`duplicate/missing wreck id ${def.id || '<empty>'}`);
    if (!/^D(?:[1-9]|1[0-2])$/.test(def.programSlot || '') || slots.has(def.programSlot)) errors.push(`duplicate/invalid program slot ${def.programSlot || '<empty>'}`);
    ids.add(def.id);
    slots.add(def.programSlot);
    if (!def.sectorId || !def.wreckClass || !def.uniqueDropId) errors.push(`${def.id}: incomplete authored identity`);
    if (!def.hazardContext || !def.hazardContext.placementRule) errors.push(`${def.id}: missing hazard context`);
    if (!def.provenance || !def.provenance.lossId || !def.provenance.sourceRef) errors.push(`${def.id}: incomplete provenance`);
    if (!Array.isArray(def.uniqueDrops) || !def.uniqueDrops.length) errors.push(`${def.id}: no unique drops`);
    for (const drop of def.uniqueDrops || []) {
      if (!drop.id || drops.has(drop.id)) errors.push(`${def.id}: duplicate/missing unique drop ${drop.id || '<empty>'}`);
      drops.add(drop.id);
      if (['weapon', 'module'].includes(drop.kind) && !drop.baseId) errors.push(`${def.id}.${drop.id}: missing base item`);
      if (drop.kind.startsWith('story_') && !drop.flagKey) errors.push(`${def.id}.${drop.id}: missing durable story flag`);
    }
    if (!(def.uniqueDrops || []).some((drop) => drop.id === def.uniqueDropId)) errors.push(`${def.id}: primary drop is not in uniqueDrops`);
    if (!def.decision || !Array.isArray(def.decision.choices) || def.decision.choices.length < 2) {
      errors.push(`${def.id}: missing salvage decision`);
    } else {
      const choiceIds = new Set();
      for (const choice of def.decision.choices) {
        if (!choice.id || choiceIds.has(choice.id)) errors.push(`${def.id}: duplicate/missing decision id ${choice.id || '<empty>'}`);
        choiceIds.add(choice.id);
        if (!choice.label || !choice.consequence || !choice.outcome || !choice.receiptTitle || !choice.receiptDetail) errors.push(`${def.id}.${choice.id}: incomplete decision language`);
      }
    }
    if (!Array.isArray(def.rumorSources) || !def.rumorSources.length) errors.push(`${def.id}: no rumor sources`);
    for (const source of def.rumorSources || []) {
      if (!source.sourceRef || sources.has(source.sourceRef)) errors.push(`${def.id}: duplicate/missing source ${source.sourceRef || '<empty>'}`);
      sources.add(source.sourceRef);
      channels.add(source.channelId);
    }
    if (!(def.rumorSources || []).some((source) => source.sourceRef === def.bearingSourceRef)) errors.push(`${def.id}: bearing source is not authored`);
    const placement = def.placement || {};
    if (!(placement.minRadius > 0 && placement.maxRadius > placement.minRadius)) errors.push(`${def.id}: invalid placement radius`);
    if (!(placement.bearingRadiusMin > 0 && placement.bearingRadiusMax > placement.bearingRadiusMin)) errors.push(`${def.id}: invalid bearing radius`);
    if (!placement.anchorLocal || !Number.isFinite(placement.anchorLocal.x) || !Number.isFinite(placement.anchorLocal.z)) errors.push(`${def.id}: invalid placement anchor`);
    if (!def.followup || !def.followup.id || !def.followup.text) errors.push(`${def.id}: missing recovery followup`);
  }
  if (slots.size !== 12) errors.push(`expected D1-D12, found ${slots.size} slots`);
  for (const channel of REQUIRED_RUMOR_CHANNELS) if (!channels.has(channel)) errors.push(`missing rumor channel ${channel}`);
  return { ok: errors.length === 0, errors };
}

export default UNIQUE_WRECKS;
