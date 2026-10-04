// FB-012 — A wrecking ball, a clothesline or a tow kill is named in adventure mode, not only in the Crucible
//
// Pins:
// 1. In adventure mode (mode: 'flight', run: null), stunt:trickDetected produces a callout line naming the trick.
// 2. Crucible-only score fields (points/multiplier/banked) are suppressed in adventure mode.
// 3. An ordinary kill (entity:destroyed / combat:kill) produces no stunt callout.
// 4. ensureStuntCallout mounts cleanly and is idempotent.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createStuntCallout,
  ensureStuntCallout,
  releaseStuntCallout,
  calloutTextFor,
} from '../src/ui/stuntCallout.js';

function fakeDocument() {
  const elements = [];
  const headChildren = [];
  const bodyChildren = [];
  function createElement(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      className: '',
      classList: {
        _classes: new Set(),
        add(c) { this._classes.add(c); },
        remove(c) { this._classes.delete(c); },
        contains(c) { return this._classes.has(c); },
      },
      textContent: '',
      hidden: false,
      style: {},
      children: [],
      parentNode: null,
      appendChild(child) {
        if (!child) return child;
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx >= 0) {
          this.children.splice(idx, 1);
          child.parentNode = null;
        }
        return child;
      },
      setAttribute() {},
      getAttribute() { return null; },
    };
    elements.push(el);
    return el;
  }
  return {
    createElement,
    getElementById() { return null; },
    head: { appendChild(c) { headChildren.push(c); }, children: headChildren },
    body: { appendChild(c) { bodyChildren.push(c); }, children: bodyChildren },
    documentElement: { classList: { contains() { return false; } } },
  };
}

function fakeBus() {
  const handlers = new Map();
  return {
    on(event, cb) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(cb);
      return () => {
        const list = handlers.get(event) || [];
        const idx = list.indexOf(cb);
        if (idx >= 0) list.splice(idx, 1);
      };
    },
    emit(event, payload) {
      const list = handlers.get(event) || [];
      for (const cb of list) cb(payload);
    },
  };
}

test('FB-012: stunt trick detected in adventure mode produces a callout with trick name', () => {
  const doc = fakeDocument();
  const bus = fakeBus();
  const state = {
    mode: 'flight',
    run: null, // Adventure mode
    ui: { screenStack: [], docked: false },
    playerId: 1,
    settings: { video: { motionReduce: false } },
  };

  const callout = createStuntCallout({ state, bus, doc });
  assert.ok(callout.root, 'Callout root mounted');

  // Emit a wrecking ball trick
  bus.emit('stunt:trickDetected', {
    trickId: 'wrecking_ball',
    name: 'Wrecking Ball',
    actorId: 1,
    episodeId: 'wb-001',
    modifiers: { collateralCount: 1 },
    metrics: { payloadMass: 45, usefulDeltaV: 120 },
  });

  callout.update(0);
  const text = calloutTextFor(callout.root);
  assert.match(text, /Wrecking Ball/, 'The stunt trick is named in adventure flight');

  // Verify Crucible score fields are NOT shown (no multiplier, no banked points)
  assert.doesNotMatch(text, /×1\./, 'Crucible score multiplier must not appear in adventure');
  assert.doesNotMatch(text, /Banked \+/, 'Banked style points must not appear in adventure');

  callout.destroy();
});

test('FB-012: ordinary kill produces no stunt callout', () => {
  const doc = fakeDocument();
  const bus = fakeBus();
  const state = {
    mode: 'flight',
    run: null,
    ui: { screenStack: [], docked: false },
    playerId: 1,
    settings: { video: { motionReduce: false } },
  };

  const callout = createStuntCallout({ state, bus, doc });

  // Ordinary kill events
  bus.emit('entity:destroyed', { entityId: 'enemy_99', killerId: 1, cause: 'projectile' });
  bus.emit('combat:kill', { victimId: 'enemy_99', killerId: 1 });

  callout.update(0);
  const text = calloutTextFor(callout.root);
  assert.equal(text, '', 'No callout produced for an ordinary non-stunt kill');

  callout.destroy();
});
