// INF-034 — one physical kill is paid once.
//
// One body can reach the reward consumers as several terminal observations (the damage
// router's `entity:killed`, a later sweep or second routing for the same hull). The first
// observation claims the body; a duplicate mints no second step, bonus, or milestone.
// A new body life under a reused entity id stays independently eligible.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createRewardDeathLedger } from '../src/combat/rewardEligibility.js';
import { runSession } from '../src/systems/runSession.js';
import { swarmChain } from '../src/systems/swarmChain.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';

const DT = 1 / 60;
let n = 0;

function boot() {
  const state = createGameState(4242);
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
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 });
  state.run.phase = 'active';
  state.run.wave = 3;
  return { state, bus, emitted, player, ctx };
}

/** Materialize one cohort body and kill it once through the terminal event. */
function killBody(h, cause = 'kinetic') {
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
  return victim;
}

/** A second terminal observation of the same hull — same body, fresh event object. */
function reobserve(h, victim, cause = 'kinetic') {
  h.bus.emit('entity:killed', {
    id: victim.id, killerId: h.state.playerId, type: 'ship', pos: { x: 10, z: 10 },
    presentation: { cause },
  });
}

function named(h, event) {
  return h.emitted.filter((e) => e.event === event);
}

function chainAwards(h) {
  return named(h, 'run:awardRequested').filter((e) => e.payload && e.payload.reason === 'chain');
}

test('INF-034: the ledger claims one body once, keyed by body not by id', () => {
  const ledger = createRewardDeathLedger();
  const a = { id: 5, type: 'ship' };
  assert.equal(ledger.claim(a), true);
  assert.equal(ledger.claim(a), false, 'the same hull never pays twice');
  assert.equal(ledger.claim({ id: 5, type: 'ship' }), true, 'a new life under a reused id pays');
  assert.equal(ledger.claim(null), false, 'unidentifiable bodies are never claimed');
  assert.equal(ledger.claim({ type: 'ship' }), false, 'an id-less body is never claimed');
  ledger.clear();
  assert.equal(ledger.claim(a), true, 'a cleared ledger pays again');
});

test('INF-034: the ledger is bounded', () => {
  const ledger = createRewardDeathLedger(4);
  const bodies = [];
  for (let i = 0; i < 6; i++) {
    const body = { id: 100 + i };
    bodies.push(body);
    assert.equal(ledger.claim(body), true);
  }
  assert.ok(ledger.size <= 4, 'old claims fall off instead of growing with the run');
  assert.equal(ledger.claim(bodies[5]), false, 'recent claims still hold');
});

test('INF-034: a duplicate terminal event mints no second step, bonus, or milestone', () => {
  const h = boot();
  const victim = killBody(h);
  assert.equal(swarmChain.chainState().chain, 1);
  assert.equal(named(h, 'swarm:chain').length, 1);
  assert.equal(chainAwards(h).length, 1);
  reobserve(h, victim);
  assert.equal(swarmChain.chainState().chain, 1, 'the chain did not move');
  assert.equal(named(h, 'swarm:chain').length, 1, 'no second chain event');
  assert.equal(chainAwards(h).length, 1, 'no second bonus');
  assert.equal(named(h, 'toast').length, 0, 'and no milestone chatter either');
  swarmChain.destroy();
});

test('INF-034: an entity id reused for a new body life pays independently', () => {
  const h = boot();
  const first = killBody(h, 'kinetic');
  assert.equal(swarmChain.chainState().chain, 1);
  // The id is recycled: a fresh body object takes the same slot.
  const second = {
    id: first.id, alive: true, type: 'ship', pos: { x: 10, z: 10 },
    data: { runCohort: SURVIVAL_COHORT_TAG, tag: n++ },
  };
  h.state.entities.set(first.id, second);
  reobserve(h, second, 'explosive');
  assert.ok(swarmChain.chainState().chain > 1, 'the new life paid its own step');
  assert.equal(chainAwards(h).length, 2);
  swarmChain.destroy();
});

test('INF-034: a new run is new bodies — old claims die with the run', () => {
  const h = boot();
  const victim = killBody(h);
  assert.equal(swarmChain.chainState().chain, 1);
  swarmChain.newGame();
  reobserve(h, victim);
  assert.equal(swarmChain.chainState().chain, 1, 'the same observation pays in the new run');
  swarmChain.destroy();
});

test('INF-034: legitimate later bodies still build the chain', () => {
  const h = boot();
  killBody(h, 'kinetic');
  killBody(h, 'explosive');
  killBody(h, 'kinetic');
  assert.ok(swarmChain.chainState().chain >= 4, 'distinct bodies stack normally');
  swarmChain.destroy();
});
