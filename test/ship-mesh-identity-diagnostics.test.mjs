import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as THREE from 'three';
import { createShipMeshIdentityObserver, bindShipMeshIdentityObserver } from '../scripts/lib/shipMeshIdentityDiagnostics.mjs';
const context = { entityId: 356, generation: 1, lodLevel: 'lod0' };
function mesh(name) { const m = new THREE.Mesh(); m.name = name; return m; }

test('records actual added and removed identities, without retaining live objects', () => {
  const observe = createShipMeshIdentityObserver();
  const root = new THREE.Group(), hull = mesh('hull'); root.add(hull);
  assert.equal(observe(root, 1, context), null);
  const lamp = mesh('lamp'); root.add(lamp);
  const result = observe(root, 2, context);
  assert.equal(result.added[0].uuid, lamp.uuid);
  assert.equal(result.added[0].name, 'lamp');
  assert.equal(result.membershipComplete, true);
  lamp.name = 'later';
  assert.equal(result.added[0].name, 'lamp');
  assert.equal(observe(root, 2, context), result);
  root.remove(hull);
  const removed = observe(root, 1, context);
  assert.equal(removed.removed[0].uuid, hull.uuid);
  assert.equal(removed.beforeCount, 2);
});

test('unchanged frames do not rewalk the subtree', () => {
  const observe = createShipMeshIdentityObserver();
  let walks = 0; const root = { uuid:'r', traverse(fn) { walks++; fn({ isMesh:true,uuid:'m' }); } };
  observe(root, 1, context);
  for (let i=0;i<360;i++) observe(root,1,context);
  assert.equal(walks,1);
});

test('root, occupant generation and mounted LOD changes reset identity comparison', () => {
  const observe = createShipMeshIdentityObserver(); const root = new THREE.Group();root.add(mesh('a'));
  observe(root,1,context);root.add(mesh('b'));
  assert.equal(observe(root,2,{...context,generation:2}),null);
  root.add(mesh('c'));assert.equal(observe(root,3,{...context,generation:2,lodLevel:'lod1'}),null);
  const replacement = new THREE.Group(); replacement.add(mesh('d'));
  assert.equal(observe(replacement,1,context),null);
});

test('large trees and long labels are bounded and explicitly incomplete', () => {
  const observe = createShipMeshIdentityObserver();const root=new THREE.Group();
  for(let i=0;i<300;i++)root.add(mesh('x'.repeat(1000)));
  observe(root,300,context);root.clear();for(let i=0;i<301;i++)root.add(mesh('y'.repeat(1000)));
  const result=observe(root,301,context);
  assert.equal(result.membershipComplete,false);assert.equal(result.rowsTruncated,true);
  assert.equal(result.added.length,16);assert.equal(result.removed.length,16);
  assert.equal(result.added[0].name.length,180);
  assert.equal(result.observedAddedCount,256);
});

test('failed or ambiguous collection remains diagnostic, never fabricated complete membership',()=>{
 const observe=createShipMeshIdentityObserver();const root={uuid:'r',traverse(fn){fn({isMesh:true,uuid:'x'});}};
 observe(root,1,context);root.traverse=()=>{throw new Error('broken walk');};
 const result=observe(root,2,context);assert.equal(result.membershipComplete,false);assert.equal(result.collectionError,'broken walk');
});

test('the exact sampler closure serializes without Node imports or window mutation',async()=>{
 const sample=async({count})=>{const observe=createShipMeshIdentityObserver();const root={uuid:'r',traverse(fn){for(let i=0;i<count;i++)fn({isMesh:true,uuid:String(i),name:'part'});}};observe(root,count,{entityId:1,lodLevel:'lod0'});count++;return observe(root,count,{entityId:1,lodLevel:'lod0'});};
 const bound=bindShipMeshIdentityObserver(sample);const result=await vm.runInNewContext(`(${bound.toString()})({count:1})`,{});
 assert.equal(result.added[0].uuid,'1');assert.equal(result.membershipComplete,true);
});

test('exactly256 nodes remain complete,257 reports incomplete',()=>{
 const root=new THREE.Group();for(let i=0;i<255;i++)root.add(mesh(String(i)));
 const observe=createShipMeshIdentityObserver();observe(root,255,context);root.add(mesh('256'));
 assert.equal(observe(root,256,context).membershipComplete,true);
 root.add(mesh('257'));assert.equal(observe(root,257,context).membershipComplete,false);
});

test('an existing composition identity signal exposes equal-count node replacement',()=>{
 const root=new THREE.Group(),before=mesh('old');root.add(before);const observe=createShipMeshIdentityObserver();
 observe(root,1,{...context,compositionId:'first'});root.remove(before);const after=mesh('new');root.add(after);
 const result=observe(root,1,{...context,compositionId:'second'});
 assert.equal(result.beforeCount,result.afterCount);assert.equal(result.added[0].uuid,after.uuid);assert.equal(result.removed[0].uuid,before.uuid);
});
