// SFQ-I071 probe: compare each in-file LOD group's plan-view silhouette to LOD0.
// For each ship GLB, bucket vertices by node-name LOD prefix, compute the max
// radius per angular sector (top-down XZ), and report ships where a sector's
// radius shrinks > 18% at LOD1 — a silhouette-defining clamp/fin/hardpoint lost.
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
const SECTORS = 36;

for (const f of files) {
  const b = fs.readFileSync(path.join(dir, f));
  const jl = b.readUInt32LE(12);
  const j = JSON.parse(b.slice(20, 20 + jl));
  const binOff = 20 + jl + 8;
  const lods = { LOD0: [], LOD1: [], LOD2: [] };
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
          for (let v = 0; v < acc.count; v++) {
            const o = base + v * stride;
            lods[lod].push(xf(wm, [b.readFloatLE(binOff + o), b.readFloatLE(binOff + o + 4), b.readFloatLE(binOff + o + 8)]));
          }
        }
      }
    }
    (n.children || []).forEach(c => walk(c, wm));
  };
  (j.scenes[j.scene || 0].nodes).forEach(i => walk(i, I));
  if (!lods.LOD1.length && !lods.LOD2.length) continue;

  // shared centroid from LOD0 plan footprint
  const cx = lods.LOD0.reduce((s, v) => s + v[0], 0) / lods.LOD0.length;
  const cz = lods.LOD0.reduce((s, v) => s + v[2], 0) / lods.LOD0.length;
  const sectorMax = (verts) => {
    const out = new Array(SECTORS).fill(0);
    for (const v of verts) {
      const dx = v[0] - cx, dz = v[2] - cz;
      const r = Math.hypot(dx, dz);
      const s = Math.floor(((Math.atan2(dz, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2 / SECTORS));
      if (r > out[s]) out[s] = r;
    }
    return out;
  };
  const s0 = sectorMax(lods.LOD0), s1 = lods.LOD1.length ? sectorMax(lods.LOD1) : null, s2 = lods.LOD2.length ? sectorMax(lods.LOD2) : null;
  const drop = (a, ref) => {
    let worst = 0, at = -1;
    for (let k = 0; k < SECTORS; k++) {
      if (ref[k] < 1.5) continue; // skip near-center noise
      const d = (ref[k] - a[k]) / ref[k];
      if (d > worst) { worst = d; at = k; }
    }
    return { worst, at };
  };
  const rows = [];
  if (s1) { const d = drop(s1, s0); if (d.worst > 0.18) rows.push(['LOD1', d]); }
  if (s2) { const d = drop(s2, s0); if (d.worst > 0.18) rows.push(['LOD2', d]); }
  if (rows.length) {
    console.log(f + ': ' + rows.map(([l, d]) => `${l} sector ${d.at} loses ${(d.worst * 100).toFixed(0)}% radius (r${s0[d.at].toFixed(1)}->${(l === 'LOD1' ? s1 : s2)[d.at].toFixed(1)})`).join('; '));
  }
}
console.log('done');
