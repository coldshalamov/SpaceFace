// Four event seams emitted by the massline and never subscribed by a player sense.
// Each one now reaches the stunt callout. Seed 4242 is the script, not a sim roll.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createStuntCallout, calloutTextFor, handlineSenseLine } from '../src/ui/stuntCallout.js';

const SEED = 4242;

test('successive catches replace their displayed grade on the shared callout line', () => {
  const { callout, bus } = mount();
  try {
    bus.emit('tether:snapCatch', { rating: 'clean', landTangentialSpeed: 120 });
    assert.match(calloutTextFor(callout.root), /CLEAN SNAG/);
    bus.emit('tether:snapCatch', { rating: 'rough', landTangentialSpeed: 40 });
    assert.match(calloutTextFor(callout.root), /ROUGH SNAG/);
    assert.doesNotMatch(calloutTextFor(callout.root), /CLEAN SNAG/);
  } finally { callout.destroy(); }
});

function fakeDocument() {
  function createElement() {
    const el = {
      className: '', textContent: '', hidden: false, style: {}, children: [],
      classList: { add() {}, remove() {}, contains() { return false; } },
      appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
      removeChild(child) {
        const i = this.children.indexOf(child);
        if (i >= 0) this.children.splice(i, 1);
        return child;
      },
      setAttribute() {},
      getAttribute() { return null; },
    };
    return el;
  }
  const head = { children: [], appendChild(c) { this.children.push(c); } };
  const body = { children: [], appendChild(c) { this.children.push(c); } };
  return {
    createElement,
    getElementById() { return null; },
    head,
    body,
    documentElement: { classList: { contains() { return false; } } },
  };
}

function fakeBus() {
  const handlers = new Map();
  return {
    on(event, cb) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(cb);
      return () => {};
    },
    emit(event, payload) {
      for (const cb of handlers.get(event) || []) cb(payload);
    },
  };
}

function mount() {
  const doc = fakeDocument();
  const bus = fakeBus();
  const state = {
    seed: SEED,
    mode: 'flight',
    run: null,
    ui: { screenStack: [], docked: false },
    playerId: 1,
    settings: { video: { motionReduce: true } },
  };
  const callout = createStuntCallout({ state, bus, doc });
  return { bus, callout };
}

test('massline:releaseWindow close reaches a callout; the open edge stays quiet', () => {
  assert.equal(handlineSenseLine('massline:releaseWindow', { open: true }), null);
  const { bus, callout } = mount();
  bus.emit('massline:releaseWindow', { open: false, tick: SEED });
  callout.update(0);
  assert.match(calloutTextFor(callout.root), /WINDOW CLOSED/);
  callout.destroy();
});

test('massline:rideStarted reaches a callout naming the anchor speed', () => {
  const { bus, callout } = mount();
  bus.emit('massline:rideStarted', { anchorSpeed: 86.4, targetId: 2 });
  callout.update(0);
  const text = calloutTextFor(callout.root);
  assert.match(text, /RIDE/);
  assert.match(text, /86/);
  callout.destroy();
});

test('tether:snagCleared reaches a callout that the line is clear', () => {
  const { bus, callout } = mount();
  bus.emit('tether:snagCleared', { reason: 'cleared', tick: SEED });
  callout.update(0);
  assert.match(calloutTextFor(callout.root), /LINE CLEAR/);
  callout.destroy();
});

test('massline:throw reaches a callout naming the throw speed', () => {
  const { bus, callout } = mount();
  bus.emit('massline:throw', { releaseId: 'massline:throw:4242:9', payloadSpeed: 133.2 });
  callout.update(0);
  const text = calloutTextFor(callout.root);
  assert.match(text, /THROWN/);
  assert.match(text, /133/);
  callout.destroy();
});

test('tether:snapCatch names the grade and the speed kept; an unrated snap stays quiet', () => {
  assert.equal(handlineSenseLine('tether:snapCatch', { rating: 'missed' }), null);
  const { bus, callout } = mount();
  bus.emit('tether:snapCatch', { rating: 'clean', landTangentialSpeed: 41.6, targetId: 2 });
  callout.update(0);
  const text = calloutTextFor(callout.root);
  assert.match(text, /CLEAN SNAG/);
  assert.match(text, /42/);
  callout.destroy();
});

test('tether:reelPump warns only when the stroke is hot', () => {
  assert.equal(handlineSenseLine('tether:reelPump', { risk: 'low', strain: 0.2 }), null);
  assert.equal(handlineSenseLine('tether:reelPump', { risk: 'medium', strain: 0.5 }), null);
  const { bus, callout } = mount();
  bus.emit('tether:reelPump', { risk: 'medium', strain: 0.5, targetId: 2 });
  callout.update(0);
  assert.equal(calloutTextFor(callout.root), '');
  bus.emit('tether:reelPump', { risk: 'high', strain: 0.8, targetId: 2 });
  callout.update(0);
  assert.match(calloutTextFor(callout.root), /PUMP HOT/);
  callout.destroy();
});
