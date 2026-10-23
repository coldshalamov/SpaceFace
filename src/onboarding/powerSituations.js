// HOTFIX STUB: src/systems/onboarding.js (b6b5e68681) imports this module, but it was never
// committed, so main.js failed to load and the game could not boot. This stub keeps the
// power-situation ladder inert (empty list => _tickPowerSituations returns immediately).
// Replace with the real module when it lands.
export const POWER_SITUATIONS = Object.freeze([]);
export const POWER_SITUATION_FIRST_S = 0;
export const POWER_SITUATION_GAP_S = 0;
export const POWER_SITUATION_TTL_S = 0;
export const POWER_SITUATION_WINDOW_S = 0;

export function normalizePowerSit(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    next: Number.isFinite(r.next) ? r.next : 0,
    nextAtS: Number.isFinite(r.nextAtS) ? r.nextAtS : 0,
    doneAt: Number.isFinite(r.doneAt) ? r.doneAt : null,
    active: null,
  };
}
export function situationFor() { return null; }
export function propWorldPos(_p, playerPos, _heading, out) { if (out && playerPos) { out.x = playerPos.x; out.y = playerPos.y; out.z = playerPos.z; } return out; }
export function propWorldVel(_p, _pos, _playerPos, out) { if (out) { out.x = 0; out.y = 0; out.z = 0; } return out; }
