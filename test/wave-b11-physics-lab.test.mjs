import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { sandboxScreen } from '../src/ui/screens/sandbox.js';
import {
  requestTimeScale,
  applyCrucibleLabControl,
  requestSpawnBodies,
  requestLatch,
  requestThrow,
  requestResetRoom,
  ensurePhysicsLabRoute,
  notePracticeLaunch,
  mountCrucibleLabControls,
} from '../src/ui/screens/crucibleLabControls.js';
import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { actions } from '../src/systems/actions.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { masslineThrow } from '../src/systems/masslineThrow.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { requestSandboxGame } from '../src/ui/sandbox/sandboxSetup.js';
import { createInputTapeDriver } from '../src/testing/lab/inputTape.js';
import {
  applyFeatureConfigToMaps,
  restoreFeatureMaps,
  snapshotFeatureMaps,
  PRODUCTION_FEATURES,
} from '../src/data/featureFlags.js';

function createDomStub() {
  function makeNode(tag) {
    const node = {
      tagName: tag,
      id: '',
      className: '',
      textContent: '',
      innerHTML: '',
      children: [],
      parentNode: null,
      dataset: {},
      attributes: {},
      style: {},
      listeners: {},
      appendChild(c) {
        if (!c) return c;
        c.parentNode = this;
        this.children.push(c);
        return c;
      },
      append(...kids) {
        for (const k of kids) this.appendChild(k);
      },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k] ?? null; },
      removeAttribute(k) { delete this.attributes[k]; },
      insertAdjacentHTML(pos, text) { this.innerHTML = (this.innerHTML || '') + text; },
      addEventListener(evt, fn) {
        (this.listeners[evt] = this.listeners[evt] || []).push(fn);
      },
      replaceWith(newChild) {
        if (!this.parentNode) return;
        const p = this.parentNode;
        const idx = p.children.indexOf(this);
        if (idx !== -1) {
          p.children.splice(idx, 1, newChild);
          newChild.parentNode = p;
        }
      },
      replaceChild(newChild, oldChild) {
        const idx = this.children.indexOf(oldChild);
        if (idx !== -1) {
          this.children.splice(idx, 1, newChild);
          newChild.parentNode = this;
        }
        return oldChild;
      },
      querySelector(sel) {
        const id = sel.startsWith('#') ? sel.slice(1) : sel;
        const walk = (n) => {
          if (n.id === id) return n;
          for (const c of n.children) {
            const f = walk(c);
            if (f) return f;
          }
          return null;
        };
        return walk(this);
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          if (n.tagName && n.tagName.toLowerCase() === sel.toLowerCase()) out.push(n);
          for (const c of n.children) walk(c);
        };
        walk(this);
        return out;
      },
      classList: {
        classes: new Set(),
        add(...names) { names.forEach((n) => this.classes.add(n)); },
        remove(...names) { names.forEach((n) => this.classes.delete(n)); },
        contains(name) { return this.classes.has(name); },
        toggle(name, force) {
          if (force === undefined) {
            if (this.classes.has(name)) this.classes.delete(name);
            else this.classes.add(name);
          } else if (force) this.classes.add(name);
          else this.classes.delete(name);
        },
      },
    };
    return node;
  }
  const doc = {
    head: makeNode('head'),
    createElement: (tag) => makeNode(tag),
    createTextNode: (text) => {
      const n = makeNode('#text');
      n.textContent = String(text);
      return n;
    },
    getElementById: () => null,
  };
  return { doc, makeNode };
}

function createLabHarness(seed = 4242) {
  const sim = createSimulation({
    seed,
    systems: [tetherGameplay, masslineThrow],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world = { currentSectorId: 'sector_helios_prime' };
  state.sandbox = true;

  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    hull: 250,
    hullMax: 250,
    mass: 50,
    radius: 8,
  });
  state.playerId = player.id;
  state.player = { flags: {}, credits: 25000, cargo: { items: {} } };

  const timeEffects = createTimeEffects(state);
  const helpers = {
    spawnEntity: (spec) => sim.spawn(spec),
    removeEntity: (id) => sim.despawn(id),
  };

  const ctx = {
    state,
    bus,
    timeEffects,
    helpers,
    simStep: () => { sim.runTicks(1); return true; },
  };

  return { sim, state, bus, player, ctx, timeEffects };
}

function stubCombatPhysics() {
  const joints = new Map();
  return {
    createAttachment(input) {
      const handle = { id: input.attachmentId, attachmentId: input.attachmentId };
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

function press(node) {
  for (const fn of (node && node.listeners && node.listeners.click) || []) fn();
}

function findText(root, text) {
  const walk = (node) => {
    if (!node) return null;
    if (node.textContent === text) return node;
    for (const child of node.children || []) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  return walk(root);
}

test('Wave B11: practice launch applies through the sandbox hook without a dev flag', () => {
  const { doc, makeNode } = createDomStub();
  doc.body = makeNode('body');
  doc.getElementById = () => null;
  const prevDoc = globalThis.document;
  globalThis.document = doc;
  const bus = createBus();
  const spawned = [];
  let nextId = 1;
  const ctx = {
    registry: { get() { return null; } },
    bus,
    state: {
      player: { credits: 0 },
      playerId: 1,
      entities: { get: () => ({ pos: { x: 0, z: 0 } }) },
      sandbox: false,
    },
    helpers: {
      spawnEntity(spec) {
        const entity = { id: nextId++, ...spec, alive: true };
        spawned.push(entity);
        return entity;
      },
    },
  };
  try {
    assert.equal(notePracticeLaunch(ctx), true);
    requestSandboxGame(bus, { targetDrones: { count: 2, distance: 120 } });
    bus.emit('game:started');
    assert.equal(spawned.length, 2, 'the sandbox hook must spawn the practice bodies');
    assert.equal(ctx.state.sandbox, true, 'the flight that follows is the physics toy');
    assert.ok(doc.body.children.length > 0, 'lab controls stay on screen after launch');
    const spawnBtn = findText(doc.body, 'Spawn bodies');
    const latchBtn = findText(doc.body, 'Latch');
    const throwBtn = findText(doc.body, 'Throw');
    assert.ok(spawnBtn && latchBtn && throwBtn, 'spawn, latch, and throw are visible controls');
    bus.emit('game:exitToMenu');
  } finally {
    globalThis.document = prevDoc;
  }
});

test('Wave B11: the lab is on the front door, not behind a dev flag', () => {
  const menu = readFileSync(fileURLToPath(new URL('../src/ui/screens/mainMenu.js', import.meta.url)), 'utf8');
  const door = readFileSync(fileURLToPath(new URL('../src/ui/screens/crucible.js', import.meta.url)), 'utf8');
  assert.match(menu, /action: 'sandbox', label: 'Sandbox'/);
  assert.match(door, /notePracticeLaunch\(ctx\)/);
  assert.match(door, /No records, no rewards/);
  assert.equal(typeof ensurePhysicsLabRoute, 'function');
});

test('Wave B11: Physics lab / Sandbox screen mounts on default route without dev flag', () => {
  const { doc, makeNode } = createDomStub();
  const prevDoc = globalThis.document;
  globalThis.document = doc;
  try {
    const rootEl = makeNode('div');
    const { ctx } = createLabHarness();
    sandboxScreen.mount(rootEl, ctx);

    assert.ok(rootEl.classList.contains('sf-sandbox'), 'sandbox CSS class must be applied to rootEl');
    assert.equal(rootEl.dataset.stamp, 'SANDBOX / TEST HARNESS');
    assert.ok(rootEl.children.length > 0, 'screen must mount DOM elements without IS_DEV barrier');
  } finally {
    sandboxScreen.onHide();
    globalThis.document = prevDoc;
  }
});

test('Wave B11: Lab controls slow time (time-scale) and restore cleanly', () => {
  const { ctx, timeEffects } = createLabHarness();

  // 1. Slow time to 0.5x
  const reqSlow = requestTimeScale(0.5);
  assert.equal(reqSlow.ok, true);
  const appliedSlow = applyCrucibleLabControl(ctx, reqSlow);
  assert.ok(appliedSlow, 'time scale request must apply');
  assert.equal(timeEffects.getEffectiveScale(), 0.5, 'effective time scale must be 0.5');

  // 2. Slow time to 0.25x
  const reqQuarter = requestTimeScale(0.25);
  applyCrucibleLabControl(ctx, reqQuarter);
  assert.equal(timeEffects.getEffectiveScale(), 0.25, 'effective time scale must be 0.25');

  // 3. Restore to 1x normal speed
  const reqNormal = requestTimeScale(1);
  applyCrucibleLabControl(ctx, reqNormal);
  assert.equal(timeEffects.getEffectiveScale(), 1.0, 'effective time scale must return to 1.0');
});

function createToyHarness(seed = 4242) {
  const helpers = { combatPhysics: stubCombatPhysics() };
  const sim = createSimulation({
    seed,
    helpers,
    systems: [actions, tetherGameplay, masslineThrow],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.sandbox = true;
  state.world = state.world || { currentSectorId: 'sector_helios_prime' };
  state.settings = state.settings || { gameplay: {} };
  state.settings.gameplay = state.settings.gameplay || {};
  state.settings.gameplay.masslineReleaseAssist = 'off';

  const player = sim.spawn({
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    hull: 250,
    hullMax: 250,
    mass: 50,
    radius: 8,
  });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 25000, cargo: { items: {} } };

  const timeEffects = createTimeEffects(state);
  const ctx = {
    state,
    bus,
    timeEffects,
    helpers: sim.helpers,
    registry: sim.registry,
    simStep: () => { sim.runTicks(1); return true; },
  };
  return { sim, state, bus, player, ctx, timeEffects };
}

test('Wave B11: Spawn, latch, throw, and reset work from the lab controls', () => {
  const flags = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  const { doc } = createDomStub();
  const prevDoc = globalThis.document;
  globalThis.document = doc;
  try {
    const { state, bus, player, ctx } = createToyHarness();
    let throws = 0;
    bus.on('massline:throw', () => { throws += 1; });
    const host = doc.createElement('div');
    const handle = mountCrucibleLabControls(ctx, host);
    try {
      const spawnBtn = findText(host, 'Spawn bodies');
      const latchBtn = findText(host, 'Latch');
      const throwBtn = findText(host, 'Throw');
      const resetBtn = findText(host, 'Reset room');
      assert.ok(spawnBtn && latchBtn && throwBtn && resetBtn);
      assert.equal(spawnBtn.disabled, false, 'spawn is a live control in the toy');

      press(spawnBtn);
      const spawnedTargets = [...state.entities.values()].filter((entity) => entity && entity.id !== player.id && entity.alive !== false);
      assert.equal(spawnedTargets.length, 3, 'three bodies spawn from the lab control');
      assert.equal(applyCrucibleLabControl(ctx, requestSpawnBodies(0)), false);

      const speedBefore = spawnedTargets.map((entity) => Math.hypot(entity.vel.x, entity.vel.z));
      press(latchBtn);
      assert.equal(state.player.tether && state.player.tether.active, true, 'latch uses the rope owner');
      const target = state.entities.get(state.player.tether.targetId);
      assert.ok(target && target.id !== player.id);

      press(throwBtn);
      assert.equal(throws, 1, 'throw is the real massline release');
      assert.equal(state.player.tether.active, false, 'the rope lets go');
      assert.equal(Math.hypot(target.vel.x, target.vel.z), speedBefore[spawnedTargets.indexOf(target)],
        'a throw does not invent speed');
      assert.equal(applyCrucibleLabControl(ctx, requestThrow()), false, 'a second throw needs a rope');

      press(resetBtn);
      const stillThere = [...state.entities.values()].filter((entity) => entity && entity.id !== player.id && entity.alive !== false);
      assert.equal(stillThere.length, 0, 'reset removes the bodies the lab spawned');
      assert.equal(applyCrucibleLabControl(ctx, requestResetRoom()).kind, 'resetRoom');
      assert.equal(applyCrucibleLabControl(ctx, requestLatch()), false);
    } finally {
      if (handle) handle.dispose();
    }
  } finally {
    restoreFeatureMaps(flags);
    globalThis.document = prevDoc;
  }
});

test('Wave B11: Deterministic input tape replay matches positions across repeat runs', () => {
  const tape = {
    events: [
      { tick: 5, code: 'KeyW', pressed: true },
      { tick: 25, code: 'KeyD', pressed: true },
      { tick: 45, code: 'KeyW', pressed: false },
    ],
    frames: [],
  };

  function runSimWithTape(seed) {
    const { sim, state, player } = createLabHarness(seed);
    const driver = createInputTapeDriver(tape);

    const positions = [];
    let sawThrust = false;
    for (let tick = 0; tick < 60; tick++) {
      state.tick = tick;
      driver.apply(state, tick, 1 / 60, { playerEntity: player });
      const moveZ = state.input && state.input.moveZ || 0;
      const moveX = state.input && state.input.moveX || 0;
      if (moveZ !== 0 || moveX !== 0) sawThrust = true;
      player.vel.z += moveZ * 2;
      player.vel.x += moveX * 2;
      sim.runTicks(1);
      positions.push({ x: player.pos.x, z: player.pos.z });
    }
    assert.equal(sawThrust, true, 'the tape must drive real flight keys');
    return positions;
  }

  const run1 = runSimWithTape(12345);
  const run2 = runSimWithTape(12345);

  assert.equal(run1.length, 60);
  assert.equal(run2.length, 60);

  for (let i = 0; i < 60; i++) {
    assert.equal(run1[i].x, run2[i].x, `tick ${i} X position must match deterministically`);
    assert.equal(run1[i].z, run2[i].z, `tick ${i} Z position must match deterministically`);
  }
});
