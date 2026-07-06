// Aggregate weapon-instance heat for HUD vitals (not WANTED heat — see heat.js).
export function weaponHeatSummary(weapons) {
  if (!Array.isArray(weapons) || !weapons.length) {
    return { frac: 0, pct: 0, overheated: false, armed: false };
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
  return { frac, pct: Math.round(frac * 100), overheated, armed: true };
}