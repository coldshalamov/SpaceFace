// build_map §34 row 531 — Reach: the Nest Carrier (E-08), the Sker Haven Trophy Wall,
// and the chained gate camp kit.
import assert from 'node:assert/strict';
import test from 'node:test';

import { faction as REACH } from '../src/data/factions/reach.js';
import * as NEST from '../src/data/encounters/705-the-nest.js';

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

function makeHarness() {
  const state = makeState();
  state.player = { id: 'player', alive: true, pos: { x: 0, z: 400 }, mass: 55, data: {} };
  const events = [];
  const live = {
    id: 'enc7', shapeId: 'the_nest', squadId: 'sq7',
    plan: { zoneCenter: { x: 0, z: 0 }, ships: [{ role: 'squad', pos: {} }] },
    anchor: null, roles: {}, ids: [], data: {}, vars: {},
    shape: NEST.default, phase: 'pending', deadlineAt: 0,
  };
  const d = {
    state,
    now: () => state.simTime,
    player: () => state.player,
    stream: () => () => 0.4,
    spawnShips: (lv, ships) => ships.map((sh) => {
      const e = spawn(state, { x: sh.pos.x, z: sh.pos.z, mass: 2000, radius: 40, factionId: sh.factionId, data: { ai: {} } });
      lv.roles[e.id] = sh.role; lv.ids.push(e.id);
      return e.id;
    }),
    entsOf: (lv, role) => lv.ids.map((id) => state.entities.get(id)).filter((e) => e && (!role || lv.roles[e.id] === role)),
    spawnProp: (lv, opts) => spawn(state, {
      x: opts.pos.x, z: opts.pos.z, mass: opts.mass, radius: opts.radius,
      type: 'beacon', data: {},
    }),
    say: () => true,
    // Explicit combat port for this source-runtime test; the integration suite uses the real kernel.
    emit: (name, payload) => {
      events.push({ name, payload });
      if (name === 'projectile:hit') {
        const victim = state.entities.get(payload.targetId);
        if (victim && victim.alive) {
          victim.alive = false;
          NEST.runtime.event(d, live, state, 'squadKill', { id: victim.id });
        }
      }
    },
    rep: () => {},
    resolve: (lv, outcome) => { lv.phase = 'done'; lv.outcome = outcome; },
    abort: (lv, reason) => { lv.phase = 'done'; lv.outcome = `abort:${reason}`; },
  };
  return { state, d, live, events };
}

function tickNest(h, seconds) {
  const dt = 1 / 60;
  for (let i = 0; i < Math.ceil(seconds * 60); i++) {
    h.state.simTime += dt;
    NEST.runtime.tick(h.d, h.live, h.state, h.state.simTime);
    if (h.live.phase === 'done') break;
  }
}

test('Reach kit declares the nest carrier, trophy wall, and chained gate camps', () => {
  const roles = REACH.shipRoles.map((r) => r.role);
  assert.ok(roles.includes('nest-carrier'));
  assert.ok(roles.includes('trophy-barge'));
  assert.ok(REACH.custom.nestCarrier.doorCount >= 2);
  assert.equal(REACH.custom.trophyWall.stationId, 'sker_haven');
  assert.ok(REACH.custom.gateCamps.chainTetherable === true, 'chain links are cuttable');
  assert.equal(REACH.custom.theNest.encounterId, 'the_nest');
});

test('the nest fires: one carrier, sealed belly doors, wasps launch on the rhythm', () => {
  const h = makeHarness();
  NEST.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.nest;
  assert.equal(rec.doorIds.length, REACH.custom.nestCarrier.doorCount);
  const carrier = h.state.entities.get(rec.carrierId);
  assert.match(carrier.data.scanLabel, /NEST CARRIER/);
  assert.equal(carrier.data.ai.passive, true, 'the carrier holds — its wasps hunt');

  tickNest(h, REACH.custom.nestCarrier.launchIntervalS + 1);
  assert.ok(rec.launched >= 1, 'a wasp is out on the rhythm');
  const wasp = h.state.entities.get(rec.waspIds[0]);
  assert.equal(wasp.data.ai.targetId, 'player', 'the wasp hunts the player');
});

test('rip a belly door off its socket and the whole nest vents at once', () => {
  const h = makeHarness();
  NEST.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.nest;
  const door = h.state.entities.get(rec.doorIds[0]);
  const carrier = h.state.entities.get(rec.carrierId);
  NEST.runtime.event(h.d, h.live, h.state, 'tetherAttached', { actorId: 'player', targetId: door.id });
  // Drag the latched door past the tear radius — it rips free.
  door.pos.x = carrier.pos.x + door.data.socket.dx + REACH.custom.nestCarrier.tearWu + 10;
  tickNest(h, 0.2);
  assert.equal(door.data.torn, true);
  assert.equal(rec.vented, true, 'half-stripped vents the whole nest');
  assert.equal(rec.remaining, 0, 'the nest emptied in one vent');
  assert.equal(rec.waspIds.length, REACH.custom.nestCarrier.nestSize);
});

test('throw its own wasps back through the bays and the carrier guts out — plate on the wall', () => {
  const h = makeHarness();
  NEST.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.nest;
  tickNest(h, REACH.custom.nestCarrier.launchIntervalS * 3 + 1); // a few wasps out
  assert.ok(rec.waspIds.length >= 3);
  const carrier = h.state.entities.get(rec.carrierId);
  // The player returns three wasps through the belly.
  for (let i = 0; i < REACH.custom.nestCarrier.waspReturnHits; i++) {
    const wasp = h.state.entities.get(rec.waspIds[i]);
    NEST.runtime.event(h.d, h.live, h.state, 'tetherAttached', { actorId: 'player', targetId: wasp.id });
    wasp.pos.x = carrier.pos.x; wasp.pos.z = carrier.pos.z - 20;
    // Explicit contact port; the composition suite calls the real physics impact producer.
    NEST.runtime.event(h.d, h.live, h.state, 'physicsImpact', {
      aId: rec.doorIds[0], bId: wasp.id, impulse: 100, tick: h.state.tick,
      pos: { ...h.state.entities.get(rec.doorIds[0]).pos },
    });
    tickNest(h, 0.1);
    if (h.live.phase === 'done') break;
  }
  assert.equal(h.live.outcome, 'carrier_gutted');
  const wall = h.state.trophyWall;
  assert.ok(wall && wall.plates.length === 1, 'a plate hangs at Sker Haven');
  assert.match(wall.plates[0].label, /NEST CARRIER/);
  assert.equal(wall.plates[0].stationId, 'sker_haven');
  assert.ok(h.events.some((e) => e.name === 'reach:trophyHung'));
});

test('shoot the carrier down and the plate still goes on the wall', () => {
  const h = makeHarness();
  NEST.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.nest;
  h.state.entities.get(rec.carrierId).alive = false;
  tickNest(h, 0.1);
  assert.equal(h.live.outcome, 'carrier_down');
  assert.equal(h.state.trophyWall.plates.length, 1);
});

test('let it leave and the next lane hears the doors cycling (the FF)', () => {
  const h = makeHarness();
  NEST.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.nest;
  const carrier = h.state.entities.get(rec.carrierId);
  carrier.pos.x = 5000; carrier.pos.z = 5000; // it escapes
  // Move the doors with it so they stay "held" (not torn, not relevant).
  tickNest(h, 0.2);
  assert.equal(h.live.outcome, 'carrier_escapes');
  assert.ok(h.state.story.flags.reach_nest_raids_next_lane, 'the FF is recorded');
});
