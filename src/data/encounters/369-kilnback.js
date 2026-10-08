import { deepFreeze, defineEncounter } from './catalog.js';
import { kilnbackEncounter } from '../../systems/kilnback.js';
export const encounterOrder = 369;
export const trigger = deepFreeze({ id: 'kilnback_intro', tier: 'minor', deck: 'combat', weight: 0.35,
  zoneTypes: ['mining_belt', 'outlaw_zone', 'ambush_lane'], script: 'selfRegistered', fallbackScript: 'ambush',
  pressureCost: 30, cooldownS: 1200, proximity: true,
  gates: { minSectorTier: 1, maxSecurity: 0.8, storyBeatMin: 1 } });
export const runtime = kilnbackEncounter;
export default defineEncounter(trigger, {
  shape: { situation: 'ambush', place: trigger.zoneTypes, twist: 'none', actor: 'faction_reach' },
  motive: 'industrial_interdiction', engagementTrigger: 'furnace_lane', factionId: 'faction_reach', context: 'encounter',
  title: 'KILNBACK', primaryLine: 'A stolen furnace tug charges a narrow heat lane. Its two casks are finite.',
  squad: { anchorArchetype: 'kilnback', archetypes: ['kilnback'], size: [1, 1], doctrine: 'brawler', formation: 'loose' },
  bark: 'ambush_tele', telegraph: 'Cross the nose, use cover, break a cask or tow the furnace into its own expelled heat.',
  aftermath: { flee: 'The dry furnace retreats from its own work.', kill: 'The furnace is cold; its original casks remain physical cargo.' },
});
