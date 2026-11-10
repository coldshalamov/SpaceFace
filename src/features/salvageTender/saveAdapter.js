import { freshSalvageTender } from './model.js';

export const SALVAGE_TENDER_SAVE_KEY = 'salvageTender';
const installed = new WeakMap();

export function captureSalvageTenderSave(registry) {
  return registry?.get?.('salvageTender')?.serialize?.() || freshSalvageTender();
}

export function restoreSalvageTenderSave(registry, raw) {
  registry?.get?.('salvageTender')?.deserialize?.(raw);
}

export function finishSalvageTenderRestore(registry) {
  registry?.get?.('salvageTender')?.afterContinue?.();
}

/** Instance-scoped extension for the exact shipped save owner. Both capture lanes append the
 * same key in the same order BEFORE its existing checksum/worker encoder. The original envelope
 * validator, migration path, persistent body serializer, native physics snapshot, ID remapper,
 * rollback, and load event remain the only owners of their respective work.
 *
 * This is the concrete candidate seam: registration can install it without editing saveSystem.
 * A later integration may inline the three exported hooks beside the existing towlineTable
 * hooks; do not use both approaches. No prototype/global monkey patch or alternate save exists.
 */
export function installSalvageTenderSaveAdapter(save) {
  if (!save || typeof save._saveCapturePlan !== 'function' || typeof save._serializeDataSteps !== 'function'
    || typeof save._restoreChunks !== 'function') return () => {};
  const active = installed.get(save);
  if (active) return active.release;
  const before = {
    plan: save._saveCapturePlan, steps: save._serializeDataSteps, restore: save._restoreChunks,
  };
  function plan() {
    const rows = before.plan.call(this);
    if (rows.some(([key]) => key === SALVAGE_TENDER_SAVE_KEY)) return rows;
    return [...rows, [SALVAGE_TENDER_SAVE_KEY, () => captureSalvageTenderSave(this.registry)]];
  }
  function* steps() {
    const data = yield* before.steps.call(this);
    data[SALVAGE_TENDER_SAVE_KEY] = captureSalvageTenderSave(this.registry);
    yield 'serialize:salvageTender';
    return data;
  }
  function* restore(session) {
    // save:restoring already froze producers. Adopt the detached sidecar before the original
    // restore's save:loaded event rebinds remapped bodies and resumes the workshop.
    restoreSalvageTenderSave(this.registry, session?.data?.[SALVAGE_TENDER_SAVE_KEY]);
    return yield* before.restore.call(this, session);
  }
  save._saveCapturePlan = plan;
  save._serializeDataSteps = steps;
  save._restoreChunks = restore;
  const release = () => {
    if (save._saveCapturePlan === plan) save._saveCapturePlan = before.plan;
    if (save._serializeDataSteps === steps) save._serializeDataSteps = before.steps;
    if (save._restoreChunks === restore) save._restoreChunks = before.restore;
    installed.delete(save);
  };
  installed.set(save, { release });
  return release;
}
