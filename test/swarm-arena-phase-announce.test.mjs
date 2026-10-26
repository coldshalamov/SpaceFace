// The room-law voice: a swarm wave's arenaPhase and the law's mid-wave machinery flips are
// named through the one-voice `alert` seam, once per change — never silently, never on repeat.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { CINDER_SLUICE_CYCLES } from '../src/data/environmentalMachinery.js';

const SEED = 4242;
const FOUNDRY = 'helios_core';
const CINDER = 'cinder_sluice';
const CYCLE = CINDER_SLUICE_CYCLES.unregulated;

function boot({ ruleset = SWARM_RULESET, arenaId = FOUNDRY } = {}) {
  const state = createGameState(SEED);
  const bus = createBus();
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: { x: spec.pos.x, z: spec.pos.z } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;

  const emitted = [];
  bus.on('alert', (p) => emitted.push(p));
  const receipts = [];
  bus.on('swarmArena:lawPhase', (p) => receipts.push(p));

  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalRun.init(ctx);
  survivalArena.init(ctx);
  swarmArena.init(ctx);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset, seed: SEED, arenaId });
  return { state, bus, helpers, player, emitted, receipts };
}

function planFor(arenaId, wave) {
  return planWave({ seed: SEED, arenaId, wave, ruleset: SWARM_RULESET });
}

function lawAlerts(h) {
  return h.emitted.filter((p) => typeof p.key === 'string' && p.key.startsWith('swarm-law-'));
}

function installLawWave(h, wave, arenaId = CINDER, at = 10) {
  h.state.simTime = at;
  h.bus.emit('run:wavePlanned', { wave, plan: planFor(arenaId, wave) });
  h.state.mode = 'flight';
  h.state.run.phase = 'active';
  h.state.run.wave = wave;
  return at;
}

test('a mid-wave machinery flip announces exactly once and names the phase', () => {
  const h = boot({ arenaId: CINDER });
  const at = installLawWave(h, 2); // wave 2 -> furnace_active, a machinery phase in the Sluice
  // The room opens in the machinery's warning baseline — nothing to announce yet.
  h.state.simTime = at + 0.5;
  swarmArena.update();
  assert.equal(lawAlerts(h).filter((p) => p.key !== 'swarm-law-room-w2').length, 0);

  h.state.simTime = at + CYCLE.warningS + 0.1; // warning -> surge
  swarmArena.update();
  const surges = h.receipts.filter((p) => p.verb === 'phase' && p.phase === 'surge' && p.source === 'sluice');
  assert.equal(surges.length, 1, 'exactly one law-phase event for the flip');
  assert.equal(surges[0].wave, 2);
  assert.equal(surges[0].arenaId, CINDER);
  const alert = lawAlerts(h).find((p) => p.key === 'swarm-law-w2-sluice:surge');
  assert.ok(alert, 'the alert carries the phase identity');
  assert.match(alert.text, /SLUICE FIRES/);
});

test('the same machinery phase never announces twice inside a wave', () => {
  const h = boot({ arenaId: CINDER });
  const at = installLawWave(h, 2);
  for (let i = 1; i <= 12; i++) { // well inside the surge window — one flip, twelve ticks
    h.state.simTime = at + CYCLE.warningS + i * 0.4;
    swarmArena.update();
  }
  assert.equal(
    h.receipts.filter((p) => p.verb === 'phase' && p.source === 'sluice').length, 1,
    'twelve ticks in one phase still spoke once',
  );
  // The cycle keeps turning: the next DISTINCT state names itself once too, and a lap back
  // through the same state stays quiet — the wave learned the word already.
  h.state.simTime = at + CYCLE.warningS + CYCLE.surgeS + 0.1; // surge -> calm
  swarmArena.update();
  assert.equal(
    h.receipts.filter((p) => p.verb === 'phase' && p.source === 'sluice' && p.phase === 'calm').length, 1,
  );
  h.state.simTime = at + CYCLE.warningS + CYCLE.surgeS + CYCLE.calmS + 0.2; // calm -> warning again
  swarmArena.update();
  h.state.simTime += CYCLE.warningS + 0.2; // and surge once more — already told, stays quiet
  swarmArena.update();
  const sluice = h.receipts.filter((p) => p.verb === 'phase' && p.source === 'sluice');
  assert.equal(sluice.length, 3, 'surge, calm, warning — each named once, then silence');
});

test('a wave install announces the room once; a same-phase re-plan stays quiet', () => {
  const h = boot({ arenaId: FOUNDRY });
  const at = installLawWave(h, 3); // wave 3 -> shutter_slow
  const installed = lawAlerts(h).filter((p) => p.key === 'swarm-law-room-w3');
  assert.equal(installed.length, 1, 'one room line for the install');
  assert.ok(installed[0].text.length > 0, 'and it is the authored room note');
  // The receipt re-fires for the same wave and phase (a re-plan) — not a change, so no second line.
  h.bus.emit('run:wavePlanned', { wave: 3, plan: planFor(FOUNDRY, 3) });
  h.state.simTime = at + 1;
  assert.equal(lawAlerts(h).filter((p) => p.key === 'swarm-law-room-w3').length, 1);
  // A later wave installing a different phase is a new room and is named again.
  installLawWave(h, 4);
  assert.equal(lawAlerts(h).filter((p) => p.key === 'swarm-law-room-w4').length, 1);
});

test('foundry shutters are a mid-wave law flip too — named once per state per wave', () => {
  const h = boot({ arenaId: FOUNDRY });
  const at = installLawWave(h, 3); // shutter_slow: two authored foundry shutters on one clock
  h.state.simTime = at + 2.1; // past the default SHUTTER_CYCLE warning window
  swarmArena.update();
  const surges = h.receipts.filter((p) => p.verb === 'phase' && p.phase === 'surge' && p.source === 'shutter');
  assert.equal(surges.length, 1, 'two shutters sliding together read as one room event');
  h.state.simTime = at + 3;
  swarmArena.update();
  assert.equal(
    h.receipts.filter((p) => p.verb === 'phase' && p.phase === 'surge' && p.source === 'shutter').length, 1,
  );
});

test('a non-swarm run hears nothing — the law voice is a swarm-run line', () => {
  const h = boot({ ruleset: 'scored' });
  h.bus.emit('survivalArena:installed', {
    wave: 1, arenaId: CINDER, arenaPhase: 'furnace_active',
    note: 'a current down the lane; upstream costs, downstream is cheap',
    installedAtSim: 0, toySpecs: [],
  });
  h.state.mode = 'flight';
  h.state.simTime = 10;
  swarmArena.update();
  assert.equal(lawAlerts(h).length, 0);
  assert.equal(h.receipts.length, 0);
});

test('an inert room stays quiet — no note, no machinery, no announce', () => {
  const h = boot({ arenaId: FOUNDRY });
  h.bus.emit('survivalArena:installed', {
    wave: 1, arenaId: 'nowhere_legal', arenaPhase: 'idle',
    note: 'inert room', installedAtSim: 0, toySpecs: [],
  });
  h.state.mode = 'flight';
  h.state.run.phase = 'active';
  h.state.run.wave = 1;
  for (let i = 0; i < 5; i++) {
    h.state.simTime = i * 4;
    swarmArena.update();
  }
  assert.equal(lawAlerts(h).length, 0, 'a phaseless room never announces');
  assert.equal(h.receipts.length, 0);
});
