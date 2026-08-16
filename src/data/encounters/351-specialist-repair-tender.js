// One hostile tender behind an ordinary wing. Its finite physical repair drones can sustain that
// screen, but the player can kill the source or peel a drone off its weld with the ordinary Well.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 351;
export const trigger = deepFreeze({
  id: 'specialist_repair_tender',
  tier: 'minor',
  deck: 'combat',
  weight: 0.4,
  zoneTypes: ['derelict_field', 'refinery_approach', 'outlaw_zone'],
  script: 'ambush',
  pressureCost: 50,
  cooldownS: 960,
  proximity: true,
  gates: {
    minSectorTier: 2,
    maxSecurity: 0.66,
  },
});
export default defineEncounter(trigger, {
  motive: 'wing_sustain_interdiction',
  engagementTrigger: 'player_enters_support_lane',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'TENDER BRACE',
  primaryLine: 'SUPPORT CONTACT: a hostile Tender is sheltering behind a sparse debris wing.',
  squad: {
    anchorArchetype: 'hostile_repair_tender',
    archetypes: ['reaver_pirate', 'wasp_swarmer'],
    size: [3, 4],
    doctrine: 'anchor',
    formation: 'ring',
  },
  bark: 'ambush_tele',
  telegraph: 'Support hull at the back of the brace. Pull it into the same well as its screen.',
  aftermath: {
    flee: 'The support hull breaks away and the brace opens.',
    kill: 'Tender racks drift clear of the sparse debris line.',
  },
});
