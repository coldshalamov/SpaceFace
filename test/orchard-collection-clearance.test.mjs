import test from 'node:test';
import assert from 'node:assert/strict';
import { anvilCollectionTarget, anvilBandExitTarget } from '../src/systems/anvilWork.js';
import { resolveCollisionProxyManifest, proxyOuterRadiusWu } from '../src/data/collisionProxyManifests.js';
import { STORMSHIFT_COLLECTOR_COLLISION } from '../src/data/stormshiftCollectorCollision.js';
const center={x:14288,z:5992};
function worker(angle=0) {return {id:1,type:'ship',pos:{x:center.x+980*Math.cos(angle),z:center.z+980*Math.sin(angle)},vel:{x:0,z:0},rot:angle-Math.PI/2,radius:16,data:{shipId:'ship_mule',itinerary:{center}},physicsBody:{dynamic:true,collisionProxyManifest:STORMSHIFT_COLLECTOR_COLLISION}};}
function gate(angle=.56){return {id:2,type:'station',alive:true,collides:true,pos:{x:center.x+961*Math.cos(angle),z:center.z+961*Math.sin(angle)},radius:32,rot:0,physicsBody:{dynamic:false},data:{isGate:true,placeScale:5,dockRadius:70,archetypeGlb:'place_gate_jump_ring',collisionProxy:'skin:place_gate_jump_ring',corridorBearingDeg:149}};}
function target(e,obstacles,native){return anvilCollectionTarget({entityList:[e,...obstacles]},e,native);}
const radius=p=>Math.hypot(p.x-center.x,p.z-center.z);
test('unobstructed shallow collection keeps clockwise980radius without mutation',()=>{const e=worker(1),before=structuredClone(e),p=target(e,[]);assert.ok(Math.abs(radius(p)-980)<1e-8);assert.ok(Math.abs(Math.atan2(p.z-center.z,p.x-center.x)-.78)<1e-8);assert.deepEqual(e,before);});
test('measured gate rim receives outward clearance over entire work circuit',()=>{const g=gate();const outer=proxyOuterRadiusWu(resolveCollisionProxyManifest(g),g);assert.ok(outer>60&&outer<70);let maximum=0;
for(let a=-Math.PI;a<Math.PI;a+=.005){const e=worker(a),p=target(e,[g]);maximum=Math.max(maximum,radius(p));assert.ok(Math.hypot(p.x-g.pos.x,p.z-g.pos.z)>outer+20,'whole worker envelope clears fixed gate');}assert.ok(maximum>1040,'real detour leaves shallow gas band');assert.ok(maximum<1450,'local detour stays in sling region');});
test('moving ships remain traffic yield responsibility, never fixed work lane obstacles',()=>{const e=worker(.78),g=gate();g.physicsBody.dynamic=true;assert.equal(radius(target(e,[g])).toFixed(6),'980.000000');});
test('overlapping fixed obstacles max blend and do not depend on entity order',()=>{const e=worker(.78),a=gate(.56),b=gate(.7);b.id=3;const p=target(e,[a,b]);assert.deepEqual(p,target(e,[b,a]));assert.equal(radius(p),Math.max(radius(target(e,[a])),radius(target(e,[b]))));});
test('exact enabled native owner supplies fixed center; stale recycled record does not',()=>{const e=worker(.78),g=gate(),native={_frameOrigin:{x:14000,z:6000},records:new Map()};const body={isEnabled:()=>true,isDynamic:()=>false,translation:()=>({x:10000,y:0,z:0})};native.records.set(g.id,{entity:g,body});assert.equal(radius(target(e,[g],native)).toFixed(6),'980.000000');native.records.set(g.id,{entity:{...g},body});assert.deepEqual(target(e,[g],native),target(e,[g]));});
test('absent and malformed positions cannot create NaN; centered small obstacle does not distort lane',()=>{const e=worker(),g=gate();g.pos={...center};assert.equal(radius(target(e,[g])).toFixed(6),'980.000000');g.pos.x=NaN;assert.equal(radius(target(e,[g])).toFixed(6),'980.000000');e.data.itinerary.center={x:NaN,z:0};assert.equal(target(e,[]),null);});

test('rotated measured gate and corridor bearings never understate the fixed rim envelope',()=>{
  for(const rotation of [0,.4,Math.PI/2,Math.PI]) for(const bearing of [0,90,149,270]) {
    const g=gate();g.rot=rotation;g.data.corridorBearingDeg=bearing;
    const outer=proxyOuterRadiusWu(resolveCollisionProxyManifest(g),g);
    for(let a=-.3;a<1.5;a+=.01){const p=target(worker(a),[g]);assert.ok(Math.hypot(p.x-g.pos.x,p.z-g.pos.z)>outer+20);}
  }
});
test('invalid or removed native bodies use current authored geometry without throwing',()=>{
  const e=worker(.78),g=gate();
  for(const body of [undefined,{}, {isDynamic:()=>false,translation:()=>({x:NaN,z:NaN})}, {isValid:()=>false,isEnabled:()=>true,isDynamic:()=>false,translation:()=>({x:NaN,z:NaN})}]) {
    const native={records:new Map([[g.id,{entity:g,body}]])};assert.deepEqual(target(e,[g],native),target(e,[g]));
  }
});

import {anvilReceiverFixture,relocateAnvilObserver,receiverContactDepth} from './fixtures/anvil-receiver-native.mjs';
test('constructed native gate approach clears the real rim and resumes real harvest',async()=>{
  const f=await anvilReceiverFixture();try {
    const e=f.actor('collector'),c=e.data.itinerary.center;
    const fixed=f.state.entityList.find(x=>x.data?.isGate&&Math.hypot(x.pos.x-c.x,x.pos.z-c.z)<1100);
    assert.ok(fixed,'actual authored gate, not an entity-id fixture');
    const a=Math.atan2(fixed.pos.z-c.z,fixed.pos.x-c.x)+.65;
    // Construct initial approach once. After this arrangement only production intents
    // and physics advance the worker; no body exemption, forced route or cargo writes.
    Object.assign(e.pos,{x:c.x+980*Math.cos(a),z:c.z+980*Math.sin(a)});
    Object.assign(e.vel,{x:70*Math.sin(a),z:-70*Math.cos(a)});
    e.rot=a-Math.PI/2;e.data.itinerary.phase='collect';
    const n=f.physics._sg02,r=n.records.get(e.id),o=n.getFrameOrigin();
    r.body.setTranslation({x:e.pos.x-o.x,y:0,z:e.pos.z-o.z},true);
    r.body.setLinvel({x:e.vel.x,y:0,z:e.vel.z},true);
    r.body.setRotation({x:0,y:-Math.sin(e.rot/2),z:0,w:Math.cos(e.rot/2)},true);
    const original=e,initialHull=e.hull;let crossed=false,leftBand=false;
    for(let i=0;i<1440;i++) {
      if(i%120===0)relocateAnvilObserver(f,e);
      const priorRadius=Math.hypot(e.pos.x-c.x,e.pos.z-c.z),priorQty=e.data.cargoManifest.totalQty;
      f.step();assert.equal(f.actor('collector'),original);
      const contacts=receiverContactDepth(f.physics,e);
      for(const hit of contacts.contacts||[]) if(!hit.dynamic)assert.ok(hit.distance>=0,`fixed contact at ${i/60}: ${hit.distance}`);
      const angle=Math.atan2(e.pos.z-c.z,e.pos.x-c.x);
      crossed ||= angle<Math.atan2(fixed.pos.z-c.z,fixed.pos.x-c.x)-.2;
      const currentRadius=Math.hypot(e.pos.x-c.x,e.pos.z-c.z);
      leftBand ||= currentRadius>1040;
      if(priorRadius>1058&&currentRadius>1058)assert.equal(e.data.cargoManifest.totalQty,priorQty,'no gas outside actual hysteretic skim edge');
    }
    assert.equal(crossed,true);assert.equal(leftBand,true);
    assert.equal(e.hull,initialHull);assert.ok(e.data.cargoManifest.totalQty>0,'actual gas after returning to shallow band');
  } finally {f.close();}
});

test('near-home band exit ends inside service forecourt; far bearings retain outer return arc',()=>{
  for(const a of [-.35,-.0065,0,.2,.35])assert.ok(Math.abs(radius(anvilBandExitTarget(worker(a)))-2640)<1e-8);
  for(const a of [-Math.PI,-.351,.351,Math.PI])assert.ok(Math.abs(radius(anvilBandExitTarget(worker(a)))-2800)<1e-8);
});
test('native near-home radial exit reaches existing service point without striking original tender',async()=>{
 const f=await anvilReceiverFixture();try {
  const e=f.actor('collector'),receiver=f.actor('receiver'),c=e.data.itinerary.center,a=-.0065;
  Object.assign(e.pos,{x:c.x+2400*Math.cos(a),z:c.z+2400*Math.sin(a)});
  Object.assign(e.vel,{x:70*Math.cos(a),z:70*Math.sin(a)});e.rot=a;e.data.itinerary.phase='clear_band';
  const n=f.physics._sg02,r=n.records.get(e.id),o=n.getFrameOrigin();
  r.body.setTranslation({x:e.pos.x-o.x,y:0,z:e.pos.z-o.z},true);r.body.setLinvel({x:e.vel.x,y:0,z:e.vel.z},true);r.body.setRotation({x:0,y:-Math.sin(a/2),z:0,w:Math.cos(a/2)},true);
  let berthed=false;
  for(let i=0;i<2400&&!berthed;i++) {
   if(i%120===0)relocateAnvilObserver(f,e);f.step();
   for(const hit of receiverContactDepth(f.physics,e).contacts||[])if(!hit.dynamic||hit.targetEntity===receiver)assert.ok(hit.distance>=0,'actual fixed/original-pair clearance');
   berthed=e.data.itinerary.phase==='berthed';
  }
  assert.equal(berthed,true,'physical service arrival, not radial target stuck behind yield');
  assert.equal(e.hull,200);assert.equal(receiver.hull,200);assert.equal(e.data.cargoManifest.totalQty,0,'empty constructed worker was not granted cargo');
 }finally{f.close();}
});
