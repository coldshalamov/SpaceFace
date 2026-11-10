// Screen warm lifecycle + frame/queue machinery contracts (W30).
// - releaseScreen must clear the painted stamp so a re-queued screen warms again.
// - catchUpFarRecord must stamp table.version when a within-cell advance crosses the
//   memoized collect disc's rim (the only motion class the version memo cannot see).
// - endRenderEntityFrame skips the byId eviction walk when no id can be stale.
// - hoistDeadlineGlassMeshBuilds performs a stable partition with identical ordering.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createScreenManager } from '../src/ui/screenManager.js';
import { createGameState } from '../src/core/gameState.js';
import {
  ensureFarActorTable,
  insertFarActor,
  catchUpFarRecord,
  FAR_ACTOR_CELL,
} from '../src/world/farActorTable.js';
import {
  createRenderEntityFrame,
  beginRenderEntityFrame,
  classifyRenderEntity,
  endRenderEntityFrame,
} from '../src/render/renderEntityFrame.js';
import { hoistDeadlineGlassMeshBuilds } from '../src/render/renderer.js';

// ── minimal DOM ──────────────────────────────────────────────────────────────

function installDom() {
  const elements = new Map();
  class FakeClassList {
    constructor() { this.values = new Set(); }
    add(...v) { v.forEach((x) => this.values.add(x)); }
    remove(...v) { v.forEach((x) => this.values.delete(x)); }
    toggle(v, force) {
      if (force === undefined) force = !this.values.has(v);
      if (force) this.values.add(v); else this.values.delete(v);
      return force;
    }
    contains(v) { return this.values.has(v); }
  }
  class FakeElement {
    constructor(tag = 'div') {
      this.tagName = String(tag).toUpperCase();
      this.children = [];
      this.childNodes = this.children;
      this.parentNode = null;
      this.style = {};
      this.dataset = {};
      this.classList = new FakeClassList();
      this.attributes = new Map();
      this.inert = false;
    }
    set className(v) {
      this._className = String(v || '');
      this.classList.values = new Set(this._className.split(/\s+/).filter(Boolean));
    }
    get className() { return this._className; }
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
    removeChild(c) {
      const i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);
      c.parentNode = null;
      return c;
    }
    setAttribute(n, v) { this.attributes.set(n, String(v)); }
    getAttribute(n) { return this.attributes.get(n) ?? null; }
    removeAttribute(n) { this.attributes.delete(n); }
    addEventListener() {}
    removeEventListener() {}
    querySelectorAll() { return []; }
    querySelector() { return null; }
    contains(node) { for (let n = node; n; n = n.parentNode) if (n === this) return true; return false; }
    focus() {}
  }
  const body = new FakeElement('body');
  const screens = new FakeElement('div');
  const backdrop = new FakeElement('div');
  const hud = new FakeElement('div');
  elements.set('screens', screens);
  elements.set('modal-backdrop', backdrop);
  elements.set('hud', hud);
  body.appendChild(screens); body.appendChild(backdrop); body.appendChild(hud);
  const rafQueue = [];
  globalThis.document = {
    body,
    documentElement: body,
    activeElement: null,
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => new FakeElement(tag),
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.window = { innerWidth: 1920, innerHeight: 1080, addEventListener() {}, removeEventListener() {} };
  globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
  globalThis.cancelAnimationFrame = () => {};
  return {
    screens,
    runRaf() { const q = rafQueue.splice(0); for (const cb of q) cb(0); },
  };
}

// ── releaseScreen painted reset ──────────────────────────────────────────────

test('releaseScreen clears the painted stamp so the screen can warm again', () => {
  const dom = installDom();
  const state = createGameState(8);
  state.mode = 'menu';
  const mgr = createScreenManager({ state, bus: { on() {}, emit() {} } });
  let mounts = 0;
  const els = [];
  mgr.register({
    id: 'newGame',
    mount(el) { mounts++; els.push(el); el.appendChild(document.createElement('div')); },
  });

  const firstRec = mgr.prewarm('newGame');
  mgr.paintWarm('newGame');
  const first = els[0];
  assert.equal(firstRec.painted, true, 'first warm stamps the record painted');
  // The warm is same-task now (an rAF-spanned hidden window raced modal-semantics probes):
  // visibility flips hidden for the forced layout pass and is restored before paintWarm returns.
  assert.equal(first.style.visibility, '', 'same-task warm restores visibility before returning');

  mgr.releaseScreen('newGame');
  assert.equal(first.parentNode, null, 'release drops the element');
  assert.equal(firstRec.painted, false, 'release clears the warm stamp');

  mgr.prewarm('newGame');
  assert.equal(mounts, 2, 'prewarm remounts the released screen');
  const second = els[1];
  assert.equal(firstRec.painted, false);
  mgr.paintWarm('newGame');
  assert.equal(firstRec.painted, true,
    'a released screen must warm again — a stale painted stamp skips the pass forever');
  assert.equal(second.style.visibility, '', 'second warm also restores in the same task');
});

// ── catchUpFarRecord entrant stamp ───────────────────────────────────────────

test('within-cell catch-up into the collect disc stamps table.version', () => {
  const state = { world: {} };
  const table = ensureFarActorTable(state);
  insertFarActor(state, { id: 7, type: 'ship', pos: { x: 30, z: 0 }, vel: { x: 15, z: 0 }, alive: true }, 0);
  const rec = table.byId.get(7);
  assert.ok(rec, 'row registered');
  const cell = Math.floor(30 / FAR_ACTOR_CELL);
  // Disc centred so the row starts just outside its rim and a 1s advance lands inside,
  // both endpoints in the same 400-WU cell.
  table.collectDisc = { x: 50, z: 0, r: 19 };
  const v0 = table.version;
  catchUpFarRecord(rec, 1, table);
  assert.equal(Math.floor(rec.pos.x / FAR_ACTOR_CELL), cell, 'advance stayed inside one cell');
  assert.equal(table.version, v0 + 1, 'rim crossing bumps the memo version');
});

test('within-cell catch-up entirely inside the disc does not bump', () => {
  const state = { world: {} };
  const table = ensureFarActorTable(state);
  insertFarActor(state, { id: 8, type: 'ship', pos: { x: 40, z: 0 }, vel: { x: 5, z: 0 }, alive: true }, 0);
  const rec = table.byId.get(8);
  table.collectDisc = { x: 50, z: 0, r: 30 };
  const v0 = table.version;
  catchUpFarRecord(rec, 1, table);
  assert.equal(table.version, v0, 'inside→inside motion must not churn the memo');
});

test('within-cell catch-up outside the disc does not bump', () => {
  const state = { world: {} };
  const table = ensureFarActorTable(state);
  insertFarActor(state, { id: 9, type: 'ship', pos: { x: 300, z: 0 }, vel: { x: 10, z: 0 }, alive: true }, 0);
  const rec = table.byId.get(9);
  table.collectDisc = { x: 0, z: 0, r: 50 };
  const v0 = table.version;
  catchUpFarRecord(rec, 1, table);
  assert.equal(table.version, v0, 'outside→outside motion stays quiet');
});

// ── endRenderEntityFrame eviction gate ───────────────────────────────────────

function ent(id) { return { id, alive: true, type: 'ship' }; }
function mesh() { return { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, userData: {} }; }

test('endRenderEntityFrame evicts stale ids only when the map outgrew the frame', () => {
  const frame = createRenderEntityFrame();
  beginRenderEntityFrame(frame);
  classifyRenderEntity(frame, ent(1), mesh());
  classifyRenderEntity(frame, ent(2), mesh());
  classifyRenderEntity(frame, ent(3), mesh());
  endRenderEntityFrame(frame);
  assert.equal(frame.byId.size, 3);

  beginRenderEntityFrame(frame);
  classifyRenderEntity(frame, ent(1), mesh());
  classifyRenderEntity(frame, ent(2), mesh());
  endRenderEntityFrame(frame);
  assert.equal(frame.byId.size, 2, 'unseen id 3 evicted when the gate opens');
  assert.equal(frame.byId.has(3), false);

  beginRenderEntityFrame(frame);
  classifyRenderEntity(frame, ent(1), mesh());
  classifyRenderEntity(frame, ent(2), mesh());
  endRenderEntityFrame(frame);
  assert.equal(frame.byId.size, 2, 'steady set stays exact');
});

// ── hoistDeadlineGlassMeshBuilds stable partition ────────────────────────────

test('hoistDeadlineGlassMeshBuilds keeps scan order within both partitions', () => {
  const ents = new Map();
  const mk = (id) => { const e = { id, alive: true, type: 'ship' }; ents.set(id, e); return e; };
  for (const id of [11, 12, 13, 14, 15]) mk(id);
  const glass = new Set([12, 14]);
  const owner = {
    _meshBuildQueue: [1, 11, 12, 2, 13, 14, 15, 3],
    _meshBuildQueueHead: 1,
    state: {
      entities: ents,
      playerId: 0,
      render: { activityFrame: { renderGlassIds: glass } },
      world: {},
    },
  };
  const glassCount = hoistDeadlineGlassMeshBuilds(owner);
  assert.equal(glassCount, 2);
  assert.deepEqual(owner._meshBuildQueue, [1, 12, 14, 11, 2, 13, 15, 3]);
});

test('hoistDeadlineGlassMeshBuilds reports the glass count when the prefix is already glass', () => {
  const ents = new Map();
  const mk = (id) => { const e = { id, alive: true, type: 'ship' }; ents.set(id, e); return e; };
  for (const id of [21, 22, 23]) mk(id);
  const owner = {
    _meshBuildQueue: [21, 22, 23],
    _meshBuildQueueHead: 0,
    state: {
      entities: ents,
      playerId: 0,
      render: { activityFrame: { renderGlassIds: new Set([21, 22]) } },
      world: {},
    },
  };
  const glassCount = hoistDeadlineGlassMeshBuilds(owner);
  // Already-ordered glass is still work the caller must build — the count contract
  // gates deadlineGlassOnly admission, not whether a permutation was needed.
  assert.equal(glassCount, 2);
  assert.deepEqual(owner._meshBuildQueue, [21, 22, 23]);
});
