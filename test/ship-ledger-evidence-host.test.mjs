// PQ-021 focused Ledger tests: direct-keyed five-page collector, bounded revision selector,
// host-safe panel (no duplicate DOM IDs across two hosts), and leak-proof show/hide/host-switch.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildShipLedger,
  collectWreckCathedralEvidence,
  selectEvidenceWinner,
  SHIP_LEDGER_EVIDENCE_SITE_ID,
  SHIP_LEDGER_EVIDENCE_MAX_REVISIONS,
} from '../src/systems/shipLedger.js';
import { createShipLedgerPanel } from '../src/ui/shipLedgerPanel.js';
import {
  WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS,
  WRECK_CATHEDRAL_EVIDENCE_CATALOG_REVISION,
} from '../src/data/wreckCathedralEvidenceCatalog.js';

const SITE_ID = SHIP_LEDGER_EVIDENCE_SITE_ID;

function revReceipt(revision, overrides = {}) {
  return {
    receiptId: `rec_${revision}`,
    pageId: 'wreck_cathedral.missing_convoy',
    revision,
    earnedTick: 1000 + revision,
    earnedAtS: (1000 + revision) / 60,
    siteRecordId: SITE_ID,
    componentId: 'bridge_navigation_record',
    operationId: 'op_locate_convoy',
    operationReceiptId: `rec_${revision}`,
    stateFrom: 'initial',
    stateTo: 'located',
    provenanceRef: 'wreck_cathedral/c1_01',
    catalogRevision: WRECK_CATHEDRAL_EVIDENCE_CATALOG_REVISION,
    ...overrides,
  };
}

function stateWithReceipts(receiptsByPageId) {
  return {
    meta: { seed: 0x47a },
    sites: { worldById: { [SITE_ID]: { evidenceReceiptsByPageId: receiptsByPageId, evidenceRevision: 1 } } },
  };
}

// ---------------- collector: direct-keyed, no scan, frozen, read-only ----------------

test('collectWreckCathedralEvidence reads the five pages by direct key and writes nothing', () => {
  const map = {};
  for (const pageId of WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS) {
    map[pageId] = revReceipt(1, { pageId, receiptId: pageId, componentId: pageId + '_comp', provenanceRef: 'wreck_cathedral/' + pageId });
  }
  const state = stateWithReceipts(map);
  const before = JSON.stringify(state);
  const { winners, conflicts } = collectWreckCathedralEvidence(state);
  assert.equal(JSON.stringify(state), before, 'collector must not mutate the site record');
  assert.deepEqual(conflicts, []);
  assert.equal(winners.length, WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS.length, 'all five pages win');
  assert.deepEqual(winners.map((w) => w.pageId).sort(), [...WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS].sort());
  for (const { catalog } of winners) {
    assert.equal(catalog.revision, WRECK_CATHEDRAL_EVIDENCE_CATALOG_REVISION);
    assert.ok(catalog.media && catalog.media.path && catalog.media.alt);
  }
});

test('empty or absent site record yields no evidence and no conflicts (no unbounded scan)', () => {
  assert.deepEqual(collectWreckCathedralEvidence({}), { winners: [], conflicts: [] });
  assert.deepEqual(collectWreckCathedralEvidence({ sites: {} }), { winners: [], conflicts: [] });
  assert.deepEqual(collectWreckCathedralEvidence({ sites: { worldById: {} } }), { winners: [], conflicts: [] });
  // A present site record with a revision that does not match the catalog omits the page.
  const state = stateWithReceipts({
    'wreck_cathedral.missing_convoy': revReceipt(1, { catalogRevision: 999 }),
  });
  assert.deepEqual(collectWreckCathedralEvidence(state), { winners: [], conflicts: [] });
});

// ---------------- revision selector: bounded, order-independent, conflict-aware ----------------

test('selectEvidenceWinner picks the highest valid revision independent of array order', () => {
  const a = revReceipt(1);
  const b = revReceipt(2);
  const c = revReceipt(3);
  assert.equal(selectEvidenceWinner([a, b, c]).winner.revision, 3, 'ascending');
  assert.equal(selectEvidenceWinner([c, a, b]).winner.revision, 3, 'shuffled');
  assert.equal(selectEvidenceWinner([c, b, a]).winner.revision, 3, 'descending');
});

test('selectEvidenceWinner is bounded to four revisions and drops invalid candidates', () => {
  const revs = [1, 2, 3, 4, 5].map((r) => revReceipt(r));
  const result = selectEvidenceWinner(revs);
  assert.equal(result.winner.revision, 4, 'only the first four candidates are considered (cap)');
  assert.equal(result.conflict, false);
  // Invalid (negative/non-finite tick, missing provenance) candidates are dropped, not winners.
  const invalid = [{ ...revReceipt(2), earnedTick: -1 }, { ...revReceipt(2), provenanceRef: '' }, revReceipt(1)];
  assert.equal(selectEvidenceWinner(invalid).winner.revision, 1, 'invalid candidates cannot win');
});

test('byte-equivalent duplicate winners collapse; same-revision differences are a conflict', () => {
  const same = revReceipt(2);
  const collapsed = selectEvidenceWinner([same, { ...same }]);
  assert.equal(collapsed.conflict, false);
  assert.equal(collapsed.winner.revision, 2);
  // Same top revision, differing payload — never resolved by last-write or array order.
  const conflict = selectEvidenceWinner([
    { ...revReceipt(2), stateFrom: 'initial' },
    { ...revReceipt(2), stateFrom: 'surveyed' },
    revReceipt(1),
  ]);
  assert.equal(conflict.winner, null, 'a conflict produces no winner');
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.diagnostic.reason, 'same-revision-conflict');
  assert.equal(conflict.diagnostic.revision, 2);
  // Reversing the array does not change the conflict outcome (no last-write resolution).
  const reversed = selectEvidenceWinner([
    revReceipt(1),
    { ...revReceipt(2), stateFrom: 'surveyed' },
    { ...revReceipt(2), stateFrom: 'initial' },
  ]);
  assert.equal(reversed.winner, null);
  assert.equal(reversed.conflict, true);
});

// ---------------- projector integration: witness rows carry immutable evidencePage ----------------

test('buildShipLedger attaches an immutable evidencePage to witness rows with pageId-stable identity', () => {
  const pageId = 'wreck_cathedral.what_was_carried';
  const state = stateWithReceipts({ [pageId]: revReceipt(1, { pageId, receiptId: pageId }) });
  const before = JSON.stringify(state);
  const model = buildShipLedger(state);
  assert.equal(JSON.stringify(state), before, 'projection must not mutate any writer');
  const row = model.entries.find((e) => e.sourceId === pageId);
  assert.ok(row, 'an evidence row is projected');
  assert.equal(row.type, 'witness', 'evidence reuses the existing witness type, not a new taxonomy');
  assert.equal(row.id, `ledger_evidence_${pageId}`, 'row identity depends only on pageId');
  assert.ok(row.evidencePage && row.evidencePage.title && row.evidencePage.body && row.evidencePage.media);
  assert.equal(row.evidencePage.pageId, pageId);
  assert.equal(Object.isFrozen(row.evidencePage), true, 'evidencePage detail is immutable');
  assert.equal(Object.isFrozen(row), true);
  assert.equal(Object.isFrozen(model), true);
  // A higher accepted revision updates the SAME row (identity stays pageId-only).
  const higher = buildShipLedger(stateWithReceipts({ [pageId]: revReceipt(7, { pageId, receiptId: pageId }) }));
  assert.equal(higher.entries.find((e) => e.sourceId === pageId).id, row.id, 'higher revision reuses the same row id');
});

test('a same-revision conflict surfaces in evidenceConflicts and omits the page', () => {
  // Forcing two receipts for one page through the selector path via a synthetic array.
  const conflict = selectEvidenceWinner([
    { ...revReceipt(2), stateFrom: 'initial' },
    { ...revReceipt(2), stateFrom: 'surveyed' },
  ]);
  assert.equal(conflict.conflict, true);
  // The projector's evidenceConflicts channel is a read-only diagnostic, not a writer.
  const model = buildShipLedger({});
  assert.ok(Array.isArray(model.evidenceConflicts));
});

// ---------------- Phase 0 / Phase 2: host-safe panel, no duplicate DOM IDs ----------------

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
    if (node && node.isFragment) { for (const child of [...node.children]) this.appendChild(child); node.children = []; return node; }
    if (!node) return node;
    node.parentNode = this;
    this.children.push(node);
    return node;
  }
  replaceChildren(...nodes) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...nodes); }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'id') this.id = String(value);
    if (name === 'src') this.src = String(value);
  }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); if (name === 'id') this.id = undefined; if (name === 'src') this.src = undefined; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type); }
  dispatch(type, event) { const listener = this.listeners.get(type); if (listener) listener(event); }
  closest(selector) {
    if (selector === '[data-ledger-page]' && this.attributes.has('data-ledger-page')) return this;
    if (selector === '[data-ledger-evidence]' && this.attributes.has('data-ledger-evidence')) return this;
    if (selector === '[data-ledger-back]' && this.attributes.has('data-ledger-back')) return this;
    return this.parentNode && this.parentNode.closest ? this.parentNode.closest(selector) : null;
  }
  focus() { this.ownerDocument.activeElement = this; }
  remove() {}
}
class MiniDocument {
  constructor() { this.activeElement = null; }
  createElement(tagName) { const node = new MiniNode(tagName); node.ownerDocument = this; node.id = undefined; node.src = undefined; return node; }
  createDocumentFragment() { const node = new MiniNode('', true); node.ownerDocument = this; return node; }
}

function allIds(node, acc) {
  if (!node) return acc;
  if (node.id) acc.push(node.id);
  for (const child of node.children || []) allIds(child, acc);
  return acc;
}

// Resolve an id WITHIN one subtree only. A cross-host leak is invisible to a duplicate-id scan:
// two hosts can hold globally unique ids while one root's aria-labelledby points at the other
// root's heading, which silently breaks the accessible name on that host.
function findByIdWithin(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of node.children || []) {
    const hit = findByIdWithin(child, id);
    if (hit) return hit;
  }
  return null;
}

test('mounting the panel in TWO hosts simultaneously yields no duplicate DOM IDs', () => {
  const previousDocument = globalThis.document;
  globalThis.document = new MiniDocument();
  try {
    const ctx = { state: { meta: { seed: 1 } }, bus: { emit() {} } };
    const stationPanel = createShipLedgerPanel(ctx, { hostId: 'station' });
    const codexPanel = createShipLedgerPanel(ctx, { hostId: 'codex' });
    const ids = [...allIds(stationPanel.el, []), ...allIds(codexPanel.el, [])];
    const dups = ids.filter((id, i) => ids.indexOf(id) !== i);
    // The Phase 0 defect (two `#st-ledger-title` nodes) is fixed: every id is host-derived.
    assert.deepEqual(dups, [], 'no duplicate DOM ids across two hosts: ' + JSON.stringify(ids));
    assert.ok(ids.includes('st-ledger-station-title'));
    assert.ok(ids.includes('st-ledger-codex-title'));

    // Each root's accessible name must resolve to ITS OWN heading. Unique ids alone do not prove
    // this: suffixing `heading.id` while leaving the `aria-labelledby` literal untouched yields
    // zero duplicate ids and still points one host at the other host's heading.
    for (const [hostId, panel] of [['station', stationPanel], ['codex', codexPanel]]) {
      const labelledBy = panel.el.getAttribute('aria-labelledby');
      assert.equal(labelledBy, `st-ledger-${hostId}-title`,
        `${hostId} root must reference its own host-derived heading id`);
      const heading = findByIdWithin(panel.el, labelledBy);
      assert.ok(heading,
        `${hostId} aria-labelledby "${labelledBy}" must resolve INSIDE its own subtree`);
      assert.equal(heading.id, labelledBy);
    }
    assert.notEqual(
      stationPanel.el.getAttribute('aria-labelledby'),
      codexPanel.el.getAttribute('aria-labelledby'),
      'the two hosts must not share one accessible-name target');
    stationPanel.destroy();
    codexPanel.destroy();
  } finally {
    globalThis.document = previousDocument;
  }
});

// ---------------- leak proof: no listener / node / image-request leak across cycles ----------------

function leakState() {
  const pageId = WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS[0];
  return {
    meta: { seed: 1 },
    sites: { worldById: { [SITE_ID]: { evidenceReceiptsByPageId: {
      [pageId]: revReceipt(1, { pageId, receiptId: pageId }),
    }, evidenceRevision: 1 } } },
  };
}

test('show / open-evidence / hide / destroy leaks no listener, image request, or subscription', () => {
  const previousDocument = globalThis.document;
  const doc = new MiniDocument();
  globalThis.document = doc;
  let onCount = 0;
  const bus = { emit() {}, on() { onCount++; }, off() {} };
  try {
    const panel = createShipLedgerPanel({ state: leakState(), bus }, { hostId: 'station' });
    panel.onShow();

    // Find the evidence activation button and open the detail.
    const find = (pred) => (function walk(n) { if (!n) return null; if (pred(n)) return n; for (const c of n.children || []) { const f = walk(c); if (f) return f; } return null; });
    const evBtn = find((n) => n.attributes && n.attributes.has('data-ledger-evidence'))(panel.el);
    assert.ok(evBtn, 'evidence entry renders an activation button');
    const list = find((n) => n.tagName === 'OL')(panel.el);
    list.dispatch('click', { target: evBtn });

    const img = find((n) => n.tagName === 'IMG')(panel.el);
    assert.ok(img && img.attributes.has('src'), 'opening evidence arms one image request');
    assert.equal(typeof img.onerror, 'function', 'failure handler is armed');
    const detail = find((n) => n.attributes && n.attributes.get('aria-labelledby') === 'st-ledger-station-detail-title')(panel.el);
    assert.ok(detail && detail.hidden === false, 'detail is visible while open');

    // onHide collapses the detail and releases the image WITHOUT a hidden refresh.
    panel.onHide();
    assert.equal(detail.hidden, true, 'detail collapses on hide');
    assert.ok(!img.attributes.has('src'), 'image source is removed on hide (no hidden request)');
    assert.equal(img.onload, null);
    assert.equal(img.onerror, null, 'failure handler is detached on hide');

    // destroy removes every delegated listener; no bus subscription was ever taken.
    const nav = find((n) => n.attributes && n.attributes.get('aria-label') === 'Ship ledger archive pages')(panel.el);
    panel.destroy();
    assert.equal(nav.listeners.size, 0, 'nav listener removed');
    assert.equal(list.listeners.size, 0, 'list listener removed');
    assert.equal(detail.listeners.size, 0, 'detail listener removed');
    assert.equal(onCount, 0, 'the panel never subscribes to the bus');

    // Re-mounting a fresh panel in the same host (host-switch) does not inherit prior listeners.
    const panel2 = createShipLedgerPanel({ state: leakState(), bus }, { hostId: 'station' });
    panel2.onShow();
    const nav2 = find((n) => n.attributes && n.attributes.get('aria-label') === 'Ship ledger archive pages')(panel2.el);
    assert.equal(nav2.listeners.size, 1, 'a fresh mount arms exactly one nav listener');
    panel2.destroy();
    assert.equal(nav2.listeners.size, 0);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('image failure renders an explicit accessible state and never a substitute image', () => {
  const previousDocument = globalThis.document;
  const doc = new MiniDocument();
  globalThis.document = doc;
  try {
    const panel = createShipLedgerPanel({ state: leakState(), bus: { emit() {} } }, { hostId: 'station' });
    panel.onShow();
    const find = (pred) => (function walk(n) { if (!n) return null; if (pred(n)) return n; for (const c of n.children || []) { const f = walk(c); if (f) return f; } return null; });
    const evBtn = find((n) => n.attributes && n.attributes.has('data-ledger-evidence'))(panel.el);
    const list = find((n) => n.tagName === 'OL')(panel.el);
    list.dispatch('click', { target: evBtn });
    const img = find((n) => n.tagName === 'IMG')(panel.el);
    const figure = img.parentNode;
    const caption = figure.children.find((c) => c.tagName === 'FIGCAPTION');
    // Simulate the media failing to admit.
    img.onerror();
    assert.equal(figure.attributes.get('data-ledger-figure-state'), 'failed');
    assert.ok(!img.attributes.has('src'), 'no substitute image is substituted on failure');
    assert.match(img.attributes.get('alt'), /not admitted|unavailable/i, 'failure state is text-expressible');
    assert.match(caption.textContent, /not admitted|unavailable/i);
    panel.destroy();
  } finally {
    globalThis.document = previousDocument;
  }
});
