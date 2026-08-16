// A Ramscoop gets one open geometry line and ordinary light escorts. The rocks are deliberately
// part of the counter: its visible burn locks before the player dodges, and Rapier owns the payoff.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 343;
export const trigger = deepFreeze({
  id: 'heavy_ramscoop_charge',
  tier: 'minor',
  deck: 'combat',
  weight: 0.46,
  zoneTypes: ['mining_belt', 'derelict_field', 'outlaw_zone'],
  script: 'ambush',
  pressureCost: 68,
  cooldownS: 1080,
  proximity: true,
  gates: { minSectorTier: 3, maxSecurity: 0.64 },
});

export default defineEncounter(trigger, {
  motive: 'prow_charge_interdiction',
  engagementTrigger: 'player_enters_ramscoop_runup',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'SCOOP RUN',
  primaryLine: 'HEAVY BURN: a Ramscoop is lining its reinforced prow through the rocks.',
  squad: {
    anchorArchetype: 'heavy_ramscoop',
    archetypes: ['flea_swarmer', 'reaver_pirate'],
    size: [2, 3],
    doctrine: 'balanced',
    formation: 'wedge',
  },
  bark: 'ambush_tele',
  telegraph: 'The plume is building. Let it commit, then step out and give it the wall.',
  aftermath: {
    flee: 'The light screen scatters past the heavy hull it failed to turn.',
    kill: 'The scoop folds into the geometry it tried to weaponize.',
  },
});
