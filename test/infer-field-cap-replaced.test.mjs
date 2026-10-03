/**
 * Cap replacement used to drop the oldest player well/repulsor with fields:ended
 * and no toast. Destroyed and expired emitters already cue; replaced must say so
 * once, and only when the retired record is the player's.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { fields } from '../src/systems/fields.js';
import { FIELD_DEFS, FIELD_END_REASONS, FIELD_FLAGS, FIELD_MAX_ACTIVE } from '../src/data/fields.js';

const DT = SIM_DT;

function boot(seed = 5142) {
  const sim = createSimulation({
    seed,
    bus: createBus(),
    systems: [fields],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, collides: true,
    vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    hull: 200, hullMax: 200,
    flightModel: { inertia: 88 }, flags: {},
    physicsBody: { schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship' },
  });
  state.playerId = player.id;
  const events = [];
  for (const name of ['fields:deployed', 'fields:ended', 'audio:cue', 'toast']) {
    sim.bus.on(name, (p) => events.push({ name, p, tick: state.tick }));
  }
  return { sim, state, events, player, fieldsSys: sim.registry.get('fields') };
}

function withFlag(on, fn) {
  const prev = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = on;
  try {
    return fn();
  } finally {
    FIELD_FLAGS.enabled = prev;
  }
}

function pressDeploy(t, action, aim) {
  if (aim) t.state.input.aimWorld = aim;
  t.state.fields.cooldowns.well = 0;
  t.state.fields.cooldowns.repulsor = 0;
  const before = t.events.length;
  t.state.input.actions[action] = true;
  t.sim.step();
  assert.equal(t.state.input.actions[action], false, 'deploy edge must be consumed');
  return t.events.slice(before);
}

function replacedEnds(step) {
  return step.filter((e) => e.name === 'fields:ended' && e.p && e.p.reason === FIELD_END_REASONS.replaced);
}

function replacedToasts(step) {
  return step.filter((e) => e.name === 'toast' && e.p && /replaced/i.test(String(e.p.text || '')));
}

function fillUntilReplace(t, action, aimAt) {
  const steps = [];
  let replacedStep = null;
  for (let i = 0; i < FIELD_MAX_ACTIVE + 1; i++) {
    const aim = aimAt ? aimAt(i) : undefined;
    const step = pressDeploy(t, action, aim);
    steps.push(step);
    const ended = replacedEnds(step);
    const toasts = replacedToasts(step);
    if (ended.length === 0) {
      assert.equal(toasts.length, 0, `deploy ${i} under the cap must not toast a replacement`);
    } else {
      assert.equal(replacedStep, null, 'one cap-exceeding deploy is enough to prove the toast');
      replacedStep = { i, step, ended, toasts };
    }
  }
  assert.ok(replacedStep, 'the deploy past the active cap retires the oldest emitter');
  assert.equal(replacedStep.i, FIELD_MAX_ACTIVE, 'replacement happens on the cap-exceeding deploy');
  assert.ok(t.fieldsSys._kernel.size <= FIELD_MAX_ACTIVE, 'cap stays FIELD_MAX_ACTIVE');
  return replacedStep;
}

test('planting one more well past the cap toasts that the oldest well was replaced', () => {
  withFlag(true, () => {
    const t = boot(5142);
    const { step, ended, toasts } = fillUntilReplace(t, 'deployWell', (i) => ({ x: 200 + i * 40, z: 20 }));
    assert.equal(ended.length, 1);
    assert.equal(ended[0].p.kind, 'well');
    assert.equal(toasts.length, 1, 'exactly one replaced toast');
    assert.equal(toasts[0].tick, ended[0].tick);
    assert.deepEqual(toasts[0].p, { text: 'Oldest Well was replaced', kind: 'warn', ttl: 1.6 });
    assert.equal(step.filter((e) => e.name === 'audio:cue').length, 0, 'replacement does not take the explosion cue');
    const first = t.events.find((e) => e.name === 'fields:deployed');
    assert.equal(ended[0].p.fieldId, first.p.fieldId, 'the retired field is the oldest deploy');
  });
});

test('planting one more repulsor past the cap names the repulsor', () => {
  withFlag(true, () => {
    const t = boot(5143);
    const { ended, toasts } = fillUntilReplace(t, 'deployRepulsor');
    assert.equal(ended.length, 1);
    assert.equal(ended[0].p.kind, 'repulsor');
    assert.equal(toasts.length, 1);
    assert.deepEqual(toasts[0].p, { text: 'Oldest Repulsor was replaced', kind: 'warn', ttl: 1.6 });
  });
});

test('a repulsor that replaces an older well names the well', () => {
  withFlag(true, () => {
    const t = boot(5144);
    pressDeploy(t, 'deployWell', { x: 240, z: 0 });
    let replaced = null;
    for (let i = 0; i < FIELD_MAX_ACTIVE; i++) {
      const step = pressDeploy(t, 'deployRepulsor');
      const ended = replacedEnds(step);
      if (ended.length === 0) {
        assert.equal(replacedToasts(step).length, 0);
      } else {
        replaced = { step, ended };
        break;
      }
    }
    assert.ok(replaced, 'the later repulsor retires the older well');
    assert.equal(replaced.ended[0].p.kind, 'well');
    const toasts = replacedToasts(replaced.step);
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].p.text, 'Oldest Well was replaced');
    assert.equal(toasts[0].tick, replaced.ended[0].tick);
  });
});

test('an expired well cues without a replaced toast', () => {
  withFlag(true, () => {
    const t = boot(5145);
    pressDeploy(t, 'deployWell', { x: 300, z: 0 });
    const ticks = Math.ceil(FIELD_DEFS.well.durationS / DT) + 4;
    for (let i = 0; i < ticks; i++) t.sim.step();
    assert.ok(t.events.some((e) => e.name === 'fields:ended' && e.p.reason === FIELD_END_REASONS.expired));
    assert.ok(t.events.some((e) => e.name === 'audio:cue' && e.p.id === 'sfx_explosion_small'));
    assert.equal(replacedToasts(t.events).length, 0);
  });
});

test('a destroyed well cues without a replaced toast', () => {
  withFlag(true, () => {
    const t = boot(5146);
    pressDeploy(t, 'deployWell', { x: 300, z: 0 });
    const emitter = [...t.state.entities.values()].find((e) => e.type === 'fieldEmitter');
    assert.ok(emitter, 'emitter spawned');
    emitter.alive = false;
    t.sim.step();
    assert.ok(t.events.some((e) => e.name === 'fields:ended' && e.p.reason === FIELD_END_REASONS.destroyed));
    assert.ok(t.events.some((e) => e.name === 'audio:cue' && e.p.id === 'sfx_explosion_small'));
    assert.equal(replacedToasts(t.events).length, 0);
  });
});

test('replacing a planted hostile field does not toast', () => {
  withFlag(true, () => {
    const t = boot(5147);
    const planted = t.fieldsSys.plantField(t.state, {
      defKey: 'well',
      center: { x: -400, z: 40 },
      tag: 'npc',
    });
    assert.ok(planted && planted.fieldId);
    let replaced = null;
    for (let i = 0; i < FIELD_MAX_ACTIVE + 1; i++) {
      const step = pressDeploy(t, 'deployWell', { x: 200 + i * 40, z: 20 });
      const ended = replacedEnds(step);
      if (ended.length === 0) continue;
      replaced = { step, ended };
      break;
    }
    assert.ok(replaced, 'the cap retires the older planted emitter');
    assert.equal(replaced.ended.length, 1);
    assert.equal(replaced.ended[0].p.fieldId, planted.fieldId);
    assert.equal(replacedToasts(t.events).length, 0);
  });
});
