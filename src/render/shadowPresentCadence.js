// After a missed vsync, skip one directional shadow refresh so the next
// present can recover. The map stays on; only the extra depth pass waits
// one frame. Player-near shadows catch up on the following display callback.

export const SHADOW_PRESENT_LATE_MS = 22;

export function shouldRefreshRealtimeShadowMap(options = {}) {
  const last = Number(options.lastPresentDtMs);
  if (!Number.isFinite(last)) return true;
  if (last > SHADOW_PRESENT_LATE_MS && options.skippedLast !== true) return false;
  return true;
}
