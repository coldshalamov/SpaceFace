import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 332;
export const trigger = deepFreeze({
  id: 'resonance_obelisk_patrol',
  tier: 'minor',
  deck: 'combat',
  weight: 0,
  zoneTypes: [],
  script: 'patrolBeat',
  pressureCost: 18,
  cooldownS: 45,
  proximity: true,
  gates: { sectorIds: ['sector_veil_nebula'] },
});

export default defineEncounter(trigger, {
  title: 'OBELISK WATCH',
  factionId: 'faction_vael',
  context: 'zone_hostile',
  motive: 'guard the resonance obelisk as its pulse accelerates',
  engagementTrigger: 'resonance_obelisk_scan_response',
  squad: {
    archetypes: ['lancer_sniper', 'bruiser_brawler'],
    size: [1, 2],
    doctrine: 'balanced',
    formation: 'ring',
  },
  bark: 'resonance_obelisk_patrol_hail',
  beatS: 90,
});
