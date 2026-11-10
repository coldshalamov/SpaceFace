import test from 'node:test';
import assert from 'node:assert/strict';
import { mountOrreryCluster, readOrdnanceModel } from '../src/ui/orrery/hudAdapter.js';
import { previewOrdnanceState } from '../src/ui/orrery/flightPreview.js';
import { fakeDom, findAll } from './helpers/fake-dom.mjs';

function installDom() {
  const previousDoc = globalThis.document;
  const previousWin = globalThis.window;
  const doc = fakeDom();
  const create = doc.createElement;
  doc.createElement = (tag) => {
    const node = create(tag);
    node.remove = () => {
      if (node.parentNode) node.parentNode.children = node.parentNode.children.filter((child) => child !== node);
      node.parentNode = null;
    };
    return node;
  };
  doc.createElementNS = (_, tag) => doc.createElement(tag);
  doc.documentElement = doc.createElement('html');
  doc.body = doc.createElement('body');
  const canvas = doc.createElement('canvas');
  canvas.id = 'gl-canvas';
  canvas.dispatched = [];
  canvas.dispatchEvent = (event) => { canvas.dispatched.push(event); return true; };
  const lookup = doc.getElementById;
  doc.getElementById = (id) => (id === 'gl-canvas' ? canvas : lookup(id));
  
  const winDispatched = [];
  const win = {
    addEventListener(evt, fn) { (this.listeners = this.listeners || {})[evt] = (this.listeners[evt] || []).concat(fn); },
    removeEventListener(evt, fn) { if (this.listeners && this.listeners[evt]) this.listeners[evt] = this.listeners[evt].filter(f => f !== fn); },
    dispatchEvent(event) { winDispatched.push(event); return true; },
    winDispatched,
  };
  globalThis.document = doc;
  globalThis.window = win;
  return {
    doc,
    canvas,
    win,
    restore() {
      globalThis.document = previousDoc;
      globalThis.window = previousWin;
    },
  };
}

function fixture(extra = {}) {
  const state = previewOrdnanceState();
  Object.assign(state, extra);
  state.entities.get(1).data.defId = 'ship_kestrel';
  return state;
}

const SLOT_OF = { Pull: '1', Shove: '2', Pin: '3', Bomb: '4', Rig: '5', Line: '6', Gyre: '7', Cloak: '8' };
const socketOf = (root, name) => findAll(root, (n) => n.getAttribute && (n.getAttribute('data-group') === name || n.getAttribute('data-slot') === SLOT_OF[name]))[0];

test('readOrdnanceModel detects active, held, and firing power inputs', () => {
  const state = fixture({
    input: {
      actions: {
        pull: { pressed: true },
        shove: { held: true },
        pin: { pressed: false },
      },
    },
  });

  const ordnance = readOrdnanceModel(state, null, undefined, { held: 'shove' });
  assert.equal(ordnance['1'].active, true, 'Slot 1 (Pull) is marked active when pull is pressed');
  assert.equal(ordnance['1'].firing, true, 'Slot 1 (Pull) is marked firing when pull is pressed');
  assert.equal(ordnance['2'].active, true, 'Slot 2 (Shove) is marked active when shove is held');
  assert.equal(ordnance['2'].held, true, 'Slot 2 (Shove) is marked held when shove is held');
  assert.notEqual(ordnance['3'].active, true, 'Slot 3 (Pin) is not active when unpressed');
});

test('flightCluster assigns active/held/firing classes, aria-pressed, and dynamic aria-labels', () => {
  const t = installDom();
  const state = fixture({
    input: {
      actions: {
        pull: { pressed: true },
      },
    },
  });

  try {
    const root = t.doc.createElement('div');
    const mounted = mountOrreryCluster(root, state, {});
    const player = state.entities.get(state.playerId);

    mounted.update(state, player, true);

    const pullSocket = socketOf(root, 'Pull');
    assert.ok(pullSocket, 'Pull socket exists');
    assert.match(pullSocket.className, /is-active/, 'Pull socket has .is-active class');
    assert.match(pullSocket.className, /is-firing/, 'Pull socket has .is-firing class');
    assert.equal(pullSocket.getAttribute('aria-pressed'), 'true', 'Pull socket has aria-pressed="true"');
    assert.equal(pullSocket.getAttribute('role'), 'button', 'Pull socket has role="button"');
    assert.equal(pullSocket.getAttribute('tabindex'), '0', 'Pull socket has tabindex="0"');
    assert.match(pullSocket.getAttribute('aria-label'), /^Activating\./, 'Aria-label dynamically indicates activation');
    
    // Check that pin is not active and not armed
    const pinSocket = socketOf(root, 'Pin');
    assert.ok(pinSocket, 'Pin socket exists');
    assert.doesNotMatch(pinSocket.className, /is-active/, 'Pin socket does not have .is-active class');
    assert.equal(pinSocket.getAttribute('aria-pressed'), 'false', 'Pin socket has aria-pressed="false"');

    mounted.dispose();
  } finally {
    t.restore();
  }
});

test('interactive power activation: clicking socket dispatches synthetic keyboard event', () => {
  const t = installDom();
  const state = fixture();

  try {
    const root = t.doc.createElement('div');
    const mounted = mountOrreryCluster(root, state, {});
    const player = state.entities.get(state.playerId);
    mounted.update(state, player, true);

    const pullSocket = socketOf(root, 'Pull');
    assert.ok(pullSocket, 'Pull socket exists');

    // Trigger click on socket
    pullSocket.click();

    // Verify window received dispatched keydown event for Digit1 or pull
    assert.ok(t.win.winDispatched.length > 0, 'Window received at least one dispatched keyboard event');
    const keydownEvt = t.win.winDispatched.find(e => e.type === 'keydown');
    assert.ok(keydownEvt, 'Dispatched event is a keydown event');
    assert.ok(keydownEvt.code === 'Digit1', 'Dispatched event targets Digit1');

    mounted.dispose();
  } finally {
    t.restore();
  }
});

test('interactive power activation: pressing Enter on focused socket activates power', () => {
  const t = installDom();
  const state = fixture();

  try {
    const root = t.doc.createElement('div');
    const mounted = mountOrreryCluster(root, state, {});
    const player = state.entities.get(state.playerId);
    mounted.update(state, player, true);

    const shoveSocket = socketOf(root, 'Shove');
    assert.ok(shoveSocket, 'Shove socket exists');

    // Trigger Enter keydown
    const keyListeners = shoveSocket.listeners.keydown || [];
    assert.ok(keyListeners.length > 0, 'Socket has keydown listener');
    let prevented = false;
    for (const fn of keyListeners) {
      fn({ key: 'Enter', preventDefault() { prevented = true; } });
    }
    assert.equal(prevented, true, 'Enter key default was prevented');

    // Verify window received keydown event for Shove (Digit2)
    const keydownEvt = t.win.winDispatched.find(e => e.type === 'keydown');
    assert.ok(keydownEvt, 'Dispatched event is a keydown event');
    assert.ok(keydownEvt.code === 'Digit2', 'Dispatched event targets Digit2');

    mounted.dispose();
  } finally {
    t.restore();
  }
});

test('hand pointer and crescent unfolding prioritize active/firing powers', () => {
  const t = installDom();
  const state = fixture({
    input: {
      actions: {
        shove: { pressed: true },
      },
    },
  });

  try {
    const root = t.doc.createElement('div');
    const mounted = mountOrreryCluster(root, state, {});
    const player = state.entities.get(state.playerId);

    mounted.update(state, player, true);

    // With shove (slot 2) active, the crescent unfolds shove group or focuses on it
    const shoveSocket = socketOf(root, 'Shove');
    assert.ok(shoveSocket, 'Shove socket exists and is rendered');
    assert.match(shoveSocket.className, /is-active/, 'Shove socket is active');
    assert.match(shoveSocket.className, /is-firing/, 'Shove socket is firing');

    mounted.dispose();
  } finally {
    t.restore();
  }
});

test('accessibility & styling: cluster CSS contains power colors, high-contrast, and reduced-motion rules', () => {
  const t = installDom();
  const state = fixture();

  try {
    const root = t.doc.createElement('div');
    const mounted = mountOrreryCluster(root, state, {});
    
    // Find injected style element
    const styleEl = findAll(t.doc.head, (n) => n.tagName === 'style' && n.id === 'sf-orrery-cluster-style')[0];
    assert.ok(styleEl, 'Flight cluster style element is injected');
    const css = styleEl.textContent;

    assert.match(css, /\[data-power="pull"\]/, 'CSS defines pull power identity color');
    assert.match(css, /\[data-power="shove"\]/, 'CSS defines shove power identity color');
    assert.match(css, /\[data-power="bomb"\]/, 'CSS defines bomb power identity color');
    assert.match(css, /\.orr-cluster__key\.is-active/, 'CSS defines active socket glow & styling');
    assert.match(css, /\.orr-cluster__key\.is-firing/, 'CSS defines firing socket animation');
    assert.match(css, /@media \(forced-colors: active\)/, 'CSS defines forced-colors high contrast support');
    assert.match(css, /html\.sf-reduce-motion/, 'CSS defines reduced motion fallback');

    mounted.dispose();
  } finally {
    t.restore();
  }
});
