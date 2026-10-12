/** Read-only freight planning. Settlement remains exclusively in economy.execute(). */
export const MAX_PLANNED_UNITS = 1_000_000;

function whole(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(MAX_PLANNED_UNITS, Math.floor(value))) : 0;
}

/** Reject partial books/holds: a quote for 3 is not evidence that 30 are affordable. */
export function fullQuantityQuote(value, qty) {
  return !!value && value.ok === true && Number.isSafeInteger(value.total) && value.total >= 0
    && value.partial !== true && value.holdLimited !== true
    && value.qty === qty
    && (value.acceptQty == null || value.acceptQty === qty);
}

/** O(log limit), with conservative integer totals from the same owner as checkout. */
export function maxAffordableQuantity({ limit, credits, quote }) {
  if (!Number.isFinite(credits) || credits < 0 || typeof quote !== 'function') return 0;
  let low = 0, high = whole(limit);
  while (low < high) {
    const mid = low + Math.ceil((high - low) / 2);
    let value;
    try { value = quote(mid); } catch (_) { value = null; }
    if (fullQuantityQuote(value, mid) && value.total <= credits) low = mid;
    else high = mid - 1;
  }
  return low;
}

/**
 * Source cost is executable now; sale proceeds are ONLY a remembered-price estimate.
 * The source book is convex (positive, nondecreasing marginal cost). When the owner
 * supplies its unrounded average, stop adding units when that marginal cost exceeds
 * the remembered destination bid. Never query a hidden remote book to improve a plan.
 * Cash reserve is optional, caller-owned intent: this function does not charge it.
 */
export function planTradeLoad({ credits, reserveCredits = 0, holdUnits, stockUnits, sellEstimate, quote }) {
  if (![credits, reserveCredits, sellEstimate].every(Number.isFinite)
    || credits < 0 || reserveCredits < 0 || sellEstimate <= 0 || typeof quote !== 'function') return null;
  const capacity = whole(holdUnits), stock = whole(stockUnits);
  const limit = Math.min(capacity, stock);
  const budget = Math.max(0, Math.floor(credits - reserveCredits));
  if (limit < 1) return null;
  const cache = new Map();
  const read = (n) => {
    if (!cache.has(n)) {
      let value;
      try { value = quote(n); } catch (_) { value = null; }
      cache.set(n, fullQuantityQuote(value, n) ? value : null);
    }
    return cache.get(n);
  };
  const affordable = maxAffordableQuantity({ limit, credits: budget, quote: read });
  if (affordable < 1) return null;
  const last = read(affordable);
  let units = affordable;
  // Integer destination quotes let maximizing the raw concave surplus also maximize
  // its conservative integer settlement. Otherwise retain a clearly estimated full lot.
  if (Number.isInteger(sellEstimate) && Number.isFinite(last.unitAvg) && last.unitAvg > 0) {
    const rawCost = (n) => {
      if (n === 0) return 0;
      const q = read(n);
      return q && Number.isFinite(q.unitAvg) && q.unitAvg > 0 ? q.unitAvg * n : Infinity;
    };
    let low = 0, high = affordable;
    while (low < high) {
      const mid = low + Math.ceil((high - low) / 2);
      const cost = rawCost(mid), previous = rawCost(mid - 1);
      if (Number.isFinite(cost) && Number.isFinite(previous) && cost - previous <= sellEstimate) low = mid;
      else high = mid - 1;
    }
    units = low;
  }
  // Check the rounding boundary; equal margins prefer less committed cargo/cash.
  const candidates = [...new Set([units - 1, units, units + 1, affordable])]
    .filter((n) => n >= 1 && n <= affordable);
  let best = null;
  for (const n of candidates) {
    const q = read(n);
    if (!q || q.total > budget) continue;
    const proceeds = Math.floor(sellEstimate * n);
    if (!Number.isSafeInteger(proceeds)) continue;
    const margin = proceeds - q.total;
    if (margin <= 0 || (best && (margin < best.loadProfit || (margin === best.loadProfit && n >= best.loadUnits)))) continue;
    best = {
      loadUnits: n, loadCost: q.total, loadProfit: margin, estimatedProceeds: proceeds,
      cashAfterPurchase: credits - q.total, reserveCredits,
      holdUnits: capacity, stockUnits: stock, affordableUnits: affordable,
      loadBound: n < affordable ? 'margin' : affordable < limit ? 'credits' : stock < capacity ? 'stock' : 'hold',
      buyUnitAverage: q.total / n,
      priceImpactPct: Number.isFinite(q.priceImpactPct) ? q.priceImpactPct : null,
      quoteCalls: cache.size,
    };
  }
  if (best) best.quoteCalls = cache.size;
  return best;
}
