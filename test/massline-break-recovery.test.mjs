import assert from 'node:assert/strict';
import test from 'node:test';

import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { createBus } from '../src/core/eventBus.js';
import { runRenderUpdatePhase } from '../src/core/renderUpdatePhase.js';
import { vfx } from '../src/render/vfx.js';
import { isAttachable, tetherGameplay } from '../src/systems/tetherGameplay.js';

const DT = 1 / 60;

function asteroid(id = 2) {
  return {
    id,
    type: 'asteroid',
    team: null,
    alive: true,
    pos: { x: 180, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 14,
    mass: 640,
    collides: true,
    data: { typeId: 'ast_common_rock' },
  };
}

function playerShip() {
  return {
    id: 1,
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 12, z: -4 },
    rot: 0,
    radius: 8,
    mass: 16,
    maxSpeed: 218,
    flags: {},
  };
}

function stubCombatPhysics() {
  const joints = new Map();
  return {
    createAttachment(input) {
      const handle = {
        id: input.attachmentId,
        attachmentId: input.attachmentId,
        ownerId: input.ownerId,
        targetId: input.targetId,
      };
      joints.set(input.attachmentId, handle);
      return handle;
    },
    cutAttachment(input) {
      joints.delete(input.attachmentId);
      return true;
    },
    setAttachmentReel() { return true; },
    getAttachmentTelemetry() { return null; },
  };
}

function makeSpatialHash(entityList) {
  return {
    diagnostics: { activeBuckets: 1 },
    queryRadius(x, z, radius, out) {
      for (const e of entityList) {
        if (!e || !e.pos || e.alive === false) continue;
        const d = Math.hypot(e.pos.x - x, e.pos.z - z);
        if (d <= radius + (e.radius || 0)) out.push(e);
      }
    },
  };
}

function fireLatch(h) {
  h.state.input.actions.tetherFire = true;
  h.system.update(DT, h.state);
  h.state.input.actions.tetherFire = false;
  // The latch receipt is consumed this tick; the HUD/VFX mirror paints on the following tick.
  h.system.update(DT, h.state);
}

function activeAttachmentId(h) {
  return h.state.player.tether.attachmentId
    || h.attachments.listForEntity(h.p.id, true)[0]?.id
    || null;
}

function buildLatchHarness() {
  const p = playerShip();
  const rock = asteroid();
  const entityList = [p, rock];
  const state = {
    mode: 'flight',
    simTime: 1,
    tick: 60,
    playerId: p.id,
    player: {
      heat: 0,
      targetId: null,
      tether: {
        active: false, targetId: null, strain: 0, load: 0,
        attachmentId: null, restLength: 0, phase: 'slack',
      },
    },
    entities: new Map(entityList.map((e) => [e.id, e])),
    entityList,
    spatialHash: makeSpatialHash(entityList),
    input: {
      aimWorld: { x: rock.pos.x, z: rock.pos.z },
      aimAngle: 0,
      tetherMode: null,
      actions: { tetherFire: false, tetherCut: false, reelDelta: 0 },
    },
    combat: null,
  };
  ensureCombatState(state);

  const bus = createBus();
  const events = { latched: [], broke: [] };
  bus.on('tether:latched', (payload) => events.latched.push(payload));
  bus.on('tether:broke', (payload) => events.broke.push(payload));

  const catalog = createCombatCatalog();
  const helpers = { combatPhysics: stubCombatPhysics() };
  const attachments = createAttachmentService({ state, catalog, helpers, bus });
  const kernel = { attachments, catalog: { attachments: catalog.attachments } };
  const registry = {
    get(name) {
      if (name === 'actions' || name === 'combat') return { kernel };
      return null;
    },
  };

  const system = Object.assign({}, tetherGameplay);
  system.init({ state, bus, helpers, registry });
  return { state, p, rock, bus, events, system, attachments };
}

function makeSnapHarness({ targetPresent = true, burstThrows = false } = {}) {
  const player = {
    id: 'player', type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 10, z: 0 }, rot: 0, radius: 9,
  };
  const target = {
    id: 'rock', type: 'asteroid', alive: true,
    pos: { x: 80, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12,
  };
  const entities = new Map([[player.id, player]]);
  if (targetPresent) entities.set(target.id, target);

  const harness = Object.create(vfx);
  harness._scene = {};
  harness.state = { playerId: player.id };
  harness.helpers = { player: () => player };
  harness._tetherCable = {
    fade: 1,
    snapAge: 999,
    latchAge: 1,
    fadeRate: 0,
    wasActive: true,
    lastSourceId: player.id,
    lastTargetId: target.id,
    lastAttachmentId: 'att-1',
    lastRemote: false,
    endpointScratch: {},
  };
  harness._burst = 1;
  harness._c0 = { set() { return this; } };
  harness._c1 = { set() { return this; } };
  harness._emitJuiceCue = () => {};
  harness._ent = (id) => entities.get(id) || null;
  harness._spawnParticle = () => {
    if (burstThrows) throw new Error('particle owner invalid');
  };
  harness._spawnSprite = () => {
    if (burstThrows) throw new Error('sprite owner invalid');
  };
  harness._flashLight = () => {};
  return { harness, player, target, entities };
}

test('asteroids stay attachable so a break is an event, not a missing latch', () => {
  assert.equal(isAttachable(asteroid()), true);
});

test('destroying a latched asteroid clears the HUD Massline mirror without NaN motion', () => {
  const h = buildLatchHarness();
  fireLatch(h);

  assert.equal(h.events.latched.length, 1);
  assert.equal(h.state.player.tether.active, true);
  assert.equal(h.state.player.tether.targetId, h.rock.id);

  const attachmentId = activeAttachmentId(h);
  h.rock.alive = false;
  h.state.entities.delete(h.rock.id);
  h.attachments.breakAttachment(attachmentId, 'entity_destroyed', h.rock.id);

  assert.equal(h.events.broke.length, 1);
  assert.notEqual(h.events.broke[0].reason, 'tether_cut');
  assert.equal(h.state.player.tether.active, false, 'HUD mirror must drop LOCKED on the break, not the next tick');
  h.system.update(DT, h.state);
  assert.equal(Number.isFinite(h.p.pos.x) && Number.isFinite(h.p.pos.z), true);
  assert.equal(Number.isFinite(h.p.vel.x) && Number.isFinite(h.p.vel.z), true);
});

test('a player cut does not emit MASSLINE BROKEN and clears LOCKED immediately', () => {
  const h = buildLatchHarness();
  fireLatch(h);
  assert.equal(h.state.player.tether.active, true);
  h.events.broke.length = 0;

  h.state.input.actions.massline = { cut: true };
  h.system.update(DT, h.state);
  h.state.input.actions.massline = null;

  assert.equal(h.events.broke.length, 0, 'ordinary player cut must not toast MASSLINE BROKEN');
  assert.equal(h.state.player.tether.active, false);
});

test('HUD overlay still paints the broken Massline after a VFX throw', (t) => {
  t.mock.method(console, 'error', () => {});
  const h = buildLatchHarness();
  fireLatch(h);
  h.attachments.breakAttachment(activeAttachmentId(h), 'entity_destroyed', h.rock.id);
  assert.equal(h.state.player.tether.active, false);

  let paintedActive = null;
  const accepted = runRenderUpdatePhase({
    state: h.state,
    render: {
      prepareFrame() { return true; },
      drawPreparedFrame() {},
    },
    vfx: {
      update() { throw new Error('tether snap burst'); },
    },
    feel: { frame() {} },
    ui: {
      frame() {
        paintedActive = !!(h.state.player && h.state.player.tether && h.state.player.tether.active);
      },
    },
    alpha: 1,
    frameDt: DT,
  });

  assert.equal(accepted, true);
  assert.equal(paintedActive, false);
});

test('a snap still starts the ribbon fade when the asteroid is already gone', () => {
  const { harness } = makeSnapHarness({ targetPresent: false });
  const handled = harness._onTetherSnap({
    targetId: 'rock',
    attachmentId: 'att-1',
    reason: 'entity_destroyed',
  });
  assert.equal(handled, true);
  assert.equal(harness._tetherCable.snapAge, 0);
  assert.equal(harness._tetherCable.wasActive, false);
  assert.ok(harness._tetherCable.fadeRate > 1);
  assert.equal(harness._tetherCable.fade, 1);
});

test('a throwing snap burst still leaves the ribbon in fade-out', () => {
  const { harness } = makeSnapHarness({ targetPresent: true, burstThrows: true });
  const handled = harness._onTetherSnap({
    targetId: 'rock',
    attachmentId: 'att-1',
    reason: 'entity_destroyed',
  });
  assert.equal(handled, true);
  assert.equal(harness._tetherCable.snapAge, 0);
  assert.equal(harness._tetherCable.wasActive, false);
  assert.ok(harness._tetherCable.fadeRate > 1);
});

test('invalid particle buffers fail closed instead of throwing every frame', () => {
  const fixture = Object.create(vfx);
  let drawRange = null;
  fixture._particleDynamicBufferOwner = { invalid: true };
  fixture._pGeo = {
    setDrawRange(start, count) {
      drawRange = [start, count];
    },
  };
  fixture._liveCount = 8;
  assert.doesNotThrow(() => fixture._integrateParticles(DT));
  assert.deepEqual(drawRange, [0, 0]);
});
