// build_map §34 row 516 — Meridian: cargo spines with breakable couplers, hull tickers
// that count a drifting box's value down, the Toll Pylon def, and Spine Break (E-05).
import assert from 'node:assert/strict';
import test from 'node:test';

import { faction as MTS } from '../src/data/factions/mts.js';
import { factionMeridian } from '../src/systems/faction_meridian.js';
import * as SPINE_BREAK from '../src/data/encounters/701-spine-break.js';

function makeBus() {
  const events = [];
  return { events, emit(name, payload) { events.push({ name, payload }); } };
}

function makeState() {
  return { entities: new Map(), simTime: 0, tick: 0, player: null };
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
    type: spec.type || 'container',
    factionId: spec.factionId || null,
    data: spec.data || {},
  };
  state.entities.set(e.id, e);
  return e;
}

function makeSys(state, bus) {
  const sys = { ...factionMeridian };
  sys.init({ state, bus, helpers: {} });
  return sys;
}

function spawnSpine(state, gaps = [0, 46, 92, 138]) {
  // Tug at index 0; containers behind it at link spacing on -x.
  const mk = (i, x) => spawn(state, {
    id: `sp${i}`, x, z: 0, mass: i === 0 ? 200 : 40,
    type: i === 0 ? 'ship' : 'container', factionId: 'faction_mts',
    data: { spineId: 'spineA', spineIndex: i, cargoValueCr: i === 0 ? undefined : 4000 },
  });
  return gaps.map((x, i) => mk(i, -x));
}

// ── faction data ──────────────────────────────────────────────────────────────────────────

test('Meridian kit declares spine tug, broker yacht, couplers, tickers and the Toll Pylon', () => {
  const roles = MTS.shipRoles.map((r) => r.role);
  for (const r of ['spine-tug', 'broker-yacht']) assert.ok(roles.includes(r), `shipRoles includes ${r}`);
  const c = MTS.custom.cargoSpine;
  assert.equal(c.containerCount[0], 4);
  assert.equal(c.containerCount[1], 12);
  assert.ok(c.couplerSnapSpeed > 0 && c.couplerStretchWu > c.linkGapWu && c.recoupleWu > 0);
  assert.ok(MTS.custom.hullTicker.valueBleedPerS > 0 && MTS.custom.hullTicker.salvageFloorCr > 0);
  assert.ok(MTS.custom.tollPylon.archWidthWu > 0 && MTS.custom.tollPylon.minTollCr > 0);
  assert.equal(MTS.custom.spineBreak.encounterId, 'spine_break');
});

// ── couplers break ────────────────────────────────────────────────────────────────────────

test('a thrown-rock-speed hit snaps the coupler — the whole tail goes loose', () => {
  const state = makeState(); const bus = makeBus();
  const [tug, c1, c2, c3] = spawnSpine(state);
  const sys = makeSys(state, bus);
  sys.update(1 / 60, state);
  assert.equal(c1.data.spineLoose, undefined, 'linked containers hold');

  // The rock hits c1: its velocity spikes past the snap threshold relative to the tug.
  c1.vel = { x: 80, z: 0 };
  sys.update(1 / 60, state);
  assert.equal(c1.data.spineLoose, true, 'the hit box is loose');
  assert.equal(c2.data.spineLoose, true, 'everything behind the break spills');
  assert.equal(c3.data.spineLoose, true);
  assert.equal(c1.data.lostFromSpineId, 'spineA');
  assert.equal(tug.data.spineLoose, undefined, 'the tug keeps the train stub');
  const ev = bus.events.find((e) => e.name === 'meridian:couplerSnapped');
  assert.ok(ev, 'the snap is an event');
  assert.equal(ev.payload.atIndex, 1);
  assert.deepEqual(ev.payload.tailIds, ['sp1', 'sp2', 'sp3']);
});

test('a coupler stretched past its limit lets go; a dead tug spills the whole train', () => {
  const state = makeState(); const bus = makeBus();
  const [tug, c1] = spawnSpine(state, [0, 46]);
  const sys = makeSys(state, bus);
  // Drag c1 out past the stretch.
  c1.pos.x = -200;
  sys.update(1 / 60, state);
  assert.equal(c1.data.spineLoose, true, 'a torn joint lets go');

  // Fresh scene: kill the tug and the train behind it is all loose mass.
  const state2 = makeState(); const bus2 = makeBus();
  const [tug2, a, b] = spawnSpine(state2, [0, 46, 92]);
  tug2.alive = false;
  makeSys(state2, bus2).update(1 / 60, state2);
  assert.equal(a.data.spineLoose, true);
  assert.equal(b.data.spineLoose, true, 'a spine with no head is a salvage field');
});

// ── re-couple ────────────────────────────────────────────────────────────────────────────

test('drift a loose container back to the tail and the joint closes — re-coupling is physical', () => {
  const state = makeState(); const bus = makeBus();
  const [tug, c1] = spawnSpine(state, [0, 46]);
  c1.pos.x = -200; // torn loose
  const sys = makeSys(state, bus);
  sys.update(1 / 60, state);
  assert.equal(c1.data.spineLoose, true);

  // The pilot drags it back to the tail: the joint closes behind it.
  c1.pos.x = -30; c1.pos.z = 0;
  c1.vel = { x: 0, z: 0 };
  sys.update(1 / 60, state);
  assert.equal(c1.data.spineLoose, false, 'the box re-linked');
  assert.equal(c1.data.spineId, 'spineA');
  assert.equal(c1.data.spineIndex, 1, 'it chained on behind the tail');
  assert.ok(bus.events.some((e) => e.name === 'meridian:containerRecoupled' && e.payload.id === 'sp1'));
});

// ── hull tickers ─────────────────────────────────────────────────────────────────────────

test('a drifting container’s ticker counts its value down to the salvage floor', () => {
  const state = makeState(); const bus = makeBus();
  const box = spawn(state, {
    id: 'box', x: 0, z: 0, mass: 40, type: 'container', factionId: 'faction_mts',
    data: { spineLoose: true, cargoValueCr: 5000 },
  });
  const sys = makeSys(state, bus);
  // Two seconds of drift at 90 cr/s.
  for (let i = 0; i < 120; i++) { state.simTime += 1 / 60; sys.update(1 / 60, state); }
  assert.equal(box.data.tickerValueCr, 4820, 'the ticker dropped 180 cr in 2 s of drift');
  assert.match(box.data.scanLabel, /4,820 CR/, 'the hull reads its own price');
  // Bleed to the floor: 51 s strips (5000-400)/90 ≈ 51.1 s.
  for (let i = 0; i < 60 * 55; i++) { state.simTime += 1 / 60; sys.update(1 / 60, state); }
  assert.equal(box.data.cargoValueCr, 400, 'the floor is wreck price, not zero');
  assert.ok(bus.events.some((e) => e.name === 'meridian:tickerFloor'));
});

test('a linked container’s ticker holds — the bleed is for lost mass only', () => {
  const state = makeState(); const bus = makeBus();
  spawnSpine(state, [0, 46]);
  const box = state.entities.get('sp1');
  const sys = makeSys(state, bus);
  for (let i = 0; i < 120; i++) { state.simTime += 1 / 60; sys.update(1 / 60, state); }
  assert.equal(box.data.cargoValueCr, 4000, 'a coupled box keeps its price');
  assert.match(box.data.scanLabel, /MTS SPINE CONTAINER/);
});

// ── Spine Break (E-05) — stub director + the real coupler system ─────────────────────────

function makeDirectorHarness() {
  const state = makeState();
  state.player = { id: 'player', alive: true, pos: { x: 300, z: 0 }, mass: 55, data: {} };
  const events = [];
  const grants = [];
  const reps = [];
  const live = {
    id: 'enc2', shapeId: 'spine_break', squadId: 'sq2',
    plan: {
      zoneCenter: { x: 0, z: 0 },
      ships: [
        { role: 'squad', pos: { x: 0, z: 0 } },
        { role: 'escort', pos: { x: 0, z: 0 } },
      ],
    },
    anchor: null, roles: {}, ids: [], data: {}, vars: {},
    shape: SPINE_BREAK.default, phase: 'pending', deadlineAt: 0,
  };
  const d = {
    state,
    now: () => state.simTime,
    player: () => state.player,
    stream: () => { let s = 777; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; },
    spawnShips: (lv, ships) => ships.map((sh) => {
      const e = spawn(state, { x: sh.pos.x, z: sh.pos.z, mass: 300, type: 'ship', factionId: sh.factionId || 'faction_mts', data: { ai: {} } });
      if (sh.scanLabel) e.data.scanLabel = sh.scanLabel;
      lv.roles[e.id] = sh.role; lv.ids.push(e.id);
      return e.id;
    }),
    entsOf: (lv, role) => lv.ids.map((id) => state.entities.get(id)).filter((e) => e && (!role || lv.roles[e.id] === role)),
    spawnCargoPod: (lv, spec) => {
      const e = spawn(state, {
        x: spec.pos.x, z: spec.pos.z, mass: spec.unitMass * spec.amount || 40,
        type: 'pickup', factionId: spec.factionId,
        data: { kind: 'cargo', commodityId: spec.commodityId, amount: spec.amount },
      });
      e.vel = { x: spec.vel.x, z: spec.vel.z };
      lv.roles[e.id] = 'freight_pod'; lv.ids.push(e.id);
      return e;
    },
    say: () => true,
    emit: (name, payload) => events.push({ name, payload }),
    grant: (amt, reason) => grants.push({ amount: amt, reason }),
    rep: (f, delta, reason) => reps.push({ factionId: f, delta, reason }),
    resolve: (lv, outcome) => { lv.phase = 'done'; lv.outcome = outcome; },
    abort: (lv, reason) => { lv.phase = 'done'; lv.outcome = `abort:${reason}`; },
  };
  const sys = makeSys(state, { emit: d.emit });
  return { state, d, live, events, grants, reps, sys };
}

function tickS(h, seconds) {
  const dt = 1 / 60;
  for (let i = 0; i < Math.ceil(seconds * 60); i++) {
    h.state.simTime += dt;
    h.sys.update(dt, h.state);                                  // the coupler law runs for real
    SPINE_BREAK.runtime.tick(h.d, h.live, h.state, h.state.simTime);
    if (h.live.phase === 'done') break;
  }
}

test('Spine Break fires: the coupler law spills the tail, tickers bleed, buyer waits', () => {
  const h = makeDirectorHarness();
  SPINE_BREAK.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.spineBreak;
  assert.ok(rec);
  assert.equal(rec.looseIds.length, 4, 'the Reach left four boxes adrift');
  tickS(h, 0.5);
  // The tail spilled through the REAL mechanic, not a scripted stamp.
  for (const id of rec.looseIds) {
    const box = h.state.entities.get(id);
    assert.equal(box.data.spineLoose, true, `${id} went loose under the coupler law`);
    assert.ok(box.data.cargoValueCr < 4200, 'its ticker is counting down');
  }
  const buyer = h.state.entities.get(rec.buyerId);
  assert.equal(buyer.factionId, 'faction_pitborn');
});

test('re-couple three loose boxes to the tail and the broker pays the fee', () => {
  const h = makeDirectorHarness();
  SPINE_BREAK.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.spineBreak;
  tickS(h, 0.5);
  // The pilot shoves three boxes back to the tail (index 2 = last linked box).
  const tail = h.state.entities.get(rec.containerIds[1]); // last still-linked
  for (const id of rec.looseIds.slice(0, 3)) {
    const box = h.state.entities.get(id);
    box.pos.x = tail.pos.x - 20; box.pos.z = tail.pos.z;
    box.vel = { x: 0, z: 0 };
    tickS(h, 0.2);
  }
  assert.equal(h.live.outcome, 'spine_recoupled');
  assert.ok(h.grants.some((g) => g.reason === 'spine_break_recouple_fee' && g.amount === 3 * 120));
  assert.ok(h.reps.some((r) => r.factionId === 'faction_mts' && r.delta === 3));
});

test('feed a loose box to the Pitborn buyer and the field sells out', () => {
  const h = makeDirectorHarness();
  SPINE_BREAK.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.spineBreak;
  tickS(h, 0.5);
  const buyer = h.state.entities.get(rec.buyerId);
  for (const id of rec.looseIds) {
    const box = h.state.entities.get(id);
    box.pos.x = buyer.pos.x + 10; box.pos.z = buyer.pos.z;
    tickS(h, 0.2);
  }
  assert.equal(h.live.outcome, 'sold_to_pitborn');
  assert.equal(h.grants.length, 4, 'every box sold at the Pitborn cut');
  assert.ok(h.grants.every((g) => g.reason === 'spine_break_pitborn_sale'));
  assert.ok(h.reps.some((r) => r.factionId === 'faction_mts' && r.delta === -2));
});

test('collect a box and leave — the Syndicate logs the theft', () => {
  const h = makeDirectorHarness();
  SPINE_BREAK.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.spineBreak;
  tickS(h, 0.5);
  SPINE_BREAK.runtime.event(h.d, h.live, h.state, 'pickup:collected', { entityId: rec.looseIds[0] });
  assert.deepEqual(rec.stolenIds, [rec.looseIds[0]]);
  h.state.player.pos = { x: 5000, z: 0 };
  tickS(h, 0.2);
  assert.equal(h.live.outcome, 'containers_stolen');
  assert.ok(h.reps.some((r) => r.reason === 'spine_break_containers_stolen'));
});
