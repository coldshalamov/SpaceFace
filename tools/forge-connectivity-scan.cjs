// Scratch SFQ-I070 probe: per-part nearest-vertex distance to all other parts in each forge
// preview GLB. A part whose closest vertex is > EPS metres from every other part's vertices is
// physically floating (no truss, no pylon, no contact).
const fs = require('fs'), path = require('path');
const dir = 'assets/ships/forge/preview';
const EPS = 0.03;          // 3 cm — wider than any authored contact seam, tighter than a real gap
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

for (const f of files) {
  const b = fs.readFileSync(path.join(dir, f));
  const jl = b.readUInt32LE(12);
  const j = JSON.parse(b.slice(20, 20 + jl));
  const bin = b.slice(20 + jl + 8); // past JSON chunk + BIN chunk header
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
          verts.push(xf(wm, [b.readFloatLE(bin.byteOffset + o), b.readFloatLE(bin.byteOffset + o + 4), b.readFloatLE(bin.byteOffset + o + 8)]));
        }
      }
      if (verts.length) parts.push({ name: n.name || ('n' + i), verts });
    }
    (n.children || []).forEach(c => walk(c, wm));
  };
  (j.scenes[j.scene || 0].nodes).forEach(i => walk(i, I));

  // Voxel hash over all verts, tagged by part index — then per-part nearest-foreign query.
  const CELL = Math.max(0.05, EPS * 4);
  const grid = new Map();
  const key = (p) => Math.floor(p[0] / CELL) + ',' + Math.floor(p[1] / CELL) + ',' + Math.floor(p[2] / CELL);
  parts.forEach((part, pi) => part.verts.forEach(v => {
    const k = key(v); let cell = grid.get(k); if (!cell) grid.set(k, cell = []);
    cell.push([v[0], v[1], v[2], pi]);
  }));
  const R = Math.ceil(EPS / CELL) + 1;
  const floats = [];
  for (let pi = 0; pi < parts.length; pi++) {
    let minD2 = Infinity;
    for (const v of parts[pi].verts) {
      const cx = Math.floor(v[0] / CELL), cy = Math.floor(v[1] / CELL), cz = Math.floor(v[2] / CELL);
      let done = false;
      for (let dx = -R; dx <= R && !done; dx++) for (let dy = -R; dy <= R && !done; dy++) for (let dz = -R; dz <= R; dz++) {
        const cell = grid.get((cx + dx) + ',' + (cy + dy) + ',' + (cz + dz));
        if (!cell) continue;
        for (const q of cell) {
          if (q[3] === pi) continue;
          const d2 = (q[0] - v[0]) ** 2 + (q[1] - v[1]) ** 2 + (q[2] - v[2]) ** 2;
          if (d2 < minD2) { minD2 = d2; if (d2 < EPS * EPS * 0.25) { done = true; break; } }
        }
        if (done) break;
      }
    }
    if (minD2 > EPS * EPS) floats.push({ name: parts[pi].name, gap: Math.sqrt(minD2) });
  }
  if (floats.length) {
    console.log(f, '(' + parts.length + ' parts):');
    for (const p of floats) console.log('    ', p.name, 'nearest foreign vertex ' + p.gap.toFixed(3) + ' m');
  }
}
console.log('done');
