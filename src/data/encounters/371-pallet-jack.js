import { deepFreeze, defineEncounter } from './catalog.js';
import { palletJackEncounter } from '../../systems/palletJack.js';
export const encounterOrder = 371;
export const trigger = deepFreeze({ id: 'pallet_jack_intro', tier: 'minor', deck: 'combat', weight: .3,
  zoneTypes: ['mining_belt', 'trade_lane', 'outlaw_zone', 'ambush_lane'], script: 'selfRegistered', fallbackScript: 'ambush',
  pressureCost: 24, cooldownS: 1200, proximity: true,
  gates: { minSectorTier: 1, maxSecurity: .9, storyBeatMin: 1, uniqueOnce: true,
    sectorIds: ['sector_ceres_belt', 'sector_tethys_junction'] } });
export const runtime = palletJackEncounter;
export default defineEncounter(trigger, {
  shape: { situation: 'ambush', place: trigger.zoneTypes, twist: 'none', actor: 'faction_reach' },
  motive: 'freight_theft', engagementTrigger: 'physical_cargo_grab', factionId: 'faction_reach', context: 'encounter',
  title: 'PALLET JACK', primaryLine: 'A pirate forklift is reaching for existing loose freight.',
  squad: { anchorArchetype: 'pallet_jack', archetypes: ['pallet_jack'], size: [1, 1], doctrine: 'raider', formation: 'loose' },
  bark: 'ambush_tele', telegraph: 'Move the load before the clamp closes, break the front clamp, or hail the wounded thief for a drop.',
  aftermath: { flee: 'The original load still carries its own provenance.', kill: 'The forklift is lost. Its original cargo remains separate.' },
});
