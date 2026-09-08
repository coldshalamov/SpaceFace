// PQ-149.00 — session rhythm model. Existing directors read one gate reason: `'rhythm'`.
// Compressed clock + real gate functions. Fixed seed. No 90-minute playthrough.

import assert from 'node:assert/strict';
import test from 'node:test';

import { DirectorPhase } from '../src/ai/contracts.js';
import { EncounterDirector, publishSessionRhythmPhase } from '../src/ai/director.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  SESSION_RHYTHM_MAX_DWELL_S,
  SESSION_RHYTHM_PHASES,
  advanceSessionRhythm,
  encounterDirector,
  encounterPacingBlockReason,
} from '../src/systems/encounterDirector.js';
import { stationSideEventDirector } from '../src/systems/stationSideEventDirector.js';
import { createTelemetry } from '../src/systems/telemetry.js';

const SEED = 14900;

function combatShape() {
  return { id: 'pq149_combat', deck: 'combat', tier: 'minor', pressureCost: 0 };
}

function civilShape() {
  return { id: 'pq149_civil', deck: 'civilian', tier: 'ambient', pressureCost: 0 };
}

function openDir(phase) {
  return {
    pending: [],
    live: {},
    pressure: { combat: 100, civilian: 100 },
    window: [],
    cooldowns: {},
    lastMeaningfulAt: -1e9,
    lastAmbientAt: -1e9,
    lastMajorAt: -1e9,
    lastEndAt: -1e9,
    sessionRhythm: phase ? { phase, enteredAt: 0, dwellS: 0 } : null,
  };
}

function openState(docked = false) {
  return {
    player: { flags: { docked } },
    onboarding: { active: false, finished: true },
    ui: {},
  };
}

function collectTimeline(endAt = 800, step = 15) {
  const dir = openDir(null);
  const state = openState(false);
  const timeline = [];
  for (let now = 0; now <= endAt; now += step) {
    const row = advanceSessionRhythm(dir, state, now);
    if (row.changed || timeline.length === 0) {
      timeline.push({ simTime: now, phase: row.phase, dwellS: row.dwellS });
    }
  }
  return timeline;
}

test('PQ-149.00 combat shapes are blocked in quiet, aftermath, and work', () => {
  const state = openState();
  const now = 400;
  for (const phase of ['quiet', 'aftermath', 'work']) {
    const reason = encounterPacingBlockReason(openDir(phase), state, combatShape(), now);
    assert.equal(reason, 'rhythm', `combat in ${phase} must defer with reason rhythm`);
  }
  assert.equal(
    encounterPacingBlockReason(openDir('quiet'), state, civilShape(), now),
    null,
    'civilian/ambient life may still run in quiet',
  );
});

test('PQ-149.00 combat is legal in violence', () => {
  const reason = encounterPacingBlockReason(openDir('violence'), openState(), combatShape(), 400);
  assert.equal(reason, null);
});

test('PQ-149.00 no phase dwells longer than 12 minutes', () => {
  const held = openDir('violence');
  held.live = { fight: { deck: 'combat', phase: 'fight' } };
  const still = advanceSessionRhythm(held, openState(), SESSION_RHYTHM_MAX_DWELL_S - 1);
  assert.equal(still.phase, 'violence', 'live combat may hold violence until the cap');
  const flipped = advanceSessionRhythm(held, openState(), SESSION_RHYTHM_MAX_DWELL_S);
  assert.equal(flipped.phase, 'aftermath', 'violence must leave at the 12-minute cap');

  for (const phase of SESSION_RHYTHM_PHASES) {
    const dir = openDir(phase);
    const out = advanceSessionRhythm(dir, openState(phase === 'work'), SESSION_RHYTHM_MAX_DWELL_S);
    assert.notEqual(out.phase, phase, `${phase} must not remain after a 12-minute jump`);
  }
});

test('PQ-149.00 compressed clock visits every phase and telemetry records a change', () => {
  const timeline = collectTimeline();
  const seen = timeline.map((row) => row.phase);
  for (const phase of SESSION_RHYTHM_PHASES) {
    assert.ok(seen.includes(phase), `compressed clock must visit ${phase}: ${seen.join(' → ')}`);
  }
  console.log('PQ-149.00 phase timeline', JSON.stringify(timeline));

  const bus = createBus();
  const state = createGameState(SEED);
  state.mode = 'flight';
  const telemetry = createTelemetry(bus, state);
  const director = Object.create(encounterDirector);
  director.init({ state, bus, helpers: {} });
  try {
    state.simTime = 0;
    director.update(1, state);
    const first = telemetry.getRecentEvents().filter((event) => event.type === 'rhythm:phase');
    assert.ok(first.length >= 1, 'first rhythm tick must print a phase');
    assert.ok(Number.isFinite(first[0].data.simTime));
    assert.ok(typeof first[0].data.phase === 'string');
    assert.ok(Number.isFinite(first[0].data.dwellS));

    const started = state.encounterDirector.sessionRhythm.phase;
    state.encounterDirector.sessionRhythm.enteredAt = -SESSION_RHYTHM_MAX_DWELL_S;
    state.simTime = 1;
    director.update(1, state);
    const events = telemetry.getRecentEvents().filter((event) => event.type === 'rhythm:phase');
    const change = events.find((event) => event.data.phase !== started);
    assert.ok(change, `telemetry must record a phase change from ${started}`);
    assert.equal(typeof change.data.phase, 'string');
    assert.ok(Number.isFinite(change.data.simTime));
    assert.ok(Number.isFinite(change.data.dwellS));
    console.log('PQ-149.00 telemetry phase change', JSON.stringify(change.data));
  } finally {
    publishSessionRhythmPhase(null);
    telemetry.dispose();
  }
});

test('PQ-149.00 station director defers combat-ish events in quiet; cosmetics may run', () => {
  const bus = createBus();
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.encounterDirector = openDir('quiet');
  state.stationSideEvents = {
    accum: 0,
    plannedKeys: {},
    pending: [
      { eventId: 'sse:patrol', kind: 'patrol_launch', budget: 1, stationId: 'dock-a', dueAt: 10 },
      { eventId: 'sse:drone', kind: 'repair_drone', budget: 0, stationId: 'dock-a', dueAt: 10, path: 'hull-crawl', durationS: 90, bearing: 0 },
    ],
    anchorId: 'dock-a',
    nextFireAt: 0,
    active: {},
  };
  const station = { id: 'dock-a', pos: { x: 0, z: 0 }, data: { stationTypeId: 'trade_hub' } };
  const director = Object.create(stationSideEventDirector);
  director.init({ state, bus, helpers: {} });
  const fired = [];
  bus.on('station:sideEvent', (payload) => fired.push(payload));
  director._pump(state, station, 12);
  assert.equal(state.stationSideEvents.pending[0].eventId, 'sse:patrol');
  assert.equal(state.stationSideEvents.pending[0].dueAt, 12 + 15);
  director._pump(state, station, 12);
  assert.equal(fired.length, 1);
  assert.equal(fired[0].kind, 'repair_drone');
  director.destroy();
});

test('PQ-149.00 tactical director keeps RESPITE and will not reinforce in quiet/aftermath', () => {
  try {
    for (const phase of ['quiet', 'aftermath']) {
      const director = new EncounterDirector({
        config: { freezeResults: false, respiteMinTicks: 1, respiteMaxTicks: 2 },
      });
      director.state.phase = DirectorPhase.BUILD;
      director.state.phaseTick = 200;
      director.state.reinforcementBudget = 4;
      director.state.reinforcementCooldown = 0;
      const result = director.update(1, {
        visibleThreat: 1,
        hostileContacts: 6,
        objectiveProgress: 1,
      }, { sessionPhase: phase });
      assert.equal(result.phase, DirectorPhase.RESPITE, `${phase} must hold tactical RESPITE`);
      assert.notEqual(result.command.type, 'request_reinforcement');
      assert.equal(director.state.lastDecision, 'hold_phase');
    }

    publishSessionRhythmPhase('quiet');
    const live = new EncounterDirector({
      config: { freezeResults: false, respiteMinTicks: 1, respiteMaxTicks: 2 },
    });
    live.state.phase = DirectorPhase.BUILD;
    live.state.reinforcementBudget = 4;
    live.state.reinforcementCooldown = 0;
    const published = live.update(2, { visibleThreat: 1, hostileContacts: 6 }, {});
    assert.equal(published.phase, DirectorPhase.RESPITE, 'published live phase must hold RESPITE');
    assert.notEqual(published.command.type, 'request_reinforcement');
  } finally {
    publishSessionRhythmPhase(null);
  }
});
