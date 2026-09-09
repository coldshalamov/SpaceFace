// Deterministic multi-target selection (PQ-133 §9.3).
// Query is the caller's job. This module only filters, scores, and sorts.

function distSq(a, b) {
  const dx = (a && a.x || 0) - (b && b.x || 0);
  const dz = (a && a.z || 0) - (b && b.z || 0);
  return dx * dx + dz * dz;
}

function stableId(value) {
  if (value == null) return '';
  return String(value);
}

/**
 * Select up to `count` candidates with a stable order:
 * 1. drop invalid / visited / status-mismatched
 * 2. authored score descending
 * 3. distance-squared ascending
 * 4. stable entity id
 *
 * Never uses insertion order or ambient randomness.
 */
export function selectTargets(candidates, options = {}) {
  const count = Number.isInteger(options.count) && options.count > 0 ? options.count : 1;
  const visited = options.visited;
  const requireStatus = options.requireStatus || null;
  const sourcePos = options.sourcePos || { x: 0, z: 0 };
  const list = Array.isArray(candidates) ? candidates : [];
  const scored = [];

  for (let i = 0; i < list.length; i++) {
    const candidate = list[i];
    if (!candidate || candidate.id == null) continue;
    if (candidate.valid === false) continue;
    if (visited && typeof visited.has === 'function' && visited.has(candidate.id)) continue;
    if (visited && visited instanceof Set && visited.has(candidate.id)) continue;
    if (requireStatus) {
      const statuses = candidate.statuses;
      const has = Array.isArray(statuses)
        ? statuses.includes(requireStatus)
        : !!(statuses && statuses[requireStatus]);
      if (!has) continue;
    }
    const pos = candidate.pos || { x: 0, z: 0 };
    const score = Number.isFinite(candidate.score) ? candidate.score : 0;
    scored.push({
      id: candidate.id,
      score,
      distSq: distSq(pos, sourcePos),
      stable: stableId(candidate.id),
      candidate,
    });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.distSq !== b.distSq) return a.distSq - b.distSq;
    if (a.stable < b.stable) return -1;
    if (a.stable > b.stable) return 1;
    return 0;
  });

  const selected = [];
  for (let i = 0; i < scored.length && selected.length < count; i++) {
    selected.push(scored[i].candidate);
  }
  return selected;
}
