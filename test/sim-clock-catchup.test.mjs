import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import {
  CALENDAR_CLOCK_PERIOD_TICKS,
  shouldSkipSystemThisStep,
} from '../src/core/catchupPolicy.js';
import {
  CALENDAR_CLOCK_IDS,
  SYSTEM_CLOCK,
  getSystemClock,
} from '../src/runtime/authoritativeSystemManifest.js';

function stub(name, ran) {
  return {
    name,
    update(_dt, state) {
      ran.push({ name, tick: state.tick | 0, catchup: state.simCatchupIndex | 0 });
    },
  };
}

test('clock membership: table / near / calendar / glass', () => {
  assert.equal(getSystemClock('physics'), SYSTEM_CLOCK.TABLE);
  assert.equal(getSystemClock('weapons'), SYSTEM_CLOCK.TABLE);
  assert.equal(getSystemClock('mining'), SYSTEM_CLOCK.TABLE);
  assert.equal(getSystemClock('tetherGameplay'), SYSTEM_CLOCK.TABLE);
  assert.equal(getSystemClock('lawSecurity'), SYSTEM_CLOCK.NEAR);
  assert.equal(getSystemClock('traffic'), SYSTEM_CLOCK.NEAR);
  assert.equal(getSystemClock('npcJobsRuntime'), SYSTEM_CLOCK.NEAR);
  assert.equal(getSystemClock('barkDirector'), SYSTEM_CLOCK.CALENDAR);
  assert.equal(getSystemClock('missions'), SYSTEM_CLOCK.CALENDAR);
  assert.equal(getSystemClock('liveCareerLadderBranches'), SYSTEM_CLOCK.CALENDAR);
  assert.equal(getSystemClock('masslineHud'), SYSTEM_CLOCK.GLASS);
  assert.equal(getSystemClock('voiceArbiter'), SYSTEM_CLOCK.GLASS);
  assert.ok(CALENDAR_CLOCK_IDS.includes('barkDirector'));
});

test('createSimulation extra catch-up steps invoke table only', () => {
  const ran = [];
  const sim = createSimulation({
    seed: 1,
    systems: [
      stub('physics', ran),
      stub('weapons', ran),
      stub('mining', ran),
      stub('barkDirector', ran),
      stub('missions', ran),
      stub('lawSecurity', ran),
      stub('npcJobsRuntime', ran),
      stub('masslineHud', ran),
      stub('voiceArbiter', ran),
    ],
  });
  sim.state.runtime = { profileId: 'production' };
  sim.state.tick = 0;
  sim.state.simCatchupIndex = 1;
  sim.step(1 / 60);
  const names = ran.map((row) => row.name).sort();
  assert.deepEqual(names, ['mining', 'physics', 'weapons']);
  assert.equal(shouldSkipSystemThisStep('barkDirector', sim.state), true);
  assert.equal(shouldSkipSystemThisStep('physics', sim.state), false);
  sim.dispose();
});

test('createSimulation calendar owners run at 2 Hz, not every tick', () => {
  const ran = [];
  const sim = createSimulation({
    seed: 1,
    systems: [
      stub('physics', ran),
      stub('barkDirector', ran),
      stub('missions', ran),
      stub('regionalEcology', ran),
    ],
  });
  sim.state.runtime = { profileId: 'production' };
  const ticks = CALENDAR_CLOCK_PERIOD_TICKS * 2;
  for (let i = 0; i < ticks; i++) sim.step(1 / 60);
  const bark = ran.filter((row) => row.name === 'barkDirector');
  const physics = ran.filter((row) => row.name === 'physics');
  const missions = ran.filter((row) => row.name === 'missions');
  assert.equal(physics.length, ticks);
  assert.equal(bark.length, 3);
  assert.equal(missions.length, 3);
  assert.deepEqual(bark.map((row) => row.tick), [1, CALENDAR_CLOCK_PERIOD_TICKS, CALENDAR_CLOCK_PERIOD_TICKS * 2]);
  sim.dispose();
});
