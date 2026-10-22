// build_map §34 row 526 — Helix: too-perfect false flags, Lien drones, Gate Audit
// platform def, Adjudicator 44-C hook, and The Too-Perfect Pack (E-10).
import assert from 'node:assert/strict';
import test from 'node:test';

import { faction as HELIX } from '../src/data/factions/helix.js';
import { factionHelix } from '../src/systems/faction_helix.js';
import * as PACK from '../src/data/encounters/703-too-perfect-pack.js';

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
  const sys = { ...factionHelix };
  sys.init({ state, bus, helpers: {} });
  return sys;
}

test('Helix kit declares false flags, lien drones, audit platform and Adjudicator 44-C', () => {
  const roles = HELIX.shipRoles.map((r) => r.role);
  for (const r of ['adjudicator-cutter', 'lien-drone', 'auditor-frigate']) {
    assert.ok(roles.includes(r), `shipRoles includes ${r}`);
  }
  assert.ok(HELIX.custom.falseFlag.masks.includes('faction_reach'));
  assert.ok(HELIX.custom.falseFlag.patternBreakWu > 0);
  assert.ok(HELIX.custom.lienDrone.fileAfterS > 0 && HELIX.custom.lienDrone.fineCr > 0);
  assert.ok(HELIX.custom.gateAuditPlatform.scaffoldHp > 0, 'the audit scaffold is wreckable');
  assert.equal(HELIX.custom.adjudicator44C.refId, 'REF 44-C');
  assert.equal(HELIX.custom.tooPerfectPack.encounterId, 'too_perfect_pack');
});

// ── false flags ───────────────────────────────────────────────────────────────────────────

function spawnPerfectPack(state, mask = 'faction_reach') {
  const slots = [{ dx: 130, dz: 0 }, { dx: 0, dz: 85 }, { dx: 0, dz: -85 }, { dx: -130, dz: 0 }];
  return slots.map((s, i) => spawn(state, {
    id: `p${i}`, x: s.dx, z: s.dz, mass: 55, factionId: mask,
    data: { helixFalseFlag: true, helixPack: 'pk1', helixSlot: s, ai: {} },
  }));
}

test('a flawless masked pack holds its flag; fling one off its slot and every flag drops', () => {
  const state = makeState(); const bus = makeBus();
  const pack = spawnPerfectPack(state);
  const sys = makeSys(state, bus);
  for (let i = 0; i < 5; i++) { state.simTime += 1 / 60; sys.update(1 / 60, state); }
  assert.equal(pack[0].factionId, 'faction_reach', 'the mask holds while the geometry is perfect');

  // The player throws one raider into the next postcode — the pattern is broken.
  pack[2].pos.x += 300;
  sys.update(1 / 60, state);
  for (const m of pack) {
    assert.equal(m.factionId, 'faction_helix', 'every transponder flips at once');
    assert.equal(m.data.falseFlagDropped, true);
    assert.equal(m.data.wasMaskedFaction, 'faction_reach');
  }
  const ev = bus.events.find((e) => e.name === 'helix:flagsDropped');
  assert.ok(ev);
  assert.equal(ev.payload.breakerId, 'p2');
  assert.equal(ev.payload.memberIds.length, 4);
});

test('a whole-pack translation is not a break — the tell is relative geometry', () => {
  const state = makeState(); const bus = makeBus();
  const pack = spawnPerfectPack(state);
  for (const m of pack) { m.pos.x += 400; } // the diamond moves as one
  makeSys(state, bus).update(1 / 60, state);
  assert.equal(pack[0].factionId, 'faction_reach', 'a formation in transit is still a formation');
});

// ── lien drones ───────────────────────────────────────────────────────────────────────────

test('a lien drone sticks, rides, and files the fine — scraping it off files nothing', () => {
  const state = makeState(); const bus = makeBus();
  const ship = spawn(state, { id: 'hull', x: 0, z: 0, mass: 55, factionId: 'faction_mts', data: {} });
  const drone = spawn(state, { id: 'drone', x: 30, z: 0, mass: 2, type: 'drone', data: { lienDrone: true } });
  const sys = makeSys(state, bus);
  sys.update(1 / 60, state);
  assert.equal(ship.data.lienStuck, 'drone', 'the lien sticks inside its reach');
  assert.equal(ship.data.lienMassT, HELIX.custom.lienDrone.lienMassT);
  assert.ok(bus.events.some((e) => e.name === 'helix:lienStuck'));

  // It rides the hull — dead mass on the scale — until the paperwork is done.
  ship.pos.x = 500;
  sys.update(1 / 60, state);
  assert.equal(drone.pos.x, 500, 'the drone rides the fined hull');

  for (let i = 0; i < HELIX.custom.lienDrone.fileAfterS * 60 + 5; i++) {
    state.simTime += 1 / 60;
    sys.update(1 / 60, state);
  }
  assert.equal(ship.data.lienFiledCr, HELIX.custom.lienDrone.fineCr, 'the lien filed itself');
  assert.equal(drone.alive, false, 'the delivered drone is a husk');
  assert.ok(bus.events.some((e) => e.name === 'helix:lienFiled'));

  // A drone scraped off inside the dwell files nothing.
  const state2 = makeState(); const bus2 = makeBus();
  const s2 = spawn(state2, { id: 'h2', x: 0, z: 0, mass: 55, factionId: 'faction_quiet', data: {} });
  const d2 = spawn(state2, { id: 'dd', x: 20, z: 0, mass: 2, type: 'drone', data: { lienDrone: true } });
  const sys2 = makeSys(state2, bus2);
  sys2.update(1 / 60, state2);
  d2.alive = false; // peeled off and vented
  for (let i = 0; i < 60 * 15; i++) { state2.simTime += 1 / 60; sys2.update(1 / 60, state2); }
  assert.equal(s2.data.lienFiledCr, undefined, 'a dead drone files nothing');
});

// ── the Too-Perfect Pack (E-10) — stub director + the real flag system ────────────────────

function makeHarness() {
  const state = makeState();
  state.player = { id: 'player', alive: true, pos: { x: 0, z: 400 }, mass: 55, data: {} };
  const events = [];
  const reps = [];
  const live = {
    id: 'enc4', shapeId: 'too_perfect_pack', squadId: 'sq4',
    plan: {
      zoneCenter: { x: 0, z: 0 },
      ships: [
        { role: 'squad', pos: {} }, { role: 'squad', pos: {} },
        { role: 'squad', pos: {} }, { role: 'squad', pos: {} },
        { role: 'escort', pos: {} },
      ],
    },
    anchor: null, roles: {}, ids: [], data: {}, vars: {},
    shape: PACK.default, phase: 'pending', deadlineAt: 0,
  };
  const d = {
    state,
    now: () => state.simTime,
    player: () => state.player,
    stream: () => () => 0,
    spawnShips: (lv, ships) => ships.map((sh) => {
      const e = spawn(state, { x: sh.pos.x, z: sh.pos.z, mass: 55, factionId: sh.factionId, data: { ai: {} } });
      lv.roles[e.id] = sh.role; lv.ids.push(e.id);
      return e.id;
    }),
    entsOf: (lv, role) => lv.ids.map((id) => state.entities.get(id)).filter((e) => e && (!role || lv.roles[e.id] === role)),
    spawnCargoPod: (lv, spec) => {
      const e = spawn(state, { x: spec.pos.x, z: spec.pos.z, mass: 24, type: 'pickup', factionId: spec.factionId, data: { kind: 'cargo' } });
      lv.roles[e.id] = 'freight_pod'; lv.ids.push(e.id);
      return e;
    },
    say: () => true,
    emit: (name, payload) => events.push({ name, payload }),
    rep: (f, delta, reason) => reps.push({ factionId: f, delta, reason }),
    resolve: (lv, outcome) => { lv.phase = 'done'; lv.outcome = outcome; },
    abort: (lv, reason) => { lv.phase = 'done'; lv.outcome = `abort:${reason}`; },
  };
  const sys = makeSys(state, { emit: d.emit });
  return { state, d, live, events, reps, sys };
}

function tickS(h, seconds) {
  const dt = 1 / 60;
  for (let i = 0; i < Math.ceil(seconds * 60); i++) {
    h.state.simTime += dt;
    h.sys.update(dt, h.state);
    PACK.runtime.tick(h.d, h.live, h.state, h.state.simTime);
    if (h.live.phase === 'done') break;
  }
}

test('the pack flies masked in a flawless diamond — until the pattern breaks', () => {
  const h = makeHarness();
  PACK.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.pack;
  assert.equal(rec.memberIds.length, 4);
  for (const id of rec.memberIds) {
    const m = h.state.entities.get(id);
    assert.equal(m.data.helixFalseFlag, true);
    assert.equal(m.factionId, 'faction_reach', 'the mask reads Reach');
    assert.equal(m.data.scanLabel, 'REACH RAIDER');
  }
  const runner = h.state.entities.get(rec.runnerId);
  assert.equal(runner.factionId, 'faction_quiet');
  const crate = h.state.entities.get(rec.crateId);
  assert.equal(crate.data.evidenceLogged, true, 'the seizure was written before the ambush flew');

  tickS(h, 0.2);
  assert.equal(h.live.phase, 'conflict', 'perfect geometry keeps the mask on');
});

test('fling one raider and the whole pack goes HELIX — the encounter resolves on it', () => {
  const h = makeHarness();
  PACK.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.pack;
  tickS(h, 0.1);
  const breaker = h.state.entities.get(rec.memberIds[1]);
  breaker.pos.x += 200;
  tickS(h, 0.2);
  assert.equal(h.live.outcome, 'flags_dropped');
  assert.ok(h.events.some((e) => e.name === 'helix:flagsDropped' && e.payload.breakerId === breaker.id));
  assert.ok(h.reps.some((r) => r.factionId === 'faction_helix' && r.delta === -2));
  for (const id of rec.memberIds) {
    assert.equal(h.state.entities.get(id).factionId, 'faction_helix');
  }
});

test('the runner dying resolves as Helix selling its cargo at Bourse', () => {
  const h = makeHarness();
  PACK.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.pack;
  tickS(h, 0.1);
  PACK.runtime.event(h.d, h.live, h.state, 'squadKill', { id: rec.runnerId, byPlayer: false });
  assert.equal(h.live.outcome, 'runner_lost');
});
