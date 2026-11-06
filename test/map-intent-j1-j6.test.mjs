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

  const { galaxyMapScreen, activeMapGoal, localMapWaypointPosition, buildSystemModel,
    systemZoneTarget, resolveCourseTarget, resolveGalaxyMapPrimaryAction,
    mapSearchTargetPriority } = await import('../src/ui/galaxyMap.js');
  const { createUiInput } = await import('../src/ui/input.js');
  const { SECTORS } = await import('../src/data/sectors.js');
  const { sectorLocalToGlobalForSector } = await import('../src/data/sectorCoordinates.js');
  const { PLANET_SITE } = await import('../src/data/planets.js');
  const { world } = await import('../src/systems/world.js');
  const { resolveAutopilotArrivalRadius } = await import('../src/systems/flightV3.js');

  const emitted = [];
  const ctx = {
    state: createStateFixture(),
    bus: {
      emit(type, payload) { emitted.push({ type, payload }); },
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

  // The active local objective remains searchable from every chart scale, and choosing it
  // frames the real global position and commits the ordinary local autopilot course.
  {
    const state = ctx.state;
    state.entities.set('buoy47', { id: 'buoy47', type: 'payload', alive: true, pos: { x: 712, z: -144 }, data: { worldSiteTargetable: true } });
    state.nav = { waypoint: { label: '47-A recovery site', pos: { x: 712, z: -144 },
      sectorId: 'sector_helios_prime', arrivalRadius: 75, missionId: 'm47', targetEntityId: 'buoy47' } };
    for (const zoom of [1, 2, 3]) {
      galaxyMapScreen._zoom = zoom;
      type('47-A recovery site');
      const matches = galaxyMapScreen._searchResultsList.filter((hit) => hit.id === 'active-map-goal');
      assert.equal(matches.length, 1, `one active objective at zoom ${zoom}`);
      assert.equal(matches[0].sectorId, 'sector_helios_prime');
      key('Enter');
      const target = galaxyMapScreen._selectedTarget;
      assert.equal(target.name, '47-A recovery site');
      assert.deepEqual({ x: target.x, z: target.z }, { x: 712, z: -144 });
      assert.equal(galaxyMapScreen._zoom >= 2.8, true, 'selection focuses the local frame');
      assert.deepEqual(galaxyMapScreen._camera.focusGlobal, { x: 712, z: -144 });
      assert.equal(galaxyMapScreen._commitCourse(target), true);
      const course = emitted.filter((event) => event.type === 'ui:setCourse').at(-1)?.payload;
      assert.deepEqual(course.pos, { x: 712, z: -144 });
      assert.equal(course.label, '47-A recovery site');
      assert.equal(course.targetEntityId, 'buoy47');
      assert.equal(course.arrivalRadius, 75);
      assert.equal(course.autopilot, true);
    }
    delete state.nav;
    state.entities.delete('buoy47');
  }

  // A charted station remains searchable after leaving its live sector. Use the real search
  // input/Enter route, then the real selection and course-commit owners; the catalog result must
  // retain its destination sector and resolve its sector-local anchor into global course space.
  {
    const state = ctx.state;
    state.world.currentSectorId = 'sector_dione_lane';
    state.world.discovery = {};
    state.entities = new Map([
      ['player', { id: 'player', type: 'ship', alive: true, pos: { x: 0, z: 0 } }],
    ]);
    state.entityList = [...state.entities.values()];
    type('Helios Station');
    const hits = galaxyMapScreen._searchResultsList;
    const stationHit = hits.find((hit) => hit.stationId === 'station_helios');
    assert(stationHit, 'a charted station outside the current sector answers its canonical name');
    assert.equal(stationHit.sectorId, 'sector_helios_prime');
    assert.deepEqual(stationHit.drawPos, { x: 1280, z: -420 },
      'the searchable point keeps the authored sector-local anchor for map framing');
    const expectedGlobal = sectorLocalToGlobalForSector(stationHit.drawPos, stationHit.sectorId);
    assert.deepEqual({ x: stationHit.x, z: stationHit.z }, expectedGlobal,
      'the course frame is translated through the canonical sector origin');

    key('Enter');
    assert.equal(galaxyMapScreen._selectedTarget.stationId, 'station_helios',
      'Enter selects the actual remote station result');
    assert.equal(galaxyMapScreen._selectedTarget.sectorId, 'sector_helios_prime');
    assert.equal(galaxyMapScreen._commitCourse(galaxyMapScreen._selectedTarget), true,
      'the selected station uses the ordinary course commit path');
    const course = emitted.filter((event) => event.type === 'ui:setCourse').at(-1)?.payload;
    assert.equal(course.stationId, 'station_helios');
    assert.deepEqual(course.pos, expectedGlobal,
      'the emitted course carries the station’s anchored global world position');

    // A name in an uncharted sector is not disclosed by the cross-sector catalog fallback.
    state.content = {
      sectors: SECTORS.map((sector) => ({ ...sector, charted: false })),
    };
    type('Helios Station');
    assert.equal(galaxyMapScreen._searchResultsList.some((hit) => hit.stationId === 'station_helios'), false,
      'the catalog fallback does not reveal stations in uncharted sectors');
  }

  // The old Helios objective survives the jump, but its presentation id now names an unrelated
  // live Tethys body. The stored global fix is authoritative for the old marker's sector.
  {
    const state = ctx.state;
    delete state.content;
    state.world.currentSectorId = 'sector_tethys_junction';
    state.world.discovery = { sector_helios_prime: { discovered: true }, sector_tethys_junction: { discovered: true } };
    const tethys = sectorLocalToGlobalForSector({ x: 300, z: 100 }, 'sector_tethys_junction');
    state.entities = new Map([
      ['player', { id: 'player', type: 'ship', alive: true, pos: tethys }],
      [47, { id: 47, type: 'ship', alive: true, pos: { x: tethys.x + 50, z: tethys.z }, data: {} }],
    ]);
    state.entityList = [...state.entities.values()];
    const heliosFix = { x: 710, z: -140 };
    state.nav = { waypoint: { label: 'Derelict', pos: heliosFix, presentationEntityId: 47 } };
    const goal = activeMapGoal(state);
    assert.equal(goal.sectorId, 'sector_helios_prime');
    assert.deepEqual(goal.pos, heliosFix, 'a foreign marker cannot follow a recycled current-sector id');
    assert.equal(localMapWaypointPosition(state, state.nav.waypoint), null, 'foreign fix is not a local/system marker');
    for (const zoom of [1, 2]) {
      galaxyMapScreen._zoom = zoom;
      type('Derelict');
      const hit = galaxyMapScreen._searchResultsList.find((row) => row.id === 'active-map-goal');
      assert.ok(hit); assert.equal(hit.kind, 'sector'); assert.equal(hit.sectorId, 'sector_helios_prime');
      assert.equal(resolveGalaxyMapPrimaryAction(state, hit).targetSectorId, 'sector_helios_prime');
      assert.equal(resolveCourseTarget(hit).type, 'sector', 'a remote search result does not arm a local fix');
    }
    state.ui.trackedMissionId = 'foreign-mission';
    state.missions = { active: [{ id: 'foreign-mission', status: 'active', destSectorId: 'sector_helios_prime', targetEntityIds: [47] }] };
    assert.equal(mapSearchTargetPriority(state, { id: 47, kind: 'ship', x: tethys.x + 50, z: tethys.z }), 10,
      'a foreign mission cannot promote a reused local entity id');
    state.nav.waypoint = { kind: 'local', label: 'Player course', pos: tethys };
    assert.equal(activeMapGoal(state).sectorId, 'sector_tethys_junction', 'an explicit local player course keeps its sector');
    assert.deepEqual(localMapWaypointPosition(state, state.nav.waypoint), tethys);
    delete state.nav; delete state.missions; delete state.ui.trackedMissionId;
  }

  // The named hazard search selects the very same zone target as the painted ring.
  {
    const state = ctx.state;
    const model = buildSystemModel(state, 'sector_tethys_junction');
    const zone = model.zones.find((row) => row.id === 'zone_tethys_anvil');
    assert.ok(zone?.hazard && zone.authoredName);
    const player = state.entities.get(state.playerId);
    const paintedTarget = systemZoneTarget(zone, model.sectorId, player.pos);
    for (const zoom of [1, 2]) {
      galaxyMapScreen._zoom = zoom;
      type('Anvil');
      const hit = galaxyMapScreen._searchResultsList.find((row) => row.id === zone.id);
      assert.deepEqual(hit, paintedTarget, 'search reuses the ring target and radius');
      assert.match(hit.detail, /^Hazard/);
      assert.deepEqual(resolveCourseTarget(hit), resolveCourseTarget(paintedTarget));
      const course = resolveGalaxyMapPrimaryAction(state, hit).coursePayload;
      const distance = Math.hypot(course.pos.x - hit.x, course.pos.z - hit.z);
      assert.ok(distance - course.arrivalRadius > PLANET_SITE.bands.sling + PLANET_SITE.hysteresis,
        'the entire nominal arrival circle remains outside the sling band');
      key('Enter');
      assert.equal(galaxyMapScreen._selectedTarget.id, zone.id);
    }
    const staleSelection = galaxyMapScreen._selectedTarget;
    const center = { x: staleSelection.x, z: staleSelection.z };
    player.pos = { x: center.x + 3000, z: center.z };
    const action = resolveGalaxyMapPrimaryAction(state, staleSelection);
    assert.ok(action.coursePayload.pos.x > center.x, 'commit recomputes the approach from the current side');
    state.nav = { route: null };
    const nav = world._onSetCourse.call({ state, bus: ctx.bus }, action.coursePayload);
    assert.equal(nav.arrivalRadius, 80, 'the real world course owner preserves the bounded radius');
    const stop = resolveAutopilotArrivalRadius(player, nav, nav.target);
    assert.ok(Math.hypot(nav.target.x - center.x, nav.target.z - center.z) - stop
      > PLANET_SITE.bands.sling + PLANET_SITE.hysteresis, 'the flight arrival rule stops outside the sling edge');
    delete state.nav;
    state.world.currentSectorId = 'sector_dione_lane';
    galaxyMapScreen._selectedTarget = null;
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

  // ── F-MENUS-01: Tab belongs to focus traversal, never to a chart lens ────────────────────
  // The screen used to preventDefault every Tab to cycle a lens, so a keyboard-only pilot could
  // never reach the lens rail, the search field, or the plot/engage controls. The screen must
  // decline the key — native traversal plus the ScreenManager trap own it.
  {
    const layersBefore = { ...galaxyMapScreen._layers };
    const tab = {
      key: 'Tab',
      target: null,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
    };
    assert.equal(galaxyMapScreen.onKey(tab, ctx), false,
      'the chart declines Tab so focus traversal owns it');
    assert.equal(tab.defaultPrevented, false, 'the chart never prevents Tab traversal');
    assert.deepEqual(galaxyMapScreen._layers, layersBefore, 'Tab toggles no lens');
    const shiftTab = {
      key: 'Tab',
      shiftKey: true,
      target: null,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
    };
    assert.equal(galaxyMapScreen.onKey(shiftTab, ctx), false, 'Shift+Tab traverses backwards too');
    assert.equal(shiftTab.defaultPrevented, false);
    assert.deepEqual(galaxyMapScreen._layers, layersBefore, 'Shift+Tab toggles no lens either');
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
