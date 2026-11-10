// SFQ-B033 — primed, pinned, gooed, and burning say their payoff.
// The player hull never keeps a tumble, so that status stays quiet.
// The combinations already resolve in the status service; this is the glass.
import test from 'node:test';
import assert from 'node:assert/strict';

import { bombPrimeLine, statusPayoffLine } from '../src/data/statusPayoffs.js';
import { calloutTextFor, createStuntCallout } from '../src/ui/stuntCallout.js';


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
  assert.equal(statusPayoffLine('status_tumbling'), null);
  assert.equal(statusPayoffLine('status_burning').name, 'BURNING');
  assert.equal(statusPayoffLine('status_scrambled').detail, 'SENSORS + LOCK OFFLINE');
  assert.equal(statusPayoffLine('status_unmoored').name, 'UNMOORED');
  assert.equal(statusPayoffLine('status_gravity_marked'), null);
  assert.equal(statusPayoffLine('nope'), null);
  assert.equal(bombPrimeLine({ bombId: 8, trigger: 'proximity' }).name, 'PRIMED');
  assert.equal(bombPrimeLine({ bombId: 8, trigger: 'proximity' }).detail, 'PROXIMITY');
  assert.equal(bombPrimeLine({ bombId: 3, trigger: 'command' }).detail, 'COMMAND');
  assert.equal(bombPrimeLine({ bombId: 3, trigger: 'fuze' }).detail, 'FUZE');
});

test('the player hull hears the status; an NPC hull stays quiet', () => {
  const { bus, callout } = mount(1);
  try {
    bus.emit('combat:statusApplied', { targetId: 2, statusId: 'status_scrambled', stacks: 1 });
    callout.update(0);
    assert.equal(calloutTextFor(callout.root), '');
    bus.emit('combat:statusApplied', { targetId: 1, statusId: 'status_scrambled', stacks: 1 });
    callout.update(0);
    const text = calloutTextFor(callout.root);
    assert.match(text, /SCRAMBLED/);
    assert.match(text, /SENSORS \+ LOCK OFFLINE/);
    bus.emit('combat:statusApplied', { targetId: 1, statusId: 'status_unmoored', stacks: 1 });
    callout.update(0);
    assert.match(calloutTextFor(callout.root), /UNMOORED/);
    bus.emit('combat:statusApplied', { targetId: 1, statusId: 'status_pinned', stacks: 1 });
    callout.update(0);
    const pinned = calloutTextFor(callout.root);
    assert.match(pinned, /PINNED/);
    assert.match(pinned, /HEAVIER/);
    assert.doesNotMatch(pinned, /UNMOORED/, 'pinned cancels the unmoored line the way the status does');
    bus.emit('combat:statusApplied', { targetId: 1, statusId: 'status_burning', stacks: 2 });
    callout.update(0);
    assert.match(calloutTextFor(callout.root), /BURNING/);
    assert.match(calloutTextFor(callout.root), /HULL TAKING HEAT/);
    assert.match(calloutTextFor(callout.root), /×2/);
    bus.emit('combat:statusExpired', { targetId: 2, statusId: 'status_burning' });
    callout.update(0);
    assert.match(calloutTextFor(callout.root), /BURNING/, 'another hull expiring does not clear the player');
    bus.emit('combat:statusExpired', { targetId: 1, statusId: 'status_burning' });
    callout.update(0);
    assert.doesNotMatch(calloutTextFor(callout.root), /BURNING/);
    assert.match(calloutTextFor(callout.root), /SCRAMBLED/);
  } finally { callout.destroy(); }
});

test('a bomb the player primed says PRIMED and the trigger', () => {
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


test('status refresh does not repeat onset; expiry and a new run re-arm it', () => {
  const { bus, callout, state } = mount(1);
  state.tick = 10;
  try {
    bus.emit('combat:statusApplied', { targetId: 1, statusId: 'status_scrambled', stacks: 1, expiresTick: 100 });
    callout.update(0);
    assert.match(calloutTextFor(callout.root), /SCRAMBLED/);
    callout.update(10000);
    bus.emit('combat:statusApplied', { targetId: 1, statusId: 'status_scrambled', stacks: 1, expiresTick: 110 });
    callout.update(10000);
    assert.equal(callout.root.hidden, true, 'an unchanged status does not renew a finished callout');
    bus.emit('game:newGame', {});
    bus.emit('combat:statusApplied', { targetId: 1, statusId: 'status_scrambled', stacks: 1, expiresTick: 110 });
    callout.update(0);
    assert.match(calloutTextFor(callout.root), /SCRAMBLED/);
  } finally { callout.destroy(); }
});


test('opposite status cancellation re-arms onset even after the old line faded', () => {
  const { bus, callout, state } = mount(1);
  state.tick = 10;
  try {
    bus.emit('combat:statusApplied', { targetId: 1, statusId: 'status_unmoored', stacks: 1, expiresTick: 100 });
    callout.update(10000);
    bus.emit('combat:statusApplied', { targetId: 1, statusId: 'status_pinned', stacks: 1, expiresTick: 100 });
    bus.emit('combat:statusApplied', { targetId: 1, statusId: 'status_unmoored', stacks: 1, expiresTick: 100 });
    callout.update(0);
    assert.match(calloutTextFor(callout.root), /UNMOORED/);
    assert.doesNotMatch(calloutTextFor(callout.root), /PINNED/);
  } finally { callout.destroy(); }
});

test('status expiry clears the line and live region while a menu hides callouts', () => {
  const { bus, callout, state } = mount(1);
  try {
    bus.emit('combat:statusApplied', { targetId: 1, statusId: 'status_goo', stacks: 1, expiresTick: 100 });
    callout.update(0);
    assert.match(calloutTextFor(callout.root), /GOOED/);
    state.mode = 'menu';
    bus.emit('combat:statusExpired', { targetId: 1, statusId: 'status_goo' });
    assert.doesNotMatch(calloutTextFor(callout.root), /GOOED/);
    state.mode = 'flight';
    bus.emit('combat:statusApplied', { targetId: 1, statusId: 'status_goo', stacks: 1, expiresTick: 100 });
    callout.update(0);
    assert.match(calloutTextFor(callout.root), /GOOED/);
  } finally { callout.destroy(); }
});

test('status expiry clears stale accessible text after its visual line faded', () => {
  const { bus, callout } = mount(1);
  try {
    bus.emit('combat:statusApplied', { targetId: 1, statusId: 'status_burning', stacks: 1, expiresTick: 100 });
    callout.update(10000);
    assert.equal(callout.root.hidden, true, 'the transient visual line has faded');
    bus.emit('combat:statusExpired', { targetId: 1, statusId: 'status_burning' });
    assert.equal(calloutTextFor(callout.root), '', 'a finished condition cannot remain in the live region');
  } finally { callout.destroy(); }
});
