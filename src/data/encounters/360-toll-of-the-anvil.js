// 360 — Toll of the anvil. A foreman works the yard gate: heavy hull on your nose,
// wings split wide on a hammer-anvil frame. Pay the gate fee or beat the anvil first.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 360;
export const trigger = deepFreeze({
  id: 'toll_of_the_anvil',
  tier: 'minor',
  deck: 'combat',
  weight: 1.0,
  zoneTypes: ['trade_lane', 'border_checkpoint', 'refinery_approach'],
  script: 'toll',
  pressureCost: 44,
  cooldownS: 500,
  proximity: true,
  gates: {
    minCargoValue: 90,
    maxSecurity: 0.8,
    minSectorTier: 2,
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'toll',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_pitborn',
  },
  motive: 'cargo_extortion',
  engagementTrigger: 'demand_pending',
  factionId: 'faction_pitborn',
  context: 'encounter',
  title: 'THE ANVIL COLLECTS',
  primaryLine: 'GATE TOLL: foreman element holding the yard approach. The heavy hull is the anvil. Pay or be the hammer test.',
  squad: {
    anchorArchetype: 'bruiser_brawler',
    archetypes: ['bruiser_brawler', 'corsair_raider'],
    size: [3, 4],
    doctrine: 'scavenger',
    squadRecipe: 'hammer_anvil',
    formation: 'loose',
    terrain: 'lee',
  },
  bark: 'toll_demand',
  telegraph: 'The anvil parks. The wings go wide.',
  offerS: 12,
  choices: [
    { id: 'pay', label: 'Pay the gate fee', needs: 'cargo' },
    { id: 'refuse', label: 'Beat the anvil' },
    { id: 'run', label: 'Clear the approach' },
  ],
  timeoutChoice: 'refuse',
});
