// PR #444 A/B: co1/cp1 kept the 12 s settle; cb1 versus cb2/cb3 selected
// 32 drawables and 16 textures / 8 MiB per serial loading unit. These schedule
// the same authored resources; the pre-existing 750 / 5000 ms budgets stay unchanged.
export const OPENING_LOAD_LIMITS = Object.freeze({
  SERIAL_GEOMETRY_BATCH_DRAWABLES: 32,
  SERIAL_TEXTURE_BATCH_COUNT: 16,
  // A flush threshold: the texture crossing it stays in the current batch.
  SERIAL_TEXTURE_BATCH_BYTES: 8 * 1024 * 1024,
  COMPOSITION_SETTLE_MS: 12000,
  SERIAL_RESIDENCY_BUDGET_MS: 750,
  PARALLEL_RESIDENCY_BUDGET_MS: 5000,
});

const SERIAL_TEXTURE_BATCH = Object.freeze({
  textureBatchCount: OPENING_LOAD_LIMITS.SERIAL_TEXTURE_BATCH_COUNT,
  textureBatchBytes: OPENING_LOAD_LIMITS.SERIAL_TEXTURE_BATCH_BYTES,
});

/** Extract the existing route choices; flight and restore retain the residency defaults. */
export function openingLoadPolicy({ shouldAwaitGpuCook, mode } = {}) {
  const serialLinkRoute = !shouldAwaitGpuCook;
  const batchUnderShell = serialLinkRoute && mode === 'loading';
  return {
    routeName: `${serialLinkRoute ? 'serial-link' : 'parallel-compile'}-${mode}`,
    serialLinkRoute,
    geometryBatchDrawables: batchUnderShell ? OPENING_LOAD_LIMITS.SERIAL_GEOMETRY_BATCH_DRAWABLES : undefined,
    textureBatch: batchUnderShell ? SERIAL_TEXTURE_BATCH : null,
    compositionSettleMs: OPENING_LOAD_LIMITS.COMPOSITION_SETTLE_MS,
    residencyBudgetMs: serialLinkRoute
      ? OPENING_LOAD_LIMITS.SERIAL_RESIDENCY_BUDGET_MS : OPENING_LOAD_LIMITS.PARALLEL_RESIDENCY_BUDGET_MS,
  };
}
