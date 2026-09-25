// Exact skin-seat queries over the baked hull triangle soup, replacing the per-mount
// Raycaster brute force. attachRetroMounts asked three's Raycaster to intersectObject
// the whole soup 28 times per attach (7 heights × 2 seat stations × 2 sides) — about
// 1.4 s of buildComposedShip on a CPU-bound laptop. For an axis-aligned flank ray the
// raycaster's first hit is the outermost triangle point over the ray's (x, y), i.e.
// max(side*z) among triangles whose XY projection contains the point — which this
// module answers directly in one bbox-rejected soup pass.
//
// Containment and hit depth replicate three's Ray.intersectTriangle arithmetic exactly
// (the same edge cross/dot products, sign normalization, and t = QdN/DdN → ray.at(t)),
// because flankSeat's "widest wins" rule is a strict-compare across probe heights —
// a barycentric z would round differently by ~1e-16 and flip mathematically-tied picks.

export function buildSkinSeatIndex(positions) {
  const pos = positions instanceof Float32Array ? positions : Float32Array.from(positions);
  const triCount = (pos.length / 9) | 0;
  const minX = new Float32Array(triCount);
  const maxX = new Float32Array(triCount);
  const minY = new Float32Array(triCount);
  const maxY = new Float32Array(triCount);
  for (let t = 0; t < triCount; t++) {
    const o = t * 9;
    const ax = pos[o], ay = pos[o + 1];
    const bx = pos[o + 3], by = pos[o + 4];
    const cx = pos[o + 6], cy = pos[o + 7];
    minX[t] = Math.min(ax, bx, cx);
    maxX[t] = Math.max(ax, bx, cx);
    minY[t] = Math.min(ay, by, cy);
    maxY[t] = Math.max(ay, by, cy);
  }
  return { positions: pos, triCount, minX, maxX, minY, maxY };
}

// The z of the outermost skin point over (x, y) on the given side — the raycaster's
// first hit along origin (x, y, side*farZ) → dir (0, 0, -side), DoubleSide — or null.
export function outermostSkinZ(index, x, y, side, farZ) {
  const { positions: pos, triCount, minX, maxX, minY, maxY } = index;
  const oz = side * farZ;
  let best = 0; // largest side*z seen; admitted hits are strictly > 0
  for (let t = 0; t < triCount; t++) {
    if (x < minX[t] || x > maxX[t] || y < minY[t] || y > maxY[t]) continue;
    const o = t * 9;
    const e1x = pos[o + 3] - pos[o];
    const e1y = pos[o + 4] - pos[o + 1];
    const e2x = pos[o + 6] - pos[o];
    const e2y = pos[o + 7] - pos[o + 1];
    // nz is exactly three's D·N magnitude base: for this axis-aligned ray the cross
    // product's z component is the triangle's 2*signed XY area, and DdN === 0 is the
    // parallel-ray rejection the raycaster applies.
    const nz = e1x * e2y - e1y * e2x;
    const ddNraw = -side * nz;
    if (ddNraw === 0) continue;
    const sign = ddNraw > 0 ? 1 : -1;
    const ddN = ddNraw * sign;
    const qx = x - pos[o];
    const qy = y - pos[o + 1];
    const numU = sign * -side * (qx * e2y - qy * e2x);
    if (numU < 0) continue;
    const numV = sign * -side * (e1x * qy - e1y * qx);
    if (numV < 0 || numU + numV > ddN) continue;
    const nx = e1y * (pos[o + 8] - pos[o + 2]) - (pos[o + 5] - pos[o + 2]) * e2y;
    const ny = (pos[o + 5] - pos[o + 2]) * e2x - e1x * (pos[o + 8] - pos[o + 2]);
    const qdN = -sign * (qx * nx + qy * ny + (oz - pos[o + 2]) * nz);
    const z = oz + -side * (qdN / ddN);
    const sz = z * side;
    if (sz <= 0 || sz > farZ) continue;
    if (sz > best) best = sz;
  }
  return best === 0 ? null : best * side;
}

const FLANK_DY = [0, -0.03, 0.03, -0.06, 0.06, -0.1, 0.1];
const _dyBest = new Float64Array(FLANK_DY.length);

// The outermost skin point inside the vertical probe window around the ideal mount
// height — the same "wider |z| wins, earliest dy wins ties" rule flankSurfaceAt had
// with per-dy raycasts, evaluated in a single soup pass.
export function flankSeat(index, x, y, side, farZ) {
  const { positions: pos, triCount, minX, maxX, minY, maxY } = index;
  const oz = side * farZ;
  _dyBest.fill(0);
  for (let t = 0; t < triCount; t++) {
    if (x < minX[t] || x > maxX[t]) continue;
    const o = t * 9;
    const ax = pos[o];
    const ay = pos[o + 1];
    const az = pos[o + 2];
    const e1x = pos[o + 3] - ax;
    const e1y = pos[o + 4] - ay;
    const e1z = pos[o + 5] - az;
    const e2x = pos[o + 6] - ax;
    const e2y = pos[o + 7] - ay;
    const e2z = pos[o + 8] - az;
    const nz = e1x * e2y - e1y * e2x;
    const ddNraw = -side * nz;
    if (ddNraw === 0) continue;
    const sign = ddNraw > 0 ? 1 : -1;
    const ddN = ddNraw * sign;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const qx = x - ax;
    const qzConst = (oz - az) * nz;
    const nside = sign * -side;
    for (let d = 0; d < FLANK_DY.length; d++) {
      const yy = y + FLANK_DY[d];
      if (yy < minY[t] || yy > maxY[t]) continue;
      const qy = yy - ay;
      const numU = nside * (qx * e2y - qy * e2x);
      if (numU < 0) continue;
      const numV = nside * (e1x * qy - e1y * qx);
      if (numV < 0 || numU + numV > ddN) continue;
      const qdN = -sign * (qx * nx + qy * ny + qzConst);
      const sz = (oz + -side * (qdN / ddN)) * side;
      if (sz <= 0 || sz > farZ) continue;
      if (sz > _dyBest[d]) _dyBest[d] = sz;
    }
  }
  let best = 0;
  let bestDy = -1;
  for (let d = 0; d < FLANK_DY.length; d++) {
    if (_dyBest[d] > best) {
      best = _dyBest[d];
      bestDy = d;
    }
  }
  if (bestDy < 0) return null;
  return { x, y: y + FLANK_DY[bestDy], z: best * side };
}
