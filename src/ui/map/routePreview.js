// Pure route-preview helpers shared by the galaxy-map screen.

/** Find a shortest-hop preview through charted sectors, allowing an uncharted final destination. */
export function computePreviewRoute(sectors, startSectorId, targetSectorId, isCharted) {
  if (!startSectorId || !targetSectorId || startSectorId === targetSectorId) return null;
  const records = Array.isArray(sectors) ? sectors : [];
  const charted = typeof isCharted === 'function' ? isCharted : () => false;
  const nodeById = new Map(records.map((sector) => [sector.id, sector]));

  const dist = new Map();
  const prev = new Map();
  const visited = new Set();
  const pq = [startSectorId];

  dist.set(startSectorId, 0);

  while (pq.length) {
    let bi = 0;
    for (let i = 1; i < pq.length; i += 1) {
      if ((dist.get(pq[i]) ?? Infinity) < (dist.get(pq[bi]) ?? Infinity)) bi = i;
    }
    const u = pq.splice(bi, 1)[0];
    if (visited.has(u)) continue;
    visited.add(u);
    if (u === targetSectorId) break;

    const sector = nodeById.get(u);
    if (!sector) continue;

    const neighbors = Array.isArray(sector.neighbors) ? sector.neighbors : [];
    for (const v of neighbors) {
      const next = nodeById.get(v);
      if (!next) continue;
      if (!charted(next) && v !== targetSectorId) continue;

      const alt = (dist.get(u) ?? 0) + 1;
      if (alt < (dist.get(v) ?? Infinity)) {
        dist.set(v, alt);
        prev.set(v, u);
        pq.push(v);
      }
    }
  }

  if (!prev.has(targetSectorId)) return null;

  const path = [];
  let curr = targetSectorId;
  while (curr) {
    path.push(curr);
    curr = prev.get(curr);
  }
  return path.reverse();
}

/**
 * Format a world-owned route cost, or a local fallback path's hop count without guessing fuel.
 */
export function formatRoutePlanCost(route, fallbackPath = null) {
  if (route && typeof route === 'object') {
    const legs = Array.isArray(route.legs) ? route.legs : [];
    const reportedHops = Number(route.totalHops);
    const hops = Number.isFinite(reportedHops) && reportedHops >= 0
      ? Math.floor(reportedHops)
      : legs.length;
    let fuel = Number(route.totalFuel);
    if (!Number.isFinite(fuel) && legs.length && legs.every((leg) => Number.isFinite(Number(leg && leg.fuel)))) {
      fuel = legs.reduce((sum, leg) => sum + Number(leg.fuel), 0);
    }
    if (hops > 0 && Number.isFinite(fuel) && fuel >= 0) {
      return `${hops} ${hops === 1 ? 'Jump' : 'Jumps'} (Fuel: ${Math.round(fuel)} Units)`;
    }
  }

  if (Array.isArray(fallbackPath) && fallbackPath.length > 1) {
    const hops = fallbackPath.length - 1;
    return `${hops} ${hops === 1 ? 'Jump' : 'Jumps'} (Fuel unavailable)`;
  }
  return null;
}
