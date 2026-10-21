import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';
import { economy } from '../src/systems/economy.js';
import { cargo } from '../src/systems/cargo.js';
import { save } from '../src/save/saveSystem.js';
import { ANVIL_WORK, anvilWorkerRecordId, anvilServicePoint, anvilBuyerApproach } from '../src/systems/anvilWork.js';
import { PLANET_SITE } from '../src/data/planets.js';
import { anvilSpillReturnFacts, anvilSpillReturnQuote } from '../src/world/anvilSpillRecovery.js';
import { createContactHailOffer, createContactHailResponse } from '../src/data/contactHail.js';
const commodityId = PLANET_SITE.harvest.commodityShallow;
async function boot() {
  const sim=createSimulation({seed:47,systems:[{...world,update(){}},{...traffic,update(){}},economy,cargo,physics,combat,save]});
  const s=sim.state;s.mode='flight';s.settings.gameplay.physicsBackend='rapier-dynamic';s.world.currentSectorId=PLANET_SITE.sectorId;
  const owner=sim.registry.get('traffic');owner.ensureAnvilWorker(s,sim.spawn,{x:14000,z:6000});
  const receiver=s.entityList.find(e=>e.data?.worldRecordId===anvilWorkerRecordId(s,'receiver'));
  const player=sim.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:s.player,team:0,pos:{x:16650,z:6000}}));s.playerId=player.id;
  const rec=s.traffic.freighters.find(r=>r.id===receiver.id);
  owner._setTrafficManifest(receiver,rec,owner._buildMinerManifest(receiver,0,commodityId,12));
  receiver.data.itinerary.phase='delivery';receiver.data.itinerary.destinationStationId=ANVIL_WORK.buyerId;
  const pod=owner._spillHaulerCargoFromViolence(receiver,null,'panic_jettison');assert.ok(pod);
  pod.pos=anvilServicePoint(receiver);pod.vel={...receiver.vel};
  const phys=sim.registry.get('physics');assert.equal(await phys.prepareBackend(s),true);sim.step(1/60);
  const kernel=getCombatKernel({state:s,bus:sim.bus});
  const created=kernel.attachments.create({defId:'tether_standard',ownerId:player.id,targetId:pod.id,
    sourceWorld:{...player.pos,y:0},targetWorld:{...pod.pos,y:0}});assert.equal(created.ok,true,created.reason);
  const a=created.attachment;s.player.tether={active:true,attachmentId:a.id,targetId:pod.id};
  return {sim,s,owner,receiver,player,pod,rec,a,close:()=>{phys._disableSg02DynamicAuthority();sim.dispose();}};
}
const quote=t=>{const q=anvilSpillReturnQuote(t.s,t.receiver);if(q)t.owner.bindAnvilSpillReturnQuote(t.receiver,q);return q;};
test('real spill debit, deliberate return, then real Tethys delivery conserve one twelve-unit load',async()=>{
 const t=await boot();try {
  assert.equal(t.receiver.data.cargoManifest.totalQty,9);assert.equal(t.pod.data.amount,3);
  const before=t.s.player.credits;t.owner._stepAnvilReceiver(t.receiver);
  assert.equal(t.pod.data.amount,3,'proximity alone is not return');
  const q=quote(t);assert.ok(q);
  const result=t.owner.returnAnvilSpill(t.receiver,q);assert.deepEqual(result,{ok:true,qty:3,remaining:0});
  assert.equal(t.receiver.data.cargoManifest.totalQty,12);assert.equal(t.pod.data.amount,0);
  assert.deepEqual(t.pod.data.salvagePool,{});assert.equal(t.s.player.credits,before);
  assert.equal(t.receiver.data.violenceCargoSpilled,true);
  assert.equal(t.owner._spillHaulerCargoFromViolence(t.receiver,null),null,'return cannot farm another spill');
  assert.equal(t.owner.returnAnvilSpill(t.receiver,q).ok,false);
  const station=t.sim.spawn({type:'station',hull:1000,radius:120,pos:{x:13000,z:9500},data:{stationId:ANVIL_WORK.buyerId,collisionProxy:'skin:place_station_trade_hub',dockRadius:90}});
  const econ=t.sim.registry.get('economy');econ.ensureMarket(ANVIL_WORK.buyerId);
  const market=t.s.economy.markets[ANVIL_WORK.buyerId][commodityId],stock=market.stock;
  t.receiver.pos=anvilBuyerApproach(t.receiver,station);t.receiver.vel={x:0,z:0};
  assert.equal(t.owner._deliverAnvilReceiver(t.receiver,station),true);assert.equal(market.stock,stock+12);
 }finally{t.close();}
});
test('partial capacity preserves original residual body and line; second fresh Hail returns only remainder',async()=>{
 const t=await boot();try {
  t.owner._setTrafficManifest(t.receiver,t.rec,t.owner._buildMinerManifest(t.receiver,1,commodityId,47));
  assert.equal(t.owner.returnAnvilSpill(t.receiver,quote(t)).qty,1);
  assert.equal(t.pod.alive,true);assert.equal(t.pod.data.amount,2);assert.equal(t.pod.data.salvagePool[commodityId],2);
  assert.equal(t.s.combat.attachments.byId[t.a.id],t.a);
  assert.equal(quote(t),null,'full tender cannot accept');
  t.owner._setTrafficManifest(t.receiver,t.rec,t.owner._buildMinerManifest(t.receiver,2,commodityId,0));
  assert.equal(t.owner.returnAnvilSpill(t.receiver,quote(t)).qty,2);
  assert.equal(t.receiver.data.itinerary.anvilSpillReturn.returnedQty,3);
 }finally{t.close();}
});
for(const fault of ['cut','wrong-pod','duplicate-pod','dead-receiver','duplicate-receiver','full','far','speed','bad-pool','wrong-commodity','foreign-job','destroyed-record','frozen-data','frozen-pool','receipt-overrun'])test(`return refuses ${fault} without minting or consuming`,async()=>{
 const t=await boot();try {
  const q=quote(t);assert.ok(q);
  if(fault==='cut')t.a.state='cut';
  if(fault==='wrong-pod')t.pod.data.ownerRecordId='unrelated';
  if(fault==='duplicate-pod')t.sim.spawn({type:'payload',hull:100,data:structuredClone(t.pod.data)});
  if(fault==='dead-receiver')t.receiver.alive=false;
  if(fault==='duplicate-receiver')t.sim.spawn({type:'ship',hull:100,data:structuredClone(t.receiver.data)});
  if(fault==='full')t.owner._setTrafficManifest(t.receiver,t.rec,t.owner._buildMinerManifest(t.receiver,2,commodityId,48));
  if(fault==='far')t.pod.pos.x+=200;
  if(fault==='speed')t.pod.vel.x=20;
  if(fault==='bad-pool')t.pod.data.salvagePool[commodityId]=2;
  if(fault==='wrong-commodity')t.pod.data.commodityId='cmdty_food';
  if(fault==='foreign-job')t.receiver.data.jobId='foreign';
  if(fault==='destroyed-record')t.s.world.records.byId[t.receiver.data.worldRecordId].outcome='destroyed';
  if(fault==='frozen-data')Object.freeze(t.pod.data);
  if(fault==='frozen-pool')Object.freeze(t.pod.data.salvagePool);
  if(fault==='receipt-overrun')t.receiver.data.itinerary.anvilSpillReturn.returnedQty=4;
  const before=t.receiver.data.cargoManifest.totalQty;
  assert.equal(t.owner.returnAnvilSpill(t.receiver,q).ok,false);assert.equal(t.receiver.data.cargoManifest.totalQty,before);assert.equal(t.pod.data.amount,3);
 }finally{t.close();}
});
for(const fault of ['before','after','refused'])test(`manifest setter ${fault} rolls back both finite sides`,async()=>{
 const t=await boot();try{
  const set=t.owner._setTrafficManifest;t.owner._setTrafficManifest=function(...args){if(fault==='after')set.apply(this,args);if(fault==='refused')return false;throw Error('test');};
  assert.equal(t.owner.returnAnvilSpill(t.receiver,quote(t)).ok,false);
  assert.equal(t.pod.data.amount,3);assert.equal(t.pod.data.salvagePool[commodityId],3);assert.equal(t.receiver.data.cargoManifest.totalQty,9);
  assert.equal(t.receiver.data.itinerary.anvilSpillReturn.returnedQty,0);
 }finally{t.close();}
});
test('Hail exposes an explicit finite return choice and truthful response, not a reward',async()=>{
 const t=await boot();try{
  const offer=createContactHailOffer(t.s,{enabled:true,kind:'worker',entity:t.receiver,targetId:t.receiver.id},'return-test',4);
  assert.ok(offer.actions.find(a=>a.id==='return_gas'));assert.match(offer.lines.join(' '),/No payment/);
  assert.equal(t.owner.bindAnvilSpillReturnQuote(t.receiver,offer.anvilReturnQuote),true);
  const result=t.owner.returnAnvilSpill(t.receiver,offer.anvilReturnQuote);
  const response=createContactHailResponse(t.s,offer,'return_gas',{anvilReturn:result});assert.match(response.lines.join(' '),/3u BACK ABOARD FOR TETHYS/);
 }finally{t.close();}
});
test('Continue preserves original receipt and payload through actual save owner; old quote cannot return',async()=>{
 const t=await boot();try{
  const q=quote(t),saver=t.sim.registry.get('save'),envelope=saver.serialize('spill');
  assert.equal(saver.loadEnvelope(envelope),true);t.s.mode='flight';
  const receiver=t.s.entityList.find(e=>e.data?.worldRecordId===anvilWorkerRecordId(t.s,'receiver'));
  const pod=t.s.entityList.find(e=>e.data?.anvilSpillReturn?.id===q.id);
  assert.ok(receiver);assert.ok(pod);assert.equal(receiver.data.itinerary.anvilSpillReturn.initialQty,3);assert.equal(pod.data.amount,3);
  assert.equal(t.owner.returnAnvilSpill(receiver,q).ok,false);
 }finally{t.close();}
});

test('partial Continue needs a fresh original line and fresh quote; finite residual settles once',async()=>{
 const t=await boot();try{
  t.owner._setTrafficManifest(t.receiver,t.rec,t.owner._buildMinerManifest(t.receiver,1,commodityId,47));
  assert.equal(t.owner.returnAnvilSpill(t.receiver,quote(t)).qty,1);
  const saver=t.sim.registry.get('save'),envelope=saver.serialize('partial-return');
  assert.equal(saver.loadEnvelope(envelope),true);t.s.mode='flight';t.s.settings.gameplay.physicsBackend='rapier-dynamic';
  const receiver=t.s.entityList.find(e=>e.data?.worldRecordId===anvilWorkerRecordId(t.s,'receiver'));
  const pod=t.s.entityList.find(e=>e.data?.anvilSpillReturn),player=t.s.entities.get(t.s.playerId);
  assert.equal(pod.data.amount,2);assert.equal(pod.data.salvagePool[commodityId],2);
  assert.equal(receiver.data.itinerary.anvilSpillReturn.returnedQty,1);
  const row=t.s.traffic.freighters.find(r=>r.id===receiver.id);
  t.owner._setTrafficManifest(receiver,row,t.owner._buildMinerManifest(receiver,2,commodityId,0));
  const phys=t.sim.registry.get('physics');phys._finishNativeRestore();assert.equal(await phys.prepareBackend(t.s),true);t.sim.step(1/60);
  const kernel=getCombatKernel({state:t.s,bus:t.sim.bus});
  const a=Object.values(t.s.combat.attachments.byId).find(a=>a.state==='active'&&a.ownerId===player.id&&a.targetId===pod.id);
  assert.ok(a);t.s.player.tether={active:true,attachmentId:a.id,targetId:pod.id};
  const q=anvilSpillReturnQuote(t.s,receiver);assert.ok(q);assert.equal(t.owner.bindAnvilSpillReturnQuote(receiver,q),true);
  assert.equal(t.owner.returnAnvilSpill(receiver,q).qty,2);assert.equal(t.owner.returnAnvilSpill(receiver,q).ok,false);
  assert.equal(receiver.data.cargoManifest.totalQty,2);assert.equal(receiver.data.itinerary.anvilSpillReturn.returnedQty,3);
 }finally{t.close();}
});
for(const fault of ['salvor-claim','yard-tow','caught-net','rich-source','frozen-mirror','expired','replaced-line','replaced-pool','no-native'])test(`recovery capability rejects ${fault}`,async()=>{
 const t=await boot();try{
  const q=quote(t);
  if(fault==='salvor-claim')t.pod.data.salvorClaimedBy='other';
  if(fault==='yard-tow')t.pod.data.npcTowedByJobId='other';
  if(fault==='caught-net')t.pod.data.caughtByNet=true;
  if(fault==='rich-source')t.pod.data.richLotSource={richQty:3};
  if(fault==='frozen-mirror')t.receiver.data.cargo=Object.freeze({[commodityId]:9});
  if(fault==='expired')t.s.simTime+=5;
  if(fault==='replaced-line')t.s.combat.attachments.byId[t.a.id]={...t.a};
  if(fault==='replaced-pool')t.pod.data.salvagePool={...t.pod.data.salvagePool};
  if(fault==='no-native')t.s.settings.gameplay.physicsBackend='custom';
  assert.equal(t.owner.returnAnvilSpill(t.receiver,q).ok,false);
  assert.equal(t.pod.data.amount,3);assert.equal(t.receiver.data.cargoManifest.totalQty,9);
 }finally{t.close();}
});
test('committed observers see conservation and cannot replay; persistence failure does not resurrect source',async()=>{
 const t=await boot();try{
  const q=quote(t);let observed=0;
  t.sim.registry.get('world').upsertWorldRecord=()=>{throw Error('offline persistence');};
  t.sim.bus.on('traffic:anvilSpillReturned',()=>{
   observed++;assert.equal(t.pod.data.amount,0);assert.equal(t.receiver.data.cargoManifest.totalQty,12);
   assert.equal(t.receiver.data.itinerary.anvilSpillReturn.returnedQty,3);
   assert.equal(t.owner.returnAnvilSpill(t.receiver,q).ok,false);
  });
  assert.equal(t.owner.returnAnvilSpill(t.receiver,q).qty,3);assert.equal(observed,1);
 }finally{t.close();}
});
test('scooped or destroyed original never becomes a replacement cargo recovery instruction',async()=>{
 const t=await boot();try{
  t.owner.helpers.removeEntity(t.pod.id,{immediate:true,reason:'test-loss'});
  const offer=createContactHailOffer(t.s,{enabled:true,kind:'worker',entity:t.receiver,targetId:t.receiver.id},'gone',4);
  assert.ok(!offer.actions.some(a=>a.id==='return_gas'));assert.ok(!offer.lines.join(' ').includes('ORIGINAL GAS SPILL'));
 }finally{t.close();}
});

// A separate process isolates native feature maps/backend ownership from unit fixtures.
test('native Massline transport reaches explicit public Hail return without moving bodies by fiat',()=>{
 const run=spawnSync(process.execPath,[...process.execArgv,fileURLToPath(new URL('./fixtures/anvil-spill-recovery-native.mjs',import.meta.url))],{encoding:'utf8',timeout:60000});
 assert.equal(run.status,0,run.stderr||run.stdout);
 const report=JSON.parse(run.stdout.trim().split('\n').at(-1));
 assert.equal(report.ok,true);assert.ok(report.displacement>20);assert.equal(report.returned,3);
});

for(const fault of ['restore-pending','restore-deferred','not-ready','epoch','body-spec','native-line','disabled-body','changed-handle','replaced-native-body','malformed-native-pose','stale-revision'])test(`native capability refuses ${fault}`,async()=>{
 const t=await boot();try{
  const q=quote(t),phys=t.sim.registry.get('physics'),native=phys._sg02;
  if(fault==='restore-pending')phys._nativeRestorePending=true;
  if(fault==='restore-deferred')phys._nativeRestoreDeferred=true;
  if(fault==='not-ready')phys._diag.sg02Ready=false;
  if(fault==='epoch')phys._sg02Token++;
  if(fault==='body-spec')t.pod.physicsBody={...t.pod.physicsBody};
  if(fault==='native-line')native.attachments.set(t.a.id,{...native.attachments.get(t.a.id)});
  if(fault==='disabled-body')native.records.get(t.pod.id).body.setEnabled(false);
  if(fault==='changed-handle')t.a.physicsHandle.id='foreign';
  if(fault==='replaced-native-body'){const r=native.records.get(t.pod.id),body=r.body;r.body=new Proxy(body,{get(target,key){const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});}
  if(fault==='malformed-native-pose')native.records.get(t.pod.id).body.translation=()=>({x:NaN,y:0,z:0});
  if(fault==='stale-revision')t.pod.physicsBody.revision++;
  assert.equal(t.owner.returnAnvilSpill(t.receiver,q).ok,false);assert.equal(t.pod.data.amount,3);assert.equal(t.receiver.data.cargoManifest.totalQty,9);
 }finally{t.close();}
});
test('postcommit advisory/removal exceptions cannot report failed custody or mint a replay',async()=>{
 const t=await boot();try{
  const q=quote(t);t.owner.helpers.removeEntity=()=>{throw Error('observer cleanup');};
  t.sim.bus.on('traffic:anvilSpillReturned',()=>{throw Error('advisory listener');});
  assert.equal(t.owner.returnAnvilSpill(t.receiver,q).ok,true);
  assert.equal(t.pod.data.amount,0);assert.deepEqual(t.pod.data.salvagePool,{});assert.equal(t.receiver.data.cargoManifest.totalQty,12);
  assert.equal(t.owner.returnAnvilSpill(t.receiver,q).ok,false);
 }finally{t.close();}
});

for(const fault of ['zero-count','wrong-map'])test(`receiver index ${fault} still refuses a duplicate`,async()=>{
 const t=await boot();try{
  const q=quote(t),id=t.receiver.data.worldRecordId;
  const other=t.sim.spawn({type:'ship',hull:100,data:structuredClone(t.receiver.data)});
  t.s.entityIndex={__spacefaceEntityIndexV1:true,ready:true,byWorldRecordIdCount:new Map([[id,fault==='zero-count'?0:1]]),byWorldRecordId:new Map([[id,other]])};
  assert.equal(t.owner.returnAnvilSpill(t.receiver,q).ok,false);assert.equal(t.pod.data.amount,3);assert.equal(t.receiver.data.cargoManifest.totalQty,9);
 }finally{t.close();}
});
