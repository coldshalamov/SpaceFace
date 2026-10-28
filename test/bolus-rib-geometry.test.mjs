import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { bolusSilhouette,bolusSilhouetteIds } from '../src/render/bolusSilhouettes.js';
import { buildFaunaMesh } from '../src/render/faunaVisuals.js';
import { preloadCreatureSkinLibrary, creatureSkin } from '../src/render/creatureSkinLibrary.js';
import { faunaSpeciesById } from '../src/data/alienFauna.js';
const entity = ()=>({id:4242,type:'fauna',radius:16,mass:200,rot:0,data:{ecology:{speciesId:'bolus_rib',driveState:'drift'}}});
const key=v=>v.map(x=>x.toFixed(7)).join(',');
test('Loose Rib is closed, outward, nondegenerate and seam-normal continuous',()=>{
 const recipe=bolusSilhouette('bolus_rib');assert.deepEqual(recipe.parts.map(p=>p.id),['rib_hook','rib_return']);
 for(const p of recipe.parts){
  assert.equal(p.uvs.length,p.positions.length/3*2);assert.equal(p.normals.length,p.positions.length);assert.ok(p.positions.every(Number.isFinite));
  const edges=new Map(),same=new Map();let volume=0;
  const points=Array.from({length:p.positions.length/3},(_,v)=>p.positions.slice(v*3,v*3+3));
  for(let v=0;v<points.length;v++){const n=p.normals.slice(v*3,v*3+3);assert.ok(Math.abs(Math.hypot(...n)-1)<1e-6);const k=key(points[v]);if(same.has(k))assert.deepEqual(n,same.get(k));else same.set(k,n);}
  for(let i=0;i<p.indices.length;i+=3){const ids=p.indices.slice(i,i+3);assert.ok(ids.every(v=>Number.isInteger(v)&&v>=0&&v<points.length));const [a,b,c]=ids.map(v=>new THREE.Vector3(...points[v]));const normal=b.clone().sub(a).cross(c.clone().sub(a));assert.ok(normal.length()>1e-7);volume+=a.dot(b.clone().cross(c))/6;
   const [ua,ub,uc]=ids.map(v=>p.uvs.slice(v*2,v*2+2));assert.ok(Math.abs((ub[0]-ua[0])*(uc[1]-ua[1])-(ub[1]-ua[1])*(uc[0]-ua[0]))>1e-8,'caps and sides have noncollapsed UV triangles');
   const avg=ids.map(v=>new THREE.Vector3(...p.normals.slice(v*3,v*3+3))).reduce((a,b)=>a.add(b),new THREE.Vector3());assert.ok(normal.dot(avg)>0,'vertex normals face out with winding');
   for(let j=0;j<3;j++){const a=key(points[ids[j]]),b=key(points[ids[(j+1)%3]]);const k=[a,b].sort().join('|');edges.set(k,(edges.get(k)||0)+1);}
  }
  assert.ok(volume>0.005);assert.ok([...edges.values()].every(n=>n===2));assert.ok(p.uvs.every(v=>v>=0&&v<=1));
 }
 assert.equal(recipe.parts.reduce((n,p)=>n+p.indices.length/3,0),480);
});
test('runtime uses two cached meshes, existing material, size and unit normals',()=>{
 const a=buildFaunaMesh(entity()),b=buildFaunaMesh(entity());assert.equal(a.children.length,2);assert.equal(faunaSpeciesById('bolus_rib').radius,16);
 for(let i=0;i<2;i++){const m=a.children[i];assert.equal(m.geometry,b.children[i].geometry);assert.equal(m.geometry.userData.spacefaceSharedAsset,true);assert.deepEqual(m.scale.toArray(),[16,16,16]);assert.equal(m.material.roughness,.85);assert.equal(m.material.metalness,0);assert.equal(m.material.side,THREE.FrontSide);assert.equal(m.geometry.attributes.uv.count,m.geometry.attributes.position.count);
  for(let v=0;v<m.geometry.attributes.normal.count;v++){const n=new THREE.Vector3().fromBufferAttribute(m.geometry.attributes.normal,v);assert.ok(Math.abs(n.length()-1)<1e-6);}
 }
 const box=new THREE.Box3().setFromObject(a),size=box.getSize(new THREE.Vector3());assert.ok(size.x<=16&&size.y<=15&&size.z<=22);assert.ok(Math.max(...size.toArray())/Math.min(...size.toArray())>1.6);assert.ok(box.getBoundingSphere(new THREE.Sphere()).radius<=16);
 let originRadius=0;a.updateMatrixWorld(true);for(const m of a.children)for(let v=0;v<m.geometry.attributes.position.count;v++)originRadius=Math.max(originRadius,new THREE.Vector3().fromBufferAttribute(m.geometry.attributes.position,v).applyMatrix4(m.matrixWorld).length());
 assert.ok(originRadius<=16,`rest vertices stay inside the entity-origin radius16: ${originRadius}`);
 console.log(`Loose Rib entity-origin rest radius: ${originRadius.toFixed(6)} WU`);
});
function insideMesh(point, mesh) {
 const g=mesh.geometry,ray=new THREE.Ray(point,new THREE.Vector3(1,.371,.217).normalize()),hits=[];
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),hit=new THREE.Vector3();
 for(let i=0;i<g.index.count;i+=3){
  a.fromBufferAttribute(g.attributes.position,g.index.getX(i)).applyMatrix4(mesh.matrixWorld);
  b.fromBufferAttribute(g.attributes.position,g.index.getX(i+1)).applyMatrix4(mesh.matrixWorld);
  c.fromBufferAttribute(g.attributes.position,g.index.getX(i+2)).applyMatrix4(mesh.matrixWorld);
  if(ray.intersectTriangle(a,b,c,false,hit)){const d=hit.distanceTo(point);if(!hits.some(v=>Math.abs(v-d)<1e-5))hits.push(d);}
 }
 return hits.length%2===1;
}
test('motion and reduced-motion retain finite transforms and joint overlap without sim writes',()=>{
 const e=entity(),root=buildFaunaMesh(e);
 root.position.set(100,0,200);root.rotation.y=.7;
 for(const drive of ['drift','feed','charge','flee'])for(const reduced of [false,true])for(const t of [0,.314,1,2.5,5]){
  e.data.ecology.driveState=drive;const before=JSON.stringify(e);root.userData.updateAuthoredMotion(e,t,{reducedMotion:reduced,reducedFlash:reduced});root.updateMatrixWorld(true);assert.equal(JSON.stringify(e),before);assert.equal(root.rotation.y,.7);assert.deepEqual(root.position.toArray(),[100,0,200]);assert.ok(root.matrixWorld.elements.every(Number.isFinite));
  const boxes=root.children.map(c=>new THREE.Box3().setFromObject(c));assert.ok(boxes[0].intersectsBox(boxes[1]),`${drive} joint AABBs overlap`);
  // The return's root-center remains in the main lobe's thick root region at every inherited motion extreme.
  const a=new THREE.Vector3(-.04,.33*Math.cos(Math.PI*5/12),.33*Math.sin(Math.PI*5/12)).multiplyScalar(.93).applyMatrix4(root.children[0].matrixWorld),b=new THREE.Vector3(-.04,.33*Math.cos(Math.PI*5/12),.33*Math.sin(Math.PI*5/12)).multiplyScalar(.93).applyMatrix4(root.children[1].matrixWorld);assert.ok(a.distanceTo(b)<3.7,`${drive} root displacement remains within combined cartilage radii`);
  const center=a.clone().lerp(b,.5);let connected=false;
  for(const x of [-.5,0,.5])for(const y of [-.5,0,.5])for(const z of [-.5,0,.5]){
   const point=center.clone().add(new THREE.Vector3(x,y,z));
   if(insideMesh(point,root.children[0])&&insideMesh(point,root.children[1]))connected=true;
  }
  assert.ok(connected,`${drive} cartilage volumes genuinely overlap, not only their boxes`);

 }
});
test('recipe copies UVs/normals without sharing writable arrays',()=>{const a=bolusSilhouette('bolus_rib'),b=bolusSilhouette('bolus_rib');a.parts[0].uvs[0]=9;a.parts[0].normals[0]=9;assert.notEqual(b.parts[0].uvs[0],9);assert.notEqual(b.parts[0].normals[0],9);});

test('stub tissue textures verify existing material bindings on the new UV geometry',async()=>{
 await preloadCreatureSkinLibrary(null,{loadTexture:async()=>new THREE.Texture()});
 const skin=creatureSkin('tissue'),root=buildFaunaMesh(entity());assert.ok(skin);
 for(const m of root.children){assert.equal(m.material.map,skin.baseColor);assert.equal(m.material.normalMap,skin.normal);assert.deepEqual(m.material.normalScale.toArray(),[.9,.9]);assert.deepEqual(skin.baseColor.repeat.toArray(),[3,2]);assert.equal(m.geometry.attributes.uv.count,m.geometry.attributes.normal.count);}
});

test('all motion stays inside origin radius16, with an analytic scale/translation envelope',()=>{
 const e=entity();e.id=88442;const root=buildFaunaMesh(e);let sampledMax=0;
 for(const drive of ['drift','feed','charge','flee'])for(const reducedMotion of [false,true])for(let tick=0;tick<=120;tick++){
  e.data.ecology.driveState=drive;root.userData.updateAuthoredMotion(e,tick/12,{reducedMotion});root.updateMatrixWorld(true);
  for(const m of root.children)for(let v=0;v<m.geometry.attributes.position.count;v++)sampledMax=Math.max(sampledMax,new THREE.Vector3().fromBufferAttribute(m.geometry.attributes.position,v).applyMatrix4(m.matrixWorld).length());
 }
 assert.ok(sampledMax<=16,`968 actual runtime poses: ${sampledMax}`);
 // Rotation preserves length. Bound each nonuniform root scale by its largest axis,
 // then add maximum child translation. Secondary charge scales by1.25.
 const translation={charge:Math.hypot(.1,.45),flee:Math.hypot(.28,.18),quiet:.18};let envelopeMax=0;
 for(const [i,m]of root.children.entries()){
  let radius=0;for(let v=0;v<m.geometry.attributes.position.count;v++)radius=Math.max(radius,new THREE.Vector3().fromBufferAttribute(m.geometry.attributes.position,v).length()*16);
  const bound=Math.max(1.12*(radius*(i?1.25:1)+translation.charge),1.05*(radius+translation.flee),1.03*(radius+translation.quiet));
  assert.ok(bound<=16,`${m.name} all-time conservative envelope ${bound}`);envelopeMax=Math.max(envelopeMax,bound);
 }
 console.log(`Loose Rib motion radius: sampled ${sampledMax.toFixed(6)}, analytic all-time envelope ${envelopeMax.toFixed(6)} WU`);
});
