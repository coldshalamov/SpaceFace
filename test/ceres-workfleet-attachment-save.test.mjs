import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createGameState } from '../src/core/gameState.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { serializeCombatState, restoreCombatState, hasPendingCeresWorkfleetAttachments,
  resumeCeresWorkfleetAttachments } from '../src/combat/persistence.js';
import { CERES_WORKFLEET_CONTRACT as C, ceresWorkfleetPoint } from '../src/data/ceresWorkfleet.js';
import { ceresWorkfleetHardwareSpec } from '../src/data/ceresWorkfleetHardware.js';
import { captureEntityRecord, spawnSpecFromRecord } from '../src/world/worldRecords.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { world } from '../src/systems/world.js';
import { save } from '../src/save/saveSystem.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import { bindStuntEvidence, journalFor } from '../src/combat/stuntEvidence.js';

const DT = 1 / 60;
const clone = value => JSON.parse(JSON.stringify(value));
const attachmentIds = state => Object.keys(state.combat.attachments.byId).sort();
const finiteBodies = state => [...state.entities.values()].filter(e => e.alive
  && Object.values(C.identities).includes(e.data?.worldRecordId));

async function sourceFixture({ withStunts = false, withJobs = false } = {}) {
  const state = createGameState(47);
  state.mode = 'flight'; state.world.currentSectorId = C.sectorId;
  const sim = createSimulation({ state, seed: 47, systems: [world, asteroidSites, ...(withStunts ? [stuntGrammar] : []), ...(withJobs ? [npcJobsRuntime] : [])] });
  const sites = sim.registry.get('asteroidSites');
  sites._syncWorldSites();
  // The actual finite section is released by the ordinary player beam producer.
  for (const [componentId, verb, amount, requestSequence] of [
    ['long_plate_clamp', 'repair', 24, 1], ['long_plate', 'cut', 54, 2], ['long_plate_clamp', 'cut', 18, 3],
  ]) assert.equal(sites.applyWorldSiteBeamOperation({ siteId: C.siteId, componentId, verb, amount,
    requestStreamId: 'player-industrial-beam', requestSequence }).ok, true);
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 6, mass: 100, hull: 100 });
  state.playerId = player.id;
  const breaker = sim.spawn(ceresWorkfleetHardwareSpec('breaker'));
  const head = sim.spawn(ceresWorkfleetHardwareSpec('cutterHead'));
  const cradle = sim.spawn(ceresWorkfleetHardwareSpec('cradle'));
  const section = state.entityList.find(e => e.alive && e.data?.worldRecordId === C.identities.payload);
  assert.ok(section.physicsBody.dynamic, 'real released site body');
  ensureCombatState(state);
  if(withJobs)reconcileCeresWorkfleetPresentation({state});
  const physics = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  physics.syncFromEntities([breaker, head, cradle, section]);
  const service = createAttachmentService({ state, catalog: createCombatCatalog(), helpers: { combatPhysics: physics }, bus: sim.bus });
  const attach = (defId, owner, role, sourceSocketId, target, targetRole, targetSocketId) => {
    const socket = (e, r, id) => ceresWorkfleetPoint({ ...e.pos, rot: e.rot },
      r === 'section' ? C.existing.section.sockets[id] : C.assets[r].sockets[id]);
    const result = service.create({ defId, ownerId: owner.id, targetId: target.id, sourceSocketId,
      targetSocketId: targetRole === 'section' ? 'socket_tether_anchor' : targetSocketId,
      sourceWorld: socket(owner, role, sourceSocketId), targetWorld: socket(target, targetRole, targetSocketId),
      controlMode: 'ceres_workfleet' });
    assert.equal(result.ok, true, result.reason);
    return result.attachment;
  };
  const mount = attach('attachment_transport_clamp', head, 'cutterHead', 'SOCKET_Mount', breaker, 'breaker', 'SOCKET_Cutter_Dock');
  const tow = attach('tether_standard', breaker, 'breaker', 'SOCKET_Tether_Massline', section, 'section', 'SOCKET_Cut_A');
  // Earn spring capture/extension through the native owner, without a release impulse.
  assert.equal(service.reel(tow.id, -1).ok, true);
  for (let i = 0; i < 3; i++) { state.tick++; physics.step(DT); service.updateTelemetryAndBreak(); }
  const receiver = attach('attachment_transport_clamp', cradle, 'cradle', 'SOCKET_Service_Head', section, 'section', 'SOCKET_Cut_B');
  service.updateTelemetryAndBreak();
  state.world.records ||= { byId: {}, order: [] };
  for (const entity of [breaker, head, cradle]) {
    const record = captureEntityRecord(entity, { sectorId: C.sectorId, tick: state.tick });
    state.world.records.byId[record.recordId] = record;
  }
  const siteSave = sites.serialize();
  const payload = serializeCombatState(state);
  return { state, sim, sites, siteSave, physics, service, payload, breaker, head, cradle, section,
    mount, tow, receiver, close() { sim.registry.get('stuntGrammar')?.destroy(); physics.dispose(); sim.dispose(); } };
}

function restoredFixture(source, { delaySection = false } = {}) {
  const state = createGameState(47); state.mode = 'flight'; state.world.currentSectorId = C.sectorId;
  state.nextEntityId = 700;
  state.world.records = clone(source.state.world.records);
  const sim = createSimulation({ state, seed: 47, systems: [asteroidSites] });
  const sites = sim.registry.get('asteroidSites'); sites.deserialize(source.siteSave);
  for (const record of Object.values(state.world.records.byId)) sim.spawn(spawnSpecFromRecord(record));
  if (!delaySection) sites._syncWorldSites();
  const saver = Object.assign(Object.create(save), { state, bus: sim.bus, _restoreSequence: 1, _runEpoch: 1 });
  saver._restoreCombat(source.payload, new Map());
  saver._resumeCeresAttachmentRestore();
  return { state, sim, sites, saver, close() { saver.destroy(); sim.dispose(); } };
}

test('native physical custody saves exact typed refs and restores measured bodies and earned spring state without generic duplicates', async () => {
  const source = await sourceFixture(); const h = restoredFixture(source);
  const physics = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    assert.equal(Object.keys(source.payload.attachments.byId).length, 3);
    const savedTow = source.payload.attachments.byId[source.tow.id];
    assert.deepEqual(savedTow.ownerRef, { kind: 'worldRecord', recordId: C.identities.worker });
    assert.deepEqual(savedTow.targetRef, { kind: 'worldSite', siteId: C.siteId,
      payloadId: 'long_plate', worldObjectId: C.identities.payload });
    assert.equal(savedTow.ownerId, undefined); assert.equal(savedTow.physicsHandle, undefined);
    const generic = Object.assign(Object.create(save), { state: source.state })._serializeEntities();
    assert.equal(generic.persistent.some(e => Object.values(C.identities).includes(e.data?.worldRecordId)), false);
    assert.equal(finiteBodies(h.state).length, 4);
    assert.equal(hasPendingCeresWorkfleetAttachments(h.state), false);
    for (const before of finiteBodies(source.state)) {
      const after = finiteBodies(h.state).find(e => e.data.worldRecordId === before.data.worldRecordId);
      assert.notEqual(after.id, before.id);
      assert.deepEqual({ x: after.pos.x, z: after.pos.z }, { x: before.pos.x, z: before.pos.z });
      assert.deepEqual({ x: after.vel.x, z: after.vel.z }, { x: before.vel.x, z: before.vel.z });
      assert.equal(after.rot, before.rot || 0); assert.equal(after.angVel, before.angVel || 0);
    }
    const service = createAttachmentService({ state: h.state, catalog: createCombatCatalog(),
      helpers: { combatPhysics: physics }, bus: h.sim.bus });
    // Semantic custody exists while GPU/native admission is cold; the normal owner retries.
    assert.deepEqual(service.reconcilePhysics(), { recreated: 0, pending: 3 });
    assert.deepEqual(serializeCombatState(h.state).attachments.byId, source.payload.attachments.byId);
    physics.syncFromEntities(finiteBodies(h.state));
    assert.deepEqual(service.reconcilePhysics(), { recreated: 3, pending: 0 });
    assert.deepEqual(service.reconcilePhysics(), { recreated: 0, pending: 0 });
    for (const id of attachmentIds(h.state)) {
      const attachment = h.state.combat.attachments.byId[id], saved = source.payload.attachments.byId[id];
      assert.equal(attachment.restLength, saved.restLength);
      assert.deepEqual(attachment.sourceAnchorLocal, saved.sourceAnchorLocal);
      assert.deepEqual(attachment.targetAnchorLocal, saved.targetAnchorLocal);
      assert.deepEqual(attachment.physicsSpringState, saved.physicsSpringState);
      assert.deepEqual(physics.attachments.get(id).springState, saved.physicsSpringState);
    }
    assert.equal(physics.attachments.size, 3);
    assert.ok(savedTow.physicsSpringState.captureT > 0, 'native earned capture time persisted');
    assert.ok(savedTow.physicsSpringState.lastStoredEnergy > 0, 'native earned extension persisted');
    const mount = service.get(source.mount.id);
    const initialDistance = physics.getAttachmentTelemetry({ attachmentId: mount.id }).distance;
    assert.ok(initialDistance > 0, 'earned microscopic mount displacement exposes zero-length fallback bugs');
    for (const length of [undefined, null, NaN, Infinity, -1, 0, 3]) {
      physics.cutAttachment({ attachmentId: mount.id });
      mount.physicsHandle = null; mount.restLength = length;
      assert.equal(service.reconcilePhysics().recreated, 1);
      assert.equal(mount.restLength, Number.isFinite(length) && length >= 0 ? length : initialDistance);
    }
  } finally { physics.dispose(); h.close(); source.close(); }
});

test('delayed world-site materialization binds once, preserves pending re-saves, and never resets unrelated combat/actions', async () => {
  const source = await sourceFixture(); const h = restoredFixture(source, { delaySection: true });
  try {
    assert.equal(hasPendingCeresWorkfleetAttachments(h.state, source.tow.id), true);
    assert.equal(hasPendingCeresWorkfleetAttachments(h.state, source.mount.id), false);
    const combat = h.state.combat;
    combat.entities.sentinel = { health: 23 };
    combat.actions.requests.push({ sentinel: 'unrelated request' });
    const actions = combat.actions;
    for (let i = 0; i < 3; i++) assert.deepEqual(serializeCombatState(h.state).attachments.byId, source.payload.attachments.byId);
    source.payload.attachments.byId[source.tow.id].restLength = 9999;
    assert.notEqual(serializeCombatState(h.state).attachments.byId[source.tow.id].restLength, 9999, 'detached clone');
    h.sites._syncWorldSites(); h.sim.bus.emit('save:loaded'); h.sim.bus.emit('save:loaded');
    assert.equal(hasPendingCeresWorkfleetAttachments(h.state), false);
    assert.equal(attachmentIds(h.state).length, 3); assert.equal(finiteBodies(h.state).length, 4);
    assert.equal(h.state.combat, combat); assert.equal(h.state.combat.actions, actions);
    assert.deepEqual(combat.entities.sentinel, { health: 23 });
    assert.deepEqual(combat.actions.requests, [{ sentinel: 'unrelated request' }]);
  } finally { h.close(); source.close(); }
});

test('invalid ownership, lost/reused lives, duplicate bodies, interrupted jobs and newly claimed custody fail closed', async () => {
  const source = await sourceFixture();
  try {
    const mutations = [
      h => { h.state.world.records.byId[C.identities.worker].alive = false; },
      h => { h.state.world.records.byId[C.identities.worker].playerOwned = true; },
      h => { h.state.world.records.byId[C.identities.worker].outcome = 'defeated'; },
      h => { h.state.world.records.byId[C.identities.worker].recordId = 'ordinary:record'; },
      h => { h.state.world.records.byId[C.identities.worker] = clone(h.state.world.records.byId[C.identities.cradle]); },
      h => { h.state.sites.worldById[C.siteId].payloads.long_plate.destroyed = true; },
      h => { h.state.sites.worldById[C.siteId].payloads.long_plate.status = 'settled'; },
      h => { h.state.npcJobs = { ceresWorkfleet: { phase: 'player-retained' } }; },
      h => { finiteBodies(h.state).find(e => e.data.worldRecordId === C.identities.worker).data.playerOwned = true; },
      h => { finiteBodies(h.state).find(e => e.data.worldRecordId === C.identities.worker).occupantGeneration++; },
      h => {
        const prior = finiteBodies(h.state).find(e => e.data.worldRecordId === C.identities.worker);
        h.sim.helpers.removeEntity(prior.id, { immediate: true });
        h.sim.spawn({ ...ceresWorkfleetHardwareSpec('breaker'), id: prior.id });
      },
      h => { h.sim.spawn(ceresWorkfleetHardwareSpec('breaker')); },
    ];
    for (const mutate of mutations) {
      const h = restoredFixture(source, { delaySection: true });
      try {
        mutate(h);
        assert.equal(serializeCombatState(h.state).attachments.byId[source.tow.id], undefined, 'invalid parked custody is not re-saved');
        h.saver._resumeCeresAttachmentRestore(); h.sites._syncWorldSites(); h.sim.bus.emit('save:loaded');
        assert.equal(hasPendingCeresWorkfleetAttachments(h.state, source.tow.id), false);
        assert.equal(h.state.combat.attachments.byId[source.tow.id], undefined);
        assert.equal(serializeCombatState(h.state).attachments.byId[source.tow.id], undefined);
      } finally { h.close(); }
    }
    const h = restoredFixture(source, { delaySection: true });
    try {
      const worker = finiteBodies(h.state).find(e => e.data.worldRecordId === C.identities.worker);
      h.state.combat.attachments.byId.player_claim = { id: 'player_claim', state: 'active', ownerId: 900, targetId: worker.id };
      h.sites._syncWorldSites(); h.sim.bus.emit('save:loaded');
      assert.equal(h.state.combat.attachments.byId[source.tow.id], undefined);
      assert.equal(hasPendingCeresWorkfleetAttachments(h.state), false);
    } finally { h.close(); }
  } finally { source.close(); }
});

test('only exact typed Ceres refs are admissible; ordinary/persistent and wrong-namespace refs cannot impersonate custody', async () => {
  const source = await sourceFixture();
  try {
    const valid = source.payload.attachments.byId[source.tow.id];
    for (const mutate of [
      row => { row.ownerRef = { kind: 'worldRecord', recordId: C.identities.payload }; },
      row => { row.targetRef = { kind: 'worldSite', siteId: 'other', payloadId: 'long_plate', worldObjectId: C.identities.payload }; },
      row => { row.ownerRef = { kind: 'persistent', saveId: '42' }; },
      row => { row.ownerRef = { kind: 'persistent', saveId: '42' }; row.targetRef = { kind: 'persistent', saveId: '43' }; },
      row => { row.targetRef = { kind: 'worldRecord', recordId: 'ordinary:body' }; },
      row => { row.ownerRef.kind = 'worldSite'; },
      row => { row.controllerRef = { kind: 'player' }; },
      row => { row.id = 'att_999999'; },
      row => { row.sourceAnchorLocal = null; },
      row => { row.sourceSocketId = 'ordinary_socket'; },
    ]) {
      const row = clone(valid); mutate(row);
      const state = createGameState(47);
      const summary = restoreCombatState(state, { attachments: { byId: { [valid.id]: row } } },
        ref => ref?.saveId === '42' ? 42 : 43);
      assert.equal(summary.dropped, 1); assert.deepEqual(attachmentIds(state), []);
      assert.equal(hasPendingCeresWorkfleetAttachments(state), false);
    }
  } finally { source.close(); }
});

test('duplicate saved source sockets cannot create a second industrial joint', async () => {
  const source = await sourceFixture();
  try {
    const duplicate = clone(source.payload.attachments.byId[source.tow.id]);
    duplicate.id = 'att_999999'; source.payload.attachments.byId[duplicate.id] = duplicate;
    const h = restoredFixture(source);
    try {
      assert.equal(attachmentIds(h.state).length, 3);
      assert.equal(h.state.combat.attachments.byId[duplicate.id], undefined);
      assert.equal(hasPendingCeresWorkfleetAttachments(h.state), false);
    } finally { h.close(); }
  } finally { source.close(); }
});

test('New Game, replacement restore and disposal cancel old callbacks even when entity numbers recur', async () => {
  const source = await sourceFixture();
  try {
    for (const mode of ['newGame', 'restore', 'dispose']) {
      const h = restoredFixture(source, { delaySection: true });
      try {
        const oldCallback = h.saver._ceresAttachmentRestore.resume;
        const oldCombat = h.state.combat;
        if (mode === 'newGame') h.saver._beginRunEpoch('game:new');
        if (mode === 'restore') {
          h.saver._beginRestoreSequence(); h.saver._restoreCombat(source.payload, new Map());
          const fresh = h.state.combat;
          h.sites._syncWorldSites(); oldCallback();
          assert.equal(attachmentIds(h.state).length, 0, 'old callback cannot arm replacement before owners restore');
          h.saver._resumeCeresAttachmentRestore();
          assert.equal(h.state.combat, fresh); assert.equal(attachmentIds(h.state).length, 3);
        } else {
          if (mode === 'dispose') h.saver.destroy();
          h.sites._syncWorldSites(); oldCallback(); h.sim.bus.emit('save:loaded');
          assert.equal(h.state.combat, oldCombat); assert.deepEqual(attachmentIds(h.state), [source.mount.id]);
        }
        assert.equal(hasPendingCeresWorkfleetAttachments(h.state), false);
      } finally { h.close(); }
    }
  } finally { source.close(); }
});

test('real save restore ordering restores incoming world/site owners and rebinds three joints without duplicate bodies', async () => {
  const source = await sourceFixture();
  const destination = createSimulation({ seed: 47, systems: [world, asteroidSites, save] });
  try {
    const sourceSaver = Object.assign(Object.create(save), { state: source.state, bus: source.sim.bus,
      helpers: source.sim.helpers, registry: source.sim.registry });
    const data = sourceSaver.serializeData();
    const saver = destination.registry.get('save');
    const result = saver._restore(clone(data), 'quick');
    assert.equal(result.restored, true);
    assert.equal(hasPendingCeresWorkfleetAttachments(destination.state), false);
    assert.equal(finiteBodies(destination.state).length, 4);
    assert.deepEqual(serializeCombatState(destination.state).attachments.byId, data.combat.attachments.byId);
    assert.equal(saver._serializeEntities().persistent.some(e => Object.values(C.identities).includes(e.data?.worldRecordId)), false);
    const outgoing = finiteBodies(destination.state);
    assert.equal(saver._restore(clone(data), 'quick').restored, true);
    const incoming = finiteBodies(destination.state);
    assert.equal(incoming.length, 4);
    for (const prior of outgoing) {
      const fresh = incoming.find(e => e.data.worldRecordId === prior.data.worldRecordId);
      assert.equal(fresh.id, prior.id, 'same restore allocator numbers are genuinely reused');
      assert.notEqual(fresh, prior); assert.notEqual(fresh.occupantGeneration, prior.occupantGeneration);
      assert.equal(prior.alive, false);
    }
    for (const attachment of Object.values(destination.state.combat.attachments.byId)) {
      assert.ok(incoming.includes(destination.state.entities.get(attachment.ownerId)));
      assert.ok(incoming.includes(destination.state.entities.get(attachment.targetId)));
    }
    assert.deepEqual(serializeCombatState(destination.state).attachments.byId, data.combat.attachments.byId);
  } finally { destination.registry.get('save').destroy(); destination.dispose(); source.close(); }
});

test('durable claims and defeated tombstones outrank missing or unclaimed live bodies through actual Continue', async () => {
  const source = await sourceFixture();
  try {
    const sourceSaver = Object.assign(Object.create(save), { state: source.state, bus: source.sim.bus,
      helpers: source.sim.helpers, registry: source.sim.registry });
    const saved = sourceSaver.serializeData();
    for (const change of ['claimed', 'defeated']) {
      const data = clone(saved), record = data.world.records.byId[C.identities.worker];
      if (change === 'claimed') record.playerOwned = true;
      else record.outcome = 'defeated';
      const destination = createSimulation({ seed: 47, systems: [world, asteroidSites, save] });
      try {
        const saver = destination.registry.get('save');
        assert.equal(saver._restore(data, 'quick').restored, true);
        assert.equal(hasPendingCeresWorkfleetAttachments(destination.state, source.tow.id), false, change);
        assert.equal(destination.state.combat.attachments.byId[source.tow.id], undefined, change);
        assert.equal(serializeCombatState(destination.state).attachments.byId[source.tow.id], undefined, change);
        if (change === 'defeated') {
          destination.spawn(ceresWorkfleetHardwareSpec('breaker'));
          destination.bus.emit('save:loaded');
          assert.equal(destination.state.combat.attachments.byId[source.tow.id], undefined,
            'a later same-identity body cannot resurrect defeated custody');
        }
      } finally { destination.registry.get('save').destroy(); destination.dispose(); }
    }
  } finally { source.close(); }
});

test('deferred custody rejects explicit foreign live persistence owners before materialization and re-save', async () => {
  const source = await sourceFixture();
  try {
    const h = restoredFixture(source, { delaySection: true });
    try {
      finiteBodies(h.state).find(e => e.data.worldRecordId === C.identities.worker).data.persistenceOwner = 'unrelatedOwner';
      assert.equal(serializeCombatState(h.state).attachments.byId[source.tow.id], undefined);
      h.sites._syncWorldSites(); h.sim.bus.emit('save:loaded');
      assert.equal(h.state.combat.attachments.byId[source.tow.id], undefined);
      assert.equal(hasPendingCeresWorkfleetAttachments(h.state, source.tow.id), false);
    } finally { h.close(); }
  } finally { source.close(); }
});


test('native player impulse evidence keeps the finite body owner and the same earned root through actual Continue', async () => {
  const source = await sourceFixture({ withStunts: true });
  const destination = createSimulation({ seed: 47, systems: [world, asteroidSites, stuntGrammar, save] });
  try {
    bindStuntEvidence(source.state);
    for (const entity of [source.breaker, source.section]) {
      assert.equal(source.physics.applyImpulse({ entityId: entity.id, impulse: { x: entity.mass * 2, z: 0 },
        provenance: { actorId: source.state.playerId }, tick: source.state.tick, reason: 'impulse' }), true);
    }
    const sourceSaver = Object.assign(Object.create(save), { state: source.state, bus: source.sim.bus,
      helpers: source.sim.helpers, registry: source.sim.registry });
    const data = sourceSaver.serializeData();
    assert.equal(data.stunts.evidence.roots.length, 2, 'native impulses earned the actual observer roots');
    assert.equal(data.entities.persistent.some(e => Object.values(C.identities).includes(e.data?.worldRecordId)), false,
      'stunt references must not enroll finite owner bodies in generic persistence');
    const saver = destination.registry.get('save');
    assert.equal(saver._restore(clone(data), 'quick').restored, true);
    assert.equal(finiteBodies(destination.state).length, 4);
    assert.equal(finiteBodies(destination.state).some(e => e.flags.persistent), false);
    const journal = journalFor(destination.state);
    assert.deepEqual([...journal.roots.keys()].sort(), data.stunts.evidence.roots.map(([id]) => id).sort());
    for (const [id, root] of journal.roots) {
      const prior = data.stunts.evidence.roots.find(([key]) => key === id)[1];
      const savedLife = data.stunts.evidence.lives.find(([, life]) => life.id === prior.sourceLife)[1];
      const entity = destination.state.entities.get(root.sourceId);
      assert.ok(entity && finiteBodies(destination.state).includes(entity));
      assert.equal(journal.lives.get(`number:${entity.id}`).id, savedLife.id);
    }
    assert.equal(saver.serializeData().entities.persistent.some(e => Object.values(C.identities).includes(e.data?.worldRecordId)), false);
  } finally { destination.registry.get('save').destroy(); destination.registry.get('stuntGrammar').destroy(); destination.dispose(); source.close(); }
});

test('a delayed finite stunt body survives repeated pending saves and resumes without replacing unrelated live progress', async () => {
  const source = await sourceFixture({ withStunts: true });
  const destination = createSimulation({ seed: 47, systems: [world, asteroidSites, stuntGrammar, save] });
  try {
    bindStuntEvidence(source.state);
    assert.equal(source.physics.applyImpulse({ entityId: source.section.id, impulse: { x: 3600, z: 0 },
      provenance: { actorId: source.state.playerId }, tick: source.state.tick, reason: 'impulse' }), true);
    const sourceSaver = Object.assign(Object.create(save), { state: source.state, bus: source.sim.bus,
      helpers: source.sim.helpers, registry: source.sim.registry });
    const data = sourceSaver.serializeData(), rootId = data.stunts.evidence.roots[0][0];
    const saver = destination.registry.get('save'), sites = destination.registry.get('asteroidSites');
    const materialize = sites._syncWorldSites;
    sites._syncWorldSites = () => {};
    assert.equal(saver._restore(clone(data), 'quick').restored, true);
    destination.state.stunts.totalTricksDetected = 19;
    const liveStunts = destination.state.stunts, snapshots = [];
    for (let i = 0; i < 3; i++) {
      const pending = saver.serializeData();
      assert.ok(pending.stunts.evidence.roots.some(([id]) => id === rootId), 'unmaterialized earned root stays in the save');
      assert.equal(pending.entities.persistent.some(e => Object.values(C.identities).includes(e.data?.worldRecordId)), false);
      assert.equal(pending.entities.ceresWorkfleetRefs.length, 4);
      snapshots.push({ data: pending, text: JSON.stringify(pending) });
    }
    const ordinary = destination.spawn({ type: 'ship', team: 1, pos: { x: 40, z: 50 }, radius: 2, mass: 20, hull: 30 });
    const { observeAppliedImpulse } = await import('../src/combat/stuntEvidence.js');
    observeAppliedImpulse(ordinary, { x: 0, z: 0 }, { x: 1, z: 0 },
      { actorId: destination.state.playerId }, destination.state.tick, 'impulse', destination.state);
    for (let i = 0; i < 40; i++) {
      const extra = destination.spawn({ type: 'ship', team: 1, pos: { x: 200 + i, z: 50 }, radius: 2, mass: 20, hull: 30 });
      observeAppliedImpulse(extra, { x: 0, z: 0 }, { x: 1, z: 0 },
        { actorId: destination.state.playerId }, destination.state.tick, 'impulse', destination.state);
    }
    assert.equal(journalFor(destination.state).roots.size, 31, 'the pending earned root retains its bounded slot');
    const unrelatedRoots = [...journalFor(destination.state).roots.keys()];
    sites._syncWorldSites = materialize; sites._syncWorldSites();
    assert.equal(destination.state.stunts, liveStunts);
    assert.equal(destination.state.stunts.totalTricksDetected, 19);
    assert.ok(journalFor(destination.state).roots.has(rootId));
    for (const id of unrelatedRoots) assert.ok(journalFor(destination.state).roots.has(id));
    for (const snapshot of snapshots) assert.equal(JSON.stringify(snapshot.data), snapshot.text, 'returned pending saves are detached');
    assert.equal(finiteBodies(destination.state).length, 4);
  } finally { destination.registry.get('save').destroy(); destination.registry.get('stuntGrammar').destroy(); destination.dispose(); source.close(); }
});

test('a measured projectile reflection keeps its pending Ceres surface life and remaps it without replaying live shots', async () => {
  const source = await sourceFixture({ withStunts: true });
  const destination = createSimulation({ seed: 47, systems: [world, asteroidSites, stuntGrammar, save] });
  try {
    const { sampleProjectileEvidence, observeProjectileEmission, observeProjectileReflection } = await import('../src/combat/stuntProjectileEvidence.js');
    const { surfaceContactFromBodies, reflectVelocity, applyReflectedVelocity } = await import('../src/core/surfaceContact.js');
    const { sweepCollisionProxyInto } = await import('../src/core/collisionProxySweep.js');
    const { resolveCollisionProxyManifest } = await import('../src/data/collisionProxyManifests.js');
    bindStuntEvidence(source.state);
    const player = source.state.entities.get(source.state.playerId);
    source.physics.syncFromEntities([...finiteBodies(source.state), player]);
    const step = count => { for (let i = 0; i < count; i++) {
      source.state.tick++; source.state.simTime = source.state.tick * DT;
      sampleProjectileEvidence(source.state, source.sim.bus); source.physics.step(DT);
    } };
    source.physics.applyImpulse({ entityId: player.id, impulse: { x: player.mass * 60, z: 0 },
      provenance: { actorId: player.id }, tick: source.state.tick, reason: 'flight' }); step(20);
    source.physics.applyImpulse({ entityId: player.id, impulse: { x: -player.mass * 60, z: player.mass * 60 },
      provenance: { actorId: player.id }, tick: source.state.tick, reason: 'flight' }); step(20);
    const from = { x: source.section.pos.x - 150, z: source.section.pos.z },
      to = { x: source.section.pos.x + 150, z: source.section.pos.z };
    const projectile = source.sim.spawn({ type: 'projectile', team: 0, ownerId: player.id, pos: from,
      vel: { x: 300, z: 0 }, radius: .1, mass: 1, hull: 1, ttl: 8 });
    const shot = observeProjectileEmission(source.state, projectile, player);
    assert.ok(shot.flight, 'the actual native flight history earns the bank setup');
    const hit = {};
    assert.equal(sweepCollisionProxyInto(hit, source.section, resolveCollisionProxyManifest(source.section), from, to, projectile.radius), true);
    const receipt = surfaceContactFromBodies(projectile, source.section,
      { point: { x: hit.x, z: hit.z }, normal: { x: hit.nx, z: hit.nz }, material: 'reflective' }, source.state.tick);
    const reflected = reflectVelocity(projectile.vel, receipt.normal);
    applyReflectedVelocity(projectile, reflected);
    assert.ok(observeProjectileReflection(source.state, projectile, source.section, receipt, reflected, reflected));
    const sourceSaver = Object.assign(Object.create(save), { state: source.state, bus: source.sim.bus,
      helpers: source.sim.helpers, registry: source.sim.registry });
    const data = sourceSaver.serializeData();
    const savedShot = data.stunts.projectiles.shots[shot.lifeId], surfaceLife = savedShot.reflections[0].surfaceLife;
    assert.equal(data.entities.persistent.some(e => e.data?.worldRecordId === C.identities.payload), false);
    const saver = destination.registry.get('save'), sites = destination.registry.get('asteroidSites'), materialize = sites._syncWorldSites;
    sites._syncWorldSites = () => {};
    assert.equal(saver._restore(clone(data), 'quick').restored, true);
    const liveShot = journalFor(destination.state).projectiles.shots[shot.lifeId];
    assert.ok(liveShot);
    liveShot.reviewProgress = 19;
    assert.match(String(liveShot.reflections[0].surfaceId), /^ceres-ref:/);
    assert.ok(saver.serializeData().stunts.evidence.lives.some(([, life]) => life.id === surfaceLife));
    sites._syncWorldSites = materialize; sites._syncWorldSites();
    const section = finiteBodies(destination.state).find(e => e.data.worldRecordId === C.identities.payload);
    assert.equal(journalFor(destination.state).projectiles.shots[shot.lifeId], liveShot);
    assert.equal(liveShot.reviewProgress, 19);
    assert.equal(liveShot.reflections[0].surfaceId, section.id);
    assert.equal(journalFor(destination.state).lives.get(`number:${section.id}`).id, surfaceLife);
  } finally { destination.registry.get('save').destroy(); destination.registry.get('stuntGrammar').destroy(); destination.dispose(); source.close(); }
});


test('pending stunt references round-trip and terminate on a newer run, disposal, terminal source or expired proof', async () => {
  const source = await sourceFixture({ withStunts: true });
  try {
    bindStuntEvidence(source.state);
    source.physics.applyImpulse({ entityId: source.section.id, impulse: { x: 3600, z: 0 },
      provenance: { actorId: source.state.playerId }, tick: source.state.tick, reason: 'impulse' });
    const sourceSaver = Object.assign(Object.create(save), { state: source.state, bus: source.sim.bus,
      helpers: source.sim.helpers, registry: source.sim.registry });
    const data = sourceSaver.serializeData(), rootId = data.stunts.evidence.roots[0][0];
    for (const mode of ['roundtrip', 'newGame', 'dispose', 'terminal', 'expired']) {
      const destination = createSimulation({ seed: 47, systems: [world, asteroidSites, stuntGrammar, save] });
      try {
        const saver = destination.registry.get('save'), sites = destination.registry.get('asteroidSites'), materialize = sites._syncWorldSites;
        sites._syncWorldSites = () => {};
        assert.equal(saver._restore(clone(data), 'quick').restored, true);
        const oldCallback = saver._ceresEntityReferenceRestore.resume;
        const pendingSave = saver.serializeData();
        assert.ok(pendingSave.stunts.evidence.roots.some(([id]) => id === rootId));
        if (mode === 'roundtrip') assert.equal(saver._restore(clone(pendingSave), 'quick').restored, true);
        if (mode === 'newGame') saver._beginRunEpoch('game:new');
        if (mode === 'dispose') saver.destroy();
        if (mode === 'terminal') {
          destination.state.sites.worldById[C.siteId].payloads.long_plate.destroyed = true;
          saver._resumeCeresEntityReferences();
        }
        if (mode === 'expired') destination.state.tick += 481;
        sites._syncWorldSites = materialize; sites._syncWorldSites(); oldCallback();
        assert.equal(journalFor(destination.state).roots.has(rootId), mode === 'roundtrip', mode);
        if (mode !== 'roundtrip') assert.equal(destination.registry.get('stuntGrammar').serialize().evidence.roots.some(([id]) => id === rootId), false, mode);
      } finally { destination.registry.get('save').destroy(); destination.registry.get('stuntGrammar').destroy(); destination.dispose(); }
    }
  } finally { source.close(); }
});

test('legacy generic finite snapshots are adopted as owner references and never perpetuate persistent flags', async () => {
  const source = await sourceFixture();
  const destination = createSimulation({ seed: 47, systems: [world, asteroidSites, save] });
  try {
    source.breaker.flags.persistent = true;
    const sourceSaver = Object.assign(Object.create(save), { state: source.state, bus: source.sim.bus,
      helpers: source.sim.helpers, registry: source.sim.registry });
    const data = sourceSaver.serializeData();
    assert.equal(data.combat.entities.some(row => row.entityRef?.saveId === String(source.breaker.id)), false);
    delete data.entities.ceresWorkfleetRefs;
    data.entities.persistent.push({ id: source.breaker.id,
      ...ceresWorkfleetHardwareSpec('breaker', data.world.records.byId[C.identities.worker]), flags: { persistent: true } });
    const saver = destination.registry.get('save');
    assert.equal(saver._restore(data, 'quick').restored, true);
    const breakers = finiteBodies(destination.state).filter(e => e.data.worldRecordId === C.identities.worker);
    assert.equal(breakers.length, 1); assert.notEqual(breakers[0].flags.persistent, true);
    assert.equal(saver.serializeData().entities.persistent.some(e => e.data?.worldRecordId === C.identities.worker), false);
  } finally { destination.registry.get('save').destroy(); destination.dispose(); source.close(); }
});

test('finite observer references are bounded, typed and unambiguous without overriding ordinary remaps', () => {
  const state = createGameState(47), saver = Object.assign(Object.create(save), { state, _restoreSequence: 1, _runEpoch: 1 });
  const worker = { kind: 'worldRecord', recordId: C.identities.worker }, head = { kind: 'worldRecord', recordId: C.identities.cutterHead };
  try {
    const duplicate = { saveId: '71', ref: worker }, remap = new Map([['5', 500]]);
    saver._restoreCeresEntityReferences([duplicate, clone(duplicate)], [], remap);
    assert.equal(saver._ceresEntityReferenceRestore.pending.size, 1);
    saver._cancelCeresEntityReferenceRestore();
    const invalid = new Map([['5', 500]]);
    saver._restoreCeresEntityReferences([{ saveId: '71', ref: worker }, { saveId: '71', ref: head },
      { saveId: '72', ref: { kind: 'persistent', recordId: C.identities.worker } }, { saveId: '5', ref: head }], [], invalid);
    assert.equal(saver._ceresEntityReferenceRestore, null);
    assert.match(invalid.get('71'), /^ceres-ref:rejected:/);
    assert.match(invalid.get('72'), /^ceres-ref:rejected:/);
    assert.equal(invalid.get('5'), 500);
    assert.throws(() => saver._restoreCeresEntityReferences(Array(5).fill(duplicate), [], new Map()), /invalid_ceres_reference_table/);
    saver._restoreCeresEntityReferences(undefined, [], new Map());
    assert.equal(saver._ceresEntityReferenceRestore, null);
  } finally { saver.destroy(); }
});

import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { stepCeresWorkfleet, reconcileCeresWorkfleetPresentation, CERES_WORKFLEET_JOB_ID } from '../src/systems/ceresWorkfleet.js';
import { ceresWorkfleetHostileAttachmentOwners } from '../src/combat/persistence.js';
async function hostileFixture({targetSection=false}={}) {
  const h=await sourceFixture({withJobs:true});h.service.cut(h.receiver.id,h.cradle.id,'fixture-no-receiver');
  const spec=makeEnemySpawnSpec('corsair_raider',1,{x:h.breaker.pos.x+200,z:h.breaker.pos.z});
  spec.data.ai.factionPresenceDoctrine={...spec.data.ai.factionPresenceDoctrine,firstFireAgainst:['faction_free']};
  Object.assign(spec.data.ai,{spawnContext:'encounter',combatDoctrineId:'tether_control_raider',encounterId:'fixture:earned-snare',passive:false});
  const hostile=h.sim.spawn(spec);h.physics.syncFromEntities([h.breaker,h.head,h.cradle,h.section,hostile]);
  const result=h.service.create({defId:'attachment_massline',ownerId:hostile.id,targetId:targetSection?h.section.id:h.breaker.id,
    sourceSocketId:'socket_massline',targetSocketId:targetSection?'socket_tether_anchor':'socket_hull'});assert.equal(result.ok,true,result.reason);
  h.state.npcJobs.ceresWorkfleet={id:CERES_WORKFLEET_JOB_ID,worker:C.identities.worker,head:C.identities.cutterHead,
    cradle:C.identities.cradle,section:C.identities.payload,phase:'extract',index:0,mountId:h.mount.id,towId:h.tow.id};
  const owner={state:h.state,bus:h.sim.bus,registry:{get:name=>name==='combat'?{kernel:{attachments:h.service}}:h.sim.registry.get(name)}};
  stepCeresWorkfleet(owner,DT);assert.equal(h.state.npcJobs.ceresWorkfleet.blockedReason,'foreign-custody');
  const saver=Object.assign(Object.create(save),{state:h.state,bus:h.sim.bus,helpers:h.sim.helpers,registry:h.sim.registry});
  return {...h,hostile,foreign:result.attachment,saver};
}
test('earned hostile latch survives actual Continue with both original couplings and resumes only after owner release',async()=>{
  const source=await hostileFixture(),destination=createSimulation({seed:47,systems:[world,asteroidSites,npcJobsRuntime,save]});
  const physics=await createSg02DynamicBodyOwner({publishTelemetry:false,fixedDt:DT});
  try {
    const data=source.saver.serializeData();
    assert.equal(source.hostile.flags.persistent,undefined);
    assert.ok(data.entities.persistent.some(e=>e.id===source.hostile.id),'earned hostile owner uses the existing entity-save list');
    assert.equal(data.entities.persistent.filter(e=>Object.values(C.identities).includes(e.data?.worldRecordId)).length,0);
    assert.equal(data.combat.attachments.byId[source.foreign.id].ownerRef.kind,'persistent');
    const saver=destination.registry.get('save');assert.equal(saver._restore(clone(data),'quick').restored,true);
    const state=destination.state;state.mode='flight';
    const bodies=finiteBodies(state),hostile=state.entityList.find(e=>e.alive&&e.data?.ai?.encounterId==='fixture:earned-snare');
    assert.ok(hostile);assert.notEqual(hostile,source.hostile);assert.notEqual(hostile.occupantGeneration,source.hostile.occupantGeneration);
    assert.equal(hostile.flags.persistent,undefined);assert.equal(hasPendingCeresWorkfleetAttachments(state),false);
    assert.equal(attachmentIds(state).length,3);
    reconcileCeresWorkfleetPresentation({state});physics.syncFromEntities([...bodies,hostile]);
    const service=createAttachmentService({state,catalog:createCombatCatalog(),helpers:{combatPhysics:physics},bus:destination.bus});
    assert.equal(service.reconcilePhysics().recreated,3);
    const owner={state,bus:destination.bus,registry:{get:name=>name==='combat'?{kernel:{attachments:service}}:destination.registry.get(name)}};
    stepCeresWorkfleet(owner,DT);assert.equal(state.npcJobs.ceresWorkfleet.blockedReason,'foreign-custody');
    for(const id of [source.mount.id,source.tow.id,source.foreign.id])assert.equal(service.get(id).state,'active');
    assert.equal(service.cut(source.foreign.id,hostile.id,'earned-release').ok,true);stepCeresWorkfleet(owner,DT);
    assert.equal(state.npcJobs.ceresWorkfleet.phase,'extract');assert.equal(state.npcJobs.ceresWorkfleet.blockedReason,null);
    assert.equal(service.get(source.mount.id).state,'active');assert.equal(service.get(source.tow.id).state,'active');
    assert.equal(saver._serializeEntities().persistent.some(e=>e.id===hostile.id),false,'released transient attacker does not become permanently persistent');
    const prior=hostile;assert.equal(saver._restore(clone(data),'quick').restored,true);
    const fresh=destination.state.entityList.find(e=>e.alive&&e.data?.ai?.encounterId==='fixture:earned-snare');
    assert.notEqual(fresh,prior);assert.notEqual(fresh.occupantGeneration,prior.occupantGeneration);
    assert.equal(destination.state.combat.attachments.byId[source.foreign.id].ownerId,fresh.id);
  }finally{physics.dispose();destination.registry.get('save').destroy();destination.dispose();source.close();}
});

test('temporary hostile inclusion rejects stale, claimed, ambiguous and foreign-owned actors without promoting them',async()=>{
  const source=await hostileFixture();
  try {
    const owner=source.hostile,row=source.foreign;
    assert.deepEqual([...ceresWorkfleetHostileAttachmentOwners(source.state)],[owner.id]);
    for(const [mutate,restore] of [
      [()=>owner.alive=false,()=>owner.alive=true],[()=>owner.hull=0,()=>owner.hull=owner.hullMax],
      [()=>owner.data.playerOwned=true,()=>delete owner.data.playerOwned],
      [()=>owner.data.worldRecordId='ordinary:owned-attacker',()=>delete owner.data.worldRecordId],
      [()=>owner.data.persistenceOwner='foreign',()=>delete owner.data.persistenceOwner],
      [()=>source.state.entityList.push({...owner}),()=>source.state.entityList.pop()],
      [()=>row.state='broken',()=>row.state='active'],[()=>row.sourceSocketId='bad',()=>row.sourceSocketId='socket_massline'],
      [()=>row.defId='tether_standard',()=>row.defId='attachment_massline']]) {
      mutate();assert.equal(ceresWorkfleetHostileAttachmentOwners(source.state).has(owner.id),false);
      assert.equal(source.saver._serializeEntities().persistent.some(e=>e.id===owner.id),false);restore();
    }
    owner.occupantGeneration++;assert.equal(ceresWorkfleetHostileAttachmentOwners(source.state).has(owner.id),false);
    assert.equal(serializeCombatState(source.state).attachments.byId[row.id],undefined,'same numeric source with a new life cannot inherit the incoming line');
  }finally{source.close();}
});

test('hostile incoming and workfleet pending rows survive repeated saves without accepting a replacement source life',async()=>{
  const source=await hostileFixture({targetSection:true});
  try {
    const data=source.saver.serializeData();
    for(const replaceLife of [false,true]) {
      const state=createGameState(47);state.mode='flight';state.world.currentSectorId=C.sectorId;state.nextEntityId=700;
      state.world.records=clone(source.state.world.records);
      const sim=createSimulation({state,seed:47,systems:[asteroidSites]});const sites=sim.registry.get('asteroidSites');sites.deserialize(source.sites.serialize());
      for(const record of Object.values(state.world.records.byId))sim.spawn(spawnSpecFromRecord(record));
      const actorSpec=clone(data.entities.persistent.find(e=>e.id===source.hostile.id));delete actorSpec.id;
      const actor=sim.spawn(actorSpec),saver=Object.assign(Object.create(save),{state,bus:sim.bus,helpers:sim.helpers,registry:sim.registry,_restoreSequence:1,_runEpoch:1});
      const payload=clone(data.combat);
      try {
        saver._restoreCombat(payload,new Map([[String(source.hostile.id),actor.id]]));saver._resumeCeresAttachmentRestore();
        assert.equal(hasPendingCeresWorkfleetAttachments(state,source.foreign.id),true);
        if(replaceLife)actor.occupantGeneration++;
        for(let n=0;n<3;n++) {
          const saved=serializeCombatState(state).attachments.byId;
          if(replaceLife)assert.equal(saved[source.foreign.id],undefined);
          else {assert.equal(saved[source.foreign.id].ownerRef.saveId,String(actor.id));assert.ok(saved[source.tow.id]);assert.ok(saver._serializeEntities().persistent.some(e=>e.id===actor.id));}
        }
        sites._syncWorldSites();sim.bus.emit('save:loaded');
        if(replaceLife)assert.equal(state.combat.attachments.byId[source.foreign.id],undefined);
        else {assert.equal(state.combat.attachments.byId[source.foreign.id].ownerId,actor.id);assert.equal(state.combat.attachments.byId[source.tow.id].state,'active');}
      }finally{saver.destroy();sim.dispose();}
    }
  }finally{source.close();}
});

test('player standard and weapon lines retain exact finite targets through cold native admission and repeated Continue',async()=>{
  for(const role of ['breaker','head','cradle','section'])for(const defId of ['tether_standard','attachment_massline']) {
    const source=await sourceFixture({withJobs:true});
    const destination=createSimulation({seed:47,systems:[world,asteroidSites,npcJobsRuntime,save]});
    const physics=await createSg02DynamicBodyOwner({publishTelemetry:false,fixedDt:DT});
    try {
      source.service.cut(source.receiver.id,source.cradle.id,'fixture-no-receiver');
      const target=source[role],player=source.state.entities.get(source.state.playerId);
      // Initial native admission of this fixture's player, before its first physics body exists.
      player.pos={x:target.pos.x+200,z:target.pos.z};source.physics.syncFromEntities([...finiteBodies(source.state),player]);
      const result=source.service.create({defId,ownerId:player.id,targetId:target.id,
        sourceSocketId:defId==='tether_standard'?'socket_tether_spool':'socket_massline',targetSocketId:role==='section'?'socket_tether_anchor':'socket_hull'});
      assert.equal(result.ok,true,result.reason);const lineId=result.attachment.id;
      source.state.npcJobs.ceresWorkfleet={id:CERES_WORKFLEET_JOB_ID,worker:C.identities.worker,head:C.identities.cutterHead,
        cradle:C.identities.cradle,section:C.identities.payload,phase:'player-retained',mountId:source.mount.id,towId:source.tow.id};
      if(role!=='section'){target.data.playerOwned=true;source.sim.registry.get('world').upsertWorldRecord(target);}
      const sourceSaver=Object.assign(Object.create(save),{state:source.state,bus:source.sim.bus,helpers:source.sim.helpers,registry:source.sim.registry});
      const data=sourceSaver.serializeData();assert.equal(data.combat.attachments.byId[lineId].ownerRef.kind,'player');
      const saver=destination.registry.get('save');
      for(let pass=0;pass<2;pass++) {
        assert.equal(saver._restore(clone(data),'quick').restored,true);const state=destination.state;
        const row=state.combat.attachments.byId[lineId];assert.ok(row,`${role}/${defId}`);assert.equal(row.ownerId,state.playerId);
        const fresh=state.entities.get(row.targetId);assert.equal(fresh.data.worldRecordId,target.data.worldRecordId);
        assert.equal(state.combat.attachments.byId[source.tow.id],undefined,'queued NPC custody never retakes the claimed plate');
        assert.equal(finiteBodies(state).length,4);assert.notEqual(fresh,target);
        const service=createAttachmentService({state,catalog:createCombatCatalog(),helpers:{combatPhysics:physics},bus:destination.bus});
        fresh.physicsBody=false;physics.syncFromEntities([...finiteBodies(state),state.entities.get(state.playerId)].filter(e=>e.physicsBody!==false));
        const cold=service.reconcilePhysics();assert.ok(cold.pending>0,JSON.stringify({role,defId,pass,cold,row,records:[...physics.records.keys()]}));assert.equal(row.physicsHandle,null,'cold target grants no invisible native joint');
        if(role==='section')fresh.physicsBody=source.section.physicsBody;else reconcileCeresWorkfleetPresentation({state});
        physics.syncFromEntities([...finiteBodies(state),state.entities.get(state.playerId)]);assert.equal(service.reconcilePhysics().recreated,1);
        assert.equal(service.get(lineId).state,'active');assert.equal(serializeCombatState(state).attachments.byId[lineId].ownerRef.kind,'player');
        physics.syncFromEntities([]);
      }
      const destroyed=clone(data);
      if(role==='section')destroyed.sites.worldById[C.siteId].payloads.long_plate.destroyed=true;
      else destroyed.world.records.byId[target.data.worldRecordId].outcome='destroyed';
      assert.equal(saver._restore(destroyed,'quick').restored,true);assert.equal(destination.state.combat.attachments.byId[lineId],undefined);
    }finally{physics.dispose();destination.registry.get('save').destroy();destination.dispose();source.close();}
  }
});

test('pending player custody survives re-save and rejects stale lives or an NPC rope relabelled as player-owned',async()=>{
  const source=await sourceFixture({withJobs:true});
  try {
    source.service.cut(source.receiver.id,source.cradle.id,'fixture-no-receiver');
    const player=source.state.entities.get(source.state.playerId);player.pos={x:source.section.pos.x+100,z:source.section.pos.z};
    source.physics.syncFromEntities([...finiteBodies(source.state),player]);
    const made=source.service.create({defId:'tether_standard',ownerId:player.id,targetId:source.section.id,sourceSocketId:'socket_tether_spool',targetSocketId:'socket_tether_anchor'});assert.equal(made.ok,true);
    const payload=serializeCombatState(source.state);
    for(const stale of [false,true]) {
      const state=createGameState(47);state.mode='flight';state.world.currentSectorId=C.sectorId;state.world.records=clone(source.state.world.records);
      const sim=createSimulation({state,seed:47,systems:[asteroidSites]}),sites=sim.registry.get('asteroidSites');sites.deserialize(source.sites.serialize());
      for(const record of Object.values(state.world.records.byId))sim.spawn(spawnSpecFromRecord(record));
      const freshPlayer=sim.spawn({type:'ship',team:0,pos:{...player.pos},mass:100,radius:6,hull:100,hullMax:100,data:{}});state.playerId=freshPlayer.id;
      const saver=Object.assign(Object.create(save),{state,bus:sim.bus,_restoreSequence:1,_runEpoch:1});
      try {
        saver._restoreCombat(clone(payload),new Map());saver._resumeCeresAttachmentRestore();
        assert.equal(hasPendingCeresWorkfleetAttachments(state,made.attachment.id),true);
        assert.equal(state.combat.attachments.byId[source.tow.id],undefined,'pending player claim already blocks the obsolete NPC source');
        if(stale)freshPlayer.occupantGeneration++;
        for(let i=0;i<3;i++)assert.equal(!!serializeCombatState(state).attachments.byId[made.attachment.id],!stale);
        sites._syncWorldSites();sim.bus.emit('save:loaded');assert.equal(!!state.combat.attachments.byId[made.attachment.id],!stale);
      }finally{saver.destroy();sim.dispose();}
    }
    const forged=clone(payload.attachments.byId[source.tow.id]);forged.ownerRef={kind:'player'};
    const state=createGameState(47);const result=restoreCombatState(state,{attachments:{byId:{[forged.id]:forged}}},()=>123);
    assert.equal(result.dropped,1);assert.deepEqual(state.combat.attachments.byId,{});
  }finally{source.close();}
});
