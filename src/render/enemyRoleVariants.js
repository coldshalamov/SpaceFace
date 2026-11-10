// LW-06 specialist recovery art. Normal play selects the packaged authored whole ships —
// all four ids ride REQUIRED_WHOLE_SHIP_DEF_IDS hulls, so admission fails closed and these
// builders never run on the ordinary route. They are the role-readable body for the
// dev/test/asset-missing seam: same silhouette language, proven through the live factory.
// The factory's frame is +X forward, +Y up. Everything here is contained in a child
// group so canonical hardpoints, engines, weapons and the native body stay untouched.
import * as THREE from 'three';

// Unit primitives are shared for the lifetime of the module. Per-entity materials
// are cloned separately and are retired by renderer.disposeObjectNode.
const geometryCache = new Map();
function geo(key, build) {
  let value = geometryCache.get(key);
  if (!value) {
    value = build();
    value.dispose = () => {};
    geometryCache.set(key, value);
  }
  return value;
}
function ownedMaterial(source) {
  return source.clone();
}
function jitterRng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rootFor(ctx, key) {
  const root = new THREE.Group();
  root.name = `enemy-role-fallback:${key}`;
  root.userData.roleFallbackGeometry = key;
  ctx.g.add(root);
  return root;
}
function signatureGroup(root, key) {
  const sig = new THREE.Group();
  sig.name = `enemy-role-variant:${key}`;
  sig.userData.roleVariant = key;
  root.add(sig);
  return sig;
}
function part(parent, geometry, material, R, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x * R, y * R, z * R);
  mesh.scale.setScalar(R);
  parent.add(mesh);
  return mesh;
}
function noseGroup(parent, x, R) {
  const nose = new THREE.Group();
  nose.name = 'role-nose';
  nose.position.x = x * R;
  parent.add(nose);
  return nose;
}

// A narrow forebody and broader aft deck fit the measured Bastion/Drifter skins.
// This frame is normalized by the existing entity radius, not a new collider.
function armoredCore(ctx, root, { plates = 3, nozzles = 3 } = {}) {
  const { R, hm } = ctx;
  part(root, geo('core', () => new THREE.BoxGeometry(1.42, 0.24, 0.17)), hm, R, -0.02, 0, 0);
  part(root, geo('aft', () => new THREE.BoxGeometry(0.76, 0.20, 0.36)), hm, R, -0.34, 0, 0);
  const armor = ownedMaterial(hm); armor.color.multiplyScalar(0.55);
  for (let i = 0; i < plates; i++) {
    part(root, geo('plate', () => new THREE.BoxGeometry(0.16, 0.06, 0.34)), armor, R,
      -0.56 + i * 0.19, 0.13 + i * 0.025, 0);
  }
  const nozzle = geo('nozzle', () => new THREE.CylinderGeometry(0.045, 0.055, 0.12, 8));
  for (let i = 0; i < nozzles; i++) {
    const z = (i - (nozzles - 1) / 2) * 0.08;
    const mesh = part(root, nozzle, hm, R, -0.70, 0, z);
    mesh.rotation.z = Math.PI / 2;
  }
}
function pointedNose(parent, material, R, center = 0.48) {
  const nose = noseGroup(parent, center, R);
  const mesh = part(nose, geo('nose', () => new THREE.ConeGeometry(0.075, 0.42, 6)), material, R, 0, 0, 0);
  mesh.rotation.z = -Math.PI / 2;
}

export function buildWardenScreen(ctx) {
  const { R, hm, accent, seed } = ctx;
  const root = rootFor(ctx, 'warden_screen');
  armoredCore(ctx, root);
  pointedNose(root, hm, R);
  const sig = signatureGroup(root, 'warden_screen');
  const rnd = jitterRng(seed ^ 0x5eed);
  const pylon = geo('wardenPylon', () => new THREE.CylinderGeometry(0.035, 0.045, 0.48, 6));
  const vane = geo('wardenVane', () => new THREE.BoxGeometry(0.24, 0.32, 0.025));
  const orb = geo('wardenOrb', () => new THREE.SphereGeometry(0.05, 10, 8));
  for (const side of [-1, 1]) {
    const tilt = (rnd() - 0.5) * 0.08;
    const p = part(sig, pylon, hm, R, -0.33, 0.28, side * 0.20); p.rotation.x = tilt;
    const v = part(sig, vane, accent, R, -0.33, 0.46, side * 0.20); v.rotation.x = tilt;
    part(sig, orb, accent, R, -0.33, 0.64, side * 0.20);
  }
}

export function buildAnchorDish(ctx) {
  const { R, hm, accent, blinkers, seed } = ctx;
  const root = rootFor(ctx, 'anchor_dish');
  armoredCore(ctx, root);
  pointedNose(root, hm, R);
  const sig = signatureGroup(root, 'anchor_dish');
  const rnd = jitterRng(seed ^ 0xa11ce);
  part(sig, geo('anchorMast', () => new THREE.CylinderGeometry(0.055, 0.07, 0.20, 8)), hm, R, -0.34, 0.22, 0);
  const dish = part(sig, geo('anchorDish', () => new THREE.SphereGeometry(0.18, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.42)), hm, R, -0.34, 0.34, 0);
  dish.scale.y *= 0.45;
  const rim = part(sig, geo('anchorRim', () => new THREE.TorusGeometry(0.18, 0.012, 6, 20)), accent, R, -0.34, 0.34, 0);
  rim.rotation.x = Math.PI / 2;
  const coreMat = ownedMaterial(accent);
  const core = part(sig, geo('anchorCore', () => new THREE.SphereGeometry(0.05, 10, 8)), coreMat, R, -0.34, 0.37, 0);
  core.userData.blink = { phase: (seed % 97) / 97 + rnd() * 0.25, hz: 0.34, base: 1.35 };
  if (blinkers) blinkers.push(core);
}

export function buildJackalRack(ctx) {
  const { R, hm, accent, seed } = ctx;
  const root = rootFor(ctx, 'jackal_rack');
  armoredCore(ctx, root, { plates: 2, nozzles: 2 });
  const sig = signatureGroup(root, 'jackal_rack');
  pointedNose(sig, hm, R);
  // Mine canisters sit along the aft deck, within the Drifter's measured skin.
  const rackMat = ownedMaterial(hm); rackMat.color.multiplyScalar(0.5);
  part(sig, geo('jackalRail', () => new THREE.BoxGeometry(0.54, 0.06, 0.05)), rackMat, R, -0.40, 0.16, -0.20);
  const can = geo('jackalCan', () => new THREE.CylinderGeometry(0.04, 0.04, 0.12, 8));
  const band = geo('jackalBand', () => new THREE.CylinderGeometry(0.045, 0.045, 0.025, 8));
  const rnd = jitterRng(seed ^ 0x9ac4);
  for (let i = 0; i < 3; i++) {
    const x = -0.58 + i * 0.18 + (rnd() - 0.5) * 0.015;
    part(sig, can, rackMat, R, x, 0.23, -0.20);
    part(sig, band, accent, R, x, 0.25, -0.20);
  }
}

// A low dorsal boarding plate, broad over the aft shoulder and tapered through the
// Hornet skin's narrow forward section. The approved authored cutter remains the default.
function cutterPlateGeometry() {
  const outline = [[-0.42,-0.28],[-0.12,-0.28],[0.02,-0.11],[0.66,-0.075],[0.74,0],
    [0.66,0.075],[0.02,0.11],[-0.12,0.28],[-0.42,0.28]];
  const positions = [];
  for (const y of [0, 0.055]) for (const [x,z] of outline) positions.push(x,y,z);
  const indices = [];
  const n = outline.length;
  for (let i = 1; i < n - 1; i++) indices.push(0,i,i+1,n,n+i+1,n+i);
  for (let i = 0; i < n; i++) { const j=(i+1)%n; indices.push(i,n+j,j,i,n+i,n+j); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}
export function buildCustomsProw(ctx) {
  const { R, hm, accent } = ctx;
  const root = rootFor(ctx, 'customs_prow');
  armoredCore(ctx, root, { plates: 2, nozzles: 2 });
  const sig = signatureGroup(root, 'customs_prow');
  const plateMat = ownedMaterial(hm);
  plateMat.color.multiplyScalar(1.45); plateMat.metalness = Math.min(1, (plateMat.metalness ?? 0.5) + 0.3); plateMat.roughness = 0.3;
  const nose = noseGroup(sig, 0.15, R);
  part(nose, geo('cutterPlate', cutterPlateGeometry), plateMat, R, -0.15, 0.14, 0);
  part(sig, geo('cutterSeam', () => new THREE.BoxGeometry(0.22, 0.015, 0.018)), accent, R, 0.40, 0.205, 0);
  const tip = geo('cutterTip', () => new THREE.SphereGeometry(0.025, 8, 6));
  for (const side of [-1, 1]) part(sig, tip, accent, R, -0.25, 0.20, side * 0.21);
}

export const ENEMY_ROLE_VARIANT_BUILDERS = Object.freeze({
  warden_screen: buildWardenScreen,
  anchor_dish: buildAnchorDish,
  jackal_rack: buildJackalRack,
  customs_prow: buildCustomsProw,
});
