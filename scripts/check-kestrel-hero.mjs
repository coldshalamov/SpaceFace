// Headless smoke test for the bespoke Kestrel hero asset + its override seam.
//
// Mirrors check-ship-builders.mjs: stubs only the canvas-texture layer (no jsdom) so buildKestrelHero()
// can run under node and we can assert the structural contract the style guide / manifest require —
// 7 named sockets, the static-by-material batching target, drive/plume kept dynamic, and that a
// throw inside the hero builder falls through to the procedural factory in dev, but fails in release
// mode so packaged startup and CI cannot hide a broken hero asset (spec §17.3 / SG-04).
//
// Run: node scripts/check-kestrel-hero.mjs
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
const { installVisualOverrides, isReleaseAssetMode } = await import('../src/render/visualOverrides.js');
const { createVisualFactory } = await import('../src/render/visualFactory.js');

const DESIGN_RADIUS = 14;
const EXPECTED_SOCKETS = [
  'SOCKET_Weapon_Front', 'SOCKET_Mining_Front', 'SOCKET_Engine_Main',
  'SOCKET_Utility_Dorsal', 'SOCKET_Cargo_Ventral', 'SOCKET_Trail_Main', 'SOCKET_Camera_Focus',
];
// renderContract in kestrelHero.js declares "<= 20 before post-processing", the spec's §12.2
// player-starter tier ceiling (8–20). Static batching merges same-material meshes; the three dynamic
// drive parts (fan, core, plume) + nav lights + utility pod stay separate for damage-state modulation.
const DRAW_BUDGET = 20;

let ok = 0, fail = 0;
function check(label, cond, detail = '') {
  if (cond) { ok++; }
  else { fail++; console.log(`FAIL  ${label}${detail ? '  —  ' + detail : ''}`); }
}

function mkKestrelEntity(over = {}) {
  return Object.assign({
    id: 'player', type: 'ship', team: 0, radius: DESIGN_RADIUS, rot: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    data: { defId: 'ship_kestrel', fittings: [] },
  }, over);
}

// Build directly and walk the scene graph.
let root;
try {
  root = buildKestrelHero(mkKestrelEntity());
  check('buildKestrelHero does not throw', !!root);
} catch (e) {
  console.log(`ERR   buildKestrelHero threw: ${e.message}`);
  process.exit(1);
}

// Collect socket + dynamic-part metadata in one traversal.
const foundSockets = new Set();
let meshCount = 0, dynamicParts = 0, decalCount = 0;
root.traverse((o) => {
  if (o.userData && o.userData.spacefaceSocket && o.name) foundSockets.add(o.name);
  if (o.isMesh) {
    meshCount++;
    if (o.userData && o.userData.keepSeparate) dynamicParts++;
    if (o.name && o.name.startsWith('Kestrel_Decal_')) decalCount++;
  }
});

// ---- sockets (spec §9.9) ----
check('all 7 named sockets present', EXPECTED_SOCKETS.every(s => foundSockets.has(s)), `sockets=${[...foundSockets].join(',')}`);
check('exactly 7 sockets (no extras)', foundSockets.size === EXPECTED_SOCKETS.length, `count=${foundSockets.size}`);

// ---- draw-call structure (spec §9.13: batched statics + separate dynamic drive) ----
// Static batching has already run inside buildKestrelHero (mergeStaticByMaterial). After it, the
// remaining separate meshes are: dynamic drive parts (keepSeparate) + decal planes + the merged
// static batches themselves. The pre-post draw target is the mesh count; assert it is in budget.
check(`mesh count within draw budget (<=${DRAW_BUDGET})`, meshCount <= DRAW_BUDGET, `meshes=${meshCount}`);
check('drive fan/core/plume kept dynamic (>=3 keepSeparate)', dynamicParts >= 3, `dynamic=${dynamicParts}`);
check('decals present (BORROWED TIME + shark)', decalCount >= 2, `decals=${decalCount}`);

// ---- dimensions / scale (spec §9.4, contract) ----
// Bounding box of the authored hull should land near the nominal 28×6×14 m after the radius scale.
const box = new THREE.Box3().setFromObject(root);
const size = new THREE.Vector3(); box.getSize(size);
check('authored length ~28 m', size.x > 24 && size.x < 32, `length=${size.x.toFixed(2)}`);
check('contract userData present', !!root.userData.renderContract && root.userData.assetId === 'SF_K0_KESTREL_BORROWED_TIME');

// ---- override seam (spec §17.3): player Kestrel intercepted, others unaffected, dev fallback isolated ----
const vf = createVisualFactory();
installVisualOverrides(vf);
let viaSeam;
try {
  viaSeam = vf.build(mkKestrelEntity());
  check('seam intercepts player Kestrel', !!viaSeam && viaSeam.userData && viaSeam.userData.assetId === 'SF_K0_KESTREL_BORROWED_TIME');
} catch (e) {
  check('seam build does not throw', false, e.message);
}

// A non-Kestrel (and non-player) ship must still come from the procedural factory — not the hero.
const npcMesh = vf.build(mkKestrelEntity({ team: 1, data: { defId: 'ship_bastion', fittings: [] } }));
check('non-Kestrel entity uses procedural path', !!npcMesh && !(npcMesh.userData && npcMesh.userData.assetId === 'SF_K0_KESTREL_BORROWED_TIME'));

// Failure isolation: if the hero builder throws in development, the seam must fall back to the
// procedural factory and never null/blank the entity. In release mode the same failure is fatal.
const vfDevFailure = createVisualFactory();
const devWarnings = [];
installVisualOverrides(vfDevFailure, {
  releaseMode: false,
  kestrelBuilder: () => { throw new Error('synthetic dev hero failure'); },
  onWarning: (message, error) => { devWarnings.push({ message, error }); },
});
let devFallback, devThrow;
try { devFallback = vfDevFailure.build(mkKestrelEntity()); } catch (e) { devThrow = e; }
check('dev seam catches hero-builder exceptions', !devThrow, devThrow && devThrow.message);
check('dev seam returns procedural fallback on hero failure', !!devFallback && devFallback.isObject3D && !(devFallback.userData && devFallback.userData.assetId === 'SF_K0_KESTREL_BORROWED_TIME'));
check('dev seam reports expected fallback warning without console noise',
  devWarnings.length === 1
  && /Kestrel hero build failed/.test(devWarnings[0].message)
  && /synthetic dev hero failure/.test(devWarnings[0].error && devWarnings[0].error.message),
  `warnings=${devWarnings.length}`);

const vfReleaseFailure = createVisualFactory();
installVisualOverrides(vfReleaseFailure, { releaseMode: true, kestrelBuilder: () => { throw new Error('synthetic release hero failure'); } });
let releaseThrow;
try { vfReleaseFailure.build(mkKestrelEntity()); } catch (e) { releaseThrow = e; }
check('release seam fails when Kestrel hero build fails', !!releaseThrow && /release mode requires Kestrel hero asset/.test(releaseThrow.message),
  releaseThrow && releaseThrow.message);

check('asset release mode defaults to player-facing release assets', isReleaseAssetMode() === true);
check('explicit releaseMode=false is reserved for source-asset authoring checks', isReleaseAssetMode({ releaseMode: false }) === false);

// Idempotency: installing twice must not double-wrap (would re-route the fallback chain).
installVisualOverrides(vf);
check('install is idempotent', vf.__spacefaceOverridesInstalled === true);

// ---- §9.10 upgrade behavior: visualTier changes ONE dimension (aft energy mass), preserves identity ----
// An upgrade enlarges the aft ring + adds cooling + changes plume — but the hull/silhouette stays the
// same (still the same ship, changed). The builder exposes the tier result on userData and the enlarged
// aft ring bakes into the merged geometry pre-batch, so we compare the aft-region bounding width.
const t0 = buildKestrelHero(mkKestrelEntity({ data: { defId: 'ship_kestrel', fittings: [], visualTier: 0 } }));
const t3 = buildKestrelHero(mkKestrelEntity({ data: { defId: 'ship_kestrel', fittings: [], visualTier: 3 } }));
check('§9.10 tier0 exposes visualTier=0', t0.userData.visualTier === 0);
check('§9.10 tier3 exposes visualTier=3', t3.userData.visualTier === 3);
check('§9.10 tier>=2 added a cooling ring', t3.userData.upgradeCooling === true);
check('§9.10 tier0 has no cooling ring (stock)', t0.userData.upgradeCooling === false);
// The aft energy mass grew: the aft-most region (x < -12) is wider on tier 3 (enlarged ring + cooling).
const aftWidth = (r) => { let mz = 0; r.traverse((o) => { if (!o.isMesh || !o.geometry) return; const p = o.geometry.attributes.position; if (!p) return; const wm = new THREE.Matrix4().multiplyMatrices(o.matrixWorld, new THREE.Matrix4().makeRotationFromQuaternion(o.quaternion)); for (let i=0;i<p.count;i++){ const x=p.getX(i); if (x < -11.5) mz = Math.max(mz, Math.abs(p.getZ(i))); } }); return mz; };
check('§9.10 tier3 aft region is wider (aft energy mass grew)', aftWidth(t3) > aftWidth(t0), `t0=${aftWidth(t0).toFixed(2)} t3=${aftWidth(t3).toFixed(2)}`);
// Identity preserved: the sockets are identical across tiers (same ship, changed).
const socketsT0 = new Set(); t0.traverse((o) => { if (o.userData && o.userData.spacefaceSocket) socketsT0.add(o.name); });
const socketsT3 = new Set(); t3.traverse((o) => { if (o.userData && o.userData.spacefaceSocket) socketsT3.add(o.name); });
check('§9.10 identity preserved (same sockets across tiers)', socketsT0.size === socketsT3.size && [...socketsT0].every((s) => socketsT3.has(s)));

console.log(`\n${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
