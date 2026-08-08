// Aggregate weapon-instance heat for HUD vitals (not WANTED heat — see heat.js).
export function weaponHeatSummary(weapons, out = null) {
  const summary = out || {};
  if (!Array.isArray(weapons) || !weapons.length) {
    summary.frac = 0;
    summary.pct = 0;
    summary.overheated = false;
    summary.armed = false;
    return summary;
  }
  let maxFrac = 0;
  let overheated = false;
  for (const w of weapons) {
    const hMax = Number.isFinite(w.heatMax) ? w.heatMax : 100;
    const hCur = w._heat || 0;
    if (hMax <= 0) continue;
    const frac = hCur / hMax;
    if (frac > maxFrac) maxFrac = frac;
    if (hCur >= hMax) overheated = true;
  }
  const frac = maxFrac < 0 ? 0 : maxFrac > 1 ? 1 : maxFrac;
  summary.frac = frac;
  summary.pct = Math.round(frac * 100);
  summary.overheated = overheated;
  summary.armed = true;
  return summary;
}
