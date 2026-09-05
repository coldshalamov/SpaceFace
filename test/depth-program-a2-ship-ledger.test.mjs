import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  SHIP_LEDGER_ENTRY_TYPES,
  SHIP_LEDGER_TEMPLATES,
  VOLS_LEDGER_ANNOTATIONS,
  validateShipLedgerTemplates,
} from '../src/data/shipLedgerTemplates.js';
import {
  buildShipLedger,
  formatLedgerCycle,
  SHIP_LEDGER_MAX_ENTRIES,
  SHIP_LEDGER_MAX_PAGE_SIZE,
  SHIP_LEDGER_PAGE_SIZE,
  shipLedgerGraffitiQuotes,
  volsLedgerGateOpen,
} from '../src/systems/shipLedger.js';
import { createShipLedgerPanel, shipLedgerEntryAriaLabel } from '../src/ui/screens/shipLedger.js';

function playedState() {
  return {
    meta: { seed: 0x47a },
    simTime: 4800,
    lossLedger: {
      entries: [{
        lossId: 'loss_vigil_01', shipDefId: 'ship_wasp', assetId: 'cap_vigil',
        sectorId: 'sector_helios_prime', cargoHint: 'sealed recorders', kind: 'ship',
        t: 620, source: 'entity:killed',
      }],
    },
    player: {
      // PQ-142.01. design/VISION.md Part II: the ship accumulates "scars, repairs, odd fittings,
      // a reputation by hull — until it is my fucking ship." The hull under the player is a ledger
      // source like any other durable receipt: one open mark, one the yard covered, one act a
      // witness saw. Three rows, three source kinds, all read-only.
      activeShipIndex: 0,
      ownedShips: [{
        defId: 'ship_kestrel',
        fittings: [],
        livingHull: {
          schema: 'spaceface.livingHull.v1',
          historyVersion: 2,
          killTally: 1,
          repairPatches: 1,
          heatScorch: 0,
          lastWashAtT: 0,
          washCount: 0,
          graffitiLine: null,
          graffitiAuthor: null,
          updatedAtT: 3000,
          scars: [
            {
              id: 'slam:18000:port bow',
              cause: 'slam',
              surface: 'terrain',
              band: 'crushing',
              facing: 'port bow',
              atT: 300,
              tick: 18000,
              patchedAtT: 2600,
            },
            {
              id: 'weapon:186000:stern',
              cause: 'weapon',
              surface: 'weapon',
              band: 'hard',
              facing: 'stern',
              atT: 3100,
              tick: 186000,
              patchedAtT: null,
            },
          ],
          renown: [{
            id: 'kill:loss_vigil_01',
            act: 'kill',
            factionId: 'faction_reach',
            sectorId: 'sector_helios_prime',
            atT: 620,
            tick: 37200,
          }],
        },
      }],
      tradeLedger: [{
        stationId: 'station_helios', commodityId: 'cmdty_refined_metals', side: 'sell',
        qty: 7, total: 847, seenAt: 720,
      }],
      uniqueWrecks: {
        bearings: {
          wreck_isc_vigilant: {
            wreckId: 'wreck_isc_vigilant', name: 'ISC Vigilant', sectorId: 'sector_helios_prime',
            phase: 'salvaged', sourceRef: 'loss.vigilant', channelId: 'bar', heardAtS: 900,
            fixedAtS: 1200, radius: 440, salvagedAtS: 1800, resolvedAtS: 1800,
            choiceId: 'claim', outcome: 'claimed', rewardReceipt: { id: 'vigilant:claim' },
          },
        },
      },
      flags: {},
    },
    story: {
      beatIndex: 6,
      endgameResolved: true,
      flags: { volsEchoUnlocked: true, endgame: true },
      recoveredNames: [{ id: 'senna-name-ada', name: 'Ada Venn', recoveredAt: 2100 }],
      titlesSeen: [{ id: 'thunderchild', title: 'Thunderchild', seenAt: 2400 }],
      depthProgramEncounters: {
        completed: {
          depth_h1_distress_from_inside: { outcome: 'listen' },
          depth_h5_corridor_massacre: { outcome: 'published' },
        },
        history: [
          { shapeId: 'depth_h1_distress_from_inside', outcome: 'listen', at: 1500, tick: 90000 },
          { shapeId: 'depth_h5_corridor_massacre', outcome: 'published', at: 2700, tick: 162000 },
        ],
      },
    },
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

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
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...nodes);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }
  dispatch(type, event) { const listener = this.listeners.get(type); if (listener) listener(event); }
  closest(selector) {
    if (selector === '[data-ledger-page]' && this.attributes.has('data-ledger-page')) return this;
    return this.parentNode && this.parentNode.closest ? this.parentNode.closest(selector) : null;
  }
  focus() { this.ownerDocument.activeElement = this; }
}

class MiniDocument {
  constructor() { this.activeElement = null; }
  createElement(tagName) {
    const node = new MiniNode(tagName);
    node.ownerDocument = this;
    return node;
  }
  createDocumentFragment() {
    const node = new MiniNode('', true);
    node.ownerDocument = this;
    return node;
  }
}

function findNode(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children || []) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

test('A2 prose bank has at least four distinct variants for every ledger entry type', () => {
  const validation = validateShipLedgerTemplates();
  assert.deepEqual(validation, { ok: true, errors: [] });
  // Eight archive families plus the three PQ-142.01 hull-history families (scar / patch / renown).
  // design/VISION.md Part II: "The ship accumulates history — scars, repairs, odd fittings, a
  // reputation by hull — until it is my fucking ship."
  assert.equal(SHIP_LEDGER_ENTRY_TYPES.length, 11);
  for (const type of SHIP_LEDGER_ENTRY_TYPES) {
    assert.ok(SHIP_LEDGER_TEMPLATES[type].length >= 4, `${type} must have four variants`);
    assert.equal(new Set(SHIP_LEDGER_TEMPLATES[type].map((entry) => entry.text)).size,
      SHIP_LEDGER_TEMPLATES[type].length);
  }
  assert.ok(VOLS_LEDGER_ANNOTATIONS.length >= 4);
});

test('played state projects at least six source types deterministically without mutating any writer', () => {
  const state = playedState();
  const before = JSON.stringify(state);
  deepFreeze(state);

  const first = buildShipLedger(state);
  const replay = buildShipLedger(state);
  assert.deepEqual(first, replay);
  assert.equal(JSON.stringify(state), before, 'projection must be byte-identical over every source slice');
  assert.ok(first.total >= 9);
  assert.deepEqual(new Set(first.entries.map((entry) => entry.type)), new Set(SHIP_LEDGER_ENTRY_TYPES));
  assert.equal(first.entries.every((entry) => entry.text && entry.cycleLabel.startsWith('CYCLE ')), true);
  assert.equal(first.entries.some((entry) => entry.text.includes('{')), false, 'all template tokens resolve');
  assert.equal(Object.isFrozen(first), true, 'published projection is immutable');
  assert.equal(Object.isFrozen(first.entries), true, 'published rows cannot become a shadow writer');
  assert.equal(Object.isFrozen(first.entries[0]), true, 'entry snapshots are immutable');
  assert.equal(formatLedgerCycle(0), 'CYCLE 0001');
  assert.equal(formatLedgerCycle(1200), 'CYCLE 0003');
});

test('duplicate live trade receipts remain distinct and speculative flags cannot invent story proof', () => {
  const state = playedState();
  state.player.tradeLedger.push({ ...state.player.tradeLedger[0] });
  state.story.endgameResolved = false;
  state.story.endgameChoice = null;
  state.story.flags = {
    endgame: true,
    sennaRecoveredName: 'False Flag Name',
    thunderchildPassed: true,
  };
  state.player.flags.sennaRecoveredName = 'Another False Name';
  state.player.titlesSeen = [{ id: 'false-player-title', title: 'False Player Title', seenAt: 2500 }];
  delete state.story.recoveredNames;
  delete state.story.titlesSeen;

  const model = buildShipLedger(state);
  assert.equal(model.entries.filter((entry) => entry.type === 'trade').length, 2,
    'two economy receipts in one fixed tick must not collapse to one row');
  assert.equal(model.entries.some((entry) => entry.type === 'name'), false,
    'only the explicit future Senna receipt array may write a name row');
  assert.equal(model.entries.some((entry) => entry.type === 'title'), false,
    'only the explicit future title receipt array may write a title row');
  assert.deepEqual(model.endgameQuotes, [],
    'a guessed generic endgame flag is not a canonical resolved ending');
});

test('Vols writes only after the story gate and only on previous-crew receipts', () => {
  const beforeGate = playedState();
  beforeGate.story.beatIndex = 2;
  assert.equal(volsLedgerGateOpen(beforeGate), false);
  assert.equal(buildShipLedger(beforeGate).entries.some((entry) => entry.hand === 'vols'), false);

  const afterGate = playedState();
  assert.equal(volsLedgerGateOpen(afterGate), true);
  const projected = buildShipLedger(afterGate);
  const previousCrew = projected.entries.find((entry) => entry.sourceId.includes('depth_h1_distress_from_inside'));
  assert.ok(previousCrew);
  assert.equal(previousCrew.hand, 'vols');
  assert.match(previousCrew.annotation, /^Second hand:/);
  assert.equal(projected.entries.filter((entry) => entry.hand === 'vols').every((entry) => (
    entry.sourceId.includes('depth_h1_distress_from_inside')
      || entry.sourceId.includes('depth_h3_wreck_that_knows_you')
  )), true);
});

test('Senna recovered name and endgame graffiti quote the ledger instead of inventing new lines', () => {
  const state = playedState();
  const model = buildShipLedger(state);
  const name = model.entries.find((entry) => entry.type === 'name');
  assert.ok(name);
  assert.match(name.text, /Ada Venn/);

  const quotes = shipLedgerGraffitiQuotes(state);
  assert.ok(quotes.length > 0 && quotes.length <= 4);
  for (const quote of quotes) {
    const source = model.entries.find((entry) => entry.id === quote.sourceEntryId);
    assert.ok(source, 'graffiti quote must point at a real projected ledger row');
    assert.equal(quote.text, source.text.toUpperCase());
  }

  delete state.story.endgameResolved;
  delete state.story.flags.endgame;
  assert.deepEqual(shipLedgerGraffitiQuotes(state), [], 'quotes remain dormant before endgame');
});

test('archive is capped and paginated so a panel never receives an unbounded row set', () => {
  const state = playedState();
  state.lossLedger.entries = [];
  state.player.tradeLedger = [];
  state.player.uniqueWrecks.bearings = {};
  // No hull in the berth, so the PQ-142.01 hull-history rows cannot pad the count either: this
  // test is about the archive cap over ONE source, and every other source is silenced.
  state.player.ownedShips = [];
  state.story.depthProgramEncounters.history = [];
  state.story.recoveredNames = [];
  state.story.titlesSeen = Array.from({ length: 600 }, (_, index) => ({
    id: `title-${index}`, title: `Passing Title ${index}`, seenAt: index * 10,
  }));

  const first = buildShipLedger(state);
  assert.equal(first.total, SHIP_LEDGER_MAX_ENTRIES);
  assert.equal(first.entries.length, SHIP_LEDGER_PAGE_SIZE);
  assert.equal(first.archiveCount, SHIP_LEDGER_MAX_ENTRIES - SHIP_LEDGER_PAGE_SIZE);
  assert.equal(first.truncatedCount, 360);
  assert.equal(first.hasOlder, true);
  assert.equal(first.entries.some((entry) => entry.text.includes('Passing Title 599')), true,
    'the source cap keeps newest future title receipts rather than the oldest array prefix');

  const finalPage = buildShipLedger(state, { page: 999 });
  assert.equal(finalPage.page, finalPage.pageCount - 1);
  assert.ok(finalPage.entries.length <= SHIP_LEDGER_PAGE_SIZE);
  assert.equal(finalPage.hasOlder, false);

  const oversized = buildShipLedger(state, { pageSize: 999 });
  assert.equal(oversized.pageSize, SHIP_LEDGER_MAX_PAGE_SIZE);
  assert.ok(oversized.entries.length <= SHIP_LEDGER_MAX_PAGE_SIZE);
});

test('standalone dock panel carries semantic landmarks and descriptive archive controls', async () => {
  const source = await readFile(new URL('../src/ui/screens/shipLedger.js', import.meta.url), 'utf8');
  assert.match(source, /createElement\('section'\)/);
  assert.match(source, /aria-labelledby/);
  assert.match(source, /role', 'status'/);
  assert.match(source, /aria-live', 'polite'/);
  assert.match(source, /createElement\('ol'\)/);
  assert.match(source, /aria-label', 'Ship ledger archive pages'/);
  assert.match(source, /replaceChildren\(fragment\)/, 'render replaces one bounded page instead of appending forever');

  const annotated = buildShipLedger(playedState()).entries.find((entry) => entry.hand === 'vols');
  assert.match(shipLedgerEntryAriaLabel(annotated), /Captain Vols annotated this entry\./);
});

test('mounted panel renders one bounded page and keeps archive controls operable', () => {
  const previousDocument = globalThis.document;
  const documentRef = new MiniDocument();
  globalThis.document = documentRef;
  const state = playedState();
  state.lossLedger.entries = [];
  state.player.tradeLedger = [];
  state.player.uniqueWrecks.bearings = {};
  // No hull in the berth, so the PQ-142.01 hull-history rows cannot pad the count either: this
  // test is about the archive cap over ONE source, and every other source is silenced.
  state.player.ownedShips = [];
  state.story.depthProgramEncounters.history = [];
  state.story.recoveredNames = [];
  state.story.titlesSeen = Array.from({ length: 25 }, (_, index) => ({
    id: `mounted-title-${index}`, title: `Mounted Title ${index}`, seenAt: index * 10,
  }));

  let panel;
  try {
    panel = createShipLedgerPanel({ state, bus: { emit() {} } });
    panel.onShow();
    const list = findNode(panel.el, (node) => node.tagName === 'OL');
    const status = findNode(panel.el, (node) => node.getAttribute('role') === 'status');
    const older = findNode(panel.el, (node) => node.getAttribute('data-ledger-page') === 'older');
    const newer = findNode(panel.el, (node) => node.getAttribute('data-ledger-page') === 'newer');
    const nav = older.parentNode;

    assert.equal(list.children.length, SHIP_LEDGER_PAGE_SIZE);
    assert.match(status.textContent, /25 entries\. Archive page 1 of 3\./);
    assert.equal(newer.disabled, true);
    assert.equal(older.disabled, false);

    nav.dispatch('click', { target: older });
    assert.equal(panel.model.page, 1);
    assert.equal(list.children.length, SHIP_LEDGER_PAGE_SIZE);
    assert.equal(documentRef.activeElement, newer);

    nav.dispatch('click', { target: older });
    assert.equal(panel.model.page, 2);
    assert.equal(list.children.length, 1);
    assert.equal(older.disabled, true);
    assert.equal(newer.disabled, false);
    assert.match(status.textContent, /Archive page 3 of 3\./);
  } finally {
    if (panel) panel.destroy();
    globalThis.document = previousDocument;
  }
});
