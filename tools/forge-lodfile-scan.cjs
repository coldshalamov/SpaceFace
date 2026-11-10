// SFQ-I071 probe B: separate-file LOD check. For each base GLB with an _lod1
// sibling, find LOD0 connected components (authored shells) that contain ~no
// verts in the lod1 file — a silhouette component dropped at medium distance.
const fs = require('fs'), path = require('path');
const dir = 'assets/ships/forge/preview';

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

function load(file) {
  const b = fs.readFileSync(file);
  const jl = b.readUInt32LE(12);
  const j = JSON.parse(b.slice(20, 20 + jl));
  const binOff = 20 + jl + 8;
  const verts = [], tris = [];
  const walk = (i, m) => {
    const n = j.nodes[i]; const wm = mul(m, mat(n));
    if (n.mesh != null && n.name !== 'COLLISION_HULL') {
      for (const prim of j.meshes[n.mesh].primitives) {
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
      }
    }
    (n.children || []).forEach(c => walk(c, wm));
  };
  (j.scenes[j.scene || 0].nodes).forEach(i => walk(i, I));
  return { verts, tris };
}

const bases = fs.readdirSync(dir).filter(f => f.endsWith('.glb') && !/_lod[12]\.glb/.test(f)
  && fs.existsSync(path.join(dir, f.replace('.glb', '_lod1.glb'))));

for (const f of bases) {
  const A = load(path.join(dir, f));
  const B = load(path.join(dir, f.replace('.glb', '_lod1.glb')));
  const parent = A.verts.map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const uni = (a, c) => { const ra = find(a), rc = find(c); if (ra !== rc) parent[rc] = ra; };
  for (let t = 0; t < A.tris.length; t += 3) { uni(A.tris[t], A.tris[t + 1]); uni(A.tris[t + 1], A.tris[t + 2]); }
  const comps = new Map();
  for (let v = 0; v < A.verts.length; v++) {
    const r = find(v);
    let c = comps.get(r); if (!c) comps.set(r, c = []);
    c.push(v);
  }
  const flagged = [];
  for (const [, verts] of comps) {
    if (verts.length < 80) continue;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const vi of verts) {
      const v = A.verts[vi];
      if (v[0] < x0) x0 = v[0]; if (v[0] > x1) x1 = v[0];
      if (v[1] < y0) y0 = v[1]; if (v[1] > y1) y1 = v[1];
      if (v[2] < z0) z0 = v[2]; if (v[2] > z1) z1 = v[2];
    }
    if ((x1 - x0) * (y1 - y0) * (z1 - z0) < 0.02) continue;
    let inB = 0; const S = 0.08;
    for (const v of B.verts) {
      if (v[0] >= x0 - S && v[0] <= x1 + S && v[1] >= y0 - S && v[1] <= y1 + S && v[2] >= z0 - S && v[2] <= z1 + S) inB++;
    }
    if (inB < Math.min(12, verts.length * 0.02)) {
      flagged.push({ verts: verts.length, box: [x1 - x0, y1 - y0, z1 - z0], at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], inB });
    }
  }
  if (flagged.length) {
    console.log(f + ' vs _lod1:');
    for (const r of flagged.sort((a, b) => b.verts - a.verts)) {
      console.log('    shell', r.verts, 'verts, size', r.box.map(x => x.toFixed(1)).join('x'),
        'at', r.at.map(x => x.toFixed(1)).join(','), '— lod1 verts inside:', r.inB);
    }
  }
}
console.log('done');
