// RC-472 — every authored practice/story contract is a selectable event card with its real
// course drawing, terms and best time; one START launches only the selected event. Selection
// itself launches nothing, spends no cup ticket and never touches gameplay state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { RACE_LEVELS, RACING_CIRCUITS, circuitContracts, courseForLevel, practiceContractForLevel,
  raceContractById, raceLevelById, racingOfferFor, racingSeedFor } from '../src/data/raceLevels.js';
import { raceBoardScreen, runContract } from '../src/ui/screens/raceBoard.js';
import { takeRacingLaunch } from '../src/ui/racingLaunch.js';
import { rememberRacingResult } from '../src/ui/racingControls.js';
import { CUP_HEATS, currentRacingCup, abandonRacingCup, finishRacingCupHeat } from '../src/systems/racingCareer.js';
import { installSimCommandSink, uninstallSimCommandSink } from '../src/core/simLaneCommands.js';
import { raceRecordKey } from '../src/systems/racingSteer.js';
import { RACING_GHOST_STORAGE_KEY } from '../src/systems/racingGhosts.js';
import { formatRaceTime } from '../src/ui/racingMap.js';
import { fakeDom, findButtons, findAll, textLines } from './helpers/fake-dom.mjs';

const SEED = 4242;
const RECORD_KEY = 'spaceface.raceRecords.v2';
const FIT = { starter: 'starter_hitch', drive: 'standard', raceMode: 'time-trial', raceDifficulty: 'club' };

function memoryStorage() {
  const rows = new Map();
  return {
    getItem(key) { return rows.has(key) ? rows.get(key) : null; },
    setItem(key, value) { rows.set(key, String(value)); },
    removeItem(key) { rows.delete(key); },
  };
}

// --- local DOM extensions: SVG creation, child replacement, selector queries -----------
function matchSimple(node, sel) {
  if (!node || typeof node !== 'object' || !node.tagName) return false;
  let rest = sel.trim();
  const tagM = rest.match(/^([a-zA-Z*][\w-]*)/);
  if (tagM) {
    if (tagM[1] !== '*' && String(node.tagName).toLowerCase() !== tagM[1].toLowerCase()) return false;
    rest = rest.slice(tagM[1].length);
  }
  while (rest.length) {
    let m;
    if ((m = rest.match(/^\.([\w-]+)/))) {
      if (!node.classList?.contains?.(m[1])) return false;
    } else if ((m = rest.match(/^#([\w-]+)/))) {
      if (node.id !== m[1]) return false;
    } else if ((m = rest.match(/^\[([\w-]+)(?:\s*=\s*["']?([^"'\]]*)["']?)?\]/))) {
      const value = node.getAttribute?.(m[1]);
      if (value == null || (m[2] !== undefined && value !== m[2])) return false;
    } else return false;
    rest = rest.slice(m[0].length);
  }
  return true;
}
function queryAll(root, sel) {
  const out = [];
  for (const part of sel.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const scoped = trimmed.match(/^:scope\s*>\s*(.+)$/);
    if (scoped) {
      for (const child of root.children || []) if (matchSimple(child, scoped[1].trim())) out.push(child);
      continue;
    }
    const visit = (node) => {
      for (const child of node.children || []) {
        if (matchSimple(child, trimmed)) out.push(child);
        visit(child);
      }
    };
    visit(root);
  }
  return out;
}
function boardDocument() {
  const doc = fakeDom();
  const make = (tag) => {
    const node = doc._make(tag);
    node.nodeType = 1;
    node.replaceChildren = (...children) => {
      for (const old of node.children) old.parentNode = null; // detached, as in a real DOM
      node.children.length = 0; node.append(...children);
    };
    node.querySelector = (sel) => queryAll(node, sel)[0] || null;
    node.querySelectorAll = (sel) => queryAll(node, sel);
    node.contains = (other) => { let p = other; while (p) { if (p === node) return true; p = p.parentNode; } return false; };
    return node;
  };
  doc.createElement = make;
  doc.createElementNS = (_ns, tag) => make(tag);
  return doc;
}

// --- fixture --------------------------------------------------------------------------
function harness({ mode = 'menu', sectorId = 'sector_helios_prime' } = {}) {
  const state = createGameState(SEED);
  state.mode = mode;
  state.world.currentSectorId = sectorId;
  const player = { id: 1, alive: true, pos: { x: 10, z: 20 }, vel: { x: 0, z: 0 }, rot: 0 };
  state.playerId = 1;
  state.entities.set(1, player);
  const bus = createBus();
  const emitted = [];
  const realEmit = bus.emit;
  bus.emit = (event, payload) => { emitted.push({ event, payload }); realEmit(event, payload); };
  const accepted = [], relocations = [], entered = [];
  const world = {
    relocatePlayerInSector: (position, options) => { relocations.push({ position, options }); return true; },
    enterSector: (id) => { entered.push(id); state.world.currentSectorId = id; },
  };
  const missions = { postAndAcceptAuthoredOffer: (offer) => { accepted.push(offer); return { ok: true, missionId: 'race_4242' }; } };
  const registry = { get: (name) => ({ world, missions })[name] || null };
  const pops = [];
  const screenManager = { popScreen: () => { pops.push(1); } };
  const ctx = { state, bus, registry, screenManager };
  return { state, bus, ctx, emitted, accepted, relocations, entered, pops, player };
}
function saveScreen() {
  const snapshot = { fit: raceBoardScreen._fit, sel: raceBoardScreen._selectedContractId };
  return () => { raceBoardScreen._fit = snapshot.fit; raceBoardScreen._selectedContractId = snapshot.sel; };
}
function mountBoard(ctx, { fit = FIT, storage } = {}) {
  takeRacingLaunch(); // never inherit a staged row from an earlier case
  const previousDocument = globalThis.document;
  const previousStorage = globalThis.localStorage;
  const doc = boardDocument();
  globalThis.document = doc;
  if (storage !== undefined) globalThis.localStorage = storage;
  if (fit !== undefined) raceBoardScreen._fit = { ...fit };
  const root = doc.createElement('div');
  raceBoardScreen.mount(root, ctx);
  return {
    doc, root,
    restore() {
      try { raceBoardScreen.unmount(); } catch (_) { /* already unmounted */ }
      if (previousStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = previousStorage;
      globalThis.document = previousDocument;
    },
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
const eventCards = (root) => findAll(root, (n) => n.dataset && n.dataset.contractId);
const pickButtons = (root) => findAll(root, (n) => n.tagName === 'button' && n.dataset && n.dataset.action);
const startButton = (root) => findButtons(root).find((b) => b.textContent === 'START');
const startPanel = (root) => findAll(root, (n) => n.getAttribute?.('aria-label') === 'Selected event')[0];
const expectedEventIds = () => {
  const ids = [];
  for (const level of RACING_CIRCUITS) {
    const practice = practiceContractForLevel(level.id);
    if (practice) ids.push(practice.id);
    for (const row of circuitContracts().filter((r) => r.levelId === level.id)) ids.push(row.id);
  }
  return ids;
};

test('seed 4242: every authored contract is a selectable card with its real course drawing', () => {
  const restoreScreen = saveScreen();
  const h = harness();
  const b = mountBoard(h.ctx, { storage: memoryStorage() });
  try {
    const cards = eventCards(b.root);
    assert.deepEqual(cards.map((card) => card.dataset.contractId), expectedEventIds());
    assert.equal(cards.length > RACE_LEVELS.length, true, 'story contracts render alongside practices');
    for (const card of cards) {
      const row = raceContractById(card.dataset.contractId);
      assert.ok(row, `catalog contract for ${card.dataset.contractId}`);
      const svgs = findAll(card, (n) => n.tagName === 'svg');
      assert.equal(svgs.length, 1, `${row.id} carries exactly one course drawing`);
      assert.equal(svgs[0].getAttribute('role'), 'img');
      assert.ok(svgs[0].getAttribute('aria-label'));
      // ORRERY §3.1: the route is a wide dim bloom under a core stroke — two strokes of ONE path.
      const polylines = findAll(svgs[0], (n) => n.tagName === 'polyline');
      assert.equal(polylines.length, 2, `${row.id} draws one route as bloom + core`);
      assert.equal(polylines[0].getAttribute('points'), polylines[1].getAttribute('points'),
        'bloom and core trace the same course');
      const points = String(polylines[1].getAttribute('points')).trim().split(/\s+/)
        .map((pair) => pair.split(',').map(Number));
      assert.ok(points.length >= 2, 'the drawn course is nonempty');
      assert.ok(points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)), 'finite XZ course');
      const lines = textLines(card);
      assert.ok(lines.includes(row.summary), `${row.id} shows its terms`);
      assert.ok(lines.some((line) => /\d+ laps? · /.test(line)
        && /view optional|chase view required/.test(line)
        && (/best across fits/.test(line) || /no clean fit record yet/.test(line))), `${row.id} shows laps, view and best time`);
      const pick = findAll(card, (n) => n.tagName === 'button' && n.dataset?.action === row.id)[0];
      assert.ok(pick, `${row.id} has a selection control`);
      assert.ok(pick.getAttribute('aria-label').includes('Select'), 'the control names its event');
    }
    assert.equal(findButtons(b.root).filter((btn) => btn.textContent === 'START').length, 1, 'exactly one START');
    const pressed = pickButtons(b.root).filter((btn) => btn.getAttribute('aria-pressed') === 'true');
    assert.equal(pressed.length, 1, 'one selected event');
    assert.equal(pressed[0].dataset.action, practiceContractForLevel(RACE_LEVELS[0].id).id);
    assert.equal(h.emitted.filter((e) => e.event === 'game:new').length, 0);
  } finally { b.restore(); restoreScreen(); }
});

test('seed 4242: selecting events is reversible, inert and survives a refresh', () => {
  const restoreScreen = saveScreen();
  const h = harness();
  const b = mountBoard(h.ctx, { storage: memoryStorage() });
  try {
    const picks = pickButtons(b.root);
    assert.ok(picks.length >= 2);
    picks[1].click();
    assert.equal(raceBoardScreen._selectedContractId, picks[1].dataset.action);
    assert.equal(picks[1].getAttribute('aria-pressed'), 'true');
    assert.equal(picks[0].getAttribute('aria-pressed'), 'false');
    const row = raceContractById(picks[1].dataset.action);
    assert.equal(startPanel(b.root).children[0].textContent, row.title, 'selected-event title follows');
    picks[0].click();
    assert.equal(raceBoardScreen._selectedContractId, picks[0].dataset.action);
    assert.equal(picks[0].getAttribute('aria-pressed'), 'true');
    assert.equal(picks[1].getAttribute('aria-pressed'), 'false');
    assert.equal(h.emitted.filter((e) => ['game:new', 'race:armed', 'mission:abandon'].includes(e.event)).length, 0);
    assert.equal(h.accepted.length, 0, 'selection posts no offer');
    assert.equal(h.relocations.length, 0, 'selection moves no ship');
    assert.equal(currentRacingCup(), null, 'selection spends no cup ticket');
    assert.equal(takeRacingLaunch(), null, 'selection stages nothing');
    const chosen = raceBoardScreen._selectedContractId;
    raceBoardScreen.refresh(h.ctx);
    assert.equal(raceBoardScreen._selectedContractId, chosen, 'refresh retains a still-eligible selection');
    const pressed = pickButtons(b.root).filter((btn) => btn.getAttribute('aria-pressed') === 'true');
    assert.equal(pressed.length, 1);
    assert.equal(pressed[0].dataset.action, chosen);
  } finally { b.restore(); restoreScreen(); }
});

test('seed 4242: menu-mode runContract skips confirmation and stages the contract', async () => {
  const h = harness();
  const level = raceLevelById('level_junction_return');
  const ok = await runContract(h.ctx, 'contract_junction_jam', level, { ...FIT },
    () => { throw new Error('the menu launch must not ask'); });
  assert.equal(ok, true);
  const news = h.emitted.filter((e) => e.event === 'game:new');
  assert.equal(news.length, 1);
  assert.equal(news[0].payload.seed, racingSeedFor('contract_junction_jam'));
  assert.equal(news[0].payload.racingSession, true);
  assert.equal(news[0].payload.starter, 'starter_hitch');
  assert.equal(news[0].payload.racingDrive, 'standard');
  const staged = takeRacingLaunch();
  assert.equal(staged.contractId, 'contract_junction_jam');
  assert.equal(staged.seed, racingSeedFor('contract_junction_jam'));
  assert.deepEqual(staged.options, { raceMode: 'time-trial', raceDifficulty: 'club', raceGhostEnabled: true, raceOpponents: 0 });
  assert.equal(takeRacingLaunch(), null);
});

test('seed 4242: the mounted START launches only the selected event, guarded once', async () => {
  const restoreScreen = saveScreen();
  const h = harness();
  const b = mountBoard(h.ctx, { storage: memoryStorage() });
  try {
    const target = pickButtons(b.root).find((btn) => btn.dataset.action === 'contract_textile_qual');
    assert.ok(target);
    target.click();
    const start = startButton(b.root);
    assert.equal(start.disabled, false);
    start.click();
    start.click(); // synchronous second activation cannot stage a second launch
    await flush();
    const news = h.emitted.filter((e) => e.event === 'game:new');
    assert.equal(news.length, 1);
    assert.equal(news[0].payload.seed, racingSeedFor('contract_textile_qual'));
    assert.equal(news[0].payload.racingSession, true);
    const staged = takeRacingLaunch();
    assert.equal(staged.contractId, 'contract_textile_qual');
    assert.equal(takeRacingLaunch(), null);
  } finally { b.restore(); restoreScreen(); }
});

test('seed 4242: replacing an adventure flight still requires consent', async () => {
  const h = harness({ mode: 'flight', sectorId: 'sector_helios_prime' });
  const level = raceLevelById('level_junction_return'); // different sector than the flight
  let asked = 0;
  const declined = await runContract(h.ctx, 'contract_junction_jam', level, { ...FIT, raceMode: 'race' },
    async (opts) => { asked += 1; assert.match(opts.title, /Leave this flight/); assert.equal(opts.confirmLabel, 'Launch circuit'); return false; });
  assert.equal(declined, false);
  assert.equal(asked, 1);
  assert.equal(h.emitted.filter((e) => e.event === 'game:new').length, 0);
  assert.equal(takeRacingLaunch(), null);
  assert.equal(currentRacingCup(), null, 'a refused launch spends no cup ticket');
  const accepted = await runContract(h.ctx, 'contract_junction_jam', level, { ...FIT, raceMode: 'race' },
    async () => { asked += 1; return true; });
  assert.equal(accepted, true);
  assert.equal(asked, 2);
  const news = h.emitted.filter((e) => e.event === 'game:new');
  assert.equal(news.length, 1);
  assert.equal(news[0].payload.racingSession, true, 'the campaign-save protection flag still rides the launch');
  const staged = takeRacingLaunch();
  assert.equal(staged.contractId, 'contract_junction_jam');
  assert.equal(staged.options.raceOpponents, 2);
});

test('seed 4242: a same-sector time trial waits for the asynchronous arm before popping', async () => {
  const restoreScreen = saveScreen();
  const h = harness({ mode: 'flight', sectorId: 'sector_helios_prime' });
  const descriptors = [];
  let deferred = null;
  installSimCommandSink((descriptor) => { descriptors.push(descriptor); return deferred ? deferred.promise : null; });
  const box = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
  const b = mountBoard(h.ctx, { storage: memoryStorage() });
  try {
    assert.equal(raceBoardScreen._selectedContractId, 'practice_level_textile_outbound');
    deferred = box();
    startButton(b.root).click();
    await flush();
    assert.equal(descriptors.length, 1);
    assert.equal(descriptors[0].op, 'racingArm');
    assert.equal(h.pops.length, 0, 'a pending worker reply is not an acceptance');
    assert.equal(h.emitted.filter((e) => e.event === 'game:new').length, 0);
    deferred.resolve({ ok: true, result: { ok: true, missionId: 'race_4242', result: { ok: true, missionId: 'race_4242' } } });
    await flush();
    assert.equal(h.pops.length, 1, 'acceptance pops the board');
    assert.equal(h.emitted.filter((e) => e.event === 'race:armed').length, 1);
    assert.equal(h.emitted.filter((e) => e.event === 'game:new').length, 0);
    // Rejection shape: the arm resolves with an explicit refusal — no pop, no new game.
    deferred = box();
    startButton(b.root).click();
    await flush();
    deferred.resolve({ ok: false });
    await flush();
    assert.equal(h.pops.length, 1, 'still exactly one pop');
    assert.equal(h.emitted.filter((e) => e.event === 'game:new').length, 0);
  } finally { b.restore(); restoreScreen(); uninstallSimCommandSink(); }
});

test('seed 4242: a launch that does not go (refused arm / Back) puts focus back on the fresh START', async () => {
  const restoreScreen = saveScreen();
  const h = harness({ mode: 'flight', sectorId: 'sector_helios_prime' });
  let deferred = null;
  installSimCommandSink(() => (deferred ? deferred.promise : null));
  const b = mountBoard(h.ctx, { storage: memoryStorage() });
  // Track focus on every node the refresh builds; the old START is replaced by the refresh.
  const make = b.doc.createElement;
  b.doc.createElement = (tag) => { const node = make(tag); node.focus = () => { b.doc.activeElement = node; }; return node; };
  try {
    const oldStart = startButton(b.root);
    b.doc.activeElement = oldStart;
    let resolve; deferred = { promise: new Promise((r) => { resolve = r; }) };
    oldStart.click();
    await flush();
    resolve({ ok: false });
    await flush();
    const fresh = startButton(b.root);
    assert.notEqual(fresh, oldStart, 'the refresh rebuilt START');
    assert.equal(b.doc.activeElement, fresh, 'focus returns to the live START, not the detached one');
    assert.equal(h.pops.length, 0);
  } finally { b.restore(); restoreScreen(); uninstallSimCommandSink(); }
});

test('seed 4242: cup mode offers only the current heat, spends its ticket on launch and advances', async () => {
  const restoreScreen = saveScreen();
  const storage = memoryStorage();
  abandonRacingCup(storage); // reset the module-level cup before measuring tickets
  const h = harness();
  const b = mountBoard(h.ctx, { fit: { ...FIT, raceMode: 'cup' }, storage });
  try {
    const cards = eventCards(b.root);
    assert.deepEqual(cards.map((card) => card.dataset.contractId), RACING_CIRCUITS.map((level) => practiceContractForLevel(level.id).id));
    assert.equal(raceBoardScreen._selectedContractId, CUP_HEATS[0].contractId);
    assert.equal(startButton(b.root).disabled, false);
    const locked = pickButtons(b.root).find((btn) => btn.dataset.action === CUP_HEATS[2].contractId);
    locked.click();
    assert.equal(raceBoardScreen._selectedContractId, CUP_HEATS[2].contractId);
    assert.equal(startButton(b.root).disabled, true, 'a locked cup heat cannot start');
    assert.equal(currentRacingCup(), null, 'selecting a card spent no ticket');
    pickButtons(b.root).find((btn) => btn.dataset.action === CUP_HEATS[0].contractId).click();
    assert.equal(startButton(b.root).disabled, false);
    startButton(b.root).click();
    await flush();
    const cup = currentRacingCup();
    assert.ok(cup && cup.status === 'racing' && cup.nextHeat === 0 && cup.ticket === 1, 'the launch spent exactly one ticket on heat one');
    const staged = takeRacingLaunch();
    assert.equal(staged.contractId, CUP_HEATS[0].contractId);
    assert.equal(staged.options.raceCupId, cup.id);
    assert.equal(staged.options.raceCupHeat, 0);
    assert.equal(staged.options.raceCupTicket, 1);
    const advanced = finishRacingCupHeat({ raceCupId: cup.id, raceCupHeat: 0, raceCupTicket: 1,
      racingContractId: CUP_HEATS[0].contractId, raceElapsedS: 222.5, racePosition: 1 }, storage);
    assert.ok(advanced && advanced.nextHeat === 1 && advanced.status === 'ready');
    raceBoardScreen.refresh(h.ctx);
    assert.equal(raceBoardScreen._selectedContractId, CUP_HEATS[1].contractId, 'selection moves to the next heat');
    assert.equal(startButton(b.root).disabled, false);
    const pressed = pickButtons(b.root).filter((btn) => btn.getAttribute('aria-pressed') === 'true');
    assert.equal(pressed.length, 1);
    assert.equal(pressed[0].dataset.action, CUP_HEATS[1].contractId);
  } finally { b.restore(); restoreScreen(); abandonRacingCup(storage); }
});

function ghostTape(levelId, contractId, duration = 40) {
  const course = courseForLevel(levelId);
  const offer = racingOfferFor(contractId);
  const gateCount = offer.params.gates.length;
  const key = raceRecordKey({ courseId: course.courseId, courseRevision: 3, racingContractId: contractId, laps: 1 }, 'fit5-test');
  const samples = [];
  for (let t = 0; t < duration; t += 0.2) samples.push([Math.round(t * 10) / 10, t, t, 0, 120]);
  samples.push([duration, duration, duration, 0, 0]);
  const gates = [];
  for (let i = 0; i < gateCount; i += 1) gates.push([0, i, Math.round((duration * i) / (gateCount - 1) * 1e6) / 1e6]);
  return {
    version: 1,
    meta: { key, category: 'fit5-test', course: course.courseId, revision: 3, contract: contractId,
      laps: 1, closed: true, gateCount, route: 'main', geometry: 'abcdef12', hull: 'ship_kestrel',
      physics: 'rapier-dynamic', flight: 'v3', tuning: 'circuit-flight-v3-3' },
    duration, origin: [0, 0], samples, gates,
  };
}

test('seed 4242: active races disable START, records and ghosts keep rendering once each', async () => {
  const restoreScreen = saveScreen();
  const storage = memoryStorage();
  const h = harness();
  // an active race on the book disables START
  h.state.missions.active.push({ status: 'active', type: 'race' });
  const prefix = raceRecordKey(racingOfferFor('practice_level_textile_outbound').params);
  storage.setItem(RECORD_KEY, JSON.stringify({ [`${prefix}:fit5-abc`]: 55.5 }));
  storage.setItem(RACING_GHOST_STORAGE_KEY, JSON.stringify({ version: 1, tapes: [ghostTape('level_textile_outbound', 'practice_level_textile_outbound')] }));
  const b = mountBoard(h.ctx, { storage });
  try {
    const start = startButton(b.root);
    assert.equal(start.disabled, true, 'START is disabled while a race is active');
    start.click();
    await flush();
    assert.equal(h.emitted.filter((e) => e.event === 'game:new').length, 0);
    assert.equal(h.accepted.length, 0);
    assert.equal(takeRacingLaunch(), null);
    assert.ok(textLines(b.root).some((line) => line.includes(`best across fits ${formatRaceTime(55.5)}`)));
    // exactly one ghost row for the course, independent of its contract count
    assert.equal(findButtons(b.root).filter((btn) => btn.textContent === 'Export ghost').length, 1);
    assert.equal(findButtons(b.root).filter((btn) => btn.textContent === 'Delete ghost').length, 1);
    assert.ok(textLines(b.root).some((line) => line.startsWith('PERSONAL GHOST · kestrel')));
    // a record update is picked up on refresh
    storage.setItem(RECORD_KEY, JSON.stringify({ [`${prefix}:fit5-abc`]: 42.25 }));
    raceBoardScreen.refresh(h.ctx);
    assert.ok(textLines(b.root).some((line) => line.includes(`best across fits ${formatRaceTime(42.25)}`)));
    // mounting and selecting never touched campaign state
    const h2 = harness();
    h2.state.player.credits = 4242;
    h2.state.player.cargo.items = { cmdty_ore: 3 };
    h2.state.player.stats.kills = 7;
    h2.state.world.discovery = { sector_helios_prime: { charted: true } };
    const snapshot = JSON.parse(JSON.stringify({
      player: h2.state.player, world: h2.state.world, entities: [...h2.state.entities.values()],
    }));
    const b2 = mountBoard(h2.ctx, { storage });
    try {
      const picks = pickButtons(b2.root);
      picks[0].click();
      picks[1].click();
      assert.deepEqual(JSON.parse(JSON.stringify({
        player: h2.state.player, world: h2.state.world, entities: [...h2.state.entities.values()],
      })), snapshot, 'mounting and selecting changed no campaign credits, cargo, chart or ship stats');
    } finally { b2.restore(); }
  } finally { b.restore(); restoreScreen(); }
});

test('seed 4242: unmount drops the board, its selection and every detached reference', () => {
  const restoreScreen = saveScreen();
  const h = harness();
  const b = mountBoard(h.ctx, { storage: memoryStorage() });
  try {
    assert.ok(b.root.children.length > 0);
    raceBoardScreen.unmount();
    assert.equal(b.root.children.length, 0);
    assert.equal(raceBoardScreen._root, null);
    assert.equal(raceBoardScreen._selectedContractId, null);
    assert.equal(raceBoardScreen._entries, null);
    assert.equal(raceBoardScreen._selectControls, null);
    assert.equal(raceBoardScreen._launching, false);
  } finally { b.restore(); restoreScreen(); }
});

// Focus-return companions: a launch that goes must not steal focus, and Retry returns to Retry.
function trackFocus(b) {
  const make = b.doc.createElement;
  b.doc.createElement = (tag) => { const node = make(tag); node.focus = () => { b.doc.activeElement = node; }; return node; };
}

test('seed 4242: a launch that goes leaves focus alone (no grab onto the rebuilt START)', async () => {
  const restoreScreen = saveScreen();
  const h = harness({ mode: 'flight', sectorId: 'sector_helios_prime' });
  let deferred = null;
  installSimCommandSink(() => (deferred ? deferred.promise : null));
  const b = mountBoard(h.ctx, { storage: memoryStorage() });
  trackFocus(b);
  try {
    const oldStart = startButton(b.root);
    b.doc.activeElement = oldStart;
    let resolve; deferred = { promise: new Promise((r) => { resolve = r; }) };
    oldStart.click();
    await flush();
    resolve({ ok: true, result: { ok: true, missionId: 'race_4242', result: { ok: true, missionId: 'race_4242' } } });
    await flush();
    assert.equal(h.pops.length, 1, 'the accepted arm popped the board');
    assert.notEqual(startButton(b.root), oldStart, 'the refresh rebuilt START');
    assert.equal(b.doc.activeElement, oldStart, 'a launch that went does not move focus');
  } finally { b.restore(); restoreScreen(); uninstallSimCommandSink(); }
});

// Last in the file: rememberRacingResult is module state with no clear.
test('seed 4242: a Retry that does not go puts focus back on the fresh Retry, not START', async () => {
  const restoreScreen = saveScreen();
  rememberRacingResult({ racingContractId: 'practice_level_textile_outbound', raceElapsedS: 61.5,
    raceMode: 'time-trial', status: 'dnf', raceLapTimesS: [30, 31.5] });
  const h = harness({ mode: 'flight', sectorId: 'sector_helios_prime' });
  const descriptors = [];
  let deferred = null;
  installSimCommandSink((descriptor) => { descriptors.push(descriptor); return deferred ? deferred.promise : null; });
  const b = mountBoard(h.ctx, { storage: memoryStorage() });
  trackFocus(b);
  const retryButton = (root) => findButtons(root).find((btn) => btn.textContent === 'Retry in this flight');
  try {
    const oldRetry = retryButton(b.root);
    assert.ok(oldRetry, 'the last-result receipt offers Retry');
    assert.equal(oldRetry.disabled, false, 'Retry is live in the course sector');
    b.doc.activeElement = oldRetry;
    let resolve; deferred = { promise: new Promise((r) => { resolve = r; }) };
    oldRetry.click();
    await flush();
    assert.equal(descriptors.length, 1);
    assert.equal(descriptors[0].op, 'racingArm');
    resolve({ ok: false });
    await flush();
    const fresh = retryButton(b.root);
    assert.ok(fresh);
    assert.notEqual(fresh, oldRetry, 'the refresh rebuilt Retry');
    assert.equal(b.doc.activeElement, fresh, 'focus returns to the live Retry');
    assert.notEqual(b.doc.activeElement, startButton(b.root));
    assert.equal(h.pops.length, 0);
  } finally { b.restore(); restoreScreen(); uninstallSimCommandSink(); }
});
