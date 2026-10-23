import { shipbreakingYard } from './runtime.js';

/** Fresh, registry-shaped sim owner. No DOM, renderer, audio context or global instance. */
export function createShipbreakingYard() { return Object.create(shipbreakingYard); }

/** Spread into both buildRegistrySystemLookup and the Node production factory table. */
export function createShipbreakingYardSystemEntries() {
  return [['shipbreakingYard', createShipbreakingYard()]];
}

export { shipbreakingYard } from './runtime.js';
export * from './manifest.js';
export * from './save.js';

