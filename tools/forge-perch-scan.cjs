// SFQ-I070 probe v2: for every separate node in each forge preview GLB, compute
//  (a) nearest foreign-vertex distance (voxel-hashed, uncapped)
//  (b) underside perch gap: tallest foreign vertex inside the part's own XZ
//      footprint (expanded 0.6m) at or below the part's lowest vertex
// A part flagged on BOTH (nearest vert > ~0.1m AND perch gap > ~0.1m or none
// under) is a floating-component candidate needing visual inspection.
const fs = require('fs'), path = require('path');
const dir = 'assets/ships/forge/preview';
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
const BODY = /^(COLLISION_HULL|LOD\d_(Hull|Armor|Mechanical|MechanicalDark|Livery|Canopy|Lights_|Beacon_|Glass|Dark|Stripe|Paint))/;

for (const f of files) {
  const b = fs.readFileSync(path.join(dir, f));
  const jl = b.readUInt32LE(12);
  const j = JSON.parse(b.slice(20, 20 + jl));
  const binOff = 20 + jl + 8;
  const parts = [];
  const walk = (i, m) => {
    const n = j.nodes[i]; const wm = mul(m, mat(n));
    if (n.mesh != null) {
      const verts = [];
      for (const prim of j.meshes[n.mesh].primitives) {
        const acc = j.accessors[prim.attributes.POSITION];
        if (!acc || acc.componentType !== 5126 || acc.type !== 'VEC3') continue;
        const bv = j.bufferViews[acc.bufferView];
        const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
        const stride = bv.byteStride || 12;
        for (let v = 0; v < acc.count; v++) {
          const o = base + v * stride;
          verts.push(xf(wm, [b.readFloatLE(binOff + o), b.readFloatLE(binOff + o + 4), b.readFloatLE(binOff + o + 8)]));
        }
      }
      if (verts.length) parts.push({ name: n.name || ('n' + i), verts });
    }
    (n.children || []).forEach(c => walk(c, wm));
  };
  (j.scenes[j.scene || 0].nodes).forEach(i => walk(i, I));

  // Voxel hash of all verts tagged by part — nearest-foreign via expanding rings.
  const CELL = 0.5;
  const grid = new Map();
  const key = (x, y, z) => x + ',' + y + ',' + z;
  parts.forEach((part, pi) => part.verts.forEach(v => {
    const k = key(Math.floor(v[0] / CELL), Math.floor(v[1] / CELL), Math.floor(v[2] / CELL));
    let cell = grid.get(k); if (!cell) grid.set(k, cell = []);
    cell.push(v[0], v[1], v[2], pi);
  }));
  const nearestForeign = (v, pi) => {
    const cx = Math.floor(v[0] / CELL), cy = Math.floor(v[1] / CELL), cz = Math.floor(v[2] / CELL);
    let best = Infinity;
    for (let r = 0; r <= 24; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue; // shell only
        const cell = grid.get(key(cx + dx, cy + dy, cz + dz));
        if (!cell) continue;
        for (let q = 0; q < cell.length; q += 4) {
          if (cell[q + 3] === pi) continue;
          const d2 = (cell[q] - v[0]) ** 2 + (cell[q + 1] - v[1]) ** 2 + (cell[q + 2] - v[2]) ** 2;
          if (d2 < best) best = d2;
        }
      }
      // after shell r, every unvisited vertex is at least r*CELL away
      if (best < (r * CELL) ** 2) break;
    }
    return best;
  };

  const flagged = [];
  for (let pi = 0; pi < parts.length; pi++) {
    const part = parts[pi];
    if (BODY.test(part.name) && !/HOOK/.test(part.name)) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, yMin = Infinity;
    for (const v of part.verts) {
      if (v[0] < x0) x0 = v[0]; if (v[0] > x1) x1 = v[0];
      if (v[2] < z0) z0 = v[2]; if (v[2] > z1) z1 = v[2];
      if (v[1] < yMin) yMin = v[1];
    }
    let near = Infinity;
    for (const v of part.verts) { const d2 = nearestForeign(v, pi); if (d2 < near) near = d2; if (near < 1e-4) break; }
    near = Math.sqrt(near);
    let perch = -Infinity, perchPart = '';
    for (const q of parts) {
      if (q === part) continue;
      for (const v of q.verts) {
        if (v[0] >= x0 - 0.6 && v[0] <= x1 + 0.6 && v[2] >= z0 - 0.6 && v[2] <= z1 + 0.6 && v[1] <= yMin + 0.02 && v[1] > perch) {
          perch = v[1]; perchPart = q.name;
        }
      }
    }
    const gap = perch === -Infinity ? Infinity : yMin - perch;
    if (near > 0.1 && gap > 0.1) flagged.push({ name: part.name, near, gap, perchPart });
  }
  if (flagged.length) {
    console.log(f + ':');
    for (const r of flagged) console.log('    ' + r.name + ' nearest=' + r.near.toFixed(2) + 'm perchGap=' + (r.gap === Infinity ? 'none-under' : r.gap.toFixed(2) + 'm') + (r.perchPart ? ' over ' + r.perchPart : ''));
  }
}
console.log('done');
