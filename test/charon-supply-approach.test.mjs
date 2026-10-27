import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { reconcileCharonSupply, releaseCharonSupply, bindRestoredCharonSupply, normalizeCharonSupply } from '../src/world/charonSalvageSupply.js';
import { CHARON_SUPPLY as C, charonSupplyApproachCue, validCharonApproachReceipt } from '../src/world/charonSupplyReadout.js';
import { contactHailAvailability, createContactHailOffer } from '../src/data/contactHail.js';
import { activityPocketById } from '../src/data/sectorActivityPockets.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { admitReceipt } from '../src/ui/hudAttention.js';
import { createToasts, createCharonApproachToastGate } from '../src/ui/toasts.js';
import { presentReceipt } from '../src/core/receiptPresenter.js';
import { projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
const center = sectorLocalToGlobalForSector(activityPocketById(C.pocketId).activityAnchor.localPos, C.sectorId);
const fields = ['loose','aboard','delivered','consumed','player','other','lost'];
// Focused scalar/lifetime fixtures, NOT ordinary-flight or rendered acceptance.
function fixture() {
  const entity = (id, slot, name) => ({ id, type:'ship', alive:true, hull:100, hullMax:100,
    team:slot?2:0, occupantGeneration:id+10, pos:{...center}, vel:{x:0,z:0},
    data:slot?{ name, callsign:name, activityActorSlotId:slot, worldRecordId:`record:${slot}`,
      identityKey:`charon:activity:${slot}`, durable:true, trafficRole:slot===C.hauler?'hauler':'salvor',
      jobPhase:'hold', ai:{passive:true} }:{} });
  const p=entity(1), h=entity(2,C.hauler,'COLONY HAULER'), r=entity(3,C.salvor,'COLONY CUTTER');
  const b={ schema:1,original:6,phase:'collect',haulerId:h.data.worldRecordId,salvorId:r.data.worldRecordId,
    haulerReady:true,salvorReady:true,pods:[{id:C.sourceId,original:6,...Object.fromEntries(fields.map(k=>[k,k==='loose'?6:0]))}] };
  const state={ mode:'flight',simTime:0,tick:0,playerId:p.id,player:{targetId:null},ui:{docked:false},
    world:{currentSectorId:C.sectorId,enterSerial:1,records:{byId:{}}},
    entities:new Map([p,h,r].map(e=>[e.id,e])),entityList:[p,h,r],traffic:{charonSalvageSupply:b,freighters:[]},
    settings:{},meta:{seed:1},input:{},pirateParley:{squads:{}} };
  for(const e of [h,r]) state.world.records.byId[e.data.worldRecordId]={recordId:e.data.worldRecordId,identityKey:e.data.identityKey,alive:true,outcome:'active',homeSectorId:C.sectorId};
  const bus=createBus(), emitted=[];bus.on('toast',x=>emitted.push(x));
  const owner={state,bus,helpers:{npcJobs:{controlClaim:()=>null}}};
  const at=(x,time=state.simTime+1)=>{p.pos={x:center.x+x,z:center.z};state.simTime=time;state.tick=Math.round(time*60);reconcileCharonSupply(owner);};
  return {state,p,h,r,b,bus,owner,emitted,at};
}
function approach(f,time=2){f.at(800,time-1);f.at(400,time);return f.emitted.at(-1);}
function phase(f,name,field){f.b.phase=name;for(const k of fields)f.b.pods[0][k]=k===field?6:0;}
const flush=()=>new Promise(resolve=>queueMicrotask(resolve));

test('genuine outside-to-inside crossing, hysteresis, cooldown and two-cue cap leave finite state untouched',()=>{
  const f=fixture(), before=JSON.stringify(f.b);f.at(400);assert.equal(f.emitted.length,0,'initial near/Continue is not a genuine approach');
  approach(f,3);assert.equal(f.emitted.length,1);assert.match(f.emitted[0].text,/Last crew report: 6 kits loose/);
  for(let t=4;t<100;t++){f.at(t%2?760:400,t);}assert.equal(f.emitted.length,1);
  approach(f,124);assert.equal(f.emitted.length,2);approach(f,300);assert.equal(f.emitted.length,2);
  assert.equal(JSON.stringify(f.b),before);assert.equal(f.state.player.targetId,null);
});

test('finite phases use the existing real SUPPLY ROUTE choice, not imagined services',()=>{
  for(const [name,field,match] of [['collect','loose',/6 kits loose/],['collect','aboard',/6 kits aboard hauler/],
    ['delivered','delivered',/kits at cutter/],['working','consumed',/reserve used/],['shortfall','player',/round cancelled/],['lost','lost',/reserve lost/]]){
    const f=fixture();phase(f,name,field);const before=JSON.stringify(f.b), cue=approach(f);
    assert.match(cue.text,match);assert.match(cue.text,/Hail → SUPPLY ROUTE for current status/);
    f.state.player.targetId=cue.charonApproach.actorId;
    const availability=contactHailAvailability(f.state);assert.equal(availability.enabled,true);
    const offer=createContactHailOffer(f.state,availability,{requestId:'fixture'});
    assert.ok(offer.actions.some(a=>a.id==='route'&&a.label==='SUPPLY ROUTE'));
    assert.equal(JSON.stringify(f.b),before);
  }
});

test('missing worker chooses only the surviving available original and duplicate/recycled lives fail closed',()=>{
  const f=fixture();charonSupplyApproachCue(f.state);f.h.alive=false;
  assert.equal(approach(f).charonApproach.actorId,f.r.id);
  assert.match(f.emitted[0].text,/crew missing/);
  const g=fixture();charonSupplyApproachCue(g.state);g.h.occupantGeneration++;g.r.occupantGeneration++;
  assert.equal(approach(g),undefined);
  const d=fixture();for(const e of [d.h,d.r]){const duplicate={...e,id:e.id+20,data:{...e.data}};d.state.entities.set(duplicate.id,duplicate);d.state.entityList.push(duplicate);}
  assert.equal(approach(d),undefined);
  const u=fixture();u.h.data.unresolved=true;u.r.data.unresolved=true;assert.equal(approach(u),undefined);
  const n=fixture();n.h.team=1;n.r.team=1;assert.equal(approach(n),undefined);
});

test('flight, sector, blocked book and unavailable originals do not announce',()=>{
  for(const mutate of [f=>f.state.mode='docked',f=>f.state.ui.docked=true,f=>f.state.world.currentSectorId='sector_vesta',
    f=>f.b.blocked=true,f=>f.state.traffic.charonSalvageSupply=null,f=>{f.h.pos.x+=10000;f.r.pos.x+=10000;}]){
    const f=fixture();mutate(f);assert.equal(approach(f),undefined);
  }
});

test('Continue binding, release, replaced book and departure retire crossing without changing custody',()=>{
  for(const reset of [f=>bindRestoredCharonSupply(f.owner),f=>releaseCharonSupply(f.owner),
    f=>{f.state.traffic.charonSalvageSupply=normalizeCharonSupply(f.b);},
    f=>{f.state.world.currentSectorId='elsewhere';reconcileCharonSupply(f.owner);f.state.world.currentSectorId=C.sectorId;}]){
    const f=fixture();phase(f,'working','consumed');f.at(800);const before=JSON.stringify(f.b);reset(f);f.at(400);assert.equal(f.emitted.length,0);
    approach(f,5);assert.equal(f.emitted.length,1);assert.equal(JSON.stringify(f.state.traffic.charonSalvageSupply),before);
  }
});

test('validated historical cue passes admission but raw tags, tampering, old observations and combat do not',()=>{
  const f=fixture(), payload=approach(f);
  assert.equal(validCharonApproachReceipt(f.state,payload),true);
  assert.equal(admitReceipt({...payload,state:f.state}).admit,true);
  assert.equal(admitReceipt({...payload,state:f.state,combat:true}).admit,false);
  assert.equal(admitReceipt({text:payload.text}).admit,false,'normal Hail chatter rule remains');
  assert.equal(admitReceipt({text:'Cargo sold: 5 CR'}).admit,true,'ordinary receipt unchanged');
  for(const bad of [{...payload,text:'Hail arbitrary stranger'}, {...payload,charonApproach:true},
    {...payload,charonApproach:{...payload.charonApproach,status:'unlimited oxygen'}}]) assert.equal(validCharonApproachReceipt(f.state,bad),false);
  f.state.simTime+=1.01;assert.equal(validCharonApproachReceipt(f.state,payload),false);
});

test('microtask cancellation covers restore, sector reentry and explicit teardown',async()=>{
  for(const boundary of ['save:loaded','game:new','game:newGame','sector:enter','destroy']){
    const f=fixture(),shown=[],gate=createCharonApproachToastGate(f.bus,()=>f.state,p=>shown.push(p));
    gate.enqueue(approach(f));if(boundary==='destroy')gate.destroy();else f.bus.emit(boundary,{});
    await flush();assert.equal(shown.length,0,boundary);gate.destroy();
  }
});

async function replayFixture(t,f){
  const state={entities:new Map(),entityList:[],settings:{},meta:{seed:1},tick:0,simTime:0,accumulator:0,timeScale:0,ui:{screenStack:[]},world:{}};
  const bus=createBus(),posts=[],shown=[];let receive;
  const gate=createCharonApproachToastGate(bus,()=>state,p=>shown.push({...p,decision:admitReceipt({...p,state})}));
  bus.on('toast',p=>gate.enqueue(p));
  const lane=createSimLaneRuntime({state,helpers:{},registry:{},bus,flags:{lane:'worker',sab:false,warnings:[]},clockMode:'worker-local',
    channelFactory:()=>({post:m=>posts.push(m),onMessage:fn=>{receive=fn;},terminate(){}})});
  t.after(()=>{gate.destroy();lane.close();});
  const spawns=f.state.entityList.map(e=>({entityId:e.id,occupantGeneration:e.occupantGeneration,type:e.type,alive:e.alive,team:e.team,x:e.pos.x,z:e.pos.z,data:e.data,vitals:{hull:e.hull,hullMax:e.hullMax}}));
  receive({kind:'ready',seq:posts[0].seq,stateTick:0,spawnInfos:spawns,domainUpdates:[]});await lane.readyPromise;
  return {state,bus,shown,receive,spawns};
}

test('real event projector and worker-main replay preserve cue payload; post-shim validation sees latest state',async t=>{
  const f=fixture(),payload=approach(f),projected=projectBridgeEvent('toast',payload);
  assert.equal(projected.dropped,false);assert.deepEqual(projected.flat,payload);
  const main=await replayFixture(t,f);
  const updates=[['mode','flight'],['simTime',f.state.simTime],['playerId',f.p.id],['world.currentSectorId',C.sectorId],['ui.docked',false],['player',f.state.player]];
  const reply=(patch=[],events=[])=>({kind:'clockTick',stateTick:120,simTime:2,spawnInfos:main.spawns,
    domainUpdates:[...updates,...patch].map(([key,v])=>({segs:key.split('.'),v})),
    events:[{t:'toast',p:structuredClone(projected.flat),m:'flight',es:1},...events]});
  main.receive(reply());assert.equal(main.shown.length,0,'not displayed under emit-time shim');await flush();
  assert.equal(main.shown.length,1);assert.equal(main.shown[0].decision.admit,true);
  main.receive(reply([['mode','loading']]));await flush();assert.equal(main.shown.length,1,'emit-time flight must not override current loading');
  main.receive(reply([['world.currentSectorId','elsewhere']]));await flush();assert.equal(main.shown.length,1);
  main.receive(reply([], [{t:'save:loaded',p:{},m:'flight'}]));await flush();assert.equal(main.shown.length,1,'same-batch Continue cancels pending cue');
  main.spawns[1].occupantGeneration++;main.receive(reply());await flush();assert.equal(main.shown.length,1,'recycled target life is rejected after real spawn hydration');
});


test('malformed poses, changed player life, active survival and unsupported original Hail shape fail closed',()=>{
  for(const mutate of [f=>f.p.pos.x=NaN,f=>f.r.pos=null,f=>f.p.pos=null,
    f=>f.h.pos.x=Infinity,f=>f.p.occupantGeneration++,f=>f.state.run={kind:'survival',phase:'active'},
    f=>f.state.missions={active:[{status:'active',params:{racingContractId:'fixture-race',raceLease:true}}]}]){
    const f=fixture(),payload=approach(f);mutate(f);
    // Null cutter pose does not matter when the hauler was selected.
    if(f.r.pos===null){f.h.pos=null;}
    assert.equal(validCharonApproachReceipt(f.state,payload),false);
  }
  const f=fixture();f.r.alive=false;delete f.h.data.jobPhase;f.h.data.jobId='not-a-worker-job';f.h.data.ai.passive=false;
  f.state.player.targetId=f.h.id;assert.equal(contactHailAvailability(f.state).enabled,false);assert.equal(approach(f),undefined);
});

class Element {
  constructor(){this.children=[];this.style={setProperty(){}};this.dataset={};this.attrs={};this.classList={add(){},remove(){}};this.isConnected=true;}
  append(...nodes){for(const n of nodes){n.parentNode=this;n.isConnected=true;this.children.push(n);}}
  appendChild(n){this.append(n);return n;}
  removeChild(n){this.children=this.children.filter(x=>x!==n);n.parentNode=null;n.isConnected=false;return n;}
  prepend(n){n.parentNode=this;n.isConnected=true;this.children.unshift(n);}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(){}
  removeEventListener(){}
  contains(n){return this===n||this.children.includes(n);}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.isConnected=false;}
  querySelector(){return null;}
}
function domFixture(){
  const old={document:globalThis.document,raf:globalThis.requestAnimationFrame};
  const body=new Element(),hud=new Element(),root=new Element(),live=new Element();body.append(hud);hud.append(root);root.append(live);
  const nodes={hud,toasts:root,'toast-live':live};
  globalThis.document={body,activeElement:body,createElement:()=>new Element(),getElementById:id=>nodes[id]||null};
  globalThis.requestAnimationFrame=fn=>{fn();return 0;};
  return {body,hud,root,live,restore(){globalThis.document=old.document;globalThis.requestAnimationFrame=old.raf;}};
}

test('Charon toast lifecycle keeps direct receipts truthful and an old feed cannot clear its successor',()=>{
  const f=fixture(),dom=domFixture();
  const first=createToasts({state:f.state,bus:f.bus});
  let second;
  try {
    assert.equal(presentReceipt({text:'Cargo sold: 5 CR',silent:true}),true);
    assert.equal(dom.live.textContent,'Cargo sold: 5 CR');
    second=createToasts({state:f.state,bus:createBus()});
    first.destroy();
    assert.equal(presentReceipt({text:'Cargo sold: 6 CR',silent:true}),true,'old teardown preserves the current presenter');
    assert.equal(dom.live.textContent,'Cargo sold: 6 CR');
    second.destroy();
    assert.equal(presentReceipt({text:'Cargo sold: 7 CR',silent:true}),false,'destroyed UI never spends an unseen direct notice');
  } finally { first.destroy();second?.destroy();dom.restore(); }
});

test('actual toast presenter surfaces the canonical cue after replay, preserves first-feed repair and combat quieting',async t=>{
  const f=fixture(),payload=approach(f),main=await replayFixture(t,f),dom=domFixture();
  const ui=createToasts({state:main.state,bus:main.bus});
  t.after(()=>{ui.destroy();dom.restore();});
  dom.root.isConnected=false;dom.hud.children=[]; // Real createHud first-frame detach shape.
  const send=(events=[{t:'toast',p:projectBridgeEvent('toast',payload).flat,m:'flight',es:1}])=>main.receive({kind:'clockTick',stateTick:120,simTime:2,spawnInfos:main.spawns,
    domainUpdates:[{segs:['mode'],v:'flight'},{segs:['simTime'],v:2},{segs:['playerId'],v:1},{segs:['world','currentSectorId'],v:C.sectorId},{segs:['ui','docked'],v:false}],events});
  send();await flush();assert.equal(dom.live.textContent,payload.text);assert.ok(dom.hud.children.includes(dom.root),'existing first-use feed repair still runs');
  main.bus.emit('save:loaded',{});dom.live.textContent='';dom.body.dataset.sfHudJob='fight';send();await flush();assert.equal(dom.live.textContent,'','combat still quiets discovery');
  main.bus.emit('toast',{text:'Cargo sold: 5 CR',kind:'info'});assert.equal(dom.live.textContent,'Cargo sold: 5 CR','ordinary receipts still use synchronous path');
});


test('real UI destroy and reinit cleanup cancel queued cue before an obsolete feed can reattach',async()=>{
  const { ui } = await import('../src/ui/uiRoot.js');
  for(const boundary of ['destroy','init']){
    const f=fixture(),dom=domFixture(),owner=Object.create(ui);
    owner.toasts=createToasts({state:f.state,bus:f.bus});
    f.bus.emit('toast',approach(f));
    const previous=owner.toasts;
    if(boundary==='destroy')owner.destroy();
    else {
      // Execute real init cleanup only. Deliberately stop at its ctx read before
      // CSS/HUD construction; no game boot or browser acceptance is claimed.
      const stop=new Error('focused init-cleanup boundary');
      assert.throws(()=>owner.init({get state(){throw stop;}}),e=>e===stop);
    }
    dom.root.isConnected=false;dom.hud.children=[];
    await flush();assert.equal(dom.hud.children.length,0,boundary);assert.equal(owner.toasts,null);
    previous.push(approach(f,130));await flush();assert.equal(dom.hud.children.length,0,'stale direct handle stays inert');
    dom.restore();
  }
});


test('optional discovery remains combat-quiet even when a real callsign contains a commerce keyword',()=>{
  const f=fixture();f.h.data.callsign='CARGO HAULER';const payload=approach(f);
  assert.equal(admitReceipt({...payload,state:f.state,combat:true}).admit,false);
  assert.equal(admitReceipt({...payload,kind:'stunt',state:f.state,combat:true}).admit,false);
  assert.equal(admitReceipt({text:'Cargo sold: 5 CR',combat:true}).admit,true);
});


test('forged anchor and malformed roster/record metadata cannot move or authorize the discovery window',()=>{
  const f=fixture(),payload=approach(f);
  f.p.pos.x+=10000;f.h.pos.x+=10000;
  const forged={...payload,charonApproach:{...payload.charonApproach,centerX:payload.charonApproach.centerX+10000}};
  assert.equal(validCharonApproachReceipt(f.state,forged),false);
  const g=fixture(),valid=approach(g);
  for(const list of [null,{},undefined]){g.state.entityList=list;assert.equal(validCharonApproachReceipt(g.state,valid),false);}
  g.state.entityList=[g.p,g.h,g.r];
  assert.equal(validCharonApproachReceipt(g.state,{...valid,charonApproach:{...valid.charonApproach,actorRecordId:null}}),false);
});
