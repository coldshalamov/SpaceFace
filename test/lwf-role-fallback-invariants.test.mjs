import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeEnemySpawnSpec } from '../src/systems/enemySpawnSpec.js';
import { resolveCraftProportions } from '../src/core/craftProportions.js';
import { resolveCollisionProxyManifest } from '../src/data/collisionProxyManifests.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { installVisualOverrides } from '../src/render/visualOverrides.js';
import { AUTHORED_ADMISSION_RETRY_MAX, wholeShipVisualForEntity } from '../src/render/partsLibrary.js';
import { syncResolvingMarker, disposeObjectNode } from '../src/render/renderer.js';

const targets = [
  ['warden_escort', 'bruiser_armor', 'wholeships/swarm_warden.glb', 21, 96],
  ['field_anchor_controller', 'bruiser_armor', 'wholeships/swarm_anchor.glb', 32, 420],
  ['mine_layer_jackal', 'pirate_swoop', 'wholeships/swarm_jackal.glb', 18, 58],
  ['customs_cutter', 'patrol_interdict', 'wholeships/hornet_scn_customs_cutter.glb', 18, 62],
];
function canvas() {
  const ctx = { createImageData: (width,height) => ({data:new Uint8ClampedArray(width*height*4),width,height}),
    putImageData(){},fillRect(){},strokeRect(){},clearRect(){},drawImage(){},save(){},restore(){},translate(){},rotate(){},scale(){},setTransform(){},beginPath(){},closePath(){},moveTo(){},lineTo(){},arc(){},rect(){},fill(){},stroke(){},quadraticCurveTo(){},bezierCurveTo(){},fillText(){},
    createLinearGradient(){return {addColorStop(){}}},createRadialGradient(){return {addColorStop(){}}} };
  return {width:256,height:256,getContext:()=>ctx};
}
globalThis.document ||= {createElement:()=>canvas()};
function entity(id) {
  const e = makeEnemySpawnSpec(id, 5, {x:0,z:0});
  e.id = `fallback:${id}`; e.alive = true; e.data.missionTag = 'wanted_warrant';
  return e;
}
function find(root, predicate) { let found=null; root.traverse(o=>{if(predicate(o)) found=o}); return found; }
function fallback(e) {
  const factory=installVisualOverrides(createVisualFactory(), {releaseMode:true,directAuthoredMount:true});
  const boundary=factory.build(e);
  const substrate=boundary.children.find(o=>o.userData?.authoredAdmissionSubstrate);
  assert.ok(substrate); assert.equal(typeof substrate.userData.admissionProceduralFallback,'function');
  assert.equal(find(boundary,o=>!!o.userData?.roleFallbackGeometry),null,'ordinary admission does not build procedural hull');
  boundary.userData.authoredAssetState='unavailable';
  boundary.userData.authoredAdmissionRetryCount=AUTHORED_ADMISSION_RETRY_MAX;
  syncResolvingMarker(boundary,{missions:{active:[]},render:{scene:{}}});
  assert.equal(substrate.userData.authoredReadableFallbackRetained,true);
  const role=find(boundary,o=>o.userData?.roleFallbackGeometry===e.data.silhouette);
  assert.ok(role,'terminal fallback routes to the specialist builder');
  return {boundary,role};
}
function inside(poly,x,z) {
  let within=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
    const a=poly[i],b=poly[j];
    if((a.z>z)!==(b.z>z) && x < (b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x) within=!within;
  }
  return within;
}
function assertInsideSkin(role,e) {
  const poly=resolveCollisionProxyManifest(e).planarPolygon;
  assert.ok(poly?.length,'the production skin is polygonal');
  role.updateWorldMatrix(true,true);
  const point=new THREE.Vector3();
  role.traverse(mesh=>{
    if(!mesh.isMesh) return;
    const pos=mesh.geometry.getAttribute('position');
    const index=mesh.geometry.index;
    const count=index ? index.count : pos.count;
    const check=(p,label)=>assert.ok(inside(poly,p.x/e.radius,p.z/e.radius), `${e.data.silhouette}: ${mesh.name||mesh.geometry.type} ${label} at (${(p.x/e.radius).toFixed(3)}, ${(p.z/e.radius).toFixed(3)}) outside selected skin`);
    for(let i=0;i<count;i+=3) {
      const vertices=[0,1,2].map(j=>point.fromBufferAttribute(pos,index ? index.getX(i+j) : i+j).clone().applyMatrix4(mesh.matrixWorld));
      vertices.forEach((v,j)=>check(v,`triangle ${i/3} vertex ${j}`));
      for(let j=0;j<3;j++) check(vertices[j].clone().lerp(vertices[(j+1)%3],0.5),`triangle ${i/3} edge`);
      check(vertices[0].clone().add(vertices[1]).add(vertices[2]).multiplyScalar(1/3),`triangle ${i/3} center`);
    }
  });
}
test('real spawn keeps authored packages and capsule/native contracts',()=>{
  for(const [id,old,file,radius,mass] of targets) {
    const e=entity(id), prior={...e,data:{...e.data,silhouette:old}};
    assert.equal(wholeShipVisualForEntity(e).file,file);
    assert.equal(e.radius,radius); assert.equal(e.mass,mass);
    assert.deepEqual(resolveCraftProportions(e),resolveCraftProportions(prior));
    assert.deepEqual(resolveCollisionProxyManifest(e),resolveCollisionProxyManifest(prior));
    const {boundary}=fallback(e); boundary.traverse(o=>disposeObjectNode(o));
  }
  const captured={type:'ship',isPlayer:true,data:{defId:'ship_hornet',appearance:{variantId:'customs_cutter'}}};
  assert.equal(wholeShipVisualForEntity(captured).file,'wholeships/hornet_scn_customs_cutter.glb');
});
test('terminal fallback points forward and major geometry stays within its selected skin',()=>{
  for(const [id] of targets) {
    const e=entity(id), {boundary,role}=fallback(e);
    const nose=find(role,o=>o.name==='role-nose');
    assert.ok(nose,`${id} has an identifiable nose`);
    const p=new THREE.Vector3(); nose.getWorldPosition(p);
    assert.ok(p.x>0 && Math.abs(p.z)<e.radius*0.01,`${id} nose points +X`);
    const mesh=find(nose,o=>o.isMesh); assert.ok(mesh);
    mesh.updateWorldMatrix(true,false);
    const attr=mesh.geometry.getAttribute('position'), points=[];
    for(let i=0;i<attr.count;i++) points.push(new THREE.Vector3().fromBufferAttribute(attr,i).applyMatrix4(mesh.matrixWorld));
    const minX=Math.min(...points.map(v=>v.x)), maxX=Math.max(...points.map(v=>v.x));
    const widthAt=x=>Math.max(...points.filter(v=>Math.abs(v.x-x)<e.radius*0.001).map(v=>Math.abs(v.z)));
    assert.ok(maxX>minX && widthAt(maxX)<widthAt(minX),`${id} nose narrows toward +X`);
    if (id==='customs_cutter') {
      const normals=mesh.geometry.getAttribute('normal'), half=normals.count/2;
      assert.ok(normals.getY(0)<0 && normals.getY(half)>0,'cutter plate faces outward on top and bottom');
    }
    assertInsideSkin(role,e);
    boundary.traverse(o=>disposeObjectNode(o));
  }
});
test('terminal fallback batching and teardown release per-entity materials without destroying cached geometry',()=>{
  for(const [id] of targets) {
    const e=entity(id), first=fallback(e), mats=new Set(), geos=new Set();
    first.role.traverse(o=>{
      if(o.material && !Object.hasOwn(o.material,'dispose') && !o.material.userData?.spacefaceSharedAsset) mats.add(o.material);
      if(o.isMesh) geos.add(o.geometry);
    });
    assert.ok(mats.size>0);
    let released=0; for(const mat of mats) mat.addEventListener('dispose',()=>released++);
    first.boundary.traverse(o=>disposeObjectNode(o));
    assert.equal(released,mats.size,`${id} owned materials released`);
    const second=fallback(entity(id));
    const repeat=[]; second.role.traverse(o=>{if(o.isMesh) repeat.push(o.geometry)});
    assert.ok(repeat.some(g=>geos.has(g)),`${id} shares cached geometry across lifetimes`);
    second.boundary.traverse(o=>disposeObjectNode(o));
  }
});
