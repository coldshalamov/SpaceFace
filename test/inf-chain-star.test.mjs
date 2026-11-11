// inf-chain-star — the star the Crucible screen asked for lands the moment it is earned.
//
// Before a ladder run the Crucible screen names each zone's open asks ("a chain of 12"), and the
// settle pays the zone's chain star when the zone's chain peak reached swarmZoneChainTarget — but
// the instant the live chain crossed that line, nothing on the glass said so: the star you were
// told to chase was only revealed on the results plate. The announcer now calls it once per zone
// per run ("CHAIN STAR · ×12"), on a ladder run only — a Daily, a typed Custom seed, a mutator
// run or practice pays no stars and never claims one. The settle stays the only writer of stars.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createRunState } from '../src/core/runState.js';
import { swarmJuice } from '../src/systems/swarmJuice.js';
import { SWARM_ARCADE_SEEDS, swarmZoneChainTarget } from '../src/data/swarmLadder.js';

const ARENA = Object.keys(SWARM_ARCADE_SEEDS)[0];

function harness({ wave = 3, seed = SWARM_ARCADE_SEEDS[ARENA], practice = false, mutators = [] } = {}) {
  const calls = [];
  const bus = createBus();
  const state = { mode: 'flight', simTime: 100, playerId: 'player' };
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed });
  state.run.phase = 'active';
  state.run.wave = wave;
  state.run.arenaId = ARENA;
  state.run.practice = practice;
  state.run.arenaMutators = mutators;
  const sys = Object.create(swarmJuice);
  sys.state = state;
  sys.bus = bus;
  sys._unsubs = [];
  sys._reset();
  bus.on('swarm:announce', (p) => { if (p.kind === 'chainstar') calls.push(p); });
  return { sys, calls, state };
}

test('the zone chain star is called the moment the live chain reaches its target, once', () => {
  const { sys, calls } = harness({ wave: 3 });
  const target = swarmZoneChainTarget(0);
  for (let c = 1; c < target; c++) sys._onChain({ chain: c });
  assert.equal(calls.length, 0, 'nothing before the line');
  sys._onChain({ chain: target });
  assert.equal(calls.length, 1, 'the star is called at the line');
  assert.equal(calls[0].text, `CHAIN STAR · ×${target}`);
  sys._onChain({ chain: target + 5 });
  sys._onChainBroken({ chain: target + 5 });
  sys._onChain({ chain: target + 1 });
  assert.equal(calls.length, 1, 'one call per zone per run, however the chain moves after');
});

test('the next zone asks its own, higher target and calls it once', () => {
  const { sys, calls, state } = harness({ wave: 3 });
  sys._onChain({ chain: swarmZoneChainTarget(0) });
  state.run.wave = 14; // zone 1
  sys._onChain({ chain: swarmZoneChainTarget(0) });
  assert.equal(calls.length, 1, 'the zone-0 line does not pay zone 1');
  sys._onChain({ chain: swarmZoneChainTarget(1) });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].text, `CHAIN STAR · ×${swarmZoneChainTarget(1)}`);
});

test('runs that pay no stars never claim one', () => {
  for (const opts of [
    { seed: (SWARM_ARCADE_SEEDS[ARENA] + 1) >>> 0 },  // a Daily / typed Custom seed
    { practice: true },
    { mutators: ['some_mutator'] },
  ]) {
    const { sys, calls } = harness({ wave: 3, ...opts });
    sys._onChain({ chain: swarmZoneChainTarget(0) + 3 });
    assert.equal(calls.length, 0, `no star claimed for ${JSON.stringify(opts)}`);
  }
});

test('a fresh run reopens every zone', () => {
  const { sys, calls } = harness({ wave: 3 });
  sys._onChain({ chain: swarmZoneChainTarget(0) });
  sys._reset();
  sys._onChain({ chain: swarmZoneChainTarget(0) });
  assert.equal(calls.length, 2, 'the run reset forgets the called zones');
});
