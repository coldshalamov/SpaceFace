// Optic lattice cell presentation — the visual half of the optic grammar
// (build_map §24 "the picture and the sound"). A lattice cell is an ordinary
// asteroid entity whose data.opticMaterial names its role. The stand-in was a
// flat tint on the shared asteroid material; this module replaces it with three
// physically distinct bodies a stranger can name before firing:
//
//   stone   — matte rock: the real common-rock surface maps, dark basalt tint,
//             high roughness, near-zero metalness. It reads as dead mass — the
//             thing that EATS bolts. Keeps the displaced common-rock silhouette.
//   metal   — a mirror: clean-cut icosahedron facets, full metalness, low
//             roughness, high environment response. Bright moving speculars off
//             the PMREM rig say "this reflects". No ore veins — veins are the
//             valuable-mineral language, not the mirror language.
//   diamond — a clear prism: a stretched octahedral shard in MeshPhysicalMaterial
//             transmission glass with pale internal facet inclusions and a faint
//             iridescent film — the splitter reads as optics, not neon.
//   spent   — the same prism burned dark: smoky low-transmission glass, no
//             iridescence, no internal glints. A discharged cell must read dead
//             at the same glance that reads the live one as charged.
//
// Runtime: the sim flips entity.data.opticMaterial (diamond -> spent on
// discharge, spent -> diamond on rekindle) without rebuilding the mesh.
// syncOpticCellSkin() is called from the per-asteroid presentation pass
// (asteroidMotionPresentation.updateAsteroidMotion) — one string compare for
// ordinary rocks, a material swap on the rare transition. Materials and
// geometries are shared cached objects; a swap assigns references, it never
// allocates or compiles a second program per cell.

import * as THREE from 'three';

import { OPTIC_MATERIALS } from '../combat/opticField.js';
import { getReadyRockSurfaceTextures, rockSurfaceVariantSpec } from './rockSurfaceLibrary.js';
import { SHARED_MATERIAL_ROLE, stampSharedMaterialRole } from './sharedMaterialRoles.js';
import { installIllustratedSurface } from './illustratedSurface.js';

export const OPTIC_SKIN_USERDATA_KEY = 'sfOpticSkin';
export const OPTIC_DETAILS_USERDATA_KEY = 'sfOpticDetails';
export const OPTIC_VARIANT_USERDATA_KEY = 'sfOpticVariant';

// ── caches (shared, session-lifetime — same contract as visualFactory's maps) ──
const _opticGeo = new Map();
const _opticMat = new Map();

function noDispose(obj) { obj.dispose = () => {}; return obj; }
function getOpticGeometry(key, build) {
  let g = _opticGeo.get(key);
  if (!g) { g = noDispose(build()); _opticGeo.set(key, g); }
  return g;
}
function getOpticMaterial(key, build) {
  let m = _opticMat.get(key);
  if (!m) { m = noDispose(build()); installIllustratedSurface(m); _opticMat.set(key, m); }
  return m;
}

// deterministic per-entity jitter (same construction as the factory's mulberryLite)
function mulberryLite(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashId(id) {
  let h = 2166136261;
  const s = String(id);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}

/**
 * The optic kind an entity currently carries, or null for non-optic entities.
 * 'spent' is a live OPTIC_MATERIALS row — a dark prism keeps its lattice seat.
 */
export function opticCellKindOf(entity) {
  const id = entity && entity.data && entity.data.opticMaterial;
  return (typeof id === 'string' && OPTIC_MATERIALS[id]) ? id : null;
}

// ── geometry ────────────────────────────────────────────────────────────────
// Stone keeps the authored displaced common-rock body (organic lump). Mirror and
// prism get dedicated silhouettes — silhouette is half of "name the three kinds".

/** Flat-faceted, faintly irregular metal chunk — reads as a cut mirror, not a rock. */
function buildOpticMirrorGeometry() {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.attributes.position;
  const rnd = mulberryLite(0x51f0a7);
  // Subtle hammered offset per distinct vertex so the facets read cut, not CAD-perfect.
  const seen = new Map();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
    let d = seen.get(key);
    if (d == null) { d = 1 + (rnd() - 0.5) * 0.09; seen.set(key, d); }
    v.multiplyScalar(d);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  // Slightly non-uniform: a metal ingot, not a disco ball.
  geo.scale(1.0, 0.84, 1.06);
  geo.computeBoundingSphere();
  return geo;
}

/** Tall four-sided shard — the prism silhouette at top-down range. */
function buildOpticPrismGeometry() {
  const geo = new THREE.OctahedronGeometry(1, 0);
  geo.scale(0.78, 1.42, 0.78);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * The optic body geometry for a kind, or null when the kind keeps the ordinary
 * displaced-asteroid geometry (stone). Caller falls back to astDisplacedGeometry.
 */
export function opticCellGeometry(kind) {
  if (kind === 'metal') return getOpticGeometry('optic:mirror', buildOpticMirrorGeometry);
  if (kind === 'diamond' || kind === 'spent') return getOpticGeometry('optic:prism', buildOpticPrismGeometry);
  return null;
}

// ── body materials ──────────────────────────────────────────────────────────
// One cached material per kind (stone splits by displacement variant so the five
// lattice rocks still carry the per-variant response the pooled rocks get).

function buildOpticStoneMaterial(variantIdx) {
  const surf = getReadyRockSurfaceTextures(); // null until the decode lands — see factory contract
  const spec = rockSurfaceVariantSpec(variantIdx);
  // The authored tint is a dark basalt; the shared maps and vertex colours darken it
  // further, so the base colour starts well up — the multiply must land matte-grey,
  // not void-black (measured on-glass: ~0x96897a read 33–50 lum, under-lit for "name it
  // before firing"; ~0xa89d8b lands the dull lump around 50–65).
  const color = new THREE.Color(0xbdb5a5).multiply(new THREE.Color(spec.tint[0], spec.tint[1], spec.tint[2]));
  return stampSharedMaterialRole(new THREE.MeshStandardMaterial({
    color,
    map: surf ? surf.baseColor : null,
    normalMap: surf ? surf.normal : null,
    normalScale: new THREE.Vector2(spec.normalScale, spec.normalScale),
    aoMap: surf ? surf.orm : null,
    aoMapIntensity: surf ? spec.aoIntensity : 1,
    roughnessMap: surf ? surf.orm : null,
    metalnessMap: surf ? surf.orm : null,
    // The ORM's metal lane rides ~0 on rock; this is the dull absorber, never a sheen.
    roughness: surf ? Math.min(1, spec.roughness + 0.05) : 0.97,
    metalness: surf ? 1 : 0.02,
    vertexColors: !!surf,
    // The absorber carries no self-light — the same "no molten blanket" contract the
    // common-rock material test asserts.
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0,
    envMapIntensity: 0.8,
    flatShading: false,
  }), SHARED_MATERIAL_ROLE.ROCK);
}

function buildOpticMetalMaterial() {
  // The mirror: full metalness, tight roughness, strong environment response so the
  // PMREM rig's warm key/cool rim ride the facets as moving speculars. A whisper of
  // cool emissive keeps the shade side legible before the env bake lands.
  return stampSharedMaterialRole(new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xe8eef6),
    roughness: 0.11,
    metalness: 1.0,
    envMapIntensity: 2.3,
    emissive: new THREE.Color(0x0e1620),
    emissiveIntensity: 0.22,
    flatShading: true,
  }), SHARED_MATERIAL_ROLE.ROCK);
}

function buildOpticDiamondMaterial() {
  // The live prism: transmissive glass with pale internal absorption and a whisper
  // of iridescent film — the "splits light" tell without glow-spam. A faint cool
  // emissive marks it charged; spent turns both off.
  return stampSharedMaterialRole(new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xecfaff),
    roughness: 0.05,
    metalness: 0.0,
    transmission: 0.85,
    ior: 1.52,
    thickness: 1.5,
    attenuationColor: new THREE.Color(0x9fdcff),
    attenuationDistance: 1.7,
    specularIntensity: 1.0,
    clearcoat: 0.55,
    clearcoatRoughness: 0.18,
    iridescence: 0.32,
    iridescenceIOR: 1.9,
    emissive: new THREE.Color(0x8fd8ff),
    emissiveIntensity: 0.16,
    envMapIntensity: 1.2,
    flatShading: true,
  }), SHARED_MATERIAL_ROLE.GLASS);
}

function buildOpticSpentMaterial() {
  // Burned-out glass: same prism family, but smoky and lightless — transmission drops,
  // absorption shortens, the cool emissive and the film are gone. Reads dead, not hidden.
  return stampSharedMaterialRole(new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0x222c37),
    roughness: 0.46,
    metalness: 0.0,
    transmission: 0.26,
    ior: 1.45,
    thickness: 1.1,
    attenuationColor: new THREE.Color(0x0f1820),
    attenuationDistance: 0.65,
    specularIntensity: 0.7,
    clearcoat: 0.3,
    clearcoatRoughness: 0.5,
    emissive: new THREE.Color(0x0a141c),
    emissiveIntensity: 0.05,
    envMapIntensity: 0.55,
    flatShading: true,
  }), SHARED_MATERIAL_ROLE.GLASS);
}

/**
 * The shared body material for an optic kind. `variantIdx` only modulates stone
 * (the other kinds are authored finishes, identical across cells).
 */
export function opticCellBodyMaterial(kind, variantIdx = 0) {
  if (kind === 'stone') {
    const v = Math.abs(variantIdx | 0) % 5;
    // The rock surface library decodes during sector preload; a cell built before that
    // resolves to a plain matte body under a ':bare' key so a later skin sync can swap
    // it for the mapped version without rebuilding the mesh.
    const bare = getReadyRockSurfaceTextures() ? '' : ':bare';
    return getOpticMaterial(`optic:body:stone:v${v}${bare}`, () => buildOpticStoneMaterial(v));
  }
  if (kind === 'metal') return getOpticMaterial('optic:body:metal', buildOpticMetalMaterial);
  if (kind === 'diamond') return getOpticMaterial('optic:body:diamond', buildOpticDiamondMaterial);
  if (kind === 'spent') return getOpticMaterial('optic:body:spent', buildOpticSpentMaterial);
  return null;
}

// ── detail materials (internal facet inclusions, prism kinds only) ───────────

function buildOpticFacetLiveMaterial() {
  // Pale glinting inclusions inside the glass — the internal structure that makes a
  // transmissive shard read as a cut prism rather than a bubble.
  return stampSharedMaterialRole(new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xd8f2ff),
    roughness: 0.12,
    metalness: 0.15,
    emissive: new THREE.Color(0x9fe0ff),
    emissiveIntensity: 0.85,
    envMapIntensity: 0.9,
    flatShading: true,
  }), SHARED_MATERIAL_ROLE.ROCK);
}

function buildOpticFacetDeadMaterial() {
  // Soot-dark dead inclusions: still visible through the smoky shell, never lit.
  return stampSharedMaterialRole(new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x1d242c),
    roughness: 0.8,
    metalness: 0.2,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0,
    envMapIntensity: 0.3,
    flatShading: true,
  }), SHARED_MATERIAL_ROLE.ROCK);
}

/** The detail finish a kind wears on its inclusions, or null when it carries none. */
export function opticCellDetailMaterial(kind) {
  if (kind === 'diamond') return getOpticMaterial('optic:facet:live', buildOpticFacetLiveMaterial);
  if (kind === 'spent') return getOpticMaterial('optic:facet:dead', buildOpticFacetDeadMaterial);
  return null;
}

// ── dressing + skin application ─────────────────────────────────────────────

const OPTIC_INCLUSION_COUNT = 5;

function opticInclusionGeometry() {
  return getOpticGeometry('optic:inclusion', () => new THREE.OctahedronGeometry(0.16, 0));
}

/**
 * Attach the kind's detail children to the BODY mesh (they ride its tumble — the
 * facets are inside the stone, not orbiting it) and stamp the applied skin on the
 * root. Body-local unit space: the body's scale is the entity radius, so positions
 * and scales here are fractions of it.
 */
function dressOpticDetails(root, body, entity, kind) {
  const material = opticCellDetailMaterial(kind);
  const details = [];
  if (material && body && typeof body.add === 'function') {
    const rnd = mulberryLite(hashId(entity && entity.id) ^ 0x9c17);
    for (let i = 0; i < OPTIC_INCLUSION_COUNT; i++) {
      const shard = new THREE.Mesh(opticInclusionGeometry(), material);
      // Interior points of the stretched shard — keep clear of the shell so the
      // inclusions read through the glass, not sticking out of it.
      const a = rnd() * Math.PI * 2;
      const rr = 0.15 + rnd() * 0.32;
      shard.position.set(Math.cos(a) * rr * 0.62, (rnd() - 0.42) * 0.9, Math.sin(a) * rr * 0.62);
      shard.scale.setScalar(0.7 + rnd() * 0.8);
      shard.rotation.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
      shard.userData.spacefaceTags = { greeble: true };
      body.add(shard);
      details.push(shard);
    }
  }
  const ud = root.userData || (root.userData = {});
  ud[OPTIC_DETAILS_USERDATA_KEY] = details;
  return details;
}

/**
 * Stamp a built optic cell root: body material + detail dressing + the applied-kind
 * stamp the runtime sync compares against. Called by the factory at build time.
 * Returns the body material that was applied (for the caller's mesh assignment).
 */
export function applyOpticCellSkin(root, entity) {
  const kind = opticCellKindOf(entity);
  if (!kind || !root) return false;
  const ud = root.userData || (root.userData = {});
  const body = ud.asteroidBody;
  if (!body || !body.isMesh) return false;
  const bodyMaterial = opticCellBodyMaterial(kind, ud[OPTIC_VARIANT_USERDATA_KEY] | 0);
  if (bodyMaterial) body.material = bodyMaterial;
  ud.sfOpticMaterial = bodyMaterial;
  const detailMaterial = opticCellDetailMaterial(kind);
  let details = Array.isArray(ud[OPTIC_DETAILS_USERDATA_KEY]) ? ud[OPTIC_DETAILS_USERDATA_KEY] : null;
  if ((!details || details.length === 0) && detailMaterial) {
    // A prism cell whose mesh was built without its inclusions (e.g. an older root
    // surviving a save restore) dresses late rather than staying bare glass.
    details = dressOpticDetails(root, body, entity, kind);
  }
  if (details && detailMaterial) {
    for (const child of details) {
      if (child && child.isMesh) child.material = detailMaterial;
    }
  }
  ud[OPTIC_SKIN_USERDATA_KEY] = kind;
  return true;
}

/**
 * Build-time: stamp the variant pick, dress the kind's details, and run the same
 * apply path runtime sync uses — one code path from cradle to spend/rekindle.
 * `variantIdx` is the factory's displacement-variant pick — stone reuses it for the
 * per-variant surface response.
 */
export function dressOpticCell(root, body, entity, kind, variantIdx = 0) {
  if (!root || !body) return;
  const ud = root.userData || (root.userData = {});
  ud[OPTIC_VARIANT_USERDATA_KEY] = variantIdx | 0;
  dressOpticDetails(root, body, entity, kind);
  applyOpticCellSkin(root, entity);
}

/**
 * Runtime refresh — the presentation-layer half of spend/rekindle. Compares the
 * entity's live data.opticMaterial (and the currently-resolved body material, so a
 * bare-then-mapped stone upgrades itself) against the stamps on its root. One Map
 * lookup and a string compare per call; ordinary rocks exit at the first null.
 * Returns true when a swap happened.
 */
export function syncOpticCellSkin(entity, root) {
  const kind = opticCellKindOf(entity);
  if (!kind || !root || !root.userData) return false;
  const ud = root.userData;
  const bodyMaterial = opticCellBodyMaterial(kind, ud[OPTIC_VARIANT_USERDATA_KEY] | 0);
  if (ud[OPTIC_SKIN_USERDATA_KEY] === kind && ud.sfOpticMaterial === bodyMaterial) return false;
  return applyOpticCellSkin(root, entity);
}
