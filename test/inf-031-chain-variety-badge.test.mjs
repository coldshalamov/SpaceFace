// INF-031 — the kill-chain display explains the variety bonus at the moment it pays.
//
// swarmChain's own cause/step result travels on the `swarm:chain` event (the HUD never
// re-derives it), the badge words it (`COLLISION +2` vs `GUN`), and a same-tick burst that
// crosses milestone marks says ONE toast on the next update instead of a stack.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { runSession } from '../src/systems/runSession.js';
import {
  SWARM_CHAIN_VARIED_STEP,
  swarmChain,
} from '../src/systems/swarmChain.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';
import { chainCauseBadge, survivalHud } from '../src/ui/survivalHud.js';

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

function named(h, event) {
  return h.emitted.filter((e) => e.event === event);
}

test('INF-031: swarm:chain carries the cause and step the chain itself scored', () => {
  const h = boot();
  kill(h, 'kinetic');
  kill(h, 'ship_collision');
  const chains = named(h, 'swarm:chain');
  assert.equal(chains.length, 2);
  assert.equal(chains[0].payload.cause, 'direct');
  assert.equal(chains[0].payload.step, 1);
  assert.equal(chains[1].payload.cause, 'collision');
  assert.equal(chains[1].payload.step, SWARM_CHAIN_VARIED_STEP);
  swarmChain.destroy();
});

test('INF-031: gun-to-collision and repeated-gun kills badge differently', () => {
  const varied = chainCauseBadge('collision', SWARM_CHAIN_VARIED_STEP);
  const repeated = chainCauseBadge('direct', 1);
  assert.equal(varied, 'COLLISION +2');
  assert.equal(repeated, 'DIRECT');
  assert.notEqual(varied, repeated);
  assert.equal(chainCauseBadge(null, 1), null);
  assert.equal(chainCauseBadge('', 2), null);
  assert.equal(chainCauseBadge(42, 2), null, 'a non-string cause invents no glyph');
});

test('INF-031: a same-tick burst crossing a milestone says one toast, on the next tick', () => {
  const h = boot();
  // Six alternating kills without advancing the clock: 1 + 2*5 = 11, crossing mark 10.
  // Causes are canonical kill causes; their families (direct/explosive) are what varies.
  const causes = ['kinetic', 'explosive', 'kinetic', 'explosive', 'kinetic', 'explosive'];
  for (const cause of causes) kill(h, cause);
  assert.equal(swarmChain.chainState().chain, 11);
  assert.equal(named(h, 'toast').length, 0, 'no toast mid-burst');
  swarmChain.update(DT, h.state);
  const toasts = named(h, 'toast');
  assert.equal(toasts.length, 1, 'the burst coalesces to a single line');
  assert.equal(toasts[0].payload.text, 'CHAIN 10');
  swarmChain.update(DT, h.state);
  assert.equal(named(h, 'toast').length, 1, 'it is said once, not every tick');
  swarmChain.destroy();
});

test('INF-031: the HUD stores swarmChain’s variety result and drops it with the chain', () => {
  const state = createGameState(7);
  const bus = createBus();
  survivalHud.init({ state, bus, helpers: {} });
  bus.emit('swarm:chain', { chain: 7, best: 9, cause: 'collision', step: SWARM_CHAIN_VARIED_STEP, wave: 3 });
  assert.equal(survivalHud._chainCause, 'collision');
  assert.equal(survivalHud._chainStep, SWARM_CHAIN_VARIED_STEP);
  bus.emit('swarm:chainBroken', { chain: 7, best: 9, reason: 'lapsed' });
  assert.equal(survivalHud._chainCause, null);
  assert.equal(survivalHud._chainStep, 0);
  survivalHud.destroy();
});
