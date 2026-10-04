// A second launch while one is booked speaks once, through the run's denial cue.
// The facility receipt stays silent so the two lines cannot fight for the voice floor.
import test from 'node:test';
import assert from 'node:assert/strict';

import { heistFacilities } from '../src/systems/heistFacilities.js';
import { heistMissionRuntime } from '../src/missions/heistMissionRuntime.js';

function world() {
  const said = [];
  const scene = [];
  const missionCues = [];
  const facilities = Object.assign(Object.create(heistFacilities), {
    state: {
      mode: 'flight',
      tick: 4,
      simTime: 10,
      heistFacilities: {
        schedule: {
          scheduleId: 'live-throw',
          launchAtSimT: 100,
          receipt: { accepted: true, scheduleId: 'live-throw' },
        },
      },
    },
    bus: {
      emit(name, payload) {
        if (name === 'heist:launchCue') scene.push(payload);
      },
    },
  });
  const ctx = {
    state: facilities.state,
    bus: { emit(name, payload) { if (name === 'heist:missionCue') missionCues.push(payload); } },
    helpers: { voice: { say(line) { said.push(line); } } },
    registry: { get(name) { return name === 'heistFacilities' ? facilities : null; } },
  };
  return { facilities, ctx, said, scene, missionCues };
}

function record(scheduleId) {
  return {
    scheduleRequested: false,
    settled: false,
    launchWindowS: 30,
    scheduleId,
    missionId: 'm-busy',
    cues: {},
  };
}

test('a second launch request says the launcher is committed, once, and the pad stays silent', () => {
  const { facilities, ctx, said, scene, missionCues } = world();
  const run = record('other');
  const first = heistMissionRuntime.requestSchedule(ctx, run);
  const second = heistMissionRuntime.requestSchedule(ctx, run);
  assert.equal(first.accepted, false);
  assert.equal(first.reason, 'active_schedule');
  assert.equal(second, null);
  assert.equal(said.length, 1);
  assert.equal(said[0].text, 'Launcher is already committed — wait for this throw');
  assert.equal(said[0].id, 'pq019c:capsule-run');
  assert.equal(said[0].priority, 100);
  assert.equal(scene.length, 0);
  assert.equal(missionCues.length, 1);
  assert.equal(missionCues[0].moment, 'denied');
  assert.equal(facilities.state.heistFacilities.schedule.scheduleId, 'live-throw');
});

test('a docked denial does not speak, and a later flight denial still can', () => {
  const { ctx, said, scene } = world();
  ctx.state.mode = 'docked';
  const docked = record('docked-try');
  heistMissionRuntime.requestSchedule(ctx, docked);
  assert.equal(said.length, 0);
  assert.equal(scene.length, 0);
  assert.equal(docked.cues.denied, true);

  ctx.state.mode = 'flight';
  const flying = record('flight-try');
  flying.missionId = 'm-flight';
  heistMissionRuntime.requestSchedule(ctx, flying);
  assert.equal(said.length, 1);
  assert.equal(said[0].text, 'Launcher is already committed — wait for this throw');
});
