import {TALLY_THREE,tallyThreeBody,tallyThreeSource} from '../../src/data/tallyThree.js';
import {NEW_GAME} from '../../src/data/newGameDefaults.js';
import {createContactHailPrompt} from '../../src/ui/contactHailPrompt.js';

import assert from 'node:assert/strict';
import {createSimHost} from '../../scripts/lib/simWorkerHost.mjs';
import {createSimLaneRuntime} from '../../src/core/simLaneMain.js';
import {createGameState} from '../../src/core/gameState.js';
import {physicsBodyNativeReady} from '../../src/core/physicsAuthority.js';
import {createBus} from '../../src/core/eventBus.js';
import {setPromptDeck} from '../../src/ui/promptDeck.js';
import {laneCommandSink,uninstallSimCommandSink,installSimCommandSink,laneRpc,laneSetMode} from '../../src/core/simLaneCommands.js';
import {applyWorldObjectSelection} from '../../src/ui/worldObjectInteraction.js';
import contract from '../../src/data/scenarios/47a.scenario.json' with {type:'json'};

// Configured initial arrival, not a flown journey. No evidence, actor, source or
// receipt is seeded. Production selection/hail/physics and both transport bridges run.
export async function inspectTallyHailAdvice() {
 const worker=createSimHost(),state=createGameState(611),bus=createBus(),cards=new Map(),events=[];
 let deliver,commandsDone=Promise.resolve(),lane,stepTick=0,prompt;
 const doc=makeHailTestDocument(),withDoc=fn=>{const previous=globalThis.document;globalThis.document=doc;try{return fn()}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous}};
 const asWorker=async fn=>{const sink=laneCommandSink();uninstallSimCommandSink();try{return await fn()}finally{if(sink)installSimCommandSink(sink)}};
 const log=(stage,data={})=>console.log('CERES_STAGE '+JSON.stringify({stage,...data}));
 setPromptDeck({offerDecision(s){cards.set(s.id,s);return true},resolveDecision(id){return cards.delete(id)}});
 try {
  lane=createSimLaneRuntime({state,bus,registry:{},flags:{lane:'worker',sab:false,warnings:[]},clockMode:'worker-local',
   channelFactory:()=>({onMessage(fn){deliver=message=>withDoc(()=>fn(message))},terminate(){worker.shutdown()},post(message){
    if(message.kind==='init')asWorker(()=>worker.init({...structuredClone(message),scenarioContract:contract,seed:611,viewport:{w:1000,h:600}}))
     .then(reply=>deliver(structuredClone({kind:'ready',seq:message.seq,...reply})))
     .catch(e=>deliver({kind:'error',seq:message.seq,message:String(e)}));
    if(message.kind==='clockCommand')commandsDone=commandsDone.then(async()=>{
     const reply=await asWorker(()=>worker.tick({...structuredClone(message),kind:'tick'}));
     deliver(structuredClone({kind:'clockTick',...reply,commandSequence:message.commandSequence}));
    });
   }})});
  await lane.readyPromise;log('host-ready');
  worker.host.bus.on('credits:changed',p=>events.push({type:'credits',p:structuredClone(p)}));
  for(const type of ['economy:grantCredits','economy:chargeCredits','economy:tradeCompleted','mission:completed','scan:wreckInvestigated'])worker.host.bus.on(type,p=>events.push({type,p:structuredClone(p)}));
  prompt=withDoc(()=>createContactHailPrompt({state,bus}));

  const boot=await laneRpc('newGameBoot',{opts:{seed:611}});log('new-game-boot',{boot});
  laneSetMode(state,bus,'flight');await commandsDone;
  await laneRpc('worldCall',{method:'enterSector',sectorId:TALLY_THREE.sectorId});

  const authority=worker.host.state,physics=worker.host.registry.get('physics');
  const player=()=>authority.entities.get(authority.playerId);
  const original=tallyThreeBody(authority,TALLY_THREE.worldRecordId);
  assert.ok(original,'ordinary sector entry creates the original Tally crate');
  const receiver=authority.entityList.find(e=>e.alive!==false&&e.type==='station'&&e.data?.stationId===TALLY_THREE.homeStationId);
  assert.ok(receiver);
  const angle=Math.atan2(receiver.pos.z-original.pos.z,receiver.pos.x-original.pos.x);
  const initialPose={x:original.pos.x+Math.cos(angle)*100,z:original.pos.z+Math.sin(angle)*100,heading:angle};
  await laneRpc('worldCall',{method:'relocatePlayerInSector',pose:initialPose,opts:{reason:'test-configured-initial-tally-arrival'}});
  const owned=authority.player.ownedShips[authority.player.activeShipIndex||0];
  assert.equal(owned.defId,'ship_kestrel');
  assert.deepEqual(owned.fittings.filter(Boolean).slice().sort(),NEW_GAME.fittedModules.slice().sort());
  assert.deepEqual(authority.player.researchedNodes,[]);
  assert.equal(authority.player.credits,5000);
  assert.equal(tallyThreeSource(authority).delivery==null,true);
  log('tally-configured-arrival',{initialPose,owned,source:tallyThreeSource(authority),player:player().id,crate:original.id,receiver:receiver.id,scheme:authority.settings.gameplay.controlScheme});
  for(const type of ['tether:latched','tether:latchDenied','tether:broke','tether:broken','cargo:tallyThreeDelivered'])worker.host.bus.on(type,p=>events.push({type,p:structuredClone(p)}));
  let offer=null,response=null;
  bus.on('contactHail:offer',p=>{offer=structuredClone(p);log('tally-main-hail-offer',p)});
  bus.on('contactHail:response',p=>{response=structuredClone(p);log('tally-main-hail-response',p)});
  const step=async(n=1)=>{await commandsDone;const reply=await asWorker(()=>worker.tick({kind:'tick',tick:++stepTick,steps:n,commands:[]}));deliver(structuredClone({kind:'clockTick',...reply}));await commandsDone;};
  const native=e=>{const r=physics._sg02?.records.get(e.id);assert.equal(physicsBodyNativeReady(e),true);assert.equal(r?.entity,e);assert.equal(r.body.isValid(),true);return r;};
  await step(2);native(player());native(original);
  const projected=state.entities.get(original.id);assert.ok(projected);assert.notEqual(projected,original);
  assert.equal(applyWorldObjectSelection(state,projected,'test-visible-original-tally'),true);await commandsDone;await step(2);
  const beforeAdvice=JSON.stringify(authority.lineProgression);
  assert.equal(withDoc(()=>prompt.request('pointer')),true,'actual main hail presenter accepts request');await commandsDone;
  assert.equal(offer?.kind,'tally_three');
  assert.ok(offer.actions.some(a=>a.id==='tally_deliver'));

  assert.match(offer.towAdvice,/180T load/);
  assert.match(offer.towAdvice,/Class I controls 20T/);
  assert.match(offer.towAdvice,/Temporary hold: heat can snap/);
  const rows=prompt.el.querySelector('[data-k="lines"]').children;
  assert.equal(rows.length,3);assert.equal(rows[2].textContent,offer.towAdvice);
  assert.match(rows[2].className,/tow-advice/);
  assert.equal(prompt.el.querySelector('[data-k="panel"]').attributes['aria-label'],[...offer.lines,offer.towAdvice].join(' '));
  assert.equal(JSON.stringify(authority.lineProgression),beforeAdvice,'hail advice never grants or changes progression');
  assert.deepEqual(offer.actions.map(a=>a.id),['tally_deliver','tally_contest','tally_receiver']);
  assert.match(offer.lines[0],/4u \/ 140 cr/);
  assert.equal(tallyThreeSource(authority).delivery,null);
  assert.equal(authority.player.credits,5000);
  log('tally-hail-advice-shown',{offer,shown:rows.map(e=>e.textContent),lineProgression:authority.lineProgression,crate:{id:original.id,generation:original.occupantGeneration,mass:original.physicsBody.mass},credits:authority.player.credits});
  return {offer,shown:rows.map(e=>e.textContent)};
 }finally{withDoc(()=>prompt?.destroy());setPromptDeck(null);lane?.close();worker.shutdown();}
}

export function makeHailTestDocument(){
 class Element{
  constructor(){this.children=[];this.nodes=new Map();this.dataset={};this.attributes={};this.style={};this.classList={add(){},remove(){},toggle(){},contains(){return false}};this.hidden=false;}
  appendChild(e){this.children.push(e);e.parentNode=this;return e}
  removeChild(e){this.children=this.children.filter(x=>x!==e);e.parentNode=null}
  replaceChildren(...es){this.children=[];for(const e of es)this.appendChild(e)}
  querySelector(q){if(!this.nodes.has(q))this.nodes.set(q,new Element());return this.nodes.get(q)}
  setAttribute(k,v){this.attributes[k]=String(v)} addEventListener(){} removeEventListener(){} remove(){this.parentNode?.removeChild(this)}
  contains(e){return this.children.includes(e)}
 }
 const root=new Element(),head=new Element();
 return {head,createElement:()=>new Element(),getElementById:id=>id==='ui-root'?root:null,addEventListener(){},removeEventListener(){}};
}
