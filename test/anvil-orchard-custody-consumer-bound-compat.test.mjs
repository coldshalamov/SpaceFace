import test from 'node:test';import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {physics} from '../src/core/physics.js';
import {save} from '../src/save/saveSystem.js';
import {asteroidSites} from '../src/systems/asteroidSites.js';
import {environmentalMachinery} from '../src/systems/environmentalMachinery.js';
import {createOrchardMotorState} from '../src/core/anvilOrchardNative.js';
import {ORCHARD_GEOMETRY as G,orchardFrameBodySpec} from '../src/data/anvilOrchardBody.js';
import {ANVIL_ORCHARD,createOrchardRecord,normalizeOrchardRecord} from '../src/data/anvilOrchard.js';
async function setup(){
 const sim=createSimulation({systems:[asteroidSites,physics,environmentalMachinery,save]});sim.state.mode='flight';sim.state.world.currentSectorId=ANVIL_ORCHARD.sectorId;
 const worker=sim.spawn({type:'ship',pos:{x:14000,z:9000},radius:6,hull:100,data:{defId:'ship_kestrel',fittings:[],anvilSlingWitness:true,itinerary:{kind:'anvil_work',role:'collector',phase:'collect'}}});sim.state.playerId=worker.id;
 const frame=sim.spawn({type:'wreck',pos:{x:13200,z:8300},rot:.713,radius:G.radius,hull:300,flags:{persistent:true},physicsBody:orchardFrameBodySpec(),data:{orchardId:ANVIL_ORCHARD.id,orchardKind:'frame',worldRecordId:G.worldRecordId,masslineTetherable:false,orchardCollars:createOrchardMotorState()}});
 const facade=sim.registry.get('physics');assert.equal(await facade.prepareBackend(sim.state),true);sim.state.sites.anvilOrchard=createOrchardRecord(0);
 const machine=sim.registry.get('environmentalMachinery');return{sim,facade,machine,worker,frame,owner:facade._sg02,accept(qty=4,socket=1){return machine.acceptOrchardNewPod(worker,{frame,socket,qty,commodityId:ANVIL_ORCHARD.commodityId});},close(){sim.dispose();}};
}
test('finite insertion debits exactly one partial lot and publishes a real fixed pod',async()=>{
 const h=await setup();try{const prior=h.sim.state.sites.anvilOrchard;assert.equal(h.accept(2),2);const row=h.sim.state.sites.anvilOrchard,pod=h.sim.state.entityList.find(e=>e.data?.orchardKind==='pod');
  assert.notEqual(row,prior);assert.equal(prior.sourceRemaining,48);assert.equal(row.sourceRemaining,46);assert.equal(row.lots.length,1);assert.equal(row.lots[0].units,2);assert.equal(pod.data.amount,2);assert.equal(h.owner.records.get(pod.id).body.isFixed(),true);assert.deepEqual(h.frame.data.orchardCollars.cycles,[0,1,0]);assert.ok(normalizeOrchardRecord(row));assert.equal(h.accept(),0);
 }finally{h.close();}
});
for(const failure of ['gust','worker-copy','worker-life','row-copy','row-in-place','same-id-claim'])test(`finite insertion preserves stock on ${failure} refusal`,async()=>{
 const h=await setup();try{const prior=h.sim.state.sites.anvilOrchard;let claim;
  if(failure==='gust')h.sim.state.tick=720;
  if(failure==='worker-copy')h.sim.state.entities.set(h.worker.id,{...h.worker});
  if(!['gust','worker-copy'].includes(failure))h.owner._syncCeresWorkfleetRecord=function(rec){if(failure==='worker-life')h.sim.state.entities.set(h.worker.id,{...h.worker,occupantGeneration:h.worker.occupantGeneration+1});if(failure==='row-copy')h.sim.state.sites.anvilOrchard=structuredClone(prior);if(failure==='row-in-place')prior.phaseAnchorTick=1;if(failure==='same-id-claim'){claim=h.sim.spawn({id:rec.entity.id,type:'fx',physicsBody:false,data:{foreign:true}});}};
  assert.equal(h.accept(),0);assert.equal(h.sim.state.sites.anvilOrchard.sourceRemaining,48);assert.equal(h.sim.state.sites.anvilOrchard.lots.length,0);assert.equal(h.sim.state.entityList.filter(e=>e.data?.orchardKind==='pod').length,0);assert.deepEqual(h.frame.data.orchardCollars.cycles,[0,0,0]);if(claim)assert.equal(h.sim.state.entities.get(claim.id),claim);
 }finally{delete h.owner._syncCeresWorkfleetRecord;h.close();}
});
test('actual Save Continue during public spawn preserves committed finite/native custody exactly once',async()=>{
 const h=await setup();try{const saves=h.sim.registry.get('save');let loaded=false;
  h.sim.bus.on('entity:spawned',event=>{if(loaded || event.entity.data?.orchardKind!=='pod')return;loaded=true;const envelope=JSON.parse(JSON.stringify(saves.serialize('finite-insertion')));delete envelope.checksum;assert.equal(saves.loadEnvelope(envelope),true);h.facade._finishNativeRestore();loaded=true;});
  assert.equal(h.accept(),4);assert.equal(loaded,true);assert.equal(h.sim.state.sites.anvilOrchard.sourceRemaining,44);assert.equal(h.sim.state.sites.anvilOrchard.lots.length,1);assert.equal(await h.facade.prepareBackend(h.sim.state),true);
  const pod=h.sim.state.entityList.find(e=>e.data?.orchardKind==='pod'),frame=h.sim.state.entityList.find(e=>e.data?.orchardKind==='frame');assert.ok(pod);assert.equal(h.facade._sg02.records.get(pod.id).body.isFixed(),true);assert.ok(h.facade.readOrchardFramePose(frame));assert.equal(h.accept(),0);
 }finally{h.close();}
});
test('real Continue during native preflight publishes no old ledger or pod',async()=>{
 const h=await setup();try{const saves=h.sim.registry.get('save'),envelope=JSON.parse(JSON.stringify(saves.serialize('before-private')));delete envelope.checksum;let loaded=false;
  h.owner._syncCeresWorkfleetRecord=function(){delete h.owner._syncCeresWorkfleetRecord;assert.equal(saves.loadEnvelope(envelope),true);h.facade._finishNativeRestore();loaded=true;};
  assert.equal(h.accept(),0);assert.equal(loaded,true);assert.equal(h.sim.state.sites.anvilOrchard.sourceRemaining,48);assert.equal(h.sim.state.sites.anvilOrchard.lots.length,0);assert.equal(h.sim.state.entityList.filter(e=>e.data?.orchardKind==='pod').length,0);assert.equal(await h.facade.prepareBackend(h.sim.state),true);
 }finally{delete h.owner._syncCeresWorkfleetRecord;h.close();}
});
test('partial fixed pod fills through exact native custody without a second body or lot',async()=>{
 const h=await setup();try{assert.equal(h.accept(1),1);const pod=h.sim.state.entityList.find(e=>e.data?.orchardKind==='pod'),record=h.owner.records.get(pod.id),body=record.body,world=h.owner.world;
  const accept=qty=>h.machine.acceptOrchardHarvest(h.worker,{frame:h.frame,socket:1,qty,commodityId:ANVIL_ORCHARD.commodityId});
  assert.equal(accept(2),2);assert.equal(pod.data.amount,3);assert.equal(h.sim.state.sites.anvilOrchard.sourceRemaining,45);assert.equal(accept(100),1);assert.equal(pod.data.amount,4);assert.equal(accept(1),0);
  const row=h.sim.state.sites.anvilOrchard;assert.equal(row.sourceRemaining,44);assert.equal(row.lots.length,1);assert.equal(row.lots[0].units,4);assert.equal(h.owner.world,world);assert.equal(h.owner.records.get(pod.id),record);assert.equal(record.body,body);assert.equal(body.isFixed(),true);assert.deepEqual(h.frame.data.orchardCollars.cycles,[0,1,0]);assert.ok(normalizeOrchardRecord(row));
 }finally{h.close();}
});
for(const kind of ['body-type','shape','amount','ledger-accessor'])test(`stowed filling refuses ${kind} mismatch before any finite debit`,async()=>{
 const h=await setup();let restore=()=>{};try{assert.equal(h.accept(1),1);const pod=h.sim.state.entityList.find(e=>e.data?.orchardKind==='pod'),record=h.owner.records.get(pod.id),prior=h.sim.state.sites.anvilOrchard;let calls=0;
  if(kind==='body-type')record.body.setBodyType(h.owner.RAPIER.RigidBodyType.Dynamic,true);if(kind==='shape')record.collider.setShape(new h.owner.RAPIER.Ball(2));if(kind==='amount')pod.data.amount=2;
  if(kind==='ledger-accessor'){const descriptor=Object.getOwnPropertyDescriptor(h.sim.state.sites,'anvilOrchard');Object.defineProperty(h.sim.state.sites,'anvilOrchard',{configurable:true,get(){calls++;return prior;}});restore=()=>Object.defineProperty(h.sim.state.sites,'anvilOrchard',descriptor);}
  assert.equal(h.machine.acceptOrchardHarvest(h.worker,{frame:h.frame,socket:1,qty:1,commodityId:ANVIL_ORCHARD.commodityId}),0);assert.equal(calls,0);restore();assert.equal(h.sim.state.sites.anvilOrchard,prior);assert.equal(prior.sourceRemaining,47);assert.equal(prior.lots[0].units,1);
 }finally{restore();h.close();}
});
for(const key of ['getter','setter'])test(`new pod refuses ledger ${key} without invoking it or allocating a capsule`,async()=>{
 const h=await setup();let descriptor;try{descriptor=Object.getOwnPropertyDescriptor(h.sim.state.sites,'anvilOrchard');let calls=0;Object.defineProperty(h.sim.state.sites,'anvilOrchard',{configurable:true,...(key==='getter'?{get(){calls++;return descriptor.value;}}:{set(){calls++;}})});
  const count=h.owner.world.bodies.len();assert.equal(h.accept(),0);assert.equal(calls,0);assert.equal(h.owner.world.bodies.len(),count);assert.equal(descriptor.value.sourceRemaining,48);
 }finally{if(descriptor)Object.defineProperty(h.sim.state.sites,'anvilOrchard',descriptor);h.close();}
});
for(const change of ['public-pod','ledger','worker-data','amount-accessor'])test(`fill preflight ${change} replacement preserves original finite and pod amount`,async()=>{
 const h=await setup();let restore=()=>{};try{assert.equal(h.accept(1),1);const pod=h.sim.state.entityList.find(e=>e.data?.orchardKind==='pod'),data=pod.data,prior=h.sim.state.sites.anvilOrchard,map=h.owner.records,get=map.get;let calls=0,fired=false;
  map.get=function(...args){const out=get.apply(this,args);if(!fired){fired=true;if(change==='public-pod')h.sim.state.entities.set(pod.id,{...pod,occupantGeneration:pod.occupantGeneration+1});if(change==='ledger')h.sim.state.sites.anvilOrchard=structuredClone(prior);if(change==='worker-data')h.worker.data={...h.worker.data};if(change==='amount-accessor'){const d=Object.getOwnPropertyDescriptor(pod.data,'amount');Object.defineProperty(pod.data,'amount',{configurable:true,get(){calls++;return 1;}});restore=()=>Object.defineProperty(pod.data,'amount',d);}}return out;};
  assert.equal(h.machine.acceptOrchardHarvest(h.worker,{frame:h.frame,socket:1,qty:1,commodityId:ANVIL_ORCHARD.commodityId}),0);delete map.get;assert.equal(fired,true);assert.equal(calls,0);restore();assert.equal(pod.data,data);assert.equal(pod.data.amount,1);assert.equal(h.sim.state.sites.anvilOrchard.sourceRemaining,47);assert.equal(h.sim.state.sites.anvilOrchard.lots[0].units,1);
 }finally{delete h.owner.records.get;restore();h.close();}
});
test('filled capsule survives full Save JSON Continue and first ordinary native synchronization',async()=>{
 const h=await setup();try{assert.equal(h.accept(1),1);assert.equal(h.machine.acceptOrchardHarvest(h.worker,{frame:h.frame,socket:1,qty:3,commodityId:ANVIL_ORCHARD.commodityId}),3);
  const saves=h.sim.registry.get('save'),envelope=JSON.parse(JSON.stringify(saves.serialize('filled-pod')));delete envelope.checksum;assert.equal(saves.loadEnvelope(envelope),true);h.facade._finishNativeRestore();assert.equal(await h.facade.prepareBackend(h.sim.state),true);h.facade._syncSg02DynamicAuthorityEntities(h.sim.state);
  const pod=h.sim.state.entityList.find(e=>e.data?.orchardKind==='pod'),frame=h.sim.state.entityList.find(e=>e.data?.orchardKind==='frame');assert.equal(pod.data.amount,4);assert.equal(h.facade._sg02.records.get(pod.id).body.isFixed(),true);assert.ok(h.facade.readOrchardFramePose(frame));assert.equal(h.sim.state.sites.anvilOrchard.sourceRemaining,44);assert.equal(h.sim.state.sites.anvilOrchard.lots[0].units,4);
 }finally{h.close();}
});
for(const key of ['entity','body'])test(`fill native commit refuses a post-preflight record ${key} accessor with zero dispatch`,async()=>{
 const h=await setup();let rec,descriptor,calls=0;try{assert.equal(h.accept(1),1);const pod=h.sim.state.entityList.find(e=>e.data?.orchardKind==='pod'),prior=pod.data,p=h.owner.prepareOrchardPodFill(h.frame,pod,1,1,h.sim.state);assert.ok(p);assert.equal(p.preflight(),true);rec=h.owner.records.get(h.frame.id);descriptor=Object.getOwnPropertyDescriptor(rec,key);Object.defineProperty(rec,key,{configurable:true,get(){calls++;Object.defineProperty(rec,key,descriptor);h.sim.spawn({type:'fx',physicsBody:false});return descriptor.value;}});
  assert.equal(p.commit(),false);assert.equal(calls,0);assert.equal(p.committed,false);assert.equal(pod.data,prior);assert.equal(pod.data.amount,1);p.abort();
 }finally{if(rec&&descriptor)Object.defineProperty(rec,key,descriptor);h.owner.cancelOrchardPodInsertion();h.close();}
});
test('recursive harvest admission during native preflight cannot allocate or debit a second lot',async()=>{
 const h=await setup();try{let nested=null;h.owner._syncCeresWorkfleetRecord=function(){nested=h.machine.acceptOrchardHarvest(h.worker,{frame:h.frame,socket:0,qty:4,commodityId:ANVIL_ORCHARD.commodityId});};
  assert.equal(h.accept(2),2);assert.equal(nested,0);assert.equal(h.sim.state.sites.anvilOrchard.sourceRemaining,46);assert.equal(h.sim.state.sites.anvilOrchard.lots.length,1);assert.equal(h.sim.state.entityList.filter(e=>e.data?.orchardKind==='pod').length,1);
 }finally{delete h.owner._syncCeresWorkfleetRecord;h.close();}
});
test('automatic intake selection fills an existing partial capsule before allocating another socket',async()=>{
 const h=await setup();try{const accept=qty=>h.machine.acceptOrchardHarvest(h.worker,{frame:h.frame,qty,commodityId:ANVIL_ORCHARD.commodityId});assert.equal(accept(2),2);assert.equal(accept(2),2);assert.equal(accept(4),4);const row=h.sim.state.sites.anvilOrchard;
  assert.equal(row.sourceRemaining,40);assert.deepEqual(row.lots.map(l=>[l.socket,l.units]),[[0,4],[1,4]]);assert.equal(h.sim.state.entityList.filter(e=>e.data?.orchardKind==='pod').length,2);assert.ok(normalizeOrchardRecord(row));
 }finally{h.close();}
});
for(const kind of ['record','body','spec','retired-body'])test(`worker native ${kind} change during the first pose read refuses intake`,async()=>{
 const h=await setup(),original=h.facade.readOrchardFramePose;try{const record=h.owner.records.get(h.worker.id),prior=h.sim.state.sites.anvilOrchard;let fired=false;
  h.facade.readOrchardFramePose=function(entity){const pose=original.call(this,entity);if(!fired){fired=true;if(kind==='record')h.owner.records.set(h.worker.id,{...record});if(kind==='body')record.body=h.owner.records.get(h.frame.id).body;if(kind==='spec')record.spec={...record.spec};if(kind==='retired-body')h.owner.world.removeRigidBody(record.body);}return pose;};
  assert.equal(h.accept(),0);assert.equal(fired,true);assert.equal(h.sim.state.sites.anvilOrchard,prior);assert.equal(prior.sourceRemaining,48);assert.equal(h.sim.state.entityList.filter(e=>e.data?.orchardKind==='pod').length,0);
 }finally{h.facade.readOrchardFramePose=original;h.close();}
});
for(const kind of ['authored-copy','authored-revision','resolved-revision','resolved-mass'])test(`worker ${kind} change during the facade read cannot be recaptured as authority`,async()=>{
 const h=await setup(),original=h.facade.readOrchardFramePose;try{const prior=h.sim.state.sites.anvilOrchard,record=h.owner.records.get(h.worker.id);let fired=false;
  h.facade.readOrchardFramePose=function(entity){const pose=original.call(this,entity);if(!fired){fired=true;if(kind==='authored-copy')h.worker.physicsBody={...h.worker.physicsBody};if(kind==='authored-revision')h.worker.physicsBody.revision++;if(kind==='resolved-revision')record.spec.revision++;if(kind==='resolved-mass')record.spec.mass++;}return pose;};
  assert.equal(h.accept(1),0);assert.equal(fired,true);assert.equal(h.sim.state.sites.anvilOrchard,prior);assert.equal(prior.sourceRemaining,48);assert.equal(h.sim.state.entityList.filter(e=>e.data?.orchardKind==='pod').length,0);
 }finally{h.facade.readOrchardFramePose=original;h.close();}
});
for(const when of ['before','preflight','accessor'])test(`partial fill rejects ${when} commodity mismatch without changing stock or pod quantity`,async()=>{
 const h=await setup();let restore=()=>{};try{assert.equal(h.accept(1),1);const pod=h.sim.state.entityList.find(e=>e.data?.orchardKind==='pod'),prior=h.sim.state.sites.anvilOrchard;let calls=0,fired=false;
  if(when==='before')pod.data.commodityId='cmdty_scrap';
  if(when==='accessor'){const d=Object.getOwnPropertyDescriptor(pod.data,'commodityId');Object.defineProperty(pod.data,'commodityId',{configurable:true,get(){calls++;return ANVIL_ORCHARD.commodityId;}});restore=()=>Object.defineProperty(pod.data,'commodityId',d);}
  if(when==='preflight'){const method=h.owner.prepareOrchardPodFill;h.owner.prepareOrchardPodFill=function(...args){const p=method.apply(this,args);if(!p)return p;return {preflight(){fired=true;pod.data.commodityId='cmdty_scrap';return p.preflight();},commit:p.commit,abort:p.abort};};restore=()=>delete h.owner.prepareOrchardPodFill;}
  assert.equal(h.machine.acceptOrchardHarvest(h.worker,{frame:h.frame,socket:1,qty:1,commodityId:ANVIL_ORCHARD.commodityId}),0);assert.equal(calls,0);if(when==='preflight')assert.equal(fired,true);assert.equal(h.sim.state.sites.anvilOrchard,prior);assert.equal(prior.sourceRemaining,47);assert.equal(pod.data.amount,1);
 }finally{restore();h.close();}
});
for(const kind of ['false','disabled','revision','mass','shape'])test(`already stale worker ${kind} source cannot enter finite acceptance`,async()=>{
 const h=await setup();try{const prior=h.sim.state.sites.anvilOrchard,count=h.owner.world.bodies.len();if(kind==='false')h.worker.physicsBody=false;if(kind==='disabled')h.worker.physicsBody.enabled=false;if(kind==='revision')h.worker.physicsBody.revision++;if(kind==='mass')h.worker.physicsBody.mass++;if(kind==='shape')h.worker.physicsBody.shape='ball';
  assert.equal(h.accept(1),0);assert.equal(h.sim.state.sites.anvilOrchard,prior);assert.equal(prior.sourceRemaining,48);assert.equal(h.owner.world.bodies.len(),count);assert.equal(h.sim.state.entityList.filter(e=>e.data?.orchardKind==='pod').length,0);
 }finally{h.close();}
});
test('missing worker resolved body refuses intake without throwing or debiting stock',async()=>{
 const h=await setup();try{const prior=h.sim.state.sites.anvilOrchard;h.owner.records.get(h.worker.id).spec=null;assert.equal(h.accept(1),0);assert.equal(h.sim.state.sites.anvilOrchard,prior);assert.equal(prior.sourceRemaining,48);}finally{h.close();}
});
test('ordinary machinery initialization performs no new physics lookup before Orchard intake is used',()=>{
 const system=Object.create(environmentalMachinery);let calls=0;assert.doesNotThrow(()=>system.init({state:{},helpers:{},bus:null,registry:{get(){calls++;throw Error('unexpected lookup');}}}));assert.equal(calls,0);
});
test('deferred registry callback must pass the retained consumer fence before native preparation',async()=>{
 const h=await setup(),get=h.machine.registry.get,prepare=h.owner.prepareOrchardPodInsertion;try{let calls=0,prepared=0;const prior=h.sim.state.sites.anvilOrchard;
  h.machine.registry.get=function(name){const result=get.call(this,name);if(name==='physics'){calls++;h.sim.state.sites.anvilOrchard=structuredClone(prior);}return result;};h.owner.prepareOrchardPodInsertion=function(...args){prepared++;return prepare.apply(this,args);};
  assert.equal(h.accept(1),0);assert.equal(calls,1);assert.equal(prepared,0);assert.equal(h.sim.state.sites.anvilOrchard.sourceRemaining,48);assert.equal(h.sim.state.entityList.filter(e=>e.data?.orchardKind==='pod').length,0);
 }finally{h.machine.registry.get=get;h.owner.prepareOrchardPodInsertion=prepare;h.close();}
});
