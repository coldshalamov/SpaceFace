// test/wf05-beam-tender.test.mjs — WF-05: the industrial beam can finally tend a hull.
//
// The repair verb has been resolvable for any damaged ship since PQ-016
// (src/combat/industrialBeam.js) and mining.js owned the handler, credit cost and VFX event, but
// every acquisition gate only ever considered asteroid|wreck|pod, so the player could never point
// the beam at a casualty. This pins the whole tender loop on fixed seed 4242:
//   1. a limping non-hostile ship is scan-acquired, welded, and the beam auto-stops at weld-out;
//   2. a hostile hull is never acquired (the beam is a tool, not a way to heal your enemy);
//   3. a healthy hull is never acquired;
//   4. the weld FINISHES above the 85% scan bar once the lock is held (rope-and-weld: a tethered
//      casualty is weldable to full) and the weld-out thanks fires exactly once;
//   5. targeting stays predictable: a nearer rock still beats a casualty under the same aim;
//   6. the ROUTE half of rope-and-weld: through the real input mapping (input.update, production
//      massline2.throw profile) a latched non-hostile casualty leaves RMB as the mine control so
//      the weld can run, while a latched hostile still steals RMB for the throw arm.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { mining } from '../src/systems/mining.js';
import { input } from '../src/systems/input.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';

const SEED = 4242;
const DT = 1 / 60;

function makeShip(state, id, opts) {
  const ship = {
    id,
    type: 'ship',
    alive: true,
    pos: { x: opts.x, z: opts.z ?? 0 },
    vel: { x: 0, z: 0 },
    radius: opts.radius ?? 14,
    team: opts.team ?? 0,
    flags: {},
    hull: opts.hull,
    hullMax: opts.hullMax,
    data: { role: 'hauler', trafficRole: 'hauler', ...(opts.data || {}) },
  };
  state.entities.set(id, ship);
  state.entityList.push(ship);
  return ship;
}

function boot() {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.spatialHash = null; // fixture has no hash registration; force the entityList fallbacks
  state.simTime = 0;

  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 6,
    team: 0,
    flags: {},
    hull: 1000,
    hullMax: 1000,
    data: {},
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.player.credits = 50000;
  state.player.miningBeam = { tierId: 'beam_mk1' };

  const bus = createBus();
  const events = { start: [], stop: 0, repaired: [], charges: [], toasts: [] };
  bus.on('mining:start', (p) => events.start.push(p));
  bus.on('mining:stop', () => { events.stop += 1; });
  bus.on('beam:repaired', (p) => events.repaired.push(p));
  bus.on('economy:chargeCredits', (p) => events.charges.push(p));
  bus.on('toast', (p) => events.toasts.push(p));

  mining.init({ state, bus, helpers: {}, registry: { get() { return null; } } });

  function drive(seconds, step = 0.5) {
    let elapsed = 0;
    while (elapsed < seconds - 1e-9) {
      mining.update(step, state);
      state.simTime += step;
      state.tick += 1;
      elapsed += step;
    }
  }

  return { state, bus, events, player, drive };
}

function arm(state, aimAngle = 0) {
  state.input.fireGroup = 2;
  state.input.aimAngle = aimAngle;
}

function disarm(state) {
  state.input.fireGroup = null;
}

test('beam-tender: a limping hauler is scan-acquired, welded to full, and the beam lets go', () => {
  const h = boot();
  try {
    const casualty = makeShip(h.state, 10, { x: 120, z: 0, hull: 300, hullMax: 1000 });
    arm(h.state, 0); // aim straight at the casualty

    h.drive(1);
    assert.ok(h.events.start.some((e) => e.targetId === casualty.id && e.verb === 'repair'),
      'expected mining:start with verb repair on the casualty');
    const midHeat = h.state.player.miningBeam.heat;
    assert.ok(midHeat > 0, 'the weld must pay the same beam heat as any other beam work');

    h.drive(20);
    assert.equal(casualty.hull, casualty.hullMax, 'the weld must FINISH, not stall at the scan bar');
    assert.ok(h.events.repaired.length > 0, 'per-tick repair receipt feeds the repair VFX');
    const charged = h.events.charges.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    assert.ok(charged > 900, `tendering 700 hull must cost real credits, saw ${charged}`);
    assert.equal(h.events.toasts.length, 1, 'exactly one weld-out thanks');
    assert.match(h.events.toasts[0].text, /welded/);

    const repairedCount = h.events.repaired.length;
    h.drive(1); // still holding the trigger on a closed hull
    assert.equal(h.events.repaired.length, repairedCount, 'no repair past weld-out');
    assert.ok(h.events.stop > 0, 'the beam releases the closed hull on its own');
  } finally { if (typeof mining.destroy === 'function') mining.destroy(); }
});

test('beam-tender: a hostile hull is never acquired — the beam does not heal your enemy', () => {
  const h = boot();
  try {
    const pirate = makeShip(h.state, 11, {
      x: 100, z: 0, hull: 200, hullMax: 1000, team: 3, data: { encounter: true },
    });
    arm(h.state, 0);
    h.drive(2);
    assert.equal(pirate.hull, 200, 'hostile hull must be untouched');
    assert.equal(h.events.start.length, 0, 'no beam lock on a hostile');
    assert.equal(h.events.repaired.length, 0);
  } finally { if (typeof mining.destroy === 'function') mining.destroy(); }
});

test('beam-tender: a healthy hull is never acquired', () => {
  const h = boot();
  try {
    const healthy = makeShip(h.state, 12, { x: 100, z: 0, hull: 1000, hullMax: 1000 });
    arm(h.state, 0);
    h.drive(2);
    assert.equal(healthy.hull, 1000);
    assert.equal(h.events.start.length, 0, 'no beam lock on a healthy ship');
  } finally { if (typeof mining.destroy === 'function') mining.destroy(); }
});

test('beam-tender: rope-and-weld — a tethered casualty above the scan bar still welds to full', () => {
  const h = boot();
  try {
    // 860/1000 = 86%: above the 85% free-scan bar (the cursor must not steal onto it) but a real
    // casualty. The rope is the deliberate act that makes it weldable, and the hold bar is the
    // resolver's own "damaged" truth so the job can finish.
    const casualty = makeShip(h.state, 13, { x: 150, z: 0, hull: 860, hullMax: 1000 });
    h.state.player.tether = { active: true, targetId: casualty.id };
    arm(h.state, 0.6); // aim OFF the casualty: only the tether may deliver it

    h.drive(1);
    assert.ok(h.events.start.some((e) => e.targetId === casualty.id && e.verb === 'repair'),
      'the tethered casualty is acquired through the rope, not the cursor');
    h.drive(6);
    assert.equal(casualty.hull, casualty.hullMax, 'rope-and-weld runs to closed');
    assert.equal(h.events.toasts.length, 1, 'one weld-out thanks per casualty');
  } finally { if (typeof mining.destroy === 'function') mining.destroy(); }
});

test('beam-tender: an untethered hull above the scan bar does not steal the lock', () => {
  const h = boot();
  try {
    makeShip(h.state, 14, { x: 120, z: 0, hull: 900, hullMax: 1000 }); // 90% — not limping
    arm(h.state, 0);
    h.drive(2);
    assert.equal(h.events.start.length, 0, 'the free scan keeps its bar; the rope is the override');
  } finally { if (typeof mining.destroy === 'function') mining.destroy(); }
});

test('beam-tender: targeting stays predictable — a nearer rock wins the same aim', () => {
  const h = boot();
  try {
    const rock = {
      id: 15, type: 'asteroid', alive: true, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
      radius: 10, hull: 50, hullMax: 50, data: {},
    };
    h.state.entities.set(rock.id, rock);
    h.state.entityList.push(rock);
    makeShip(h.state, 16, { x: 160, z: 0, hull: 300, hullMax: 1000 }); // casualty behind the rock
    arm(h.state, 0);

    h.drive(1);
    assert.equal(h.state.player.miningTargetId, rock.id, 'aim-bias still picks the nearer body');
    assert.ok(h.events.start.some((e) => e.targetId === rock.id && e.verb === 'extract'),
      'the rock is extracted, not the ship behind it');
  } finally { if (typeof mining.destroy === 'function') mining.destroy(); }
});

// --- the ROUTE half: the real input mapping must hand RMB to the beam on a latched casualty ---
//
// The production profile seeds massline2.throw = true (src/runtime/runtimeProfiles.js:23), and
// input.js:1209-1211 steals the mine control whenever isThrowArmPayload claims the latch. A
// non-hostile casualty must keep RMB as the beam (rope-and-weld); a hostile must still throw.

function makeInputHost() {
  const host = Object.create(input);
  host._keys = Object.create(null);
  host._ndc = { x: 0, y: 0 };
  host._screen = { x: 0, y: 0, active: false };
  host._m0 = host._m1 = host._m2 = false;
  host._lastKbmMs = 0;
  host.helpers = { raycastToPlane: () => ({ x: 60, z: 0 }) };
  host.bus = { emit() {} };
  host.gamepad = null;
  host.touch = null;
  return host;
}

function makeRouteState() {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.spatialHash = null;
  state.simTime = 0;
  state.ui = { screenStack: [] };
  state.nav = {};
  state.input.actions = {};

  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 6,
    team: 0,
    flags: {},
    hull: 1000,
    hullMax: 1000,
    data: {},
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.player.credits = 50000;
  state.player.miningBeam = { tierId: 'beam_mk1' };
  state.player.tether = { active: false, targetId: null };
  return state;
}

test('beam-tender route: a latched casualty keeps RMB as the beam and the weld runs to full', () => {
  const prevThrow = { enabled: MASSLINE2_FLAGS.enabled, throw: MASSLINE2_FLAGS.throw };
  MASSLINE2_FLAGS.enabled = true; MASSLINE2_FLAGS.throw = true; // production profile (runtimeProfiles.js:23)
  const host = makeInputHost();
  const state = makeRouteState();
  const casualty = makeShip(state, 20, { x: 120, z: 0, hull: 300, hullMax: 1000 });

  const bus = createBus();
  const starts = [];
  bus.on('mining:start', (p) => starts.push(p));
  mining.init({ state, bus, helpers: {}, registry: { get() { return null; } } });

  // The player latched the casualty with the rope (the latch lives in tetherGameplay/physics;
  // what is under test here is which tool RMB drives WHILE latched).
  state.player.tether = { active: true, targetId: casualty.id };
  host._m2 = true; // RMB held

  const before = casualty.hull;
  for (let i = 0; i < 30; i++) { // half a second through the REAL mapping
    host.update(DT, state);
    state.input.aimAngle = 0; // deterministic cursor: straight at the casualty
    mining.update(DT, state);
    state.simTime += DT;
    state.tick += 1;
  }

  try {
    assert.equal(state.input.actions.throwArm, false,
      'a latched non-hostile casualty must not arm the throw arm');
    assert.equal(state.input.fireGroup, 2, 'RMB stays the mining beam while roped to a casualty');
    assert.ok(starts.some((e) => e.targetId === casualty.id && e.verb === 'repair'),
      'the weld actually runs through the route, not only through a hand-written fireGroup');
    assert.ok(casualty.hull > before, 'the roped casualty is being welded');
  } finally {
    Object.assign(MASSLINE2_FLAGS, prevThrow);
    if (typeof mining.destroy === 'function') mining.destroy();
  }
});

test('beam-tender route: a latched hostile still steals RMB for the throw arm (case D)', () => {
  const prevThrow = { enabled: MASSLINE2_FLAGS.enabled, throw: MASSLINE2_FLAGS.throw };
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.throw = true;
  const host = makeInputHost();
  const state = makeRouteState();
  const pirate = makeShip(state, 21, {
    x: 100, z: 0, hull: 200, hullMax: 1000, team: 3, data: { encounter: true },
  });
  state.player.tether = { active: true, targetId: pirate.id };
  host._m2 = true;

  for (let i = 0; i < 19; i++) host.update(DT, state);

  try {
    assert.equal(state.input.actions.throwArm, true, 'a hostile latch is still a combat throw');
    assert.equal(state.input.fireGroup, null,
      'the throw arm owns RMB on a hostile; the beam yields exactly as before this unit');
  } finally {
    Object.assign(MASSLINE2_FLAGS, prevThrow);
  }
});
