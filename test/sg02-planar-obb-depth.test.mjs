import test from 'node:test';
import assert from 'node:assert/strict';
import {createSg02DynamicBodyOwner,planarProxyObbHalfHeight,SG02_NATIVE_GEOMETRY_REVISION} from '../src/core/sg02DynamicBodyOwner.js';

function box(scale=1,angle=.37){
 const manifest={schemaVersion:1,id:'test-obb-depth',referenceRadius:1,primitives:[
  {id:'offset-long',kind:'obb',x:3,z:-2,hx:.5,hz:4,angleDeg:31},
  {id:'offset-short',kind:'obb',x:-6,z:4,hx:2,hz:.4,angleDeg:-29}]};
 return{id:1,occupantGeneration:1,type:'wreck',alive:true,hull:100,hullMax:100,collides:true,radius:scale,mass:12,
  pos:{x:17*scale,z:-19*scale},vel:{x:0,z:0},rot:angle,angVel:0,data:{},
  physicsBody:{schemaVersion:1,dynamic:true,ccd:true,radius:scale,mass:12,inertiaY:73,collisionProxyManifest:manifest}};
}
const shapeState=r=>r.colliders.map(c=>({xz:[c.halfExtents().x,c.halfExtents().z],offset:c.translationWrtParent(),rotation:c.rotationWrtParent(),density:c.density(),groups:c.collisionGroups()}));

test('OBB depth is scale-relative projected support without absolute contact padding',()=>{
 for(const scale of [1e-6,.001,1,1e4,1e6]){
  const hx=.5*scale,hz=4*scale,h=planarProxyObbHalfHeight(hx,hz);
  assert.ok(Number.isFinite(h)&&h>Math.hypot(Math.fround(hx),Math.fround(hz)));
  assert.ok(h<1.0001*Math.hypot(Math.fround(hx),Math.fround(hz)));
 }
});

test('rotated off-center OBB compounds preserve authored XZ/mass/inertia/locks/CCD through exact native adoption',async()=>{
 for(const scale of [.001,1,10000])for(const angle of [0,.37,Math.PI/2]){
  const a=await createSg02DynamicBodyOwner(),b=await createSg02DynamicBodyOwner();
  try{
   const e=box(scale,angle);a.syncFromEntities([e]);a.step(1/60);const r=a.records.get(e.id),before=shapeState(r);
   for(let i=0;i<r.colliders.length;i++){
    const c=r.colliders[i],p=e.physicsBody.collisionProxyManifest.primitives[i],h=c.halfExtents();
    assert.equal(h.x,Math.fround(Math.max(.01,p.hx*scale)));assert.equal(h.z,Math.fround(Math.max(.01,p.hz*scale)));
    assert.equal(h.y,Math.fround(planarProxyObbHalfHeight(h.x,h.z)));assert.equal(c.density(),0);
    assert.equal(c.translationWrtParent().x,Math.fround(p.x*scale));assert.equal(c.translationWrtParent().z,Math.fround(p.z*scale));
   }
   assert.equal(r.body.mass(),12);assert.equal(r.body.principalInertia().y,73);assert.equal(r.body.isCcdEnabled(),true);
   const cache=a.exportWorldSnapshot();assert.ok(cache);assert.equal(cache.nativeGeometryRevision,SG02_NATIVE_GEOMETRY_REVISION);
   assert.equal(b.adoptWorldSnapshot(cache,[structuredClone(e)]),true,`scale=${scale} yaw=${angle}`);assert.deepEqual(shapeState(b.records.get(e.id)),before);
   a.step(1/60);assert.equal(r.body.translation().y,0);assert.equal(r.body.rotation().x,0);assert.equal(r.body.rotation().z,0);
  }finally{a.dispose();b.dispose();}
 }
});

test('old schema3 OBB revision and forged current shallow/deep OBB bytes cannot certify exact replay',async()=>{
 const a=await createSg02DynamicBodyOwner(),b=await createSg02DynamicBodyOwner();
 try{
  const e=box();a.syncFromEntities([e]);const cache=a.exportWorldSnapshot(),r=a.records.get(e.id),c=r.colliders[0],h=c.halfExtents();
  assert.equal(b.adoptWorldSnapshot({...cache,nativeGeometryRevision:'xz-support-prism-v2'},[structuredClone(e)]),false);assert.equal(b.records.size,0);
  for(const y of [h.x,h.y*2]){
   c.setShape(new a.RAPIER.Cuboid(h.x,y,h.z));
   assert.equal(a.exportWorldSnapshot(),null,'mixed support geometry cannot export as exact');
   const forged={...cache,snapshot:Buffer.from(a.world.takeSnapshot()).toString('base64')};
   assert.equal(b.adoptWorldSnapshot(forged,[structuredClone(e)]),false);assert.equal(b.records.size,0);
  }
 }finally{a.dispose();b.dispose();}
});
