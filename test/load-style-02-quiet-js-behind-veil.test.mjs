// LOAD-STYLE-02 — the loading shell must quiet the three JS style invalidators the Swarm-load
// trace still paid behind the veil:
//   governStep    (src/ui/orrery/typeGovernor.js — el.style.setProperty, 913 invalidations)
//   draw          (src/features/salvageOutfits/integration.js — CANVAS.sf-salvage-outfits-overlay, 772)
//   syncPadLabels (src/ui/floatingText.js — 340)
// Each stands down while #boot-overlay owns the screen — loadingShellVisible is the same test the
// loading presenter and the veil's CSS use — resumes on the first frame after it lifts, and the
// governor and the overlay never rewrite a DOM value that did not change.
//
// RUN: node --test test/load-style-02-quiet-js-behind-veil.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { installTypeGovernor, governTree } from '../src/ui/orrery/typeGovernor.js';
import { mountSalvageOutfitsPresentation } from '../src/features/salvageOutfits/integration.js';
import { createFloatingText } from '../src/ui/floatingText.js';

const XHTML = 'http://www.w3.org/1999/xhtml';

/** The element loadingShellVisible reads: display not 'none' and no .hidden class = shell owns the screen. */
function veiledShell() {
  const classes = new Set();
  const shell = {
    style: { display: 'flex' },
    classList: {
      contains: (name) => classes.has(name),
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
    },
  };
  return { shell, lift: () => classes.add('hidden') };
}

function stubEl(tag) {
  const el = {
    tagName: String(tag).toUpperCase(), id: '', className: '', children: [],
    style: {},
    get textContent() { return this._text !== undefined ? this._text : this.children.map((c) => c.textContent).join(''); },
    set textContent(v) { this.children.length = 0; this._text = v; },
    appendChild(child) { this.children.push(child); child.parentNode = el; return child; },
    insertBefore(child, ref) {
      const i = this.children.indexOf(ref);
      this.children.splice(i < 0 ? this.children.length : i, 0, child);
      child.parentNode = el; return child;
    },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      child.parentNode = null; return child;
    },
    remove() { this.parentNode?.removeChild(this); },
    setAttribute(name, value) { (this._attrs || (this._attrs = {}))[name] = String(value); },
    getAttribute(name) { return this._attrs ? this._attrs[name] ?? null : null; },
  };
  return el;
}

function findById(root, id) {
  if (!root) return null;
  if (root.id === id) return root;
  for (const child of root.children || []) {
    const found = findById(child, id);
    if (found) return found;
  }
  return null;
}

/** A screen root holding one uppercase label; writes land in `writes`, computed reads in `reads`. */
function governorFixture({ inline = {}, priorities = {} } = {}) {
  const writes = [];
  const inlineValues = new Map(Object.entries(inline));
  const priorityValues = new Map(Object.entries(priorities));
  const label = {
    nodeType: 1, tagName: 'SPAN', namespaceURI: XHTML, dataset: {},
    childNodes: [{ nodeType: 3, nodeValue: 'STATION' }], children: [],
    closest: () => null,
    style: {
      setProperty: (prop, value, priority) => {
        writes.push(prop);
        inlineValues.set(prop, value); priorityValues.set(prop, priority || '');
      },
      getPropertyValue: (prop) => inlineValues.get(prop) ?? '',
      getPropertyPriority: (prop) => priorityValues.get(prop) ?? '',
    },
    computed: {
      textTransform: 'uppercase', fontSize: '12px', letterSpacing: '3.36px',
      fontVariationSettings: '"wdth" 125, "wght" 650', fontStretch: '125%', fontWeight: '650',
    },
  };
  const screenClasses = new Set(['screen', 'sf-screen--visible']);
  const screen = {
    nodeType: 1, tagName: 'DIV', namespaceURI: XHTML, dataset: {},
    childNodes: [label], children: [label], isConnected: true,
    classList: { contains: (name) => screenClasses.has(name) },
    closest: (sel) => (sel.includes('.screen') ? screen : null),
    style: { setProperty: () => writes.push('screen') },
  };
  const host = { children: [screen] };
  const doc = {
    defaultView: null,
    getElementById: () => null,
    createTreeWalker: () => { const nodes = [label]; let i = -1; return { nextNode: () => nodes[++i] || null }; },
  };
  screen.ownerDocument = label.ownerDocument = doc;
  return { writes, label, screen, host, doc };
}

test('typeGovernor: no reads or writes while the loading shell is up; the first uncovered frame governs', () => {
  const frames = [], reads = [];
  const veil = veiledShell();
  const fixture = governorFixture();
  const { doc, host } = fixture;
  const win = {
    document: doc,
    MutationObserver: class { observe() {} disconnect() {} },
    performance: { now: () => 0 },
    requestAnimationFrame: (cb) => { frames.push(cb); return frames.length; },
    requestIdleCallback: (cb) => { throw new Error('the visible screen never takes the idle lane'); },
    setTimeout: () => 0,
    getComputedStyle: (el) => { reads.push(el); return el.computed; },
  };
  doc.defaultView = win;
  doc.getElementById = (id) => (id === 'screens' ? host : id === 'boot-overlay' ? veil.shell : null);
  installTypeGovernor(doc);

  assert.equal(frames.length, 1, 'the visible screen queues a frame');
  frames.shift()();
  assert.equal(reads.length, 0, 'the veil must stand the step down before even the measured read');
  assert.equal(fixture.writes.length, 0, 'no style write may land while the shell is up');
  assert.equal(frames.length, 1, 'the screen stays queued for the frame after the shell lifts');

  veil.lift();
  frames.shift()();
  assert.deepEqual(reads, [fixture.label], 'the first uncovered frame measures the label');
  assert.ok(fixture.writes.includes('letter-spacing'), 'the tracked-out label is governed once the veil lifts');
});

test('typeGovernor: a veiled governTree writes nothing and identical !important declarations are not rewritten', () => {
  const veil = veiledShell();
  const covered = governorFixture();
  covered.doc.getElementById = (id) => (id === 'boot-overlay' ? veil.shell : null);
  const winCovered = { document: covered.doc, getComputedStyle: (el) => el.computed };
  assert.equal(governTree(covered.screen, winCovered), 0, 'a covered tree is left for the next pass');
  assert.equal(covered.writes.length, 0);

  // letter-spacing already holds the cap at !important; font-stretch holds '100%' at normal
  // priority (a stylesheet !important could beat it, so it must still be written).
  const fixture = governorFixture({
    inline: { 'letter-spacing': '0.075em', 'font-stretch': '100%' },
    priorities: { 'letter-spacing': 'important' },
  });
  const win = { getComputedStyle: (el) => el.computed };
  assert.equal(governTree(fixture.screen, win), 1);
  assert.deepEqual(fixture.writes.sort(), ['font-stretch', 'font-variation-settings'],
    'the identical important declaration is skipped; the same value at lower priority still writes');
});

test('salvageOutfits overlay: the canvas stands down behind the loading shell and resumes after it lifts', () => {
  const previousDocument = globalThis.document;
  const veil = veiledShell();
  const hiddenWrites = [];
  const doc = {
    createElement(tag) {
      const el = stubEl(tag);
      el.ownerDocument = doc;
      if (tag === 'canvas') {
        let hidden = true;
        Object.defineProperty(el, 'hidden', {
          get: () => hidden,
          set: (value) => { hiddenWrites.push(value); hidden = !!value; },
        });
        el.getContext = () => ({});
      }
      return el;
    },
    getElementById: (id) => (id === 'boot-overlay' ? veil.shell : null),
    head: stubEl('head'), body: stubEl('body'),
  };
  globalThis.document = doc;
  try {
    const root = stubEl('div');
    root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    root.clientWidth = 800; root.clientHeight = 600;
    let stateCalls = 0;
    const state = () => {
      stateCalls++;
      return {
        mode: 'flight', ui: {}, world: { currentSectorId: 'sector_ceres_belt' },
        entities: new Map(), playerId: 'player', salvageOutfits: { meetings: {} },
      };
    };
    const mounted = mountSalvageOutfitsPresentation({
      root, bus: createBus(), state, deck: () => null,
      helpers: { worldToScreen: () => ({ x: 1, y: 1, onScreen: true }) },
    });
    stateCalls = 0;

    mounted.draw();
    assert.equal(stateCalls, 0, 'the veil stands the whole draw down — even the state read');
    assert.equal(hiddenWrites.length, 0, 'no canvas.hidden write while covered');

    veil.lift();
    mounted.draw();
    assert.ok(stateCalls > 0, 'the first uncovered frame draws again');
    assert.deepEqual(hiddenWrites, [false], 'the canvas is unhidden once to show itself');
    mounted.draw();
    assert.equal(hiddenWrites.length, 1, 'an unchanged hidden value is not rewritten');
    mounted.destroy();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('floatingText pad labels: no projection or DOM writes while the loading shell is up, resume after', () => {
  const previousDocument = globalThis.document;
  const veil = veiledShell();
  const hudEl = stubEl('div'); hudEl.id = 'hud';
  const doc = {
    createElement: (tag) => stubEl(tag),
    getElementById: (id) => (id === 'hud' ? hudEl : id === 'boot-overlay' ? veil.shell : null),
    querySelectorAll: () => [],
    defaultView: { performance: { now: () => 0 }, addEventListener() {} },
    documentElement: stubEl('html'),
    head: stubEl('head'), body: stubEl('body'),
  };
  globalThis.document = doc;
  try {
    const bus = createBus();
    const padBody = { id: 'pad_1', alive: true, pos: { x: 5, z: 5 }, data: { swarmFloorPad: { label: 'REPAIR' } } };
    const player = { id: 'player', alive: true, pos: { x: 0, z: 0 } };
    const state = {
      playerId: 'player', simTime: 0,
      entities: new Map([[player.id, player], [padBody.id, padBody]]),
      settings: { gameplay: {}, accessibility: {} },
    };
    let projections = 0;
    const helpers = {
      worldToScreen: (_w, out) => { projections++; out.x = 200; out.y = 100; out.onScreen = true; return out; },
    };
    const ft = createFloatingText({ state, bus, helpers });
    const padLayer = findById(hudEl, 'sf-floorpads');

    ft.update(0.016);
    assert.equal(projections, 0, 'the veil stands the pad pass down — even the projection read');
    assert.equal(padLayer.children.length, 0, 'no pad label is built while covered');

    veil.lift();
    ft.update(0.016);
    assert.ok(projections > 0, 'the first uncovered frame resumes the pad pass');
    assert.equal(padLayer.children.length, 1, 'the pad label is drawn once the shell lifts');
    assert.equal(padLayer.children[0].textContent, 'REPAIR');
    ft.destroy();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
