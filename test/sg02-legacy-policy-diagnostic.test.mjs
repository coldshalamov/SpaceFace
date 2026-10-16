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
async function fixture(defId = 'attachment_massline', mode = 'frame_coupler') {
  const entities = [actor(1, 0), actor(2, 40)];
  if (defId === 'attachment_massline') entities[1].data.scenarioActorId = 'evidence_spindle_47a';
  const semantic = { id: 'line', defId, state: 'active', ownerId: 1, targetId: 2,
    sourceSocketId: defId === 'attachment_massline' ? 'socket_massline' : 'socket_tether_spool', targetSocketId: 'socket_tether_payload',
    sourceAnchorLocal: { x: 0, y: 0, z: 0 }, targetAnchorLocal: { x: 0, y: 0, z: 0 },
    restLength: 50, reelRevision: 0, physicsSpringState: null };
  const def = clone(ATTACHMENT_DEFS.find(value => value.id === defId));
  if(defId==='tether_standard')Object.assign(def.spring,{mode,K:640,zeta:1.05,maxForce:24000,velocityGain:8});
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

test('legacy service transition preserves honest scalar fallback for preexisting force policy mismatch', async () => {
  const f = await fixture(); let r;
  try {
    assert.equal(f.service.reel('line', 0).ok, true); refresh(f);
    const native = f.payload.attachments.line, semantic = f.service.physicsContract('line');
    console.log('LEGACY_POLICY_DIFF', JSON.stringify({ native: {break:native.break,spring:native.spring}, semantic:{break:semantic.break,spring:semantic.spring} }));
    assert.equal(native.break.maxTension, 76); assert.equal(semantic.break.maxTension, 10250);
    r = await restore(f); assert.equal(r.finish().mode, 'scalar');
    r.helpers.combatPhysics = createSg02CombatPhysicsPort(r.target);
    assert.equal(r.service.reconcilePhysics().recreated, 1);
    assert.equal(r.target.tick, 0);
  } finally { f.source.dispose(); r?.target.dispose(); }
});
