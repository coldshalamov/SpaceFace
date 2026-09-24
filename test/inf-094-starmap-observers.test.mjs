import test from 'node:test';
import assert from 'node:assert/strict';

import { starmapScreen } from '../src/ui/screens/starmap.js';

// INF-094: the star map's live observers must return to baseline across repeated mount
// cycles. Before the fix the ResizeObserver had no teardown path (and the screen no
// dispose), so every remount stacked another observer on a detached root.
let liveObservers = 0;

function installObserver() {
  const prev = globalThis.ResizeObserver;
  liveObservers = 0;
  globalThis.ResizeObserver = class {
    constructor() { this.dead = false; liveObservers += 1; }
    observe() {}
    unobserve() {}
    disconnect() { if (!this.dead) { this.dead = true; liveObservers -= 1; } }
  };
  return () => {
    if (prev === undefined) delete globalThis.ResizeObserver;
    else globalThis.ResizeObserver = prev;
  };
}

function fakeBus() {
  const counts = new Map();
  return {
    counts,
    on(event, fn) {
      counts.set(event, (counts.get(event) || 0) + 1);
      return () => counts.set(event, Math.max(0, (counts.get(event) || 0) - 1));
    },
    emit() {},
    subs(event) { return counts.get(event) || 0; },
  };
}

function boot() {
  const bus = fakeBus();
  const def = Object.create(starmapScreen);
  def._root = { querySelector: () => ({}) };
  def._ctx = { bus };
  def._ro = null;
  def._fieldListener = null;
  def._fieldLiveUnsubs = null;
  def._animFrame = null;
  def._visible = false;
  return { def, bus };
}

test('INF-094 repeated mount cycles return observers and subscriptions to baseline', () => {
  const restore = installObserver();
  try {
    const { def, bus } = boot();
    assert.equal(typeof def.dispose, 'function', 'the screen owns a teardown');
    for (let i = 0; i < 3; i++) {
      def._root = { querySelector: () => ({}) }; // remount hands the screen a fresh root
      assert.equal(def._ensureResizeObserver(), true, 'observer (re)attaches');
      assert.equal(def._ensureFieldLive(def._ctx), true, 'field feed (re)attaches');
      def.dispose();
      assert.equal(liveObservers, 0, `cycle ${i}: no orphaned observer`);
      assert.equal(bus.subs('sectorsim:fieldAdvanced'), 0, `cycle ${i}: field sub drained`);
      assert.equal(bus.subs('sectorsim:transitOutcome'), 0, `cycle ${i}: transit sub drained`);
    }
    assert.equal(liveObservers, 0);
  } finally { restore(); }
});

test('INF-094 duplicate initialization within one mount does not stack', () => {
  const restore = installObserver();
  try {
    const { def, bus } = boot();
    def._ensureResizeObserver();
    def._ensureResizeObserver();
    def._ensureFieldLive(def._ctx);
    def._ensureFieldLive(def._ctx);
    assert.equal(liveObservers, 1, 'one observer, not two');
    assert.equal(bus.subs('sectorsim:fieldAdvanced'), 1);
    assert.equal(bus.subs('sectorsim:transitOutcome'), 1);
    def.dispose();
    def.dispose();
    assert.equal(liveObservers, 0, 'double dispose stays safe');
  } finally { restore(); }
});

test('INF-094 the screen re-opens cleanly after a dispose', () => {
  const restore = installObserver();
  try {
    const { def, bus } = boot();
    def._ensureResizeObserver();
    def._ensureFieldLive(def._ctx);
    def.dispose();
    // next opening: fresh root, observers re-attach exactly once and fire safely while hidden.
    def._root = { querySelector: () => ({}) };
    assert.equal(def._ensureResizeObserver(), true);
    assert.equal(def._ensureFieldLive(def._ctx), true);
    assert.equal(liveObservers, 1);
    def._visible = false;
    def._fieldListener();
    assert.equal(liveObservers, 1, 'hidden refresh path disturbs nothing');
    def.dispose();
    assert.equal(liveObservers, 0);
    assert.equal(bus.subs('sectorsim:fieldAdvanced'), 0);
  } finally { restore(); }
});
