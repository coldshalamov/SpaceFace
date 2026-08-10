// 328 — Choir zealot pack on a Pattern refrain. Ignores cargo; wants a symbol kill.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 328;
export const trigger = deepFreeze({
  id: 'pattern_refrain',
  tier: 'minor',
  deck: 'combat',
  weight: 1.0,
  zoneTypes: ['outlaw_zone', 'anomaly_deep', 'ambush_lane', 'derelict_field'],
  script: 'ambush',
  pressureCost: 42,
  cooldownS: 500,
  proximity: true,
  gates: {
    maxSecurity: 0.5,
    minStoryBeat: 2,
  },
});

export default defineEncounter(trigger, {
  motive: 'ideological',
  engagementTrigger: 'player_in_range',
  factionId: 'faction_choir',
  context: 'encounter',
  title: 'PATTERN REFRAIN',
  primaryLine: 'CHOIR HAIL: the Pattern has counted your colors. Answer in formation.',
  squad: {
    // Choir fields one marked chorus lead, then native light refrains—never Reach-painted Wasps.
    anchorArchetype: 'choir_zealot',
    archetypes: ['choir_zealot'],
    size: [4, 6],
    doctrine: 'scavenger',
    formation: 'ring',
  },
  bark: 'attack',
});
