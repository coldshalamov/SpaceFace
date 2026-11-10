// Scratch probe: how far does a named part float above the tallest surface under it?
// Usage: node tools/forge-probe-part.cjs <glb> <name-substring> [xyRadius]
const fs = require('fs');
const [,, file, needle, radArg] = process.argv;
const R = Number(radArg) || 2.0;
const b = fs.readFileSync(file);
const jl = b.readUInt32LE(12);
const j = JSON.parse(b.slice(20, 20 + jl));
const binOff = 20 + jl + 8;
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
function mul(a, c) {
  const o = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let k = 0; k < 4; k++) for (let r = 0; r < 4; r++) { let s = 0; for (let i = 0; i < 4; i++) s += a[i][r] * c[k][i]; o[k][r] = s; }
  return o;
}
function xf(m, p) { return [m[0][0] * p[0] + m[1][0] * p[1] + m[2][0] * p[2] + m[3][0], m[0][1] * p[0] + m[1][1] * p[1] + m[2][1] * p[2] + m[3][1], m[0][2] * p[0] + m[1][2] * p[1] + m[2][2] * p[2] + m[3][2]]; }
const I = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
const parts = [];
const walk = (i, m) => {
  const n = j.nodes[i]; const wm = mul(m, mat(n));
  if (n.mesh != null) {
    const verts = [];
    for (const prim of j.meshes[n.mesh].primitives) {
      const acc = j.accessors[prim.attributes.POSITION];
      const bv = j.bufferViews[acc.bufferView];
      const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
      const stride = bv.byteStride || 12;
      for (let v = 0; v < acc.count; v++) {
        const o = base + v * stride;
        verts.push(xf(wm, [b.readFloatLE(binOff + o), b.readFloatLE(binOff + o + 4), b.readFloatLE(binOff + o + 8)]));
      }
    }
    if (verts.length) parts.push({ name: n.name || 'n' + i, verts });
  }
  (n.children || []).forEach(c => walk(c, wm));
};
(j.scenes[j.scene || 0].nodes).forEach(i => walk(i, I));
const hit = parts.filter(p => p.name.includes(needle));
if (!hit.length) { console.log('no part matching', needle, '— parts:', parts.map(p => p.name).join(', ')); process.exit(1); }
for (const part of hit) {
  const yMin = Math.min(...part.verts.map(v => v[1]));
  const yMax = Math.max(...part.verts.map(v => v[1]));
  const cx = part.verts.reduce((s, v) => s + v[0], 0) / part.verts.length;
  const cy = part.verts.reduce((s,v)=>s+v[2],0)/part.verts.length;
  // Foreign verts within R of the part's XY centroid — the tallest is the candidate perch.
  let perch = -Infinity, perchPart = '';
  for (const q of parts) {
    if (q === part) continue;
    for (const v of q.verts) {
      if (Math.abs(v[0]-cx)<=R && Math.abs(v[2]-cy)<=R && v[1] <= yMin + 0.5 && v[1] > perch) {
        perch = v[1]; perchPart = q.name;
      }
    }
  }
  console.log(part.name, 'y span [' + yMin.toFixed(2) + '..' + yMax.toFixed(2) + '] centroid(' + cx.toFixed(1) + ',' + cy.toFixed(1) + ')');
  console.log('  tallest foreign vertex within ' + R + 'm XY:', perch === -Infinity ? 'none' : perch.toFixed(2) + ' on ' + perchPart,
    '=> underside gap ' + (perch === -Infinity ? '∞' : (yMin - perch).toFixed(2) + ' m'));
}
