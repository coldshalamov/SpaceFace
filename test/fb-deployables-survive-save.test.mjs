// FB-015 — deployed massline snares, impulse-charge networks, primed chains, and live tether
// webs survive a save. The save rows carry geometry, clocks, and durable endpoint save-ids
// only — the deployable entities themselves stay transient and re-stage after entity + combat
// restore, at the save:loaded boundary. Lifetimes continue from the saved remaining time.
// Run: node --test test/fb-deployables-survive-save.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { makeEntity } from '../src/core/entity.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { WEB_DEF_ID, WEB_WEAPON_ID } from '../src/combat/tetherWebs.js';
import { masslineSnares } from '../src/systems/masslineSnares.js';
import { impulseCharges } from '../src/systems/impulseCharges.js';

const DT = 1 / 60;

function immediateBus() {
  const listeners = new Map();
  return {
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    emit(type, payload) {
      for (const fn of listeners.get(type) || []) fn(payload);
    },
  };
}

function makeBody(spec) {
  const entity = makeEntity({
    alive: true,
    collides: spec.collides !== false,
    mass: spec.mass || 40,
    hull: 100,
    hullMax: 100,
    rot: spec.rot || 0,
    ...spec,
  });
  entity.id = spec.id;
  return entity;
}

// The combat kernel's attachment authority stores records on state.combat.attachments.byId —
// this fake keeps that exact shape so the web ledger's save:loaded sweep reads real entries.
function fakeAttachments(state) {
  const byId = state.combat.attachments.byId;
  let next = 1;
  const cutCalls = [];
  return {
    byId,
    cutCalls,
    create(spec) {
      const owner = state.entities.get(spec.ownerId);
      const target = state.entities.get(spec.targetId);
      if (!owner || !target) return { ok: false, reason: 'endpoint_missing' };
      const attachment = {
        id: `att_${next++}`,
        defId: spec.defId,
        ownerId: spec.ownerId,
        targetId: spec.targetId,
        controllerId: spec.controllerId,
        controlMode: spec.controlMode,
        state: 'active',
        restLength: Math.hypot(target.pos.x - owner.pos.x, target.pos.z - owner.pos.z),
        lastTension: 0,
        lastImpulse: 0,
        nearBreakWarned: false,
      };
      byId[attachment.id] = attachment;
      return { ok: true, attachment };
    },
    get(id) { return byId[id] || null; },
    list() { return Object.values(byId); },
    reel() { return { ok: true }; },
    cut(id, actorId, reason) {
      const attachment = byId[id];
      cutCalls.push({ id, actorId, reason });
      if (!attachment || attachment.state !== 'active') return { ok: false, reason: 'attachment_missing' };
      attachment.state = 'broken';
      attachment.breakReason = reason;
      return { ok: true, attachment };
    },
    rebind(id, actorId, spec) {
      const attachment = byId[id];
      if (!attachment || attachment.state !== 'active') return { ok: false, reason: 'attachment_missing' };
      if (attachment.controllerId !== actorId) return { ok: false, reason: 'not_attachment_owner' };
      const owner = state.entities.get(spec.ownerId);
      const target = state.entities.get(spec.targetId);
      if (!owner || !target) return { ok: false, reason: 'endpoint_missing' };
      attachment.ownerId = spec.ownerId;
      attachment.targetId = spec.targetId;
      attachment.controllerId = spec.controllerId;
      attachment.controlMode = spec.controlMode;
      attachment.restLength = Math.hypot(
        spec.targetWorld.x - spec.sourceWorld.x,
        spec.targetWorld.z - spec.sourceWorld.z,
      );
      return { ok: true, attachment };
    },
    activeCount() { return Object.values(byId).filter((a) => a.state === 'active').length; },
  };
}

function boot({ remap = null, extraBodies = [] } = {}) {
  const bus = immediateBus();
  const player = makeBody({
    id: 1,
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 6,
    data: { derived: { masslineHeadId: 'transverse_snare' } },
  });
  const bodies = [player, ...extraBodies];
  const state = {
    mode: 'flight',
    tick: 100,
    simTime: 50,
    playerId: player.id,
    player: {},
    input: { aimWorld: { x: 100, z: 0 }, actions: {} },
    runtime: { features: PRODUCTION_FEATURES },
    combat: { attachments: { byId: {} } },
    entities: new Map(bodies.map((e) => [e.id, e])),
    entityList: bodies.slice(),
    sessionEntityIdRemap: remap,
    spatialHash: {
      diagnostics: { activeBuckets: 1 },
      queryRadius(_x, _z, _radius, out) { return out; },
    },
  };
  let nextId = 200;
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = nextId++;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
    },
  };
  const attachments = fakeAttachments(state);
  const registry = { get: (id) => (id === 'combat' ? { kernel: { attachments } } : null) };
  const snares = Object.create(masslineSnares);
  snares.init({ state, bus, helpers, registry });
  const charges = Object.create(impulseCharges);
  charges.init({ state, bus, helpers, registry });
  return { state, bus, helpers, attachments, registry, snares, charges, spawned, player };
}

function deploySnare(h) {
  h.snares.handleInput({ state: h.state, player: h.player, wantsLatch: false });
  h.state.tick += 1;
  h.state.simTime += DT;
  h.snares.handleInput({ state: h.state, player: h.player, wantsLatch: true, masslineCommand: { latch: true } });
  h.snares.update(DT, h.state);
  return h.snares._deployment;
}

function jsonRoundTrip(value) {
  return JSON.parse(JSON.stringify(value));
}

test('an armed snare re-stages on load with its saved geometry and remaining lifetime', () => {
  const a = boot();
  const deployment = deploySnare(a);
  assert.ok(deployment, 'the scripted deploy leaves a live deployment');
  const anchorA = a.state.entities.get(deployment.anchorAId);
  const anchorB = a.state.entities.get(deployment.anchorBId);
  assert.ok(anchorA && anchorB);
  a.state.simTime += 3; // the trap has been soaking three seconds of its TTL
  const row = jsonRoundTrip(a.snares.serialize());
  assert.equal(row.deployment.mode, 'armed');
  assert.equal(row.deployment.caughtSaveId, null);
  assert.ok(row.deployment.expiresAt < a.state.simTime + 14, 'the expiry clock is not refreshed');

  // Fresh world: the save's persistent cast respawns and ids remap 1:1 here.
  const b = boot({ remap: new Map([['1', 1]]) });
  b.state.tick = a.state.tick;
  b.state.simTime = a.state.simTime;
  b.snares.deserialize(row);
  b.bus.emit('save:loaded', {});

  const restored = b.snares._deployment;
  assert.ok(restored, 'the saved snare re-stages instead of being cleared');
  assert.equal(restored.id, deployment.id);
  assert.equal(restored.expiresAt, deployment.expiresAt, 'the TTL keeps counting, never resets');
  const newA = b.state.entities.get(restored.anchorAId);
  const newB = b.state.entities.get(restored.anchorBId);
  assert.ok(newA && newA.alive && newB && newB.alive, 'both anchors respawn');
  assert.deepEqual(
    { x: newA.pos.x, z: newA.pos.z },
    { x: anchorA.pos.x, z: anchorA.pos.z },
    'the saved anchor geometry is preserved',
  );
  assert.ok(newA.ttl <= restored.expiresAt - b.state.simTime + 1.01,
    'anchor ttl tracks the saved expiry, not a fresh TTL');
  assert.ok(newB.ttl <= restored.expiresAt - b.state.simTime + 1.01);
  const sentinel = b.state.entities.get(restored.sentinelId);
  assert.ok(sentinel && sentinel.ttl <= restored.expiresAt - b.state.simTime + 0.01,
    'the hazard sentinel dies with the trap');
  assert.equal(b.state.player.remoteMassline.active, true, 'the remote mirror republishes');
  // The attachment could never persist (its endpoints are transient anchors) — the normal
  // one-tick attach path recreates it.
  b.state.tick += 1;
  b.snares.update(DT, b.state);
  assert.ok(restored.attachmentId, 'the rebuilt line attaches source→target on the next tick');
});

test('a mid-catch snare on a persistent hull retakes the remapped victim', () => {
  const a = boot();
  const victim = makeBody({
    id: 9,
    type: 'ship',
    team: 1,
    pos: { x: 50, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 4,
    flags: { persistent: true },
    data: {},
  });
  a.state.entities.set(victim.id, victim);
  a.state.entityList.push(victim);
  const deployment = deploySnare(a);
  a.state.tick += 1;
  a.snares.update(DT, a.state);
  assert.ok(deployment.attachmentId, 'the line attached before the catch');
  // Drive the catch directly through the same seam the crossing scan uses.
  const anchorA = a.state.entities.get(deployment.anchorAId);
  const anchorB = a.state.entities.get(deployment.anchorBId);
  const attachment = a.attachments.get(deployment.attachmentId);
  a.snares._catch(a.state, deployment, attachment, anchorA, anchorB, victim,
    { pos: { x: 50, z: 0 }, transverseSpeed: 80 });
  assert.equal(deployment.caughtId, victim.id);

  const row = jsonRoundTrip(a.snares.serialize());
  assert.equal(row.deployment.mode, 'caught');
  assert.equal(row.deployment.caughtSaveId, '9');

  // The victim respawns under a new id; the remap carries the save id forward.
  const newVictim = makeBody({
    id: 42,
    type: 'ship',
    team: 1,
    pos: { x: 50, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 4,
    flags: { persistent: true },
    data: {},
  });
  const b = boot({ remap: new Map([['1', 1], ['9', 42]]), extraBodies: [newVictim] });
  b.state.tick = a.state.tick;
  b.state.simTime = a.state.simTime;
  b.snares.deserialize(row);
  b.bus.emit('save:loaded', {});

  const restored = b.snares._deployment;
  assert.ok(restored, 'the caught snare re-stages');
  assert.equal(restored.caughtId, 42, 'the caught ref lands on the respawned victim');
  assert.equal(restored.targetId, 42);
  assert.equal(restored.sentinelId, null, 'the hazard body is not re-staged mid-catch');
  b.state.tick += 1;
  b.snares.update(DT, b.state);
  const tether = b.attachments.get(restored.attachmentId);
  assert.ok(tether, 'the caught line re-attaches');
  assert.equal(tether.targetId, 42, 'anchor→victim, same as the caught rebind');
});

test('charge plates and a primed chain round-trip through the remap', () => {
  const a = boot();
  const host = makeBody({
    id: 7,
    type: 'ship',
    team: 1,
    pos: { x: 30, z: 10 },
    vel: { x: 0, z: 0 },
    radius: 5,
    flags: { persistent: true },
    data: {},
  });
  a.state.entities.set(host.id, host);
  a.state.entityList.push(host);
  a.helpers.spawnEntity({
    type: 'charge',
    pos: { x: 30, z: 14 },
    vel: { x: 0, z: 0 },
    radius: 1.2,
    mass: 0.5,
    collides: false,
    team: 0,
    ownerId: 1,
    data: {
      kind: 'impulse_charge', chargeId: 'charge_a', ownerId: 1, hostId: 7,
      localOffset: { x: 0, z: 4 }, localRot: 0, armed: true, aftDrop: false,
      spawnedAt: a.state.simTime - 2, spawnPos: { x: 30, z: 14 },
    },
  });
  a.helpers.spawnEntity({
    type: 'charge',
    pos: { x: -10, z: -5 },
    vel: { x: 4, z: 1 },
    radius: 1.2,
    mass: 0.5,
    collides: false,
    team: 0,
    ownerId: 1,
    data: {
      kind: 'impulse_charge', chargeId: 'charge_b', ownerId: 1, hostId: null,
      localOffset: null, localRot: null, armed: false, aftDrop: false,
      spawnedAt: a.state.simTime - 1, spawnPos: { x: -10, z: -5 },
    },
  });
  assert.equal(a.charges._prime(host, a.state, { byId: 1, reason: 'blast' }), true);
  const primedBefore = a.charges.primeState(host);
  assert.ok(primedBefore);

  const row = jsonRoundTrip(a.charges.serialize());
  assert.equal(row.charges.length, 2, 'both plates serialize');
  assert.equal(row.primed.length, 1, 'the primed persistent hull serializes');

  const newHost = makeBody({
    id: 77,
    type: 'ship',
    team: 1,
    pos: { x: 30, z: 10 },
    vel: { x: 0, z: 0 },
    radius: 5,
    flags: { persistent: true },
    data: {},
  });
  const b = boot({ remap: new Map([['1', 1], ['7', 77]]), extraBodies: [newHost] });
  b.state.tick = a.state.tick;
  b.state.simTime = a.state.simTime;
  b.charges.deserialize(row);
  b.bus.emit('save:loaded', {});

  const restored = b.spawned.filter((e) => e.type === 'charge');
  assert.equal(restored.length, 2, 'both plates respawn as fresh transient entities');
  const stuck = restored.find((e) => e.data.chargeId === 'charge_a');
  assert.ok(stuck);
  assert.equal(stuck.data.hostId, 77, 'the host ref re-resolves through the remap');
  assert.equal(stuck.data.ownerId, 1);
  assert.deepEqual(stuck.data.localOffset, { x: 0, z: 4 }, 'the sticky pose survives');
  const free = restored.find((e) => e.data.chargeId === 'charge_b');
  assert.equal(free.data.hostId, null);

  const primedAfter = b.charges.primeState(newHost);
  assert.ok(primedAfter, 'the primed chain lands on the remapped hull');
  assert.ok(primedAfter.until - b.state.simTime > 0, 'the cook-off window keeps counting');
  assert.ok(primedAfter.until - b.state.simTime <= primedBefore.until - a.state.simTime + 1e-9,
    'the window does not stretch across the boundary');
  assert.equal(primedAfter.reason, 'blast');
  assert.equal(primedAfter.byId, 1, 'player attribution re-resolves through the remap');
});

test('live webs keep their remaining lifetime; an unledgered web record releases', () => {
  const a = boot();
  const h1 = makeBody({ id: 11, type: 'ship', team: 1, pos: { x: 20, z: 0 }, vel: { x: 0, z: 0 }, radius: 5, flags: { persistent: true }, data: {} });
  const h2 = makeBody({ id: 12, type: 'ship', team: 1, pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 }, radius: 5, flags: { persistent: true }, data: {} });
  a.state.entities.set(h1.id, h1);
  a.state.entities.set(h2.id, h2);
  a.state.entityList.push(h1, h2);
  const web = a.attachments.create({
    defId: WEB_DEF_ID, ownerId: 11, targetId: 12,
    controllerId: 1, controlMode: 'snarl',
    sourceWorld: h1.pos, targetWorld: h2.pos,
  }).attachment;
  // Reach through the webs factory the system owns: a pending hit + update is the real path,
  // but the ledger is private — seed it through the same call the update uses.
  const webs = a.snares._webs;
  webs.restoreLinks([{ id: web.id, controllerId: 1, remaining: 6 }]);
  const row = jsonRoundTrip(a.snares.serialize());
  assert.equal(row.webs.length, 1);
  assert.equal(row.webs[0].id, web.id);
  assert.ok(row.webs[0].remaining <= 6 && row.webs[0].remaining > 0, 'remaining lifetime serializes');

  const b = boot({ remap: new Map([['1', 1], ['11', 11], ['12', 12]]) });
  const nh1 = makeBody({ id: 11, type: 'ship', team: 1, pos: { x: 20, z: 0 }, vel: { x: 0, z: 0 }, radius: 5, flags: { persistent: true }, data: {} });
  const nh2 = makeBody({ id: 12, type: 'ship', team: 1, pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 }, radius: 5, flags: { persistent: true }, data: {} });
  b.state.entities.set(11, nh1);
  b.state.entities.set(12, nh2);
  b.state.entityList.push(nh1, nh2);
  b.state.tick = a.state.tick;
  b.state.simTime = a.state.simTime;
  // Combat restore already ran: the saved web attachment record is back under the same id.
  b.state.combat.attachments.byId[web.id] = {
    id: web.id, defId: WEB_DEF_ID, ownerId: 11, targetId: 12,
    controllerId: 1, controlMode: 'snarl', state: 'active', restLength: 20,
    lastTension: 0, lastImpulse: 0,
  };
  // A second restored web record with no ledger entry — e.g. a stale record — must release.
  b.state.combat.attachments.byId.att_stale = {
    id: 'att_stale', defId: WEB_DEF_ID, ownerId: 11, targetId: 12,
    controllerId: 1, controlMode: 'snarl', state: 'active', restLength: 20,
    lastTension: 0, lastImpulse: 0,
  };
  b.snares.deserialize(row);
  b.bus.emit('save:loaded', {});

  const live = b.attachments.get(web.id);
  assert.equal(live.state, 'active', 'the ledgered web survives the boundary');
  assert.equal(b.attachments.get('att_stale').state, 'broken', 'the unledgered record releases');
  const links = jsonRoundTrip(b.snares.serialize()).webs;
  assert.equal(links.length, 1);
  assert.ok(links[0].remaining > 0 && links[0].remaining <= 6, 'the timer keeps its remaining time');
});

test('absent rows (a pre-FB-015 save) leave both systems at a clean reset', () => {
  const b = boot();
  b.charges.deserialize(undefined);
  b.snares.deserialize(undefined);
  b.bus.emit('save:loaded', {});
  assert.equal(b.snares._deployment, null, 'no phantom deployment stages');
  assert.equal(b.attachments.activeCount(), 0, 'no webs leak into a fresh load');
});
