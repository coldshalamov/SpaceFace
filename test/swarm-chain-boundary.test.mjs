// The kill chain's "carries across waves" claim, verified through the REAL phase machine —
// not a simulated one. survivalRun walks the same edges the game walks: a swarm round ends
// active -> cleanup -> draft (every round opens the armory, so the draft waits on the
// player) -> wave_intro -> active, and wave ten adds -> refit between the armory and the
// intro. swarmChain ticks on the same advancing sim clock the whole way.
//
// What this pins: the only between-wave phase whose clock drains the 4 s lapse window is
// cleanup, and the swarm's settlement beat is 45 ticks — three quarters of a second, always
// shorter than the window. Every other stop is pinned: update() banks _lastKillAt forward
// each tick the run is not live, so the armory can sit open for a minute and the chain the
// player carried in is the chain that greets the next opening burst — with a fresh window,
// because the pin releases on the first live tick.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import {
  survivalRun,
  SURVIVAL_WAVE_INTRO_TICKS,
} from '../src/systems/survivalRun.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { ships } from '../src/systems/ships.js';
import { economy } from '../src/systems/economy.js';
import {
  swarmChain,
  SWARM_CHAIN_STEP,
  SWARM_CHAIN_WINDOW_S,
} from '../src/systems/swarmChain.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';
import { SWARM_CLEANUP_TICKS, SWARM_RULESET } from '../src/data/swarmMode.js';
import { TECH_NODES } from '../src/data/tech.js';

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
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, type: 'ship', data: {} };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.nextEntityId = 2;
  const ctx = { state, bus, helpers: {}, registry };
  economy.init(ctx);
  ships.init(ctx);
  runSession.init(ctx);
  survivalRun.init(ctx);
  survivalDraft.init(ctx);
  swarmChain.init(ctx);
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

let n = 0;
/** Kill one cohort body at the current sim time — the same receipt the wave's own dead send. */
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

/** One fixed step: the clock moves, the phase machine ticks, the lapse check ticks. */
function tick(h) {
  h.state.simTime += DT;
  survivalRun.update(DT);
  swarmChain.update(DT, h.state);
}

function ticks(h, count) {
  for (let i = 0; i < count; i++) tick(h);
}

function named(h, event) {
  return h.emitted.filter((entry) => entry.event === event);
}

/** Launch the next round the way the armory's Done verb does — one explicit resolve. */
function resolveDraft(h) {
  h.bus.emit('run:draftPickRequested', { offerId: null });
}

/**
 * Run the machine from a fresh boot to a live wave-one arena. The opening armory resolves
 * exactly like every later one: the player leaves, the machine walks draft -> wave_intro
 * -> active and the wave's own plan installs its cleanup length on the way in.
 */
function reachFirstWave(h) {
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: SWARM_RULESET, seed: SEED, arenaId: ARENA,
  });
  h.bus.emit('run:transitionRequested', {
    expectedPhase: 'loadout', nextPhase: 'draft', reason: 't', tick: 0,
  });
  assert.equal(h.state.run.phase, 'draft');
  resolveDraft(h);
  tick(h);
  assert.equal(h.state.run.phase, 'wave_intro');
  ticks(h, SURVIVAL_WAVE_INTRO_TICKS + 2);
  assert.equal(h.state.run.phase, 'active');
  assert.equal(h.state.run.wave, 1);
}

test('the settlement beat is shorter than the lapse window — the structural half of the claim', () => {
  // If a future cleanup gets longer than the window, a wave-clear kill can NEVER carry:
  // the chain would die before the draft is even reached. This is the constant-level guard.
  assert.ok(
    SWARM_CLEANUP_TICKS < SWARM_CHAIN_WINDOW_S * 60,
    `cleanup ${SWARM_CLEANUP_TICKS}t must stay inside the ${SWARM_CHAIN_WINDOW_S}s window`,
  );
});

test('a live chain crosses the real boundary — cleanup drains, draft and intro do not', () => {
  const h = boot();
  reachFirstWave(h);
  for (let i = 0; i < 3; i++) { kill(h, 'direct'); ticks(h, 10); }
  const chain = swarmChain.chainState().chain;
  assert.ok(chain >= 3);
  const breaksBefore = named(h, 'swarm:chainBroken').length;

  // The wave-clearing kill IS the last kill — the wave resolves and cleanup begins.
  h.bus.emit('run:waveCleared', { wave: 1 });
  tick(h);
  assert.equal(h.state.run.phase, 'cleanup');
  ticks(h, SWARM_CLEANUP_TICKS);
  assert.equal(h.state.run.phase, 'draft', 'the armory opens on the beat');
  assert.equal(swarmChain.chainState().chain, chain, 'cleanup alone cannot eat the window');

  // The player reads the shelf for ten sim-seconds — pinned, so the clock cannot drain.
  ticks(h, 600);
  assert.equal(h.state.run.phase, 'draft', 'the armory waits on the player');
  assert.equal(swarmChain.chainState().chain, chain, 'shopping is not killing the chain');
  assert.equal(named(h, 'swarm:chainBroken').length, breaksBefore, 'no lapse mid-stop');

  resolveDraft(h);
  tick(h);
  assert.equal(h.state.run.phase, 'wave_intro');
  ticks(h, SURVIVAL_WAVE_INTRO_TICKS + 2);
  assert.equal(h.state.run.phase, 'active');
  assert.equal(h.state.run.wave, 2);

  const after = swarmChain.chainState();
  assert.equal(after.chain, chain, 'the chain carried across');
  // The pin released on the first live tick — the carried chain opens the round with
  // nearly a fresh window, so the next kill can actually be reached.
  assert.ok(
    after.expiresIn > SWARM_CHAIN_WINDOW_S - 0.5,
    `carried chain should reopen near-full, got ${after.expiresIn.toFixed(2)}s`,
  );
  // The boundary re-announced the live chain into wave two (the readout restarts its bar).
  assert.ok(
    named(h, 'swarm:chain').some((e) => e.payload && e.payload.wave === 2 && e.payload.chain === chain),
    'the carried chain is re-announced on the new wave',
  );

  kill(h, 'terrain_collision');
  assert.equal(
    swarmChain.chainState().chain,
    chain + 2,
    'the opener CONTINUES the carried chain — it does not start a new one',
  );
  assert.equal(named(h, 'swarm:chainBroken').length, breaksBefore, 'nothing broke at the seam');
  swarmChain.destroy();
});

test('cleanup is live fight time — a straggler kill there feeds the SAME chain', () => {
  const h = boot();
  reachFirstWave(h);
  for (let i = 0; i < 3; i++) { kill(h, 'direct'); ticks(h, 10); }
  const chain = swarmChain.chainState().chain;

  h.bus.emit('run:waveCleared', { wave: 1 });
  tick(h);
  assert.equal(h.state.run.phase, 'cleanup');
  // A body still falling while the wave settles pays into the chain the wave built.
  ticks(h, SWARM_CLEANUP_TICKS - 15);
  kill(h, 'explosive');
  assert.equal(
    swarmChain.chainState().chain,
    chain + 2,
    'a cleanup kill continues the chain — and re-arms the window for the crossing',
  );
  ticks(h, 20);
  assert.equal(h.state.run.phase, 'draft');

  resolveDraft(h);
  ticks(h, SURVIVAL_WAVE_INTRO_TICKS + 4);
  assert.equal(h.state.run.phase, 'active');
  assert.equal(h.state.run.wave, 2);
  assert.equal(swarmChain.chainState().chain, chain + 2, 'and it lands intact on wave two');
  swarmChain.destroy();
});

test('the deepest crossing — wave ten adds a refit between the armory and the next intro', () => {
  const h = boot();
  reachFirstWave(h);
  for (let i = 0; i < 3; i++) { kill(h, 'direct'); ticks(h, 10); }
  const chain = swarmChain.chainState().chain;
  const breaksBefore = named(h, 'swarm:chainBroken').length;

  // Stand the run on wave ten: card first, then the bench, then the next round.
  h.state.run.wave = 10;
  h.bus.emit('run:waveCleared', { wave: 10 });
  tick(h);
  assert.equal(h.state.run.phase, 'cleanup');
  ticks(h, SWARM_CLEANUP_TICKS);
  assert.equal(h.state.run.phase, 'draft');
  ticks(h, 300);
  assert.equal(swarmChain.chainState().chain, chain, 'the armory stay costs nothing');

  resolveDraft(h);
  tick(h);
  assert.equal(h.state.run.phase, 'refit', 'the bench follows the card on a refit wave');
  ticks(h, 300);
  assert.equal(h.state.run.phase, 'refit', 'the bench waits on the player too');
  assert.equal(swarmChain.chainState().chain, chain, 'the refit stay costs nothing');

  h.bus.emit('run:refitCloseRequested', {});
  tick(h);
  assert.equal(h.state.run.phase, 'wave_intro');
  ticks(h, SURVIVAL_WAVE_INTRO_TICKS + 2);
  assert.equal(h.state.run.phase, 'active');
  assert.equal(h.state.run.wave, 11);

  const after = swarmChain.chainState();
  assert.equal(after.chain, chain, 'the chain crossed draft + refit + intro');
  assert.ok(after.expiresIn > SWARM_CHAIN_WINDOW_S - 0.5, 'near-full window at the opener');
  kill(h, 'direct');
  assert.equal(
    swarmChain.chainState().chain,
    chain + SWARM_CHAIN_STEP,
    'the wave-eleven opener continues the carried chain',
  );
  assert.equal(named(h, 'swarm:chainBroken').length, breaksBefore, 'no break on the long seam');
  swarmChain.destroy();
});

test('the drain is honest — a chain already dying when the wave ends still dies', () => {
  const h = boot();
  reachFirstWave(h);
  kill(h, 'direct');
  // Three and a half live seconds of silence before the wave finally clears (a slow
  // trailing despawn, not a fresh kill): the window reaches the beat nearly spent.
  // Cleanup is live fight time — the pin only exists outside it, so the roughly
  // half-second still owed runs out mid-beat rather than at a hidden boundary reset.
  ticks(h, Math.round(SWARM_CHAIN_WINDOW_S * 60) - 30);
  h.bus.emit('run:waveCleared', { wave: 1 });
  tick(h);
  assert.equal(h.state.run.phase, 'cleanup');
  for (let i = 0; i < SWARM_CLEANUP_TICKS && swarmChain.chainState().chain > 0; i++) tick(h);
  const broken = named(h, 'swarm:chainBroken');
  assert.equal(broken.length, 1, 'the nearly-spent chain lapses during cleanup');
  assert.equal(broken[0].payload.reason, 'lapsed');
  assert.equal(h.state.run.phase, 'cleanup', 'it died in the fight, not in the menu');
  swarmChain.destroy();
});
