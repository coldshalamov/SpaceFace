// SAVE-AND-SOAK-1 Part B — the interrupted Swarm run's durable slot: written at each round's
// own start boundary (the draft opening), surviving a quit, replayed through the ordinary
// run:beginRequested seam, and cleared only when the run truly ends.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import {
  SURVIVAL_CLEANUP_TICKS,
  WAVE_CLEARED_SEAM,
  survivalRun,
} from '../src/systems/survivalRun.js';
import {
  clearSwarmResume,
  loadCrucibleMeta,
  swarmResumeFor,
  useCrucibleMetaStorage,
  writeSwarmResume,
} from '../src/systems/survivalRecords.js';

const SEED = 4242;
const ARENA = 'helios_core';
const DT = 1 / 60;

function memoryStorage() {
  const bag = new Map();
  return {
    getItem: (key) => (bag.has(key) ? bag.get(key) : null),
    setItem: (key, value) => { bag.set(key, String(value)); },
    removeItem: (key) => { bag.delete(key); },
  };
}

function stateWithShip() {
  const state = createGameState(SEED);
  state.mode = 'loading';
  state.player.ownedShips = [{
    defId: 'ship_kestrel',
    fittings: ['wpn_pulse_laser_s', 'mod_shield_booster_s', null, null, 'mod_engine_ion_m'],
    held: 0,
  }];
  state.player.activeShipIndex = 0;
  return state;
}

function makeRig() {
  const state = stateWithShip();
  const raw = createBus();
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit: raw.emit.bind(raw),
  };
  runSession.init({ state, bus });
  survivalRun.init({ state, bus });
  return { state, bus };
}

function dropRig() {
  survivalRun.destroy();
  runSession.destroy();
}

test('the opening stop leaves no slot: nothing is resumable before a round is flown', () => {
  // Rewritten rule: a slot for a run that never flew a round resumed to exactly what PLAY gives,
  // and the sim worker's boot rehearsal (a throwaway checkpoint fight) left "Resume round 3" on
  // a brand-new player's Swarm door. Only a cleared round stamps the slot now.
  const storage = memoryStorage();
  useCrucibleMetaStorage(storage);
  clearSwarmResume(storage);
  const { state, bus } = makeRig();
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA });
  bus.emit('run:loadoutReady', {});
  bus.emit('run:openingPrepareRequested', {});
  assert.equal(state.run.phase, 'draft');
  assert.equal(swarmResumeFor(loadCrucibleMeta(storage)), null, 'the round-1 opening writes no slot');
  dropRig();

  // A checkpoint start parks one below its first round; its opening writes nothing either.
  const rig = makeRig();
  rig.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA, startWave: 3 });
  rig.bus.emit('run:loadoutReady', {});
  rig.bus.emit('run:openingPrepareRequested', {});
  assert.equal(rig.state.run.phase, 'draft');
  assert.equal(swarmResumeFor(loadCrucibleMeta(storage)), null, 'a checkpoint opening writes no slot');
  dropRig();
});

test('a cleared round advances the slot and a quit keeps it for resume', () => {
  const storage = memoryStorage();
  useCrucibleMetaStorage(storage);
  clearSwarmResume(storage);
  const { state, bus } = makeRig();
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA });
  bus.emit('run:loadoutReady', {});
  bus.emit('run:openingPrepareRequested', {});
  assert.equal(state.run.phase, 'draft');
  // The purse the player carried out of round 1's shop — settled before the pick.
  bus.emit('run:awardRequested', { credits: 350, reason: 'swarm:stake:exhibition' });
  bus.emit('run:draftResolved', {});
  survivalRun.update(DT);
  assert.equal(state.run.phase, 'wave_intro');
  assert.equal(state.run.wave, 1);
  bus.emit('run:waveIntroComplete', {});
  survivalRun.update(DT);
  assert.equal(state.run.phase, 'active');
  // Round 1 dies on the vine — mid-fight — but the slot still names the round's own start.
  bus.emit(WAVE_CLEARED_SEAM, { wave: 1 });
  survivalRun.update(DT);
  assert.equal(state.run.phase, 'cleanup');
  // A non-shop wave's draft entry auto-resolves in the same tick run — the record still
  // stamps on the draft ENTRY transition, which is the whole point of the boundary write.
  for (let i = 0; i < SURVIVAL_CLEANUP_TICKS + 10; i++) survivalRun.update(DT);
  const resume = swarmResumeFor(loadCrucibleMeta(storage));
  assert.ok(resume, 'a cleared round stamps the slot');
  assert.equal(resume.seed, SEED >>> 0);
  assert.equal(resume.arenaId, ARENA);
  assert.equal(resume.ship.defId, 'ship_kestrel');
  assert.deepEqual(resume.ship.loadout, [
    { slotIndex: 0, defId: 'wpn_pulse_laser_s' },
    { slotIndex: 1, defId: 'mod_shield_booster_s' },
    { slotIndex: 4, defId: 'mod_engine_ion_m' },
  ]);
  assert.equal(resume.wave, 2, 'the slot names the next round');
  assert.equal(resume.run.wave, 1, 'the run counter sits at the cleared wave');
  assert.equal(resume.run.credits, state.run.credits);
  assert.ok(resume.run.credits >= 350, 'the wallet the round starts with is banked');
  // A quit is an aborted end, not a defeat — the slot survives it.
  bus.emit('game:exitToMenu', { source: 'exit_to_menu' });
  assert.equal(state.run.phase, 'inactive');
  const kept = swarmResumeFor(loadCrucibleMeta(storage));
  assert.ok(kept, 'the slot survives a quit');
  assert.equal(kept.wave, 2);

  // Resuming replays the record through the ordinary begin seam: the run envelope
  // restores wallet/build/pilot and parks the counter so the planner replans round 2.
  const rig2 = makeRig();
  rig2.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA,
    startWave: kept.wave, resume: kept,
  });
  const run = rig2.state.run;
  assert.equal(run.phase, 'loadout');
  assert.equal(run.wave, 1, 'the wave counter parks before the replanned round');
  assert.equal(run.credits, kept.run.credits);
  assert.equal(run.telemetry.startWave, 2);
  assert.equal(run.seed, SEED >>> 0);
  rig2.bus.emit('run:loadoutReady', {});
  rig2.bus.emit('run:openingPrepareRequested', {});
  assert.equal(rig2.state.run.phase, 'draft', 'resume lands at the round-opening shop, not mid-fight');
  dropRig();
});

test('a defeat retires the slot', () => {
  const storage = memoryStorage();
  useCrucibleMetaStorage(storage);
  clearSwarmResume(storage);
  const { state, bus } = makeRig();
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA });
  bus.emit('run:loadoutReady', {});
  bus.emit('run:openingPrepareRequested', {});
  // A slot an earlier cleared round left behind.
  assert.ok(writeSwarmResume({ wave: 2, seed: SEED, arenaId: ARENA, ruleset: 'swarm',
    ship: { defId: 'ship_kestrel', loadout: [] }, run: { wave: 1 } }, storage));
  assert.ok(swarmResumeFor(loadCrucibleMeta(storage)));
  bus.emit('run:endRequested', { outcome: 'defeat', reason: 'player_down', tick: 10 });
  assert.equal(swarmResumeFor(loadCrucibleMeta(storage)), null);
  dropRig();
});

test('a non-swarm run writes no slot', () => {
  const storage = memoryStorage();
  useCrucibleMetaStorage(storage);
  clearSwarmResume(storage);
  const { state, bus } = makeRig();
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: ARENA });
  bus.emit('run:loadoutReady', {});
  survivalRun.update(DT);
  for (let i = 0; i < 400; i++) survivalRun.update(DT);
  assert.equal(swarmResumeFor(loadCrucibleMeta(storage)), null);
  dropRig();
});
