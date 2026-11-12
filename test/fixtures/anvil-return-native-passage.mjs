// Opt-in: SEEDED_LOAD=12 node test/fixtures/anvil-return-native-passage.mjs
// Isolated real-native gate passage; not the production fullshift/arrival route.
import assert from 'node:assert/strict';
import { anvilReceiverFixture, receiverContactDepth } from './anvil-receiver-native.mjs';
import { createSimulation,SIM_DT } from '../../src/core/sim.js';
import { traffic } from '../../src/systems/traffic.js';
import { physics } from '../../src/core/physics.js';
import { flightV3 } from '../../src/systems/flightV3.js';
import { fields } from '../../src/systems/fields.js';
import { planetRuntime } from '../../src/systems/planetRuntime.js';
import { world } from '../../src/systems/world.js';
import { PLANET_FLAGS,PLANET_SITE } from '../../src/data/planets.js';
import { FIELD_FLAGS } from '../../src/data/fields.js';
import { anvilWorkerRecordId } from '../../src/systems/anvilWork.js';
const full=await anvilReceiverFixture(); let gateSpec;
try{const g=full.state.entities.get(3);gateSpec=JSON.parse(JSON.stringify({type:g.type,pos:g.pos,rot:g.rot,radius:g.radius,mass:g.mass,data:g.data,physicsBody:g.physicsBody,collides:g.collides,hull:g.hull,hullMax:g.hullMax,team:g.team}));}finally{full.close();}
PLANET_FLAGS.enabled=true;FIELD_FLAGS.enabled=true;
const trafficWork={...traffic,update(dt,state){this._stepAnvilWork(dt,state);}};
const worldRecords={name:'world',init(ctx){this.state=ctx.state;},upsertWorldRecord:world.upsertWorldRecord};
const sim=createSimulation({seed:47,systems:[worldRecords,trafficWork,fields,planetRuntime,flightV3,physics]});
try{
 const state=sim.state;state.mode='flight';state.world.currentSectorId=PLANET_SITE.sectorId;state.settings.gameplay.physicsBackend='rapier-dynamic';sim.step();
 const c=state.entityList.find(e=>e.data?.worldRecordId===anvilWorkerRecordId(state,'collector'));
 const center=c.data.itinerary.center,gate=sim.spawn(gateSpec),a=Math.atan2(gate.pos.z-center.z,gate.pos.x-center.x),start=a+.3;
 c.pos={x:center.x+Math.cos(start)*2800,z:center.z+Math.sin(start)*2800};c.vel={x:Math.sin(start)*70,z:-Math.cos(start)*70};c.rot=start-Math.PI/2;c.data.itinerary.phase='return';
 // Reduced-system counterexample: actual authored gate/collector proxies, ordinary
 // FlightV3, fields and native contacts. No ambient generators, cargo grants or
 // participant writes after initial placement. Not ordinary world/fullshift proof.
 const observer=sim.spawn({type:'ship',isPlayer:true,team:0,pos:{x:c.pos.x-450,z:c.pos.z},collides:false,physicsBody:false,hull:100});state.playerId=observer.id;
 const p=sim.registry.get('physics');assert.equal(await p.prepareBackend(state),true);
 const nativeMassBefore=p._sg02.records.get(c.id).body.mass();
 if(process.env.SEEDED_LOAD==='12') {
   // Explicit finite-load fixture control, NOT naturally harvested cargo.
   const manifest={...c.data.cargoManifest,lines:[{commodityId:PLANET_SITE.harvest.commodityShallow,qty:12}],totalQty:12};
   sim.registry.get('traffic')._setTrafficManifest(c,state.traffic.freighters.find(r=>r.id===c.id),manifest);
 }
 const initialManifest=JSON.stringify(c.data.cargoManifest);
 console.log('SETUP',JSON.stringify({center,gate:gate.pos,gateProxy:p._sg02.records.get(gate.id)?.colliders.length,collectorProxy:p._sg02.records.get(c.id)?.colliders.length,start:c.pos,hull:c.hull,seededLoad:c.data.cargoManifest.totalQty,nativeMassBefore,nativeMassAfter:p._sg02.records.get(c.id).body.mass()}));
 let min=Infinity,closest=Infinity,passed=false,i=0;
 for(;i<60*75;i++){
  observer.pos.x=c.pos.x-450;observer.pos.z=c.pos.z;
  sim.step(SIM_DT);
  const contact=receiverContactDepth(p,c);if(contact.distance!=null)min=Math.min(min,contact.distance);
  closest=Math.min(closest,Math.hypot(c.pos.x-gate.pos.x,c.pos.z-gate.pos.z));
  if(i%300===0)console.log('TRACE',JSON.stringify({i,pos:c.pos,vel:c.vel,phase:c.data.itinerary.phase,contact:contact.distance}));
  if(contact.distance!=null&&contact.distance<-.4){console.log('HIT',JSON.stringify({i,target:contact.targetId,distance:contact.distance,pos:c.pos}));break;}
  const angle=Math.atan2(c.pos.z-center.z,c.pos.x-center.x),relative=Math.atan2(Math.sin(angle-a),Math.cos(angle-a));
  if(relative<-.3){passed=true;break;}
 }
 console.log('RESULT',JSON.stringify({steps:i,seconds:i/60,passed,closest,minContact:Number.isFinite(min)?min:null,hull:c.hull,cargo:c.data.cargoManifest.totalQty,cargoUnchanged:JSON.stringify(c.data.cargoManifest)===initialManifest,nativeMass:p._sg02.records.get(c.id).body.mass(),pos:c.pos}));
 assert.ok(passed,'crosses actual gate bearing');assert.ok(min>=-.4,'unmodified contact tolerance');
}finally{sim.dispose();}
