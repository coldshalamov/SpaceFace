// Headlamps are lamps, not lights: two small emissive lenses on the bow plus a soft
// additive fan thrown ahead of the nose. No THREE.Light is created — the scene's fixed
// light census (see weaponLights.js / forceLanguage AGENTS) stays exactly as shipped.
// The fan's vertex falloff makes it a minor supporting term to the lens pair, never the
// object itself, and it carries no scrolling or pulse channel. Attached lazily to the
// presented ship root so authored and procedural hulls are covered by the same path.
// +X forward, +Y up, +Z starboard (src/render/ships/AGENTS.md).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const LAMP_COLOR = new THREE.Color(0xfff2d8);   // warm sodium-white lens, hot enough to bloom
const BEAM_COLOR = new THREE.Color(0xcfe4ff);   // cool white sheen thrown ahead of the bow
const LAMP_EMISSIVE = 2.35;                     // above the fixed 1.0 bloom threshold: lamps glow
const BEAM_GAIN = 0.11;                         // faint spill, well under lamp radiance

let lampGeometry = null;
let beamGeometry = null;
let lampMaterial = null;
let beamMaterial = null;

function shared(obj) {
  obj.userData = { ...(obj.userData || {}), spacefaceSharedFallback: true };
  obj.dispose = () => {};
  return obj;
}

function getLampGeometry() {
  if (lampGeometry) return lampGeometry;
  // Paired lenses in one mesh: one draw for the pair. Unit geometry scaled per hull.
  const port = new THREE.SphereGeometry(1, 10, 8);
  port.translate(0, 0, -1);
  const starboard = new THREE.SphereGeometry(1, 10, 8);
  starboard.translate(0, 0, 1);
  lampGeometry = shared(mergeGeometries([port, starboard], false));
  return lampGeometry;
}

function getBeamGeometry() {
  if (beamGeometry) return beamGeometry;
  // A flat fan in the XZ plane: apex at the nose, a mid arc and a tip arc. Vertex colour
  // carries the falloff (bright at the lamp, dark at the reach) so the beam ends in a
  // gradient, never at a mesh edge.
  const midR = 0.52, midSpread = 0.62, tipSpread = 1.0;
  const positions = [0, 0, 0];
  const colors = [1, 1, 1];
  const mid = [];
  for (let i = 0; i <= 4; i++) {
    const a = -midSpread + (2 * midSpread * i) / 4;
    mid.push(positions.length / 3);
    positions.push(Math.cos(a) * midR, 0, Math.sin(a) * midR);
    colors.push(0.30, 0.30, 0.30);
  }
  const tip = [];
  for (let i = 0; i <= 8; i++) {
    const a = -tipSpread + (2 * tipSpread * i) / 8;
    tip.push(positions.length / 3);
    positions.push(Math.cos(a), 0, Math.sin(a));
    colors.push(0, 0, 0);
  }
  const index = [];
  for (let i = 0; i < 4; i++) index.push(0, mid[i], mid[i + 1]);
  for (let i = 0; i < 8; i++) {
    const m0 = Math.min(4, Math.floor((i * 4) / 8));
    const m1 = Math.min(4, m0 + 1);
    index.push(mid[m0], tip[i], mid[m1], mid[m1], tip[i], tip[i + 1]);
  }
  beamGeometry = shared(new THREE.BufferGeometry());
  beamGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  beamGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  beamGeometry.setIndex(index);
  return beamGeometry;
}

function getLampMaterial() {
  if (lampMaterial) return lampMaterial;
  lampMaterial = new THREE.MeshStandardMaterial({
    color: 0x0d1117,
    emissive: LAMP_COLOR,
    emissiveIntensity: LAMP_EMISSIVE,
    roughness: 0.3,
    metalness: 0.1,
  });
  lampMaterial.name = 'SF_Headlamp_Lens';
  return shared(lampMaterial);
}

function getBeamMaterial() {
  if (beamMaterial) return beamMaterial;
  beamMaterial = new THREE.MeshBasicMaterial({
    color: BEAM_COLOR,
    vertexColors: true,
    transparent: true,
    opacity: BEAM_GAIN,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
  beamMaterial.name = 'SF_Headlamp_Beam';
  return shared(beamMaterial);
}

const _bounds = new THREE.Box3();
const _box = new THREE.Box3();
const _inverse = new THREE.Matrix4();

/** Measure the presented hull once, in root-local space, from cached geometry bounds. */
function hullLocalBounds(root, out) {
  out.makeEmpty();
  let walked = 0;
  root.updateWorldMatrix(false, true);
  _inverse.copy(root.matrixWorld).invert();
  root.traverse((object) => {
    if (!object || !object.isMesh || walked > 600) return;
    const geometry = object.geometry;
    if (!geometry) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return;
    walked++;
    _box.copy(geometry.boundingBox).applyMatrix4(object.matrixWorld).applyMatrix4(_inverse);
    out.union(_box);
  });
  return walked > 0 && !out.isEmpty();
}

/**
 * Attach a `GLTFKit_Headlamps` group (lens pair + beam fan) to the presented ship root.
 * Idempotent: the flag lives on the root, so a visual swap re-fits on the new root and a
 * failed fit is not retried every frame. Returns the group or null.
 */
export function attachShipHeadlamps(root, entity) {
  if (!root || !root.userData) return null;
  if (root.userData.__sfHeadlamps !== undefined) return root.userData.__sfHeadlamps || null;
  let group = null;
  try {
    const data = (entity && entity.data) || {};
    const fallbackR = Number.isFinite(entity && entity.radius) && entity.radius > 0
      ? entity.radius * 0.62 : 6;
    const measured = hullLocalBounds(root, _bounds);
    const length = measured ? Math.max(0.1, _bounds.max.x - _bounds.min.x) : fallbackR * 2;
    const nose = measured ? _bounds.max.x : fallbackR;
    // Front slab gives the lamp height and lateral spacing at the actual bow cross-section,
    // not the hull's widest beam.
    const frontLo = nose - length * 0.16;
    let midY = 0, halfZ = Math.max(0.4, length * 0.06), found = false;
    if (measured) {
      const slab = new THREE.Box3().makeEmpty();
      root.traverse((object) => {
        if (!object || !object.isMesh) return;
        const geometry = object.geometry;
        if (!geometry || !geometry.boundingBox) return;
        _box.copy(geometry.boundingBox).applyMatrix4(object.matrixWorld).applyMatrix4(_inverse);
        if (_box.max.x < frontLo) return;
        slab.union(_box); found = true;
      });
      if (found && !slab.isEmpty()) {
        midY = (slab.min.y + slab.max.y) * 0.5;
        halfZ = Math.max(0.2, (slab.max.z - slab.min.z) * 0.5);
      }
    }
    const radius = Math.max(0.5, fallbackR);
    group = new THREE.Group();
    group.name = 'GLTFKit_Headlamps';
    group.userData.spacefaceTags = { damageRole: 'navLight' };
    const lampScale = Math.min(Math.max(length * 0.012, 0.05), 0.42);
    const lampZ = Math.min(Math.max(halfZ * 0.42, lampScale * 1.6), halfZ * 0.8);
    const lamps = new THREE.Mesh(getLampGeometry(), getLampMaterial());
    lamps.name = 'GLTFKit_Headlamp_Lenses';
    lamps.scale.set(lampScale, lampScale * 0.8, lampZ);
    lamps.position.set(nose - lampScale * 0.5, midY, 0);
    const beamLen = Math.min(Math.max(length * 1.15, radius * 1.2), 42);
    const beam = new THREE.Mesh(getBeamGeometry(), getBeamMaterial());
    beam.name = 'GLTFKit_Headlamp_Beam';
    beam.scale.set(beamLen, 1, Math.min(Math.max(length * 0.30, 1.2), 9));
    beam.position.set(nose + beamLen * 0.02, midY, 0);
    for (const mesh of [lamps, beam]) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.keepSeparate = true;
      mesh.userData.spacefaceNoShadow = true;
      mesh.userData.damageRole = 'navLight';
      mesh.userData.spacefaceTags = { damageRole: 'navLight' };
      group.add(mesh);
    }
    beam.renderOrder = 15;
    root.add(group);
  } catch (_) {
    group = null; // a hull that cannot be measured flies without lamps, never broken
  }
  root.userData.__sfHeadlamps = group || false;
  return group;
}
