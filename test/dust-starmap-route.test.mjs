// DUST P4 — starmap wayfinding (2026-10-31 vision audit follow-up).
//
// The in-session galaxy map scored best (route line from the player's position, GOAL marker,
// reachability, CTA, legend that decodes marks); the N-key NAV CHART scored worst. These tests
// pin the ported pattern on src/ui/screens/starmap.js:
//   - a route line from the CURRENT sector to the selected/waypoint target, previewed through the
//     SHIPPED planner (world.computeRoute — ADR D6: no second graph search in a map),
//   - one-jump range rings on exactly the nodes the sim's jump validation would accept,
//   - the GOAL reticle on the objective sector,
//   - the Engage CTA wired to the route follower's own trigger (nav:engageRoute),
//   - CLOSE demoted below the course CTA,
//   - no exceptions with empty/unselected state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { starmapScreen, canvasRoles } from '../src/ui/screens/starmap.js';

const SOURCE = readFileSync(new URL('../src/ui/screens/starmap.js', import.meta.url), 'utf8');

// Real authored graph (the one computeDiscoveredRoute walks): Helios -> Ceres -> Pallas is 2 hops.
const HELIOS = 'sector_helios_prime';
const CERES = 'sector_ceres_belt';
const PALLAS = 'sector_pallas_drift';

const AMBER_HEX = '#ffb347'; // roles.goal fallback, solid strokes (brackets, armed beam)
const AMBER_RGBA = '255,179,71'; // the same hex through paint()'s alpha pass (bloom, preview, pip)
const RANGE_RING = 'rgba(79,191,143,0.7)'; // roles.you fallback '#4fbf8f' at the ring's 0.7 alpha

function fakeBus() {
  const emitted = [];
  return { emitted, on() { return () => {}; }, emit(type, payload) { emitted.push({ type, payload }); } };
}

// A canvas 2D context that records style writes and geometry so draw assertions can read what the
// instrument actually painted (the repo's screen-test harness pattern: no DOM, direct method call).
function recordingCtx() {
  const ops = [];
  const store = { _ops: ops };
  return new Proxy(store, {
    get(target, key) {
      if (key === 'ops') return ops;
      if (key in target) return target[key];
      return (...args) => { ops.push([key, args]); return { width: 0 }; };
    },
    set(target, key, value) {
      target[key] = value;
      if (key === 'strokeStyle' || key === 'fillStyle') ops.push(['set:' + key, value]);
      return true;
    },
  });
}

function bootState(overrides = {}) {
  return {
    simTime: 100,
    fuel: { current: 40, max: 60 },
    world: {
      currentSectorId: HELIOS,
      discovery: { [CERES]: { discovered: true }, [PALLAS]: { discovered: true } },
    },
    nav: {},
    ...overrides,
  };
}

function bootDraw({ state, registry } = {}) {
  const def = Object.create(starmapScreen);
  def._ctx = { state: state || bootState(), registry, bus: fakeBus() };
  def._canvas = { width: 800, height: 600 };
  def._g = recordingCtx();
  def._dpr = 1;
  def._cam = { cx: 0, cy: 0, zoom: 1 };
  def._commodityId = 'cmdty_ore_iron';
  def._selectedId = null;
  def._hoverId = null;
  def._hoverInfo = null;
  def._nodes = [];
  return def;
}

/** (x, y) of every arc that was stroked in `color` — the ring positions the canvas really painted. */
function ringCentersAtColor(ops, color) {
  const out = [];
  for (let i = 0; i < ops.length; i++) {
    if (ops[i][0] === 'set:strokeStyle' && ops[i][1] === color) {
      for (let j = i - 1; j >= 0; j--) {
        if (ops[j][0] === 'arc') { out.push({ x: ops[j][1][0], y: ops[j][1][1] }); break; }
        if (ops[j][0] === 'beginPath') break;
      }
    }
  }
  return out;
}

function amberStrokes(ops) {
  return ops.filter(([op, val]) => op === 'set:strokeStyle'
    && (val === AMBER_HEX || String(val).includes(AMBER_RGBA))).length;
}

function legs(hops) {
  return hops.map(([from, to], i) => ({ from, to, fuel: 5 + i, interdict: 0 }));
}

test('P4 preview: selecting a far sector draws an amber route beam from the current sector', () => {
  const prevPath2D = globalThis.Path2D;
  globalThis.Path2D = globalThis.Path2D || class Path2D {};
  try {
    let plannerCalls = 0;
    const route = { legs: legs([[HELIOS, CERES], [CERES, PALLAS]]), totalHops: 2, totalFuel: 11 };
    const registry = { get: (id) => (id === 'world' ? {
      computeRoute(dest) { plannerCalls += 1; return dest === PALLAS ? route : null; },
    } : null) };
    const def = bootDraw({ registry });
    def._selectedId = PALLAS; // two hops away, discovered, nothing plotted
    def._draw();
    const ops = def._g.ops;
    assert.ok(amberStrokes(ops) >= 2, 'the preview beam paints amber (bloom + main stroke)');
    assert.ok(ops.some(([op]) => op === 'lineTo'), 'the beam is a polyline through the route legs');
    // The preview is INTENT, never a plot: nav.route stays untouched.
    assert.equal(def._ctx.state.nav.route, undefined);
    // Memoised like the galaxy map: a second beat does not re-run the planner for the same key.
    def._draw();
    assert.equal(plannerCalls, 1);
    assert.equal(def._previewRouteStatus, 'ready');
    assert.equal(def._animates, true, 'the preview pip marches — direction affordance');
  } finally {
    if (prevPath2D === undefined) delete globalThis.Path2D;
    else globalThis.Path2D = prevPath2D;
  }
});

test('P4 a plotted course outranks the preview and paints the full amber beam', () => {
  const prevPath2D = globalThis.Path2D;
  globalThis.Path2D = globalThis.Path2D || class Path2D {};
  try {
    let plannerCalls = 0;
    const registry = { get: (id) => (id === 'world' ? {
      computeRoute() { plannerCalls += 1; return null; },
    } : null) };
    const state = bootState({ nav: { route: { legs: legs([[HELIOS, CERES], [CERES, PALLAS]]), totalHops: 2, totalFuel: 11 } } });
    const def = bootDraw({ state, registry });
    def._selectedId = PALLAS;
    def._draw();
    assert.ok(amberStrokes(def._g.ops) >= 2, 'the plotted route paints the amber beam');
    assert.equal(plannerCalls, 0, 'with a course laid, the planner is not even consulted');
  } finally {
    if (prevPath2D === undefined) delete globalThis.Path2D;
    else globalThis.Path2D = prevPath2D;
  }
});

test('P4 one-jump range rings land on lane neighbours and wormhole edges, not on far sectors', () => {
  const prevPath2D = globalThis.Path2D;
  globalThis.Path2D = globalThis.Path2D || class Path2D {};
  try {
    // A tiny authored graph through the screen's own content override: A(current) — B(lane),
    // A =wormhole=> W, and C two hops out of reach.
    const sectors = [
      { id: 'A', name: 'Alpha', factionId: 'faction_scn', position: { x: 0, y: 0 }, neighbors: ['B'], wormholeTo: { sectorId: 'W' }, stations: [] },
      { id: 'B', name: 'Bravo', factionId: 'faction_scn', position: { x: 40, y: 0 }, neighbors: ['A', 'C'], stations: [] },
      { id: 'W', name: 'Whiskey', factionId: 'faction_scn', position: { x: 0, y: 40 }, neighbors: [], stations: [] },
      { id: 'C', name: 'Charlie', factionId: 'faction_scn', position: { x: 80, y: 0 }, neighbors: ['B'], stations: [] },
    ];
    const def = bootDraw({
      state: {
        simTime: 10,
        fuel: { current: 10, max: 20 },
        world: { currentSectorId: 'A', discovery: { B: { discovered: true }, W: { discovered: true }, C: { discovered: true } } },
        nav: {},
        content: { sectors },
      },
    });
    def._selectedId = null;
    def._draw();
    const nodes = Object.fromEntries(def._layout().map((n) => [n.sector.id, n]));
    const rings = ringCentersAtColor(def._g.ops, RANGE_RING);
    const near = (p, n) => Math.hypot(p.x - n.x, p.y - n.y) < 1;
    assert.ok(rings.some((p) => near(p, nodes.B)), 'lane neighbour B carries the one-jump ring');
    assert.ok(rings.some((p) => near(p, nodes.W)), 'wormhole edge W carries the one-jump ring');
    assert.ok(!rings.some((p) => near(p, nodes.C)), 'two-hop C does not');
    assert.ok(!rings.some((p) => near(p, nodes.A)), 'the current sector does not ring itself');
    // The predicate mirrors the sim's own jump validation pair test.
    assert.equal(def._isJumpableFrom('A', 'B'), true);
    assert.equal(def._isJumpableFrom('A', 'W'), true);
    assert.equal(def._isJumpableFrom('A', 'C'), false);
  } finally {
    if (prevPath2D === undefined) delete globalThis.Path2D;
    else globalThis.Path2D = prevPath2D;
  }
});

test('P4 the objective sector carries the GOAL reticle', () => {
  const prevPath2D = globalThis.Path2D;
  globalThis.Path2D = globalThis.Path2D || class Path2D {};
  try {
    const state = bootState({
      nav: { waypoint: { sectorId: PALLAS, label: 'Deliver the invoices', reason: 'A delivery run' } },
    });
    const def = bootDraw({ state });
    def._draw();
    const words = def._g.ops.filter(([op]) => op === 'fillText').map(([, a]) => String(a[0]));
    assert.ok(words.includes('GOAL'), 'the objective sector is labelled GOAL on the chart');
    assert.equal(def._objectiveSectorId(), PALLAS);
    // Brackets + word are amber: the goal is one of the course's endpoints.
    assert.ok(amberStrokes(def._g.ops) >= 1);
  } finally {
    if (prevPath2D === undefined) delete globalThis.Path2D;
    else globalThis.Path2D = prevPath2D;
  }
});

test('P4 Engage Route is wired to the route follower trigger, not a new state writer', () => {
  const bus = fakeBus();
  const def = Object.create(starmapScreen);
  def._ctx = {
    bus,
    state: bootState({ nav: { route: { legs: legs([[HELIOS, CERES], [CERES, PALLAS]]), totalHops: 2, totalFuel: 11 } } }),
  };
  def._els = { fuel: {}, jumpState: {}, range: {}, epoch: {} }; // _syncHeader writes readouts
  def._selectedId = PALLAS;
  def._nameOf = () => 'Pallas Drift';
  def._onAction('engage');
  const engage = bus.emitted.find((e) => e.type === 'nav:engageRoute');
  assert.ok(engage, 'nav:engageRoute reaches the route follower (the galaxy map\'s own trigger)');
  assert.ok(bus.emitted.some((e) => e.type === 'toast'), 'the action acknowledges with a receipt');
  // No other navigation intents fire alongside engage — the follower owns the transition.
  assert.deepEqual(bus.emitted.filter((e) => e.type !== 'toast').map((e) => e.type), ['nav:engageRoute']);
});

test('P4 CLOSE is a quiet ghost; the course CTA is the loud verb', () => {
  const closeRule = SOURCE.match(/#sf-starmap \.sm-close \{[^}]*\}/)[0];
  assert.match(closeRule, /background:\s*transparent/, 'CLOSE rests on no field');
  assert.match(closeRule, /font-size:\s*12px/, 'CLOSE stays at the label floor size');
  assert.match(closeRule, /min-height:\s*28px/, 'CLOSE is physically smaller than the 40px CTA row');
  assert.doesNotMatch(closeRule, /--dp-lamp/, 'CLOSE never wears the Hand at rest');
  // The Engage verb exists and every data-act button is dressed as the screen's Lamp Key.
  assert.match(SOURCE, /data-act="engage"[^<]*⟫ Engage Route/, 'the engage CTA is authored');
  assert.match(SOURCE, /querySelectorAll\('button\[data-act\]'\)\) dressLampKey\(button\)/,
    'the course CTA carries the Lamp Key dressing');
  // The legend decodes marks the canvas actually paints — nothing else.
  assert.match(SOURCE, /sm-line[^<]*<\/i>course/, 'course line is decoded');
  assert.match(SOURCE, /sm-ring[^<]*<\/i>one-jump range/, 'the range ring is decoded');
  assert.match(SOURCE, /sm-dot--you[^<]*<\/i>your sector/, 'you-are-here is decoded');
  assert.match(SOURCE, /danger field/, 'the danger field entry stays');
});

test('P4 empty and unselected states throw nothing', () => {
  const prevPath2D = globalThis.Path2D;
  globalThis.Path2D = globalThis.Path2D || class Path2D {};
  try {
    const bare = bootDraw({ state: { simTime: 0, fuel: {}, world: {}, nav: {} } });
    bare._draw(); // no current sector, no selection, no registry, no planner
    assert.equal(bare._previewRouteTo('nowhere'), null);
    assert.equal(bare._selectionPreviewRoute(), null);
    assert.equal(bare._drawRoute(bare._g, { legs: [] }, {}, 0, canvasRoles(), false), false);

    // A planner that explodes must not take the chart down with it.
    const exploding = bootDraw({
      state: bootState(),
      registry: { get: () => ({ computeRoute() { throw new Error('boom'); } }) },
    });
    exploding._selectedId = PALLAS;
    exploding._draw();
    assert.equal(exploding._previewRouteStatus, 'unavailable');

    // Sidebar with nothing selected renders the hint and empties the action row.
    const quiet = Object.create(starmapScreen);
    quiet._ctx = { state: bootState() };
    quiet._els = {
      selected: { innerHTML: '' }, actions: { innerHTML: '' },
      objective: { hidden: true, innerHTML: '', setAttribute() {}, removeAttribute() {} },
    };
    quiet._selectedId = null;
    quiet._sidebarSig = '';
    quiet._commodityId = 'cmdty_ore_iron';
    quiet._syncSidebar();
    assert.match(quiet._els.selected.innerHTML, /Select a sector/);
    assert.equal(quiet._els.actions.innerHTML, '');
  } finally {
    if (prevPath2D === undefined) delete globalThis.Path2D;
    else globalThis.Path2D = prevPath2D;
  }
});
