// test/gravedigger.test.mjs — GRAVEDIGGER / UG-4 / row 506 member 12 (03 §4.3).
// The machine races the field for loose wrecks and buries them into a durable
// garden plot; three burials teaches the pit-delivery compost verb that pays.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GRAVEDIGGER } from '../src/data/gravedigger.js';
import {
  gravediggerBuryable, gravediggerTarget, gravediggerCanBury,
  gravediggerCompostable, gravediggerSteerDeltaV, gravediggerDriftHome,
  gravediggerGardenOwed,
} from '../src/characters/gravediggerRules.js';
import { createGravedigger, gravediggerSpec, gravediggerGardenSpec } from '../src/systems/gravedigger.js';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';

let nextId = 1000;
function fixture({ sector = 'sector_eunomia_gulf', runKind = 'adventure' } = {}) {
  const bus = createBus();
  const popups = [];
  const grants = [];
  const receipts = [];
  bus.on('comms:popup', (p) => popups.push(p));
  bus.on('economy:grantCredits', (p) => grants.push(p));
  bus.on('salvage:completed', (p) => receipts.push({ payload: p, aliveNow: state.entities.get(p?.wreckId)?.alive }));
  const player = { id: 7, alive: true, isPlayer: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const state = {
    run: { kind: runKind },
    world: { currentSectorId: sector },
    story: { flags: {} },
    simTime: 100,
    tick: 60,
    playerId: player.id,
    player,
    entityList: [player],
    entities: new Map([[player.id, player]]),
  };
  const helpers = {
    spawnEntity(spec) {
      const e = { id: nextId += 1, alive: true, ...spec };
      state.entityList.push(e); state.entities.set(e.id, e); return e;
    },
    removeEntity(id) { const e = state.entities.get(id); if (e) e.alive = false; },
    sectorCookProviders: [],
  };
  const sys = createGravedigger();
  sys.init({ state, bus, helpers });
  return { state, bus, helpers, popups, grants, receipts, sys };
}
const addWreck = (state, pos, extra = {}) => {
  const e = {
    id: nextId += 1, alive: true, type: 'wreck',
    pos: { ...pos }, vel: { x: 0, z: 0 }, radius: 18, mass: 120, data: {},
    ...extra,
  };
  state.entityList.push(e); state.entities.set(e.id, e); return e;
};

const robot = (state) => state.entityList.find((e) => e.alive && e.data?.gravedigger);
const gardens = (state) => state.entityList.filter((e) => e.alive && e.data?.gravediggerGarden);
const says = (popups, prefix) => popups.filter((p) => String(p.id).startsWith(prefix));
const flags = (state) => state.story.flags;

test('spec + spawn: the machine on the gulf floor, in sector only, one hail', () => {
  const s = gravediggerSpec();
  assert.equal(s.data.gravedigger, true);
  assert.equal(s.data.authoredCharacter, 'gravedigger');
  const g = gravediggerGardenSpec({ x: 1, z: 2 }, 5);
  assert.equal(g.data.gravediggerGardenSerial, 5);
  assert.equal(g.data.runtimeOwner, 'gravedigger');
  const { state, popups } = fixture();
  assert.ok(robot(state));
  const hail = says(popups, 'gravedigger_announce');
  assert.equal(hail.length, 1);
  assert.match(hail[0].text, /wrecks belong to the ground/);
  assert.equal(fixture({ runKind: 'survival' }).state.entityList.filter((e) => e.data?.gravedigger).length, 0);
  assert.equal(fixture({ sector: 'sector_io_reach' }).state.entityList.filter((e) => e.data?.gravedigger).length, 0);
});

test('a settled wreck in reach is consumed and a bed stands on the grave', () => {
  const { state, helpers, popups, sys } = fixture();
  const w = addWreck(state, { x: GRAVEDIGGER.post.x + 30, z: GRAVEDIGGER.post.z });
  sys.update(0.5, state);
  assert.equal(w.alive, false, 'the wreck went in the ground');
  assert.equal(gardens(state).length, 1);
  const bed = flags(state).gravedigger_gardens;
  assert.equal(bed.length, 1);
  assert.equal(bed[0].x, w.pos.x, 'the bed stands where the wreck lay');
  assert.equal(gardens(state)[0].data.gravediggerGardenSerial, bed[0].serial);
  assert.equal(says(popups, 'gravedigger_bury_').length, 1);
  assert.match(says(popups, 'gravedigger_bury_')[0].text, /IN THE GROUND/);
});

test('a burial files the consumption receipt before the take — the marker retires, the corpse stays buried', () => {
  const { state, receipts, sys } = fixture();
  // The aftermath "fair good" shape the shared law lets through: marker-bound
  // residue the field would rematerialize next enter unless the sale's
  // salvage:completed receipt retires it while the hulk is still live+bound.
  const w = addWreck(state, { x: GRAVEDIGGER.post.x + 30, z: GRAVEDIGGER.post.z }, {
    data: {
      markerId: 'marker_1', persistenceOwner: 'aftermathWrecks',
      provenance: { markerId: 'marker_1' },
    },
  });
  sys.update(0.5, state);
  assert.equal(w.alive, false);
  assert.equal(receipts.length, 1, 'the burial filed salvage:completed');
  assert.equal(receipts[0].payload.wreckId, w.id);
  assert.equal(receipts[0].payload.markerId, 'marker_1', 'the durable marker is named so it retires');
  assert.equal(receipts[0].payload.source, 'gravedigger:bury');
  assert.equal(receipts[0].aliveNow, true, 'the receipt lands while the wreck is still live — dead hulks cannot retire');
});

test('no take, no pay: without the removal seam the pit cannot claim an offering', () => {
  const { state, helpers, grants, receipts, sys } = fixture();
  flags(state).gravedigger_taught = true;
  addWreck(state, { x: GRAVEDIGGER.post.x, z: GRAVEDIGGER.post.z });
  delete helpers.removeEntity;
  sys.update(0.5, state);
  assert.equal(grants.length, 0, 'the fee never pays for a hull still sitting in the pit');
  assert.equal(receipts.length, 0);
  assert.equal(gardens(state).length, 0, 'no bed for a hull not taken');
  assert.equal(state.entityList.some((e) => e.alive && e.type === 'wreck'), true, 'the offering stands');
});

test('the race is physical: a wreck out of arm reach gets run down by impulse', () => {
  const { state, sys } = fixture();
  addWreck(state, { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z });
  const r = robot(state);
  sys.update(0.5, state);
  const cmds = consumePhysicsCommand(r);
  assert.ok(cmds && cmds.impulses.length === 1, 'one chase impulse');
  assert.ok(cmds.impulses[0].x > 0, 'toward the wreck');
});

test('a wreck under the client line is the client\'s — the race never takes it', () => {
  const { state, sys } = fixture();
  const w = addWreck(state, { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z });
  state.player.tether = { active: true, targetId: w.id };
  sys.update(0.5, state);
  assert.equal(w.alive, true, 'the line holds');
  assert.equal(consumePhysicsCommand(robot(state)), null, 'no chase — nothing worth a grave');
});

test('three burials teaches the compost verb — the pit pays for a settled offering', () => {
  const { state, popups, grants, sys } = fixture();
  for (let i = 0; i < GRAVEDIGGER.teachAfter; i += 1) {
    // Each burial needs the wreck inside buryRadius — one grave per pass.
    addWreck(state, { x: GRAVEDIGGER.post.x + 15 + i * 8, z: GRAVEDIGGER.post.z + i * 8 });
    sys.update(0.5, state);
  }
  assert.equal(flags(state).gravedigger_taught, true);
  assert.equal(says(popups, 'gravedigger_teach').length, 1);
  assert.match(says(popups, 'gravedigger_teach')[0].text, /Even the ground/);
  // An offering in the pit pays the fee; the chase does not.
  addWreck(state, { x: GRAVEDIGGER.post.x + 40, z: GRAVEDIGGER.post.z });
  sys.update(0.5, state);
  assert.equal(grants.length, 1);
  assert.equal(grants[0].amount, GRAVEDIGGER.compostFee);
  assert.equal(grants[0].reason, 'gravedigger:compost');
  assert.equal(says(popups, 'gravedigger_compost_').length, 1);
});


for (const engagement of ['beam', 'line']) {
  test(`a taught pit waits for the client's ${engagement} to release before composting`, () => {
    const { state, grants, receipts, popups, sys } = fixture();
    flags(state).gravedigger_taught = true;
    const w = addWreck(state, GRAVEDIGGER.post);
    if (engagement === 'beam') state.player.miningTargetId = w.id;
    else state.player.tether = { active: true, targetId: w.id };

    for (let i = 0; i < 3; i += 1) sys.update(0.5, state);
    assert.equal(w.alive, true, 'a settled hull still in hand is not an offering');
    assert.equal(grants.length, 0);
    assert.equal(receipts.length, 0, 'the live salvage marker is not retired');
    assert.equal(gardens(state).length, 0);
    assert.equal(flags(state).gravedigger_gardens.length, 0);
    assert.equal(flags(state).gravedigger_serial, undefined);
    assert.equal(says(popups, 'gravedigger_compost_').length, 0);

    if (engagement === 'beam') state.player.miningTargetId = null;
    else state.player.tether.active = false;
    w.vel.x = GRAVEDIGGER.settleSpeed + 1;
    sys.update(0.5, state);
    assert.equal(w.alive, true, 'release alone is not settlement');
    assert.equal(grants.length, 0);
    assert.equal(receipts.length, 0);

    w.vel.x = 0;
    sys.update(0.5, state);
    sys.update(0.5, state);
    assert.equal(w.alive, false, 'released and settled now belongs to the garden');
    assert.equal(grants.length, 1);
    assert.equal(grants[0].amount, GRAVEDIGGER.compostFee);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].payload.wreckId, w.id);
    assert.equal(receipts[0].aliveNow, true, 'canonical receipt still precedes removal');
    assert.equal(gardens(state).length, 1);
    assert.deepEqual(flags(state).gravedigger_gardens, [{ ...GRAVEDIGGER.post, serial: 1 }]);
    assert.equal(flags(state).gravedigger_serial, 1);
    assert.equal(says(popups, 'gravedigger_compost_').length, 1);
  });
}

test('held pit candidates do not hide a different released offering', () => {
  const { state, grants, receipts, sys } = fixture();
  flags(state).gravedigger_taught = true;
  const beamed = addWreck(state, GRAVEDIGGER.post);
  const lined = addWreck(state, GRAVEDIGGER.post);
  const offered = addWreck(state, { x: GRAVEDIGGER.post.x + 10, z: GRAVEDIGGER.post.z });
  state.entityList.unshift(null); // A census hole is not an offering either.
  state.player.miningTargetId = beamed.id;
  state.player.tether = { active: true, targetId: lined.id };
  sys.update(0.5, state);
  sys.update(0.5, state);
  assert.equal(beamed.alive, true);
  assert.equal(lined.alive, true);
  assert.equal(offered.alive, false);
  assert.equal(grants.length, 1);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].payload.wreckId, offered.id);
  assert.deepEqual(flags(state).gravedigger_gardens, [{ ...offered.pos, serial: 1 }]);
});

test('releasing one of two live engagements does not offer the same hull', () => {
  const { state, grants, receipts, sys } = fixture();
  flags(state).gravedigger_taught = true;
  const w = addWreck(state, GRAVEDIGGER.post);
  state.player.miningTargetId = w.id;
  state.player.tether = { active: true, targetId: w.id };
  state.player.tether.active = false;
  sys.update(0.5, state);
  assert.equal(w.alive, true, 'the beam still owns the hull');
  assert.equal(grants.length, 0);
  assert.equal(receipts.length, 0);
  state.player.miningTargetId = null;
  sys.update(0.5, state);
  assert.equal(w.alive, false);
  assert.equal(grants.length, 1);
  assert.equal(receipts.length, 1);
});

test('learn, release, compost, restore: the garden keeps the paid grave without paying again', () => {
  const { state, grants, receipts, sys } = fixture();
  for (let i = 0; i < GRAVEDIGGER.teachAfter; i += 1) {
    addWreck(state, { x: GRAVEDIGGER.post.x + 10 + i * 8, z: GRAVEDIGGER.post.z });
    sys.update(0.5, state);
  }
  assert.equal(flags(state).gravedigger_taught, true);
  assert.equal(grants.length, 0, 'the original races do not pay');
  const offering = addWreck(state, GRAVEDIGGER.post);
  state.player.miningTargetId = offering.id;
  sys.update(0.5, state);
  assert.equal(offering.alive, true);
  assert.equal(receipts.length, GRAVEDIGGER.teachAfter);
  state.player.miningTargetId = null;
  sys.update(0.5, state);
  const savedFlags = JSON.parse(JSON.stringify(flags(state)));
  assert.equal(grants.length, 1);
  assert.equal(savedFlags.gravedigger_gardens.length, GRAVEDIGGER.teachAfter + 1);
  assert.equal(savedFlags.gravedigger_serial, GRAVEDIGGER.teachAfter + 1);

  // Adapter-level flag round-trip, not a claim about the full save envelope.
  const restored = fixture({ sector: 'sector_io_reach' });
  restored.state.story.flags = savedFlags;
  restored.bus.emit('save:loaded');
  assert.equal(gardens(restored.state).length, 0);
  restored.state.world.currentSectorId = GRAVEDIGGER.sectorId;
  restored.bus.emit('sector:enter', { sectorId: GRAVEDIGGER.sectorId });
  restored.sys.update(0.5, restored.state);
  const ledger = savedFlags.gravedigger_gardens;
  assert.deepEqual(gardens(restored.state).map((e) => ({
    ...e.pos, serial: e.data.gravediggerGardenSerial,
  })), ledger);
  assert.equal(flags(restored.state).gravedigger_taught, true);
  assert.equal(restored.grants.length, 0);
  assert.equal(restored.receipts.length, 0);

  restored.state.world.currentSectorId = 'sector_io_reach';
  restored.bus.emit('sector:enter', { sectorId: 'sector_io_reach' });
  restored.state.world.currentSectorId = GRAVEDIGGER.sectorId;
  restored.bus.emit('sector:enter', { sectorId: GRAVEDIGGER.sectorId });
  restored.sys.update(0.5, restored.state);
  assert.equal(gardens(restored.state).length, ledger.length, 'no duplicated bed on another visit');
  assert.equal(restored.grants.length, 0);
  assert.equal(restored.receipts.length, 0);
});

test('the plot caps — the ground still takes offerings into the old beds', () => {
  const { state, popups, grants, sys } = fixture();
  flags(state).gravedigger_taught = true;
  flags(state).gravedigger_gardens = Array.from(
    { length: GRAVEDIGGER.gardenMax }, (_, i) => ({ x: i, z: i, serial: i + 1 }));
  flags(state).gravedigger_serial = GRAVEDIGGER.gardenMax;
  addWreck(state, { x: GRAVEDIGGER.post.x, z: GRAVEDIGGER.post.z });
  sys.update(0.5, state);
  assert.equal(flags(state).gravedigger_gardens.length, GRAVEDIGGER.gardenMax, 'no new bed');
  assert.equal(grants.length, 1, 'the fee still pays');
  assert.equal(says(popups, 'gravedigger_compost_')[0].text, GRAVEDIGGER.fullLine);
});

test('beds persist through the flag ledger — entry respawns every recorded grave', () => {
  const { state, bus, helpers } = fixture();
  flags(state).gravedigger_gardens = [{ x: 10, z: 20, serial: 7 }];
  state.world.currentSectorId = 'sector_io_reach';
  bus.emit('sector:enter', { sectorId: 'sector_io_reach' });
  assert.equal(gardens(state).length, 0, 'leaving takes the plot');
  state.world.currentSectorId = GRAVEDIGGER.sectorId;
  bus.emit('sector:enter', { sectorId: GRAVEDIGGER.sectorId });
  assert.equal(gardens(state).length, 1, 'the bed comes back on return');
  assert.equal(gardens(state)[0].data.gravediggerGardenSerial, 7);
});

test('kill the gardener: the garden keeps growing without hands', () => {
  const { state, bus, popups, sys } = fixture();
  flags(state).gravedigger_gardens = [{ x: 10, z: 20, serial: 3 }];
  const r = robot(state);
  r.alive = false;
  bus.emit('entity:killed', { id: r.id, killerId: 7 });
  assert.equal(flags(state).gravedigger_gone, true);
  assert.match(says(popups, 'gravedigger_gone')[0].text, /WITHOUT HANDS/);
  addWreck(state, { x: GRAVEDIGGER.post.x + 30, z: GRAVEDIGGER.post.z });
  sys.update(0.5, state);
  assert.equal(state.entityList.some((e) => e.alive && e.type === 'wreck'), true, 'nobody digs');
  bus.emit('sector:enter', { sectorId: GRAVEDIGGER.sectorId });
  assert.equal(robot(state), undefined, 'the machine never re-takes the plot');
  assert.equal(gardens(state).length, 1, 'its work outlives it');
});

test('a flyby cannot be buried — a screaming hull is not a grave', () => {
  const { state, sys } = fixture();
  const w = addWreck(state, { x: GRAVEDIGGER.post.x + 30, z: GRAVEDIGGER.post.z });
  w.vel = { x: 400, z: 0 };
  sys.update(0.5, state);
  assert.equal(w.alive, true);
  assert.equal(gardens(state).length, 0);
});

test('pure rules: gates honest, steer math, owed-bed ledger', () => {
  const rp = { ...GRAVEDIGGER.post };
  const wreck = { alive: true, type: 'wreck', pos: { x: rp.x + 50, z: rp.z }, vel: { x: 0, z: 0 }, data: {} };
  assert.equal(gravediggerBuryable(wreck, rp), true);
  assert.equal(gravediggerBuryable({ ...wreck, pos: { x: rp.x + 5000, z: 0 } }, rp), false, 'out of pursuit');
  assert.equal(gravediggerBuryable({ ...wreck, data: { runtimeOwner: 'mop' } }, rp), false);
  assert.equal(gravediggerCanBury(wreck, rp), true);
  assert.equal(gravediggerCanBury({ ...wreck, vel: { x: 400, z: 0 } }, rp), false);
  assert.equal(gravediggerCompostable(wreck, rp), true);
  assert.equal(gravediggerCompostable({ ...wreck, pos: { x: rp.x + 300, z: 0 } }, rp), false, 'outside the pit');
  const t = gravediggerTarget(rp, [wreck]);
  assert.equal(t, wreck);
  const dv = gravediggerSteerDeltaV({ pos: rp, vel: { x: 0, z: 0 } }, { x: rp.x + 200, z: rp.z });
  assert.ok(dv.x > 0);
  assert.equal(gravediggerDriftHome({ pos: rp, vel: { x: 0, z: 0 } }), null);
  assert.equal(gravediggerGardenOwed([{ x: 1, z: 2, serial: 3 }], new Set()).length, 1);
  assert.equal(gravediggerGardenOwed([{ x: 1, z: 2, serial: 3 }], new Set([3])).length, 0);
});

test('destroy + re-init: provider and every owned hull clean', () => {
  const { state, helpers, sys } = fixture();
  flags(state).gravedigger_gardens = [{ x: 1, z: 1, serial: 1 }];
  sys.update(0.5, state);
  assert.equal(helpers.sectorCookProviders.length, 1);
  sys.destroy();
  assert.equal(helpers.sectorCookProviders.length, 0);
  assert.equal(state.entityList.filter(
    (e) => e.alive && (e.data?.gravedigger || e.data?.gravediggerGarden)).length, 0);
  sys.init({ state, bus: createBus(), helpers });
  assert.equal(helpers.sectorCookProviders.length, 1);
  assert.ok(robot(state));
});
