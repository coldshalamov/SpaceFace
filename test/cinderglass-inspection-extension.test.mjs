import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateScene, placeBody } from './cinderglass-job-fixture.mjs';
import { CINDERGLASS_JOB_POINTS as POINTS } from '../src/features/cinderglassJob/definition.js';
import { cinderglassJobStepConvoy } from '../src/features/cinderglassJob/convoy.js';
import { serializeCinderglassJob, normalizeCinderglassJob } from '../src/features/cinderglassJob/persistence.js';
function inspectionFixture(t) {
  const c = t.body('carrierId'), delta = { x: POINTS.pullOff.x - c.pos.x, z: POINTS.pullOff.z - c.pos.z };
  for (const key of ['carrierId','podId','latchId']) { const e = t.body(key); placeBody(t,e,{x:e.pos.x+delta.x,z:e.pos.z+delta.z}); }
  const entry = t.state.npcJobs.byId[t.cg().entities.carrierJobId];
  entry.job.routeIndex = 1; entry.job.phase = 'transit'; entry.job.progress = 0;
  placeBody(t,t.player,{x:POINTS.pullOff.x-100,z:POINTS.pullOff.z});
  // Earned scan knowledge is seeded ONLY in this transaction fixture. Visibility has its own owner checks.
  t.cg().scanDone = true; t.cg().phase = 'decide';
  cinderglassJobStepConvoy(t.sys,t.state);
  assert.equal(t.cg().atLayby,true);
}

const extend=(t,options={})=>t.action('extendInspection',{revision:t.cg().promptRevision,...options});
async function ready(){const t=await candidateScene();await t.accept();inspectionFixture(t);t.sys._publishApproachPrompts();return t;}
test('ordinary prompt grants one actual same-job lease extension without price/cargo/custody change',async()=>{
 const t=await ready(),st=t.cg(), carrier=t.body('carrierId'),remaining=st.laybyRemainingS,credits=t.state.player.credits;
 const prompt=st.approachPrompt;assert.ok(prompt.choices.some(c=>c.id==='extendInspection'));assert.ok(prompt.choices.length<=8);
 assert.ok(prompt.choices.some(c=>c.id==='leave'));
 const result=extend(t);assert.equal(result.ok,true);assert.equal(st.laybyRemainingS,remaining+30);
 const npc=t.sim.registry.get('npcJobsRuntime');assert.equal(npc._heaveToLease.entityId,carrier.id);
 assert.ok(Math.abs(npc._heaveToLease.untilSimT-(t.state.simTime+remaining+31))<1e-8);
 assert.equal(extend(t).ok,false);assert.equal(st.laybyRemainingS,remaining+30);
 assert.equal(t.state.player.credits,credits);assert.equal(st.custody,'carried');assert.equal(st.depositPaid,false);
 t.sys._publishApproachPrompts();assert.equal(st.approachPrompt.choices.some(c=>c.id==='extendInspection'),false);
});
test('save preserves one-time permission and remaining native stop, not a fresh allowance',async()=>{
 const t=await ready();assert.equal(extend(t).ok,true);
 const before=t.cg().laybyRemainingS;const saved=t.sim.registry.get('save').serializeData();
 t.restore(saved);assert.equal(t.cg().actors.dask.inspectionExtensionUsed,true);
 assert.ok(t.cg().laybyRemainingS<=before);assert.equal(extend(t).ok,false);
 assert.equal(normalizeCinderglassJob(serializeCinderglassJob(t.cg(),t.state)).actors.dask.inspectionExtensionUsed,true);
});
test('stale, suspicious, foreign lease, moving, departed, dead and docked requests cannot prolong work',async()=>{
 for(const kind of ['stale','suspicious','foreign','moving','departed','dead','docked']){
  const t=await ready(),st=t.cg(),before=st.laybyRemainingS;
  if(kind==='suspicious')st.suspicion=2;
  if(kind==='foreign')t.state.npcJobs.byId[st.entities.carrierJobId].control.holder='other';
  if(kind==='moving')t.body('carrierId').vel.x=4;
  if(kind==='departed')st.laybyDone=true,st.atLayby=false;
  if(kind==='dead')t.body('carrierId').alive=false;
  if(kind==='docked')t.state.ui.docked=true;
  assert.equal(extend(t,kind==='stale'?{token:'old'}:{}).ok,false,kind);
  assert.equal(st.laybyRemainingS,before);assert.equal(st.actors.dask.inspectionExtensionUsed,undefined);
 }
});

// Explicit isolated candidate assembly. Native physics, save, cargo/economy/law remain production
// owners. Proposed owner methods and traffic hunks are loaded without touching shared source.

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { factions } from '../src/systems/factions.js';
import { heat } from '../src/systems/heat.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { combat } from '../src/systems/combat.js';
import { actions } from '../src/systems/actions.js';
import { save } from '../src/save/saveSystem.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { COMBAT_PROFILES, ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { createCinderglassJobSystem } from '../src/features/cinderglassJob/runtime.js';
import { createBreakwaterSpurSystem } from '../src/features/breakwaterSpur/runtime.js';
import { createCounterweightCircuitSystem } from '../src/features/counterweightCircuit/runtime.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { CINDERGLASS_JOB_COMBAT_PROFILE, CINDERGLASS_JOB_MOUNT_DEFINITION,
  CINDERGLASS_JOB_SECTOR_ID, CINDERGLASS_JOB_ROLES } from '../src/features/cinderglassJob/definition.js';

async function nativeScene({ withLaw = false, playerPos = null } = {}) {
  const catalog = createCombatCatalog({
    profiles: [...COMBAT_PROFILES.filter(r => r.id !== CINDERGLASS_JOB_COMBAT_PROFILE.id), CINDERGLASS_JOB_COMBAT_PROFILE],
    attachments: [...ATTACHMENT_DEFS.filter(r => r.id !== CINDERGLASS_JOB_MOUNT_DEFINITION.id), CINDERGLASS_JOB_MOUNT_DEFINITION] });
  const fixture = { name: 'cinderglassCatalogFixture', init(ctx) { getCombatKernel(ctx, { catalog }); } };
  const sim = createSimulation({ seed: 4242, systems: [physics, world,
    cargo, economy,
    ...(withLaw ? [factions, heat, lawSecurity] : []), fixture, npcJobsRuntime, actions, createTacticalAISystem(), aiPorts, flightV3,
    combat, createCounterweightCircuitSystem(), createBreakwaterSpurSystem(), createCinderglassJobSystem(), save] });
  const state = sim.state, bus = sim.bus || sim.registry.ctx.bus;
  state.mode = 'flight'; state.run = { kind: 'adventure' };
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
  state.player.credits = 5000; state.player.docked = false;
  state.story ||= {}; state.story.campaign47a = { stepProgress: { '1': { completed: ['alloy_run'] } } };
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, team: 0, pos: playerPos || { x: 0, z: 0 } }));
  state.playerId = player.id;
  // Optional authored fixture placement happens before native admission, never by moving a live body.
  sim.registry.get('world').enterSector(CINDERGLASS_JOB_SECTOR_ID, playerPos ? { placePlayer: false } : {});
  const sys = sim.registry.get('cinderglassJob');
  const t = { sim, state, bus, sys, player,
    cg: () => state.world.cinderglassJob,
    step(n = 1) { for (let i = 0; i < n; i++) sim.step(SIM_DT); },
    until(fn, max = 120) { for (let i = 0; i < max; i++) { t.step(); if (fn()) return true; } return false; },
    action(action, rest = {}) { const p = { action, token: sys.token(), operationId: t.cg().operationId, ...rest }; bus.emit('cinderglassJob:action', p); return p.result; },
    body(key) { return state.entities.get(t.cg().entities[key]); },
    ack() { sys._rebind(state); bus.emit('cinderglassJob:presentationReady', { token: sys.token(), operationId: t.cg().operationId,
      bodies: [...sys._bindings.values()].map(({ entity }) => ({ id: entity.id, generation: entity.occupantGeneration })) }); },
    async accept() {
      assert.equal(t.action('contact').ok, true);
      assert.equal(t.action('accept', { offerEpoch: t.cg().offerEpoch }).ok, true);
      t.step(4); t.ack();
      assert.ok(t.until(() => t.cg().phase === 'recon'), t.cg().admissionReason);
    },
    restore(data) { const result = sim.registry.get('save')._restore(JSON.parse(JSON.stringify(data)), 'cinderglass-fixture');
      assert.equal(result.restored, true); t.step(2); t.ack(); t.step(3); return result; },
    originalCount(key = 'podId') { const rid = CINDERGLASS_JOB_ROLES[key].worldRecordId;
      return [...state.entities.values()].filter(e => e.data?.worldRecordId === rid).length; },
  };
  return t;
}


import {createTacticalAISystem} from '../src/systems/tacticalAI.js';
import {aiPorts} from '../src/systems/aiPorts.js';
test('native AI keeps same stopped carrier for extra interval, then resumes its real job',async()=>{
 const t=await nativeScene();await t.accept();inspectionFixture(t);
 const c=t.body('carrierId'),start={...c.pos},job=t.cg().entities.carrierJobId;
 assert.equal(extend(t).ok,true);
 t.step(40*60);assert.equal(t.cg().laybyHoldActive,true);assert.equal(t.body('carrierId'),c);
 assert.ok(Math.hypot(c.pos.x-start.x,c.pos.z-start.z)<1);assert.ok(Math.hypot(c.vel.x,c.vel.z)<1);
 t.step(25*60);assert.equal(t.cg().laybyDone,true);assert.equal(t.cg().laybyHoldActive,false);
 assert.equal(t.sys.helpers.npcJobs.controlClaim(job),null);
 t.step(10*60);assert.equal(t.body('carrierId'),c);assert.ok(Math.hypot(c.pos.x-start.x,c.pos.z-start.z)>1);
 assert.equal(extend(t).ok,false);
});

import {createCinderglassJobPromptSystem} from '../src/features/cinderglassJob/presentation.js';
import {setPromptDeck} from '../src/ui/promptDeck.js';
test('real prompt adapter selects one extension; callback reentry and stale revision cannot repeat it',async()=>{
 const t=await ready(),p=createCinderglassJobPromptSystem();let card, nested, callbackCount=0;
 setPromptDeck({offerDecision(s){card=s;return true;},resolveDecision(){},hasDecision(){return false;}});
 try{
  p.init({state:t.state,bus:t.bus});p.servicePrompt(t.cg().approachPrompt);
  const revision=t.cg().promptRevision;assert.equal(extend(t,{revision:revision-1}).ok,false);
  // Refresh after the refusal's ordinary new view.
  t.sys._publishApproachPrompts();p.servicePrompt(t.cg().approachPrompt);
  const before=t.cg().laybyRemainingS;
  t.bus.on('cinderglassJob:view',()=>{
   if(callbackCount || t.cg().actors.dask.inspectionExtensionUsed !== true)return;
   callbackCount++;nested=extend(t);
  });
  assert.equal(card.onChoose('extendInspection'),true);assert.equal(t.cg().laybyRemainingS,before+30);
  assert.equal(callbackCount,1);assert.ok(nested);assert.equal(nested.ok,false);
  assert.equal(t.cg().laybyRemainingS,before+30);
  assert.equal(extend(t,{revision}).ok,false);
 }finally{p.destroy();setPromptDeck(null);}
});
