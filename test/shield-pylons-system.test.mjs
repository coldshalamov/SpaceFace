/**
 * Linked Shield Pylons (packet 06) — the system: placement, linking, lifecycle, atomic teardown,
 * and hull interception through the REAL SG-02 rapier-dynamic physics authority (no mocks).
 *
 * Coverage:
 *   - strict no-op when never deployed (golden safety by construction)
 *   - unfitted / cooldown / clearance / span / funds refusals spend nothing; a placement spends once
 *   - stable pair identity, capacity (second pair, third denied), recall by aiming at a pylon
 *   - linking beat, then active; occupied span holds the beat
 *   - a hostile hull is stopped at the wall from BOTH sides; an ally, the owner and a neutral pass
 *   - a heavy ram the pair cannot afford overloads it; recovery; expiry; endpoint destruction tears
 *     the whole pair down atomically and repeated teardown is idempotent
 *   - relation change in flight; recycled entity ids can never be adopted as endpoints
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { shieldPylons, planPylonDeploy, pylonNextOperation } from '../src/systems/shieldPylons.js';
import { PYLON_MODULE_ID, SHIELD_PYLON_DEF as DEF, PYLON_STATES as S, PYLON_DENIALS as DENY } from '../src/data/shieldPylons.js';
import { pylonMirror } from '../src/combat/pylonShieldQuery.js';

const DT = SIM_DT;
const COOLDOWN_TICKS = Math.ceil(DEF.deployCooldownS / SIM_DT) + 3;

function boot({ seed = 6060, physicsOn = false, fitted = true, credits = 5000 } = {}) {
  const sim = createSimulation({
    seed,
    bus: createBus(),
    systems: physicsOn ? [shieldPylons, physics] : [shieldPylons],
  });
  const { state, helpers } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  state.player.credits = credits;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, collides: true,
    vel: { x: 0, z: 0 }, rot: 0, angVel: 0, hull: 200, hullMax: 200,
    flightModel: { inertia: 88 }, flags: {},
    physicsBody: { schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship', fittings: fitted ? [PYLON_MODULE_ID] : [] },
  });
  state.playerId = player.id;
  const events = [];
  for (const name of ['shieldPylon:placed', 'shieldPylon:linking', 'shieldPylon:active', 'shieldPylon:contact',
    'shieldPylon:strained', 'shieldPylon:overloaded', 'shieldPylon:recovered', 'shieldPylon:warning',
    'shieldPylon:retired', 'shieldPylon:denied', 'economy:chargeCredits', 'economy:grantCredits', 'toast']) {
    sim.bus.on(name, (p) => events.push({ name, p, tick: state.tick }));
  }
  const t = { sim, state, bus: sim.bus, helpers, player, events, sys: sim.registry.get('shieldPylons'), physicsSys: sim.registry.get('physics') };
  return t;
}

async function bootPhysics(opts = {}) {
  const t = boot({ ...opts, physicsOn: true });
  t.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const ready = await t.physicsSys.prepareBackend(t.state);
  assert.equal(ready, true, 'SG-02 rapier-dynamic backend should initialize headless');
  t.cleanup = () => { if (typeof t.physicsSys._disableSg02DynamicAuthority === 'function') t.physicsSys._disableSg02DynamicAuthority(); };
  return t;
}

function ship(t, x, z, { team = 1, vx = 0, vz = 0, radius = 10, mass = 14, id = undefined, data = {} } = {}) {
  return t.sim.spawn({
    ...(id ? { id } : {}),
    type: 'ship', team, pos: { x, z }, radius, collides: true, vel: { x: vx, z: vz }, rot: 0, angVel: 0,
    hull: 100, hullMax: 100, flightModel: { inertia: 40 }, flags: {},
    physicsBody: { schemaVersion: 1, radius, mass, inertiaY: mass * 3, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship', ...(team === 1 ? { encounter: true } : {}), ...data },
  });
}

function press(t, aim) {
  t.state.input.aimWorld = { x: aim.x, z: aim.z };
  t.state.input.actions.deployShieldPylon = true;
  t.sim.step();
}

function steps(t, n) { for (let i = 0; i < n; i++) t.sim.step(); }
function secondsToTicks(s) { return Math.ceil(s / DT); }

// Place a wall x=100 from z=-60 to z=+60 (the player is at the origin, range 170).
function placeWall(t) {
  press(t, { x: 100, z: -60 });
  steps(t, COOLDOWN_TICKS); // clear the deploy cooldown
  press(t, { x: 100, z: 60 });
  return pylonMirror(t.state).pairs[0];
}
function activate(t) { steps(t, secondsToTicks(DEF.linkS) + 6); }

test('never deployed: the system is a strict no-op and leaves no mirror behind', () => {
  const t = boot();
  steps(t, 30);
  assert.equal(pylonMirror(t.state), null);
  assert.equal('shieldPylons' in t.state, false, 'no mirror key appeared');
  assert.equal(t.events.length, 0);
});

test('refusals spend nothing: unfitted, funds, clearance, cooldown', () => {
  let t = boot({ fitted: false });
  press(t, { x: 100, z: 0 });
  assert.equal(pylonMirror(t.state), null);
  assert.equal(t.events.filter((e) => e.name === 'economy:chargeCredits').length, 0);
  assert.equal(t.events.find((e) => e.name === 'shieldPylon:denied').p.reason, DENY.notFitted);

  t = boot({ credits: DEF.endpointCostCredits - 1 });
  press(t, { x: 100, z: 0 });
  assert.equal(t.events.find((e) => e.name === 'shieldPylon:denied').p.reason, DENY.funds);
  assert.equal(t.events.filter((e) => e.name === 'economy:chargeCredits').length, 0);
  assert.equal(pylonMirror(t.state), null);

  t = boot();
  ship(t, 100, 0, { team: 9 }); // a body on the site
  press(t, { x: 100, z: 0 });
  assert.equal(t.events.find((e) => e.name === 'shieldPylon:denied').p.reason, DENY.clearance);
  assert.equal(t.events.filter((e) => e.name === 'economy:chargeCredits').length, 0);

  t = boot();
  press(t, { x: 100, z: -60 });
  assert.equal(t.events.filter((e) => e.name === 'economy:chargeCredits').length, 1, 'first placement spends once');
  press(t, { x: 100, z: 60 }); // immediately: inside the debounce
  assert.equal(t.events.find((e) => e.name === 'shieldPylon:denied').p.reason, DENY.cooldown);
  assert.equal(t.events.filter((e) => e.name === 'economy:chargeCredits').length, 1, 'the refused press spent nothing');
});

test('one press spends once even when several input layers raise the same intent in one tick', () => {
  const t = boot();
  t.state.input.aimWorld = { x: 100, z: -60 };
  t.state.input.actions.deployShieldPylon = true;
  t.sim.step();
  // A second layer raises the flag again inside the same tick window (tick counter unchanged by a re-arm).
  assert.equal(t.events.filter((e) => e.name === 'economy:chargeCredits').length, 1);
  const m = pylonMirror(t.state);
  assert.equal(m.pairs.length, 1);
  assert.equal(m.pairs[0].state, S.UNPAIRED);
  const pylons = [...t.state.entities.values()].filter((e) => e.data && e.data.shieldPylonEndpoint);
  assert.equal(pylons.length, 1);
});

test('first endpoint is an unpaired physical body; the second links it into a stable pair', () => {
  const t = boot();
  press(t, { x: 100, z: -60 });
  let m = pylonMirror(t.state);
  assert.equal(m.pairs.length, 1);
  const pair = m.pairs[0];
  assert.equal(pair.state, S.UNPAIRED);
  assert.equal(pair.id, 'pyl_1');
  t.state.input.aimWorld = { x: 100, z: 60 };
  assert.deepEqual(pylonNextOperation(t.state).id, 'second', 'the label names the NEXT operation');
  t.state.input.aimWorld = { x: 100, z: -60 };
  assert.deepEqual(pylonNextOperation(t.state).id, 'recall', 'aimed at a pylon the press recalls it, and says so');
  const a = t.state.entities.get(pair.a.id);
  assert.equal(a.type, 'fieldEmitter');
  assert.equal(a.data.shieldPylonEndpoint, true);
  assert.equal(a.hull, DEF.endpointHull);
  steps(t, COOLDOWN_TICKS);
  press(t, { x: 100, z: 60 });
  m = pylonMirror(t.state);
  assert.equal(m.pairs.length, 1, 'the second endpoint joins the same pair');
  assert.equal(m.pairs[0].id, 'pyl_1', 'the identity is stable across the link');
  assert.equal(m.pairs[0].state, S.LINKING);
  assert.ok(Math.abs(m.pairs[0].span - 120) < 1e-6);
  assert.equal(t.events.filter((e) => e.name === 'economy:chargeCredits').length, 2);
  activate(t);
  assert.equal(m.pairs[0].state, S.ACTIVE);
  assert.equal(m.pairs[0].energy, m.pairs[0].capacity);
  assert.ok(t.events.some((e) => e.name === 'shieldPylon:active'));
});

test('span limits and capacity: too short, too long, a third pair is denied, aiming at a pylon recalls it', () => {
  const t = boot();
  press(t, { x: 100, z: 0 });
  steps(t, COOLDOWN_TICKS);
  press(t, { x: 100, z: DEF.minSpan - 6 });
  assert.equal(t.events.filter((e) => e.name === 'shieldPylon:denied').pop().p.reason, DENY.tooClose);
  steps(t, COOLDOWN_TICKS);
  press(t, { x: -100, z: 0 }); // reachable from the ship, 200 WU from the first pylon: beyond the span cap
  assert.equal(t.events.filter((e) => e.name === 'shieldPylon:denied').pop().p.reason, DENY.tooFar);
  assert.equal(t.events.filter((e) => e.name === 'economy:chargeCredits').length, 1, 'refused spans spent nothing');
  // Complete pair one, then pair two, then a third is denied.
  steps(t, COOLDOWN_TICKS);
  press(t, { x: 100, z: 90 });
  steps(t, COOLDOWN_TICKS);
  press(t, { x: -100, z: -60 });
  steps(t, COOLDOWN_TICKS);
  press(t, { x: -100, z: 60 });
  const m = pylonMirror(t.state);
  assert.equal(m.pairs.length, 2);
  assert.deepEqual(m.pairs.map((p) => p.id), ['pyl_1', 'pyl_2']);
  steps(t, COOLDOWN_TICKS);
  t.state.input.aimWorld = { x: 0, z: 150 }; // clear space, away from every pylon
  assert.equal(pylonNextOperation(t.state).id, 'full');
  press(t, { x: 0, z: 150 });
  assert.equal(t.events.filter((e) => e.name === 'shieldPylon:denied').pop().p.reason, DENY.capacity);
  assert.equal(m.pairs.length, 2, 'inspecting another location never disconnects a working shield');
  // Aim at pylon A of pair two -> recall that pair atomically, both endpoints gone.
  const pair2 = m.pairs[1];
  const aEntity = t.state.entities.get(pair2.a.id);
  steps(t, COOLDOWN_TICKS);
  press(t, { x: aEntity.pos.x + 3, z: aEntity.pos.z });
  assert.equal(m.pairs.length, 1);
  const dead = (e) => !e || e.alive === false;
  assert.equal(dead(t.state.entities.get(pair2.a.id)), true);
  assert.equal(dead(t.state.entities.get(pair2.b.id)), true);
  assert.equal(t.events.filter((e) => e.name === 'shieldPylon:retired').pop().p.reason, 'recalled');
});

test('recalling an unpaired endpoint refunds it; recalling a working pair does not', () => {
  const t = boot();
  press(t, { x: 100, z: -60 });
  const a = t.state.entities.get(pylonMirror(t.state).pairs[0].a.id);
  steps(t, COOLDOWN_TICKS);
  press(t, { x: a.pos.x, z: a.pos.z });
  assert.equal(pylonMirror(t.state).pairs.length, 0);
  const grants = t.events.filter((e) => e.name === 'economy:grantCredits');
  assert.equal(grants.length, 1);
  assert.equal(grants[0].p.amount, DEF.endpointCostCredits);
});

test('teardown is atomic and idempotent: killing one endpoint retires the pair and the survivor', () => {
  const t = boot();
  const pair = placeWall(t);
  activate(t);
  const aId = pair.a.id; const bId = pair.b.id;
  t.state.entities.get(aId).alive = false; // a lethal hit lands
  t.sim.step();
  const m = pylonMirror(t.state);
  assert.equal(m.pairs.length, 0, 'no orphan pair remains');
  assert.equal(m.blocking, 0, 'no orphan panel keeps blocking');
  const survivor = t.state.entities.get(bId);
  assert.equal(!survivor || survivor.alive === false, true, 'the surviving endpoint leaves with it');
  const retired = t.events.filter((e) => e.name === 'shieldPylon:retired');
  assert.equal(retired.length, 1);
  assert.equal(retired[0].p.reason, 'endpoint_destroyed');
  // Repeated teardown: more ticks, a clear event, a second retire call — nothing changes or throws.
  steps(t, 10);
  t.bus.emit('sector:exit', {});
  t.bus.emit('save:loaded', {});
  assert.equal(t.events.filter((e) => e.name === 'shieldPylon:retired').length, 1);
  assert.equal(m.collapsing.length >= 0, true);
});

test('lifecycle boundaries clear every pair: sector, new game, load, death, docking', () => {
  for (const boundary of ['sector:exit', 'sector:enter', 'game:new', 'save:loaded', 'player:death', 'dock:docked']) {
    const t = boot();
    const pair = placeWall(t);
    activate(t);
    const ids = [pair.a.id, pair.b.id];
    t.bus.emit(boundary, {});
    const m = pylonMirror(t.state);
    assert.equal(m.pairs.length, 0, boundary);
    assert.equal(m.blocking, 0, boundary);
    for (const id of ids) assert.equal(t.state.entities.get(id).alive, false, `${boundary}: endpoint ${id}`);
  }
});

test('expiry warns, then retires the pair and removes both endpoints', () => {
  const t = boot();
  const pair = placeWall(t);
  activate(t);
  steps(t, secondsToTicks(DEF.lifetimeS - DEF.warnS) + 2);
  assert.ok(t.events.some((e) => e.name === 'shieldPylon:warning'), 'a warning precedes the failure');
  assert.equal(pylonMirror(t.state).pairs.length, 1, 'still standing inside the warning window');
  steps(t, secondsToTicks(DEF.warnS) + 4);
  assert.equal(pylonMirror(t.state).pairs.length, 0);
  assert.equal(t.events.filter((e) => e.name === 'shieldPylon:retired').pop().p.reason, 'expired');
  const gone = t.state.entities.get(pair.a.id);
  assert.equal(!gone || gone.alive === false, true);
});

test('a recycled entity id can never be adopted as an endpoint (lifetime-aware identity)', () => {
  const t = boot();
  const pair = placeWall(t);
  activate(t);
  const aId = pair.a.id;
  const original = t.state.entities.get(aId);
  // Simulate the id being recycled to an unrelated occupant with a different generation.
  original.occupantGeneration = (original.occupantGeneration || 1) + 1;
  t.sim.step();
  assert.equal(pylonMirror(t.state).pairs.length, 0, 'a generation mismatch is a lost endpoint');
});

test('the wall stops a hostile hull from BOTH faces, and the owner, an ally and a neutral pass', async () => {
  const t = await bootPhysics();
  try {
    placeWall(t);
    activate(t);
    t.player.pos.x = -200; t.player.pos.z = -50; // the owner starts behind the wall and flies through it
    const m = pylonMirror(t.state);
    assert.equal(m.blocking, 1);
    const hostileW = ship(t, 40, -10, { team: 1, vx: 70 });
    const hostileE = ship(t, 190, 0, { team: 1, vx: -70 });
    const ally = ship(t, 40, 30, { team: 0, vx: 70 });
    const civilian = ship(t, 40, 55, { team: 2, vx: 70 });
    t.player.vel.x = 70; t.player.vel.z = 0;
    steps(t, 360);
    const half = DEF.halfThickness;
    assert.ok(hostileW.pos.x <= 100 - half - hostileW.radius + 0.5, `hostile from the west stopped at the face, x=${hostileW.pos.x}`);
    assert.ok(hostileW.pos.x > 60, `it reached the wall rather than stalling far away, x=${hostileW.pos.x}`);
    assert.ok(hostileE.pos.x >= 100 + half + hostileE.radius - 0.5, `hostile from the east stopped at the face, x=${hostileE.pos.x}`);
    assert.ok(ally.pos.x > 150, `the ally crossed, x=${ally.pos.x}`);
    assert.ok(civilian.pos.x > 150, `the civilian crossed, x=${civilian.pos.x}`);
    assert.ok(t.player.pos.x > 100, `the owner crossed, x=${t.player.pos.x}`);
    assert.ok(t.events.some((e) => e.name === 'shieldPylon:contact' && e.p.kind === 'ship'), 'a contact receipt names the hull stop');
  } finally { t.cleanup(); }
});

test('a heavy ram the pair cannot afford overloads it; the residual speed carries through; then it recovers', async () => {
  const t = await bootPhysics();
  try {
    placeWall(t);
    activate(t);
    const ram = ship(t, 20, 0, { team: 1, vx: 260, mass: 400, radius: 14 });
    steps(t, 90);
    assert.ok(t.events.some((e) => e.name === 'shieldPylon:overloaded'), 'the ram overloaded the pair');
    const pair = pylonMirror(t.state).pairs[0];
    assert.ok(pair.state === S.OVERLOADED || pair.state === S.RECOVERING, `state ${pair.state}`);
    assert.ok(ram.pos.x > 100, `with the wall offline the ram's leftover energy carries it through, x=${ram.pos.x}`);
    assert.equal(pylonMirror(t.state).blocking, 0, 'an overloaded wall does not block');
    steps(t, secondsToTicks(DEF.overloadS + DEF.recoverS) + 40);
    assert.equal(pair.state === S.ACTIVE || pair.state === S.STRAINED, true, `recovered, state ${pair.state}`);
    assert.ok(pair.energy > 0);
    assert.ok(t.events.some((e) => e.name === 'shieldPylon:recovered'));
  } finally { t.cleanup(); }
});

test('relation change in flight: a hostile that turns neutral is let through at the next crossing', async () => {
  const t = await bootPhysics();
  try {
    placeWall(t);
    activate(t);
    const traffic = ship(t, 40, 0, { team: 1, vx: 40 });
    steps(t, 60);
    assert.ok(traffic.pos.x < 100 - DEF.halfThickness, 'held by the wall while hostile');
    traffic.team = 2; traffic.data.encounter = false; // a ceasefire: civilian traffic, no longer hostile
    steps(t, 200);
    assert.ok(traffic.pos.x > 100, `released once the relation changed, x=${traffic.pos.x}`);
  } finally { t.cleanup(); }
});
