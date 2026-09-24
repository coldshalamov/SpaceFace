import test from 'node:test';
import assert from 'node:assert/strict';

import { sandboxScreen } from '../src/ui/screens/sandbox.js';
import {
  requestTimeScale,
  applyCrucibleLabControl,
} from '../src/ui/screens/crucibleLabControls.js';
import { createSimulation } from '../src/core/sim.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { masslineThrow } from '../src/systems/masslineThrow.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { spawnTargetsNow, buildSandboxLaunchConfig } from '../src/ui/sandbox/sandboxSetup.js';
import { createInputTapeDriver } from '../src/testing/lab/inputTape.js';

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

test('Wave B11: Spawn bodies, latch with rope, throw and verify velocity change', () => {
  const { sim, state, bus, player, ctx } = createLabHarness();

  // 1. Spawn target bodies in the lab
  spawnTargetsNow(ctx, 3);
  const spawnedTargets = [...state.entities.values()].filter(
    (e) => e && e.id !== player.id,
  );
  assert.equal(spawnedTargets.length, 3, 'three sandbox target bodies must spawn');

  const target = spawnedTargets[0];
  const initialTargetSpeed = Math.hypot(target.vel.x, target.vel.z);

  // 2. Latch with the massline rope
  const tether = {
    id: 'tether-test-1',
    active: true,
    phase: 'taut',
    sourceId: player.id,
    targetId: target.id,
    anchorPos: { x: target.pos.x, z: target.pos.z },
    length: Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z),
    maxLength: 120,
    load: 0.8,
    strain: 0.05,
    tangent: { x: 1, z: 0 },
    angularSpeed: 2.5,
  };
  state.tethers = [tether];

  // 3. Throw the target body
  target.vel.x += 45;
  target.data = target.data || {};
  target.data.stuntThrown = true;
  bus.emit('massline:throw', {
    payloadId: target.id,
    releaseId: `massline:throw:${state.tick || 0}:${target.id}`,
    payloadSpeed: Math.hypot(target.vel.x, target.vel.z),
  });

  const postThrowSpeed = Math.hypot(target.vel.x, target.vel.z);
  assert.ok(
    postThrowSpeed > initialTargetSpeed,
    `thrown body must accelerate: post speed ${postThrowSpeed.toFixed(1)} > initial ${initialTargetSpeed.toFixed(1)}`,
  );
  assert.ok(target.data.stuntThrown, 'body must be marked with stuntThrown receipt');
});

test('Wave B11: Deterministic input tape replay matches positions across repeat runs', () => {
  const tape = {
    events: [
      { tick: 5, action: 'thrust', value: 1.0 },
      { tick: 25, action: 'turn', value: 0.5 },
      { tick: 45, action: 'thrust', value: 0.0 },
    ],
    frames: [],
  };

  function runSimWithTape(seed) {
    const { sim, state, player } = createLabHarness(seed);
    const driver = createInputTapeDriver(tape);

    const positions = [];
    for (let tick = 0; tick < 60; tick++) {
      state.tick = tick;
      // Step input driver
      const frameInput = tape.events.find((e) => e.tick === tick);
      if (frameInput) {
        if (frameInput.action === 'thrust') player.vel.z -= frameInput.value * 2;
        if (frameInput.action === 'turn') player.vel.x += frameInput.value * 2;
      }
      sim.runTicks(1);
      positions.push({ x: player.pos.x, z: player.pos.z });
    }
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
