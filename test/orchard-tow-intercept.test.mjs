import test from 'node:test';
import assert from 'node:assert/strict';
import {orchardTowIntercept} from '../src/systems/orchardTowIntercept.js';
import {createSimulation} from '../src/core/sim.js';
import {flightV3} from '../src/systems/flightV3.js';
import {makeShipEntitySpec} from '../src/systems/ships.js';
import {resolvePropulsionProfile} from '../src/core/flight/propulsionCatalog.js';
import {consumePhysicsCommand} from '../src/core/physicsAuthority.js';
const DT=1/60;
function fixture({x=0,z=0,vx=0,vz=0,rot=0,targetVel={x:0,z:0}}={}){
 const sim=createSimulation({seed:42,systems:[flightV3]});const state=sim.state;
 state.mode='flight';state.settings.gameplay.physicsBackend='rapier-dynamic';state.settings.controls.flightMode='assisted';
 const hull=sim.spawn(makeShipEntitySpec('ship_mule',{pos:{x,z},rot}));hull.vel.x=vx;hull.vel.z=vz;
 const target={pos:{x:1000,z:0},vel:targetVel,radius:2.2},destination={x:2000,z:0};
 const profile=resolvePropulsionProfile(hull,state),flight=sim.registry.get('flight');
 const command=()=>orchardTowIntercept(hull,target,destination,profile,390);
 const step=()=>{const c=command();flight._stepCraft(hull,c,DT,state,false);return {c,p:consumePhysicsCommand(hull)?.control};};
 return {sim,state,hull,target,destination,profile,command,step};
}
test('Orchard rejects invalid capability, degenerate destination and unavailable drive',()=>{
 const f=fixture();try{for(const [profile,reach,dest] of [[f.profile,NaN,f.destination],[{...f.profile,mainAccel:0},390,f.destination],[f.profile,390,f.target.pos]]){
  const c=orchardTowIntercept(f.hull,f.target,dest,profile,reach);assert.equal(c.ready,false);assert.equal(c.brake,true);assert.equal(c.moveZ,0);
 }}finally{f.sim.dispose();}
});
test('Orchard exact390 center reach and outward quiet-speed guard remain real',()=>{
 const f=fixture({x:1380});try{assert.equal(f.command().ready,true);f.hull.vel.x=-20;assert.equal(f.command().ready,false);f.hull.vel.x=0;f.hull.pos.x=1391;assert.equal(f.command().ready,false);f.hull.pos.x=620;assert.equal(f.command().ready,false);
 }finally{f.sim.dispose();}
});
test('actual NPC adapter applies slew and yaw rather than instantaneous input',()=>{
 const f=fixture({rot:Math.PI/2});try{const {c,p}=f.step();assert.ok(Math.abs(f.hull.data.propulsionRuntime.cmdThrottle)<=2.6*DT+1e-9);assert.ok(Math.abs(f.hull.data.propulsionRuntime.cmdStrafe)<=2.6*DT+1e-9);assert.ok(Number.isFinite(p.force.x)&&Number.isFinite(p.force.z));assert.notEqual(p.torque.y,0);assert.equal(c.ready,false);
 }finally{f.sim.dispose();}
});
test('actual forward overspeed near a quiet capture uses physical pilot brake',()=>{
 const f=fixture({x:1430,vx:-100,rot:Math.PI});try{const {c,p}=f.step();assert.equal(c.brake,true);assert.ok(p.force.x>0,'force opposes the real inward velocity');assert.equal(c.ready,false);
 }finally{f.sim.dispose();}
});
test('actual moving-target positive input commands the speed ceiling, not an acceleration error',()=>{
 const f=fixture({vx:100,targetVel:{x:110,z:0}});try{
  const c=f.command();assert.equal(c.brake,false);assert.equal(c.ready,false);
  for(let i=0;i<60;i++)f.step();const {p}=f.step();assert.ok(p.maxSpeed>=100,'positive demand must not cap a100WU/s worker at24WU/s');assert.ok(p.force.x>=0);assert.ok(Number.isFinite(p.maxSpeed));
 }finally{f.sim.dispose();}
});
test('rotated lateral command stays finite under actual thruster authority',()=>{
 const f=fixture({vx:0,vz:30,rot:Math.PI/2,targetVel:{x:20,z:0}});try{
  for(let i=0;i<60;i++){const {p}=f.step();assert.ok(Number.isFinite(p.force.x)&&Number.isFinite(p.force.z));assert.ok(Math.hypot(p.force.x,p.force.z)/f.hull.mass<Math.hypot(f.profile.mainAccel,f.profile.strafeAccel)*f.profile.boostAccelMult+1);}
 }finally{f.sim.dispose();}
});
// Isolated drive-response integration, not a native collision/field or recovery proof.
function integrateDrive(f){
 const {c,p}=f.step();
 f.hull.vel.x+=p.force.x/f.hull.mass*DT;f.hull.vel.z+=p.force.z/f.hull.mass*DT;
 f.hull.pos.x+=f.hull.vel.x*DT;f.hull.pos.z+=f.hull.vel.z*DT;
 const inertia=f.hull.physicsBody?.inertiaY||f.hull.inertia||f.hull.mass;
 f.hull.angVel=(f.hull.angVel||0)+p.torque.y/inertia*DT;f.hull.rot+=f.hull.angVel*DT;
 f.target.pos.x+=f.target.vel.x*DT;f.target.pos.z+=f.target.vel.z*DT;
 f.state.tick++;f.state.simTime+=DT;return c;
}
test('actual drive reaches quiet capture without resetting velocity or target position',()=>{
 const f=fixture({x:2200,rot:Math.PI});try{
  let ready=false;for(let i=0;i<1800&&!ready;i++)ready=integrateDrive(f).ready;
  assert.ok(ready);assert.ok(Math.hypot(f.hull.vel.x,f.hull.vel.z)<=8.2);assert.ok(Math.hypot(f.hull.pos.x-f.target.pos.x,f.hull.pos.z-f.target.pos.z)<=390);
 }finally{f.sim.dispose();}
});
test('actual drive matches a moving load instead of braking it to world zero',()=>{
 const f=fixture({x:1370,targetVel:{x:20,z:0}});try{
  let ready=false;for(let i=0;i<600&&!ready;i++)ready=integrateDrive(f).ready;
  assert.ok(ready);assert.ok(f.hull.vel.x>12);assert.ok(Math.hypot(f.hull.vel.x-20,f.hull.vel.z)<=8.2);
 }finally{f.sim.dispose();}
});
test('Orchard rejects nonfinite motion and preserves every caller-owned object',()=>{
 const f=fixture();try{
  const before=structuredClone({hull:f.hull,target:f.target,destination:f.destination,profile:f.profile});f.command();
  assert.deepEqual(structuredClone({hull:f.hull,target:f.target,destination:f.destination,profile:f.profile}),before);
  for(const [object,key,value] of [[f.hull.pos,'x',Infinity],[f.hull.vel,'x',NaN],[f.target.vel,'z',Infinity],[f.destination,'x',NaN],[f.hull,'rot',Infinity]]){
   const original=object[key];object[key]=value;const c=f.command();assert.equal(c.ready,false);assert.equal(c.brake,true);assert.ok(Object.values(c).every(v=>typeof v==='boolean'||Number.isFinite(v)));object[key]=original;
  }
  f.hull.pos.x=1180;assert.equal(orchardTowIntercept(f.hull,f.target,f.destination,f.profile,200).ready,true);
  f.hull.pos.x=1370;assert.equal(orchardTowIntercept(f.hull,f.target,f.destination,f.profile,200).ready,false);
 }finally{f.sim.dispose();}
});

test('observed inward drift stays braking inside the real safe acquisition band',()=>{
 const f=fixture({x:1348.7,vx:-16.1});try{
  assert.equal(f.command().brake,true);assert.equal(f.command().ready,false);
  f.hull.vel.x=-7.9;assert.equal(f.command().ready,true);
  f.hull.pos.x=1000+f.hull.radius+f.target.radius+19.9;assert.equal(f.command().ready,false);
  f.hull.pos.x=651.3;assert.equal(f.command().ready,false);
 }finally{f.sim.dispose();}
});
