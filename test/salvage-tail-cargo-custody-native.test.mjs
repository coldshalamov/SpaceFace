import { AI_CONTRACT_VERSION } from '../src/ai/contracts.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import assert from 'node:assert/strict';
import {save} from '../src/save/saveSystem.js';
import {bootRealPath,writeRealPathInput} from '../scripts/lib/bench/realPath.mjs';
import {encounterDirector} from '../src/systems/encounterDirector.js';
import {combat} from '../src/systems/combat.js';
import {cargo} from '../src/systems/cargo.js';
import {admitCapturedVessel} from '../src/systems/shipControlTransfer.js';
const total=r=>r.carrierQty+r.playerCollectedQty+r.raiderSecuredQty+r.stationRecoveredQty+r.deliveredQty+r.lostQty+r.pods.filter(p=>p.status==='live').reduce((a,p)=>a+p.qty,0);
const stock=c=>c?.items?{items:c.items,capacity:c.capacity}:c;
const controls=e=>structuredClone({activity:e.data.ai?.activity,roe:e.data.ai?.roe,passive:e.data.ai?.passive,status:e.data.ai?.predationStatus,intent:e.data.intent});
const stale=e=>/freight_(pod_recovery|custody_escape|pod_sweep|sweep_escape)/.test(e.data.ai?.activity?.reason||'');
for(const mode of ['intact_mule','physical_thief','restored_recovery','restored_escape']){
 const h=await bootRealPath({seed:4242,systems:['tacticalAI','flightV3','aiPorts','weapons','physics','collisionConsequences',combat,cargo,encounterDirector,save],bounds:{center:{x:0,z:0},radius:4200,hardRadius:4700},prepareState({state}){state.world.currentSectorId='sector_helios_prime';state.story.beatIndex=7;state.story.depthProgramEncounters={completed:{opening_hauler_raid:{outcome:'defended'}}};},hulls:[{hullId:'ship_wasp',isPlayer:true,pos:{x:900,z:900}}]});
 try{
 const d=h.runtime.getSystem('encounterDirector'),s=h.runtime.getSystem('save'),events=[];
 for(const n of ['physics:impact','combat:damage','entity:killed','pickup:collected','freight:cargoSpilled','freight:custodyReceipt','economy:grantCredits','faction:repDelta'])h.bus.on(n,p=>events.push({n,t:h.state.simTime,p:['physics:impact','combat:damage','entity:killed'].includes(n)?{id:p.id,targetId:p.targetId,attackerId:p.attackerId,killerId:p.killerId,origin:p.origin,amount:p.amount,hullDamage:p.hullDamage,beforeHull:p.before?.hull,afterHull:p.after?.hull,aId:p.aId,bId:p.bId,pairKey:p.pairKey,aGeneration:p.aGeneration,bGeneration:p.bGeneration,trauma:p.trauma,tick:p.tick}:structuredClone(p)}));
 const req=d.requestAuthoredEncounter({shapeId:'salvage_tail',encounterId:'tail-independent:'+mode,sectorId:'sector_helios_prime',anchor:{x:0,z:0},force:true});assert.equal(req.ok,true,JSON.stringify(req));
 let live=h.state.encounterDirector.live[req.encounterId];
 const m=d.entsOf(live,'hauler')[0],rs=d.entsOf(live,'raider'),initial=m.data.cargoManifest.totalQty;
 h.bus.emit('encounter:choose',{encounterId:live.id,choiceId:'shadow'});h.step(20);h.assertBodies([m,...rs]);
 let target=m,r=null,securedBefore=0;
 const flatBefore=structuredClone(m.data.cargo),manifestBefore=structuredClone(m.data.cargoManifest);
 if(mode!=='intact_mule'){
  m.disabled=true;h.bus.emit('combat:subsystemDisabled',{targetId:m.id,subsystemId:'subsystem_drive',attackerId:rs[0].id});
  r=live.data.freightCargoCustody;assert.ok(r);assert.equal(r.carrierDead,false);assert.equal(total(r),initial);
  h.step(7200,{after(){return r.raiderSecuredQty===0&&!r.terminal;}});
  assert.ok(r.raiderSecuredQty>0,'real physical NPC pickup must secure a finite pod');
  target=h.state.entities.get(r.raiderId);assert.ok(target);securedBefore=r.raiderSecuredQty;
  assert.ok(events.some(x=>x.n==='pickup:collected'&&x.p.collectorId===target.id&&x.p.acceptedAmount>0));
  for(const p of r.pods.filter(p=>p.status==='raider_secured'))assert.ok(!h.state.entities.has(p.entityId)||h.state.entities.get(p.entityId).alive===false,'secured pod not simultaneously live');
  assert.equal(Number(target.data.cargo?.items?.[r.commodityId]||target.data.cargo?.[r.commodityId]||0),0,'secured freight is ledger-only');
  target.data.cargo={items:{cmdty_food:2},capacity:50};
 }
 if(mode.startsWith('restored_')){
  if(mode==='restored_recovery'){h.runtime.getSystem('combat').kill(m,rs[0].id);assert.ok(r.pods.some(p=>p.status==='live'));}
  else{h.step(61);assert.ok(r.escapeStartedAt!=null);}
  const pre=JSON.parse(JSON.stringify(s.serialize('npc-before-capture')));assert.equal(s.loadEnvelope(pre,'npc-before-capture'),true);live=h.state.encounterDirector.live[req.encounterId];r=live.data.freightCargoCustody;target=h.state.entities.get(r.raiderId);assert.ok(target);
 }
 const untouched=structuredClone(target.data.cargo),vesselId='tail:independent:'+mode;
 target.data.vesselId=vesselId;target.data.shipjackGeneration=1;h.state.run={kind:'adventure'};h.state.player.ownedShips||=[];
 const before=controls(target);
 const owner={state:h.state,bus:h.bus,helpers:d.helpers,validateTransferFittings:()=>true,nextInstanceId:()=>'tail:independent:instance:'+mode,getTransferCargoCapacity:()=>100,recomputeEntity(){},publishActiveRoleContext(){}};
 const ports=h.runtime.getSystem('aiPorts');
 if(mode!=='intact_mule') assert.equal(h.withFeatures(()=>ports.helpers.aiManeuver.request({version:AI_CONTRACT_VERSION,entityId:target.id,tick:h.state.tick,kind:'transit',forceLocal:{forward:1,right:0},torqueYaw:0,reason:'salvage_tail:freight_pod_recovery'})),true);
 let subscriberSafe=false;h.bus.on('ship:captured',()=>{assert.equal(stale(target),false,'capture subscribers see released activity'); const reentrant=JSON.parse(JSON.stringify(s.serialize('capture-subscriber')));assert.ok(reentrant);subscriberSafe=true;});
 const admitted=admitCapturedVessel(owner,{targetId:target.id,targetGeneration:1,vesselId,operationId:'tail:independent:capture:'+mode});assert.equal(admitted.ok,true,JSON.stringify(admitted));assert.equal(subscriberSafe,true);
 h.withFeatures(()=>ports.update(1/60,h.state));
 const capturedCommand=consumePhysicsCommand(target);if(mode!=='intact_mule')assert.equal(Math.hypot(capturedCommand?.control?.force?.x||0,capturedCommand?.control?.force?.z||0),0,'capture cancels leased pending thrust');
 const after=controls(target),staleImmediately=stale(target),ownedBefore=structuredClone(h.state.player.ownedShips.find(x=>x.vesselId===vesselId)?.cargo);
 assert.deepEqual(target.data.cargo,untouched);
 const env=JSON.parse(JSON.stringify(s.serialize('tail-independent:'+mode)));
 const open=env.data.encounterDirector.stats.openFreightCustodies||[];
 if(r){assert.equal(open.length,1);assert.equal(total(r),initial);}
 assert.equal(s.loadEnvelope(env,'tail-independent:'+mode),true);
 let matches=[...h.state.entities.values()].filter(e=>e.data?.vesselId===vesselId);assert.equal(matches.length,1,'Continue preserves one owned physical vessel');
 const restored=matches[0];assert.ok(restored.flags.persistent);assert.deepEqual(stock(restored.data.cargo),stock(untouched));
 assert.deepEqual(stock(h.state.player.ownedShips.find(x=>x.vesselId===vesselId)?.cargo),stock(ownedBefore));
 const restoredControls=controls(restored);
 writeRealPathInput(h.state,{});h.step(120);
 if(mode==='intact_mule'){
  assert.deepEqual(restored.data.cargo,flatBefore);assert.deepEqual(restored.data.cargoManifest,manifestBefore);
  assert.equal(events.filter(x=>x.n==='freight:cargoSpilled').length,0);
 }else{
  live=h.state.encounterDirector.live[req.encounterId];assert.ok(live);
  r=live.data.freightCargoCustody;assert.equal(total(r),initial);assert.equal(r.raiderSecuredQty,0);assert.equal(r.raiderEscaped,false);assert.equal(r.raiderRecoveryClosed,true);
  const pods=r.pods.filter(p=>p.status==='live');assert.equal(new Set(pods.map(p=>p.podIdentity)).size,pods.length);
  assert.ok(pods.reduce((n,p)=>n+p.qty,0)>=securedBefore);assert.deepEqual(stock(restored.data.cargo),stock(untouched));assert.ok(restored.flags.persistent);
  assert.equal(events.some(x=>x.n==='economy:grantCredits'||x.n==='faction:repDelta'),false);
 }
 console.log('INDEPENDENT_CAPTURE_SAVE',JSON.stringify({mode,initial,securedBefore,before,after,staleImmediately,open:open.length,ownedCargo:ownedBefore,ledger:r?total(r):null,carrier:r?.carrierQty,pods:r?.pods.map(p=>({qty:p.qty,status:p.status,cause:p.cause})),proof:h.proof()}));
 if(mode!=='intact_mule')assert.equal(staleImmediately,false,'admission must release proven custody activity synchronously, before Save or next tick');
 }finally{h.dispose();}
}