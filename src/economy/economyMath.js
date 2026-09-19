/** Pure, dependency-free economic arithmetic. No state, randomness, or wall time. */
export const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
export const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

/** Exact first-order stock recovery, invariant to partitioning a constant-target interval. */
export function recoverStock(stock, target, elapsedS, halfLifeS, rateMultiplier = 1) {
  const s = Math.max(0, finite(stock));
  const k = Math.max(0, finite(target));
  const dt = Math.max(0, finite(elapsedS));
  const half = finite(halfLifeS);
  const rate = Math.max(0, finite(rateMultiplier));
  if (!dt || !rate || !(half > 0)) return s;
  return k + (s - k) * Math.exp(-Math.LN2 * rate * dt / half);
}

/**
 * Average of base * clamp((max(stock,1)/reference)^(-elasticity), lo, hi).
 * Integrates THROUGH the clamp knees, rather than clamping an uncapped average.
 * It also supports el=0 and the logarithmic el=1 limit. Intervals are positive stock.
 */
export function averageBoundedPrice(base, reference, elasticity, stockA, stockB, lo = 0.4, hi = 2.6) {
  const b = finite(base), ref = finite(reference), el = finite(elasticity);
  if (!(b > 0 && ref > 0 && el >= 0 && lo > 0 && hi >= lo)) {
    throw new RangeError('Invalid price curve: positive base/reference/bounds and nonnegative elasticity required');
  }
  const originalA = Math.max(0, finite(stockA));
  const originalZ = Math.max(originalA, finite(stockB, originalA));
  const a = Math.max(1, originalA);
  const z = Math.max(a, originalZ);
  const point = (s) => b * clamp(Math.pow(s / ref, -el), lo, hi);
  if (z === a || el === 0) return point(a);
  const upperKnee = ref * Math.pow(hi, -1 / el);
  const lowerKnee = ref * Math.pow(lo, -1 / el);
  let area = (Math.min(originalZ, 1) - Math.min(originalA, 1)) * point(1);
  const highEnd = Math.min(z, upperKnee);
  if (highEnd > a) area += (highEnd - a) * b * hi;
  const lowStart = Math.max(a, lowerKnee);
  if (z > lowStart) area += (z - lowStart) * b * lo;
  const from = Math.max(a, upperKnee);
  const to = Math.min(z, lowerKnee);
  if (to > from) {
    // log1p/expm1 avoid subtracting nearly equal powers on deep books / tiny lots.
    const logRatio = Math.log1p((to - from) / from);
    const exponent = 1 - el;
    const integral = Math.abs(exponent) < 1e-10
      ? logRatio
      : Math.pow(from, exponent) * Math.expm1(exponent * logRatio) / exponent;
    area += b * Math.pow(ref, el) * integral;
  }
  return clamp(area / (originalZ - originalA), b * lo, b * hi);
}

/**
 * Exact integral of the complete live quote curve:
 * base * clamp(demand*cycle * clamp(stockCurve, stockLo, stockHi), finalLo, finalHi).
 * Both demand and cycle are constant during an atomic trade. The nested clamp is
 * still a clamped power curve; integrating it preserves order-size consistency.
 */
export function averageLivePrice({
  basePrice, baseEq, elasticity, stockLo, stockHi,
  demand = 1, cycle = 1, priceLo = 0.4, priceHi = 2.6, finalLo = 0.35, finalHi = 2.8,
}) {
  const multiplier = Math.max(1e-9, finite(demand, 1) * finite(cycle, 1));
  const lo = clamp(priceLo * multiplier, finalLo, finalHi);
  const hi = clamp(priceHi * multiplier, finalLo, finalHi);
  if (lo === hi) return basePrice * lo;
  return averageBoundedPrice(basePrice * multiplier, baseEq, elasticity,
    stockLo, stockHi, lo / multiplier, hi / multiplier);
}

/** Conservative integer settlement. Splitting a lot cannot improve its rounded consideration. */
export function settleCredits(raw, side) {
  if (!Number.isFinite(raw) || raw < 0 || raw > Number.MAX_SAFE_INTEGER - 1) return null;
  if (side === 'buy') return Math.ceil(raw);
  if (side === 'sell') return Math.floor(raw);
  return null;
}

/** Reject malformed requests before any market, wallet, or cargo mutation. */
export function normalizedTradeQuantity(value, maximum = 1_000_000) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  const qty = Math.floor(value);
  return Number.isSafeInteger(qty) && qty > 0 && qty <= maximum ? qty : null;
}
