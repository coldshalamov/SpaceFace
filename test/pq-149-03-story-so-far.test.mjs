// PQ-149.03 — the ledger retells the session as "I was doing X, then Y, so I Z" with causes.
// Constructed state, seed 14930. Same projection the dock UI calls. No spawn, no dialogue tree.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  buildShipLedger,
  readStorySoFar,
  renderStorySoFar,
} from '../src/systems/shipLedger.js';
import {
  createTelemetry,
  renderStorySoFarFromRing,
} from '../src/systems/telemetry.js';

const SEED = 14930;

const PLANTED = Object.freeze({
  phase: 'quiet',
  cause: 'witness',
  beat: 'bounty',
});

const EXPECTED = Object.freeze({
  doing: 'quiet work',
  then: 'a bounty arrived',
  so: 'carry the bounty because of the witness',
});

const EXPECTED_PROSE = 'I was doing quiet work, then a bounty arrived, so I carry the bounty because of the witness.';

function plantedState() {
  return {
    meta: { seed: SEED },
    simTime: 40,
    encounterDirector: {
      sessionRhythm: { phase: PLANTED.phase, enteredAt: 0, dwellS: 40 },
      escalationSeeds: [{
        id: 'esc:witness:pq14903',
        cause: PLANTED.cause,
        beat: PLANTED.beat,
        causeId: 'pq14903',
        seededAt: 12,
        arrivedAt: 24,
        arrived: true,
        delayS: 12,
        place: {
          x: 800,
          z: -400,
          zoneId: 'zone_ceres_yards',
          name: 'Ceres yards',
        },
        playerAct: true,
      }],
    },
  };
}

test('PQ-149.03 seed 14930: blind reader retells from the ledger alone', () => {
  const state = plantedState();
  const before = JSON.stringify(state);

  const page = buildShipLedger(state, { page: 0, pageSize: 24 });
  assert.equal(JSON.stringify(state), before, 'buildShipLedger must stay a read-only projection');

  const cited = page.entries.filter((entry) => entry && entry.cause === PLANTED.cause);
  assert.equal(cited.length, 1, 'the planted cause must already be on the ledger');
  assert.equal(cited[0].beat, PLANTED.beat);
  assert.ok(cited[0].text.includes('because of the ' + PLANTED.cause), cited[0].text);

  const story = page.storySoFar;
  assert.ok(story, 'the dock-UI projection must carry storySoFar');
  assert.equal(story.prose, EXPECTED_PROSE);
  assert.equal(story.phase, PLANTED.phase);
  assert.equal(story.cause, PLANTED.cause);
  assert.equal(story.beat, PLANTED.beat);

  const fromState = renderStorySoFar(state);
  assert.equal(JSON.stringify(state), before, 'renderStorySoFar must not write state');
  assert.equal(fromState.prose, EXPECTED_PROSE);

  const snapshot = JSON.parse(JSON.stringify(page));
  const blind = readStorySoFar(snapshot);
  assert.deepEqual(blind, EXPECTED);
  assert.match(blind.doing, /quiet/);
  assert.match(blind.then, new RegExp(PLANTED.beat));
  assert.match(blind.so, new RegExp(`because of the ${PLANTED.cause}`));
  assert.equal(
    `I was doing ${blind.doing}, then ${blind.then}, so I ${blind.so}.`,
    EXPECTED_PROSE,
  );

  console.log('PQ-149.03 story so far', JSON.stringify({
    seed: SEED,
    planted: PLANTED,
    prose: story.prose,
    blind,
  }));
});

test('PQ-149.03 telemetry ring retells the same causes without the sim', () => {
  const bus = createBus();
  const state = plantedState();
  const telemetry = createTelemetry(bus, state);
  try {
    bus.emit('rhythm:phase', { phase: PLANTED.phase, simTime: 0, dwellS: 40 });
    bus.emit('escalation:arrived', {
      cause: PLANTED.cause,
      beat: PLANTED.beat,
      arrivedAt: 24,
    });

    const fromRing = renderStorySoFarFromRing(telemetry.getRecentEvents());
    const fromApi = telemetry.getStorySoFar();
    const blind = readStorySoFar(fromRing);

    assert.deepEqual(blind, EXPECTED);
    assert.equal(fromRing.prose, EXPECTED_PROSE);
    assert.deepEqual(readStorySoFar(fromApi), EXPECTED);
  } finally {
    telemetry.dispose();
  }
});
