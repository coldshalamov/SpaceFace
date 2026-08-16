import { deepFreeze, defineEncounter } from './catalog.js';
import { RARE_SPAWN_RUNTIMES } from '../../systems/rareSpawnRuntime.js';

export const encounterOrder = 359;
export const trigger = deepFreeze({
  id: 'rare_ghost_ship', tier: 'minor', deck: 'civilian', weight: 0.06, rare: true,
  zoneTypes: ['derelict_field', 'anomaly_deep', 'outer'],
  script: 'selfRegistered', pressureCost: 34, cooldownS: 86_400, proximity: true,
});
export const runtime = RARE_SPAWN_RUNTIMES.ghostShip;
export default defineEncounter(trigger, {
  factionId: 'faction_free',
  title: 'GHOST SHIP',
  primaryLine: 'COLD DERELICT: no reactor, no crew heat, one carrier answering every hail with static.',
  choices: [
    { id: 'hail', label: 'Hail, then salvage' },
    { id: 'leave', label: 'Leave it cold' },
  ],
  timeoutChoice: 'leave',
  rareRumor: {
    kind: 'cache', kindLabel: 'Static-Hail Bearing', targetName: 'cold answering hull',
    radius: 820,
    text: 'A dead carrier is returning hails from somewhere inside the ring. The source is a hull, not a station story.',
  },
  receipts: {
    black_box_recovered: 'GHOST BLACK BOX RECOVERED — one Xenium trace remains in the stripped hull.',
    left_cold: 'GHOST SHIP LEFT — the static carrier continues.',
  },
});
