import assert from 'node:assert/strict';
import test from 'node:test';
import { sealTheaterTape } from '../src/sim/theaterTape.js';
import { createTheaterSession } from '../src/ui/screens/theaterSession.js';
import { createReplayAudioRing, createReplayAudioPlayback } from '../src/audio/replayAudioTape.js';
import { captionSidecar, captionVtt } from '../src/presentation/momentMachine/captions.js';
import { decodeKillcamTape } from '../src/sim/killcamTape.js';
import { encodeTheaterVideo } from '../src/ui/screens/theaterExport.js';
import * as THREE from 'three';
import { buildKillcamStage } from '../src/render/killcamStage.js';
import { canonicalStringify, snapshotSimState } from '../src/core/simSnapshot.js';
import { createSimulation } from '../src/core/sim.js';

function recording() {
  return { seed: 4242, ticks: 181, tickRate: 60, absoluteBaseTick: 120, playerId: 'pilot',
    events: [{ tick: 90, type: 'kill', label: 'Ship destroyed',
      actors: [{ id: 'victim', generation: 0, role: 'subject' }, { id: 'pilot', generation: 0, role: 'actor' }],
      position: { x: 10150, z: 20020 } }],
    poseFrames: Array.from({ length: 31 }, (_, i) => ({ tick: 120 + i * 6,
      poses: [{ id: 'pilot', tick: 120 + i * 6, generation: 0, player: true, type: 'ship',
        visual: 'ship_kestrel', radius: 6, x: 10000 + i * 3, z: 20000, heading: i * 0.1 },
      { id: 'victim', tick: 120 + i * 6, generation: 0, type: 'ship', team: 1,
        visual: 'ship_kestrel', radius: 5, x: 10060 + i * 6, z: 20020, heading: 0 }],
      lines: i < 15 ? [{ id: 'rope', sourceId: 'pilot', targetId: 'victim', ax: 10000 + i * 3,
        az: 20000, bx: 10060 + i * 6, bz: 20020, tension: 0.75, load: 0.8, restLength: 90 }] : [],
      fields: [],
    })),
  };
}

test('theater seals pose/force values and interpolates at display cadence without a simulation', () => {
  const source = recording(), tape = sealTheaterTape(source), film = decodeKillcamTape(tape);
  assert.equal(tape.sampleRate, 10);
  assert.equal(tape.ships[0].visual, 'ship_kestrel');
  assert.equal(tape.forces[14].lines.length, 1);
  assert.equal(tape.forces[15].lines.length, 0);
  const first = film.ships[0].poseAt(1), halfway = film.ships[0].poseAt(1.5), second = film.ships[0].poseAt(2);
  assert.ok(halfway.x > first.x && halfway.x < second.x, 'display frames interpolate between tape samples');
  source.poseFrames[0].poses[0].x = -999;
  source.poseFrames[0].lines[0].load = 0;
  assert.equal(tape.ships[0].x[0], 10000);
  assert.ok(tape.forces[0].lines[0].load > 0.7);
});

test('theater scrub and photo camera are UI data, and disposing restores the prior request', () => {
  const state = { ui: { theater: { id: 'prior' } }, settings: { locale: 'de-DE' } };
  const session = createTheaterSession(recording(), state);
  assert.equal(state.ui.theater, session);
  assert.equal(session.request.scene, 'replay-theater');
  session.seek(2.5); assert.equal(session.elapsed, 2.5);
  session.seek(0.5); assert.equal(session.elapsed, 0.5);
  session.setPhoto(true); session.orbit(20, 10); session.zoom(-100); session.pan(5, -4);
  assert.ok(session.photo.yaw > 0 && session.photo.distance < 1);
  assert.equal(session.photo.panZ, -4);
  session.dispose(); assert.deepEqual(state.ui.theater, { id: 'prior' });
});

test('the real replay stage seeks backwards, follows the shot plan, and frees the camera at any frame', async () => {
  const state = createSimulation({ seed: 4242, systems: [] }).state;
  const source = recording(), session = createTheaterSession(source, state);
  const geometry = new THREE.BoxGeometry(6, 2, 4), material = new THREE.MeshBasicMaterial();
  const io = { async loadPart() { return { primitives: [{ name: 'hull', geometry, material, matrix: new THREE.Matrix4() }] }; } };
  const built = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(42, 16 / 9), clock: 0 };
  let stage;
  try {
    assert.ok(session.plan.beats.some((beat) => beat.recorded), 'Moment Machine has recorded camera beats');
    stage = await buildKillcamStage(built, io, { tape: session.tape, control: session });
    assert.ok(stage.ready);
    const before = canonicalStringify(snapshotSimState(state));
    session.seek(0.5); stage.update(built, 0, state);
    const first = stage.roots[0].getObjectByName('UiStageKillcamFleet').children[0].position.clone();
    session.seek(2.5); stage.update(built, 0, state);
    const later = stage.roots[0].getObjectByName('UiStageKillcamFleet').children[0].position.clone();
    assert.ok(later.x > first.x);
    session.seek(0.5); stage.update(built, 0, state);
    assert.ok(stage.roots[0].getObjectByName('UiStageKillcamFleet').children[0].position.equals(first));
    session.seek(1.5); stage.update(built, 0, state);
    const directed = built.camera.position.clone();
    session.setPhoto(true); session.orbit(60, 20); session.pan(20, -20); stage.update(built, 0, state);
    assert.ok(!built.camera.position.equals(directed));
    session.setPhoto(false); stage.update(built, 0, state);
    assert.ok(built.camera.position.equals(directed), 'return to the planned camera at the same frame');
    assert.equal(canonicalStringify(snapshotSimState(state)), before);
  } finally { stage?.dispose(); session.dispose(); geometry.dispose(); material.dispose(); }
});

test('the master mix ring is bounded and sound maps to the exact presented tick window', () => {
  const ring = createReplayAudioRing(600, 2);
  // Six seconds sampled analytically, enough to wrap three times. A picture's second
  // maps to the same second of the master, independent of chunk delivery order/cadence.
  for (let frame = 0; frame < 3600; frame += 10) {
    ring.mark(frame / 10, frame / 600);
    ring.append(frame, Float32Array.from({ length: 10 }, (_, i) => (frame + i) / 3600));
  }
  ring.mark(360, 6);
  assert.equal(ring.census().samples, 1200);
  const pcm = ring.window(270, 330);
  assert.ok(pcm);
  assert.equal(pcm.left.length, 600);
  assert.ok(Math.abs(pcm.left[0] - 0.75) < 1e-6);
  assert.ok(Math.abs(pcm.left[300] - (3000 / 3600)) < 1e-6);
  assert.equal(ring.window(0, 60), null, 'expired audio cannot masquerade as a soundtrack');
});

test('audio playback schedules on the existing context and releases only its own graph', () => {
  const calls = [], tracks = [{ stop() { calls.push('track-stop'); } }];
  const context = { state: 'running',
    createBuffer(channels, length, rate) { calls.push([channels, length, rate]); return { copyToChannel() {} }; },
    createMediaStreamDestination() { return { stream: { getTracks: () => tracks }, disconnect() { calls.push('destination-disconnect'); } }; },
    createBufferSource() { return { connect() {}, start(at) { calls.push(['start', at]); }, stop() { calls.push('source-stop'); }, disconnect() {} }; },
  };
  const playback = createReplayAudioPlayback({ left: new Float32Array(600), right: new Float32Array(600), sampleRate: 600 }, context);
  playback.start(12.25); playback.start(99); playback.stop();
  assert.deepEqual(calls.filter((c) => Array.isArray(c) && c[0] === 'start'), [['start', 12.25]]);
  assert.ok(calls.includes('track-stop'));
  assert.equal(createReplayAudioPlayback(null, context), null);
});

test('German clip captions declare de, use localized logged text, and identify their soundtrack', () => {
  const sidecar = captionSidecar({ id: 'massline-kill', inTick: 120, outTick: 300,
    label: 'Ship destroyed', reason: 'Replay' }, null, { locale: 'de-DE', soundtrack: 'recorded-master-bus' });
  assert.equal(sidecar.language, 'de');
  assert.equal(sidecar.soundtrack, 'recorded-master-bus');
  assert.match(sidecar.cues[0].text, /SCHIFF ZERSTÖRT/i);
  assert.ok(captionVtt(sidecar).startsWith('WEBVTT'));
});

test('720p export schedules thirty fresh tape renders per second against the same audio clock', async () => {
  let submitted = 0, audioStarts = 0, stopped = 0;
  const audioTrack = { kind: 'audio', stop() { stopped++; } };
  const videoTrack = { kind: 'video', stop() { stopped++; }, requestFrame() { submitted++; } };
  const audioContext = { state: 'running', currentTime: 0,
    createBuffer() { return { copyToChannel() {} }; },
    createMediaStreamDestination() { return { stream: { getTracks: () => [audioTrack], getAudioTracks: () => [audioTrack] }, disconnect() {} }; },
    createBufferSource() { return { connect() {}, disconnect() {}, start() { audioStarts++; }, stop() {} }; },
  };
  class Recorder {
    static isTypeSupported(type) { return type.startsWith('video/webm'); }
    constructor(stream) { this.state = 'inactive'; assert.equal(stream.getTracks().length, 2); }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive'; this.ondataavailable({ data: new Blob(['test-encoded-webm']) }); this.onstop();
    }
  }
  const pixels = new Uint8ClampedArray(1280 * 720 * 4), rendered = [];
  const scope = {
    MediaRecorder: Recorder,
    MediaStream: class { constructor(tracks) { this.tracks = tracks; } getTracks() { return this.tracks; } },
    ImageData: class { constructor(data, width, height) { assert.equal(data.length, width * height * 4); } },
    document: { createElement() { return { width: 0, height: 0,
      getContext: () => ({ putImageData() {} }),
      captureStream: () => ({ getTracks: () => [videoTrack], getVideoTracks: () => [videoTrack] }),
    }; } },
  };
  const session = { tape: { samples: 31, sampleRate: 10 }, elapsed: 0.5, photo: { enabled: true },
    seek(at) { this.elapsed = at; }, setPhoto(on) { this.photo.enabled = on; },
    renderAt(width, height) { assert.equal(width, 1280); assert.equal(height, 720); rendered.push(this.elapsed); return { data: pixels }; },
  };
  const pcm = { sampleRate: 600, left: new Float32Array(1800), right: new Float32Array(1800) };
  const result = await encodeTheaterVideo(session, pcm, audioContext, { scope,
    wait: async (ms) => { audioContext.currentTime += Math.max(0.00001, ms / 1000); } });
  assert.equal(result.frames, 90); assert.equal(submitted, 90);
  assert.equal(new Set(rendered).size, 90, 'frames are newly posed, not duplicated flight pixels');
  assert.equal(result.fps, 30); assert.equal(result.source, 'rendered-tape');
  assert.ok(result.maximumAudioSkewS <= 1 / 30);
  assert.equal(result.soundtrack, 'recorded-master-bus');
  assert.equal(result.format, 'webm', 'unsupported MP4 is labelled with the real container');
  assert.equal(audioStarts, 1); assert.ok(stopped >= 2);
  assert.equal(session.elapsed, 0.5); assert.equal(session.photo.enabled, true);
});
