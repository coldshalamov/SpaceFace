import test from 'node:test';
import assert from 'node:assert/strict';
import { installFlightFootage, encodeFlightVideo } from '../src/ui/screens/flightFootage.js';

function harness({ audio = true, decodeDelay = 0, abortOnDecode = false, setupFailure = null, stopAudioOnWait = null } = {}) {
  const priorDocument = globalThis.document;
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  const footage = installFlightFootage(null, { stateOf: () => ({ mode: 'menu' }) });
  for (const tick of [120, 126, 132, 138]) footage.ring.push({ tick, width: 640, height: 360, blob: new Blob(['frame']) });
  const events = [], controller = new AbortController();
  const audioTrack = { kind: 'audio', stop() { events.push('audio-stop'); } };
  const videoTrack = { kind: 'video', stop() { events.push('video-stop'); }, requestFrame() { events.push(['picture', context.currentTime]); } };
  const context = { state: 'running', currentTime: 5,
    createBuffer() { return { copyToChannel() {} }; },
    createMediaStreamDestination() { events.push('audio-created'); return { stream: { getTracks: () => [audioTrack], getAudioTracks: () => [audioTrack] }, disconnect() {} }; },
    createBufferSource() { return { connect() {}, disconnect() {}, start(at) { events.push(['sound', at]); }, stop() { events.push('source-stop'); } }; },
  };
  class Recorder {
    static isTypeSupported(type) { return type.startsWith('video/webm'); }
    constructor(stream) { if (setupFailure === 'recorder') throw new Error('recorder setup failed'); events.push(['tracks', stream.getTracks().map(t => t.kind)]); this.state = 'inactive'; }
    start() { this.state = 'recording'; events.push('record'); }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['encoded']) }); this.onstop(); }
  }
  const canvas = { width: 0, height: 0,
    getContext: () => ({ drawImage() {} }),
    captureStream: () => {
      if (setupFailure === 'capture') throw new Error('capture setup failed');
      return { getTracks: () => [videoTrack], getVideoTracks: () => [videoTrack] };
    },
  };
  const scope = { MediaRecorder: Recorder,
    MediaStream: class { constructor(tracks) { if (setupFailure === 'stream') throw new Error('stream setup failed'); this.tracks = tracks; } getTracks() { return this.tracks; } },
    document: { createElement() { if (setupFailure === 'canvas') throw new Error('canvas setup failed'); return canvas; } },
    async createImageBitmap() {
      context.currentTime += decodeDelay;
      if (abortOnDecode) controller.abort();
      return { close() { events.push('bitmap-close'); } };
    },
  };
  const audioTape = { context, window(start, end) {
    events.push(['window', start, end]);
    return audio ? { sampleRate: 600, left: new Float32Array(180), right: new Float32Array(180) } : null;
  } };
  return { scope, audioTape, controller, events, context, canvas,
    wait: async ms => {
      if (stopAudioOnWait) context.state = stopAudioOnWait;
      else context.currentTime += Math.max(0.000001, ms / 1000);
    },
    cleanup() { footage.dispose(); if (priorDocument === undefined) delete globalThis.document; else globalThis.document = priorDocument; },
  };
}

test('captured-picture fallback retains the existing master PCM on the same audio clock', async () => {
  const h = harness({ decodeDelay: 0.007 });
  try {
    const result = await encodeFlightVideo({ startTick: 118, endTick: 140 }, { format: 'webm', ...h });
    assert.deepEqual(h.events.find(e => e[0] === 'tracks')[1], ['video', 'audio']);
    assert.deepEqual(h.events.find(e => e[0] === 'window'), ['window', 120, 138]);
    const start = h.events.find(e => e[0] === 'sound')[1];
    const pictures = h.events.filter(e => e[0] === 'picture').map(e => e[1]);
    assert.equal(pictures.length, 4);
    for (let i = 0; i < pictures.length; i++) assert.ok(Math.abs(pictures[i] - start - i * 0.1) < 0.001);
    assert.equal(result.soundtrack, 'recorded-master-bus');
    assert.ok(result.maximumAudioSkewS < 0.001);
    assert.equal(result.actualStartTick, 120); assert.equal(result.actualEndTick, 138);
    assert.ok(h.events.includes('audio-stop') && h.events.includes('video-stop'));
  } finally { h.cleanup(); }
});

test('an expired audio window preserves the silent-video recovery and labels it honestly', async () => {
  const h = harness({ audio: false });
  try {
    const result = await encodeFlightVideo({ startTick: 120, endTick: 138 }, { format: 'webm', ...h });
    assert.deepEqual(h.events.find(e => e[0] === 'tracks')[1], ['video']);
    assert.equal(result.soundtrack, null);
    assert.equal(result.maximumAudioSkewS, null);
  } finally { h.cleanup(); }
});

test('a stalled decode refuses an out-of-sync soundtrack and releases both owned tracks', async () => {
  const h = harness({ decodeDelay: 0.25 });
  try {
    await assert.rejects(encodeFlightVideo({ startTick: 120, endTick: 138 }, { format: 'webm', ...h }), /within one frame/);
    assert.ok(h.events.includes('audio-stop') && h.events.includes('video-stop'));
    assert.equal(h.canvas.width, 0);
  } finally { h.cleanup(); }
});

test('cancelling while the first picture decodes stops audio before publishing a frame', async () => {
  const h = harness({ abortOnDecode: true });
  try {
    await assert.rejects(encodeFlightVideo({ startTick: 120, endTick: 138 }, { format: 'webm', signal: h.controller.signal, ...h }), { name: 'AbortError' });
    assert.ok(h.events.includes('audio-stop') && h.events.includes('video-stop'));
    assert.equal(h.events.filter(e => e[0] === 'picture').length, 0);
  } finally { h.cleanup(); }
});

test('partial output setup failures release every already-created export resource', async () => {
  for (const setupFailure of ['canvas', 'capture', 'stream', 'recorder']) {
    const h = harness({ setupFailure });
    try {
      await assert.rejects(encodeFlightVideo({ startTick: 120, endTick: 138 }, { format: 'webm', ...h }), new RegExp(`${setupFailure} setup failed`));
      if (setupFailure === 'canvas' || setupFailure === 'capture') assert.ok(!h.events.includes('audio-created'));
      else {
        assert.ok(h.events.includes('audio-stop'), `${setupFailure}: audio track released`);
        assert.ok(h.events.includes('source-stop'), `${setupFailure}: playback source released`);
        assert.ok(h.events.includes('video-stop'), `${setupFailure}: picture track released`);
      }
      assert.equal(h.canvas.width, 0);
    } finally { h.cleanup(); }
  }
});

test('a suspended or closed audio clock rejects instead of waiting forever', async () => {
  for (const stopAudioOnWait of ['suspended', 'closed']) {
    const h = harness({ stopAudioOnWait });
    try {
      await assert.rejects(encodeFlightVideo({ startTick: 120, endTick: 138 }, { format: 'webm', ...h }), /sound output stopped/);
      assert.ok(h.events.includes('audio-stop') && h.events.includes('video-stop'));
      assert.equal(h.canvas.width, 0);
    } finally { h.cleanup(); }
  }
});
