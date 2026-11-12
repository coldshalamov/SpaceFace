// THROW-01 — the click throws. A first-time player latches an enemy with RMB, swings, and clicks
// RMB again to throw it. That click must throw the ENEMY every time; it must never read as a
// tap-to-cut that flings the player. Real input system + real masslineThrow; the tether service is
// a minimal stand-in that does what tetherGameplay does with `tetherCut` (cut + emit tether:cut).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { input, domMouseDownEvent, domMouseUpEvent } from '../src/systems/input.js';
import { masslineThrow } from '../src/systems/masslineThrow.js';

const DT = 1 / 60;
const POINTER = { button: 2, clientX: 40, clientY: 40 };

function world({ payloadType = 'hostile', bindF = false } = {}) {
  const state = createGameState(47);
  state.mode = 'flight';
  state.tick = 100; state.simTime = state.tick * DT;
  state.playerId = 1;
  state.entities.clear();
  state.entityList = [];
  const add = (e) => { state.entities.set(e.id, e); state.entityList.push(e); return e; };
  const player = add({ id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 40 },
    rot: 0, angVel: 0, mass: 40, radius: 12, flags: {}, data: { weapons: [], combat: {}, derived: {} } });
  const payload = payloadType === 'asteroid'
    ? add({ id: 2, type: 'asteroid', alive: true, pos: { x: 120, z: 0 }, vel: { x: 0, z: 120 }, mass: 16, radius: 14, data: {} })
    : add({ id: 2, type: 'ship', alive: true, team: 1, pos: { x: 120, z: 0 }, vel: { x: 0, z: 120 }, mass: 16, radius: 14,
      flags: {}, data: { ai: { archetype: 'raider' }, combat: {} } });
  const victim = add({ id: 3, type: 'ship', alive: true, team: 1, pos: { x: -500, z: 400 }, vel: { x: 0, z: 0 },
    mass: 30, radius: 14, flags: {}, data: { ai: { archetype: 'raider' }, combat: {} } });
  state.player.targetId = victim.id;
  state.player.tether = { active: false, targetId: null, attachmentId: null, strain: 0, load: 0, restLength: 0, phase: 'slack' };
  state.input = { actions: {}, aimWorld: { x: -500, z: 400 }, aimIntentActive: false,
    mouseNdc: { x: 0, y: 0 }, pointerScreen: { x: 0, y: 0, active: false }, autoFire: false };
  if (bindF) state.settings.controls.bindings = { tether: ['KeyF'] };

  const bus = createBus();
  const events = { throw: [], selfSling: [], cut: [] };
  bus.on('massline:throw', (p) => events.throw.push(p));
  bus.on('massline:selfSling', (p) => events.selfSling.push(p));
  bus.on('tether:cut', (p) => events.cut.push(p));
  const attachments = {
    cut() { state.player.tether.active = false; state.player.tether.targetId = null; return { ok: true }; },
  };
  const host = Object.create(input);
  host._keys = Object.create(null); host._ndc = { x: 0, y: 0 }; host._screen = { x: 0, y: 0, active: false };
  host._m0 = host._m1 = host._m2 = false; host._lastKbmMs = 0;
  host.helpers = { raycastToPlane: () => ({ x: -500, z: 400 }) };
  host.bus = { emit() {} }; host.gamepad = null; host.touch = null; host.state = state;
  const system = Object.create(masslineThrow);
  system.init({ state, bus, helpers: {}, registry: { get: (k) => (k === 'actions' ? { kernel: { attachments } } : null) } });

  let phase = 0;
  const w = { state, host, system, events, player, payload, bus };
  w.tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      state.tick += 1; state.simTime += DT;
      // The payload orbits the player on the taut line (a swing).
      phase += 3.0 * DT;
      payload.pos.x = Math.cos(phase) * 120; payload.pos.z = Math.sin(phase) * 120;
      payload.vel.x = -Math.sin(phase) * 360; payload.vel.z = Math.cos(phase) * 360;
      host.update(DT, state);
      // tetherGameplay stand-in: a published cut request cuts the Line and says so.
      const a = state.input.actions;
      if (a && a.tetherCut && state.player.tether.active) {
        attachments.cut(); bus.emit('tether:cut', { attachmentId: 8, targetId: payload.id });
      }
      system.update(DT, state);
    }
  };
  w.latch = () => {
    domMouseDownEvent(host, POINTER); w.tick(1);
    Object.assign(state.player.tether, { active: true, targetId: payload.id, attachmentId: 8, phase: 'loaded', load: 0.5, strain: 0.4, restLength: 120 });
    w.tick(1);
    domMouseUpEvent(host, POINTER); w.tick(1);
  };
  return w;
}

function withFlags(fn) {
  const saved = { ...MASSLINE2_FLAGS };
  Object.assign(MASSLINE2_FLAGS, { enabled: true, throw: true });
  try { return fn(); } finally { Object.assign(MASSLINE2_FLAGS, saved); }
}

function clickAfter(w, swingTicks, heldTicks = 5) {
  w.tick(swingTicks);
  domMouseDownEvent(w.host, POINTER); w.tick(heldTicks); // a normal click: well under the 0.16 s hold
  domMouseUpEvent(w.host, POINTER); w.tick(30);
}

test('(a) a click at any phase of the swing throws the enemy: one throw, no self-sling, no cut', () => withFlags(() => {
  const modes = new Set();
  for (let swing = 4; swing < 130; swing += 3) {
    for (const held of [3, 7]) {
      const w = world();
      w.latch();
      clickAfter(w, swing, held);
      const tag = `swing ${swing} held ${held}`;
      assert.equal(w.events.throw.length, 1, `${tag}: exactly one massline:throw`);
      assert.equal(w.events.throw[0].payloadId, w.payload.id, `${tag}: it threw the held enemy`);
      assert.equal(w.events.selfSling.length, 0, `${tag}: the player is not slung`);
      assert.equal(w.events.cut.length, 0, `${tag}: no tether:cut`);
      modes.add(w.events.throw[0].mode);
    }
  }
  assert.ok(modes.size >= 1);
}));

test('(b) a click inside the release window still throws at the window (the assist is unchanged)', () => withFlags(() => {
  const modes = new Map();
  for (let swing = 4; swing < 130; swing += 1) {
    const w = world();
    w.latch();
    clickAfter(w, swing, 5);
    const t = w.events.throw[0];
    if (t) modes.set(t.mode, (modes.get(t.mode) || 0) + 1);
    if (t && t.mode === 'snap') {
      assert.ok(t.prediction && t.prediction.onSolution !== false || t.errorRad != null, 'the assisted throw carries its solution');
    }
  }
  assert.ok((modes.get('snap') || 0) > 0, `some clicks land the assist window; modes seen: ${JSON.stringify([...modes])}`);
  assert.ok((modes.get('snap-manual') || 0) > 0, 'a click off the window still throws, now');
}));

function clickBetweenWorkerSteps(w) {
  w.host.ingestLaneDomEvent({ ...POINTER, type: 'mousedown' });
  w.host.ingestLaneDomEvent({ ...POINTER, type: 'mouseup' });
}

test('a complete right-click delivered before the next worker step throws once', () => withFlags(() => {
  const w = world();
  w.latch();
  w.tick(20);
  clickBetweenWorkerSteps(w);
  w.tick(30);
  assert.equal(w.events.throw.length, 1);
  assert.equal(w.events.throw[0].payloadId, w.payload.id);
  assert.equal(w.events.cut.length, 0);
  assert.equal(w.events.selfSling.length, 0);
}));

test('a sampled click does not follow a replacement attachment or count as hold-to-arm', () => withFlags(() => {
  const replacement = world();
  replacement.latch();
  clickBetweenWorkerSteps(replacement);
  replacement.state.player.tether.attachmentId += 1;
  replacement.tick(30);
  assert.equal(replacement.events.throw.length, 0);
  assert.equal(replacement.events.cut.length, 0);

  const armed = world();
  armed.state.settings.gameplay.masslineReleaseAssist = 'arm';
  armed.latch();
  clickBetweenWorkerSteps(armed);
  armed.tick(30);
  assert.equal(armed.events.throw.length, 0);
  assert.equal(armed.events.cut.length, 0);
}));

test('a complete right-click can latch when both edges reach the same worker step', () => withFlags(() => {
  const w = world();
  clickBetweenWorkerSteps(w);
  w.tick();
  assert.equal(w.state.input.actions.tetherFire, true);
  Object.assign(w.state.player.tether, { active: true, targetId: w.payload.id, attachmentId: 8 });
  w.tick(5);
  assert.equal(w.state.input.actions.tetherFire, false);
  assert.equal(w.events.cut.length, 0);
  assert.equal(w.events.throw.length, 0);
}));

test('a complete right-click on a held rock still cuts exactly once', () => withFlags(() => {
  const w = world({ payloadType: 'asteroid' });
  w.latch();
  clickBetweenWorkerSteps(w);
  w.tick(5);
  assert.equal(w.events.cut.length, 1);
  assert.equal(w.events.throw.length, 0);

  const changed = world({ payloadType: 'asteroid' });
  changed.latch();
  clickBetweenWorkerSteps(changed);
  changed.tick();
  changed.state.player.tether.attachmentId += 1;
  changed.tick(5);
  assert.equal(changed.events.cut.length, 0, 'the synthesized release cannot cut a replacement line');
}));

test('(c) a tap on an asteroid still cuts the line (non-throwable payloads are unchanged)', () => withFlags(() => {
  const w = world({ payloadType: 'asteroid' });
  w.latch();
  clickAfter(w, 20, 5);
  assert.equal(w.events.throw.length, 0);
  assert.equal(w.events.cut.length, 1, 'the tap cut the rock loose');
  assert.equal(w.state.player.tether.active, false);
}));

test('(d) the free-yourself key on a held hostile still cuts (and slings the player)', () => withFlags(() => {
  const w = world({ bindF: true });
  w.latch();
  w.tick(20);
  w.host._keys.KeyF = true; w.tick(3);
  w.host._keys.KeyF = false; w.tick(3);
  assert.equal(w.events.throw.length, 0, 'F never throws');
  assert.equal(w.events.cut.length, 1, 'F cuts the line');
  assert.equal(w.events.selfSling.length, 1, 'F frees YOU: the taut cut is the self-sling');
}));
