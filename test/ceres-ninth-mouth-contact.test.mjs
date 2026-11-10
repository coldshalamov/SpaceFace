import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { writePhysicsControl, physicsBodyNativeReady } from '../src/core/physicsAuthority.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { CERES_NINTH_MOUTH as CUT, worldPoint, localPoint } from '../src/data/ceresNinthMouth.js';
import { ninthMouthBodySpec } from '../src/world/ceresNinthMouthBodies.js';

// STAGED GEOMETRY PROOF. This is the production native physics owner and exact
// authored cohort, but forces are test-pilot forces, not raw input or a tow line.
// Production admission/player-route proof is ceres-ninth-mouth-native.test.mjs.
const DT=1/60;
let featureSnapshot;
test.before(()=>{featureSnapshot=snapshotFeatureMaps();applyFeatureConfigToMaps(PRODUCTION_FEATURES);});
test.after(()=>restoreFeatureMaps(featureSnapshot));
async function fixture() {
  const sim=createSimulation({seed:47,systems:[physics]});
  const s=sim.state;s.mode='flight';s.world.currentSectorId=CUT.sectorId;
  s.settings.gameplay.physicsBackend='rapier-dynamic';
  const bodies=new Map([...CUT.definitions.map(d=>d.role),'barge'].map(role=>[role,sim.spawn(ninthMouthBodySpec(role))]));
  const owner=sim.registry.get('physics');
  assert.equal(await owner.prepareBackend(s),true);
  const step=control=>{s.tick++;s.simTime=s.tick*DT;control?.();
    owner._sg02.syncFromEntities(s.entityList);owner._sg02.step(DT,s.tick);};
  step();step();
  for(const b of bodies.values()){assert.ok(physicsBodyNativeReady(b));assert.ok(owner._sg02.records.has(b.id));}
  return {sim,s,bodies,owner,step};
}
function steer(body,local,speed=12) {
  const goal=worldPoint(local),dx=goal.x-body.pos.x,dz=goal.z-body.pos.z,d=Math.hypot(dx,dz);
  const desired=Math.min(speed,d*1.3),ax=(dx/Math.max(.001,d)*desired-body.vel.x)*2,
    az=(dz/Math.max(.001,d)*desired-body.vel.z)*2,scale=Math.min(1,8/Math.max(.001,Math.hypot(ax,az)));
  writePhysicsControl(body,{source:'ninth-mouth-staged-native-pilot',
    force:{x:ax*scale*body.mass,y:0,z:az*scale*body.mass},
    torque:{x:0,y:-body.angVel*(body.physicsBody?.inertiaY||body.mass)*4,z:0},maxSpeed:speed});
}
function distance(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
function pairGap(f,a,b){
  const aa=f.owner._sg02.records.get(a.id).colliders,bb=f.owner._sg02.records.get(b.id).colliders;
  let gap=Infinity;
  for(const ca of aa)for(const cb of bb){const c=ca.contactCollider(cb,.2);if(c)gap=Math.min(gap,c.distance);}
  return gap;
}
function travel(f,body,target,maxTicks=3000){
  for(let i=0;i<maxTicks;i++){f.step(()=>steer(body,target));if(distance(localPoint(body.pos),target)<2)return i+1;}
  assert.fail(`native travel stopped at ${JSON.stringify(localPoint(body.pos))}; target ${JSON.stringify(target)}`);
}

test('staged native Ironback clears the authored throat to the outside rescue berth',async t=>{
  const f=await fixture(),barge=f.bodies.get('barge'),rock=f.bodies.get('fallen_rock');
  const fixed=['shoulder_north','shoulder_south'].map(r=>f.bodies.get(r)),original=fixed.map(b=>({...b.pos}));
  assert.ok(pairGap(f,barge,rock)>=0,'no initial barge/rock penetration');
  const ticks=travel(f,barge,CUT.berth.local);
  for(let i=0;i<fixed.length;i++)assert.deepEqual({...fixed[i].pos},original[i]);
  assert.ok(distance(localPoint(barge.pos),CUT.berth.local)<2);
  t.diagnostic(JSON.stringify({proof:'staged native force, no tow input',ticks,barge:localPoint(barge.pos),rock:localPoint(rock.pos)}));
});

test('wrong-angle native force on barge contacts and displaces the loose rock',async t=>{
  const f=await fixture(),barge=f.bodies.get('barge'),rock=f.bodies.get('fallen_rock');
  const start={...rock.pos};
  for(let i=0;i<120;i++)f.step();
  assert.ok(distance(rock.pos,start)<.05,'unforced obstruction stays still before shove');
  let witnessed=false,maxRockSpeed=0;
  for(let i=0;i<300;i++){
    // Only the barge receives control. Rock motion must come from contact.
    f.step(()=>steer(barge,{x:100,z:44},6));
    witnessed ||= pairGap(f,barge,rock)<=.2;
    maxRockSpeed=Math.max(maxRockSpeed,Math.hypot(rock.vel.x,rock.vel.z));
  }
  const moved=distance(rock.pos,start);
  t.diagnostic(JSON.stringify({contact:witnessed,rockDisplacement:moved,maxRockSpeed,barge:localPoint(barge.pos),rock:localPoint(rock.pos)}));
  assert.equal(witnessed,true,'actual native collider pair contacts');
  assert.ok(moved>1,'wrong-angle barge shove changes actual obstruction');
  assert.ok(maxRockSpeed>.2);
});

test('reverse side is a native traversable opening, not a sealed tunnel proxy',async t=>{
  const f=await fixture(),barge=f.bodies.get('barge');let ticks=0;
  for(const point of CUT.route.reverseEscape.slice(0,3))ticks+=travel(f,barge,point);
  assert.ok(distance(localPoint(barge.pos),CUT.route.reverseEscape[2])<2);
  t.diagnostic(JSON.stringify({proof:'staged native reverse-side traversal',ticks,barge:localPoint(barge.pos)}));
});

test('all three original lamps can physically travel from apron to their service marks',async t=>{
  const f=await fixture(),receipts=[];
  for(const seat of CUT.lamps){
    const lamp=f.bodies.get(seat.role),originalId=lamp.id,originalGeneration=lamp.occupantGeneration;
    // Staged pilot brings each original around the lip before heading downcut.
    // Waypoints command native force, never assign a pose or replace the body.
    let ticks=0;
    for(const p of [{x:-165,z:-65},{x:-165,z:seat.local.z},seat.local])ticks+=travel(f,lamp,p);
    for(let i=0;i<180;i++)f.step(()=>steer(lamp,seat.local,3));
    const error=distance(localPoint(lamp.pos),seat.local);
    assert.equal(lamp.id,originalId);assert.equal(lamp.occupantGeneration,originalGeneration);
    assert.ok(error<seat.seatRadius,`${seat.role} actual body center is inside its authored mark`);
    assert.ok(Math.hypot(lamp.vel.x,lamp.vel.z)<seat.maxSpeed,'lamp can physically settle');
    let deepest=0;
    for(const other of f.bodies.values())if(other!==lamp)deepest=Math.min(deepest,pairGap(f,lamp,other));
    assert.ok(deepest>-.05,`${seat.role} seats without native collider penetration`);
    receipts.push({role:seat.role,ticks,center:localPoint(lamp.pos),error,deepest});
  }
  t.diagnostic(JSON.stringify({proof:'staged native lamp transport; no raw-input claim',receipts}));
});
