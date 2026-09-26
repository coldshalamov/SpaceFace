// Pure model-truth geometry. No Three.js, no file IO. The census and the sim readers
// both use these functions so a measured outline and a collider cannot drift apart.

export const SHIP_HULL_TARGET_LENGTH = 1.72;
export const OUTLINE_BINS = 24;
export const FLIGHT_PLANE_STICK_FRACTION = 0.12;
export const FLIGHT_PLANE_STICK_MIN_WU = 2;
export const CAMERA_NEAR_MARGIN_WU = 1;
export const LOD_OUTLINE_FRACTION = 0.08;
export const LOD_OUTLINE_MIN_WU = 4;
export const MAX_SKIN_PRIMITIVES = 32;

export function flightPlaneToleranceWu(silhouetteRadius) {
  const r = Number(silhouetteRadius);
  const radius = Number.isFinite(r) && r > 0 ? r : 0;
  return Math.max(FLIGHT_PLANE_STICK_MIN_WU, FLIGHT_PLANE_STICK_FRACTION * radius);
}

export function lodOutlineToleranceWu(lod0Radius) {
  const r = Number(lod0Radius);
  const radius = Number.isFinite(r) && r > 0 ? r : 0;
  return Math.max(LOD_OUTLINE_MIN_WU, LOD_OUTLINE_FRACTION * radius);
}

export function roundWu(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1e6) / 1e6;
}

export function boundsOfPoints(points) {
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (p.z > maxZ) maxZ = p.z;
  }
  if (!Number.isFinite(minX)) {
    return { min: [0, 0, 0], max: [0, 0, 0], center: [0, 0, 0], size: [0, 0, 0] };
  }
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    size: [maxX - minX, maxY - minY, maxZ - minZ],
  };
}

/** Draw fit the live loader uses. `model` is unscaled bounds: {center, size}. */
export function drawFit(kind, model, spec) {
  const size = model && model.size || [1, 1, 1];
  const center = model && model.center || [0, 0, 0];
  const sizeX = Math.max(Number(size[0]) || 0, 1e-6);
  const sizeY = Math.max(Number(size[1]) || 0, 0);
  const sizeZ = Math.max(Number(size[2]) || 0, 0);
  const envelope = Math.max(sizeX, sizeY, sizeZ, 1e-6);
  if (kind === 'ship') {
    const radius = Math.max(0.1, Number(spec && spec.entityRadius) || 14);
    const scale = (SHIP_HULL_TARGET_LENGTH / sizeX) * radius;
    return { scale, offset: [0, 0, 0] };
  }
  if (kind === 'station') {
    const dock = Math.max(1, Number(spec && spec.dockRadius) || 72);
    const scale = (dock * 2) / envelope;
    return { scale, offset: [-(Number(center[0]) || 0) * scale, 0, -(Number(center[2]) || 0) * scale] };
  }
  if (kind === 'payload' || kind === 'packaged-radius') {
    const radius = Math.max(kind === 'payload' ? 1 : 0.1, Number(spec && spec.entityRadius) || 1);
    const scale = (radius * 2) / envelope;
    return {
      scale,
      offset: [
        -(Number(center[0]) || 0) * scale,
        -(Number(center[1]) || 0) * scale,
        -(Number(center[2]) || 0) * scale,
      ],
    };
  }
  const placeScale = Number(spec && spec.placeScale);
  const scale = Number.isFinite(placeScale) && placeScale > 0 ? placeScale : 1;
  return { scale, offset: [-(Number(center[0]) || 0) * scale, 0, -(Number(center[2]) || 0) * scale] };
}

export function applyFit(points, fit) {
  const scale = fit.scale;
  const ox = fit.offset[0];
  const oy = fit.offset[1];
  const oz = fit.offset[2];
  const out = new Array(points.length);
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    out[i] = { x: p.x * scale + ox, y: p.y * scale + oy, z: p.z * scale + oz };
  }
  return out;
}

export function gameplaySliceY(worldPoints) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of worldPoints) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minY)) return 0;
  if (minY <= 0 && maxY >= 0) return 0;
  return Math.abs(minY) < Math.abs(maxY) ? minY : maxY;
}

export function slicePoints(worldPoints, sliceY) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of worldPoints) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const height = Number.isFinite(maxY) ? Math.max(0, maxY - minY) : 0;
  const band = Math.max(FLIGHT_PLANE_STICK_MIN_WU, height * 0.08);
  const kept = [];
  for (const p of worldPoints) {
    if (Math.abs(p.y - sliceY) <= band) kept.push(p);
  }
  return kept.length >= 24 ? kept : worldPoints;
}

export function radialOutline(points, bins = OUTLINE_BINS) {
  const radii = new Array(bins).fill(0);
  for (const p of points) {
    const r = Math.hypot(p.x, p.z);
    let i = Math.floor(((Math.atan2(p.z, p.x) + Math.PI) / (Math.PI * 2)) * bins);
    if (i < 0) i = 0;
    if (i >= bins) i = bins - 1;
    if (r > radii[i]) radii[i] = r;
  }
  return radii;
}

export function silhouetteRadiusOf(radii) {
  let max = 0;
  for (const r of radii) if (r > max) max = r;
  return max;
}

export function outlineDelta(lodRadii, lod0Radii) {
  const n = Math.min(lodRadii.length, lod0Radii.length);
  let max = 0;
  for (let i = 0; i < n; i += 1) {
    const d = Math.abs((lodRadii[i] || 0) - (lod0Radii[i] || 0));
    if (d > max) max = d;
  }
  return max;
}

export function circleContains(x, z, primitive) {
  const dx = x - primitive.x;
  const dz = z - primitive.z;
  return dx * dx + dz * dz <= primitive.r * primitive.r + 1e-6;
}

export function capsuleContains(x, z, primitive) {
  const abx = primitive.bx - primitive.ax;
  const abz = primitive.bz - primitive.az;
  const apx = x - primitive.ax;
  const apz = z - primitive.az;
  const ab2 = abx * abx + abz * abz;
  const t = ab2 > 1e-12 ? Math.max(0, Math.min(1, (apx * abx + apz * abz) / ab2)) : 0;
  const dx = x - (primitive.ax + abx * t);
  const dz = z - (primitive.az + abz * t);
  return dx * dx + dz * dz <= primitive.r * primitive.r + 1e-6;
}

export function obbContains(x, z, primitive) {
  const dx = x - primitive.x;
  const dz = z - primitive.z;
  const c = Math.cos(-(primitive.rot || 0));
  const s = Math.sin(-(primitive.rot || 0));
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= primitive.hx + 1e-6 && Math.abs(lz) <= primitive.hz + 1e-6;
}

export function primitiveContains(x, z, primitive) {
  if (!primitive) return false;
  if (primitive.kind === 'circle') return circleContains(x, z, primitive);
  if (primitive.kind === 'capsule') return capsuleContains(x, z, primitive);
  if (primitive.kind === 'obb') return obbContains(x, z, primitive);
  return false;
}

export function skinContains(x, z, primitives) {
  for (const primitive of primitives || []) {
    if (primitiveContains(x, z, primitive)) return true;
  }
  return false;
}

/** Craft capsule in entity space. Same construction as buildCraftCapsuleColliderDesc. */
export function craftCapsulePrimitives(proportions, radius, com = null) {
  const R = Math.max(0.1, Number(radius) || 14);
  const length = Math.max(0.1, (Number(proportions && proportions.length) || 1.35) * R);
  const halfWidth = Math.max(0.1, (Number(proportions && proportions.halfWidth) || 0.42) * R);
  const halfHeight = Math.max(0, length * 0.5 - halfWidth);
  const cx = com && Number.isFinite(com.x) ? com.x : 0;
  const cz = com && Number.isFinite(com.z) ? com.z : 0;
  return [{
    kind: 'capsule',
    id: 'craft',
    ax: cx - halfHeight,
    az: cz,
    bx: cx + halfHeight,
    bz: cz,
    r: halfWidth,
  }];
}

export function ballPrimitives(radius) {
  const r = Math.max(0, Number(radius) || 0);
  return [{ kind: 'circle', id: 'ball', x: 0, z: 0, r }];
}

export function colliderRadiusAt(angle, primitives, maxRadius) {
  const cap = Math.max(1, maxRadius * 1.35);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // Shells are hollow, so "inside" is not a prefix of the ray. Sample the ray.
  const steps = 48;
  let outer = 0;
  for (let i = 0; i <= steps; i += 1) {
    const radius = (cap * i) / steps;
    if (skinContains(c * radius, s * radius, primitives)) outer = radius;
  }
  return outer;
}

/** How far the visual outline sits outside the skin, and how far the skin sticks past it. */
export function outlineFit(visualRadii, primitives, toleranceWu) {
  const bins = visualRadii.length;
  const silhouette = silhouetteRadiusOf(visualRadii);
  let coverage = 0;
  let stick = 0;
  for (let i = 0; i < bins; i += 1) {
    const visual = visualRadii[i] || 0;
    if (visual <= 0) continue;
    const angle = -Math.PI + ((i + 0.5) / bins) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const outer = colliderRadiusAt(angle, primitives, Math.max(silhouette, visual, 1));
    if (!skinContains(c * visual, s * visual, primitives)) {
      coverage = Math.max(coverage, Math.max(0, visual - outer));
    }
    stick = Math.max(stick, outer - visual - toleranceWu);
  }
  return {
    coverageWu: coverage,
    stickWu: Math.max(0, stick),
    gapWu: Math.max(coverage, Math.max(0, stick)),
    toleranceWu,
    silhouetteRadius: silhouette,
  };
}

export function radialGap(visualRadii, primitives, toleranceWu, opening = null) {
  const bins = visualRadii.length;
  const silhouette = silhouetteRadiusOf(visualRadii);
  let coverage = 0;
  let stick = 0;
  const colliderRadii = new Array(bins);
  for (let i = 0; i < bins; i += 1) {
    const angle = -Math.PI + ((i + 0.5) / bins) * Math.PI * 2;
    const visual = visualRadii[i] || 0;
    const collider = colliderRadiusAt(angle, primitives, Math.max(silhouette, visual, 1));
    colliderRadii[i] = collider;
    if (visual <= 0) continue;
    if (opening && Number.isFinite(opening.bearing) && angleDelta(angle, opening.bearing) <= opening.half) continue;
    coverage = Math.max(coverage, visual - collider);
    stick = Math.max(stick, collider - visual - toleranceWu);
  }
  return {
    coverageWu: coverage,
    stickWu: Math.max(0, stick),
    gapWu: Math.max(coverage, Math.max(0, stick)),
    colliderRadii,
    toleranceWu,
    silhouetteRadius: silhouette,
  };
}

function cellKey(ix, iz) {
  return `${ix},${iz}`;
}

export function rasterizeSlice(points, cell) {
  const occupied = new Set();
  const step = Math.max(cell * 0.5, 0.25);
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    occupied.add(cellKey(Math.round(p.x / cell), Math.round(p.z / cell)));
  }
  if (points.length >= 2) {
    const stride = Math.max(1, Math.floor(points.length / 4000));
    for (let i = 0; i < points.length; i += stride) {
      const a = points[i];
      const b = points[(i + stride) % points.length];
      const dist = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.ceil(dist / step));
      for (let s = 0; s <= n; s += 1) {
        const t = s / n;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        occupied.add(cellKey(Math.round(x / cell), Math.round(z / cell)));
      }
    }
  }
  return occupied;
}

function parseCell(key) {
  const split = key.split(',');
  return [Number(split[0]), Number(split[1])];
}

/** Flood from the border so a closed cross-section becomes solid and a real hole stays empty. */
export function fillSolidCells(boundary, padding = 2) {
  let minX = Infinity; let minZ = Infinity; let maxX = -Infinity; let maxZ = -Infinity;
  for (const key of boundary) {
    const [ix, iz] = parseCell(key);
    if (ix < minX) minX = ix;
    if (iz < minZ) minZ = iz;
    if (ix > maxX) maxX = ix;
    if (iz > maxZ) maxZ = iz;
  }
  if (!Number.isFinite(minX)) return new Set();
  minX -= padding; minZ -= padding; maxX += padding; maxZ += padding;
  const outside = new Set();
  const queue = [];
  const push = (ix, iz) => {
    if (ix < minX || iz < minZ || ix > maxX || iz > maxZ) return;
    const key = cellKey(ix, iz);
    if (boundary.has(key) || outside.has(key)) return;
    outside.add(key);
    queue.push(key);
  };
  for (let ix = minX; ix <= maxX; ix += 1) {
    push(ix, minZ);
    push(ix, maxZ);
  }
  for (let iz = minZ; iz <= maxZ; iz += 1) {
    push(minX, iz);
    push(maxX, iz);
  }
  while (queue.length) {
    const [ix, iz] = parseCell(queue.pop());
    push(ix + 1, iz);
    push(ix - 1, iz);
    push(ix, iz + 1);
    push(ix, iz - 1);
  }
  const solid = new Set(boundary);
  for (let ix = minX; ix <= maxX; ix += 1) {
    for (let iz = minZ; iz <= maxZ; iz += 1) {
      const key = cellKey(ix, iz);
      if (!outside.has(key)) solid.add(key);
    }
  }
  return solid;
}

export function carveWedge(cells, bearingRad, halfAngleRad, innerRadius, outerRadius, cell) {
  const next = new Set(cells);
  const c = Math.cos(bearingRad);
  const s = Math.sin(bearingRad);
  for (const key of cells) {
    const [ix, iz] = parseCell(key);
    const x = ix * cell;
    const z = iz * cell;
    const r = Math.hypot(x, z);
    if (r < innerRadius || r > outerRadius) continue;
    const ang = Math.atan2(z, x);
    let d = ang - bearingRad;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) <= halfAngleRad) next.delete(key);
  }
  // Keep the axis itself clear even when the wedge math misses the origin cell.
  next.delete(cellKey(0, 0));
  void c;
  void s;
  return next;
}

export function mouthBearingRad(points) {
  const bins = 36;
  const outer = new Array(bins).fill(0);
  let maxR = 0;
  for (const p of points) {
    const r = Math.hypot(p.x, p.z);
    if (r > maxR) maxR = r;
  }
  if (maxR <= 0) return 0;
  for (const p of points) {
    const r = Math.hypot(p.x, p.z);
    if (r < maxR * 0.72) continue;
    let i = Math.floor(((Math.atan2(p.z, p.x) + Math.PI) / (Math.PI * 2)) * bins);
    if (i < 0) i = 0;
    if (i >= bins) i = bins - 1;
    outer[i] += 1;
  }
  let best = 0;
  let bestCount = Infinity;
  for (let i = 0; i < bins; i += 1) {
    if (outer[i] < bestCount) {
      bestCount = outer[i];
      best = i;
    }
  }
  return -Math.PI + ((best + 0.5) / bins) * Math.PI * 2;
}

function growRectangle(solid, startIx, startIz) {
  let hx = startIx;
  let hz = startIz;
  const rowOk = (iz, from, to) => {
    for (let ix = from; ix <= to; ix += 1) {
      if (!solid.has(cellKey(ix, iz))) return false;
    }
    return true;
  };
  while (rowOk(startIz, startIx, hx + 1)) hx += 1;
  while (true) {
    let ok = true;
    for (let iz = startIz; iz <= hz + 1 && ok; iz += 1) {
      if (!rowOk(iz, startIx, hx)) ok = false;
    }
    if (!ok) break;
    hz += 1;
  }
  return { ix0: startIx, iz0: startIz, ix1: hx, iz1: hz };
}

export function rectanglesFromCells(solid) {
  const remaining = new Set(solid);
  const rects = [];
  const keys = [...remaining].sort();
  for (const key of keys) {
    if (!remaining.has(key)) continue;
    const [ix, iz] = parseCell(key);
    const rect = growRectangle(remaining, ix, iz);
    rects.push(rect);
    for (let x = rect.ix0; x <= rect.ix1; x += 1) {
      for (let z = rect.iz0; z <= rect.iz1; z += 1) remaining.delete(cellKey(x, z));
    }
    if (rects.length > 256) break;
  }
  return rects;
}

export function obbsFromRectangles(rects, cell, referenceRadius) {
  const ref = Math.max(1e-6, Number(referenceRadius) || 1);
  return rects.slice(0, MAX_SKIN_PRIMITIVES).map((rect, index) => {
    const x0 = (rect.ix0 - 0.5) * cell;
    const x1 = (rect.ix1 + 0.5) * cell;
    const z0 = (rect.iz0 - 0.5) * cell;
    const z1 = (rect.iz1 + 0.5) * cell;
    return {
      kind: 'obb',
      id: `skin-${index}`,
      x: roundWu(((x0 + x1) / 2) / ref),
      z: roundWu(((z0 + z1) / 2) / ref),
      hx: roundWu(Math.max(cell * 0.5, (x1 - x0) / 2) / ref),
      hz: roundWu(Math.max(cell * 0.5, (z1 - z0) / 2) / ref),
      angleDeg: 0,
    };
  });
}

/**
 * Build a planar skin in normalized units (1 = referenceRadius). Openings are wedges
 * that must stay empty: dock mouth or gate throat.
 */
function angleDelta(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

export function buildPlanarSkin(slice, options) {
  const radii = radialOutline(slice);
  const silhouette = Math.max(silhouetteRadiusOf(radii), 1);
  const tolerance = flightPlaneToleranceWu(silhouette);
  const reference = Math.max(1e-6, Number(options.referenceRadius) || silhouette);
  const bins = radii.length;
  let bearing = null;
  if (options.opening === 'gate-throat') bearing = 0;
  else if (options.opening === 'dock-mouth') {
    let lowest = 0;
    for (let i = 1; i < bins; i += 1) if ((radii[i] || 0) < (radii[lowest] || 0)) lowest = i;
    bearing = -Math.PI + ((lowest + 0.5) / bins) * Math.PI * 2;
  }
  const half = options.opening === 'gate-throat' ? 0.5 : (options.opening === 'dock-mouth' ? 0.42 : 0);
  const open = (angle) => bearing != null && angleDelta(angle, bearing) <= half;
  // One circle on each sampled ray, inset so the sample sits inside the circle and the
  // circle is too small to bulge into the neighbouring ray. Openings are left empty.
  const primitives = [];
  for (let i = 0; i < bins; i += 1) {
    const visual = radii[i] || 0;
    if (visual <= 0.4) continue;
    const angle = -Math.PI + ((i + 0.5) / bins) * Math.PI * 2;
    if (open(angle)) continue;
    if (primitives.length >= MAX_SKIN_PRIMITIVES) break;
    const radius = Math.min(tolerance * 0.5, Math.max(1.25, visual * 0.07));
    const centerR = Math.max(0, visual - radius + 0.45);
    primitives.push({
      kind: 'circle',
      id: `rim-${i}`,
      x: roundWu((Math.cos(angle) * centerR) / reference),
      z: roundWu((Math.sin(angle) * centerR) / reference),
      r: roundWu(radius / reference),
    });
  }
  // A small core stops flight through the middle without reaching past the rim.
  if (options.opening !== 'gate-throat' && options.opening !== 'dock-mouth' && primitives.length < MAX_SKIN_PRIMITIVES) {
    let minVisual = Infinity;
    for (const radius of radii) if (radius > 0.4) minVisual = Math.min(minVisual, radius);
    if (Number.isFinite(minVisual) && minVisual > 1) {
      const radius = Math.min(tolerance * 0.45, minVisual * 0.55);
      primitives.push({
        kind: 'circle',
        id: 'core',
        x: 0,
        z: 0,
        r: roundWu(radius / reference),
      });
    }
  }
  return {
    primitives,
    cellWu: roundWu(tolerance),
    toleranceWu: roundWu(tolerance),
    silhouetteRadius: roundWu(silhouette),
    mouthBearingDeg: bearing == null ? null : roundWu(((bearing * 180 / Math.PI) % 360 + 360) % 360),
    primitiveCount: primitives.length,
    capped: false,
  };
}

export function scaleProxyPrimitives(localPrimitives, scale) {
  return (localPrimitives || []).map((primitive) => {
    if (primitive.kind === 'circle') {
      return {
        kind: 'circle',
        id: primitive.id || null,
        x: primitive.x * scale,
        z: primitive.z * scale,
        r: primitive.r * scale,
      };
    }
    if (primitive.kind === 'capsule') {
      return {
        kind: 'capsule',
        id: primitive.id || null,
        ax: primitive.ax * scale,
        az: primitive.az * scale,
        bx: primitive.bx * scale,
        bz: primitive.bz * scale,
        r: primitive.r * scale,
      };
    }
    return {
      kind: 'obb',
      id: primitive.id || null,
      x: primitive.x * scale,
      z: primitive.z * scale,
      hx: primitive.hx * scale,
      hz: primitive.hz * scale,
      rot: (Number(primitive.angleDeg) || 0) * Math.PI / 180,
    };
  });
}

export function throatOpen(primitives, halfWidth) {
  const w = Math.max(0.5, halfWidth || 1);
  if (skinContains(0, 0, primitives)) return false;
  if (skinContains(w * 0.25, 0, primitives)) return false;
  if (skinContains(-w * 0.25, 0, primitives)) return false;
  return true;
}

export function measuredProportions(worldPoints, entityRadius) {
  const R = Math.max(0.1, Number(entityRadius) || 1);
  const bounds = boundsOfPoints(worldPoints);
  return {
    length: roundWu(Math.max(0.1, bounds.size[0] / R)),
    halfWidth: roundWu(Math.max(0.1, (bounds.size[2] * 0.5) / R)),
    height: roundWu(Math.max(0.05, bounds.size[1] / R)),
  };
}
