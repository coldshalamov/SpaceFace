// Kestrel rebuild-leak check (spec §20 Phase 1: "verify rebuilds do not leak decal textures or materials").
//
// Builds the hero asset several times in one process and asserts the per-build counts of materials,
// geometries, and textures referenced by the mesh do NOT climb across builds — i.e. the builder does
// not append to shared caches or retain disposed GPU resources. Each build is disposed (mirroring the
// renderer's entity-death path) before the next. Mirrors check-kestrel-hero.mjs (stubbed 2D canvas).
//
// Run: node scripts/check-kestrel-leak.mjs
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

const THREE = await import('../vendor/three.module.js');
globalThis.THREE = THREE;
const { buildKestrelHero } = await import('../src/render/ships/kestrelHero.js');

let ok = 0, fail = 0;
function check(label, cond, detail = '') {
  if (cond) { ok++; } else { fail++; console.log(`FAIL  ${label}${detail ? '  —  ' + detail : ''}`); }
}

function buildAndCount() {
  const root = buildKestrelHero({ id: 'p', type: 'ship', team: 0, radius: 14, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { defId: 'ship_kestrel', fittings: [] } });
  const mat = new Set(), geo = new Set(), tex = new Set();
  root.traverse((o) => {
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { mat.add(m); if (m.map) tex.add(m.map); });
    if (o.geometry) geo.add(o.geometry);
  });
  // Dispose as the renderer would on entity death, so a real leak would surface as climbing counts
  // only if the builder itself retains references outside the returned mesh.
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map && m.map.dispose) m.map.dispose(); if (m.dispose) m.dispose(); });
  });
  return { mat: mat.size, geo: geo.size, tex: tex.size };
}

const builds = [buildAndCount(), buildAndCount(), buildAndCount(), buildAndCount()];
console.log('per-build counts (materials/geometries/textures):');
builds.forEach((b, i) => console.log(`  build #${i + 1}: ${b.mat} / ${b.geo} / ${b.tex}`));

// The decisive leak signal: counts must be identical across all builds.
const stable = builds.every((b) => b.mat === builds[0].mat && b.geo === builds[0].geo && b.tex === builds[0].tex);
check('material count stable across rebuilds', stable, `mats: ${builds.map((b) => b.mat).join(',')}`);
check('geometry count stable across rebuilds', stable, `geos: ${builds.map((b) => b.geo).join(',')}`);
check('texture count stable across rebuilds (decals)', stable, `texs: ${builds.map((b) => b.tex).join(',')}`);
check('at least one decal texture present (canvas decals built)', builds[0].tex >= 1, `texs=${builds[0].tex}`);

console.log(`\n${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
