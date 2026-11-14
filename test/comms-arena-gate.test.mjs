// Open-world radio stays out of a live Swarm arena (doc 20); Swarm-authored lines still draw.
// Run: node --test test/comms-arena-gate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createComms, arenaGatesComms } from '../src/ui/comms.js';

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
    // The context wheel (G18-02) builds its dial with insertAdjacentHTML; this feed test only needs it to exist.
    insertAdjacentHTML(_where, html) { this.innerHTML = (this.innerHTML || '') + String(html); },
    querySelector() { return makeNode('div'); },
    querySelectorAll() { return []; },
    closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    focus() {},
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

function textOf(node, out = []) {
  if (typeof node.textContent === 'string' && node.textContent) out.push(node.textContent);
  for (const child of node.children || []) textOf(child, out);
  return out.join(' ');
}

function liveRows(feed) {
  return feed.children.filter((row) => !row.classList.contains('sf-comm--out'));
}

function liveText(feed) {
  return liveRows(feed).map((row) => textOf(row)).join(' ');
}

function stateFor(run) {
  return { mode: 'station', ui: { docked: true }, settings: {}, nav: null, onboarding: null, simTime: 500, playerId: 1,
    player: { tether: { active: false } }, entities: { get: () => null }, factions: {}, story: { beatIndex: 4, flags: {} }, run };
}

test('arena gate: live survival run of any ruleset, inactive and no run are not', () => {
  assert.equal(arenaGatesComms(stateFor({ kind: 'survival', phase: 'active', ruleset: 'swarm' }), {}), true);
  assert.equal(arenaGatesComms(stateFor({ kind: 'survival', phase: 'active', ruleset: 'other' }), {}), true);
  assert.equal(arenaGatesComms(stateFor({ kind: 'survival', phase: 'inactive' }), {}), false);
  assert.equal(arenaGatesComms(stateFor(null), {}), false);
  assert.equal(arenaGatesComms(stateFor({ kind: 'survival', phase: 'active' }), { swarmAuthored: true }), false);
});

test('a live arena draws no open-world radio line; Swarm-authored lines and the quiet map still do', () => {
  const dom = installDom();
  const bus = createBus();
  const state = stateFor({ kind: 'survival', phase: 'active', ruleset: 'arcade' });
  state.mode = 'flight'; state.ui = {};
  const comms = createComms({ bus, state });
  try {
    const feed = dom.doc.getElementById('sf-comms');
    bus.emit('comms:popup', { sender: 'Dock control, Coalition HQ', text: 'The yard is flush.', category: 'personal' });
    assert.equal(liveRows(feed).length, 0, 'radio held out of the arena');
    bus.emit('comms:popup', { sender: 'MADAME KILN', text: 'Keep the line taut.', category: 'personal', swarmAuthored: true });
    assert.match(liveText(feed), /Keep the line taut/);
    state.run = { kind: 'survival', phase: 'inactive' };
    state.mode = 'station'; state.ui = { docked: true };
    bus.emit('comms:popup', { sender: 'Dock control', text: 'Repair is cheap.', category: 'personal' });
    assert.match(liveText(feed), /Repair is cheap/);
  } finally { comms.destroy(); dom.restore(); }
});
