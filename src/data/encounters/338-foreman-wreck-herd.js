// 338 — Foreman wreck herd. A Mirrorjaw Foreman plus a reaver pair works a
// derelict field as charge lanes, herding traffic between the ribs. Pure ambush:
// no parley, the telegraph is the engine flare and the warn bark.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 338;
export const trigger = deepFreeze({
  id: 'foreman_wreck_herd',
  tier: 'minor',
  deck: 'combat',
  weight: 0.8,
  zoneTypes: ['derelict_field'],
  script: 'ambush',
  pressureCost: 55,
  cooldownS: 720,
  proximity: true,
  gates: {
    minSectorTier: 2,
    maxSecurity: 0.6,
    storyBeatMin: 1,
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'wreck',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_reach',
  },
  motive: 'cargo_raid',
  engagementTrigger: 'player_in_range',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'FOREMAN WRECK HERD',
  primaryLine: 'HEAVY CONTACT: a Mirrorjaw Foreman herds the field. Cross its charge or feed it a swarmer.',
  squad: {
    anchorArchetype: 'mirrorjaw_foreman',
    archetypes: ['reaver_pirate', 'wasp_swarmer'],
    size: [3, 4],
    doctrine: 'scavenger',
    formation: 'loose',
  },
  bark: 'ambush_tele',
  telegraph: 'Foreman committing through the ribs. Cross the charge line.',
  aftermath: {
    flee: 'The herd scatters back into the wreck field.',
    kill: 'The charge lane goes quiet; scrap and a broken bridle remain.',
  },
});
