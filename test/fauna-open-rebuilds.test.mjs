import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { buildFaunaMesh } from '../src/render/faunaVisuals.js';
import { preloadCreatureSkinLibrary } from '../src/render/creatureSkinLibrary.js';
import { disposeObjectNode } from '../src/render/renderer.js';

const REBUILT_SPECIES = [
  'anchor_beast',
  'archive_crab',
  'black_sail',
  'blind_shepherd',
  'bristle_ram',
  'glassback',
  'hull_leech',
  'mourning_kite',
  'needle_swarm',
];

function makeEntity(speciesId, strainId = 'charon_grave', driveState = 'drift') {
  return {
    id: 5000,
    type: 'fauna',
    alive: true,
    data: {
      strainId,
      ecology: { speciesId, driveState },
    },
  };
}

function assertMeshGeometryContract(mesh, label) {
  const g = mesh.geometry;
  assert.ok(g && g.index, `${label} must use indexed BufferGeometry`);
  assert.equal(g.userData.spacefaceSharedAsset, true, `${label} caches shared geometry`);
  const pos = g.attributes.position;
  const norm = g.attributes.normal;
  const uv = g.attributes.uv;
  assert.ok(pos && norm && uv, `${label} has position, normal, and uv attributes`);
  assert.equal(norm.count, pos.count, `${label} normal count matches position count`);
  assert.equal(uv.count, pos.count, `${label} uv count matches position count`);
  for (const attr of [pos, norm, uv]) {
    assert.ok([...attr.array].every(Number.isFinite), `${label} attributes stay finite`);
  }
  for (let i = 0; i < pos.count; i += 1) {
    const nLen = Math.hypot(norm.getX(i), norm.getY(i), norm.getZ(i));
    assert.ok(Math.abs(nLen - 1) < 1e-4, `${label} unit normal at ${i}`);
  }
  for (let i = 0; i < uv.count; i += 1) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    assert.ok(u >= -1e-5 && u <= 1 + 1e-5 && v >= -1e-5 && v <= 1 + 1e-5, `${label} UV in [0,1]`);
  }
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const avgN = new THREE.Vector3();
  let volume = 0;
  for (let i = 0; i < g.index.count; i += 3) {
    const ia = g.index.getX(i);
    const ib = g.index.getX(i + 1);
    const ic = g.index.getX(i + 2);
    a.fromBufferAttribute(pos, ia);
    b.fromBufferAttribute(pos, ib);
    c.fromBufferAttribute(pos, ic);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    const face = ab.clone().cross(ac);
    assert.ok(face.length() > 1e-9, `${label} face ${i / 3} is non-collapsed`);
    volume += a.dot(b.clone().cross(c)) / 6;
    avgN.set(0, 0, 0);
    for (const idx of [ia, ib, ic]) {
      avgN.x += norm.getX(idx);
      avgN.y += norm.getY(idx);
      avgN.z += norm.getZ(idx);
    }
    assert.ok(face.dot(avgN) > 0, `${label} face ${i / 3} is wound outward`);
    const uvArea = (uv.getX(ib) - uv.getX(ia)) * (uv.getY(ic) - uv.getY(ia))
      - (uv.getY(ib) - uv.getY(ia)) * (uv.getX(ic) - uv.getX(ia));
    assert.ok(Math.abs(uvArea) > 1e-8, `${label} UV triangle ${i / 3} is non-collapsed`);
  }
  assert.ok(volume > 0.01, `${label} encloses positive volume (${volume})`);
}

test('rebuilt open-water fauna use closed outward folded geometry and restrained glow', async () => {
  const skins = await preloadCreatureSkinLibrary(null, { loadTexture: async () => new THREE.Texture() });
  for (const speciesId of REBUILT_SPECIES) {
    const root = buildFaunaMesh(makeEntity(speciesId));
    assert.ok(root && root.children.length >= 3, `${speciesId} has multi-part folded volume`);
    const seenGeos = new Set();
    let tissueMeshes = 0;
    for (const child of root.children) {
      assert.ok(child.isMesh);
      if (!seenGeos.has(child.geometry)) {
        seenGeos.add(child.geometry);
        assertMeshGeometryContract(child, `${speciesId}:${child.name}`);
      }
      if (child.material.map === skins.tissue.baseColor) {
        tissueMeshes += 1;
        assert.equal(child.material.normalMap, skins.tissue.normal, `${speciesId} binds normalMap`);
      }
      // Restrained glow: no bare glaring orbs above 0.70 base emissiveIntensity.
      if (child.material.color.getHex() === 0x1c1410) {
        assert.ok(child.material.emissiveIntensity <= 0.70,
          `${speciesId}:${child.name} restrained glow (${child.material.emissiveIntensity})`);
      }
    }
    assert.ok(tissueMeshes >= 1, `${speciesId} wears tissue skin`);
  }
});

test('rebuilt open-water fauna preserve silhouette invariants and close-view framing', () => {
  const TILT = 60 * Math.PI / 180;
  const sinT = Math.sin(TILT);
  const cosT = Math.cos(TILT);

  for (const speciesId of REBUILT_SPECIES) {
    const root = buildFaunaMesh(makeEntity(speciesId));
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const cropHalfH = 0.62 * Math.max(sphere.radius * 2.2, 6) * Math.tan(25 * Math.PI / 180);
    let maxProjY = 0;
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const pos = obj.geometry.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
        const py = Math.abs(cosT * (v.y - sphere.center.y) + sinT * v.z);
        if (py > maxProjY) maxProjY = py;
      }
    });
    assert.ok(maxProjY <= cropHalfH * 0.96,
      `${speciesId} fits inside close crop (${maxProjY.toFixed(2)} <= ${(cropHalfH * 0.96).toFixed(2)})`);
  }

  // Blind shepherd: outer torus skirt extends clearly beyond central shell.
  const shepherd = buildFaunaMesh(makeEntity('blind_shepherd'));
  const shellBox = new THREE.Box3().setFromObject(shepherd.getObjectByName('bs_shell'));
  const skirtBox = new THREE.Box3().setFromObject(shepherd.getObjectByName('bs_skirt'));
  assert.ok(skirtBox.getSize(new THREE.Vector3()).x > shellBox.getSize(new THREE.Vector3()).x * 1.4,
    'blind_shepherd bs_skirt extends well outside bs_shell');

  // Archive crab: plates are folded 3D volumes (not 12-tri BoxGeometry cards).
  const crab = buildFaunaMesh(makeEntity('archive_crab'));
  const plate = crab.getObjectByName('ac_plate');
  assert.ok(plate.geometry.index.count / 3 > 100, 'archive_crab plates are sculpted 3D shells');

  // Black sail: real volume & width, never a 0.06 razor card.
  const sail = buildFaunaMesh(makeEntity('black_sail'));
  const sailSize = new THREE.Box3().setFromObject(sail).getSize(new THREE.Vector3());
  assert.ok(sailSize.x > 12 && sailSize.y > 6 && sailSize.z > 10, 'black_sail has full 3D membrane billow');
});

test('rebuilt open-water fauna isolate per-creature material disposal and survive motion updates', () => {
  for (const speciesId of REBUILT_SPECIES) {
    const eA = makeEntity(speciesId, 'ashfall_choir', 'drift');
    const eB = makeEntity(speciesId, 'veil_glass', 'drift');
    const a = buildFaunaMesh(eA);
    const b = buildFaunaMesh(eB);
    const matsA = new Set(a.children.map((c) => c.material));
    const matsB = new Set(b.children.map((c) => c.material));
    assert.ok([...matsA].every((m) => !matsB.has(m)), `${speciesId} keeps creature-private materials`);

    const disposals = new Map([...matsA].map((m) => [m, 0]));
    for (const m of matsA) m.addEventListener('dispose', () => disposals.set(m, disposals.get(m) + 1));
    let otherDisposals = 0;
    for (const m of matsB) m.addEventListener('dispose', () => { otherDisposals += 1; });

    for (const drive of ['drift', 'charge', 'flee']) {
      for (const reducedMotion of [false, true]) {
        eA.data.ecology.driveState = drive;
        a.userData.updateAuthoredMotion(eA, 1.3, { reducedMotion, reducedFlash: reducedMotion });
        a.updateMatrixWorld(true);
        assert.ok(a.matrixWorld.elements.every(Number.isFinite), `${speciesId} finite transform in ${drive}`);
      }
    }

    a.traverse((node) => disposeObjectNode(node));
    for (const [m, count] of disposals) {
      assert.equal(count, 1, `${speciesId} material ${m.name || 'unnamed'} disposes once`);
    }
    assert.equal(otherDisposals, 0, `${speciesId} does not dispose sibling materials`);
  }
});
