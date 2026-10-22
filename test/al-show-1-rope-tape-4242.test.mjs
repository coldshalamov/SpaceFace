import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createBus } from '../src/core/eventBus.js';
import { canonicalStringify, snapshotSimState } from '../src/core/simSnapshot.js';
import { createSimulation } from '../src/core/sim.js';
import { killReplay } from '../src/systems/killReplay.js';
import { createForceTapeRecorder, FORCE_TAPE_MAX_LINES, FORCE_TAPE_MAX_FIELDS } from '../src/sim/forceTape.js';
import { killcamRecorder, takeKillcamTape, decodeKillcamTape, clearKillcamTape, killcamStageRequestFor,
  killcamPlaybackTime, killcamSessionCensus } from '../src/sim/killcamTape.js';
import { buildKillcamStage } from '../src/render/killcamStage.js';
import { gameOverScreen } from '../src/ui/screens/gameOver.js';

function fixture() {
  const sim = createSimulation({ seed: 4242, systems: [killReplay, killcamRecorder] });
  const state = sim.state;
  state.mode = 'flight';
  state.run = { kind: 'survival', phase: 'inactive' }; // the default Adventure run shell
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 10000, z: 20000 }, radius: 6 });
  const target = sim.spawn({ type: 'ship', team: 1, pos: { x: 10060, z: 20000 }, radius: 5 });
  player.data = { defId: 'ship_kestrel' }; target.data = { defId: 'ship_kestrel' };
  state.playerId = player.id;
  state.player.tether = { active: true, targetId: target.id, attachmentId: 'rope',
    tensionEstimate: 0.75, load: 0.8, restLength: 60 };
  state.combat.attachments = { byId: { rope: { id: 'rope', defId: 'tether_standard', state: 'active',
    ownerId: player.id, targetId: target.id, restLength: 60,
    sourceAnchorLocal: { x: 2, z: 0 }, targetAnchorLocal: { x: -3, z: 0 } } } };
  state.fields = { active: [] };
  return { sim, state, player, target, bus: sim.bus };
}

function throwAndDie(world) {
  const { state, sim, target, player, bus } = world;
  for (let tick = 1; tick <= 300; tick++) {
    target.pos.x = 10060 + (tick > 180 ? (tick - 180) * 2 : 0);
    target.pos.z = 20000 + Math.sin(tick / 30) * 12;
    if (tick === 180) {
      state.player.tether.active = false;
      state.combat.attachments.byId.rope.state = 'released';
    }
    state.fields.active = tick >= 120 && tick <= 140 ? [{ id: 'pulse', kind: 'repulsor',
      center: { x: 10000, z: 20000 }, dir: { x: 1, z: 0 }, radius: 90, engaged: true }] : [];
    sim.step();
  }
  player.alive = false;
  bus.emit('player:death', { recoverable: true });
  return takeKillcamTape();
}

test('4242: a latched swing, release, and field pulse round-trip through both bounded tapes', () => {
  const world = fixture();
  try {
    const tape = throwAndDie(world), recording = world.state.replay.recording;
    const latched = recording.forceRing.read(120);
    assert.equal(latched.lines.length, 1);
    assert.equal(latched.lines[0].ax, 10002, 'actual rotated socket, not the hull centre');
    assert.equal(latched.lines[0].bx, 10057);
    assert.ok(Math.abs(latched.lines[0].tension - 0.75) < 1e-6);
    assert.equal(latched.fields[0].kind, 'repulsor');
    assert.equal(recording.forceRing.read(200).lines.length, 0, 'release is recorded');
    assert.ok(recording.poseFrames.some((f) => f.lines.length && f.fields.length), 'serializable pose leaf carries force channels');
    const film = decodeKillcamTape(tape);
    assert.ok(tape.ships.find((ship) => ship.player).d >= 0, 'the synchronous death receipt closes the player track');
    assert.ok(film.forces.some((f) => f.lines.length && f.fields.length));
    assert.equal(film.forces.at(-1).lines.length, 0);
    const thrown = film.ships.find((row) => !row.ship.player);
    assert.ok(thrown.poseAt(film.total - 1).x > thrown.poseAt(90).x + 100, 'thrown hull keeps its recorded path');
    assert.deepEqual(gameOverScreen.stage({ state: world.state }), { scene: 'adventure-killcam' });
    assert.equal(killcamStageRequestFor({ ...world.state, settings: { video: { motionReduce: true } } }), null);
    world.state.tick += 600;
    killcamRecorder.update(1 / 60, world.state);
    assert.equal(takeKillcamTape(), tape, 'frozen/dead frames cannot extend a sealed death');
    world.bus.emit('player:respawn', {});
    assert.equal(killcamStageRequestFor(world.state), null, 'a recovery clears the previous defeat');
  } finally { killcamRecorder.destroy(); clearKillcamTape(); }
});

test('force channels overwrite a fixed window and never retain live gameplay records', () => {
  const world = fixture(), recorder = createForceTapeRecorder(4);
  try {
    recorder.note(world.state, 0);
    const sealed = recorder.read(0);
    world.target.pos.x += 100;
    world.state.player.tether.tensionEstimate = 1.5;
    assert.equal(sealed.lines[0].bx, 10057);
    assert.equal(sealed.lines[0].tension, 0.75);
    world.state.fields.active = Array.from({ length: 100 }, (_, id) => ({ id,
      kind: 'well', center: { x: id, z: 0 }, radius: 20 }));
    for (let i = 1; i <= 100; i++) recorder.note(world.state, i);
    assert.equal(recorder.capacity, 4);
    assert.equal(recorder.read(0), null);
    const latest = recorder.read(100);
    assert.ok(latest.lines.length <= FORCE_TAPE_MAX_LINES);
    assert.equal(latest.fields.length, FORCE_TAPE_MAX_FIELDS);
    assert.equal(recorder.encode(0, 100).length, 4);
    recorder.clear();
    assert.equal(recorder.read(100), null);
  } finally { killcamRecorder.destroy(); clearKillcamTape(); }
});

test('adventure recorder and its render playback leave the authoritative sim snapshot unchanged', async () => {
  const world = fixture();
  let stage;
  try {
    const hashBefore = canonicalStringify(snapshotSimState(world.state));
    killReplay.update(1 / 60, world.state);
    killcamRecorder.update(1 / 60, world.state);
    assert.equal(canonicalStringify(snapshotSimState(world.state)), hashBefore);
    const tape = throwAndDie(world);
    const before = canonicalStringify(snapshotSimState(world.state));
    const built = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(42, 16 / 9), clock: 0 };
    const geometry = new THREE.BoxGeometry(6, 2, 4), material = new THREE.MeshBasicMaterial();
    const io = { async loadPart() { return { primitives: [{ name: 'hull', geometry, material, matrix: new THREE.Matrix4() }] }; } };
    stage = await buildKillcamStage(built, io);
    assert.equal(stage.ready, true);
    assert.equal(stage.tape, tape);
    stage.update(built, 1 / 60);
    built.clock = 2;
    stage.update(built, 1 / 60);
    const forceGroup = stage.roots[0].getObjectByName('SF_NpcMasslineCables');
    assert.ok(forceGroup.children.some((child) => child.visible), 'the shared rope renderer poses the recorded latch');
    assert.ok(Math.abs(built.camera.position.x) < 150, 'adventure coordinates are centred into stage space');
    built.clock = 10;
    stage.update(built, 1 / 60);
    const camera = built.camera.matrixWorld.clone(), position = built.camera.position.clone();
    const poses = stage.roots[0].getObjectByName('UiStageKillcamFleet').children.map((h) => h.position.clone());
    built.clock = 30;
    stage.update(built, 1 / 60);
    assert.ok(built.camera.position.equals(position));
    assert.ok(built.camera.matrixWorld.equals(camera));
    const endPoses = stage.roots[0].getObjectByName('UiStageKillcamFleet').children;
    assert.ok(endPoses.every((h, i) => h.position.equals(poses[i])), 'final frame holds');
    assert.equal(killcamPlaybackTime(), decodeKillcamTape(tape).seconds);
    assert.equal(canonicalStringify(snapshotSimState(world.state)), before);
    stage.dispose(); stage = null; geometry.dispose(); material.dispose();
  } finally { stage?.dispose(); killcamRecorder.destroy(); clearKillcamTape(); }
});

test('missing tape keeps the plain plate and repeated init does not retain subscriptions', () => {
  clearKillcamTape();
  assert.equal(gameOverScreen.stage({ state: { mode: 'flight' } }), null);
  const state = { mode: 'menu', tick: 0 }, bus = createBus();
  killcamRecorder.init({ state, bus });
  killcamRecorder.init({ state, bus });
  killcamRecorder.destroy();
  assert.equal(killcamSessionCensus().ships, 0);
  clearKillcamTape();
});
