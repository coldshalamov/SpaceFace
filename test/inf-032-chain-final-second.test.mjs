// INF-032 — the chain's last second is legible.
//
// The depletion mark reads swarmChain's own window (the `at` anchor on `swarm:chain` restates
// `expiresIn` on the sim clock), the last second gets exactly one soft audio warning per
// chain, and a menu stay re-anchors the window instead of draining through it.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { runSession } from '../src/systems/runSession.js';
import {
  SWARM_CHAIN_WARN_S,
  SWARM_CHAIN_WINDOW_S,
  swarmChain,
} from '../src/systems/swarmChain.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';
import { chainWindowRemaining, survivalHud } from '../src/ui/survivalHud.js';

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

/** Kill one cohort body at the current sim time. */
function kill(h, cause = 'kinetic') {
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

function warnings(h) {
  return named(h, 'audio:cue').filter((e) => e.payload && e.payload.id === 'ui_alert');
}

test('INF-032: swarm:chain anchors the window to the sim clock', () => {
  const h = boot();
  h.state.simTime = 12.5;
  kill(h);
  const chains = named(h, 'swarm:chain');
  assert.equal(chains.length, 1);
  assert.equal(chains[0].payload.at, 12.5);
  swarmChain.destroy();
});

test('INF-032: the last second warns once per chain, softly, while the chain lives', () => {
  assert.equal(SWARM_CHAIN_WINDOW_S, 4);
  assert.equal(SWARM_CHAIN_WARN_S, 1);
  const h = boot();
  kill(h);
  for (let i = 0; i < 12; i++) advance(h, 0.25);
  assert.equal(warnings(h).length, 1, 'crossing the one-second mark says one line');
  assert.equal(warnings(h)[0].payload.gain, 0.45);
  assert.ok(swarmChain.chainState().chain > 0, 'the warning fires while the chain is alive');
  for (let i = 0; i < 8; i++) advance(h, 0.25);
  assert.equal(swarmChain.chainState().chain, 0, 'the four-second window still lapses');
  assert.equal(named(h, 'swarm:chainBroken').length, 1);
  assert.equal(warnings(h).length, 1, 'lapse and later ticks never warn again');
  swarmChain.destroy();
});

test('INF-032: a fresh kill re-arms the warning', () => {
  const h = boot();
  kill(h);
  for (let i = 0; i < 12; i++) advance(h, 0.25);
  assert.equal(warnings(h).length, 1);
  kill(h, 'explosive');
  for (let i = 0; i < 12; i++) advance(h, 0.25);
  assert.equal(warnings(h).length, 2, 'the new window earns its own final second');
  swarmChain.destroy();
});

test('INF-032: a menu stay pins the chain and re-anchors the window on return', () => {
  const h = boot();
  kill(h);
  const chain = swarmChain.chainState().chain;
  h.state.run.phase = 'draft';
  for (let i = 0; i < 40; i++) advance(h, 1);
  assert.equal(swarmChain.chainState().chain, chain, 'the draft did not kill the chain');
  assert.equal(warnings(h).length, 0, 'a pinned chain never warns');
  const announced = named(h, 'swarm:chain').length;
  h.state.run.phase = 'active';
  advance(h, 0.01);
  const resumed = named(h, 'swarm:chain');
  assert.equal(resumed.length, announced + 1, 'returning re-announces the live chain');
  assert.ok(resumed[resumed.length - 1].payload.at >= 40, 'from NOW, not from the kill');
  assert.equal(swarmChain.chainState().chain, chain);
  swarmChain.destroy();
});

test('INF-032: the remaining-seconds helper agrees with the window', () => {
  assert.equal(chainWindowRemaining(10, 12), 2);
  assert.equal(chainWindowRemaining(10, 13.75), 0.25);
  assert.equal(chainWindowRemaining(10, 14.5), 0, 'clamped, never negative');
  assert.equal(chainWindowRemaining(null, 12), SWARM_CHAIN_WINDOW_S, 'no anchor reads full');
  assert.equal(chainWindowRemaining(10, NaN), SWARM_CHAIN_WINDOW_S, 'no clock reads full');
});

test('INF-032: the HUD stores the anchor and drops it with the chain', () => {
  const state = createGameState(7);
  const bus = createBus();
  survivalHud.init({ state, bus, helpers: {} });
  bus.emit('swarm:chain', { chain: 7, best: 9, cause: 'direct', step: 1, at: 12.5, wave: 3 });
  assert.equal(survivalHud._chainAt, 12.5);
  bus.emit('swarm:chain', { chain: 8, best: 9, cause: 'direct', step: 1, wave: 3 });
  assert.equal(survivalHud._chainAt, null, 'an anchorless event invents no mark');
  bus.emit('swarm:chainBroken', { chain: 8, best: 9, reason: 'lapsed' });
  assert.equal(survivalHud._chainAt, null);
  survivalHud.destroy();
});
