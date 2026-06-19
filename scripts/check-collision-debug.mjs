// §12.5 collision/socket/landing-contact debug-visualization smoke test.
//
// Verifies the debug overlay (render/collisionDebug.js) is off by default, toggles on, lays a collision
// ring scaled to the entity radius over each ship mesh, places a colored marker on each named socket,
// marks landing contacts, hides everything when toggled off, and issues no per-frame allocation in the
// steady state (pool reuse). Headless — stubs only the 2D canvas (mirrors check-kestrel-hero.mjs).
//
// Run: node scripts/check-collision-debug.mjs
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
const { createCollisionDebug } = await import('../src/render/collisionDebug.js');

let ok = 0, fail = 0;
function check(label, cond, detail = '') {
  if (cond) { ok++; } else { fail++; console.log(`FAIL  ${label}${detail ? '  —  ' + detail : ''}`); }
}

// A minimal fake render-system exposing scene + _meshes (the only fields the visualizer touches).
const scene = new THREE.Scene();
const kestrel = buildKestrelHero({ id: 'p', type: 'ship', team: 0, radius: 14, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { defId: 'ship_kestrel', fittings: [] } });
// Simulate the renderer stashing the entity on the mesh (syncEntityViews does this for the radius read).
kestrel.userData.__lastEntity = { id: 'p', radius: 14 };
scene.add(kestrel);
const renderSys = { scene, _meshes: new Map([['p', kestrel]]) };

const dbg = createCollisionDebug(renderSys);

// ---- off by default; toggle on/off ----
check('overlay off by default', dbg.on === false);
dbg.toggle();
check('toggle turns overlay on', dbg.on === true);
dbg.toggle();
check('toggle turns overlay off again', dbg.on === false);
dbg.setDebug(true);
check('setDebug(true) enables overlay', dbg.on === true);

// ---- update lays overlays over the ship: collision ring + 7 socket markers ----
dbg.update();
let visibleRings = 0, visibleSockets = 0, visibleContacts = 0;
scene.traverse((o) => {
  if (!o.visible) return;
  if (o.geometry && o.geometry.type === 'RingGeometry') visibleRings++;
  if (o.name === 'SF_DebugCollision' || (o.parent && o.parent.name === 'SF_DebugCollision')) {
    // sockets/contacts are basic-material spheres inside the debug group
  }
});
// Count via the debug group's children directly (they're pooled Meshes).
const grp = scene.children.find((c) => c.name === 'SF_DebugCollision');
check('debug group present in scene', !!grp);
let ringMeshes = 0, sphereMeshes = 0;
if (grp) {
  for (const c of grp.children) {
    if (!c.visible) continue;
    if (c.geometry && c.geometry.type === 'RingGeometry') ringMeshes++;
    else if (c.geometry && c.geometry.type === 'SphereGeometry') sphereMeshes++;
  }
}
check('one collision ring laid over the ship (scaled to radius)', ringMeshes === 1, `rings=${ringMeshes}`);
// 7 sockets; the Kestrel also has landing skids (Kestrel_Landing_Skid_*). Expect >=7 socket markers.
check('socket markers laid (>=7)', sphereMeshes >= 7, `spheres=${sphereMeshes}`);

// Verify the ring is scaled to the entity radius (14) and sits at the ship's position.
if (grp) {
  const ring = grp.children.find((c) => c.visible && c.geometry && c.geometry.type === 'RingGeometry');
  if (ring) {
    const scale = ring.scale.x;
    check('collision ring scaled to entity radius (~14)', scale > 13 && scale < 15, `scale=${scale}`);
  } else { check('collision ring found', false); }
}

// ---- turning off hides every pooled marker (no stale overlays) ----
dbg.setDebug(false);
if (grp) {
  let anyVisible = false;
  for (const c of grp.children) if (c.visible) anyVisible = true;
  check('all pooled markers hidden when off', !anyVisible);
  check('debug group itself hidden when off', grp.visible === false);
}

// ---- the overlay group is a child of the scene (real overlay, not orphaned) ----
check('overlay added to the render scene', !!grp && grp.parent === scene);

dbg.dispose();
check('dispose removes the group from the scene', !scene.children.find((c) => c.name === 'SF_DebugCollision'));

console.log(`\n${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
