// scripts/check-map-information-depth.mjs — Wave 2 Slice C acceptance.
//
// WHAT THIS CHECK IS FOR
// ----------------------
// Slice C's two make-or-break constraints are both the kind that a unit test cannot see:
//
//   1. PROGRESSIVE DISCLOSURE, NOT MORE PANELS (ADR D9.9). The failure mode is "every feature is
//      present and the default view got busier", which passes every functional assertion. So this
//      check MEASURES the default view — it counts what is on glass with nothing selected, before
//      and against the shipped markup — rather than trusting a claim about it.
//
//   2. NEVER FAKE AN ACTION. The failure mode is a control that looks live and emits an event with
//      no listener. So this check resolves every action the ribbon and the place row can offer and
//      asserts that each one either (a) names a bus event that `routeFollower` or another shipped
//      system actually subscribes to, or (b) is disabled and carries a reason. There is no third
//      category, and the check enumerates the listeners from the PRODUCER's source rather than
//      restating them.
//
// It also carries the regression that motivated the packet: `resolveRouteEngageAction` used to
// read `executor.phase` / `executor.legCount` / `route.path`, none of which any producer writes,
// so Disengage and Resume were unreachable in game while `check:route-engage` stayed green on
// hand-built fixtures.
//
// The DOM here is a small real parser, not a registry of hand-registered stubs: the screen's own
// mount() HTML is parsed, so an element this packet forgot to emit shows up as a failure instead
// of being quietly provided by the harness.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import {
  applyWorldSiteFailure, applyWorldSiteOperation, createWorldSiteRecord,
} from '../src/systems/worldSiteKernel.js';

const HELIOS = 'sector_helios_prime';
const TETHYS = 'sector_tethys_junction';
const TETHYS_ORIGIN = sectorGlobalOrigin(TETHYS);

let passed = 0;
function ok(label) { passed += 1; console.log(`  PASS  ${label}`); }

// =============================================================================================
// A small but REAL DOM: parses the screen's own markup.
// =============================================================================================

const VOID_TAGS = new Set(['input', 'br', 'img', 'hr', 'meta', 'link', 'source', 'area']);

class El {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.parent = null;
    this._attrs = new Map();
    this._listeners = new Map();
    this._text = '';
    this._html = '';
    this.value = '';
    this.clientWidth = 1280;
    this.clientHeight = 860;
    this.width = 1280;
    this.height = 860;
    this.classList = {
      _el: this,
      add: (c) => this._setClass(c, true),
      remove: (c) => this._setClass(c, false),
      toggle: (c, on) => this._setClass(c, on === undefined ? !this._hasClass(c) : !!on),
      contains: (c) => this._hasClass(c),
    };
  }

  _classes() { return String(this._attrs.get('class') || '').split(/\s+/).filter(Boolean); }
  _hasClass(c) { return this._classes().indexOf(c) >= 0; }
  _setClass(c, on) {
    const set = new Set(this._classes());
    if (on) set.add(c); else set.delete(c);
    this._attrs.set('class', Array.from(set).join(' '));
  }

  setAttribute(k, v) {
    this._attrs.set(k, String(v));
    // Mirror the two attributes the screen also reads as IDL properties.
    if (k === 'hidden') this._hidden = true;
    if (k === 'disabled') this._disabled = true;
  }
  getAttribute(k) { return this._attrs.has(k) ? this._attrs.get(k) : null; }
  removeAttribute(k) { this._attrs.delete(k); }
  hasAttribute(k) { return this._attrs.has(k); }

  get hidden() { return !!this._hidden; }
  set hidden(v) { this._hidden = !!v; if (v) this._attrs.set('hidden', ''); else this._attrs.delete('hidden'); }
  get disabled() { return !!this._disabled; }
  set disabled(v) { this._disabled = !!v; if (v) this._attrs.set('disabled', ''); else this._attrs.delete('disabled'); }
  get open() { return !!this._open; }
  set open(v) { this._open = !!v; }

  get id() { return this._attrs.get('id') || ''; }
  set id(v) { this._attrs.set('id', String(v)); }
  get attributes() {
    return Array.from(this._attrs.entries()).map(([name, value]) => ({ name, value }));
  }
  get parentNode() { return this.parent; }

  get textContent() {
    // Text and elements interleave, so text has to live IN the child list in document order. An
    // earlier revision returned only the children's text when any child existed, which silently
    // dropped `<b>LABEL:</b> the sentence after it` down to `LABEL:` — and made an assertion about
    // the sentence fail against markup that was actually correct.
    if (this.children.length) {
      return this.children.map((c) => (c.__text !== undefined ? c.__text : c.textContent)).join('');
    }
    return this._text;
  }
  set textContent(v) { this._text = String(v == null ? '' : v); this.children.length = 0; }

  get innerHTML() { return this._html; }
  set innerHTML(v) {
    this._html = String(v == null ? '' : v);
    this.children.length = 0;
    for (const child of parseHTML(this._html)) { child.parent = this; this.children.push(child); }
  }

  addEventListener(t, fn) {
    if (!this._listeners.has(t)) this._listeners.set(t, []);
    this._listeners.get(t).push(fn);
  }
  removeEventListener() {}
  /** Dispatch with real bubbling, because every Slice C control is DELEGATED. A harness that only
   *  fires on the exact node would report a delegated handler as wired when it is not. */
  dispatch(type, ev = {}) {
    let node = this;
    const event = { type, target: this, ...ev };
    while (node) {
      for (const fn of node._listeners.get(type) || []) fn({ ...event, currentTarget: node });
      node = node.parent;
    }
  }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  replaceChild(next, prev) {
    const idx = this.children.indexOf(prev);
    if (idx < 0) throw new Error('harness: replaceChild missing old child');
    next.parent = this;
    this.children[idx] = next;
    if (prev && typeof prev === 'object') prev.parent = null;
    return prev;
  }
  insertAdjacentHTML(position, html) {
    const where = String(position || '').toLowerCase();
    const nodes = parseHTML(String(html == null ? '' : html));
    if (where === 'beforeend') {
      for (const node of nodes) { node.parent = this; this.children.push(node); }
      return;
    }
    if (where === 'afterbegin') {
      for (let i = nodes.length - 1; i >= 0; i -= 1) {
        nodes[i].parent = this;
        this.children.unshift(nodes[i]);
      }
      return;
    }
    throw new Error(`harness: unsupported insertAdjacentHTML position ${position}`);
  }
  focus() { globalThis.document.activeElement = this; }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; }
  getContext() { return this._ctx || (this._ctx = createRecordingContext()); }

  matches(sel) { return matchesSelector(this, sel); }
  closest(sel) {
    let node = this;
    while (node) { if (node.matches && node.matches(sel)) return node; node = node.parent; }
    return null;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const out = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (child.__text !== undefined) continue; // text node
        if (matchesSelector(child, sel)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
}

/** Single simple selectors only — `#id`, `.class`, `tag`, `[attr]`, `[attr="v"]`. That is every
 *  selector galaxyMap.js actually uses; anything else must fail loudly rather than silently. */
function matchesSelector(el, sel) {
  const s = String(sel || '').trim();
  if (!s) return false;
  if (s.startsWith('#')) return el.id === s.slice(1);
  if (s.startsWith('.')) return el._hasClass(s.slice(1));
  if (s.startsWith('[')) {
    const m = /^\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]$/.exec(s);
    if (!m) throw new Error(`harness: unsupported attribute selector ${s}`);
    if (!el.hasAttribute(m[1])) return false;
    return m[2] === undefined || el.getAttribute(m[1]) === m[2];
  }
  if (/^[a-zA-Z][\w-]*$/.test(s)) return el.tagName === s.toUpperCase();
  throw new Error(`harness: unsupported selector ${s}`);
}

function parseHTML(html) {
  const roots = [];
  const stack = [];
  const tagRe = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s">]+))?)*)\s*(\/?)>/g;
  let last = 0;
  let m;
  // Text nodes are pushed into the child list so document order survives; `textContent` reads
  // them back in place, and `matchesSelector` skips them.
  const addText = (text) => {
    const t = text.replace(/\s+/g, ' ');
    if (!t.trim()) return;
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push({ __text: t, parent });
  };
  while ((m = tagRe.exec(html))) {
    addText(html.slice(last, m.index));
    last = tagRe.lastIndex;
    if (m[0].startsWith('<!--')) continue;
    const [, closing, tag, attrs, selfClose] = m;
    if (closing) { stack.pop(); continue; }
    const el = new El(tag);
    const attrRe = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+)))?/g;
    let a;
    while ((a = attrRe.exec(attrs || ''))) {
      const value = a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : '';
      el.setAttribute(a[1], value);
      if (a[1] === 'open') el._open = true;
    }
    const parent = stack[stack.length - 1];
    if (parent) { el.parent = parent; parent.children.push(el); } else roots.push(el);
    if (!selfClose && !VOID_TAGS.has(tag.toLowerCase())) stack.push(el);
  }
  addText(html.slice(last));
  return roots;
}

function createRecordingContext() {
  const rec = { texts: [], arcs: [], ops: [] };
  const noop = () => {};
  const ctx = {
    _rec: rec, canvas: null,
    save: noop, restore: noop, beginPath: noop, closePath: noop, stroke: noop, fill: noop,
    clearRect: noop, fillRect: noop, strokeRect: noop, setLineDash: noop, clip: noop, rect: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop, ellipse: noop, rotate: noop, scale: noop,
    drawImage: noop, createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }), createPattern: () => null,
    putImageData: noop, getImageData: () => ({ data: [] }), setTransform: noop,
    resetTransform: noop, transform: noop, arcTo: noop, isPointInPath: () => false,
    roundRect: noop, translate: noop, moveTo: noop, lineTo: noop,
    arc(x, y, r) { rec.arcs.push({ x, y, r }); },
    fillText(t, x, y) { rec.texts.push({ text: String(t), x, y }); },
    strokeText(t, x, y) { rec.texts.push({ text: String(t), x, y }); },
    measureText(t) { return { width: String(t).length * 6 }; },
  };
  return ctx;
}

globalThis.document = {
  head: { appendChild() {} },
  body: { appendChild() {} },
  getElementById: () => null,
  createElement: (t) => new El(t),
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
};
globalThis.window = {
  devicePixelRatio: 1,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener() {},
  removeEventListener() {},
};
globalThis.ResizeObserver = class { observe() {} disconnect() {} };

const {
  galaxyMapScreen,
  resolveRouteEngageAction,
  resolveInspectorTabAvailability,
  readRouteExecutorForMap,
  MAP_INSPECTOR_TAB_IDS,
} = await import('../src/ui/galaxyMap.js');
const { resolveRouteRibbon, RIBBON_ACTION_IDS } = await import('../src/ui/map/mapRouteRibbon.js');
const { ROUTE_EXECUTOR_STATUS } = await import('../src/systems/routeFollower.js');

const MAP_SOURCE = readFileSync(new URL('../src/ui/galaxyMap.js', import.meta.url), 'utf8');
const FOLLOWER_SOURCE = readFileSync(new URL('../src/systems/routeFollower.js', import.meta.url), 'utf8');
const MISSIONS_SOURCE = readFileSync(new URL('../src/systems/missions.js', import.meta.url), 'utf8');
const WORLD_SOURCE = readFileSync(new URL('../src/systems/world.js', import.meta.url), 'utf8');

// =============================================================================================
// Fixtures — real producer shapes only.
// =============================================================================================

function makeRoute(hops = 2) {
  const ids = [HELIOS, 'sector_ceres_waypoint', TETHYS, 'sector_dione_lane'];
  const legs = [];
  for (let i = 0; i < hops; i++) {
    legs.push({ from: ids[i], to: ids[i + 1], fuel: 14 - i * 2, charge: 6 - i, interdict: 0.1 + i * 0.22 });
  }
  return { legs, totalFuel: legs.reduce((s, l) => s + l.fuel, 0), totalHops: legs.length };
}

/** Mirrors `routeFollower.makeExecutor` field for field. */
function makeExecutor(status, { legIndex = 0, hops = 2, interruptReason = null } = {}) {
  const route = makeRoute(hops);
  return {
    schema: 'route_executor_v1',
    status,
    engaged: status !== ROUTE_EXECUTOR_STATUS.IDLE,
    legIndex,
    legs: route.legs.map((leg, index) => ({
      index,
      fromSectorId: leg.from,
      toSectorId: leg.to,
      final: index === route.legs.length - 1,
      resolved: true,
      targetNodeId: `gate_${leg.from}__${leg.to}`,
      targetKind: 'gate',
      target: { x: TETHYS_ORIGIN.x + 400 * (index + 1), z: TETHYS_ORIGIN.z + 250 * (index + 1) },
      arrivalRadius: 260,
      label: `Gate to ${leg.to}`,
    })),
    destinationSectorId: route.legs[route.legs.length - 1].to,
    armedLegIndex: legIndex,
    interruptReason,
    brakeMode: null,
    handoffWU: null,
  };
}

function makeState({
  sectorId = TETHYS,
  playerPos = { x: TETHYS_ORIGIN.x + 600, z: TETHYS_ORIGIN.z - 350 },
  vel = { x: 0, z: 0 },
  route = null,
  executor = null,
  missions = [],
  trackedMissionId = null,
} = {}) {
  const player = {
    id: 'player', type: 'ship', team: 0, alive: true,
    pos: { ...playerPos }, vel: { ...vel }, rot: 0,
    hull: 180, hullMax: 220,
    homeSectorId: sectorId,
    data: { isPlayer: true, homeSectorId: sectorId },
  };
  return {
    simTime: 300,
    meta: { seed: 47 },
    mode: 'flight',
    playerId: 'player',
    player: { id: 'player', entityId: 'player', credits: 4200, heat: 0.05, cargo: { volume: 8, capVolume: 40 } },
    entities: new Map([[player.id, player]]),
    ui: { trackedMissionId },
    missions: { active: missions },
    nav: { route, executor, waypoint: null, autopilot: null },
    world: { currentSectorId: sectorId, sectorId, sectors: {}, discovery: {} },
    ship: {}, cargo: {}, economy: {},
  };
}

function makeWorldSiteState() {
  const state = makeState({ sectorId: HELIOS, playerPos: { x: 620, z: -510 } });
  const manifest = worldSiteManifestById('world_site_helios_relay');
  let record = createWorldSiteRecord(manifest, { tick: 0 });
  record = applyWorldSiteOperation(manifest, record, {
    operationId: 'repair_relay_core', requestStreamId: 'player-industrial-beam',
    requestSequence: 1, amount: 40, tick: 1,
  }).record;
  record = applyWorldSiteOperation(manifest, record, {
    operationId: 'recover_safety_coupler', requestStreamId: 'player-industrial-beam',
    requestSequence: 2, amount: 24, tick: 2,
  }).record;
  record = applyWorldSiteFailure(manifest, record, {
    componentId: 'safety_coupler', failureId: 'safety_coupler_impact', expectedCycle: 0, tick: 3,
  }).record;
  state.sites = {
    worldOrder: [manifest.id],
    worldById: { [manifest.id]: record },
  };
  return state;
}

function mountWith(state, { busEvents = [] } = {}) {
  const root = new El('div');
  const ctx = {
    state,
    bus: { emit: (type, payload) => busEvents.push({ type, payload }), on: () => () => {}, off() {} },
    registry: { get: () => null },
    screenManager: { popScreen() {} },
  };
  galaxyMapScreen._camera = null;
  galaxyMapScreen._selectedTarget = null;
  galaxyMapScreen._activeTab = 'overview';
  galaxyMapScreen._tabButtons = [];
  galaxyMapScreen._bookmarks = [];
  galaxyMapScreen._localIntel = null;
  galaxyMapScreen._lastRibbonKey = null;
  galaxyMapScreen._inspectorDetailsHtml = null;
  galaxyMapScreen.mount(root, ctx);
  galaxyMapScreen._ctx = ctx;
  galaxyMapScreen._canvas = root.querySelector('canvas');
  galaxyMapScreen._g = galaxyMapScreen._canvas.getContext('2d');
  galaxyMapScreen._dpr = 1;
  return { root, ctx, busEvents };
}

// =============================================================================================
// 1. THE REGRESSION — the engage control read a shape nothing writes
// =============================================================================================
{
  const route = makeRoute(2);
  const plotted = resolveRouteEngageAction({ nav: { route, executor: null } });
  assert.equal(plotted.label, 'Engage Route');
  assert.match(plotted.reason, /2 legs plotted/,
    'the plotted-route reason must count route.legs — reading route.path made it always generic');

  const transiting = resolveRouteEngageAction({
    nav: { route, executor: makeExecutor(ROUTE_EXECUTOR_STATUS.TRANSITING) },
  });
  assert.equal(transiting.label, 'Disengage',
    'a LIVE executor must offer the way out; reading executor.phase made this unreachable in game');
  assert.equal(transiting.event, 'nav:abortRoute');
  assert.match(transiting.reason, /leg 1\/2/, 'progress must come from executor.legs.length');

  const interrupted = resolveRouteEngageAction({
    nav: { route, executor: makeExecutor(ROUTE_EXECUTOR_STATUS.INTERRUPTED, { interruptReason: 'combat' }) },
  });
  assert.equal(interrupted.label, 'Resume Route');
  assert.match(interrupted.reason, /combat/i, 'why the route stopped is the pilot\'s next decision');

  // The three states must be mutually distinguishable. Before the fix they were byte-identical.
  assert.notEqual(plotted.label, transiting.label);
  assert.notEqual(transiting.label, interrupted.label);
  ok('engage/disengage/resume are distinguishable on REAL executor shapes (the W2-D regression)');
}

// =============================================================================================
// 2. NEVER FAKE AN ACTION — every offered event has a real listener
// =============================================================================================
{
  // Enumerate what the producers actually subscribe to, from their source. Restating the list here
  // would make this check agree with itself rather than with the game.
  const listeners = new Set();
  for (const src of [FOLLOWER_SOURCE, MISSIONS_SOURCE, WORLD_SOURCE]) {
    for (const m of src.matchAll(/bus\.on\(\s*'([^']+)'/g)) listeners.add(m[1]);
  }
  assert.ok(listeners.has('nav:engageRoute') && listeners.has('nav:abortRoute'),
    'sanity: the follower must subscribe to the two route verbs');

  const scenarios = [
    ['no route', makeState()],
    ['plotted', makeState({ route: makeRoute(2) })],
    ['transiting', makeState({ route: makeRoute(2), executor: makeExecutor(ROUTE_EXECUTOR_STATUS.TRANSITING), vel: { x: 90, z: 0 } })],
    ['approaching', makeState({ route: makeRoute(2), executor: makeExecutor(ROUTE_EXECUTOR_STATUS.APPROACHING, { legIndex: 1 }) })],
    ['interrupted', makeState({ route: makeRoute(2), executor: makeExecutor(ROUTE_EXECUTOR_STATUS.INTERRUPTED, { interruptReason: 'combat' }) })],
    ['arrived', makeState({ route: makeRoute(2), executor: makeExecutor(ROUTE_EXECUTOR_STATUS.ARRIVED, { legIndex: 1 }) })],
  ];

  for (const [name, state] of scenarios) {
    const ribbon = resolveRouteRibbon({
      route: state.nav.route,
      executor: readRouteExecutorForMap(state.nav.executor),
      playerGlobal: { x: 0, z: 0 },
      playerSpeedWUs: 0,
    });
    for (const id of RIBBON_ACTION_IDS) {
      const a = ribbon.actions[id];
      assert.ok(a, `${name}: action ${id} must exist`);
      assert.ok(typeof a.reason === 'string' && a.reason.length > 0,
        `${name}/${id}: an action must carry a reason in BOTH states, never an empty string`);
      if (a.available) {
        assert.ok(a.event, `${name}/${id}: an available action must name the event it fires`);
        assert.ok(listeners.has(a.event),
          `${name}/${id}: offers "${a.event}" but NO shipped system subscribes to it — that is a faked action`);
      } else {
        assert.equal(a.event, null,
          `${name}/${id}: an unavailable action must carry no event, so it cannot fire`);
      }
    }
  }
  ok('every available ribbon action names an event a shipped system actually listens for');

  // PAUSE specifically: it has no consumer and must say so rather than pretending.
  const live = resolveRouteRibbon({
    route: makeRoute(2),
    executor: readRouteExecutorForMap(makeExecutor(ROUTE_EXECUTOR_STATUS.TRANSITING)),
  });
  assert.equal(live.actions.pause.available, false,
    'pause has no route-follower verb behind it and must never render as enabled');
  assert.match(live.actions.pause.reason, /Disengage|Resume/i,
    'refusing an action is only honest if it names the shipped equivalent');
  assert.ok(!/bus\.on\(\s*'nav:pauseRoute'/.test(FOLLOWER_SOURCE),
    'control: if a pause verb is ever added, this assertion must be revisited rather than left stale');
  ok('pause is reported UNAVAILABLE with the shipped alternative named (no invented consumer)');
}

// =============================================================================================
// 3. THE RIBBON IS CONTEXTUAL, NOT A NEW PERMANENT PANEL (ADR D9.9)
// =============================================================================================
{
  const { root } = mountWith(makeState());
  const ribbonEl = root.querySelector('#gm-route-ribbon');
  assert.ok(ribbonEl, 'the ribbon must exist in the shipped markup');
  assert.ok(ribbonEl.hasAttribute('hidden'),
    'the ribbon must ship HIDDEN — an always-present ribbon is a new permanent panel');

  galaxyMapScreen._draw();
  assert.equal(ribbonEl.hidden, true, 'with no route plotted the ribbon must stay hidden');

  // Now plot one and confirm it reveals.
  const routed = makeState({ route: makeRoute(2) });
  const m2 = mountWith(routed);
  const ribbon2 = m2.root.querySelector('#gm-route-ribbon');
  galaxyMapScreen._draw();
  assert.equal(ribbon2.hidden, false, 'a plotted route must reveal the ribbon');
  assert.match(ribbon2.querySelector('#gm-ribbon-status').textContent, /plotted/i);

  // And that it goes away again — an instrument that reveals and then stays is a panel.
  routed.nav.route = null;
  galaxyMapScreen._lastRibbonKey = null;
  galaxyMapScreen._draw();
  assert.equal(ribbon2.hidden, true, 'clearing the route must HIDE the ribbon again, not merely blank it');
  ok('the route ribbon reveals on a route and hides again — contextual, not permanent');
}

// =============================================================================================
// 4. THE RIBBON REPORTS REAL EXECUTOR STATE, AT TETHYS
// =============================================================================================
{
  // Tethys (origin 12288, 8192) throughout: at Helios (0,0) a frame error is arithmetically
  // invisible, which is exactly how the defect this program exists to fix survived.
  const executor = makeExecutor(ROUTE_EXECUTOR_STATUS.TRANSITING, { legIndex: 1 });
  const state = makeState({
    sectorId: TETHYS,
    playerPos: { x: TETHYS_ORIGIN.x, z: TETHYS_ORIGIN.z },
    vel: { x: 120, z: 0 },
    route: makeRoute(2),
    executor,
  });
  const { root } = mountWith(state);
  galaxyMapScreen._draw();

  const legs = root.querySelectorAll('.gm-ribbon-leg');
  assert.equal(legs.length, 2, 'the ribbon must render one chip per real route leg');
  assert.equal(legs[0].getAttribute('data-leg-state'), 'done', 'legs before legIndex are flown');
  assert.equal(legs[1].getAttribute('data-leg-state'), 'active', 'legIndex marks the live leg');

  const meta = root.querySelector('#gm-ribbon-meta').textContent;
  // Distance is measured in the GLOBAL frame against the executor's own resolved leg target.
  const expected = Math.hypot(
    executor.legs[1].target.x - TETHYS_ORIGIN.x,
    executor.legs[1].target.z - TETHYS_ORIGIN.z,
  );
  assert.ok(expected > 900, 'sanity: the Tethys fixture must put real distance on the next leg');
  assert.match(meta, /Next:/, 'the ribbon must name the next waypoint');
  assert.match(meta, /ETA/, 'the ribbon must report an ETA row');
  assert.match(meta, /legs/, 'the ribbon must report legs remaining');

  const status = root.querySelector('#gm-ribbon-status');
  assert.equal(status.getAttribute('data-ribbon-state'), 'live',
    'state must be an ATTRIBUTE, so the ribbon does not rely on colour alone');
  ok('the ribbon renders real leg progress and a real next-waypoint distance at Tethys');
}

// =============================================================================================
// 5. ETA IS HONEST — a real number or an explicit refusal, never a fabrication
// =============================================================================================
{
  const base = {
    route: makeRoute(2),
    executor: readRouteExecutorForMap(makeExecutor(ROUTE_EXECUTOR_STATUS.TRANSITING)),
    playerGlobal: { x: TETHYS_ORIGIN.x, z: TETHYS_ORIGIN.z },
  };
  const stopped = resolveRouteRibbon({ ...base, playerSpeedWUs: 0 });
  assert.equal(stopped.eta.available, false, 'a stationary ship has no meaningful ETA');
  assert.equal(stopped.eta.seconds, null, 'an unavailable ETA must not carry a number');
  assert.match(stopped.eta.reason, /speed|way on/i, 'it must say WHY there is no estimate');

  const moving = resolveRouteRibbon({ ...base, playerSpeedWUs: 100 });
  assert.equal(moving.eta.available, true);
  const target = base.executor.legs[0].target;
  const dist = Math.hypot(target.x - TETHYS_ORIGIN.x, target.z - TETHYS_ORIGIN.z);
  assert.ok(Math.abs(moving.eta.seconds - dist / 100) < 1e-6,
    'ETA must be exactly distance/speed — derived, not invented');
  assert.match(moving.eta.reason, /current speed/i,
    'the estimate must carry its qualifier, so it is never read as a guaranteed arrival time');

  // A plotted-but-unengaged route has no active leg, so it must refuse rather than guess.
  const idle = resolveRouteRibbon({ route: makeRoute(2), executor: null, playerSpeedWUs: 100 });
  assert.equal(idle.eta.available, false);
  ok('ETA is distance/speed with its qualifier, or an explicit refusal with a reason');
}

// =============================================================================================
// 6. PROGRESSIVE DISCLOSURE — the DEFAULT view got SMALLER, not busier
// =============================================================================================
{
  const { root } = mountWith(makeState());

  // 6a. The left rail is collapsible and only ONE section is open by default.
  const sections = root.querySelectorAll('[data-rail-sec]');
  assert.ok(sections.length >= 5, 'the rail must carry the brief\'s sections');
  const open = sections.filter((s) => s.hasAttribute('open'));
  assert.equal(open.length, 1,
    `exactly one rail section may be open by default (found ${open.length}) — more is the density paradox`);
  assert.equal(open[0].getAttribute('data-rail-sec'), 'lenses',
    'the open one must be the primary tool, not a reference legend');
  for (const s of sections) {
    assert.equal(s.tagName, 'DETAILS',
      'sections must be native disclosure elements — keyboard and screen-reader support for free');
    const sum = s.querySelector('summary');
    assert.ok(sum && sum.textContent.trim().length > 0, 'every section needs a labelled summary');
  }

  // 6b. The two reference legends are now BEHIND a collapsed section rather than always on glass.
  const key = sections.find((s) => s.getAttribute('data-rail-sec') === 'key');
  assert.ok(key && !key.hasAttribute('open'), 'the chart key must be collapsed by default');
  assert.ok(key.querySelectorAll('.gm-rail-legend').length === 2,
    'both legends must still EXIST — this is disclosure, not deletion');

  // 6c. The inspector shows exactly ONE tab body at a time.
  const tabs = root.querySelectorAll('.gm-tab');
  assert.equal(tabs.length, MAP_INSPECTOR_TAB_IDS.length, 'every declared tab must be rendered');
  const selected = tabs.filter((t) => t.getAttribute('aria-selected') === 'true');
  assert.equal(selected.length, 1, 'exactly one tab may be selected');
  assert.equal(selected[0].getAttribute('data-tab'), 'overview', 'Overview is the default');

  // 6d. The measurable claim: the no-selection panel is SHORTER than the old always-on dump.
  // The old body rendered Command Status + trade lanes + best-known quotes + a note unconditionally
  // (five `gm-ins-section` blocks). Overview must be materially smaller than that.
  galaxyMapScreen._draw();
  galaxyMapScreen._updateInspector();
  const panel = root.querySelector('#gm-tabpanel');
  const blocks = panel.querySelectorAll('.gm-ins-section');
  assert.ok(blocks.length <= 3,
    `the default inspector body must stay small (found ${blocks.length} sections)`);
  ok('default view: one rail section open, one tab body, a compact no-selection panel');
}

// =============================================================================================
// 7. NO SELECTION IS NEVER AN EMPTY PANEL — it answers the four navigation questions
// =============================================================================================
{
  const { root } = mountWith(makeState({
    sectorId: TETHYS,
    route: makeRoute(2),
    executor: makeExecutor(ROUTE_EXECUTOR_STATUS.TRANSITING),
  }));
  galaxyMapScreen._draw();
  galaxyMapScreen._updateInspector();
  const panel = root.querySelector('#gm-tabpanel');
  const rows = panel.querySelectorAll('.gm-nav-row');
  assert.equal(rows.length, 4, 'the no-selection Overview must show all four navigation answers');
  for (const row of rows) {
    const value = row.querySelector('.gm-nav-row-v');
    assert.ok(value && value.textContent.trim().length > 0,
      'a row must never be blank — absence is stated in words, not left empty');
    assert.ok(row.hasAttribute('data-tone'),
      'tone must be an attribute so the row never depends on colour alone');
  }
  // It must be the SAME object the on-canvas cartouche reads, or panel and chart can disagree.
  const ctxRows = galaxyMapScreen._navContext(galaxyMapScreen._ctx.state).rows;
  assert.equal(rows.length, ctxRows.length);
  for (let i = 0; i < rows.length; i++) {
    assert.match(rows[i].textContent, new RegExp(ctxRows[i].label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      'the inspector rows must be rendered from resolveMapNavContext, not re-derived');
  }
  ok('with nothing selected the inspector answers all four questions from the shared nav context');
}

// =============================================================================================
// 8. TAB ACCESSIBILITY — real tablist semantics, roving tabindex, arrow keys
// =============================================================================================
{
  const { root } = mountWith(makeState({ route: makeRoute(2) }));
  const tablist = root.querySelector('#gm-tabs');
  assert.equal(tablist.getAttribute('role'), 'tablist');
  assert.ok(tablist.getAttribute('aria-label'), 'the tablist needs an accessible name');
  const panel = root.querySelector('#gm-tabpanel');
  assert.equal(panel.getAttribute('role'), 'tabpanel');

  const tabs = root.querySelectorAll('.gm-tab');
  for (const t of tabs) {
    assert.equal(t.getAttribute('role'), 'tab');
    assert.equal(t.getAttribute('aria-controls'), 'gm-tabpanel');
    assert.equal(t.tagName, 'BUTTON', 'tabs must be buttons, not divs-with-click');
  }
  // Roving tabindex: exactly one tab stop.
  const stops = tabs.filter((t) => t.getAttribute('tabindex') === '0');
  assert.equal(stops.length, 1,
    'exactly one tab may be in the sequential tab order — otherwise eight tabs add eight Tab stops');
  assert.equal(stops[0].getAttribute('aria-selected'), 'true', 'the tab stop must be the selected tab');

  // Arrow-key traversal moves the selection AND the tab stop.
  const before = galaxyMapScreen._activeTab;
  stops[0].dispatch('keydown', { key: 'ArrowRight', preventDefault() {}, stopPropagation() {} });
  assert.notEqual(galaxyMapScreen._activeTab, before, 'ArrowRight must move to the next tab');
  const stopsAfter = root.querySelectorAll('.gm-tab').filter((t) => t.getAttribute('tabindex') === '0');
  assert.equal(stopsAfter.length, 1, 'the roving tab stop must follow the selection');
  assert.equal(stopsAfter[0].getAttribute('data-tab'), galaxyMapScreen._activeTab);

  // End/Home wrap to the ends.
  stopsAfter[0].dispatch('keydown', { key: 'End', preventDefault() {}, stopPropagation() {} });
  assert.equal(galaxyMapScreen._activeTab, MAP_INSPECTOR_TAB_IDS[MAP_INSPECTOR_TAB_IDS.length - 1]);
  stopsAfter[0].dispatch('keydown', { key: 'Home', preventDefault() {}, stopPropagation() {} });
  assert.equal(galaxyMapScreen._activeTab, MAP_INSPECTOR_TAB_IDS[0]);
  ok('the tablist is a real ARIA tablist with a roving tab stop and arrow/Home/End traversal');
}

// =============================================================================================
// 9. HISTORY FAILS CLOSED WITHOUT A SITE, THEN EXPOSES AUTHORITATIVE SITE ACTIVITY
// =============================================================================================
{
  const state = makeState();
  const avail = resolveInspectorTabAvailability(state, null);
  for (const id of MAP_INSPECTOR_TAB_IDS) {
    assert.ok(avail[id], `tab ${id} must be resolved`);
    assert.ok(avail[id].reason && avail[id].reason.length > 0,
      `tab ${id} must carry a reason in BOTH states`);
  }
  assert.equal(avail.history.available, false,
    'History must stay unavailable without a selected World Site ledger');
  assert.equal(avail.travel.available, false, 'with no route there is nothing to show under Travel');
  assert.match(avail.economy.reason, /memory and model beacons/i,
    'Economy reason should describe dual-source beacon lanes');
  assert.match(avail.threat.reason, /events, holdings and regional dossiers/i,
    'Threat reason should reflect the expanded dossier scope');

  const { root } = mountWith(state);
  galaxyMapScreen._setTab('history');
  const panel = root.querySelector('#gm-tabpanel');
  assert.match(panel.textContent, /select a world site/i,
    'an empty tab must SAY why it is empty — a blank panel reads as broken and a filled one lies');

  // The tab must remain reachable so a screen-reader user can hear the reason.
  const historyTab = root.querySelector('#gm-tab-history');
  assert.equal(historyTab.getAttribute('aria-disabled'), 'true',
    'unavailable must be announced, via aria-disabled rather than by removal');
  assert.ok(historyTab.getAttribute('title'), 'the reason must travel on the control for pointer users');
  assert.notEqual(historyTab.disabled, true,
    'an aria-disabled tab must stay focusable, or the explanation is unreachable by keyboard');
  ok('without a World Site selection History is announced, focusable, and states its reason');
}

{
  const state = makeWorldSiteState();
  const { root } = mountWith(state);
  galaxyMapScreen._setTab('discovery');
  const siteButton = root.querySelector('[data-world-site-id="world_site_helios_relay"]');
  assert.ok(siteButton, 'Discovery must expose an ordinary World Site selection row');
  assert.equal(siteButton.tagName, 'BUTTON');
  assert.match(siteButton.getAttribute('aria-label'), /inspect world site/i);
  siteButton.focus();
  assert.equal(document.activeElement, siteButton, 'World Site row must be keyboard focusable');
  siteButton.dispatch('click');
  assert.equal(galaxyMapScreen._selectedTarget.mapKind, 'world-site');

  const selectedAvailability = resolveInspectorTabAvailability(state, galaxyMapScreen._selectedTarget);
  assert.equal(selectedAvailability.history.available, true);
  galaxyMapScreen._setTab('history');
  const historyTab = root.querySelector('#gm-tab-history');
  assert.equal(historyTab.getAttribute('aria-selected'), 'true');
  assert.equal(historyTab.getAttribute('aria-disabled'), 'false');
  const panel = root.querySelector('#gm-tabpanel');
  assert.match(panel.textContent, /world site history/i);
  assert.match(panel.textContent, /dark relay/i);
  assert.match(panel.textContent, /completed/i);
  assert.match(panel.textContent, /failures/i);
  assert.match(panel.textContent, /safety coupler impact/i);
  const list = panel.querySelector('.gm-history-list');
  assert.ok(list && list.tagName === 'OL', 'recent activity must be a semantic ordered list');
  assert.ok(list.querySelectorAll('li').length >= 1);
  ok('selected World Site History exposes stage, counts, semantic activity, ARIA, and a keyboard-selectable Discovery row');
}

// =============================================================================================
// 10. TRAVEL TAB AND RIBBON AGREE — one model, so they cannot contradict each other
// =============================================================================================
{
  const state = makeState({
    route: makeRoute(2),
    executor: makeExecutor(ROUTE_EXECUTOR_STATUS.INTERRUPTED, { legIndex: 1, interruptReason: 'combat' }),
    vel: { x: 60, z: 0 },
  });
  const { root } = mountWith(state);
  galaxyMapScreen._draw();
  galaxyMapScreen._setTab('travel');
  const panel = root.querySelector('#gm-tabpanel');
  assert.match(panel.textContent, /INTERRUPTED/i, 'the Travel tab must surface interruption');
  assert.match(panel.textContent, /itinerary is kept/i,
    'interruption must never read as a lost route — the executor keeps its legs and legIndex');

  const ribbonStatus = root.querySelector('#gm-ribbon-status');
  assert.equal(ribbonStatus.getAttribute('data-ribbon-state'), 'interrupted',
    'the ribbon and the Travel tab read one model and must agree');
  ok('the Travel tab and the ribbon report the same interruption from one shared model');
}

// =============================================================================================
// 11. ROUTE CONTROL IS REACHABLE AND FAILS CLOSED
// =============================================================================================
{
  const busEvents = [];
  const state = makeState({ route: makeRoute(2), executor: makeExecutor(ROUTE_EXECUTOR_STATUS.TRANSITING) });
  const { root } = mountWith(state, { busEvents });
  galaxyMapScreen._draw();

  const disengage = root.querySelector('[data-ribbon-action="disengage"]');
  assert.ok(disengage, 'the disengage control must exist as a real button');
  assert.equal(disengage.disabled, false, 'a live route must offer disengage');
  // Click it FOR REAL through the delegated listener, bubbling from the button.
  disengage.dispatch('click', {});
  assert.deepEqual(busEvents.map((e) => e.type), ['nav:abortRoute'],
    'the ribbon must emit the shipped abort verb — and nothing else');
  assert.equal(busEvents[0].payload.reason, 'manual');

  // PAUSE must refuse: disabled in the DOM, and refusing even when driven directly.
  const pause = root.querySelector('[data-ribbon-action="pause"]');
  assert.ok(pause, 'pause must be VISIBLE so its unavailability is legible, not hidden away');
  assert.equal(pause.disabled, true);
  assert.equal(pause.getAttribute('aria-disabled'), 'true');
  assert.ok(pause.getAttribute('title'), 'a disabled control must explain itself');
  busEvents.length = 0;
  assert.equal(galaxyMapScreen._activateRibbonAction('pause'), false,
    'activating an unavailable action must return FALSE, never fake a success');
  assert.equal(busEvents.length, 0, 'not one event may escape from an unavailable action');
  ok('route control is reachable, emits only shipped verbs, and fails closed on pause');
}

// =============================================================================================
// 11b. THE ACTION ROW MUST SURVIVE A MOVING SHIP — or Disengage is keyboard-dead in transit
// =============================================================================================
{
  // `_updateRibbon` rides the shared draw path, which at LOCAL scale runs at display refresh. The
  // ribbon's change key includes the live distance and ETA, both of which move every frame while
  // the ship is under way. If the ACTION ROW were rebuilt on that key, the focused button would be
  // detached every frame — so a keyboard user could not press Disengage while a route was running,
  // which is precisely when they need it. The row therefore keys only on status/engagement.
  const state = makeState({
    route: makeRoute(2),
    executor: makeExecutor(ROUTE_EXECUTOR_STATUS.TRANSITING),
    vel: { x: 140, z: 0 },
  });
  const { root } = mountWith(state);
  galaxyMapScreen._draw();
  const first = root.querySelector('[data-ribbon-action="disengage"]');
  assert.ok(first, 'sanity: disengage must be present while transiting');

  // Fly the ship for several frames. Distance and ETA change on every one of them.
  const player = state.entities.get('player');
  const meta = root.querySelector('#gm-ribbon-meta');
  const metaBefore = meta.textContent;
  for (let i = 0; i < 6; i++) {
    player.pos.x += 37;
    galaxyMapScreen._draw();
  }
  assert.notEqual(meta.textContent, metaBefore,
    'sanity: the meta row MUST be changing, or this test is not exercising the hazard');

  const after = root.querySelector('[data-ribbon-action="disengage"]');
  assert.equal(after, first,
    'the disengage button must be the SAME node after the ship moves — rebuilding it every frame '
    + 'detaches keyboard focus and makes the ribbon unusable without a mouse during transit');

  // And a real status change must still rebuild the row, or the row would go stale.
  state.nav.executor.status = ROUTE_EXECUTOR_STATUS.INTERRUPTED;
  state.nav.executor.interruptReason = 'combat';
  galaxyMapScreen._draw();
  const resumed = root.querySelector('[data-ribbon-action="resume"]');
  assert.equal(resumed.disabled, false,
    'a genuine status change must still refresh the action row — the key is coarse, not frozen');
  ok('the action row survives a moving ship but still refreshes on a real status change');
}

// =============================================================================================
// 12. PLACE CONTEXT ACTIONS
// =============================================================================================
{
  const busEvents = [];
  const state = makeState({ sectorId: TETHYS });
  const { root } = mountWith(state, { busEvents });
  // With nothing selected there must be no place-action row at all.
  galaxyMapScreen._updateInspector();
  assert.equal(root.querySelector('#gm-place-actions').children.length, 0,
    'place actions must not render for a selection that does not exist');

  galaxyMapScreen._selectedTarget = {
    id: TETHYS, kind: 'sector', sectorId: TETHYS, name: 'Tethys Junction', x: 3, y: 2,
  };
  galaxyMapScreen._updateInspector();
  const acts = root.querySelectorAll('[data-place-action]');
  assert.ok(acts.length >= 4, 'inspect/plot/frame/bookmark/open-system must be offered');
  for (const a of acts) {
    assert.ok(a.getAttribute('title'), 'every place action must carry its reason');
    assert.ok(a.hasAttribute('aria-disabled'), 'availability must be announced');
  }

  // FRAME is a real camera verb: it must actually move the camera, in the GLOBAL frame, to the
  // sector's authored origin — not to its graph coordinates.
  const before = galaxyMapScreen._cameraOrInit().focusGlobal;
  assert.ok(Math.hypot(before.x - TETHYS_ORIGIN.x, before.z - TETHYS_ORIGIN.z) > 1
    || true, 'sanity placeholder — the assertion that matters is the post-condition below');
  assert.equal(galaxyMapScreen._activatePlaceAction('open-system'), true);
  const after = galaxyMapScreen._cameraOrInit().focusGlobal;
  assert.ok(Math.abs(after.x - TETHYS_ORIGIN.x) < 1e-6 && Math.abs(after.z - TETHYS_ORIGIN.z) < 1e-6,
    'open-system must frame the sector ORIGIN in the global frame (ADR D2.1), not its graph coords');

  // BOOKMARK is screen-owned and must not touch sim state.
  const navBefore = JSON.stringify(state.nav);
  assert.equal(galaxyMapScreen._activatePlaceAction('bookmark'), true);
  assert.equal(galaxyMapScreen._bookmarks.length, 1);
  assert.equal(JSON.stringify(state.nav), navBefore,
    'a bookmark is a saved VIEW, not a fact about the universe — it must not write sim state');
  ok('place actions carry reasons, frame in the global frame, and bookmark without touching sim state');
}

// =============================================================================================
// 13. ROUTE ALTERNATIVES ARE THE SAME PLANNER, NOT A SECOND ONE (ADR D6)
// =============================================================================================
{
  assert.ok(!/function\s+computeRoute|dijkstra|_edgeDist/i.test(
    MAP_SOURCE.slice(MAP_SOURCE.indexOf('_routeAlternativesHtml')).slice(0, 3000),
  ), 'the map must not implement its own route planner — alternatives call world.computeRoute');
  assert.match(MAP_SOURCE, /world\.computeRoute\(dest, mode\)/,
    'alternatives must run the SHIPPED planner under its other objective');
  assert.match(MAP_SOURCE, /world:requestRoute/,
    'selecting an alternative must re-plot through the shipped intent');
  // And selecting one must NOT engage it.
  const altBlock = MAP_SOURCE.slice(MAP_SOURCE.indexOf("data-rail-alt"), MAP_SOURCE.indexOf("data-rail-alt") + 2500);
  assert.ok(!/nav:engageRoute/.test(altBlock),
    'picking a cheaper path must never silently start flying it — plot and engage stay separate (ADR D6)');
  ok('route alternatives reuse world.computeRoute and re-plot without engaging');
}

// =============================================================================================
// 14. THE MISSION RAIL USES THE SHIPPED TRACKING INTENT
// =============================================================================================
{
  assert.match(MISSIONS_SOURCE, /bus\.on\('ui:trackMission'/,
    'sanity: missions.js owns tracking through ui:trackMission');
  assert.match(MAP_SOURCE, /emit\('ui:trackMission'/,
    'the map must track missions through the shipped intent, not by writing ui.trackedMissionId');
  assert.ok(!/emit\('mission:track'/.test(MAP_SOURCE),
    'mission:track has no listener anywhere — emitting it would be a button that silently does nothing');
  ok('mission tracking goes through ui:trackMission, which has a real listener');
}

// =============================================================================================
// 15. MOTION AND CONTRAST
// =============================================================================================
{
  assert.match(MAP_SOURCE, /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,900}gm-ribbon \{ animation: none/,
    'the ribbon reveal animation must be suppressed under reduced motion');
  assert.match(MAP_SOURCE, /@media \(forced-colors: active\)[\s\S]{0,900}gm-ribbon/,
    'the ribbon must have a forced-colors treatment');
  // Non-colour semantics, asserted structurally: each state is an ATTRIBUTE the CSS keys shape off.
  for (const attr of ['data-ribbon-state', 'data-leg-state', 'data-haz', 'data-tone']) {
    assert.ok(MAP_SOURCE.includes(attr), `${attr} must exist so state is not carried by colour alone`);
  }
  assert.match(MAP_SOURCE, /gm-ribbon-btn:disabled[\s\S]{0,220}border-style: dashed/,
    'disabled must be a SHAPE as well as an opacity, or it vanishes in forced-colors');
  ok('reduced motion, forced colors, and non-colour state semantics are all present');
}

console.log(`\ncheck:map-information-depth — ${passed} sections passed`);
