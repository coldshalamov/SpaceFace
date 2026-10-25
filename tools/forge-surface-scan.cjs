// SFQ-I070 definitive probe: for each GLB node, the minimum distance from any of
// its vertices to a FOREIGN triangle surface (not vertex). Distance > EPS means
// the part genuinely touches nothing — a floating component per FORGE.md.
const fs = require('fs'), path = require('path');
const dir = 'assets/ships/forge/preview';
const EPS = 0.02;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.glb') && !/_lod[12]\.glb/.test(f));

function mat(n) {
  if (n.matrix) { const m = n.matrix; return [m.slice(0, 4), m.slice(4, 8), m.slice(8, 12), m.slice(12, 16)]; }
  const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
  const [x, y, z, w] = q; const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    [(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0],
    [(xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0],
    [(xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0],
    [t[0], t[1], t[2], 1]];
}
function mul(a, b) {
  const o = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k][r] * b[c][k]; o[c][r] = s; }
  return o;
}
function xf(m, p) {
  return [
    m[0][0] * p[0] + m[1][0] * p[1] + m[2][0] * p[2] + m[3][0],
    m[0][1] * p[0] + m[1][1] * p[1] + m[2][1] * p[2] + m[3][1],
    m[0][2] * p[0] + m[1][2] * p[1] + m[2][2] * p[2] + m[3][2]];
}
const I = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];

// Closest distance² from point p to triangle (a,b,c) — Ericson RTCD 5.1.5
function ptTri(p, a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const d1 = ab[0] * ap[0] + ab[1] * ap[1] + ab[2] * ap[2];
  const d2 = ac[0] * ap[0] + ac[1] * ap[1] + ac[2] * ap[2];
  if (d1 <= 0 && d2 <= 0) return ap[0] ** 2 + ap[1] ** 2 + ap[2] ** 2;
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]];
  const d3 = ab[0] * bp[0] + ab[1] * bp[1] + ab[2] * bp[2];
  const d4 = ac[0] * bp[0] + ac[1] * bp[1] + ac[2] * bp[2];
  if (d3 >= 0 && d4 <= d3) return bp[0] ** 2 + bp[1] ** 2 + bp[2] ** 2;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const q = [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]];
    return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  }
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const d5 = ab[0] * cp[0] + ab[1] * cp[1] + ab[2] * cp[2];
  const d6 = ac[0] * cp[0] + ac[1] * cp[1] + ac[2] * cp[2];
  if (d6 >= 0 && d5 <= d6) return cp[0] ** 2 + cp[1] ** 2 + cp[2] ** 2;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const q = [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]];
    return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    const q = [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])];
    return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  const q = [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
  return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
}

function readIndices(b, binOff, j, prim) {
  if (prim.indices == null) return null;
  const acc = j.accessors[prim.indices];
  const bv = j.bufferViews[acc.bufferView];
  const base = binOff + (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new Uint32Array(acc.count);
  for (let i = 0; i < acc.count; i++) {
    out[i] = acc.componentType === 5123 ? b.readUInt16LE(base + i * 2)
      : acc.componentType === 5125 ? b.readUInt32LE(base + i * 4)
        : b[base + i];
  }
  return out;
}

for (const f of files) {
  const b = fs.readFileSync(path.join(dir, f));
  const jl = b.readUInt32LE(12);
  const j = JSON.parse(b.slice(20, 20 + jl));
  const binOff = 20 + jl + 8;
  const parts = [];
  const walk = (i, m) => {
    const n = j.nodes[i]; const wm = mul(m, mat(n));
    if (n.mesh != null) {
      const verts = [], tris = [];
      for (const prim of j.meshes[n.mesh].primitives) {
        if (prim.mode != null && prim.mode !== 4) continue;
        const acc = j.accessors[prim.attributes.POSITION];
        if (!acc || acc.componentType !== 5126 || acc.type !== 'VEC3') continue;
        const bv = j.bufferViews[acc.bufferView];
        const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
        const stride = bv.byteStride || 12;
        const vbase = verts.length;
        for (let v = 0; v < acc.count; v++) {
          const o = base + v * stride;
          verts.push(xf(wm, [b.readFloatLE(binOff + o), b.readFloatLE(binOff + o + 4), b.readFloatLE(binOff + o + 8)]));
        }
        const idx = readIndices(b, binOff, j, prim);
        if (idx) for (let t = 0; t + 2 < idx.length; t += 3) tris.push(idx[t] + vbase, idx[t + 1] + vbase, idx[t + 2] + vbase);
        else for (let t = vbase; t + 2 < verts.length; t += 3) tris.push(t, t + 1, t + 2);
      }
      if (verts.length && n.name !== 'COLLISION_HULL') parts.push({ name: n.name || ('n' + i), verts, tris });
    }
    (n.children || []).forEach(c => walk(c, wm));
  };
  (j.scenes[j.scene || 0].nodes).forEach(i => walk(i, I));

  // Voxel grid over triangles (stored as index triplets into a flat tri list).
  const CELL = 0.5;
  const flat = [];
  parts.forEach((part, pi) => {
    for (let t = 0; t < part.tris.length; t += 3) flat.push([part.tris[t], part.tris[t + 1], part.tris[t + 2], pi]);
  });
  const grid = new Map();
  const bigTris = [];
  const key = (x, y, z) => x + ',' + y + ',' + z;
  flat.forEach((tr, ti) => {
    const p = parts[tr[3]];
    const a = p.verts[tr[0]], bb = p.verts[tr[1]], c = p.verts[tr[2]];
    const x0 = Math.floor(Math.min(a[0], bb[0], c[0]) / CELL), x1 = Math.floor(Math.max(a[0], bb[0], c[0]) / CELL);
    const y0 = Math.floor(Math.min(a[1], bb[1], c[1]) / CELL), y1 = Math.floor(Math.max(a[1], bb[1], c[1]) / CELL);
    const z0 = Math.floor(Math.min(a[2], bb[2], c[2]) / CELL), z1 = Math.floor(Math.max(a[2], bb[2], c[2]) / CELL);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > 512) { bigTris.push(ti); return; }
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const k = key(x, y, z); let cell = grid.get(k); if (!cell) grid.set(k, cell = []);
      cell.push(ti);
    }
  });
  const nearestSurf = (v, pi) => {
    const cx = Math.floor(v[0] / CELL), cy = Math.floor(v[1] / CELL), cz = Math.floor(v[2] / CELL);
    let best = Infinity;
    for (const ti of bigTris) {
      const tr = flat[ti];
      if (tr[3] === pi) continue;
      const p = parts[tr[3]];
      const d2 = ptTri(v, p.verts[tr[0]], p.verts[tr[1]], p.verts[tr[2]]);
      if (d2 < best) best = d2;
    }
    for (let r = 0; r <= 30; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
        const cell = grid.get(key(cx + dx, cy + dy, cz + dz));
        if (!cell) continue;
        for (const ti of cell) {
          const tr = flat[ti];
          if (tr[3] === pi) continue;
          const p = parts[tr[3]];
          const d2 = ptTri(v, p.verts[tr[0]], p.verts[tr[1]], p.verts[tr[2]]);
          if (d2 < best) best = d2;
        }
      }
      if (r >= 1 && best < (r * CELL) ** 2) break; // tris can extend (r-1) cells out — slight slack
    }
    return best;
  };

  const BODY = /^(COLLISION_HULL|LOD\d_(Hull|Armor|Mechanical|MechanicalDark|Livery|Canopy|Lights_|Beacon_|Glass|Dark|Stripe|Paint|BrushedMetal))/;
  const flagged = [];
  for (let pi = 0; pi < parts.length; pi++) {
    const part = parts[pi];
    if (BODY.test(part.name) && !/HOOK/.test(part.name)) continue;
    let best = Infinity;
    for (const v of part.verts) {
      const d2 = nearestSurf(v, pi);
      if (d2 < best) { best = d2; if (best < EPS * EPS * 0.1) break; }
    }
    if (best > EPS * EPS) flagged.push({ name: part.name, gap: Math.sqrt(best) });
  }
  if (flagged.length) {
    console.log(f + ':');
    for (const r of flagged) console.log('    ' + r.name + ' surface gap ' + r.gap.toFixed(3) + 'm');
  }
}
console.log('done');
