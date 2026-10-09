// Cost-free shading repair for release GLBs (graphics bar, GRAPHICS_BAR.md).
//
// Per visible primitive (COLLISION_* proxies are skipped):
//   1. degenerate (zero-area) triangles are dropped from the index buffer: no visual change, less work;
//   2. normals are rebuilt where the export lost them:
//        - "faceted curve": welded edges meeting at a shallow angle (< creaseDeg) carry split hard
//          normals, so a curved surface shades as facets. Forge authors with a 30–38° smooth angle;
//        - "flipped": vertex normals opposing the triangle winding (black / inside-out patches).
//      Rebuilt normals are area-weighted face normals averaged around each welded position across
//      faces within creaseDeg of each other, i.e. the Forge smooth-by-angle rule.
// Faceting is kept on materials that are meant to be faceted (crystal / rock / ice / geology).
// Primitive count, materials, UVs and textures are untouched; changed primitives drop TANGENT so the
// renderer derives tangents from the new normals instead of pairing old tangents with new normals.

const FACETED_ON_PURPOSE = /crystal|rock|asteroid|regolith|(^|[^a-z])ice|geology|stone|(^|[^a-z])ore|gem|shard|ingot/i;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

export function analysePrimitive(prim, { creaseDeg = 35, minShallow = 12 } = {}) {
  const pos = prim.getAttribute('POSITION');
  const nrm = prim.getAttribute('NORMAL');
  if (!pos || prim.getMode() !== 4) return null;
  const n = pos.getCount();
  const idx = prim.getIndices();
  const I = idx ? Array.from(idx.getArray()) : Array.from({ length: n }, (_, i) => i);
  const P = new Array(n); for (let i = 0; i < n; i++) P[i] = pos.getElement(i, []);
  const N = nrm ? Array.from({ length: n }, (_, i) => nrm.getElement(i, [])) : null;
  let scale = 0; for (const p of P) scale = Math.max(scale, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
  const eps = Math.max(1e-12, (scale * 1e-6) ** 2);
  const key = (i) => P[i].map((x) => Math.round(x / Math.max(scale, 1e-9) * 1e6)).join(',');
  const keys = P.map((_, i) => key(i));
  const tris = []; let degen = 0;
  for (let t = 0; t + 2 < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const fn = cross(sub(P[b], P[a]), sub(P[c], P[a]));
    const A2 = len(fn);
    if (A2 * A2 < eps * eps || keys[a] === keys[b] || keys[b] === keys[c] || keys[a] === keys[c]) { degen++; continue; }
    tris.push({ v: [a, b, c], fn: fn.map((x) => x / A2), area: A2 / 2 });
  }
  const cosCrease = Math.cos(creaseDeg * Math.PI / 180);
  const cos4 = Math.cos(4 * Math.PI / 180);
  const edges = new Map();
  tris.forEach((tri, ti) => {
    for (let e = 0; e < 3; e++) {
      const i = tri.v[e], j = tri.v[(e + 1) % 3];
      const k = keys[i] < keys[j] ? keys[i] + '|' + keys[j] : keys[j] + '|' + keys[i];
      const list = edges.get(k); const rec = { ti, i, j };
      if (list) list.push(rec); else edges.set(k, [rec]);
    }
  });
  let shallow = 0, shallowHard = 0;
  for (const list of edges.values()) {
    if (list.length !== 2) continue;
    const d = dot(tris[list[0].ti].fn, tris[list[1].ti].fn);
    if (d > cos4 || d < cosCrease) continue;
    shallow++;
    if (N) {
      const a = list[0], b = list[1];
      const nb = keys[b.i] === keys[a.i] ? N[b.i] : N[b.j];
      if (dot(N[a.i], nb) / ((len(N[a.i]) * len(nb)) || 1) < 0.999) shallowHard++;
    }
  }
  let flipped = 0;
  if (N) for (const tri of tris) if (tri.v.some((v) => dot(N[v], tri.fn) / (len(N[v]) || 1) < -0.2)) flipped++;
  return { I, P, N, keys, tris, degen, shallow, shallowHard, flipped, n,
    facetedCurve: shallow >= minShallow && shallowHard / Math.max(1, shallow) > 0.5,
    flippedFrac: flipped / Math.max(1, tris.length) };
}

function smoothNormals(a, creaseDeg) {
  const cosCrease = Math.cos(creaseDeg * Math.PI / 180);
  const byKey = new Map();
  a.tris.forEach((tri, ti) => tri.v.forEach((v) => {
    const k = a.keys[v]; const l = byKey.get(k); if (l) l.push(ti); else byKey.set(k, [ti]);
  }));
  // corner normal = area-weighted sum of incident faces within the crease of this face
  const corner = a.tris.map((tri) => tri.v.map((v) => {
    const s = [0, 0, 0];
    for (const tj of byKey.get(a.keys[v])) {
      const f = a.tris[tj];
      if (dot(f.fn, tri.fn) < cosCrease) continue;
      s[0] += f.fn[0] * f.area; s[1] += f.fn[1] * f.area; s[2] += f.fn[2] * f.area;
    }
    const L = len(s) || 1; return s.map((x) => x / L);
  }));
  return corner;
}

// Rewrites the primitive in place. Returns a report row, or null when untouched.
export function repairPrimitive(document, prim, meshName, materialName, opts = {}) {
  const creaseDeg = opts.creaseDeg ?? 35;
  if (/^COLLISION/i.test(meshName || '')) return null;
  const a = analysePrimitive(prim, opts);
  if (!a) return null;
  const keepFacets = FACETED_ON_PURPOSE.test(materialName || '') || FACETED_ON_PURPOSE.test(meshName || '');
  const fixNormals = !!a.N && ((a.facetedCurve && !keepFacets) || a.flippedFrac > 0.02);
  if (!fixNormals && a.degen === 0) return null;
  const row = { mesh: meshName, material: materialName, tris: a.tris.length + a.degen, degenRemoved: a.degen,
    facetedCurve: a.facetedCurve && !keepFacets, flippedFrac: +a.flippedFrac.toFixed(3), vertsBefore: a.n };
  const idxAcc = prim.getIndices();
  if (!fixNormals) {
    // Only drop degenerate triangles: same vertex buffers, shorter index buffer.
    const out = new (a.n > 65535 ? Uint32Array : (idxAcc ? idxAcc.getArray().constructor : Uint32Array))(a.tris.length * 3);
    a.tris.forEach((t, i) => out.set(t.v, i * 3));
    if (idxAcc) idxAcc.setArray(out);
    else prim.setIndices(document.createAccessor().setType('SCALAR').setArray(out).setBuffer(document.getRoot().listBuffers()[0]));
    row.vertsAfter = a.n; return row;
  }
  // Orientation: trust the winding (it decides culling); normals follow it.
  const corner = smoothNormals(a, creaseDeg);
  // Rebuild vertices per (original vertex, rounded new normal) so shared smooth corners stay shared.
  const semantics = prim.listSemantics().filter((s) => s !== 'TANGENT');
  const attrs = Object.fromEntries(semantics.map((s) => [s, prim.getAttribute(s)]));
  const remap = new Map(); const srcOf = []; const newN = []; const index = [];
  a.tris.forEach((tri, ti) => tri.v.forEach((v, c) => {
    const nn = corner[ti][c];
    const k = v + ':' + nn.map((x) => Math.round(x * 127)).join(',');
    let id = remap.get(k);
    if (id === undefined) { id = srcOf.length; remap.set(k, id); srcOf.push(v); newN.push(nn); }
    index.push(id);
  }));
  const count = srcOf.length;
  for (const s of semantics) {
    const acc = attrs[s];
    const Arr = acc.getArray().constructor; const size = acc.getElementSize();
    const out = new Arr(count * size);
    const fresh = document.createAccessor().setType(acc.getType()).setNormalized(acc.getNormalized()).setArray(out).setBuffer(acc.getBuffer());
    const el = [];
    for (let i = 0; i < count; i++) {
      if (s === 'NORMAL') fresh.setElement(i, newN[i]);
      else fresh.setElement(i, acc.getElement(srcOf[i], el));
    }
    prim.setAttribute(s, fresh);
  }
  if (prim.getAttribute('TANGENT')) prim.setAttribute('TANGENT', null);
  const IA = count > 65535 ? Uint32Array : Uint16Array;
  const idx = document.createAccessor().setType('SCALAR').setArray(new IA(index)).setBuffer((idxAcc || attrs.POSITION).getBuffer());
  prim.setIndices(idx);
  row.vertsAfter = count; return row;
}

export function repairDocumentShading(document, opts = {}) {
  const rows = [];
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      const r = repairPrimitive(document, prim, mesh.getName(), mat ? mat.getName() : null, opts);
      if (r) rows.push(r);
    }
  }
  // Orphaned accessors from replaced attributes.
  for (const acc of document.getRoot().listAccessors()) if (acc.listParents().length <= 1) acc.dispose();
  return rows;
}

// gltf-transform transform form, for the release builders.
export function shadingRepair(opts = {}) {
  return (document) => { repairDocumentShading(document, opts); };
}
