/**
 * PIC-20 — a rescued, ransomed, or lost survivor pod retires in that cause's colour,
 * at the pod's last point, and the body is gone. Seed 4242.
 * Lost is the sim outcome "abandoned".
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { mulberry32 } from '../src/core/rng.js';
import { ACTION_VFX_EVENTS } from '../src/render/actionVfx.js';
import { ADDITIONAL_ACTION_VFX_RECIPES, SURVIVOR_POD_RETIRE, resolveAdditionalActionVfxReceipt } from '../src/render/vfx/actionEventRecipes.js';
import { WORLD_CUE_ACTION_RECIPE } from '../src/render/vfx/worldCueRecipes.js';
import { survivorPod } from '../src/systems/survivorPod.js';

const OUTCOMES = ['rescued', 'ransomed', 'abandoned'];

function debtCount(state) {
  const debts = state.story && state.story.moralMemory && state.story.moralMemory.debts;
  return debts ? Object.keys(debts).length : 0;
}

function boot() {
  const bus = createBus();
  const state = {
    mode: 'flight',
    tick: 20,
    simTime: 30,
    playerId: 1,
    meta: { seed: 4242 },
    rng: mulberry32(4242),
    nextEntityId: 500,
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: 'sector_tethys_junction' },
    player: { tether: { active: false, targetId: null } },
    story: { flags: {} },
    ui: {},
  };
  state.entities.set(1, {
    id: 1,
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 12,
    rot: 0.2,
    data: {},
    flags: {},
  });
  state.entityList.push(state.entities.get(1));
  survivorPod.init({ state, bus, helpers: {}, registry: null });
  return { state, bus };
}

test('PIC-20 seed 4242 paints one cause colour where the pod was and removes the body', () => {
  const { state, bus } = boot();
  const resolved = [];
  bus.on('survivorPod:resolved', (payload) => resolved.push(payload));
  let victimSeq = 80;

  function spawnPod(at) {
    victimSeq += 1;
    const victim = {
      id: victimSeq,
      type: 'ship',
      factionId: 'faction_mts',
      pos: { x: at.x, z: at.z },
      vel: { x: 2, z: -1 },
      radius: 12,
      rot: 0.2,
      alive: false,
      data: {},
    };
    const pod = survivorPod._spawnCausalPod(state, victim, { pos: victim.pos, vel: victim.vel });
    assert.ok(pod, `pod for victim ${victim.id}`);
    return pod;
  }

  try {
    assert.equal(WORLD_CUE_ACTION_RECIPE.variants['survivor.pod.retired'], undefined);
    assert.ok(ACTION_VFX_EVENTS.includes('survivorPod:resolved'));
    assert.equal(resolveAdditionalActionVfxReceipt('survivorPod:resolved', { outcome: 'lost', pos: { x: 1, z: 2 } }, state), null);
    assert.equal(resolveAdditionalActionVfxReceipt('survivorPod:resolved', { outcome: 'abandoned' }, state), null);

    const colours = [];
    OUTCOMES.forEach((outcome, index) => {
      const pod = spawnPod({ x: 40 + index * 30, z: -20 - index * 12 });
      const own = state.survivorPod;
      const rec = own.causal.byEntityId[pod.id];
      const beforeResolved = resolved.length;
      const ok = survivorPod._resolveCausal(state, own, rec, pod, outcome, { reason: `pic20_${outcome}` });
      assert.equal(ok, true);
      assert.equal(resolved.length, beforeResolved + 1);
      const event = resolved[resolved.length - 1];
      assert.equal(event.outcome, outcome);
      assert.equal(event.pos.x, pod.pos.x);
      assert.equal(event.pos.z, pod.pos.z);
      assert.equal(state.entities.get(pod.id), undefined, `${outcome} body is gone`);
      const painted = resolveAdditionalActionVfxReceipt('survivorPod:resolved', event, state);
      assert.ok(painted, `${outcome} paints`);
      assert.equal(painted.kind, outcome);
      assert.equal(painted.attachToTarget, false);
      assert.equal(painted.pos.x, event.pos.x);
      assert.equal(painted.pos.z, event.pos.z);
      const variant = SURVIVOR_POD_RETIRE[outcome];
      const recipe = ADDITIONAL_ACTION_VFX_RECIPES['survivorPod:resolved'].variants[outcome];
      assert.equal(recipe.color, variant.color);
      assert.equal(recipe.verb, variant.verb);
      const again = survivorPod._resolveCausal(state, own, rec, pod, outcome, { reason: 'repeat' });
      assert.equal(again, false);
      assert.equal(resolved.length, beforeResolved + 1);
      colours.push(variant.color);
    });

    assert.equal(new Set(colours).size, 3);
    assert.equal(SURVIVOR_POD_RETIRE.rescued.verb, 'cool');
    assert.equal(SURVIVOR_POD_RETIRE.ransomed.verb, 'command');
    assert.equal(SURVIVOR_POD_RETIRE.abandoned.verb, 'disrupt');

    const gone = spawnPod({ x: 180, z: 40 });
    const goneId = gone.id;
    const debtsBefore = debtCount(state);
    const resolvedBefore = resolved.length;
    gone.alive = false;
    state.entities.delete(goneId);
    const listAt = state.entityList.indexOf(gone);
    if (listAt >= 0) state.entityList.splice(listAt, 1);
    survivorPod.update(1 / 60, state);
    assert.equal(resolved.length, resolvedBefore, 'a missing body does not emit a second resolve');
    assert.equal(debtCount(state), debtsBefore, 'a missing body does not write another moral debt');

    const wreck = spawnPod({ x: -90, z: 25 });
    wreck.data.playerWreck = true;
    wreck.alive = false;
    const wreckDebts = debtCount(state);
    const wreckResolved = resolved.length;
    survivorPod.update(1 / 60, state);
    assert.equal(state.survivorPod.causal.byEntityId[wreck.id], undefined);
    assert.equal(debtCount(state), wreckDebts);
    assert.equal(resolved.length, wreckResolved);
  } finally {
    survivorPod.destroy();
  }
});
