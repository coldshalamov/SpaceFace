import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createShipAuxPool, syncShipAuxPools } from '../src/render/renderer.js';
import { createShipMeshIdentityObserver } from '../scripts/lib/shipMeshIdentityDiagnostics.mjs';

test('production aux sync adds the two headlamp meshes on first eligible visit, not an authored hull swap', () => {
  const root = new THREE.Group(); root.userData.authoredAssetState = 'authored';
  for(let i=0;i<35;i++) { const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());m.name=`existing-${i}`;if(i<23)m.userData.spacefacePartUrl='fixture-whole-hull.glb';root.add(m); }
  const scene=new THREE.Scene();scene.add(root);root.updateWorldMatrix(true,true);
  const pool=createShipAuxPool(scene);const entity={id:356,type:'ship',alive:true,radius:18,shield:0,data:{defId:'ship_mule'}};
  const meshes=new Map([[356,root]]);const observe=createShipMeshIdentityObserver();const context={entityId:356,generation:1,lodLevel:'lod0'};
  const count=()=>{let n=0;root.traverse(o=>{if(o.isMesh)n++;});return n;};
  root.visible=false;syncShipAuxPools(pool,[entity],meshes);assert.equal(count(),35);
  observe(root,count(),context);root.visible=true;syncShipAuxPools(pool,[entity],meshes);
  assert.equal(count(),37);
  const change=observe(root,count(),context);
  assert.deepEqual(change.added.map(r=>r.name).sort(),['GLTFKit_Headlamp_Beam','GLTFKit_Headlamp_Lenses']);
  assert.equal(change.removed.length,0);assert.equal(change.membershipComplete,true);
  let authored=0;root.traverse(o=>{if(o.userData.spacefacePartUrl)authored++;});assert.equal(authored,23);
  syncShipAuxPools(pool,[entity],meshes);assert.equal(count(),37,'later visits are idempotent');
});
