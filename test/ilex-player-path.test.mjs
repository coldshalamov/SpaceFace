import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegistry} from '../src/core/registry.js';
import {createGameState} from '../src/core/gameState.js';
import {createBus} from '../src/core/eventBus.js';
import {ilexArkPrompt} from '../src/ui/ilexArkPrompt.js';
import {setPromptDeck} from '../src/ui/promptDeck.js';
import {MAIN_TO_SIM_BUS_EVENTS} from '../src/core/mainToSimEventSurface.js';
const waiting={revision:1,canAccept:true,delivered:0,status:'WAITING',text:'Six originals.'};
function fixture(row=waiting){const bus=createBus(),prompt={...ilexArkPrompt},events=[];let spec;
  setPromptDeck({offerDecision(s){spec=s;return true;},resolveDecision(){return true;}});prompt.init({bus});
  for(const name of ['accept','deliver','finish','course'])bus.on(`ilexArk:${name}`,p=>events.push({name,p}));
  prompt.offer(row);return{bus,prompt,get spec(){return spec;},events,close(){prompt.destroy();setPromptDeck(null);}};
}
test('actual worker-main registry retains Ilex deck adapter',()=>{
  const r=createRegistry({state:createGameState(804),bus:createBus(),helpers:{},simLane:'worker'});
  assert.equal(r.get('ilexArkPrompt'),ilexArkPrompt);
});
test('only four Ilex player actions cross the exact production event gate',()=>{
  assert.deepEqual([...MAIN_TO_SIM_BUS_EVENTS].filter(x=>x.startsWith('ilexArk:')).sort(),['ilexArk:accept','ilexArk:course','ilexArk:deliver','ilexArk:finish']);
  assert.deepEqual([...MAIN_TO_SIM_BUS_EVENTS].filter(x=>x.startsWith('towlineTable:')).sort(),['assist','course','deliver','release','take'].map(x=>`towlineTable:${x}`));
  for(const id of ['offer','accepted','vaultReleased','finished','harvest','destroy','__proto__'])assert.equal(MAIN_TO_SIM_BUS_EVENTS.has(`ilexArk:${id}`),false,id);
});
test('an unrendered finish choice cannot emit',()=>{const h=fixture();try{h.spec.onChoose('finish');assert.equal(h.events.length,0);}finally{h.close();}});
test('old callback cannot emit after restore',()=>{const h=fixture();try{h.bus.emit('save:restoring');h.spec.onChoose('accept');assert.equal(h.events.length,0);}finally{h.close();}});

// Actual registry selection, production host and lane bridge; unrelated main lifecycle
// hooks are inert so this test never boots graphics, audio or the game world.
test('production registry owns the prompt on main and the actual worker offer/action crosses both bridges', async () => {
  const {createSimHost}=await import('../scripts/lib/simWorkerHost.mjs');
  const {createSimLaneRuntime}=await import('../src/core/simLaneMain.js');
  const {createRegistry}=await import('../src/core/registry.js');
  const {createGameState}=await import('../src/core/gameState.js');
  const {makeShipEntitySpec}=await import('../src/systems/ships.js');
  const {ILEX_ARK:C,ILEX_START,ILEX_RECEIVER}=await import('../src/data/ilexArk.js');
  const {laneCommandSink,uninstallSimCommandSink,installSimCommandSink}=await import('../src/core/simLaneCommands.js');
  const {default:contract}=await import('../src/data/scenarios/47a.scenario.json',{with:{type:'json'}});
  const oldStorage=globalThis.localStorage,worker=createSimHost(),state=createGameState(806),bus=createBus(),entries=new Map(),events=[];
  let deliver,registry;let commandsDone=Promise.resolve();const saved=[];
  const asWorker=async fn=>{const sink=laneCommandSink();uninstallSimCommandSink();try{return await fn();}finally{if(sink)installSimCommandSink(sink);}};
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
  bus.on('ui:setCourse',p=>events.push(p));
  try {
    await lane.readyPromise;
    const ctx={state,bus,helpers:{},simLane:'worker'};
    registry=createRegistry(ctx);ctx.registry=registry;
    assert.equal(registry.get('ilexArkPrompt'),ilexArkPrompt,'actual main registry must retain deck adapter');
    assert.equal(worker.host.registry.get('ilexArkPrompt'),null,'worker must not own realm-local deck');
    for(const s of registry.systems)if(s&&s.name!=='ilexArkPrompt'){
      saved.push([s,s.init,s.destroy]);s.init=()=>{};s.destroy=()=>{};
    }
    registry.init();
    const {state:authority,runtime,registry:owners}=worker.host,owner=owners.get('ilexArk');
    authority.mode='flight';authority.world.currentSectorId=C.originSectorId;authority.onboarding={active:false,finished:true};
    authority.missions.completedLog=[{type:'cargo_delivery',success:1}];
    const player=runtime.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:authority.player,pos:{x:ILEX_START.x+100,z:ILEX_START.z+60},fittings:[]}));authority.playerId=player.id;
    runtime.spawn({type:'station',pos:{...ILEX_RECEIVER},radius:40,mass:1e9,hull:1e9,data:{stationId:C.stationId,dockRadius:110}});
    await asWorker(()=>owner.update(1/60,authority));
    const flush=async()=>{const reply=await asWorker(()=>worker.tick({kind:'tick',steps:0,tick:0,commands:[]}));deliver(structuredClone({kind:'clockTick',...reply}));};
    const offer=async()=>{await asWorker(()=>owner.offer());await flush();return entries.get('ilex:seed-ark:decision');};
    const first=await offer();assert.ok(first,'worker offer creates main-owned decision');
    assert.ok(first.choices.some(c=>c.id==='accept'));first.onChoose('accept');await commandsDone;
    assert.equal(owner._row.phase,'active');assert.equal(first.onChoose('accept'),false);
    (await offer()).onChoose('course');await commandsDone;
    assert.equal(events.at(-1)?.sectorId,C.destinationSectorId);
    authority.settings.gameplay.physicsBackend='legacy';
    const oldPort=owner.helpers.combatPhysics;
    owner.helpers.combatPhysics={createAttachment:r=>({id:r.attachmentId}),cutAttachment:()=>true};
    try {
      await asWorker(()=>owner.sever('vault_1'));await asWorker(()=>owner._materialize());
      const body=owner._find('vault_1'),station=[...authority.entities.values()].find(e=>e.type==='station'&&e.data?.stationId===C.stationId);
      const anchor=resolveDockAnchor(station,resolveCollisionProxyManifest(station),player)||{x:ILEX_RECEIVER.x+90,z:ILEX_RECEIVER.z};
      for(const e of [player,body]){e.pos.set(anchor.x,0,anchor.z);e.vel.set(0,0,0);}
      const line=await asWorker(()=>getCombatKernel(owner.ctx).attachments.create({defId:'attachment_massline',ownerId:player.id,targetId:body.id,sourceWorld:player.pos,targetWorld:body.pos}));assert.equal(line.ok,true);
      const handover=await offer();assert.ok(handover.choices.some(c=>c.id==='deliver'));handover.onChoose('deliver');await commandsDone;
      assert.equal(owner._row.vaults.vault_1.status,'delivered');assert.equal(owner._delivered().length,1);
      const filing=await offer();assert.equal(filing.choices.find(c=>c.id==='finish').label,'FILE 1/6 ARRIVED');
      assert.match(filing.choices.find(c=>c.id==='finish').title,/cannot be revised/);
      filing.onChoose('leave');await commandsDone;assert.equal(owner._row.phase,'active');
      const retained=await offer(),save=owners.get('save');
      assert.equal(await asWorker(()=>save.loadEnvelope(save.serialize('ilex-player-path'))),true);await flush();
      assert.equal(retained.onChoose('finish'),false);assert.equal(owner._row.phase,'active');
      // Production restore reinstates physical instances; position the restored pilot
      // at the same receiver without stepping the native world.
      authority.mode='flight';authority.ui.screenStack=[];authority.ui.docked=false;
      if(![...authority.entities.values()].some(e=>e.alive&&e.type==='station'&&e.data?.stationId===C.stationId))runtime.spawn({type:'station',pos:{...ILEX_RECEIVER},radius:40,mass:1e9,hull:1e9,data:{stationId:C.stationId,dockRadius:110}});
      const restored=authority.entities.get(authority.playerId);restored.pos.set(anchor.x,0,anchor.z);restored.vel.set(0,0,0);
      const final=await offer();final.onChoose('finish');await commandsDone;
      assert.equal(owner._row.phase,'settled');assert.equal(owner._row.vaults.vault_2.status,'lost');
      const credits=authority.player.credits,receipt=structuredClone(owner._row.settlement);assert.equal(receipt.deliveredVaultIds.length,1);
      assert.equal(final.onChoose('finish'),false);await commandsDone;assert.equal(authority.player.credits,credits);
      assert.equal(await asWorker(()=>save.loadEnvelope(save.serialize('ilex-filed'))),true);await flush();
      assert.deepEqual(owner._row.settlement,receipt);assert.equal(authority.player.credits,credits);
      assert.equal(lane.getDiagnostics().unforwardedEmitCount,0);
    }finally{owner.helpers.combatPhysics=oldPort;}

  } finally {
    registry?.destroy();for(const [s,init,destroy]of saved){s.init=init;s.destroy=destroy;}
    setPromptDeck(null);lane.close();worker.shutdown();
    if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage;
  }
});

import { createSimulation } from '../src/core/sim.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { economy } from '../src/systems/economy.js';
import { missions } from '../src/systems/missions.js';
import { ilexArk } from '../src/systems/ilexArk.js';
import { ILEX_ARK as C, ILEX_START, ILEX_RECEIVER, ilexOutcomeText } from '../src/data/ilexArk.js';
import { resolveCollisionProxyManifest, resolveDockAnchor } from '../src/data/collisionProxyManifests.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';

let flags;
test.before(() => { flags = snapshotFeatureMaps(); applyFeatureConfigToMaps(PRODUCTION_FEATURES); });
test.after(() => restoreFeatureMaps(flags));
function finiteFixture() {
  let decision, offer;
  setPromptDeck({ offerDecision: row => { decision = row; return true; }, resolveDecision() {} });
  const sim = createSimulation({ seed: 804, systems: [ships, spawnBudget, economy, missions, ilexArk, ilexArkPrompt],
    helpers: { combatPhysics: { createAttachment: s => ({ id: s.attachmentId }), cutAttachment: () => true } } });
  const s = sim.state; s.mode = 'flight'; s.world.currentSectorId = C.originSectorId;
  s.settings.gameplay.physicsBackend = 'legacy'; sim.registry.get('ships').newGame();
  s.missions.completedLog = [{ type: 'cargo_delivery', success: 1, count: 1, totalCr: 0 }];
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: s.player,
    pos: { x: ILEX_START.x + 100, z: ILEX_START.z + 60 }, fittings: [] })); s.playerId = player.id;
  const station = sim.spawn({ type: 'station', team: 2, pos: { ...ILEX_RECEIVER }, radius: 40, mass: 1e9,
    hull: 1e9, hullMax: 1e9, physicsBody: { schemaVersion: 1, dynamic: false, shape: 'ball', radius: 40, mass: 1e9 },
    data: { stationId: C.stationId, dockRadius: 110 } });
  const owner = sim.registry.get('ilexArk'); owner.update(1/60,s);
  sim.bus.on('ilexArk:offer', row => { offer = row; });
  const receiver = (e = player) => {
    const p = resolveDockAnchor(station, resolveCollisionProxyManifest(station), e) || { x: ILEX_RECEIVER.x+90, z: ILEX_RECEIVER.z };
    e.pos.set(p.x,0,p.z); e.vel.set(0,0,0);
  };
  return { sim, s, owner, player, receiver,
    accept() { assert.equal(owner.accept(owner._row.revision).ok,true); },
    read() { assert.equal(owner.offer(),true); assert.equal(decision.detail,offer.text); return { offer, decision, text: decision.detail }; },
    close() { sim.dispose(); setPromptDeck(null); } };
}


import {getCombatKernel} from '../src/combat/kernel.js';
for(const arrived of [0,1,5,6])test(`explicit filing commits exactly ${arrived}/6 originals and never repays after restore`,()=>{
 const h=finiteFixture();try{
  h.accept();for(let n=1;n<=6-arrived;n++)h.owner.sever(`vault_${n}`);
  h.owner._materialize();if(arrived){h.receiver(h.owner._find('carrier'));assert.equal(h.owner._acceptCarrier(),true);}
  h.receiver();const r=h.read();assert.equal(r.offer.delivered,arrived);
  assert.equal(r.decision.choices.find(c=>c.id==='finish').label,`FILE ${arrived}/6 ARRIVED`);
  const before=h.s.player.credits;r.decision.onChoose('leave');assert.equal(h.owner._row.phase,'active');
  h.read().decision.onChoose('finish');assert.equal(h.owner._row.phase,'settled');
  assert.equal(h.owner._delivered().length,arrived);
  for(let n=1;n<=6-arrived;n++)assert.equal(h.owner._row.vaults[`vault_${n}`].status,'lost');
  assert.equal(h.owner._row.settlement.deliveredVaultIds.length,arrived);
  const terminal=h.read().decision;assert.deepEqual(terminal.choices.map(c=>c.id),['leave']);
  assert.equal(terminal.onChoose('finish'),false);
  const paid=h.s.player.credits;assert.equal(paid-before,arrived?C.baseRewardCr+arrived*C.vaultRewardCr:0);
  const saved=structuredClone(h.owner.serialize());h.sim.bus.emit('save:restoring');h.owner.deserialize(saved);h.owner.afterContinue();
  h.sim.bus.emit('ilexArk:finish',{revision:h.owner._row.revision,expired:true});
  assert.equal(h.s.player.credits,paid);assert.deepEqual(h.owner.serialize().settlement,saved.settlement);
 }finally{h.close();}
});
test('stale finish and forged expiry cannot bypass current voyage receiver rules',()=>{
 const h=finiteFixture();try{
  h.accept();h.receiver();const old=h.read().decision;
  h.owner.sever('vault_1');old.onChoose('finish');assert.equal(h.owner._row.phase,'active');
  h.player.pos.set(ILEX_START.x,0,ILEX_START.z);
  h.sim.bus.emit('ilexArk:finish',{revision:h.owner._row.revision,expired:true});assert.equal(h.owner._row.phase,'active');
  h.sim.bus.emit('ilexArk:deliver',{revision:h.owner._row.revision,count:6,vaultId:'vault_6',by:'crew'});
  assert.equal(h.owner._delivered().length,0);
 }finally{h.close();}
});
test('every lifecycle, replacement and rejected card invalidates old choices but leaves current choices usable',()=>{
 for(const event of ['game:load','game:new','game:newGame','save:restoring','save:loaded','dock:docked','sector:exit','destroy']){
  const h=fixture();try{const old=h.spec;if(event==='destroy')h.prompt.destroy();else h.bus.emit(event);
   assert.equal(old.onChoose('accept'),false,event);assert.equal(h.events.length,0);
   if(event!=='destroy'){h.prompt.offer(waiting);assert.equal(h.spec.onChoose('accept'),true);assert.equal(h.spec.onChoose('accept'),false);assert.equal(h.events.length,1);}
  }finally{h.close();}
 }
 const h=fixture();try{const old=h.spec;h.prompt.offer({...waiting,revision:2});assert.equal(old.onChoose('accept'),false);
  const current=h.spec;setPromptDeck({offerDecision(){return false;},resolveDecision(){}});
  assert.equal(h.prompt.offer(waiting),false);assert.equal(current.onChoose('accept'),false);
 }finally{h.close();}
});
