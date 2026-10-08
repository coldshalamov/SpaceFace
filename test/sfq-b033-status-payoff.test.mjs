// SFQ-B033 — primed, pinned, gooed, tumbling, and burning say their payoff.
// The combinations already resolve in the status service; this is the glass.
// Seed 4242.
import test from 'node:test';
import assert from 'node:assert/strict';

import { bombPrimeLine, statusPayoffLine } from '../src/data/statusPayoffs.js';
import { calloutTextFor, createStuntCallout } from '../src/ui/stuntCallout.js';

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

function mount(playerId = 1) {
  const bus = fakeBus();
  const state = {
    seed: SEED,
    mode: 'flight',
    run: null,
    ui: { screenStack: [], docked: false },
    playerId,
    settings: { video: { motionReduce: true } },
  };
  const callout = createStuntCallout({ state, bus, doc: fakeDocument() });
  return { bus, callout, state };
}

test('the catalog sentences name the payoff and stay quiet for an unknown status', () => {
  assert.equal(statusPayoffLine('status_pinned').name, 'PINNED');
  assert.equal(statusPayoffLine('status_pinned').detail, 'HEAVIER');
  assert.equal(statusPayoffLine('status_goo').name, 'GOOED');
  assert.equal(statusPayoffLine('status_tumbling').detail, 'NO HELM');
  assert.equal(statusPayoffLine('status_burning').name, 'BURNING');
  assert.equal(statusPayoffLine('status_scrambled').detail, 'ION + HEAT');
  assert.equal(statusPayoffLine('status_unmoored').name, 'UNMOORED');
  assert.equal(statusPayoffLine('status_gravity_marked'), null);
  assert.equal(statusPayoffLine('nope'), null);
  assert.equal(bombPrimeLine({ bombId: 8, trigger: 'proximity' }).name, 'PRIMED');
  assert.equal(bombPrimeLine({ bombId: 8, trigger: 'proximity' }).detail, 'PROXIMITY');
  assert.equal(bombPrimeLine({ bombId: 3, trigger: 'command' }).detail, 'COMMAND');
  assert.equal(bombPrimeLine({ bombId: 3, trigger: 'fuze' }).detail, 'FUZE');
});

test('seed 4242: the player hull hears the status; an NPC hull stays quiet', () => {
  const { bus, callout } = mount(1);
  try {
    bus.emit('combat:statusApplied', { targetId: 2, statusId: 'status_scrambled', stacks: 1 });
    callout.update(0);
    assert.equal(calloutTextFor(callout.root), '');
    bus.emit('combat:statusApplied', { targetId: 1, statusId: 'status_scrambled', stacks: 1 });
    callout.update(0);
    const text = calloutTextFor(callout.root);
    assert.match(text, /SCRAMBLED/);
    assert.match(text, /ION \+ HEAT/);
    bus.emit('combat:statusApplied', { targetId: 1, statusId: 'status_burning', stacks: 2 });
    callout.update(0);
    assert.match(calloutTextFor(callout.root), /BURNING/);
    assert.match(calloutTextFor(callout.root), /HEAT TICKS/);
  } finally { callout.destroy(); }
});

test('seed 4242: a bomb the player primed says PRIMED and the trigger', () => {
  const { bus, callout } = mount(1);
  try {
    bus.emit('bombs:primed', { bombId: 50, ownerId: 9, trigger: 'proximity', payloadId: 'bomb_frag' });
    callout.update(0);
    assert.equal(calloutTextFor(callout.root), '', 'someone else\'s bay stays quiet');
    bus.emit('bombs:primed', { bombId: 51, ownerId: 1, trigger: 'command', payloadId: 'bomb_frag' });
    callout.update(0);
    const text = calloutTextFor(callout.root);
    assert.match(text, /PRIMED/);
    assert.match(text, /COMMAND/);
  } finally { callout.destroy(); }
});
