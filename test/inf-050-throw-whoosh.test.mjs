import test from 'node:test';
import assert from 'node:assert/strict';

import {
  THROW_WHOOSH,
  resolveThrowWhoosh,
  masslineEventsAreDistinct,
} from '../src/audio/masslineInstrument.js';
import { masslineThrow } from '../src/systems/masslineThrow.js';

// INF-050 — the throw whoosh bends with the line that let go: tension (strain/load) from
// the live tether snapshot shapes the release voice, and attach/release/break keep their
// distinct endings (a clean rated release never sounds like a snap).

test('INF-050: tension grades the whoosh inside its authored bounds', () => {
  const slack = resolveThrowWhoosh({ strain: 0, load: 0 });
  const taut = resolveThrowWhoosh({ strain: 1, load: 1 });
  assert.equal(slack.gain, THROW_WHOOSH.minGain);
  assert.equal(slack.rate, THROW_WHOOSH.minRate);
  assert.equal(taut.gain, THROW_WHOOSH.maxGain);
  assert.equal(taut.rate, THROW_WHOOSH.maxRate);
  const mid = resolveThrowWhoosh({ strain: 0.5, load: 0.5 });
  assert.ok(mid.gain > slack.gain && mid.gain < taut.gain);
  assert.ok(mid.rate > slack.rate && mid.rate < taut.rate);
});

test('INF-050: partial and missing telemetry degrade gracefully', () => {
  const strainOnly = resolveThrowWhoosh({ strain: 0.8 });
  assert.ok(strainOnly.tension > 0.5, 'one live channel still bends the voice');
  const loadOnly = resolveThrowWhoosh({ load: 0.2 });
  assert.ok(loadOnly.tension < 0.5);
  const legacy = resolveThrowWhoosh({});
  assert.equal(legacy.tension, 0.5, 'unknown line reads neutral, never silent');
  assert.ok(legacy.gain > THROW_WHOOSH.minGain && legacy.gain < THROW_WHOOSH.maxGain);
  const hot = resolveThrowWhoosh({ strain: 3, load: 9 });
  assert.equal(hot.gain, THROW_WHOOSH.maxGain, 'overload clamps at the authored ceiling');
  assert.equal(hot.rate, THROW_WHOOSH.maxRate);
  assert.ok(Object.isFrozen(legacy), 'receipts are frozen');
});

test('INF-050: attach, release, and break keep distinct endings', () => {
  const distinct = masslineEventsAreDistinct();
  assert.ok(distinct.recipes, 'every event owns its recipe');
  assert.ok(distinct.releaseVsBreak, 'release and break differ in recipe and caption');
});

function throwHost(tether, seen) {
  return {
    bus: { emit: (event, payload) => seen.push({ event, payload }) },
    registry: {
      get: () => ({ kernel: { attachments: { cut: () => ({ ok: true }) } } }),
    },
    state: null,
    _releaseAttemptTick: -1,
    _armAuthorized: false,
    _pendingSnap: null,
    _pendingReleaseValidation: null,
    _tetherForCue: tether,
  };
}

function throwState(tether, tick) {
  const player = {
    id: 1, alive: true, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 40, z: 0 },
  };
  return {
    tick,
    simTime: tick / 60,
    playerId: 1,
    player: { tether },
    entities: new Map([[1, player], [9, {
      id: 9, alive: true, type: 'asteroid', pos: { x: 30, z: 0 }, vel: { x: 120, z: 0 },
    }]]),
  };
}

const SOLUTION = {
  valid: true, errorRad: 0.01, tolRad: 0.05, payloadSpeed: 120, interceptAngle: 0.3,
  relativeSpeed: 80, missDistance: 2, clearance: 10, impactTime: 1.2, turnRate: 0,
};

function execute(tether, tick, payloadId) {
  const seen = [];
  const host = throwHost(tether, seen);
  const state = throwState(tether, tick);
  host.state = state;
  const player = state.entities.get(1);
  const payload = state.entities.get(9);
  const out = masslineThrow._executeThrow.call(
    host, state, player,
    { id: payloadId, pos: { x: 30, z: 0 }, vel: { x: 120, z: 0 } },
    { entity: payload }, SOLUTION, 'snap',
  );
  assert.equal(out, true, 'the stubbed cut must release');
  return seen;
}

test('INF-050: the throw cue carries the line tension it let go with', () => {
  const tautTether = {
    attachmentId: 'att-1', strain: 0.95, load: 0.9, active: true, phase: 'loaded',
  };
  const slackTether = {
    attachmentId: 'att-2', strain: 0.05, load: 0.1, active: true, phase: 'slack',
  };
  const tautCue = execute(tautTether, 100, 'p-taut')
    .find((e) => e.event === 'audio:cue' && e.payload.id === 'massline.throw');
  const slackCue = execute(slackTether, 200, 'p-slack')
    .find((e) => e.event === 'audio:cue' && e.payload.id === 'massline.throw');
  assert.ok(tautCue && slackCue, 'both releases voice the throw');
  const expectTaut = resolveThrowWhoosh({ strain: 0.95, load: 0.9 });
  const expectSlack = resolveThrowWhoosh({ strain: 0.05, load: 0.1 });
  assert.equal(tautCue.payload.gain, expectTaut.gain, 'taut line cracks at the shaped gain');
  assert.equal(tautCue.payload.rate, expectTaut.rate);
  assert.equal(slackCue.payload.gain, expectSlack.gain, 'slack line sighs at the shaped gain');
  assert.equal(slackCue.payload.rate, expectSlack.rate);
  assert.ok(tautCue.payload.gain > slackCue.payload.gain, 'tension orders the voice');
  assert.deepEqual(tautCue.payload.position, { x: 30, z: 0 }, 'position still rides along');
});
