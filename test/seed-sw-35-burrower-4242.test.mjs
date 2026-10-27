// SEED-SW-35 — the Burrower parks inside a rock and telegraphs before it bursts.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { mulberry32 } from '../src/core/rng.js';
import {
  SWARM_BROOD_FAMILIES,
  SWARM_BROOD_MAX,
  swarmBroodBossFor,
  swarmBroodIssues,
  swarmBroodKillPay,
  swarmBroodPlan,
  swarmBroodPopulation,
} from '../src/data/swarmBrood.js';
import {
  SWARM_BROOD_LATE_FAMILIES,
  foldBroodLatePlan,
  swarmBroodLateFamily,
  swarmBroodLateIssues,
} from '../src/data/swarmBroodLate.js';
import { broodStreamSeed, createBroodEngine, BROOD_PHASE_BURIED, BROOD_PHASE_WINDUP, BROOD_PHASE_FLOCK } from '../src/systems/swarmBrood.js';
import { createBroodPresentation } from '../src/render/broodPresentation.js';

const DT = 1 / 60;
const SEED = 4242;

function boot({ wave = 19, seed = SEED } = {}) {
  const state = createGameState(seed);
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
  const rock = {
    id: state.nextEntityId++, alive: true, type: 'asteroid',
    pos: { x: 500, z: 0 }, vel: { x: 0, z: 0 }, radius: 18, collides: true,
  };
  state.entities.set(player.id, player);
  state.entities.set(rock.id, rock);
  state.entityList.push(player, rock);
  state.playerId = player.id;
  state.entityIndex = {
    __spacefaceEntityIndexV1: true, ready: true,
    shipLike: [player], asteroids: [rock],
  };
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed });
  state.run.phase = 'active';
  state.run.wave = wave;
  state.mode = 'flight';
  state.player = state.player || { tether: null };
  const engine = createBroodEngine({ bus, getState: () => state, fieldList: () => [] });
  return { state, bus, emitted, player, rock, engine };
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

test('the burrower continues the roster clock without breaking the base catalog', () => {
  assert.deepEqual(swarmBroodIssues(), []);
  assert.deepEqual(swarmBroodLateIssues(), []);
  const burrower = swarmBroodLateFamily('burrower');
  assert.ok(burrower, 'late table admits burrower');
  assert.equal(burrower.fromWave, 19);
  assert.equal(SWARM_BROOD_LATE_FAMILIES[0].id, 'burrower');
  assert.ok(burrower.telegraph.bark && burrower.telegraph.line && burrower.telegraph.cue);
  assert.equal(swarmBroodKillPay('burrower').credits, 0);
  assert.equal(swarmBroodKillPay('burrower').score, 0);

  const early = foldBroodLatePlan(swarmBroodPlan(18, mulberry32(broodStreamSeed(SEED, 18))), 18);
  assert.equal(early.some((part) => part.id === 'burrower'), false);
  assert.equal(early.reduce((sum, part) => sum + part.count, 0), swarmBroodPopulation(18));

  const plan = foldBroodLatePlan(swarmBroodPlan(19, mulberry32(broodStreamSeed(SEED, 19))), 19);
  const total = plan.reduce((sum, part) => sum + part.count, 0);
  assert.equal(total, swarmBroodPopulation(19));
  const row = plan.find((part) => part.id === 'burrower');
  assert.ok(row && row.count > 0, 'wave 19 spends mites on burrowers');
  const mite = plan.find((part) => part.id === 'mite');
  assert.ok(mite && mite.count >= 1, 'the mite floor stays');

  assert.equal(swarmBroodBossFor(70), 'brood_queen');
  const queen = foldBroodLatePlan(swarmBroodPlan(70, mulberry32(broodStreamSeed(SEED, 70))), 70);
  assert.deepEqual(queen.map((part) => part.id), ['mite']);
  assert.equal(queen[0].count, swarmBroodPopulation(70));
});

test('a burrower hides in the rock and telegraphs before it bursts, seed 4242', () => {
  const h = boot({ wave: 19 });
  const { engine, state, player, rock, emitted } = h;
  const familyIndex = SWARM_BROOD_FAMILIES.length;
  const def = swarmBroodLateFamily('burrower');

  engine.prepareWave(state.run, 18);
  engine.spawnWave(state);
  assert.equal(countFamily(engine, familyIndex), 0, 'wave 18 fields no burrower');

  engine.prepareWave(state.run, 19);
  const planned = engine.view.pendingCount;
  assert.equal(planned, swarmBroodPopulation(19));
  engine.spawnWave(state);
  assert.equal(engine.census().alive + engine.view.pendingCount, swarmBroodPopulation(19));
  const buried = countFamily(engine, familyIndex);
  assert.ok(buried > 0, 'wave 19 fields burrowers');
  const slot = firstFamily(engine, familyIndex);
  const bodies = engine._bodies;
  assert.equal(bodies.phase[slot], BROOD_PHASE_BURIED);
  const inside = Math.hypot(bodies.px[slot] - rock.pos.x, bodies.pz[slot] - rock.pos.z);
  assert.ok(inside < rock.radius, 'parked inside the rock silhouette');
  assert.equal(emitted.filter((row) => row.event === 'swarm:broodTelegraph').length, 0);

  state.simTime += DT;
  state.tick += 1;
  engine.step(state);
  assert.equal(bodies.phase[slot], BROOD_PHASE_BURIED, 'a far pilot does not start the burst');
  assert.equal(emitted.filter((row) => row.event === 'swarm:broodTelegraph').length, 0);

  player.pos.x = rock.pos.x;
  player.pos.z = rock.pos.z + 20;
  state.simTime += DT;
  state.tick += 1;
  engine.step(state);
  const telegraphs = emitted.filter((row) => row.event === 'swarm:broodTelegraph');
  assert.ok(telegraphs.length >= 1, 'proximity speaks before the body moves');
  assert.equal(telegraphs[0].payload.bark, def.telegraph.bark);
  assert.equal(telegraphs[0].payload.line, def.telegraph.line);
  assert.equal(telegraphs[0].payload.cue, def.telegraph.cue);
  assert.equal(telegraphs[0].payload.familyId, 'burrower');
  assert.equal(bodies.phase[slot], BROOD_PHASE_WINDUP);
  const held = Math.hypot(bodies.px[slot] - rock.pos.x, bodies.pz[slot] - rock.pos.z);
  assert.ok(held < rock.radius, 'the telegraph holds the body in the rock');

  let left = false;
  const ticks = Math.ceil(def.windupS / DT) + 2;
  for (let i = 0; i < ticks; i++) {
    state.simTime += DT;
    state.tick += 1;
    engine.step(state);
    const dist = Math.hypot(bodies.px[slot] - rock.pos.x, bodies.pz[slot] - rock.pos.z);
    if (dist > rock.radius) {
      left = true;
      assert.equal(bodies.phase[slot], BROOD_PHASE_FLOCK);
      break;
    }
  }
  assert.equal(left, true, 'the body leaves the rock only after the telegraph');
  assert.ok(telegraphs.length >= 1);

  const killSlot = firstFamily(engine, familyIndex);
  assert.ok(killSlot >= 0);
  engine._killDirectForTest(killSlot, 'direct');
  const award = emitted.find((row) => row.event === 'run:awardRequested' && row.payload.reason === 'brood');
  assert.ok(award, 'a burrower kill pays');
  assert.equal(award.payload.credits, def.credits);
  assert.equal(award.payload.score, def.score);
  assert.ok(def.credits > 0 && def.score > 0);

  const scene = {
    objects: [],
    add(o) { this.objects.push(o); },
    remove(o) {
      const i = this.objects.indexOf(o);
      if (i >= 0) this.objects.splice(i, 1);
    },
  };
  const pres = createBroodPresentation(scene, 400);
  pres.update(engine.view, DT, { simTime: state.simTime });
  assert.equal(scene.objects.length, 7, 'bodies + marks + pools + lines + lanes + lobs + tendril segs');
  assert.equal(scene.objects[0].count, engine.census().alive, 'every live body, including the burrower, draws');
});
