// INF-2 (WF-12): a body resident in your Well or Repulsor wears the field's mark. fields.js keeps
// status_pinned / status_unmoored scheduled on every resident; the attached-status presentation
// now draws them (retained hull-seated geometry through StatusMatterVfx) and the causal grammar
// files their apply bursts under the field family. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { PINNED_STATUS_ID, UNMOORED_STATUS_ID } from '../src/data/combatDefs.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { actions } from '../src/systems/actions.js';
import { fields } from '../src/systems/fields.js';
import {
  STATUS_ATTACHED_CAP,
  STATUS_ATTACHED_KIND,
  collectStatusAttachedVictims,
  planStatusAttachedEmit,
} from '../src/render/statusAttachedVfx.js';
import { StatusMatterVfx } from '../src/render/vfx/statusMatterVfx.js';
import { CAUSAL_VFX_FAMILIES, classifyCausalVfxFamily } from '../src/presentation/causalVfxGrammar.js';

function ship(id, x, z, team) {
  return {
    id, type: 'ship', alive: true, team, collides: true, radius: 10, mass: 40,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, hull: 200, hullMax: 200, shield: 0, shieldMax: 0,
    armorHp: 0, armorMax: 0, cap: 100, capMax: 100, flags: {},
    physicsBody: { schemaVersion: 1, radius: 10, mass: 40, inertiaY: 160, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship', proportions: { length: 1.6, halfWidth: 0.5, height: 0.4 } },
  };
}

function deployField(action) {
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    const sim = createSimulation({ seed: 4242, bus: createBus(), systems: [actions, fields] });
    const { state } = sim;
    state.mode = 'flight';
    state.input.actions = {};
    const player = sim.spawn(ship(1, 0, 0, 0));
    const target = sim.spawn(ship(2, action === 'deployWell' ? 300 : 60, action === 'deployWell' ? 80 : 0, 1));
    state.playerId = player.id;
    state.input.aimWorld = { x: target.pos.x, z: 0 };
    state.input.actions[action] = true;
    sim.step();
    sim.step();
    for (let i = 0; i < 40; i++) sim.step();
    return { sim, state, player, target };
  } finally {
    FIELD_FLAGS.enabled = previous;
  }
}

test('a body resident in a Repulsor is unmoored and the collector hands the presentation an UNMOORED record', () => {
  const { state, target } = deployField('deployRepulsor');
  const status = state.combat.entities[String(target.id)].statuses[UNMOORED_STATUS_ID];
  assert.ok(status, 'the landed Repulsor schedules status_unmoored on its resident');
  const mark = collectStatusAttachedVictims(state, []).find((r) => r.entityId === target.id && r.statusId === UNMOORED_STATUS_ID);
  assert.ok(mark, 'a resident of the field now has a presentable record');
  assert.equal(mark.kind, STATUS_ATTACHED_KIND.UNMOORED);
  assert.ok(mark.remainingS > 0);
});

test('a body resident in a Well is pinned and the collector hands the presentation a PINNED record', () => {
  const { state, target } = deployField('deployWell');
  assert.ok(state.combat.entities[String(target.id)].statuses[PINNED_STATUS_ID], 'the landed Well schedules status_pinned');
  const mark = collectStatusAttachedVictims(state, []).find((r) => r.entityId === target.id && r.statusId === PINNED_STATUS_ID);
  assert.ok(mark);
  assert.equal(mark.kind, STATUS_ATTACHED_KIND.PINNED);
});

test('expiry clears the field marks', () => {
  const { state, target } = deployField('deployRepulsor');
  const active = state.combat.entities[String(target.id)].statuses[UNMOORED_STATUS_ID];
  state.tick = active.expiresTick;
  assert.equal(collectStatusAttachedVictims(state, []).some((r) => r.statusId === UNMOORED_STATUS_ID), false);
});

test('pinned and unmoored apply bursts classify as the field family, ordinary statuses still do not', () => {
  assert.equal(classifyCausalVfxFamily('combat:statusApplied', { statusId: 'status_pinned' }), CAUSAL_VFX_FAMILIES.field);
  assert.equal(classifyCausalVfxFamily('combat:statusApplied', { statusId: 'status_unmoored' }), CAUSAL_VFX_FAMILIES.field);
  assert.equal(classifyCausalVfxFamily('combat:statusApplied', { statusId: 'status_burning' }), CAUSAL_VFX_FAMILIES.reaction);
});

test('the attached cap and pool still hold with the new kinds', () => {
  const entities = new Map();
  const table = {};
  for (let id = 2; id < 14; id++) {
    entities.set(id, { id, alive: true, type: 'ship', pos: { x: id * 10, z: 0 }, radius: 6 });
    table[id] = { statuses: {
      [PINNED_STATUS_ID]: { expiresTick: 400, stacks: 1 },
      [UNMOORED_STATUS_ID]: { expiresTick: 400, stacks: 1 },
      status_burning: { expiresTick: 400, stacks: 1 },
    } };
  }
  const state = { tick: 0, playerId: 1, entities, combat: { entities: table } };
  const first = collectStatusAttachedVictims(state, []);
  assert.equal(first.length, STATUS_ATTACHED_CAP, 'the cap holds');
  assert.equal(new Set(first.map((r) => r.key)).size, first.length, 'victim cadence keys are unique across kinds');
  const second = collectStatusAttachedVictims(state, []);
  assert.equal(second[0], first[0], 'records come from the pool');
});

test('field marks admit cadence but emit no sprites, even under reduced motion and flash', () => {
  for (const statusId of [PINNED_STATUS_ID, UNMOORED_STATUS_ID]) {
    const victim = { entityId: 2, statusId, kind: statusId === PINNED_STATUS_ID ? 'pinned' : 'unmoored', stacks: 1, remainingS: 2, tick: 0, radius: 8 };
    const plan = planStatusAttachedEmit(victim, 0.16, { motionReduce: true, flashReduce: true }, 0);
    assert.equal(plan.emit, true);
    assert.equal(plan.sprites.length, 0, 'retained hull-seated geometry, never an emitted cloud');
  }
});

function matterFixture() {
  const body = {
    id: 3, alive: true, type: 'ship', pos: { x: 20, z: 5 }, prevPos: { x: 18, z: 3 }, rot: 0.4, prevRot: 0.2,
    radius: 10, vel: { x: 0, z: 0 }, data: { proportions: { length: 1.6, halfWidth: 0.5, height: 0.4 } },
  };
  return {
    simTime: 1, tick: 60, mode: 'flight', entities: new Map([[3, body]]), settings: { video: {} }, render: { interpolationAlpha: 1 },
    combat: { entities: { 3: { statuses: {
      [PINNED_STATUS_ID]: { expiresTick: 300, stacks: 1 },
      [UNMOORED_STATUS_ID]: { expiresTick: 300, stacks: 1 },
    } } } },
  };
}

function piecesOf(owner) {
  return Array.from({ length: owner.batch.count }, (_, i) => {
    const out = [];
    for (const a of owner.batch.attributes) for (let c = 0; c < 4; c++) out.push(a.array[i * 4 + c]);
    return out;
  });
}

function at(state, time) {
  state.tick += Math.round((time - state.simTime) * 60);
  state.simTime = time;
}

test('the consumer builds, positions and retires distinct marks for pinned and unmoored', () => {
  const built = {};
  for (const statusId of [PINNED_STATUS_ID, UNMOORED_STATUS_ID]) {
    const state = matterFixture();
    const owner = new StatusMatterVfx(new THREE.Scene());
    assert.equal(owner.touchStatus({ entityId: 3, statusId }, state), true, `${statusId} is admitted`);
    at(state, 1.1);
    owner.update(state);
    const early = piecesOf(owner);
    assert.ok(early.length > 0, 'the mark builds geometry');
    assert.ok(early.every((row) => row.every(Number.isFinite)));
    const slot = owner.slots.find((s) => s.alive);
    for (const row of early) {
      assert.ok(Math.hypot(row[0] - slot.x, row[2] - slot.z) < 40, 'seated on the hull, not floating away');
    }
    at(state, 1.5);
    owner.touchStatus({ entityId: 3, statusId }, state);
    owner.update(state);
    assert.notDeepEqual(piecesOf(owner), early, 'the mark moves with time');
    built[statusId] = { count: early.length, signature: early.map((r) => r[4]).join(',') };
    delete state.combat.entities[3].statuses[statusId];
    at(state, 1.55);
    owner.update(state);
    assert.equal(owner.stats.powered, 0, 'power stops at cutoff');
    at(state, 3);
    owner.update(state);
    assert.equal(owner.live, 0, 'residue retires');
    owner.dispose();
  }
  assert.notDeepEqual(built[PINNED_STATUS_ID], built[UNMOORED_STATUS_ID], 'pinned and unmoored are different constructions');
});

test('the marks hold still under reduced motion and spawn no particles', () => {
  for (const statusId of [PINNED_STATUS_ID, UNMOORED_STATUS_ID]) {
    const state = matterFixture();
    state.settings = { video: { motionReduce: true, flashReduce: true } };
    const owner = new StatusMatterVfx(new THREE.Scene());
    owner.touchStatus({ entityId: 3, statusId }, state);
    at(state, 1.2);
    owner.update(state);
    const before = piecesOf(owner);
    assert.ok(before.length > 0, 'the mark stays readable');
    at(state, 1.4);
    owner.touchStatus({ entityId: 3, statusId }, state);
    owner.update(state);
    assert.equal(owner.particles.live, 0);
    assert.deepEqual(piecesOf(owner).map((r) => r[3]), before.map((r) => r[3]), 'no motion under reduced motion');
    owner.dispose();
  }
});

test('field status marks are deterministic for the same seeded field run', () => {
  const pick = (world) => collectStatusAttachedVictims(world.state, []).map((r) => [r.entityId, r.statusId, r.remainingS]);
  assert.deepEqual(pick(deployField('deployRepulsor')), pick(deployField('deployRepulsor')));
});

test('the no-emit path allocates nothing: invalid victims share one frozen result, idle ones one scratch', () => {
  const dead = planStatusAttachedEmit(null, 0, {}, 0);
  assert.equal(Object.isFrozen(dead), true);
  assert.equal(planStatusAttachedEmit({ statusId: 'status_nope', remainingS: 1 }, 0, {}, 0), dead, 'one shared result');
  const victim = { entityId: 2, statusId: PINNED_STATUS_ID, kind: 'pinned', stacks: 1, remainingS: 2, tick: 0, radius: 8 };
  const first = planStatusAttachedEmit(victim, 0, {}, 0.01);
  const second = planStatusAttachedEmit(victim, 0.03, {}, 0.01);
  assert.equal(first.emit, false);
  assert.equal(first, second, 'between pulses the same retained result is reused');
  assert.equal(second.nextCadenceAgeS, 0.04, 'and it carries the live cadence age');
});

test('field-status grammar is an enumerated list: lookalike ids do not re-bucket', () => {
  for (const id of ['status_gravity_marked', 'status_pinned', 'status_unmoored']) {
    assert.equal(classifyCausalVfxFamily('combat:statusApplied', { statusId: id }), CAUSAL_VFX_FAMILIES.field, id);
  }
  for (const id of ['status_watermark', 'status_wellness', 'status_marked_for_death', 'status_fieldwork']) {
    assert.equal(classifyCausalVfxFamily('combat:statusApplied', { statusId: id }), CAUSAL_VFX_FAMILIES.reaction, id);
  }
  assert.equal(classifyCausalVfxFamily('combat:statusApplied', { statusId: 'status_x', field: true }), CAUSAL_VFX_FAMILIES.field,
    'an explicit field flag still wins');
});
