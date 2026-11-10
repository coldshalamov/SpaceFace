// test/telemetry-funnels.test.mjs
// Tests for PQ-167 telemetry funnels and verb tracking.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createTelemetry } from '../src/systems/telemetry.js';

test('telemetry tracks core first-hour onboarding funnel milestones', () => {
  const bus = createBus();
  const state = createGameState(1401);
  state.playerId = 42;
  const telemetry = createTelemetry(bus, state);

  try {
    bus.emit('game:started', {});

    // Initial state: nothing reached (-1)
    let session = telemetry.getSessionStats();
    assert.equal(session.funnel.firstFlightAt, -1);
    assert.equal(session.funnel.firstSwingAt, -1);
    assert.equal(session.funnel.firstShoveAt, -1);
    assert.equal(session.funnel.firstDockAt, -1);
    assert.equal(session.funnel.firstHeatAt, -1);

    // 1. Flight: ship:thrust
    bus.emit('ship:thrust', { shipId: state.playerId, throttle: 0.8, reverse: 0, strafe: 0, boost: false });
    session = telemetry.getSessionStats();
    assert.ok(session.funnel.firstFlightAt >= 0, 'firstFlightAt marked from ship:thrust');
    assert.equal(session.verbs.thrust, 1, 'thrust verb incremented');

    // 2. Swing: tether:latched and tether:released
    bus.emit('tether:latched', { targetId: 99 });
    session = telemetry.getSessionStats();
    assert.ok(session.funnel.firstSwingAt >= 0, 'firstSwingAt marked from tether:latched');
    assert.equal(session.verbs.latch, 1, 'latch verb incremented');

    bus.emit('tether:released', { targetId: 99 });
    session = telemetry.getSessionStats();
    assert.equal(session.verbs.release, 1, 'release verb incremented');

    // 3. Shove: combat:fire with concussion slug
    bus.emit('combat:fire', { ownerId: state.playerId, weaponId: 'wpn_concussion_cannon_m', shove: true });
    session = telemetry.getSessionStats();
    assert.ok(session.funnel.firstShoveAt >= 0, 'firstShoveAt marked from concussion fire');
    assert.equal(session.verbs.shove, 1, 'shove verb incremented');
    assert.equal(session.verbs.fire, 1, 'fire verb incremented');

    // 4. Dock: dock:docked
    bus.emit('dock:docked', { stationId: 'station_helios' });
    session = telemetry.getSessionStats();
    assert.ok(session.funnel.firstDockAt >= 0, 'firstDockAt marked from dock:docked');
    assert.equal(session.verbs.dock, 1, 'dock verb incremented');

    // 5. Heat: heat:changed
    bus.emit('heat:changed', { value: 0.25, level: 'low' });
    session = telemetry.getSessionStats();
    assert.ok(session.funnel.firstHeatAt >= 0, 'firstHeatAt marked from heat:changed');

    // Verify getFunnel() API returns all milestones with reached: true
    const funnel = telemetry.getFunnel();
    const map = new Map(funnel.map((f) => [f.step, f]));

    for (const step of ['firstFlight', 'firstSwing', 'firstShove', 'firstDock', 'firstHeat']) {
      assert.ok(map.has(step), `getFunnel contains ${step}`);
      assert.equal(map.get(step).reached, true, `${step} is marked reached`);
      assert.ok(Number.isFinite(map.get(step).atMs), `${step} has non-negative atMs`);
    }
  } finally {
    telemetry.dispose();
  }
});

test('telemetry tracks physical verbs from various gameplay events', () => {
  const bus = createBus();
  const state = createGameState(1402);
  state.playerId = 100;
  const telemetry = createTelemetry(bus, state);

  try {
    bus.emit('game:started', {});

    // Flight verbs: brake & boost
    bus.emit('ship:thrust', { shipId: state.playerId, throttle: 0, reverse: 0.8, strafe: 0, boost: false });
    bus.emit('ship:boostStart', { shipId: state.playerId });
    bus.emit('ship:dash', { shipId: state.playerId });

    // Tether verbs
    bus.emit('tether:reel', { targetId: 200 });
    bus.emit('massline:selfSling', { speed: 250 });

    // Shove verbs: whip impact, repulsor
    bus.emit('tether:whipImpact', { force: 500 });
    bus.emit('fields:deployed', { sourceId: state.playerId, kind: 'repulsor' });
    bus.emit('fields:deployed', { sourceId: state.playerId, kind: 'well' });
    bus.emit('combat:shove', { impulse: 400 });

    // Trade & mine & jump
    bus.emit('economy:tradeCompleted', { side: 'sell', commodityId: 'cmdty_ore_common', qty: 10 });
    bus.emit('mining:yield', { commodityId: 'cmdty_ore_common', qty: 5 });
    bus.emit('jump:arrive', { sectorId: 'sector_ceres_belt' });

    // Direct verb recording
    telemetry.recordVerb('stroke', 4);
    telemetry.recordVerb('well', 2);

    const session = telemetry.getSessionStats();
    assert.equal(session.verbs.brake, 1);
    assert.equal(session.verbs.boost, 1);
    assert.equal(session.verbs.stroke, 5); // 1 from dash + 4 direct
    assert.equal(session.verbs.reel, 1);
    assert.equal(session.verbs.throw, 1);
    assert.equal(session.verbs.shove, 3); // whipImpact + fields:deployed repulsor + combat:shove
    assert.equal(session.verbs.well, 3); // 1 from fields:deployed well + 2 direct
    assert.equal(session.verbs.trade, 1);
    assert.equal(session.verbs.mine, 1);
    assert.equal(session.verbs.jump, 1);

    // Career stats aggregate verbs
    const career = telemetry.getCareerStats();
    assert.ok(career.verbs);
    assert.equal(career.verbs.brake, 1);
    assert.equal(career.verbs.boost, 1);
    assert.equal(career.verbs.stroke, 5);
  } finally {
    telemetry.dispose();
  }
});

test('telemetry edge-triggers flight verbs and avoids 60Hz tick inflation', () => {
  const bus = createBus();
  const state = createGameState(1404);
  state.playerId = 50;
  const telemetry = createTelemetry(bus, state);

  try {
    bus.emit('game:started', {});

    // Simulate 60 consecutive frames of holding forward throttle
    for (let i = 0; i < 60; i++) {
      bus.emit('ship:thrust', { shipId: state.playerId, throttle: 1.0, reverse: 0, strafe: 0, boost: false });
    }

    let session = telemetry.getSessionStats();
    assert.equal(session.verbs.thrust, 1, 'Holding thrust for 60 ticks only counts as 1 activation');

    // Release throttle
    bus.emit('ship:thrust', { shipId: state.playerId, throttle: 0.0, reverse: 0, strafe: 0, boost: false });
    session = telemetry.getSessionStats();
    assert.equal(session.verbs.thrust, 1, 'Releasing throttle does not add activation');

    // Press throttle again
    bus.emit('ship:thrust', { shipId: state.playerId, throttle: 0.8, reverse: 0, strafe: 0, boost: false });
    session = telemetry.getSessionStats();
    assert.equal(session.verbs.thrust, 2, 'Second distinct throttle press increments thrust activation to 2');
  } finally {
    telemetry.dispose();
  }
});

test('telemetry avoids double-counting tether release from tether:releaseRated', () => {
  const bus = createBus();
  const state = createGameState(1405);
  state.playerId = 60;
  const telemetry = createTelemetry(bus, state);

  try {
    bus.emit('game:started', {});
    bus.emit('tether:latched', { targetId: 101 });
    assert.equal(telemetry.getSessionStats().verbs.latch, 1);

    // tetherGameplay emits tether:released and then tether:releaseRated
    bus.emit('tether:released', { targetId: 101 });
    bus.emit('tether:releaseRated', { targetId: 101, grade: 'clean' });

    assert.equal(telemetry.getSessionStats().verbs.release, 1, 'Release verb must only increment once');
  } finally {
    telemetry.dispose();
  }
});

test('telemetry getAllSessions does not duplicate live session', () => {
  const bus = createBus();
  const state = createGameState(1406);
  state.playerId = 70;
  const telemetry = createTelemetry(bus, state);

  try {
    bus.emit('game:started', {});
    const sessions = telemetry.getAllSessions();
    const currentId = telemetry.sessionId;
    const matching = sessions.filter((s) => s.sessionId === currentId);
    assert.equal(matching.length, 1, 'Current session is present exactly once');
  } finally {
    telemetry.dispose();
  }
});

test('telemetry getSessionReport returns markdown and json', () => {
  const bus = createBus();
  const state = createGameState(1403);
  state.playerId = 77;
  const telemetry = createTelemetry(bus, state);

  try {
    bus.emit('game:started', {});
    bus.emit('ship:thrust', { shipId: state.playerId, throttle: 1, reverse: 0, strafe: 0 });
    bus.emit('tether:latched', { targetId: 50 });
    bus.emit('combat:shove', {});
    bus.emit('dock:docked', { stationId: 'station_alpha' });
    bus.emit('heat:changed', { value: 0.4 });

    const report = telemetry.getSessionReport();
    assert.ok(report);
    assert.ok(report.data);
    assert.ok(typeof report.markdown === 'string');
    assert.ok(report.markdown.includes('# SpaceFace Session Telemetry Report'));
    assert.ok(report.markdown.includes('First Flight'));
    assert.ok(report.markdown.includes('First Swing'));
    assert.ok(report.markdown.includes('First Shove'));
    assert.ok(report.markdown.includes('First Station Dock'));
    assert.ok(report.markdown.includes('First Heat'));

    assert.ok(report.json);
    assert.equal(report.json.funnel.coreReachedCount, 5);
    assert.equal(report.json.funnel.firstHourComplete, true);
  } finally {
    telemetry.dispose();
  }
});
