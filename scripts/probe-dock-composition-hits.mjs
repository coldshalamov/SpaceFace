#!/usr/bin/env node
/**
 * Scratch diagnostic: which dock primitives occlude which ship-vertex samples
 * in the Shipworks composition check? Not a gate — evidence for sizing the fix.
 */

import { NodeIO } from '@gltf-transform/core';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { dockTransformForShipBounds } from '../src/ui/shipPreviewMount.js';

const DOCK = resolve(process.env.DOCK_GLB || 'assets/ships/parts/places/place_dock_interior.glb');
const SAMPLE_LIMIT = 1200;

function makeStubCanvas() {
  const context = {
    canvas: { width: 256, height: 256 },
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
    bezierCurveTo() {}, quadraticCurveTo() {}, fill() {}, stroke() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createImageData(w, h) { return { data: new Uint8ClampedArray((w || 1) * (h || 1) * 4), width: w, height: h }; },
    putImageData() {}, drawImage() {}, measureText: () => ({ width: 10 }),
    fillStyle: '', strokeStyle: '', font: '', lineWidth: 1, globalAlpha: 1,
  };
  return {
    width: 256, height: 256, getContext: () => context, style: {},
    toDataURL: () => 'data:,', addEventListener() {}, removeEventListener() {},
  };
}

if (!globalThis.document) {
  globalThis.document = {
    createElement: (tag) => (tag === 'canvas' ? makeStubCanvas()
      : { style: {}, appendChild() {}, addEventListener() {} }),
    getElementById: () => null,
    addEventListener() {},
  };
}
if (!globalThis.window) globalThis.window = { addEventListener() {}, devicePixelRatio: 1 };
globalThis.__SF_VISUAL_FACTORY_THROW__ = true;

const { createVisualFactory } = await import('../src/render/visualFactory.js');
const { buildKestrelHero } = await import('../src/render/ships/kestrelHero.js');
const { SHIPS } = await import('../src/data/ships.js');

const PREVIEW_ONLY = /Ship_Shield_Bubble|GLTFKit_Nav_Lights/;
function isPreviewOnly(o) {
  const tags = o?.userData?.spacefaceTags || {};
  return !!(o?.isSprite || PREVIEW_ONLY.test(o?.name || '')
    || tags.vfxRole || tags.damageRole === 'navLight');
}

const io = new NodeIO();
const dockDoc = await io.read(DOCK);
const dockMeta = dockDoc.getRoot().getAsset()?.extras?.spacefaceAsset || {};
const dock = new THREE.Group();
for (const node of dockDoc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
  const finShift = Number(process.env.FIN_SHIFT_X || 0);
  const finDrop = process.env.FIN_DROP === '1';
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.getArray().slice(), 3, pos.getNormalized()));
    const idx = prim.getIndices();
    if (idx) g.setIndex(new THREE.BufferAttribute(idx.getArray().slice(), 1));
    const obj = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    obj.name = `${node.getName() || 'Dock'}#${prim.getMaterial()?.getName() || 'mat'}`;
    obj.matrix.copy(matrix);
    if (/VitreousCeramic/.test(obj.name)) {
      if (finDrop) continue;
      if (finShift) obj.matrix.multiply(new THREE.Matrix4().makeTranslation(finShift, 0, 0));
    }
    obj.matrixAutoUpdate = false;
    dock.add(obj);
  }
}
dock.updateWorldMatrix(true, true);
const dockBounds = new THREE.Box3().setFromObject(dock);
console.log('dock bounds min', dockBounds.min.toArray().map((v) => v.toFixed(2)),
  'max', dockBounds.max.toArray().map((v) => v.toFixed(2)));
console.log('previewMount meta', JSON.stringify(dockMeta.previewMount || {}));

const factory = createVisualFactory();
const reps = [
  { id: 'kestrel_fallback', defId: 'ship_kestrel', builder: (e) => buildKestrelHero(e) },
  { id: 'bastion_fallback', defId: 'ship_bastion', builder: (e) => factory.build(e) },
  { id: 'kestrel_authored', defId: 'ship_kestrel', source: resolve(process.env.KESTREL_GLB || 'assets/ships/parts/wholeships/kestrel.glb') },
];

for (const rep of reps) {
  const def = SHIPS.find((s) => s.id === rep.defId);
  let root;
  if (rep.source) {
    const doc = await io.read(rep.source);
    root = new THREE.Group();
    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh();
      const name = node.getName() || '';
      const extras = node.getExtras() || {};
      if (!mesh || /^COLLISION(?:_|$)/i.test(name) || extras.nonRender === true) continue;
      const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        if (!pos) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos.getArray().slice(), 3, pos.getNormalized()));
        const idx = prim.getIndices();
        if (idx) g.setIndex(new THREE.BufferAttribute(idx.getArray().slice(), 1));
        const obj = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
        obj.matrix.copy(matrix); obj.matrixAutoUpdate = false;
        root.add(obj);
      }
    }
  } else {
    const entity = {
      id: 'probe', type: 'ship', team: 0, isPlayer: rep.defId === 'ship_kestrel',
      radius: def.collisionRadius, pos: { x: 0, z: 0 }, rot: 0,
      prevPos: { x: 0, z: 0 }, prevRot: 0, bank: 0,
      data: { defId: def.id, fittings: [], weapons: [], miningBeam: null },
    };
    root = rep.builder(entity);
  }
  root.updateWorldMatrix(true, true);

  const box = new THREE.Box3().makeEmpty();
  const points = [];
  const ob = new THREE.Box3(); const p = new THREE.Vector3();
  root.traverse((o) => {
    if (!o?.geometry || isPreviewOnly(o)) return;
    const pos = o.geometry.getAttribute?.('position');
    if (!pos) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    ob.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(ob);
    for (let i = 0; i < pos.count; i += 1) {
      p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      points.push(p.clone());
    }
  });
  const stride = Math.max(1, Math.floor(points.length / SAMPLE_LIMIT));
  const samples = points.filter((_v, i) => i % stride === 0).slice(0, SAMPLE_LIMIT);

  const scaleBump = Number(process.env.SCALE_BUMP || 1);
  const t = dockTransformForShipBounds(box, dockMeta, {
    min: dockBounds.min.toArray(), max: dockBounds.max.toArray(),
  });
  const localDock = dock.clone();
  localDock.scale.setScalar(t.scale * scaleBump);
  const posDz = Number(process.env.POS_DZ || 0);
  const posDy = Number(process.env.POS_DY || 0);
  const posDx = Number(process.env.POS_DX || 0);
  localDock.position.set(
    t.position.x + posDx,
    t.floorWorldY - t.floorLocalY * t.scale * scaleBump + posDy,
    t.position.z + posDz,
  );
  localDock.updateWorldMatrix(true, true);

  const size = box.getSize(new THREE.Vector3());
  const radius = size.length() * 0.5;
  const distance = radius * 2.85;
  const camera = new THREE.Vector3(
    t.position.x + 0 - distance * 0.42,
    t.position.y + (t.floorLocalY * t.scale) + t.floorWorldY - t.position.y + distance * 0.38,
    t.position.z + distance * 0.72,
  );
  // camera per the check: relative to placement center (ship box center)
  const center = box.getCenter(new THREE.Vector3());
  camera.set(center.x - distance * 0.42, center.y + distance * 0.38, center.z + distance * 0.72);

  console.log(`\n=== ${rep.id} span ${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)} dockScale ${t.scale.toFixed(2)} floorClear ${t.floorClearance.toFixed(2)}`);
  for (const yaw of [0, 45, 90]) {
    const rot = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(yaw));
    const hitByNode = new Map();
    const hitPoints = new THREE.Box3().makeEmpty();
    let hits = 0;
    for (const sp of samples) {
      const target = sp.clone().applyMatrix4(rot);
      const delta = target.clone().sub(camera);
      const far = delta.length();
      const xs = new THREE.Raycaster(camera, delta.normalize(), 0, far - 0.01)
        .intersectObjects(localDock.children, false);
      if (xs.length) {
        hits += 1;
        hitPoints.expandByPoint(target);
        const key = xs[0].object.name;
        hitByNode.set(key, (hitByNode.get(key) || 0) + 1);
      }
    }
    const top = [...hitByNode.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    console.log(` yaw ${yaw}: ${hits} hits; occluders ${JSON.stringify(top)}; hitPts ${hits ? hitPoints.min.toArray().map((v) => v.toFixed(1)).join(',') + ' -> ' + hitPoints.max.toArray().map((v) => v.toFixed(1)).join(',') : '-'}`);
  }
}
