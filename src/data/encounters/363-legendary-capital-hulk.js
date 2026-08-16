import { deepFreeze, defineEncounter } from './catalog.js';
import { RARE_SPAWN_RUNTIMES } from '../../systems/rareSpawnRuntime.js';

export const encounterOrder = 363;
export const trigger = deepFreeze({
  id: 'legendary_capital_hulk',
  tier: 'major',
  deck: 'combat',
  weight: 0,
  rare: true,
  zoneTypes: ['outlaw_zone', 'derelict_field', 'radiation_pocket'],
  script: 'selfRegistered',
  pressureCost: 120,
  cooldownS: 86_400,
  proximity: true,
  gates: { externalOnly: true, minSectorTier: 4, maxSecurity: 0.3 },
});
export const runtime = RARE_SPAWN_RUNTIMES.capitalHulk;
export default defineEncounter(trigger, {
  factionId: 'faction_reach',
  motive: 'pre_cataclysm_fire_control_loop',
  engagementTrigger: 'capital_hulk_targeting_spine_wakes',
  title: 'THE GUN THAT FORGOT THE WAR',
  primaryLine: 'PRE-CATACLYSM HULK: the hull is cold, the fire-control spine is not, and every surviving mount has your range.',
  receipts: {
    hulk_silenced: 'CAPITAL HULK SILENCED — the last pre-cataclysm firing solution dies in Sedna Dark.',
  },
});
