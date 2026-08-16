import { deepFreeze, defineEncounter } from './catalog.js';
import { RARE_SPAWN_RUNTIMES } from '../../systems/rareSpawnRuntime.js';

export const encounterOrder = 360;
export const trigger = deepFreeze({
  id: 'rare_drifter_migration', tier: 'ambient', deck: 'civilian', weight: 0.075, rare: true,
  zoneTypes: ['trade_lane', 'civilian_core', 'outer', 'refinery_approach'],
  script: 'selfRegistered', pressureCost: 14, cooldownS: 86_400, proximity: false,
});
export const runtime = RARE_SPAWN_RUNTIMES.drifterMigration;
export default defineEncounter(trigger, {
  factionId: 'faction_free',
  noCombat: true,
  title: 'DRIFTER MIGRATION',
  primaryLine: 'TRAFFIC: seven Drifters are crossing as one slow river. No distress. No demand. Just wakes.',
  rareRumor: {
    kind: 'anomaly', kindLabel: 'Shoal Traffic Pattern', targetName: 'Drifter migration',
    radius: 980,
    text: 'Traffic is detouring around a seven-hull Drifter shoal. The ring marks the crossing, not a waypoint to one ship.',
  },
  receipts: {
    shoal_crossed: 'DRIFTER MIGRATION PASSED — seven wakes cross the traffic record.',
  },
});
