// A gate jump re-runs the live-sector cook, and that cook re-applies the OPENING's two publication
// guards: the authored upgrade queue hold and the opening graph publication freeze. The only thing
// that ever lifts them is the opening's one-shot latch, armed by `mode:changed -> 'loading'` and
// fired once by prepareFrame. A jump never returns to loading, so before this contract existed the
// guards were permanent after the first release: every authored body materialized in the arriving
// sector prepared and then parked, and the destination station stayed
// `presentationAdmission: 'pending'` for the rest of the session (headed Ceres probe, 2026-09-12:
// `station:pending` at +5 / +20 / +45 s of sim time after the jump).
//
// The re-arm alone was not enough. That one-shot latch is also the session's only call to
// `resumeDeferredPipelineAdmissions({ force: true })`, and firing it while
// `shouldDeferPipelineAutoFlush` still holds left the bounded-resume compile lane armed with no
// timer and no caller — a second, quieter deadlock with the same symptom. Both halves are pinned
// here: the release never lands inside the hold, and the lane survives it if it ever does.
//
// Headed proof: `node scripts/probe-sector-arrival-admission.mjs` (also `--teleport`, `--continue`,
// `--jump-at 0` for the arrival that lands inside the opening's first-flight window).
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FIRST_FLIGHT_DEFERRED_HOLD_SECONDS,
  SECTOR_ARRIVAL_PUBLISH_HOLD_SECONDS,
  armSectorArrivalPublishRelease,
  firstFlightDeferredReleaseSimTime,
  shouldReleaseFirstFlightDeferredHold,
} from '../src/render/renderer.js';
import { isLoadingHullUpgradeJob } from '../src/render/partsLibrary.js';
import { FIRST_FLIGHT_PIPELINE_HOLD_S } from '../src/render/pipelineAutoFlushPolicy.js';
import { createPipelineAdmissionTracker } from '../src/render/pipelineReadiness.js';

const flightOwner = (simTime, overrides = {}) => ({
  _firstFlightDeferredHold: true,
  state: {
    mode: 'flight',
    simTime,
    render: {
      resumeDeferredPipelineAdmissions: () => ({ skipped: true }),
      ...overrides,
    },
  },
});

test('the opening keeps the absolute first-flight publication window', () => {
  const owner = flightOwner(0);
  assert.equal(firstFlightDeferredReleaseSimTime(owner.state), FIRST_FLIGHT_DEFERRED_HOLD_SECONDS);
  assert.equal(shouldReleaseFirstFlightDeferredHold(owner), false);
  owner.state.simTime = FIRST_FLIGHT_DEFERRED_HOLD_SECONDS;
  assert.equal(shouldReleaseFirstFlightDeferredHold(owner), true);
});

test('the publication release and the pipeline auto-flush hold share one clock', () => {
  // The release is the session's only forced pipeline resume. If it can fire before the auto-flush
  // policy stops holding, that resume is spent on a lane that cannot flush yet.
  assert.equal(FIRST_FLIGHT_DEFERRED_HOLD_SECONDS, FIRST_FLIGHT_PIPELINE_HOLD_S);
});

test('a sector arrival re-arms the release against the arrival clock, not the absolute 20 s mark', () => {
  // The session is long past the opening window and the opening latch has already fired once.
  const owner = flightOwner(640);
  owner._firstFlightDeferredHold = false;
  assert.equal(shouldReleaseFirstFlightDeferredHold(owner), false,
    'the opening latch is a one-shot; without a re-arm the arrival guards would never lift');

  armSectorArrivalPublishRelease(owner);
  assert.equal(owner._firstFlightDeferredHold, true);
  assert.equal(
    firstFlightDeferredReleaseSimTime(owner.state),
    640 + SECTOR_ARRIVAL_PUBLISH_HOLD_SECONDS,
  );
  assert.equal(shouldReleaseFirstFlightDeferredHold(owner), false,
    'the guards still cover the arrival presents they exist for');

  owner.state.simTime = 640 + SECTOR_ARRIVAL_PUBLISH_HOLD_SECONDS;
  assert.equal(shouldReleaseFirstFlightDeferredHold(owner), true,
    'and they must lift a moment later, or the arriving sector never publishes');
});

test('an arrival inside the opening window never shortens it', () => {
  // Reachable: `--teleport`, the headed probe, and any run that reaches a gate early. Releasing at
  // arrival + 1.5 s here would spend the forced pipeline resume inside the auto-flush hold.
  const owner = flightOwner(6);
  armSectorArrivalPublishRelease(owner);
  assert.equal(firstFlightDeferredReleaseSimTime(owner.state), FIRST_FLIGHT_DEFERRED_HOLD_SECONDS);
  owner.state.simTime = FIRST_FLIGHT_DEFERRED_HOLD_SECONDS - 0.1;
  assert.equal(shouldReleaseFirstFlightDeferredHold(owner), false);
  owner.state.simTime = FIRST_FLIGHT_DEFERRED_HOLD_SECONDS;
  assert.equal(shouldReleaseFirstFlightDeferredHold(owner), true);
});

test('the arrival hold is short enough that the destination publishes while the player is looking', () => {
  assert.ok(SECTOR_ARRIVAL_PUBLISH_HOLD_SECONDS > 0,
    'the arrival presents still need the leftover-FX guard');
  assert.ok(SECTOR_ARRIVAL_PUBLISH_HOLD_SECONDS <= 5,
    'the headed bar is a published station within five seconds of arrival');
});

test('a fresh opening drops any leftover arrival deadline', () => {
  const owner = flightOwner(640);
  armSectorArrivalPublishRelease(owner);
  // mode:changed -> loading clears the deadline; a restored Continue clock must not inherit it.
  owner.state.render.firstFlightDeferredHoldUntil = null;
  assert.equal(firstFlightDeferredReleaseSimTime(owner.state), FIRST_FLIGHT_DEFERRED_HOLD_SECONDS);
});

test('the hulls-only cohort admits the destination station, not only ships', () => {
  const station = { type: 'station', data: { stationTypeId: 'trade_hub' } };
  assert.equal(isLoadingHullUpgradeJob({ entity: station }), true,
    'the station is the body the arriving player steers toward');
  assert.equal(isLoadingHullUpgradeJob({ entity: { type: 'ship' } }), true);
  assert.equal(isLoadingHullUpgradeJob({ entity: { isPlayer: true, type: 'wreck' } }), true);
  // Authored `fx` places are exactly the leftover compiles the cohort exists to defer.
  assert.equal(isLoadingHullUpgradeJob({ entity: { type: 'fx', data: { placeId: 'place_lane_pin' } } }), false);
  assert.equal(isLoadingHullUpgradeJob({ entity: { type: 'asteroid' } }), false);
  assert.equal(isLoadingHullUpgradeJob(null), false);
});

test('bounded resume armed inside the auto-flush hold still flushes when the hold lifts', async () => {
  // The measured deadlock (headed Ceres run, 2026-09-12): three queued compiles sat unflushed from
  // sim 4.2 to sim 47.9 with the hold long gone, because resumeAutoFlush() had cleared the timers,
  // set boundedResume, and returned. The only thing that could re-enter the lane was a new
  // compile() — and the next authored job was itself waiting on those three.
  let held = true;
  const compiled = [];
  const frames = [];
  const tracker = createPipelineAdmissionTracker(async (subjects) => {
    compiled.push(...subjects);
    return { compiled: subjects.length };
  }, {
    deferAutoFlush: () => held,
    scheduleResume: (callback) => { frames.push(callback); },
    resumeBatchSize: 4,
  });

  const pending = tracker.compile({ name: 'destination-station' });
  tracker.resumeAutoFlush();
  assert.ok(frames.length > 0, 'the lane must schedule a poll rather than go dead under the hold');

  frames.shift()();
  assert.deepEqual(compiled, [], 'nothing may compile while the hold is up');
  assert.ok(frames.length > 0, 'and the poll must re-arm itself');

  held = false;
  frames.shift()();
  await pending;
  assert.equal(compiled.length, 1, 'the queued compile flushes on the first frame after the hold');
});

test('a synchronous resume scheduler under the hold does not recurse', () => {
  // Test fakes and non-rAF hosts may run the scheduled callback inline. That must keep the old
  // stop-once behaviour instead of re-entering scheduleResumedBatch forever.
  let calls = 0;
  const tracker = createPipelineAdmissionTracker(() => ({ compiled: 0 }), {
    deferAutoFlush: () => true,
    scheduleResume: (callback) => { calls += 1; callback(); },
  });
  void tracker.compile({ name: 'held' });
  tracker.resumeAutoFlush();
  assert.ok(calls >= 1 && calls < 10, `synchronous scheduler must not recurse (calls=${calls})`);
});
