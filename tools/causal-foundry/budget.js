// Performance and manifest bounds for foundry scenes.
// Spawn numbers come from the live content factory, not a second cap table.

import {
  FACTORY_SPAWN_DEFAULT_MAX,
  FACTORY_SPAWN_HARD_MAX,
} from '../../src/contracts/contentFactory.js';

export const FOUNDRY_LIMITS = Object.freeze({
  maxTicks: 200,
  maxEntities: 6,
  maxHostiles: 4,
  minSeparationWu: 22,
  factorySpawnDefault: FACTORY_SPAWN_DEFAULT_MAX,
  factorySpawnHard: FACTORY_SPAWN_HARD_MAX,
});
