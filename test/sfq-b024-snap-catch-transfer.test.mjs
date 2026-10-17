import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { mulberry32 } from '../src/core/rng.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';

const DT = 1 / 60;

function harness() {
  const player = {
    id: 1, type: 'ship', team: 0, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 70 }, rot: 0,
    radius: 8, mass: 200, flags: {}, data: {},
  };
  const anchor = (id, x, z) => ({
    id, type: 'asteroid', alive: true, collides: true,
    pos: { x, z }, vel: { x: 0, z: 0 }, radius: 14, mass: 640, data: {},
  });
  const a = anchor(2, 180, 0);
  const b = anchor(3, 0, 120);
  const entityList = [player, a, b];
  const state = {
    seed: 4242, rng: mulberry32(4242), mode: 'flight', tick: 0, simTime: 0,
    playerId: player.id, player: { heat: 0, targetId: null, tether: {} },
    entityList, entities: new Map(entityList.map((entity) => [entity.id, entity])),
    input: { aimWorld: { ...a.pos }, aimIntentActive: true, actions: {} },
  };
  ensureCombatState(state);
  const bus = createBus();
  const latched = [];
  const denied = [];
  const released = [];
  bus.on('tether:latched', (payload) => latched.push(payload));
  bus.on('tether:latchDenied', (payload) => denied.push(payload));
  bus.on('tether:released', (payload) => released.push(payload));
  const helpers = { combatPhysics: {
    createAttachment: (input) => ({ ...input }),
    cutAttachment: () => true,
    setAttachmentReel: () => true,
    getAttachmentTelemetry: () => null,
  } };
  const catalog = createCombatCatalog();
  const attachments = createAttachmentService({ state, catalog, helpers, bus });
  const kernel = { attachments, catalog };
  const system = { ...tetherGameplay };
  system.init({ state, bus, helpers, registry: {
    get: (name) => name === 'actions' || name === 'combat' ? { kernel } : null,
  } });
  const step = (time, actions = {}) => {
    state.simTime = time;
    state.tick = Math.round(time * 60);
    state.input.actions = { tetherFire: false, tetherCut: false, reelDelta: 0, ...actions };
    system.update(DT, state);
  };
  const cut = (aim = a) => {
    step(0, { tetherFire: true });
    assert.equal(latched.at(-1)?.targetId, a.id, 'the first press catches Anchor A');
    const attachmentId = system._active.attachmentId;
    player.pos = { x: 20, z: 10 };
    player.vel = { x: -5, z: 70 };
    state.input.aimWorld = { ...aim.pos };
    step(1, { massline: { cut: true } });
    assert.deepEqual(released, [{ targetId: a.id }], 'the swing is voluntarily released at one second');
    assert.equal(attachments.get(attachmentId)?.state,
      'broken', 'the old rope is cut by the attachment authority');
  };
  return { state, player, a, b, system, attachments, latched, denied, step, cut };
}

test('SFQ-B024: a different anchor is ready and catches within 0.10 seconds of release', () => {
  const h = harness();
  h.cut(h.b);
  assert.equal(h.state.masslineAcquisition?.selected?.targetId, h.b.id,
    'the cut immediately previews the post-release aim');
  h.step(1.05);
  assert.equal(h.state.masslineAcquisition.selected.targetId, h.b.id);
  assert.equal(h.state.masslineAcquisition.selected.status, 'ready',
    'Anchor B must be ready during Anchor A\'s anti-bounce window');
  h.step(1.1, { tetherFire: true });
  assert.equal(h.latched.at(-1)?.targetId, h.b.id, 'the next press snap-catches Anchor B');
  assert.equal(h.latched.length, 2);
  assert.deepEqual(h.denied, []);
  assert.equal(h.attachments.get(h.system._active.attachmentId).targetId, h.b.id);
});

test('SFQ-B024: the released anchor stays blocked until its 0.25-second cooldown expires', () => {
  const h = harness();
  h.cut();
  h.step(1.1, { tetherFire: true });
  assert.equal(h.state.masslineAcquisition.selected.targetId, h.a.id);
  assert.equal(h.state.masslineAcquisition.selected.status, 'cooldown');
  assert.deepEqual(h.denied, [{ reason: 'cooldown' }]);
  assert.equal(h.latched.length, 1, 'the same anchor cannot bounce back onto the rope');
  assert.equal(h.system._active, null);
  h.step(1.3, { tetherFire: true });
  assert.equal(h.latched.length, 2, 'the same anchor can be caught after the cooldown');
  assert.equal(h.latched.at(-1).targetId, h.a.id);
});

test('SFQ-B024: an unscoped cooldown pin still blocks every target', () => {
  const h = harness();
  h.system._noRelatchUntil = 2;
  h.state.input.aimWorld = { ...h.b.pos };
  h.step(1.1, { tetherFire: true });
  assert.deepEqual(h.denied, [{ reason: 'cooldown' }]);
  assert.equal(h.latched.length, 0);
  assert.equal(h.state.masslineAcquisition.selected.status, 'cooldown');
});

test('SFQ-B024: the nearest-anchor command can also snap-catch a different anchor', () => {
  const h = harness();
  h.cut();
  h.state.input.tetherMode = 'nearest';
  h.step(1.1, { tetherFire: true });
  assert.equal(h.latched.at(-1)?.targetId, h.b.id, 'the nearer Anchor B can be caught immediately');
  assert.equal(h.latched.length, 2);
  assert.deepEqual(h.denied, []);
});
