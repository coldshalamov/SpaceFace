import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegistry} from '../src/core/registry.js';
import {createGameState} from '../src/core/gameState.js';
import {createBus} from '../src/core/eventBus.js';
import {lastShiftPrompt} from '../src/ui/lastShiftPrompt.js';
import {setPromptDeck} from '../src/ui/promptDeck.js';
import {MAIN_TO_SIM_BUS_EVENTS as gate} from '../src/core/mainToSimEventSurface.js';
const row={canArchive:true,canRecoverRecorder:true,clueIds:['recorder'],revision:1,text:'Read recorder evidence only.'};
function fixture(){const bus=createBus(),prompt={...lastShiftPrompt},events=[];let spec;
 setPromptDeck({offerDecision(s){spec=s;return true;},resolveDecision(){}});prompt.init({bus,state:{mode:'flight'}});
 for(const name of ['archive','recover','cancelRecovery','returnRecorder'])bus.on(`lastShift:${name}`,p=>events.push({name,p}));
 prompt.offer(row);return{bus,prompt,events,get spec(){return spec;},close(){prompt.destroy();setPromptDeck(null);}};
}
test('actual main registry owns the Last Shift source register',()=>{
 assert.equal(createRegistry({state:createGameState(18),bus:createBus(),helpers:{},simLane:'worker'}).get('lastShiftPrompt'),lastShiftPrompt);
});
test('exact production gate contains current Last Shift routes and preserves Ilex/Towline',()=>{
 assert.deepEqual([...gate].filter(x=>x.startsWith('lastShift:')).sort(),['archive','cancelRecovery','cueSurfaced','readRecovery','recover','returnRecorder'].map(x=>`lastShift:${x}`));
 assert.deepEqual([...gate].filter(x=>x.startsWith('ilexArk:')).sort(),['accept','course','deliver','finish'].map(x=>`ilexArk:${x}`));
 assert.deepEqual([...gate].filter(x=>x.startsWith('towlineTable:')).sort(),['assist','course','deliver','release','take'].map(x=>`towlineTable:${x}`));
 for(const id of ['offer','cue','archived','recorderReturned','inspect','destroy'])assert.equal(gate.has(`lastShift:${id}`),false);
});
test('unrendered hardware return and retained callback after restore cannot emit',()=>{
 const h=fixture();try{h.spec.onChoose('return');assert.equal(h.events.length,0);h.bus.emit('save:restoring');h.spec.onChoose('archive');assert.equal(h.events.length,0);}finally{h.close();}
});

// Actual registry selection, production host and lane bridge; unrelated main lifecycle
// hooks are inert so this test never boots graphics, audio or the game world.
test('production registry owns the prompt on main and the actual worker offer/action crosses both bridges', async () => {
  const {createSimHost}=await import('../scripts/lib/simWorkerHost.mjs');
  const {createSimLaneRuntime}=await import('../src/core/simLaneMain.js');
  const {createRegistry}=await import('../src/core/registry.js');
  const {createGameState}=await import('../src/core/gameState.js');
  const {makeShipEntitySpec}=await import('../src/systems/ships.js');
  const {LAST_SHIFT:C,LAST_SHIFT_POS}=await import('../src/data/lastShift.js');
  const {laneCommandSink,uninstallSimCommandSink,installSimCommandSink}=await import('../src/core/simLaneCommands.js');
  const {default:contract}=await import('../src/data/scenarios/47a.scenario.json',{with:{type:'json'}});
  const oldDocument=globalThis.document,oldStorage=globalThis.localStorage,worker=createSimHost(),state=createGameState(806),bus=createBus(),entries=new Map(),events=[];
  let deliver,registry;let commandsDone=Promise.resolve();const saved=[];
  // Same-process bridge harness: hide the main-only DOM and command sink in worker calls.
  const asWorker=async fn=>{const sink=laneCommandSink(),doc=globalThis.document;uninstallSimCommandSink();delete globalThis.document;try{return await fn();}finally{globalThis.document=doc;if(sink)installSimCommandSink(sink);}};
  const lane=createSimLaneRuntime({state,bus,registry:{},flags:{lane:'worker',sab:false,warnings:[]},clockMode:'worker-local',
    channelFactory:()=>({onMessage(fn){deliver=fn;},terminate(){worker.shutdown();},post(message){
      if(message.kind==='init')asWorker(()=>worker.init({...structuredClone(message),scenarioContract:contract}))
        .then(reply=>deliver(structuredClone({kind:'ready',seq:message.seq,...reply})))
        .catch(e=>deliver({kind:'error',seq:message.seq,message:String(e)}));
      if(message.kind==='clockCommand') commandsDone=commandsDone.then(async()=>{
        assert.equal(message.steps,0,'fixture must not step production/native world');
        const reply=await asWorker(()=>worker.tick({...structuredClone(message),kind:'tick',steps:0}));
        deliver(structuredClone({kind:'clockTick',...reply,commandSequence:message.commandSequence}));
      });
    }})});
  setPromptDeck({offerDecision(s){entries.set(s.id,s);return true;},resolveDecision(id){return entries.delete(id);}});
  const nodes=[];let showToast=false;const acks=[];

  bus.on('toast',p=>{if(showToast)nodes.push({isConnected:true,textContent:p.text});});
  bus.on('lastShift:cueSurfaced',p=>acks.push(p));
  try {
    await lane.readyPromise;
  globalThis.document={body:{dataset:{sfHudJob:'mine'}},getElementById:id=>id==='toasts'?{querySelectorAll:()=>nodes}:null};
    const ctx={state,bus,helpers:{},simLane:'worker'};
    registry=createRegistry(ctx);ctx.registry=registry;
    assert.equal(registry.get('lastShiftPrompt'),lastShiftPrompt,'actual main registry must retain deck adapter');
    assert.equal(worker.host.registry.get('lastShiftPrompt'),null,'worker must not own realm-local deck');
    for(const s of registry.systems)if(s&&s.name!=='lastShiftPrompt'){
      saved.push([s,s.init,s.destroy]);s.init=()=>{};s.destroy=()=>{};
    }
    registry.init();
    const {state:authority,runtime,registry:owners}=worker.host,owner=owners.get('lastShift');
    authority.mode='flight';authority.world.currentSectorId=C.sectorId;authority.onboarding={active:false,finished:true};
    authority.missions.completedLog=[{type:'cargo_delivery',success:1}];
    const player=runtime.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:authority.player,pos:{x:LAST_SHIFT_POS.x,z:LAST_SHIFT_POS.z},fittings:[]}));authority.playerId=player.id;
    state.mode='flight';
    const flush=async()=>{lane.runner.prepareWithoutAdvance();await Promise.resolve();await commandsDone;await Promise.resolve();await commandsDone;};
    await asWorker(()=>owner.update(1/60,authority));await flush();
    assert.equal(owner._row.surfaced,false,'DOM root and offer acceptance do not count as presentation');assert.equal(acks.length,0);
    showToast=true;authority.simTime=6;await asWorker(()=>owner.update(1/60,authority));await flush();await flush();
    assert.equal(owner._row.surfaced,true,'actual matching connected text acknowledges through production gate');
    assert.equal(acks.length,1);
    assert.deepEqual(owner._row.knownClueIds,[],'arrival never reads evidence');assert.equal(owner._row.receipts.length,0);
    const recorder=owner._find('recorder');player.pos.copy(recorder.pos);
    await asWorker(()=>owner.inspect(recorder.id));await flush();
    let card=entries.get('last-shift:evidence');assert.ok(card);assert.match(card.detail,/incomplete/);
    assert.deepEqual(owner._row.knownClueIds,['recorder']);
    const recorderBeforeDirections=owner._find('recorder'),creditsBeforeDirections=authority.player.credits;
    assert.equal(card.choices.some(c=>c.id==='recovery'),true,'read evidence unlocks optional recovery directions');
    assert.equal(card.choices.some(c=>c.id==='return'),false,'directions do not bypass a physical tow');
    card.onChoose('recovery');await flush();
    let recovery=entries.get('last-shift:evidence');assert.match(recovery.detail,/Optional: tow the original recorder/);
    assert.ok(recovery.choices.some(c=>c.id==='advice'));assert.ok(recovery.choices.some(c=>c.id==='back'));
    assert.equal(owner._row.bodies.recorder.status,'live');assert.equal(owner._row.recoveryActive,false);
    assert.deepEqual(owner._row.knownClueIds,['recorder']);assert.equal(owner._row.receipts.length,0);
    assert.equal(authority.player.credits,creditsBeforeDirections);assert.equal(owner._find('recorder'),recorderBeforeDirections);
    const staleRecovery=recovery;recovery.onChoose('advice');
    let advice=entries.get('last-shift:evidence');assert.match(advice.detail,/Keep separation/);
    assert.equal(staleRecovery.onChoose('back'),false,'advice page retires the prior recovery callback');
    advice.onChoose('back');await flush();
    recovery=entries.get('last-shift:evidence');assert.match(recovery.detail,/Optional: tow the original recorder/);
    const staleAdvice=advice;recovery.onChoose('back');await flush();
    let sources=entries.get('last-shift:evidence');assert.match(sources.detail,/incomplete/);
    assert.equal(staleAdvice.onChoose('archive'),false,'returning to sources retires the advice callback');
    assert.ok(sources.choices.some(c=>c.id==='archive'));
    sources.onChoose('archive');await flush();
    assert.equal(owner._row.receipts.length,1);assert.deepEqual(owner._row.receipts[0].clueIds,['recorder']);
    assert.equal(authority.player.credits,creditsBeforeDirections);
    assert.equal(dossArchiveEvidence(authority).find(e=>e.id==='ceres_last_shift')?.detail,'1 source');
    assert.match(dossArchiveEvidence(authority).find(e=>e.id==='ceres_last_shift').copy,/incomplete/);
    const before=authority.player.credits;
    authority.settings.gameplay.physicsBackend='legacy';const oldPort=owner.ctx.helpers.combatPhysics;
    owner.ctx.helpers.combatPhysics={createAttachment:r=>({id:r.attachmentId}),cutAttachment:()=>true};
    try {
      player.pos.set(LAST_SHIFT_POS.x,0,LAST_SHIFT_POS.z);player.vel.set(0,0,0);
      recorder.pos.set(player.pos.x+20,0,player.pos.z);recorder.vel.set(0,0,0);
      runtime.spawn({type:'station',team:2,pos:{x:player.pos.x+70,z:player.pos.z},radius:80,hull:1000,hullMax:1000,mass:1000,data:{stationId:'station_test_archive',dockRadius:80}});
      bus.emit('lastShift:returnRecorder',{revision:owner._row.revision,bodyId:recorder.id,by:'crew'});await commandsDone;
      assert.equal(!!owner._row.recorderReturn,false,'forged request without original line is refused');assert.equal(owner._find('recorder'),recorder);
      const line=await asWorker(()=>getCombatKernel(owner.ctx).attachments.create({defId:'tether_standard',ownerId:player.id,targetId:recorder.id,sourceWorld:player.pos,targetWorld:recorder.pos}));assert.equal(line.ok,true);
      await asWorker(()=>owner._offer());await flush();card=entries.get('last-shift:evidence');
      assert.ok(card.choices.some(c=>c.id==='return'));card.onChoose('return');await commandsDone;
      assert.equal(owner._row.bodies.recorder.status,'returned');assert.ok(owner._row.recorderReturn);
      assert.equal(authority.player.credits,before);assert.deepEqual(owner._row.knownClueIds,['recorder']);
      const receipt=structuredClone(owner._row.recorderReturn),saved=structuredClone(owner._row.receipts),save=owners.get('save');
      const old=entries.get('last-shift:evidence');assert.equal(await asWorker(()=>save.loadEnvelope(save.serialize('last-shift-player-path'))),true);await flush();
      assert.equal(old.onChoose('archive'),false);assert.equal(card.onChoose('return'),false);
      assert.equal(owner._row.surfaced,true);assert.deepEqual(owner._row.recorderReturn,receipt);assert.deepEqual(owner._row.receipts,saved);
      assert.equal(owner._find('recorder'),null);assert.equal(authority.player.credits,before);
      bus.emit('lastShift:returnRecorder',{revision:owner._row.revision});await commandsDone;assert.deepEqual(owner._row.recorderReturn,receipt);
      bus.emit('lastShift:archive',{revision:saved[0].revision});await commandsDone;assert.deepEqual(owner._row.receipts,saved);
      authority.mode='flight';state.mode='flight';authority.simTime+=6;await asWorker(()=>owner.update(1/60,authority));await flush();
      assert.equal(acks.filter(p=>p.id===`${C.siteId}:approach`).length,1,'Continue does not replay already surfaced arrival');
    }finally{owner.ctx.helpers.combatPhysics=oldPort;}

  } finally {
    registry?.destroy();for(const [s,init,destroy]of saved){s.init=init;s.destroy=destroy;}
    setPromptDeck(null);lane.close();worker.shutdown();globalThis.document=oldDocument;
    if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage;
  }
});

import {getCombatKernel} from '../src/combat/kernel.js';
import {dossArchiveEvidence} from '../src/data/dossArchive.js';

test('cue acknowledgement requires a connected matching receipt, not a root, rejected message or combat',()=>{
 const old=globalThis.document,h=fixture();let nodes=[],acks=0,paint=null;
 const root={querySelectorAll:()=>nodes};globalThis.document={body:{dataset:{sfHudJob:'mine'}},getElementById:()=>root};
 h.bus.on('lastShift:cueSurfaced',()=>acks++);h.bus.on('toast',()=>{if(paint)nodes=[paint];});
 const cue={id:'last-shift:approach',text:'LAST SHIFT — optional wreckage beside the working seam.'};
 try{
  assert.equal(h.prompt.cue(cue),false);assert.equal(acks,0);
  paint={isConnected:true,textContent:'Another receipt'};assert.equal(h.prompt.cue(cue),false);
  paint={isConnected:false,textContent:cue.text};assert.equal(h.prompt.cue(cue),false);
  document.body.dataset.sfHudJob='fight';paint={isConnected:true,textContent:cue.text};assert.equal(h.prompt.cue(cue),false);
  document.body.dataset.sfHudJob='mine';assert.equal(h.prompt.cue(cue),true);assert.equal(acks,1);
  document.getElementById=()=>null;assert.equal(h.prompt.cue(cue),false);assert.equal(acks,1);
 }finally{globalThis.document=old;h.close();}
});
test('every lifecycle and replaced/rejected card rejects stale choices and local source toggles',()=>{
 for(const event of ['game:load','game:new','game:newGame','save:restoring','save:loaded','dock:docked','sector:exit','destroy']){
  const h=fixture();try{h.prompt.offer({...row,recoveryActive:true,recoveryGuidance:'Existing berth.'});const old=h.spec;
   if(event==='destroy')h.prompt.destroy();else h.bus.emit(event);
   assert.equal(old.onChoose('sources'),false,event);assert.equal(old.onChoose('archive'),false);assert.equal(h.events.length,0);
   if(event!=='destroy'){h.prompt.offer(row);assert.equal(h.spec.onChoose('archive'),true);assert.equal(h.spec.onChoose('archive'),false);assert.equal(h.events.length,1);}
  }finally{h.close();}
 }
 const h=fixture();try{const old=h.spec;h.prompt.offer({...row,revision:2});assert.equal(old.onChoose('archive'),false);
  const active=h.spec;setPromptDeck({offerDecision(){return false;},resolveDecision(){}});assert.equal(h.prompt.offer(row),false);assert.equal(active.onChoose('archive'),false);
 }finally{h.close();}
});

test('worker-main receipt waits for replay unwind and lifetime changes cancel pending acknowledgements',async()=>{
 const old=globalThis.document;
 try{
  for(const event of ['sector:exit','dock:docked','save:restoring','save:loaded','game:load','game:new','game:newGame','destroy','replacement','duplicate','successor','notFlight','valid']){
   const bus=createBus(),prompt={...lastShiftPrompt},acks=[];let nodes=[];
   globalThis.document={body:{dataset:{sfHudJob:'mine'}},getElementById:()=>({querySelectorAll:()=>nodes})};
   bus.on('toast',p=>{nodes=[{isConnected:true,textContent:p.text}];});bus.on('lastShift:cueSurfaced',p=>acks.push(p));
   prompt.init({state:{mode:'flight'},bus,simLane:'worker'});
   const cue={id:'site:approach',text:'LAST SHIFT — optional wreckage.'};assert.equal(prompt.cue(cue),true);assert.equal(acks.length,0);
   if(event==='destroy')prompt.destroy();else if(event==='replacement')prompt.cue({id:'replacement',text:''});
   else if(event==='duplicate')prompt.cue(cue);else if(event==='successor')prompt.cue({...cue,id:'site:revisit'});else if(event==='notFlight')prompt.state.mode='menu';else if(event!=='valid')bus.emit(event);
   await Promise.resolve();assert.equal(acks.length,['valid','duplicate','successor'].includes(event)?1:0,event);
   if(event==='successor')assert.equal(acks[0].id,'site:revisit');
   prompt.destroy();
  }
 }finally{globalThis.document=old;}
});

test('synchronous presentation interruption or nested cue cannot revive an obsolete acknowledgement',async()=>{
 const old=globalThis.document;
 try{for(const simLane of [undefined,'worker'])for(const action of ['save:restoring','sector:exit','destroy','newer','rootGone','documentGone']){
  const bus=createBus(),prompt={...lastShiftPrompt},acks=[];let nodes=[],nested=false;
  globalThis.document={body:{dataset:{sfHudJob:'mine'}},getElementById:()=>({querySelectorAll:()=>nodes})};
  prompt.init({state:{mode:'flight'},bus,simLane});bus.on('lastShift:cueSurfaced',p=>acks.push(p.id));
  bus.on('toast',p=>{nodes.push({isConnected:true,textContent:p.text});if(nested)return;nested=true;
   if(action==='newer')prompt.cue({id:'newer',text:'LAST SHIFT — current receipt.'});
   else if(action==='destroy')prompt.destroy();else if(action==='rootGone')document.getElementById=()=>null;else if(action==='documentGone')delete globalThis.document;else bus.emit(action);
  });
  assert.equal(prompt.cue({id:'old',text:'LAST SHIFT — earlier receipt.'}),false);
  await Promise.resolve();assert.deepEqual(acks,action==='newer'?['newer']:[],`${simLane}:${action}`);prompt.destroy();
 }}finally{globalThis.document=old;}
});
