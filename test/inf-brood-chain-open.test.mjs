// inf-brood-chain-open — a brood wipe that OPENS a chain climbs it body by body.
//
// The chain owner's contract (SWARM-07 B1): every body in a brood-kill receipt walks the same
// continue/step logic an entity kill uses, so a 40-body room wipe climbs the chain exactly as
// 40 ship kills would. The batch stamped its kill time only after the whole loop, so when the
// receipt opened a chain (the run's first wipe, or the first after a lapse — the sim clock is
// global, so the last kill time is always long stale by then) every body after the first read
// the stale time, "lapsed", broke the one-body chain it had just started and began again at
// one. A 40-mite opener counted 1 and threw 39 broken-chain receipts at every listener.
//
// Harness mirrors swarm-payoff: the real swarmChain owner on a live swarm run, a global clock
// well past the chain window, ship kills through the ordinary entity:killed receipt.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import {
  swarmChain,
  SWARM_CHAIN_STEP,
  SWARM_CHAIN_VARIED_STEP,
  SWARM_CHAIN_WINDOW_S,
} from '../src/systems/swarmChain.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';

const DT = 1 / 60;
/** The global sim clock a real run starts on: far past one chain window. */
const RUN_CLOCK_S = 300;

function boot() {
  const state = createGameState(13);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship', hull: 200, hullMax: 200 };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.simTime = RUN_CLOCK_S;
  swarmChain.init({ state, bus, helpers: {} });
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 });
  state.run.phase = 'active';
  state.run.wave = 4;
  return { state, bus, emitted };
}

const named = (h, event) => h.emitted.filter((e) => e.event === event).map((e) => e.payload);
const chain = () => swarmChain.chainState().chain;

function wipe(h, count, cause = 'explosive') {
  h.bus.emit('swarm:broodKills', { count, cause, pos: { x: 30, z: 0 }, wave: h.state.run.wave });
}

function shipKill(h, cause = 'explosive') {
  const id = h.state.nextEntityId++;
  const victim = { id, alive: false, type: 'ship', pos: { x: 10, z: 10 }, data: { runCohort: SURVIVAL_COHORT_TAG } };
  h.state.entities.set(id, victim);
  h.state.entityList.push(victim);
  h.bus.emit('entity:killed', {
    id, killerId: h.state.playerId, type: 'ship', pos: { x: 10, z: 10 },
    presentation: { cause, playerCaused: true },
  });
}

test('a wipe that opens the run\'s first chain counts every body, and breaks nothing', () => {
  const h = boot();
  try {
    wipe(h, 40);
    assert.equal(chain(), 40 * SWARM_CHAIN_STEP, '40 bodies = 40 same-cause steps, on a real run clock');
    assert.equal(named(h, 'swarm:chainBroken').length, 0, 'opening a chain is not 39 broken chains');
    const last = named(h, 'swarm:chain').at(-1);
    assert.equal(last.chain, 40, 'the readout hears the whole climb');
    // The milestone the climb crossed is queued for the next tick, once.
    swarmChain.update(DT, h.state);
    const toasts = named(h, 'toast').map((p) => p.text);
    assert.deepEqual(toasts, ['CHAIN 25'], 'the highest crossed mark says one line');
  } finally {
    swarmChain.destroy();
  }
});

test('the first wipe after a lapse opens a fresh chain of its own size, after exactly one break', () => {
  const h = boot();
  try {
    wipe(h, 6);
    assert.equal(chain(), 6);
    h.state.simTime += SWARM_CHAIN_WINDOW_S + 0.5;
    wipe(h, 12);
    assert.equal(chain(), 12, 'the fresh chain is the whole wipe, not one body');
    const breaks = named(h, 'swarm:chainBroken');
    assert.equal(breaks.length, 1, 'the stale chain broke once');
    assert.equal(breaks[0].chain, 6);
    assert.equal(breaks[0].reason, 'lapsed');
  } finally {
    swarmChain.destroy();
  }
});

test('one brood receipt climbs exactly as the same number of same-tick ship kills', () => {
  const ships = boot();
  let viaShips;
  try {
    for (let i = 0; i < 9; i++) shipKill(ships);
    viaShips = chain();
  } finally {
    swarmChain.destroy();
  }
  const brood = boot();
  try {
    wipe(brood, 9);
    assert.equal(chain(), viaShips, 'the brood tier\'s accounting matches the ship path');
    assert.equal(viaShips, 9);
  } finally {
    swarmChain.destroy();
  }
});

test('mid-chain batches keep their law: the varied first body pays double, the rest single', () => {
  const h = boot();
  try {
    wipe(h, 5, 'explosive');
    h.state.simTime += 1;
    wipe(h, 3, 'terrain');
    assert.equal(chain(), 5 + SWARM_CHAIN_VARIED_STEP + 2 * SWARM_CHAIN_STEP,
      'a new cause varies once; its batchmates repeat it');
    assert.equal(named(h, 'swarm:chainBroken').length, 0);
  } finally {
    swarmChain.destroy();
  }
});
