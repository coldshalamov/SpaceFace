// PB-MASS-A — SF-023 + SF-024.
// SF-023: a taut hostile blade committed to the player's line warns BEFORE contact —
// the threat record carries the bite point on the rope, the mirror holds it for the HUD,
// and a cutter that backs off and recommits earns a fresh warning instead of spamming.
// SF-024: a taut, commanded pull that gains nothing while a collidable body fouls the
// load or the rope reads as a SNAG — located, latched, and cleared honestly. A bare stall
// with no geometry, a drifting slack line, and a moving load are all NOT snags.
// Seed 30010.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { createBus } from '../src/core/eventBus.js';
import { mulberry32 } from '../src/core/rng.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { masslineThreats } from '../src/systems/masslineThreats.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { masslineHud } from '../src/ui/masslineHud.js';
import {
  SWEEP_COMMIT_WINDOW_S,
  tetherGameplay,
} from '../src/systems/tetherGameplay.js';

const SEED = 30010;
const DT = 1 / 60;

function stubCombatPhysics() {
  const joints = new Map();
  return {
    createAttachment(input) {
      const handle = {
        id: input.attachmentId,
        attachmentId: input.attachmentId,
        ownerId: input.ownerId,
        targetId: input.targetId,
      };
      joints.set(input.attachmentId, handle);
      return handle;
    },
    cutAttachment(input) {
      joints.delete(input.attachmentId);
      return true;
    },
    setAttachmentReel() { return true; },
    getAttachmentTelemetry() { return null; },
  };
}

function spawn(id, type, pos, extra = {}) {
  return {
    id,
    type,
    team: extra.team ?? 2,
    alive: true,
    pos: { x: pos.x, z: pos.z },
    vel: extra.vel ? { x: extra.vel.x, z: extra.vel.z } : { x: 0, z: 0 },
    rot: 0,
    radius: extra.radius ?? 8,
    mass: extra.mass ?? 20,
    collides: extra.collides ?? true,
    hull: 100,
    hullMax: 100,
    flags: {},
    data: extra.data || {},
  };
}

function makeState(entityList, extra = {}) {
  const entities = new Map(entityList.map((entity) => [entity.id, entity]));
  const state = {
    mode: 'flight',
    simTime: 1,
    tick: 60,
    seed: SEED,
    rng: mulberry32(SEED),
    playerId: entityList[0].id,
    player: {
      tether: {
        active: false,
        targetId: null,
        strain: 0,
        load: 0,
        attachmentId: null,
        restLength: 0,
        phase: 'slack',
      },
    },
    entities,
    entityList,
    input: { actions: { tetherFire: false, tetherCut: false, reelDelta: 0 } },
    runtime: { profileId: 'production', features: PRODUCTION_FEATURES },
    combat: null,
    ...extra,
  };
  ensureCombatState(state);
  return state;
}

function makeTetherSystem(state, bus, helpers) {
  const attachments = createAttachmentService({
    state,
    catalog: helpers.catalog,
    helpers,
    bus,
  });
  const kernel = { attachments, catalog: { attachments: helpers.catalog.attachments } };
  const system = Object.assign({}, tetherGameplay);
  system.init({
    state,
    bus,
    helpers,
    registry: {
      get(name) {
        if (name === 'actions' || name === 'combat') return { kernel };
        return null;
      },
    },
  });
  return { system, attachments };
}

function makeThreatSystem(state, bus) {
  const system = Object.assign({}, masslineThreats);
  system.init({ state, bus });
  return system;
}

function tick(state, ...systems) {
  state.tick += 1;
  state.simTime += DT;
  for (const system of systems) system.update(DT, state);
}

// A hostile cutter rig: raider hull carrying a taut monofilament blade to a pin mass.
// The blade segment runs raider -> pin; positions and velocities are set by the caller.
function rigCutter(attachments, raider, pin, tautRestLength) {
  raider.data.derived = { masslineHeadId: 'monofilament_sweep' };
  const blade = attachments.create({
    defId: 'tether_standard',
    ownerId: raider.id,
    targetId: pin.id,
    controlMode: 'npc_tow',
    sourceWorld: { x: raider.pos.x, y: 0, z: raider.pos.z },
    targetWorld: { x: pin.pos.x, y: 0, z: pin.pos.z },
  });
  assert.equal(blade.ok, true);
  if (tautRestLength != null) blade.attachment.restLength = tautRestLength;
  return blade;
}

function rigPlayerLine(attachments, state, player, target, restLength) {
  const line = attachments.create({
    defId: 'tether_standard',
    ownerId: player.id,
    targetId: target.id,
    sourceWorld: { x: player.pos.x, y: 0, z: player.pos.z },
    targetWorld: { x: target.pos.x, y: 0, z: target.pos.z },
  });
  assert.equal(line.ok, true);
  if (restLength != null) line.attachment.restLength = restLength;
  // The gameplay side adopts the owned attachment on the next update; the mirror fields the
  // threats observer reads are set here the way _mirror leaves them after a live latch.
  state.player.tether.active = true;
  state.player.tether.targetId = target.id;
  state.player.tether.attachmentId = line.attachment.id;
  return line;
}

// --- SF-023: committed hostile sweep -----------------------------------------------

test('a hostile blade closing inside the commit window warns at the bite point before contact', () => {
  const player = spawn(1, 'ship', { x: 50, z: -40 }, { team: 0 });
  const rock = spawn(2, 'asteroid', { x: 50, z: 40 }, { mass: 800, radius: 16, team: null });
  const raider = spawn(3, 'ship', { x: 0, z: 0 }, {
    team: 1,
    vel: { x: 30, z: 0 },
    data: {
      lootTableId: 'tether_control_raider',
      enemyTypeId: 'tether_control_raider',
      ai: { forcePlayerTarget: true },
    },
  });
  // Blade spans raider(0,0) -> pin(32,0); the player line runs x=50 between z -40..40.
  // Gap 18 wu, closing 30 wu/s -> eta 0.6 s < SWEEP_COMMIT_WINDOW_S, no crossing yet.
  const pin = spawn(4, 'asteroid', { x: 32, z: 0 }, { mass: 800, radius: 4, team: null, vel: { x: 30, z: 0 } });
  const state = makeState([player, rock, raider, pin]);
  const bus = createBus();
  const threats = [];
  bus.on('massline:threat', (record) => threats.push(record));
  const catalog = createCombatCatalog();
  const helpers = { combatPhysics: stubCombatPhysics(), catalog };
  const { system, attachments } = makeTetherSystem(state, bus, helpers);
  const threatSystem = makeThreatSystem(state, bus);

  rigPlayerLine(attachments, state, player, rock);
  rigCutter(attachments, raider, pin, 32);

  tick(state, system, threatSystem);

  const commits = threats.filter((record) => record.kind === 'hostile-sweep-commit');
  assert.equal(commits.length, 1, 'the committed blade warns once');
  assert.equal(commits[0].targetId, raider.id);
  assert.ok(commits[0].severity >= 0.25);
  assert.ok(commits[0].etaS <= SWEEP_COMMIT_WINDOW_S, 'the warning lands inside the window');
  assert.ok(commits[0].position && Number.isFinite(commits[0].position.x),
    'the record carries the bite point, not a generic alarm');
  assert.ok(Math.abs(commits[0].position.x - 50) < 6, 'the bite point sits on the player line');
  assert.equal(state.player.tether.attachmentId != null, true);
  const mirror = state.player.masslineThreats && state.player.masslineThreats.sweepCommit;
  assert.ok(mirror, 'the commit mirror is live for the HUD mark');
  assert.equal(mirror.cutterId, raider.id);
  assert.ok(Math.abs(mirror.x - 50) < 6 && Math.abs(mirror.z - 0) < 12);
  // The line is still intact — this is a warning, not the cut.
  const playerLine = Object.values(state.combat.attachments.byId)
    .find((a) => a.ownerId === player.id);
  assert.equal(playerLine.state, 'active');

  // Held while the blade stays committed — no per-tick spam.
  for (let i = 0; i < 10; i++) tick(state, system, threatSystem);
  assert.equal(threats.filter((record) => record.kind === 'hostile-sweep-commit').length, 1,
    'a hovering blade warns once per approach');

  // Blade backs off (velocity reversed, carried far): mirror clears.
  raider.vel.x = -30;
  pin.vel.x = -30;
  raider.pos.x = -140;
  pin.pos.x = -108;
  for (let i = 0; i < 4; i++) tick(state, system, threatSystem);
  assert.equal(state.player.masslineThreats.sweepCommit, null,
    'a cutter clear of the window drops the bite mark');

  // Re-approach past the rearm window earns a fresh warning.
  for (let i = 0; i < 40; i++) tick(state, system, threatSystem);
  raider.vel.x = 30;
  pin.vel.x = 30;
  raider.pos.x = 0;
  pin.pos.x = 32;
  tick(state, system, threatSystem);
  assert.equal(threats.filter((record) => record.kind === 'hostile-sweep-commit').length, 2,
    'a blade that broke off and recommitted warns again');
  console.log(`SEED=${SEED} COMMIT_WARNS=2 ETA=${threats[0].etaS.toFixed(2)}`);
});

test('no commit when the blade is receding, slack, out of reach, or not hostile', () => {
  const player = spawn(1, 'ship', { x: 50, z: -40 }, { team: 0 });
  const rock = spawn(2, 'asteroid', { x: 50, z: 40 }, { mass: 800, radius: 16, team: null });
  const raider = spawn(3, 'ship', { x: 0, z: 0 }, {
    team: 1,
    data: {
      lootTableId: 'tether_control_raider',
      enemyTypeId: 'tether_control_raider',
      ai: { forcePlayerTarget: true },
    },
  });
  const pin = spawn(4, 'asteroid', { x: 32, z: 0 }, { mass: 800, radius: 4, team: null });
  const state = makeState([player, rock, raider, pin]);
  const bus = createBus();
  const threats = [];
  bus.on('massline:threat', (record) => threats.push(record));
  const catalog = createCombatCatalog();
  const helpers = { combatPhysics: stubCombatPhysics(), catalog };
  const { system, attachments } = makeTetherSystem(state, bus, helpers);
  const threatSystem = makeThreatSystem(state, bus);
  rigPlayerLine(attachments, state, player, rock);
  const blade = rigCutter(attachments, raider, pin, 32);
  const commitCount = () => threats.filter((r) => r.kind === 'hostile-sweep-commit').length;

  // Receding: the blade departs, the gap never closes inside the window.
  raider.vel.x = -30;
  pin.vel.x = -30;
  tick(state, system, threatSystem);
  assert.equal(commitCount(), 0, 'a receding blade is not a commit');
  assert.equal(state.player.masslineThreats.sweepCommit, null);

  // Slack: the blade's span is under the taut ratio.
  raider.vel.x = 30;
  pin.vel.x = 30;
  blade.attachment.restLength = 400;
  tick(state, system, threatSystem);
  assert.equal(commitCount(), 0, 'slack does not cut and does not warn');

  // Out of reach: same closing speed but the gap needs ~4 s to cover.
  blade.attachment.restLength = 32;
  raider.pos.x = -180;
  pin.pos.x = -148;
  tick(state, system, threatSystem);
  assert.equal(commitCount(), 0, 'a far approach belongs to the generic swing threat');

  // Not hostile: the same geometry from a neutral tug reads as traffic, not a blade.
  raider.pos.x = 0;
  pin.pos.x = 32;
  raider.team = 2;
  raider.data.ai = null;
  raider.data.enemyTypeId = 'civilian_tug';
  tick(state, system, threatSystem);
  assert.equal(commitCount(), 0, 'a neutral hull carries no commit');
  assert.equal(state.player.masslineThreats.sweepCommit, null);
});

// --- SF-024: tethered-load snag -----------------------------------------------------

function rigSnagScene({ reel = true, obstacle = true, targetVel = null } = {}) {
  const player = spawn(1, 'ship', { x: 0, z: 0 }, { team: 0 });
  const load = spawn(4, 'payload', { x: 0, z: 120 }, {
    mass: 80,
    radius: 4,
    vel: targetVel || { x: 0, z: 0 },
    data: { towable: true },
  });
  const rock = obstacle
    ? spawn(2, 'asteroid', { x: 4, z: 124 }, { mass: 900, radius: 12, team: null })
    : spawn(2, 'asteroid', { x: 400, z: 400 }, { mass: 900, radius: 12, team: null });
  const state = makeState([player, load, rock]);
  const bus = createBus();
  const events = { snagged: [], cleared: [], toasts: [] };
  bus.on('tether:snagged', (payload) => events.snagged.push(payload));
  bus.on('tether:snagCleared', (payload) => events.cleared.push(payload));
  bus.on('toast', (payload) => events.toasts.push(payload));
  const catalog = createCombatCatalog();
  const helpers = { combatPhysics: stubCombatPhysics(), catalog };
  const { system, attachments } = makeTetherSystem(state, bus, helpers);
  const line = rigPlayerLine(attachments, state, player, load, 60); // span 120, rest 60 -> loaded
  if (reel) state.input.actions.reelDelta = -1;               // commanded pull-in
  return { state, bus, system, attachments, events, player, load, rock, line };
}

test('a reeled load pinned against a body snags once, mirrors the foul point, then clears', () => {
  const { state, system, events, load, rock } = rigSnagScene();
  for (let i = 0; i < 30; i++) tick(state, system);
  assert.equal(events.snagged.length, 1, 'the pin speaks once');
  assert.equal(events.snagged[0].obstacleId, rock.id);
  assert.equal(events.snagged[0].obstacleKind, 'contact');
  assert.ok(Number.isFinite(events.snagged[0].x) && Number.isFinite(events.snagged[0].z));
  const snagMirror = state.player.tether.snag;
  assert.ok(snagMirror, 'the mirror carries the foul for the HUD mark');
  assert.equal(snagMirror.obstacleId, rock.id);
  assert.ok(events.toasts.some((t) => typeof t.text === 'string' && /SNAGGED/.test(t.text)),
    'the player gets a named choice in words');
  // Held, not spammed.
  for (let i = 0; i < 10; i++) tick(state, system);
  assert.equal(events.snagged.length, 1);

  // The obstacle moves off — the foul clears after the noise-forgiveness window.
  rock.pos.x = 200;
  rock.pos.z = 200;
  for (let i = 0; i < 10; i++) tick(state, system);
  assert.equal(events.cleared.length, 1);
  assert.equal(events.cleared[0].reason, 'cleared');
  assert.equal(state.player.tether.snag, null);
  console.log(`SEED=${SEED} SNAG_AT=(${events.snagged[0].x.toFixed(0)},${events.snagged[0].z.toFixed(0)})`);
});

test('a cut line releases the snag latch with the line', () => {
  const { state, system, attachments, events, load, line } = rigSnagScene();
  for (let i = 0; i < 30; i++) tick(state, system);
  assert.equal(events.snagged.length, 1);
  assert.equal(attachments.cut(line.attachment.id, 1, 'tether_cut').ok, true);
  tick(state, system);
  assert.equal(events.cleared.length, 1, 'losing the line releases the latch');
  assert.equal(events.cleared[0].reason, 'ended');
  assert.equal(state.player.tether.snag, null);
});

test('sector boundaries and new games release the latch AND the mirror', () => {
  const { state, bus, system, events } = rigSnagScene();
  for (let i = 0; i < 30; i++) tick(state, system);
  assert.equal(events.snagged.length, 1);
  assert.ok(state.player.tether.snag);

  // A sector boundary ends the line: the latch releases with a real 'ended' event
  // and the HUD mirror clears — no stale SNAGGED can ride into the next sector.
  bus.emit('sector:exit', {});
  assert.equal(events.cleared.length, 1);
  assert.equal(events.cleared[0].reason, 'ended');
  assert.equal(state.player.tether.snag, null, 'the boundary clears the mirror');

  // A save-restore residue — a mirror on the record with NO live latch behind it —
  // must still clear on game:new and must NOT emit (there is nothing to announce).
  state.player.tether.snag = { obstacleId: 7, kind: 'contact', x: 1, z: 2 };
  bus.emit('game:new', {});
  assert.equal(state.player.tether.snag, null, 'a stale mirror is dropped on reset');
  assert.equal(events.cleared.length, 1, 'no phantom cleared event without a latch');
});

test('no snag without pull intent, without an obstacle, or while the load is moving', () => {
  // Slack parked line resting against the same rock — no commanded pull.
  const parked = rigSnagScene({ reel: false });
  for (let i = 0; i < 30; i++) tick(parked.state, parked.system);
  assert.equal(parked.events.snagged.length, 0,
    'a load resting on a body with no pull is not a snag');
  assert.equal(parked.state.player.tether.snag, null);

  // Same pull, no body in reach — a bare stall is not a snag.
  const clear = rigSnagScene({ obstacle: false });
  for (let i = 0; i < 30; i++) tick(clear.state, clear.system);
  assert.equal(clear.events.snagged.length, 0,
    'a stalled pull with open geometry is not a snag');

  // Pull commanded but the load is making progress — span is shrinking.
  const moving = rigSnagScene({ targetVel: { x: 0, z: -20 } });
  for (let i = 0; i < 30; i++) tick(moving.state, moving.system);
  assert.equal(moving.events.snagged.length, 0,
    'a load gaining span on the pull is working, not snagged');
});

// --- the marks themselves ---------------------------------------------------------
// The sim-side tests above never paint DOM; this one mounts the real HUD over a stub
// document so the world-anchored mark path is exercised — a thrown ReferenceError in
// the paint path would close the sim runner, not just hide a mark.

function fakeDocument() {
  const makeNode = (tagName) => {
    const node = {
      tagName,
      id: '',
      className: '',
      children: [],
      parentNode: null,
      isConnected: true,
      textContent: '',
      attributes: {},
      style: {
        display: '',
        transform: '',
        setProperty(name, value) { this[name] = value; },
      },
      appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
      removeChild(child) { this.children = this.children.filter((e) => e !== child); child.parentNode = null; },
      setAttribute(name, value) {
        this.attributes[name] = String(value);
        if (name === 'class') this.className = String(value);
        if (name === 'id') this.id = String(value);
      },
    };
    node.classList = {
      contains(name) { return node.className.split(/\s+/).includes(name); },
      add(name) { if (!this.contains(name)) node.className = `${node.className} ${name}`.trim(); },
      remove(name) { node.className = node.className.split(/\s+/).filter((e) => e && e !== name).join(' '); },
      toggle(name, force) {
        const want = force === undefined ? !this.contains(name) : !!force;
        if (want) this.add(name); else this.remove(name);
        return want;
      },
    };
    return node;
  };
  const body = makeNode('body');
  const head = makeNode('head');
  const hud = makeNode('div');
  hud.id = 'hud';
  body.appendChild(hud);
  const roots = [head, body];
  const byId = (id) => {
    const visit = (node) => {
      if (node.id === id) return node;
      for (const child of node.children) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };
    for (const root of roots) {
      const found = visit(root);
      if (found) return found;
    }
    return null;
  };
  return {
    body,
    head,
    createElement: makeNode,
    createElementNS: (_ns, tagName) => makeNode(tagName),
    getElementById: byId,
  };
}

function findByClass(root, className) {
  if (!root) return null;
  if (root.classList && root.classList.contains(className)) return root;
  for (const child of root.children || []) {
    const found = findByClass(child, className);
    if (found) return found;
  }
  return null;
}

test('the commit and snag mirrors paint world-anchored marks on the HUD', () => {
  const previousEnabled = MASSLINE2_FLAGS.enabled;
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = fakeDocument();
  globalThis.window = { innerWidth: 1440, innerHeight: 900 };
  MASSLINE2_FLAGS.enabled = true;
  try {
    const p = spawn(1, 'ship', { x: 0, z: 0 }, { team: 0 });
    const state = {
      mode: 'flight',
      simTime: 1,
      tick: 60,
      playerId: p.id,
      player: {
        tether: {
          active: true,
          targetId: 9,
          snag: { obstacleId: 7, kind: 'contact', x: 40, z: 30 },
        },
        masslineThreats: {
          active: true,
          sweepCommit: { cutterId: 5, playerLineId: 2, etaS: 0.6, severity: 0.8, x: 20, z: 10 },
        },
      },
      entities: new Map([[p.id, p]]),
      entityList: [p],
      settings: { video: { motionReduce: true }, accessibility: { motionPreference: 'reduce' } },
      massline2: {},
    };
    const hud = Object.assign({}, masslineHud);
    hud.init({
      state,
      helpers: { worldToScreen: ({ x, z }) => ({ x: x + 300, y: z + 200, onScreen: true }) },
    });
    hud.update(1 / 60, state);

    const root = globalThis.document.getElementById('sf-ml2');
    const threatMark = findByClass(root, 'ml2-threat-mark');
    const snagMark = findByClass(root, 'ml2-snag-mark');
    assert.ok(threatMark, 'the cutter-commit mark must be mounted');
    assert.ok(snagMark, 'the snag mark must be mounted');
    assert.equal(threatMark.style.display, 'block',
      'a live commit mirror paints the CUT mark');
    assert.equal(snagMark.style.display, 'block',
      'a live snag mirror paints the SNAGGED mark');
    assert.ok(/translate3d/.test(threatMark.style.transform),
      'the mark is positioned at the projected bite point');
    assert.ok(/320/.test(threatMark.style.transform) && /210/.test(threatMark.style.transform),
      'the bite point projects to its screen position');
    assert.equal(threatMark.attributes['role'], 'status');
    assert.equal(snagMark.attributes['role'], 'status');

    // Mirrors clear -> marks hide; mirrors move -> marks repaint (the signature covers them).
    state.player.masslineThreats.sweepCommit = null;
    state.player.tether.snag = null;
    hud.update(1 / 60, state);
    assert.equal(threatMark.style.display, 'none', 'a cleared commit hides the mark');
    assert.equal(snagMark.style.display, 'none', 'a cleared snag hides the mark');

    state.player.tether.snag = { obstacleId: 7, kind: 'span', x: 60, z: 90 };
    hud.update(1 / 60, state);
    assert.equal(snagMark.style.display, 'block', 'a moved snag repaints');
    assert.ok(/360/.test(snagMark.style.transform) && /290/.test(snagMark.style.transform),
      'the snag mark tracks the foul point');
    hud.destroy();
  } finally {
    MASSLINE2_FLAGS.enabled = previousEnabled;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
