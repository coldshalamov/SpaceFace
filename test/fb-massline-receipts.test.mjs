// Board row 229 — FB-009 + FB-010 + FB-013.
//
// FB-009: the signature verb's thirteen receipts reach the picture and the pad. Every event the
// Massline emits has exactly one recipe row, a scripted bridle setup→link→cut produces exactly
// one record per edge, and a payload that names no live body fabricates nothing.
// FB-010: the transverse snare and the mass seed have voices — deploy a seed, let it lock, warn
// and collapse: the authored recipes play in order and silence follows; snare arm/cut produce two.
// FB-013: the tractor, frame coupler, monofilament sweep and elastic whip announce themselves —
// a status row per head and exactly one first-use line on the head's defining event.
//
// Node only. The picture is proven at the recipe/resolver seam (the same contract the live
// renderer consumes); the ear is proven through the real audioSystem subscriptions with playback
// mocked at the play() seam; the pad is proven through the real createGamepad pulse gate.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADDITIONAL_ACTION_VFX_RECIPES,
  resolveAdditionalActionVfxReceipt,
} from '../src/render/vfx/actionEventRecipes.js';
import { RECIPES } from '../src/data/audioRecipes.js';
import { audio } from '../src/audio/audioSystem.js';
import { HAPTIC_VERB_PULSES, createGamepad } from '../src/systems/gamepad.js';
import { createBus } from '../src/core/eventBus.js';
import { masslineTetherStatus } from '../src/ui/hud.js';
import { FIRST_USE_LINE } from '../src/ui/hudAttention.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import {
  tetherGameplay,
  TWIN_BRIDLE_HEAD_ID,
} from '../src/systems/tetherGameplay.js';

const DT = 1 / 60;

// FB-009 — the thirteen events, verbatim from the packet's gap list.
const THIRTEEN_EVENTS = [
  'massline:bridleLinked',
  'massline:bridleCut',
  'massline:bridleEnded',
  'massline:bridleEndpointSelected',
  'massline:bridleSetupEnded',
  'massline:cadenceChanged',
  'massline:npcCounterplay',
  'massline:npcLineCut',
  'massline:playerLineCut',
  'chain:tetherShare',
  'tether:whipSnap',
  'tether:rebound',
  'web:linked',
];

test('FB-009: all thirteen events have exactly one designed recipe row', () => {
  for (const name of THIRTEEN_EVENTS) {
    const row = ADDITIONAL_ACTION_VFX_RECIPES[name];
    assert.ok(row, `${name} has a recipe row`);
    assert.ok(row.verb, `${name} names its verb`);
    assert.ok(row.primitive, `${name} names its primitive`);
    assert.ok(Number.isFinite(row.life) && row.life > 0, `${name} has a lifetime`);
  }
});

// Emitter-shaped payloads over one scripted seed-4242 state. Each entry is [event, payload()];
// the bodies referenced are alive, so each receipt must resolve to a real anchor exactly once.
function receiptState() {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, radius: 8,
    pos: { x: 0, z: 0 }, vel: { x: 10, z: 0 }, rot: 0, data: {},
  };
  const raider = {
    id: 2, type: 'ship', alive: true, team: 1, radius: 8,
    pos: { x: 120, z: 0 }, vel: { x: -20, z: 0 }, rot: Math.PI, data: { name: 'Raider' },
  };
  const other = {
    id: 3, type: 'ship', alive: true, team: 1, radius: 8,
    pos: { x: 220, z: 40 }, vel: { x: 0, z: 0 }, rot: 0, data: {},
  };
  const state = {
    mode: 'flight',
    tick: 4242,
    simTime: 70.7,
    playerId: player.id,
    meta: { seed: 4242 },
    player: {},
    entities: new Map([[player.id, player], [raider.id, raider], [other.id, other]]),
    entityList: [player, raider, other],
  };
  return { state, player, raider, other };
}

function receiptPayloads({ player, raider, other }) {
  return new Map([
    ['massline:bridleLinked', () => ({ attachmentId: 'att1', sourceId: raider.id, targetId: other.id })],
    ['massline:bridleCut', () => ({ attachmentId: 'att1', sourceId: raider.id, targetId: other.id })],
    ['massline:bridleEnded', () => ({ attachmentId: 'att1', reason: 'endpoint_lost' })],
    ['massline:bridleEndpointSelected', () => ({ endpoint: 'A', sourceId: raider.id, selectionReceiptId: 'r1', expiresAt: 99 })],
    ['massline:bridleSetupEnded', () => ({ sourceId: raider.id, reason: 'player_cancel' })],
    ['massline:cadenceChanged', () => ({ sourceId: player.id, targetId: raider.id, attachmentId: 'att1', phase: 'loaded', tick: 4242 })],
    ['massline:npcCounterplay', () => ({ schemaVersion: 1, verb: 'cut_bridle', role: 'specialist', actorId: raider.id, attachmentId: 'att1', reason: 'specialist_cut', tick: 4242 })],
    ['massline:npcLineCut', () => ({ schemaVersion: 1, headId: 'monofilament_sweep', bladeId: 'att2', attachmentId: 'att9', ownerId: raider.id, targetId: other.id, integrity: 0.8, contact: { x: 60, z: 0 } })],
    ['massline:playerLineCut', () => ({ schemaVersion: 1, headId: 'monofilament_sweep', bladeId: 'att3', attachmentId: 'att1', cutterId: raider.id, ownerId: player.id, targetId: other.id, integrity: 0.6 })],
    ['chain:tetherShare', () => ({ schemaVersion: 1, kind: 'twin_bridle', attachmentId: 'att1', fromId: raider.id, toId: other.id, sourceShare: 0.5, targetShare: 0.5, tick: 4242 })],
    ['tether:whipSnap', () => ({ targetId: raider.id, storedEnergy: 1200, strainGlow: 0.7 })],
    ['tether:rebound', () => ({ actorId: player.id, attachmentId: 'att1', ownerId: player.id, targetId: raider.id, controllerId: player.id })],
    ['web:linked', () => ({ ownerId: player.id, targetId: raider.id, links: 1 })],
  ]);
}

test('FB-009: each edge resolves to exactly one receipt anchor on the seed-4242 script', () => {
  const ctx = receiptState();
  for (const [name, makePayload] of receiptPayloads(ctx)) {
    const payload = makePayload();
    const record = resolveAdditionalActionVfxReceipt(name, payload, ctx.state);
    assert.ok(record, `${name} resolves to a receipt`);
    const anchored = Number.isFinite(record.pos?.x) && Number.isFinite(record.pos?.z)
      || record.targetId != null || record.sourceId != null;
    assert.ok(anchored, `${name} carries an honest anchor`);
    // One record per edge: a second resolution of the same receipt is the same record, never a
    // second invention (the renderer's slot gate dedupes presentation).
    const again = resolveAdditionalActionVfxReceipt(name, payload, ctx.state);
    assert.deepEqual(again, record, `${name} resolves deterministically`);
  }
});

test('FB-009: a recipe never fires for an event whose bodies are gone', () => {
  const ctx = receiptState();
  for (const [name, makePayload] of receiptPayloads(ctx)) {
    const payload = makePayload();
    const dead = structuredClone(ctx.state);
    for (const entry of dead.entities.values()) {
      entry.alive = false;
      delete entry.pos;
    }
    const resolved = resolveAdditionalActionVfxReceipt(name, payload, dead);
    if (name === 'massline:npcLineCut') {
      // The authored contact point IS the receipt (the pds:intercept rule): a severed line's
      // point is a fact that outlives the bodies, so it still anchors there.
      assert.ok(resolved, `${name} keeps its authored contact point`);
      assert.deepEqual(resolved.pos, { x: 60, z: 0 });
    } else {
      assert.equal(resolved, null, `${name} fabricates nothing with no live body`);
    }
  }
});

// ── the bridle script: setup → link → cut through the real owner, one record per edge ──

function fakePhysics() {
  return {
    creates: [],
    cuts: [],
    createAttachment(spec) {
      this.creates.push(structuredClone(spec));
      return { id: `joint_${this.creates.length}` };
    },
    cutAttachment(spec) {
      this.cuts.push(structuredClone(spec));
      return true;
    },
    getAttachmentTelemetry() {
      return { tension: 0, impulse: 0, yank: 0, phase: 'slack' };
    },
    setAttachmentReel() { return true; },
  };
}

function entity(id, type, x, z, overrides = {}) {
  return {
    id, type, alive: true, collides: true, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0,
    thrust: 0, brake: false, maxSpeed: 120, radius: 8, mass: 50, hull: 100, hullMax: 100,
    team: 2, data: {}, ...overrides,
  };
}

function bridleHarness() {
  const player = entity(1, 'ship', 0, 0, {
    team: 0,
    data: { derived: { masslineHeadId: TWIN_BRIDLE_HEAD_ID } },
    physicsBody: { dynamic: true, mass: 40 },
  });
  const source = entity(2, 'ship', 90, 0, { team: 1, mass: 16, vel: { x: 80, z: 0 }, physicsBody: { dynamic: true, mass: 16 } });
  const target = entity(3, 'ship', 150, 40, { team: 1, mass: 16, vel: { x: -80, z: 0 }, physicsBody: { dynamic: true, mass: 16 } });
  const entities = new Map([[player.id, player], [source.id, source], [target.id, target]]);
  const state = {
    mode: 'flight',
    tick: 100,
    simTime: 5,
    playerId: player.id,
    player: {},
    input: {
      aimWorld: { ...source.pos }, aimAngle: 0, turnIntent: 0, moveX: 0, moveZ: 0,
      actions: {}, tetherMode: null,
    },
    runtime: { features: PRODUCTION_FEATURES },
    world: { currentSectorId: 'sector_test' },
    entities,
    entityList: [...entities.values()],
  };
  ensureCombatState(state);
  const catalog = createCombatCatalog();
  const physics = fakePhysics();
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
  const attachments = createAttachmentService({ state, catalog, helpers: { combatPhysics: physics }, bus });
  const registry = { get(id) { return id === 'actions' ? { kernel: { attachments, catalog } } : null; } };
  const system = Object.create(tetherGameplay);
  system.init({ state, bus, helpers: { combatPhysics: physics }, registry });
  return { state, player, source, target, events, bus, attachments, system };
}

function stepBridle(h, { aim = null, latch = false, cut = false, dt = DT } = {}) {
  h.state.tick += 1;
  h.state.simTime += dt;
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
  h.system.update(dt, h.state);
}

function count(events, type) {
  return events.filter((entry) => entry.type === type).length;
}

test('FB-009: a scripted bridle setup→link→cut produces exactly one record per edge', () => {
  const h = bridleHarness();
  stepBridle(h, { aim: h.source.pos });
  stepBridle(h, { aim: h.source.pos, latch: true });
  stepBridle(h, { aim: h.target.pos, dt: 0.1 });
  stepBridle(h, { aim: h.target.pos, latch: true });
  stepBridle(h, { cut: true });

  assert.equal(count(h.events, 'massline:bridleEndpointSelected'), 1, 'one endpoint announcement');
  assert.equal(count(h.events, 'massline:bridleLinked'), 1, 'one link receipt');
  assert.equal(count(h.events, 'massline:bridleCut'), 1, 'one cut receipt');
  // No receipt for an edge that did not occur.
  assert.equal(count(h.events, 'massline:bridleEnded'), 0, 'no ended receipt without an end');
  assert.equal(count(h.events, 'massline:bridleSetupEnded'), 0, 'no setup-ended without a cancel');

  // Each edge reaches the picture: the resolver anchors every emitted receipt on this state.
  const ctx = { state: h.state, player: h.player, raider: h.source, other: h.target };
  const linked = h.events.find((entry) => entry.type === 'massline:bridleLinked');
  const record = resolveAdditionalActionVfxReceipt('massline:bridleLinked', linked.payload, ctx.state);
  assert.ok(record, 'the link receipt anchors on the live pair');
  assert.equal(record.sourceId, h.source.id);
  assert.equal(record.targetId, h.target.id);
});

// ── FB-010 — the snare and the seed have voices ──────────────────────────────────────────────

function makeBus() {
  const handlers = new Map();
  return {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(fn);
      return () => handlers.get(name)?.delete(fn);
    },
    emit(name, payload) {
      for (const fn of handlers.get(name) || []) fn(payload);
    },
  };
}

function seedEar(state) {
  const bus = makeBus();
  const ear = Object.create(audio);
  ear.init({ state, bus, helpers: null });
  const plays = [];
  ear.play = (recipeId, opts) => { plays.push({ recipeId, opts }); };
  return { bus, ear, plays };
}

const SEED_RECIPE_STEPS = [
  ['massSeed:deployed', { seedId: 7, ownerId: 1, spawnPos: { x: 10, z: 0 }, lockPos: { x: 40, z: 0 } }, 'sfx_massseed_deploy'],
  ['massSeed:locking', { seedId: 7, pos: { x: 40, z: 0 }, activeAt: 8 }, 'sfx_massseed_lock_rise'],
  ['massSeed:locked', { seedId: 7, pos: { x: 40, z: 0 }, expireAt: 80 }, 'sfx_massseed_lock_chord'],
  ['massSeed:warning', { seedId: 7, expireAt: 80, remainingS: 6 }, 'sfx_massseed_warning'],
  ['massSeed:collapsing', { seedId: 7, reason: 'expired' }, 'sfx_massseed_collapse'],
];

test('FB-010: deploy a seed, let it lock, warn and collapse — four voices in order, then silence', () => {
  const { state } = receiptState();
  state.entities.set(7, { id: 7, type: 'massSeed', alive: true, pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 }, data: {} });
  const { bus, plays } = seedEar(state);
  for (const [event, payload] of SEED_RECIPE_STEPS) bus.emit(event, payload);
  // locking→locked is one rising figure into the landing chord; the four lifecycle voices are
  // deploy, lock (rise + chord), warning, collapse — in that order, nothing between.
  assert.deepEqual(plays.map((p) => p.recipeId), [
    'sfx_massseed_deploy',
    'sfx_massseed_lock_rise',
    'sfx_massseed_lock_chord',
    'sfx_massseed_warning',
    'sfx_massseed_collapse',
  ]);
  const before = plays.length;
  bus.emit('massSeed:collapsed', { seedId: 7, reason: 'expired' });
  bus.emit('massSeed:cleared', { seedId: 7, reason: 'expired', why: 'lifecycle' });
  assert.equal(plays.length, before, 'the despawn and the clear are bookkeeping: silence after');
});

test('FB-010: every authored seed/snare voice is a real recipe, and the seed body localizes it', () => {
  const ids = new Set(RECIPES.map((recipe) => recipe.id));
  for (const [, , recipeId] of SEED_RECIPE_STEPS) {
    assert.ok(ids.has(recipeId), `${recipeId} is authored in RECIPES`);
  }
  for (const id of ['sfx_snare_arm_tick', 'sfx_snare_cut']) {
    assert.ok(ids.has(id), `${id} is authored in RECIPES`);
  }
  const { state } = receiptState();
  state.entities.set(7, { id: 7, type: 'massSeed', alive: true, pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 }, data: {} });
  const { bus, plays } = seedEar(state);
  bus.emit('massSeed:warning', { seedId: 7, expireAt: 80, remainingS: 6 });
  assert.deepEqual(plays[0].opts.position, { x: 40, z: 0 }, 'the warning sits at the seed');
  bus.emit('massSeed:warning', { seedId: 8, expireAt: 80, remainingS: 6 });
  assert.equal(plays[1].opts.position ?? null, null, 'a missing seed pans nowhere');
});

test('FB-010: snare arm and cut produce their two voices; deploy and end stay quiet by design', () => {
  const { state } = receiptState();
  const { bus, plays } = seedEar(state);
  bus.emit('massline:snareDeployed', { deploymentId: 'd1', sourceId: 2, targetId: 3, expiresAt: 99 });
  bus.emit('massline:snareArmed', { attachmentId: 'att1', sourceId: 2, targetId: 3, armedAt: 90 });
  bus.emit('massline:snareCut', { attachmentId: 'att1', reason: 'player_cut' });
  bus.emit('massline:snareEnded', { attachmentId: 'att1', reason: 'endpoint_lost' });
  assert.deepEqual(plays.map((p) => p.recipeId), ['sfx_snare_arm_tick', 'sfx_snare_cut'],
    'exactly the arm tick and the cut twang');
});

test('FB-010: the snare arm and the seed collapse warnings have picture rows that resolve', () => {
  const ctx = receiptState();
  ctx.state.entities.set(7, { id: 7, type: 'massSeed', alive: true, pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 }, data: {} });
  const armed = resolveAdditionalActionVfxReceipt(
    'massline:snareArmed',
    { attachmentId: 'att1', sourceId: ctx.raider.id, targetId: ctx.other.id, armedAt: 90 },
    ctx.state,
  );
  assert.ok(armed, 'the snare arm anchors on its anchor pair');
  const collapsing = resolveAdditionalActionVfxReceipt(
    'massSeed:collapsing',
    { seedId: 7, reason: 'expired' },
    ctx.state,
  );
  assert.ok(collapsing, 'the seed collapse warning anchors on the seed');
  assert.deepEqual(collapsing.pos, { x: 40, z: 0 });
});

// ── FB-013 — every head announces itself ─────────────────────────────────────────────────────

test('FB-013: each of the four heads has a status row for its working and standby state', () => {
  // The status row keeps the landed `HEAD · STATE` grammar (no restyle): the head is named on
  // the same row as the truthful line state, and the alarms keep precedence.
  const rows = {
    tractor: ['TRACTOR · LOADED', 'TRACTOR · LOCKED'],
    frame_coupler: ['FRAME COUPLER · LOADED', 'FRAME COUPLER · LOCKED'],
    monofilament_sweep: ['MONOFILAMENT · LOADED', 'MONOFILAMENT · LOCKED'],
    elastic_whip: ['ELASTIC WHIP · LOADED', 'ELASTIC WHIP · LOCKED'],
  };
  for (const [headId, [taut, slack]] of Object.entries(rows)) {
    const working = masslineTetherStatus({
      active: true, headId, kind: headId, phase: 'loaded', strain: 0.01, load: 0.62,
      automaticBreakAllowed: true,
    });
    assert.equal(working.text, taut, `${headId} names its working read`);
    const standby = masslineTetherStatus({
      active: true, headId, kind: headId, phase: 'slack', strain: 0, load: 0,
      automaticBreakAllowed: true,
    });
    assert.equal(standby.text, slack, `${headId} names its standby`);
  }
  // The extreme-load alarm keeps precedence over head copy.
  const critical = masslineTetherStatus({
    active: true, headId: 'tractor', kind: 'tractor', phase: 'overload',
    strain: 0.9, load: 1, automaticBreakAllowed: true,
  });
  assert.equal(critical.text, 'TRACTOR · CRITICAL');
  assert.equal(critical.warn, true);
});

test('FB-013: all four first-use lines are authored copy', () => {
  for (const key of ['masslineTractor', 'masslineCoupler', 'masslineSweep', 'masslineWhip']) {
    assert.ok(typeof FIRST_USE_LINE[key] === 'string' && FIRST_USE_LINE[key].length >= 8,
      `${key} carries a line`);
  }
});

test('FB-013: a tractor latch announces the capture once — receipt and first-use line', () => {
  const h = bridleHarness();
  h.player.data.derived.masslineHeadId = 'tractor';
  stepBridle(h, { aim: h.source.pos });
  stepBridle(h, { aim: h.source.pos, latch: true });
  stepBridle(h, { cut: true });
  const captures = h.events.filter((entry) => entry.type === 'tether:tractorCapture');
  assert.equal(captures.length, 1, 'one distinct tractor receipt');
  assert.equal(captures[0].payload.targetId, h.source.id);
  const lines = h.events.filter((entry) => entry.type === 'hud:firstUse'
    && entry.payload.verbId === 'masslineTractor');
  assert.equal(lines.length, 1, 'exactly one first-use line');
  assert.equal(lines[0].payload.text, FIRST_USE_LINE.masslineTractor);
  assert.equal(lines[0].payload.entityId, h.source.id);
  assert.equal(h.state.player.hints.masslineTractor, true, 'the once-only hint is marked');
});

test('FB-013: the whip announces on its snap, and no head line ever repeats', () => {
  const h = bridleHarness();
  h.player.data.derived.masslineHeadId = 'elastic_whip';
  h.state.player.tether = {
    active: true, headId: 'elastic_whip', storedEnergy: 1500, strainGlow: 0.8,
    phase: 'loaded', targetId: h.source.id,
  };
  const first = h.system._emitWhipSnapIfStored(h.state, h.source.id);
  assert.equal(first, true, 'the stored whip snaps');
  const second = h.system._emitWhipSnapIfStored(h.state, h.source.id);
  assert.equal(second, true, 'a second snap still snaps');
  const lines = h.events.filter((entry) => entry.type === 'hud:firstUse'
    && entry.payload.verbId === 'masslineWhip');
  assert.equal(lines.length, 1, 'exactly one first-use line across snaps');
  assert.equal(h.events.filter((entry) => entry.type === 'tether:whipSnap').length, 2,
    'each snap still carries its own receipt');
  // The same once-only store answers for the other heads: a second announce is silence.
  assert.equal(h.system._announceHead(h.state, 'monofilament_sweep', h.source.id), true);
  assert.equal(h.system._announceHead(h.state, 'monofilament_sweep', h.source.id), false);
  assert.equal(h.system._announceHead(h.state, 'frame_coupler', h.target.id), true);
  assert.equal(h.system._announceHead(h.state, 'frame_coupler', h.target.id), false);
  assert.equal(h.system._announceHead(h.state, 'tractor', h.source.id), true);
  assert.equal(h.system._announceHead(h.state, 'tractor', h.source.id), false);
});

test('FB-013: the tractor capture and coupler lock receipts are not new dead seams', () => {
  const ctx = receiptState();
  const capture = resolveAdditionalActionVfxReceipt(
    'tether:tractorCapture',
    { sourceId: ctx.player.id, targetId: ctx.raider.id, attachmentId: 'att1' },
    ctx.state,
  );
  assert.ok(capture, 'the tractor capture anchors on the taken body');
  assert.equal(capture.targetId, ctx.raider.id);
  const lock = resolveAdditionalActionVfxReceipt(
    'tether:couplerLock',
    { sourceId: ctx.player.id, targetId: ctx.raider.id, attachmentId: 'att1' },
    ctx.state,
  );
  assert.ok(lock, 'the coupler lock anchors on its pair');
});

// ── the pad — FB-009's two haptic edges through the FB-005 table ─────────────────────────────

test('FB-009: the cut-by-NPC and whip-snap edges pulse through the FB-005 gate', () => {
  assert.ok(HAPTIC_VERB_PULSES['massline:playerLineCut'], 'the line-cut warning has a pulse');
  assert.ok(HAPTIC_VERB_PULSES['tether:whipSnap'], 'the whip snap has a pulse');

  const pad = {
    id: 'pad', index: 0, connected: true, mapping: 'standard', timestamp: 1, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    vibrationActuator: { playEffect() { return Promise.resolve('complete'); }, reset() {} },
  };
  const previous = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: { getGamepads: () => [pad] }, configurable: true,
  });
  try {
    const state = {
      tick: 1, mode: 'flight', playerId: 1,
      player: { tether: { active: false, load: 0 } },
      input: {},
      settings: { controls: { gamepad: { enabled: true } }, video: { motionReduce: false } },
      entities: new Map([[1, { id: 1, type: 'ship', mass: 16, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } }]]),
    };
    const bus = createBus();
    const gp = createGamepad({ bus, state });
    bus.emit('massline:playerLineCut', { attachmentId: 'att1', cutterId: 2 });
    assert.equal(gp._lastVerbPulse, 'massline:playerLineCut', 'the severed-line edge reaches the pad');
    // The FB-005 gate allows one pulse per ~80 ms of sim ticks; step past the gap.
    for (let i = 0; i < 6; i += 1) gp.tick(0.016, state);
    bus.emit('tether:whipSnap', { targetId: 2, storedEnergy: 900, strainGlow: 0.5 });
    assert.equal(gp._lastVerbPulse, 'tether:whipSnap', 'the whip-snap edge reaches the pad');
  } finally {
    if (previous === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', { value: previous, configurable: true });
  }
});
