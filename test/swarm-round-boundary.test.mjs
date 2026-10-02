// PB-SWARM-E — the between-round boundary quartet (SF-070 launch gating, SF-073 chip
// pending-vs-committed, SF-074 cash-out honesty, SF-075 seam verified in swarm-rematch).
// A Swarm round ends where the player decides it ends: nothing held over from the fight may
// fire the launch, money pays only on accepted pickup, and cash-out ends the run exactly once
// — at a ten-wave refit, on purpose.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalResults } from '../src/systems/survivalResults.js';
import {
  survivalRun,
  SURVIVAL_WAVE_INTRO_TICKS,
} from '../src/systems/survivalRun.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { ships } from '../src/systems/ships.js';
import { economy } from '../src/systems/economy.js';
import { createSwarmEventDirector } from '../src/systems/swarmEvents.js';
import { canExtract } from '../src/systems/survivalExtraction.js';
import { TECH_NODES } from '../src/data/tech.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';

const DT = 1 / 60;
const SEED = 4242;
const ARENA = 'helios_core';

function boot({ seed = SEED } = {}) {
  const state = createGameState(seed);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const registry = {
    get(name) {
      if (name === 'ships') return ships;
      if (name === 'economy') return economy;
      if (name === 'survivalDraft') return survivalDraft;
      return null;
    },
  };
  const ctx = { state, bus, helpers: {}, registry };
  economy.init(ctx);
  ships.init(ctx);
  runSession.init(ctx);
  survivalResults.init(ctx);
  survivalRun.init(ctx);
  survivalDraft.init(ctx);
  if (economy.newGame) economy.newGame();
  if (ships.newGame) ships.newGame();
  state.player.researchPoints += TECH_NODES.reduce((s, n) => s + ((n.cost && n.cost.rp) || 0), 0) + 1000;
  const cost = TECH_NODES.reduce((s, n) => s + ((n.cost && n.cost.credits) || 0), 0);
  if (cost > 0) economy.grantCredits(cost, 'test:tech');
  for (let pass = 0; pass < TECH_NODES.length + 1; pass++) {
    let progressed = false;
    for (const node of TECH_NODES) {
      if (!state.player.researchedNodes.includes(node.id) && ships.unlockTech(node.id)) progressed = true;
    }
    if (!progressed) break;
  }
  ships.buyShip({ defId: 'ship_hornet', setActive: true, grant: true });
  return { state, bus, emitted, ctx, registry };
}

function beginSwarm(h) {
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: SWARM_RULESET, seed: SEED, arenaId: ARENA,
  });
  return h.state.run;
}

function transition(h, expectedPhase, nextPhase) {
  h.bus.emit('run:transitionRequested', {
    expectedPhase, nextPhase, reason: 't', tick: 0,
  });
}

function named(h, event) {
  return h.emitted.filter((entry) => entry.event === event);
}

function picks(h) {
  return named(h, 'run:draftPickRequested');
}

test('the armory waits — no countdown and no inherited press can launch the round', () => {
  const h = boot();
  beginSwarm(h);
  transition(h, 'loadout', 'draft');
  assert.equal(h.state.run.phase, 'draft');
  // A held fire key, a finished wave, a long think — the phase machine does not leave the
  // draft on elapsed time. Sixty sim-seconds of updates and still nobody launches.
  for (let i = 0; i < 3600; i++) survivalRun.update(DT);
  assert.equal(h.state.run.phase, 'draft', 'the draft waits as long as the player does');
  assert.equal(
    named(h, 'run:transitionRequested').filter((e) => e.payload?.expectedPhase === 'draft').length,
    0, 'no transition out of draft was ever requested');

  // Fitting work is not a launch: a real catalog purchase settles without resolving the draft.
  h.bus.emit('run:awardRequested', { credits: 5000, reason: 'test' });
  const shelf = survivalDraft.currentOffers().find((o) => o.kind === 'number' && o.available);
  assert.ok(shelf, 'the shelf holds a buyable part');
  h.bus.emit('run:draftPickRequested', { offerId: shelf.id });
  assert.equal(h.state.run.phase, 'draft', 'buying a part does not launch the round');
  assert.equal(named(h, 'run:draftResolved').length, 0, 'a purchase is not a resolution');

  // The deliberate launch is the skip/done emit — exactly once.
  h.bus.emit('run:draftPickRequested', { offerId: null });
  assert.equal(named(h, 'run:draftResolved').length, 1, 'the resolve is a single receipt');
  h.bus.emit('run:draftPickRequested', { offerId: null });
  assert.equal(named(h, 'run:draftResolved').length, 1, 'a second press cannot resolve twice');
  survivalRun.update(DT);
  assert.notEqual(h.state.run.phase, 'draft', 'the deliberate launch responds immediately');
});

test('a pick request arriving mid-fight is refused — carried input cannot resolve a draft', () => {
  const h = boot();
  beginSwarm(h);
  transition(h, 'loadout', 'draft');
  h.bus.emit('run:draftPickRequested', { offerId: null });
  survivalRun.update(DT);
  // draft → wave_intro; let the intro lapse so the phase machine reaches active.
  for (let i = 0; i < SURVIVAL_WAVE_INTRO_TICKS + 4; i++) survivalRun.update(DT);
  assert.equal(h.state.run.phase, 'active', 'the round is live');
  const resolvedBefore = named(h, 'run:draftResolved').length;
  picks(h);
  h.bus.emit('run:draftPickRequested', { offerId: null });
  h.bus.emit('run:draftPickRequested', { offerId: 'cat_mod_gravity_bumper_s', demo: true });
  assert.equal(named(h, 'run:draftResolved').length, resolvedBefore,
    'a stray pick mid-wave resolves nothing');
  assert.equal(h.state.run.phase, 'active', 'the fight is undisturbed');
});

test('a pod pays once — a duplicate collection receipt cannot double the wallet', () => {
  const h = boot();
  beginSwarm(h);
  h.state.run.phase = 'active';
  h.state.playerId = 9;
  const director = createSwarmEventDirector({ state: h.state, bus: h.bus, helpers: {}, registry: h.registry });
  director.init();
  const awards = () => named(h, 'run:awardRequested')
    .filter((e) => e.payload && e.payload.reason === 'swarm:supplyPod');
  const creditsBefore = h.state.run.credits;
  director._pods.set(77, 60);
  h.bus.emit('pickup:collected', { pickupId: 77, collectorId: 9 });
  h.bus.emit('pickup:collected', { pickupId: 77, collectorId: 9 });
  h.bus.emit('pickup:collected', { pickupId: 77 });
  assert.equal(awards().length, 1, 'three collect receipts, one award');
  assert.equal(h.state.run.credits, creditsBefore + 60, 'the wallet moved exactly once');
  // A pod that was never scooped is pending value only — no receipt, no credits.
  director._pods.set(88, 60);
  h.bus.emit('pickup:collected', { pickupId: 999 });
  assert.equal(awards().length, 1, 'an unknown pickup pays nothing');
  assert.equal(h.state.run.credits, creditsBefore + 60, 'unscooped value is not spendable');
  director.destroy();
});

test('the last receipt still lands as the armory opens — collection during cleanup pays', () => {
  const h = boot();
  beginSwarm(h);
  transition(h, 'loadout', 'draft');
  const director = createSwarmEventDirector({ state: h.state, bus: h.bus, helpers: {}, registry: h.registry });
  director.init();
  const creditsBefore = h.state.run.credits;
  director._pods.set(55, 90);
  h.bus.emit('pickup:collected', { pickupId: 55, collectorId: h.state.playerId });
  const award = named(h, 'run:awardRequested')
    .find((e) => e.payload && e.payload.reason === 'swarm:supplyPod');
  assert.equal(award?.payload?.credits, 90, 'the stamped worth pays post-clear');
  assert.equal(h.state.run.credits, creditsBefore + 90, 'committed before the shelf prices it');
  director.destroy();
});

test('run value is run value — an award after the envelope closed is refused', () => {
  const h = boot();
  beginSwarm(h);
  h.state.run.phase = 'active';
  transition(h, 'active', 'ended');
  transition(h, 'ended', 'inactive');
  const credits = h.state.run.credits;
  h.bus.emit('run:awardRequested', { credits: 500, reason: 'swarm:supplyPod' });
  assert.equal(h.state.run.credits, credits, 'a dead run keeps no wallet and takes no receipt');
});

test('cash-out is denied mid-fight and off-window — the run stays playable', () => {
  const h = boot();
  beginSwarm(h);
  transition(h, 'loadout', 'draft');
  h.state.run.wave = 9;
  h.bus.emit('run:draftPickRequested', { offerId: null });
  survivalRun.update(DT);
  for (let i = 0; i < SURVIVAL_WAVE_INTRO_TICKS + 4; i++) survivalRun.update(DT);
  assert.equal(h.state.run.phase, 'active');
  h.state.run.wave = 10;
  // The window is real but the phase is wrong — you cannot cash out while the wave is live.
  h.bus.emit('run:extractionRequested', {});
  assert.equal(named(h, 'run:ended').length, 0, 'no end while fighting');
  assert.equal(h.state.run.phase, 'active', 'the run stays playable');
});

test('at the tenth-round refit the cash-out is one deliberate act, ending exactly once', () => {
  const h = boot();
  beginSwarm(h);
  transition(h, 'loadout', 'draft');
  h.state.run.wave = 10;
  h.bus.emit('run:draftPickRequested', { offerId: null });
  survivalRun.update(DT);
  assert.equal(h.state.run.phase, 'refit', 'the tenth round benches after the armory');
  assert.equal(canExtract(h.state.run), true, 'the boundary is legal here');
  h.bus.emit('run:extractionRequested', {});
  const ended = named(h, 'run:ended');
  assert.equal(ended.length, 1, 'the run ends once');
  assert.equal(ended[0].payload.reason, 'extracted');
  const result = named(h, 'run:resultsReady').pop().payload;
  assert.equal(result.outcome, 'extracted', 'the plate records the cash-out, not a defeat');
  h.bus.emit('run:extractionRequested', {});
  assert.equal(named(h, 'run:ended').length, 1, 'a second press cannot end a finished run');
});

test('a cash-out request into a fresh run is refused — the envelope bound the old one', () => {
  const h = boot();
  beginSwarm(h);
  transition(h, 'loadout', 'draft');
  h.state.run.wave = 10;
  h.bus.emit('run:draftPickRequested', { offerId: null });
  survivalRun.update(DT);
  h.bus.emit('run:extractionRequested', {});
  assert.equal(named(h, 'run:ended').length, 1);
  transition(h, 'ended', 'inactive');
  beginSwarm(h);
  assert.equal(h.state.run.phase, 'loadout');
  h.bus.emit('run:extractionRequested', {});
  assert.equal(named(h, 'run:ended').length, 1, 'no new end — the stale request died with its run');
  assert.equal(h.state.run.phase, 'loadout', 'the new run is untouched');
});
