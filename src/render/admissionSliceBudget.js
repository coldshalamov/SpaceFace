// Time-budgeted GPU/CPU admission slices.
//
// Count budgets ("2 builds per frame") hide 1–2 orders of magnitude of cost: a procedural rock
// and a station merge-upload are both "one item". The drain always completes at least one item
// so work makes progress, then spills the rest once the target milliseconds are spent.

export const ADMISSION_SLICE_TARGET_MS = 3;
export const ADMISSION_SLICE_HARD_MS = 8;
export const ADMISSION_SLICE_MIN_ITEMS = 1;

export function normalizeAdmissionSliceOptions(options = {}) {
  const targetMs = Number.isFinite(Number(options.targetMs))
    ? Math.max(0, Number(options.targetMs))
    : ADMISSION_SLICE_TARGET_MS;
  const hardMs = Number.isFinite(Number(options.hardMs))
    ? Math.max(targetMs, Number(options.hardMs))
    : Math.max(targetMs, ADMISSION_SLICE_HARD_MS);
  const minItems = Number.isFinite(Number(options.minItems))
    ? Math.max(0, Math.floor(Number(options.minItems)))
    : ADMISSION_SLICE_MIN_ITEMS;
  return { targetMs, hardMs, minItems };
}

/**
 * Whether another admission item may start on this turn.
 * Loading-mode Infinity budgets skip the clock entirely.
 */
export function shouldContinueAdmissionSlice(options = {}) {
  if (options.unlimited === true || options.buildBudget === Infinity) return true;
  const { targetMs, minItems } = normalizeAdmissionSliceOptions(options);
  const itemsDone = Math.max(0, Math.floor(Number(options.itemsDone) || 0));
  if (itemsDone < minItems) return true;
  const startedAtMs = Number(options.startedAtMs);
  const nowMs = Number(options.nowMs);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) return itemsDone < minItems;
  return (nowMs - startedAtMs) < targetMs;
}

export function shouldStartHeavyAdmission(lastPresentDtMs, lateMs = 22) {
  const last = Number(lastPresentDtMs);
  if (!Number.isFinite(last)) return true;
  return last <= lateMs;
}

export function admissionSliceOverHardLimit(options = {}) {
  const { hardMs } = normalizeAdmissionSliceOptions(options);
  const startedAtMs = Number(options.startedAtMs);
  const nowMs = Number(options.nowMs);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) return false;
  return (nowMs - startedAtMs) > hardMs;
}
