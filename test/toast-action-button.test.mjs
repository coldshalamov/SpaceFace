// W1-C: a receipt may carry one button (the slow-frame offer's Switch). The payload is plain data;
// the click resolves a handler registered by id. The card must stay accessible (a button inside a
// role=button card is invisible to assistive tech), the button must not also trigger the card's
// own dismiss/Enter handlers, and a card with a button must not be the first one evicted.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createToasts } from '../src/ui/toasts.js';
import {
  normalizeToastAction,
  pickEvictionVictim,
  registerToastAction,
} from '../src/ui/toastAction.js';

function installDom() {
  const byId = new Map();
  class FakeClassList {
    constructor(owner) { this.owner = owner; this.values = new Set(); }
    add(...vs) { vs.forEach((v) => this.values.add(v)); this._sync(); }
    remove(...vs) { vs.forEach((v) => this.values.delete(v)); this._sync(); }
    contains(v) { return this.values.has(v); }
    _sync() { this.owner._className = Array.from(this.values).join(' '); }
  }
  class FakeElement {
    constructor(tagName = 'div') {
      this.tagName = String(tagName).toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.classList = new FakeClassList(this);
      this.attributes = new Map();
      this.listeners = new Map();
      this.style = {};
      this.textContent = '';
      this.id = '';
      this.isConnected = true;
      this._className = '';
    }
    get className() { return this._className; }
    set className(v) {
      this._className = String(v);
      this.classList.values = new Set(this._className.split(/\s+/).filter(Boolean));
    }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
    hasAttribute(k) { return this.attributes.has(k); }
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
    prepend(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.children.unshift(child);
      return child;
    }
    removeChild(child) {
      this.children = this.children.filter((c) => c !== child);
      child.parentNode = null;
      return child;
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    }
    // Fires this element's listeners only (no bubbling): the test asserts stopPropagation was
    // called, which is what keeps the card's own handler from running in a real DOM.
    fire(type, extra = {}) {
      const ev = { type, target: this, stopped: false, prevented: false, ...extra };
      ev.stopPropagation = () => { ev.stopped = true; };
      ev.preventDefault = () => { ev.prevented = true; };
      for (const fn of this.listeners.get(type) || []) fn(ev);
      return ev;
    }
    contains(node) {
      for (let n = node; n; n = n.parentNode) if (n === this) return true;
      return false;
    }
    querySelector() { return null; }
  }
  const toasts = new FakeElement('div');
  toasts.id = 'toasts';
  const live = new FakeElement('div');
  live.id = 'toast-live';
  const hud = new FakeElement('div');
  hud.id = 'hud';
  byId.set('toasts', toasts);
  byId.set('toast-live', live);
  byId.set('hud', hud);
  const previous = { document: globalThis.document, raf: globalThis.requestAnimationFrame };
  globalThis.document = {
    getElementById: (id) => byId.get(id) || null,
    createElement: (tag) => new FakeElement(tag),
    body: { dataset: {} },
    activeElement: null,
  };
  globalThis.requestAnimationFrame = (fn) => { fn(); return 1; };
  return {
    toasts,
    live,
    cards: () => toasts.children.filter((el) => String(el.className).includes('sf-toast')
      && !el.classList.contains('sf-toast--out')),
    restore() {
      if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
      if (previous.raf === undefined) delete globalThis.requestAnimationFrame;
      else globalThis.requestAnimationFrame = previous.raf;
    },
  };
}

const buttonOf = (card) => card.children.find((c) => c.tagName === 'BUTTON');
const OFFER = { text: 'Running slowly here. Switch preset?', kind: 'info', ttl: 20,
  action: { id: 'test-offer', label: 'Switch', ariaLabel: 'Switch to the High performance preset' } };

test('a receipt with an action renders a real button and keeps the card out of role=button', () => {
  const dom = installDom();
  try {
    const bus = createBus();
    createToasts({ bus });
    bus.emit('toast', OFFER);
    const [card] = dom.cards();
    assert.ok(card, 'the receipt rendered');
    const button = buttonOf(card);
    assert.ok(button, 'the action button is on the card');
    assert.equal(button.className, 'sf-toast__action');
    assert.equal(button.textContent, 'Switch');
    assert.equal(button.getAttribute('type'), 'button');
    assert.equal(button.getAttribute('aria-label'), 'Switch to the High performance preset');
    assert.equal(card.getAttribute('role'), 'group');
    assert.equal(card.getAttribute('aria-label'), OFFER.text);
    assert.equal(card.hasAttribute('tabindex'), false, 'the button is the only tab stop');
    assert.equal(dom.live.textContent, OFFER.text, 'the status is announced once through the live region');
  } finally {
    dom.restore();
  }
});

test('a plain receipt is unchanged: a dismiss control with role=button and a tab stop', () => {
  const dom = installDom();
  try {
    const bus = createBus();
    createToasts({ bus });
    bus.emit('toast', { text: 'Saved slot 1', kind: 'info', ttl: 3 });
    const [card] = dom.cards();
    assert.equal(card.getAttribute('role'), 'button');
    assert.equal(card.getAttribute('tabindex'), '0');
    assert.equal(buttonOf(card), undefined);
  } finally {
    dom.restore();
  }
});

test('pressing the button runs its registered handler once and dismisses the card', () => {
  const dom = installDom();
  let calls = 0;
  const off = registerToastAction('test-offer', () => { calls++; });
  try {
    const bus = createBus();
    createToasts({ bus });
    bus.emit('toast', OFFER);
    const [card] = dom.cards();
    const click = buttonOf(card).fire('click');
    assert.equal(calls, 1);
    assert.equal(click.stopped, true, 'the click stops at the button so the card does not also dismiss');
    assert.equal(dom.cards().length, 0, 'the card is dismissed');
    const key = buttonOf(card).fire('keydown', { key: 'Enter' });
    assert.equal(key.stopped, true, 'Enter on the button never reaches the card handler that would prevent its default');
    assert.equal(key.prevented, false);
  } finally {
    off();
    dom.restore();
  }
});

test('a missing or throwing handler still dismisses the card and never throws', () => {
  const dom = installDom();
  const warn = console.warn;
  console.warn = () => {};
  try {
    const bus = createBus();
    createToasts({ bus });
    bus.emit('toast', { ...OFFER, action: { id: 'nobody-home', label: 'Switch' } });
    buttonOf(dom.cards()[0]).fire('click');
    assert.equal(dom.cards().length, 0);

    const off = registerToastAction('boom', () => { throw new Error('handler fault'); });
    bus.emit('toast', { ...OFFER, text: 'Another one', action: { id: 'boom', label: 'Switch' } });
    assert.doesNotThrow(() => buttonOf(dom.cards()[0]).fire('click'));
    assert.equal(dom.cards().length, 0);
    off();
  } finally {
    console.warn = warn;
    dom.restore();
  }
});

test('a malformed action (no id, no label, a function) renders no button', () => {
  const dom = installDom();
  try {
    const bus = createBus();
    createToasts({ bus });
    for (const [i, action] of [{ label: 'Switch' }, { id: 'x' }, () => {}, 'switch', 7].entries()) {
      bus.emit('toast', { text: `Plain line ${i}`, kind: 'info', ttl: 3, action });
      assert.equal(buttonOf(dom.cards()[0]), undefined, `case ${i}`);
    }
  } finally {
    dom.restore();
  }
});

test('registerToastAction refuses junk and its disposer only removes its own handler', () => {
  assert.equal(typeof registerToastAction('', () => {}), 'function');
  assert.equal(typeof registerToastAction('x', null), 'function');
  let a = 0;
  let b = 0;
  const offA = registerToastAction('shared', () => { a++; });
  const offB = registerToastAction('shared', () => { b++; });
  offA(); // A was replaced by B; disposing A must not remove B
  const dom = installDom();
  try {
    const bus = createBus();
    createToasts({ bus });
    bus.emit('toast', { ...OFFER, action: { id: 'shared', label: 'Switch' } });
    buttonOf(dom.cards()[0]).fire('click');
    assert.deepEqual([a, b], [0, 1]);
  } finally {
    offB();
    dom.restore();
  }
});

test('the next two pickups do not evict the offer: the oldest plain line goes first', () => {
  const dom = installDom();
  try {
    const bus = createBus();
    createToasts({ bus });
    bus.emit('toast', OFFER);
    bus.emit('toast', { text: 'Sold 12 Iron Ore · +840 cr', kind: 'good', ttl: 3 });
    bus.emit('toast', { text: '+12 REP · DMC', kind: 'rep', ttl: 3 });
    bus.emit('toast', { text: 'Saved slot 1', kind: 'info', ttl: 3 });
    const texts = dom.cards().map((card) => card.children[1].textContent);
    assert.equal(texts.length, 2, 'the lane still holds two receipts');
    assert.ok(texts.includes(OFFER.text), 'the offer survived');
    assert.ok(texts.includes('Saved slot 1'), 'the newest line is shown');
  } finally {
    dom.restore();
  }
});

test('two offers at once fall back to evicting the oldest', () => {
  const dom = installDom();
  try {
    const bus = createBus();
    createToasts({ bus });
    bus.emit('toast', OFFER);
    bus.emit('toast', { ...OFFER, text: 'Second offer line' });
    bus.emit('toast', { ...OFFER, text: 'Third offer line' });
    const texts = dom.cards().map((card) => card.children[1].textContent);
    assert.deepEqual(texts.sort(), ['Second offer line', 'Third offer line']);
  } finally {
    dom.restore();
  }
});

test('the pure helpers: normalize trims and bounds, eviction never picks the newest line', () => {
  assert.deepEqual(normalizeToastAction({ id: 'a', label: '  Switch  ' }), { id: 'a', label: 'Switch', ariaLabel: 'Switch' });
  assert.equal(normalizeToastAction({ id: 'a', label: 'x'.repeat(60) }).label.length, 24);
  assert.equal(normalizeToastAction(null), null);
  const plain = (name) => ({ name });
  const offer = (name) => ({ name, action: { id: 'a' } });
  // newest first
  assert.equal(pickEvictionVictim([plain('new'), offer('offer'), plain('old')]).name, 'old');
  assert.equal(pickEvictionVictim([plain('new'), plain('mid'), offer('offer')]).name, 'mid');
  assert.equal(pickEvictionVictim([plain('new'), offer('offer'), offer('older offer')]).name, 'older offer');
  assert.equal(pickEvictionVictim([offer('new offer'), offer('offer'), plain('old')]).name, 'old');
});
