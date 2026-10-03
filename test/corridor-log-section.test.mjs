// CORRIDOR LOG (U9) — the encounter receipts ring finally has a reader.
//
// Every beat's outcome text used to live only as a transient toast; the director's saved
// receipts ring (RECEIPT_CAP 12) had no UI consumer anywhere. The Mission Log now folds a
// "Corridor log" section behind the same fine Show/Hide word as Completed, newest first.
//
// Contract (jsdom-free: the row HTML builder is exercised through the real DOM-less path —
// a minimal document stub, the same technique the screen's own fixtures use):
//   1. the section renders the ring newest-first with shape, outcome, age, and the receipt
//      text;
//   2. an empty ring reads the honest empty line;
//   3. the ring stays the single source: rendering does not mutate state.
import test from 'node:test';
import assert from 'node:assert/strict';

import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Minimal DOM stub sufficient for missionLog.js module evaluation and the log renderer. */
function domStub() {
  const nodes = [];
  const serialize = (node) => {
    if (node._rawHtml != null) return node._rawHtml;
    const cls = node.className ? ` class="${node.className}"` : '';
    const open = node.tag.startsWith('#') ? '' : `<${node.tag}${cls}>`;
    const close = node.tag.startsWith('#') ? '' : `</${node.tag}>`;
    return open + node.children.map(serialize).join('') + (node.textContent || '') + close;
  };
  const makeNode = (tag) => {
    const node = {
      tag, children: [], attrs: {}, listeners: {}, hidden: false,
      textContent: '',
      set className(v) { this.attrs.class = v; }, get className() { return this.attrs.class || ''; },
      set innerHTML(v) { this._rawHtml = v; this.children.length = 0; this.textContent = ''; },
      get innerHTML() { return serialize(this); },
      appendChild(child) { this._rawHtml = null; this.children.push(child); return child; },
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(kind, fn) { this.listeners[kind] = fn; },
      removeEventListener() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
      get parentElement() { return null; },
      dataset: {},
      style: {},
      focus() {},
      remove() {},
    };
    nodes.push(node);
    return node;
  };
  const document = {
    createElement: (tag) => makeNode(tag),
    createDocumentFragment: () => makeNode('#fragment'),
    body: makeNode('body'),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    documentElement: makeNode('html'),
  };
  return { document, nodes };
}

test('corridor log: the receipts ring renders newest-first with outcome and age', async () => {
  const { document } = domStub();
  const savedDocument = global.document;
  const savedWindow = global.window;
  global.document = document;
  global.window = { addEventListener() {}, location: { search: '' }, matchMedia: () => ({ matches: false }) };
  try {
    const mod = await import(pathToFileURL(path.join(ROOT, 'src', 'ui', 'screens', 'missionLog.js')).href);
    const state = {
      simTime: 1200,
      missions: { active: [], completedLog: [] },
      encounterDirector: {
        receipts: [
          { t: 600, shape: 'salvage_watch', outcome: 'repaired', text: 'WATCH CLOSED — the mule burned home.' },
          { t: 1140, shape: 'the_grandee_transit', outcome: 'transit_over', text: 'THE GRANDEE CLEARED — the famous run came and went clean.' },
        ],
      },
      player: { hints: {} },
      story: {},
      world: { currentSectorId: 'sector_helios_prime' },
    };
    const screen = Object.create(mod.missionLogScreen);
    screen._corrListEl = document.createElement('div');
    screen._ctx = { state };
    screen._renderCorridorLog();

    const html = screen._corrListEl.innerHTML;
    assert.ok(html.includes('THE GRANDEE TRANSIT'), 'the newest receipt leads');
    assert.ok(html.indexOf('THE GRANDEE TRANSIT') < html.indexOf('SALVAGE WATCH'), 'newest first');
    assert.ok(html.includes('TRANSIT OVER'), 'the outcome word is read');
    assert.ok(html.includes('10 min ago'), `the age reads: ${html}`);
    assert.ok(html.includes('came and went clean'), 'the receipt text is the body');
    assert.equal(state.encounterDirector.receipts.length, 2, 'rendering does not mutate the ring');
  } finally {
    global.document = savedDocument;
    global.window = savedWindow;
  }
});

test('corridor log: an empty ring reads the honest line, not an empty box', async () => {
  const { document } = domStub();
  const savedDocument = global.document;
  const savedWindow = global.window;
  global.document = document;
  global.window = { addEventListener() {}, location: { search: '' }, matchMedia: () => ({ matches: false }) };
  try {
    const mod = await import(pathToFileURL(path.join(ROOT, 'src', 'ui', 'screens', 'missionLog.js')).href);
    const screen = Object.create(mod.missionLogScreen);
    screen._corrListEl = document.createElement('div');
    screen._ctx = { state: { simTime: 0, encounterDirector: {} } };
    screen._renderCorridorLog();
    assert.ok(screen._corrListEl.innerHTML.includes('Nothing worth logging yet'), 'the empty line');
  } finally {
    global.document = savedDocument;
    global.window = savedWindow;
  }
});
