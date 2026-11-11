// SEED-SW-37 — a brood mother walks, births mites from the wave reserve, and stops when she dies.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { mulberry32 } from '../src/core/rng.js';
import {
  SWARM_BROOD_FAMILIES,
  SWARM_BROOD_MAX,
  swarmBroodIssues,
  swarmBroodPlan,
  swarmBroodPopulation,
} from '../src/data/swarmBrood.js';
import {
  SWARM_BROOD_LATE_FAMILIES,
  foldBroodLatePlan,
  swarmBroodLateFamily,
  swarmBroodLateIssues,
} from '../src/data/swarmBroodLate.js';
import { broodStreamSeed, createBroodEngine } from '../src/systems/swarmBrood.js';
import { createBroodPresentation } from '../src/render/broodPresentation.js';

const DT = 1 / 60;
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
  return { state, emitted, engine };
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
  return engine.census().alive
    + engine.view.pendingCount
    + engine._hive().sacBudget
    + engine._splitter().reserve
    + engine._mother().reserve;
}

function step(engine, state, ticks) {
  for (let i = 0; i < ticks; i++) {
    state.simTime += DT;
    state.tick += 1;
    engine.step(state);
  }
}

test('the brood mother walks a mite tide and stops it when she dies, seed 4242', () => {
  assert.deepEqual(swarmBroodIssues(), []);
  assert.deepEqual(swarmBroodLateIssues(), []);
  const mother = swarmBroodLateFamily('brood_mother');
  assert.ok(mother);
  assert.equal(mother.fromWave, 23);
  assert.ok(mother.telegraph.bark && mother.telegraph.line && mother.telegraph.cue);
  assert.ok(mother.counter.length >= 10);
  assert.ok(mother.birthBudget > 0 && mother.birthEveryS > 0);

  const early = foldBroodLatePlan(swarmBroodPlan(22, mulberry32(broodStreamSeed(SEED, 22))), 22);
  assert.equal(early.some((part) => part.id === 'brood_mother'), false);
  const plan = foldBroodLatePlan(swarmBroodPlan(23, mulberry32(broodStreamSeed(SEED, 23))), 23);
  assert.equal(plan.reduce((sum, part) => sum + part.count, 0), swarmBroodPopulation(23));
  assert.ok(plan.find((part) => part.id === 'brood_mother').count > 0);

  const h = boot(23);
  const shipsBefore = h.state.entityList.length;
  h.engine.prepareWave(h.state.run, 23);
  h.engine.spawnWave(h.state);
  const motherIndex = SWARM_BROOD_FAMILIES.length
    + SWARM_BROOD_LATE_FAMILIES.findIndex((row) => row.id === 'brood_mother');
  const miteIndex = SWARM_BROOD_FAMILIES.findIndex((row) => row.id === 'mite');
  assert.equal(countFamily(h.engine, motherIndex), 1);
  assert.equal(h.engine._mother().reserve, mother.birthBudget);
  assert.equal(budget(h.engine), swarmBroodPopulation(23));
  assert.ok(h.engine.census().alive <= SWARM_BROOD_MAX);

  const slot = firstFamily(h.engine, motherIndex);
  const bornAt = { x: h.engine._bodies.px[slot], z: h.engine._bodies.pz[slot] };
  const mitesAtOpen = countFamily(h.engine, miteIndex);
  step(h.engine, h.state, 40);
  const walked = Math.hypot(
    h.engine._bodies.px[slot] - bornAt.x,
    h.engine._bodies.pz[slot] - bornAt.z,
  );
  assert.ok(walked > 1, 'the mother walks the room');
  assert.equal(countFamily(h.engine, miteIndex), mitesAtOpen, 'the tide waits out its cadence');
  assert.equal(h.emitted.filter((row) => row.event === 'swarm:broodTelegraph' && row.payload.familyId === 'brood_mother').length, 0);

  let born = false;
  const ticks = Math.ceil(mother.birthEveryS / DT) + 4;
  for (let i = 0; i < ticks; i++) {
    step(h.engine, h.state, 1);
    if (countFamily(h.engine, miteIndex) === mitesAtOpen + 1) {
      born = true;
      break;
    }
  }
  assert.equal(born, true, 'one mite comes off the reserve');
  const telegraphs = h.emitted.filter((row) => row.event === 'swarm:broodTelegraph' && row.payload.familyId === 'brood_mother');
  assert.equal(telegraphs.length, 1);
  assert.equal(telegraphs[0].payload.bark, mother.telegraph.bark);
  assert.equal(telegraphs[0].payload.line, mother.telegraph.line);
  assert.equal(telegraphs[0].payload.cue, mother.telegraph.cue);
  assert.equal(h.engine._mother().reserve, mother.birthBudget - 1);
  assert.equal(budget(h.engine), swarmBroodPopulation(23));
  assert.equal(h.engine._bodies.alive[slot], 1);

  const mitesAtKill = countFamily(h.engine, miteIndex);
  h.engine._killDirectForTest(slot, 'direct');
  assert.equal(h.engine._bodies.alive[slot], 0);
  assert.equal(h.engine._mother().reserve, 0, 'her unspent tide is dropped');
  step(h.engine, h.state, Math.ceil(mother.birthEveryS / DT) * 3);
  assert.equal(countFamily(h.engine, miteIndex), mitesAtKill, 'a dead mother births nothing more');
  assert.ok(h.engine.census().alive <= SWARM_BROOD_MAX);
  assert.ok(budget(h.engine) <= swarmBroodPopulation(23));
  assert.equal(h.state.entityList.length, shipsBefore);

  const scene = {
    objects: [],
    add(o) { this.objects.push(o); },
    remove() {},
  };
  const pres = createBroodPresentation(scene, 400);
  pres.update(h.engine.view, DT, { simTime: h.state.simTime });
  assert.equal(scene.objects[0].count, h.engine.census().alive);
});
