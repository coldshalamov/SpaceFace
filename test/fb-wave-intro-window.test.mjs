// FB-025 — wave intros are real windows.
//
// The gap this pins: survivalRun listened for run:arenaIntroComplete / run:waveIntroComplete but
// nothing ever emitted them, and both intro constants were 1 — so there was no beat at all: the
// opening line fired at the same tick the first body did. Now the announce voice owns the window:
// the line is spoken when the plan lands, the completion emits at the window's end, and the phase
// machine holds wave_intro for a real beat (90 ticks) either way — the constant is the floor.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalAnnounce } from '../src/systems/survivalAnnounce.js';
import {
  SURVIVAL_ARENA_INTRO_TICKS,
  SURVIVAL_WAVE_INTRO_TICKS,
  survivalRun,
} from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';

const DT = 1 / 60;
const SEED = 4242;
const ARENA = 'helios_core';

function boot(seed = SEED) {
  const state = createGameState(seed);
  state.tick = 0;
  state.simTime = 0;
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload, tick: state.tick });
      raw.emit(event, payload);
    },
  };
  const budget = makeBudgetApi(state);
  const spawned = [];
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));

  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalWave.init(ctx);
  survivalRun.init(ctx);
  survivalAnnounce.init(ctx);
  return { state, bus, emitted, helpers, budget, spawned, ctx, player };
}

function tick(h, n = 1) {
  for (let i = 0; i < n; i += 1) {
    h.state.tick += 1;
    h.state.simTime += DT;
    survivalWave.update(DT);
    survivalAnnounce.update(DT);
    survivalRun.update(DT);
  }
}

/** Resolve every live cohort member — the honest fast-forward through a kill-target round. */
function killCohort(h) {
  const killed = [];
  for (const entity of h.state.entityList) {
    if (!entity || entity.alive === false) continue;
    if (!entity.data || entity.data.runCohort !== 'survival') continue;
    entity.alive = false;
    h.bus.emit('entity:killed', {
      id: entity.id, killerId: h.player.id, type: 'ship', pos: { x: 0, z: 0 },
    });
    killed.push(entity.id);
  }
  return killed;
}

/**
 * Drive a swarm run forward one phase at a time through the REAL machine: no manual
 * transitionRequested, no manual intro completes — only loadout/draft answers and kills.
 */
function driveToWaveIntro(h, wave, budget = 4000) {
  for (let i = 0; i < budget; i += 1) {
    const phase = h.state.run && h.state.run.phase;
    const w = h.state.run && h.state.run.wave;
    if (phase === 'wave_intro' && w === wave) return;
    if (phase === 'loadout') h.bus.emit('run:loadoutReady', {});
    else if (phase === 'draft') h.bus.emit('run:draftResolved', {});
    else if (phase === 'active') { killCohort(h); }
    tick(h, 1);
  }
  assert.fail(`never reached wave_intro for wave ${wave}; phase=${h.state.run && h.state.run.phase}`);
}

function findEvent(h, event, match) {
  return h.emitted.find((e) => e.event === event && (!match || match(e.payload)));
}

test('the intro beats are real windows, not one-tick passthroughs', () => {
  assert.equal(SURVIVAL_ARENA_INTRO_TICKS, 120, 'two seconds for the arena');
  assert.equal(SURVIVAL_WAVE_INTRO_TICKS, 90, 'a second and a half per wave');
  assert.ok(SURVIVAL_WAVE_INTRO_TICKS <= 120, 'never exceeding the packet\'s 2 s bound');
});

test('the wave-2 opening line is published inside the window, and spawns wait for the edge', () => {
  const h = boot();
  h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA });

  // Wave 1: the same window law holds for the first round after the armory.
  driveToWaveIntro(h, 1);
  const planned1 = findEvent(h, 'run:wavePlanned', (p) => p.wave === 1);
  assert.ok(planned1, 'wave 1 plans during its intro');
  tick(h, 400);
  assert.equal(h.state.run.phase, 'active', 'wave 1 reaches the fight on the window alone');
  const materialized1 = findEvent(h, 'run:waveMaterialized', (p) => p.wave === 1);
  assert.ok(materialized1, 'wave 1 bodies arrive');
  assert.ok(materialized1.tick - planned1.tick >= SURVIVAL_WAVE_INTRO_TICKS,
    `first wave-1 spawn waits out the window (${materialized1.tick - planned1.tick} >= ${SURVIVAL_WAVE_INTRO_TICKS})`);

  // Wave 2 — the packet's pin on seed 4242.
  driveToWaveIntro(h, 2);
  const planned2 = findEvent(h, 'run:wavePlanned', (p) => p.wave === 2);
  assert.ok(planned2, 'wave 2 plans at intro entry');

  // The opening line is already out — the window exists to be read in.
  const opener = findEvent(h, 'voice:say', (p) => p.id === 'survival:w2:open');
  assert.ok(opener, 'the opening line is published');
  assert.ok(opener.tick >= planned2.tick, 'spoken at the window\'s start, not after it');
  assert.ok(opener.tick < planned2.tick + SURVIVAL_WAVE_INTRO_TICKS,
    'and the player has the whole window left to read it');

  // The announce voice emits the completion itself when the beat has played.
  tick(h, SURVIVAL_WAVE_INTRO_TICKS + 10);
  const completed = findEvent(h, 'run:waveIntroComplete', (p) => p.wave === 2);
  assert.ok(completed, 'survivalAnnounce emits run:waveIntroComplete for the wave');
  assert.ok(completed.tick - planned2.tick >= SURVIVAL_WAVE_INTRO_TICKS - 1,
    'the completion lands at the authored window end, not early');

  tick(h, 300);
  const materialized2 = findEvent(h, 'run:waveMaterialized', (p) => p.wave === 2);
  assert.ok(materialized2, 'wave 2 bodies arrive');
  const gap = materialized2.tick - planned2.tick;
  assert.ok(gap >= SURVIVAL_WAVE_INTRO_TICKS,
    `the first wave-2 spawn lands ${gap} ticks after the plan — never inside the window`);
  assert.equal(h.state.run.phase, 'active');
});

test('nothing spawns during the window — the edge is the only start', () => {
  const h = boot();
  h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA });
  driveToWaveIntro(h, 1);
  const planned = findEvent(h, 'run:wavePlanned', (p) => p.wave === 1);
  // Inside the window: no spawn receipts, no bodies.
  const early = h.emitted.filter((e) => e.event === 'run:waveMaterialized'
    && e.tick - planned.tick < SURVIVAL_WAVE_INTRO_TICKS);
  assert.equal(early.length, 0, 'no wave body materializes before the window ends');
  tick(h, SURVIVAL_WAVE_INTRO_TICKS - 5);
  assert.equal(h.state.run.phase, 'wave_intro', 'the window is still open most of the way through');
  tick(h, 30);
  assert.equal(h.state.run.phase, 'active', 'then the wave opens on time');
});

test('a muted announce cannot stall the machine — the floor is the same constant', () => {
  const h = boot();
  survivalAnnounce.destroy(); // the voice is absent: no plan handler, no completion emit
  h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA });
  driveToWaveIntro(h, 1);
  const planned = findEvent(h, 'run:wavePlanned', (p) => p.wave === 1);
  assert.ok(planned);
  assert.equal(findEvent(h, 'run:waveIntroComplete', (p) => p.wave === 1), undefined,
    'nobody emits the completion — the machine is on its own deadline');
  tick(h, 400);
  const materialized = findEvent(h, 'run:waveMaterialized', (p) => p.wave === 1);
  assert.ok(materialized, 'the wave still starts');
  assert.ok(materialized.tick - planned.tick >= SURVIVAL_WAVE_INTRO_TICKS,
    'on exactly the authored floor — the window does not collapse without the voice');
});
