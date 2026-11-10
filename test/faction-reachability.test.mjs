// faction-reachability — four faction features that existed but could never run or persist
// (Lane 3 audit top-15 items 4, 8, 9, 10; packet fix-faction-reachability).
//
//   concord     a commanderless Concord squad never locks; a locked wing that re-forms
//               around a new mast flies again (ai.passive lifted); numeric clamp ids release
//   choir       the ledger rides serialize/deserialize; a paid leg does not pay twice
//   fulfillment the live update spawns a hauler on its route, in its sector's frame
//   frontier    the seeded homestead plants inside the seeding sector (Io Reach)
//
// Run: node --test --test-isolation=none test/faction-reachability.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import { factionConcord } from '../src/systems/faction_concord.js';
import { choirResonance, ensureChoirState } from '../src/systems/faction_choir.js';
import {
  fulfillmentRoutes,
  ensureFulfillmentState,
  routeWaypoint,
} from '../src/systems/faction_fulfillment.js';
import { FULFILLMENT_ROUTES, FULFILLMENT_ORDER_ONE } from '../src/data/factions/fulfillment.js';
import { frontierHomesteads } from '../src/systems/faction_frontier.js';

// ── Concord ──────────────────────────────────────────────────────────────────────────────

function concordRig() {
  const events = [];
  const bus = { emit(name, payload) { events.push({ name, payload }); } };
  const state = { entities: new Map(), simTime: 0, tick: 0 };
  const sys = { ...factionConcord };
  sys.init({ state, bus, helpers: {} });
  const spawn = (id, x, data = {}, extra = {}) => {
    const e = { id, alive: true, pos: { x, z: 0 }, vel: { x: 0, z: 0 }, mass: 55, radius: 4,
      type: 'ship', factionId: 'faction_scn', data, ...extra };
    state.entities.set(id, e);
    return e;
  };
  return { state, sys, events, spawn };
}

test('concord: a commanderless squad never locks, never goes passive, never barks', () => {
  const { state, sys, events, spawn } = concordRig();
  const a = spawn(1, 0, { ai: { squadId: 'enc_wing' } });
  const b = spawn(2, 40, { ai: { squadId: 'enc_wing' } });
  for (let i = 0; i < 5; i++) sys.update(1 / 60, state);
  assert.notEqual(a.data.ai.passive, true, 'an ordinary Concord wing keeps maneuvering');
  assert.notEqual(b.data.formationLocked, true);
  assert.equal(events.some((e) => e.name === 'concord:formationLocked'), false);
  assert.equal(events.some((e) => e.name === 'comms:log'), false, 'no "Commander down" on spawn');
});

test('concord: a wing that loses its mast locks; a new mast lifts the passive latch', () => {
  const { state, sys, events, spawn } = concordRig();
  const cmdr = spawn(10, 0, { ai: { squadId: 'w', squadSocket: 'lead' } });
  const a = spawn(11, 40, { ai: { squadId: 'w' } });
  const b = spawn(12, -40, { ai: { squadId: 'w' } });
  sys.update(1 / 60, state);
  cmdr.alive = false;
  state.entities.delete(10); // the dead mast is swept — the wing still remembers it had one
  sys.update(1 / 60, state);
  assert.equal(a.data.ai.passive, true, 'lock lands');
  assert.equal(b.data.formationLocked, true);
  spawn(13, 0, { ai: { squadId: 'w', squadSocket: 'lead' } });
  sys.update(1 / 60, state);
  assert.equal(a.data.formationLocked, false);
  assert.equal(a.data.ai.passive, false, 'reform returns the hull to the tactical stack');
  assert.equal(b.data.ai.passive, false);
  assert.ok(events.some((e) => e.name === 'concord:formationReformed'));
});

test('concord: reform never clears a passive latch another owner set', () => {
  const { state, sys, spawn } = concordRig();
  const cmdr = spawn(20, 0, { ai: { squadId: 'p', squadSocket: 'lead' } });
  const held = spawn(21, 40, { ai: { squadId: 'p', passive: true } });
  spawn(22, -40, { ai: { squadId: 'p' } });
  sys.update(1 / 60, state);
  cmdr.alive = false;
  sys.update(1 / 60, state);
  spawn(23, 0, { ai: { squadId: 'p', squadSocket: 'lead' } });
  sys.update(1 / 60, state);
  assert.equal(held.data.ai.passive, true, 'the foreign passive survives the reform');
});

test('concord: a pre-fix spawn lock carried in a save is released', () => {
  const { state, sys, spawn } = concordRig();
  const a = spawn(30, 0, { formationLocked: true, ai: { squadId: 'old', passive: true, lockedDrift: true } });
  spawn(31, 40, { formationLocked: true, ai: { squadId: 'old', passive: true, lockedDrift: true } });
  sys.deserialize({ lockedFormations: { old: true }, clamps: {} });
  sys.update(1 / 60, state);
  assert.equal(a.data.ai.passive, false, 'a mastless lock from an older save lifts');
  assert.equal(a.data.formationLocked, false);
});

test('concord: a clamp on a numeric entity id releases when the tender leaves', () => {
  const { state, sys, spawn } = concordRig();
  const tender = spawn(40, 0, { clampTender: true }, { mass: 200 });
  const pod = spawn(41, 100, { kind: 'cargo' }, { type: 'pickup', factionId: null, mass: 20 });
  sys.update(1 / 60, state);
  assert.equal(pod.data.clampedBy, 40);
  state.entities.delete(tender.id);
  sys.update(1 / 60, state);
  assert.equal(pod.data.clampedBy, undefined, 'the body falls loose for the next tender');
  assert.deepEqual(state.concord.clamps, {});
});

test('concord: serialize/deserialize round-trips the lock ledger and mast latch', () => {
  const { state, sys, spawn } = concordRig();
  spawn(50, 0, { ai: { squadId: 'r', squadSocket: 'lead' } });
  spawn(51, 40, { ai: { squadId: 'r' } });
  spawn(52, -40, { ai: { squadId: 'r' } });
  sys.update(1 / 60, state);
  state.entities.get(50).alive = false;
  sys.update(1 / 60, state);
  const bag = JSON.parse(JSON.stringify(sys.serialize()));
  assert.equal(bag.lockedFormations.r, true);
  assert.equal(bag.mastSeen.r, true);
  const fresh = concordRig();
  fresh.sys.deserialize(bag);
  assert.equal(fresh.state.concord.lockedFormations.r, true);
  assert.equal(fresh.state.concord.mastSeen.r, true);
  fresh.sys.deserialize(undefined);
  assert.deepEqual(fresh.state.concord, { lockedFormations: {}, clamps: {}, mastSeen: {} }, 'absent bag heals');
});

// ── Choir ────────────────────────────────────────────────────────────────────────────────

function choirRig() {
  const bus = createBus();
  const grants = [];
  bus.on('economy:grantCredits', (p) => grants.push(p));
  const state = { entities: new Map(), entityList: [], simTime: 100, tick: 0, mode: 'flight', world: {} };
  const sys = { ...choirResonance, _killEarBus: null, _subs: null };
  sys.init({ state, bus, helpers: {} });
  return { state, sys, grants };
}

test('choir: the ledger survives save/restore and a paid leg does not pay again', () => {
  const a = choirRig();
  a.sys._stampVisit(a.state, 'shrine:A');
  a.state.simTime += 5;
  a.sys._stampVisit(a.state, 'shrine:B');
  const legGrants = a.grants.filter((g) => g.reason === 'choir_pilgrim_leg');
  assert.equal(legGrants.length, 1, 'first A>B leg pays');
  ensureChoirState(a.state).sanctuary.standing = 'marked';
  ensureChoirState(a.state).sanctuary.until = 9999;
  const bag = JSON.parse(JSON.stringify(a.sys.serialize()));
  assert.ok(Number.isFinite(bag.pilgrimage.paidLegs['shrine:A>shrine:B']), 'paid latch is in the save bag');

  const b = choirRig();
  b.sys.deserialize(bag);
  const c = ensureChoirState(b.state);
  assert.equal(c.sanctuary.standing, 'marked', 'sanctuary standing survives Continue');
  assert.equal(c.pilgrimage.legs.length, 1);
  b.state.simTime = a.state.simTime + 600; // well past the leg window: a fresh lap
  b.sys._stampVisit(b.state, 'shrine:A');
  b.state.simTime += 5;
  b.sys._stampVisit(b.state, 'shrine:B');
  assert.equal(b.grants.filter((g) => g.reason === 'choir_pilgrim_leg').length, 0,
    'the restored latch keeps the A>B purse paid once, ever');

  const d = choirRig();
  d.sys.deserialize(null);
  assert.equal(ensureChoirState(d.state).sanctuary.standing, 'none', 'absent bag heals to default');
});

test('choir: a bell speaks its pulse line once, not on every beat', () => {
  const { state, sys } = choirRig();
  const logs = [];
  sys.bus.on('comms:log', (p) => logs.push(p.text));
  const bell = { id: 7, alive: true, pos: { x: 0, z: 0 }, radius: 20, data: { choirBell: true } };
  state.entities.set(7, bell); state.entityList.push(bell);
  for (let i = 0; i < 4; i++) { sys._tickBells(state); state.simTime += 7; }
  assert.equal(logs.length, 1, 'one line per bell');
  assert.notEqual(logs[0], 'The shrine is home.', 'not the relic alarm sentence');
});

// ── Fulfillment ──────────────────────────────────────────────────────────────────────────

function fulfillmentBoot(sectorId) {
  const bus = createBus();
  const sim = createSimulation({ seed: 4242, bus, systems: [fulfillmentRoutes] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  const origin = sectorGlobalOrigin(sectorId);
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: origin.x + 9000, z: origin.z + 9000 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  return { sim, state, bus };
}

const trains = (state) => state.entityList.filter((e) => e && e.alive !== false && e.data?.fulfillmentTrain === true);

test('fulfillment: the live update spawns a hauler on its route inside its own sector', () => {
  const { sim, state } = fulfillmentBoot('sector_charon_expanse');
  try {
    sim.runTicks(5);
    const live = trains(state);
    assert.equal(live.length, 1, 'one re-router rides the Charon route');
    const h = live[0];
    assert.equal(h.data.routeId, 'route_charon_spine');
    assert.notEqual(h.team, 1, 'not a hostile-team hull');
    assert.doesNotMatch(h.data.scanLabel, /route_/, 'no internal id on the scan');
    const route = FULFILLMENT_ROUTES.routes.route_charon_spine;
    const origin = sectorGlobalOrigin(route.sectorId);
    assert.ok(Math.hypot(h.pos.x - origin.x, h.pos.z - origin.z) < 4000, 'the train is in Charon, not on Helios');
    const target = routeWaypoint(route, h.data.legIndex);
    const d0 = Math.hypot(target.x - h.pos.x, target.z - h.pos.z);
    sim.runTicks(30);
    assert.ok(Math.hypot(target.x - h.pos.x, target.z - h.pos.z) < d0, 'it drives its sector-frame leg');

    // A lost hauler is replaced on the cadence, not instantly and not never.
    sim.helpers.removeEntity(h.id, { reason: 'test' });
    sim.runTicks(60);
    assert.equal(trains(state).length, 0, 'gap before the replacement');
    sim.runTicks(60 * 61);
    assert.equal(trains(state).length, 1, 'replacement within the bounded window');
  } finally {
    sim.dispose();
  }
});

test('fulfillment: the Clerk route train carries Order #0000001; other sectors spawn nothing', () => {
  const ash = fulfillmentBoot('sector_ashfall_reach');
  try {
    ash.sim.runTicks(3);
    const live = trains(ash.state);
    assert.equal(live.length, 1);
    assert.deepEqual(live[0].data.orderCrate, { orderSeq: FULFILLMENT_ORDER_ONE.seq });
  } finally { ash.sim.dispose(); }
  const helios = fulfillmentBoot('sector_helios_prime');
  try {
    helios.sim.runTicks(30);
    assert.equal(trains(helios.state).length, 0, 'no route, no train');
  } finally { helios.sim.dispose(); }
});

test('fulfillment: the ledger rides serialize/deserialize — a closed Order #0000001 stays closed', () => {
  const a = fulfillmentBoot('sector_helios_prime');
  let bag;
  try {
    const sys = a.sim.registry.get('fulfillmentRoutes');
    assert.equal(sys.deliverOrderOne(a.state), true);
    ensureFulfillmentState(a.state).nextSpawnAt.route_charon_spine = 1234;
    bag = JSON.parse(JSON.stringify(sys.serialize()));
  } finally { a.sim.dispose(); }
  const b = fulfillmentBoot('sector_helios_prime');
  try {
    const sys = b.sim.registry.get('fulfillmentRoutes');
    sys.deserialize(bag);
    const f = ensureFulfillmentState(b.state);
    assert.equal(f.orders[FULFILLMENT_ORDER_ONE.seq].status, 'closed', 'Continue does not resurrect ticket 1');
    assert.equal(f.nextSpawnAt.route_charon_spine, 1234, 'respawn clock persists');
    assert.equal(sys.deliverOrderOne(b.state), false, 'the payoff does not run twice');
    sys.deserialize(undefined);
    assert.equal(ensureFulfillmentState(b.state).orders[1].status, 'open', 'absent bag heals to fresh');
  } finally { b.sim.dispose(); }
});

// ── Frontier ─────────────────────────────────────────────────────────────────────────────

test('frontier: the seeded homestead plants inside Io Reach, not around Helios', () => {
  const bus = createBus();
  const sim = createSimulation({ seed: 4242, bus, systems: [frontierHomesteads] });
  try {
    const { state } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = 'sector_io_reach';
    const origin = sectorGlobalOrigin('sector_io_reach');
    assert.ok(Math.hypot(origin.x, origin.z) > 10000, 'Io Reach is far from Helios');
    const player = sim.spawn({
      type: 'ship', team: 0, pos: { x: origin.x, z: origin.z }, radius: 12, mass: 24,
      hull: 100, hullMax: 100, collides: true,
    });
    state.playerId = player.id;
    sim.runTicks(3);
    const frame = state.entityList.find((e) => e && e.alive !== false && e.data?.homesteadFrame === true);
    assert.ok(frame, 'a site planted');
    const d = Math.hypot(frame.pos.x - origin.x, frame.pos.z - origin.z);
    assert.ok(d >= 1400 && d <= 2300 + 1, `frame on the Io Reach ring (${d.toFixed(0)} WU from its origin)`);
    const site = frame.data.frontierSite;
    const kids = state.entityList.filter((e) => e && e.data?.frontierSite === site && e !== frame);
    assert.ok(kids.length > 0);
    for (const k of kids) {
      assert.ok(Math.hypot(k.pos.x - frame.pos.x, k.pos.z - frame.pos.z) < 2000, 'pods lie at the site');
      assert.equal(k.flags?.persistent, true, 'site pods survive a Continue');
    }
    const supply = kids.find((k) => k.data.supplyCargo === true);
    if (supply) assert.match(supply.data.scanLabel, /HOMESTEAD SUPPLIES/);
  } finally {
    sim.dispose();
  }
});
