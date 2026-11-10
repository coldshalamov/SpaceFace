import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootageRing, FLIGHT_FOOTAGE_LIMITS } from '../src/ui/screens/flightFootage.js';
import { resolveClipFrames } from '../src/ui/screens/clipExport.js';
import { killReplay, ADVENTURE_POSE_ACTORS } from '../src/systems/killReplay.js';
import { fromAdventureTape } from '../src/presentation/momentMachine/ingest.js';
import { replayFrameAt, replayTapeEvents } from '../src/ui/screens/replay.js';

test('actual-pixel ring enforces duration, cadence count and byte limits', () => {
  const ring = createFootageRing({ seconds: 2, fps: 2, maxBytes: 100 });
  for (let i = 0; i < 20; i++) ring.push({ tick: i * 30, blob: new Blob([new Uint8Array(30)]) });
  assert.equal(ring.frames.length, 3); assert.equal(ring.bytes, 90);
  assert.deepEqual(ring.window(500, 560).map((frame) => frame.tick), [510, 540]);
  assert.equal(ring.push({ tick: 540, blob: new Blob(['repeat']) }), false);
  ring.clear(); assert.equal(ring.bytes, 0); assert.equal(ring.frames.length, 0);
  assert.equal(FLIGHT_FOOTAGE_LIMITS.seconds * FLIGHT_FOOTAGE_LIMITS.fps, 300);
});

test('a marked window cannot stand in for recorded flight pixels', () => {
  assert.equal(resolveClipFrames({ startTick: 30, endTick: 90, label: 'Kill' }), null);
});

test('rated moments seek inside an absolute captured replay window', () => {
  const marks = replayTapeEvents({ ticks: 120, absoluteBaseTick: 9000, events: [] },
    { list: () => [{ kind: 'kill', momentTick: 9060, label: 'Kill' }] });
  assert.deepEqual(marks, [{ tick: 60, type: 'kill', label: 'Kill' }]);
});

test('authoritative poses are bounded, copied, absolute and available to Moment/Replay', () => {
  const handlers = new Map();
  const bus = { on(event, fn) { handlers.set(event, fn); return () => handlers.delete(event); } };
  const entities = new Map(Array.from({ length: 50 }, (_, id) => [id, { id, alive: true, type: 'ship',
    pos: { x: id * 5, z: 0 }, rot: 0, data: {} }]));
  const state = { mode: 'flight', tick: 9000, meta: { seed: 18 }, playerId: 0, entities, entityList: [...entities.values()] };
  killReplay.init({ state, bus });
  for (let i = 0; i < 2000; i++) { state.tick++; killReplay.update(1 / 60, state); }
  const recording = state.replay.recording;
  assert.equal(recording.poseFrames.length, 300);
  assert.equal(state.replay.latestPoseSample.poses.length, ADVENTURE_POSE_ACTORS);
  const capturedX = state.replay.latestPoseSample.poses[0].x;
  entities.get(0).pos.x = 777;
  assert.equal(state.replay.latestPoseSample.poses[0].x, capturedX);
  assert.doesNotThrow(() => JSON.stringify(state.replay.latestPoseSample));
  handlers.get('entity:killed')({ killerId: 0, id: 1 });
  assert.equal(state.replay.latestPoseSample.events[0].absoluteTick, state.tick);
  const stream = fromAdventureTape(recording);
  assert.equal(stream.positionSource, 'tape-samples'); assert.ok(stream.samples.length <= 3600);
  assert.equal(stream.events[0].tick, state.tick);
  assert.ok(replayFrameAt(recording, 20).poses.length);
  handlers.get('game:new')();
  assert.equal(recording.poseFrames.length, 0); assert.equal(state.replay.latestPoseSample, undefined);
  killReplay.destroy(); assert.equal(handlers.size, 0);
});
