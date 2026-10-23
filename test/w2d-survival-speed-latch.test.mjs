// O42: the Crucible stamps a run as speed-assisted by sampling the game-speed setting, but it only
// sampled at the start of each wave. Dropping to 70% mid-round and returning to 100% before the
// next wave left the run stamped as full speed. Every change after the first wave now latches.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { survivalResults } from '../src/systems/survivalResults.js';
import { recordRulesFor } from '../src/systems/survivalRecords.js';

function boot(speed) {
  const state = createGameState(4242);
  state.settings.gameplay.gameSpeed = speed;
  state.run = createRunState({ kind: 'survival', ruleset: 'arc', seed: 4242 });
  state.run.phase = 'active';
  state.run.arenaId = 'arena_pq146';
  state.run.wave = 1;
  const bus = createBus();
  const sr = Object.create(survivalResults);
  sr.init({ state, bus, helpers: {}, registry: null });
  // What the settings screen does: write the setting, then announce it.
  const setSpeed = (value) => {
    state.settings.gameplay.gameSpeed = value;
    bus.emit('settings:changed', { section: 'gameplay', key: 'gameSpeed', value });
  };
  return { state, bus, sr, setSpeed };
}

test('100% -> 70% -> 100% inside one round still stamps the run as assisted', () => {
  const h = boot(1);
  h.bus.emit('run:waveStarted', { wave: 1 });
  assert.equal(h.sr._stuntRules.simulationSpeedAssist, undefined, 'a full-speed start carries no assist stamp');

  h.setSpeed(0.7);
  assert.equal(h.sr._stuntRules.simulationSpeedAssist, 'mixed', 'latched the moment the speed dropped');
  h.setSpeed(1);
  h.bus.emit('run:waveStarted', { wave: 2 });   // the old sampler sees 100% here and forgot the dip
  assert.equal(h.sr._stuntRules.simulationSpeedAssist, 'mixed', 'back at 100% the run stays assisted');
  assert.equal(recordRulesFor({ recordRules: h.sr._stuntRules }).simulationSpeedAssist, 'mixed');
});

test('an assisted start that is raised mid-round is mixed, not full speed', () => {
  const h = boot(0.7);
  h.bus.emit('run:waveStarted', { wave: 1 });
  assert.equal(h.sr._stuntRules.simulationSpeedAssist, 0.7);
  h.setSpeed(1);
  assert.equal(h.sr._stuntRules.simulationSpeedAssist, 'mixed');
});

test('an unchanged or re-asserted speed leaves the stamp alone, and other settings never touch it', () => {
  const full = boot(1);
  full.bus.emit('run:waveStarted', { wave: 1 });
  full.setSpeed(1);
  full.bus.emit('settings:changed', { section: 'audio', key: 'master', value: 0.2 });
  assert.equal(full.sr._stuntRules.simulationSpeedAssist, undefined);

  const assisted = boot(0.8);
  assisted.bus.emit('run:waveStarted', { wave: 1 });
  assisted.setSpeed(0.8);
  assert.equal(assisted.sr._stuntRules.simulationSpeedAssist, 0.8);
});

test('a change before the first wave is covered by the first wave sample, and no run means no stamp', () => {
  const pre = boot(1);
  pre.setSpeed(0.7);               // loadout: no stamp exists yet, nothing to latch, nothing throws
  pre.bus.emit('run:waveStarted', { wave: 1 });
  assert.equal(pre.sr._stuntRules.simulationSpeedAssist, 0.7);

  const over = boot(1);
  over.bus.emit('run:waveStarted', { wave: 1 });
  over.state.run.phase = 'inactive';
  over.setSpeed(0.7);              // the round is over - a later menu change cannot rewrite its stamp
  assert.equal(over.sr._stuntRules.simulationSpeedAssist, undefined);
});
