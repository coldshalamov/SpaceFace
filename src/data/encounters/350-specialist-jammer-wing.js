// One jammer identity on a broken-rock approach. The terrain gives the player a physical closing
// route while its presentation-only contact-smear mechanic remains an explicit later packet.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 350;
export const trigger = deepFreeze({
  id: 'specialist_jammer_wing',
  tier: 'minor',
  deck: 'combat',
  weight: 0.45,
  zoneTypes: ['derelict_field', 'mining_belt', 'outlaw_zone'],
  script: 'ambush',
  pressureCost: 48,
  cooldownS: 900,
  proximity: true,
  gates: {
    minSectorTier: 2,
    maxSecurity: 0.68,
  },
});
export default defineEncounter(trigger, {
  motive: 'sensor_cover_interdiction',
  engagementTrigger: 'player_crosses_broken_ridge',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'STATIC RIDGE',
  primaryLine: 'ANTENNA CONTACT: a Jammer hull is holding behind a broken-rock wing.',
  squad: {
    anchorArchetype: 'jammer_specialist',
    archetypes: ['wasp_swarmer', 'reaver_pirate'],
    size: [3, 4],
    doctrine: 'balanced',
    formation: 'wedge',
  },
  bark: 'ambush_tele',
  telegraph: 'Antenna hull on the far ridge. Close through the rocks or take it first.',
  aftermath: {
    flee: 'The antenna hull leaves the ridge and the wing scatters.',
    kill: 'The specialist array tumbles into the broken-rock lane.',
  },
});
