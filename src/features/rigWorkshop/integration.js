// Node-safe production seams. Shared owners import these explicitly during
// collection; this candidate does not patch their registry or save envelope.
import { rigWorkshop, createRigWorkshopSystem } from './runtime.js';

export { rigWorkshop, createRigWorkshopSystem };
export const RIG_WORKSHOP_SYSTEM_ID = 'rigWorkshop';
export const RIG_WORKSHOP_SAVE_KEY = 'rigWorkshop';
export const RIG_WORKSHOP_MIRROR_KEYS = Object.freeze(['rigWorkshop']);
export const RIG_WORKSHOP_MAIN_TO_SIM_EVENTS = Object.freeze(['rigWorkshop:choose']);
export const RIG_WORKSHOP_REGISTRY_ENTRY = Object.freeze([RIG_WORKSHOP_SYSTEM_ID, rigWorkshop]);

function owner(registry) { return registry?.get?.(RIG_WORKSHOP_SYSTEM_ID) || null; }

/** The chunked/worker save plan and synchronous generator must insert this
 * same slot at the same location, immediately after their `combat` slot. */
export function rigWorkshopSavePlanEntry(registry) {
  return [RIG_WORKSHOP_SAVE_KEY, () => owner(registry)?.serialize?.() ?? null];
}

export function captureRigWorkshopSaveSlot(data, registry) {
  const [key, read] = rigWorkshopSavePlanEntry(registry);
  data[key] = read();
  return data[key];
}

/** Call after persistent entity IDs and the ordinary combat ledger have been
 * restored, before deferred native reconciliation / save:loaded. Invalid data
 * uses the existing save session's rollback/error path; never substitute a new
 * pair of loan machines for a corrupted or conflicting saved identity. */
export function restoreRigWorkshopSaveSlot(data, registry, entityIdRemap = null) {
  const system = owner(registry);
  const raw = data?.[RIG_WORKSHOP_SAVE_KEY] ?? null;
  if (!system?.deserialize) {
    if (raw != null) throw new Error('Rig Workshop save owner is not registered');
    return { ok: true, absent: true };
  }
  const result = system.deserialize(raw, { entityIdRemap });
  if (!result?.ok) throw new Error(`Rig Workshop restore refused: ${result?.reason || 'unknown failure'}`);
  return result;
}
