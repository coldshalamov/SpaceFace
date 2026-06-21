// 96-pixel silhouette gate for the Kestrel hero asset (spec §6.2 step 1, §22 acceptance).
//
// A ship must survive as a filled black shape at its smallest common gameplay size: class, forward
// direction, and the split-shoulder / single-drive read should be legible within three seconds. We
// can't run a real WebGL render headlessly (no GPU), so — mirroring check-ship-builders.mjs — we build
// the mesh under a stubbed 2D canvas, gather its world-space triangles, project them onto an
// orthographic top-down plane (the gameplay camera), rasterize a solid 96×96 filled silhouette, and
// assert the three-second read survives: oriented, non-degenerate, with broad midship shoulders that
// taper to a guarded prow and a single compact aft drive.
//
// Run: node scripts/check-kestrel-silhouette.mjs
function makeStubCanvas() {
  const ctx = {
    canvas: { width: 256, height: 256 },
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
    bezierCurveTo() {}, quadraticCurveTo() {}, fill() {}, stroke() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createImageData(w, h) { return { data: new Uint8ClampedArray((w || 1) * (h || 1) * 4), width: w, height: h }; },
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    putImageData() {}, drawImage() {}, measureText() { return { width: 10 }; },
    fillStyle: '', strokeStyle: '', font: '', lineWidth: 1, globalAlpha: 1, letterSpacing: '0px',
  };
  return { width: 256, height: 256, getContext: () => ctx, style: {}, toDataURL: () => 'data:,', addEventListener() {} };
}
globalThis.document = {
  createElement: (tag) => tag === 'canvas' ? makeStubCanvas() : { style: {}, appendChild() {}, addEventListener() {} },
  getElementById: () => null, addEventListener: () => {},
};
globalThis.window = { addEventListener: () => {}, devicePixelRatio: 1 };

const THREE = await import('three');
globalThis.THREE = THREE;

const { buildKestrelHero } = await import('../src/render/ships/kestrelHero.js');

const G = 96;                 // the spec's thumbnail gate width
const DESIGN_RADIUS = 14;

let ok = 0, fail = 0;
function check(label, cond, detail = '') {
  if (cond) { ok++; }
  else { fail++; console.log(`FAIL  ${label}${detail ? '  —  ' + detail : ''}`); }
}

// Build the hero mesh and gather every world-space triangle on the top-down (XZ) plane. We collect
// triangles, not just vertices, so the filled silhouette is solid (vertices alone leave gaps; a
// thumbnail must read the hull as a continuous mass).
const root = buildKestrelHero({ id: 'p', type: 'ship', team: 0, radius: DESIGN_RADIUS, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { defId: 'ship_kestrel', fittings: [] } });
root.updateMatrixWorld(true);

const tris = [];
const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
root.traverse((o) => {
  if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
  const pos = o.geometry.attributes.position;
  const idx = o.geometry.index;
  const pushTri = (ia, ib, ic) => {
    va.fromBufferAttribute(pos, ia).applyMatrix4(o.matrixWorld);
    vb.fromBufferAttribute(pos, ib).applyMatrix4(o.matrixWorld);
    vc.fromBufferAttribute(pos, ic).applyMatrix4(o.matrixWorld);
    tris.push([[va.x, va.z], [vb.x, vb.z], [vc.x, vc.z]]);
  };
  if (idx) { for (let i = 0; i < idx.count; i += 3) pushTri(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)); }
  else { for (let i = 0; i + 2 < pos.count; i += 3) pushTri(i, i + 1, i + 2); }
});
check('mesh yields geometry triangles', tris.length > 200, `triangles=${tris.length}`);

// Bounds on the XZ plane.
const allPts = tris.flat();
let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (const [x, z] of allPts) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
const lenX = maxX - minX, lenZ = maxZ - minZ;
check('forward (X) is the long axis', lenX > lenZ, `lenX=${lenX.toFixed(1)} lenZ=${lenZ.toFixed(1)}`);
// The Kestrel is ~28m long, ~14m wide: aspect ~2:1. At 96px the silhouette must keep that read.
const aspect = lenX / lenZ;
check('silhouette aspect ~2:1 (length/beam)', aspect > 1.5 && aspect < 2.8, `aspect=${aspect.toFixed(2)}`);

// Rasterize a solid 96×96 filled silhouette from the triangles (barycentric point-in-triangle, bounded
// by each triangle's grid-space AABB so it stays cheap).
const grid = new Uint8Array(G * G);
const sx = G / lenX, sz = G / lenZ;
for (const [[ax, az], [bx, bz], [cx, cz]] of tris) {
  const gax = (ax - minX) * sx, gaz = (az - minZ) * sz;
  const gbx = (bx - minX) * sx, gbz = (bz - minZ) * sz;
  const gcx = (cx - minX) * sx, gcz = (cz - minZ) * sz;
  const xlo = Math.max(0, Math.floor(Math.min(gax, gbx, gcx))), xhi = Math.min(G - 1, Math.ceil(Math.max(gax, gbx, gcx)));
  const zlo = Math.max(0, Math.floor(Math.min(gaz, gbz, gcz))), zhi = Math.min(G - 1, Math.ceil(Math.max(gaz, gbz, gcz)));
  const denom = (gbz - gcz) * (gax - gcx) + (gcz - gaz) * (gbx - gcx) || 1e-9;
  for (let gz = zlo; gz <= zhi; gz++) {
    for (let gx = xlo; gx <= xhi; gx++) {
      const px = gx + 0.5, py = gz + 0.5;
      const l1 = ((gbz - gcz) * (px - gcx) + (gcz - gaz) * (py - gcz)) / denom;
      const l2 = ((gcz - gaz) * (px - gcx) + (gax - gcx) * (py - gcz)) / denom;
      const l3 = 1 - l1 - l2;
      if (l1 >= 0 && l2 >= 0 && l3 >= 0) grid[gz * G + gx] = 1;
    }
  }
}

let filled = 0;
for (let i = 0; i < grid.length; i++) if (grid[i]) filled++;
const fillRatio = filled / (G * G);

// ---- the three-second-read survival checks (spec §9.2) ----
// A recognizable scout silhouette must not collapse to a thin line or a tiny blob: a solid filled area
// well above zero — the hull body reads as a continuous mass at thumbnail size.
check('silhouette fills meaningful area (not a line)', fillRatio > 0.06, `fill=${(fillRatio * 100).toFixed(1)}%`);

// Per-column occupancy width across the length of the ship.
const colWidth = new Array(G).fill(0);
for (let gz = 0; gz < G; gz++) for (let gx = 0; gx < G; gx++) if (grid[gz * G + gx]) colWidth[gx]++;
let maxCol = 0, maxColIdx = 0;
for (let gx = 0; gx < G; gx++) if (colWidth[gx] > maxCol) { maxCol = colWidth[gx]; maxColIdx = gx; }
const midCol = colWidth[Math.floor(G * 0.5)];

// Split-shoulder read (spec §9.2 #2): the broadest mass sits at/near midship — the shoulders survive as
// a recognizable wide mass, not a needle.
check('broadest mass near midship (split shoulders)', Math.abs(maxColIdx - G * 0.5) <= G * 0.25, `maxCol@${maxColIdx} mid@${Math.floor(G*0.5)}`);

// Single aft drive (spec §9.2 #3): the aft columns narrow past the shoulders — the hull tapers to the
// engine, so the drive reads as a compact aft mass, not a second broad body.
const aftCol = colWidth[Math.floor(G * 0.85)];
check('hull narrows to single aft drive', aftCol < midCol, `aft=${aftCol} mid=${midCol}`);

// Orientation read (spec §22 "forward direction remains clear"): prow and aft both taper relative to
// midship — a diamond/wedge profile. A uniform-width rectangle would read as a crate, not a hull.
const fwdCol = colWidth[Math.floor(G * 0.15)];
check('forward prow narrows (directed hull, not a crate)', fwdCol < midCol * 0.85, `fwd=${fwdCol} mid=${midCol}`);

console.log(`\n${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
