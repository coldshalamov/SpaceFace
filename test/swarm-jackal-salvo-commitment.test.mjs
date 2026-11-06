import assert from 'node:assert/strict';
import test from 'node:test';

import { applyMineLayerVerb } from '../src/ai/mineLayerVerb.js';
import { SWARM_SPECIALIST_TUNING } from '../src/data/swarmSpecialists.js';

const tuning = SWARM_SPECIALIST_TUNING.jackal;

function fixture() {
  const jackal = { id: 21, alive: true, type: 'ship', team: 1,
    pos: { x: 500, z: 0 }, vel: { x: 40, z: 0 }, radius: 18,
    data: { runCohort: 'survival', runWave: 6, enemyTypeId: 'mine_layer_jackal' } };
  const state = { tick: 0, simTime: 0,
    run: { kind: 'survival', ruleset: 'swarm', phase: 'active', wave: 6 },
    entityList: [jackal], entities: new Map([[jackal.id, jackal]]) };
  const requests = [];
  let nextId = 100;
  const placeMine = (spec) => {
    requests.push({ tick: state.tick, spec: structuredClone(spec) });
    const mine = { id: nextId++, alive: true, type: 'mine', ownerId: spec.ownerId,
      pos: { ...spec.pos }, data: { swarmSpecialistMine: true, ownerId: spec.ownerId } };
    state.entityList.push(mine);
    state.entities.set(mine.id, mine);
    return mine;
  };
  const step = (phase, tick, place = placeMine) => {
    state.tick = tick; state.simTime = tick / 60;
    return applyMineLayerVerb({ state, entity: jackal, doctrinePhase: phase,
      tick, doctrineStartedTick: phase === 'wake_cue' ? 0 : 30, placeMine: place });
  };
  return { state, jackal, requests, placeMine, step };
}

test('a Jackal pays the whole warning, then separates all three releases by eighteen ticks', () => {
  const f = fixture();
  f.step('wake_cue', 0);
  const warned = structuredClone(f.jackal.data.swarmSpecialist.salvoPoints);
  f.jackal.pos.x += 300;
  assert.equal(f.step('mine_drop', 29), null, 'an early doctrine transition cannot skip the visible tell');
  assert.ok(f.step('mine_drop', 30));
  assert.equal(f.step('mine_drop', 47), null);
  assert.ok(f.step('mine_drop', 48));
  assert.equal(f.step('mine_drop', 65), null);
  assert.ok(f.step('mine_drop', 66));
  assert.deepEqual(f.requests.map(row => row.tick), [30, 48, 66]);
  assert.deepEqual(f.requests.map(row => row.spec.pos), warned, 'the unanchored forecast stays committed');
  assert.equal(f.jackal.data.swarmSpecialist.phase, 'recovery');
  assert.equal(f.jackal.data.swarmSpecialist.salvoPoints, null);
});

test('an admission delay never compresses the remaining releases into consecutive ticks', () => {
  const f = fixture();
  f.step('wake_cue', 0);
  assert.equal(f.step('mine_drop', 30, () => null), null);
  assert.ok(f.step('mine_drop', 45));
  assert.equal(f.step('mine_drop', 46), null);
  assert.ok(f.step('mine_drop', 63));
  assert.equal(f.step('mine_drop', 64), null);
  assert.ok(f.step('mine_drop', 81));
  assert.deepEqual(f.requests.map(row => row.tick), [45, 63, 81]);
});

for (const interruption of ['disabled', 'stunned', 'doctrine exit']) {
  test(`${interruption} cancels unreleased mines, clears the forecast and preserves the recovery`, () => {
    const f = fixture();
    f.step('wake_cue', 0);
    assert.ok(f.step('mine_drop', 30));
    if (interruption !== 'doctrine exit') f.jackal.data[interruption] = true;
    f.step(interruption === 'doctrine exit' ? 'disengage' : 'mine_drop', 31);
    const view = f.jackal.data.swarmSpecialist;
    assert.equal(view.phase, 'recovery');
    assert.equal(view.phaseStartedAt, 31);
    assert.equal(view.salvoPoints, null, 'canceled danger geometry cannot remain in the worker projection');
    assert.equal(view.salvoAnchors, null);
    f.step('disengage', 32);
    assert.equal(view.phaseStartedAt, 31, 'repeated cancellation does not postpone recovery');
    delete f.jackal.data.disabled; delete f.jackal.data.stunned;
    assert.equal(f.step('mine_drop', 100), null, 'the old doctrine window cannot resume an interrupted salvo');
    assert.equal(f.requests.length, 1);
    f.step('wake_cue', 31 + tuning.cooldownTicks - 1);
    assert.equal(view.salvoPoints, null, 'an early next cue cannot bypass the cooldown');
    f.step('wake_cue', 31 + tuning.cooldownTicks);
    assert.equal(view.phase, 'windup');
    assert.equal(view.phaseStartedAt, 31 + tuning.cooldownTicks, 'a new warning is never backdated');
  });
}

test('a partially occupied specialist cap is rechecked before every mine request', () => {
  const f = fixture();
  f.placeMine({ ownerId: f.jackal.id, pos: { x: 0, z: 0 } });
  f.placeMine({ ownerId: f.jackal.id, pos: { x: 0, z: 0 } });
  f.requests.length = 0;
  f.step('wake_cue', 0);
  assert.ok(f.step('mine_drop', 30));
  assert.equal(f.step('mine_drop', 48), null);
  assert.equal(f.step('mine_drop', 66), null);
  assert.equal(f.requests.length, 1, 'the planner cannot request a fourth specialist mine');
  assert.equal(f.jackal.data.swarmSpecialist.phase, 'recovery');
});

test('an exhausted admission window ends in recovery instead of storing a delayed ambush', () => {
  const f = fixture();
  f.step('wake_cue', 0);
  f.step('mine_drop', 30, () => null);
  assert.equal(f.step('mine_drop', 30 + tuning.activeTicks), null);
  assert.equal(f.jackal.data.swarmSpecialist.phase, 'recovery');
  assert.equal(f.jackal.data.swarmSpecialist.salvoPoints, null);
  assert.equal(f.requests.length, 0);
});

test('serializing halfway through a salvo retains cadence, remaining mine count and forecast', () => {
  const f = fixture();
  f.step('wake_cue', 0);
  assert.ok(f.step('mine_drop', 30));
  const before = structuredClone(f.jackal.data.swarmSpecialist);
  f.jackal.data = JSON.parse(JSON.stringify(f.jackal.data));
  assert.deepEqual(f.jackal.data.swarmSpecialist, before);
  assert.equal(f.step('mine_drop', 47), null);
  assert.ok(f.step('mine_drop', 48));
  assert.ok(f.step('mine_drop', 66));
  assert.equal(f.requests.length, 3);
});

test('a wave boundary cancels a prior wave forecast before any placement request', () => {
  const f = fixture();
  f.step('wake_cue', 0);
  f.state.run.wave = 7;
  assert.equal(f.step('mine_drop', 30), null);
  assert.equal(f.jackal.data.swarmSpecialist.salvoPoints, null);
  assert.equal(f.requests.length, 0);
});

for (const phase of ['intermission', 'ended']) {
  test(`${phase} cancels the forecast without falling through to the Adventure mine verb`, () => {
    const f = fixture();
    f.step('wake_cue', 0);
    f.state.run.phase = phase;
    assert.equal(f.step('mine_drop', 30), null);
    assert.equal(f.jackal.data.swarmSpecialist.salvoPoints, null);
    assert.equal(f.requests.length, 0);
  });
}

test('a Continue from the older active-salvo shape preserves spent slots without a burst', () => {
  const f = fixture();
  f.step('wake_cue', 0);
  assert.ok(f.step('mine_drop', 30));
  // The old branch persisted the cursor, but not the actual last-release deadline.
  delete f.jackal.data.swarmSpecialist.salvoNextReleaseTick;
  f.jackal.data.swarmSpecialist.phaseEndsAt = 30;
  assert.equal(f.step('mine_drop', 31), null);
  assert.equal(f.step('mine_drop', 48), null);
  assert.ok(f.step('mine_drop', 49));
  assert.ok(f.step('mine_drop', 67));
  assert.equal(f.requests.length, 3, 'the first slot was not replayed after load');
});

test('the public forecast follows a selected drifting rock before the mine is released', () => {
  const f = fixture();
  const rock = { id: 31, type: 'asteroid', alive: true, radius: 10,
    pos: { x: 600, z: 0 }, vel: { x: 60, z: 0 } };
  f.state.entities.set(rock.id, rock); f.state.entityList.push(rock);
  f.step('wake_cue', 0);
  assert.equal(f.jackal.data.swarmSpecialist.salvoPoints[0].x, 584);
  rock.pos.x = 630; rock.vel.x = 72;
  f.step('wake_cue', 20);
  assert.equal(f.jackal.data.swarmSpecialist.salvoPoints[0].x, 614,
    'the warning moves with the carrier, before any damaging object exists');
  assert.equal(f.requests.length, 0);
  assert.ok(f.step('mine_drop', 30));
  assert.deepEqual(f.requests[0].spec.pos, { x: 614, z: 0 });
  assert.deepEqual(f.requests[0].spec.vel, { x: 72, z: 0 });
});

test('a canceled salvo still clears its forecast when the placement port is unavailable', () => {
  const f = fixture();
  f.step('wake_cue', 0);
  f.jackal.data.stunned = true;
  assert.equal(f.step('mine_drop', 30, null), null);
  assert.equal(f.jackal.data.swarmSpecialist.phase, 'recovery');
  assert.equal(f.jackal.data.swarmSpecialist.salvoPoints, null);
  assert.equal(f.requests.length, 0);
});

test('Adventure keeps the ordinary 42-tick single-mine cadence', () => {
  const f = fixture();
  f.state.run.ruleset = 'adventure';
  assert.ok(f.step('mine_drop', 100));
  assert.equal(f.step('mine_drop', 141), null);
  assert.ok(f.step('mine_drop', 142));
  assert.equal(f.requests[0].spec.swarmSpecialistMine, undefined);
});
