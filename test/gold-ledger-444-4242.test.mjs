// Row 444 GOLD-LEDGER — the diegetic evidence pin/link board (seed 4242).
//
// Covers the amended plan's §6 acceptance slice: provenance (real acquisition only — catalog
// presence admits nothing), deliberate interaction (nothing pins or links itself), refusals
// (every bad input yields a nonempty player-facing reason and leaves state unchanged), the Vale
// solve (a deliberately linked Verge chain resolves exactly once; incomplete or wrong chains never
// unlock), owner-level save/load round trip + untouched-run laziness, the DOM panel surface
// (controls call the owner APIs, refusals render, archive navigation is intact), and read-only
// determinism of the existing projection.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { story } from '../src/systems/story.js';
import {
  buildShipLedger,
  collectWreckCathedralEvidence,
  SHIP_LEDGER_EVIDENCE_SITE_ID,
  SHIP_LEDGER_VERGE_EVIDENCE_PAGES,
  admissibleLedgerEvidence,
  ledgerEvidenceDetail,
  shipLedgerBoard,
  pinEvidence,
  unpinEvidence,
  linkEvidence,
  unlinkEvidence,
  vergeEvidenceLinked,
  serializeShipLedgerBoard,
  deserializeShipLedgerBoard,
  deserializeShipLedgerBoardChunked,
} from '../src/systems/shipLedger.js';
import { createShipLedgerPanel } from '../src/ui/shipLedgerPanel.js';
import {
  WRECK_CATHEDRAL_EVIDENCE_CATALOG,
  WRECK_CATHEDRAL_EVIDENCE_CATALOG_REVISION,
  WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS,
} from '../src/data/wreckCathedralEvidenceCatalog.js';
import { applyClueObservation } from '../src/data/scanClues.js';

const SEED = 4242;
const SITE_ID = SHIP_LEDGER_EVIDENCE_SITE_ID;
const CATHEDRAL_A = 'wreck_cathedral.missing_convoy';
const CATHEDRAL_B = 'wreck_cathedral.capital_hull_located';
const [VERGE_KELL, VERGE_ARCHIVE, VERGE_KURTZ] = SHIP_LEDGER_VERGE_EVIDENCE_PAGES.map((p) => p.pageId);

function cathedralReceipt(pageId, overrides = {}) {
  return {
    receiptId: `rec_${pageId}`,
    pageId,
    revision: 1,
    earnedTick: 600,
    earnedAtS: 10,
    siteRecordId: SITE_ID,
    componentId: `${pageId}_component`,
    operationId: 'op_evidence',
    operationReceiptId: `rec_${pageId}`,
    stateFrom: 'initial',
    stateTo: 'located',
    provenanceRef: `wreck_cathedral/${pageId}`,
    catalogRevision: WRECK_CATHEDRAL_EVIDENCE_CATALOG_REVISION,
    ...overrides,
  };
}

function withCathedral(state, pageIds) {
  state.sites = state.sites || {};
  state.sites.worldById = state.sites.worldById || {};
  const receipts = {};
  for (const pageId of pageIds) receipts[pageId] = cathedralReceipt(pageId);
  state.sites.worldById[SITE_ID] = { evidenceReceiptsByPageId: receipts, evidenceRevision: 1 };
  return state;
}

function withVergeEvidence(state, { revealed = true, keys = ['kellPaperTrail', 'archiveFile', 'kurtzLedger'] } = {}) {
  state.story = state.story || {};
  state.story.facts = state.story.facts || [];
  const evidence = { kellPaperTrail: false, archiveFile: false, kurtzLedger: false };
  for (const key of keys) {
    evidence[key] = true;
    state.story.facts.push({ id: `verge:${key}`, atS: 30 });
  }
  state.story.verge = {
    revealed,
    awake: false,
    valeGatesRevoked: false,
    playerUsedClosureProtocol: false,
    evidence,
    revocations: [],
  };
  return state;
}

function blankState() {
  return { meta: { seed: SEED }, simTime: 42 };
}

const json = (value) => JSON.stringify(value);

// ── provenance: catalog presence and hidden data admit nothing ──────────────────────────────

test('444: the catalog alone admits nothing — only real acquisition makes a page pinnable', () => {
  const state = blankState();
  assert.ok(Object.hasOwn(WRECK_CATHEDRAL_EVIDENCE_CATALOG, CATHEDRAL_A), 'the page is catalogued');
  assert.equal(admissibleLedgerEvidence(state).size, 0, 'catalogued is not earned');
  const refused = pinEvidence(state, CATHEDRAL_A);
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /not been earned/);
  assert.equal(state.shipLedger, undefined, 'a refused pin creates no board key');
  // A real physical receipt is the only thing that admits the page.
  withCathedral(state, [CATHEDRAL_A]);
  assert.ok(admissibleLedgerEvidence(state).has(CATHEDRAL_A));
  assert.equal(pinEvidence(state, CATHEDRAL_A).ok, true);
});

test('444: Verge evidence pages are admissible only through the durable story flags', () => {
  const state = blankState();
  assert.equal(pinEvidence(state, VERGE_KELL).ok, false, 'unearned Vale evidence refuses');
  withVergeEvidence(state, { keys: ['kellPaperTrail', 'archiveFile'] });
  assert.equal(pinEvidence(state, VERGE_KELL).ok, true);
  assert.equal(pinEvidence(state, VERGE_ARCHIVE).ok, true);
  const kurtz = pinEvidence(state, VERGE_KURTZ);
  assert.equal(kurtz.ok, false, 'the third page still waits for the real desk ledger');
  assert.match(kurtz.reason, /not been earned/);
});

test('444: a filed scanner claim stays a lead until a real reading contradicts it', () => {
  const state = blankState();
  state.signalInvestigation = { clues: { subjects: {} } };
  const book = state.signalInvestigation.clues;
  const first = applyClueObservation(book, {
    subjectId: 'convoy_manifest', claim: 'convoy was hijacked', at: 100,
  });
  assert.ok(first.hypothesis, 'the claim files as a lead');
  const leadPageId = 'clue.convoy_manifest';
  assert.equal(pinEvidence(state, leadPageId).ok, false, 'a lead alone is not board evidence');
  const second = applyClueObservation(book, {
    subjectId: 'convoy_manifest', claim: 'convoy was released from inside', at: 200,
  });
  assert.equal(second.relation, 'contradicted', 'the second reading contradicts the filed claim');
  assert.ok(admissibleLedgerEvidence(state).has(leadPageId), 'contradiction history is evidence');
  assert.equal(pinEvidence(state, leadPageId).ok, true);
});

// ── deliberate interaction: nothing pins or links itself ─────────────────────────────────────

test('444: acquisition alone never builds a board — pin and link are deliberate acts', () => {
  const state = withCathedral(blankState(), [CATHEDRAL_A, CATHEDRAL_B]);
  collectWreckCathedralEvidence(state);
  buildShipLedger(state);
  assert.equal(state.shipLedger, undefined, 'reading the ledger never writes a board');
  assert.equal(shipLedgerBoard(state), null);
  pinEvidence(state, CATHEDRAL_A);
  assert.deepEqual(shipLedgerBoard(state).pins, [CATHEDRAL_A]);
  assert.deepEqual(shipLedgerBoard(state).links, [], 'a pin never links itself');
});

test('444: pin order is preserved and unpin cuts every thread tied to the page', () => {
  const state = withCathedral(blankState(), WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS.slice(0, 3));
  const [a, b, c] = WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS;
  pinEvidence(state, c); pinEvidence(state, a); pinEvidence(state, b);
  assert.deepEqual(shipLedgerBoard(state).pins, [c, a, b], 'pins keep player order');
  assert.equal(linkEvidence(state, c, a).ok, true);
  assert.equal(linkEvidence(state, b, c).ok, true);
  assert.equal(unpinEvidence(state, c).ok, true);
  assert.deepEqual(shipLedgerBoard(state).pins, [a, b]);
  assert.deepEqual(shipLedgerBoard(state).links, [], 'unpinning removes the threads that touched it');
});

// ── refusals: every bad input → nonempty reason, state unchanged ────────────────────────────

test('444: every refusal names why and leaves the run byte-identical', () => {
  const state = withCathedral(withVergeEvidence(blankState()), [CATHEDRAL_A, CATHEDRAL_B]);
  pinEvidence(state, CATHEDRAL_A);
  pinEvidence(state, VERGE_KELL);
  const cases = [
    ['unknown page', () => pinEvidence(state, 'wreck_cathedral.not_a_page')],
    ['empty pageId', () => pinEvidence(state, '   ')],
    ['unearned page', () => pinEvidence(state, 'wreck_cathedral.what_was_carried')],
    ['duplicate pin', () => pinEvidence(state, CATHEDRAL_A)],
    ['unknown unpin', () => unpinEvidence(state, 'wreck_cathedral.not_a_page')],
    ['not-pinned unpin', () => unpinEvidence(state, CATHEDRAL_B)],
    ['self link', () => linkEvidence(state, CATHEDRAL_A, CATHEDRAL_A)],
    ['link with unknown id', () => linkEvidence(state, CATHEDRAL_A, 'nope')],
    ['link an unpinned page', () => linkEvidence(state, CATHEDRAL_A, CATHEDRAL_B)],
    ['unrelated pair', () => linkEvidence(state, VERGE_KELL, CATHEDRAL_A)],
    ['no thread to cut', () => unlinkEvidence(state, CATHEDRAL_A, CATHEDRAL_B)],
  ];
  for (const [label, act] of cases) {
    const before = json(state);
    const result = act();
    assert.equal(result.ok, false, `${label} refuses`);
    assert.ok(typeof result.reason === 'string' && result.reason.length > 0, `${label} gives a reason`);
    assert.equal(json(state), before, `${label} mutates nothing`);
  }
});

test('444: a duplicate link refuses whichever order the pair arrives in', () => {
  const state = withCathedral(blankState(), [CATHEDRAL_A, CATHEDRAL_B]);
  pinEvidence(state, CATHEDRAL_A); pinEvidence(state, CATHEDRAL_B);
  assert.equal(linkEvidence(state, CATHEDRAL_A, CATHEDRAL_B).ok, true);
  const duplicate = linkEvidence(state, CATHEDRAL_B, CATHEDRAL_A);
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.reason, /already tied/);
  assert.equal(shipLedgerBoard(state).links.length, 1);
  assert.equal(unlinkEvidence(state, CATHEDRAL_B, CATHEDRAL_A).ok, true, 'the pair cuts in either order');
  assert.deepEqual(shipLedgerBoard(state).links, []);
});

// ── the Vale solve: deliberate linked chain, exact existing requirements, once ──────────────

function valeRun({ revealed = true } = {}) {
  const sim = createSimulation({ seed: SEED, systems: [story] });
  const state = sim.state;
  state.mode = 'flight';
  state.ui = { docked: true }; // the board lives on the docked station screen
  withVergeEvidence(state, { revealed });
  const emitted = [];
  const original = sim.bus.emit.bind(sim.bus);
  sim.bus.emit = (event, payload) => { emitted.push({ event, payload }); return original(event, payload); };
  return { sim, state, emitted };
}

function pinAllVerge(state) {
  for (const page of SHIP_LEDGER_VERGE_EVIDENCE_PAGES) assert.equal(pinEvidence(state, page.pageId).ok, true);
}

test('444: a deliberately linked three-page Verge chain revokes Vale — exactly once', () => {
  const { sim, state, emitted } = valeRun();
  pinAllVerge(state);
  assert.equal(vergeEvidenceLinked(state), false, 'pins alone are not a chain');
  linkEvidence(state, VERGE_KELL, VERGE_ARCHIVE);
  sim.bus.emit('ledger:evidenceLinked', { a: VERGE_KELL, b: VERGE_ARCHIVE });
  assert.equal(state.story.verge.valeGatesRevoked, false, 'an incomplete chain never resolves');
  linkEvidence(state, VERGE_ARCHIVE, VERGE_KURTZ);
  sim.bus.emit('ledger:evidenceLinked', { a: VERGE_ARCHIVE, b: VERGE_KURTZ });
  assert.equal(state.story.verge.valeGatesRevoked, true, 'the deliberate chain resolves');
  const revokes = emitted.filter((e) => e.event === 'story:vergeValeGatesRevoked');
  assert.equal(revokes.length, 1, 'the revocation emits exactly once');
  assert.equal(revokes[0].payload.id, 'gate_deep_reach_revoked');
  // A third deliberate tie lands on an already-revoked lattice: still exactly one.
  sim.bus.emit('ledger:evidenceLinked', { a: VERGE_KELL, b: VERGE_KURTZ });
  assert.equal(emitted.filter((e) => e.event === 'story:vergeValeGatesRevoked').length, 1);
});

test('444: wrong links and unrevealed observers never unlock', () => {
  const { sim, state, emitted } = valeRun();
  withCathedral(state, [CATHEDRAL_A, CATHEDRAL_B]);
  pinAllVerge(state);
  pinEvidence(state, CATHEDRAL_A); pinEvidence(state, CATHEDRAL_B);
  // A same-case cathedral pair is a legitimate tie — it is just not the Vale chain.
  assert.equal(linkEvidence(state, CATHEDRAL_A, CATHEDRAL_B).ok, true);
  // A two-node chain plus a spur that misses one Verge page still never resolves.
  linkEvidence(state, VERGE_KELL, VERGE_ARCHIVE);
  sim.bus.emit('ledger:evidenceLinked', { a: VERGE_KELL, b: VERGE_ARCHIVE });
  assert.equal(state.story.verge.valeGatesRevoked, false);
  assert.equal(emitted.filter((e) => e.event === 'story:vergeValeGatesRevoked').length, 0);
});

test('444: the chain respects the exact Verge gates — unrevealed or missing evidence cannot resolve', () => {
  // Unrevealed: the lattice never showed itself, so a perfect chain still cannot resolve.
  const hidden = valeRun({ revealed: false });
  pinAllVerge(hidden.state);
  linkEvidence(hidden.state, VERGE_KELL, VERGE_ARCHIVE);
  linkEvidence(hidden.state, VERGE_ARCHIVE, VERGE_KURTZ);
  assert.equal(vergeEvidenceLinked(hidden.state), true);
  hidden.sim.bus.emit('ledger:evidenceLinked', {});
  assert.equal(hidden.state.story.verge.valeGatesRevoked, false, 'unrevealed never resolves');
  // Missing evidence: only two pages earn admissibility; the third refuses and the chain is incomplete.
  const partial = valeRun();
  partial.state.story.verge.evidence.kurtzLedger = false;
  assert.equal(pinEvidence(partial.state, VERGE_KELL).ok, true);
  assert.equal(pinEvidence(partial.state, VERGE_ARCHIVE).ok, true);
  assert.equal(pinEvidence(partial.state, VERGE_KURTZ).ok, false, 'unearned desk ledger refuses');
  linkEvidence(partial.state, VERGE_KELL, VERGE_ARCHIVE);
  partial.sim.bus.emit('ledger:evidenceLinked', {});
  assert.equal(partial.state.story.verge.valeGatesRevoked, false);
});

// ── save/load: owner-level round trip + laziness ────────────────────────────────────────────

test('444: the board survives an owner-level save/load round trip with order and links intact', () => {
  const state = withCathedral(blankState(), WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS.slice(0, 3));
  const [a, b, c] = WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS;
  pinEvidence(state, c); pinEvidence(state, a); pinEvidence(state, b);
  linkEvidence(state, a, b); linkEvidence(state, c, a);
  const saved = JSON.parse(json(serializeShipLedgerBoard(state)));
  const restored = blankState();
  assert.equal(deserializeShipLedgerBoard(saved, restored), true);
  assert.deepEqual(shipLedgerBoard(restored).pins, [c, a, b]);
  assert.deepEqual(shipLedgerBoard(restored).links, [[a, b].sort(), [a, c].sort()].sort((x, y) => x[0].localeCompare(y[0]) || x[1].localeCompare(y[1])));
  // The loaded board is live: the same deliberate acts work on it.
  assert.equal(pinEvidence(restored, b).ok, false, 'a restored pin still dedupes');
  const chunked = [...deserializeShipLedgerBoardChunked(saved, blankState())];
  assert.deepEqual(chunked, ['shipLedger:board']);
});

test('444: malformed loaded boards normalize instead of trusting', () => {
  const restored = blankState();
  assert.equal(deserializeShipLedgerBoard({
    board: {
      pins: [' verge.kell_paper_trail ', 'verge.kell_paper_trail', 42, null, 'verge.archive_file'],
      links: [
        ['verge.kell_paper_trail', 'verge.archive_file'],
        { a: 'verge.archive_file', b: 'verge.kell_paper_trail' }, // duplicate by object form
        ['verge.kell_paper_trail', 'verge.kell_paper_trail'],     // self
        ['verge.kell_paper_trail', 'ghost.page'],                 // endpoint not pinned
        'nonsense',
      ],
    },
  }, restored), true);
  const board = shipLedgerBoard(restored);
  assert.deepEqual(board.pins, ['verge.kell_paper_trail', 'verge.archive_file']);
  assert.deepEqual(board.links, [['verge.archive_file', 'verge.kell_paper_trail']]);
});

test('444: untouched runs stay lazy — no board key, no serialized payload, snapshot unchanged', () => {
  const state = withCathedral(blankState(), [CATHEDRAL_A]);
  const before = json(state);
  buildShipLedger(state);
  admissibleLedgerEvidence(state);
  shipLedgerBoard(state);
  pinEvidence(state, 'wreck_cathedral.not_a_page'); // refused — still no write
  assert.equal(serializeShipLedgerBoard(state), undefined, 'no payload without a board');
  assert.equal(deserializeShipLedgerBoard({}, state), false, 'absent board restores nothing');
  assert.equal(state.shipLedger, undefined, 'no shipLedger key ever materializes');
  assert.equal(json(state), before, 'the run serializes byte-identically');
});

// ── DOM panel: controls call the owner, refusals render, navigation intact ──────────────────

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
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type); }
  dispatch(type, event) { const listener = this.listeners.get(type); if (listener) listener(event); }
  closest(selector) {
    const selfSelectors = [
      '[data-ledger-page]', '[data-ledger-evidence]', '[data-ledger-back]',
      '[data-ledger-pin]', '[data-ledger-tie]', '[data-ledger-board-open]',
      '[data-ledger-board-tie]', '[data-ledger-board-unpin]', '[data-ledger-board-cut]',
      '[data-ledger-board-cancel]',
    ];
    const attr = selfSelectors.find((sel) => sel === selector);
    if (attr && this.attributes.has(attr.slice(1, -1))) return this;
    return this.parentNode && this.parentNode.closest ? this.parentNode.closest(selector) : null;
  }
  focus() {}
  click() { this.dispatch('click', { target: this }); }
}
class MiniDocument {
  createElement(tagName) { return new MiniNode(tagName); }
  createDocumentFragment() { return new MiniNode('', true); }
}

function find(node, pred) {
  if (!node) return null;
  if (pred(node)) return node;
  for (const child of node.children || []) { const hit = find(child, pred); if (hit) return hit; }
  return null;
}
function findAll(node, pred, out = []) {
  if (node && pred(node)) out.push(node);
  for (const child of (node && node.children) || []) findAll(child, pred, out);
  return out;
}

test('444: the docked panel pins, ties, refuses, and navigates — all through owner APIs', () => {
  const previousDocument = globalThis.document;
  globalThis.document = new MiniDocument();
  try {
    const state = withCathedral(withVergeEvidence(blankState()), [CATHEDRAL_A]);
    const emitted = [];
    const bus = { emit: (event, payload) => emitted.push({ event, payload }), on() {}, off() {} };
    const panel = createShipLedgerPanel({ state, bus }, { hostId: 'station' });
    panel.onShow();

    const evBtn = find(panel.el, (n) => n.getAttribute('data-ledger-evidence') === CATHEDRAL_A);
    assert.ok(evBtn, 'an earned evidence row renders');
    const list = find(panel.el, (n) => n.tagName === 'OL');
    const detail = find(panel.el, (n) => n.attributes.has('data-ledger-back'));
    const detailRoot = detail.parentNode;
    list.dispatch('click', { target: evBtn });
    assert.equal(detailRoot.hidden, false, 'the evidence page opens');

    // Pin from the open page — the owner writes, the board chip appears.
    const pinBtn = find(panel.el, (n) => n.attributes.has('data-ledger-pin'));
    detailRoot.dispatch('click', { target: pinBtn });
    assert.deepEqual(shipLedgerBoard(state).pins, [CATHEDRAL_A], 'the pin button called the owner');
    assert.equal(pinBtn.textContent, 'Unpin from board');
    assert.ok(find(panel.el, (n) => n.attributes.has('data-ledger-board-open')), 'a board chip renders');

    // Back restores the archive list untouched.
    const backBtn = find(panel.el, (n) => n.attributes.has('data-ledger-back'));
    detailRoot.dispatch('click', { target: backBtn });
    assert.equal(detailRoot.hidden, true);
    assert.equal(list.hidden, false, 'Back returns to the archive list');

    // A cross-case tie refuses and the owner reason renders on the board note.
    const board = find(panel.el, (n) => n.getAttribute('aria-label') === 'Case board');
    assert.ok(board, 'the case board section renders');
    pinEvidence(state, VERGE_KELL); // earned above; deliberate second pin
    panel.refresh();
    // Arm the tie from the Verge page's detail, then tap the cathedral chip's Tie here.
    panel.openEvidenceByPageId(VERGE_KELL);
    const tieBtn = find(panel.el, (n) => n.attributes.has('data-ledger-tie'));
    detailRoot.dispatch('click', { target: tieBtn });
    detailRoot.dispatch('click', { target: backBtn });
    const tieHere = find(panel.el, (n) => n.getAttribute('data-ledger-board-tie') === CATHEDRAL_A);
    assert.ok(tieHere, 'an armed tie offers Tie here on the other pinned pages');
    board.dispatch('click', { target: tieHere });
    assert.equal(shipLedgerBoard(state).links.length, 0, 'the cross-case tie refused');
    const note = find(panel.el, (n) => n.className.includes('st-ledger-board-note'));
    assert.match(note.textContent, /share no case thread/, 'the owner refusal renders verbatim');

    // Cancel the armed tie, then make a legal tie through the panel.
    const cancel = find(panel.el, (n) => n.attributes.has('data-ledger-board-cancel'));
    board.dispatch('click', { target: cancel });
    pinEvidence(state, VERGE_ARCHIVE);
    panel.refresh();
    panel.openEvidenceByPageId(VERGE_KELL);
    detailRoot.dispatch('click', { target: tieBtn });
    detailRoot.dispatch('click', { target: backBtn });
    const tieHere2 = find(panel.el, (n) => n.getAttribute('data-ledger-board-tie') === VERGE_ARCHIVE);
    board.dispatch('click', { target: tieHere2 });
    assert.equal(shipLedgerBoard(state).links.length, 1, 'a legal tie lands through the panel');
    const linked = emitted.find((e) => e.event === 'ledger:evidenceLinked');
    assert.ok(linked, 'the deliberate tie emits the submission intent');
    assert.ok(emitted.some((e) => e.event === 'audio:cue' && e.payload && e.payload.id === 'ui_click'),
      'interactions play the standard click cue');

    // Unpin from the chip removes it; archive paging buttons are untouched.
    const unpin = find(panel.el, (n) => n.getAttribute('data-ledger-board-unpin') === CATHEDRAL_A);
    board.dispatch('click', { target: unpin });
    assert.deepEqual(shipLedgerBoard(state).pins, [VERGE_KELL, VERGE_ARCHIVE]);
    assert.equal(shipLedgerBoard(state).links.length, 1, 'unrelated threads survive an unpin');
    const newer = find(panel.el, (n) => n.getAttribute('data-ledger-page') === 'newer');
    const older = find(panel.el, (n) => n.getAttribute('data-ledger-page') === 'older');
    assert.ok(newer && older, 'archive paging controls are intact');
    panel.destroy();
  } finally {
    globalThis.document = previousDocument;
  }
});

test('444: detail tie labels follow cancel, reopen, submission, and unpin', () => {
  const previousDocument = globalThis.document;
  globalThis.document = new MiniDocument();
  const state = withVergeEvidence(blankState());
  pinEvidence(state, VERGE_KELL);
  pinEvidence(state, VERGE_ARCHIVE);
  const emitted = [];
  const panel = createShipLedgerPanel({ state, bus: { emit: (event) => emitted.push(event) } });
  try {
    panel.onShow();
    panel.openEvidenceByPageId(VERGE_KELL);
    const tie = find(panel.el, (n) => n.attributes.has('data-ledger-tie'));
    const detail = tie.parentNode.parentNode;
    const clickTie = () => detail.dispatch('click', { target: tie });
    assert.equal(tie.textContent, 'Start a tie');
    clickTie();
    assert.equal(tie.textContent, 'Cancel tie');
    clickTie();
    assert.equal(tie.textContent, 'Start a tie', 'cancel restores the actual next action');
    clickTie();
    panel.closeDetail(false);
    panel.openEvidenceByPageId(VERGE_KELL);
    assert.equal(tie.textContent, 'Cancel tie', 'reopening the armed page still offers cancel');
    panel.closeDetail(false);
    panel.openEvidenceByPageId(VERGE_ARCHIVE);
    assert.match(tie.textContent, /^Tie to /);
    clickTie();
    assert.equal(shipLedgerBoard(state).links.length, 1);
    assert.equal(emitted.filter((event) => event === 'ledger:evidenceLinked').length, 1);
    assert.equal(tie.textContent, 'Start a tie', 'submission spends the armed tie');
    clickTie();
    const pin = find(panel.el, (n) => n.attributes.has('data-ledger-pin'));
    detail.dispatch('click', { target: pin });
    assert.equal(pin.textContent, 'Pin to board');
    assert.equal(tie.textContent, 'Start a tie', 'unpin disarms the tie and refreshes its label');
  } finally {
    panel.destroy();
    globalThis.document = previousDocument;
  }
});

// ── determinism: the projection stays a pure read ────────────────────────────────────────────

test('444: the ledger projection is unchanged by the board and stays deterministic', () => {
  const state = withCathedral(withVergeEvidence(blankState()), [CATHEDRAL_A]);
  const first = json(buildShipLedger(state));
  pinEvidence(state, CATHEDRAL_A); pinEvidence(state, VERGE_KELL); pinEvidence(state, VERGE_ARCHIVE);
  linkEvidence(state, VERGE_KELL, VERGE_ARCHIVE);
  const second = json(buildShipLedger(state));
  assert.equal(first, second, 'pins and links never leak into the read-only page model');
  const row = buildShipLedger(state).entries.find((e) => e.sourceId === VERGE_KELL);
  assert.ok(row && row.evidencePage, 'earned Verge evidence surfaces as a ledger page');
  assert.equal(row.evidencePage.pageId, VERGE_KELL);
});
