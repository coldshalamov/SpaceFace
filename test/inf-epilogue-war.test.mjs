import test from 'node:test';
import assert from 'node:assert/strict';

import { ENDING_DEFS, SANDBOX_DEF } from '../src/story/endings/endingDefs.js';

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

// Same minimal fake DOM the ending-epilogue suite installs; only the section tree is inspected.
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
    for (const fn of [...(this.listeners.get(event.type) || [])]) fn(event);
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
  return {
    on(name, fn) {
      const list = listeners.get(name) || [];
      list.push(fn);
      listeners.set(name, list);
      return () => listeners.set(name, (listeners.get(name) || []).filter((x) => x !== fn));
    },
    emit(name, payload) {
      for (const fn of [...(listeners.get(name) || [])]) fn(payload || {});
    },
  };
}

function stateWith(conflicts, def = ENDING_DEFS[0]) {
  return {
    story: {
      postEnding: {
        choiceId: def.id,
        endingId: def.id,
        title: def.continuity.title,
        objective: def.continuity.objective,
        status: 'active',
      },
    },
    conflicts,
  };
}

const WAR_PAIR = 'faction_dmc:faction_mts';

test('the epilogue names the war still burning when the captain files', () => {
  const { buildEndingEpilogueModel } = requireFeature();
  const model = buildEndingEpilogueModel({
    event: 'endgame:chosen',
    payload: { choice: ENDING_DEFS[0].id },
    state: stateWith({
      [WAR_PAIR]: { tension: 80, state: 'war', playerLean: 0, momentum: 20 },
    }),
  });
  assert.ok(model, 'the ending model builds');
  assert.ok(model.warLine, 'the model carries a war line');
  assert.match(model.warLine, /Drift and Meridian/, 'the line names both houses');
  assert.match(model.warLine, /Tethys Junction/, 'the line names the contested front sector');
  assert.match(model.warLine, /still a war/, 'the line says plainly that it never cooled');
  assert.doesNotMatch(model.warLine, /your name is on the lean/, 'no lean, no accusation');
});

test('a banked playerLean names the side the war leans toward', () => {
  const { buildEndingEpilogueModel } = requireFeature();
  // positive playerLean favors the second house in the pair (Meridian)
  const favored = buildEndingEpilogueModel({
    event: 'endgame:chosen',
    payload: { choice: ENDING_DEFS[0].id },
    state: stateWith({ [WAR_PAIR]: { tension: 85, state: 'war', playerLean: 0.3, momentum: 50 } }),
  });
  assert.match(favored.warLine, /leaning Meridian's way/, 'a positive lean names the favored house');
  assert.match(favored.warLine, /your name is on the lean/, 'the captain owns the lean');
  const against = buildEndingEpilogueModel({
    event: 'endgame:chosen',
    payload: { choice: ENDING_DEFS[0].id },
    state: stateWith({ [WAR_PAIR]: { tension: 85, state: 'war', playerLean: -0.3, momentum: 50 } }),
  });
  assert.match(against.warLine, /leaning Drift's way/, 'the other lean names the other house');
});

test('a cold or tense front, or no conflict record, stays silent', () => {
  const { buildEndingEpilogueModel } = requireFeature();
  const cold = buildEndingEpilogueModel({
    event: 'endgame:chosen',
    payload: { choice: ENDING_DEFS[0].id },
    state: stateWith({ [WAR_PAIR]: { tension: 40, state: 'cold', playerLean: 0.3, momentum: 0 } }),
  });
  assert.equal(cold.warLine, null, 'a cold pair renders nothing');
  const tense = buildEndingEpilogueModel({
    event: 'endgame:chosen',
    payload: { choice: ENDING_DEFS[0].id },
    state: stateWith({ [WAR_PAIR]: { tension: 60, state: 'tense', playerLean: 0, momentum: 0 } }),
  });
  assert.equal(tense.warLine, null, 'a tense pair stays quiet, like the desk');
  const none = buildEndingEpilogueModel({
    event: 'endgame:chosen',
    payload: { choice: ENDING_DEFS[0].id },
    state: stateWith(undefined),
  });
  assert.equal(none.warLine, null, 'no record, no line');
});

test('the war line rides every ending, including the sandbox continuation', () => {
  const { buildEndingEpilogueModel } = requireFeature();
  const conflicts = { [WAR_PAIR]: { tension: 90, state: 'war', playerLean: 0, momentum: 90 } };
  for (const def of ENDING_DEFS) {
    const model = buildEndingEpilogueModel({
      event: 'endgame:chosen',
      payload: { choice: def.id },
      state: stateWith(conflicts, def),
    });
    assert.ok(model.warLine, `${def.id} names the war it left`);
  }
  const sandbox = buildEndingEpilogueModel({
    event: 'endgame:sandboxContinued',
    payload: { sandboxMode: SANDBOX_DEF.sandboxMode },
    state: stateWith(conflicts, SANDBOX_DEF),
  });
  assert.ok(sandbox.warLine, 'the non-ending continuation names the war too');
});

test('the mounted card renders a THE WAR YOU LEFT section, and none without a war', () => {
  const { createEndingEpilogue } = requireFeature();
  const { document, root } = installFakeDom();
  const bus = createBus();
  const state = stateWith({ [WAR_PAIR]: { tension: 80, state: 'war', playerLean: 0.3, momentum: 40 } });
  createEndingEpilogue({ bus, state, root });
  bus.emit('endgame:chosen', { choice: ENDING_DEFS[0].id });
  const dialog = root.querySelector('.sf-ending-epilogue');
  assert.ok(dialog, 'the epilogue mounts');
  const titles = dialog.querySelectorAll('.sf-ending-epilogue__section-title');
  assert.ok(titles.some((node) => node.textContent === 'THE WAR YOU LEFT'), 'the war section mounts');
  const copy = dialog.querySelectorAll('.sf-ending-epilogue__section-copy');
  assert.ok(copy.some((node) => /still a war/.test(node.textContent)), 'the war copy is on the glass');
  // Dismiss, take the war out of the world, and the same card mounts without the section.
  dialog.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.equal(root.querySelector('.sf-ending-epilogue'), null, 'escape dismisses');
  state.conflicts = undefined;
  bus.emit('endgame:chosen', { choice: ENDING_DEFS[0].id });
  const quietDialog = root.querySelector('.sf-ending-epilogue');
  assert.ok(quietDialog, 'a warless epilogue still mounts');
  const quietTitles = quietDialog.querySelectorAll('.sf-ending-epilogue__section-title');
  assert.equal(quietTitles.some((node) => node.textContent === 'THE WAR YOU LEFT'), false, 'no war, no section');
  assert.equal(document.activeElement != null, true);
});
