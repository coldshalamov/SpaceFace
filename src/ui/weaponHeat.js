// Aggregate weapon-instance heat for HUD vitals (not WANTED heat — see heat.js).
// Matches FEATHER_BAND in src/systems/weapons.js (OVH-08b / W2-1).
export const HEAT_AMBER_BAND = 0.6;

export function weaponHeatSummary(weapons, out = null, simTime = null) {
  const summary = out || {};
  if (!Array.isArray(weapons) || !weapons.length) {
    summary.frac = 0;
    summary.pct = 0;
    summary.amber = false;
    summary.locked = false;
    summary.overheated = false;
    summary.lockedWeaponId = null;
    summary.lockRemainingS = 0;
    summary.armed = false;
    return summary;
  }
  const hasClock = Number.isFinite(simTime);
  let maxFrac = 0;
  let overheated = false;
  let locked = false;
  let lockedWeaponId = null;
  let lockRemainingS = 0;
  for (const w of weapons) {
    if (!w) continue;
    const hMax = Number.isFinite(w.heatMax) ? w.heatMax : 100;
    const hCur = w._heat || 0;
    if (hMax > 0) {
      const frac = hCur / hMax;
      if (frac > maxFrac) maxFrac = frac;
      if (hCur >= hMax) overheated = true;
    }
    const lockUntil = Number(w._lockUntil);
    if (hasClock && Number.isFinite(lockUntil) && simTime < lockUntil) {
      locked = true;
      const rem = lockUntil - simTime;
      if (rem > lockRemainingS) {
        lockRemainingS = rem;
        lockedWeaponId = w.defId || null;
      }
    }
  }
  const frac = maxFrac < 0 ? 0 : maxFrac > 1 ? 1 : maxFrac;
  summary.frac = frac;
  summary.pct = Math.round(frac * 100);
  summary.amber = frac >= HEAT_AMBER_BAND;
  summary.locked = locked || overheated;
  summary.overheated = summary.locked;
  summary.lockedWeaponId = lockedWeaponId;
  summary.lockRemainingS = lockRemainingS;
  summary.armed = true;
  return summary;
}
