import { deepFreeze, defineEncounter } from './catalog.js';
import { mothlightEncounter } from '../../systems/mothlight.js';
export const encounterOrder = 370;
export const trigger = deepFreeze({ id: 'mothlight_intro', tier: 'minor', deck: 'combat', weight: 0.3,
  zoneTypes: ['outlaw_zone', 'ambush_lane', 'mining_belt'], script: 'selfRegistered', fallbackScript: 'ambush',
  pressureCost: 30, cooldownS: 1200, proximity: true,
  gates: { minSectorTier: 2, maxSecurity: 0.8, storyBeatMin: 1, uniqueOnce: true, sectorIds: ['sector_io_reach'] } });
export const runtime = mothlightEncounter;
export default defineEncounter(trigger, {
  shape: { situation: 'ambush', place: trigger.zoneTypes, twist: 'none', actor: 'faction_reach' },
  motive: 'industrial_interdiction', engagementTrigger: 'mothlight_lane', factionId: 'faction_reach', context: 'encounter',
  title: 'MOTHLIGHT', primaryLine: 'A black-and-copper tender releases a drifting needle lamp. The six-petal iris is its real gun.',
  squad: { anchorArchetype: 'mothlight', archetypes: ['mothlight'], size: [1, 1], doctrine: 'skirmisher', formation: 'loose' },
  bark: 'ambush_tele', telegraph: 'Watch the iris, scan or extinguish a lamp, and break the true shot with cover.',
  aftermath: { flee: 'The tender’s four original lamps are spent.', kill: 'The true gun is silent; the remaining original lights keep drifting.' },
});
