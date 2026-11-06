import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing } from '../scripts/lib/simCommandChannel.mjs';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { laneCommandSink, installSimCommandSink, uninstallSimCommandSink } from '../src/core/simLaneCommands.js';
import { createAftermathChoicePrompt } from '../src/ui/aftermathChoicePrompt.js';
import { createEncounterChoicePrompt } from '../src/ui/encounterChoicePrompt.js';
import { setPromptDeck, getPromptDeck } from '../src/ui/promptDeck.js';
import { E1_ENCOUNTER_RUNTIMES } from '../src/systems/e1EncounterRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const contract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));

test('H6 wait reaches the actual encounter adapter with its own title and original clock', () => {
  const before = getPromptDeck(), bus = createBus(), cards = new Map();
  setPromptDeck({ offerDecision(s) { cards.set(s.id,s); return true; }, resolveDecision(id) { return cards.delete(id); } });
  const ui = createEncounterChoicePrompt({bus});
  try {
    const live = { id:'h6:1', shape:{title:'PATROL AMBUSH'}, vars:{}, phase:'choice' };
    E1_ENCOUNTER_RUNTIMES.h6.choose({ now:()=>12, emit:(name,p)=>bus.emit(name,p) }, live, {}, 'wait');
    const card=cards.get('encounter:h6:1');
    assert.equal(card.headline,'PATROL AMBUSH');
    assert.equal(card.detail,'Both sides are fighting. Hold position.');
    assert.equal(card.deadlineAt,live.vars.h6Battle.waitDeadlineAt);
    assert.equal(card.ttlAt,card.deadlineAt);
    assert.deepEqual(card.choices,[]);
  } finally { ui.destroy(); setPromptDeck(before); }
});

test('worker offer, real adapter refresh and return intent preserve exact targets', async () => {
  const host=createSimHost();
  try {
    await host.init({profile:'production',seed:10,scenarioContract:contract,bridgeAll:true});
    const {state,runtime,bus}=host.host;
    state.mode='flight'; state.world.currentSectorId='sector_ceres_belt';
    const spawn=(name,x,team=1)=>runtime.spawn({...makeShipEntitySpec('ship_kestrel',{pos:{x,z:0}}),team,data:{name,ai:{hostileTeams:[0]}}});
    const player=spawn('Pilot',0,0); player.isPlayer=true; state.playerId=player.id;
    const wreck=spawn('First Wreck',100), runner=spawn('Runner',200);
    wreck.alive=false; bus.emit('entity:killed',{id:wreck.id,killerId:player.id,type:'ship'});
    bus.emit('ai:flee',{entityId:runner.id});
    const initial=await host.tick({tick:1,steps:0,commands:[]});
    const offer=initial.events.filter(e=>e.t==='combat:aftermathChoices').at(-1).p;
    assert.deepEqual(offer.choices.map(c=>c.id),['salvage','pursuit','escape']);
    assert.equal(offer.choices[0].context,'Wreck: First Wreck');
    assert.equal(offer.choices[1].context,'Fled: Runner');
    const mainBus=createBus(), main={mode:'flight',world:{currentSectorId:'sector_ceres_belt'},playerId:player.id,player:{},entities:new Map([[player.id,player]])};
    const cards=new Map(); let offers=0,updates=0;
    const deck={offerDecision(s){offers++;cards.set(s.id,s);return true},updateDecision(id,s){updates++;cards.set(id,{...cards.get(id),...s});return true},resolveDecision(id){cards.delete(id);return true},setDecisionVisible(){}};
    const prompt=createAftermathChoicePrompt({state:main,bus:mainBus,deck});
    const ring=createSimCommandRing();
    mainBus.on('combat:aftermathChoose',p=>ring.pushBus({emit:'combat:aftermathChoose',payload:p}));
    try {
      const outcome=initial.events.find(e=>e.t==='combat:outcome' && e.p.entityId===wreck.id);
      mainBus.emit(outcome.t,structuredClone(outcome.p)); mainBus.emit('combat:aftermathChoices',structuredClone(offer));
      const first=cards.get('aftermath:field'); assert.match(first.detail,/First Wreck/); assert.match(first.detail,/Runner/);
      const second=spawn('Second Wreck',120); second.alive=false;
      bus.emit('entity:killed',{id:second.id,killerId:player.id,type:'ship'});
      const refresh=await host.tick({tick:2,steps:0,commands:[]});
      const updated=refresh.events.filter(e=>e.t==='combat:aftermathChoices').at(-1).p;
      assert.equal(updated.refreshOnly,true);
      // The worker has retargeted but the main thread has not yet received the refresh.
      first.onChoose('salvage');
      mainBus.emit('combat:aftermathChoices',structuredClone(updated));
      assert.equal(offers,1); assert.equal(updates,1); assert.match(cards.get('aftermath:field').detail,/Second Wreck/);
      cards.get('aftermath:field').onChoose('salvage');
      assert.equal(ring.size,1,'a refresh cannot permit duplicate submissions');
      const stale=await host.tick({tick:3,steps:0,commands:ring.drain()});
      assert.equal(state.combatOutcome.chosen,undefined);
      const rejected=stale.events.find(e=>e.t==='combat:aftermathChoices'); assert.ok(rejected);
      mainBus.emit(rejected.t,structuredClone(rejected.p));
      cards.get('aftermath:field').onChoose('salvage');
      const accepted=await host.tick({tick:4,steps:0,commands:ring.drain()});
      assert.equal(state.combatOutcome.chosen.entityId,second.id);
      const chosen=accepted.events.find(e=>e.t==='combat:aftermathChosen'); assert.ok(chosen);
      mainBus.emit(chosen.t,structuredClone(chosen.p)); assert.equal(cards.size,0);
      mainBus.emit('combat:aftermathChoices',structuredClone(updated)); assert.equal(cards.size,0,'refresh cannot reopen answered choice');
      runner.occupantGeneration += 1;
      host.host.registry.get('combatOutcome')._publishAftermath();
      const recycled=await host.tick({tick:5,steps:0,commands:[]});
      const afterRecycle=recycled.events.filter(e=>e.t==='combat:aftermathChoices').at(-1)?.p;
      assert.ok(afterRecycle);
      assert.ok(!afterRecycle.choices.some(c=>c.context?.includes('Runner')),'recycled occupant never inherits the old name');
    } finally { prompt.destroy(); }
  } finally { host.shutdown(); }
});


test('actual lane replays plain scene context and forwards the correlated intent', async () => {
  const host=createSimHost(), main=createGameState(10), bus=createBus();
  let lane, deliver, commandsDone=Promise.resolve(), serial=0;
  const asWorker=async fn=>{ const sink=laneCommandSink(); uninstallSimCommandSink(); try{return await fn();} finally {if(sink) installSimCommandSink(sink);} };
  const drain=async()=>{ for(;;){ const current=commandsDone; await current; if(current===commandsDone) return; } };
  try {
    lane=createSimLaneRuntime({state:main,bus,registry:{},helpers:{},flags:{lane:'worker',sab:false,warnings:[]},clockMode:'worker-local',channelFactory:()=>({
      onMessage(fn){deliver=fn}, terminate(){}, post(message){
        if(message.kind==='init') asWorker(()=>host.init({...structuredClone(message),profile:'production',seed:10,scenarioContract:contract,bridgeAll:true})).then(reply=>deliver(structuredClone({kind:'ready',seq:message.seq,...reply})));
        if(message.kind==='clockCommand') commandsDone=commandsDone.then(async()=>{const reply=await asWorker(()=>host.tick({...structuredClone(message),kind:'tick'}));deliver(structuredClone({kind:'clockTick',...reply,commandSequence:message.commandSequence}));});
      }
    })});
    await lane.readyPromise;
    const state=host.host.state, runtime=host.host.runtime;
    state.mode='flight'; state.world.currentSectorId='sector_ceres_belt';
    const player=runtime.spawn({...makeShipEntitySpec('ship_kestrel',{pos:{x:0,z:0}}),isPlayer:true,team:0});state.playerId=player.id;
    const wreck=runtime.spawn({...makeShipEntitySpec('ship_kestrel',{pos:{x:100,z:0}}),team:1,data:{name:'Lane Wreck',ai:{hostileTeams:[0]}}});
    wreck.alive=false;host.host.bus.emit('entity:killed',{id:wreck.id,killerId:player.id,type:'ship'});
    const cards=new Map(), deck={offerDecision(s){cards.set(s.id,s);return true},updateDecision(id,s){cards.set(id,s);return true},resolveDecision(id){cards.delete(id)},setDecisionVisible(){}};
    main.mode='flight';main.playerId=player.id;main.world.currentSectorId='sector_ceres_belt';
    const prompt=createAftermathChoicePrompt({state:main,bus,deck});
    try {
      const reply=await asWorker(()=>host.tick({kind:'tick',tick:++serial,steps:0,commands:[]}));
      deliver(structuredClone({kind:'clockTick',...reply}));
      assert.ok(cards.has('aftermath:field'),'lane replay delivered the actual worker offer to the adapter');
      assert.match(cards.get('aftermath:field').detail,/Lane Wreck/);
      cards.get('aftermath:field').onChoose('salvage');
      await drain();
      assert.equal(state.combatOutcome.chosen?.entityId,wreck.id,'lane return intent reached the authoritative owner');
      assert.equal(cards.size,0);
    } finally {prompt.destroy();}
  } finally {lane?.close();host.shutdown();}
});


test('unobserved offer keeps its newest target until a legitimate observation', async () => {
  const host = createSimHost();
  try {
    await host.init({profile:'production',seed:10,scenarioContract:contract,bridgeAll:true});
    const {state,runtime,bus} = host.host;
    state.mode = 'flight'; state.world.currentSectorId = 'sector_ceres_belt';
    const spawn = (name, x, team = 1) => runtime.spawn({
      ...makeShipEntitySpec('ship_kestrel',{pos:{x,z:0}}), team, data:{name,ai:{hostileTeams:[0]}},
    });
    const player = spawn('Pilot',0,0); player.isPlayer = true; state.playerId = player.id;
    const first = spawn('Old Wreck',100); first.alive = false;
    bus.emit('entity:killed',{id:first.id,killerId:player.id,type:'ship'});
    const initial = await host.tick({tick:1,steps:0,commands:[]});
    const initialOffer = initial.events.filter(e=>e.t==='combat:aftermathChoices').at(-1).p;
    const observed = initial.events.find(e=>e.t==='combat:outcome' && e.p.entityId===first.id).p;
    const mainBus = createBus(), main = {mode:'flight',world:{currentSectorId:'sector_ceres_belt'},
      playerId:player.id,player:{},entities:new Map([[player.id,player]])};
    const cards = new Map(), ring = createSimCommandRing();
    const deck = {offerDecision(s){cards.set(s.id,s);return true},updateDecision(id,s){cards.set(id,s);return true},
      resolveDecision(id){cards.delete(id)},setDecisionVisible(){}};
    const prompt = createAftermathChoicePrompt({state:main,bus:mainBus,deck});
    mainBus.on('combat:aftermathChoose', p => ring.pushBus({emit:'combat:aftermathChoose',payload:p}));
    try {
      mainBus.emit('combat:aftermathChoices', structuredClone(initialOffer));
      assert.equal(cards.size,0,'no nearby witnessed outcome or custody yet');
      const second = spawn('New Wreck',120); second.alive = false;
      bus.emit('entity:killed',{id:second.id,killerId:player.id,type:'ship'});
      const changed = await host.tick({tick:2,steps:0,commands:[]});
      const refreshed = changed.events.filter(e=>e.t==='combat:aftermathChoices').at(-1).p;
      assert.equal(refreshed.refreshOnly,true);
      mainBus.emit('combat:aftermathChoices',structuredClone(refreshed));
      assert.equal(cards.size,0,'a new target does not invent observation');
      mainBus.emit('combat:outcome',structuredClone(observed));
      await Promise.resolve();
      const card = cards.get('aftermath:field');
      assert.ok(card,'a player-caused outcome makes the field relevant');
      assert.match(card.detail,/New Wreck/);
      assert.doesNotMatch(card.detail,/Old Wreck/);
      card.onChoose('salvage');
      const accepted = await host.tick({tick:3,steps:0,commands:ring.drain()});
      assert.equal(state.combatOutcome.chosen.entityId,second.id,'the displayed target is the accepted target');
      const receipt = accepted.events.find(e=>e.t==='combat:aftermathChosen');
      assert.ok(receipt); mainBus.emit(receipt.t,structuredClone(receipt.p));
      mainBus.emit('combat:aftermathChoices',structuredClone(refreshed));
      assert.equal(cards.size,0,'refresh after answer cannot reopen the card');
    } finally { prompt.destroy(); }
  } finally { host.shutdown(); }
});


test('a custody refresh can make a waiting field relevant without inventing observation', () => {
  const bus = createBus(), player = {id:1,pos:{x:0,z:0}};
  const state = {mode:'flight',world:{currentSectorId:'sector_ceres_belt'},playerId:1,player:{},entities:new Map([[1,player]])};
  const cards = new Map(), deck = {offerDecision(s){cards.set(s.id,s);return true},resolveDecision(id){cards.delete(id)}};
  const prompt = createAftermathChoicePrompt({state,bus,deck});
  const offer = {sectorId:'sector_ceres_belt',choices:[{id:'salvage',label:'Salvage',context:'Wreck: Old'}, {id:'escape',label:'Leave'}]};
  try {
    bus.emit('combat:aftermathChoices',offer);
    assert.equal(cards.size,0);
    bus.emit('combat:aftermathChoices',{...offer,refreshOnly:true,custody:[{key:'open-custody'}],
      choices:[{id:'salvage',label:'Salvage',context:'Wreck: Current'},offer.choices[1]]});
    assert.match(cards.get('aftermath:field').detail,/Wreck: Current/);
    bus.emit('combat:aftermathChosen',{});
    bus.emit('combat:aftermathChoices',{...offer,refreshOnly:true,custody:[{key:'open-custody'}]});
    assert.equal(cards.size,0,'custody refresh cannot reopen an answered offer');
  } finally {prompt.destroy();}
});
