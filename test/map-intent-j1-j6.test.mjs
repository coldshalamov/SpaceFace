// Research C (build_map §1C row 276 / MAP-INTENT) — the galaxy map's query selection and its
// first-Escape cancellation, through the real document route.
//
//   J1: a committed search result must be a CURRENT, VISIBLE, eligible answer to the query in the
//       field. A hit followed by a blank or no-match query clears the list — Enter can never
//       select the old place. A new valid query works, and a consumed selection commits once.
//   J6: the map's line/hold cancellation gets first refusal on Escape before the generic
//       back/pop. The first Escape lets the gesture go without committing or closing; the second
//       closes the chart. Locked screens keep precedence — a trapped Escape reaches neither the
//       cancellation nor the pop, and unrelated screens keep ordinary close semantics.
import assert from 'node:assert/strict';

async function main() {
  const documentRef = createDocumentFixture();
  globalThis.document = documentRef;
  globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };

  const { galaxyMapScreen } = await import('../src/ui/galaxyMap.js');
  const { createUiInput } = await import('../src/ui/input.js');

  const ctx = {
    state: createStateFixture(),
    bus: {
      emit() {},
      on() { return () => {}; },
    },
    screenManager: null,
    registry: { get() { return null; } },
    gamepad: null,
  };

  const root = new FakeRoot(documentRef);
  galaxyMapScreen.mount(root, ctx);
  const searchInput = root.querySelector('.gm-search-input');
  const resultsContainer = root.querySelector('.gm-search-results');
  assert(searchInput && resultsContainer, 'the chart mounts a search field and a results layer');

  // Spy the commit point: the defect contract is whether a stale result reaches selection,
  // not what selection then does with it.
  const selected = [];
  const realSelect = galaxyMapScreen._selectSearchTarget;
  galaxyMapScreen._selectSearchTarget = (target) => { selected.push(target); };

  const type = (value) => {
    searchInput.value = value;
    searchInput.fire('input', { target: searchInput });
  };
  const key = (keyName) => searchInput.fire('keydown', {
    key: keyName,
    target: searchInput,
    preventDefault() { this.defaultPrevented = true; },
  });

  try {
    // ── J1: a hit exists, then the query dies ───────────────────────────────────────────────
    type('helios');
    assert(galaxyMapScreen._searchResultsList.length > 0,
      'a real query paints a committable result list');

    // Blank query: Enter must never select the old place.
    type('');
    assert.equal(resultsContainer.hidden, true, 'a blank query hides the results layer');
    assert.equal(galaxyMapScreen._searchResultsList.length, 0, 'a blank query drops the hit list');
    key('Enter');
    assert.equal(selected.length, 0, 'Enter after a blank query commits nothing');

    // No-match query: same contract — the "No results found" row owns no selection either.
    type('helios');
    assert(galaxyMapScreen._searchResultsList.length > 0);
    type('zzzzz-nomatch');
    assert.equal(resultsContainer.hidden, false, 'a no-match query still paints its empty row');
    assert.match(resultsContainer.innerHTML, /No results found/);
    assert.equal(galaxyMapScreen._searchResultsList.length, 0, 'a no-match query drops the hit list');
    key('Enter');
    assert.equal(selected.length, 0, 'Enter after a no-match query commits nothing');

    // A value write that never fired `input` also invalidates the old list.
    type('helios');
    assert(galaxyMapScreen._searchResultsList.length > 0);
    searchInput.value = 'vesta'; // programmatic write, no input event — the stamp must fail closed
    key('Enter');
    assert.equal(selected.length, 0, 'a query the list never answered commits nothing');

    // A new valid query works, and the consumed selection cannot commit twice.
    type('helios');
    assert(galaxyMapScreen._searchResultsList.length > 0);
    key('ArrowDown');
    key('ArrowUp');
    key('Enter');
    assert.equal(selected.length, 1, 'a current visible result commits on Enter');
    assert(selected[0] && /helios/i.test(String(selected[0].name || '')),
      'the committed result is the queried place');
    assert.equal(galaxyMapScreen._searchResultsList.length, 0, 'a consumed selection empties the list');
    key('Enter');
    assert.equal(selected.length, 1, 'a second Enter cannot recommit the consumed result');

    // Arrows on a hidden/empty list fall through to normal text entry — nothing consumed.
    searchInput.value = 'helios';
    key('ArrowDown');
    assert.equal(galaxyMapScreen._searchSelectedIdx, 0);
  } finally {
    galaxyMapScreen._selectSearchTarget = realSelect;
  }

  // ── J6: first refusal on Escape, through the real document keydown route ──────────────────
  let pops = 0;
  let lockedFlag = false;
  let activeDef = galaxyMapScreen;
  const screenManager = {
    isOpen: () => true,
    getActiveScreenDef: () => activeDef,
    locked: () => lockedFlag,
    popScreen() { pops += 1; },
    pushScreen() {},
    top: () => 'galaxyMap',
  };
  ctx.screenManager = screenManager;
  const uiInput = createUiInput(ctx, screenManager);
  const pressEscape = (target = null) => {
    const ev = {
      key: 'Escape',
      code: 'Escape',
      target,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() {},
    };
    for (const handler of documentRef.listeners('keydown')) handler(ev);
    return ev;
  };

  try {
    // A line being laid: first Escape lets it go — nothing commits, nothing pops.
    galaxyMapScreen._line = { x: 12, y: 8, snap: { id: 'sector_helios_prime' }, t0: 0 };
    const before = selected.length;
    pressEscape();
    assert.equal(galaxyMapScreen._line, null, 'the first Escape releases the laid line');
    assert.equal(pops, 0, 'the first Escape does not close the chart');
    assert.equal(selected.length, before, 'a cancelled line never commits a course');

    // Second Escape is the ordinary close.
    pressEscape();
    assert.equal(pops, 1, 'the second Escape closes the chart');

    // A filling hold ring gets the same first refusal — even while search owns the keystroke.
    galaxyMapScreen._hold = { x: 30, y: 30, t0: 0, pointerId: 1 };
    pressEscape(searchInput);
    assert.equal(galaxyMapScreen._hold, null, 'Escape lets a pending hold go');
    assert.equal(pops, 1, 'still no close');
    pressEscape(searchInput);
    assert.equal(pops, 2, 'the follow-up Escape closes from search focus too');

    // Locked screens keep precedence: a trapped Escape reaches neither cancel nor close.
    lockedFlag = true;
    galaxyMapScreen._line = { x: 5, y: 5, snap: null, t0: 0 };
    pressEscape();
    assert(galaxyMapScreen._line, 'a locked screen keeps its line — no refusal is offered');
    assert.equal(pops, 2, 'a locked screen swallows Escape entirely');
    lockedFlag = false;
    galaxyMapScreen._line = null;

    // Unrelated screens keep ordinary semantics: no hook, straight to close.
    activeDef = { id: 'pause' };
    pressEscape();
    assert.equal(pops, 3, 'a screen without first refusal closes on the first Escape');
  } finally {
    uiInput.dispose();
  }

  console.log('map-intent-j1-j6: OK');
}

function createStateFixture() {
  return {
    simTime: 120,
    playerId: 'player',
    player: { id: 'player', marketMemory: {} },
    mode: 'flight',
    settings: {},
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: { sector_helios_prime: { owner: 'faction_scn' } },
      discovery: { sector_helios_prime: { discovered: true, lastSeenEpochDays: 3 } },
    },
    entities: new Map([
      ['player', { id: 'player', type: 'ship', alive: true, pos: { x: 0, z: 0 } }],
      ['entity_helios', {
        id: 'entity_helios',
        type: 'station',
        alive: true,
        pos: { x: 1280, z: -420 },
        data: {
          stationId: 'station_helios',
          name: 'Helios Station',
          services: ['trade', 'shipyard', 'missions'],
        },
      }],
    ]),
    entityList: [{
      id: 'entity_helios',
      type: 'station',
      alive: true,
      pos: { x: 1280, z: -420 },
      data: {
        stationId: 'station_helios',
        name: 'Helios Station',
        services: ['trade', 'shipyard', 'missions'],
      },
    }],
    ui: {},
  };
}

function createDocumentFixture() {
  const listeners = new Map();
  const documentFixture = {
    activeElement: null,
    head: { appendChild() {} },
    body: {},
    documentElement: { dataset: {}, classList: { add() {}, remove() {}, toggle() {} } },
    getElementById() { return null; },
    createElement(tagName) { return new FakeElement(tagName, documentFixture); },
    addEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      if (!handlers.includes(handler)) handlers.push(handler);
      listeners.set(type, handlers);
    },
    removeEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      listeners.set(type, handlers.filter((candidate) => candidate !== handler));
    },
    listeners(type) { return listeners.get(type) || []; },
  };
  return documentFixture;
}

class FakeRoot {
  constructor(documentFixture) {
    this.ownerDocument = documentFixture;
    this.id = '';
    this.dataset = {};
    this._innerHTML = '';
    this._elements = new Map();
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    const viewport = new FakeElement('div', this.ownerDocument);
    viewport.clientWidth = 1000;
    viewport.clientHeight = 700;
    const canvas = new FakeElement('canvas', this.ownerDocument);
    canvas.width = 1000;
    canvas.height = 700;
    canvas.getContext = () => createCanvasContext();
    this._elements.set('.gm-viewport', viewport);
    this._elements.set('canvas', canvas);
    this._elements.set('#gm-commodity-select', new FakeElement('select', this.ownerDocument));
    this._elements.set('.gm-search-input', new FakeElement('input', this.ownerDocument));
    this._elements.set('.gm-search-results', new FakeElement('div', this.ownerDocument));
    this._elements.set('.gm-close', new FakeElement('button', this.ownerDocument));
    this._elements.set('[data-level]', new FakeElement('b', this.ownerDocument));
  }

  get innerHTML() { return this._innerHTML; }
  querySelector(selector) { return this._elements.get(selector) || null; }
  querySelectorAll(selector) { return this._elements.get(selector) || []; }
}

class FakeElement {
  constructor(tagName, documentFixture) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = documentFixture;
    this.isConnected = true;
    this._hidden = false;
    this.disabled = false;
    this.value = '';
    this.style = {};
    this.dataset = {};
    this.classList = { add() {}, remove() {} };
    this._innerHTML = '';
    this._listeners = new Map();
  }

  set innerHTML(value) { this._innerHTML = String(value); }
  get innerHTML() { return this._innerHTML; }
  set hidden(value) { this._hidden = !!value; }
  get hidden() { return this._hidden; }

  addEventListener(type, handler) {
    const handlers = this._listeners.get(type) || [];
    if (!handlers.includes(handler)) handlers.push(handler);
    this._listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    const handlers = this._listeners.get(type) || [];
    this._listeners.set(type, handlers.filter((candidate) => candidate !== handler));
  }

  fire(type, event = {}) {
    const ev = { target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...event };
    for (const handler of [...(this._listeners.get(type) || [])]) handler(ev);
    return ev;
  }

  focus() { this.ownerDocument.activeElement = this; }
  select() {}
  getAttribute() { return null; }
  closest() { return null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getContext() { return null; }
}

function createCanvasContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, property) {
      if (property in target) return target[property];
      if (property === 'measureText') return () => ({ width: 0 });
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
      return () => {};
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });
}

await main();
