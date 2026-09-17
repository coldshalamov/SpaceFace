// 340 — Vael warden convoy. A Vael freighter runs the lane under a warden screen
// while a Reach pack works to crack it. First convoy to field the escort block:
// wardens plant between the ward and the threat (escort_screen doctrine).
// No choices by design — the physical verbs carry it (kill raiders to guard, kill
// the hauler to rob). The stance offer lives on 329-curtain-convoy instead.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 340;
export const trigger = deepFreeze({
  id: 'vael_warden_convoy',
  tier: 'minor',
  deck: 'combat',
  weight: 1.0,
  zoneTypes: ['trade_lane', 'refinery_approach'],
  script: 'convoy',
  pressureCost: 50,
  cooldownS: 600,
  proximity: true,
  gates: {
    maxSecurity: 0.7,
    storyBeatMin: 1,
    minSectorTier: 2,
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'convoy',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_vael',
  },
  motive: 'cargo_raid',
  engagementTrigger: 'player_in_range',
  factionId: 'faction_vael',
  context: 'encounter',
  title: 'WARDEN SCREEN OVER THE CONVOY',
  primaryLine: 'TRAFFIC ALERT: Vael freighter under warden screen. Raiders want the hold; the screen wants the lane.',
  squad: {
    anchorArchetype: 'reaver_pirate',
    archetypes: ['reaver_pirate', 'wasp_swarmer'],
    size: [2, 3],
    doctrine: 'scavenger',
    formation: 'loose',
  },
  civilian: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    factionId: 'faction_vael',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  escort: {
    archetypes: ['warden_escort'],
    size: [1, 2],
    doctrine: 'official',
    formation: 'wedge',
    factionId: 'faction_vael',
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
  bark: 'warden_convoy_alert',
});
