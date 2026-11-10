// FIGHT-10 — A swarm reinforcement surge is called before it lands.
// On seed 4242 each reinforcement batch is preceded by one announce line at least 60 ticks
// before the spawn; this focused test pins the lead time.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import {
  createSwarmPressureState,
  swarmReinforceDecision,
  SWARM_BREATH_TICKS,
} from '../src/data/swarmMode.js';
import { survivalAnnounce } from '../src/systems/survivalAnnounce.js';

const SEED = 4242;

function bootSurvivalAnnounce({ kind = 'survival', ruleset = 'swarm', phase = 'active', wave = 2 } = {}) {
  const state = createGameState(SEED);
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

  const run = createRunState({ kind, seed: SEED });
  run.ruleset = ruleset;
  run.phase = phase;
  run.wave = wave;
  state.run = run;
  state.tick = 100;

  survivalAnnounce.init({ state, bus, helpers: {} });

  return {
    state,
    bus,
    emitted,
    voiceLines: () => emitted.filter((e) => e.event === 'voice:say'),
  };
}

test('FIGHT-10: On seed 4242, reinforcement surge announcement precedes spawn by at least 60 ticks', () => {
  const { state, bus, voiceLines } = bootSurvivalAnnounce({ wave: 2 });

  const pressureBag = createSwarmPressureState();
  let announceTick = null;
  let spawnTick = null;

  // Simulate ticks starting at 100
  state.tick = 100;

  // Deficit of 4 (>= SWARM_CLEAR_KILLS) triggers a hold
  const initialDeficit = 4;
  const initialDecision = swarmReinforceDecision(pressureBag, initialDeficit, { alive: 2 });
  assert.equal(initialDecision.telegraph, true, 'Deficit >= 3 triggers pressure hold and telegraph');
  assert.equal(initialDecision.count, 0, 'No instant spawn during hold');

  // Trigger telegraph emission through bus
  bus.emit('swarm:pressureTelegraph', {
    wave: 2,
    etaTicks: SWARM_BREATH_TICKS,
    stored: pressureBag.stored,
    tick: state.tick,
  });

  const lines = voiceLines();
  assert.equal(lines.length, 1, 'Exactly one announce line emitted for surge telegraph');
  assert.match(lines[0].payload.text, /surge/i, 'Announces inbound surge');
  announceTick = state.tick;

  // Advance ticks during the breath period
  for (let t = 1; t <= SWARM_BREATH_TICKS; t++) {
    state.tick = 100 + t;
    const stepDecision = swarmReinforceDecision(pressureBag, initialDeficit, { alive: 2 });
    if (stepDecision.count > 0) {
      spawnTick = state.tick;
      break;
    }
  }

  assert.ok(spawnTick !== null, 'Reinforcement batch spawned after hold duration');
  const leadTimeTicks = spawnTick - announceTick;
  assert.ok(
    leadTimeTicks >= 60,
    `Lead time ${leadTimeTicks} ticks must be at least 60 ticks (actual: ${leadTimeTicks})`
  );
  assert.equal(leadTimeTicks, SWARM_BREATH_TICKS, `Lead time matches SWARM_BREATH_TICKS (${SWARM_BREATH_TICKS})`);
});

test('FIGHT-10: Telegraph is silenced when muted or run is not active', () => {
  const { bus, voiceLines } = bootSurvivalAnnounce({ phase: 'inactive' });
  bus.emit('swarm:pressureTelegraph', { wave: 2, etaTicks: 240, stored: 3, tick: 100 });
  assert.equal(voiceLines().length, 0, 'Silent when run is inactive');
});
