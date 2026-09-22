// Wave G11 — a module card shows a number only when the sim reads the fields that make it.

const LIVE_METRIC_LABELS = new Set([
  'DPS', 'ORE DPS', 'RANGE', 'SHOVE', 'SHIELD', 'REGEN', 'SPEED', 'ACCEL',
  'CAPACITY', 'CAP %', 'HIDDEN %', 'CLOAK %', 'MASS', 'DRAW',
]);

export function admitModuleMetric(label) {
  return LIVE_METRIC_LABELS.has(String(label || ''));
}

/**
 * Damage rate the shot loop actually uses: damage times rate of fire.
 * A catalog `dps` with no damage and no rate is not a number the sim reads.
 * A beam with rate 0 shows its damage, which is the hit.
 */
export function liveDamageRate(def) {
  if (!def) return null;
  const dmg = Number(def.dmg);
  const rof = Number(def.rof);
  if (Number.isFinite(dmg) && Number.isFinite(rof) && rof > 0) return dmg * rof;
  if (rof === 0 && Number.isFinite(dmg)) return dmg;
  return null;
}
