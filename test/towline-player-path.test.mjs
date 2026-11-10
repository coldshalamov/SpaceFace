import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { towlineTable } from '../src/systems/towlineTable.js';
import { towlineTablePrompt } from '../src/ui/towlineTablePrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';
import { MAIN_TO_SIM_BUS_EVENTS } from '../src/core/mainToSimEventSurface.js';

const row = { memberId:'mara',name:'Mara',revision:4,targetId:42,status:'PLAYER',headline:'Mara',text:'Original ready.',canDeliver:true,canCourse:true };
function promptFixture() {
  const bus=createBus(),events=[];let spec;
  setPromptDeck({offerDecision(s){spec=s;return true;},resolveDecision(){return true;}});
  const prompt={...towlineTablePrompt};prompt.init({bus});
  for(const id of ['take','deliver','assist','release','course'])bus.on(`towlineTable:${id}`,p=>events.push({id,p}));
  prompt.offer(row);return{bus,prompt,events,get spec(){return spec;},close(){prompt.destroy();setPromptDeck(null);}};
}
test('all five rendered Towline action types are admitted by the production main-to-worker allowlist',()=>{
  assert.deepEqual([...MAIN_TO_SIM_BUS_EVENTS].filter(x=>x.startsWith('towlineTable:')).sort(),['assist','course','deliver','release','take'].map(id=>`towlineTable:${id}`));
  for(const id of ['offer','cleanupAccepted','assistAccepted','destroy','__proto__'])assert.equal(MAIN_TO_SIM_BUS_EVENTS.has(`towlineTable:${id}`),false,id);
});
test('displayed handover preserves player actor authority, rather than interpreting target ID as actor',()=>{
  const bus=createBus(),calls=[],state={};
  const owner={...towlineTable,deliver(id,revision,by='player'){calls.push({id,revision,by});return{ok:true};}};
  owner.init({bus,state,helpers:{}});
  try {bus.emit('towlineTable:deliver',{...row,by:'crew'});assert.deepEqual(calls,[{id:'mara',revision:4,by:'player'}]);}
  finally{for(const off of owner._subs)off();}
});
test('retained prompt cannot act after Continue begins or invoke a choice never rendered',()=>{
  const h=promptFixture();try{
    const first=h.spec;first.onChoose('assist');assert.equal(h.events.length,0,'unrendered action');
    h.prompt.offer(row);const saved=h.spec;h.bus.emit('save:restoring');saved.onChoose('deliver');assert.equal(h.events.length,0,'old-life action');
  }finally{h.close();}
});

// Actual registry selection, production host and lane bridge; unrelated main lifecycle
// hooks are inert so this test never boots graphics, audio or the game world.
test('production registry owns the prompt on main and the actual worker offer/action crosses both bridges', async () => {
  const {createSimHost}=await import('../scripts/lib/simWorkerHost.mjs');
  const {createSimLaneRuntime}=await import('../src/core/simLaneMain.js');
  const {createRegistry}=await import('../src/core/registry.js');
  const {createGameState}=await import('../src/core/gameState.js');
  const {makeShipEntitySpec}=await import('../src/systems/ships.js');
  const {TOWLINE_TABLE:C}=await import('../src/data/towlineTable.js');
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
    assert.equal(registry.get('towlineTablePrompt'),towlineTablePrompt,'actual main registry must retain deck adapter');
    assert.equal(worker.host.registry.get('towlineTablePrompt'),null,'worker must not own realm-local deck');
    for(const s of registry.systems)if(s&&s.name!=='towlineTablePrompt'){
      saved.push([s,s.init,s.destroy]);s.init=()=>{};s.destroy=()=>{};
    }
    registry.init();
    const {state:authority,runtime,registry:owners}=worker.host,owner=owners.get('towlineTable');
    authority.mode='flight';authority.world.currentSectorId=C.sectorId;authority.onboarding={active:false,finished:true};
    authority.missions.completedLog=[{type:'salvage_retrieval',success:1}];
    const player=runtime.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:authority.player,pos:{x:0,z:0},fittings:[]}));authority.playerId=player.id;
    runtime.spawn({type:'station',pos:{x:0,z:0},radius:40,mass:1e9,hull:1e9,data:{stationId:C.stationId,dockRadius:110}});
    await asWorker(()=>owner.update(1/60,authority));
    const crew=owner._find('mara');assert.ok(crew);player.pos.copy(crew.pos);
    await asWorker(()=>owner.offer('mara'));
    const flush=async()=>{const reply=await asWorker(()=>worker.tick({kind:'tick',steps:0,tick:0,commands:[]}));deliver(structuredClone({kind:'clockTick',...reply}));};
    await flush();const spec=entries.get('towline-table:decision');assert.ok(spec,'worker offer creates actual main-owned prompt');
    assert.equal(state.towlineTable,undefined,'no full authoritative ledger copied into main');
    spec.onChoose('course');
    await commandsDone;
    assert.equal(events.at(-1)?.sectorId,C.sectorId,'actual production owner emits course after main click crosses worker');
    assert.equal(lane.getDiagnostics().unforwardedEmitCount,0);
    // Continue the same real prompt/bridge route with a declared scalar attachment
    // port. This tests custody/receipts, not native physics or ordinary flight.
    authority.settings.gameplay.physicsBackend='legacy';
    const oldPort=owner.helpers.combatPhysics;
    owner.helpers.combatPhysics={createAttachment:r=>({id:r.attachmentId}),cutAttachment:()=>true};
    try {
      const body=owner._find('mara','cleanup');player.pos.copy(body.pos);
      await asWorker(()=>owner.offer('mara'));await flush();
      entries.get('towline-table:decision').onChoose('take');await commandsDone;
      assert.equal(owner._row.members.mara.source.status,'player');
      const anchor=owner._anchor(body);body.pos.set(anchor.x+20,0,anchor.z);body.vel.set(0,0,0);
      player.pos.set(anchor.x,0,anchor.z);player.vel.set(0,0,0);crew.pos.set(anchor.x+35,0,anchor.z);crew.vel.set(0,0,0);
      const line=await asWorker(()=>getCombatKernel(owner.ctx).attachments.create({defId:'attachment_massline',ownerId:player.id,targetId:body.id,sourceWorld:player.pos,targetWorld:body.pos}));
      assert.equal(line.ok,true);authority.player.targetId=body.id;
      await asWorker(()=>owner.offer('mara'));await flush();const handover=entries.get('towline-table:decision');
      assert.ok(handover.choices.some(c=>c.id==='deliver'));handover.onChoose('deliver');await commandsDone;
      assert.equal(owner._row.members.mara.benefit.status,'earned');assert.equal(owner._row.members.mara.source.receipt.by,'player');
      const receipt=structuredClone(owner._row.members.mara.source.receipt),credits=authority.player.credits;
      const save=owners.get('save');
      assert.equal(await asWorker(()=>save.loadEnvelope(save.serialize('towline-player-path'))),true);
      await flush();assert.equal(handover.onChoose('deliver'),false);
      assert.deepEqual(owner._row.members.mara.source.receipt,receipt);assert.equal(owner._row.members.mara.benefit.status,'earned');
      assert.equal(authority.player.credits,credits);
    } finally {owner.helpers.combatPhysics=oldPort;}

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
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { TOWLINE_TABLE as C } from '../src/data/towlineTable.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { resolveDockAnchor, resolveCollisionProxyManifest } from '../src/data/collisionProxyManifests.js';
function finiteFixture() {
  const sim = createSimulation({ seed: 806, systems: [ships, spawnBudget, economy,
    npcJobsRuntime, towlineTable],
  helpers: { combatPhysics: { createAttachment: r => ({ id: r.attachmentId }), cutAttachment: () => true } } });
  const s = sim.state; s.mode = 'flight'; s.world.currentSectorId = C.sectorId;
  s.settings.gameplay.physicsBackend = 'legacy';
  sim.registry.get('ships').newGame();
  s.missions = { completedLog: [{ type: 'salvage_retrieval', success: 1, count: 1, totalCr: 0 }] };
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: s.player,
    pos: { x: -500, z: -500 }, fittings: [] })); s.playerId = player.id;
  const station = sim.spawn({ type: 'station', team: 2, pos: { x: 0, z: 0 }, radius: 40,
    mass: 1e9, hull: 1e9, hullMax: 1e9, physicsBody: { schemaVersion: 1, dynamic: false,
      shape: 'ball', radius: 40, mass: 1e9 }, data: { stationId: C.stationId, dockRadius: 110 } });
  const owner = sim.registry.get('towlineTable'), jobs = sim.registry.get('npcJobsRuntime');
  owner.update(1 / 60, s);
  function line(a, b) { return getCombatKernel(owner.ctx).attachments.create({ defId: 'attachment_massline',
    ownerId: a.id, targetId: b.id, sourceWorld: a.pos, targetWorld: b.pos }); }
  return { sim, s, owner, jobs, player, station, line, close: () => sim.dispose() };
}

function readyHandover(h) {
  const crew=h.owner._find('mara'),body=h.owner._find('mara','cleanup');
  h.player.pos.copy(body.pos); assert.equal(h.owner.take('mara',h.owner._row.revision).ok,true);
  const anchor=h.owner._anchor(body);body.pos.set(anchor.x+20,0,anchor.z);body.vel.set(0,0,0);
  h.player.pos.set(anchor.x,0,anchor.z);h.player.vel.set(0,0,0);crew.pos.set(anchor.x+35,0,anchor.z);crew.vel.set(0,0,0);
  assert.equal(h.line(h.player,body).ok,true);h.s.player.targetId=body.id;
  let offered;h.sim.bus.on('towlineTable:offer',r=>offered=r);assert.equal(h.owner.offer('mara'),true);assert.equal(offered.canDeliver,true);
  return {crew,body,offered};
}
for(const target of ['numeric','null','crew'])test(`actual finite handover with ${target} target preserves one player labor receipt`,()=>{
  const h=finiteFixture();try{
    const {body,offered}=readyHandover(h),before=h.s.player.credits;let accepted=0;
    h.sim.bus.on('towlineTable:cleanupAccepted',()=>accepted++);
    const payload={memberId:'mara',revision:offered.revision,targetId:target==='numeric'?body.id:target==='null'?null:'crew',by:'crew'};
    h.sim.bus.emit('towlineTable:deliver',payload);
    const r=h.owner._row.members.mara;
    assert.equal(r.source.status,'cleared');assert.equal(r.source.receipt.by,'player');assert.equal(r.benefit.status,'earned');
    assert.equal(h.owner._find('mara','cleanup'),null);assert.equal(h.s.player.credits,before);
    h.sim.bus.emit('towlineTable:deliver',payload);assert.equal(accepted,1,'stale revision cannot duplicate receipt');
    const saved=JSON.parse(JSON.stringify(h.owner.serialize()));h.sim.bus.emit('save:restoring');h.owner.deserialize(saved);h.owner.afterContinue();
    h.sim.bus.emit('towlineTable:deliver',{...payload,revision:h.owner._row.revision});
    assert.equal(accepted,1);assert.equal(h.owner._row.members.mara.benefit.status,'earned');
    assert.deepEqual(h.owner.serialize().members.mara.source.receipt,saved.members.mara.source.receipt);
  }finally{h.close();}
});
test('caller-controlled crew target cannot clear crew-owned original; trusted internal crew delivery remains valid',()=>{
  const h=finiteFixture();try{
    const crew=h.owner._find('mara'),body=h.owner._find('mara','cleanup');
    const anchor=h.owner._anchor(body);for(const [e,x]of [[crew,anchor.x],[body,anchor.x+20]]){e.pos.set(x,0,anchor.z);e.vel.set(0,0,0);}
    h.owner._row.members.mara.source.status='crew';assert.equal(h.line(crew,body).ok,true);
    const payload={memberId:'mara',revision:h.owner._row.revision,targetId:'crew',by:'crew'};
    h.sim.bus.emit('towlineTable:deliver',payload);assert.equal(h.owner._row.members.mara.source.status,'crew');
    assert.equal(h.owner.deliver('mara',payload.revision,'crew').ok,true);assert.equal(h.owner._row.members.mara.benefit,null);
  }finally{h.close();}
});
test('failed physical line cut retains original and no reward; fresh valid prompt can retry',()=>{
  const h=finiteFixture();try{
    const {body,offered}=readyHandover(h),port=h.sim.helpers.combatPhysics,cut=port.cutAttachment;
    delete port.cutAttachment;h.sim.bus.emit('towlineTable:deliver',{...offered});port.cutAttachment=cut;
    const r=h.owner._row.members.mara;assert.equal(r.source.status,'player');assert.equal(r.source.receipt,null);assert.equal(r.benefit,null);assert.equal(h.s.entities.has(body.id),true);
    h.sim.bus.emit('towlineTable:deliver',{...offered});assert.equal(r.source.status,'player','old revision stays stale after rollback');
    h.sim.bus.emit('towlineTable:deliver',{...offered,revision:h.owner._row.revision});assert.equal(r.source.status,'cleared');assert.equal(r.benefit.status,'earned');
  }finally{h.close();}
});

test('all lifecycle interruptions and replaced/rejected cards invalidate old callbacks without silencing a fresh choice',()=>{
  for(const event of ['game:load','game:new','game:newGame','save:restoring','save:loaded','dock:docked','sector:exit','destroy']){
    const h=promptFixture();try{
      const old=h.spec;if(event==='destroy')h.prompt.destroy();else h.bus.emit(event);
      assert.equal(old.onChoose('deliver'),false,event);assert.equal(h.events.length,0);
      if(event!=='destroy'){
        h.prompt.offer(row);assert.equal(h.spec.onChoose('deliver'),true);assert.equal(h.events.length,1);
        assert.equal(h.spec.onChoose('deliver'),false);assert.equal(h.events.length,1);
      }
    }finally{h.close();}
  }
  const h=promptFixture();try{
    const old=h.spec;h.prompt.offer({...row,revision:5});assert.equal(old.onChoose('course'),false);
    const current=h.spec;setPromptDeck({offerDecision(){return false;},resolveDecision(){return true;}});
    assert.equal(h.prompt.offer(row),false);assert.equal(current.onChoose('course'),false);assert.equal(h.events.length,0);
  }finally{h.close();}
});

test('earned labor dispatch binds one original, retains the first deadline through Continue and exhausts without a refill',()=>{
  const h=finiteFixture();try{
    const {offered}=readyHandover(h);h.sim.bus.emit('towlineTable:deliver',offered);
    const spawn=id=>h.sim.spawn({type:'payload',team:2,pos:{x:80,z:80},radius:4,mass:70,hull:35,hullMax:35,
      physicsBody:{schemaVersion:1,dynamic:true,shape:'ball',radius:4,mass:70,inertiaY:560},flags:{persistent:true},
      data:{worldRecordId:id,identityKey:id,sectorId:C.sectorId,towable:true,salvagePool:{cmdty_scrap_metal:1}}});
    const load=spawn('towline-player:load'),other=spawn('towline-player:other'),crew=h.owner._find('mara');
    crew.pos.set(80,0,180);h.player.pos.set(110,0,80);
    h.sim.bus.emit('towlineTable:assist',{memberId:'mara',revision:h.owner._row.revision,targetId:load.id});
    let b=h.owner._row.members.mara.benefit;assert.equal(b.status,'active');const deadline=b.deadline,identity=b.target.worldRecordId;
    const saved=h.owner.serialize();h.sim.bus.emit('save:restoring');h.owner._cancel('mara');h.owner.deserialize(saved);h.owner.afterContinue();
    b=h.owner._row.members.mara.benefit;assert.equal(b.status,'paused');h.owner._assign(crew,'mara');
    h.sim.bus.emit('towlineTable:assist',{memberId:'mara',revision:h.owner._row.revision,targetId:other.id});
    assert.equal(b.target.worldRecordId,identity);assert.equal(b.deadline,deadline);
    h.s.simTime=deadline+1;h.owner._observeAssist('mara');assert.equal(b.status,'spent');
    const terminal=h.owner.serialize();h.owner.deserialize(terminal);h.owner.afterContinue();
    h.sim.bus.emit('towlineTable:assist',{memberId:'mara',revision:h.owner._row.revision,targetId:load.id});
    assert.equal(h.owner._row.members.mara.benefit.status,'spent');
  }finally{h.close();}
});
