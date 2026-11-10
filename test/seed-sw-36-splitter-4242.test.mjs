// SEED-SW-36 — a splitter dies into three smaller bodies paid from the wave's own budget.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { mulberry32 } from '../src/core/rng.js';
import {
  SWARM_BROOD_FAMILIES,
  SWARM_BROOD_MAX,
  swarmBroodFamily,
  swarmBroodIssues,
  swarmBroodPlan,
  swarmBroodPopulation,
} from '../src/data/swarmBrood.js';
import {
  foldBroodLatePlan,
  swarmBroodLateFamily,
  swarmBroodLateIssues,
} from '../src/data/swarmBroodLate.js';
import { broodStreamSeed, createBroodEngine } from '../src/systems/swarmBrood.js';
import { createBroodPresentation } from '../src/render/broodPresentation.js';

const SEED = 4242;

function boot(wave) {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const player = {
    id: state.nextEntityId++, alive: true, type: 'ship', pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, radius: 6, mass: 400, hull: 200, hullMax: 200,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.entityIndex = {
    __spacefaceEntityIndexV1: true, ready: true,
    shipLike: [player], asteroids: [],
  };
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: SEED });
  state.run.phase = 'active';
  state.run.wave = wave;
  state.mode = 'flight';
  state.player = state.player || { tether: null };
  const engine = createBroodEngine({ bus, getState: () => state, fieldList: () => [] });
  return { state, emitted, player, engine };
}

function countFamily(engine, familyIndex) {
  let n = 0;
  for (let i = 0; i < SWARM_BROOD_MAX; i++) {
    if (engine._bodies.alive[i] && engine._bodies.family[i] === familyIndex) n += 1;
  }
  return n;
}

function firstFamily(engine, familyIndex) {
  for (let i = 0; i < SWARM_BROOD_MAX; i++) {
    if (engine._bodies.alive[i] && engine._bodies.family[i] === familyIndex) return i;
  }
  return -1;
}

function budget(engine) {
  return engine.census().alive + engine.view.pendingCount + engine._hive().sacBudget + engine._splitter().reserve;
}

test('the splitter continues the clock and pays its children from the wave budget, seed 4242', () => {
  assert.deepEqual(swarmBroodIssues(), []);
  assert.deepEqual(swarmBroodLateIssues(), []);
  const splitter = swarmBroodLateFamily('splitter');
  const mite = swarmBroodFamily('mite');
  assert.ok(splitter && mite);
  assert.equal(splitter.fromWave, 21);
  assert.ok(splitter.radius < 12 && splitter.radius > mite.radius, 'children are the smaller lawful body');
  assert.ok(splitter.telegraph.bark && splitter.telegraph.line && splitter.telegraph.cue);
  assert.ok(splitter.counter.length >= 10);

  const before = foldBroodLatePlan(swarmBroodPlan(20, mulberry32(broodStreamSeed(SEED, 20))), 20);
  assert.equal(before.some((part) => part.id === 'splitter'), false);
  const plan = foldBroodLatePlan(swarmBroodPlan(21, mulberry32(broodStreamSeed(SEED, 21))), 21);
  assert.equal(plan.reduce((sum, part) => sum + part.count, 0), swarmBroodPopulation(21));
  assert.ok(plan.find((part) => part.id === 'splitter').count > 0);

  const h = boot(21);
  const shipsBefore = h.state.entityList.length;
  h.engine.prepareWave(h.state.run, 21);
  h.engine.spawnWave(h.state);
  const splitterIndex = SWARM_BROOD_FAMILIES.length
    + ['burrower', 'splitter'].indexOf('splitter');
  const miteIndex = SWARM_BROOD_FAMILIES.findIndex((row) => row.id === 'mite');
  const splitters = countFamily(h.engine, splitterIndex);
  assert.ok(splitters > 0, 'wave 21 fields splitters');
  assert.equal(h.engine._splitter().reserve, splitters * 2);
  assert.equal(budget(h.engine), swarmBroodPopulation(21));
  assert.ok(h.engine.census().alive <= SWARM_BROOD_MAX);

  const mitesBefore = countFamily(h.engine, miteIndex);
  const slot = firstFamily(h.engine, splitterIndex);
  h.engine._killDirectForTest(slot, 'direct');
  const telegraphs = h.emitted.filter((row) => row.event === 'swarm:broodTelegraph');
  assert.ok(telegraphs.length >= 1);
  assert.equal(telegraphs[0].payload.bark, splitter.telegraph.bark);
  assert.equal(telegraphs[0].payload.line, splitter.telegraph.line);
  assert.equal(telegraphs[0].payload.cue, splitter.telegraph.cue);
  assert.equal(telegraphs[0].payload.familyId, 'splitter');
  assert.equal(countFamily(h.engine, splitterIndex), splitters - 1);
  assert.equal(countFamily(h.engine, miteIndex), mitesBefore + 3);
  assert.equal(h.engine._splitter().reserve, (splitters * 2) - 2);
  assert.equal(budget(h.engine), swarmBroodPopulation(21));
  assert.ok(h.engine.census().alive <= SWARM_BROOD_MAX);
  assert.equal(h.state.entityList.length, shipsBefore, 'the split stays brood bodies, not ships');

  const scene = {
    objects: [],
    add(o) { this.objects.push(o); },
    remove() {},
  };
  const pres = createBroodPresentation(scene, 400);
  pres.update(h.engine.view, 1 / 60, { simTime: 0 });
  assert.equal(scene.objects[0].count, h.engine.census().alive);
});
