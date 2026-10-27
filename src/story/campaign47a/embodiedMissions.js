// Physical/default-route embodiment for Campaign 47-A.
// Pure data and builders only: missions owns boards/cursor/rewards, story owns overlay/endings,
// encounterDirector owns encounters, and aftermathWrecks owns battle residue.

import { hash32 } from '../../core/rng.js';
import { reckoningCallbacks } from './reckoningCallbacks.js';
import {
  BRANCH_HEADLINE_VERBS as LIVE_BRANCH_HEADLINE_VERBS,
  PQ032_BEAT_SET_PIECES,
  STORY_BEATS,
} from '../../data/missions.js';
import {
  BRANCH_CHAIN,
  BRANCH_FACTION,
  BRANCH_HEADLINE_VERBS,
  BRANCH_IDS,
  CAMPAIGN_BEATS,
  ENDGAME_NET_WORTH_CR,
  ENDGAME_REP_MIN,
  FAIL_RECOVERY_COOLDOWN_S,
  STORY_BRANCH_INTRO_TAG,
} from './campaignData.js';
import { ENDING_DEFS } from '../endings/endingDefs.js';
import { adjustBoardOffer } from './storySpine.js';
import { getBeatStepStatus } from './campaignTransitions.js';

export const EMBODIED_MISSIONS_ID = 'campaign47a.embodiedMissions.v2';
export const EMBODIED_MISSIONS_SCHEMA_VERSION = 2;
export const STORY_CONTRACT_PREFIX = 'campaign47a:';
export const AFTERMATH_RECORD_KIND = 'battle_wreck';

export const CANONICAL_CONTACT_SIGNALS = Object.freeze([
  'mining:yield', 'dock:docked', 'economy:tradeCompleted', 'scan:completed',
  'tether:reel', 'entity:killed',
  'ship:purchased', 'mission:accepted', 'mission:completed', 'mission:failed',
  'mission:offered', 'asset:deployed', 'encounter:spawned', 'encounter:resolved',
  'automation:programAssigned',
  // W-BOOKS-0-2: the Books 0–2 book-list signals — emitted by the live systems named on
  // each step (skim scene, Kessler scale pad, Understory gardens, furnace intake,
  // Rook's booth, encounter director).
  'story:skimResolved', 'kesslerPod:weighed',
  'understory:playerGrowth',
  'rookWreck:delivered', 'furnace:fed',
  // W-BOOKS-3-4: the Gate Audit welds are world-pressure evidence steps recorded
  // optionally while Books 3–4 run (worldPressure owns the schedule).
  'worldPressure:auditAnnounced', 'worldPressure:gateClosed',
]);

export const CANONICAL_INTENT_EVENTS = Object.freeze([
  'economy:grantCredits', 'economy:chargeCredits', 'faction:repDelta', 'heat:clear',
  'sectorsim:impulse',
]);

export const NAMED_CAPTAIN_IDS = Object.freeze([
  'cap_sable_iask', 'cap_redcut_sorrel', 'cap_vane_ash',
]);
export const ENCOUNTER_SHAPE_IDS = Object.freeze(['named_hunter']);
export const CAREER_IDS = Object.freeze(['hauler', 'hunter', 'prospector']);

const B = (value) => Object.freeze(value);
const BIGGER_BOAT_ROUTES = B({
  custody: B({
    id: 'evidence_warrant', stationId: 'station_helios', sectorId: 'sector_helios_prime',
    label: 'Helios Evidence Yard',
    instruction: 'Dock at Helios; buy a tier-two hull under the evidence warrant',
  }),
  force: B({
    id: 'combat_refit', stationId: 'station_tethys', sectorId: 'sector_tethys_junction',
    label: 'Tethys Refit Yard',
    instruction: "Dock at Tethys; buy a tier-two hull from Slate's yard",
  }),
});
const PICK_SIDE_STAKES = B({
  custody: B({
    id: 'evidence_patrol', branch: 'patrol', factionId: 'faction_scn', type: 'patrol_clear',
    stationId: 'station_coalition', sectorId: 'sector_helios_prime', label: 'Coalition Evidence Patrol',
    instruction: 'Accept and complete the Coalition evidence patrol',
  }),
  force: B({
    id: 'manifest_charter', branch: 'traders', factionId: 'faction_mts', type: 'bulk_trade',
    stationId: 'station_tethys', sectorId: 'sector_tethys_junction', label: 'Meridian Liability Charter',
    instruction: 'Accept and complete the Meridian liability charter',
  }),
});
const EMPIRE_SEED_PROGRAMS = B({
  custody: B({ id: 'custody_watch', templateId: 'patrol_guard', label: 'Custody Watch Drone' }),
  force: B({ id: 'force_logistics', templateId: 'mine_to_depot', label: 'Manifest Logistics Drone' }),
});
// PQ-032.02 — the Deep Reach climax is a toy. One linear spine, three branch verbs,
// two solutions each. Patrol runs a blockade, traders siege with a wrecking ball,
// free captains tow the evidence. Elroy still only chooses which door was earned.
const DEEP_REACH_CLIMAX = B({
  patrol: B({
    id: 'ashfall_blockade', type: 'authored_set_piece', stationId: 'station_ashcache',
    factionId: 'faction_scn', label: 'Deep Reach Blockade',
    instruction: 'Run the Deep Reach blockade. Park the hulk on the Ashfall approach, or swing it through the wedge.',
    headlineVerb: 'jam', authoredSetPieceId: 'station_door_jam', physicalVerb: 'jam',
    completionMethods: B(['park_the_hulk', 'swing_the_wedge']), primaryRole: 'jam_hulk',
  }),
  traders: B({
    id: 'ashfall_siege', type: 'demolition', stationId: 'station_ashcache',
    factionId: 'faction_mts', label: 'Deep Reach Siege',
    instruction: 'Siege the Deep Reach tower. Swing mass through it, or cut it down.',
    headlineVerb: 'knock', authoredSetPieceId: 'wrecking_ball', physicalVerb: 'knock_down',
    completionMethods: B(['wrecking_ball', 'cut_down']), primaryRole: 'demolition_tower',
  }),
  free: B({
    id: 'ashfall_evidence_tow', type: 'tow_recovery', stationId: 'station_ashcache',
    factionId: 'faction_free', label: 'Deep Reach Evidence Tow',
    instruction: 'Tow the Deep Reach evidence core into the cache, or sling it in.',
    headlineVerb: 'tow', authoredSetPieceId: 'long_tow', physicalVerb: 'tow',
    completionMethods: B(['tow_in', 'sling_in']), primaryRole: 'slag_core',
  }),
});

export const EMBODIED_MISSIONS = Object.freeze([
  B({
    beat: 0, id: 'cold_start', contactId: 'contact_kessler', contactName: 'Kessler',
    headlineVerb: 'mine',
    location: B({ sectorId: 'sector_helios_prime', stationId: 'station_helios', fieldId: 'f_helios_starter' }),
    physicalContact: B({ mode: 'ordered_and', steps: B([
      B({ id: 'mine', signal: 'mining:yield', accept: B(['mining:yield', 'mining.yield']) }),
      B({ id: 'skim', signal: 'story:skimResolved', accept: B(['story:skimResolved']), requiresPrior: B(['mine']) }),
      B({ id: 'dock', signal: 'dock:docked', accept: B(['dock:docked']), requiresPrior: B(['mine', 'skim']) }),
    ]) }),
    missionBoardContract: null,
    recovery: 'Manifest still open. Sample again, then re-dock Helios.',
    careerIds: B(['prospector']),
  }),
  B({
    beat: 1, id: 'honest_work', contactId: 'contact_kessler', contactName: 'Kessler',
    headlineVerb: 'weigh', setPiece: 'weighing + infested hauler furnace disposal',
    location: B({ sectorId: 'sector_helios_prime', stationId: 'station_helios', destSectorId: 'sector_tethys_junction', destStationId: 'station_tethys' }),
    physicalContact: B({ mode: 'mission', steps: B([
      B({ id: 'alloy_run', signal: 'mission:completed', accept: B(['mission:completed']) }),
      B({ id: 'scale_4', signal: 'kesslerPod:weighed', accept: B(['kesslerPod:weighed']) }),
      B({ id: 'infested', signal: 'mission:completed', accept: B(['mission:completed']) }),
    ]) }),
    // W-BOOKS-0-2 (§34.7 Book 1): the book posts the 06 mission list in order — the sealed
    // alloy run, then the furnace detail after the Scale 4 variance is weighed. The next
    // pending contract is selected from the sidecar's step log in buildMissionBoardContract.
    bookContracts: B([
      B({
        stepId: 'alloy_run',
        type: 'cargo_delivery', storyTag: 'campaign47a:b1:alloy_run',
        title: 'Weigh-In — sealed alloy delivery',
        brief: 'Sealed manifest. Carry the crate to the receiving station intact; compare the manifest on arrival.',
        factionId: 'faction_mts',
        stationId: 'station_helios', destStationId: 'station_tethys', destSectorId: 'sector_tethys_junction',
        reward_cr: 600, collateral_cr: 0, riskTier: 1, minRep: -149, time_limit_s: 0,
        preloadedCargo: true,
        params: B({
          physicalVerb: 'weigh',
          completionMethods: B(['sealed_delivery', 'partial_settle']),
          bookScene: 'alloy_run',
          cmdtyId: 'cmdty_alloys', qty: 6, manifestName: 'SEALED ALLOYS — 47-A RESERVE',
          silentRecat: true,
        }),
      }),
      B({
        stepId: 'infested',
        type: 'patrol_clear', storyTag: 'campaign47a:b1:infested',
        title: 'Furnace Detail — the infested hauler',
        brief: 'DMC wants four repair-mite sites cleared at the Ceres refinery before the hauler lots are settled. These mites mend wrecks; they are not fighters. Use carefully placed frag blasts, then tow or fling the three marked ore pods into the open CR-FEED ring. Blasts can also kill Casket worms nearby. Buy frag and Load it in Shipworks at Tethys or Helios before departure, or return there to rearm. Delivered lots pay 160 credits each; destroyed lots are recorded as losses, not deliveries. Clearing the site with all cargo lost advances the job without cargo pay.',
        factionId: 'faction_dmc',
        stationId: 'station_tethys', destStationId: 'station_ceres', destSectorId: 'sector_ceres_belt',
        reward_cr: 480, collateral_cr: 0, riskTier: 1, minRep: -149, time_limit_s: 0,
        params: B({
          physicalVerb: 'burn',
          completionMethods: B(['mites_then_furnace', 'furnace_then_mites']),
          bookScene: 'infested_hauler',
          furnaceWorksiteVersion: 1, clearCount: 4, mitesNeeded: 4, furnaceFeedsNeeded: 3,
          targetStrength: 1.1, fValue: 1.1, taskTime: 60,
        }),
      }),
    ]),
    missionBoardContract: null,
    recovery: 'Honest work still on the board. The book re-posts the next job.',
    careerIds: B(['hunter', 'hauler']),
  }),
  B({
    beat: 2, id: 'first_blood', contactId: 'contact_rook', contactName: 'Rook',
    headlineVerb: 'hunt', setPiece: 'cinder board + compost + nest + elroy',
    location: B({ sectorId: 'sector_tethys_junction', stationId: 'station_tethys', destSectorId: 'sector_charon_expanse', destStationId: 'station_expanse', zoneId: 'zone_charon_ambush' }),
    physicalContact: B({ mode: 'mission', steps: B([
      B({ id: 'cinder_board', signal: 'mission:completed', accept: B(['mission:completed']) }),
      B({ id: 'compost', signal: 'understory:playerGrowth', accept: B(['understory:playerGrowth']) }),
      B({ id: 'nest', signal: 'encounter:resolved', accept: B(['encounter:resolved']) }),
      B({ id: 'elroy', signal: 'mission:completed', accept: B(['mission:completed']) }),
    ]) }),
    // W-BOOKS-0-2 (§34.7 Book 2): the board posts the cinder marks first; the Compost Run and
    // the Nest play as world work in between; the named register contract is posted last.
    bookContracts: B([
      B({
        stepId: 'cinder_board',
        type: 'patrol_clear', storyTag: 'campaign47a:b2:cinder',
        title: 'Hunt the lane — cinder marks',
        brief: 'Accept at Tethys, then fly to Charon: Cinder One, Two and Three hold the Ashfall approach. Clear all three and tow one of their actual hulls to Rook’s 100-WU ring at Expanse, at rest (8 WU/s or less). Either order. Keep a hull intact; if all three are destroyed or stripped, clearance files for no contract pay. Next: the Compost Run.',
        factionId: 'faction_scn',
        stationId: 'station_tethys', destStationId: 'station_expanse', destSectorId: 'sector_charon_expanse',
        reward_cr: 700, collateral_cr: 0, riskTier: 2, minRep: -149, time_limit_s: 0,
        params: B({
          physicalVerb: 'hunt',
          completionMethods: B(['clear_and_tow', 'tow_under_fire']),
          bookScene: 'cinder_board',
          cinderRouteVersion: 1,
          clearCount: 3, waspsNeeded: 3, rookDeliveryNeeded: 1,
          targetStrength: 1.3, fValue: 1.3, taskTime: 70,
        }),
      }),
      B({
        stepId: 'elroy',
        type: 'bounty_hunt', storyTag: 'campaign47a:b2:elroy',
        title: 'Registry Writ — vessel unknown',
        brief: 'A marked vessel holds station off the Ashfall approach. Scan before firing; the register decides what the wreck is worth.',
        factionId: 'faction_scn',
        stationId: 'station_tethys', destStationId: 'station_expanse', destSectorId: 'sector_charon_expanse',
        reward_cr: 800, collateral_cr: 0, riskTier: 2, minRep: -149, time_limit_s: 0,
        storyTarget: B({
          id: 'npc_elroy', name: 'Elroy', label: 'UNKNOWN VESSEL', archetype: 'wasp_swarmer',
          factionId: 'faction_free', role: 'register_mark', zoneId: 'zone_charon_ambush',
          registry: 'CIVILIAN VESSEL — REGISTERED',
          lastRegisteredOwner: 'PIT ENGINEERING — MAINTENANCE',
          salvageCargo: 'SEALED MEDICINE — PIT RATION LOT',
        }),
        params: B({
          physicalVerb: 'hunt',
          completionMethods: B(['terminal_register_kill', 'custody_reel']),
          bookScene: 'elroy_register',
          clearCount: 1,
          targetStrength: 1.0, fValue: 1.2, taskTime: 60,
        }),
      }),
    ]),
    missionBoardContract: null,
    recovery: 'The board still holds. The book re-posts the next job.',
    careerIds: B(['hunter']),
    aftermath: B({ owner: 'aftermathWrecks', source: 'entity:killed', sectorId: 'sector_charon_expanse', zoneId: 'zone_charon_ambush' }),
  }),
  B({
    beat: 3, id: 'bigger_boat', contactId: 'contact_slate', contactName: 'Slate',
    headlineVerb: 'tow', setPiece: 'variance adjustment + feed the maw + foreman',
    location: B({ sectorId: 'sector_tethys_junction', stationId: 'station_tethys', destSectorId: 'sector_ceres_belt', destStationId: 'station_ceres' }),
    consequenceRoutes: BIGGER_BOAT_ROUTES,
    physicalContact: B({ mode: 'mission', steps: B([
      B({ id: 'delivery', signal: 'mission:completed', accept: B(['mission:completed']) }),
      B({ id: 'feed_the_maw', signal: 'mission:completed', accept: B(['mission:completed']), requiresPrior: B(['delivery']) }),
      B({ id: 'foreman', signal: 'mission:completed', accept: B(['mission:completed']), requiresPrior: B(['delivery']) }),
      B({ id: 'gate_audit_kepler', signal: 'worldPressure:gateClosed', accept: B(['worldPressure:auditAnnounced', 'worldPressure:gateClosed']), optional: true }),
    ]) }),
    // W-BOOKS-3-4 (§34.7 Book 3): the book posts Slate's yard list in order — delivery of
    // VARIANCE ADJUSTMENT (the Hawser-class tug, seam honest to the fourth strain spike),
    // then Feed the Maw on the reactor approach, then the Mirrorjaw Foreman's yard feud.
    bookContracts: B([
      B({
        stepId: 'delivery',
        type: 'tow_recovery', storyTag: 'campaign47a:b3:berth',
        title: 'Tow the slag core',
        brief: 'Delivery run for Slate\u2019s yard. Keep the core on the line into the yard, or sling it in — the Hawser seam reads honest: it holds three spikes and lets go at the fourth.',
        factionId: 'faction_dmc',
        stationId: 'station_tethys', destStationId: 'station_ceres', destSectorId: 'sector_ceres_belt',
        reward_cr: 1000, collateral_cr: 0, riskTier: 1, minRep: -149, time_limit_s: 0,
        params: B({
          physicalVerb: 'tow',
          completionMethods: B(['tow_in', 'sling_in']),
          authoredSetPieceId: 'long_tow',
          bookScene: 'variance_delivery',
          massU: 36, cargoValue: 792, fValue: 1.1, taskTime: 40,
        }),
      }),
      B({
        stepId: 'feed_the_maw',
        type: 'tow_recovery', storyTag: 'campaign47a:b3:maw',
        title: 'Feed the maw',
        brief: 'A Furnace maw hunts the Ceres reactor approach. Stun it with hot slag — three solid hits — then tow it out of the lane to the yard, or sling it in.',
        factionId: 'faction_dmc',
        stationId: 'station_tethys', destStationId: 'station_ceres', destSectorId: 'sector_ceres_belt',
        reward_cr: 900, collateral_cr: 0, riskTier: 2, minRep: -149, time_limit_s: 0,
        params: B({
          physicalVerb: 'tow',
          completionMethods: B(['tow_in', 'sling_in']),
          authoredSetPieceId: 'long_tow',
          bookScene: 'feed_the_maw',
          furnaceMaw: true,
          scanLabel: 'FURNACE MAW',
          mawStunsNeeded: 3,
          massU: 120, bodyRadius: 24, cargoValue: 0, fValue: 1.4, taskTime: 60,
        }),
      }),
      B({
        stepId: 'foreman',
        type: 'capital_boss', storyTag: 'campaign47a:b3:foreman',
        title: 'The Foreman — yard feud',
        brief: 'The Mirrorjaw Foreman holds the yard lane and calls every weld an unpaid debt. Put mass through the plated prow or outgun the stern.',
        factionId: 'faction_dmc',
        stationId: 'station_tethys', destStationId: 'station_forge', destSectorId: 'sector_vesta_forge',
        reward_cr: 2200, collateral_cr: 0, riskTier: 3, minRep: -149, time_limit_s: 0,
        params: B({
          physicalVerb: 'throw',
          completionMethods: B(['throw_the_capital', 'outgun_the_capital']),
          bookScene: 'foreman_feud',
          capitalBossId: 'capital_boss_foreman',
          encounterId: 'capital_boss_foreman',
          fValue: 1.8, taskTime: 80,
        }),
      }),
    ]),
    // Kept for PQ-032 parity + the pre-book legacy tag: leftover `campaign47a:b3:bigger_boat`
    // contracts still settle through the legacy fill in _advanceEmbodiedStoryMission.
    missionBoardContract: B({
      type: 'tow_recovery', storyTag: 'campaign47a:b3:bigger_boat',
      title: 'Tow the slag core', brief: 'Keep the core on the line into the yard, or sling it in.',
      factionId: 'faction_dmc',
      stationId: 'station_tethys', destStationId: 'station_ceres', destSectorId: 'sector_ceres_belt',
      reward_cr: 1000, collateral_cr: 0, riskTier: 1, minRep: -149, time_limit_s: 0,
      params: B({
        physicalVerb: 'tow',
        completionMethods: B(['tow_in', 'sling_in']),
        authoredSetPieceId: 'long_tow',
        massU: 36, cargoValue: 792, fValue: 1.1, taskTime: 40,
      }),
    }),
    recovery: 'The yard still holds the book. The next job re-posts.',
    careerIds: B(['hauler', 'hunter', 'prospector']),
  }),
  B({
    beat: 4, id: 'pick_a_side', contactId: 'contact_vale', contactName: 'V. Director, Acting',
    headlineVerbs: BRANCH_HEADLINE_VERBS,
    location: B({ sectorId: 'sector_helios_prime', stationId: 'station_helios' }),
    consequenceStakes: PICK_SIDE_STAKES,
    physicalContact: B({ mode: 'existing_branch_intro', steps: B([
      B({ id: 'branch_intro_accept', signal: 'mission:accepted', accept: B(['mission:accepted']), requireStoryTag: STORY_BRANCH_INTRO_TAG }),
      B({ id: 'operation', signal: 'mission:completed', accept: B(['mission:completed']), requiresPrior: B(['branch_intro_accept']) }),
      B({ id: 'gate_audit_io', signal: 'worldPressure:gateClosed', accept: B(['worldPressure:auditAnnounced', 'worldPressure:gateClosed']), optional: true }),
    ]) }),
    // W-BOOKS-3-4 (§34.7 Book 4): the intro chooses the door; the door's operation posts
    // next and the book closes on it. One row per branch — buildBookContractOffer picks
    // the run's door. The doubled interdiction contract posts separately (a player
    // choice beside the door, not a book step).
    bookContracts: B([
      B({
        stepId: 'operation', branch: 'traders',
        type: 'escort', storyTag: 'campaign47a:b4:operation',
        title: 'Spine Break — Meridian cargo spine',
        brief: 'Reach is cutting cargo spines in the Tethys rock field. Escort the Meridian train through and re-couple it under fire — the tickers count each drifting container down.',
        factionId: 'faction_mts',
        stationId: 'station_tethys', destStationId: 'station_ceres', destSectorId: 'sector_ceres_belt',
        reward_cr: 1400, collateral_cr: 0, riskTier: 2, minRep: -149, time_limit_s: 0,
        params: B({
          physicalVerb: 'deliver',
          completionMethods: B(['recouple_under_fire', 'hold_the_spine']),
          bookScene: 'spine_break',
          fValue: 1.4, taskTime: 70,
        }),
      }),
      B({
        stepId: 'operation', branch: 'patrol',
        type: 'patrol_clear', storyTag: 'campaign47a:b4:operation',
        title: 'The Weighing — customs weir',
        brief: 'Run the customs weir with Concord. The pack holding the lane flies a Reach flag too perfectly — break the pattern and the flags resolve.',
        factionId: 'faction_scn',
        stationId: 'station_coalition', destStationId: 'station_expanse', destSectorId: 'sector_charon_expanse',
        reward_cr: 1400, collateral_cr: 0, riskTier: 2, minRep: -149, time_limit_s: 0,
        params: B({
          physicalVerb: 'clear',
          completionMethods: B(['break_the_pattern', 'hold_the_weir']),
          bookScene: 'too_perfect_pack',
          clearCount: 3, packUnmask: true,
          targetStrength: 1.4, fValue: 1.4, taskTime: 70,
        }),
      }),
      B({
        stepId: 'operation', branch: 'free',
        type: 'tow_recovery', storyTag: 'campaign47a:b4:operation',
        title: 'Barn Raising — homestead frame',
        brief: 'Six modules, one frame, and the Nereid gate welding on the road behind you. Tow the homestead together before the line strands it.',
        factionId: 'faction_free',
        stationId: 'station_helios', destStationId: 'station_tethys', destSectorId: 'sector_tethys_junction',
        reward_cr: 1400, collateral_cr: 0, riskTier: 2, minRep: -149, time_limit_s: 0,
        params: B({
          physicalVerb: 'tow',
          completionMethods: B(['tow_in', 'sling_in']),
          authoredSetPieceId: 'long_tow',
          bookScene: 'barn_raising',
          scanLabel: 'HOMESTEAD MODULE',
          massU: 24, bodyRadius: 14, cargoValue: 0, fValue: 1.2, taskTime: 50,
        }),
      }),
    ]),
    missionBoardContract: B({ kind: 'existing_branch_intro', storyTag: STORY_BRANCH_INTRO_TAG }),
    recovery: 'Three introductions remain. Choose how you participate.',
    careerIds: B(['hauler', 'hunter', 'prospector']),
  }),
  B({
    beat: 5, id: 'proving_ground', contactId: 'contact_callum', contactName: 'Callum',
    headlineVerbs: BRANCH_HEADLINE_VERBS,
    location: B({ sectorId: 'sector_tethys_junction', stationId: 'station_tethys' }),
    physicalContact: B({ mode: 'chain_count', steps: B([B({ id: 'chain', signal: 'mission:completed', accept: B(['mission:completed']), requireChainComplete: true })]) }),
    missionBoardContract: B({ kind: 'branch_chain', storyTag: 'campaign47a:b5' }),
    recovery: 'The next proving leg remains on the board.',
    careerIds: B(['hauler', 'hunter', 'prospector']),
  }),
  B({
    beat: 6, id: 'empire_seed', contactId: 'contact_vale', contactName: 'Director Vale',
    headlineVerb: 'deploy',
    location: B({ sectorId: 'sector_ceres_belt', stationId: 'station_beltout' }),
    empireSeedPrograms: EMPIRE_SEED_PROGRAMS,
    physicalContact: B({ mode: 'ordered_and', steps: B([
      B({ id: 'asset', signal: 'asset:deployed', accept: B(['asset:deployed']) }),
      B({ id: 'program', signal: 'automation:programAssigned', accept: B(['automation:programAssigned']), requiresPrior: B(['asset']) }),
    ]) }),
    missionBoardContract: null, recovery: 'The plot remains free. Deploy any passive asset.',
    careerIds: B(['hauler', 'hunter', 'prospector']),
  }),
  B({
    beat: 7, id: 'deep_reach', contactId: 'contact_kurtz', contactName: 'Kurtz',
    // Physical place required: Deep Reach operation (missions) then Ashfall dock/desk (story flags).
    // Net-worth/rep remain eligibility for the disposition offer, not a substitute for place.
    location: B({ sectorId: 'sector_ashfall_reach', stationId: 'station_ashcache', poiId: 'poi_boss' }),
    physicalContact: B({
      mode: 'ordered_and',
      steps: B([
        B({ id: 'operation', signal: 'mission:completed', accept: B(['mission:completed']) }),
        B({
          id: 'ashfall_dock',
          signal: 'dock:docked',
          accept: B(['dock:docked']),
          requiresPrior: B(['operation']),
        }),
      ]),
      gate: B({ netWorthCr: ENDGAME_NET_WORTH_CR, repMin: ENDGAME_REP_MIN }),
    }),
    missionBoardContract: null,
    recovery: 'The climax is still open. Blockade, siege, or evidence tow, then dock the Ashfall cache.',
    careerIds: B(['hauler', 'hunter', 'prospector']),
  }),
]);

export function embodiedMissionAt(beatIndex) {
  const i = Math.floor(Number(beatIndex));
  return Number.isFinite(i) && i >= 0 && i < EMBODIED_MISSIONS.length ? EMBODIED_MISSIONS[i] : null;
}

export function getBiggerBoatRoute(elroyOutcome) {
  const key = elroyOutcome === 'custody' ? 'custody' : 'force';
  return { outcome: key, ...BIGGER_BOAT_ROUTES[key] };
}

export function getPickSideStake(elroyOutcome) {
  const key = elroyOutcome === 'custody' ? 'custody' : 'force';
  return { outcome: key, ...PICK_SIDE_STAKES[key] };
}

export function getEmpireSeedProgram(elroyOutcome) {
  const key = elroyOutcome === 'custody' ? 'custody' : 'force';
  return { outcome: key, ...EMPIRE_SEED_PROGRAMS[key] };
}

export function getDeepReachOperation(elroyOutcome, branch) {
  const key = branch === 'free' || branch === 'patrol' || branch === 'traders'
    ? branch
    : (elroyOutcome === 'custody' ? 'patrol' : 'traders');
  const outcome = elroyOutcome === 'custody' ? 'custody' : 'force';
  return { outcome, ...DEEP_REACH_CLIMAX[key] };
}

/**
 * The physical headline verb a player performs on this beat — the same field beats 1–3
 * already carry, resolved per run for the branch-dependent beats. B4/B5 take the run's
 * branch verb (the intro/chain type the player actually flies); B7 takes the climax op
 * verb so the named verb is always the staged physical action of that run. Returns null
 * only when a branch-scoped beat is asked without a branch.
 */
export function headlineVerbForBeat(beatIndex, options = {}) {
  const def = embodiedMissionAt(beatIndex);
  if (!def) return null;
  if (def.beat === 7) {
    const op = getDeepReachOperation(options.elroyOutcome, options.branch);
    return op && op.headlineVerb || null;
  }
  if (def.headlineVerbs) {
    const branch = options.branch || null;
    return branch ? def.headlineVerbs[branch] || null : null;
  }
  return def.headlineVerb || null;
}

/** Branch → verb map for surfaces that name every option (B4 pre-choice, B5, B7); null on static beats. */
export function headlineVerbMapForBeat(beatIndex) {
  const def = embodiedMissionAt(beatIndex);
  if (!def) return null;
  if (def.beat === 7) {
    return Object.fromEntries(BRANCH_IDS.map((b) => [b, DEEP_REACH_CLIMAX[b].headlineVerb]));
  }
  return def.headlineVerbs ? { ...def.headlineVerbs } : null;
}

export function listEmbodiedMissions() { return EMBODIED_MISSIONS.slice(); }
export function isCanonicalContactSignal(signal) { return CANONICAL_CONTACT_SIGNALS.includes(String(signal || '')); }
export function isCanonicalIntentEvent(eventName) { return CANONICAL_INTENT_EVENTS.includes(String(eventName || '')); }

export function getPhysicalContact(beatIndex) {
  const def = embodiedMissionAt(beatIndex);
  if (!def) return null;
  return {
    beat: def.beat, id: def.id, mode: def.physicalContact.mode, observeOnly: !!def.observeOnly,
    steps: def.physicalContact.steps.map((step) => ({ ...step, accept: [...step.accept], requiresPrior: [...(step.requiresPrior || [])] })),
    gate: def.physicalContact.gate ? { ...def.physicalContact.gate } : null,
  };
}

export function isNextPhysicalContact(beatIndex, signal, completedStepIds = []) {
  const contact = getPhysicalContact(beatIndex);
  if (!contact || contact.observeOnly) return false;
  const done = new Set(completedStepIds || []);
  if (contact.mode === 'ordered_and') {
    const next = contact.steps.find((step) => !done.has(step.id));
    return !!(next && (next.signal === signal || next.accept.includes(signal)));
  }
  return contact.steps.some((step) => !done.has(step.id) && (step.signal === signal || step.accept.includes(signal)));
}

export function getEmbodiedLocation(beatIndex, branch = null, elroyOutcome = null) {
  const def = embodiedMissionAt(beatIndex);
  if (!def) return null;
  const location = { beat: def.beat, ...def.location };
  if (def.beat === 4) Object.assign(location, getPickSideStake(elroyOutcome));
  if (def.beat === 5 && branch) {
    const branchLocation = {
      traders: { stationId: 'station_tethys', sectorId: 'sector_tethys_junction', destStationId: 'station_ceres', destSectorId: 'sector_ceres_belt' },
      patrol: { stationId: 'station_coalition', sectorId: 'sector_helios_prime', destStationId: 'station_expanse', destSectorId: 'sector_charon_expanse' },
      free: { stationId: 'station_helios', sectorId: 'sector_helios_prime', destStationId: 'station_tethys', destSectorId: 'sector_tethys_junction' },
    }[branch];
    if (branchLocation) Object.assign(location, branchLocation, { branch });
  }
  return location;
}

function stableOfferId(seed, beat, epoch, step, branch) {
  return `mo_47a_b${beat}_${hash32(seed >>> 0, beat, epoch | 0, step | 0, branch || 'none').toString(36)}`;
}

export function buildMissionBoardContract(beatIndex, options = {}) {
  const def = embodiedMissionAt(beatIndex);
  if (!def) return null;
  if (def.beat === 7) return buildDeepReachOperationOffer(options);
  const seed = (Number(options.seed) >>> 0) || 1;
  const epoch = Math.max(0, Number(options.epoch) | 0);
  if (def.beat === 4) {
    // W-BOOKS-3-4: the three-door intro still chooses the branch through the live intro
    // machinery — but once the door is chosen and the intro settles, the door's own
    // operation (Spine Break / the Weighing / Barn Raising) posts as the book job and
    // closes the book. Without a chosen door the board keeps the intro kind marker.
    const status = options.state ? getBeatStepStatus(options.state, 4) : null;
    const introDone = !!(status && Array.isArray(status.completed) && status.completed.includes('branch_intro_accept'));
    const branch = options.branch || (options.state && options.state.story && options.state.story.branch) || null;
    if (introDone && branch) {
      return buildBookContractOffer(def, seed, epoch, { ...options, branch });
    }
    return { beat: 4, kind: 'existing_branch_intro', storyTag: STORY_BRANCH_INTRO_TAG };
  }
  if (def.beat === 5) return buildBranchChainOffer(def, seed, epoch, options);
  // W-BOOKS-0-2 (§34.7): a Book-list beat posts the contract bound to its NEXT pending
  // ordered step, read from the sidecar's step log — world-work steps post nothing, so the
  // board names only the job the player can actually take next.
  if (Array.isArray(def.bookContracts) && def.bookContracts.length) {
    return buildBookContractOffer(def, seed, epoch, options);
  }
  if (!def.missionBoardContract) return null;
  const base = def.missionBoardContract;
  return adjustBoardOffer({
    ...base,
    id: stableOfferId(seed, def.beat, epoch, 0, null),
    params: { ...base.params },
    storyTarget: base.storyTarget ? { ...base.storyTarget } : null,
    distance: Number(options.distance) || (def.beat === 3 ? 3200 : def.beat === 2 ? 3000 : 800),
    expiresAtEpoch: epoch + 1,
    campaign47aBeat: def.beat,
    storyContractId: base.storyTag,
    source: 'campaign47a.embodied',
  }, def.beat, options);
}

/**
 * W-BOOKS-0-2: pick the bookContracts row bound to the first uncompleted ordered step.
 * `match`-gated world steps (scale_4, compost, nest) have no row and return null — the
 * book's next posted job lands only after the player finishes the world work in between.
 * Without options.state the step log is empty and the first contract posts.
 */
function buildBookContractOffer(def, seed, epoch, options) {
  const canon = CAMPAIGN_BEATS[def.beat];
  const steps = (canon && canon.steps) || [];
  const status = options.state ? getBeatStepStatus(options.state, def.beat) : null;
  const done = new Set((status && status.completed) || []);
  // W-BOOKS-3-4: optional steps (the Gate Audit welds) never hold the board — the
  // next posted job is bound to the next pending REQUIRED step only.
  const nextStep = steps.find((s) => s && s.optional !== true && !done.has(s.id)) || null;
  if (!nextStep) return null; // list complete — the cursor will move to the next beat
  // A row may carry `branch` (B4: one operation per door); it posts only for the run's
  // chosen door. Rows without a branch match any run.
  const branch = options.branch
    || (options.state && options.state.story && options.state.story.branch)
    || null;
  const row = def.bookContracts.find((bk) => bk && bk.stepId === nextStep.id
    && (bk.branch == null || bk.branch === branch));
  if (!row) return null; // world work next (or another door's operation): nothing to post
  const order = Number.isFinite(nextStep.order) ? nextStep.order : 0;
  return adjustBoardOffer({
    ...row,
    id: stableOfferId(seed, def.beat, epoch, order, row.storyTag),
    params: { ...(row.params || {}) },
    storyTarget: row.storyTarget ? { ...row.storyTarget } : null,
    ...(row.branch ? { storyBranch: row.branch } : {}),
    distance: Number(options.distance) || (def.beat === 2 ? 3000 : 1600),
    expiresAtEpoch: epoch + 1,
    campaign47aBeat: def.beat,
    storyContractId: row.storyTag,
    source: 'campaign47a.embodied',
  }, def.beat, options);
}

function buildDeepReachOperationOffer(options) {
  if (!options.assetId || options.operationComplete || options.legacy) return null;
  const seed = (Number(options.seed) >>> 0) || 1;
  const epoch = Math.max(0, Number(options.epoch) | 0);
  const op = getDeepReachOperation(options.elroyOutcome, options.branch);
  const assetKey = String(options.assetId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const storyTag = `campaign47a:b7:${op.outcome}:${op.id}:${assetKey}`;
  const callbacks = options.state ? reckoningCallbacks(options.state) : [];
  const names = { b1_cut: 'cut plate', b1_ram: 'wreck hammer', b2_crew: 'rescued tug',
    b3_tow_in: 'recovered core', b3_sling_in: 'slung core', b6_drone: 'drone shield',
    b6_trader: 'trader ballast', b6_outpost: 'outpost cover' };
  const params = {
    assetId: options.assetId,
    ...(options.state ? { reckoning: { rows: callbacks, bodies: {} } } : {}),
    fValue: 2.1,
    taskTime: 90,
    physicalVerb: op.physicalVerb,
    completionMethods: [...op.completionMethods],
    authoredSetPieceId: op.authoredSetPieceId,
    headlineVerb: op.headlineVerb,
    primaryRole: op.primaryRole,
    targetStrength: 2.4,
    massU: op.type === 'tow_recovery' ? 48 : undefined,
    scanLabel: op.type === 'tow_recovery' ? 'EVIDENCE CORE' : undefined,
  };
  return adjustBoardOffer({
    id: stableOfferId(seed, 7, epoch, 0, storyTag),
    type: op.type, storyTag, storyContractId: storyTag, storyOperation: op.id,
    factionId: op.factionId, stationId: op.stationId,
    destStationId: 'station_ashcache', destSectorId: 'sector_ashfall_reach',
    // PQ-032.02: the authored climax is mandatory story work, not a standing-gated job —
    // same always-acceptable floor as the B1–B3 contracts. Ordinary offers keep their
    // risk-tier reputation ladders.
    reward_cr: 2200, collateral_cr: 0, riskTier: 4, minRep: -149, time_limit_s: 0, distance: 5200,
    params, title: callbacks.length ? `ASHFALL: ${callbacks.map(row => names[row.id]).join(', ')}`.toUpperCase() : op.label.toUpperCase(),
    expiresAtEpoch: epoch + 2,
    campaign47aBeat: 7, source: 'campaign47a.deep_reach',
  }, 7, options);
}

function buildBranchChainOffer(def, seed, epoch, options) {
  const branch = options.branch;
  if (!BRANCH_IDS.includes(branch)) return null;
  const chain = BRANCH_CHAIN[branch];
  const step = Math.max(0, Number(options.chainStep) | 0);
  if (!chain || step >= chain.count) return null;
  const loc = getEmbodiedLocation(5, branch);
  const storyTag = `campaign47a:b5:${branch}:${step + 1}`;
  const captain = branch === 'patrol'
    ? [
      { id: 'cap_sable_iask', name: 'Sable Iask', archetype: 'lancer_sniper' },
      { id: 'cap_redcut_sorrel', name: 'Redcut Sorrel', archetype: 'bruiser_brawler' },
    ][step] || null
    : null;
  const params = chain.missionType === 'bulk_trade'
    ? { cmdtyId: 'cmdty_food', qty: 4 + step * 2, fValue: 1 + step * 0.15, taskTime: 30 + step * 8 }
    : chain.missionType === 'patrol_clear'
      ? { clearCount: 1, targetStrength: 1.8 + step * 0.3, fValue: 1.5, taskTime: 60 }
      : { cmdtyId: 'cmdty_classified_salvage', qty: 1, manifestName: 'ADMINISTRATIVE RECORDS — 3 YEARS / SEALED', fValue: 1.3, taskTime: 30 };
  // The proving leg names the physical verb the run performs — the same field the
  // authored set-piece types stamp inline in _rollParams.
  params.physicalVerb = BRANCH_HEADLINE_VERBS[branch];
  return adjustBoardOffer({
    id: stableOfferId(seed, 5, epoch, step, branch),
    type: chain.missionType,
    storyTag,
    storyContractId: storyTag,
    storyBranch: branch,
    factionId: BRANCH_FACTION[branch],
    stationId: loc.stationId,
    destStationId: loc.destStationId,
    destSectorId: loc.destSectorId,
    reward_cr: 900 + step * 250,
    collateral_cr: 0,
    riskTier: 2,
    time_limit_s: 0,
    distance: 2200,
    params,
    title: branch === 'traders' ? `PROVING GROUND — LEDGER RUN ${step + 1}/${chain.count}`
      : branch === 'patrol' ? `PROVING GROUND — ${captain ? captain.name.toUpperCase() : 'PATROL CLEAR'}`
        : `PROVING GROUND — SEALED ROUTE ${step + 1}/${chain.count}`,
    storyTarget: captain ? {
      id: captain.id, name: captain.name, label: captain.name.toUpperCase(), archetype: captain.archetype,
      factionId: 'faction_reach', namedCaptainId: captain.id, zoneId: 'zone_charon_ambush',
      // B5 paperwork plant (inspectable salvage even when captain storyTarget is present).
      lastRegisteredOwner: 'VALE HOLDINGS LLC',
      salvageCargo: 'ADMINISTRATIVE RECORDS — 3 YEARS / SEALED',
    } : null,
    preloadedCargo: branch === 'free',
    expiresAtEpoch: epoch + 1,
    campaign47aBeat: 5,
    source: 'campaign47a.embodied',
  }, 5, options);
}

/** A/B are physical contracts on the Ashfall board. C/D/E remain world actions. */
export function buildEndgameBoardOffers(options = {}) {
  const seed = (Number(options.seed) >>> 0) || 1;
  const epoch = Math.max(0, Number(options.epoch) | 0);
  return ENDING_DEFS.slice(0, 2).map((ending, index) => {
    const issuer = ending.id === 'A'
      ? { factionId: 'faction_scn', name: 'CONCORD ADMINISTRATION' }
      : { factionId: 'faction_quiet', name: 'QUIET SYNDICATE' };
    return {
      id: stableOfferId(seed, 7, epoch, index, ending.id),
      // The mission owner still needs a registered offer type, but acceptance is intercepted by
      // storyDisposition before a passenger mission is instantiated. finalDisposition tells the
      // live board to present the actual filing instead of inventing a same-berth passenger trip.
      type: 'passenger_transport',
      storyTag: `campaign47a:ending:${ending.id}`,
      storyContractId: `campaign47a:ending:${ending.id}`,
      storyDisposition: ending.id,
      finalDisposition: {
        choiceId: ending.id,
        issuerName: issuer.name,
        confirmPrompt: ending.confirmPrompt,
        confirmHint: ending.confirmHint,
        resolution: ending.resolution,
        sandboxMode: ending.sandboxMode,
        continuityTitle: ending.continuity && ending.continuity.title,
        continuityObjective: ending.continuity && ending.continuity.objective,
      },
      stationId: 'station_ashcache',
      destStationId: 'station_ashcache',
      destSectorId: 'sector_ashfall_reach',
      destinationName: 'ASH CACHE FILING DESK',
      factionId: issuer.factionId,
      title: ending.boardText,
      summary: ending.confirmHint,
      params: { cmdtyId: null, qty: 1, fValue: 0, taskTime: 0 },
      reward_cr: 0, collateral_cr: 0, riskTier: 0, time_limit_s: 0, distance: 0,
      expiresAtEpoch: epoch + 2,
      campaign47aBeat: 7,
      source: 'campaign47a.embodied',
    };
  });
}

export function getFailureRecovery(beatIndex) {
  const def = embodiedMissionAt(beatIndex);
  return def ? { beat: def.beat, cooldownS: FAIL_RECOVERY_COOLDOWN_S, line: def.recovery } : null;
}

export function buildConsequenceIntents(beatIndex) {
  const def = embodiedMissionAt(beatIndex);
  return def ? { beat: def.beat, intents: [], applied: false, note: 'missions/story existing owners apply canonical rewards and consequences' } : null;
}

export function buildAftermathHook(beatIndex) {
  const def = embodiedMissionAt(beatIndex);
  return def && def.aftermath ? { beat: def.beat, recordKind: AFTERMATH_RECORD_KIND, ...def.aftermath } : null;
}

export function getNamedCaptainBinding(beatIndex, options = {}) {
  if ((Number(beatIndex) | 0) !== 5 || options.branch !== 'patrol') return { beat: Number(beatIndex) | 0, captainId: null, bound: false };
  const captainId = ['cap_sable_iask', 'cap_redcut_sorrel'][Math.max(0, Number(options.chainStep) | 0)] || null;
  return { beat: 5, captainId, bound: !!captainId, encounterShapeId: captainId ? 'named_hunter' : null };
}

export function getCareerCrossover(beatIndex, branch = null) {
  const def = embodiedMissionAt(beatIndex);
  if (!def) return null;
  const ids = def.beat === 5 && branch
    ? ({ traders: ['hauler'], patrol: ['hunter'], free: ['prospector', 'hauler'] }[branch] || def.careerIds)
    : def.careerIds;
  return { beat: def.beat, careerIds: [...ids], binding: 'non_binding' };
}

export function describeEmbodiedMission(beatIndex, options = {}) {
  const def = embodiedMissionAt(beatIndex);
  if (!def) return null;
  return {
    beat: def.beat, id: def.id, contactId: def.contactId, contactName: def.contactName,
    headlineVerb: headlineVerbForBeat(beatIndex, options),
    headlineVerbs: headlineVerbMapForBeat(beatIndex),
    setPiece: def.setPiece || null,
    location: getEmbodiedLocation(beatIndex, options.branch, options.elroyOutcome),
    physicalContact: getPhysicalContact(beatIndex),
    boardContract: buildMissionBoardContract(beatIndex, options),
    recovery: getFailureRecovery(beatIndex),
    aftermath: buildAftermathHook(beatIndex),
    career: getCareerCrossover(beatIndex, options.branch),
    authority: B({ cursor: 'missions', overlay: 'story', encounters: 'encounterDirector', aftermath: 'aftermathWrecks' }),
  };
}

export function validateEmbodiedMissions() {
  const errors = [];
  if (EMBODIED_MISSIONS.length !== CAMPAIGN_BEATS.length) errors.push('beat count mismatch');
  for (const def of EMBODIED_MISSIONS) {
    const canonical = CAMPAIGN_BEATS[def.beat];
    if (!canonical || canonical.id !== def.id) errors.push(`B${def.beat}: canonical id mismatch`);
    if (!def.contactId || !def.location || !def.physicalContact || !def.recovery) errors.push(`B${def.beat}: incomplete embodiment`);
    for (const step of def.physicalContact.steps) {
      if (!isCanonicalContactSignal(step.signal)) errors.push(`B${def.beat}: unverified signal ${step.signal}`);
    }
  }
  for (const row of PQ032_BEAT_SET_PIECES) {
    const def = embodiedMissionAt(row.beat);
    const contract = def && def.missionBoardContract;
    if (!def || def.id !== row.id) errors.push(`B${row.beat}: PQ-032 beat id mismatch`);
    if (!contract || contract.type !== row.physicalType) {
      errors.push(`B${row.beat}: expected PQ-152 type ${row.physicalType}`);
    }
    if (!contract || !contract.title || !String(contract.title).toLowerCase().startsWith(row.headlineVerb)) {
      errors.push(`B${row.beat}: headline verb ${row.headlineVerb} missing`);
    }
    if (!contract || !contract.params || contract.params.authoredSetPieceId !== row.authoredSetPieceId) {
      errors.push(`B${row.beat}: authored set piece ${row.authoredSetPieceId} missing`);
    }
    if (!contract || !Array.isArray(contract.params && contract.params.completionMethods)
      || contract.params.completionMethods.length !== 2) {
      errors.push(`B${row.beat}: two physical solutions required`);
    }
  }
  // LG-SPINE-HEADLINES — all 8 beats name a physical verb a player performs, resolved
  // per run for the branch-dependent beats. Parity is checked against the live spine
  // (STORY_BEATS / live BRANCH_HEADLINE_VERBS), not the sidecar mirror alone: a literal
  // mirror compared to itself can never drift.
  for (const def of EMBODIED_MISSIONS) {
    const canonical = CAMPAIGN_BEATS[def.beat];
    const live = STORY_BEATS[def.beat];
    if (def.beat === 7) {
      for (const branch of BRANCH_IDS) {
        const op = DEEP_REACH_CLIMAX[branch];
        if (!op || !op.headlineVerb) errors.push(`B7: ${branch} climax verb missing`);
        if (!canonical.headlineVerbs || canonical.headlineVerbs[branch] !== (op && op.headlineVerb)) {
          errors.push(`B7: ${branch} canonical headline verb drift`);
        }
        if (!live.headlineVerbs || live.headlineVerbs[branch] !== (op && op.headlineVerb)) {
          errors.push(`B7: ${branch} live headline verb drift`);
        }
      }
    } else if (def.headlineVerbs) {
      for (const branch of BRANCH_IDS) {
        if (!def.headlineVerbs[branch]) errors.push(`B${def.beat}: ${branch} headline verb missing`);
        if (LIVE_BRANCH_HEADLINE_VERBS[branch] !== def.headlineVerbs[branch]) {
          errors.push(`B${def.beat}: ${branch} live headline verb drift`);
        }
        if (!canonical.headlineVerbs || canonical.headlineVerbs[branch] !== def.headlineVerbs[branch]) {
          errors.push(`B${def.beat}: ${branch} canonical headline verb drift`);
        }
        if (!live.headlineVerbs || live.headlineVerbs[branch] !== def.headlineVerbs[branch]) {
          errors.push(`B${def.beat}: ${branch} live table headline verb drift`);
        }
      }
    } else if (!def.headlineVerb) {
      errors.push(`B${def.beat}: headline verb missing`);
    } else {
      if (canonical.headlineVerb !== def.headlineVerb) {
        errors.push(`B${def.beat}: canonical headline verb drift`);
      }
      if (live.headlineVerb !== def.headlineVerb) {
        errors.push(`B${def.beat}: live headline verb drift`);
      }
    }
  }
  const b3 = embodiedMissionAt(3);
  if (!b3.consequenceRoutes || !b3.consequenceRoutes.custody || !b3.consequenceRoutes.force) errors.push('B3: leftover consequence routes missing');
  const b4 = embodiedMissionAt(4);
  if (!b4.consequenceStakes || !b4.consequenceStakes.custody || !b4.consequenceStakes.force) errors.push('B4: consequence stakes missing');
  const b6 = embodiedMissionAt(6);
  if (!b6.empireSeedPrograms || !b6.empireSeedPrograms.custody || !b6.empireSeedPrograms.force) errors.push('B6: empire seed programs missing');
  return { ok: errors.length === 0, errors };
}
