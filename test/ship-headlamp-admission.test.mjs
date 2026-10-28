import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createShipAuxPool, syncShipAuxPools } from '../src/render/renderer.js';
import { createShipMeshIdentityObserver } from '../scripts/lib/shipMeshIdentityDiagnostics.mjs';

test('production aux sync parks nav-light instances in the shared pool, not authored hull churn', () => {
  const root = new THREE.Group(); root.userData.authoredAssetState = 'authored';
  for(let i=0;i<35;i++) { const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());m.name=`existing-${i}`;if(i<23)m.userData.spacefacePartUrl='fixture-whole-hull.glb';root.add(m); }
  const navSource=new THREE.InstancedMesh(new THREE.BoxGeometry(0.2,0.2,0.2),new THREE.MeshStandardMaterial({color:0x88eeff}),2);
  navSource.name='GLTFKit_Nav_Lights';navSource.userData.damageRole='navLight';navSource.count=2;root.add(navSource);
  const scene=new THREE.Scene();scene.add(root);root.updateWorldMatrix(true,true);
  const pool=createShipAuxPool(scene);const entity={id:356,type:'ship',alive:true,radius:18,shield:0,data:{defId:'ship_mule'}};
  const meshes=new Map([[356,root]]);const observe=createShipMeshIdentityObserver();const context={entityId:356,generation:1,lodLevel:'lod0'};
  const count=()=>{let n=0;root.traverse(o=>{if(o.isMesh)n++;});return n;};
  root.visible=false;syncShipAuxPools(pool,[entity],meshes);assert.equal(count(),36);
  observe(root,count(),context);root.visible=true;syncShipAuxPools(pool,[entity],meshes);
  assert.equal(count(),36,'aux sync writes pooled instances; it does not add meshes to the ship root');
  const change=observe(root,count(),context);
  assert.equal(change,null,'a clean aux sync produces no membership-change evidence');
  assert.equal(navSource.visible,false,'aux sync parks the authored nav-light source');
  assert.equal(pool.nav.mesh.count,2,'the pooled nav mesh carries the parked instances');
  assert.equal(pool.nav.mesh.visible,true);
  let authored=0;root.traverse(o=>{if(o.userData.spacefacePartUrl)authored++;});assert.equal(authored,23);
  syncShipAuxPools(pool,[entity],meshes);assert.equal(count(),36,'later visits are idempotent');
});
