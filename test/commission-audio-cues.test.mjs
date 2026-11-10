import test from 'node:test';
import assert from 'node:assert/strict';
import { bindCommissionCues, COMMISSION_CUES } from '../src/audio/commissionCues.js';
import { audio, incomeVoices } from '../src/audio/audioSystem.js';
import { candidateScene, placeBody } from './cinderglass-job-fixture.mjs';
import { cinderglassJobStepConvoy } from '../src/features/cinderglassJob/convoy.js';
import { cinderglassJobReceiveQuote } from '../src/features/cinderglassJob/custody.js';
import { latchWorld } from '../src/features/cinderglassJob/interception.js';
import { CINDERGLASS_JOB_POINTS as POINTS } from '../src/features/cinderglassJob/definition.js';

function bind(bus, state) {
  const heard = [], captions = [];
  const owner = { state, play: (id) => { heard.push(id); return {}; }, _emitNamedCaption: text => captions.push(text) };
  const dispose = bindCommissionCues(owner, bus);
  return { heard, captions, dispose };
}

test('current-life cue binding deduplicates, respects sector and releases all listeners', () => {
  const listeners = new Map();
  const bus = { on(name, fn) { let a = listeners.get(name); if (!a) listeners.set(name, a = new Set()); a.add(fn); return () => a.delete(fn); },
    emit(name, p) { for (const fn of listeners.get(name) || []) fn(p); } };
  const state = { world: { currentSectorId: 'sector_pallas_drift' }, tick: 100 };
  const a = bind(bus, state);
  const cue = { id: 'commission.counterweight.start', commissionKey: 'soft:1', sectorId: 'sector_pallas_drift', tick: 100 };
  bus.emit('audio:cue', cue); bus.emit('audio:cue', cue);
  assert.deepEqual(a.heard, ['sfx_mission_accept']); assert.equal(a.captions.length, 1);
  bus.emit('audio:cue', { ...cue, commissionKey: 'wrong-sector', sectorId: 'sector_tethys_junction' });
  bus.emit('audio:cue', { ...cue, commissionKey: 'stale', tick: -30 });
  assert.equal(a.heard.length, 1);
  bus.emit('save:restoring'); bus.emit('audio:cue', { ...cue, commissionKey: 'stale-in-restore' });
  bus.emit('sector:enter'); bus.emit('audio:cue', { ...cue, commissionKey: 'restore-sector-tail' });
  assert.equal(a.heard.length, 1);
  bus.emit('save:loaded'); bus.emit('audio:cue', { ...cue, commissionKey: 'soft:2' });
  assert.equal(a.heard.length, 2);
  bus.emit('sector:exit'); bus.emit('audio:cue', { ...cue, commissionKey: 'exit-tail' });
  assert.equal(a.heard.length, 2);
  a.dispose(); a.dispose();
  assert.equal([...listeners.values()].reduce((n, s) => n + s.size, 0), 0);
  bus.emit('audio:cue', { ...cue, commissionKey: 'soft:3' }); assert.equal(a.heard.length, 2);
  assert.deepEqual(incomeVoices('credits:changed', { delta: 300, reason: 'counterweight:first-completion:soft_berth' }), []);
  assert.deepEqual(incomeVoices('credits:changed', { delta: 300, reason: 'cinderglass:cg:4242:1:settlement' }), []);
  assert.deepEqual(incomeVoices('credits:changed', { delta: 300, reason: 'ordinary' }), ['sfx_cash_register']);
  assert.ok(COMMISSION_CUES['commission.cinderglass.interrupted']);
});

test('audio owner reinitialization replaces the commission binding and destroy releases it', () => {
  const listeners=new Map();
  const bus={on(name,fn){let a=listeners.get(name);if(!a)listeners.set(name,a=new Set());a.add(fn);return()=>a.delete(fn);},
    emit(name,p){for(const fn of [...(listeners.get(name)||[])])fn(p);}};
  const state={world:{currentSectorId:'sector_pallas_drift'},tick:1,settings:{},player:{},ui:{}};
  const owner=Object.create(audio), heard=[];
  owner.play=(id)=>{heard.push(id);return {};}; owner._emitNamedCaption=()=>{};
  owner.init({state,bus,helpers:{}}); owner.init({state,bus,helpers:{}});
  const cue={id:'commission.counterweight.start',commissionKey:'run:1',sectorId:'sector_pallas_drift',tick:1};
  bus.emit('audio:cue',cue); assert.deepEqual(heard,['sfx_mission_accept']);
  owner.destroy(); bus.emit('audio:cue',{...cue,commissionKey:'run:2'});
  assert.deepEqual(heard,['sfx_mission_accept']);
});

test('Cinderglass real service interruption, original release and accepted custody use one owner each', async () => {
  const t = await candidateScene();
  try {
    await t.accept();
    const sounds = bind(t.bus, t.state), cues = [], broken = [], attached = [], credits = [];
    const off = [t.bus.on('audio:cue', p => { if (p?.id?.startsWith('commission.')) cues.push(p); }),
      t.bus.on('tether:broken', p => broken.push(p)), t.bus.on('tether:attached', p => attached.push(p)),
      t.bus.on('credits:changed', p => credits.push(p))];
    const c = t.body('carrierId'), delta = { x: POINTS.pullOff.x - c.pos.x, z: POINTS.pullOff.z - c.pos.z };
    for (const key of ['carrierId', 'podId', 'latchId']) { const e = t.body(key); placeBody(t, e, { x: e.pos.x + delta.x, z: e.pos.z + delta.z }); }
    const entry = t.state.npcJobs.byId[t.cg().entities.carrierJobId]; entry.job.routeIndex = 1; entry.job.phase = 'transit'; entry.job.progress = 0;
    placeBody(t, t.player, { x: POINTS.pullOff.x - 100, z: POINTS.pullOff.z });
    t.cg().scanDone = true; t.cg().phase = 'decide'; cinderglassJobStepConvoy(t.sys, t.state);
    const lw = latchWorld(t.sys, t.state), pos = { x: lw.x - 50, z: lw.z - 20 };
    placeBody(t, t.player, pos); assert.equal(t.action('serviceStart').ok, true); t.step(30);
    placeBody(t, t.player, pos, { x: 10, z: 0 }); t.step();
    assert.equal(cues.filter(c => c.id === 'commission.cinderglass.interrupted').length, 1);
    placeBody(t, t.player, pos); assert.equal(t.action('serviceStart').ok, true);
    assert.equal(t.action('serviceAbort').ok, true);
    assert.equal(cues.filter(c => c.id === 'commission.cinderglass.interrupted').length, 1, 'chosen cancellation is quiet');
    assert.equal(t.action('serviceStart').ok, true);
    assert.ok(t.until(() => t.cg().custody === 'released', 340));
    assert.equal(broken.filter(p => p.reason === 'service_release').length, 1);
    assert.equal(cues.filter(c => c.id === 'commission.cinderglass.interrupted').length, 1);
    const receiver = t.body('brokerId'), pod = t.body('podId');
    placeBody(t, pod, { x: receiver.pos.x + 45, z: receiver.pos.z });
    placeBody(t, t.player, { x: receiver.pos.x + 90, z: receiver.pos.z });
    const quote = cinderglassJobReceiveQuote(t.sys, t.state, 'broker'); assert.ok(quote);
    assert.equal(t.action('receiveBroker', { quoteId: quote.quoteId }).ok, true);
    assert.equal(attached.filter(p => p.targetId === pod.id && p.actorId === receiver.id).length, 1);
    assert.equal(credits.filter(p => p.reason === t.cg().settlement.key).length, 1);
    assert.equal(cues.filter(p => p.id === 'commission.cinderglass.settlement').length, 1);
    assert.deepEqual(sounds.heard, ['sfx_ui_error', 'sfx_cash_register']);
    assert.equal(t.sim.registry.get('economy').settleCinderglassResult(t.cg().operationId, t.cg().custodyReceipt.receiptId).duplicate, true);
    assert.equal(sounds.heard.length, 2);
    const save = t.sim.registry.get('save').serializeData(); t.restore(save);
    assert.equal(sounds.heard.length, 2, 'Continue does not replay the settlement');
    sounds.dispose(); off.forEach(f => f());
  } finally { t.sim.dispose(); }
});


// The real circuit system and native physics own admission, result and wallet.
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { combat } from '../src/systems/combat.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { economy } from '../src/systems/economy.js';
import { scanner } from '../src/systems/scanner.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { createCounterweightCircuitSystem } from '../src/features/counterweightCircuit/runtime.js';
import { venueAnchorGlobal } from '../src/features/counterweightCircuit/physical.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { readFileSync } from 'node:fs';

async function circuitFixture() {
  const sim = createSimulation({ seed: 8206, systems: [ships, economy, physics, combat, collisionConsequences, scanner, tetherGameplay, createCounterweightCircuitSystem()] });
  const s = sim.state, owner = sim.registry.get('counterweightCircuit'), native = sim.registry.get('physics');
  s.mode = 'flight'; s.world.currentSectorId = 'sector_pallas_drift'; s.settings.gameplay.physicsBackend = 'rapier-dynamic'; s.ui.docked = false;
  const anchor = venueAnchorGlobal(); sim.registry.get('ships').newGame();
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: s.player, pos: { x: anchor.x + 235, z: anchor.z }, fittings: [] }));
  s.playerId = player.id;
  await native.prepareBackend(s); native.update(1/60, s);
  function tick(control) { s.tick++; s.simTime = s.tick/60; control?.(); native.update(1/60,s); sim.registry.get('combat').update(1/60,s); sim.registry.get('collisionConsequences').update(1/60,s); sim.registry.get('tetherGameplay').update(1/60,s); owner.update(1/60,s); }
  for (let i=0;i<3;i++) tick();
  return { sim,s,owner,native,player,tick,kernel:getCombatKernel(owner.ctx) };
}
function pilot(body, goal) {
  const dx=goal.x-body.pos.x, dz=goal.z-body.pos.z, distance=Math.hypot(dx,dz);
  const desired=Math.min(7,distance*1.2,Math.sqrt(10*distance));
  const ax=(dx/Math.max(distance,.001)*desired-body.vel.x)*2, az=(dz/Math.max(distance,.001)*desired-body.vel.z)*2;
  const scale=Math.min(1,5/Math.max(.001,Math.hypot(ax,az)));
  writePhysicsControl(body,{source:'commission-audio-fixture',force:{x:ax*scale*body.mass,y:0,z:az*scale*body.mass},torque:{x:0,y:-body.angVel*(body.physicsBody?.inertiaY||body.mass)*4,z:0},maxSpeed:7});
}

test('real circuit admission, score and first payout have a single voice each', async () => {
  const h=await circuitFixture();
  try {
    const {sim,s,owner,player,tick,kernel}=h, sounds=bind(sim.bus,s), cues=[];
    const off=sim.bus.on('audio:cue',p=>{if(p?.id?.startsWith('commission.'))cues.push(p.id);});
    assert.equal(owner._startAttempt('soft_berth',false),true);
    const a=owner._attempt(), admission=s.counterweightCircuitView.admission;
    for(let i=0;i<3;i++) tick();
    sim.bus.emit('counterweightCircuit:presentationReady',{attemptId:a.attemptId,generation:admission.generation,bodies:admission.bodies.map(({id,generation})=>({id,generation}))});
    tick(); assert.equal(a.admissionPending,false);
    const load=a.cohort.get('load'), cradle=a.cohort.get('cradle');
    const line=kernel.attachments.create({defId:'tether_standard',ownerId:player.id,targetId:load.id,sourceWorld:{...player.pos},targetWorld:{...load.pos}});
    assert.equal(line.ok,true);let cut=false;
    for(let i=0;i<5200 && owner._attempt();i++) {
      tick(()=>pilot(player,{x:cradle.pos.x+6,z:cradle.pos.z+(cut?-16:0)}));
      if(!cut&&load.pos.x>cradle.pos.x-38&&load.vel.x>1&&load.vel.x<=4) {assert.equal(kernel.attachments.cut(line.attachment.id,player.id,'tether_cut').ok,true);cut=true;}
    }
    assert.equal(s.world.counterweightCircuit.lastResult.outcome,'complete');
    assert.equal(s.world.counterweightCircuit.records.soft_berth.paid,true);
    assert.deepEqual(cues,['commission.counterweight.start','commission.counterweight.payout']);
    assert.deepEqual(sounds.heard,['sfx_mission_accept','sfx_cash_register']);
    const count=sounds.heard.length; const rec=s.world.counterweightCircuit.records.soft_berth;
    assert.equal(sim.registry.get('economy').settleCounterweightResult('soft_berth',a.attemptId).duplicate,true);
    assert.equal(sounds.heard.length,count);
    assert.equal(rec.paid,true);
    sounds.dispose();off();
  } finally { h.sim.dispose(); }
});

test('real circuit failure sounds once and an explicit cancellation stays silent', async () => {
  const h=await circuitFixture();
  try {
    const {sim,s,owner,tick}=h, sounds=bind(sim.bus,s), cues=[];
    const off=sim.bus.on('audio:cue',p=>{if(p?.id?.startsWith('commission.')) cues.push(p.id);});
    const admit=() => {
      const a=owner._attempt(), v=s.counterweightCircuitView.admission;
      for(let i=0;i<3;i++)tick();
      sim.bus.emit('counterweightCircuit:presentationReady',{attemptId:a.attemptId,generation:v.generation,bodies:v.bodies.map(({id,generation})=>({id,generation}))});
      tick(); assert.equal(a.admissionPending,false); return a;
    };
    assert.equal(owner._startAttempt('soft_berth',true),true); admit();
    owner._cancelAttempt('cancelled');
    assert.deepEqual(cues,['commission.counterweight.start']);
    assert.equal(owner._startAttempt('soft_berth',true),true);
    const a=admit(); a.cohort.get('load').hull=0; tick();
    assert.equal(s.world.counterweightCircuit.lastResult.outcome,'failed');
    assert.deepEqual(cues,['commission.counterweight.start','commission.counterweight.start','commission.counterweight.failed']);
    assert.deepEqual(sounds.heard,['sfx_mission_accept','sfx_mission_accept','sfx_ui_error']);
    sounds.dispose();off();
  } finally {h.sim.dispose();}
});

test('default sim host forwards the actual interrupted-service cue to main', async () => {
  const lane=createSimHost();
  try {
    const init=await lane.init({profile:'production',seed:4242,scenarioContract:JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json',import.meta.url)))});
    const {state,registry}=lane.host, owner=registry.get('cinderglassJob');
    state.world.currentSectorId='sector_tethys_junction'; state.mode='flight';
    owner._cg.phase='decide'; owner._cg.operationId='cg:4242:1'; owner._cg.custody='carried'; owner._cg.scanDone=true;
    owner._presentationReady=true; owner._needsRebind=false; owner._serviceActionId=1; owner._cg.serviceActive=true;
    owner.update(1/60,state);
    const reply=await lane.tick({tick:1,steps:0,ackEnd:init.initRebuild?.end??0});
    const events=reply.events.filter(e=>e.t==='audio:cue' && e.p?.id==='commission.cinderglass.interrupted');
    assert.equal(events.length,1);
    const main={world:{currentSectorId:'sector_tethys_junction'},tick:state.tick};
    const listeners=new Map(), bus={on(n,fn){let a=listeners.get(n);if(!a)listeners.set(n,a=new Set());a.add(fn);return()=>a.delete(fn);},emit(n,p){for(const fn of listeners.get(n)||[])fn(p);}};
    const sounds=bind(bus,main); for(const e of events) bus.emit(e.t,structuredClone(e.p));
    assert.deepEqual(sounds.heard,['sfx_ui_error']); sounds.dispose();
  } finally {lane.shutdown();}
});

test('default sim host forwards only an accepted circuit payout once', async () => {
  const lane=createSimHost();
  try {
    const init=await lane.init({profile:'production',seed:4242,scenarioContract:JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json',import.meta.url)))});
    const {state,registry}=lane.host, owner=registry.get('counterweightCircuit'), econ=registry.get('economy');
    state.world.currentSectorId='sector_pallas_drift';
    const row=owner._row(), eventId='soft_berth', attemptId=42;
    row.records[eventId]={paid:false,completions:1,lastAttemptKey:`${eventId}:${attemptId}`,
      lastResult:{eventId,outcome:'complete',practice:false},pendingReward:{eventId,attemptId}};
    const refused=econ.settleCounterweightResult(eventId,attemptId+1); assert.equal(refused.ok,false);
    const accepted=econ.settleCounterweightResult(eventId,attemptId); assert.equal(accepted.ok,true);
    assert.equal(econ.settleCounterweightResult(eventId,attemptId).duplicate,true);
    const reply=await lane.tick({tick:1,steps:0,ackEnd:init.initRebuild?.end??0});
    const cues=reply.events.filter(e=>e.t==='audio:cue' && e.p?.id==='commission.counterweight.payout');
    assert.equal(cues.length,1); assert.equal(cues[0].p.commissionKey,`counterweight:first-completion:${eventId}`);
    assert.equal(reply.events.some(e=>e.t==='credits:changed'),false,'default worker requires the forwarded cue');
  } finally {lane.shutdown();}
});
