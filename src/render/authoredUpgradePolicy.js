// Authored-upgrade admission concurrency.
//
// Steady-state flight stays serial (1) so a combat stall cannot overlap two full GLB compose
// jobs. The opening/loading window and a short post-first-playable settle may overlap two
// CPU admissions so Helios/hub decode finishes before the player is looking at a live frame.

export const AUTHORED_UPGRADE_STEADY_LIMIT = 1;
export const AUTHORED_UPGRADE_OPENING_LIMIT = 2;
export const AUTHORED_UPGRADE_SETTLE_MS = 8000;

export function authoredUpgradeConcurrencyLimit(runtime = {}) {
  if (runtime.mode === 'loading') return AUTHORED_UPGRADE_OPENING_LIMIT;
  if (runtime.opening === true || runtime.deferNoncriticalMeshStreaming === true) {
    return AUTHORED_UPGRADE_OPENING_LIMIT;
  }
  const firstPlayable = Number(runtime.firstPlayableFrameAt);
  const nowMs = Number(runtime.nowMs);
  if (Number.isFinite(firstPlayable) && Number.isFinite(nowMs)
      && nowMs - firstPlayable >= 0
      && nowMs - firstPlayable < AUTHORED_UPGRADE_SETTLE_MS) {
    return AUTHORED_UPGRADE_OPENING_LIMIT;
  }
  return AUTHORED_UPGRADE_STEADY_LIMIT;
}
