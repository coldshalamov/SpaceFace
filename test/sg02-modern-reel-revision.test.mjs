import assert from 'node:assert/strict';
import test from 'node:test';
import { createSg02DynamicBodyOwner, createSg02CombatPhysicsPort } from '../src/core/sg02DynamicBodyOwner.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { physics } from '../src/core/physics.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';

const clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function actor(id, x) {
  return { id, type: 'ship', alive: true, isPlayer: id === 1, radius: 3, mass: 24,
    pos: { x, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0, angVel: 0,
    data: { defId: 'ship_kestrel', ...(id===2?{combatProfileId:'combat_profile_tether_payload'}:{}) }, flags: {},
    physicsBody: { schemaVersion: 1, radius: 3, mass: 24, inertiaY: 48,
      dynamic: true, shape: 'ball', ccd: false, revision: 0 } };
}
function context(entities, semantic, def) {
  const state = createGameState(47);
  state.mode = 'flight'; state.settings.gameplay.flightBackend = 'v2';
  state.entityList = entities; state.entities = new Map(entities.map(e => [e.id, e])); state.playerId = 1;
  state.combat.attachments = { nextId: 2, byId: { line: semantic } };
  const helpers={};
  const catalog=createCombatCatalog();catalog.attachments.set(def.id,def);
  const service = createAttachmentService({ state,
    catalog, helpers, bus: createBus() });
  return { state, service, helpers };
}
async function fixture(defId = 'attachment_massline') {
  const entities = [actor(1, 0), actor(2, 40)];
  if (defId === 'attachment_massline') entities[1].data.scenarioActorId = 'evidence_spindle_47a';
  const semantic = { id: 'line', defId, state: 'active', ownerId: 1, targetId: 2,
    sourceSocketId: 'socket_tether_spool', targetSocketId: 'socket_tether_payload',
    sourceAnchorLocal: { x: 0, y: 0, z: 0 }, targetAnchorLocal: { x: 0, y: 0, z: 0 },
    restLength: 50, reelRevision: 0, physicsSpringState: null };
  const def = clone(ATTACHMENT_DEFS.find(value => value.id === defId));
  if(defId==='tether_standard')Object.assign(def.spring,{mode:'frame_coupler',K:640,zeta:1.05,maxForce:24000,velocityGain:8});
  const { state, service, helpers } = context(entities, semantic, def);
  const source = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  source.syncFromEntities(entities);
  helpers.combatPhysics=createSg02CombatPhysicsPort(source);
  assert.ok(source.createAttachment({ ...semantic, attachmentId: 'line', ...service.physicsContract('line') }));
  semantic.physicsSpringState = clone(source.attachments.get('line').springState);
  return { source, entities, semantic, def, state, service, payload: clone(source.exportWorldSnapshot()) };
}
async function restore(f, { helper = true } = {}) {
  const current = context(clone(f.entities), clone(f.semantic), clone(f.def));
  const target = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  const system = Object.create(physics);
  system.init({ state: current.state, bus: createBus(), helpers: helper
    ? { describeCombatPhysicsAttachment: id => current.service.physicsContract(id) } : {} });
  system._sg02 = target;
  return { ...current, target, system, finish() {
    system.deserialize(f.payload, { deferNative: true });
    system.completeRestore({ entityIdRemap: new Map([['1', 1], ['2', 2]]) });
    return current.state.physicsRuntime.nativeRestore;
  } };
}


function refresh(f){f.semantic.physicsSpringState=clone(f.source.attachments.get('line').springState);f.payload=clone(f.source.exportWorldSnapshot());return f.payload.attachments.line;}
test('accepted modern no-op and payout synchronize revisions without changing spring or force',async()=>{const f=await fixture('tether_standard');try{const n=f.source.attachments.get('line'),spring=clone(n.spring),state=clone(n.springState),force=n.forceScale;for(const delta of [0,5,0]){assert(f.service.reel('line',delta).ok);assert.equal(n.reelRevision,f.semantic.reelRevision);}assert.equal(n.restLength,55);assert.deepEqual(n.spring,spring);assert.deepEqual(n.springState,state);assert.equal(n.forceScale,force);assert.equal(refresh(f).reelRevision,3);}finally{f.source.dispose();}});
test('safe-clamped modern shorten publishes accepted length and matching revision',async()=>{const f=await fixture('tether_standard');try{assert(f.service.reel('line',-49).ok);const n=f.source.attachments.get('line');assert(n.restLength>1);assert.equal(n.restLength,f.semantic.restLength);assert.equal(n.reelRevision,1);assert.equal(refresh(f).reelRevision,f.semantic.reelRevision);}finally{f.source.dispose();}});
test('modern stale input revision cannot decrease accepted monotonic revision',async()=>{const f=await fixture('tether_standard');try{const n=f.source.attachments.get('line');for(const [input,expected] of [[10,10],[2,11],[11,12]]){const result=f.source.setAttachmentReel({attachmentId:'line',restLength:50,reelRevision:input});assert.equal(result.restLength,50);assert.equal(n.reelRevision,expected);}}finally{f.source.dispose();}});
test('missing native attachment rejects without changing live revision or policy',async()=>{const f=await fixture('tether_standard');try{const before=refresh(f);assert.equal(f.source.setAttachmentReel({attachmentId:'missing',restLength:1,reelRevision:100}),false);assert.deepEqual(refresh(f),before);}finally{f.source.dispose();}});
test('legacy first reel transition retains prior revision and spring behavior',async()=>{const f=await fixture();try{const n=f.source.attachments.get('line');assert.equal(n.spring.mode,'legacy_rope');assert(f.service.reel('line',0).ok);assert.equal(n.reelRevision,1);assert.equal(f.semantic.reelRevision,1);assert.notEqual(n.spring.mode,'legacy_rope');assert.equal(n.restLength,50);}finally{f.source.dispose();}});
test('reeled modern native snapshot and semantic contract adopt exact policy',async()=>{const f=await fixture('tether_standard');let r;try{assert(f.service.reel('line',5).ok);assert(f.service.reel('line',0).ok);const saved=refresh(f);assert.equal(saved.reelRevision,f.semantic.reelRevision);r=await restore(f);assert.deepEqual(r.finish(),{mode:'native',exact:true,reason:null});const n=r.target.attachments.get('line');for(const k of ['restLength','break','spring','forceScale','reelRevision','springState'])assert.deepEqual(n[k],saved[k]);assert.equal(r.target._hasManualSpringAttachment(r.target.records.get(1)),true);f.source.step(1/60);r.target.step(1/60);assert.deepEqual(r.target.quantizedSnapshot(),f.source.quantizedSnapshot());}finally{f.source.dispose();r?.target.dispose();}});
test('scalar fallback recreates exact reeled policy before solver from unchanged semantic line',async()=>{const f=await fixture('tether_standard');let r;try{assert(f.service.reel('line',5).ok);const saved=refresh(f);r=await restore(f,{helper:false});assert.equal(r.finish().mode,'scalar');assert.equal(r.target.attachments.size,0);r.helpers.combatPhysics=createSg02CombatPhysicsPort(r.target);assert.equal(r.service.reconcilePhysics().recreated,1);const n=r.target.attachments.get('line');for(const k of ['restLength','break','spring','forceScale','reelRevision','springState'])assert.deepEqual(n[k],saved[k]);assert.equal(r.target.tick,0);}finally{f.source.dispose();r?.target.dispose();}});
