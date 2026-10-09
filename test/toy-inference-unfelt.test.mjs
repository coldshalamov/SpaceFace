// Three emitted seams with no player subscriber in EVENT_ROUTING. They now
// reach the stunt callout. Seed 4242. EVENT_ROUTING.md is not edited.
import test from 'node:test';
import assert from 'node:assert/strict';

import { calloutTextFor, createStuntCallout, handlineSenseLine } from '../src/ui/stuntCallout.js';

const SEED = 4242;

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
  return {
    createElement,
    getElementById() { return null; },
    head: { children: [], appendChild(c) { this.children.push(c); } },
    body: { children: [], appendChild(c) { this.children.push(c); } },
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
  const bus = fakeBus();
  const state = {
    seed: SEED,
    mode: 'flight',
    run: null,
    ui: { screenStack: [], docked: false },
    playerId: 1,
    settings: { video: { motionReduce: true } },
  };
  const callout = createStuntCallout({ state, bus, doc: fakeDocument() });
  return { bus, callout };
}

test('the three sense lines name the seam and stay quiet when the edge is not a feel', () => {
  assert.equal(handlineSenseLine('massline:bridleCut', { attachmentId: 4 }).name, 'BRIDLE CUT');
  assert.equal(handlineSenseLine('well:fling', { primed: false }), null);
  assert.equal(handlineSenseLine('well:fling', { primed: true, targetId: 1 }).name, 'FLING');
  const shunt = handlineSenseLine('weapons:inertialShunt', { targetId: 2, targetDeltaV: 18.4 });
  assert.equal(shunt.name, 'SHUNT');
  assert.equal(shunt.detail, '18');
});

test('seed 4242: bridle cut, the player fling, and the player shunt reach the glass', () => {
  const { bus, callout } = mount();
  try {
    bus.emit('well:fling', { primed: true, targetId: 9, victimId: 9, tick: SEED });
    callout.update(0);
    assert.equal(calloutTextFor(callout.root), '', 'another body\'s fling stays quiet');

    bus.emit('weapons:inertialShunt', { shunterId: 4, targetId: 5, targetDeltaV: 11 });
    callout.update(0);
    assert.equal(calloutTextFor(callout.root), '', 'a shunt the player is not in stays quiet');

    bus.emit('massline:bridleCut', { attachmentId: 3, sourceId: 1, targetId: 2 });
    callout.update(0);
    assert.match(calloutTextFor(callout.root), /BRIDLE CUT/);

    bus.emit('well:fling', { primed: true, targetId: 1, victimId: 1, actorId: 1, tick: SEED });
    callout.update(0);
    assert.match(calloutTextFor(callout.root), /FLING/);

    bus.emit('weapons:inertialShunt', { shunterId: 1, targetId: 2, targetDeltaV: 18.2 });
    callout.update(0);
    const text = calloutTextFor(callout.root);
    assert.match(text, /SHUNT/);
    assert.match(text, /18/);
  } finally { callout.destroy(); }
});
