// 372 — SECOND RINSE. Hasp hangs Tuesday's wash in a pocket off the Helios freight
// chord. Concord calls lint a contaminant inside the station, so the lines are outside.
// The blue sheet hangs off the line, aft and outward. The bare pin is ahead of
// the kettle, still outward of the chord. Whites stay clipped on the outward line.
// The yard is presence-owned (the secondRinse system). externalOnly keeps the
// director from rolling it as a whisper and spending a Helios ambient slot.
import { deepFreeze, defineEncounter } from './catalog.js';
import { secondRinseEncounter } from '../../systems/secondRinse.js';

export const encounterOrder = 372;
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
  gates: { sectorIds: ['sector_helios_prime'], externalOnly: true },
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
