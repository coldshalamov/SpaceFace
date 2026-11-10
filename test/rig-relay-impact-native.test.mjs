import {installRelayCargoImpacts} from "../src/features/rigWorkshop/cargoImpact.js";
import {createSimulation} from '../src/core/sim.js';
import {physics} from '../src/core/physics.js';
import {economy} from '../src/systems/economy.js';
import {combat} from '../src/systems/combat.js';
import {collisionConsequences} from '../src/systems/collisionConsequences.js';
import {createRigPhysicsAdapter} from '../src/features/rigWorkshop/physics.js';
import {createWorkshopJobs} from '../src/features/rigWorkshop/jobs.js';
import {queuePhysicsImpulse} from '../src/core/physicsAuthority.js';
import {PRODUCTION_FEATURES} from '../src/runtime/runtimeProfiles.js';
import {applyFeatureConfigToMaps} from '../src/data/featureFlags.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {captureRigWorkshop,restoreRigWorkshop} from '../src/features/rigWorkshop/persistence.js';
import {snapshotFeatureMaps,restoreFeatureMaps} from '../src/data/featureFlags.js';
const flags=snapshotFeatureMaps();applyFeatureConfigToMaps(PRODUCTION_FEATURES);test.after(()=>restoreFeatureMaps(flags));
async function fixture(empty=false,pair=false){

const sim=createSimulation({seed:8202,systems:[economy,physics,combat,collisionConsequences]});

const s=sim.state;s.mode='flight';s.world.currentSectorId='sector_ceres_belt';s.settings.gameplay.physicsBackend='rapier-dynamic';
const player=sim.spawn({type:'ship',pos:{x:0,z:0},vel:{x:0,z:0},radius:8,mass:100,hull:1000,hullMax:1000,collides:true});s.playerId=player.id;
const p=sim.registry.get('physics');await p.prepareBackend(s);
const adapter=createRigPhysicsAdapter(sim.registry.ctx);
const w=s.rigWorkshop={version:1,ownerId:'pilot:8202',bench:{pos:{x:0,z:0},sectorId:s.world.currentSectorId},rigs:[],stock:8,jobs:{},receipts:[]};
adapter.ensureTemplates(w);
function tick(){s.tick++;s.simTime=s.tick/60;p.update(1/60,s);sim.registry.get('combat').update(1/60,s);sim.registry.get('collisionConsequences').update(1/60,s);}
for(let i=0;i<3;i++)tick();
if(empty){installRelayCargoImpacts(sim.registry.ctx);return {s,sim,p,adapter,w,tick,close(){p._disableSg02DynamicAuthority();adapter.dispose();sim.dispose();}};}
const jobs=createWorkshopJobs({state:s,bus:sim.bus,physics:adapter});w.jobs={needle:{settled:true,delivered:[1]},kiln:{settled:true,delivered:[2]}};
assert.equal(jobs.accept(w,'relay').ok,true);delete w.jobs.needle;delete w.jobs.kiln;
const cargo=w.jobs.relay.cargo.map(r=>s.entities.get(r.id));
player.pos={x:2900,z:100};
const impacts=[];sim.bus.on('physics:impact',x=>{if(cargo.some(e=>e.id===x.aId||e.id===x.bId))impacts.push({...x})});
const damage=[];sim.bus.on('combat:damage',x=>damage.push({...x}));
const off=installRelayCargoImpacts(sim.registry.ctx);
sim.bus.on('entity:killed',r=>jobs.recordLoss(w,r));
// Staged collision lanes, retaining original bodies. Test initial geometry only.
for(let i=0;i<cargo.length;i++){
 const e=cargo[i];e.pos={x:3000+(pair?i*34:0),z:pair?0:i*200};e.vel={x:0,z:0};
 sim.spawn({type:'payload',pos:{x:pair?3200:3034,z:i*200},vel:{x:0,z:0},radius:24,mass:1000,hull:1000,hullMax:1000,collides:true,flags:{invuln:true},physicsBody:{schemaVersion:1,dynamic:false,shape:'ball',radius:24,mass:1000,material:'wreck',revision:0},data:{name:'Test freight frame'}});
}
for(let i=0;i<3;i++)tick();
return {s,sim,p,adapter,w,jobs,cargo,impacts,damage,tick,off,close(){p._disableSg02DynamicAuthority();adapter.dispose();sim.dispose();}};
}

function run(h,impulse){for(const e of h.cargo)queuePhysicsImpulse(e,{x:impulse(e),z:0});for(let i=0;i<240;i++)h.tick();}
function quote(h){
 // Receipt boundary only: transport/admission tested separately. Do not alter damaged hull.
 h.s.entities.get(h.s.playerId).pos={...h.w.jobs.relay.destination};
 for(const r of h.w.jobs.relay.cargo){const e=h.s.entities.get(r.id);e.pos={...h.w.jobs.relay.destination};e.vel={x:0,z:0};e.angVel=0;r.collectedByRig=h.w.rigs[0].id;r.travelled=200;}
 return h.jobs.deliveryQuote(h.w);
}
test('native relay shock: gentle contacts are harmless, equal impulse hurts lighter original more',async()=>{
 const gentle=await fixture();try{run(gentle,e=>e.mass*4);assert.ok(gentle.impacts.length>0);assert.deepEqual(gentle.cargo.map(e=>e.hull),[90,180]);}finally{gentle.close();}
 const hard=await fixture();try{
  let replayed=false;
  hard.sim.bus.on('combat:damage',()=>{if(!replayed){replayed=true;const r=hard.impacts.at(-1);if(r)hard.sim.bus.emit('physics:impact',r);}});
  run(hard,()=>900);
  assert.ok(hard.cargo[0].hull<90);assert.ok(hard.cargo[1].hull<180);
  assert.ok(hard.cargo[0].hull/90<hard.cargo[1].hull/180);
  assert.equal(replayed,true);
  assert.equal(hard.damage.filter(r=>r.targetId===hard.cargo[0].id).length,1);
  assert.equal(hard.damage.filter(r=>r.targetId===hard.cargo[1].id).length,1);
  const preview=quote(hard);assert.equal(preview.accepted.length,2);assert.ok(preview.accepted[0].amount<preview.accepted[1].amount);
  const credits=hard.s.player.credits;const expected=preview.accepted.reduce((sum,r)=>sum+r.amount,0);
  assert.equal(hard.jobs.deliver(hard.w).ok,true);assert.equal(hard.s.player.credits-credits,expected);
  assert.equal(hard.jobs.deliver(hard.w).ok,false);assert.equal(hard.s.player.credits-credits,expected);
 }finally{hard.close();}
});
test('native shock ignores paid originals; damaged hull cold-restores without new damage',async()=>{
 const h=await fixture(),cold=await fixture(true);try{
  h.w.jobs.relay.cargo[1].paid=true;run(h,()=>900);
  assert.ok(h.cargo[0].hull<90);assert.equal(h.cargo[1].hull,180);
  // The receiving job still owns the damaged original, not a new pristine replacement.
  h.w.jobs.relay.cargo[1].paid=false;
  delete h.w.jobs.needle;delete h.w.jobs.kiln;
  const saved=JSON.parse(JSON.stringify(captureRigWorkshop(h.s)));
  const result=restoreRigWorkshop(cold.s,saved,cold.adapter);assert.equal(result.ok,true,result.reason);
  const original=cold.s.entities.get(cold.s.rigWorkshop.jobs.relay.cargo[0].id);assert.equal(original.hull,h.cargo[0].hull);
  const before=original.hull;for(let i=0;i<3;i++)cold.tick();assert.equal(original.hull,before);
 }finally{h.close();cold.close();}
});

test('native relay shock excludes foreign custody',async()=>{
 const h=await fixture();try{h.cargo[0].data.rigWorkshopCargo.ownerId='foreign';h.cargo[1].data.rigWorkshopOwner='foreign';run(h,()=>900);assert.ok(h.impacts.length>=2);assert.deepEqual(h.cargo.map(e=>e.hull),[90,180]);assert.equal(h.damage.length,0);}finally{h.close();}
});

test('repeated native slam loses original and cannot pay; disposed subscription applies no damage',async()=>{
 const h=await fixture();try{run(h,()=>900);run(h,()=>900);assert.equal(h.cargo[0].alive,false);assert.equal(h.w.jobs.relay.cargo[0].lost,true);const q=quote(h);assert.ok(!q.accepted.some(r=>r.id===h.cargo[0].id));}finally{h.close();}
 const stopped=await fixture();try{stopped.off();run(stopped,()=>900);assert.ok(stopped.impacts.length>=2);assert.deepEqual(stopped.cargo.map(e=>e.hull),[90,180]);assert.equal(stopped.damage.length,0);}finally{stopped.close();}
});

test('native relay pair callback cannot redirect the second damage into a replacement life',async()=>{
 const h=await fixture(false,true);try{
  let replacement=null;
  h.sim.bus.on('combat:damage',r=>{if(r.targetId===h.cargo[0].id&&!replacement){replacement={...h.cargo[1],hull:180,occupantGeneration:h.cargo[1].occupantGeneration+1};h.s.entities.set(replacement.id,replacement);}});
  queuePhysicsImpulse(h.cargo[0],{x:900,z:0});for(let i=0;i<90&&!replacement;i++)h.tick();
  assert.ok(replacement,'real original-original impact invokes callback');assert.equal(replacement.hull,180);
  assert.equal(h.damage.filter(r=>r.targetId===replacement.id).length,0);
 }finally{h.close();}
});
