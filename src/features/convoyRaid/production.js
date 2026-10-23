// This is the synchronous production registry entry. It imports the actual shared owner builders.
import { makeShipEntitySpec } from '../../systems/ships.js';
import { makeEnemySpawnSpec } from '../../systems/combat.js';
import { createConvoyRaidSystem } from './runtime.js';

export const convoyRaid = createConvoyRaidSystem({ makeShipEntitySpec, makeEnemySpawnSpec });
export default convoyRaid;
