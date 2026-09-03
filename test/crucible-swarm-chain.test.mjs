// PQ-135 — the kill chain: the one number a swarm game is played for.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { runSession } from '../src/systems/runSession.js';
import {
  SWARM_CHAIN_MILESTONES,
  SWARM_CHAIN_SCORE_CAP,
  SWARM_CHAIN_STEP,
  SWARM_CHAIN_VARIED_STEP,
  SWARM_CHAIN_WINDOW_S,
  swarmChain,
  swarmChainBonus,
  swarmChainMilestone,
  swarmChainStep,
} from '../src/systems/swarmChain.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';

const DT = 1 / 60;

function boot({ ruleset = 'swarm', phase = 'active' } = {}) {
  const state = createGameState(9);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.simTime = 0;

  const ctx = { state, bus, helpers: {} };
  runSession.init(ctx);
  swarmChain.init(ctx);
  state.run = createRunState({ kind: 'survival', ruleset, seed: 4242 });
  state.run.phase = phase;
  state.run.wave = 3;
  return { state, bus, emitted, player, ctx };
}

let n = 0;
/** Kill one cohort body at the current sim time, with a given damage cause. */
function kill(h, cause = 'direct') {
  const id = h.state.nextEntityId++;
  const victim = {
    id, alive: true, type: 'ship', pos: { x: 10, z: 10 },
    data: { runCohort: SURVIVAL_COHORT_TAG, tag: n++ },
  };
  h.state.entities.set(id, victim);
  h.state.entityList.push(victim);
  h.bus.emit('entity:killed', {
    id, killerId: h.state.playerId, type: 'ship', pos: { x: 10, z: 10 },
    presentation: { cause },
  });
  return id;
}

function advance(h, seconds) {
  h.state.simTime += seconds;
  swarmChain.update(DT, h.state);
}

function named(h, event) {
  return h.emitted.filter((e) => e.event === event);
}

test('swarmChain is registered and ticks — it needs a clock to notice a lapse', () => {
  assert.ok(PRODUCTION_INIT_ORDER.includes('swarmChain'));
  assert.ok(PRODUCTION_UPDATE_ORDER.includes('swarmChain'));
});

test('the step rule: a kill adds one, a DIFFERENT kind of kill adds two', () => {
  assert.equal(swarmChainStep('direct', 'direct'), SWARM_CHAIN_STEP);
  assert.equal(swarmChainStep('terrain', 'direct'), SWARM_CHAIN_VARIED_STEP);
  assert.equal(swarmChainStep('direct', null), SWARM_CHAIN_STEP, 'the first kill has nothing to differ from');
  assert.ok(SWARM_CHAIN_VARIED_STEP > SWARM_CHAIN_STEP, 'variety is the faster route, always');
});

test('the bonus is the chain itself, capped', () => {
  assert.equal(swarmChainBonus(0), 0);
  assert.equal(swarmChainBonus(17), 17, 'plain enough that a player can do the arithmetic');
  assert.equal(swarmChainBonus(SWARM_CHAIN_SCORE_CAP + 500), SWARM_CHAIN_SCORE_CAP);
  assert.equal(swarmChainBonus(NaN), 0);
  assert.equal(swarmChainBonus(-4), 0);
});

test('milestones fire once each, in order, and never again', () => {
  assert.equal(swarmChainMilestone(9, 0), null);
  assert.equal(swarmChainMilestone(10, 0), 10);
  assert.equal(swarmChainMilestone(10, 10), null, 'not twice');
  assert.equal(swarmChainMilestone(30, 10), 25, 'the highest newly crossed');
  for (let i = 1; i < SWARM_CHAIN_MILESTONES.length; i++) {
    assert.ok(SWARM_CHAIN_MILESTONES[i] > SWARM_CHAIN_MILESTONES[i - 1], 'ascending');
  }
});

test('killing quickly builds a chain; killing differently builds it faster', () => {
  const same = boot();
  for (let i = 0; i < 5; i++) { kill(same, 'direct'); advance(same, 0.5); }
  assert.equal(same.state.run.score > 0, true);
  const sameChain = swarmChain.chainState().chain;
  swarmChain.destroy();

  const varied = boot();
  const causes = ['direct', 'terrain', 'explosive', 'collision', 'direct'];
  for (let i = 0; i < 5; i++) { kill(varied, causes[i]); advance(varied, 0.5); }
  const variedChain = swarmChain.chainState().chain;
  assert.ok(
    variedChain > sameChain,
    `varying the kill built a longer chain (${variedChain} vs ${sameChain}) — this is what makes the room worth using`,
  );
  swarmChain.destroy();
});

test('the chain pays score, and every point goes through runSession', () => {
  const h = boot();
  for (let i = 0; i < 6; i++) { kill(h, 'direct'); advance(h, 0.3); }
  const awards = named(h, 'run:awardRequested').filter((e) => e.payload.reason === 'chain');
  assert.equal(awards.length, 6, 'one award per kill');
  assert.ok(awards[5].payload.score > awards[0].payload.score, 'later kills in a chain pay more');
  assert.ok(h.state.run.score > 0, 'and the run envelope actually received it');
  swarmChain.destroy();
});

test('the chain lapses on the CLOCK — the only way to lose it is to stop killing', () => {
  const h = boot();
  for (let i = 0; i < 4; i++) { kill(h, 'direct'); advance(h, 0.3); }
  assert.ok(swarmChain.chainState().chain >= 4);
  advance(h, SWARM_CHAIN_WINDOW_S + 0.2);
  assert.equal(swarmChain.chainState().chain, 0, 'it lapsed');
  const broken = named(h, 'swarm:chainBroken');
  assert.equal(broken.length, 1);
  assert.equal(broken[0].payload.reason, 'lapsed');
  assert.ok(broken[0].payload.best >= 4, 'the best survives the break');
  swarmChain.destroy();
});

test('a chain survives the upgrade menus — a wave boundary is not a failure', () => {
  const h = boot();
  for (let i = 0; i < 4; i++) { kill(h, 'direct'); advance(h, 0.3); }
  const before = swarmChain.chainState().chain;
  // The player is reading three cards. Sim time passes; the chain must not die for it.
  h.state.run.phase = 'draft';
  for (let i = 0; i < 40; i++) advance(h, 1);
  assert.equal(swarmChain.chainState().chain, before, 'the draft did not kill the chain');
  h.state.run.phase = 'active';
  kill(h, 'terrain');
  assert.ok(swarmChain.chainState().chain > before, 'and it kept building on the far side');
  swarmChain.destroy();
});

test('it is a strict no-op for the Gauntlet and for ambient traffic', () => {
  const arc = boot({ ruleset: 'scored' });
  for (let i = 0; i < 5; i++) { kill(arc, 'direct'); advance(arc, 0.3); }
  assert.equal(swarmChain.chainState().chain, 0, 'the authored arc has no chain');
  assert.equal(named(arc, 'swarm:chain').length, 0);
  swarmChain.destroy();

  const h = boot();
  // A bystander with no cohort mark.
  const id = h.state.nextEntityId++;
  h.state.entities.set(id, { id, alive: true, type: 'ship', pos: { x: 0, z: 0 }, data: {} });
  h.bus.emit('entity:killed', { id, killerId: h.state.playerId, type: 'ship', pos: { x: 0, z: 0 } });
  assert.equal(swarmChain.chainState().chain, 0, 'ambient traffic never feeds the chain');
  swarmChain.destroy();
});

test('the run publishes its best chain on the way out', () => {
  const h = boot();
  for (let i = 0; i < 7; i++) { kill(h, i % 2 ? 'terrain' : 'direct'); advance(h, 0.2); }
  const peak = swarmChain.chainState().best;
  assert.ok(peak >= 7);
  h.bus.emit('run:ended', { outcome: 'defeat' });
  const best = named(h, 'swarm:chainBest');
  assert.equal(best.length, 1);
  assert.equal(best[0].payload.best, peak);
  assert.equal(swarmChain.chainState().chain, 0, 'and the state is gone with the run');
  swarmChain.destroy();
});
