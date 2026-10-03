// FB-069 — the doing/then/so prose buildShipLedger already returns reaches the ledger panel.
// The shared panel is mounted by two hosts (station + codex); both must carry the prose at the
// head of the page, verbatim, from the model — never recomputed in the UI.

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildShipLedger } from '../src/systems/shipLedger.js';
import { createShipLedgerPanel } from '../src/ui/shipLedgerPanel.js';

const EXPECTED_PROSE =
  'I was doing quiet work, then a bounty arrived, so I carry the bounty because of the witness.';

// Seed 4242, three ledger entries — the spec's pin. One escalation seed yields one cited ledger
// entry; two plain receipts pad the page to three rows so the archive is exercised too.
function seededState() {
  return {
    meta: { seed: 4242 },
    simTime: 90,
    player: {
      tradeLedger: [
        { side: 'sell', qty: 4, commodityId: 'cmdty_ore_iron', stationId: 'station_tethys', total: 112, seenAt: 30 },
        { side: 'buy', qty: 2, commodityId: 'cmdty_food', stationId: 'station_helios', total: 60, seenAt: 60 },
      ],
    },
    encounterDirector: {
      sessionRhythm: { phase: 'quiet', enteredAt: 0, dwellS: 90 },
      escalationSeeds: [{
        id: 'esc:witness:fb069',
        cause: 'witness',
        beat: 'bounty',
        causeId: 'fb069',
        seededAt: 12,
        arrivedAt: 24,
        arrived: true,
        delayS: 12,
        place: { x: 800, z: -400, zoneId: 'zone_ceres_yards', name: 'Ceres yards' },
        playerAct: true,
      }],
    },
  };
}

// Minimal DOM stub — the panel only creates elements, sets text/attrs, and appends children.
class MiniNode {
  constructor(tagName = '', fragment = false) {
    this.tagName = String(tagName).toUpperCase();
    this.isFragment = fragment;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  append(...nodes) { for (const node of nodes) this.appendChild(node); }
  appendChild(node) {
    if (node && node.isFragment) {
      for (const child of [...node.children]) this.appendChild(child);
      node.children = [];
      return node;
    }
    if (!node) return node;
    node.parentNode = this;
    this.children.push(node);
    return node;
  }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'id') this.id = String(value); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type); }
  focus() {}
}
class MiniDocument {
  constructor() { this.head = new MiniNode('head'); }
  createElement(tagName) { return new MiniNode(tagName); }
  createDocumentFragment() { return new MiniNode('', true); }
}

function findByClass(node, className, acc = []) {
  if (!node) return acc;
  if (typeof node.className === 'string' && node.className.split(/\s+/).includes(className)) acc.push(node);
  for (const child of node.children || []) findByClass(child, className, acc);
  return acc;
}

test('FB-069: the panel renders the model\'s storySoFar prose at the head — both hosts', () => {
  const state = seededState();
  const model = buildShipLedger(state, { page: 0, pageSize: 24 });
  assert.equal(model.total, 3, 'seeded page must carry three ledger entries');
  assert.equal(model.storySoFar.prose, EXPECTED_PROSE);

  const previousDocument = globalThis.document;
  globalThis.document = new MiniDocument();
  try {
    for (const hostId of ['station', 'codex']) {
      const panel = createShipLedgerPanel({ state, bus: { emit() {} } }, { hostId });
      panel.refresh(0);
      const stories = findByClass(panel.el, 'st-ledger-story');
      assert.equal(stories.length, 1, `${hostId} host must own exactly one story line`);
      const story = stories[0];
      assert.equal(story.textContent, EXPECTED_PROSE,
        `${hostId} host must print the model's prose verbatim`);
      assert.equal(story.hidden, false, `${hostId} story line must be visible when prose exists`);
      // Head of the page: the story sits between the intro and the status line.
      const order = panel.el.children.map((child) => child.className || '');
      const storyIdx = order.findIndex((cls) => cls.includes('st-ledger-story'));
      const listIdx = order.findIndex((cls) => cls.includes('st-ledger-list'));
      assert.ok(storyIdx >= 0 && listIdx > storyIdx,
        `${hostId} story must head the entry list, not follow it`);
      // The UI prints the returned field — the panel model is unchanged, never recomputed.
      assert.equal(panel.model.storySoFar.prose, EXPECTED_PROSE);
      panel.destroy();
    }
  } finally {
    globalThis.document = previousDocument;
  }
});

test('FB-069: an empty story collapses the line instead of printing a placeholder', () => {
  const previousDocument = globalThis.document;
  globalThis.document = new MiniDocument();
  try {
    const panel = createShipLedgerPanel({ state: { meta: { seed: 4242 } }, bus: { emit() {} } }, { hostId: 'codex' });
    panel.refresh(0);
    const [story] = findByClass(panel.el, 'st-ledger-story');
    // projectStorySoFar always yields prose ('kept the book' fallback) — that IS the authored
    // voice, so it renders. Hidden only if a host model ever drops the field entirely.
    assert.equal(story.textContent, panel.model.storySoFar.prose);
    panel.destroy();
  } finally {
    globalThis.document = previousDocument;
  }
});
