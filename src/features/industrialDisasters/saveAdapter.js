import {
  INDUSTRIAL_DISASTERS_SCHEMA_VERSION, createIndustrialDisastersState,
  normalizeIndustrialDisasters, validateIndustrialDisastersSave,
} from './runtime.js';
export { validateIndustrialDisastersSave } from './runtime.js';

export const INDUSTRIAL_DISASTERS_SAVE_KEY = 'industrialDisasters';

/** Add this section to saveSystem._saveCapturePlan before world/entities/native physics.
 * It uses the live owner so a save between impulse submission and solve preserves that impulse. */
export function captureIndustrialDisasters({ state, registry } = {}) {
  const owner = registry?.get?.('industrialDisasters');
  return owner?.serialize ? owner.serialize() : normalizeIndustrialDisasters(state?.industrialDisasters);
}

/** The containing save owner still owns checksum, version migration, atomic commit and rollback.
 * Call after player/economy restore, before world.enterSector; live bodies wait for save:loaded. */
export function restoreIndustrialDisasters(raw, { state, registry } = {}) {
  const verdict = validateIndustrialDisastersSave(raw);
  if (!verdict.ok) return verdict;
  const owner = registry?.get?.('industrialDisasters');
  const section = raw == null ? createIndustrialDisastersState() : normalizeIndustrialDisasters(raw);
  if (owner?.deserialize) owner.deserialize(section);
  else if (state) state.industrialDisasters = section;
  return { ok: true, restored: raw != null, schemaVersion: INDUSTRIAL_DISASTERS_SCHEMA_VERSION };
}

export const industrialDisastersSaveAdapter = Object.freeze({
  key: INDUSTRIAL_DISASTERS_SAVE_KEY,
  capture: captureIndustrialDisasters,
  validate: validateIndustrialDisastersSave,
  restore: restoreIndustrialDisasters,
});
