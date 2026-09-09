export function quiescePq023Capture(state, resetVfx) {
  if (!state || typeof resetVfx !== 'function') return false;
  state.timeScale = 0;
  state.accumulator = 0;
  resetVfx();
  return true;
}
