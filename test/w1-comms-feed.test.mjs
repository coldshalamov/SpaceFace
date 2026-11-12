// W1 comms-feed regression: four persistent receipts plus an ordinary line, then a repeated
// load. The durable act record is state.story.journeyActs, so Continue adds no live act row and
// the ordinary line keeps its slot under the four-line cap.
// Run: node --test test/w1-comms-feed.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createComms } from '../src/ui/comms.js';
import { missions as missionsProto } from '../src/systems/missions.js';

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

test('four persistent receipts cannot starve an ordinary line, and a repeated load adds no act row', () => {
  const dom = installDom();
  const bus = createBus();
  const state = {
    mode: 'station',
    ui: { docked: true },
    settings: {},
    nav: null,
    onboarding: null,
    simTime: 10,
    playerId: 1,
    player: { tether: { active: false } },
    entities: { get: () => null },
    factions: {},
    story: {
      beatIndex: 4,
      branch: 'traders',
      flags: {
        journey_act_I_announced: true,
        journey_act_II_announced: true,
        journey_act_III_announced: true,
      },
      journeyActs: { seen: ['I', 'II', 'III'], current: 'III' },
    },
  };
  const comms = createComms({ bus, state });
  try {
    for (let i = 1; i <= 4; i += 1) {
      bus.emit('comms:popup', {
        id: 'persist:' + i,
        sender: 'THE BOOK',
        text: 'Persistent line ' + i,
        category: 'story',
        persist: true,
        storyReceipt: true,
      });
    }
    bus.emit('comms:popup', { sender: 'CHN', text: 'Ordinary line survives', category: 'ambient' });
    const feed = dom.doc.getElementById('sf-comms');
    const active = liveRows(feed);
    assert.equal(active.length, 4, 'the live cap still holds four rows');
    assert.match(liveText(feed), /Ordinary line survives/,
      'the ordinary line is not inserted only to be evicted by the persistent receipts');
    assert.equal(active.filter((row) => /Persistent line/.test(textOf(row))).length, 3,
      'the oldest persistent receipt yields its live slot; the backlog still keeps it');

    // Continue twice on an already-announced act: journeyActs is the durable record, so the
    // load path republishes nothing and the ordinary line keeps its place.
    const system = {
      state,
      bus,
      _reconcileJourneyAct: missionsProto._reconcileJourneyAct,
      _publishJourneyAct: missionsProto._publishJourneyAct,
    };
    system._reconcileJourneyAct();
    system._reconcileJourneyAct();
    assert.match(liveText(feed), /Ordinary line survives/, 'the ordinary line survives repeated loads');
    assert.doesNotMatch(liveText(feed), /ACT III - THREE DOORS/, 'an announced act is not republished on load');
  } finally {
    comms.destroy();
    dom.restore();
  }
});
