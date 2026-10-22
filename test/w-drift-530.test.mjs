// build_map §34 row 530 — Drift: throwable claim pylons, Claim Jump (E-06),
// Breaker Derby (E-39), and the Breaker Head's split rule as faction data.
import assert from 'node:assert/strict';
import test from 'node:test';

import { faction as DMC } from '../src/data/factions/dmc.js';
import { factionDrift } from '../src/systems/faction_drift.js';
import * as CLAIM_JUMP from '../src/data/encounters/704-claim-jump.js';
import * as DERBY from '../src/data/encounters/706-breaker-derby.js';

function makeBus() {
  const events = [];
  return { events, emit(name, payload) { events.push({ name, payload }); } };
}

function makeState() {
  return { entities: new Map(), simTime: 0, tick: 0, player: null, playerId: 'player' };
}

let seq = 0;
function spawn(state, spec) {
  const e = {
    id: spec.id || `e${++seq}`,
    alive: true,
    pos: { x: spec.x || 0, z: spec.z || 0 },
    vel: { x: spec.vx || 0, z: spec.vz || 0 },
    mass: spec.mass || 0,
    radius: spec.radius || 4,
    type: spec.type || 'ship',
    factionId: spec.factionId || null,
    data: spec.data || {},
  };
  state.entities.set(e.id, e);
  return e;
}

function makeSys(state, bus) {
  const sys = { ...factionDrift };
  sys.init({ state, bus, helpers: {} });
  return sys;
}

test('Drift kit declares pylon lobbers, derby breakers, the Claim Jump and the Derby', () => {
  const roles = DMC.shipRoles.map((r) => r.role);
  for (const r of ['pylon-lobber', 'derby-breaker']) assert.ok(roles.includes(r), `shipRoles includes ${r}`);
  assert.ok(DMC.custom.claimPylon.claimRadiusWu > 0 && DMC.custom.claimPylon.settleSpeed > 0);
  assert.equal(DMC.custom.claimJump.encounterId, 'claim_jump');
  assert.equal(DMC.custom.breakerDerby.encounterId, 'breaker_derby');
  assert.ok(DMC.custom.breakerHead.chunkCount[0] >= 3, 'the head splits to 3–5 chunks');
});

// ── claim pylons ──────────────────────────────────────────────────────────────────────────

test('a landed pylon stakes every rock in its radius; throwing it lifts the claim', () => {
  const state = makeState(); const bus = makeBus();
  const pylon = spawn(state, {
    id: 'pylon', x: 0, z: 0, mass: 8, type: 'beacon',
    data: { claimPylon: true, ownerId: 'player' },
  });
  const r1 = spawn(state, { id: 'r1', x: 100, z: 0, mass: 500, radius: 30, type: 'asteroid' });
  const r2 = spawn(state, { id: 'r2', x: 500, z: 0, mass: 500, radius: 30, type: 'asteroid' });
  const sys = makeSys(state, bus);
  sys.update(1 / 60, state);
  assert.equal(r1.data.claimedBy, 'player', 'the stake lands on the rock');
  assert.equal(r1.data.claimPylonId, 'pylon');
  assert.equal(r2.data.claimedBy, undefined, 'the far rock is outside the radius');
  assert.ok(bus.events.some((e) => e.name === 'drift:claimStaked' && e.payload.ownerId === 'player'));

  // Throw it again — the claim lifts off the old rocks.
  pylon.vel = { x: 30, z: 0 };
  sys.update(1 / 60, state);
  assert.equal(r1.data.claimedBy, undefined, 'the claim lifts when the pylon flies');
  assert.ok(bus.events.some((e) => e.name === 'drift:claimLifted'));

  // Lands somewhere else — the claim moves with it.
  pylon.pos.x = 480; pylon.vel = { x: 0, z: 0 };
  sys.update(1 / 60, state);
  assert.equal(r2.data.claimedBy, 'player', 'the claim re-stakes where it lands');
});

test('two crews contesting the same rock — the freshest stake wins', () => {
  const state = makeState(); const bus = makeBus();
  spawn(state, { id: 'pa', x: 0, z: 0, type: 'beacon', data: { claimPylon: true, ownerId: 'crew_a' } });
  const rock = spawn(state, { id: 'rock', x: 80, z: 0, type: 'asteroid' });
  const sys = makeSys(state, bus);
  sys.update(1 / 60, state);
  assert.equal(rock.data.claimedBy, 'crew_a');

  spawn(state, { id: 'pb', x: 40, z: 0, type: 'beacon', data: { claimPylon: true, ownerId: 'crew_b' } });
  sys.update(1 / 60, state);
  assert.equal(rock.data.claimedBy, 'crew_b', 'the newer stake takes the deed');
  assert.equal(rock.data.claimPylonId, 'pb');
  assert.ok(bus.events.some((e) => e.name === 'drift:claimContested'));
});

// ── Claim Jump (E-06) ────────────────────────────────────────────────────────────────────

function makeHarness() {
  const state = makeState();
  state.player = { id: 'player', alive: true, pos: { x: 0, z: 300 }, mass: 55, data: {} };
  const events = [];
  const reps = [];
  const live = {
    id: 'enc5', shapeId: 'claim_jump', squadId: 'sq5',
    plan: {
      zoneCenter: { x: 0, z: 0 },
      ships: [{ role: 'squad', pos: {} }, { role: 'escort', pos: {} }, { role: 'escort', pos: {} }],
    },
    anchor: null, roles: {}, ids: [], data: {}, vars: {},
    shape: CLAIM_JUMP.default, phase: 'pending', deadlineAt: 0,
  };
  const d = {
    state,
    now: () => state.simTime,
    player: () => state.player,
    stream: () => () => 0.4,
    spawnShips: (lv, ships) => ships.map((sh) => {
      const e = spawn(state, { x: sh.pos.x, z: sh.pos.z, mass: 200, factionId: sh.factionId, data: { ai: {} } });
      lv.roles[e.id] = sh.role; lv.ids.push(e.id);
      return e.id;
    }),
    entsOf: (lv, role) => lv.ids.map((id) => state.entities.get(id)).filter((e) => e && (!role || lv.roles[e.id] === role)),
    spawnProp: (lv, opts) => spawn(state, {
      x: opts.pos.x, z: opts.pos.z, mass: opts.mass, radius: opts.radius,
      type: opts.type || 'beacon', data: { tetherable: opts.tetherable !== false },
    }),
    say: () => true,
    emit: (name, payload) => events.push({ name, payload }),
    rep: (f, delta, reason) => reps.push({ factionId: f, delta, reason }),
    grant: () => {},
    charge: () => {},
    resolve: (lv, outcome) => { lv.phase = 'done'; lv.outcome = outcome; },
    abort: (lv, reason) => { lv.phase = 'done'; lv.outcome = `abort:${reason}`; },
  };
  return { state, d, live, events, reps };
}

function tickJump(h, seconds, integrate = true) {
  const dt = 1 / 60;
  for (let i = 0; i < Math.ceil(seconds * 60); i++) {
    h.state.simTime += dt;
    if (integrate) {
      const charge = h.state.entities.get(h.live.data.jump.chargeId);
      if (charge && charge.alive !== false) {
        charge.pos.x += charge.vel.x * dt;
        charge.pos.z += charge.vel.z * dt;
      }
    }
    CLAIM_JUMP.runtime.tick(h.d, h.live, h.state, h.state.simTime);
    if (h.live.phase === 'done') break;
  }
}

test('Claim Jump fires: shaft crew digs, saboteur leaves, charge drifts in on the keystone', () => {
  const h = makeHarness();
  CLAIM_JUMP.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.jump;
  const saboteur = h.state.entities.get(rec.saboteurId);
  assert.match(saboteur.data.scanLabel, /SABOTEUR/);
  assert.equal(rec.minerIds.length, 2);
  const charge = h.state.entities.get(rec.chargeId);
  const keystone = h.state.entities.get(rec.keystoneId);
  const dist = Math.hypot(charge.pos.x - keystone.pos.x, charge.pos.z - keystone.pos.z);
  assert.ok(dist > 200, 'the fuse is a distance, not a clock');
  assert.ok(charge.vel.x !== 0 || charge.vel.z !== 0, 'the charge is inbound');
});

test('brace the keystone with the Line and the shaft holds', () => {
  const h = makeHarness();
  CLAIM_JUMP.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.jump;
  CLAIM_JUMP.runtime.event(h.d, h.live, h.state, 'tetherAttached', { actorId: 'player', targetId: rec.keystoneId });
  assert.equal(h.state.entities.get(rec.keystoneId).data.braceBy, 'player');
  tickJump(h, DMC.custom.claimJump.braceHoldS + 0.5, false);
  assert.equal(h.live.outcome, 'shaft_braced');
  assert.ok(h.reps.some((r) => r.delta === 4));
});

test('fling the charge into open space and there is nothing left to detonate', () => {
  const h = makeHarness();
  CLAIM_JUMP.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.jump;
  CLAIM_JUMP.runtime.event(h.d, h.live, h.state, 'tetherAttached', { actorId: 'player', targetId: rec.chargeId });
  assert.equal(rec.ventedBy, 'player');
  const charge = h.state.entities.get(rec.chargeId);
  const keystone = h.state.entities.get(rec.keystoneId);
  charge.pos.x = keystone.pos.x + DMC.custom.claimJump.chargeFlingWu + 50;
  tickJump(h, 0.2, false);
  assert.equal(h.live.outcome, 'charge_vented');
});

test('let the charge arrive and the shaft comes down on the crew', () => {
  const h = makeHarness();
  CLAIM_JUMP.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.jump;
  tickJump(h, DMC.custom.claimJump.chargeFlightS + 2);
  assert.equal(h.live.outcome, 'shaft_collapsed');
  assert.equal(h.state.entities.get(rec.minerIds[0]).data.buried, true);
  assert.ok(h.reps.some((r) => r.delta === -4));
});

test('put the saboteur down and the shaft crew saw who swung it', () => {
  const h = makeHarness();
  CLAIM_JUMP.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.jump;
  CLAIM_JUMP.runtime.event(h.d, h.live, h.state, 'squadKill', { id: rec.saboteurId, byPlayer: true });
  assert.equal(h.live.outcome, 'saboteur_downed');
  assert.ok(h.reps.some((r) => r.delta === 3));
});

// ── Breaker Derby (E-39) ─────────────────────────────────────────────────────────────────

function makeDerbyHarness() {
  const state = makeState();
  state.player = { id: 'player', alive: true, pos: { x: 0, z: 500 }, mass: 55, data: {} };
  const events = [];
  const reps = [];
  const live = {
    id: 'enc6', shapeId: 'breaker_derby', squadId: 'sq6',
    plan: {
      zoneCenter: { x: 0, z: 0 },
      ships: [
        { role: 'squad', pos: {} }, { role: 'squad', pos: {} },
        { role: 'escort', pos: {} }, { role: 'escort', pos: {} },
      ],
    },
    anchor: null, roles: {}, ids: [], data: {}, vars: {},
    shape: DERBY.default, phase: 'pending', deadlineAt: 0,
  };
  const d = {
    state,
    now: () => state.simTime,
    player: () => state.player,
    stream: () => () => 0.6,
    spawnShips: (lv, ships) => ships.map((sh) => {
      const e = spawn(state, { x: sh.pos.x, z: sh.pos.z, mass: 200, factionId: sh.factionId, data: { ai: {} } });
      lv.roles[e.id] = sh.role; lv.ids.push(e.id);
      return e.id;
    }),
    entsOf: (lv, role) => lv.ids.map((id) => state.entities.get(id)).filter((e) => e && (!role || lv.roles[e.id] === role)),
    spawnProp: (lv, opts) => spawn(state, {
      x: opts.pos.x, z: opts.pos.z, mass: opts.mass, radius: opts.radius,
      type: opts.type || 'beacon', data: {},
    }),
    say: () => true,
    emit: (name, payload) => events.push({ name, payload }),
    rep: (f, delta, reason) => reps.push({ factionId: f, delta, reason }),
    resolve: (lv, outcome) => { lv.phase = 'done'; lv.outcome = outcome; },
    abort: (lv, reason) => { lv.phase = 'done'; lv.outcome = `abort:${reason}`; },
  };
  return { state, d, live, events, reps };
}

function tickDerby(h, seconds) {
  const dt = 1 / 60;
  for (let i = 0; i < Math.ceil(seconds * 60); i++) {
    h.state.simTime += dt;
    DERBY.runtime.tick(h.d, h.live, h.state, h.state.simTime);
    if (h.live.phase === 'done') break;
  }
}

test('the derby fires: two crews circle the biggest rock on the field', () => {
  const h = makeDerbyHarness();
  DERBY.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.derby;
  const rock = h.state.entities.get(rec.rockId);
  assert.equal(rock.data.derbyRock, true);
  assert.equal(rock.data.integrity, 120);
  assert.equal(Object.keys(rec.slamAt).length, 4, 'four breakers on the clock');
});

test('crews slam on their rhythm and the split goes to the leading crew', () => {
  const h = makeDerbyHarness();
  DERBY.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.derby;
  tickDerby(h, 40); // enough rhythm for 120 integrity at 8/slam/4s across 4 breakers
  assert.equal(h.live.phase, 'done');
  assert.match(h.live.outcome, /crew_[ab]_wins|derby_draw/);
  assert.ok(h.events.some((e) => e.name === 'derby:slam'));
  assert.ok(h.events.some((e) => e.name === 'derby:finished'));
  // The split leaves throwable chunks with a Deed Name on the biggest.
  assert.ok(rec.chunkIds.length >= 3 && rec.chunkIds.length <= 5);
  const first = h.state.entities.get(rec.chunkIds[0]);
  assert.equal(first.data.deedName, 'DERBY ROCK');
});

test('a player-thrown chunk into the derby rock scores to the player — and can win it', () => {
  const h = makeDerbyHarness();
  DERBY.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.derby;
  const rock = h.state.entities.get(rec.rockId);
  // The player latches a chunk — the derby marks it theirs.
  const chunk = spawn(h.state, { id: 'ammo', x: 300, z: 0, mass: 300, radius: 10, type: 'asteroid', vx: -80, data: {} });
  DERBY.runtime.event(h.d, h.live, h.state, 'tetherAttached', { actorId: 'player', targetId: 'ammo' });
  assert.equal(chunk.data.thrownBy, 'player');
  // It hits the skin moving fast — a slam scored to 'player'.
  chunk.pos.x = rock.pos.x + rock.radius + 5;
  tickDerby(h, 0.1);
  assert.ok(rec.scores.player >= 150, `player slam scored (${rec.scores.player})`);
  tickDerby(h, 30);
  assert.equal(h.live.outcome, 'player_wins_derby');
  assert.ok(h.reps.some((r) => r.delta === 4));
});
