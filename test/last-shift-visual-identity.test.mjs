import test from 'node:test';
import assert from 'node:assert/strict';
import { LAST_SHIFT, LAST_SHIFT_CLUES, lastShiftBodyKey } from '../src/data/lastShift.js';
import { lastShiftPackagedFile, wreckPackagedFile } from '../src/render/visualFactory.js';

const files = {
  fairlead: 'places/place_last_shift_fairlead.glb',
  cargo: 'places/place_aftermath_aft_cargo_module.glb',
  recorder: 'pods/pod_47a_evidence_spindle.glb',
};
function evidence(clue, id) {
  return { id, type: 'wreck', radius: clue.radius, mass: clue.mass,
    physicsBody: { schemaVersion: 1, shape: 'ball', radius: clue.radius, mass: clue.mass, dynamic: clue.dynamic, revision: 0 }, data: {
    persistenceOwner: LAST_SHIFT.persistenceOwner, lastShiftSiteId: LAST_SHIFT.siteId,
    lastShiftBodyKey: lastShiftBodyKey(clue.id), lastShiftClueId: clue.id,
    parentType: clue.parentType,
  } };
}
test('all three Last Shift sources keep their authored identity through entity-ID reallocation', () => {
  for (const clue of LAST_SHIFT_CLUES) for (const id of [453, 701, 2001, 'continued:701']) {
    const entity = JSON.parse(JSON.stringify(evidence(clue, id)));
    const before = JSON.stringify(entity);
    assert.equal(lastShiftPackagedFile(entity), files[clue.id]);
    assert.equal(wreckPackagedFile(entity), files[clue.id]);
    assert.equal(JSON.stringify(entity), before, 'visual selection must not mutate simulation/custody');
  }
  assert.equal(new Set(Object.values(files)).size, 3);
});
test('malformed, partial and foreign identities cannot claim a Last Shift body', () => {
  const clue = LAST_SHIFT_CLUES.find(c => c.id === 'recorder');
  for (const change of [
    { persistenceOwner: 'other' }, { persistenceOwner: undefined },
    { lastShiftSiteId: 'other' }, { lastShiftBodyKey: lastShiftBodyKey('cargo') },
    { lastShiftClueId: 'unknown' }, { lastShiftClueId: '__proto__' },
  ]) {
    const entity = evidence(clue, 453);
    Object.assign(entity.data, change);
    assert.equal(lastShiftPackagedFile(entity), null);
    assert.equal(wreckPackagedFile(entity), wreckPackagedFile({ ...entity, data: { parentType: clue.parentType } }));
  }
  assert.equal(lastShiftPackagedFile({ ...evidence(clue, 453), type: 'ship' }), null);
  for (const entity of [undefined, null, {}, { type: 'wreck' }]) assert.equal(lastShiftPackagedFile(entity), null);
});

import * as THREE from 'three';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { authoredPrewarmRequestsForEntities, resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { createVisualFactory, fitPackagedGroup } from '../src/render/visualFactory.js';
import { createRenderPackageLoader } from '../src/render/renderPackageLoader.js';
import { computeRenderPackageContentHash, computeRenderPackageRuntimeHash } from '../src/contracts/renderPackage.js';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => JSON.parse(fs.readFileSync(path));

test('Last Shift visible boundaries and deadline prewarm request exactly the same authored place slot', () => {
  for (const clue of LAST_SHIFT_CLUES) for (const id of [453, 701, 2001]) {
    const entity = evidence(clue, id), url = `assets/ships/release/parts/${files[clue.id]}`;
    assert.equal(resolvePlaceFileForEntity(entity), files[clue.id]);
    const requests = authoredPrewarmRequestsForEntities([entity], { includeSpawnableArchetypes: false });
    assert.deepEqual(requests.map(({url, slot}) => ({url, slot})), [{url, slot:'place'}]);
    const root = createVisualFactory().build(entity);
    assert.equal(root.userData.authoredPackageUrl, url);
    assert.equal(root.userData.authoredAssetState, 'awaiting-authored-admission');
    assert.equal(root.userData.authoredPendingFallbackDrawn, false);
  }
  for (const field of ['lastShiftSiteId','lastShiftBodyKey','lastShiftClueId','persistenceOwner']) {
    const entity = evidence(LAST_SHIFT_CLUES[0], 453); entity.data[field] = 'foreign';
    assert.equal(resolvePlaceFileForEntity(entity), null);
  }
});

function threeNode(node) {
  const object = new THREE.Group(); object.name = node.getName(); object.userData = {...node.getExtras()};
  object.position.fromArray(node.getTranslation()); object.quaternion.fromArray(node.getRotation()); object.scale.fromArray(node.getScale());
  for (const primitive of node.getMesh()?.listPrimitives() || []) {
    const position = primitive.getAttribute('POSITION'), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position.getArray().slice(), position.getElementSize(), position.getNormalized()));
    const indices = primitive.getIndices();
    if (indices) geometry.setIndex(new THREE.BufferAttribute(indices.getArray().slice(), 1));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); mesh.name = node.getName(); object.add(mesh);
  }
  for (const child of node.listChildren()) object.add(threeNode(child));
  return object;
}

test('real packages load isolated instances, fit clue dimensions and bound fairlead ball overhang', async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
  const releases = read('assets/ships/release/release_manifest.json').assets;
  const pilots = read('assets/ships/render-packages/pilots.json').pilots;
  for (const clue of LAST_SHIFT_CLUES) {
    const url = `assets/ships/release/parts/${files[clue.id]}`;
    const row = releases.find(r => r.release === url); assert.ok(row, `${clue.id}: release registration missing`);
    const bytes = fs.readFileSync(url); assert.equal(hash(bytes), row.releaseSha256);
    const pilot = pilots.find(p => p.sourceUrl === url); assert.ok(pilot, `${clue.id}: package registration missing`);
    assert.equal(pilot.releaseSha256, hash(bytes));
    const metadata = read(pilot.metadataUrl);
    assert.equal(metadata.contentHash, await computeRenderPackageContentHash(metadata, {digest:hash}));
    assert.equal(metadata.runtimeHash, await computeRenderPackageRuntimeHash(metadata, {digest:hash}));
    assert.equal(metadata.provenance.sourceGlb.sha256, row.releaseSha256);
    const packageFile = `${pilot.outputDir}/render.glb`;
    assert.equal(hash(fs.readFileSync(packageFile)), metadata.render.sha256);
    const doc = await io.read(packageFile), scene = new THREE.Group();
    for (const node of doc.getRoot().listScenes()[0].listChildren()) scene.add(threeNode(node));
    const loader = createRenderPackageLoader({loadGlb:async()=>({scene})});
    const loaded = await loader.load(metadata, {expectedContentHash:metadata.contentHash, expectedRuntimeHash:metadata.runtimeHash});
    const a = loaded.createInstance(), b = loaded.createInstance(); assert.notEqual(a.root,b.root);
    fitPackagedGroup(a.root, clue.radius); a.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(a.root), size = bounds.getSize(new THREE.Vector3());
    assert.ok(Math.abs(Math.max(...size.toArray()) - clue.radius*2) < .001);
    assert.ok(bounds.getCenter(new THREE.Vector3()).length() < .001);
    if (clue.id === 'fairlead') {
      const roller=[];a.root.traverse(o=>{if(o.isMesh && o.name.includes('LAST_SHIFT_ROLLER')) roller.push(o);});
      assert.ok(roller.length, 'export must retain the actual fairlead roller');
      const rollerBounds=new THREE.Box3(); for(const mesh of roller) rollerBounds.expandByObject(mesh);
      const rollerSize=rollerBounds.getSize(new THREE.Vector3());
      assert.ok(Math.max(...rollerSize.toArray()) < clue.radius*.5, 'hardware cannot replace the whole wreck envelope');
      let furthest = 0, furthestPoint;
      a.root.traverse(object => {
        if (!object.isMesh || /COLLISION/.test(object.name)) return;
        const positions = object.geometry.getAttribute('position');
        for (let i=0; i<positions.count; i++) {
          const point = new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(object.matrixWorld);
          if (point.length()>furthest) { furthest=point.length(); furthestPoint=[object.name,...point.toArray()]; }
        }
      });
      // A max-dimension fit retains the bevelled plate thickness at the axial tips.
      // Bound that known render-only overhang to 0.2WU (<0.8%); physics stays ball26.
      assert.ok(furthest <= clue.radius + .2, `actual fairlead vertices exceed unchanged ball: ${furthest} ${JSON.stringify(furthestPoint)}`);
      assert.equal(hash(fs.readFileSync(`assets/ships/parts/${files.fairlead}`)), row.sourceSha256);
    }
    a.dispose();b.dispose();loader.dispose();
  }
});


test('retained fallback stays deterministic across Continue without changing unrelated wreck variation', () => {
  const signature = entity => {
    const root = createVisualFactory().build(entity), parts=[];
    root.traverse(o => { if(o.isMesh) parts.push({p:o.position.toArray(),q:o.quaternion.toArray(),s:o.scale.toArray()}); });
    assert.ok(parts.length > 0, 'retained fallback proof requires actual mesh transforms');
    return parts;
  };
  for (const clue of LAST_SHIFT_CLUES) {
    const first=signature(evidence(clue,453));
    assert.deepEqual(signature(evidence(clue,701)),first);
    assert.deepEqual(signature(evidence(clue,2001)),first);
  }
  assert.notDeepEqual(signature({id:453,type:'wreck',radius:12,data:{}}), signature({id:701,type:'wreck',radius:12,data:{}}));
});


test('Last Shift census preserves explicit simulation ball rather than adopting a generated skin', () => {
  const row=read('src/data/modelTruthCensus.json').rows.find(r=>r.id==='place_last_shift_fairlead');
  assert.equal(row.gameplay.entityRadius,26);
  assert.equal(row.gameplay.colliderKind,'ball');
  assert.equal(row.gameplay.colliderId,null);
  assert.equal(row.gameplay.runtimeColliderFixed,true);
  assert.equal(row.gameplay.collisionAuthority,'lastShift.physicsBody');
  assert.equal(row.collider.kind,'ball');
  assert.equal(row.proposedSkin?.adopted,false);
  assert.match(row.note,/diagnostic only/);
});
