// PQ-160.01 — Auto-clip.
//
// Proves the measured done-when headlessly on the fixed seed 16001: the authoritative stunt
// detector's `bolas` receipt marks a clip window, the clip list holds it, and replaying that window
// from the recorded tape reproduces the live deterministic hashes tick-for-tick.
//
// Export writes a real GIF/MP4 when RGBA frames exist (or a software title card from the clip
// window). A bare id with no frames and no window fails closed as `gpu-export-unavailable`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  attachClipDirectorToBus,
  createClipDirector,
} from '../src/core/simSnapshot.js';
import { createStuntDetector } from '../src/combat/stuntTaxonomy.js';
import { recordReplayRun, replayClipWindow } from '../src/testing/lab/differentialReplay.js';

const SEED = 16001;
const TICKS = 600;
const BOLAS_TICK = 215;

function replayScenario() {
  return {
    schema: 'spaceface.simScenario.v1',
    id: 'pq160.autoclip.baseline',
    version: 1,
    title: 'PQ-160.01 auto-clip replay baseline',
    description: 'Fixed seed flight tape used to prove the clip window replays hash-for-hash.',
    evidenceClass: 'focused-fixture',
    runtimeProfile: 'focused-lab',
    seed: SEED,
    ticks: TICKS,
    world: {
      fixtureProfile: 'empty-flight',
      sectorId: 'sector_helios_prime',
      mode: 'flight',
      physicsBackend: 'rapier-dynamic',
      flightBackend: 'v3',
      aiBackend: 'legacy',
      credits: 5000,
    },
    entities: [
      {
        alias: 'player',
        profile: 'ship.starter',
        role: 'player',
        team: 0,
        factionId: 'faction_free',
        isPlayer: true,
        pos: { x: 0, z: 0 },
        vel: { x: 0, z: 0 },
        heading: 1.5707963267948966,
        persistent: true,
      },
    ],
    frames: [
      { tick: 0, input: { moveX: 0, moveZ: 1, turnIntent: 0, boost: false } },
      { tick: 120, input: { moveX: 0.5, moveZ: 1, turnIntent: 0.5, boost: true } },
      { tick: 300, input: { moveX: -0.5, moveZ: 0.5, turnIntent: -0.5, boost: false } },
      { tick: 420, input: { moveX: 0.25, moveZ: 0.75, turnIntent: 0.25, boost: true } },
    ],
    metrics: [
      { name: 'invariant.finiteState', version: 1, threshold: { op: '==', value: 1 } },
      { name: 'invariant.noNegativeResources', version: 1, threshold: { op: '==', value: 1 } },
    ],
    assertions: [
      { kind: 'equivalence', equivalence: 'run-eq-repeat' },
    ],
    trace: { signals: ['playerX', 'playerZ', 'playerVelX', 'playerVelZ'], sampleEvery: 1 },
    observer: { enabled: false },
  };
}

/** Drive the authoritative StuntDetector to a bolas kill receipt, as the live bus would. */
function bolasKillTricks() {
  const detector = createStuntDetector({ playerId: 'player' });
  detector.processEvent('tether:releaseRated', {
    tick: BOLAS_TICK - 15,
    sourceId: 'player',
    targetId: 'weighted_cable',
    classification: 'clean',
    releaseScore: 0.75,
    tangentialSpeed: 38.0,
  });
  const tricks = detector.processEvent('combat:collisionConsequence', {
    tick: BOLAS_TICK,
    targetId: 'drone_beta',
    otherId: 'weighted_cable',
    surface: 'craft',
    deltaV: 22.0,
    exchangedMomentum: 800,
    provenance: { actorId: 'player' },
  });
  return tricks.filter((t) => t.trickId === 'bolas');
}

test('PQ-160.01 a bolas kill marks a clip window and the clip list contains it', () => {
  const director = createClipDirector();
  assert.equal(director.size, 0);

  const bolas = bolasKillTricks();
  assert.equal(bolas.length, 1, 'the authoritative detector must recognize the bolas kill');
  assert.equal(bolas[0].actorId, 'player');

  const clip = director.observeTrick({ ...bolas[0], seed: SEED });
  assert.ok(clip, 'the bolas moment must mark a clip window');
  assert.equal(clip.trickId, 'bolas');
  assert.equal(clip.momentTick, BOLAS_TICK);
  assert.equal(clip.startTick, BOLAS_TICK - director.preRollTicks);
  assert.equal(clip.endTick, BOLAS_TICK + director.postRollTicks);
  assert.ok(clip.endTick - clip.startTick > 0);
  assert.equal(director.size, 1);

  const summary = director.list();
  assert.equal(summary.length, 1);
  assert.equal(summary[0].id, clip.id);
  assert.equal(summary[0].label, 'Bolas');

  // Duplicate receipts for the same moment never mint a second clip.
  assert.equal(director.observeTrick({ ...bolas[0], seed: SEED }), null);
  assert.equal(director.size, 1);
});

test('PQ-160.01 kills mark clips and duplicate receipts never double-mint', () => {
  const director = createClipDirector();
  const attributed = director.observeKill({ tick: 401, id: 'raider_1', killerId: 'player', seed: SEED });
  assert.ok(attributed);
  assert.equal(attributed.kind, 'kill');
  assert.equal(attributed.targetId, 'raider_1');

  assert.equal(
    director.observeKill({ tick: 401, id: 'raider_1', killerId: 'player', seed: SEED }),
    null,
    'the same kill must not mint a second clip',
  );
  assert.equal(director.size, 1);
});

test('PQ-160.01 the live bus drives the detector through attachClipDirectorToBus', () => {
  const bus = createBus();
  const director = createClipDirector();
  const detach = attachClipDirectorToBus(bus, director);

  bus.emit('stunt:trickDetected', {
    trickId: 'bolas',
    name: 'Bolas',
    actorId: 'player',
    targetId: 'drone_beta',
    tick: BOLAS_TICK,
  });
  assert.equal(director.size, 1);
  assert.equal(director.latest().trickId, 'bolas');

  bus.emit('entity:killed', { tick: 250, id: 'traffic_hauler', team: 1 });
  assert.equal(director.size, 1, 'an unattributed room kill is not a player clip');

  bus.emit('entity:killed', { tick: 300, id: 'drone_beta', killerId: 'player' });
  assert.equal(director.size, 2);
  assert.equal(director.latest().kind, 'kill');

  detach();
  bus.emit('entity:killed', { tick: 500, id: 'raider_2', killerId: 'player' });
  assert.equal(director.size, 2, 'after detach the director stops observing');
});

test('PQ-160.01 replayed clip window matches live to the hash (seed 16001)', async () => {
  const recording = await recordReplayRun(replayScenario(), { seconds: 30 });
  assert.equal(recording.ok, true, `record failed: ${recording.error || recording.status}`);
  assert.equal(recording.seed, SEED);
  assert.equal(recording.ticks, TICKS);

  const director = createClipDirector();
  const bolas = bolasKillTricks();
  const clip = director.observeTrick({ ...bolas[0], seed: SEED });
  assert.ok(clip);

  const window = await replayClipWindow(recording, clip);
  assert.equal(window.schema, 'spaceface.labReplayClip.v1');
  assert.equal(window.clipId, clip.id);
  assert.equal(window.trickId, 'bolas');
  assert.equal(window.startTick, clip.startTick);
  assert.equal(window.endTick, clip.endTick);
  assert.equal(window.comparedTicks, clip.endTick - clip.startTick + 1);
  assert.equal(window.match, true, `first divergence: ${JSON.stringify(window.firstDivergence)}`);
  assert.equal(window.liveFinalHash, window.replayFinalHash);
  assert.equal(window.ok, true);
  assert.equal(window.exitClass, 0);
  console.log(
    `PQ-160.01 seed=${SEED} ticks=${TICKS} momentTick=${clip.momentTick}`
    + ` window=[${clip.startTick},${clip.endTick}] compared=${window.comparedTicks}`
    + ` hash=${window.liveFinalHash}`,
  );

  // The same clip replays to the same hash — the tape is deterministic.
  const again = await replayClipWindow(recording, clip);
  assert.equal(again.match, true);
  assert.equal(again.replayFinalHash, window.replayFinalHash);
});

test('PQ-160.01 Clips is reachable from pause and export fails closed without GPU', async () => {
  const pauseSrc = readFileSync(new URL('../src/ui/screens/pause.js', import.meta.url), 'utf8');
  assert.match(pauseSrc, /export const pauseScreen/);
  assert.match(pauseSrc, /openClips/, 'pause must open the clips surface');
  assert.match(pauseSrc, /CLIPS_LABEL/, 'pause must expose a Clips action');

  const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(mainSrc, /installLiveClipDirector/, 'boot must bind the clip director to the live bus');

  const clips = await import('../src/ui/screens/clips.js');
  assert.equal(clips.clipsScreen.id, 'clips');
  assert.equal(typeof clips.clipsScreen.mount, 'function');
  assert.equal(typeof clips.openClips, 'function');
  assert.equal(typeof clips.installLiveClipDirector, 'function');
  assert.equal(clips.CLIPS_LABEL, 'Clips');

  const summary = clips.clipListSummary(createClipDirector());
  assert.equal(summary.available, false);
  assert.equal(summary.count, 0);

  const outcome = clips.exportClip({ id: 'clip_0001' });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.status, 'not-done');
  assert.equal(outcome.reason, 'gpu-export-unavailable');
  assert.deepEqual(outcome.formats, ['gif', 'mp4']);
});

test('PQ-160.01 live kill receipts without a tick still mark a clip', () => {
  const bus = createBus();
  const director = createClipDirector();
  attachClipDirectorToBus(bus, director, { seedOf: () => SEED, tickOf: () => 401 });
  bus.emit('entity:killed', { id: 'raider_1', killerId: 'player' });
  assert.equal(director.size, 1, 'a production entity:killed has no tick; tickOf must stamp one');
  assert.equal(director.latest().momentTick, 401);
  assert.equal(director.latest().seed, SEED);
  assert.equal(director.latest().kind, 'kill');
});

function solidFrame(w, h, r, g, b) {
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = 255;
  }
  return px;
}

test('PQ-160.01 export writes GIF and MP4 when frames exist (Electron save + browser download)', async () => {
  const clips = await import('../src/ui/screens/clips.js');
  const { encodeClipGif, encodeClipMp4 } = await import('../src/ui/screens/clipExport.js');
  const w = 8;
  const h = 8;
  const frames = [solidFrame(w, h, 255, 32, 32), solidFrame(w, h, 32, 255, 64)];

  const gifBytes = encodeClipGif(frames, { width: w, height: h, delayCs: 10 });
  assert.ok(gifBytes && gifBytes.length > 32);
  assert.equal(String.fromCharCode(gifBytes[0], gifBytes[1], gifBytes[2], gifBytes[3], gifBytes[4], gifBytes[5]), 'GIF89a');
  assert.equal(gifBytes[gifBytes.length - 1], 0x3b);

  const mp4Bytes = encodeClipMp4(frames, { width: w, height: h, fps: 10 });
  assert.ok(mp4Bytes && mp4Bytes.length > 32);
  assert.equal(String.fromCharCode(mp4Bytes[4], mp4Bytes[5], mp4Bytes[6], mp4Bytes[7]), 'ftyp');

  const saved = [];
  const electron = clips.exportClip({ id: 'clip_0001', label: 'Bolas' }, {
    frames, width: w, height: h, format: 'gif', allowRaster: false,
    host: {
      kind: 'electron',
      saveFile: (job) => {
        saved.push(job);
        return { ok: true, path: job.filename };
      },
    },
  });
  assert.equal(electron.ok, true, 'frames must encode a real GIF');
  assert.equal(electron.format, 'gif');
  assert.equal(electron.source, 'recorded');
  assert.equal(electron.via, 'electron-save');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].filename, 'spaceface-clip-clip_0001.gif');
  assert.equal(String.fromCharCode(electron.bytes[0], electron.bytes[1], electron.bytes[2]), 'GIF');
  assert.equal(electron.hostResult.ok, true);

  const downloads = [];
  const browser = clips.exportClip({ id: 'clip_0001', label: 'Bolas' }, {
    frames, width: w, height: h, format: 'mp4', allowRaster: false,
    host: {
      kind: 'browser',
      download: (job) => { downloads.push(job); },
    },
  });
  assert.equal(browser.ok, true);
  assert.equal(browser.format, 'mp4');
  assert.equal(browser.via, 'browser-download');
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].filename, 'spaceface-clip-clip_0001.mp4');
  assert.equal(String.fromCharCode(browser.bytes[4], browser.bytes[5], browser.bytes[6], browser.bytes[7]), 'ftyp');

  const director = createClipDirector();
  const bolas = bolasKillTricks();
  const clip = director.observeTrick({ ...bolas[0], seed: SEED });
  const card = clips.exportClip(clip, { host: { kind: 'headless' } });
  assert.equal(card.ok, true, 'a marked window rasterizes a software card without GPU frames');
  assert.equal(card.source, 'software-card');
  assert.equal(card.format, 'gif');
  assert.equal(String.fromCharCode(card.bytes[0], card.bytes[1], card.bytes[2], card.bytes[3], card.bytes[4], card.bytes[5]), 'GIF89a');
});
