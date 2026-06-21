// Headless smoke test: build every enemy silhouette + every player family via the visual factory,
// catching runtime errors (missing helpers, bad geometry args, undefined refs) that node --check
// cannot see. Run: node scripts/check-ship-builders.mjs
//
// No jsdom dependency — we stub only the bits the canvas-texture layer touches at import time
// (document.createElement('canvas') + a noop 2d context). The factory never renders, so a stub
// canvas with length-only methods is enough to exercise build().
function makeStubCanvas() {
  // A 2D-context stub complete enough for canvasTextures.js (the factory builds noise/panel/greeble
  // textures at build time). Every method the texture builders call must exist; image-data calls
  // return a zeroed buffer so nothing throws. This is NOT a real render — just enough to exercise
  // build() without a browser, so we can catch geometry/registration bugs headlessly.
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
    fillStyle: '', strokeStyle: '', font: '', lineWidth: 1, globalAlpha: 1,
  };
  return {
    width: 256, height: 256, getContext: () => ctx, style: {},
    toDataURL: () => 'data:,', addEventListener() {}, removeEventListener() {},
  };
}
globalThis.document = {
  createElement: (tag) => {
    if (tag === 'canvas') return makeStubCanvas();
    return { style: {}, appendChild: () => {}, addEventListener: () => {} };
  },
  getElementById: () => null,
  addEventListener: () => {},
};
globalThis.window = { addEventListener: () => {}, devicePixelRatio: 1 };

const THREE = await import('three');
globalThis.THREE = THREE;

const { createVisualFactory } = await import('../src/render/visualFactory.js');
const { ENEMY_TYPES } = await import('../src/data/enemies.js');
const { SHIPS } = await import('../src/data/ships.js');

const vf = createVisualFactory();

function mkEntity(over = {}) {
  return Object.assign({
    id: 'test', type: 'ship', radius: 24, rot: 0,
    pos: { x: 100, z: 0 },
    data: { defId: 'ship_kestrel', fittings: [] },
  }, over);
}

// The factory's build() wraps every branch in a try/catch that silently falls back to a box on
// ANY error. That hides real bugs (the "1 node" result we saw). To get honest coverage we call
// build() once, and if it produced a trivial result (≤1 child — the fallback box), we re-run
// with the swallow disabled by monkey-patching console to surface the caught error path. Since
// we can't reach the internal catch, we instead assert: a real ship build must produce >2 nodes.
let failures = 0;
function tryBuild(label, entity) {
  try {
    const mesh = vf.build(entity);
    if (!mesh) throw new Error('build() returned null/undefined');
    let n = 0; mesh.traverse(() => { n++; });
    // A real ship silhouette produces many meshes (hull + wings + engines + blinkers...).
    // The fallback box produces 1. Treat ≤2 as a silent-fallback (real bug hidden by the catch).
    if (n <= 2) throw new Error(`only ${n} nodes — buildShipMesh silently threw and fell back to box (the factory's catch hid the real error)`);
    console.log(`ok   ${label.padEnd(30)} (${n} nodes)`);
  } catch (e) {
    console.log(`FAIL ${label.padEnd(30)} ${e.message}`);
    failures++;
  }
}

console.log('=== ENEMY SILHOUETTES (Workstream D) ===');
for (const def of ENEMY_TYPES) {
  tryBuild(`enemy:${def.id}`, mkEntity({
    data: { defId: def.shipId, silhouette: def.silhouette, fittings: [] },
  }));
}

console.log('=== PLAYER FAMILIES (regression) ===');
for (const ship of SHIPS) {
  tryBuild(`player:${ship.id}`, mkEntity({ data: { defId: ship.id, fittings: [] } }));
}

console.log(failures === 0 ? '\nALL BUILDERS OK' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
