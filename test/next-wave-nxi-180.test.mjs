// NXI-180 — a revised clue observation qualifies ONLY the affected route suggestion.
//
// NXB-045's clue book stamps a revised reading (stale fix / contradicted manifest) with route
// advice. This file pins the missions-side consumer:
//   1. when the live course was authored by missions for a tracked job (waypoint carries a
//      missionId), a scan that revises a clue re-qualifies that course's suggestion sentence
//      through the clue's route advice — the old suggestion does not keep speaking;
//   2. the waypoint's identity (pos, label, missionId) is untouched, and the unrelated tracked
//      job in the log is byte-identical after the pulse;
//   3. nothing is auto-accepted: active count, statuses, and ui.trackedMissionId hold;
//   4. counterexamples: a scanner-laid course (no missionId) is not touched, an old superseded
//      clue re-pulsed (observedAt ≠ scannedAt) does not re-qualify, a clue-less scan does
//      nothing, and a repeat of the same qualification is idempotent.
//
// Fixed seed 4242; the sim boots the real missions system on the real bus.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { missions } from '../src/systems/missions.js';

const SEED = 4242;

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [missions] });
  const { state } = sim;
  state.mode = 'flight';
  state.simTime = 40;
  state.onboarding = { active: false, finished: true };
  state.nav = state.nav || {};
  state.ui = state.ui || {};
  state.missions = state.missions || { active: [], boards: {} };
  return sim;
}

function missionCourse() {
  return {
    kind: 'mission',
    missionId: 'm_delivery',
    missionType: 'cargo_delivery',
    label: 'Berth 3',
    missionTitle: 'Haul the sample',
    reason: 'Deliver 12u Iron Ore to Berth 3',
    stationId: 'station_helios',
    sectorId: 'sector_helios_prime',
    pos: { x: 1410, z: -310 },
  };
}

function revisedClue({ subjectId, status, scannedAt, reason, observedAt }) {
  return {
    id: `signal:${subjectId}`,
    kind: 'ship',
    clue: {
      subjectId,
      kind: 'manifest',
      claim: 'manifest mismatch',
      observedAt: observedAt != null ? observedAt : scannedAt,
      pos: { x: 800, z: 40 },
      route: { action: 'inspect', pos: { x: 800, z: 40 }, reason },
      history: [{ claim: 'declared civilian cargo', status: status || 'contradicted', at: 5, pos: { x: 200, z: 0 } }],
    },
  };
}

test('a revised clue re-qualifies the tracked mission course suggestion, and only it', () => {
  const sim = boot();
  const { state, bus } = sim;
  const wp = missionCourse();
  state.nav.waypoint = wp;
  state.ui.trackedMissionId = 'm_delivery';
  const unrelated = { id: 'm_other', status: 'active', title: 'Repair the dish', objectiveProgress: 1 };
  state.missions.active = [{ id: 'm_delivery', status: 'active', title: 'Haul the sample' }, unrelated];
  const unrelatedBefore = JSON.stringify(unrelated);

  bus.emit('signal:scanResults', {
    sectorId: 'sector_helios_prime',
    scannedAt: 41,
    signals: [revisedClue({
      subjectId: 'manifest:7',
      scannedAt: 41,
      reason: 'Contradicted reading — inspect the hold directly.',
    })],
  });
  assert.equal(wp.reason, 'Contradicted reading — inspect the hold directly.',
    'the affected course now carries the revised observation advice');
  assert.equal(wp.missionId, 'm_delivery', 'the course still belongs to the same job');
  assert.equal(wp.label, 'Berth 3', 'the destination label is untouched');
  assert.deepEqual(wp.pos, { x: 1410, z: -310 }, 'the course does not hijack to the clue fix');
  assert.equal(JSON.stringify(unrelated), unrelatedBefore, 'the unrelated tracked job is unchanged');
  assert.equal(state.missions.active.length, 2, 'no mission was auto-accepted or removed');
  assert.equal(state.ui.trackedMissionId, 'm_delivery', 'the tracked selection holds');
});

test('counterexamples: scanner courses, stale clues, clue-less pulses, and repeats stay out', () => {
  const sim = boot();
  const { state, bus } = sim;

  // A scanner-laid signal course has no missionId — the scanner owns moving it, not missions.
  const signalCourse = {
    kind: 'signal', label: 'VESSEL SIGNATURE', reason: 'Investigate vessel signature',
    pos: { x: 200, z: 0 }, targetEntityId: 9,
  };
  state.nav.waypoint = signalCourse;
  bus.emit('signal:scanResults', {
    sectorId: 'sector_helios_prime',
    scannedAt: 42,
    signals: [revisedClue({ subjectId: 'manifest:7', scannedAt: 42, reason: 'Stale fix — intercept the last sighting on this bearing.' })],
  });
  assert.equal(signalCourse.reason, 'Investigate vessel signature', 'a non-mission course is untouched');

  // A mission course with an OLD superseded clue re-pulsed: observedAt ≠ scannedAt → no change.
  const wp = missionCourse();
  state.nav.waypoint = wp;
  bus.emit('signal:scanResults', {
    sectorId: 'sector_helios_prime',
    scannedAt: 50,
    signals: [revisedClue({
      subjectId: 'manifest:7', scannedAt: 50, observedAt: 12,
      reason: 'Contradicted reading — inspect the hold directly.',
    })],
  });
  assert.equal(wp.reason, 'Deliver 12u Iron Ore to Berth 3', 'an already-superseded reading does not re-qualify');

  // An ordinary clue-less scan pulse leaves the suggestion alone.
  bus.emit('signal:scanResults', {
    sectorId: 'sector_helios_prime',
    scannedAt: 51,
    signals: [{ id: 'signal:plain', kind: 'cache', detail: 'Cache return unresolved.' }],
  });
  assert.equal(wp.reason, 'Deliver 12u Iron Ore to Berth 3', 'a clue-less pulse changes nothing');

  // The real qualification is idempotent: a second identical revision keeps one sentence.
  bus.emit('signal:scanResults', {
    sectorId: 'sector_helios_prime',
    scannedAt: 52,
    signals: [revisedClue({ subjectId: 'manifest:7', scannedAt: 52, reason: 'Contradicted reading — inspect the hold directly.' })],
  });
  bus.emit('signal:scanResults', {
    sectorId: 'sector_helios_prime',
    scannedAt: 53,
    signals: [revisedClue({ subjectId: 'manifest:7', scannedAt: 53, reason: 'Contradicted reading — inspect the hold directly.' })],
  });
  assert.equal(wp.reason, 'Contradicted reading — inspect the hold directly.');
});

test('a stale-fix observation qualifies through the parent intercept advice', () => {
  const sim = boot();
  const { state, bus } = sim;
  const wp = missionCourse();
  state.nav.waypoint = wp;
  state.ui.trackedMissionId = 'm_delivery';
  bus.emit('signal:scanResults', {
    sectorId: 'sector_helios_prime',
    scannedAt: 60,
    signals: [revisedClue({
      subjectId: 'shipment:lane', status: 'stale', scannedAt: 60,
      reason: 'Stale fix — intercept the last sighting on this bearing.',
    })],
  });
  assert.match(wp.reason, /Stale fix/, 'the suggestion names the changed circumstance');
  assert.match(wp.reason, /intercept/i);
  assert.equal(state.ui.trackedMissionId, 'm_delivery', 'still the same tracked job — nothing accepted behind the player');
});
