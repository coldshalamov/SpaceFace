// Merge shared-edge cells only when their exact planar union is convex. Boundary
// vertices are retained; no convex hull is taken across a concavity or a gap.
function turn(a, b, c) {
  return (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
}

function winding(vertices) {
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]; const b = vertices[(i + 1) % vertices.length];
    area += a.x * b.z - a.z * b.x;
  }
  return Math.sign(area);
}

function convexUnion(a, b) {
  const sign = winding(a);
  if (!sign || winding(b) !== sign) return null;
  const edges = [];
  let shared = 0;
  for (const [polygon, other] of [[a, b], [b, a]]) {
    for (let i = 0; i < polygon.length; i++) {
      const start = polygon[i]; const end = polygon[(i + 1) % polygon.length];
      if (other.some((point, j) => point === end && other[(j + 1) % other.length] === start)) shared++;
      else edges.push([start, end]);
    }
  }
  if (!shared || edges.length < 3) return null;
  const joined = [edges[0][0]];
  let next = edges.shift()[1];
  while (next !== joined[0]) {
    joined.push(next);
    const index = edges.findIndex(edge => edge[0] === next);
    if (index < 0) return null;
    next = edges.splice(index, 1)[0][1];
  }
  if (edges.length || new Set(joined).size !== joined.length) return null;
  for (let i = 0; i < joined.length; i++) {
    if (turn(joined[i], joined[(i + 1) % joined.length], joined[(i + 2) % joined.length]) * sign < 0) return null;
  }
  return joined;
}

export function mergeConvexPlanarFan(vertices, edgeMask = 0xffffffff) {
  const origin = Object.freeze({ x: 0, z: 0 });
  const cells = [];
  for (let i = 0; i < vertices.length; i++) {
    if (!(edgeMask & (1 << i))) continue;
    const a = vertices[i]; const b = vertices[(i + 1) % vertices.length];
    if (a.x * b.z - a.z * b.x === 0) continue;
    cells.push([origin, a, b]);
  }
  // Stable first-fit order makes construction and native snapshot topology repeatable.
  // Restart after each merge so no remaining pair has a convex shared-edge union.
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const joined = convexUnion(cells[i], cells[j]);
        if (!joined) continue;
        cells[i] = joined;
        cells.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }
  return Object.freeze(cells.map(cell => Object.freeze(cell)));
}
