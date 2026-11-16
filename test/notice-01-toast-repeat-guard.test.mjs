// NOTICE-01: the global repeat guard in the receipt lane. An identical text still folds into
// its live card's count; once that card is gone, the same text re-run inside 20 s is dropped —
// the notice flood. Errors are exempt: a failure the player must see is never swallowed.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createToasts } from '../src/ui/toasts.js';

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
    documentElement: { dataset: {} },
    activeElement: null,
  };
  globalThis.requestAnimationFrame = (fn) => { fn(); return 1; };
  return {
    cards: () => toasts.children.filter((el) => String(el.className).includes('sf-toast')
      && !el.classList.contains('sf-toast--out')),
    restore() {
      if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
      if (previous.raf === undefined) delete globalThis.requestAnimationFrame;
      else globalThis.requestAnimationFrame = previous.raf;
    },
  };
}

const LINE = 'Hauler: Lane\'s still hot — holding where I sit until it clears.';

test('an identical text already shown inside 20 s drops once its card is gone', () => {
  let nowMs = 10_000;
  const realNow = performance.now;
  performance.now = () => nowMs;
  const dom = installDom();
  try {
    const bus = createBus();
    const ui = createToasts({ bus });
    const emit = (kind = 'warn') => bus.emit('toast', { text: LINE, kind, ttl: 2 });

    emit();
    assert.equal(dom.cards().length, 1, 'the first showing mounts');

    // While the card lives the same text still folds into its count — unchanged behavior.
    nowMs += 500;
    emit();
    assert.equal(dom.cards().length, 1, 'a live identical repeat folds into a count');

    nowMs += 2_100;                        // the folded card expires
    ui.tick();
    assert.equal(dom.cards().length, 0);

    nowMs += 5_000;                        // 7.6 s since the last showing — inside the window
    emit();
    assert.equal(dom.cards().length, 0, 'the same text inside 20 s is dropped');

    emit('error');
    assert.equal(dom.cards().length, 1, 'an error is never swallowed by the guard');

    nowMs += 2_500;                        // the error card expires
    ui.tick();
    nowMs += 18_000;                       // >20 s since that showing
    emit();
    assert.equal(dom.cards().length, 1, 'outside the window the line shows again');
    ui.destroy();
  } finally {
    performance.now = realNow;
    dom.restore();
  }
});

test('different texts are unaffected by the guard', () => {
  let nowMs = 50_000;
  const realNow = performance.now;
  performance.now = () => nowMs;
  const dom = installDom();
  try {
    const bus = createBus();
    const ui = createToasts({ bus });
    bus.emit('toast', { text: 'Miner: holding the berth.', kind: 'warn', ttl: 2 });
    bus.emit('toast', { text: 'Salvor: holding the berth.', kind: 'warn', ttl: 2 });
    assert.equal(dom.cards().length, 2, 'distinct speakers still land side by side');
    ui.destroy();
  } finally {
    performance.now = realNow;
    dom.restore();
  }
});
