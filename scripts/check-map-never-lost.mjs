// scripts/check-map-never-lost.mjs — Wave 2 Slice A/B acceptance.
//
// This check exists because the two pure modules (mapCamera, mapNavContext) and their unit tests
// prove MATHS, not REACHABILITY. Under AGENTS.md's wired-features contract a passing unit test is
// explicitly not completion — the behaviour has to be reachable on the default route. So this
// mounts the real `galaxyMapScreen`, drives its real `_draw()` through a recording canvas, and
// asserts on what actually reached the glass.
//
// Every spatial assertion runs in sector_tethys_junction (global origin 12288, 8192) as well as, or
// instead of, Helios. Helios is at (0,0), where a global/sector-local frame error is arithmetically
// invisible; it is also the starting sector, which is why the original defect survived so long.

import assert from 'node:assert/strict';
import { sectorGlobalOrigin, SECTOR_ORIGIN_LATTICE_WU } from '../src/data/sectorCoordinates.js';

const HELIOS = 'sector_helios_prime';
const TETHYS = 'sector_tethys_junction';
const TETHYS_ORIGIN = sectorGlobalOrigin(TETHYS);

let passed = 0;
function ok(label) { passed += 1; console.log(`  PASS  ${label}`); }

// ---------------------------------------------------------------------------------------------
// Headless DOM + a canvas context that RECORDS instead of rasterising
// ---------------------------------------------------------------------------------------------

function createRecordingContext() {
  const rec = { texts: [], arcs: [], ops: [], fills: [], moves: [] };
  const noop = () => {};
  const ctx = {
    _rec: rec,
    canvas: null,
    save: noop, restore: noop, beginPath: noop, closePath: noop, stroke: noop,
    clearRect: noop, fillRect: noop, strokeRect: noop, setLineDash: noop, clip: noop,
    rect: noop, quadraticCurveTo: noop, bezierCurveTo: noop, ellipse: noop, rotate: noop,
    scale: noop, drawImage: noop, createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => null, putImageData: noop, getImageData: () => ({ data: [] }),
    setTransform: noop, resetTransform: noop, transform: noop, arcTo: noop,
    isPointInPath: () => false, roundRect: noop, setLineWidth: noop,
    fill: () => { rec.fills.push(1); },
    translate(x, y) { rec.ops.push(['translate', x, y]); },
    moveTo(x, y) { rec.moves.push([x, y]); },
    lineTo: noop,
    // Capture the stroke style at arc time. Radius alone is not a discriminator: sector sigils,
    // scan rings and service pictograms all draw circles in the same size band, so a radius-only
    // detector reports the player mark as present after it has been deleted. (Proven — an early
    // revision of this check did exactly that and passed a mutation that removed the mark.)
    arc(x, y, r) { rec.arcs.push({ x, y, r, strokeStyle: ctx.strokeStyle, lineWidth: ctx.lineWidth }); },
    fillText(text, x, y) { rec.texts.push({ text: String(text), x, y }); },
    strokeText(text, x, y) { rec.texts.push({ text: String(text), x, y }); },
    measureText(text) { return { width: String(text).length * 6 }; },
  };
  return ctx;
}

class El {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.classList = {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, on) { if (on) this._set.add(c); else this._set.delete(c); },
      contains(c) { return this._set.has(c); },
    };
    this._attrs = new Map();
    this.textContent = '';
    this.innerHTML = '';
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.clientWidth = 1200;
    this.clientHeight = 820;
    this.width = 1200;
    this.height = 820;
    this._listeners = new Map();
  }
  setAttribute(k, v) { this._attrs.set(k, String(v)); }
  getAttribute(k) { return this._attrs.has(k) ? this._attrs.get(k) : null; }
  removeAttribute(k) { this._attrs.delete(k); }
  addEventListener(t, fn) {
    if (!this._listeners.has(t)) this._listeners.set(t, []);
    this._listeners.get(t).push(fn);
  }
  removeEventListener() {}
  dispatch(t, ev) {
    for (const fn of this._listeners.get(t) || []) fn({ ...ev, currentTarget: this, target: this });
  }
  appendChild(c) { this.children.push(c); return c; }
  focus() {}
  closest() { return null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1200, height: 820 }; }
  getContext() { return this._ctx || (this._ctx = createRecordingContext()); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

class Root extends El {
  constructor() {
    super('div');
    if (!this._registry) this._registry = new Map();
  }
  querySelector(sel) { return (this._registry && this._registry.get(sel)) || null; }
  set innerHTML(v) {
    this._html = String(v);
    // `El`'s constructor assigns `this.innerHTML = ''`, which reaches this setter BEFORE the Root
    // constructor body runs — so the registry has to be created here rather than assumed.
    if (!this._registry) this._registry = new Map();
    if (this._html) this._build();
  }
  get innerHTML() { return this._html || ''; }
  _build() {
    const mk = (sel, tag) => { const e = new El(tag); this._registry.set(sel, e); return e; };
    const viewport = mk('.gm-viewport', 'div');
    viewport.clientWidth = 1200; viewport.clientHeight = 820;
    const canvas = mk('canvas', 'canvas');
    canvas.width = 1200; canvas.height = 820;
    mk('.gm-inspector-details', 'div');
    mk('#gm-set-course-btn', 'button');
    mk('#gm-engage-route-btn', 'button');
    mk('#gm-engage-reason', 'div');
    mk('#gm-return-ship-btn', 'button');
    mk('#gm-frame-both-btn', 'button');
    mk('#gm-frame-reason', 'div');
    mk('#gm-commodity-select', 'select');
    mk('.gm-search-input', 'input');
    mk('.gm-search-results', 'div');
    mk('.gm-close', 'button');
    mk('.gm-hint-btn', 'button');
    mk('.gm-hints', 'div');
    mk('.gm-inspector-content', 'div');
    mk('[data-level]', 'b');
    mk('.gm-level', 'span');
    mk('.gm-rail-marker', 'span');
    mk('.gm-rail-track', 'span');
    const scale = ['local', 'system', 'galaxy'].map((f) => {
      const b = new El('button');
      b.setAttribute('data-focus', f);
      return b;
    });
    this._scaleButtons = scale;
  }
  querySelectorAll(sel) {
    if (sel === '.gm-scale-btn') return this._scaleButtons || [];
    if (sel === '.gm-layer-btn') return [];
    return [];
  }
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

const {
  galaxyMapScreen,
  buildGalaxyModel,
  buildSystemModel,
} = await import('../src/ui/galaxyMap.js');

// ---------------------------------------------------------------------------------------------
// State fixtures
// ---------------------------------------------------------------------------------------------

function makeState({ sectorId = HELIOS, playerPos = { x: 0, z: 0 }, route = null, executor = null, waypoint = null } = {}) {
  const player = {
    id: 'player', type: 'ship', team: 0, alive: true,
    pos: { ...playerPos }, vel: { x: 0, z: 0 }, rot: 0,
    homeSectorId: sectorId,
    data: { isPlayer: true, homeSectorId: sectorId },
  };
  // `playerEntity` resolves through `state.entities.get(state.playerId)`, so the fixture uses the
  // real Map-shaped entity store rather than an array the builders would silently read as empty.
  const entities = new Map([[player.id, player]]);
  return {
    simTime: 120,
    meta: { seed: 47 },
    mode: 'flight',
    playerId: 'player',
    player: { id: 'player', entityId: 'player' },
    entities,
    ui: { trackedMissionId: null },
    missions: { active: [] },
    nav: { route, executor, waypoint, autopilot: null },
    // `currentSectorId` reads `world.currentSectorId` — spelling it `world.sectorId` silently falls
    // back to SECTORS[0] (Helios, origin 0,0), which is the one sector where every frame bug is
    // invisible. Getting this wrong would have made half of this file assert nothing.
    world: { currentSectorId: sectorId, sectorId, sectors: {}, discovery: {} },
    ship: {},
    cargo: {},
    economy: {},
  };
}

function ctxFor(state) {
  return {
    state,
    bus: { emit() {}, on() { return () => {}; }, off() {} },
    registry: { get: () => null },
    screenManager: { popScreen() {} },
  };
}

function mountWith(state) {
  const root = new Root();
  const ctx = ctxFor(state);
  galaxyMapScreen.mount(root, ctx);
  galaxyMapScreen._ctx = ctx;
  galaxyMapScreen._canvas = root.querySelector('canvas');
  galaxyMapScreen._g = galaxyMapScreen._canvas.getContext('2d');
  galaxyMapScreen._dpr = 1;
  galaxyMapScreen._camera = null;
  galaxyMapScreen._localIntel = null;
  return { root, ctx };
}

function drawAt(focus, state) {
  galaxyMapScreen._setScaleFocus(focus, { draw: false, animate: false });
  const g = galaxyMapScreen._g;
  g._rec.texts.length = 0;
  g._rec.arcs.length = 0;
  galaxyMapScreen._draw();
  return g._rec;
}

const textOf = (rec) => rec.texts.map((t) => t.text).join(' | ');

// ---------------------------------------------------------------------------------------------
// 1. THE PLAYER MARK NEVER DISAPPEARS
// ---------------------------------------------------------------------------------------------

{
  // The galaxy model shipped with no player field at all. That is the gap being closed, so assert
  // on the MODEL as well as the draw — a mark drawn from a null model field would be a lie.
  const state = makeState({ sectorId: TETHYS, playerPos: { x: TETHYS_ORIGIN.x + 700, z: TETHYS_ORIGIN.z - 400 } });
  const galaxy = buildGalaxyModel(state);
  assert.ok(galaxy.player, 'buildGalaxyModel must publish a player mark');
  assert.equal(galaxy.player.x, TETHYS_ORIGIN.x + 700, 'galaxy player x/z stay GLOBAL (ADR D2.1)');
  assert.equal(galaxy.player.z, TETHYS_ORIGIN.z - 400);
  // drawPos is graph units: exactly global / lattice. Getting this wrong puts the ship 4,096x
  // off-chart, which is unmissable — and is why it is asserted rather than eyeballed.
  assert.ok(Math.abs(galaxy.player.drawPos.x - (TETHYS_ORIGIN.x + 700) / SECTOR_ORIGIN_LATTICE_WU) < 1e-9,
    'galaxy player drawPos must be the graph frame (global / lattice)');
  assert.ok(Math.abs(galaxy.player.drawPos.z - (TETHYS_ORIGIN.z - 400) / SECTOR_ORIGIN_LATTICE_WU) < 1e-9);
  ok('buildGalaxyModel publishes a two-frame player mark (global x/z, graph drawPos)');

  const system = buildSystemModel(state, TETHYS);
  assert.ok(system.player, 'buildSystemModel must still publish its player mark');
  assert.equal(system.player.drawPos.x, 700, 'system player drawPos is sector-local');
  assert.equal(system.player.drawPos.z, -400);
  ok('buildSystemModel keeps its sector-local player drawPos at a nonzero-origin sector');
}

{
  const state = makeState({ sectorId: TETHYS, playerPos: { x: TETHYS_ORIGIN.x + 700, z: TETHYS_ORIGIN.z - 400 } });
  mountWith(state);
  // The fix mark's keyline is a specific ink at a specific weight — that pair is what identifies it
  // among every other circle on the chart.
  const FIX_RING_STROKE = 'rgba(237, 232, 216, 0.92)';
  for (const level of ['galaxy', 'system', 'local']) {
    const rec = drawAt(level, state);
    const fixRings = rec.arcs.filter((a) => a.strokeStyle === FIX_RING_STROKE && a.r > 6 && a.r < 14);
    assert.ok(fixRings.length > 0,
      `${level}: the player fix mark must be drawn (no ${FIX_RING_STROKE} ring found among ${rec.arcs.length} arcs)`);
    ok(`the player fix mark is drawn at ${level.toUpperCase()} scale`);
  }
}

// ---------------------------------------------------------------------------------------------
// 2. THE FOUR ANSWERS ARE PRESENT AT EVERY SCALE
// ---------------------------------------------------------------------------------------------

{
  const state = makeState({ sectorId: TETHYS, playerPos: { x: TETHYS_ORIGIN.x + 200, z: TETHYS_ORIGIN.z } });
  mountWith(state);
  for (const level of ['galaxy', 'system', 'local']) {
    const text = textOf(drawAt(level, state));
    for (const label of ['POSITION', 'TRACKING', 'DESTINATION', 'NEXT LEG']) {
      assert.ok(text.includes(label), `${level}: cartouche must answer ${label}; got ${text.slice(0, 400)}`);
    }
    ok(`all four navigation answers are on the glass at ${level.toUpperCase()} scale`);
  }
}

{
  // Deep space is the case the chart used to fail completely: outside every sector disc there was
  // nothing to say, so it said nothing.
  const mid = { x: TETHYS_ORIGIN.x / 2, z: TETHYS_ORIGIN.z / 2 };
  const state = makeState({ sectorId: HELIOS, playerPos: mid });
  mountWith(state);
  const text = textOf(drawAt('system', state));
  assert.ok(/TRANSIT/.test(text), `deep space must render a transit address; got ${text.slice(0, 400)}`);
  assert.ok(/%/.test(text), 'the transit readout must carry progress along the chord');
  ok('deep space renders a transit address with progress, not a blank chart');
}

// ---------------------------------------------------------------------------------------------
// 3. UNAVAILABLE ACTIONS ARE VISIBLY UNAVAILABLE AND SAY WHY
// ---------------------------------------------------------------------------------------------

{
  const state = makeState({ sectorId: HELIOS, playerPos: { x: 100, z: 100 } });
  const { root } = mountWith(state);
  drawAt('system', state);

  const returnBtn = root.querySelector('#gm-return-ship-btn');
  const bothBtn = root.querySelector('#gm-frame-both-btn');
  const reason = root.querySelector('#gm-frame-reason');
  assert.ok(returnBtn && bothBtn && reason, 'both framing controls and their reason line must mount');

  assert.equal(returnBtn.disabled, false, 'with a ship, Return to ship must be usable');
  // Nothing tracked and no route: Frame both cannot do anything, and must SAY so.
  assert.equal(bothBtn.disabled, true, 'with nothing tracked, Frame both must be disabled');
  assert.equal(bothBtn.getAttribute('aria-disabled'), 'true', 'disabled state must reach assistive tech');
  assert.ok(reason.textContent && reason.textContent.length > 0,
    'an unavailable framing control must render a reason, never fail silently');
  assert.match(reason.textContent, /plot a route|track a mission/i,
    'the reason must say what would make the action available');
  ok('Frame both is visibly disabled and explains why when nothing is tracked');

  // Activating a disabled control must refuse, not fake success.
  const moved = galaxyMapScreen._activateFraming('frame-both');
  assert.equal(moved, false, 'activating an unavailable framing action must return false, not pretend');
  ok('activating an unavailable framing action refuses instead of faking success');
}

{
  // Plot a route and the same control must become available, with a reason that names the target.
  const state = makeState({
    sectorId: HELIOS,
    playerPos: { x: 0, z: 0 },
    route: { legs: [{ from: HELIOS, to: TETHYS }] },
    executor: { status: 'acquiring', engaged: true, legIndex: 0, legs: [{ fromSectorId: HELIOS, toSectorId: TETHYS, label: 'Gate → Tethys Junction' }], destinationSectorId: TETHYS },
  });
  const { root } = mountWith(state);
  drawAt('galaxy', state);
  const bothBtn = root.querySelector('#gm-frame-both-btn');
  assert.equal(bothBtn.disabled, false, 'a plotted route must enable Frame ship + destination');
  const text = textOf(galaxyMapScreen._g._rec);
  assert.ok(/Tethys/i.test(text), `the destination must be named on the chart; got ${text.slice(0, 400)}`);
  ok('a plotted route enables Frame both and names the destination on the chart');

  // And it must actually move the camera to contain both ends.
  const before = galaxyMapScreen._camera;
  const applied = galaxyMapScreen._activateFraming('frame-both');
  assert.equal(applied, true, 'an available framing action must apply');
  const after = galaxyMapScreen._camera;
  assert.notEqual(after, before, 'framing must produce a new camera (cameras are frozen)');
  // Midpoint of Helios (0,0) and Tethys origin.
  assert.ok(Math.abs(after.focusGlobal.x - TETHYS_ORIGIN.x / 2) < 1e-6,
    `frameBoth must centre on the midpoint in GLOBAL coords; got ${after.focusGlobal.x}`);
  assert.ok(Math.abs(after.focusGlobal.z - TETHYS_ORIGIN.z / 2) < 1e-6);
  assert.ok(after.spanWU >= TETHYS_ORIGIN.x, 'the span must contain the separation');
  ok('Frame both moves the camera to the global midpoint with a span containing both ends');
}

{
  const state = makeState({ sectorId: TETHYS, playerPos: { x: TETHYS_ORIGIN.x + 1500, z: TETHYS_ORIGIN.z + 900 } });
  mountWith(state);
  drawAt('galaxy', state);
  const applied = galaxyMapScreen._activateFraming('return-to-ship');
  assert.equal(applied, true, 'Return to ship must apply when a ship exists');
  const cam = galaxyMapScreen._camera;
  assert.equal(cam.focusGlobal.x, TETHYS_ORIGIN.x + 1500,
    'Return to ship must focus the ship in the GLOBAL frame, not a sector-local echo of it');
  assert.equal(cam.focusGlobal.z, TETHYS_ORIGIN.z + 900);
  ok('Return to ship focuses the ship globally from a nonzero-origin sector');
}

// ---------------------------------------------------------------------------------------------
// 4. SLICE B — ONE CONTINUOUS CAMERA
// ---------------------------------------------------------------------------------------------

{
  const state = makeState({ sectorId: TETHYS, playerPos: { x: TETHYS_ORIGIN.x + 600, z: TETHYS_ORIGIN.z + 300 } });
  mountWith(state);
  drawAt('system', state);

  // Scale changes preserve focus. This single property is what makes a threshold crossing read as
  // ZOOMING rather than as SWITCHING MAPS (ADR D3), and it is the thing the old three-camera design
  // could not do: each level remembered its own unrelated centre.
  const focusBefore = galaxyMapScreen._camera.focusGlobal;
  const canvas = galaxyMapScreen._canvas;
  let crossings = 0;
  let lastLevel = galaxyMapScreen._activeLevel();
  for (let i = 0; i < 24; i += 1) {
    galaxyMapScreen._onWheel({
      preventDefault() {}, deltaY: 120, clientX: 600, clientY: 410,
    });
    const level = galaxyMapScreen._activeLevel();
    if (level !== lastLevel) { crossings += 1; lastLevel = level; }
  }
  assert.ok(crossings >= 1, 'wheeling out far enough must cross at least one scale threshold');
  const focusAfter = galaxyMapScreen._camera.focusGlobal;
  // Zooming about the exact viewport centre is a pure scale change: the focus cannot move at all.
  assert.ok(Math.abs(focusAfter.x - focusBefore.x) < 1e-6,
    `focus must survive a threshold crossing; ${focusBefore.x} -> ${focusAfter.x}`);
  assert.ok(Math.abs(focusAfter.z - focusBefore.z) < 1e-6);
  ok('focusGlobal survives scale-threshold crossings — scale changes read as zoom, not as a map switch');
  void canvas;
}

{
  const state = makeState({ sectorId: TETHYS, playerPos: { x: TETHYS_ORIGIN.x, z: TETHYS_ORIGIN.z } });
  mountWith(state);
  drawAt('system', state);
  // Cursor-anchored zoom: the world point under the cursor stays under the cursor. Asserted through
  // the SCREEN's own handler, not the module, because the module's own tests already prove the maths
  // — what is unproven until here is that the screen feeds it the right frame.
  const { screenToGlobal } = await import('../src/ui/map/mapCamera.js');
  const viewport = { width: 1200, height: 820 };
  const cursor = { x: 300, y: 240 };
  const worldBefore = screenToGlobal(galaxyMapScreen._camera, cursor, viewport);
  galaxyMapScreen._onWheel({ preventDefault() {}, deltaY: -120, clientX: cursor.x, clientY: cursor.y });
  const worldAfter = screenToGlobal(galaxyMapScreen._camera, cursor, viewport);
  assert.ok(Math.abs(worldAfter.x - worldBefore.x) < 1e-6,
    `cursor anchor drifted in x: ${worldBefore.x} -> ${worldAfter.x}`);
  assert.ok(Math.abs(worldAfter.z - worldBefore.z) < 1e-6,
    `cursor anchor drifted in z: ${worldBefore.z} -> ${worldAfter.z}`);
  // And the zoom must have actually done something. Before this wave `cam.zoom` was never assigned,
  // so wheeling inside a level changed the level scalar but not the drawn scale at all.
  ok('cursor-anchored zoom holds the world point under the pointer, in the global frame');
}

{
  const state = makeState({ sectorId: TETHYS, playerPos: { x: TETHYS_ORIGIN.x, z: TETHYS_ORIGIN.z } });
  mountWith(state);
  drawAt('system', state);
  const spanBefore = galaxyMapScreen._camera.spanWU;
  galaxyMapScreen._onWheel({ preventDefault() {}, deltaY: -120, clientX: 600, clientY: 410 });
  const spanAfter = galaxyMapScreen._camera.spanWU;
  assert.ok(spanAfter < spanBefore,
    `zooming in must shrink the span (${spanBefore} -> ${spanAfter}); a wheel that cannot change scale is the defect this replaces`);
  ok('wheel zoom changes the camera span — scale actually responds within a level');
}

{
  // The framing bookmarks must land inside the level they name, or the scale rail lies.
  const state = makeState({ sectorId: TETHYS, playerPos: { x: TETHYS_ORIGIN.x + 250, z: TETHYS_ORIGIN.z } });
  mountWith(state);
  for (const level of ['local', 'system', 'galaxy']) {
    galaxyMapScreen._setScaleFocus(level, { draw: false, animate: false });
    assert.equal(galaxyMapScreen._activeLevel(), level,
      `the ${level} bookmark must land in the ${level} level`);
  }
  ok('Local / System / Galaxy remain framing bookmarks that land in their own level');
}

{
  // The SYSTEM camera must be handed the sector-local echo of the global focus, never the raw
  // global. This is the exact defect the program exists to fix, relocated into the camera, and it
  // is invisible in Helios — hence Tethys.
  const state = makeState({ sectorId: TETHYS, playerPos: { x: TETHYS_ORIGIN.x + 900, z: TETHYS_ORIGIN.z - 250 } });
  mountWith(state);
  galaxyMapScreen._setScaleFocus('local', { draw: false, animate: false });
  galaxyMapScreen._setScaleFocus('system', { draw: false, animate: false });
  const sysCam = galaxyMapScreen._cams.system;
  const cam = galaxyMapScreen._camera;
  assert.ok(Math.abs(sysCam.cx - (cam.focusGlobal.x - TETHYS_ORIGIN.x)) < 1e-6,
    `system draw camera must be sector-local; cx=${sysCam.cx} focus=${cam.focusGlobal.x}`);
  assert.ok(Math.abs(sysCam.cy - (cam.focusGlobal.z - TETHYS_ORIGIN.z)) < 1e-6);
  assert.ok(Math.abs(sysCam.cx) < 5000,
    'a global position leaked into the system draw frame — the RC-1 defect, relocated to the camera');
  // Galaxy's draw camera is the graph frame: exactly global / lattice.
  galaxyMapScreen._setScaleFocus('galaxy', { draw: false, animate: false });
  const galCam = galaxyMapScreen._cams.galaxy;
  const cam2 = galaxyMapScreen._camera;
  assert.ok(Math.abs(galCam.cx - cam2.focusGlobal.x / SECTOR_ORIGIN_LATTICE_WU) < 1e-9,
    'galaxy draw camera must be the graph frame (global / lattice)');
  ok('each level receives the camera converted into its OWN declared draw frame');
}

// ---------------------------------------------------------------------------------------------
// 5. LABEL DECLUTTERING COVERS THE NEW FURNITURE
// ---------------------------------------------------------------------------------------------

{
  const state = makeState({ sectorId: HELIOS, playerPos: { x: 0, z: 0 } });
  mountWith(state);
  drawAt('galaxy', state);
  const layout = galaxyMapScreen._lastLabelLayout || [];
  const rows = galaxyMapScreen._lastNavContext.rows.length;
  // Reproduce the cartouche rectangle from the same geometry the drawer uses.
  const boxW = Math.min(300, Math.max(212, 1200 * 0.26));
  const boxH = 10 * 2 + rows * 26;
  const box = { x: 14 - 4, y: 820 - boxH - 14 - 4, width: boxW + 8, height: boxH + 8 };
  for (const p of layout) {
    if (!p.visible) continue;
    const overlaps = p.x < box.x + box.width && p.x + (p.width || 0) > box.x
      && p.y < box.y + box.height && p.y + (p.height || 0) > box.y;
    assert.equal(overlaps, false,
      `label "${p.id}" was placed under the navigation cartouche at (${p.x},${p.y})`);
  }
  ok('the existing label declutterer reserves the cartouche — no label is placed underneath it');
}

console.log(`\ncheck:map-never-lost — ${passed} assertions passed`);
