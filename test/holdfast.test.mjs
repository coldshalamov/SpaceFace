// test/holdfast.test.mjs — HOLDFAST / AN-1 / row 506 member 10 (03 §4.3).
// The ice-anchor seats towed spires against a running crack; all four clamps is
// RIFT HELD and pays the Line-trial fragment once; topping the crack out shakes
// the oldest seat loose and the holding resumes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HOLDFAST } from '../src/data/holdfast.js';
import {
  holdfastClampSpot, holdfastSpireSpot, holdfastSeatable, holdfastSocketFor,
  holdfastCrackAfter, holdfastSpireOwed, holdfastDriftHome,
} from '../src/characters/holdfastRules.js';
import { createHoldfast, holdfastSpec, holdfastSpireSpec, holdfastFragmentSpec } from '../src/systems/holdfast.js';
import { VERGE_LINE_TRIAL } from '../src/data/factions/vergelayers.js';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';

function fixture({ sector = 'sector_haumea_rift', runKind = 'adventure' } = {}) {
  const bus = createBus();
  const popups = [];
  bus.on('comms:popup', (p) => popups.push(p));
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
      const e = { id: 900 + state.entityList.length, alive: true, ...spec };
      state.entityList.push(e); state.entities.set(e.id, e); return e;
    },
    removeEntity(id) { const e = state.entities.get(id); if (e) e.alive = false; },
    sectorCookProviders: [],
  };
  const sys = createHoldfast();
  sys.init({ state, bus, helpers });
  return { state, bus, helpers, popups, sys, player };
}

const robot = (state) => state.entityList.find((e) => e.alive && e.data?.holdfast);
const loose = (state) => state.entityList.filter((e) => e.alive && e.data?.holdfastSpire && !e.data?.holdfastAnchored);
const anchored = (state) => state.entityList.filter((e) => e.alive && e.data?.holdfastAnchored);
const frags = (state) => state.entityList.filter((e) => e.alive && e.data?.holdfastFragment);
const says = (popups, prefix) => popups.filter((p) => String(p.id).startsWith(prefix));
const impulses = (entity) => {
  const cmds = consumePhysicsCommand(entity);
  return cmds && cmds.impulses ? cmds.impulses.splice(0) : [];
};
const toSocket = (state, socketIndex, speed = 0) => {
  const spire = loose(state)[0];
  const spot = holdfastClampSpot(socketIndex, robot(state).pos);
  spire.pos = { x: spot.x, z: spot.z };
  spire.vel = { x: speed, z: 0 };
  return spire;
};

test('spec + spawn: the anchor and six drift spires, in sector only, one hail per visit', () => {
  const s = holdfastSpec();
  assert.equal(s.data.holdfast, true);
  assert.equal(s.data.authoredCharacter, 'holdfast');
  assert.equal(s.data.homeSectorId, 'sector_haumea_rift');
  assert.equal(s.data.scannerSignalKind, 'salvage');
  const { state, popups } = fixture();
  assert.ok(robot(state));
  assert.equal(loose(state).length, HOLDFAST.spireCount, 'the rift spalls six spires');
  assert.equal(anchored(state).length, 0);
  const hail = says(popups, 'holdfast_announce');
  assert.equal(hail.length, 1);
  assert.match(hail[0].text, /clamps are empty/);
  assert.equal(fixture({ runKind: 'survival' }).state.entityList.filter((e) => e.data?.holdfast).length, 0);
  assert.equal(fixture({ sector: 'sector_io_reach' }).state.entityList.filter((e) => e.data?.holdfast).length, 0);
});

test('a spire parked in a socket seats and knocks the crack back', () => {
  const { state, popups, sys } = fixture();
  sys.update(0.5, state); // baseline pass — anchors the meter's clock
  state.simTime += 20; sys.update(0.5, state); // let the crack climb
  const crackBefore = state.story.flags.holdfast_crack;
  assert.ok(crackBefore > 0, 'the crack runs while nobody anchors');
  const s0 = toSocket(state, 1);
  sys.update(0.5, state);
  assert.equal(s0.data.holdfastAnchored, true);
  assert.equal(s0.data.holdfastClamp, 1);
  assert.ok(state.story.flags.holdfast_crack < crackBefore, 'the seat drops the meter');
  assert.equal(says(popups, 'holdfast_seat_1_').length, 1);
});

test('a flyby is not a seat — a screaming spire stays loose stock', () => {
  const { state, sys } = fixture();
  const s0 = toSocket(state, 0, 400);
  sys.update(0.5, state);
  assert.equal(s0.data.holdfastAnchored == null, true);
});

test('four seats is RIFT HELD and pays the fragment exactly once', () => {
  const { state, popups, sys } = fixture();
  state.story.flags.holdfast_crack = 10; // buy time: the run would fire at 100
  for (let i = 0; i < HOLDFAST.clampCount; i += 1) { toSocket(state, i); sys.update(0.5, state); }
  assert.equal(anchored(state).length, HOLDFAST.clampCount);
  assert.equal(state.story.flags.holdfast_held, true);
  assert.equal(state.story.flags.holdfast_paid, true);
  assert.equal(frags(state).length, 1);
  assert.equal(frags(state)[0].data.typeId, VERGE_LINE_TRIAL.fragmentTypeId);
  assert.ok(Number.isFinite(frags(state)[0].data.weighedMass));
  assert.equal(says(popups, 'holdfast_held').length, 1);
  assert.match(says(popups, 'holdfast_held')[0].text, /RIFT HELD/);
  // Quiet passes never re-pay.
  sys.update(0.5, state);
  assert.equal(frags(state).length, 1);
});

test('a topped-out crack shakes the oldest seat loose through the impulse membrane', () => {
  const { state, popups, sys } = fixture();
  toSocket(state, 0); sys.update(0.5, state);
  toSocket(state, 1); sys.update(0.5, state);
  assert.equal(anchored(state).length, 2);
  state.story.flags.holdfast_crack = HOLDFAST.crackMax - 0.5;
  state.simTime += 10; // enough elapsed to top it out this pass
  sys.update(0.5, state);
  assert.equal(state.story.flags.holdfast_crack, HOLDFAST.crackRunFloor);
  assert.equal(anchored(state).length, 1, 'the oldest seat gave');
  assert.equal(anchored(state)[0].data.holdfastClamp, 1, 'socket 0 is the seat that ran');
  const thrown = loose(state).find((e) => e.data.holdfastSpireIndex != null && impulses(e).length > 0);
  assert.ok(thrown, 'the shaken spire leaves through the impulse membrane');
  assert.equal(says(popups, 'holdfast_ran_').length, 1);
});

test('a shaken seat re-arms the hold — the second hold speaks the verb, no new fragment', () => {
  const { state, popups, sys } = fixture();
  for (let i = 0; i < HOLDFAST.clampCount; i += 1) { toSocket(state, i); sys.update(0.5, state); }
  assert.equal(frags(state).length, 1);
  // Force a run: one seat gives, held re-arms.
  state.story.flags.holdfast_crack = HOLDFAST.crackMax - 0.5;
  state.simTime += 10;
  sys.update(0.5, state);
  assert.equal(state.story.flags.holdfast_held, false, 'the shaken seat re-armed the hold');
  // Seat the freed socket again — the thrower parked the loose spire far away; pull one into socket 0.
  const spire = loose(state).find((e) => e.data.holdfastAnchored !== true);
  spire.pos = { ...holdfastClampSpot(0, robot(state).pos) };
  spire.vel = { x: 0, z: 0 };
  sys.update(0.5, state);
  assert.equal(state.story.flags.holdfast_held, true);
  assert.equal(frags(state).length, 1, 'the trial fragment pays once ever');
  assert.ok(says(popups, 'holdfast_holding_').length >= 1, 'the verb line speaks on re-holds');
});

test('kill the anchor: seated ice stays seated, nothing holds the post', () => {
  const { state, bus, popups, sys } = fixture();
  toSocket(state, 0); sys.update(0.5, state);
  const seated = anchored(state)[0];
  const r = robot(state);
  r.alive = false;
  bus.emit('entity:killed', { id: r.id, killerId: 7 });
  assert.equal(state.story.flags.holdfast_gone, true);
  assert.match(says(popups, 'holdfast_gone')[0].text, /AN-1 DOWN/);
  bus.emit('sector:enter', { sectorId: HOLDFAST.sectorId });
  assert.equal(robot(state), undefined, 'the anchor never re-takes the post');
  assert.equal(seated.data.holdfastAnchored, true, 'its work outlives it');
  const before = state.story.flags.holdfast_crack;
  sys.update(0.5, state);
  assert.equal(state.story.flags.holdfast_crack, before, 'no anchor, no count — the meter freezes');
});

test('a killed loose spire is owed back to the rift', () => {
  const { state, bus, sys } = fixture();
  const s0 = loose(state)[0];
  bus.emit('entity:killed', { id: s0.id, killerId: 7 });
  s0.alive = false;
  sys.update(0.5, state);
  assert.equal(loose(state).length, HOLDFAST.spireCount, 'the rift spalls a replacement');
});

test('pure rules: spots deterministic, seat gate honest, crack math, owed floor', () => {
  assert.deepEqual(holdfastClampSpot(2), holdfastClampSpot(2));
  assert.deepEqual(holdfastSpireSpot(4), holdfastSpireSpot(4));
  const parked = { alive: true, data: { holdfastSpire: true }, pos: holdfastClampSpot(0), vel: { x: 0, z: 0 } };
  assert.equal(holdfastSeatable(parked, holdfastClampSpot(0)), true);
  assert.equal(holdfastSocketFor(parked), 0);
  assert.equal(holdfastSocketFor(parked, HOLDFAST.post, 4, new Set([0])), -1, 'occupied seat never twins');
  assert.equal(holdfastSeatable({ ...parked, data: { holdfastSpire: true, holdfastAnchored: true } }, holdfastClampSpot(0)), false);
  assert.equal(holdfastCrackAfter(50, 10), Math.min(HOLDFAST.crackMax, 50 + 16));
  assert.equal(holdfastCrackAfter(10, 0, 1), Math.max(0, 10 - HOLDFAST.crackSeatDrop));
  assert.equal(holdfastSpireOwed(6, 0), 0);
  assert.equal(holdfastSpireOwed(3, 3), 0, 'seated stock is spent, not owed');
  assert.equal(holdfastSpireOwed(2, 1), 3);
  assert.equal(holdfastDriftHome({ pos: { ...HOLDFAST.post }, vel: { x: 0, z: 0 } }), null);
});

test('destroy + re-init: provider and every owned hull clean', () => {
  const { state, helpers, sys } = fixture();
  assert.equal(helpers.sectorCookProviders.length, 1);
  sys.destroy();
  assert.equal(helpers.sectorCookProviders.length, 0);
  assert.equal(state.entityList.filter(
    (e) => e.alive && (e.data?.holdfast || e.data?.holdfastSpire || e.data?.holdfastFragment)).length, 0);
  sys.init({ state, bus: createBus(), helpers });
  assert.equal(helpers.sectorCookProviders.length, 1);
  assert.ok(robot(state));
});
