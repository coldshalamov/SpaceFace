// SEED-ST-13: the first autosave says progress was kept. Later writes stay quiet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createToasts, progressSavedReceipt } from '../src/ui/toasts.js';

function installToastDom() {
  const byId = new Map();
  class FakeClassList {
    constructor(owner) { this.owner = owner; this.values = new Set(); }
    add(...values) { values.forEach((value) => this.values.add(value)); this.owner.className = Array.from(this.values).join(' '); }
    remove(...values) { values.forEach((value) => this.values.delete(value)); this.owner.className = Array.from(this.values).join(' '); }
    contains(value) { return this.values.has(value); }
  }
  class FakeElement {
    constructor(tagName = 'div') {
      this.tagName = String(tagName).toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.classList = new FakeClassList(this);
      this.style = {};
      this.textContent = '';
      this.id = '';
      this.className = '';
    }
    setAttribute() {}
    getAttribute() { return null; }
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
    prepend(child) { return this.appendChild(child); }
    removeChild(child) {
      this.children = this.children.filter((entry) => entry !== child);
      child.parentNode = null;
      return child;
    }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    addEventListener() {}
    querySelector() { return null; }
  }
  const toasts = new FakeElement('div');
  const live = new FakeElement('div');
  const hud = new FakeElement('div');
  byId.set('toasts', toasts);
  byId.set('toast-live', live);
  byId.set('hud', hud);
  const previous = globalThis.document;
  globalThis.document = {
    getElementById: (id) => byId.get(id) || null,
    createElement: (tag) => new FakeElement(tag),
    body: { dataset: {} },
    activeElement: null,
  };
  return {
    restore() {
      if (previous === undefined) delete globalThis.document;
      else globalThis.document = previous;
    },
  };
}

test('seed 4242 keeps progress on the first autosave and never on every write', () => {
  const state = createGameState(4242);
  assert.equal(state.meta.seed, 4242);
  assert.equal(progressSavedReceipt(state, { ok: false, autosave: true, slot: 'auto' }), null);
  assert.notEqual(state.player.hints.progressSaved, true, 'a failed write does not spend the line');
  assert.equal(progressSavedReceipt(state, { ok: true, autosave: false, slot: 'slot1' }), null);
  assert.notEqual(state.player.hints.progressSaved, true);
  assert.equal(progressSavedReceipt(state, { ok: true, autosave: true, slot: 'auto' }), 'Progress saved');
  assert.equal(state.player.hints.progressSaved, true);
  assert.equal(progressSavedReceipt(state, { ok: true, autosave: true, slot: 'autosave' }), null);

  const manual = createGameState(4242);
  assert.equal(progressSavedReceipt(manual, { ok: true, slot: 'manual' }), null);
  assert.equal(progressSavedReceipt(manual, { ok: true, autosave: false, slot: 'autosave' }), 'Progress saved');
});

test('the toast lane posts Progress saved once for the first successful autosave', () => {
  const dom = installToastDom();
  const previousFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (fn) => { fn(); return 1; };
  try {
    const bus = createBus();
    const state = createGameState(4242);
    const lines = [];
    bus.on('toast', (payload) => { if (payload && payload.text) lines.push(payload.text); });
    createToasts({ bus, state });
    bus.emit('save:completed', { slot: 'auto', autosave: true, ok: false });
    bus.emit('save:completed', { slot: 'manual', autosave: false, ok: true });
    assert.deepEqual(lines.filter((text) => text === 'Progress saved'), []);
    assert.notEqual(state.player.hints.progressSaved, true);
    bus.emit('save:completed', { slot: 'autosave', autosave: true, ok: true });
    bus.emit('save:completed', { slot: 'auto', autosave: true, ok: true });
    assert.deepEqual(lines.filter((text) => text === 'Progress saved'), ['Progress saved']);
    assert.equal(state.player.hints.progressSaved, true);
  } finally {
    dom.restore();
    globalThis.requestAnimationFrame = previousFrame;
  }
});
