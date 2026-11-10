// Browser VFX pools decode their density payloads asynchronously. The production owner finishes
// construction after that same promise; lab adapters must not reset half-constructed pools.
import { GAS_VOLUME_PAYLOAD_READY } from '../../src/render/combat/gas/gasVolumeData.js';
import { DENSITY_VOLUME_PAYLOAD_READY } from '../../src/render/combat/densityVolumeData.js';

export const GAMEPLAY_VFX_POOLS_READY = Promise.all([
  GAS_VOLUME_PAYLOAD_READY,
  DENSITY_VOLUME_PAYLOAD_READY,
]);

export function resetGameplayVfxWhenReady(owner, reset) {
  if (!owner._volumePoolsPending) {
    reset();
    return Promise.resolve();
  }
  return GAMEPLAY_VFX_POOLS_READY.then(() => {
    if (owner._destroyed !== true) reset();
  });
}
