// Board row 239 — FB-006 + FB-007 + FB-012 + FB-014.
//
// FB-006: riding a faster anchor is a named state — a latch to a faster body enters `ride`
// within 0.5 s of taut, the release grades kept speed / anchor speed, the hint speaks once and
// never on a stationary latch.
// FB-007: the drawn stroke is measured and graded (same band names as release rating), the
// live gesture buffer never exceeds 256 points, and the massline HUD model paints the ink.
// FB-012: a wrecking ball is named in adventure flight — one callout, no Crucible score.
// FB-014: a stunt-minted salvage right is announced, claimable once, and kept in the ship
// ledger.
//
// Node only: the sim is proven through the real systems with fake physics/audio seams (the same
// contract the row-229 harness uses); the presentation is proven at its pure model/builders.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  tetherGameplay,
  RIDE_ENTER_S,
  RIDE_SPEED_MARGIN_WU_S,
  rateRelease,
} from '../src/systems/tetherGameplay.js';
import { releaseVerdictCopy, masslineHudInputsUnchanged, resolveDrawFlightInk } from '../src/ui/masslineHud.js';
import { FIRST_USE_LINE } from '../src/ui/hudAttention.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import {
  emptyStrokeGrader,
  gradeStroke,
  gradeStrokeSample,
  STROKE_BAND_MEAN_WU,
} from '../src/core/flight/drawFlightControl.js';
import { followDrawFlightPath } from '../src/combat/drawFlightPath.js';
import {
  DRAW_GESTURE_MAX_POINTS,
  recordDrawFlightGesture,
} from '../src/systems/drawFlightInput.js';
import {
  calloutNow,
  calloutTextFor,
  createStuntCallout,
} from '../src/ui/stuntCallout.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import { buildShipLedger } from '../src/systems/shipLedger.js';
import { validateShipLedgerTemplates } from '../src/data/shipLedgerTemplates.js';

const DT = 1 / 60;

// ── shared stubs ───────────────────────────────────────────────────────────────────────────────

function entity(id, type, x, z, overrides = {}) {
  return {
    id, type, alive: true, collides: true, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0,
    thrust: 0, brake: false, maxSpeed: 120, radius: 8, mass: 50, hull: 100, hullMax: 100,
    team: 2, data: {}, ...overrides,
  };
}

/** A taut-aware fake physics: the mirror's phase comes from the live separation vs restLength.
 * The attachment authority assigns its own id, so the spec (not the id) is the identity. */
function ridePhysics(h) {
  return {
    createAttachment(spec) {
      h.spec = structuredClone(spec);
      return { id: spec.attachmentId };
    },
    cutAttachment() { return true; },
    getAttachmentTelemetry({ attachmentId } = {}) {
      if (!h.spec || attachmentId !== h.spec.attachmentId) {
        return { tension: 0, impulse: 0, yank: 0, phase: 'slack' };
      }
      const a = h.state.entities.get(h.spec.ownerId);
      const b = h.state.entities.get(h.spec.targetId);
      const dist = a && b ? Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) : 0;
      const rest = h.spec.restLength || 1;
      const phase = dist >= rest ? 'loaded' : dist >= rest * 0.8 ? 'capture' : 'slack';
      return { tension: 0, impulse: 0, yank: 0, phase, distance: dist, relativeSpeed: 0, stretch: 0 };
    },
    setAttachmentReel() { return true; },
  };
}

function rideHarness({ anchorVel = { x: 0, z: 0 }, playerVel = { x: 0, z: 0 }, gap = 90 } = {}) {
  const player = entity(1, 'ship', 0, 0, {
    team: 0, vel: { ...playerVel }, physicsBody: { dynamic: true, mass: 40 }, data: { derived: {} },
  });
  const liner = entity(2, 'ship', gap, 0, {
    team: 1, mass: 30, vel: { ...anchorVel }, data: { name: 'Express Liner' },
    physicsBody: { dynamic: true, mass: 30 },
  });
  const entities = new Map([[player.id, player], [liner.id, liner]]);
  const state = {
    mode: 'flight',
    tick: 4242,
    simTime: 5,
    playerId: player.id,
    player: {},
    input: {
      aimWorld: { ...liner.pos }, aimAngle: 0, turnIntent: 0, moveX: 0, moveZ: 0,
      actions: {}, tetherMode: null,
    },
    runtime: { features: {} },
    world: { currentSectorId: 'sector_test' },
    entities,
    entityList: [...entities.values()],
  };
  const events = [];
  const listeners = new Map();
  const bus = {
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    emit(type, payload) {
      events.push({ type, payload });
      for (const fn of listeners.get(type) || []) fn(payload);
    },
  };
  const physics = ridePhysics({ state });
  ensureCombatState(state);
  const catalog = createCombatCatalog();
  const attachments = createAttachmentService({ state, catalog, helpers: { combatPhysics: physics }, bus });
  const registry = { get(id) { return id === 'actions' ? { kernel: { attachments, catalog } } : null; } };
  const system = Object.create(tetherGameplay);
  system.init({ state, bus, helpers: { combatPhysics: physics }, registry });
  return { state, player, liner, events, bus, system };
}

function stepTether(h, { aim = null, latch = false, cut = false } = {}) {
  h.state.tick += 1;
  h.state.simTime += DT;
  h.state.input.aimIntentActive = !!aim;
  if (aim) {
    h.state.input.aimWorld.x = aim.x;
    h.state.input.aimWorld.z = aim.z;
  }
  h.state.input.actions = {
    tetherFire: latch, tetherCut: cut,
    massline: latch || cut ? { latch, cut, lineControl: false, lineLength: 0 } : null,
  };
  h.state.input.tetherMode = null;
  h.system.update(DT, h.state);
}

const count = (events, type) => events.filter((e) => e.type === type).length;

// ── FB-006 — the ride is a named state ─────────────────────────────────────────────────────────

test('FB-006: a latch to a faster anchor enters ride within 0.5 s of taut, and speaks once', () => {
  const h = rideHarness({ anchorVel: { x: 80, z: 0 }, playerVel: { x: 20, z: 0 } });
  stepTether(h, { aim: h.liner.pos });
  stepTether(h, { aim: h.liner.pos, latch: true });
  stepTether(h); // the tick after the press paints the active mirror
  assert.ok(h.state.player.tether.active, 'the line latched to the liner');

  // The mirror has run; taut + faster begins the ride window. 0.5 s of continuous advantage
  // must name the ride by the very next tick after the window — within 0.5 s of taut, not 1 s.
  const tautTick = h.state.tick;
  let enteredAt = null;
  for (let i = 0; i < Math.ceil(RIDE_ENTER_S / DT) + 2; i += 1) {
    stepTether(h);
    if (h.state.player.tether.ride && h.state.player.tether.ride.active) { enteredAt = h.state.tick; break; }
  }
  assert.ok(enteredAt, 'the ride state is published on the tether mirror');
  assert.ok((enteredAt - tautTick) * DT <= RIDE_ENTER_S + DT + 1e-9,
    `ride entered ${(enteredAt - tautTick) * DT}s after taut`);
  assert.equal(h.state.player.tether.ride.anchorId, h.liner.id);
  assert.ok(h.state.player.tether.ride.anchorSpeed > h.state.player.tether.ride.playerSpeed + RIDE_SPEED_MARGIN_WU_S - 1e-9,
    'the ride measured the anchor outpacing the player');

  assert.equal(count(h.events, 'massline:rideStarted'), 1, 'the ride start is one receipt');
  const lines = h.events.filter((e) => e.type === 'hud:firstUse' && e.payload.verbId === 'masslineHitchhiking');
  assert.equal(lines.length, 1, 'exactly one first-use hint, on the ride');
  assert.equal(lines[0].payload.text, FIRST_USE_LINE.masslineHitchhiking);
  assert.equal(h.state.player.hints.masslineHitchhiking, true, 'the once-only store is marked');
});

test('FB-006: a release out of the ride grades kept speed over anchor speed', () => {
  const h = rideHarness({ anchorVel: { x: 80, z: 0 }, playerVel: { x: 20, z: 0 } });
  stepTether(h, { aim: h.liner.pos });
  stepTether(h, { aim: h.liner.pos, latch: true });
  stepTether(h);
  for (let i = 0; i < 40; i += 1) stepTether(h);
  assert.ok(h.state.player.tether.ride && h.state.player.tether.ride.active, 'riding');

  stepTether(h, { cut: true });
  const rated = h.events.filter((e) => e.type === 'tether:releaseRated');
  assert.ok(rated.length >= 1, 'the release was rated');
  const rideGrade = rated.map((e) => e.payload.ride).find(Boolean);
  assert.ok(rideGrade, 'the rating carries the ride grade');
  assert.ok(rideGrade.keptFraction > 0 && rideGrade.keptFraction < 1,
    `kept fraction is a real share, got ${rideGrade.keptFraction}`);
  assert.ok(Math.abs(rideGrade.keptFraction - 0.25) < 0.05,
    '20 of 80 wu/s kept reads as ~25%');
  assert.equal(rideGrade.anchorSpeed, 80);
  assert.equal(
    releaseVerdictCopy({ classification: 'clean', ride: rideGrade }),
    'CLEAN · KEPT 25%',
    'the verdict pill names the kept share',
  );
  // The generic grammar still answers for non-ride releases.
  assert.equal(releaseVerdictCopy({ classification: 'razor', releasedAtApex: true }), 'RAZOR · AT THE APEX');
});

test('FB-006: a stationary latch never rides and never speaks', () => {
  const h = rideHarness({ anchorVel: { x: 0, z: 0 }, playerVel: { x: 0, z: 0 } });
  stepTether(h, { aim: h.liner.pos });
  stepTether(h, { aim: h.liner.pos, latch: true });
  stepTether(h);
  for (let i = 0; i < 90; i += 1) stepTether(h);
  assert.ok(h.state.player.tether.active, 'the latch itself still works');
  assert.equal(h.state.player.tether.ride ?? null, null, 'no ride state without a faster anchor');
  assert.equal(count(h.events, 'massline:rideStarted'), 0);
  assert.equal(count(h.events, 'hud:firstUse'), 0, 'the hint is not fired on a stationary latch');
});

test('FB-006: the RIDE chip is inside the HUD signature, so the DOM repaints with the ride', () => {
  const state = {
    mode: 'flight', tick: 10, simTime: 1, playerId: 1, meta: { seed: 4242 },
    player: { tether: { active: true, targetId: 2, strain: 0.3, phase: 'loaded', ride: { active: true, speedGained: 4, anchorSpeed: 80 } } },
    massline2: {}, camera: { zoom: 1, tilt: 0 }, input: {},
    settings: { video: {}, accessibility: {} },
    entities: new Map([[1, entity(1, 'ship', 0, 0)], [2, entity(2, 'ship', 90, 0)]]),
    entityList: [],
  };
  assert.equal(masslineHudInputsUnchanged(state, state.entities.get(1)), false, 'first paint');
  assert.equal(masslineHudInputsUnchanged(state, state.entities.get(1)), true, 'a held ride is quiet');
  state.player.tether.ride.speedGained = 7;
  assert.equal(masslineHudInputsUnchanged(state, state.entities.get(1)), false,
    'the chip repaints when the gained speed moves a step');
  state.player.tether.ride = null;
  assert.equal(masslineHudInputsUnchanged(state, state.entities.get(1)), false,
    'the chip repaints when the ride ends');
});

// ── FB-007 — the drawn stroke is measured, graded and painted ──────────────────────────────────

function strokeRoute(points) {
  return { active: true, drawing: true, cursorX: 0, cursorY: 0, pointIndex: 1, points };
}

function twelvePointStroke() {
  // 12 authored samples, 20 wu apart, straight down +x. A ship riding the line perfectly is a
  // razor by construction.
  const points = [];
  for (let i = 0; i < 12; i += 1) points.push({ x: i * 20, z: 0 });
  return points;
}

function flyStroke(points, { speed = 60 } = {}) {
  const route = strokeRoute(structuredClone(points));
  const player = entity(1, 'ship', points[0].x, points[0].z, { vel: { x: speed, z: 0 } });
  const runtime = {};
  const profile = { combatSpeed: 120, maxSpeed: 120, maxYawRate: 3, mainAccel: 80 };
  for (let tick = 0; tick < 1200; tick += 1) {
    const command = followDrawFlightPath(route, player, runtime, profile, DT);
    if (!command) break;
    // The scripted pilot rides the ink exactly: deterministic cross-track ~0.
    player.pos.x += player.vel.x * DT;
    player.pos.z += player.vel.z * DT;
    if (command.exhausted) break;
  }
  return route;
}

test('FB-007: a scripted 12-point stroke yields a deterministic error band', () => {
  const points = twelvePointStroke();
  const first = flyStroke(points);
  const second = flyStroke(points);
  assert.ok(first.stroke && first.stroke.band, 'the completed stroke carries a band');
  assert.deepEqual(first.stroke, second.stroke, 'the grade is deterministic on the same script');
  assert.equal(first.stroke.band, 'razor', 'a perfect ride of the ink is razor');
  assert.ok(first.stroke.distanceWu > 200, `the stroke measured its distance, got ${first.stroke.distanceWu}`);
  assert.ok(first.stroke.peakSpeed >= 60 - 1e-6, 'the record keeps the peak speed');
});

test('FB-007: the band law is the release-rating vocabulary, pure and thresholded', () => {
  const perfect = gradeStroke({ ...emptyStrokeGrader(), samples: 60, timeOnPathS: 1, errorSumWu: 3 });
  const sloppy = gradeStroke({ ...emptyStrokeGrader(), samples: 60, timeOnPathS: 1, errorSumWu: 10 });
  const wild = gradeStroke({ ...emptyStrokeGrader(), samples: 60, timeOnPathS: 1, errorSumWu: 20 });
  const lost = gradeStroke({ ...emptyStrokeGrader(), samples: 60, timeOnPathS: 1, errorSumWu: 120 });
  assert.equal(perfect.band, 'razor');
  assert.equal(sloppy.band, 'clean');
  assert.equal(wild.band, 'good');
  assert.equal(lost.band, 'messy');
  assert.equal(gradeStroke(emptyStrokeGrader()).band, 'razor', 'an untouched grader grades nothing harshly');
  assert.ok(STROKE_BAND_MEAN_WU.razor < STROKE_BAND_MEAN_WU.clean
    && STROKE_BAND_MEAN_WU.clean < STROKE_BAND_MEAN_WU.good);
  // gradeStrokeSample accumulates honestly: one wild sample peaks; a stroke of clean ticks
  // still owns the mean.
  const g = emptyStrokeGrader();
  gradeStrokeSample(g, 0, 40, DT);
  gradeStrokeSample(g, 50, 40, DT);
  for (let i = 0; i < 60; i += 1) gradeStrokeSample(g, 0, 40, DT);
  assert.equal(gradeStroke(g).peakErrorWu, 50);
  assert.ok(gradeStroke(g).meanErrorWu < 1, 'a one-tick spike does not own the mean');
});

test('FB-007: the live gesture buffer never exceeds 256 points', () => {
  const player = entity(1, 'ship', 0, 0);
  const host = {
    state: {
      input: { autoFire: true },
      entities: new Map([[1, player]]),
      playerId: 1,
    },
    helpers: {
      // Called both with an out param (the world probe) and without (the pen projection).
      worldToScreen: (p, out) => {
        const r = { x: 400 + p.x, y: 300 - p.z, onScreen: true };
        if (out) { out.x = r.x; out.y = r.y; out.onScreen = true; return out; }
        return r;
      },
      raycastToPlane: (ndc, out) => {
        out.x = (ndc.x - 0.5) * 200;
        out.z = (0.5 - ndc.y) * 200;
        return out;
      },
    },
  };
  host.state.input.autoTargetPath = null;
  let drew = false;
  for (let i = 0; i < 400; i += 1) {
    drew = recordDrawFlightGesture(host, 12, 0, i * 16, 800, 600) || drew;
    const route = host.state.input.autoTargetPath;
    if (route) {
      assert.ok(route.points.length <= DRAW_GESTURE_MAX_POINTS,
        `the buffer hit ${route.points.length} points`);
    }
  }
  assert.ok(drew, 'the scripted stroke drew');
  assert.ok(host.state.input.autoTargetPath.points.length > 1);
});

test('FB-007: the massline HUD model paints the ink and rolls its signature with it', () => {
  const points = twelvePointStroke();
  const flown = flyStroke(points);
  const state = {
    mode: 'flight', tick: 10, simTime: 100, playerId: 1, meta: { seed: 4242 },
    player: {}, massline2: {}, camera: { zoom: 1, tilt: 0 },
    input: { autoTargetPath: flown }, settings: { video: {}, accessibility: {} },
    entities: new Map([[1, entity(1, 'ship', 0, 0)]]),
    entityList: [],
  };
  const ink = resolveDrawFlightInk(state);
  assert.ok(ink, 'a live stroke paints');
  assert.equal(ink.points, points.length);
  assert.ok(ink.ahead.length >= 1, 'there is ink ahead');
  assert.ok(ink.flown.length >= 1, 'there is a flown trace');
  assert.equal(ink.stroke.band, 'razor');
  assert.equal(ink.fade, 1, 'a completed stroke starts its fade at full ink');
  // A drawn stroke must leave the HUD quiescent path: the signature rolls when it appears.
  const player = state.entities.get(1);
  assert.equal(masslineHudInputsUnchanged(state, player), false, 'first paint with ink');
  assert.equal(masslineHudInputsUnchanged(state, player), true, 'a held stroke is quiet');
  state.masslineInk = { fadeStart: 100 };
  state.simTime = 100.25;
  assert.equal(masslineHudInputsUnchanged(state, player), false, 'the fade repaints in visible steps');
  state.input.autoTargetPath.active = false;
  assert.equal(resolveDrawFlightInk(state), null, 'a dead route paints nothing');
});

// ── FB-012 — adventure names the act ───────────────────────────────────────────────────────────

function fakeElement(tag) {
  const el = {
    tag, children: [], attributes: {}, className: '', textContent: '', hidden: false,
    parentNode: null,
    classList: {
      add(...names) { for (const n of names) if (!el._classes.has(n)) el._classes.add(n); },
      remove(...names) { for (const n of names) el._classes.delete(n); },
      contains(name) { return el._classes.has(name); },
      toggle(name, on) { const want = on === undefined ? !el._classes.has(name) : !!on; if (want) el._classes.add(name); else el._classes.delete(name); return want; },
    },
    _classes: new Set(),
    style: { setProperty(name, value) { el._styles[name] = String(value); }, removeProperty() {}, display: '', left: '' },
    _styles: {},
    setAttribute(name, value) { el.attributes[name] = String(value); },
    appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
    removeChild(child) { el.children = el.children.filter((c) => c !== child); child.parentNode = null; return child; },
  };
  return el;
}

function fakeDocument() {
  const doc = { head: fakeElement('head'), body: fakeElement('body'), documentElement: fakeElement('html') };
  doc.getElementById = () => null;
  doc.createElement = (tag) => fakeElement(tag);
  return doc;
}

function fakeBus() {
  const handlers = new Map();
  return {
    on(event, cb) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(cb);
      return () => handlers.get(event)?.delete(cb);
    },
    emit(event, payload) { for (const cb of handlers.get(event) || []) cb(payload); },
  };
}

function wreckingBall(over = {}) {
  return {
    schemaVersion: 2, actorId: 1, trickId: 'wrecking_ball', name: 'Wrecking Ball',
    rarity: 'uncommon', family: 'tether', episodeId: over.episodeId ?? 'ep1', tick: 600,
    modifiers: { razorRelease: null, collateralCount: 1, closeShave: false },
    victimLives: [{ lifeId: 'v1', threatClass: 'boss', dead: true }],
    metrics: { payloadMass: 20, playerDryHullMass: 20, usefulDeltaV: 0, referenceCruise: 100 },
    ...over,
  };
}

function adventureState(over = {}) {
  return {
    run: null, mode: 'flight', ui: { screenStack: [] }, tick: 600, playerId: 1,
    stunts: null, settings: { video: { motionReduce: false } }, ...over,
  };
}

test('FB-012: a wrecking ball outside a run is named once; an ordinary kill is not named', () => {
  const state = adventureState();
  const bus = fakeBus();
  const owner = createStuntCallout({ state, bus, doc: fakeDocument() });
  bus.emit('stunt:trickDetected', wreckingBall());
  assert.equal(owner.update(0), true, 'adventure keeps the frame alive while a name is up');
  assert.ok(!owner.root.hidden, 'the callout is up in adventure');
  const text = calloutTextFor(owner.root);
  assert.match(text, /Wrecking Ball/, 'the act is named');
  assert.doesNotMatch(text, /×\d\.\d\d/, 'no Crucible multiplier in adventure');
  assert.doesNotMatch(text, /Banked/, 'no Crucible bank in adventure');

  // An ordinary kill is not a named act: no stunt:trickDetected, no callout.
  const linesBefore = owner.root.children[0].children.length;
  bus.emit('combat:kill', { id: 9, killerId: 1 });
  bus.emit('entity:killed', { id: 9, killerId: 1 });
  owner.update(calloutNow() + 1);
  assert.equal(owner.root.children[0].children.length, linesBefore, 'the ordinary kill named nothing');

  // The same episode amends; it does not stack a second line.
  bus.emit('stunt:trickAmended', wreckingBall({ tick: 660 }));
  owner.update(calloutNow() + 2);
  assert.ok(calloutTextFor(owner.root).includes('Wrecking Ball'));
});

test('FB-012: the flight HUD path mounts the layer and releases it with the HUD', () => {
  const hudSource = readFileSync(fileURLToPath(new URL('../src/ui/hud.js', import.meta.url)), 'utf8');
  assert.match(hudSource, /ensureStuntCallout\(\{ state, bus: ctx\.bus \}\)/,
    'createHud mounts the stunt callout layer');
  assert.match(hudSource, /releaseStuntCallout\(\)/,
    'the HUD destroy releases the mount');
  // And the module export pair exists for that mount to call.
  const calloutSource = readFileSync(
    fileURLToPath(new URL('../src/ui/stuntCallout.js', import.meta.url)), 'utf8');
  assert.match(calloutSource, /export function ensureStuntCallout/);
  assert.match(calloutSource, /export function releaseStuntCallout/);
});

// ── FB-014 — salvage rights are heard and kept ─────────────────────────────────────────────────

function rightsHarness() {
  const state = {
    tick: 4242, mode: 'flight', playerId: 1, run: null, player: {},
    entities: new Map([[1, entity(1, 'ship', 10, 20, { data: { shipName: 'Tessera' } })]]),
  };
  const events = [];
  const bus = fakeBus();
  bus.on('*', (e) => events.push(e));
  const g = Object.create(stuntGrammar);
  g.state = state;
  g.bus = bus;
  return { state, bus, events, g };
}

const RIGHTS_TRICK = {
  schemaVersion: 2, trickId: 'wrecking_ball', name: 'Wrecking Ball', rarity: 'uncommon',
  episodeId: 'ep-4242', tick: 4242, modifiers: {},
};

test('FB-014: a rights mint is announced once and kept as a durable receipt', () => {
  const { state, bus, g } = rightsHarness();
  const mints = [];
  bus.on('stunt:salvageRights', (p) => mints.push(p));
  const drops = [];
  bus.on('loot:drop', (p) => drops.push(p));
  const st = { combo: { banks: [] }, pay: { credits: 0, reputation: 0, salvageRights: 0 } };
  g._payTrick(st, RIGHTS_TRICK, null, state.tick);

  assert.equal(mints.length, 1, 'exactly one mint announcement');
  assert.ok(mints[0].salvageRights > 0, 'the right has a size');
  assert.equal(mints[0].trickId, 'wrecking_ball');
  const log = state.player.salvageRightsLog;
  assert.equal(log.length, 1, 'exactly one durable receipt');
  assert.equal(log[0].kind, 'mint');
  assert.equal(log[0].amount, mints[0].salvageRights);
  assert.equal(drops.length, 1, 'the claim chit drops at the contact site');
  assert.equal(drops[0].items[0].salvageRights, mints[0].salvageRights);
});

test('FB-014: claiming is once-only, confirmed, and kept in the ledger projection', () => {
  const { state, bus, g } = rightsHarness();
  const claims = [];
  bus.on('stunt:salvageRightsClaimed', (p) => claims.push(p));
  const amount = 2;
  // A mint that already happened earlier in the session (the durable receipt from FB-014's
  // mint path), plus the claim this test drives.
  state.player.salvageRightsLog = [{
    id: 'srmint:ep-4242:4240', kind: 'mint', at: 4240, amount,
    trickId: 'wrecking_ball', name: 'Wrecking Ball', episodeId: 'ep-4242', rarity: 'uncommon',
  }];
  state.entities.set(9, { id: 9, type: 'pickup', alive: true, pos: { x: 0, z: 0 }, data: { kind: 'salvage_rights', salvageRights: amount } });
  const payload = { collectorId: 1, pickupId: 9 };

  g._collectRightsChit(payload);
  assert.equal(state.player.salvageRights, amount, 'the balance was credited');
  assert.equal(claims.length, 1, 'exactly one claim confirm');
  assert.equal(state.player.salvageRightsLog.filter((r) => r.kind === 'claim').length, 1,
    'exactly one claim receipt');

  // A save/load relay or a double scoop cannot pay twice.
  g._collectRightsChit(payload);
  assert.equal(state.player.salvageRights, amount, 'the once-only claim boundary held');
  assert.equal(claims.length, 1);

  // The ledger projects both receipts, once each, on seed 4242.
  const ledger = buildShipLedger({
    meta: { seed: 4242 },
    player: state.player,
    playerId: 1,
    entities: state.entities,
    story: {},
  });
  const rows = ledger.entries ? ledger.entries.filter((e) => e.type === 'salvage') : [];
  assert.ok(rows.length >= 2, `the ledger keeps the mint and the claim, got ${rows.length}`);
  const ids = new Set(rows.map((r) => r.sourceId));
  assert.equal(ids.size, rows.length, 'no doubled ledger rows');
  assert.ok(rows.every((r) => Number(r.tokens.rights) > 0), 'each row carries its chit count');
  assert.ok(validateShipLedgerTemplates().ok, 'the salvage prose bank validates');
});

test('FB-014: the four economy events are heard by the callout layer', () => {
  const state = adventureState();
  const bus = fakeBus();
  const owner = createStuntCallout({ state, bus, doc: fakeDocument() });
  bus.emit('stunt:salvageRights', { salvageRights: 2, trickId: 'wrecking_ball', name: 'Wrecking Ball', episodeId: 'ep1', tick: 600 });
  owner.update(0);
  assert.match(calloutTextFor(owner.root), /SALVAGE RIGHT · Wrecking Ball/, 'the mint is named');
  assert.match(calloutTextFor(owner.root), /\+2/, 'with its size');

  bus.emit('stunt:salvageRightsClaimed', { salvageRights: 2, pickupId: 9, tick: 620 });
  owner.update(calloutNow() + 1);
  assert.match(calloutTextFor(owner.root), /RIGHTS CLAIMED/, 'the claim confirms');

  bus.emit('stunt:lineContractCompleted', { contractId: 'ghost_run', name: 'Ghost Run', trickId: 'wrecking_ball', tick: 640 });
  owner.update(calloutNow() + 2);
  assert.match(calloutTextFor(owner.root), /LINE CONTRACT · Ghost Run/, 'the completed contract is named');

  bus.emit('stunt:bridge', { trickId: 'near_miss', name: 'Close Shave', tick: 660 });
  owner.update(calloutNow() + 3);
  assert.match(calloutTextFor(owner.root), /BRIDGE · Close Shave/, 'the bridge tick speaks in adventure');
  owner.destroy();
});

test('FB-014: in a run the bridge stays on the meter, not doubled as a line', () => {
  const combo = { banks: [], acts: [] };
  const state = adventureState({ run: { kind: 'survival', phase: 'active' }, stunts: { combo } });
  const bus = fakeBus();
  const owner = createStuntCallout({ state, bus, doc: fakeDocument() });
  bus.emit('stunt:bridge', { trickId: 'near_miss', name: 'Close Shave', tick: 660 });
  owner.update(0);
  assert.equal(owner.root.hidden, true, 'no line for a bridge the run meter already carries');
  owner.destroy();
});
