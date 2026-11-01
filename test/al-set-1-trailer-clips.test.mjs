import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrailerClipCollector } from '../src/sim/trailerClipTape.js';
import { createTrailerCameraLease } from '../src/sim/trailerClipTape.js';
import { sealTheaterTape } from '../src/sim/theaterTape.js';
import { decodeKillcamTape } from '../src/sim/killcamTape.js';
import { createReplayEnvironment } from '../src/render/replayEnvironment.js';
import { createSimulation } from '../src/core/sim.js';
import { killReplay } from '../src/systems/killReplay.js';
import { createTrailerStaging } from '../src/render/trailerStaging.js';
import { insertDressingRow } from '../src/world/dressingTable.js';
import { installFlightFootage } from '../src/ui/screens/flightFootage.js';
import { TRAILER_MOMENTS, trailerMomentMatches } from '../src/data/trailerMoments.js';
import { buildKillcamStage } from '../src/render/killcamStage.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { installVisualOverrides } from '../src/render/visualOverrides.js';
import * as THREE from 'three';

const frame = (tick) => ({ tick, poses: [{ id: 'pilot', type: 'ship', x: tick, z: 0 },
  { id: 'cathedral', type: 'fx', x: 300, z: 0, visualData: { placeId: 'place_landmark_wreck_cathedral' } }],
  lines: [], fields: [] });
function recording(tick) { return { seed: 4242, playerId: 'pilot', poseFrames: Array.from(
  { length: Math.min(300, tick / 6 + 1) }, (_, i, rows) => frame(Math.max(0, tick - 1794) + i * 6)) }; }

test('set-piece marker seals thirty real seconds, exact sound timestamps and authored place metadata', () => {
  let requested, ready;
  const pcm = { left: new Float32Array([0.1]), right: new Float32Array([0.2]), sampleRate: 48000 };
  const collector = createTrailerClipCollector({ audioWindow(a, b) { requested = [a, b]; return pcm; }, onReady(c) { ready = c; } });
  const first = recording(120);
  assert.ok(collector.mark({ id: 'cathedral', title: 'Wreck Cathedral', tick: 120 }, first));
  first.poseFrames[10].poses[1].visualData.placeId = 'foreign-change';
  for (let tick = 126; tick <= 1860; tick += 6) collector.note(recording(tick));
  assert.ok(ready);
  assert.deepEqual(requested, [60, 1860]);
  assert.equal(ready.seconds, 30);
  assert.equal(ready.recording.poseFrames.length, 301);
  assert.equal(ready.recording.poseFrames[0].poses[1].visualData.placeId, 'place_landmark_wreck_cathedral');
  assert.equal(ready.pcm, pcm);
  assert.equal(ready.hideUI, true);
  assert.equal(ready.recording.poseFrames.at(-1).tick - ready.recording.poseFrames[0].tick, 1800);
  const tape = sealTheaterTape(ready.recording);
  assert.equal((tape.samples - 1) / tape.sampleRate, 30, 'inclusive endpoints preserve thirty full seconds');
  assert.equal(tape.ships.find((ship) => ship.id === 'cathedral').visualData.placeId, 'place_landmark_wreck_cathedral');
  const camera = createTrailerCameraLease(tape, { ...ready, entityId: 'cathedral', camera: { zoom: 0.18, seconds: 3 } });
  assert.deepEqual(camera.frameAt(120).focus, { x: 300, z: 0 });
  assert.ok(camera.frameAt(120).zoom > camera.frameAt(300).zoom, 'arrival beat settles from the wide establishing shot');
  const movingTape = { ...tape, ships: [{ id: 'tanker', radius: 60, b: 0, n: 2, x: [0, 900], z: [0, 0] },
    { id: 'pilot', player: true, b: 0, n: 2, x: [0, -900], z: [0, 0] }] };
  const movingCamera = createTrailerCameraLease(movingTape, { entityId: 'tanker', momentTick: 0 });
  assert.ok(movingCamera.frameAt(1800).zoom <= 360, 'the departing tanker remains readable when the pilot falls behind');
});

test('default Adventure inactive run shell stages a real recorded landmark and keeps it ahead of small rocks', () => {
  const sim = createSimulation({ seed: 4242, systems: [killReplay] });
  try {
    const state = sim.state;
    state.mode = 'flight'; state.run = { kind: 'survival', phase: 'inactive' };
    state.world.currentSectorId = 'sector_ceres_belt';
    const pilot = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 6, data: { defId: 'ship_kestrel' } });
    state.playerId = pilot.id;
    for (let i = 1; i < 20; i++) sim.spawn({ type: 'asteroid', pos: { x: i, z: i }, radius: 3 });
    const landmark = sim.spawn({ type: 'fx', pos: { x: 300, z: 0 }, radius: 3, data: {
      worldSiteId: 'world_site_wreck_cathedral', placeId: 'place_landmark_wreck_cathedral', visualRadius: 360, landmark: true,
    } });
    sim.step(); sim.step(); sim.step(); sim.step(); sim.step(); sim.step();
    const pose = state.replay.recording.poseFrames.at(-1).poses.find((row) => row.id === String(landmark.id));
    assert.ok(pose, 'nearer small rocks cannot evict the visited landmark');
    assert.equal(pose.radius, 360);
    assert.equal(pose.visualData.placeId, 'place_landmark_wreck_cathedral');
    let marker;
    sim.bus.on('setPiece:staged', (value) => { marker = value; });
    createTrailerStaging(state, sim.bus).step({ pushZoom() {} });
    assert.equal(marker.id, 'wreck_cathedral');
    assert.deepEqual(marker.position, { x: 300, z: 0 });
  } finally { killReplay.destroy(); sim.dispose(); }
});

test('static one-off dressing is staged and retained without promoting it to a combat entity', () => {
  const toll = TRAILER_MOMENTS.find((row) => row.id === 'oneoff_toll_saint_box');
  assert.equal(trailerMomentMatches(toll, { type: 'payload', data: { kind: 'cargo', worldOneOff: true,
    oneOffId: toll.id, name: 'Tally Plate' } }), false, 'a collectable offering is not the set-piece structure');
  assert.equal(trailerMomentMatches(toll, { type: 'fx', data: { worldOneOff: true, name: toll.source.name } }), true);
  const sim = createSimulation({ seed: 4242, systems: [killReplay] });
  try {
    const state = sim.state;
    state.mode = 'flight'; state.run = { kind: 'survival', phase: 'inactive' };
    state.world.currentSectorId = 'sector_helios_prime';
    const pilot = sim.spawn({ type: 'ship', pos: { x: 0, z: 0 }, data: { defId: 'ship_kestrel' } });
    state.playerId = pilot.id;
    const place = insertDressingRow(state, { pos: { x: 60, z: 0 }, radius: 75,
      data: { worldOneOff: true, oneOffId: 'oneoff_great_tanker', placeId: 'place_great_tanker' } });
    for (let i = 0; i < 6; i++) sim.step();
    assert.equal(state.entities.has(place.id), false);
    const pose = state.replay.recording.poseFrames.at(-1).poses.find((row) => row.id === String(place.id));
    assert.equal(pose.visualData.oneOffId, 'oneoff_great_tanker');
    let marker;
    sim.bus.on('setPiece:staged', (value) => { marker = value; });
    createTrailerStaging(state, sim.bus).step({ pushZoom() {} });
    assert.equal(marker?.id, 'oneoff_great_tanker');
    assert.equal(marker.entityId, place.id);
  } finally { killReplay.destroy(); sim.dispose(); }
});

test('worker pose mirror retains forces and scene metadata before a pixel encoder starts', () => {
  const saved = { document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
    setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval };
  let poll, footage;
  try {
    globalThis.setInterval = (fn) => { poll = fn; return 1; };
    globalThis.clearInterval = () => {};
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: false,
      addEventListener() {}, removeEventListener() {},
      createElement() { return { getContext: () => ({ drawImage() {} }) }; } } });
    const sample = { ...frame(60), scene: { sectorId: 'sector_the_bolus', simTime: 1,
      bolusFlags: { 'bolus:crestHoldUntil': 4 } },
      lines: [{ id: 'rope', ax: 1 }], fields: [{ id: 'field', center: { x: 1, z: 2 }, dir: { x: 0, z: 1 } }] };
    const state = { mode: 'flight', tick: 60, meta: { seed: 4242 }, playerId: 'pilot', render: {},
      replay: { latestPoseSample: sample } };
    footage = installFlightFootage({ on: () => () => {} }, { stateOf: () => state });
    poll();
    const recorded = footage.recording();
    assert.equal(footage.ring.frames.length, 0);
    assert.equal(recorded.playerId, 'pilot');
    assert.equal(recorded.poseFrames[0].scene.sectorId, 'sector_the_bolus');
    sample.scene.bolusFlags['bolus:crestHoldUntil'] = 99;
    sample.lines[0].ax = 90; sample.fields[0].center.x = 90;
    assert.equal(recorded.poseFrames[0].scene.bolusFlags['bolus:crestHoldUntil'], 4);
    assert.equal(recorded.poseFrames[0].lines[0].ax, 1);
    assert.equal(recorded.poseFrames[0].fields[0].center.x, 1);
  } finally {
    footage?.dispose();
    if (saved.document) Object.defineProperty(globalThis, 'document', saved.document); else delete globalThis.document;
    globalThis.setInterval = saved.setInterval; globalThis.clearInterval = saved.clearInterval;
  }
});

test('ordinary Kiln uses its measured Forge body and replay preserves authored prop scale', async () => {
  const kiln = { type: 'payload', radius: 23, data: { storyPropKind: 'runaway_kiln' } };
  assert.equal(resolvePlaceFileForEntity(kiln), 'wholeships/kilnback.glb');
  let admitted;
  const factory = installVisualOverrides({ build() { throw new Error('Generic payload must not be selected'); } }, {
    authoredPlaceBuilder(entity) { admitted = entity; return new THREE.Group(); },
  });
  factory.build(kiln);
  assert.equal(admitted, kiln, 'the ordinary renderer routes the actual payload through authored-place admission');
  assert.equal(kiln.type, 'payload'); assert.equal(kiln.radius, 23);
  const bell = { type: 'beacon', radius: 12, data: { storyPropKind: 'eighth_bell' } };
  assert.equal(resolvePlaceFileForEntity(bell), 'places/place_aftermath_deb_ore_freighter_drive_bell.glb');
  factory.build(bell);
  assert.equal(admitted, bell);
  assert.equal(bell.type, 'beacon'); assert.equal(bell.radius, 12);

  const sim = createSimulation({ seed: 4242, systems: [] });
  let stage;
  try {
    const source = { seed: 4242, ticks: 7, absoluteBaseTick: 0, playerId: 'bell', poseFrames: [0, 6].map((tick) => ({
      tick, poses: [{ id: 'bell', type: 'beacon', radius: 12, x: 0, z: 0,
        visualData: { storyPropKind: 'signal_marker' } }], lines: [], fields: [] })) };
    const built = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(42, 16 / 9), clock: 0 };
    stage = await buildKillcamStage(built, {}, { tape: sealTheaterTape(source) });
    stage.update(built, 0, sim.state);
    const object = stage.roots[0].getObjectByName('UiStageKillcamFleet').children[0];
    stage.roots[0].updateWorldMatrix(true, true);
    const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
    assert.ok(Math.abs(Math.max(size.x, size.y, size.z) - 24 * .35) < .001,
      'the 12-WU prop must not shrink twelve times when its authored root scale is normalized');
    const throat = TRAILER_MOMENTS.find((row) => row.id === 'bolus_throat');
    const lease = createTrailerCameraLease(sealTheaterTape(source), { position: { x: 0, z: 0 },
      camera: throat.camera, momentTick: 0 });
    assert.ok(lease.frameAt(0).zoom >= 650);
    assert.equal(lease.frameAt(0).pitch, .55, 'view the vertical iris obliquely rather than edge-on from above');
  } finally { stage?.dispose(); sim.dispose(); }
});

test('Bolus replay uses the production throat at recorded time and flags, and disposes its own scene', () => {
  const tape = { schema: 'spaceface.killcamTape.v1', seed: 4242, sampleRate: 10, samples: 301,
    ships: [{ id: 'pilot', player: true, b: 0, d: -1, n: 2, x: [0, 1], z: [0, 1], r: [0, 0] }], rounds: [], flashes: [],
    scenes: [{ sample: 0, sectorId: 'sector_the_bolus', simTime: 40, bolusFlags: { 'bolus:crestHoldUntil': 44 } },
      { sample: 10, sectorId: 'sector_the_bolus', simTime: 41, bolusFlags: {} }] };
  const before = JSON.stringify(tape);
  const root = new THREE.Group(), stage = createReplayEnvironment(root, tape, decodeKillcamTape(tape));
  assert.ok(root.getObjectByName('SF_BolusCanal'), 'the real throat geometry is admitted before compile');
  assert.ok(root.getObjectByName('SF_BolusLanternShafts'));
  stage.update(12);
  assert.equal(JSON.stringify(tape), before);
  stage.dispose();
  assert.equal(root.children.length, 0);
});

test('collection refuses duplicate markers and missing footage, and holds bounded pending/sealed windows', () => {
  const collector = createTrailerClipCollector();
  assert.equal(collector.mark({ id: 'empty', tick: 0 }, { poseFrames: [] }), false);
  for (let i = 0; i < 3; i++) assert.equal(collector.mark({ id: `visit${i}`, tick: 120 }, recording(120)), true);
  assert.equal(collector.mark({ id: 'visit0', tick: 120 }, recording(120)), false);
  assert.equal(collector.mark({ id: 'overflow', tick: 120 }, recording(120)), false);
  for (let tick = 126; tick <= 1860; tick += 6) collector.note(recording(tick));
  assert.deepEqual(collector.census(), { pending: 0, sealed: 2, poseFrames: 0 });
  assert.equal(collector.list()[0].soundtrack, 'unavailable', 'silence cannot impersonate recorded sound');
  const retained = collector.list()[0].id;
  assert.equal(collector.remove(retained), true);
  assert.equal(collector.list().length, 1);
  assert.equal(collector.remove(retained), false);
  collector.clear();
  assert.equal(collector.list().length, 0);
  const gapped = createTrailerClipCollector();
  gapped.mark({ id: 'missing', tick: 120 }, recording(120));
  gapped.note(recording(2400));
  assert.equal(gapped.list().length, 0, 'a missing middle never becomes a certified clip');
});
