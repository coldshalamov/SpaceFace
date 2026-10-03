import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import { createSg02DynamicBodyOwner, planarProxyPrismHalfHeight, SG02_WORLD_SNAPSHOT_SCHEMA_VERSION } from '../src/core/sg02DynamicBodyOwner.js';
import { loadRapierCompatRuntime } from '../src/core/rapierCompatRuntime.js';
const R=await loadRapierCompatRuntime();
const square=[{x:-1,z:-1},{x:1,z:-1},{x:1,z:1},{x:-1,z:1}];
const quat=y=>({x:0,y:Math.sin(y/2),z:0,w:Math.cos(y/2)});
function prism(verts,scale=1,p={}) { const h=planarProxyPrismHalfHeight(verts,scale,p);return R.ColliderDesc.convexHull(new Float32Array([h,-h].flatMap(y=>verts.flatMap(v=>[v.x*scale,y,v.z*scale])))); }
function body(w,dynamic,pos={x:0,y:0,z:0},mass=1){return w.createRigidBody((dynamic?R.RigidBodyDesc.dynamic():R.RigidBodyDesc.fixed()).setTranslation(pos.x,pos.y,pos.z).enabledTranslations(true,false,true).enabledRotations(false,true,false).setAdditionalMassProperties(mass,{x:0,y:0,z:0},{x:1,y:2*mass,z:1},{x:0,y:0,z:0,w:1}).setCcdEnabled(true));}
function collider(w,b,d){return w.createCollider(d.setDensity(0).setFriction(0).setRestitution(0),b);}
function normals(w){let max=0,n=0;w.forEachCollider(a=>w.contactPairsWith(a,b=>{if(a.handle<b.handle)w.contactPair(a,b,m=>{if(m.numSolverContacts()){n++;max=Math.max(max,Math.abs(m.normal().y));}})}));return{max,n};}

test('support depth uses actual float32 geometry and scales without absolute contact padding',()=>{
 for(const scale of [0.001,1,10000])for(const offset of [0,100]){
  const verts=square.map(v=>({x:v.x+offset,z:v.z-offset}));
  const h=planarProxyPrismHalfHeight(verts,scale,{lengthUnit:scale,normalizedPredictionDistance:0,normalizedAllowedLinearError:0});
  assert.ok(h>Math.SQRT2*scale);assert.ok(Number.isFinite(h));
 }
 const base=planarProxyPrismHalfHeight(square,1);
 assert.equal(planarProxyPrismHalfHeight(square,2),2*base);
 assert.equal(planarProxyPrismHalfHeight(square,1,{normalizedPredictionDistance:3.5,normalizedAllowedLinearError:100}),base,'contact inclusion/slack must not inflate geometric support');
});

test('prism pairs retain bounded physical response for shallow/deep containment, yaw and offset geometry',()=>{
 for(const size of [0.1,1,100])for(const yaw of [0,.37,Math.PI/2])for(const kind of ['ball','capsule','prism','obb'])for(const depth of [0,.5,1.99]){
  const w=new R.World({x:0,y:0,z:0});w.timestep=1/60;w.integrationParameters.normalizedPredictionDistance=.001;
  const a=body(w,true,{x:depth*size,y:0,z:0},.1);a.setRotation(quat(yaw),true);
  const offset=.3;collider(w,a,prism(square.map(v=>({x:v.x+offset,z:v.z})),size,w.integrationParameters).setTranslation(-offset*size,0,0));
  const b=body(w,false);let d;
  if(kind==='ball')d=R.ColliderDesc.ball(size);
  if(kind==='capsule')d=R.ColliderDesc.capsule(2*size,size).setRotation({x:0,y:0,z:-Math.SQRT1_2,w:Math.SQRT1_2});
  if(kind==='prism')d=prism(square,2*size,w.integrationParameters);
  if(kind==='obb')d=R.ColliderDesc.cuboid(2*size,2*size,.4*size).setRotation(quat(.21));
  collider(w,b,d);w.step();const n=normals(w); // Off-plane normal diagnostic is retained separately; finite correction is the physical contract.
  // Initial penetration permits stabilization work. Its one-step motion/energy
  // must fit a complete geometric escape, not an arbitrary gameplay speed cap.
  const partnerReach={ball:1,capsule:3,prism:2*Math.SQRT2,obb:Math.hypot(2,.4)}[kind]*size;
  const escapeBound=Math.SQRT2*size+partnerReach;
  assert.ok(Math.hypot(a.translation().x-depth*size,a.translation().z)<=escapeBound,`unbounded correction: ${kind} ${size} ${yaw}`);
  assert.ok(Math.hypot(a.linvel().x,a.linvel().z)*w.timestep<=escapeBound,`energy exceeds full escape work: ${kind} ${size} ${yaw}`);
  const v=a.linvel();assert.ok(Number.isFinite(v.x)&&Number.isFinite(v.z));assert.equal(v.y,0);assert.equal(a.translation().y,0);assert.equal(a.mass(),Math.fround(.1));assert.equal(a.principalInertia().y,Math.fround(.2));w.free();
 }
});

test('real CCD stops a fast ball at a thin projected prism and leaves adjacent opening usable',()=>{
 for(const z of [0,3]){const w=new R.World({x:0,y:0,z:0});w.timestep=1/60;w.integrationParameters.maxCcdSubsteps=4;
  const wall=body(w,false);collider(w,wall,prism([{x:-.05,z:-1},{x:.05,z:-1},{x:.05,z:1},{x:-.05,z:1}],1,w.integrationParameters));
  const a=body(w,true,{x:-5,y:0,z});collider(w,a,R.ColliderDesc.ball(.2));a.setLinvel({x:1000,y:0,z:0},true);w.step();
  if(z===0)assert.ok(a.translation().x<0,`tunnelled: ${a.translation().x}`);else assert.ok(a.translation().x>10,'opening blocked');assert.equal(a.translation().y,0);w.free();}
});

test('a large legitimate impulse and dynamic momentum transfer survive prism geometry',()=>{
 const w=new R.World({x:0,y:0,z:0});w.timestep=1/600;
 const a=body(w,true,{x:-2.01,y:0,z:0},2),b=body(w,true,{x:0,y:0,z:0},3);collider(w,a,prism(square,1,w.integrationParameters));collider(w,b,R.ColliderDesc.ball(1));
 a.recomputeMassPropertiesFromColliders();b.recomputeMassPropertiesFromColliders();a.applyImpulse({x:2000,y:0,z:0},true);assert.equal(a.linvel().x,1000);
 for(let i=0;i<10;i++)w.step();assert.ok(b.linvel().x>100,'knockback removed');assert.ok(Math.abs(2*a.linvel().x+3*b.linvel().x-2000)<1,'linear momentum lost');w.free();
});

function hornet(){return{id:1,type:'ship',alive:true,isPlayer:true,radius:16,mass:41.0031,pos:{x:0,z:0},vel:{x:0,z:0},rot:0,angVel:0,data:{defId:'ship_hornet'},physicsBody:{schemaVersion:1,radius:16,mass:41.0031,inertiaY:16.4450935828877,dynamic:true,ccd:true,revision:0}};}
test('actual owner builds support-depth skins, rejects old native cache and exactly restores new cache',async()=>{
 const a=await createSg02DynamicBodyOwner(),e=hornet();a.syncFromEntities([e]);const rec=a.records.get(1);assert.ok(rec.colliders.length>1);const original=rec.colliders.map(c=>({v:[...c.shape.vertices],groups:c.collisionGroups(),density:c.density()}));
 for(const c of rec.colliders){assert.equal(c.density(),0);const v=c.shape.vertices;assert.ok(Math.abs(v[1])>1.6);}
 assert.equal(rec.body.mass(),Math.fround(e.physicsBody.mass));assert.equal(rec.body.principalInertia().y,Math.fround(e.physicsBody.inertiaY));
 const saved=a.exportWorldSnapshot();assert.equal(saved.schema,SG02_WORLD_SNAPSHOT_SCHEMA_VERSION);assert.equal(SG02_WORLD_SNAPSHOT_SCHEMA_VERSION,3);assert.equal(saved.nativeGeometryRevision,'xz-support-prism-obb-v3');
 const b=await createSg02DynamicBodyOwner();assert.equal(b.adoptWorldSnapshot({...saved,nativeGeometryRevision:undefined},[structuredClone(e)]),false);assert.equal(b.records.size,0);assert.equal(b.adoptWorldSnapshot({...saved,schema:2,nativeGeometryRevision:undefined},[structuredClone(e)]),false);b.syncFromEntities([structuredClone(e)]);assert.deepEqual(b.records.get(1).colliders.map(c=>({v:[...c.shape.vertices],groups:c.collisionGroups(),density:c.density()})),original,'scalar fallback builds current geometry');
 const c=await createSg02DynamicBodyOwner();assert.equal(c.adoptWorldSnapshot(saved,[structuredClone(e)]),true);assert.deepEqual(c.records.get(1).colliders.map(c=>({v:[...c.shape.vertices],groups:c.collisionGroups(),density:c.density()})),original);a.dispose();b.dispose();c.dispose();
});

test('pinned shallow base and NEXT native bytes are rejected without entering Rapier restore',async()=>{
 const owner=await createSg02DynamicBodyOwner();
 for(const name of ['legacy-base','legacy-next']){const payload=JSON.parse(readFileSync(new URL(`./fixtures/planar-prism/${name}-snapshot.json`,import.meta.url)));assert.equal(owner.adoptWorldSnapshot(payload,[hornet()]),false);assert.equal(owner.records.size,0);}
 owner.dispose();
});

test('new Hornet extrusion preserves every projected vertex of the pinned old native skin',async()=>{
 const payload=JSON.parse(readFileSync(new URL('./fixtures/planar-prism/legacy-base-snapshot.json',import.meta.url)));const old=R.World.restoreSnapshot(Buffer.from(payload.snapshot,'base64')),owner=await createSg02DynamicBodyOwner();owner.syncFromEntities([hornet()]);const previous=old.getRigidBody(Number(payload.bodies['1'])),current=owner.records.get(1);assert.equal(previous.numColliders(),current.colliders.length);
 for(let i=0;i<previous.numColliders();i++){const a=previous.collider(i),b=current.colliders[i];assert.equal(a.shapeType(),b.shapeType());assert.equal(a.shape.vertices.length,b.shape.vertices.length);for(let j=0;j<a.shape.vertices.length;j+=3){assert.equal(a.shape.vertices[j],b.shape.vertices[j]);assert.equal(a.shape.vertices[j+2],b.shape.vertices[j+2]);}assert.equal(a.collisionGroups(),b.collisionGroups());assert.equal(a.solverGroups(),b.solverGroups());assert.equal(a.density(),b.density());assert.deepEqual(a.translationWrtParent(),b.translationWrtParent());assert.deepEqual(a.rotationWrtParent(),b.rotationWrtParent());}
 assert.equal(previous.mass(),current.body.mass());assert.deepEqual(previous.principalInertia(),current.body.principalInertia());old.free();owner.dispose();
});
