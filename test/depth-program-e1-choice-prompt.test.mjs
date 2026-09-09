import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createEncounterChoicePrompt } from '../src/ui/encounterChoicePrompt.js';

test('encounter choice prompt subscribes, exposes native accessible buttons, and emits exactly one choice', () => {
  const document = new FakeDocument();
  const bus = createBus();
  const state = { mode: 'flight', ui: {} };
  const chosen = [];
  bus.on('encounter:choose', (payload) => chosen.push(payload));
  const prompt = createEncounterChoicePrompt({ state, bus, document, mount: document.uiRoot });

  bus.emit('encounter:choiceOffered', {
    encounterId: 'e1:h1', kind: 'depth_h1_distress_from_inside', title: 'THE DISTRESS FROM INSIDE',
    options: [
      { id: 'listen', label: 'Listen', available: true },
      { id: 'board', label: 'Board the wreck', available: true },
      { id: 'leave', label: 'Leave quietly', available: false },
    ],
    deadlineAt: 45,
  });

  assert.equal(prompt.el.hidden, false);
  assert.equal(prompt.el.getAttribute('role'), 'dialog');
  assert.equal(prompt.el.getAttribute('aria-modal'), 'false');
  assert.equal(prompt.el.getAttribute('aria-labelledby'), 'sf-encounter-choice-title');
  assert.equal(prompt.buttons.length, 3);
  assert.equal(prompt.buttons[0].tagName, 'BUTTON');
  assert.equal(prompt.buttons[2].disabled, true);

  assert.equal(prompt.choose('listen', 'test'), true);
  assert.equal(prompt.choose('board', 'test-double'), false);
  assert.deepEqual(chosen, [{ encounterId: 'e1:h1', choiceId: 'listen', source: 'test' }]);
  assert.equal(prompt.el.hidden, true, 'a submitted response immediately clears its decision surface');
  prompt.destroy();
});

test('encounter choice prompt accepts number keys and fences them from flight input', () => {
  const document = new FakeDocument();
  const bus = createBus();
  const state = { mode: 'flight', ui: {} };
  const chosen = [];
  bus.on('encounter:choose', (payload) => chosen.push(payload));
  const prompt = createEncounterChoicePrompt({ state, bus, document, mount: document.uiRoot });

  bus.emit('encounter:choiceOffered', {
    encounterId: 'e1:h6', title: 'PATROL AMBUSH',
    options: [
      { id: 'concord', label: 'Aid Concord', available: true },
      { id: 'reach', label: 'Aid Reach', available: true },
    ],
  });
  const event = keyEvent('2', 'Digit2');
  document.dispatchEvent(event);

  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.deepEqual(chosen, [{ encounterId: 'e1:h6', choiceId: 'reach', source: 'keyboard' }]);
  assert.equal(prompt.el.hidden, true);
  prompt.destroy();
});

test('encounter choice prompt rejects fenced, unavailable, and stale choices and cleans listeners', () => {
  const document = new FakeDocument();
  const bus = createBus();
  const state = { mode: 'flight', ui: { fulfillmentBlackoutActive: true } };
  const chosen = [];
  bus.on('encounter:choose', (payload) => chosen.push(payload));
  const prompt = createEncounterChoicePrompt({ state, bus, document, mount: document.uiRoot });
  const offer = {
    encounterId: 'e1:h4', title: 'THE LOVE LETTER BUOY',
    options: [{ id: 'reseed', label: 'Re-seed on the grave route', available: true }],
  };
  bus.emit('encounter:choiceOffered', offer);
  assert.equal(prompt.el.hidden, true, 'opaque blackout must fence the encounter prompt itself');
  assert.equal(prompt.choose('reseed', 'fenced'), false);
  state.ui.fulfillmentBlackoutActive = false;
  assert.equal(prompt.choose('missing', 'stale'), false);
  assert.equal(chosen.length, 0);
  prompt.destroy();
  bus.emit('encounter:choiceOffered', { ...offer, encounterId: 'after-destroy' });
  assert.equal(prompt.el.hidden, true);
});

class FakeDocument {
  constructor() {
    this.byId = new Map();
    this.head = new FakeElement('head', this);
    this.body = new FakeElement('body', this);
    this.uiRoot = new FakeElement('div', this);
    this.uiRoot.id = 'ui-root';
    this.body.appendChild(this.uiRoot);
    this.listeners = new Map();
  }
  createElement(tagName) { return new FakeElement(tagName, this); }
  getElementById(id) { return this.byId.get(id) || null; }
  addEventListener(name, fn) {
    const listeners = this.listeners.get(name) || new Set();
    listeners.add(fn);
    this.listeners.set(name, listeners);
  }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  dispatchEvent(event) { for (const listener of this.listeners.get(event.type) || []) listener(event); }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
    this.className = '';
    this.listeners = new Map();
    this.parentNode = null;
    this.style = {};
    this._id = '';
  }
  set id(value) {
    if (this._id) this.ownerDocument.byId.delete(this._id);
    this._id = String(value || '');
    if (this._id) this.ownerDocument.byId.set(this._id, this);
  }
  get id() { return this._id; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    for (const child of children) this.appendChild(child);
  }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  removeEventListener(name, fn) { if (this.listeners.get(name) === fn) this.listeners.delete(name); }
  contains(node) { return node === this || this.children.some((child) => child.contains(node)); }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
    if (this.id) this.ownerDocument.byId.delete(this.id);
  }
}

function keyEvent(key, code) {
  return {
    type: 'keydown', key, code, ctrlKey: false, altKey: false, metaKey: false,
    prevented: false, stopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; },
  };
}
