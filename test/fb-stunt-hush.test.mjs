// FB-082 — the best moment gets the room. A razor-rated massline release or a slingshot apex
// admits the capital-depth stunt hush (0.35 s attack, steep release) and stamps the shared
// camera record the same tick: push-zoom plus a hold for the hush's own envelope. Clean-band
// releases get neither; one room per six seconds at most; reduced motion keeps the hush and
// the freeze but drops the zoom. No trauma, no particles, release-rating law untouched.
// Deterministic — seed 4242 is the ear fixture seed.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  audio,
  admitStuntHush,
  HUSH,
  STUNT_HUSH_GAP_MS,
} from '../src/audio/audioSystem.js';
import {
  CHASE_ZOOM_DEFAULT,
  createChaseCamera,
  resolveStuntHushCameraCue,
  STUNT_HUSH_BEAT_HOLD_S,
  STUNT_HUSH_BEAT_ZOOM,
} from '../src/render/camera.js';

const SEED = 4242;

function stuntState({ motionReduce = false } = {}) {
  if (!globalThis.window) globalThis.window = { innerWidth: 1600, innerHeight: 900 };
  const player = {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 14, maxSpeed: 172.07,
  };
  return {
    playerId: player.id,
    tick: 120,
    simTime: 10,
    entities: new Map([[player.id, player]]),
    player: { tether: { active: false, targetId: null } },
    camera: { zoom: CHASE_ZOOM_DEFAULT, tilt: 60, lookAhead: 0, lerp: 6, trauma: 0 },
    settings: { video: { fov: 50, motionReduce } },
    render: {},
    world: { frameOrigin: { x: 0, z: 0 }, frameOriginSeq: 0 },
    input: { aimWorld: null },
  };
}

function audioHost(state) {
  const hushes = [];
  const played = [];
  const host = Object.create(audio);
  host.rt = {};
  host.state = state;
  host.play = (id, opts = {}) => { played.push({ id, ...opts }); return { id }; };
  host._triggerHush = (input) => { hushes.push(input); };
  host._emitPresentationCaption = () => {};
  return { host, hushes, played };
}

test('admission is razor-release or apex only, one room per six seconds', () => {
  assert.equal(SEED, 4242);
  assert.equal(STUNT_HUSH_GAP_MS, 6000, 'one room per six seconds');
  // The two doors: a razor-rated release and the slingshot apex.
  assert.equal(admitStuntHush({ classification: 'razor' }).play, true);
  assert.equal(admitStuntHush({ apex: true }).play, true);
  assert.equal(admitStuntHush({ cueId: 'massline.slingshotApex' }).play, true);
  assert.equal(admitStuntHush({ classification: 'razor' }).kind, 'stunt');
  // The clean band — and every lesser band — gets the room shut.
  for (const band of ['clean', 'good', 'messy', '', null]) {
    assert.equal(admitStuntHush({ classification: band }).play, false,
      `a ${band} release must not hush`);
  }
  assert.equal(admitStuntHush({}).play, false);
  // The six-second limiter.
  assert.equal(admitStuntHush({ classification: 'razor', nowMs: 10000, lastMs: 7000 }).play, false);
  assert.equal(
    admitStuntHush({ classification: 'razor', nowMs: 10000, lastMs: 7000 }).reason, 'gap',
  );
  assert.equal(admitStuntHush({ classification: 'razor', nowMs: 13001, lastMs: 7000 }).play, true);
  // The apex and the razor share the one limiter — they are the same room, not two budgets.
  const afterRazor = admitStuntHush({ apex: true, nowMs: 11000, lastMs: 10000 });
  assert.equal(afterRazor.play, false, 'an apex cannot reopen the room a razor just took');
});

test('the stunt hush is capital-depth with the authored attack and a steep release', () => {
  assert.equal(HUSH.stunt.depth, HUSH.capital.depth, 'the room sinks to capital depth');
  assert.equal(HUSH.stunt.attackS, 0.35, 'the 0.35 s attack');
  assert.equal(HUSH.stunt.releaseS, 0.45, 'the steep return');
  assert.ok(HUSH.stunt.holdS > 0, 'the silence holds, it does not pass through');
  assert.ok(STUNT_HUSH_BEAT_HOLD_S > 0 && STUNT_HUSH_BEAT_ZOOM > 0);
});

test('a razor release hushes and stamps the camera record the same tick', () => {
  const state = stuntState();
  const { host, hushes } = audioHost(state);
  host._onMasslineInstrument('release', { classification: 'razor', pos: { x: 0, z: 0 } });
  assert.deepEqual(hushes.map((h) => h.kind), ['stunt'], 'the razor release takes the room');
  const stamp = state.camera.stuntHushBeat;
  assert.ok(stamp, 'the same admission must stamp the camera record');
  assert.equal(stamp.kind, 'stunt');
  assert.equal(stamp.tick, state.tick, 'the beat is stamped on the same tick as the hush');
  const envelope = HUSH.stunt.attackS + HUSH.stunt.holdS + HUSH.stunt.releaseS;
  assert.equal(stamp.holdS, envelope, 'the hold is the hush’s own envelope');
  // A clean release gets neither room nor stamp.
  delete state.camera.stuntHushBeat;
  host._onMasslineInstrument('release', { classification: 'clean', pos: { x: 0, z: 0 } });
  assert.equal(hushes.length, 1, 'a clean release adds no hush');
  assert.equal(state.camera.stuntHushBeat, undefined, 'a clean release stamps nothing');
});

test('the slingshot apex takes the same room, and the six-second limiter holds', () => {
  const state = stuntState();
  const { host, hushes } = audioHost(state);
  host._onCue('massline.slingshotApex');
  assert.deepEqual(hushes.map((h) => h.kind), ['stunt'], 'the apex hushes');
  assert.equal(state.camera.stuntHushBeat.tick, state.tick, 'apex stamps the same tick');
  // A second apex three sim-seconds later hits the limiter — no hush, no restamp.
  state.simTime += 3;
  state.tick += 180;
  host._onCue('massline.slingshotApex');
  assert.equal(hushes.length, 1, 'the second apex inside six seconds is refused');
  assert.equal(state.camera.stuntHushBeat.tick, 120, 'a refused admission never restamps');
  // Past the gap the room opens again — on its own tick.
  state.simTime += 4;
  state.tick = 480;
  host._onMasslineInstrument('release', { classification: 'razor' });
  assert.equal(hushes.length, 2, 'the room reopens after six seconds');
  assert.equal(state.camera.stuntHushBeat.tick, 480, 'the new room restamps its own tick');
});

test('the camera consumes the stamp once — push-zoom plus a held frame', () => {
  const state = stuntState();
  const cam = createChaseCamera(state);
  cam.snapToPlayer();
  state.camera.stuntHushBeat = { kind: 'stunt', tick: 120, holdS: 1.08 };
  cam.follow(1 / 60);
  const push = cam.zoomDiagnostics().pushZoom;
  assert.ok(push > 0, `the release push widens the frame (pushZoom ${push})`);
  assert.ok(cam.holdRemaining() > 0, 'the frame is held for the hush');
  assert.equal(cam.stuntHushLog().length, 1);
  // The stamp is consumed once — further frames in the window never re-beat.
  for (let i = 0; i < 10; i += 1) cam.follow(1 / 60);
  assert.equal(cam.stuntHushLog().length, 1, 'one admission, one beat');
  // A stale stamp — a hush from several ticks ago — is swallowed, never a late zoom.
  state.tick = 200;
  state.camera.stuntHushBeat = { kind: 'stunt', tick: 150, holdS: 1.08 };
  const pushBefore = cam.zoomDiagnostics().pushZoom;
  for (let i = 0; i < 5; i += 1) cam.follow(1 / 60);
  assert.equal(cam.stuntHushLog().length, 1, 'a stale stamp never fires');
  assert.equal(cam.zoomDiagnostics().pushZoom <= pushBefore + 1e-6, true,
    'no late push-zoom may appear');
});

test('reduced motion keeps the hush and the freeze but drops the zoom', () => {
  // The cue law itself: reduced motion removes the zoom, never the hold.
  const reduced = resolveStuntHushCameraCue({ kind: 'stunt', tick: 5, holdS: 1.08 }, true);
  assert.equal(reduced.zoom, false, 'reduced motion drops the zoom');
  assert.equal(reduced.zoomFactor, 0);
  assert.ok(reduced.holdS > 0, 'the freeze is not vestibular motion — it survives reduce');
  const full = resolveStuntHushCameraCue({ kind: 'stunt', tick: 5, holdS: 1.08 }, false);
  assert.equal(full.zoom, true);
  assert.equal(full.zoomFactor, STUNT_HUSH_BEAT_ZOOM);
  // A non-stunt stamp resolves to nothing.
  assert.equal(resolveStuntHushCameraCue({ kind: 'other', tick: 5 }, false).tick, null);
  assert.equal(resolveStuntHushCameraCue(null, false).tick, null);
  // The live camera under reduce: the hush is admitted (audio side is motion-blind), the
  // beat applies its hold, and no push-zoom is scheduled.
  const state = stuntState({ motionReduce: true });
  const { host, hushes } = audioHost(state);
  host._onMasslineInstrument('release', { classification: 'razor' });
  assert.equal(hushes.length, 1, 'the hush itself is kept under reduced motion');
  const cam = createChaseCamera(state);
  cam.snapToPlayer();
  cam.follow(1 / 60);
  assert.equal(cam.zoomDiagnostics().pushZoom, 0, 'no zoom under reduced motion');
  assert.ok(cam.holdRemaining() > 0, 'the freeze still lands');
  const beat = cam.stuntHushLog()[0];
  assert.equal(beat.zoom, false);
});
