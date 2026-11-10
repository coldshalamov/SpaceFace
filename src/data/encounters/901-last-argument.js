import { deepFreeze, defineEncounter } from './catalog.js';
import { lastArgumentEncounter } from '../../systems/lastArgument.js';
import { LAST_ARGUMENT as C } from '../lastArgument.js';
export const encounterOrder = 901;
export const trigger = deepFreeze({ id: C.encounterId, tier: 'major', deck: 'combat', weight: 0.12,
  zoneTypes: ['outlaw_zone','ambush_lane','derelict_field','trade_lane'],
  script: 'selfRegistered', fallbackScript: 'ambush', externalOnly: true,
  pressureCost: 30, cooldownS: C.cooldownMin, proximity: true,
  gates: { minSectorTier: 1, maxSecurity: 0.8, sectorIds: [...C.sectors] } });
export const runtime = lastArgumentEncounter;
export default defineEncounter(trigger, {
  shape: { situation: 'ambush', place: trigger.zoneTypes, twist: 'named', actor: 'faction_reach' },
  motive: 'siege_interdiction', engagementTrigger: 'authorized_hostile_spawn', factionId: 'faction_reach', context: 'encounter',
  title: 'THE LAST ARGUMENT', primaryLine: 'A stolen siege ark crosses the lane. Its guns turn slowly; its mass does not negotiate.',
  squad: { anchorArchetype: C.enemyId, archetypes: [C.enemyId], size: [1,1], doctrine: 'brawler', formation: 'loose' },
  bark: 'ambush_tele', telegraph: 'Leave the marked firing lanes. Break side housings independently; exploit the long spinal recovery.',
  aftermath: { flee: 'The siege ark ends its passage. No bounty was paid for leaving.',
    kill: 'The siege ark is a cold hull. The normal wreck and salvage owners take over.' },
});
