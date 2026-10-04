// SF-283 — restoring a scene does not replay yesterday's spectacle.
//
// The contract under test is the save boundary itself: durable consequences must REBUILD while
// one-shot presentation from the pre-save session must NOT echo into the restored session.
//
// (a) VFX: an explosion live when the save boundary lands is cleared, the restore's own bulk
//     `entity:destroyed{reason:'save_restore'}` sweep puts nothing on the glass, and a fresh
//     destroy AFTER the restore still explodes — suppression is scoped to the restore sweep,
//     not to destruction itself.
// (b) AUDIO: a one-shot cue deferred across the boundary (the clunk→confirm pattern is exactly
//     this shape) dies at save:loaded instead of ringing into the new session; desired
//     sustained loops are released, not resumed mid-phrase.
// (c) WRECKS: the durable kill marker is the consequence — it survives serialize→deserialize→
//     save:loaded and re-materializes its ONE bound wreck, but the kill's `aftermathWreck:recorded`
//     spectacle/news edge never re-fires, and a repeated load never stacks a second wreck.
//
// Three independent owners, one boundary event each. Asserts read authoritative collections
// (live presentation census, timer sets, entity lists), not merely event counts.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { audio } from '../src/audio/audioSystem.js';
import { createToasts } from '../src/ui/toasts.js';
import { createFloatingText } from '../src/ui/floatingText.js';

const { vfx } = await import('../src/render/vfx.js');

// ── shared harnesses ───────────────────────────────────────────────────────────────────────────

function makeVfxSystem() {
  const scene = new THREE.Scene();
  const handlers = new Map();
  const state = {
    playerId: 1,
    entities: new Map(),
    entityList: [],
    settings: { video: { particleQuality: 'medium' } },
    render: { scene },
  };
  const system = Object.create(vfx);
  system.init({
    state,
    bus: {
      on(name, fn) {
        const list = handlers.get(name) || [];
        list.push(fn);
        handlers.set(name, list);
        return () => {};
      },
      emit(name, payload) { for (const fn of handlers.get(name) || []) fn(payload); },
    },
    helpers: {},
  });
  system.__emitForTest = (name, payload) => { for (const fn of handlers.get(name) || []) fn(payload); };
  assert.ok(system._scene, 'vfx must attach to the provided render scene');
  return system;
}

function destructionCensus(system) {
  const snap = system.inspect();
  return snap.liveParticles + snap.liveSprites + snap.activeLights
    + (system._explosionRupture ? system._explosionRupture.activeCount : 0);
}

function advanceExplosion(system, dt = 0.2) {
  system._explosions.update(dt, system._explosionEmitter);
  system._explosionRupture?.update(
    Number.isFinite(system.state && system.state.simTime) ? system.state.simTime : 0,
    system.state && system.state.settings,
  );
}

// ── (a) the VFX boundary: live spectacle is cleared, the restore sweep is silent ───────────────

test('(a) save:loaded clears a live explosion, the save_restore sweep spawns none, fresh kills still explode', () => {
  const system = makeVfxSystem();
  const payload = { id: 42, type: 'asteroid', pos: { x: 10, z: -20 }, radius: 12, factionId: null };

  // Yesterday's spectacle is genuinely on the glass when the save boundary arrives.
  system._onDestroyed({ ...payload, reason: 'combat' });
  advanceExplosion(system);
  assert.ok(destructionCensus(system) > 0, 'precondition: a real explosion is live');

  // The restore sweep kills every entity with reason:'save_restore' — none of it is spectacle.
  for (let i = 0; i < 24; i++) {
    system._onDestroyed({ ...payload, id: 500 + i, pos: { x: i, z: -i }, reason: 'save_restore' });
  }
  // The loaded save's own boundary event clears what the pre-save session left on the glass.
  system.__emitForTest('save:loaded');
  advanceExplosion(system);
  assert.equal(destructionCensus(system), 0,
    'a restore leaves zero yesterday-spectacle on the glass');

  // The restored session is still alive to NEW spectacle.
  system._onDestroyed({ ...payload, id: 900, reason: 'combat' });
  advanceExplosion(system);
  assert.ok(destructionCensus(system) > 0,
    'a fresh destroy after restore still produces destruction VFX');
});

// ── (b) the AUDIO boundary: deferred one-shots die, sustained wants release ─────────────────────

function fakeCtx(now = 10) {
  const fakeNode = () => ({
    gain: { value: 0, setTargetAtTime() {}, setValueAtTime() {}, cancelScheduledValues() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
    frequency: { value: 0, setTargetAtTime() {}, setValueAtTime() {}, cancelScheduledValues() {} },
    Q: { value: 0 },
    detune: { value: 0 },
    delayTime: { value: 0 },
    pan: { value: 0 },
    playbackRate: { value: 1 },
    buffer: null,
    loop: false,
    connect() {}, disconnect() {}, start() {}, stop() {},
  });
  return {
    state: 'running', currentTime: now, sampleRate: 48000,
    destination: {},
    suspend() { this.state = 'suspended'; return Promise.resolve(); },
    resume() { this.state = 'running'; return Promise.resolve(); },
    createGain: fakeNode, createOscillator: fakeNode, createBiquadFilter: fakeNode,
    createBufferSource: fakeNode, createDynamicsCompressor: fakeNode, createStereoPanner: fakeNode,
    createDelay: fakeNode, createConvolver: fakeNode, createWaveShaper: fakeNode,
    createBuffer: (channels, len, rate) => ({ getChannelData: () => new Float32Array(len), sampleRate: rate }),
    addEventListener() {}, removeEventListener() {},
  };
}

test('(b) a deferred one-shot cue and desired loops die at save:loaded', async () => {
  const bus = createBus();
  const state = {
    playerId: 'player',
    simTime: 10,
    tick: 5,
    entities: new Map([['player', { id: 'player', alive: true, pos: { x: 0, z: 0 }, flags: {}, data: {} }]]),
    input: { fire: false },
    settings: { audio: { muted: false, master: 1, sfx: 1, music: 0.5 } },
    ui: {},
    audioRuntime: {},
  };
  const host = Object.create(audio);
  host.play = () => ({ ok: true });
  host.init({ state, bus, helpers: {} });
  host.rt.ctx = fakeCtx();
  // The real graph is built by _ensureContext against a live AudioContext; the boundary handler
  // re-applies mixer settings through it, so the fixture supplies the same bus-gain shape.
  const fakeGain = () => ({ gain: { value: 0, setTargetAtTime() {}, setValueAtTime() {}, cancelScheduledValues() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} });
  for (const busName of ['masterGain', 'sfxBus', 'musicBus', 'engineBus', 'ambientBus', 'combatBus', 'uiBus', 'commsBus']) {
    host.rt[busName] = fakeGain();
  }

  // A one-shot cue deferred the way dock clunk→confirm is deferred: scheduled pre-boundary.
  let fired = 0;
  const timerId = host._defer(() => { fired += 1; }, 20);
  assert.ok(timerId > 0, 'the deferred cue was scheduled');
  assert.ok(host.rt._timers.size >= 1, 'the deferral is tracked');

  // Sustained-loop wants from the pre-save session.
  host.rt._wantMining = { kind: 'mining' };
  host.rt._wantBeam = { beam_1: true };
  host.rt._wantDrillGrind = true;

  bus.emit('save:loaded', { slot: 'test' });

  assert.equal(host.rt._timers.size, 0, 'every pending deferred cue was cancelled at the boundary');
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(fired, 0, 'the deferred pre-save cue never rang into the restored session');
  assert.equal(host.rt._wantMining, null, 'the mining loop want did not resume');
  assert.deepEqual(host.rt._wantBeam, {}, 'beam wants did not resume');
  assert.equal(host.rt._wantDrillGrind, false, 'the drill grind want did not resume');
});

// ── (d) the DOM boundary: a live receipt/float dies at the boundary, new receipts still land ────

function installUiDom() {
  class El {
    constructor(tagName) {
      this.tagName = String(tagName).toUpperCase();
      this.id = '';
      this.className = '';
      this.textContent = '';
      this.innerHTML = '';
      this.children = [];
      this.parentNode = null;
      this.dataset = {};
      this.style = { setProperty() {} };
      this.attributes = new Map();
      this._listeners = new Map();
      this.classList = {
        add: (...n) => { this.className = [...this.className.split(/\s+/), ...n].filter(Boolean).join(' '); },
        remove: (...n) => { this.className = this.className.split(/\s+/).filter((c) => c && !n.includes(c)).join(' '); },
        contains: (n) => this.className.split(/\s+/).includes(n),
      };
    }
    get isConnected() { for (let n = this; n; n = n.parentNode) if (n === doc.body) return true; return false; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'id') this.id = String(value); }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    removeAttribute(name) { this.attributes.delete(name); }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    prepend(child) { if (child.parentNode) child.parentNode.removeChild(child); child.parentNode = this; this.children.unshift(child); return child; }
    append(...nodes) { for (const n of nodes) this.appendChild(n); }
    removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); child.parentNode = null; return child; }
    addEventListener(type, fn) { (this._listeners.get(type) || this._listeners.set(type, []).get(type)).push(fn); }
    removeEventListener() {}
    contains(node) { for (let n = node; n; n = n.parentNode) if (n === this) return true; return false; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    focus() { doc.activeElement = this; }
    blur() { if (doc.activeElement === this) doc.activeElement = doc.body; }
  }
  const body = new El('body');
  const head = new El('head');
  const doc = {
    body,
    head,
    documentElement: body,
    activeElement: body,
    createElement: (tag) => new El(tag),
    getElementById(id) {
      const visit = (node) => {
        if (node.id === id) return node;
        for (const c of node.children) { const hit = visit(c); if (hit) return hit; }
        return null;
      };
      return visit(body) || visit(head);
    },
    addEventListener() {}, removeEventListener() {},
  };
  for (const id of ['ui-root', 'hud', 'toasts', 'toast-live', 'screens']) {
    const el = new El('div'); el.id = id; body.appendChild(el);
  }
  const previous = { document: globalThis.document, window: globalThis.window, requestAnimationFrame: globalThis.requestAnimationFrame };
  globalThis.document = doc;
  globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {} };
  globalThis.requestAnimationFrame = () => 1;
  return {
    doc,
    restore() {
      globalThis.document = previous.document;
      globalThis.window = previous.window;
      globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    },
  };
}

test('(d) a live reward receipt and kill float die at save:loaded; the offline-income receipt still lands', () => {
  const { doc, restore } = installUiDom();
  try {
    const bus = createBus();
    const state = {
      playerId: 'player',
      entities: new Map(),
      settings: {},
      automation: { meta: { lastOfflineReceipt: { credited: 1200, upkeepCharged: 40, elapsedSec: 7200 } } },
    };
    const toasts = createToasts({ bus, state });
    const floats = createFloatingText({ state, helpers: {}, bus });
    const toastsEl = doc.getElementById('toasts');
    const liveToasts = () => toastsEl.children.filter((c) => String(c.className).includes('sf-toast'));

    // Yesterday's kill spectacle is live on both DOM layers when the boundary lands.
    bus.emit('entity:killed', { pos: { x: 5, z: 5 }, bountyCr: 300, killerId: 'player' });
    bus.emit('toast', { text: 'Docked at Helios', kind: 'info', ttl: 4 });
    assert.ok(liveToasts().length >= 1, 'precondition: a receipt is live');
    assert.equal(floats._activeCount() > 0, true, 'precondition: a combat float is live');

    bus.emit('save:loaded', { slot: 'x' });

    const textOf = (el) => {
      let out = el.textContent || '';
      for (const c of el.children || []) out += ' ' + textOf(c);
      return out;
    };
    const surviving = liveToasts().map(textOf);
    assert.equal(floats._activeCount(), 0,
      'yesterday floats must not ride into the restored session');
    assert.equal(surviving.filter((t) => t.includes('Docked at Helios') || t.includes('300 CR')).length, 0,
      'pre-save receipts must not ride into the restored session');
    // The offline-income payoff is a NEW receipt minted by the restored session — it lands
    // AFTER the boundary clear, proving the lane is live again on the same event.
    // (automationPayoff consumes lastOfflineReceipt once, on save:loaded.)
    assert.ok(surviving.some((t) => t.includes('While you were away')),
      'the restored session still publishes its own legitimate receipts');
  } finally {
    restore();
  }
});

// ── (c) the WRECK boundary: the marker rebuilds, the kill spectacle does not re-fire ───────────

function makeAftermathScene() {
  const bus = createBus();
  const state = {
    meta: { seed: 28301 },
    simTime: 60,
    tick: 900,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: 'sector_helios_prime' },
    aftermathWrecks: null,
  };
  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const e = { ...spec, id: nextId++, alive: true, data: spec.data || {} };
      state.entities.set(e.id, e);
      state.entityList.push(e);
      return e;
    },
    removeEntity(id, opts) {
      const e = state.entities.get(id);
      if (!e) return false;
      e.alive = false;
      if (opts && opts.immediate) {
        const i = state.entityList.indexOf(e);
        if (i >= 0) state.entityList.splice(i, 1);
        state.entities.delete(id);
      }
      return true;
    },
  };
  const sys = Object.create(aftermathWrecks);
  sys.init({ state, bus, helpers, registry: { get() { return null; } } });
  const recorded = [];
  const spawned = [];
  bus.on('aftermathWreck:recorded', (p) => recorded.push(p));
  bus.on('aftermathWreck:spawned', (p) => spawned.push(p));
  return { bus, state, sys, recorded, spawned,
    wrecks: () => state.entityList.filter((e) => e && e.alive !== false && e.type === 'wreck') };
}

test('(c) the durable marker rebuilds exactly one wreck; the recorded spectacle never re-fires', () => {
  const { bus, state, sys, recorded, spawned, wrecks } = makeAftermathScene();

  // A real kill-side consequence is recorded through the owner's ordinary offer seam.
  const offer = sys.offerRecoveryWreck({
    sectorId: 'sector_helios_prime',
    victimId: 'victim_sf283',
    pos: { x: 120, z: -40 },
    salvagePool: { cmdty_scrap_metal: 3 },
    victimLabel: 'SF-283 hulk',
    source: 'test:sf283',
  });
  assert.ok(offer && offer.markerId, 'the kill recorded a durable marker');
  assert.equal(recorded.length, 1, 'the kill fired its one recorded spectacle edge');
  assert.equal(wrecks().length, 1, 'the live wreck materialized in-sector');
  const spawnCountAtRecord = spawned.length;
  assert.equal(spawnCountAtRecord, 1, 'one bind event for the one wreck');

  // Save → load through the owner's own serializer (JSON round-trip, as the real envelope does).
  const saved = JSON.parse(JSON.stringify(sys.serialize()));
  // The restore sequence: save:restoring latches → state bag swaps → save:loaded rematerializes.
  bus.emit('save:restoring', {});
  // The outgoing session's live bodies are removed by the envelope restore, not the marker.
  for (const e of state.entityList.slice()) {
    if (e.type === 'wreck') { e.alive = false; state.entityList.splice(state.entityList.indexOf(e), 1); state.entities.delete(e.id); }
  }
  sys.deserialize(saved);
  bus.emit('save:loaded', { slot: 'test' });

  assert.equal(recorded.length, 1,
    'the kill spectacle/news edge never re-fired across the restore');
  const markers = state.aftermathWrecks.bySector['sector_helios_prime'] || [];
  assert.equal(markers.length, 1, 'the durable marker survived the restore');
  assert.equal(markers[0].markerId, offer.markerId, 'same durable identity, not a re-record');
  assert.equal(wrecks().length, 1, 'exactly one bound wreck rematerialized');
  assert.equal(spawned.length, spawnCountAtRecord + 1,
    'the rebuild emitted one fresh bind event for current presentation — not a replay');

  // A repeated resume still converges on the same marker and a single live wreck.
  const saved2 = JSON.parse(JSON.stringify(sys.serialize()));
  bus.emit('save:restoring', {});
  for (const e of state.entityList.slice()) {
    if (e.type === 'wreck') { e.alive = false; state.entityList.splice(state.entityList.indexOf(e), 1); state.entities.delete(e.id); }
  }
  sys.deserialize(saved2);
  bus.emit('save:loaded', { slot: 'test2' });
  assert.equal(recorded.length, 1, 'a second restore still never re-fires the spectacle');
  assert.equal(wrecks().length, 1, 'a second restore still materializes exactly one wreck');
});
