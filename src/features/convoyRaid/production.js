// This is the synchronous production registry entry. It imports the actual shared owner builders.
import { makeShipEntitySpec } from '../../systems/ships.js';
import { makeEnemySpawnSpec } from '../../systems/combat.js';
import { createConvoyRaidSystem } from './runtime.js';

export function createConvoyRaidProductionSystem() {
  return createConvoyRaidSystem({ makeShipEntitySpec, makeEnemySpawnSpec });
}

export const convoyRaid = createConvoyRaidProductionSystem();
export default convoyRaid;
