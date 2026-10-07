import test from 'node:test';
import assert from 'node:assert/strict';
import {createSg02DynamicBodyOwner} from '../src/core/sg02DynamicBodyOwner.js';
const ship=(id=1,radius=16)=>({id,type:'ship',alive:true,isPlayer:true,radius,mass:1,pos:{x:id*100,z:0},vel:{x:0,z:0},rot:0,angVel:0,data:{defId:'ship_hornet'},physicsBody:{schemaVersion:1,radius,mass:1,inertiaY:1,dynamic:true,ccd:true,revision:0}});
const stamp=o=>({lengthUnit:o.world.integrationParameters.lengthUnit,normalizedPredictionDistance:o.world.integrationParameters.normalizedPredictionDistance,normalizedAllowedLinearError:o.world.integrationParameters.normalizedAllowedLinearError});
for(const property of ['normalizedPredictionDistance','lengthUnit','normalizedAllowedLinearError'])for(const when of ['before','after'])test(`${property} changed ${when} construction: exact configured receiver or reject without mutation`,async()=>{
 const source=await createSg02DynamicBodyOwner(),entity=ship();const value=property==='normalizedPredictionDistance'?0:100;
 if(when==='before')source.world.integrationParameters[property]=value;source.syncFromEntities([entity]);if(when==='after')source.world.integrationParameters[property]=value;
 const saved=source.exportWorldSnapshot();assert.ok(saved,'scale-relative shape remains exact under contact parameter changes');assert.deepEqual(saved.nativeGeometryParameters,stamp(source));
 const receiving=await createSg02DynamicBodyOwner(),sentinel=ship(9);receiving.syncFromEntities([sentinel]);const original=receiving.world,handle=receiving.records.get(9).body.handle;
 assert.equal(receiving.adoptWorldSnapshot(saved,[structuredClone(entity)]),false);assert.equal(receiving.world,original);assert.equal(receiving.records.get(9).body.handle,handle);
 const configured=await createSg02DynamicBodyOwner();configured.world.integrationParameters[property]=value;assert.equal(configured.adoptWorldSnapshot(saved,[structuredClone(entity)]),true);assert.deepEqual(stamp(configured),stamp(source),'adoption must not overwrite validated parameters');
 source.dispose();receiving.dispose();configured.dispose();
});
test('mixed shallow/current installed geometry cannot export or be adopted under a forged current envelope',async()=>{
 const source=await createSg02DynamicBodyOwner(),entity=ship();source.syncFromEntities([entity]);const valid=source.exportWorldSnapshot(),collider=source.records.get(1).colliders[0],points=new Float32Array(collider.shape.vertices);for(let i=1;i<points.length;i+=3)points[i]=Math.sign(points[i])*1.6;collider.setShape(new source.RAPIER.ConvexPolyhedron(points));assert.equal(source.exportWorldSnapshot(),null,'do not stamp settings over stale/mixed native shapes');
 const forged={...valid,snapshot:Buffer.from(source.world.takeSnapshot()).toString('base64')},receiving=await createSg02DynamicBodyOwner();receiving.syncFromEntities([ship(9)]);const before=receiving.world;assert.equal(receiving.adoptWorldSnapshot(forged,[entity]),false);assert.equal(receiving.world,before);assert.equal(receiving.records.size,1);assert.ok(receiving.records.has(9));
 source.dispose();receiving.dispose();
});
test('native parameters inconsistent with otherwise matching envelope are rejected before adoption',async()=>{
 const source=await createSg02DynamicBodyOwner(),entity=ship();source.syncFromEntities([entity]);const valid=source.exportWorldSnapshot();source.world.integrationParameters.normalizedPredictionDistance=0;const forged={...valid,snapshot:Buffer.from(source.world.takeSnapshot()).toString('base64')};const receiving=await createSg02DynamicBodyOwner(),before=receiving.world;assert.equal(receiving.adoptWorldSnapshot(forged,[entity]),false);assert.equal(receiving.world,before);assert.equal(receiving.records.size,0);source.dispose();receiving.dispose();
});
test('tiny and large supported Hornet scales still create complete solid skins and valid native snapshots',async()=>{
 for(const radius of [.001,.01,.1,1,16,1000]){const owner=await createSg02DynamicBodyOwner();owner.syncFromEntities([ship(1,radius)]);assert.equal(owner.records.get(1).colliders.length,24);assert.ok(owner.exportWorldSnapshot());owner.dispose();}
});
