// Rare Plan 20 physical disaster: warn first, then let SG-02 decide whether the rock misses or hits.
import { deepFreeze, defineEncounter } from './catalog.js';
import { SETPIECE_EVENT_RUNTIMES } from '../../systems/setpieceEventRuntime.js';

export const encounterOrder = 353;
export const trigger = deepFreeze({
  id: 'event_falling_rock',
  tier: 'major',
  deck: 'civilian',
  weight: 0.12,
  rare: true,
  zoneTypes: ['civilian_core', 'refinery_approach', 'colony'],
  script: 'selfRegistered',
  pressureCost: 92,
  cooldownS: 86_400,
  proximity: true,
  gates: { storyBeatMin: 1, minSectorTier: 1 },
});

export const runtime = SETPIECE_EVENT_RUNTIMES.fallingRock;
export default defineEncounter(trigger, {
  factionId: 'faction_free',
  title: 'FALLING ROCK',
  primaryLine: 'TRAFFIC CONTROL: large rock, slow collision course. Charges, drivers, or a Massline can still turn it.',
  telegraph: 'The warning reaches the band before the falling mass enters local space.',
  receipts: {
    stacked_impulse_charges: 'STACKED CHARGES — the rock is moving clear.',
    mass_driver_barrage: 'MASS-DRIVER BARRAGE — the rock is moving clear.',
    multi_burn_tow: 'MULTI-BURN TOW — the rock is moving clear.',
    rock_hit_station: 'IMPACT — the station approach is now a debris field.',
  },
});
