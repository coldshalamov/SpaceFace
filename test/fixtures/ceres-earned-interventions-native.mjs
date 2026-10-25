
import assert from 'node:assert/strict';
import {createSimHost} from '../../scripts/lib/simWorkerHost.mjs';
import {createSimLaneRuntime} from '../../src/core/simLaneMain.js';
import {createGameState} from '../../src/core/gameState.js';
import {physicsBodyNativeReady} from '../../src/core/physicsAuthority.js';
import {createBus} from '../../src/core/eventBus.js';
import {lastShiftPrompt} from '../../src/ui/lastShiftPrompt.js';
import {setPromptDeck} from '../../src/ui/promptDeck.js';
import {laneCommandSink,uninstallSimCommandSink,installSimCommandSink,laneRpc,laneSetMode,laneDomEvent} from '../../src/core/simLaneCommands.js';
import {applyWorldObjectSelection} from '../../src/ui/worldObjectInteraction.js';
import {LAST_SHIFT as C,LAST_SHIFT_POS,lastShiftArchiveEvidence} from '../../src/data/lastShift.js';
import contract from '../../src/data/scenarios/47a.scenario.json' with {type:'json'};

// Configured initial arrival, not a flown journey. No evidence, actor, source or
// receipt is seeded. Production input/scan/physics and both transport bridges run.
export async function earnLastShiftArchive() {
 const worker=createSimHost(),state=createGameState(611),bus=createBus(),cards=new Map(),events=[];
 let deliver,commandsDone=Promise.resolve(),lane,stepTick=0,prompt;
 const asWorker=async fn=>{const sink=laneCommandSink();uninstallSimCommandSink();try{return await fn()}finally{if(sink)installSimCommandSink(sink)}};
 const log=(stage,data={})=>console.log('CERES_STAGE '+JSON.stringify({stage,...data}));
 setPromptDeck({offerDecision(s){cards.set(s.id,s);return true},resolveDecision(id){return cards.delete(id)}});
 try {
  lane=createSimLaneRuntime({state,bus,registry:{},flags:{lane:'worker',sab:false,warnings:[]},clockMode:'worker-local',
   channelFactory:()=>({onMessage(fn){deliver=fn},terminate(){worker.shutdown()},post(message){
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
  prompt={...lastShiftPrompt};prompt.init({state,bus});
  assert.equal(worker.host.registry.get('lastShiftPrompt'),null);
  const boot=await laneRpc('newGameBoot',{opts:{seed:611}});log('new-game-boot',{boot});
  laneSetMode(state,bus,'flight');await commandsDone;
  await laneRpc('worldCall',{method:'enterSector',sectorId:C.sectorId});
  const initialPose={x:LAST_SHIFT_POS.x+200,z:LAST_SHIFT_POS.z+180,heading:0};
  const arrival=await laneRpc('worldCall',{method:'relocatePlayerInSector',pose:initialPose,opts:{reason:'test-configured-initial-ceres-arrival'}});
  const authority=worker.host.state,owner=worker.host.registry.get('lastShift'),physics=worker.host.registry.get('physics');
  const player=()=>authority.entities.get(authority.playerId);
  assert.deepEqual(owner.readout().clueIds,[]);assert.equal(owner.serialize().receipts.length,0);
  const initial={pose:initialPose,arrival,playerId:player().id,playerGeneration:player().occupantGeneration,credits:authority.player.credits,clueIds:owner.readout().clueIds,receipts:owner.serialize().receipts,creditEventIndex:events.length};
  log('configured-arrival',initial);
  worker.host.bus.on('scan:pulse',p=>events.push({type:'scan',p:structuredClone(p)}));
  worker.host.bus.on('lastShift:archived',p=>events.push({type:'archive',p:structuredClone(p)}));
  const step=async(n=1)=>{await commandsDone;const reply=await asWorker(()=>worker.tick({kind:'tick',tick:++stepTick,steps:n,commands:[]}));deliver(structuredClone({kind:'clockTick',...reply}));await commandsDone;};
  await step(2);
  const fairlead=authority.entityList.find(e=>e.alive!==false&&e.data?.lastShiftClueId==='fairlead'&&e.data?.lastShiftSiteId===C.siteId);
  assert.ok(fairlead,'ordinary update materializes original fairlead');
  const originals=authority.entityList.filter(e=>e.alive!==false&&e.data?.lastShiftSiteId===C.siteId);
  assert.equal(originals.length,3);
  assert.ok(physics._sg02,'actual Rapier backend is active');
  const assertNative=entity=>{const record=physics._sg02.records.get(entity.id);assert.equal(physicsBodyNativeReady(entity),true,'production native readiness');assert.ok(record);assert.equal(record.entity,entity,'record owns original identity');assert.equal(record.body.isValid(),true,'native body remains live');return record;};
  const playerRecord=assertNative(player()),fairleadRecord=assertNative(fairlead);
  assert.ok(Math.hypot(fairlead.pos.x-player().pos.x,fairlead.pos.z-player().pos.z)<C.scanRangeWu);
  const identity={id:fairlead.id,generation:fairlead.occupantGeneration};
  log('originals-materialized',{identity,nativeBodies:physics._sg02.records.size,simTime:authority.simTime});
  const projected=state.entities.get(fairlead.id);
  assert.ok(projected,'original fairlead is available in the main projected entity map');
  assert.notEqual(projected,fairlead,'selection consumes main projection, not authority object');
  assert.equal(projected.occupantGeneration,fairlead.occupantGeneration);
  assert.equal(applyWorldObjectSelection(state,projected,'test-visible-original-selection'),true);await commandsDone;
  laneDomEvent({type:'keydown',code:'KeyC',pressed:true,blocked:false});await commandsDone;await step(1);
  laneDomEvent({type:'keyup',code:'KeyC',pressed:false});await commandsDone;
  assert.ok(events.some(e=>e.type==='scan'&&e.p.source==='player-scanner'&&e.p.scannerId===player().id));
  assert.deepEqual(owner.readout().clueIds,['fairlead']);
  assert.equal(assertNative(fairlead),fairleadRecord,'same live native original after scan step');
  assert.equal(assertNative(player()),playerRecord,'same live native player after scan step');
  assert.equal(fairlead.id,identity.id);assert.equal(fairlead.occupantGeneration,identity.generation);
  const card=cards.get('last-shift:evidence');assert.ok(card,'real worker offer crosses into main prompt');
  assert.equal(card.choices.find(c=>c.id==='archive').label,'FILE 1/3 SOURCES');
  assert.equal(card.choices.some(c=>c.id==='return'),false);
  assert.equal(owner.serialize().receipts.length,0);
  const preFileCredits=authority.player.credits,preFileCreditEvents=events.filter(e=>e.type==='credits').length;
  log('before-file',{credits:preFileCredits,events:events.filter(e=>e.type==='credits')});
  assert.equal(card.onChoose('archive'),true);await commandsDone;
  assert.equal(owner.serialize().receipts.length,1);
  assert.deepEqual(owner.serialize().receipts[0].clueIds,['fairlead']);
  assert.equal(authority.player.credits,preFileCredits,'filing itself adds no payment');
  assert.equal(events.filter(e=>e.type==='credits').length,preFileCreditEvents,'filing emits no wallet mutation');
  assert.equal(events.slice(initial.creditEventIndex).filter(e=>e.type==='credits').reduce((n,e)=>n+e.p.delta,0),authority.player.credits-initial.credits,'all incidental wallet movement has an observed production owner');
  assert.equal(events.filter(e=>e.type==='archive').length,1);
  assert.ok(lastShiftArchiveEvidence(authority));
  assert.equal(card.onChoose('archive'),false);await commandsDone;
  assert.equal(owner.serialize().receipts.length,1);
  assert.equal(lane.getDiagnostics().unforwardedEmitCount,0);
  const earnedReceipt=structuredClone(owner.serialize().receipts),continuity=[],mainSectorExits=[];
  bus.on('sector:exit',p=>mainSectorExits.push(structuredClone(p)));
  for(const sectorId of ['sector_helios_prime',C.sectorId]){
   const exitsBefore=mainSectorExits.length;
   const transition=await laneRpc('worldCall',{method:'enterSector',sectorId});await step(2);
   assert.equal(mainSectorExits.length,exitsBefore+1,'actual sector exit crosses to main consumer');
   assert.deepEqual(owner.serialize().receipts,earnedReceipt,'earned archive survives ordinary sector transition');
   assert.ok(lastShiftArchiveEvidence(authority));
   assert.equal(events.filter(e=>e.type==='archive').length,1);
   continuity.push({sectorId,transition,playerPosition:structuredClone(player().pos),receipts:structuredClone(owner.serialize().receipts)});
  }
  assert.equal(events.slice(initial.creditEventIndex).filter(e=>e.type==='credits').reduce((n,e)=>n+e.p.delta,0),authority.player.credits-initial.credits,'all continuity wallet movement remains accounted');
  log('configured-sector-continuity',{continuity,mainSectorExits});
  const result={initial,identity,continuity,mainSectorExits,simTime:authority.simTime,receipts:owner.serialize().receipts,credits:authority.player.credits,events,nativeBodies:physics._sg02.records.size};
  log('earned-archive',result);return result;
 }finally{prompt?.destroy();setPromptDeck(null);lane?.close();worker.shutdown();}
}
