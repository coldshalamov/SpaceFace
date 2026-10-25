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
  bus.on('comms:popup', (p) => popups.push(p));
  bus.on('economy:grantCredits', (p) => grants.push(p));
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
  return { state, bus, helpers, popups, grants, sys };
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
