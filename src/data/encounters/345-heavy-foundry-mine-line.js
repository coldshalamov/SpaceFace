// One guaranteed Foundry closes behind ordinary cover. Its rack throws a finite physical ore line:
// shoot or repulse the charge, or let real terrain take it, rather than waiting out a hidden timer.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 345;
export const trigger = deepFreeze({
  id: 'heavy_foundry_mine_line',
  tier: 'minor',
  deck: 'combat',
  weight: 0.4,
  zoneTypes: ['mining_belt', 'derelict_field', 'outlaw_zone'],
  script: 'ambush',
  pressureCost: 78,
  cooldownS: 1260,
  proximity: true,
  gates: { minSectorTier: 3, maxSecurity: 0.62 },
});

export default defineEncounter(trigger, {
  motive: 'industrial_mine_line_interdiction',
  engagementTrigger: 'player_crosses_foundry_worksite',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'CHARGED ORE',
  primaryLine: 'HEAVY CONTACT: a Foundry is closing behind a line of charged ore.',
  squad: {
    anchorArchetype: 'heavy_foundry',
    archetypes: ['flea_swarmer', 'reaver_pirate'],
    size: [2, 3],
    doctrine: 'balanced',
    formation: 'wedge',
  },
  bark: 'ambush_tele',
  telegraph: 'Yellow charge in the ore. Detonate it clear, shove it back, or give it the rock.',
  aftermath: {
    flee: 'The cutters go dark and the work gang abandons the ore line.',
    kill: 'Loose ore tumbles through the silent industrial hull.',
  },
});
