import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { bolusSilhouette } from '../src/render/bolusSilhouettes.js';
import { buildFaunaMesh } from '../src/render/faunaVisuals.js';
import { preloadCreatureSkinLibrary } from '../src/render/creatureSkinLibrary.js';
import { disposeObjectNode } from '../src/render/renderer.js';

const TARGET_BOLUS_SPECIES = [
  'bolus_drum',
  'bolus_frenum',
  'bolus_hairball',
  'bolus_hauler',
  'bolus_hush',
  'bolus_knob',
  'bolus_lantern',
  'bolus_lip',
  'bolus_louse',
  'bolus_mite',
  'bolus_suture',
  'bolus_tendon',
  'bolus_tendril',
  'bolus_tooth',
  'bolus_uvula',
  'bolus_valve',
];

function makeEntity(speciesId, driveState = 'drift') {
  return {
    id: 9100,
    type: 'fauna',
    alive: true,
    data: {
      strainId: 'charon_grave',
      ecology: { speciesId, driveState },
    },
  };
}

function posKey(x, y, z) {
  return `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
}

function assertClosedOutwardPart(part, label) {
  assert.ok(Array.isArray(part.indices) && part.indices.length >= 12, `${label} is indexed`);
  assert.ok(Array.isArray(part.uvs) && part.uvs.length === (part.positions.length / 3) * 2, `${label} has UVs`);
  assert.ok(Array.isArray(part.normals) && part.normals.length === part.positions.length, `${label} has normals`);
  assert.notEqual(part.doubleSided, true, `${label} closed volume stays FrontSide`);
  if (part.glow) {
    assert.ok(part.emissiveIntensity <= 0.7, `${label} glow stays restrained (${part.emissiveIntensity})`);
  }

  const pts = [];
  for (let i = 0; i < part.positions.length; i += 3) {
    pts.push([part.positions[i], part.positions[i + 1], part.positions[i + 2]]);
    const nx = part.normals[i];
    const ny = part.normals[i + 1];
    const nz = part.normals[i + 2];
    assert.ok(Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz), `${label} finite normals`);
    assert.ok(Math.abs(Math.hypot(nx, ny, nz) - 1) < 1e-5, `${label} unit normals`);
  }
  for (let i = 0; i < part.uvs.length; i += 1) {
    assert.ok(Number.isFinite(part.uvs[i]) && part.uvs[i] >= -1e-5 && part.uvs[i] <= 1 + 1e-5, `${label} UV in [0,1]`);
  }

  let volume = 0;
  const edges = new Map();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const avg = new THREE.Vector3();

  for (let i = 0; i < part.indices.length; i += 3) {
    const ia = part.indices[i];
    const ib = part.indices[i + 1];
    const ic = part.indices[i + 2];
    a.set(...pts[ia]);
    b.set(...pts[ib]);
    c.set(...pts[ic]);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    const face = ab.clone().cross(ac);
    assert.ok(face.length() > 1e-8, `${label} face ${i / 3} non-collapsed`);
    volume += a.dot(b.clone().cross(c)) / 6;
    avg.set(0, 0, 0);
    for (const idx of [ia, ib, ic]) {
      avg.x += part.normals[idx * 3];
      avg.y += part.normals[idx * 3 + 1];
      avg.z += part.normals[idx * 3 + 2];
    }
    assert.ok(face.dot(avg) > 0, `${label} face ${i / 3} wound outward`);
    const uvArea = Math.abs(
      (part.uvs[ib * 2] - part.uvs[ia * 2]) * (part.uvs[ic * 2 + 1] - part.uvs[ia * 2 + 1])
      - (part.uvs[ib * 2 + 1] - part.uvs[ia * 2 + 1]) * (part.uvs[ic * 2] - part.uvs[ia * 2]),
    );
    assert.ok(uvArea > 1e-8, `${label} UV triangle ${i / 3} non-collapsed`);
    const tri = [ia, ib, ic];
    for (let k = 0; k < 3; k += 1) {
      const k1 = posKey(...pts[tri[k]]);
      const k2 = posKey(...pts[tri[(k + 1) % 3]]);
      const ek = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
      edges.set(ek, (edges.get(ek) || 0) + 1);
    }
  }

  assert.ok(volume > 1e-4, `${label} encloses positive volume (${volume})`);
  assert.ok([...edges.values()].every((count) => count === 2), `${label} is closed 2-manifold`);
}

test('all 16 rebuilt Bolus inner fauna use closed outward folded volumes, tissue skins, and restrained glow', async () => {
  const skins = await preloadCreatureSkinLibrary(null, { loadTexture: async () => new THREE.Texture() });
  for (const speciesId of TARGET_BOLUS_SPECIES) {
    const recipe = bolusSilhouette(speciesId);
    assert.ok(recipe.parts.length >= 1, `${speciesId} has parts`);
    for (const part of recipe.parts) {
      assertClosedOutwardPart(part, `${speciesId}:${part.id}`);
    }

    const root = buildFaunaMesh(makeEntity(speciesId));
    assert.equal(root.children.length, recipe.parts.length);
    let tissueMeshes = 0;
    for (const child of root.children) {
      assert.equal(child.material.side, THREE.FrontSide, `${speciesId}:${child.name} FrontSide`);
      if (child.material.map === skins.tissue.baseColor) {
        tissueMeshes += 1;
        assert.equal(child.material.normalMap, skins.tissue.normal, `${speciesId}:${child.name} binds normalMap`);
      } else {
        assert.ok(child.material.emissiveIntensity <= 0.7, `${speciesId}:${child.name} glow <= 0.7`);
      }
    }
    assert.ok(tissueMeshes >= 1, `${speciesId} wears tissue skin`);
  }
});

test('all 16 rebuilt Bolus inner fauna fit 60-degree close crops and isolate motion/disposal', () => {
  const TILT = 60 * Math.PI / 180;
  const sinT = Math.sin(TILT);
  const cosT = Math.cos(TILT);

  for (const speciesId of TARGET_BOLUS_SPECIES) {
    const entA = makeEntity(speciesId, 'drift');
    const entB = makeEntity(speciesId, 'drift');
    const rootA = buildFaunaMesh(entA);
    const rootB = buildFaunaMesh(entB);
    rootA.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(rootA);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const cropHalfH = 0.62 * Math.max(sphere.radius * 2.2, 6) * Math.tan(25 * Math.PI / 180);
    let maxProjY = 0;
    rootA.traverse((obj) => {
      if (!obj.isMesh) return;
      const pos = obj.geometry.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
        const py = Math.abs(cosT * (v.y - sphere.center.y) + sinT * (v.z - sphere.center.z));
        if (py > maxProjY) maxProjY = py;
      }
    });
    assert.ok(
      maxProjY <= cropHalfH * 0.96,
      `${speciesId} fits close crop (${maxProjY.toFixed(2)} <= ${(cropHalfH * 0.96).toFixed(2)})`,
    );

    const matsA = new Set(rootA.children.map((c) => c.material));
    const matsB = new Set(rootB.children.map((c) => c.material));
    assert.ok([...matsA].every((m) => !matsB.has(m)), `${speciesId} keeps creature-private materials`);

    const disposals = new Map([...matsA].map((m) => [m, 0]));
    for (const m of matsA) m.addEventListener('dispose', () => disposals.set(m, disposals.get(m) + 1));
    let otherDisposals = 0;
    for (const m of matsB) m.addEventListener('dispose', () => { otherDisposals += 1; });

    for (const drive of ['drift', 'charge', 'flee']) {
      for (const reducedMotion of [false, true]) {
        entA.data.ecology.driveState = drive;
        rootA.userData.updateAuthoredMotion(entA, 1.3, { reducedMotion, reducedFlash: reducedMotion });
        rootA.updateMatrixWorld(true);
        assert.ok(rootA.matrixWorld.elements.every(Number.isFinite), `${speciesId} finite transform in ${drive}`);
      }
    }

    rootA.traverse((node) => disposeObjectNode(node));
    for (const [, count] of disposals) assert.equal(count, 1, `${speciesId} disposes owned materials once`);
    assert.equal(otherDisposals, 0, `${speciesId} preserves sibling materials`);
  }
});
