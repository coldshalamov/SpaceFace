import assert from 'node:assert/strict';
import test from 'node:test';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { physics } from '../src/core/physics.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { combat } from '../src/systems/combat.js';
import { save } from '../src/save/saveSystem.js';

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
    data: { defId: 'ship_kestrel' }, flags: {},
    physicsBody: { schemaVersion: 1, radius: 3, mass: 24, inertiaY: 48,
      dynamic: true, shape: 'ball', ccd: false, revision: 0 } };
}
function context(entities, semantic, def) {
  const state = createGameState(47);
  state.mode = 'flight'; state.settings.gameplay.flightBackend = 'v2';
  state.entityList = entities; state.entities = new Map(entities.map(e => [e.id, e])); state.playerId = 1;
  state.combat.attachments = { nextId: 2, byId: { line: semantic } };
  const service = createAttachmentService({ state,
    catalog: { attachments: new Map([[def.id, def]]) }, helpers: {}, bus: createBus() });
  return { state, service };
}
async function fixture(defId = 'attachment_massline') {
  const entities = [actor(1, 0), actor(2, 40)];
  if (defId === 'attachment_massline') entities[1].data.scenarioActorId = 'evidence_spindle_47a';
  const semantic = { id: 'line', defId, state: 'active', ownerId: 1, targetId: 2,
    sourceSocketId: 'source', targetSocketId: 'target',
    sourceAnchorLocal: { x: 0, y: 0, z: 0 }, targetAnchorLocal: { x: 0, y: 0, z: 0 },
    restLength: 50, reelRevision: 0, physicsSpringState: null };
  const def = clone(ATTACHMENT_DEFS.find(value => value.id === defId));
  const { state, service } = context(entities, semantic, def);
  const source = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  source.syncFromEntities(entities);
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

test('unchanged legacy policy and spring continuation adopt exactly without mutating frozen semantics', async () => {
  const f = await fixture(), r = await restore(f);
  try {
    // Combat's validLocalPoint emits planar x/z anchors; native creation fills y=0.
    delete r.state.combat.attachments.byId.line.sourceAnchorLocal.y;
    delete r.state.combat.attachments.byId.line.targetAnchorLocal.y;
    const before = clone(r.state.combat.attachments.byId);
    freeze(r.state.combat.attachments.byId);
    assert.deepEqual(r.finish(), { mode: 'native', exact: true, reason: null });
    assert.deepEqual(r.state.combat.attachments.byId, before);
    assert.equal(r.target.attachments.get('line').spring.mode, 'legacy_rope');
    for (let tick = 0; tick < 4; tick++) { f.source.step(1 / 60); r.target.step(1 / 60); }
    assert.deepEqual(r.target.quantizedSnapshot(), f.source.quantizedSnapshot());
  } finally { f.source.dispose(); r.target.dispose(); }
});

for (const [name, change] of [
  ['reel revision switching legacy rope to spring', r => { r.state.combat.attachments.byId.line.reelRevision = 1; }],
  ['spring continuation', r => { r.state.combat.attachments.byId.line.physicsSpringState.reelSlip = true; }],
  ['endpoint force multiplier', r => { r.state.entities.get(2).data.masslineForceScale = 0.5; }],
  ['changed runtime flight policy', r => { r.state.settings.gameplay.flightBackend = 'v3'; }],
]) {
  test(`${name} rejects native policy and preserves authoritative semantic state`, async () => {
    const f = await fixture(), r = await restore(f);
    try {
      change(r); const before = clone(r.state.combat.attachments.byId);
      assert.deepEqual(r.finish(), { mode: 'scalar', exact: false, reason: 'identity_or_contract_changed' });
      assert.deepEqual(r.state.combat.attachments.byId, before);
      assert.equal(r.target.attachments.size, 0);
      assert.equal(r.target.world.bodies.len(), 2);
      if (name.startsWith('reel')) assert.equal(r.service.physicsContract('line').spring.mode, undefined);
    } finally { f.source.dispose(); r.target.dispose(); }
  });
}

for (const [name, change] of [
  ['catalog spring', def => { def.spring.K += 5; }],
  ['catalog break rating', def => { def.break.maxTension += 5; }],
  ['maximum length', def => { def.maxLength = 30; }],
]) {
  test(`changed ${name} rejects saved native attachment inputs`, async () => {
    const f = await fixture('tether_standard');
    change(f.def);
    const r = await restore(f);
    try { assert.equal(r.finish().exact, false); }
    finally { f.source.dispose(); r.target.dispose(); }
  });
}

test('missing policy helper and incomplete old descriptors fall back honestly', async () => {
  const f = await fixture();
  try {
    const target = await createSg02DynamicBodyOwner({ publishTelemetry: false });
    try {
      assert.equal(target.adoptWorldSnapshot(f.payload, clone(f.entities)), false,
        'omitting the semantic options cannot bypass policy attestation');
    } finally { target.dispose(); }
    for (const key of [null, 'break', 'spring', 'forceScale', 'reelRevision', 'springState']) {
      const copy = { ...f, payload: clone(f.payload) };
      if (key) delete copy.payload.attachments.line[key];
      const r = await restore(copy, { helper: key !== null });
      try { assert.equal(r.finish().exact, false, key || 'no helper'); }
      finally { r.target.dispose(); }
    }
  } finally { f.source.dispose(); }
});

test('policy defaults use runtime normalization while absent or nonfinite lengths cannot certify a native line', async () => {
  const f = await fixture();
  try {
    const current = context(clone(f.entities), clone(f.semantic), clone(f.def));
    const target = await createSg02DynamicBodyOwner({ publishTelemetry: false });
    const resolved = current.service.physicsContract('line');
    try {
      assert.equal(target.adoptWorldSnapshot(f.payload, current.state.entityList, {
        attachments: current.state.combat.attachments.byId,
        resolveAttachmentContract: () => ({ ...resolved, forceScale: NaN,
          spring: { ...resolved.spring, K: NaN, zeta: NaN } }),
      }), true, 'invalid optional inputs normalize just as createAttachment does');
      for (const restLength of [NaN, Infinity, -1, undefined]) {
        assert.equal(target.adoptWorldSnapshot(f.payload, current.state.entityList, {
          attachments: current.state.combat.attachments.byId,
          resolveAttachmentContract: () => ({ ...resolved, restLength }),
        }), false);
      }
    } finally { target.dispose(); }
  } finally { f.source.dispose(); }
});

test('policy rebasing inspects a frozen legacy standard policy without writing into it', async () => {
  const f = await fixture('tether_standard');
  try {
    f.semantic.tetherPolicy = freeze({ strengthRevision: 0,
      break: { maxTension: 1050000, maxImpulse: 19000, maxYank: 15000 }, maxLength: 390 });
    freeze(f.semantic);
    const before = clone(f.semantic);
    const policy = f.service.physicsContract('line');
    assert.equal(policy.break.maxTension, f.def.break.maxTension);
    assert.deepEqual(f.semantic, before);
  } finally { f.source.dispose(); }
});

for (const changed of [false, true]) {
  test(`actual Save and combat owners ${changed ? 'rebuild changed' : 'retain unchanged'} active tether policy`, async () => {
    const sim = createSimulation({ seed: 47, systems: [physics, combat, save] });
    sim.state.mode = 'flight';
    const player = sim.spawn({ ...actor(1, 0), hull: 100, hullMax: 100, flags: { persistent: true } });
    const target = sim.spawn({ ...actor(2, 60), hull: 100, hullMax: 100, flags: { persistent: true } });
    sim.state.playerId = player.id;
    const system = sim.registry.get('physics'), saver = sim.registry.get('save');
    try {
      assert.equal(await system.prepareBackend(sim.state), true);
      const result = sim.registry.get('combat').kernel.attachments.create({
        defId: 'tether_standard', ownerId: player.id, targetId: target.id,
      });
      assert.equal(result.ok, true);
      const id = result.attachment.id, envelope = saver.serialize('active-tether');
      if (changed) {
        envelope.data.combat.attachments.byId[id].reelRevision = 1;
        envelope.data.combat.attachments.byId[id].physicsSpringState = { reelSlip: true };
        // Exercise authoritative semantic migration, not checksum rejection.
        delete envelope.checksum;
      }
      assert.equal(saver.loadEnvelope(envelope, 'active-tether'), true);
      assert.equal(sim.state.physicsRuntime.nativeRestore.exact, !changed);
      if (changed) {
        assert.equal(system._sg02.attachments.size, 0);
        const semantic = sim.state.combat.attachments.byId[id];
        assert.equal(semantic.reelRevision, 1);
        assert.equal(semantic.physicsSpringState.reelSlip, true);
        system._reconcileCombatPhysicsBeforeStep();
        assert.equal(system._sg02.attachments.get(id).reelRevision, 1);
        assert.equal(system._sg02.attachments.get(id).springState.reelSlip, true);
      } else {
        assert.equal(system._sg02.attachments.size, 1);
      }
    } finally { sim.dispose(); }
  });
}
