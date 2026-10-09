// 567 — SECOND RINSE. Hasp hangs Tuesday's wash in a pocket off the Helios freight
// chord. Concord calls lint a contaminant inside the station, so the lines are outside.
// The blue blanket with the boat is off its pin. It is not cargo.
import { deepFreeze, defineEncounter } from './catalog.js';
import { secondRinseEncounter } from '../../systems/secondRinse.js';

export const encounterOrder = 567;
export const trigger = deepFreeze({
  id: 'second_rinse',
  tier: 'ambient',
  deck: 'civilian',
  weight: 0.3,
  zoneTypes: ['trade_lane'],
  script: 'selfRegistered',
  pressureCost: 5,
  cooldownS: 1200,
  proximity: true,
  gates: { sectorIds: ['sector_helios_prime'] },
});
export const runtime = secondRinseEncounter;
export default defineEncounter(trigger, {
  shape: {
    situation: 'yard',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_free',
  },
  factionId: 'faction_free',
  context: 'encounter',
  noCombat: true,
  noCredits: true,
  title: 'SECOND RINSE',
  primaryLine: 'HASP: Tuesday. The core calls lint a contaminant. I call it the load.',
});
