import assert from 'node:assert/strict';

async function main() {
const documentRef = createDocumentFixture();
globalThis.document = documentRef;
globalThis.window = { devicePixelRatio: 1 };

const { galaxyMapScreen } = await import('../src/ui/galaxyMap.js');

const emitted = [];
const routeRequests = [];
let popCount = 0;
const ctx = {
  state: createStateFixture(),
  bus: {
    emit(type, payload = {}) { emitted.push({ type, payload }); },
  },
  screenManager: {
    popScreen() { popCount += 1; },
  },
  registry: {
    get(name) {
      if (name !== 'world') return null;
      return {
        computeRoute(destination, mode) {
          routeRequests.push({ destination, mode });
          return {
            legs: [
              { from: 'sector_helios_prime', to: 'sector_ceres_belt', fuel: 19 },
              { from: 'sector_ceres_belt', to: destination, fuel: 18 },
            ],
            totalFuel: 37,
            totalHops: 2,
          };
        },
      };
    },
  },
};
const root = new FakeRoot(documentRef);
galaxyMapScreen.mount(root, ctx);

const knownSector = {
  id: 'sector_helios_prime',
  sectorId: 'sector_helios_prime',
  kind: 'sector',
  name: 'Helios Prime',
  factionId: 'faction_scn',
  security: 0.98,
  x: 0,
  y: 0,
};
galaxyMapScreen._selectedTarget = knownSector;
galaxyMapScreen._updateInspector();
const details = root.querySelector('.gm-inspector-details');
assert(details, 'the inspector should mount a dedicated details container beside the persistent action');
assert.match(details.innerHTML, /Current Conditions/, 'a known sector exposes its compact live condition readout');
assert.match(details.innerHTML, /Danger[\s\S]*55%[\s\S]*rising/i,
  'current danger is shown at honest whole-percent precision with its direction');
assert.match(details.innerHTML, /Price pressure[\s\S]*\+30%[\s\S]*climbing/i,
  'current price pressure is shown as a signed whole percent with its direction');
assert.match(details.innerHTML, /Control[\s\S]*Concord[\s\S]*50%[\s\S]*holding/i,
  'dominant influence/control and trend are legible without conflating them with legal ownership');
assert.match(details.innerHTML, /Why it changed/, 'the condition snapshot includes its causal receipt heading');
assert.match(details.innerHTML, /Crimson Reach raiders[\s\S]*Meridian trade routes[\s\S]*Concord holds Helios Prime uncontested/i,
  'the inspector presents the sanctioned 1–3 cause receipts in stable danger/price/control order');
const writesAfterFirstSectorRender = details.innerHTMLWrites;
galaxyMapScreen._updateInspector();
assert.equal(details.innerHTMLWrites, writesAfterFirstSectorRender,
  'an unchanged causal snapshot reuses the existing inspector cache instead of churning the DOM');

ctx.state.world.discovery = { sector_sker_haven: { discovered: false } };
galaxyMapScreen._selectedTarget = {
  id: 'sector_sker_haven', sectorId: 'sector_sker_haven', kind: 'sector', name: 'Sker Haven',
  factionId: 'faction_reach', security: 0.08, x: 5, y: 5,
};
galaxyMapScreen._updateInspector();
assert.doesNotMatch(details.innerHTML, /Current Conditions|Why it changed/,
  'an undiscovered real sector cannot reveal field causes through a forged selection');

ctx.state.world.discovery = { sector_tethys_junction: { discovered: true } };
galaxyMapScreen._selectedTarget = {
  id: 'sector_tethys_junction', sectorId: 'sector_tethys_junction', kind: 'sector', name: 'Tethys Junction',
  factionId: 'faction_mts', security: 0.65, x: 2, y: 2,
};
galaxyMapScreen._updateInspector();
assert.match(details.innerHTML, /2 Jumps \(Fuel: 37 Units\)/,
  'the inspector reports the executable world plan instead of multiplying hops by a fixed fuel guess');
assert.deepEqual(routeRequests.at(-1), { destination: 'sector_tethys_junction', mode: 'fuel' });

ctx.registry.get = () => null;
galaxyMapScreen._selectedTarget = {
  id: 'sector_ceres_belt', sectorId: 'sector_ceres_belt', kind: 'sector', name: 'Ceres Belt',
  factionId: 'faction_mts', security: 0.72, x: 1, y: 1,
};
galaxyMapScreen._updateInspector();
assert.match(details.innerHTML, /1 Jump \(Fuel unavailable\)/,
  'the graph-only fallback reports hop reachability while refusing to invent fuel cost');
assert.doesNotMatch(details.innerHTML, /Fuel: 10 Units/);

const helios = {
  id: 'station_helios',
  stationId: 'station_helios',
  entityId: 'entity_helios',
  kind: 'station',
  name: 'Helios Station',
  factionId: 'faction_scn',
  x: 1280,
  z: -420,
};

const refreshedHelios = { ...helios, x: 1296, z: -412 };
galaxyMapScreen._selectedTarget = helios;
galaxyMapScreen._updateInspector();
const firstButton = root.querySelector('#gm-set-course-btn');
assert(firstButton, 'Helios inspector should expose the Set Waypoint button');
assert.equal(firstButton.textContent, 'Set Waypoint');
firstButton.focus();

galaxyMapScreen._updateInspector();
const unchangedButton = root.querySelector('#gm-set-course-btn');
assert.strictEqual(unchangedButton, firstButton,
  'unchanged inspector refreshes must preserve the exact live Set Waypoint button object');
assert.equal(firstButton.isConnected, true, 'unchanged inspector refresh must not detach the focused button');
assert.strictEqual(documentRef.activeElement, firstButton,
  'unchanged inspector refresh must preserve keyboard/gamepad focus');
assert.equal(firstButton.listenerCount('click'), 1,
  'the persistent action button must have exactly one activation handler');

// The mission block must render the contract's real identity. Mission instances are stamped with
// `title` and never with `name`, so a reader that consults `name` first silently degrades every
// live contract to the placeholder — a defect that shipped precisely because this fixture used to
// carry no active mission for the block to render.
assert.match(details.innerHTML, /Active Mission/,
  'a station holding the tracked contract surfaces its mission block');
assert.match(details.innerHTML, /Vesta Ore Run/,
  'the mission block prints the instance title rather than a placeholder');
assert.doesNotMatch(details.innerHTML, /Contract Objective/,
  'a titled mission must never fall through to the generic placeholder');

const writesAfterFirstHeliosRender = details.innerHTMLWrites;
galaxyMapScreen._updateInspector();
assert.equal(details.innerHTMLWrites, writesAfterFirstHeliosRender,
  'identical inspector details must not churn the DOM or accessibility tree');

galaxyMapScreen._selectedTarget = {
  id: 'zone_tether_test',
  kind: 'zone',
  name: 'Tether Test Zone',
  detail: 'Massline proving ground',
  threat: 2,
  x: 200,
  z: 75,
};
galaxyMapScreen._updateInspector();
assert.strictEqual(root.querySelector('#gm-set-course-btn'), firstButton,
  'a legitimate target change must update the inspector without replacing its action button');
assert.match(details.innerHTML, /Tether Test Zone/,
  'a legitimate target change must update inspector detail text');
assert.equal(firstButton.textContent, 'Align Autopilot',
  'a legitimate target-kind change must update the persistent action label');
assert.strictEqual(documentRef.activeElement, firstButton,
  'changing details and label must preserve action focus');

galaxyMapScreen._selectedTarget = refreshedHelios;
galaxyMapScreen._updateInspector();
assert.strictEqual(root.querySelector('#gm-set-course-btn'), firstButton);
assert.equal(firstButton.textContent, 'Set Waypoint');
firstButton.click();

const setCourseEvents = emitted.filter((event) => event.type === 'ui:setCourse');
assert.equal(setCourseEvents.length, 1, 'one action activation must emit exactly one ui:setCourse intent');
assert.deepEqual(setCourseEvents[0].payload, {
  type: 'station',
  pos: { x: 1296, z: -412 },
  label: 'Helios Station',
  reason: 'Helios Station',
  waypointKind: 'nav',
  arrivalRadius: 90,
  autopilot: true,
  targetEntityId: 'entity_helios',
  stationId: 'station_helios',
}, 'the persistent handler must resolve the current Helios target at activation time');
assert.equal(popCount, 1, 'one action activation must pop exactly one screen');

firstButton.focus();
const beforeDeselectionEvents = emitted.filter((event) => event.type === 'ui:setCourse').length;
const beforeDeselectionPops = popCount;
galaxyMapScreen._selectedTarget = null;
galaxyMapScreen._updateInspector();
assert.strictEqual(root.querySelector('#gm-set-course-btn'), firstButton,
  'deselecting must retain the same persistent action node');
assert.equal(firstButton.isConnected, true, 'deselecting must not detach the persistent action');
assert.equal(firstButton.hidden, true, 'deselecting must hide the unavailable action');
assert.equal(firstButton.disabled, true, 'deselecting must disable the unavailable action');
assert.notStrictEqual(documentRef.activeElement, firstButton,
  'hiding the focused action must release focus rather than strand it on an unavailable control');
firstButton.click();
assert.equal(emitted.filter((event) => event.type === 'ui:setCourse').length, beforeDeselectionEvents,
  'a deselected hidden/disabled action must emit no ui:setCourse intent');
assert.equal(popCount, beforeDeselectionPops, 'a deselected hidden/disabled action must not pop a screen');

const reselectedHelios = { ...helios, x: 1344, z: -396 };
galaxyMapScreen._selectedTarget = reselectedHelios;
galaxyMapScreen._updateInspector();
assert.strictEqual(root.querySelector('#gm-set-course-btn'), firstButton,
  'reselection must reuse the same persistent action node');
assert.equal(firstButton.hidden, false, 'reselection must reveal the action again');
assert.equal(firstButton.disabled, false, 'reselection must enable the action again');
assert.equal(firstButton.listenerCount('click'), 1,
  'reselection must not add another activation handler');
const beforeReselectionEvents = emitted.filter((event) => event.type === 'ui:setCourse').length;
const beforeReselectionPops = popCount;
firstButton.click();
const afterReselectionEvents = emitted.filter((event) => event.type === 'ui:setCourse');
assert.equal(afterReselectionEvents.length, beforeReselectionEvents + 1,
  'one reselected action click must emit exactly one ui:setCourse intent');
assert.equal(popCount, beforeReselectionPops + 1,
  'one reselected action click must pop exactly one screen');
assert.deepEqual(afterReselectionEvents.at(-1).payload.pos, { x: 1344, z: -396 },
  'reselection activation must resolve the latest target rather than a stale captured target');

testRealShowHideLifecycle(galaxyMapScreen, ctx, firstButton);

const preRemountHelios = { ...helios, x: 1440, z: -360 };
galaxyMapScreen._selectedTarget = preRemountHelios;
galaxyMapScreen._updateInspector();
assert.equal(firstButton.hidden, false);
assert.equal(firstButton.disabled, false);
galaxyMapScreen.mount(root, ctx);
const remountedButton = root.querySelector('#gm-set-course-btn');
assert(remountedButton, 'a true remount must create a new live persistent action');
assert.notStrictEqual(remountedButton, firstButton, 'a true remount replaces the old DOM tree exactly once');
assert.equal(firstButton.isConnected, false, 'the previous action must be disconnected after remount');

const remountedHelios = { ...helios, x: 1777, z: -333 };
galaxyMapScreen._selectedTarget = remountedHelios;
galaxyMapScreen._updateInspector();
assert.equal(remountedButton.listenerCount('click'), 1,
  'the currently live remounted action must have exactly one activation handler');
assert.equal(remountedButton.hidden, false);
assert.equal(remountedButton.disabled, false);

const beforeOldButtonEvents = emitted.filter((event) => event.type === 'ui:setCourse').length;
const beforeOldButtonPops = popCount;
firstButton.click();
assert.equal(emitted.filter((event) => event.type === 'ui:setCourse').length, beforeOldButtonEvents,
  'the old disconnected action must not retain an activation listener after remount');
assert.equal(popCount, beforeOldButtonPops,
  'the old disconnected action must not pop a screen after remount');

remountedButton.click();
const afterRemountEvents = emitted.filter((event) => event.type === 'ui:setCourse');
assert.equal(afterRemountEvents.length, beforeOldButtonEvents + 1,
  'one click on the live remounted action must emit exactly one ui:setCourse intent');
assert.equal(popCount, beforeOldButtonPops + 1,
  'one click on the live remounted action must pop exactly one screen');
assert.deepEqual(afterRemountEvents.at(-1).payload.pos, { x: 1777, z: -333 },
  'the remounted handler must resolve the target selected after mount');

await testScheduledRefreshCadence(galaxyMapScreen, ctx, remountedButton);

console.log('Galaxy map inspector stability OK: focus, deselection, remount disposal, one intent/pop, cached details, 64ms cadence.');
}

function testRealShowHideLifecycle(screen, screenCtx, persistentButton) {
  const frames = new Map();
  let frameId = 0;
  let now = 0;
  const priorPerformance = globalThis.performance;
  const priorRequestAnimationFrame = globalThis.requestAnimationFrame;
  const priorCancelAnimationFrame = globalThis.cancelAnimationFrame;

  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: { now: () => now },
  });
  globalThis.requestAnimationFrame = (callback) => {
    frameId += 1;
    frames.set(frameId, callback);
    return frameId;
  };
  globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };

  const step = (timestamp) => {
    const next = frames.entries().next();
    assert.equal(next.done, false, `real lifecycle should have a scheduled frame before ${timestamp}ms`);
    const [id, callback] = next.value;
    frames.delete(id);
    now = timestamp;
    callback(timestamp);
  };

  try {
    for (let cycle = 0; cycle < 2; cycle += 1) {
      now = 0;
      screen.onShow(screenCtx);
      step(64);
      assert.strictEqual(screen._setCourseButton, persistentButton,
        `show/hide cycle ${cycle + 1} must retain the live persistent action`);
      assert.equal(persistentButton.listenerCount('click'), 1,
        `show/hide cycle ${cycle + 1} must not add an activation handler`);
      assert.equal(persistentButton.hidden, true,
        `show/hide cycle ${cycle + 1} resets selection through the real inspector update`);
      assert.equal(persistentButton.disabled, true);
      screen.onHide();
      assert.equal(frames.size, 0, `show/hide cycle ${cycle + 1} must cancel its owned frame`);
    }
  } finally {
    screen.onHide();
    if (priorPerformance === undefined) delete globalThis.performance;
    else Object.defineProperty(globalThis, 'performance', { configurable: true, value: priorPerformance });
    if (priorRequestAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = priorRequestAnimationFrame;
    if (priorCancelAnimationFrame === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = priorCancelAnimationFrame;
  }
}

async function testScheduledRefreshCadence(screen, screenCtx, persistentButton) {
  const frames = [];
  let frameId = 0;
  let now = 0;
  const priorPerformance = globalThis.performance;
  const priorRequestAnimationFrame = globalThis.requestAnimationFrame;
  const priorCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const originals = {
    resize: screen._resize,
    draw: screen._draw,
    updateInspector: screen._updateInspector,
  };
  let resizeCount = 0;
  let drawCount = 0;
  let inspectorCount = 0;

  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: { now: () => now },
  });
  globalThis.requestAnimationFrame = (callback) => {
    frames.push(callback);
    frameId += 1;
    return frameId;
  };
  globalThis.cancelAnimationFrame = () => {};
  screen._resize = () => { resizeCount += 1; };
  screen._draw = () => { drawCount += 1; };
  screen._updateInspector = () => { inspectorCount += 1; };

  const step = (timestamp) => {
    assert(frames.length > 0, `animation callback should be scheduled before ${timestamp}ms`);
    now = timestamp;
    frames.shift()(timestamp);
  };

  try {
    screen.onShow(screenCtx);
    assert.deepEqual({ resizeCount, drawCount, inspectorCount }, { resizeCount: 1, drawCount: 0, inspectorCount: 0 },
      'onShow performs its immediate sizing without an expensive draw before the cadence boundary');

    for (const timestamp of [16, 32, 48]) step(timestamp);
    assert.deepEqual({ drawCount, inspectorCount }, { drawCount: 0, inspectorCount: 0 },
      'ordinary rAF frames below 64ms must not trigger expensive refresh work');

    step(64);
    assert.deepEqual({ resizeCount, drawCount, inspectorCount }, { resizeCount: 2, drawCount: 1, inspectorCount: 1 },
      'the first scheduled refresh executes at the 64ms cadence boundary');
    assert.equal(screen._lastDrawTime, 64, 'scheduled refresh must advance the cadence timestamp');

    for (const timestamp of [80, 96, 112]) step(timestamp);
    assert.deepEqual({ drawCount, inspectorCount }, { drawCount: 1, inspectorCount: 1 },
      'the next three rAF frames remain below the next cadence boundary');

    step(128);
    assert.deepEqual({ resizeCount, drawCount, inspectorCount }, { resizeCount: 3, drawCount: 2, inspectorCount: 2 },
      'scheduled refresh repeats at approximately 64ms rather than every rAF');
    assert.equal(screen._lastDrawTime, 128);
    assert.equal(persistentButton.listenerCount('click'), 1,
      'show/update cycles do not add duplicate action handlers');
  } finally {
    screen.onHide();
    screen._resize = originals.resize;
    screen._draw = originals.draw;
    screen._updateInspector = originals.updateInspector;
    if (priorPerformance === undefined) delete globalThis.performance;
    else Object.defineProperty(globalThis, 'performance', { configurable: true, value: priorPerformance });
    if (priorRequestAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = priorRequestAnimationFrame;
    if (priorCancelAnimationFrame === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = priorCancelAnimationFrame;
  }
}

function createStateFixture() {
  return {
    simTime: 120,
    playerId: 'player',
    player: { id: 'player', marketMemory: {} },
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: { sector_helios_prime: { owner: 'faction_scn' } },
      discovery: { sector_helios_prime: { discovered: true, lastSeenEpochDays: 3 } },
    },
    sectorSim: {
      field: {
        version: 1,
        epochDays: 3,
        nodes: {
          sector_helios_prime: {
            danger: 0.55,
            pricePressure: 0.3,
            influence: { faction_scn: 0.5, faction_mts: 0.3, faction_reach: 0.2 },
            dominantFactionId: 'faction_scn',
            dominantInfluence: 0.5,
            contestMargin: 0.2,
            trend: { danger: 0.01, pricePressure: 0.02, influence: 0 },
            driver: {
              danger: 'reach_pressure',
              pricePressure: 'meridian_transmission',
              influence: 'territorial_anchor',
            },
          },
        },
      },
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
    // An active, tracked contract bound to the fixture station. Without this the inspector's
    // `if (relevantMission)` guards never fire, the mission block is never concatenated into the
    // cached HTML, and the no-churn assertions below cannot see inside it — which is exactly how a
    // live defect shipped where the block read `mission.name` (a field no instance ever carries)
    // and every real contract rendered the placeholder "Contract Objective".
    missions: {
      active: [{
        id: 'm_helios_run',
        status: 'active',
        title: 'Vesta Ore Run',
        type: 'bulk_haul',
        destStationId: 'station_helios',
        destSectorId: 'sector_helios',
        objectiveProgress: 12,
        objectiveTarget: 37,
        targetEntityIds: [],
      }],
    },
    ui: { trackedMissionId: 'm_helios_run' },
  };
}

function createDocumentFixture() {
  const documentFixture = {
    activeElement: null,
    head: { appendChild() {} },
    getElementById() { return null; },
    createElement(tagName) { return new FakeElement(tagName, documentFixture); },
  };
  return documentFixture;
}

class FakeRoot {
  constructor(documentFixture) {
    this.ownerDocument = documentFixture;
    this.id = '';
    this._innerHTML = '';
    this._elements = new Map();
    this._layerButtons = [];
  }

  set innerHTML(value) {
    for (const element of this._elements.values()) element.disconnect();
    this._innerHTML = String(value);
    this._elements.clear();

    const viewport = new FakeElement('div', this.ownerDocument);
    viewport.clientWidth = 1000;
    viewport.clientHeight = 700;
    const canvas = new FakeElement('canvas', this.ownerDocument);
    canvas.width = 1000;
    canvas.height = 700;
    canvas.style = {};
    canvas.getContext = () => createCanvasContext();

    const content = new InspectorContentElement(this.ownerDocument);
    if (this._innerHTML.includes('gm-inspector-details')) {
      content.details = new FakeElement('div', this.ownerDocument);
      content.details.className = 'gm-inspector-details';
      content.button = createButtonFromMarkup(this._innerHTML, this.ownerDocument);
    }

    this._elements.set('.gm-viewport', viewport);
    this._elements.set('canvas', canvas);
    this._elements.set('#gm-commodity-select', new FakeElement('select', this.ownerDocument));
    this._elements.set('.gm-search-input', new FakeElement('input', this.ownerDocument));
    this._elements.set('.gm-search-results', new FakeElement('div', this.ownerDocument));
    this._elements.set('.gm-close', new FakeElement('button', this.ownerDocument));
    this._elements.set('.gm-inspector-content', content);
    this._elements.set('[data-level]', new FakeElement('b', this.ownerDocument));
  }

  get innerHTML() { return this._innerHTML; }

  querySelector(selector) {
    const content = this._elements.get('.gm-inspector-content');
    if (selector === '.gm-inspector-details') return content && content.details;
    if (selector === '#gm-set-course-btn') return content && content.button;
    return this._elements.get(selector) || null;
  }

  querySelectorAll(selector) {
    return selector === '.gm-layer-btn' ? this._layerButtons : [];
  }
}

class InspectorContentElement {
  constructor(documentFixture) {
    this.ownerDocument = documentFixture;
    this._innerHTML = '';
    this.innerHTMLWrites = 0;
    this.details = null;
    this.button = null;
    this.isConnected = true;
  }

  set innerHTML(value) {
    if (this.details) this.details.disconnect();
    if (this.button) this.button.disconnect();
    this.details = null;
    this._innerHTML = String(value);
    this.innerHTMLWrites += 1;
    this.button = createButtonFromMarkup(this._innerHTML, this.ownerDocument);
  }

  get innerHTML() { return this._innerHTML; }

  querySelector(selector) {
    if (selector === '#gm-set-course-btn') return this.button;
    if (selector === '.gm-inspector-details') return this.details;
    return null;
  }

  disconnect() {
    this.isConnected = false;
    if (this.details) this.details.disconnect();
    if (this.button) this.button.disconnect();
  }
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
    this.classList = { add() {}, remove() {} };
    this._innerHTML = '';
    this.innerHTMLWrites = 0;
    this._textContent = '';
    this._listeners = new Map();
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    this.innerHTMLWrites += 1;
  }

  get innerHTML() { return this._innerHTML; }
  set hidden(value) {
    this._hidden = !!value;
    if (this._hidden && this.ownerDocument.activeElement === this) {
      this.ownerDocument.activeElement = null;
    }
  }
  get hidden() { return this._hidden; }
  set textContent(value) { this._textContent = String(value); }
  get textContent() { return this._textContent; }

  addEventListener(type, handler) {
    const handlers = this._listeners.get(type) || [];
    if (!handlers.includes(handler)) handlers.push(handler);
    this._listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    const handlers = this._listeners.get(type) || [];
    this._listeners.set(type, handlers.filter((candidate) => candidate !== handler));
  }

  listenerCount(type) { return (this._listeners.get(type) || []).length; }

  click() {
    if (this.disabled || this.hidden) return;
    for (const handler of [...(this._listeners.get('click') || [])]) handler({ currentTarget: this, target: this });
  }

  focus() { this.ownerDocument.activeElement = this; }
  select() {}
  getAttribute() { return null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getContext() { return null; }
  disconnect() { this.isConnected = false; }
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

function createButtonFromMarkup(markup, documentFixture) {
  const match = String(markup).match(/<button[^>]*id=["']gm-set-course-btn["'][^>]*>([\s\S]*?)<\/button>/i);
  if (!match) return null;
  const button = new FakeElement('button', documentFixture);
  button.textContent = match[1].replace(/<[^>]*>/g, '').trim();
  button.hidden = /<button[^>]*id=["']gm-set-course-btn["'][^>]*\shidden(?:\s|>|=)/i.test(String(markup));
  button.disabled = /<button[^>]*id=["']gm-set-course-btn["'][^>]*\sdisabled(?:\s|>|=)/i.test(String(markup));
  return button;
}

await main();
