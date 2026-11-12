// G16 fix: the migrated dialogs (comms endgame/scavenger choice, logbook recap) go through the
// Stage's dialog admission, so a dialog raised while a station/menu screen holds the seat waits
// and then shows. Real hosts, real emitter payloads (scenario:safeOpeningDemand, save:loaded).
// Run: node --test test/stage-dialogs.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createStage } from '../src/ui/stage.js';
import { createComms } from '../src/ui/comms.js';
import { createLogbookRecap } from '../src/ui/logbookRecap.js';

/** Minimal DOM used by the real comms presenter (the same shape the presenter tests mount). */
function makeNode(tagName = 'div') {
  const node = {
    tagName: String(tagName).toUpperCase(),
    id: '',
    className: '',
    textContent: '',
    innerHTML: '',
    hidden: false,
    isConnected: true,
    children: [],
    parentNode: null,
    dataset: {},
    attributes: {},
    listeners: {},
    style: { setProperty(name, value) { this[name] = value; } },
    get childNodes() { return this.children; },
    get firstChild() { return this.children[0] || null; },
    appendChild(child) {
      if (!child) return child;
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    insertBefore(child, ref) {
      child.parentNode = this;
      const i = ref ? this.children.indexOf(ref) : -1;
      if (i < 0) this.children.push(child); else this.children.splice(i, 0, child);
      return child;
    },
    append(...kids) { for (const kid of kids) this.appendChild(kid); },
    prepend(child) { return this.insertBefore(child, this.children[0] || null); },
    removeChild(child) {
      this.children = this.children.filter((entry) => entry !== child);
      child.parentNode = null;
      return child;
    },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'id') this.id = String(value);
      if (name === 'class') this.className = String(value);
      if (name === 'hidden') this.hidden = true;
    },
    getAttribute(name) { return this.attributes[name] ?? null; },
    removeAttribute(name) { delete this.attributes[name]; },
    hasAttribute(name) { return Object.hasOwn(this.attributes, name); },
    addEventListener(name, fn) { (this.listeners[name] = this.listeners[name] || []).push(fn); },
    removeEventListener(name, fn) {
      this.listeners[name] = (this.listeners[name] || []).filter((entry) => entry !== fn);
    },
    dispatchEvent(event) {
      for (const fn of this.listeners[event && event.type] || []) fn(event);
      return true;
    },
    querySelector() { return makeNode('div'); },
    querySelectorAll() { return []; },
    closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    focus() {},
    insertAdjacentHTML() {},
    replaceChildren(...kids) { for (const c of [...node.children]) node.removeChild(c); node.append(...kids); },
    click() { for (const fn of this.listeners.click || []) fn({ target: this, preventDefault() {}, stopPropagation() {} }); },
  };
  node.classList = {
    add(...names) { node.className = [...node.className.split(/\s+/), ...names].filter(Boolean).join(' '); },
    remove(...names) { node.className = node.className.split(/\s+/).filter((n) => n && !names.includes(n)).join(' '); },
    toggle(name, force) {
      const has = node.className.split(/\s+/).includes(name);
      const want = force === undefined ? !has : !!force;
      if (want && !has) node.classList.add(name);
      if (!want && has) node.classList.remove(name);
      return want;
    },
    contains(name) { return node.className.split(/\s+/).includes(name); },
  };
  return node;
}

function installDom() {
  const previous = globalThis.document;
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const head = makeNode('head');
  const body = makeNode('body');
  const html = makeNode('html');
  const uiRoot = makeNode('div');
  uiRoot.id = 'ui-root';
  body.appendChild(uiRoot);
  const doc = {
    head,
    body,
    documentElement: html,
    activeElement: body,
    createElement: makeNode,
    createElementNS: (_namespace, tagName) => makeNode(tagName),
    createDocumentFragment: () => makeNode('fragment'),
    getElementById(id) {
      const visit = (node) => {
        if (!node) return null;
        if (node.id === id) return node;
        for (const child of node.children || []) {
          const found = visit(child);
          if (found) return found;
        }
        return null;
      };
      return visit(head) || visit(body);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
  };
  uiRoot.ownerDocument = doc;
  body.ownerDocument = doc;
  head.ownerDocument = doc;
  globalThis.document = doc;
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  return {
    doc,
    restore() {
      if (previous === undefined) delete globalThis.document; else globalThis.document = previous;
      if (previousRaf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previousRaf;
      if (previousCancel === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = previousCancel;
    },
  };
}


const commsState = () => ({
  mode: 'flight', ui: {}, settings: {}, nav: null, onboarding: null, simTime: 10, playerId: 1,
  player: { tether: { active: false } }, entities: { get: () => null }, factions: {}, story: { flags: {} },
});

test('a comms choice dialog raised under an open screen waits, then shows when it closes', () => {
  const dom = installDom();
  try {
    const stage = createStage({ document: dom.doc });
    const bus = createBus();
    const comms = createComms({ bus, state: commsState(), stage });
    const screen = stage.hold('dialog'); // screenManager holds the seat while a screen is open
    bus.emit('scenario:safeOpeningDemand', { demand: 'yield' });
    assert.deepEqual(stage.queued('dialog'), ['comms-choice'], 'the dialog waits behind the screen');
    assert.deepEqual(stage.visible('dialog'), []);
    screen.release();
    assert.deepEqual(stage.visible('dialog'), ['comms-choice'], 'it shows once the screen closes');
    comms.destroy();
    assert.equal(stage.has('dialog'), false, 'teardown frees the seat');
  } finally { dom.restore(); }
});

test('the logbook recap card waits behind a held dialog seat and shows on release', async () => {
  const dom = installDom();
  try {
    const stage = createStage({ document: dom.doc });
    const bus = createBus();
    const state = { mode: 'flight', paused: false, ui: { screenStack: [] }, simTime: 5, meta: { seed: 1 }, chronicler: { stories: [] } };
    const recap = createLogbookRecap({ state, bus }, { document: dom.doc, now: () => 0, media: { urlApi: null } });
    const screen = stage.hold('dialog');
    bus.emit('save:loaded', {});
    recap.frame();
    assert.deepEqual(stage.queued('dialog'), ['logbook-recap'], 'the card queues instead of drawing over the screen');
    screen.release();
    assert.deepEqual(stage.visible('dialog'), ['logbook-recap']);
    bus.emit('game:new', {});
    assert.equal(stage.has('dialog'), false, 'hiding the card frees the seat');
    recap.dispose();
    await new Promise((r) => setTimeout(r, 30)); // let the media restore settle before the DOM goes
  } finally { dom.restore(); }
});
