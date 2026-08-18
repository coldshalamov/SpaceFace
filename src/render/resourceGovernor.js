// Long-session CPU/GPU residency governor.
//
// Extends ref-counted residency with explicit byte budgets and deterministic eviction order.
// Never evicts the player shell, the current-sector opening cohort, or an in-flight decode.
// Previous-sector warmth is lowest priority and is the first thing released when over budget.

export const GOVERNOR_ROLE_PRIORITY = Object.freeze({
  'in-flight': 0,
  player: 1,
  'opening-shell': 2,
  'current-sector': 3,
  'whole-ship-lod-family': 4,
  'warm-previous-sector': 8,
  'save-restore-hold': 7,
  unused: 9,
});

export function evictionPriority(entry = {}) {
  const roles = Array.isArray(entry.roles) ? entry.roles : [entry.role];
  let best = GOVERNOR_ROLE_PRIORITY.unused;
  for (const role of roles) {
    const rank = GOVERNOR_ROLE_PRIORITY[role];
    if (Number.isInteger(rank) && rank < best) best = rank;
  }
  return best;
}

export function compareEvictionOrder(a, b) {
  const pa = evictionPriority(a);
  const pb = evictionPriority(b);
  if (pa !== pb) return pb - pa; // higher rank number evicts first
  const ba = Number(a.bytes) || 0;
  const bb = Number(b.bytes) || 0;
  if (ba !== bb) return bb - ba;
  return String(a.key || '').localeCompare(String(b.key || ''));
}

export function selectEvictions(entries, options = {}) {
  const maxBytes = Number(options.maxBytes);
  const budget = Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : Number.POSITIVE_INFINITY;
  const list = (entries || []).map((entry) => ({ ...entry }));
  let total = 0;
  for (const entry of list) total += Number(entry.bytes) || 0;
  if (total <= budget) {
    return Object.freeze({
      overBudget: false,
      residentBytes: total,
      budgetBytes: budget,
      evict: Object.freeze([]),
    });
  }
  const ordered = [...list].sort(compareEvictionOrder);
  const evict = [];
  for (const entry of ordered) {
    if (evictionPriority(entry) <= GOVERNOR_ROLE_PRIORITY['opening-shell']) continue;
    evict.push(entry.key);
    total -= Number(entry.bytes) || 0;
    if (total <= budget) break;
  }
  return Object.freeze({
    overBudget: total > budget,
    residentBytes: total,
    budgetBytes: budget,
    evict: Object.freeze(evict),
  });
}

export function createResourceGovernor(options = {}) {
  const maxCpuBytes = Number(options.maxCpuBytes) > 0 ? Number(options.maxCpuBytes) : 512 * 1024 * 1024;
  const maxGpuBytes = Number(options.maxGpuBytes) > 0 ? Number(options.maxGpuBytes) : 384 * 1024 * 1024;
  let lastPlan = null;

  return {
    plan(entries, kind = 'gpu') {
      const maxBytes = kind === 'cpu' ? maxCpuBytes : maxGpuBytes;
      lastPlan = selectEvictions(entries, { maxBytes });
      return lastPlan;
    },
    get lastPlan() { return lastPlan; },
    get maxCpuBytes() { return maxCpuBytes; },
    get maxGpuBytes() { return maxGpuBytes; },
  };
}
