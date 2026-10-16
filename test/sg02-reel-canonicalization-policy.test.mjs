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
for (const mode of ['spring', 'frame_coupler']) {
  test(`modern ${mode} reels preserve physical canonicalization policy across solver and native restore`, async () => {
    const f = await fixture('tether_standard', mode); let r;
    try {
      const original = f.source._canonicalizeManualSpringBody; let calls = 0;
      f.source._canonicalizeManualSpringBody = function(...args) { calls++; return original.apply(this, args); };
      for (const delta of [0, 5, -2]) assert.equal(f.service.reel('line', delta).ok, true);
      assert.equal(f.source.attachments.get('line').spring.canonicalizeReplay, false);
      f.source.step(1 / 60); assert.equal(calls, 0);
      refresh(f); r = await restore(f);
      assert.deepEqual(r.finish(), { mode: 'native', exact: true, reason: null });
      assert.equal(r.target.attachments.get('line').spring.canonicalizeReplay, false);
      for (let i = 0; i < 4; i++) { f.source.step(1 / 60); r.target.step(1 / 60); }
      assert.deepEqual(r.target.quantizedSnapshot(), f.source.quantizedSnapshot());
    } finally { f.source.dispose(); r?.target.dispose(); }
  });
}

test('legacy owner preserves loaded scalar replay and honest native refusal', async () => {
  const f = await fixture(); let r;
  try {
    assert.equal(f.source.attachments.get('line').spring.canonicalizeReplay, false);
    assert.equal(f.service.reel('line', -20).ok, true);
    assert.equal(f.source.attachments.get('line').spring.canonicalizeReplay, true);
    assert.equal(f.service.physicsContract('line').spring.canonicalizeReplay, true);
    let calls = 0; const original = f.source._canonicalizeManualSpringBody;
    f.source._canonicalizeManualSpringBody = function(...args) { calls++; return original.apply(this, args); };
    for (let i = 0; i < 18; i++) f.source.step(1 / 60);
    assert.ok(calls >= 36);
    const springState = f.source.attachments.get('line').springState;
    assert.ok(springState.lastTension > 0, 'legacy replay is under real earned spring tension');
    assert.ok(Math.hypot(f.entities[0].vel.x, f.entities[0].vel.z) > 0, 'legacy endpoints are moving');
    refresh(f);
    // Preserve the baseline's honest native refusal and actual scalar-rebuild replay.
    // No validator is weakened to claim a loaded native capability that baseline lacks.
    const target = await createSg02DynamicBodyOwner({ publishTelemetry: false }); r = { target };
    const contract = clone(f.payload.attachments.line);
    assert.equal(target.adoptWorldSnapshot(f.payload, clone(f.entities), {
      resolveAttachmentContract: () => contract,
    }), false, 'loaded legacy scalar mirrors differ from f32 native state, so exact adoption remains refused');
    target.rebuildWorldFromEntities(clone(f.entities));
    assert.ok(target.createAttachment({ ...contract, attachmentId: 'line' }));
    assert.equal(r.target.attachments.get('line').spring.canonicalizeReplay, true);
    for (let i = 0; i < 12; i++) { f.source.step(1 / 60); r.target.step(1 / 60); }
    assert.deepEqual(r.target.quantizedSnapshot(), f.source.quantizedSnapshot());
  } finally { f.source.dispose(); r?.target.dispose(); }
});

for (const legacy of [false, true]) {
  test(`old missing canonicalization field ${legacy ? 'legacy falls back with policy before solver' : 'modern adopts without physical policy'}`, async () => {
    const f = await fixture(legacy ? 'attachment_massline' : 'tether_standard'); let r;
    try {
      assert.equal(f.service.reel('line', 0).ok, true); refresh(f);
      delete f.payload.attachments.line.spring.canonicalizeReplay;
      r = await restore(f);
      const verdict = r.finish();
      assert.equal(verdict.mode, legacy ? 'scalar' : 'native');
      if (legacy) {
        assert.equal(r.target.attachments.size, 0);
        r.helpers.combatPhysics = createSg02CombatPhysicsPort(r.target);
        assert.equal(r.service.reconcilePhysics().recreated, 1);
      }
      assert.equal(r.target.tick, 0);
      assert.equal(r.target.attachments.get('line').spring.canonicalizeReplay, legacy);
    } finally { f.source.dispose(); r?.target.dispose(); }
  });
  test(`explicit ${legacy} canonicalization survives withdrawal recreation and scalar fallback`, async () => {
    const f = await fixture(legacy ? 'attachment_massline' : 'tether_standard'); let r;
    try {
      assert.equal(f.service.reel('line', 0).ok, true);
      const before = f.source.attachments.get('line'), profile = f.entities[1].physicsBody;
      f.entities[1].physicsBody = false; f.source.syncFromEntities(f.entities);
      assert.equal(f.source.attachments.size, 0); assert.equal(f.source._suspendedAttachments.size, 1);
      f.entities[1].physicsBody = profile; f.source.syncFromEntities(f.entities);
      assert.equal(f.source._suspendedAttachments.size, 0);
      const after = f.source.attachments.get('line'); assert.notEqual(after, before);
      assert.equal(after.spring.canonicalizeReplay, legacy); assert.equal(after.reelRevision, before.reelRevision);
      refresh(f); r = await restore(f, { helper: false }); assert.equal(r.finish().mode, 'scalar');
      r.helpers.combatPhysics = createSg02CombatPhysicsPort(r.target);
      assert.equal(r.service.reconcilePhysics().recreated, 1);
      assert.equal(r.target.tick, 0); assert.equal(r.target.attachments.get('line').spring.canonicalizeReplay, legacy);
    } finally { f.source.dispose(); r?.target.dispose(); }
  });
}

test('forged modern canonicalization is rejected and scalar recreation uses authoritative false policy', async () => {
  const f = await fixture('tether_standard'); let r;
  try {
    assert.equal(f.service.reel('line', 0).ok, true); refresh(f);
    f.payload.attachments.line.spring.canonicalizeReplay = true;
    r = await restore(f); assert.equal(r.finish().mode, 'scalar');
    assert.equal(r.target.attachments.size, 0);
    r.helpers.combatPhysics = createSg02CombatPhysicsPort(r.target);
    assert.equal(r.service.reconcilePhysics().recreated, 1);
    assert.equal(r.target.attachments.get('line').spring.canonicalizeReplay, false);
  } finally { f.source.dispose(); r?.target.dispose(); }
});

test('invalid explicit canonicalization types reject native adoption without mutating live owner or semantics', async () => {
  const f = await fixture('tether_standard');
  try {
    assert.equal(f.service.reel('line', 0).ok, true); refresh(f);
    for (const value of ['true', 1, null, {}, []]) {
      const payload = clone(f.payload); payload.attachments.line.spring.canonicalizeReplay = value;
      const before = { world: f.source.world, records: f.source.records, attachments: f.source.attachments };
      const semanticBefore = clone(f.semantic);
      assert.equal(f.source.adoptWorldSnapshot(payload, f.entities, {
        attachments: f.state.combat.attachments.byId,
        resolveAttachmentContract: id => f.service.physicsContract(id),
      }), false);
      assert.equal(f.source.world, before.world); assert.equal(f.source.records, before.records);
      assert.equal(f.source.attachments, before.attachments); assert.deepEqual(f.semantic, semanticBefore);
    }
  } finally { f.source.dispose(); }
});

for (const mode of ['spring', 'frame_coupler']) {
  test(`modern ${mode} no-op reel produces exactly the same physical zero-delta trajectory`, async () => {
    const control = await fixture('tether_standard', mode), reeled = await fixture('tether_standard', mode);
    try {
      for (const f of [control, reeled]) {
        f.source.records.get(1).body.setLinvel({ x: -0.123456789, y: 0, z: 0.234567891 }, true);
        f.source.records.get(2).body.setLinvel({ x: 0.345678912, y: 0, z: -0.456789123 }, true);
      }
      assert.equal(reeled.service.reel('line', 0).ok, true);
      assert.equal(reeled.source.attachments.get('line').reelRevision, 1);
      assert.equal(control.source.attachments.get('line').reelRevision, 0);
      for (let i = 0; i < 12; i++) {
        control.source.step(1 / 60); reeled.source.step(1 / 60);
        assert.deepEqual(reeled.source.quantizedSnapshot(), control.source.quantizedSnapshot());
        assert.deepEqual(reeled.entities.map(e => [e.pos, e.vel, e.rot, e.angVel]),
          control.entities.map(e => [e.pos, e.vel, e.rot, e.angVel]));
      }
    } finally { control.source.dispose(); reeled.source.dispose(); }
  });
}

test('missing legacy replay policy alone rejects an otherwise exact owner snapshot without partial mutation', async () => {
  const f = await fixture(); const target = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    assert.equal(f.service.reel('line', 0).ok, true); refresh(f);
    const trustedContract = clone(f.payload.attachments.line);
    assert.equal(target.adoptWorldSnapshot(f.payload, clone(f.entities), {
      resolveAttachmentContract: () => trustedContract,
    }), true, 'intact explicit replay policy adopts exactly');
    const before = { world: target.world, records: target.records, attachments: target.attachments };
    const old = clone(f.payload); delete old.attachments.line.spring.canonicalizeReplay;
    assert.equal(target.adoptWorldSnapshot(old, clone(f.entities), {
      resolveAttachmentContract: () => trustedContract,
    }), false, 'only removing the replay policy prevents exact adoption');
    assert.equal(target.world, before.world); assert.equal(target.records, before.records);
    assert.equal(target.attachments, before.attachments);
  } finally { f.source.dispose(); target.dispose(); }
});
