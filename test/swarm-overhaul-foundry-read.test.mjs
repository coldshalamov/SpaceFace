// Swarm residual readability contracts outside the Perf Lane.
// Hostile hulls wear no 2D threat plate (owner 2026-11-23: no rings around ships; the boss reads by
// its size and the boss bar, the player's target by the HUD lock bracket) — see look-threat-plates.
// Foundry room solids are dark furniture. The generic station (white greeble, rings, blinkers)
// read as a geodesic sitting on the pilot.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { ARENA_PALETTE } from '../src/render/arenaFinish.js';
import { foundryFurnitureProxy, foundryFurnitureShape } from '../src/data/foundryFurniture.js';

function foundry(kind, radius = 16) {
  const vf = createVisualFactory();
  const root = vf.build({
    id: `survival-room-${kind}`,
    type: 'station',
    radius,
    data: { roomOwner: 'survival-arena', roomKind: kind },
  });
  assert.ok(root && root.isObject3D, `${kind} builds`);
  return root;
}

function meshesOf(root) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  return meshes;
}

/** Per-triangle paint and facing. Every deck helper paints one flat colour per face. */
function paintedFaces(geometry) {
  const pos = geometry.getAttribute('position');
  const col = geometry.getAttribute('color');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const faces = [];
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize();
    const hex = new THREE.Color(col.getX(i), col.getY(i), col.getZ(i)).getHex();
    const r = (hex >> 16 & 255) / 255;
    const g = (hex >> 8 & 255) / 255;
    const bl = (hex & 255) / 255;
    faces.push({
      normalY: normal.y,
      hex,
      luma: 0.2126 * r + 0.7152 * g + 0.0722 * bl,
    });
  }
  return faces;
}

function shareOf(faces, predicate) {
  return faces.filter(predicate).length / Math.max(1, faces.length);
}

test('a foundry room solid is dark furniture, not a lit station', () => {
  const kinds = {
    // X1: the bank plate is one vertex-coloured steel deck (value lives in the colour
    // attribute, not the base colour); the animated/solid furniture is a machined box or
    // cylinder with one small work lamp at most, never a lit station. Gate/block/shutter carry
    // the same three-value deck in their one body mesh (X1 third review).
    plate: { color: 0xffffff, geo: 'BufferGeometry', vertexColors: true, roughness: 0.72, metalness: 0.38 },
    gate: { color: 0xffffff, geo: 'BufferGeometry', vertexColors: true, roughness: 0.82, metalness: 0.18 },
    furnace: { color: 0x3a2418, geo: 'ExtrudeGeometry' },
    crate: { color: 0xffffff, geo: 'BufferGeometry', vertexColors: true, roughness: 0.82, metalness: 0.18 },
  };
  for (const [kind, expect] of Object.entries(kinds)) {
    const root = foundry(kind);
    assert.equal(root.userData.roomToy, kind);
    assert.equal(root.userData.kind, 'station');
    assert.equal(root.userData.hlodAttached, true);
    const meshes = meshesOf(root);
    assert.ok(meshes.length >= 1 && meshes.length <= 2, `${kind} stays a couple of solids`);
    let sawBody = false;
    let sawMouth = false;
    let lamps = 0;
    let lampMesh = null;
    for (const mesh of meshes) {
      assert.equal(mesh.isSprite, undefined);
      assert.equal(mesh.isPoints, undefined);
      const mat = mesh.material;
      assert.ok(!Array.isArray(mat));
      assert.notEqual(mat.blending, THREE.AdditiveBlending);
      assert.equal(mat.transparent, false);
      assert.equal(mat.type === 'ShaderMaterial', false);
      assert.equal(mesh.geometry.type === 'TorusGeometry', false, `${kind} has no ring`);
      assert.equal(mesh.geometry.type === 'SphereGeometry', false, `${kind} has no blinker lens`);
      assert.equal(mesh.geometry.type === 'IcosahedronGeometry', false);
      assert.equal(mesh.userData.blink, undefined);
      // X1 §3.4: a working prop may carry one real lamp; it is not the body's value.
      if (mat.name === 'sf-arena-lamp') {
        lamps += 1;
        lampMesh = mesh;
        assert.notEqual(mat.emissive.getHex(), 0, `${kind} lamp is a real emitter`);
        continue;
      }
      const bright = mat.color.r > 0.75 && mat.color.g > 0.75 && mat.color.b > 0.75;
      assert.equal(bright && mat.vertexColors !== true, false, `${kind} material stays off white`);
      if (mat.isMeshStandardMaterial) {
        sawBody = true;
        if (expect.vertexColors) {
          // White base colour is the vertex-colour carrier; the authored deck paint must
          // still stay below a lit white surface.
          assert.equal(mat.vertexColors, true);
          assert.equal(mat.roughness, expect.roughness);
          assert.equal(mat.metalness, expect.metalness);
          const colors = mesh.geometry.getAttribute('color');
          assert.ok(colors && colors.count > 0, `${kind} carries its value in the colour attribute`);
          // Only the lamp lens bar may read as a bright surface; every other band is paint.
          let brightVertices = 0;
          for (let i = 0; i < colors.count; i++) {
            const peak = Math.max(colors.getX(i), colors.getY(i), colors.getZ(i));
            if (peak > 0.78) brightVertices++;
          }
          assert.ok(brightVertices / colors.count <= 0.15,
            `${kind} deck paint stays below a lit white surface (lens only)`);
          if (kind !== 'plate') {
            // X1 final review: a whole-geometry distinct count also passed when the gate's visible
            // side was ONE value and only the caps supplied the third. Assert the share each value
            // owns on the surfaces the camera can see.
            const faces = paintedFaces(mesh.geometry);
            const side = faces.filter((f) => Math.abs(f.normalY) <= 0.55);
            const top = faces.filter((f) => f.normalY > 0.55);
            const bottom = faces.filter((f) => f.normalY < -0.55);
            if (kind === 'gate') {
              const hexOf = (value) => new THREE.Color(value).getHex();
              const bands = {
                light: hexOf(ARENA_PALETTE.light),
                mid: hexOf(ARENA_PALETTE.mid),
                dark: hexOf(ARENA_PALETTE.dark),
              };
              assert.ok(side.length >= 12, `${kind} has a real side surface`);
              for (const [name, hex] of Object.entries(bands)) {
                const share = shareOf(side, (f) => f.hex === hex);
                assert.ok(share >= 0.2,
                  `${kind} visible side ${name} band covers ${(share * 100).toFixed(0)}%; all three values must read on the side`);
              }
              assert.ok(shareOf(top, (f) => f.hex === bands.light) >= 0.9,
                `${kind} cap is the light value`);
              assert.ok(shareOf(bottom, (f) => f.hex === bands.dark) >= 0.9,
                `${kind} base is the dark value`);
            } else {
              // The block/shutter wear the bank deck in one body: the top carries light panels,
              // mid clamp rails and the dark recessed channel; the sides stay dark mechanical.
              const band = (f) => (f.luma >= 0.55 ? 'light' : f.luma >= 0.32 ? 'mid' : 'dark');
              for (const name of ['light', 'mid', 'dark']) {
                const share = shareOf(top, (f) => band(f) === name);
                assert.ok(share >= 0.05,
                  `${kind} top ${name} share is ${(share * 100).toFixed(0)}%; the deck must read all three values`);
              }
              assert.ok(shareOf(side, (f) => band(f) === 'dark') >= 0.6,
                `${kind} side wall is dominated by the dark mechanical value`);
              assert.ok(shareOf(side, (f) => band(f) === 'light') <= 0.4,
                `${kind} side wall never turns into a light card; the light chamfer is an edge, not the wall`);
            }
          }
        } else {
          assert.equal(mat.color.getHex(), expect.color);
          assert.equal(mat.roughness, 0.94);
          assert.equal(mat.metalness, 0.06);
          if (kind === 'furnace') assert.equal(mat.emissiveIntensity, 0.16);
          else assert.equal(mat.emissiveIntensity, 0);
        }
        assert.equal(mesh.geometry.type, expect.geo);
      }
      if (mat.isMeshBasicMaterial) {
        sawMouth = true;
        assert.equal(kind, 'furnace');
        assert.equal(mat.color.getHex(), 0x6a3014);
        assert.equal(mat.depthWrite, true);
      }
    }
    assert.ok(lamps <= 1, `${kind} carries at most one work lamp`);
    assert.equal(sawBody, true, `${kind} has a matte body`);
    assert.equal(sawMouth, kind === 'furnace');
    if (kind === 'gate' || kind === 'crate') {
      assert.ok(lampMesh, `${kind} has a real work lamp`);
      const bodyMesh = meshes.find((m) => m.material.name !== 'sf-arena-lamp');
      const bodyBox = new THREE.Box3().setFromObject(bodyMesh);
      const lampBox = new THREE.Box3().setFromObject(lampMesh);
      assert.ok(lampBox.max.y > bodyBox.max.y + 0.05,
        `${kind} lamp must read above the deck, not be buried in the body`);
    }
  }
});

test('the gate lamp sits inside the hex contact polygon, not merely inside its AABB', () => {
  const radius = 16;
  const entity = {
    id: 'survival-room-gate', type: 'station', radius,
    data: { roomOwner: 'survival-arena', roomKind: 'gate' },
  };
  const root = createVisualFactory().build(entity);
  const proxy = foundryFurnitureProxy(entity);
  assert.equal(proxy?.id, 'foundry:furniture-gate');
  const lamp = root.getObjectByName('sf-arena-lamp');
  assert.ok(lamp, 'the gate carries its work lamp');
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(lamp);
  const hull = proxy.compactHull.map((p) => ({ x: p.x * radius, z: p.z * radius }));
  const inside = (x, z) => {
    let hit = false;
    for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) {
      const a = hull[i], b = hull[j];
      if ((a.z > z) !== (b.z > z)
        && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) hit = !hit;
    }
    return hit;
  };
  for (const [x, z] of [
    [box.min.x, box.min.z], [box.min.x, box.max.z],
    [box.max.x, box.min.z], [box.max.x, box.max.z],
  ]) {
    assert.ok(inside(x, z), `gate lamp corner ${x.toFixed(2)},${z.toFixed(2)} leaves the hex`);
  }
  const shape = foundryFurnitureShape(entity);
  // The cap lamp may sit slightly proud of the top face; the contact contract is the planar hex.
  assert.ok(box.max.y <= shape.body.height * shape.scale / 2 + 0.35,
    'gate lamp housing stays on the post cap, not floating above it');
});
