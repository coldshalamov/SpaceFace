// SFQ-I071 definitive probe: connected-component survival across in-file LODs.
// A separate shell in the LOD0 mesh (an authored fin, clamp, hardpoint, pod)
// that contains ~no LOD1 vertices is a silhouette component lost at LOD1.
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
  const lods = { LOD0: { verts: [], tris: [] }, LOD1: { verts: [] }, LOD2: { verts: [] } };
  const walk = (i, m) => {
    const n = j.nodes[i]; const wm = mul(m, mat(n));
    if (n.mesh != null && n.name) {
      const lod = n.name.startsWith('LOD0') ? 'LOD0' : n.name.startsWith('LOD1') ? 'LOD1' : n.name.startsWith('LOD2') ? 'LOD2' : null;
      if (lod) {
        for (const prim of j.meshes[n.mesh].primitives) {
          const acc = j.accessors[prim.attributes.POSITION];
          if (!acc || acc.componentType !== 5126 || acc.type !== 'VEC3') continue;
          const bv = j.bufferViews[acc.bufferView];
          const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
          const stride = bv.byteStride || 12;
          const vbase = lods[lod].verts.length;
          for (let v = 0; v < acc.count; v++) {
            const o = base + v * stride;
            lods[lod].verts.push(xf(wm, [b.readFloatLE(binOff + o), b.readFloatLE(binOff + o + 4), b.readFloatLE(binOff + o + 8)]));
          }
          if (lod === 'LOD0') {
            const idx = readIndices(b, binOff, j, prim);
            if (idx) for (let t = 0; t + 2 < idx.length; t += 3) lods.LOD0.tris.push(idx[t] + vbase, idx[t + 1] + vbase, idx[t + 2] + vbase);
          }
        }
      }
    }
    (n.children || []).forEach(c => walk(c, wm));
  };
  (j.scenes[j.scene || 0].nodes).forEach(i => walk(i, I));
  if (!lods.LOD1.length || !lods.LOD0.tris.length) continue;

  // Union-find over LOD0 verts via tri edges → connected components (shells).
  const parent = lods.LOD0.verts.map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const uni = (a, c) => { const ra = find(a), rc = find(c); if (ra !== rc) parent[rc] = ra; };
  const tris = lods.LOD0.tris;
  for (let t = 0; t < tris.length; t += 3) { uni(tris[t], tris[t + 1]); uni(tris[t + 1], tris[t + 2]); }
  const comps = new Map();
  for (let v = 0; v < lods.LOD0.verts.length; v++) {
    const r = find(v);
    let c = comps.get(r); if (!c) comps.set(r, c = []);
    c.push(v);
  }
  // For each component ≥ 60 verts, its bbox; then LOD1 coverage inside bbox+slack.
  const flagged = [];
  for (const [, verts] of comps) {
    if (verts.length < 60) continue;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const vi of verts) {
      const v = lods.LOD0.verts[vi];
      if (v[0] < x0) x0 = v[0]; if (v[0] > x1) x1 = v[0];
      if (v[1] < y0) y0 = v[1]; if (v[1] > y1) y1 = v[1];
      if (v[2] < z0) z0 = v[2]; if (v[2] > z1) z1 = v[2];
    }
    const vol = (x1 - x0) * (y1 - y0) * (z1 - z0);
    if (vol < 0.02) continue; // crumbs/degenerate
    let inL1 = 0;
    const S = 0.08;
    for (const v of lods.LOD1.verts) {
      if (v[0] >= x0 - S && v[0] <= x1 + S && v[1] >= y0 - S && v[1] <= y1 + S && v[2] >= z0 - S && v[2] <= z1 + S) inL1++;
    }
    if (inL1 < verts.length * 0.02 && inL1 < 12) {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
      flagged.push({ verts: verts.length, box: [x1 - x0, y1 - y0, z1 - z0], at: [cx, cy, cz], inL1 });
    }
  }
  if (flagged.length) {
    console.log(f + ':');
    for (const r of flagged.sort((a, b) => b.verts - a.verts)) {
      console.log('    shell', r.verts, 'verts, size', r.box.map(x => x.toFixed(1)).join('x'),
        'at', r.at.map(x => x.toFixed(1)).join(','), '— LOD1 verts inside:', r.inL1);
    }
  }
}
console.log('done');
