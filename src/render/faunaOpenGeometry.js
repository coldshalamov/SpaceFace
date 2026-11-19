// Shared organic folded-volume geometry builders for open-water fauna.
// Deterministic procedural BufferGeometry (no Math.random); produces closed, outward-wound,
// crease-textured meshes with [0, 1] UVs free of dorsal polar pinwheels.
import * as THREE from 'three';

function normVec(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function crossVec(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function catmullRom(points, v, dims) {
  const n = points.length;
  if (n === 2) {
    return points[0].map((val, k) => val + (points[1][k] - val) * v);
  }
  const scaled = Math.max(0, Math.min(n - 1, v * (n - 1)));
  const k = Math.min(n - 2, Math.floor(scaled));
  const t = scaled - k;
  const p0 = points[Math.max(0, k - 1)];
  const p1 = points[k];
  const p2 = points[k + 1];
  const p3 = points[Math.min(n - 1, k + 2)];
  const t2 = t * t;
  const t3 = t2 * t;
  const out = new Array(dims);
  for (let c = 0; c < dims; c += 1) {
    out[c] = 0.5 * (
      2 * p1[c]
      + (-p0[c] + p2[c]) * t
      + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2
      + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3
    );
  }
  return out;
}

/**
 * Compute vertex normals and average normals across coincident positions (welding UV/cap seams).
 */
export function finalizeOrganicGeometry(geometry, name = '') {
  geometry.computeVertexNormals();
  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;
  const groups = new Map();
  for (let i = 0; i < pos.count; i += 1) {
    const key = `${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(pos.getZ(i) * 1e5)}`;
    let g = groups.get(key);
    if (!g) groups.set(key, g = { ids: [], sx: 0, sy: 0, sz: 0 });
    g.ids.push(i);
    g.sx += norm.getX(i);
    g.sy += norm.getY(i);
    g.sz += norm.getZ(i);
  }
  for (const g of groups.values()) {
    const len = Math.hypot(g.sx, g.sy, g.sz) || 1;
    const nx = g.sx / len;
    const ny = g.sy / len;
    const nz = g.sz / len;
    for (const i of g.ids) norm.setXYZ(i, nx, ny, nz);
  }
  norm.needsUpdate = true;
  if (name) geometry.name = name;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Merge multiple raw indexed parts ({ positions, uvs, indices }) into one BufferGeometry.
 */
export function mergePartsGeometry(parts, name = '') {
  const positions = [];
  const uvs = [];
  const indices = [];
  let offset = 0;
  for (const part of parts) {
    for (let i = 0; i < part.positions.length; i += 1) positions.push(part.positions[i]);
    for (let i = 0; i < part.uvs.length; i += 1) uvs.push(part.uvs[i]);
    for (let i = 0; i < part.indices.length; i += 1) indices.push(part.indices[i] + offset);
    offset += part.positions.length / 3;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return finalizeOrganicGeometry(geometry, name);
}

/**
 * Build raw { positions, uvs, indices } for a closed, creased tissue volume swept along a
 * 3D Catmull-Rom spine with parallel-transported frames. Each point is [x, y, z, rx, ry].
 */
export function buildLoftedLobeData(points, {
  folds = 4,
  depth = 0.14,
  rings = 14,
  sides = 12,
  phase = 0.7,
  ventralScale = 1.0,
  keel = 0,
  tipTaper = 0.45,
  uvOffset = [0, 0],
  uvScale = [1, 1],
} = {}) {
  const spine = [];
  for (let i = 0; i <= rings; i += 1) {
    const lat = Math.PI * (0.08 + 0.84 * (i / rings));
    const v = 0.5 - 0.5 * Math.cos(lat);
    const st = catmullRom(points, v, 5);
    st[3] = Math.max(0.01, st[3]);
    st[4] = Math.max(0.01, st[4]);
    spine.push({ lat, st });
  }

  const positions = [];
  const uvs = [];
  const indices = [];
  let prevN = null;
  let prevB = null;
  let firstT = null;
  let lastT = null;

  for (let i = 0; i <= rings; i += 1) {
    const { lat, st } = spine[i];
    const pPrev = spine[Math.max(0, i - 1)].st;
    const pNext = spine[Math.min(rings, i + 1)].st;
    const tangent = normVec([pNext[0] - pPrev[0], pNext[1] - pPrev[1], pNext[2] - pPrev[2]]);
    if (i === 0) firstT = tangent;
    if (i === rings) lastT = tangent;

    let normal;
    if (!prevN) {
      const ref = Math.abs(tangent[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      normal = normVec(crossVec(ref, tangent));
    } else {
      const dot = prevN[0] * tangent[0] + prevN[1] * tangent[1] + prevN[2] * tangent[2];
      const ortho = [prevN[0] - dot * tangent[0], prevN[1] - dot * tangent[1], prevN[2] - dot * tangent[2]];
      normal = Math.hypot(ortho[0], ortho[1], ortho[2]) > 1e-5
        ? normVec(ortho)
        : normVec(crossVec(prevB, tangent));
    }
    const binormal = normVec(crossVec(tangent, normal));
    prevN = normal;
    prevB = binormal;

    const cap = Math.min(1, Math.sin(lat) / 0.587785);
    const vCoord = uvOffset[1] + uvScale[1] * (0.04 + 0.92 * (i / rings));
    for (let j = 0; j <= sides; j += 1) {
      const uFrac = j / sides;
      const angle = uFrac * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const ripple = 1 + depth * Math.cos(folds * angle + phase * Math.cos(lat)) * Math.sin(lat);
      const keelMod = keel ? (1 + keel * Math.max(0, sinA) * Math.sin(lat)) : 1;
      const vFlat = sinA < 0 ? ventralScale : 1;
      const rc = cosA * st[3] * cap * ripple;
      const rs = sinA * st[4] * cap * ripple * vFlat * keelMod;
      positions.push(
        st[0] + normal[0] * rc + binormal[0] * rs,
        st[1] + normal[1] * rc + binormal[1] * rs,
        st[2] + normal[2] * rc + binormal[2] * rs,
      );
      uvs.push(uvOffset[0] + uvScale[0] * uFrac, vCoord);
    }
  }

  for (let i = 0; i < rings; i += 1) {
    for (let j = 0; j < sides; j += 1) {
      const a = i * (sides + 1) + j;
      const b = a + sides + 1;
      // Right-handed outward winding: (tangent x radial) faces outward.
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }

  const s0 = spine[0].st;
  const sN = spine[rings].st;
  const r0 = Math.min(s0[3], s0[4]) * tipTaper;
  const rN = Math.min(sN[3], sN[4]) * tipTaper;

  const startTip = positions.length / 3;
  positions.push(s0[0] - firstT[0] * r0, s0[1] - firstT[1] * r0, s0[2] - firstT[2] * r0);
  uvs.push(uvOffset[0] + uvScale[0] * 0.5, uvOffset[1]);

  const endTip = positions.length / 3;
  positions.push(sN[0] + lastT[0] * rN, sN[1] + lastT[1] * rN, sN[2] + lastT[2] * rN);
  uvs.push(uvOffset[0] + uvScale[0] * 0.5, uvOffset[1] + uvScale[1]);

  const lastRing = rings * (sides + 1);
  for (let j = 0; j < sides; j += 1) {
    indices.push(startTip, j + 1, j);
    indices.push(endTip, lastRing + j, lastRing + j + 1);
  }

  return { positions, uvs, indices };
}

export function createLoftedLobeGeometry(points, options = {}, name = '') {
  return mergePartsGeometry([buildLoftedLobeData(points, options)], name);
}

/**
 * Closed sculpted carapace/mantle volume with planar-projected dome UVs (ZERO dorsal polar UV
 * pinwheel) and custom dorsal/ventral height and radial pleat profiles.
 */
export function createSculptedCarapaceGeometry({
  rx = 1,
  rz = 1,
  radialRings = 12,
  sides = 28,
  lobeFreq = 7,
  lobeAmp = 0.14,
  lobePhase = 0,
  dorsalY = (r, theta) => (1 - r * r) * 0.4,
  ventralY = (r, theta) => -(1 - r * r) * 0.2,
  rimRound = 0.08,
  name = '',
} = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];

  function rimMod(r, theta) {
    const edgeWeight = Math.sin(r * Math.PI * 0.5);
    return 1 + lobeAmp * edgeWeight * Math.cos(lobeFreq * theta + lobePhase + 0.6 * r);
  }

  function addSheet(isTop) {
    const startIdx = positions.length / 3;
    const centerIdx = startIdx;
    const cy = isTop ? dorsalY(0, 0) : ventralY(0, 0);
    positions.push(0, cy, 0);
    uvs.push(0.5, 0.5);

    const ringStarts = [];
    for (let ri = 1; ri <= radialRings; ri += 1) {
      const r = ri / radialRings;
      ringStarts.push(positions.length / 3);
      for (let j = 0; j < sides; j += 1) {
        const theta = (j / sides) * Math.PI * 2;
        const mod = rimMod(r, theta);
        const px = rx * r * mod * Math.cos(theta);
        const pz = rz * r * mod * Math.sin(theta);
        let py = isTop ? dorsalY(r, theta) : ventralY(r, theta);
        if (ri === radialRings) {
          // Join dorsal and ventral rims seamlessly at the mid-edge height.
          py = 0.5 * (dorsalY(1, theta) + ventralY(1, theta));
        } else if (ri === radialRings - 1) {
          const midRim = 0.5 * (dorsalY(1, theta) + ventralY(1, theta));
          py = py + (midRim - py) * rimRound;
        }
        positions.push(px, py, pz);
        // Planar dome UV clamped cleanly inside [0.04, 0.96] — zero polar pinwheel.
        const maxScale = 1 + Math.abs(lobeAmp) + 0.08;
        const u = Math.max(0.02, Math.min(0.98, 0.5 + 0.46 * (px / (rx * maxScale))));
        const v = Math.max(0.02, Math.min(0.98, 0.5 + (isTop ? 0.46 : -0.46) * (pz / (rz * maxScale))));
        uvs.push(u, v);
      }
    }

    // Center cap triangles.
    // Note: in XZ, angle theta increases from +X toward +Z (clockwise seen from +Y).
    // Outward +Y normal requires (p_{j+1} - center) x (p_j - center) => [center, j+1, j].
    const r0 = ringStarts[0];
    for (let j = 0; j < sides; j += 1) {
      const next = (j + 1) % sides;
      if (isTop) indices.push(centerIdx, r0 + next, r0 + j);
      else indices.push(centerIdx, r0 + j, r0 + next);
    }

    // Quad rings.
    for (let ri = 0; ri < radialRings - 1; ri += 1) {
      const inner = ringStarts[ri];
      const outer = ringStarts[ri + 1];
      for (let j = 0; j < sides; j += 1) {
        const next = (j + 1) % sides;
        const a = inner + j;
        const b = inner + next;
        const c = outer + j;
        const d = outer + next;
        if (isTop) indices.push(a, b, d, a, d, c);
        else indices.push(a, d, b, a, c, d);
      }
    }
  }

  addSheet(true);
  addSheet(false);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return finalizeOrganicGeometry(geometry, name);
}

/**
 * Closed folded toroidal pressure-hull volume with continuous periodic [0, 1] UVs (no poles).
 */
export function createFoldedTorusGeometry({
  R = 20,
  tubeRx = 4.5,
  tubeRy = 3.2,
  majorSegs = 32,
  minorSegs = 14,
  majorFolds = 8,
  majorAmp = 0.12,
  minorFolds = 4,
  minorAmp = 0.14,
  waveY = 0.8,
  waveFreq = 4,
  name = '',
} = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= majorSegs; i += 1) {
    const uFrac = i / majorSegs;
    const u = uFrac * Math.PI * 2;
    const radMod = 1 + majorAmp * Math.cos(majorFolds * u);
    const cy = waveY * Math.sin(waveFreq * u);
    const cx = Math.cos(u) * R * radMod;
    const cz = Math.sin(u) * R * radMod;

    for (let j = 0; j <= minorSegs; j += 1) {
      const vFrac = j / minorSegs;
      const v = vFrac * Math.PI * 2;
      const secMod = 1 + minorAmp * Math.cos(minorFolds * v + 1.1 * Math.cos(u * 2));
      const dr = Math.cos(v) * tubeRx * secMod;
      const dy = Math.sin(v) * tubeRy * secMod;
      positions.push(
        cx + Math.cos(u) * dr,
        cy + dy,
        cz + Math.sin(u) * dr,
      );
      uvs.push(uFrac, vFrac);
    }
  }

  const stride = minorSegs + 1;
  for (let i = 0; i < majorSegs; i += 1) {
    for (let j = 0; j < minorSegs; j += 1) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      // Verify outward winding: u increases clockwise in XZ (+X -> +Z), v increases (+radial -> +Y).
      // (a -> b) is d/du (clockwise tangent), (a -> d) is d/dv (radial x Y); (d/du x d/dv) points inward,
      // so outward requires (a, d, b) and (b, d, c).
      indices.push(a, d, b, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return finalizeOrganicGeometry(geometry, name);
}

/**
 * Closed, doubly-curved, ribbed membrane wing/sail volume with real 3D airfoil thickness
 * and smooth grid UVs across top and bottom surfaces.
 * `surfacePoint(u, v)` returns { pos: [x, y, z], halfThick: number } for u,v in [0, 1].
 */
export function createFoldedMembraneGeometry({
  uSegs = 20,
  vSegs = 14,
  surfacePoint,
  name = '',
} = {}) {
  const cols = uSegs + 1;
  const rows = vSegs + 1;
  const basePts = new Array(rows * cols);
  const thicks = new Array(rows * cols);

  for (let iv = 0; iv < rows; iv += 1) {
    const v = iv / vSegs;
    for (let iu = 0; iu < cols; iu += 1) {
      const u = iu / uSegs;
      const res = surfacePoint(u, v);
      basePts[iv * cols + iu] = res.pos;
      thicks[iv * cols + iu] = Math.max(0.03, res.halfThick);
    }
  }

  // Approximate surface normals at each grid node by central differences.
  const normals = new Array(rows * cols);
  for (let iv = 0; iv < rows; iv += 1) {
    const v0 = Math.max(0, iv - 1);
    const v1 = Math.min(vSegs, iv + 1);
    for (let iu = 0; iu < cols; iu += 1) {
      const u0 = Math.max(0, iu - 1);
      const u1 = Math.min(uSegs, iu + 1);
      const pu0 = basePts[iv * cols + u0];
      const pu1 = basePts[iv * cols + u1];
      const pv0 = basePts[v0 * cols + iu];
      const pv1 = basePts[v1 * cols + iu];
      const du = [pu1[0] - pu0[0], pu1[1] - pu0[1], pu1[2] - pu0[2]];
      const dv = [pv1[0] - pv0[0], pv1[1] - pv0[1], pv1[2] - pv0[2]];
      normals[iv * cols + iu] = normVec(crossVec(du, dv));
    }
  }

  const positions = [];
  const uvs = [];
  const indices = [];

  // Top sheet (+normal) and bottom sheet (-normal).
  for (let side = 0; side < 2; side += 1) {
    const sign = side === 0 ? 1 : -1;
    const baseOffset = positions.length / 3;
    for (let iv = 0; iv < rows; iv += 1) {
      const v = iv / vSegs;
      for (let iu = 0; iu < cols; iu += 1) {
        const u = iu / uSegs;
        const idx = iv * cols + iu;
        const p = basePts[idx];
        const n = normals[idx];
        // Taper thickness cleanly at boundary edges while maintaining real edge volume.
        const edgeU = Math.sin(u * Math.PI);
        const edgeV = Math.sin(v * Math.PI);
        const edge = 0.25 + 0.75 * Math.pow(Math.max(0, edgeU * edgeV), 0.35);
        const h = thicks[idx] * edge * sign;
        positions.push(p[0] + n[0] * h, p[1] + n[1] * h, p[2] + n[2] * h);
        uvs.push(u, v);
      }
    }
    for (let iv = 0; iv < vSegs; iv += 1) {
      for (let iu = 0; iu < uSegs; iu += 1) {
        const a = baseOffset + iv * cols + iu;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        // Normal = cross(du, dv), so +normal sheet uses (a, b, d) and (a, d, c).
        if (side === 0) indices.push(a, b, d, a, d, c);
        else indices.push(a, d, b, a, c, d);
      }
    }
  }

  // Stitch the 4 perimeter edges with dedicated strip UVs so side faces have nonzero UV area.
  const bottomOffset = rows * cols;
  const stitchEdge = (ringPairs) => {
    const rimStart = positions.length / 3;
    const count = ringPairs.length;
    for (let k = 0; k < count; k += 1) {
      const tIdx = ringPairs[k];
      const bIdx = bottomOffset + tIdx;
      const s = k / Math.max(1, count - 1);
      positions.push(positions[tIdx * 3], positions[tIdx * 3 + 1], positions[tIdx * 3 + 2]);
      uvs.push(s, 0.06);
      positions.push(positions[bIdx * 3], positions[bIdx * 3 + 1], positions[bIdx * 3 + 2]);
      uvs.push(s, 0.0);
    }
    for (let k = 0; k < count - 1; k += 1) {
      const t0 = rimStart + k * 2;
      const b0 = t0 + 1;
      const t1 = t0 + 2;
      const b1 = t0 + 3;
      indices.push(t0, b0, b1, t0, b1, t1);
    }
  };
  // Perimeter traversed counterclockwise looking along +normal so (t0->b0 x t0->t1) points outward.
  const bottomEdge = [];
  for (let iu = 0; iu <= uSegs; iu += 1) bottomEdge.push(iu);
  const rightEdge = [];
  for (let iv = 0; iv <= vSegs; iv += 1) rightEdge.push(iv * cols + uSegs);
  const topEdge = [];
  for (let iu = uSegs; iu >= 0; iu -= 1) topEdge.push(vSegs * cols + iu);
  const leftEdge = [];
  for (let iv = vSegs; iv >= 0; iv -= 1) leftEdge.push(iv * cols);

  stitchEdge(bottomEdge);
  stitchEdge(rightEdge);
  stitchEdge(topEdge);
  stitchEdge(leftEdge);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return finalizeOrganicGeometry(geometry, name);
}
