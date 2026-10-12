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
// Names that only borrow a geology word ("Material_Ceramic_ore" hull paint, "wreck_ore_freighter_*").
const NOT_GEOLOGY = /ceramic|hull|armou?r|metal|mechanical|heat|emissive|light|freighter|barge|hopper|container|carrier|sorter|crusher/i;

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
  const mat = materialName || '', mesh = meshName || '';
  const keepFacets = (FACETED_ON_PURPOSE.test(mat) && !NOT_GEOLOGY.test(mat))
    || (FACETED_ON_PURPOSE.test(mesh) && !NOT_GEOLOGY.test(mesh) && !NOT_GEOLOGY.test(mat));
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

// 3. Collapsed UVs on textured materials: triangles whose three UVs coincide sample one texel and
//    smear it across the face (the streaked / flat sides of kitbash boxes). Each collapsed triangle
//    gets its own corners with a planar projection on its dominant axis, anchored at its old UV and
//    scaled to the primitive's own median texel density, so the texture continues at the authored scale.
export const UV_REPAIR_MAX_TRIS = 1500;

export function repairCollapsedUVs(document, prim) {
  const mat = prim.getMaterial();
  const uvAcc = prim.getAttribute('TEXCOORD_0');
  const pos = prim.getAttribute('POSITION');
  if (!mat || !uvAcc || !pos || prim.getMode() !== 4) return null;
  if (!mat.getBaseColorTexture() && !mat.getNormalTexture()) return null;
  const idxAcc = prim.getIndices();
  const n = pos.getCount();
  const I = idxAcc ? Array.from(idxAcc.getArray()) : Array.from({ length: n }, (_, i) => i);
  const P = (i) => pos.getElement(i, []), U = (i) => uvAcc.getElement(i, []);
  const dens = []; const collapsed = [];
  for (let t = 0; t + 2 < I.length; t += 3) {
    const a = P(I[t]), b = P(I[t + 1]), c = P(I[t + 2]);
    const A = len(cross(sub(b, a), sub(c, a))) / 2; if (A < 1e-12) continue;
    const ua = U(I[t]), ub = U(I[t + 1]), uc = U(I[t + 2]);
    const uA = Math.abs((ub[0] - ua[0]) * (uc[1] - ua[1]) - (uc[0] - ua[0]) * (ub[1] - ua[1])) / 2;
    if (uA < 1e-10) collapsed.push(t); else dens.push(Math.sqrt(uA / A));
  }
  if (collapsed.length < Math.max(2, 0.2 * (I.length / 3))) return null;
  // Scatter-generated debris (thousands of point-UV shards on a near-flat texture) reads fine as-is and
  // would cost real vertices; keep the fix to authored kitbash-scale primitives.
  if (collapsed.length > UV_REPAIR_MAX_TRIS) return null;
  let scale;
  if (dens.length >= 3) { dens.sort((x, y) => x - y); scale = dens[dens.length >> 1]; }
  else {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) { const p = P(i); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); } }
    scale = 1 / Math.max(1e-6, mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  }
  // Rebuild every attribute as float with room for the new corners.
  const semantics = prim.listSemantics().filter((s) => s !== 'TANGENT');
  const extra = collapsed.length * 3; const count = n + extra;
  const fresh = {};
  for (const s of semantics) {
    const acc = prim.getAttribute(s); const size = acc.getElementSize();
    const out = new Float32Array(count * size); const el = [];
    for (let i = 0; i < n; i++) { acc.getElement(i, el); for (let k = 0; k < size; k++) out[i * size + k] = el[k]; }
    fresh[s] = { out, size, type: acc.getType(), buffer: acc.getBuffer() };
  }
  let next = n; const newI = I.slice();
  for (const t of collapsed) {
    const vs = [I[t], I[t + 1], I[t + 2]]; const ps = vs.map(P);
    const fn = cross(sub(ps[1], ps[0]), sub(ps[2], ps[0]));
    const ax = [Math.abs(fn[0]), Math.abs(fn[1]), Math.abs(fn[2])];
    const [u, v] = ax[0] >= ax[1] && ax[0] >= ax[2] ? [2, 1] : (ax[1] >= ax[2] ? [0, 2] : [0, 1]);
    const anchor = U(vs[0]);
    vs.forEach((src, c) => {
      for (const s of semantics) { const f = fresh[s]; for (let k = 0; k < f.size; k++) f.out[next * f.size + k] = f.out[src * f.size + k]; }
      const uvOut = fresh.TEXCOORD_0.out;
      uvOut[next * 2] = anchor[0] + (ps[c][u] - ps[0][u]) * scale;
      uvOut[next * 2 + 1] = anchor[1] + (ps[c][v] - ps[0][v]) * scale;
      newI[t + c] = next++;
    });
  }
  for (const s of semantics) {
    const f = fresh[s];
    prim.setAttribute(s, document.createAccessor().setType(f.type).setArray(f.out).setBuffer(f.buffer));
  }
  if (prim.getAttribute('TANGENT')) prim.setAttribute('TANGENT', null);
  const IA = count > 65535 ? Uint32Array : Uint16Array;
  prim.setIndices(document.createAccessor().setType('SCALAR').setArray(new IA(newI)).setBuffer((idxAcc || pos).getBuffer()));
  return { uvCollapsedFixed: collapsed.length, vertsAddedForUV: extra };
}

// 4. Textured material, no UVs at all: every vertex samples texel (0,0), so the part reads as a flat
//    swatch beside its textured neighbours. Give it a per-vertex box projection (dominant normal
//    axis) at the document's own median texel density for that material, else the document's.
function triUvDensity(prim) {
  const uv = prim.getAttribute('TEXCOORD_0'), pos = prim.getAttribute('POSITION');
  if (!uv || !pos || prim.getMode() !== 4) return [];
  const idx = prim.getIndices(); const n = pos.getCount();
  const I = idx ? idx.getArray() : Uint32Array.from({ length: n }, (_, i) => i);
  const out = [];
  for (let t = 0; t + 2 < I.length && out.length < 4000; t += 3) {
    const a = pos.getElement(I[t], []), b = pos.getElement(I[t + 1], []), c = pos.getElement(I[t + 2], []);
    const A = len(cross(sub(b, a), sub(c, a))) / 2; if (A < 1e-10) continue;
    const ua = uv.getElement(I[t], []), ub = uv.getElement(I[t + 1], []), uc = uv.getElement(I[t + 2], []);
    const uA = Math.abs((ub[0] - ua[0]) * (uc[1] - ua[1]) - (uc[0] - ua[0]) * (ub[1] - ua[1])) / 2;
    if (uA > 1e-10) out.push(Math.sqrt(uA / A));
  }
  return out;
}
const median = (xs) => { if (!xs.length) return null; const s = xs.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

export function addMissingUVs(document, prim, densityFor) {
  const mat = prim.getMaterial(); const pos = prim.getAttribute('POSITION');
  if (!mat || !pos || prim.getAttribute('TEXCOORD_0') || prim.getMode() !== 4) return null;
  const textured = mat.getBaseColorTexture() || mat.getNormalTexture() || mat.getMetallicRoughnessTexture();
  if (!textured) return null;
  const s = densityFor(mat);
  const nrm = prim.getAttribute('NORMAL'); const n = pos.getCount();
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const p = pos.getElement(i, []); const q = nrm ? nrm.getElement(i, []) : [0, 1, 0];
    const ax = [Math.abs(q[0]), Math.abs(q[1]), Math.abs(q[2])];
    const [u, v] = ax[0] >= ax[1] && ax[0] >= ax[2] ? [2, 1] : (ax[1] >= ax[2] ? [0, 2] : [0, 1]);
    out[i * 2] = p[u] * s; out[i * 2 + 1] = p[v] * s;
  }
  prim.setAttribute('TEXCOORD_0', document.createAccessor().setType('VEC2').setArray(out).setBuffer(pos.getBuffer()));
  return { uvAdded: n };
}

// 5. Z-fighting: the same triangle (same three world-space corners, same facing) authored in two
//    materials, typically a hull plate and the armour/livery/warning/light panel laid on it. The two
//    flicker against each other at range. Keep the triangle in the overlay material and drop the
//    copy underneath; nothing visible is lost and the draw gets cheaper.
const OVERLAY_RANK = [
  [/emissive|light|beacon|nav/i, 6], [/warning|hazard|decal|stencil/i, 5], [/livery|accent|stripe|torn|scorch/i, 4],
  [/armou?r/i, 3], [/mechanical(?!dark)|brushed|metal/i, 2], [/mechanicaldark/i, 1], [/hull|primer/i, 0],
];
const overlayRank = (name) => { for (const [re, r] of OVERLAY_RANK) if (re.test(name || '')) return r; return 0; };

export function repairCoincidentFaces(document) {
  const users = new Map();
  for (const node of document.getRoot().listNodes()) { const m = node.getMesh(); if (m) users.set(m, (users.get(m) || 0) + 1); }
  const faces = new Map();
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || users.get(mesh) > 1 || /COLLISION/i.test((mesh.getName() || '') + (node.getName() || ''))) continue;
    const lod = (/^LOD([012])_/i.exec(node.getName() || '') || [, '0'])[1];
    const M = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial(); const pos = prim.getAttribute('POSITION'); const idx = prim.getIndices();
      if (!mat || !pos || !idx || prim.getMode() !== 4) continue;
      const I = idx.getArray(); const rank = overlayRank(mat.getName());
      for (let t = 0; t + 2 < I.length; t += 3) {
        const w = [I[t], I[t + 1], I[t + 2]].map((i) => { const p = pos.getElement(i, []);
          return [M[0]*p[0]+M[4]*p[1]+M[8]*p[2]+M[12], M[1]*p[0]+M[5]*p[1]+M[9]*p[2]+M[13], M[2]*p[0]+M[6]*p[1]+M[10]*p[2]+M[14]]; });
        const n = cross(sub(w[1], w[0]), sub(w[2], w[0])); const A = len(n); if (A < 1e-8) continue;
        // Positions are quantized per primitive, so twins differ by a fraction of a millimetre:
        // bucket by centroid (4 mm) and facing, then confirm every corner within 3 mm.
        const c = [0, 1, 2].map((k) => (w[0][k] + w[1][k] + w[2][k]) / 3);
        const key = lod + '|' + c.map((x) => Math.round(x * 250)).join(',') + '|' + n.map((x) => Math.round((x / A) * 10)).join(',');
        if (!faces.has(key)) faces.set(key, []);
        faces.get(key).push({ prim, t, rank, mat, w });
      }
    }
  }
  const drop = new Map();
  for (const list of faces.values()) {
    if (list.length < 2 || new Set(list.map((f) => f.mat)).size < 2) continue;
    const keep = list.reduce((a, b) => (b.rank > a.rank ? b : a));
    // A see-through keeper would open a hole where the dropped copy used to be.
    if (keep.mat.getAlphaMode() !== 'OPAQUE' || /canopy|glass|window/i.test(keep.mat.getName() || '')) continue;
    const twin = (f) => f.w.every((q) => keep.w.some((r) => Math.hypot(q[0] - r[0], q[1] - r[1], q[2] - r[2]) < 0.003));
    for (const f of list) if (f !== keep && f.mat !== keep.mat && twin(f)) {
      if (!drop.has(f.prim)) drop.set(f.prim, new Set()); drop.get(f.prim).add(f.t);
    }
  }
  let dropped = 0;
  for (const [prim, ts] of drop) {
    const idx = prim.getIndices(); const I = idx.getArray(); const keep = [];
    for (let t = 0; t + 2 < I.length; t += 3) if (!ts.has(t)) keep.push(I[t], I[t + 1], I[t + 2]);
    if (!keep.length) continue; // never empty a primitive (primitive count is a release contract)
    dropped += ts.size;
    prim.setIndices(document.createAccessor().setType('SCALAR').setArray(new (I.constructor)(keep)).setBuffer(idx.getBuffer()));
  }
  return dropped;
}

export function repairDocumentShading(document, opts = {}) {
  // Certified geometry (Ceres workfleet) promises exact source anatomy, down to triangle counts.
  const extras = document.getRoot().getAsset().extras || {};
  if (extras.ceresWorkfleet) return [];
  const rows = [];
  // Texel density per material (and overall) from primitives that already carry UVs.
  const byMat = new Map(); const all = [];
  for (const mesh of document.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const d = triUvDensity(prim); if (!d.length) continue;
    const m = prim.getMaterial(); if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(...d); all.push(...d);
  }
  const overall = median(all) || 0.5;
  const densityFor = (m) => median(byMat.get(m) || []) || overall;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      if (/^COLLISION/i.test(mesh.getName() || '')) continue;
      let r = repairPrimitive(document, prim, mesh.getName(), mat ? mat.getName() : null, opts);
      const uv = opts.uv === false ? null : repairCollapsedUVs(document, prim);
      if (uv) r = { mesh: mesh.getName(), material: mat ? mat.getName() : null, ...(r || {}), ...uv };
      const added = opts.uv === false ? null : addMissingUVs(document, prim, densityFor);
      if (added) r = { mesh: mesh.getName(), material: mat ? mat.getName() : null, ...(r || {}), ...added };
      if (r) rows.push(r);
    }
  }
  const zDropped = opts.zfight === false ? 0 : repairCoincidentFaces(document);
  if (zDropped) rows.push({ mesh: '*', material: '*', zFightTrisDropped: zDropped });
  // Orphaned accessors from replaced attributes.
  for (const acc of document.getRoot().listAccessors()) if (acc.listParents().length <= 1) acc.dispose();
  return rows;
}

// gltf-transform transform form, for the release builders.
export function shadingRepair(opts = {}) {
  return (document) => { repairDocumentShading(document, opts); };
}
