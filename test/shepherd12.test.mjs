// test/shepherd12.test.mjs — SHEPHERD-12 / row 506 member 8 (03 §4.3).
// The broken shepherd walks the tide's ring edge and counts the flock: push the
// strays inside and it reports FLOCK: PRESENT — the first time paying the same
// verge_measure_fragment + weighedMass contract TARE's scale stamps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHEPHERD12 } from '../src/data/shepherd12.js';
import {
  shepherd12MemberSpot, shepherd12StraySpot, shepherd12Shy, shepherd12MemberOwed,
  shepherd12PatrolLeg, shepherd12PatrolDeltaV,
} from '../src/characters/shepherd12Rules.js';
import {
  createShepherd12, shepherd12Spec, shepherd12MemberSpec, shepherd12FragmentSpec,
} from '../src/systems/shepherd12.js';
import { VERGE_LINE_TRIAL } from '../src/data/factions/vergelayers.js';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';

function fixture({ sector = 'sector_orcus_shadow', runKind = 'adventure' } = {}) {
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
  const sys = createShepherd12();
  sys.init({ state, bus, helpers });
  return { state, bus, helpers, popups, sys, player };
}

const robot = (state) => state.entityList.find((e) => e.alive && e.data?.shepherd12);
const members = (state) => state.entityList.filter((e) => e.alive && e.data?.shepherdFlock);
const strays = (state) => members(state).filter((m) => shepherd12Shy(m));
const frags = (state) => state.entityList.filter((e) => e.alive && e.data?.shepherdFragment);
const says = (popups, prefix) => popups.filter((p) => String(p.id).startsWith(prefix));
const impulses = (entity) => {
  const cmds = consumePhysicsCommand(entity);
  return cmds && cmds.impulses ? cmds.impulses.splice(0) : [];
};
const home = (m) => {
  m.pos = { x: SHEPHERD12.flockCenter.x + 10, z: SHEPHERD12.flockCenter.z };
  m.vel = { x: 0, z: 0 };
};

test('spec + spawn: the shepherd and the authored flock, in sector only, one hail per visit', () => {
  const s = shepherd12Spec();
  assert.equal(s.data.shepherd12, true);
  assert.equal(s.data.authoredCharacter, 'shepherd_12');
  assert.equal(s.data.homeSectorId, 'sector_orcus_shadow');
  assert.equal(s.data.scannerSignalKind, 'salvage');
  const { state, popups } = fixture();
  assert.ok(robot(state));
  assert.equal(members(state).length, SHEPHERD12.flockCount, 'seven members ride the tide');
  assert.equal(strays(state).length, SHEPHERD12.strayCount, 'three start shy');
  const hail = says(popups, 'shepherd12_announce');
  assert.equal(hail.length, 1);
  assert.match(hail[0].text, /flock is shy/);
  assert.equal(fixture({ runKind: 'survival' }).state.entityList.filter(
    (e) => e.data?.shepherd12 || e.data?.shepherdFlock).length, 0);
  assert.equal(fixture({ sector: 'sector_io_reach' }).state.entityList.filter(
    (e) => e.data?.shepherd12 || e.data?.shepherdFlock).length, 0);
});

test('a stray pushed home is counted; the last one is FLOCK: PRESENT and pays the fragment', () => {
  const { state, popups, sys } = fixture();
  for (const m of strays(state)) home(m);
  sys.update(0.5, state);
  assert.equal(state.story.flags.shepherd_flocks, 1);
  assert.equal(state.story.flags.shepherd_paid, true);
  assert.equal(frags(state).length, 1);
  const f = frags(state)[0];
  assert.equal(f.data.typeId, VERGE_LINE_TRIAL.fragmentTypeId);
  assert.ok(Number.isFinite(f.data.weighedMass));
  assert.ok(says(popups, 'shepherd12_paid').length > 0 || says(popups, 'shepherd12_flock').length > 0);
});

test('a stray screaming through the ring is still shy — mid-throw is not home', () => {
  const { state, sys } = fixture();
  const stray = strays(state)[0];
  stray.pos = { x: SHEPHERD12.flockCenter.x + 5, z: SHEPHERD12.flockCenter.z };
  stray.vel = { x: 200, z: 0 };
  sys.update(0.5, state);
  assert.equal(state.story.flags.shepherd_flocks == null, true, 'a flyby never counts home');
});

test('PRESENT is a state, not an event — a quiet census never re-speaks the count', () => {
  const { state, popups, sys } = fixture();
  for (const m of strays(state)) home(m);
  sys.update(0.5, state);
  assert.equal(state.story.flags.shepherd_flocks, 1);
  sys.update(0.5, state);
  sys.update(0.5, state);
  assert.equal(state.story.flags.shepherd_flocks, 1, 'three quiet passes, one count');
  assert.equal(frags(state).length, 1, 'the fragment pays once per first completion');
});

test('the tide gives more strays after the beat — the count never ends', () => {
  const { state, sys } = fixture();
  for (const m of strays(state)) home(m);
  sys.update(0.5, state);
  assert.equal(state.story.flags.shepherd_flocks, 1);
  state.simTime += SHEPHERD12.waveDelay + 1;
  sys.update(0.5, state);
  const extra = strays(state).length;
  assert.equal(extra, SHEPHERD12.waveStrays, 'the wave shies two more loose');
  assert.equal(members(state).length, SHEPHERD12.flockCount + SHEPHERD12.waveStrays);
  for (const m of strays(state)) home(m);
  sys.update(0.5, state);
  assert.equal(state.story.flags.shepherd_flocks, 2, 'the second flock counts too');
  assert.equal(frags(state).length, 1, 'but only the first pays the trial fragment');
});

test('a lost member is owed back by the tide — as a stray, never handed home', () => {
  const { state, bus, sys } = fixture();
  const ring = members(state).find((m) => !shepherd12Shy(m));
  bus.emit('entity:killed', { id: ring.id, killerId: 7 });
  ring.alive = false;
  sys.update(0.5, state);
  assert.equal(members(state).length, SHEPHERD12.flockCount, 'the tide replaces the lost member');
  assert.ok(strays(state).length > SHEPHERD12.strayCount, 'the restock drifts in shy');
});

test('kill the shepherd: the count dies with it, the flock outlives it', () => {
  const { state, bus, popups, sys } = fixture();
  const r = robot(state);
  r.alive = false;
  bus.emit('entity:killed', { id: r.id, killerId: 7 });
  assert.equal(state.story.flags.shepherd_gone, true);
  assert.match(says(popups, 'shepherd12_gone')[0].text, /SHEPHERD-12 DOWN/);
  bus.emit('sector:enter', { sectorId: SHEPHERD12.sectorId });
  assert.equal(robot(state), undefined, 'the gone shepherd never re-walks the ring');
  assert.ok(members(state).length > 0, 'the flock is the tide\'s, not the shepherd\'s breath');
  for (const m of strays(state)) home(m);
  sys.update(0.5, state);
  assert.equal(state.story.flags.shepherd_flocks == null, true, 'no shepherd, no count');
});

test('sector leave removes every owned hull; the return restocks as strays', () => {
  const { state, bus } = fixture();
  assert.equal(members(state).length, SHEPHERD12.flockCount);
  state.world.currentSectorId = 'sector_io_reach';
  bus.emit('sector:enter', { sectorId: 'sector_io_reach' });
  assert.equal(members(state).length, 0);
  state.world.currentSectorId = SHEPHERD12.sectorId;
  bus.emit('sector:enter', { sectorId: SHEPHERD12.sectorId });
  assert.equal(members(state).length, SHEPHERD12.flockCount);
  assert.equal(strays(state).length, SHEPHERD12.flockCount,
    'the tide re-shies the whole flock while you are gone');
});

test('the shepherd walks the ring through the impulse membrane, never a vel write', () => {
  const { state, sys } = fixture();
  const r = robot(state);
  const before = { ...r.vel };
  sys.update(0.5, state);
  assert.deepEqual(r.vel, before, 'the adapter never writes linvel');
  const go = impulses(r);
  assert.equal(go.length, 1, 'one queued impulse per census pass');
  assert.ok(Math.abs(Math.hypot(go[0].x, go[0].z) - SHEPHERD12.patrolSpeed * r.mass) < 1e-6);
});

test('pure rules: spots deterministic, shy gate honest, owed count floors at zero', () => {
  assert.deepEqual(shepherd12MemberSpot(0), shepherd12MemberSpot(0));
  assert.deepEqual(shepherd12StraySpot(9), shepherd12StraySpot(9));
  assert.notDeepEqual(shepherd12StraySpot(7), shepherd12StraySpot(1), 'serials never share a seat');
  const inRing = { alive: true, data: { shepherdFlock: true }, pos: { ...SHEPHERD12.flockCenter }, vel: { x: 0, z: 0 } };
  assert.equal(shepherd12Shy(inRing), false);
  const out = { alive: true, data: { shepherdFlock: true }, pos: { x: 1e5, z: 0 }, vel: { x: 0, z: 0 } };
  assert.equal(shepherd12Shy(out), true);
  const noPos = { alive: true, data: { shepherdFlock: true }, vel: { x: 0, z: 0 } };
  assert.equal(shepherd12Shy(noPos), true, 'a member with no fix cannot be counted');
  assert.equal(shepherd12MemberOwed(7), 0);
  assert.equal(shepherd12MemberOwed(9), 0, 'a grown flock owes nothing');
  const dv = shepherd12PatrolDeltaV(
    { pos: { x: SHEPHERD12.flockCenter.x + SHEPHERD12.patrolRadius, z: SHEPHERD12.flockCenter.z }, vel: { x: 0, z: 0 } },
    shepherd12PatrolLeg({ x: SHEPHERD12.flockCenter.x + SHEPHERD12.patrolRadius, z: SHEPHERD12.flockCenter.z }));
  assert.ok(dv && Number.isFinite(dv.x));
});

test('fragment spec carries the Line-trial contract end to end', () => {
  const f = shepherd12FragmentSpec({ x: 1, z: 2 }, 42, 88);
  assert.equal(f.data.typeId, VERGE_LINE_TRIAL.fragmentTypeId);
  assert.ok(Number.isFinite(f.data.weighedMass));
  assert.equal(f.data.weighedBy, 42);
  assert.equal(f.data.scannerSignalKind, 'anomaly');
  assert.equal(f.data.runtimeOwner, 'shepherd_12');
});

test('destroy + re-init: provider and every owned hull clean', () => {
  const { state, helpers, sys } = fixture();
  assert.equal(helpers.sectorCookProviders.length, 1);
  sys.destroy();
  assert.equal(helpers.sectorCookProviders.length, 0);
  assert.equal(state.entityList.filter(
    (e) => e.alive && (e.data?.shepherd12 || e.data?.shepherdFlock || e.data?.shepherdFragment)).length, 0);
  sys.init({ state, bus: createBus(), helpers });
  assert.equal(helpers.sectorCookProviders.length, 1);
  assert.ok(robot(state));
});
