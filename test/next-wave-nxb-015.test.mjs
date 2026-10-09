// NXB-015 — convoys negotiate a narrow obstruction instead of shoving every member through it.
// One moving convoy at one constrained segment: stable passage order, leading freight commits,
// followers wait at hull-clearance stand-off points, the escort keeps station on its ward, the
// player can interrupt and release the flow through real geometry, and a stalled order releases
// instead of pinning the convoy forever.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ENCOUNTERS } from '../src/data/encounters.js';
import { ENCOUNTER_SCRIPTS } from '../src/systems/encounterScripts.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';

const WARDEN = 'vael_warden_convoy';

function directorOver(state, emitted) {
  const d = Object.create(encounterDirector);
  d.state = state;
  d.emit = (name, payload) => { emitted.push({ name, payload }); };
  return d;
}

function syncEntityList(state) {
  state.entityList = [...state.entities.values()];
}

function makeState() {
  const state = {
    simTime: 100,
    tick: 6000,
    playerId: 'player',
    player: {
      credits: 500,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      cargo: { items: {}, usedVolume: 0, usedMass: 0 },
    },
    world: {},
    entities: new Map(),
    entityList: [],
  };
  return state;
}

function addBlocker(state, id, x, z, radius = 12, type = 'ship') {
  const e = {
    id,
    type,
    alive: true,
    collides: true,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius,
    team: 1,
    data: {},
  };
  state.entities.set(id, e);
  syncEntityList(state);
  return e;
}

function scriptDelegate(state, emitted) {
  const dir = directorOver(state, emitted);
  let seq = 0;
  return {
    now: () => state.simTime,
    player: () => state.entities.get(state.playerId) || state.player,
    stream: () => () => 0.5,
    stationsInSector: () => [],
    spawnShips: (live, ships) => ships.map((s) => {
      const id = `ent-${seq++}`;
      live.ids.push(id);
      live.roles[id] = s.role;
      state.entities.set(id, {
        id,
        type: 'ship',
        alive: true,
        collides: true,
        pos: { ...s.pos },
        vel: { x: 0, z: 0 },
        rot: 0,
        radius: s.role === 'escort' ? 8 : 10,
        team: s.team,
        data: { ai: { passive: true }, lootTableId: s.archetype || s.role, worldRecordId: `wr_${id}` },
      });
      syncEntityList(state);
      return id;
    }),
    entsOf: (live, role) => {
      const out = [];
      for (const id of live.ids) {
        if (role && live.roles[id] !== role) continue;
        const e = state.entities.get(id);
        if (e && e.alive !== false) out.push(e);
      }
      return out;
    },
    aliveCount: (live, role) => Object.entries(live.roles || {})
      .filter(([, r]) => !role || r === role)
      .map(([id]) => state.entities.get(id))
      .filter((e) => e && e.alive !== false).length,
    setPassive: (live, passive, role) => { emitted.push({ name: 'setPassive', payload: { passive, role } }); },
    say: (live, channel, textOrId, vars, o) => {
      emitted.push({ name: `say:${channel}`, payload: { textOrId, vars, o } });
    },
    offerChoices: (live, ids, timeout, deadline) => dir.offerChoices(live, ids, timeout, deadline),
    despawnAll: (live, r) => { emitted.push({ name: 'despawnAll', payload: { r } }); },
    resolve: (live, outcome, o) => {
      emitted.push({ name: 'resolved', payload: { outcome, vars: (o && o.vars) || live.vars } });
      return outcome;
    },
    abort: (live, reason) => { emitted.push({ name: 'aborted', payload: { reason } }); return 'aborted'; },
    rep: (faction, delta, reason) => { emitted.push({ name: 'rep', payload: { faction, delta, reason } }); },
    grant: (amount, reason) => { emitted.push({ name: 'grant', payload: { amount, reason } }); },
    tradePressure: (stationId, cargoId, units) => {
      emitted.push({ name: 'tradePressure', payload: { stationId, cargoId, units } });
    },
    freightLoss: (live, o) => { emitted.push({ name: 'freightLoss', payload: o }); return true; },
    clearPredation: (live, reason) => { emitted.push({ name: 'clearPredation', payload: { reason } }); },
    dangerImpulse: () => {},
    emit: (name, payload) => { emitted.push({ name, payload }); },
  };
}

// A three-hauler convoy with a two-ship escort screen — enough freight for a real queue.
function liveConvoy() {
  const shape = ENCOUNTERS[WARDEN];
  return {
    id: 'live-nxb015',
    shapeId: WARDEN,
    shape,
    plan: {
      zoneType: 'trade_lane',
      ships: [
        { role: 'hauler', archetype: 'mule_trader' },
        { role: 'hauler', archetype: 'mule_trader' },
        { role: 'hauler', archetype: 'mule_trader' },
        { role: 'escort', archetype: 'warden_escort' },
        { role: 'escort', archetype: 'warden_escort' },
      ],
    },
    ids: [],
    vars: {},
    data: {},
    roles: {},
    phase: 'telegraph',
    factionId: shape.factionId,
    sectorId: 'sector_test',
    zoneId: 'zone_test',
    anchor: { x: 0, z: 0 },
    zoneRadius: 800,
  };
}

// Fire produces a fixed start/end from the 0.5-stream; exact member positions are set after fire
// so every assertion is pure geometry, not scatter-roll arithmetic.
function firedConvoy(state, emitted) {
  const d = scriptDelegate(state, emitted);
  const live = liveConvoy();
  ENCOUNTER_SCRIPTS.convoy.fire(d, live, state);
  assert.equal(live.phase, 'transit');
  const [h0, h1, h2, e0, e1] = [...live.ids].map((id) => state.entities.get(id));
  h0.pos = { x: -100, z: 0 };
  h1.pos = { x: -160, z: 0 };
  h2.pos = { x: -220, z: 0 };
  e0.pos = { x: -240, z: 30 };
  e1.pos = { x: -240, z: -30 };
  return { d, live, haulers: [h0, h1, h2], escorts: [e0, e1] };
}

const tick = (d, live, state) => ENCOUNTER_SCRIPTS.convoy.tick(d, live, state, state.simTime);
const intent = (e) => e.data.intent || {};

test('ordered passage: leading freight commits, followers hold hull-clearance stand-off, escorts guard the ward', () => {
  const emitted = [];
  const state = makeState();
  const { d, live, haulers, escorts } = firedConvoy(state, emitted);
  const [h0, h1, h2] = haulers;
  // The player's tow parked in the lane is the obstruction — ordinary geometry, nothing scripted.
  const player = addBlocker(state, 'player', 150, 0, 12);
  live.data.end = { x: 1280, z: 0 };
  tick(d, live, state);

  const passage = live.data.passage;
  assert.ok(passage, 'a latched passage order exists while the gap is blocked');
  assert.deepEqual(passage.order, [h0.id, h1.id, h2.id], 'frontmost freight first, stable order');
  assert.equal(passage.committedId, h0.id, 'leading freight is the committed hull');

  // Committed hull steers the route endpoint; it does not park.
  assert.ok(intent(h0).tx > 1000 && Math.abs(intent(h0).tz) < 1, 'committed freight drives the gap');

  // Followers wait at distinct stand-off points behind the blocker, spaced by hull clearance —
  // never one shared parking point.
  const hold1 = intent(h1), hold2 = intent(h2);
  assert.ok(hold1.tx < 150 - 12 - 16 + 1, `first stand-off sits behind the gap mouth, got ${hold1.tx}`);
  assert.ok(Math.abs(hold1.tx - hold2.tx) >= h1.radius + h2.radius + 16 - 1,
    `stand-off spacing uses hull clearance: ${hold1.tx} vs ${hold2.tx}`);
  assert.ok(Math.abs(hold1.tz) < 1 && Math.abs(hold2.tz) < 1, 'the file forms on the lane behind the obstruction');

  // Escorts keep station on the rear hauler — flank positions trailing the ward, not the endpoint.
  for (const esc of escorts) {
    const t = intent(esc);
    assert.ok(t.tx < h2.pos.x, `escort holds behind the ward, got ${t.tx}`);
    assert.ok(Math.abs(t.tz) >= h2.radius + esc.radius + 10, `escort flanks the lane, got ${t.tz}`);
  }
  player.alive = true; // blocker intact at end of assertions
});

test('player-cleared gap releases the order one member at a time — a stable sequence, not a surge', () => {
  const emitted = [];
  const state = makeState();
  const { d, live, haulers } = firedConvoy(state, emitted);
  const [h0, h1, h2] = haulers;
  for (const h of haulers) h.data.cargoManifest = { manifestId: `fm_${h.id}`, lines: [{ commodityId: 'cmdty_x', qty: 4 }] };
  const player = addBlocker(state, 'player', 150, 0, 12);
  live.data.end = { x: 1280, z: 0 };
  tick(d, live, state);
  assert.ok(live.data.passage, 'queue formed');

  // The player moves off the lane: real geometry releasing the obstruction. The committed hull
  // is released immediately; the rest of the order drains through the latched slot one at a
  // time instead of surging together (NXI-059).
  player.pos = { x: 150, z: 400 };
  state.simTime += 1;
  tick(d, live, state);
  assert.ok(live.data.passage, 'the slot survives the cleared body until the order drains');
  assert.equal(live.data.passage.committedId, h0.id, 'the committed member is released first');
  assert.ok(intent(h0).tx > 1000, 'released member resumes the route');
  assert.ok(intent(h2).tx < 150, 'the tail still waits at its stand-off point');

  // Committed through the slot: the next member commits; the tail keeps waiting.
  h0.pos = { x: 220, z: 0 };
  state.simTime += 1;
  tick(d, live, state);
  assert.equal(live.data.passage.committedId, h1.id);
  h1.pos = { x: 220, z: 0 };
  state.simTime += 1;
  tick(d, live, state);
  assert.equal(live.data.passage.committedId, h2.id);
  h2.pos = { x: 220, z: 0 };
  state.simTime += 1;
  tick(d, live, state);
  assert.equal(live.data.passage, undefined, 'order fully drained — passage over');

  for (const h of haulers) {
    assert.ok(intent(h).tx > 1000, `${h.id} resumes the route, got ${intent(h).tx}`);
    assert.equal(h.data.worldRecordId, `wr_${h.id}`, 'identity intact through the reform');
    assert.equal(h.data.cargoManifest.manifestId, `fm_${h.id}`, 'cargo intact through the reform');
  }
});

test('committed hull transits first; the order releases one member at a time', () => {
  const emitted = [];
  const state = makeState();
  const { d, live, haulers } = firedConvoy(state, emitted);
  const [h0, h1, h2] = haulers;
  addBlocker(state, 'player', 150, 0, 12);
  live.data.end = { x: 1280, z: 0 };
  tick(d, live, state);
  assert.equal(live.data.passage.committedId, h0.id);

  // Lead hauler clears the gap: next in the latched order becomes committed; the last still waits.
  h0.pos = { x: 220, z: 0 };
  state.simTime += 1;
  tick(d, live, state);
  assert.equal(live.data.passage.committedId, h1.id, 'next hull in order commits after the lead transits');
  assert.ok(intent(h0).tx > 1000, 'the hull already through keeps driving the route');
  assert.ok(intent(h2).tx < 150, `the tail still waits behind the gap, got ${intent(h2).tx}`);
  assert.deepEqual(live.data.passage.order, [h0.id, h1.id, h2.id], 'the latched order does not reshuffle');

  // Middle hull through: the tail commits. Once all freight passes, the record dissolves.
  h1.pos = { x: 220, z: 0 };
  state.simTime += 1;
  tick(d, live, state);
  assert.equal(live.data.passage.committedId, h2.id);
  h2.pos = { x: 220, z: 0 };
  state.simTime += 1;
  tick(d, live, state);
  assert.equal(live.data.passage, undefined, 'whole group through — ordered passage is over');
});

test('a lost member drops out of the local wait condition (NXI-058)', () => {
  const emitted = [];
  const state = makeState();
  const { d, live, haulers } = firedConvoy(state, emitted);
  const [h0, h1, h2] = haulers;
  addBlocker(state, 'player', 150, 0, 12);
  live.data.end = { x: 1280, z: 0 };
  tick(d, live, state);
  assert.equal(live.data.passage.committedId, h0.id);

  // The middle hauler dies mid-queue: the tail stops waiting on a hull that cannot move and the
  // order contracts — the tail's stand-off now trails the committed leader, not the corpse.
  h1.alive = false;
  state.simTime += 1;
  tick(d, live, state);
  assert.equal(live.data.passage.committedId, h0.id, 'live leader still commits');
  const hold2 = intent(h2);
  assert.ok(hold2.tx <= h0.pos.x - (h0.radius + h2.radius + 16) + 1,
    `tail trails the live leader, not the lost member: ${hold2.tx}`);

  // Kill the leader too: the tail becomes the committed hull itself — no dead wait survives.
  h0.alive = false;
  state.simTime += 1;
  tick(d, live, state);
  assert.equal(live.data.passage.committedId, h2.id, 'last living hauler is released to commit');
  assert.ok(intent(h2).tx > 1000, 'surviving freight drives the gap');
});

test('a permanently blocked gap releases the order instead of pinning the convoy forever', () => {
  const emitted = [];
  const state = makeState();
  const { d, live, haulers, escorts } = firedConvoy(state, emitted);
  addBlocker(state, 'player', 150, 0, 12);
  live.data.end = { x: 1280, z: 0 };
  tick(d, live, state);
  assert.ok(live.data.passage, 'queue formed');
  const committed = haulers[0];

  // The committed hull never advances (the tow will not move): after the stall window the local
  // order releases — every member steers free — and a re-queue cooldown is booked.
  state.simTime += 19;
  tick(d, live, state);
  assert.equal(live.data.passage, undefined, 'stalled commitment released the order');
  assert.equal(live.data.passageHoldUntil, state.simTime + 14, 'release cooldown booked');
  for (const e of [...haulers, ...escorts]) {
    assert.ok(intent(e).tx > 1000, `${e.id} steers free during release, got ${intent(e).tx}`);
  }

  // During the cooldown the convoy shoves free — no fresh queue.
  state.simTime += 5;
  tick(d, live, state);
  assert.equal(live.data.passage, undefined, 'still released inside the cooldown');
  // After the cooldown lapses the probe recomputes a fresh order against the same geometry.
  state.simTime += 10;
  tick(d, live, state);
  assert.ok(live.data.passage, 'order recomputes after release — recompute half of release/recompute');
  assert.equal(live.data.passage.committedId, committed.id);
});

test('a clear lane never latches an order — ordinary transit is untouched', () => {
  const emitted = [];
  const state = makeState();
  const { d, live, haulers, escorts } = firedConvoy(state, emitted);
  addBlocker(state, 'player', 150, 400, 12);   // parked far off the lane — not in the corridor
  live.data.end = { x: 1280, z: 0 };
  tick(d, live, state);
  assert.equal(live.data.passage, undefined);
  for (const e of [...haulers, ...escorts]) {
    assert.ok(intent(e).tx > 1000 && Math.abs(intent(e).tz) < 1, `${e.id} steers the endpoint as before`);
  }
});
