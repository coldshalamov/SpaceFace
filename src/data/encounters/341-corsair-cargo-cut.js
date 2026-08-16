// Plan 13 — ordinary Crimson Reach cargo theft with one guaranteed Corsair setup hull.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 341;
export const trigger = deepFreeze({
  id: 'corsair_cargo_cut',
  tier: 'minor',
  deck: 'combat',
  weight: 1.15,
  zoneTypes: ['trade_lane', 'ambush_lane', 'refinery_approach'],
  script: 'convoy',
  pressureCost: 38,
  cooldownS: 420,
  proximity: true,
  gates: {
    maxSecurity: 0.7,
    storyBeatMin: 1,
    minSectorTier: 2,
  },
});

export default defineEncounter(trigger, {
  motive: 'cargo_raid',
  engagementTrigger: 'manifest_predation',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'CORSAIR CARGO CUT',
  primaryLine: 'TRAFFIC ALERT: a Corsair tow rig is closing on a live manifest.',
  squad: {
    // The controller keeps the familiar curtain readable while the sole offensive hull is the
    // guaranteed Corsair selected by stable predation identity.
    anchorArchetype: 'pd_screen_escort',
    archetypes: ['corsair_raider'],
    size: [2, 2],
    doctrine: 'scavenger',
    formation: 'wedge',
  },
  civilian: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    factionId: 'faction_mts',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  predation: {
    enabled: true,
    raiderRole: 'raider',
    carrierRole: 'hauler',
    motive: 'cargo_raid',
    engagementTrigger: 'manifest_predation',
    attackerDoctrineId: 'interceptor_flyby',
    approachTelegraph: 'corsair_tow_rig_closing',
    responseWindowS: 4,
    objectiveS: 90,
    leashRadius: 2600,
    escapeHoldS: 3,
  },
  bark: 'curtain_convoy_alert',
  transitS: 170,
  unitsPerHauler: [6, 8],
});
