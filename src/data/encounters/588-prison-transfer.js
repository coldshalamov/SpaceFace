// 588 — Prison transfer. A Concord prison barge crawls the Dione→Sker route under a warden
// screen while a Reach pack works to crack it. Reuses the convoy/escort/predation machinery:
// the escorts hold custody on the barge (escort_screen) and dart at whatever presses it —
// raider or player. The barge's hold is the manifest; cracking it frees the prisoners (and
// the law lands on whoever did it — the barge is illegalToKill).
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 588;
export const trigger = deepFreeze({
  id: 'prison_transfer',
  tier: 'minor',
  deck: 'combat',
  weight: 0.9,
  zoneTypes: ['trade_lane', 'patrol_corridor', 'border_checkpoint', 'ambush_lane'],
  script: 'convoy',
  pressureCost: 50,
  cooldownS: 780,
  proximity: true,
  rare: true,
  gates: {
    // The Dione→Sker transfer route: Dione Lane and Tethys Junction are the lawful corridor;
    // Pallas and Sker are where the Reach pack jumps it. minSectorTier keeps it off the
    // starter lane even though Tethys is tier 0.
    sectorIds: ['sector_dione_lane', 'sector_tethys_junction', 'sector_pallas_drift', 'sector_sker_haven'],
    maxSecurity: 0.75,
    storyBeatMin: 1,
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'convoy',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_scn',
  },
  motive: 'cargo_raid',
  engagementTrigger: 'player_in_range',
  factionId: 'faction_scn',
  context: 'encounter',
  title: 'PRISON TRANSFER UNDER SCREEN',
  primaryLine: 'CONCORD: prison transfer on the lane under warden screen. Keep clear of the barge — or crack it and take the law.',
  squad: {
    anchorArchetype: 'corsair_raider',
    archetypes: ['corsair_raider', 'reaver_pirate'],
    size: [2, 3],
    doctrine: 'scavenger',
    formation: 'wedge',
  },
  civilian: {
    archetypes: ['npc_prison_barge'],
    size: [1, 1],
    factionId: 'faction_scn',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  escort: {
    archetypes: ['prison_warden_escort'],
    size: [2, 3],
    doctrine: 'official',
    formation: 'wedge',
    factionId: 'faction_scn',
    context: 'patrol',
    team: 2,
  },
  predation: {
    enabled: true,
    raiderRole: 'raider',
    carrierRole: 'hauler',
    motive: 'cargo_raid',
    engagementTrigger: 'manifest_predation',
    attackerDoctrineId: 'interceptor_flyby',
    approachTelegraph: 'warden_screen_closing',
    responseWindowS: 4,
    objectiveS: 90,
    leashRadius: 2600,
    escapeHoldS: 3,
  },
  bark: 'prison_transfer_alert',
});
