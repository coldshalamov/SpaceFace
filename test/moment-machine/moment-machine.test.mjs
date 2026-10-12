import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  PRE_ROLL_TICKS,
  SHAPE_IDS,
  analyzeMomentStream,
  createOfflineCameraLease,
  planShot,
  selectMoments,
} from '../../src/presentation/momentMachine/index.js';
import { fromChronicleFact } from '../../src/presentation/momentMachine/ingest.js';
import { encodeMoment } from '../../tools/moment-machine/encode.mjs';
import { readAdventureTape, readChronicleFacts, readKillRing, readKillcam } from '../../tools/moment-machine/liveSources.mjs';
import { runSessions } from '../../tools/moment-machine/sessions.mjs';
import { attemptHeadedPlayback } from '../../tools/moment-machine/headedCapture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = path.join(ROOT, 'tools/moment-machine/cli.mjs');
const CLIPS = path.join(ROOT, 'src/ui/screens/clips.js');

function killStream(tick, samples, window) {
  return {
    schema: 'spaceface.momentStream.v1',
    seed: 1,
    tickRate: 60,
    tone: 'feat',
    window: window || { baseTick: 0, ticks: 1800, seconds: 30 },
    events: [{
      id: 'tape-kill',
      causalityId: null,
      tick,
      simTime: tick / 60,
      kind: 'kill',
      actors: [{ id: 'pilot', generation: 0, role: 'actor' }],
      payload: {},
      source: 'tape',
    }],
    samples,
  };
}

test('a logged kill is selectable and the twelve unlogged shapes are not', () => {
  const selection = selectMoments(killStream(1700, [], { baseTick: 0, ticks: 1800, seconds: 30 }));
  assert.equal(selection.ranked[0].shape, 'logged_kill');
  assert.equal(selection.ranked[0].footage.status, 'unrecorded');
  assert.equal(selection.ranked.some((moment) => SHAPE_IDS.includes(moment.shape)), false);
  assert.equal(selection.ranked[0].reason.includes('rescued'), false);
});

test('early payoff keeps its in-tick and reports the missing pre-roll', () => {
  const samples = [
    { tick: 0, id: 'pilot', generation: 0, x: 0, z: 0, heading: 0 },
    { tick: 1800, id: 'pilot', generation: 0, x: 12, z: 3, heading: 0 },
  ];
  const selection = selectMoments(killStream(120, samples));
  const moment = selection.ranked[0];
  assert.equal(moment.inTick, 120 - PRE_ROLL_TICKS);
  assert.equal(moment.footage.status, 'pre-roll-missing');
  assert.ok(moment.footage.missingPreTicks >= PRE_ROLL_TICKS - 120);
  assert.notEqual(moment.footage.status, 'covered');
});

test('a lease tick before the first sample is not recorded', () => {
  const base = 4000;
  const samples = [];
  for (let tick = 4300; tick <= 5319; tick += 6) {
    samples.push({ tick, id: 'pilot', generation: 0, x: tick, z: 0, heading: 0 });
  }
  const selection = selectMoments(killStream(base + PRE_ROLL_TICKS, samples, {
    baseTick: base,
    ticks: 1320,
    seconds: 22,
  }));
  const moment = selection.ranked[0];
  assert.equal(moment.footage.status, 'pre-roll-missing');
  assert.ok(moment.footage.missingPreTicks > 0);
  const plan = planShot(selection.stream, moment);
  const lease = createOfflineCameraLease(plan);
  const gap = lease.frameAt(4189);
  assert.equal(gap.recorded, false);
  assert.equal(gap.focus, null);
  lease.release();
});

test('chronicle rescue without a threat is not a rescue event', () => {
  const facts = readChronicleFacts();
  assert.equal(facts.rescue.dropped, true);
  assert.equal(facts.rescue.reason, 'chronicle:rescue-without-logged-threat');
  assert.equal(facts.rescue.kind, undefined);
  assert.equal(facts.rescueSelection.ranked.some((moment) => moment.shape === 'last_second_rescue'), false);
  assert.equal(facts.collision.kind, 'collision');
  assert.equal(facts.collisionSelection.ranked[0].shape, 'logged_kill');
  assert.equal(facts.collisionSelection.ranked.some((moment) => moment.shape === 'chain_collision'), false);
  assert.equal(facts.headline.dropped, true);
  assert.equal(facts.salvage.payload.planned, null);
  assert.equal(facts.salvageSelection.ranked.some((moment) => moment.shape === 'unplanned_recovery'), false);

  const mapped = fromChronicleFact({
    event: 'distress:rescued',
    stage: 'rescue',
    tick: 120,
    t: 2,
    actor: { id: 'p1', player: true },
    subject: { id: 'hauler', player: false },
    details: {},
  });
  assert.equal(mapped.dropped, true);
  assert.notEqual(mapped.kind, 'rescue');
});

test('live tape kill has real poses without fabricating a causal shape', () => {
  const tape = readAdventureTape();
  assert.equal(tape.stream.positionSource, 'tape-samples');
  assert.ok(tape.stream.samples.length > 0);
  assert.equal(tape.stream.dropped.some((row) => row.reason === 'tape-positions-unrecorded'), false);
  assert.equal(tape.selection.ranked[0].shape, 'logged_kill');
  assert.equal(tape.selection.ranked[0].footage.status, 'pre-roll-missing');
  assert.equal(tape.selection.ranked.some((moment) => SHAPE_IDS.includes(moment.shape)), false);

  const killcam = readKillcam();
  assert.equal(killcam.selection.ranked.some((moment) => moment.shape === 'last_second_rescue'), false);
  const ring = readKillRing();
  assert.equal(ring.durationS, 5);
  assert.equal(ring.exportableAsMoment, false);
});

test('encoder does not verify a non-playback raster', async () => {
  const selection = selectMoments(killStream(1700, []));
  const plan = planShot(selection.stream, selection.ranked[0]);
  const encoded = await encodeMoment(plan, selection.stream.samples, {
    outPath: '/tmp/moment-not-playback.webm',
    framesArePlayback: false,
  });
  assert.equal(encoded.ok, false);
  assert.equal(encoded.wroteFile, false);
  assert.equal(encoded.videoVerified, false);
  assert.equal(encoded.reason, 'playback-frames-required');
});

test('Moment Machine is integrated into the existing recorded Clips exporter', async () => {
  const clips = await readFile(CLIPS, 'utf8');
  assert.equal(clips.includes('analyzeMomentStream'), true);
  assert.equal(clips.includes('exportLoggedMoment'), true);
  assert.equal(clips.includes("from '../../presentation/momentMachine/index.js'"), true);
});

test('cli ingest selects a logged kill and does not invent positions', () => {
  const ran = spawnSync(process.execPath, [
    CLI, 'ingest', '--tape', path.join(ROOT, 'tools/moment-machine/fixtures/adventure-kill.json'),
  ], { encoding: 'utf8', cwd: ROOT });
  assert.equal(ran.status, 0, ran.stderr);
  const parsed = JSON.parse(ran.stdout);
  assert.equal(parsed.positionSource, 'none');
  assert.deepEqual(parsed.ranked, ['logged_kill']);
  assert.equal(parsed.footage.status, 'unrecorded');
  assert.equal(parsed.encodable, false);
  assert.equal(parsed.videoVerified, false);
  const exported = spawnSync(process.execPath, [
    CLI, 'export', '--tape', path.join(ROOT, 'tools/moment-machine/fixtures/adventure-kill.json'),
  ], { encoding: 'utf8', cwd: ROOT });
  assert.equal(exported.status, 2);
  const body = JSON.parse(exported.stdout);
  assert.equal(body.wroteFile, false);
  assert.equal(body.videoVerified, false);
  assert.equal(body.reason, 'tape-positions-unrecorded');
});

test('authoritative sessions store poses; absent live pixels stay unverified', { timeout: 240000 }, async () => {
  const sessions = runSessions(2);
  assert.equal(sessions.count, 2);
  assert.equal(sessions.evidenceClass, 'production-manifest');
  assert.equal(sessions.rows.every((row) => row.ok && row.tapeTicks === 60 && row.hasInputRing), true);
  assert.equal(sessions.rows.every((row) => row.positionSource === 'tape-samples'), true);
  for (const shape of SHAPE_IDS) {
    assert.equal(sessions.selectedShapes.includes(shape), false, shape);
  }
  const headed = await attemptHeadedPlayback({ cwd: ROOT, port: 8771 });
  assert.equal(headed.videoVerified, false);
  assert.equal(headed.producedVideo, false);
  assert.ok(headed.error && headed.error.length > 0);
  const outDir = path.join(ROOT, 'artifacts/moment-machine');
  await mkdir(outDir, { recursive: true });
  const index = {
    schema: 'spaceface.momentIndex.v1',
    situations: sessions.count,
    selectMs: sessions.elapsedMs,
    evidenceClass: sessions.evidenceClass,
    videoVerified: false,
    tooling: { unverified: true, reason: 'playback-frames-not-captured' },
    headedCapture: {
      attempted: true,
      ok: false,
      videoVerified: false,
      producedVideo: false,
      error: headed.error,
      chromeCode: headed.chromeCode,
      serverUp: headed.serverUp === true,
    },
    selectedShapes: sessions.selectedShapes,
    unselectedShapes: sessions.unselectedShapes,
    categoryCount: 0,
    clipCount: 0,
    sessions: sessions.rows,
  };
  await writeFile(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2));
  await writeFile(path.join(outDir, 'headed-capture-error.txt'), headed.error);
  const saved = JSON.parse(await readFile(path.join(outDir, 'index.json'), 'utf8'));
  assert.equal(saved.videoVerified, false);
  assert.equal(saved.clipCount, 0);
  assert.equal(saved.situations, 2);
  assert.deepEqual(saved.unselectedShapes, SHAPE_IDS);
});
