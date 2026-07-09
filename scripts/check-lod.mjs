// LOD framework smoke test (spec §12.4).
//
// Verifies the projected-screen-size selector resolves the live thresholds (LOD0 above 120px, LOD1
// below 120px, LOD2 below 45px), that hysteresis prevents oscillation at a boundary, and that the Kestrel's
// updateLod reaction drops its decals at LOD1+ while preserving the silhouette. Headless — mirrors
// check-kestrel-hero.mjs (stubbed 2D canvas, no jsdom/GPU).
//
// Run: node scripts/check-lod.mjs
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
const { createLodState, projectedWidthPx, attachLodState } = await import('../src/render/lod.js');
const { buildKestrelHero } = await import('../src/render/ships/kestrelHero.js');
const { createVisualFactory } = await import('../src/render/visualFactory.js');

let ok = 0, fail = 0;
function check(label, cond, detail = '') {
  if (cond) { ok++; } else { fail++; console.log(`FAIL  ${label}${detail ? '  —  ' + detail : ''}`); }
}

// ---- selector thresholds (spec §12.4) ----
const lod = createLodState();
check('large projected width -> LOD0', lod.resolve(600) === 'lod0', `got ${lod.resolve(600)}`);
const lod2 = createLodState();
lod2.resolve(600); // start at LOD0
check('medium width -> LOD1', lod2.resolve(90) === 'lod1', `got ${lod2.level}`);
check('small width -> LOD2', lod2.resolve(15) === 'lod2', `got ${lod2.level}`);

// ---- hysteresis: a ship hovering on the 300px boundary must not oscillate ----
// Drive it to LOD0, then wiggle it just under the threshold but inside the hysteresis band; it must
// stay at LOD0 (the spec's "use hysteresis" requirement, §12.4).
const hyst = createLodState();
hyst.resolve(600);                  // firmly LOD0
const before = hyst.level;
for (let i = 0; i < 10; i++) hyst.resolve(105 + (i % 3));  // just under 120 but within band
check('hysteresis holds LOD0 near the 120px boundary', hyst.level === before, `oscillated to ${hyst.level}`);

// Reverse: drive to LOD1, wiggle just over the threshold; must stay LOD1.
const hyst2 = createLodState();
hyst2.resolve(90);                  // firmly LOD1
const before2 = hyst2.level;
for (let i = 0; i < 10; i++) hyst2.resolve(135 + (i % 3));  // just over 120 but within band
check('hysteresis holds LOD1 near the 120px boundary', hyst2.level === before2, `oscillated to ${hyst2.level}`);

// ---- projectedWidthPx is monotonic decreasing with distance (sanity) ----
const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 5000);
cam.position.set(0, 300, 0); cam.lookAt(0, 0, 0);
const vp = { width: 1920, height: 1080 };
const near = projectedWidthPx({ x: 0, z: 0 }, 14, cam, vp);
cam.position.set(0, 900, 0);
const far = projectedWidthPx({ x: 0, z: 0 }, 14, cam, vp);
check('projected width decreases with distance', near > far, `near=${near.toFixed(0)} far=${far.toFixed(0)}`);
check('projected width is finite + non-negative', Number.isFinite(near) && near >= 0, `near=${near}`);

// ---- Kestrel reacts to LOD: decals drop at LOD1+, silhouette preserved ----
const root = buildKestrelHero({ id: 'p', type: 'ship', team: 0, radius: 14, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { defId: 'ship_kestrel', fittings: [] } });
attachLodState(root); // the builder already attaches it; idempotent
check('Kestrel carries a lod state', !!root.userData.lod);
check('Kestrel carries updateLod reaction', typeof root.userData.updateLod === 'function');

root.userData.updateLod('lod0');
let decalsAtLod0 = 0;
root.traverse((o) => { if (o.name && o.name.startsWith('Kestrel_Decal_') && o.visible) decalsAtLod0++; });
root.userData.updateLod('lod1');
let decalsAtLod1 = 0;
root.traverse((o) => { if (o.name && o.name.startsWith('Kestrel_Decal_') && o.visible) decalsAtLod1++; });
check('decals visible at LOD0', decalsAtLod0 > 0, `decals=${decalsAtLod0}`);
check('decals dropped at LOD1', decalsAtLod1 === 0, `decals=${decalsAtLod1}`);

// Silhouette preserved at LOD1: the pressure hull / drive are still visible (spec §12.4).
let hullVisibleAtLod1 = false;
root.traverse((o) => {
  if (o.isMesh && o.visible && /Hull|Static|Drive/i.test(o.name)) hullVisibleAtLod1 = true;
});
check('silhouette preserved at LOD1 (hull/drive visible)', hullVisibleAtLod1);

// Decals restored on return to LOD0 (reversible, like damage states).
root.userData.updateLod('lod0');
let decalsRestored = 0;
root.traverse((o) => { if (o.name && o.name.startsWith('Kestrel_Decal_') && o.visible) decalsRestored++; });
check('decals restored on return to LOD0 (reversible)', decalsRestored === decalsAtLod0, `${decalsRestored} vs ${decalsAtLod0}`);

// ---- Asteroids react to LOD: far mineral detail drops, core rock silhouette stays ----
const vf = createVisualFactory();
const asteroid = vf.build({
  id: 4242,
  type: 'asteroid',
  radius: 10,
  pos: { x: 0, z: 0 },
  data: { typeId: 'ast_crystalline' },
});
check('asteroid carries a lod state', !!(asteroid && asteroid.userData && asteroid.userData.lod));
check('asteroid carries updateLod reaction', typeof asteroid.userData.updateLod === 'function');

asteroid.userData.updateLod('lod0');
const asteroidCore = asteroid.children.find((o) => o.isMesh);
let visibleAtAstLod0 = 0;
asteroid.traverse((o) => { if (o.visible !== false) visibleAtAstLod0++; });
asteroid.userData.updateLod('lod2');
let visibleAtAstLod2 = 0;
let asteroidCoreVisible = false;
asteroid.traverse((o) => {
  if (o.visible !== false) visibleAtAstLod2++;
  if (o === asteroidCore && o.visible !== false) asteroidCoreVisible = true;
});
check('asteroid drops far-only detail at LOD2', visibleAtAstLod2 < visibleAtAstLod0, `lod0=${visibleAtAstLod0} lod2=${visibleAtAstLod2}`);
check('asteroid core silhouette remains visible at LOD2', asteroidCoreVisible);

console.log(`\n${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
