import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import {
  CALENDAR_CLOCK_PERIOD_TICKS,
  shouldRunSystemThisStep,
  shouldSkipSystemOnCatchup,
  shouldSkipSystemThisStep,
} from '../src/core/catchupPolicy.js';
import {
  CALENDAR_CLOCK_IDS,
  PRODUCTION_CALENDAR_UPDATE_ORDER,
  PRODUCTION_COMBAT_UPDATE_ORDER,
  PRODUCTION_UPDATE_ORDER,
  SYSTEM_CLOCK,
  getSystemClock,
} from '../src/runtime/authoritativeSystemManifest.js';
import { partitionUpdateSystems, updateQueueForThisStep } from '../src/core/catchupPolicy.js';

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
  assert.equal(getSystemClock('aftermathWrecks'), SYSTEM_CLOCK.CALENDAR);
  assert.equal(getSystemClock('wingMorale'), SYSTEM_CLOCK.CALENDAR);
  assert.equal(getSystemClock('combatOutcome'), SYSTEM_CLOCK.NEAR);
  assert.equal(getSystemClock('cargo'), SYSTEM_CLOCK.NEAR);
  assert.equal(getSystemClock('terrainAnchors'), SYSTEM_CLOCK.CALENDAR);
  assert.equal(getSystemClock('jettisonImpulse'), SYSTEM_CLOCK.CALENDAR);
  assert.equal(getSystemClock('masslineImpactDamage'), SYSTEM_CLOCK.CALENDAR);
  assert.equal(getSystemClock('liveCareerLadderBranches'), SYSTEM_CLOCK.CALENDAR);
  assert.equal(getSystemClock('masslineHud'), SYSTEM_CLOCK.GLASS);
  assert.equal(getSystemClock('voiceArbiter'), SYSTEM_CLOCK.GLASS);
  assert.ok(CALENDAR_CLOCK_IDS.includes('barkDirector'));
});

test('selected AI backends retain their slot clock on catch-up steps', () => {
  for (const name of ['ai', 'tacticalAI']) {
    const ran = [];
    const sim = createSimulation({
      seed: 1,
      systems: [stub(name, ran), stub('physics', ran), stub('flight', ran)],
    });
    sim.state.runtime = { profileId: 'production' };
    sim.state.simCatchupIndex = 0;
    sim.step(1 / 60);
    assert.deepEqual(ran.map((row) => row.name), [name, 'physics', 'flight']);
    ran.length = 0;
    sim.state.simCatchupIndex = 1;
    sim.step(1 / 60);
    assert.deepEqual(ran.map((row) => row.name), ['physics', 'flight'], name);
    assert.equal(getSystemClock(name), getSystemClock('aiSlot'));
    assert.equal(shouldSkipSystemThisStep(name, sim.state), true);
    sim.dispose();
  }
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
  sim.state.tick = 1;
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
  const ecology = ran.filter((row) => row.name === 'regionalEcology');
  assert.equal(physics.length, ticks);
  assert.equal(bark.length, 3);
  assert.equal(missions.length, 3);
  assert.deepEqual(bark.map((row) => row.tick), [1, CALENDAR_CLOCK_PERIOD_TICKS, CALENDAR_CLOCK_PERIOD_TICKS * 2]);
  // Straddled cohorts: regionalEcology (cohort 1) fires at tick%30===10, not the
  // cohort-0 tick — same 2 Hz cadence, a different phase.
  assert.equal(ecology.length, 3);
  assert.deepEqual(ecology.map((row) => row.tick), [1, 10, 40]);
  sim.dispose();
});

test('production combat order excludes calendar owners', () => {
  assert.ok(PRODUCTION_COMBAT_UPDATE_ORDER.includes('physics'));
  assert.ok(PRODUCTION_COMBAT_UPDATE_ORDER.includes('weapons'));
  assert.ok(PRODUCTION_COMBAT_UPDATE_ORDER.includes('npcJobsRuntime'));
  assert.ok(PRODUCTION_COMBAT_UPDATE_ORDER.includes('traffic'));
  assert.ok(PRODUCTION_COMBAT_UPDATE_ORDER.includes('heat'));
  assert.ok(PRODUCTION_COMBAT_UPDATE_ORDER.includes('survivalRun'));
  assert.ok(PRODUCTION_COMBAT_UPDATE_ORDER.includes('swarmChain'));
  assert.equal(PRODUCTION_COMBAT_UPDATE_ORDER.includes('barkDirector'), false);
  assert.equal(PRODUCTION_COMBAT_UPDATE_ORDER.includes('missions'), false);
  assert.equal(PRODUCTION_COMBAT_UPDATE_ORDER.includes('aftermathWrecks'), false);
  assert.equal(PRODUCTION_COMBAT_UPDATE_ORDER.includes('wingMorale'), false);
  assert.ok(PRODUCTION_COMBAT_UPDATE_ORDER.includes('combatOutcome'));
  assert.ok(PRODUCTION_COMBAT_UPDATE_ORDER.includes('cargo'));
  assert.equal(PRODUCTION_COMBAT_UPDATE_ORDER.includes('story'), false);
  assert.equal(PRODUCTION_COMBAT_UPDATE_ORDER.includes('terrainAnchors'), false);
  assert.ok(PRODUCTION_CALENDAR_UPDATE_ORDER.includes('terrainAnchors'));
  assert.ok(PRODUCTION_CALENDAR_UPDATE_ORDER.includes('jettisonImpulse'));
  assert.ok(PRODUCTION_CALENDAR_UPDATE_ORDER.includes('masslineImpactDamage'));
  assert.equal(PRODUCTION_COMBAT_UPDATE_ORDER.includes('bandRadio'), false);
  assert.equal(PRODUCTION_COMBAT_UPDATE_ORDER.includes('regionalEcology'), false);
  assert.equal(PRODUCTION_COMBAT_UPDATE_ORDER.includes('bountyHunt'), false);
  assert.equal(PRODUCTION_COMBAT_UPDATE_ORDER.includes('salvage'), false);
  assert.equal(PRODUCTION_COMBAT_UPDATE_ORDER.includes('liveCareerLadderBranches'), false);
  assert.ok(PRODUCTION_CALENDAR_UPDATE_ORDER.includes('barkDirector'));
  assert.ok(PRODUCTION_CALENDAR_UPDATE_ORDER.includes('missions'));
  assert.ok(PRODUCTION_CALENDAR_UPDATE_ORDER.includes('aftermathWrecks'));
  assert.ok(PRODUCTION_CALENDAR_UPDATE_ORDER.includes('wingMorale'));
  assert.ok(PRODUCTION_CALENDAR_UPDATE_ORDER.includes('encounterDirector'));
  assert.ok(PRODUCTION_CALENDAR_UPDATE_ORDER.includes('salvage'));
  assert.ok(PRODUCTION_CALENDAR_UPDATE_ORDER.includes('careerLadders'));
  assert.ok(PRODUCTION_CALENDAR_UPDATE_ORDER.includes('story'));
  assert.ok(PRODUCTION_CALENDAR_UPDATE_ORDER.includes('bandRadio'));
  assert.equal(
    PRODUCTION_COMBAT_UPDATE_ORDER.length + PRODUCTION_CALENDAR_UPDATE_ORDER.length,
    PRODUCTION_UPDATE_ORDER.length,
  );
  for (const id of PRODUCTION_CALENDAR_UPDATE_ORDER) {
    assert.equal(getSystemClock(id), SYSTEM_CLOCK.CALENDAR, id);
  }
});

test('production primary ticks iterate the combat queue, not calendar names', () => {
  const ran = [];
  const systems = [
    stub('physics', ran),
    stub('barkDirector', ran),
    stub('missions', ran),
    stub('npcJobsRuntime', ran),
  ];
  const partitions = partitionUpdateSystems(systems);
  const combatState = { runtime: { profileId: 'production' }, tick: 2, simCatchupIndex: 0 };
  const names = updateQueueForThisStep(partitions, combatState).map((s) => s.name);
  assert.deepEqual(names, ['physics', 'npcJobsRuntime']);
  const calendarState = { runtime: { profileId: 'production' }, tick: 30, simCatchupIndex: 0 };
  assert.deepEqual(
    updateQueueForThisStep(partitions, calendarState).map((s) => s.name),
    ['physics', 'barkDirector', 'missions', 'npcJobsRuntime'],
    'cohort-0 calendar owners run on tick%30===0',
  );
  const cohortOneState = { runtime: { profileId: 'production' }, tick: 40, simCatchupIndex: 0 };
  assert.deepEqual(
    updateQueueForThisStep(partitions, cohortOneState).map((s) => s.name),
    ['physics', 'npcJobsRuntime'],
    'no calendar cohort runs on tick%30===10 when every stub is cohort 0',
  );
  const straddled = partitionUpdateSystems([
    stub('physics', []),
    stub('economy', []),        // cohort 1 → tick%30===10
    stub('salvage', []),        // cohort 2 → tick%30===20
    stub('barkDirector', []),   // cohort 0 → tick%30===0
  ]);
  assert.deepEqual(
    updateQueueForThisStep(straddled, cohortOneState).map((s) => s.name),
    ['physics', 'economy'],
  );
  assert.deepEqual(
    updateQueueForThisStep(straddled, { runtime: { profileId: 'production' }, tick: 50, simCatchupIndex: 0 }).map((s) => s.name),
    ['physics', 'salvage'],
  );
  assert.deepEqual(
    updateQueueForThisStep(straddled, calendarState).map((s) => s.name),
    ['physics', 'barkDirector'],
  );
  const wakeState = { runtime: { profileId: 'production' }, tick: 2, simCatchupIndex: 0, clockWake: { calendar: true } };
  assert.deepEqual(
    updateQueueForThisStep(straddled, wakeState).map((s) => s.name),
    ['physics', 'economy', 'salvage', 'barkDirector'],
    'a calendar wake still runs every cohort',
  );
  const catchupState = { runtime: { profileId: 'production' }, tick: 30, simCatchupIndex: 1 };
  assert.deepEqual(
    updateQueueForThisStep(partitions, catchupState).map((s) => s.name),
    ['physics', 'barkDirector', 'missions'],
    'a due catch-up step still runs its authored calendar owners alongside table',
  );
  const nonDueCatchupState = { runtime: { profileId: 'production' }, tick: 31, simCatchupIndex: 1 };
  assert.deepEqual(
    updateQueueForThisStep(partitions, nonDueCatchupState).map((s) => s.name),
    ['physics'],
    'a non-due catch-up step remains table-only',
  );
});

test('production catch-up steps still fire every calendar owner on its authored tick phase', () => {
  for (const stepsPerFrame of [1, 2, 3, 4]) {
    const ran = [];
    const systems = [
      stub('physics', ran),
      stub('weapons', ran),
      stub('npcJobsRuntime', ran),
      stub('masslineHud', ran),
      ...CALENDAR_CLOCK_IDS.map((id) => stub(id, ran)),
    ];
    const sim = createSimulation({ seed: 1, systems });
    sim.state.runtime = { profileId: 'production' };
    sim.state.tick = 60;
    for (let i = 0; i < 600; i++) {
      sim.state.simCatchupIndex = i % stepsPerFrame;
      sim.step(1 / 60);
    }
    const byName = (name) => ran.filter((row) => row.name === name);
    assert.equal(byName('physics').length, 600, `fps ${60 / stepsPerFrame}: table runs every fixed step`);
    assert.equal(byName('weapons').length, 600, `fps ${60 / stepsPerFrame}: table runs every fixed step`);
    assert.equal(byName('npcJobsRuntime').length, 600 / stepsPerFrame, `fps ${60 / stepsPerFrame}: near owners run primary steps only`);
    assert.equal(byName('masslineHud').length, 600 / stepsPerFrame, `fps ${60 / stepsPerFrame}: glass owners run primary steps only`);
    for (const id of CALENDAR_CLOCK_IDS) {
      assert.equal(byName(id).length, 20, `fps ${60 / stepsPerFrame}: ${id} must fire once per 30-tick window even on catch-up steps`);
    }
    sim.dispose();
  }
});

test('a jittered catch-up sequence lands every calendar phase exactly once, never doubled or skipped', () => {
  const stepsPattern = [1, 2, 3, 4, 1, 3, 2];
  const ran = [];
  const systems = [
    stub('physics', ran),
    stub('npcJobsRuntime', ran),
    ...CALENDAR_CLOCK_IDS.map((id) => stub(id, ran)),
  ];
  const sim = createSimulation({ seed: 1, systems });
  sim.state.runtime = { profileId: 'production' };
  sim.state.tick = 60;
  let ticks = 0;
  for (let frame = 0; ticks < 600; frame++) {
    const stepsPerFrame = stepsPattern[frame % stepsPattern.length];
    for (let index = 0; index < stepsPerFrame && ticks < 600; index++) {
      sim.state.simCatchupIndex = index;
      sim.step(1 / 60);
      ticks += 1;
    }
  }
  const byName = (name) => ran.filter((row) => row.name === name);
  assert.equal(byName('physics').length, 600);
  assert.equal(byName('npcJobsRuntime').length, 263, 'near owners run once per presented frame');
  for (const id of CALENDAR_CLOCK_IDS) {
    assert.equal(byName(id).length, 20, `${id} missed a phase or ran twice`);
  }
  sim.dispose();
});

test('a due catch-up step preserves the original update order across table and calendar', () => {
  const ran = [];
  const sim = createSimulation({
    seed: 1,
    systems: [
      stub('physics', ran),
      stub('barkDirector', ran),
      stub('missions', ran),
      stub('npcJobsRuntime', ran),
    ],
  });
  sim.state.runtime = { profileId: 'production' };
  sim.state.tick = 29;
  sim.state.simCatchupIndex = 3;
  sim.step(1 / 60);
  assert.deepEqual(ran.map((row) => row.name), ['physics', 'barkDirector', 'missions']);
  sim.dispose();
});

test('skip helpers agree with the production catch-up queues on due, non-due, boot, wake and foreign hosts', () => {
  const partitions = partitionUpdateSystems([
    stub('physics', []),
    stub('barkDirector', []),
    stub('missions', []),
    stub('economy', []),
    stub('npcJobsRuntime', []),
  ]);
  const prod = (tick, catchupIndex, extra = {}) => ({
    runtime: { profileId: 'production' }, tick, simCatchupIndex: catchupIndex, ...extra,
  });
  assert.deepEqual(
    updateQueueForThisStep(partitions, prod(30, 1)).map((s) => s.name),
    ['physics', 'barkDirector', 'missions'],
    'due catch-up: cohort-0 owners run alongside table',
  );
  assert.equal(shouldSkipSystemThisStep('barkDirector', prod(30, 1)), false);
  assert.equal(shouldSkipSystemOnCatchup('barkDirector', prod(30, 1)), false);
  assert.equal(shouldRunSystemThisStep('barkDirector', prod(30, 1)), true);
  assert.deepEqual(
    updateQueueForThisStep(partitions, prod(31, 1)).map((s) => s.name),
    ['physics'],
    'non-due catch-up stays table-only',
  );
  assert.equal(shouldSkipSystemThisStep('missions', prod(31, 1)), true);
  assert.equal(shouldSkipSystemThisStep('economy', prod(31, 1)), true);
  assert.deepEqual(
    updateQueueForThisStep(partitions, prod(40, 2)).map((s) => s.name),
    ['physics', 'economy'],
    'a due calendar owner runs on an extra step at its authored phase',
  );
  assert.equal(shouldSkipSystemThisStep('economy', prod(40, 2)), false);
  assert.equal(shouldSkipSystemOnCatchup('economy', prod(40, 2)), false);
  assert.deepEqual(
    updateQueueForThisStep(partitions, prod(1, 1)).map((s) => s.name),
    ['physics', 'barkDirector', 'missions', 'economy'],
    'bootstrap ticks run the whole calendar even on catch-up',
  );
  assert.deepEqual(
    updateQueueForThisStep(partitions, prod(7, 1, { clockWake: { calendar: true } })).map((s) => s.name),
    ['physics', 'barkDirector', 'missions', 'economy'],
    'a calendar wake runs every owner even on catch-up',
  );
  assert.equal(shouldSkipSystemThisStep('economy', prod(7, 1, { clockWake: { calendar: true } })), false);
  assert.equal(shouldSkipSystemThisStep('npcJobsRuntime', prod(30, 1)), true, 'near owners never run on catch-up');
  const legacy = { runtime: { profileId: 'legacy47a' }, tick: 30, simCatchupIndex: 1 };
  assert.deepEqual(
    updateQueueForThisStep(partitions, legacy).map((s) => s.name),
    ['physics'],
    'legacy hosts keep table-only catch-up',
  );
  assert.equal(shouldSkipSystemThisStep('barkDirector', legacy), true);
  const unprofiled = { tick: 30, simCatchupIndex: 1 };
  assert.deepEqual(
    updateQueueForThisStep(partitions, unprofiled).map((s) => s.name),
    ['physics'],
    'unprofiled hosts keep table-only catch-up',
  );
  assert.equal(shouldSkipSystemThisStep('barkDirector', unprofiled), true);
});

test('legacy47a and unprofiled hosts still walk calendar every tick', () => {
  const ran = [];
  const sim = createSimulation({
    seed: 1,
    systems: [stub('physics', ran), stub('barkDirector', ran), stub('missions', ran)],
  });
  for (let i = 0; i < 5; i++) sim.step(1 / 60);
  assert.equal(ran.filter((row) => row.name === 'physics').length, 5);
  assert.equal(ran.filter((row) => row.name === 'barkDirector').length, 5);
  assert.equal(ran.filter((row) => row.name === 'missions').length, 5);
  sim.dispose();

  const partitions = partitionUpdateSystems([
    stub('physics', []),
    stub('barkDirector', []),
  ]);
  const legacyState = { runtime: { profileId: 'legacy47a' }, tick: 2, simCatchupIndex: 0 };
  assert.deepEqual(
    updateQueueForThisStep(partitions, legacyState).map((s) => s.name),
    ['physics', 'barkDirector'],
  );
});
