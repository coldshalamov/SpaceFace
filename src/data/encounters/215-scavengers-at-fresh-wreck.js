// ev_scavengers_at_fresh_wreck (microevent catalog, crime) — scavengers lurk springside on the
// salvage in derelict fields: watch them mill, spring the ambush, or run them off the wreck.
// The proven ambush script owns the passive-then-spring behavior; the wreck field owns the fiction.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 215;
export const trigger = deepFreeze({
  id: 'scavengers_fresh_wreck',
  tier: 'minor',
  deck: 'combat',
  weight: 2,
  zoneTypes: ['derelict_field'],
  script: 'ambush',
  pressureCost: 30,
  cooldownS: 480,
  proximity: true,
  // The reaver anchor reinforcement-calls wasp cutters, so an ungated pack reaches 3-5 effective
  // hulls — the same gate its template 020 carries keeps 'first15' tier honest for new players.
  gates: { minSectorTier: 2 },
});

export default defineEncounter(trigger, {
  factionId: 'faction_reach',
  context: 'encounter',
  squad: {
    // The scavenger boss anchors the wreck party; swarmers are the disposable cutting crew.
    anchorArchetype: 'reaver_pirate',
    archetypes: ['wasp_swarmer'],
    size: [2, 3],
    doctrine: 'scavenger',
    formation: 'loose',
  },
  bark: 'ambush_tele',
});
