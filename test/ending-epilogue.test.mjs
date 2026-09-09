import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ENDING_DEFS,
  SANDBOX_DEF,
} from '../src/story/endings/endingDefs.js';

let epilogue = null;
let loadError = null;
try {
  epilogue = await import('../src/ui/endingEpilogue.js');
} catch (error) {
  loadError = error;
}

function requireFeature() {
  assert.ok(epilogue, `ending epilogue module must load: ${loadError && loadError.message}`);
  return epilogue;
}

function stateFor(def) {
  return {
    story: {
      postEnding: {
        choiceId: def.id,
        endingId: def.id === 'SANDBOX' ? null : def.id,
        sandboxMode: def.sandboxMode,
        title: def.continuity.title,
        objective: def.continuity.objective,
        status: 'active',
      },
    },
  };
}

class FakeClassList {
  constructor(owner) { this.owner = owner; }
  _set() { return new Set(String(this.owner.className || '').split(/\s+/).filter(Boolean)); }
  add(...names) { const s = this._set(); names.forEach((n) => s.add(n)); this.owner.className = [...s].join(' '); }
  remove(...names) { const s = this._set(); names.forEach((n) => s.delete(n)); this.owner.className = [...s].join(' '); }
  contains(name) { return this._set().has(name); }
}

class FakeElement {
  constructor(tagName, document) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = document;
    this.children = [];
    this.parentNode = null;
    this.className = '';
    this.classList = new FakeClassList(this);
    this.attributes = new Map();
    this.listeners = new Map();
    this._textContent = '';
    this.id = '';
    this.disabled = false;
  }
  get textContent() { return this._textContent + this.children.map((child) => child.textContent).join(''); }
  set textContent(value) { this._textContent = String(value == null ? '' : value); }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  remove() {
    if (!this.parentNode) return;
    const i = this.parentNode.children.indexOf(this);
    if (i >= 0) this.parentNode.children.splice(i, 1);
    this.parentNode = null;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(name, fn) {
    const list = this.listeners.get(name) || [];
    list.push(fn);
    this.listeners.set(name, list);
  }
  dispatchEvent(event) {
    event.target ||= this;
    event.currentTarget = this;
    for (const fn of this.listeners.get(event.type) || []) fn(event);
    return !event.defaultPrevented;
  }
  focus() { this.ownerDocument.activeElement = this; }
  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const out = [];
    const matches = (node) => {
      if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
      if (selector.startsWith('#')) return node.id === selector.slice(1);
      if (selector === '[data-ending-epilogue-dismiss]') return node.attributes.has('data-ending-epilogue-dismiss');
      return node.tagName === selector.toUpperCase();
    };
    const visit = (node) => {
      for (const child of node.children) {
        if (matches(child)) out.push(child);
        visit(child);
      }
    };
    visit(this);
    return out;
  }
  get isConnected() { return this.ownerDocument.documentElement.contains(this); }
}

function installFakeDom() {
  const doc = {};
  doc.createElement = (tag) => new FakeElement(tag, doc);
  doc.documentElement = doc.createElement('html');
  doc.head = doc.createElement('head');
  doc.body = doc.createElement('body');
  doc.documentElement.append(doc.head, doc.body);
  const root = doc.createElement('div');
  root.id = 'ui-root';
  doc.body.appendChild(root);
  doc.activeElement = doc.body;
  doc.getElementById = (id) => doc.documentElement.querySelector(`#${id}`);
  doc.querySelector = (selector) => doc.documentElement.querySelector(selector);
  doc.querySelectorAll = (selector) => doc.documentElement.querySelectorAll(selector);
  globalThis.document = doc;
  return { document: doc, root };
}

function createBus() {
  const listeners = new Map();
  const log = [];
  return {
    log,
    on(name, fn) {
      const list = listeners.get(name) || [];
      list.push(fn);
      listeners.set(name, list);
      return () => listeners.set(name, (listeners.get(name) || []).filter((x) => x !== fn));
    },
    emit(name, payload) {
      log.push({ name, payload });
      for (const fn of [...(listeners.get(name) || [])]) fn(payload || {});
    },
  };
}

function key(type, keyName, extra = {}) {
  return {
    type,
    key: keyName,
    shiftKey: !!extra.shiftKey,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() {},
  };
}

test('all five endings build distinct payoff cards with durable next objectives', () => {
  const { buildEndingEpilogueModel } = requireFeature();
  const identities = new Set();
  for (const def of ENDING_DEFS) {
    const model = buildEndingEpilogueModel({
      event: 'endgame:chosen',
      payload: { choice: def.id, title: def.title, resolution: def.resolution },
      state: stateFor(def),
    });
    assert.equal(model.id, def.id);
    assert.equal(model.isEnding, true);
    assert.equal(model.title, def.title);
    assert.equal(model.resolution, def.resolution);
    assert.equal(model.objective, def.continuity.objective);
    assert.ok(model.consequence.length >= 24, `${def.id} consequence identity`);
    identities.add(model.consequence);
  }
  assert.equal(identities.size, 5, 'each ending has a distinct consequence identity');
});

test('sandbox builds an explicit non-ending continuation card', () => {
  const { buildEndingEpilogueModel } = requireFeature();
  const model = buildEndingEpilogueModel({
    event: 'endgame:sandboxContinued',
    payload: { sandboxMode: SANDBOX_DEF.sandboxMode, resolution: SANDBOX_DEF.resolution },
    state: stateFor(SANDBOX_DEF),
  });
  assert.equal(model.id, 'SANDBOX');
  assert.equal(model.isEnding, false);
  assert.match(model.eyebrow, /CONTINUATION/);
  assert.match(model.eyebrow, /NO ENDING/);
  assert.equal(model.objective, SANDBOX_DEF.continuity.objective);
});

test('event presentation traps focus, prevents overlap, dismisses on Escape, and restores focus', () => {
  const { createEndingEpilogue } = requireFeature();
  const { document, root } = installFakeDom();
  const bus = createBus();
  const opener = document.createElement('button');
  root.appendChild(opener);
  opener.focus();
  const state = stateFor(ENDING_DEFS[0]);
  const api = createEndingEpilogue({ bus, state, root });

  bus.emit('endgame:chosen', {
    choice: 'A', title: ENDING_DEFS[0].title, resolution: ENDING_DEFS[0].resolution,
  });
  const dialog = root.querySelector('.sf-ending-epilogue');
  assert.ok(dialog);
  assert.equal(dialog.getAttribute('role'), 'dialog');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  const dismiss = dialog.querySelector('[data-ending-epilogue-dismiss]');
  assert.equal(document.activeElement, dismiss);

  bus.emit('endgame:chosen', {
    choice: 'B', title: ENDING_DEFS[1].title, resolution: ENDING_DEFS[1].resolution,
  });
  assert.equal(root.querySelectorAll('.sf-ending-epilogue').length, 1, 'epilogues never overlap');

  const tab = key('keydown', 'Tab');
  dialog.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, true);
  assert.equal(document.activeElement, dismiss);
  dialog.dispatchEvent(key('keydown', 'Escape'));
  assert.equal(root.querySelector('.sf-ending-epilogue'), null);
  assert.equal(document.activeElement, opener);
  assert.equal(api.isOpen(), false);
});

test('sandbox event mounts a clearly non-ending card and click dismisses it', () => {
  const { createEndingEpilogue } = requireFeature();
  const { root } = installFakeDom();
  const bus = createBus();
  const api = createEndingEpilogue({ bus, state: stateFor(SANDBOX_DEF), root });
  bus.emit('endgame:sandboxContinued', {
    sandboxMode: SANDBOX_DEF.sandboxMode,
    resolution: SANDBOX_DEF.resolution,
  });
  const dialog = root.querySelector('.sf-ending-epilogue');
  assert.equal(dialog.getAttribute('data-ending-kind'), 'continuation');
  assert.match(dialog.textContent, /NO ENDING/);
  dialog.querySelector('[data-ending-epilogue-dismiss]').dispatchEvent({ type: 'click' });
  assert.equal(api.isOpen(), false);
});

test('integration stays one-voice, reduced-motion aware, and off the frame loop', () => {
  requireFeature();
  const epilogueSource = readFileSync(new URL('../src/ui/endingEpilogue.js', import.meta.url), 'utf8');
  const commsSource = readFileSync(new URL('../src/ui/comms.js', import.meta.url), 'utf8');
  assert.match(commsSource, /createEndingEpilogue/);
  assert.match(
    commsSource,
    /choiceModalOpen\s*\|\|\s*endingEpilogue\.isOpen\(\)\s*\|\|\s*endingEpilogue\.hasPending\(\)/,
    'a deferred epilogue still owns modal attention',
  );
  assert.match(epilogueSource, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(epilogueSource, /requestAnimationFrame|\btick\s*\(/);
  assert.doesNotMatch(epilogueSource, /comms:popup|audio:|voice:/);
  assert.doesNotMatch(epilogueSource, /portrait|visor|cockpit/i);
});
