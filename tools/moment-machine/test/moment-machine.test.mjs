import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  SHAPE_IDS,
  analyzeMomentStream,
  createOfflineCameraLease,
  planShot,
  poseAt,
  recordedSpan,
  restoreSelection,
  selectMoments,
  serializeSelection,
} from '../../../src/presentation/momentMachine/index.js';
import { chooseEncodeSet, rankSituations, writeBatch } from '../batch.mjs';
import { encodeMoment, videoTooling } from '../encode.mjs';
import { readAdventureTape, readChronicleFacts, readKillRing, readKillcam } from '../liveSources.mjs';
import { BACKGROUND, DRAWS_HUD, inkCount, renderMoment } from '../raster.mjs';
import { SITUATION_COUNT, allSituations, situation } from '../situations.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', 'cli.mjs');

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i += 1) freeze(value[keys[i]]);
}

function trace(selection) {
  return (selection.ranked || []).map((moment) => ({
    id: moment.id,
    shape: moment.shape,
    rank: moment.rank,
    score: moment.score,
    inTick: moment.inTick,
    outTick: moment.outTick,
    footage: moment.footage.status,
  }));
}

function hasReason(selection, reason) {
  return (selection.rejected || []).some((row) => row.reason === reason);
}

test('grammar covers twelve shapes and canonical seeds select them', () => {
  assert.equal(SHAPE_IDS.length, 12);
  const expected = [
    'chain_collision',
    'impossible_tether_cut',
    'accidental_collateral',
    'dramatic_lawful_intervention',
    'giant_sling',
    'last_second_rescue',
    'near_miss',
    'volatile_cargo_catastrophe',
    'moving_blockade',
    'reversal',
    'freak_ricochet',
    'unplanned_recovery',
  ];
  for (let seed = 1; seed <= 12; seed += 1) {
    const selection = selectMoments(situation(seed));
    assert.equal(selection.ok, true, `seed ${seed} ok`);
    assert.equal(selection.boring, false, `seed ${seed} boring`);
    assert.equal(selection.ranked[0].shape, expected[seed - 1], `seed ${seed} shape`);
    assert.ok(selection.ranked[0].seconds >= 15 && selection.ranked[0].seconds <= 30);
    assert.equal(selection.ranked[0].footage.status, 'covered');
    assert.equal(selection.ranked[0].subject.generation >= 0, true);
  }
});

test('rejects false rescue, single hits, planned recovery, and unlogged claims', () => {
  const close = selectMoments(situation(26));
  assert.equal(close.ranked.some((moment) => moment.shape === 'last_second_rescue'), false);
  assert.equal(close.boring, true);
  const pilot = situation(26).samples.find((sample) => sample.id === 'pilot' && sample.tick === 840);
  const hauler = situation(26).samples.find((sample) => sample.id === 'hauler' && sample.tick === 840);
  const distance = Math.hypot(pilot.x - hauler.x, pilot.z - hauler.z);
  assert.ok(distance < 3, 'ships pass close without becoming a rescue');

  assert.equal(hasReason(selectMoments(situation(27)), 'chain_collision:single-contact'), true);
  assert.equal(hasReason(selectMoments(situation(28)), 'recovery:planned'), true);
  assert.equal(hasReason(selectMoments(situation(29)), 'tether_cut:not-impossible'), true);
  assert.equal(hasReason(selectMoments(situation(30)), 'near_miss:was-a-hit'), true);
  assert.equal(hasReason(selectMoments(situation(31)), 'rescue:subject-already-dead'), true);
  assert.equal(hasReason(selectMoments(situation(32)), 'lawful:no-preceding-cause'), true);
  assert.equal(selectMoments(situation(25)).boring, true);
  assert.equal(hasReason(selectMoments(situation(25)), 'boring:no-grammar-match'), true);

  const inferred = selectMoments(situation(36));
  assert.equal(inferred.ranked.some((moment) => moment.shape === 'last_second_rescue'), false);
  assert.equal(inferred.dropped.some((row) => row.reason === 'rejected:unlogged-source'), true);

  const dirty = selectMoments(situation(33));
  assert.equal(dirty.ranked[0].shape, 'chain_collision');
  assert.equal(dirty.dropped.some((row) => row.reason === 'rejected:bad-tick'), true);
});

test('selection is deterministic, order-independent, and does not mutate the tape', () => {
  const original = situation(1);
  freeze(original);
  const first = selectMoments(original);
  const reversed = situation(1);
  reversed.events.reverse();
  reversed.samples.reverse();
  const second = selectMoments(reversed);
  assert.deepEqual(trace(first), trace(second));
  const again = selectMoments(situation(1));
  assert.deepEqual(trace(first), trace(again));
  const raw = JSON.parse(serializeSelection(first));
  const restored = restoreSelection(serializeSelection(first));
  assert.equal(restored.schema, first.schema);
  assert.deepEqual(trace(restored), trace(raw));
  assert.equal(selectMoments(null).ok, false);
});

test('camera lease stays offline and does not follow a recycled generation', () => {
  const stream = situation(34);
  const selection = selectMoments(stream);
  const moment = selection.ranked[0];
  assert.equal(moment.subject.id, 'hauler');
  assert.equal(moment.subject.generation, 0);
  const before = JSON.stringify(selection.stream.samples);
  const plan = planShot(selection.stream, moment);
  assert.equal(JSON.stringify(selection.stream.samples), before);
  assert.equal(plan.writesSimulation, false);
  assert.equal(plan.replacesLiveCamera, false);
  assert.equal(plan.framing, 'top-down-xz');
  const lease = createOfflineCameraLease(plan);
  const late = lease.frameAt(1100);
  assert.equal(late.writesSimulation, false);
  assert.ok(late.focus.x < 1000, 'holds the generation-0 wreck');
  const recycled = poseAt(selection.stream.samples, { id: 'hauler', generation: 1 }, 1100);
  assert.ok(Math.abs(late.focus.x - recycled.x) > 1000);
  lease.release();
  assert.equal(lease.frameAt(1100), null);
});

test('missing pre-roll is reported and not invented', () => {
  const selection = selectMoments(situation(35));
  const moment = selection.ranked[0];
  assert.equal(moment.footage.status, 'pre-roll-missing');
  assert.ok(moment.footage.missingPreTicks > 0);
  const plan = planShot(selection.stream, moment);
  const establish = plan.beats[0];
  assert.equal(establish.recorded, false);
  assert.equal(establish.focus, null);
  const payoff = plan.beats.find((beat) => beat.name === 'payoff');
  assert.equal(payoff.recorded, true);
  const span = recordedSpan(moment);
  assert.equal(span.exportable, true);
  assert.equal(span.claimsUnrecorded, true);
  assert.ok(span.seconds >= 15 && span.seconds <= 30);
  assert.ok(span.inTick > moment.inTick);
});

test('captions cite the log and ignore planted narration', () => {
  const stream = situation(1);
  stream.events[0].payload.narration = 'the player rescued this ship';
  const analysis = analyzeMomentStream(stream);
  const text = analysis.captions[0].cues[0].text;
  assert.equal(text.includes('rescued'), false);
  assert.equal(text.includes('Chain collision'), true);
  assert.equal(analysis.captions[0].soundtrack, null);
  assert.equal(analysis.exportRequest.replacesReplay, false);
  assert.equal(analysis.exportRequest.action, 'export-selected-moment');
});

test('multiple candidates on one tape stay ranked', () => {
  const selection = selectMoments(situation(40));
  assert.ok(selection.ranked.length >= 2);
  assert.equal(selection.ranked[0].shape, 'reversal');
  assert.equal(selection.ranked[1].shape, 'moving_blockade');
  assert.ok(selection.ranked[0].score >= selection.ranked[1].score);
});

test('forty seeds reject the boring cases and keep both tones', () => {
  assert.equal(allSituations().length, SITUATION_COUNT);
  const ranked = rankSituations();
  assert.ok(ranked.elapsedMs < 2000, `selection took ${ranked.elapsedMs}ms`);
  const chosen = chooseEncodeSet(ranked.rows, 10);
  const shapes = new Set(chosen.map((item) => item.moment.shape));
  const tones = new Set(chosen.map((item) => item.tone));
  assert.equal(chosen.length, 10);
  assert.ok(shapes.size >= 6);
  assert.equal(tones.has('feat'), true);
  assert.equal(tones.has('side-effect'), true);
  const boring = ranked.rows.filter((row) => row.analysis.selection.boring).map((row) => row.seed);
  for (const seed of [25, 26, 27, 28, 29, 30, 31, 32, 36]) {
    assert.equal(boring.includes(seed), true, `seed ${seed} should reject`);
  }
});

test('raster frames show bodies without a HUD bar', () => {
  assert.equal(DRAWS_HUD, false);
  const analysis = analyzeMomentStream(situation(1));
  const rendered = renderMoment(analysis.plans[0], analysis.selection.stream.samples, {
    width: 320,
    height: 180,
    fps: 10,
  });
  assert.equal(rendered.ok, true);
  assert.equal(rendered.frames.length, 220);
  const frame = rendered.frames[100];
  assert.equal(frame[0], BACKGROUND.r);
  assert.equal(frame[1], BACKGROUND.g);
  assert.equal(frame[frame.length - 1], 255);
  const ink = inkCount(frame, 320, 180);
  assert.ok(ink > 20 && ink < 320 * 180 * 0.15);
  const again = renderMoment(analysis.plans[0], analysis.selection.stream.samples, {
    width: 320,
    height: 180,
    fps: 10,
  });
  assert.equal(Buffer.compare(frame, again.frames[100]), 0);
});

test('live adventure tape, chronicle, and kill-cam do not invent a rescue', () => {
  const tape = readAdventureTape();
  assert.ok(tape.recording.ticks >= 90);
  assert.equal(tape.recording.events.some((event) => event.type === 'kill'), true);
  assert.equal(tape.stream.positionSource, 'none');
  assert.equal(tape.stream.dropped.some((row) => row.reason === 'tape-positions-unrecorded'), true);
  assert.equal(tape.selection.boring, true);
  assert.equal(tape.selection.ranked.some((moment) => moment.shape === 'last_second_rescue'), false);

  const facts = readChronicleFacts();
  assert.equal(facts.rescue.kind, 'rescue');
  assert.equal(facts.collision.kind, 'collision');
  assert.equal(facts.headline.dropped, true);
  assert.equal(facts.spill.kind, 'spill');
  assert.equal(facts.burst.kind, 'cargo_catastrophe');
  assert.equal(facts.salvage.kind, 'recovery');
  assert.equal(facts.salvage.payload.planned, null);
  assert.equal(facts.rescueSelection.ranked.length, 0);
  assert.equal(hasReason(facts.rescueSelection, 'rescue:no-logged-threat'), true);
  assert.equal(hasReason(facts.burstSelection, 'cargo:no-trigger'), true);
  assert.equal(hasReason(facts.collisionSelection, 'chain_collision:single-contact'), true);
  assert.equal(facts.collisionSelection.ranked.length, 0);
  assert.equal(hasReason(facts.salvageSelection, 'recovery:intent-unknown'), true);

  const killcam = readKillcam();
  assert.ok(killcam.stream.samples.length > 0);
  assert.equal(killcam.selection.ranked.some((moment) => moment.shape === 'last_second_rescue'), false);
  assert.equal(killcam.stream.events.every((event) => event.kind === 'death_flash'), true);

  const ring = readKillRing();
  assert.equal(ring.durationS, 5);
  assert.ok(ring.sampleCount >= 3);
  assert.equal(ring.selectionBoring, true);
  assert.ok(ring.windowSeconds < 15);
  assert.equal(ring.exportableAsMoment, false);
});

test('encoder refuses a still and a short clip', async () => {
  const analysis = analyzeMomentStream(situation(1));
  const plan = analysis.plans[0];
  const short = {
    ...plan,
    exportSpan: { exportable: true, inTick: 0, outTick: 30, ticks: 31, seconds: 0.5, claimsUnrecorded: false },
  };
  const refused = await encodeMoment(short, analysis.selection.stream.samples, { outPath: '/tmp/moment-short.webm' });
  assert.equal(refused.ok, false);
  assert.equal(refused.wroteFile, false);
  assert.equal(refused.reason, 'duration-out-of-bounds');
});

test('export one covered moment to a decodable WebM', { timeout: 120000 }, async () => {
  const tooling = await videoTooling();
  if (!tooling.ffmpeg || !tooling.vpx || !tooling.ffprobe) {
    assert.equal(tooling.unverified, true);
    return;
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'moment-machine-'));
  try {
    const analysis = analyzeMomentStream(situation(1));
    const outPath = path.join(dir, 'chain.webm');
    const encoded = await encodeMoment(analysis.plans[0], analysis.selection.stream.samples, {
      outPath,
      format: 'webm',
      tooling,
      width: 320,
      height: 180,
      fps: 10,
    });
    assert.equal(encoded.ok, true, JSON.stringify(encoded.verified || encoded));
    assert.equal(encoded.format, 'webm');
    assert.equal(encoded.verified.audio, false);
    assert.equal(encoded.verified.monotonic, true);
    assert.ok(Math.abs(encoded.verified.duration - 22) < 0.4);
    const file = await stat(outPath);
    assert.ok(file.size > 1000);
    const fallback = await encodeMoment(analysis.plans[0], analysis.selection.stream.samples, {
      outPath: path.join(dir, 'fallback.webm'),
      format: 'mp4',
      allowMp4: false,
      tooling,
    });
    assert.equal(fallback.ok, true);
    assert.equal(fallback.format, 'webm');
    assert.equal(fallback.fallback, 'mp4-unsupported');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('cli select and summary stay on the moment stream', () => {
  const summary = spawnSync(process.execPath, [CLI, 'summary'], { encoding: 'utf8' });
  assert.equal(summary.status, 0, summary.stderr);
  const parsed = JSON.parse(summary.stdout);
  assert.equal(parsed.situations, 40);
  assert.equal(parsed.encodeSet.length, 10);
  assert.ok(parsed.categories.length >= 6);
  const selected = spawnSync(process.execPath, [CLI, 'select', '--seed', '6'], { encoding: 'utf8' });
  assert.equal(selected.status, 0, selected.stderr);
  assert.equal(selected.stdout.includes('last_second_rescue'), true);
});

test('gapped pre-roll export does not claim the missing seconds', { timeout: 120000 }, async () => {
  const tooling = await videoTooling();
  if (!tooling.ffmpeg || !tooling.vpx) return;
  const dir = await mkdtemp(path.join(tmpdir(), 'moment-gap-'));
  try {
    const analysis = analyzeMomentStream(situation(35));
    const encoded = await encodeMoment(analysis.plans[0], analysis.selection.stream.samples, {
      outPath: path.join(dir, 'gap.webm'),
      format: 'webm',
      tooling,
    });
    assert.equal(encoded.ok, true, JSON.stringify(encoded.verified || encoded));
    assert.equal(encoded.claimsUnrecorded, true);
    assert.ok(encoded.missingPreTicks > 0);
    assert.ok(encoded.verified.duration < analysis.selection.ranked[0].seconds);
    assert.ok(encoded.verified.duration >= 15);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('batch writes ten distinct clips when video tooling is present', { timeout: 300000 }, async () => {
  const tooling = await videoTooling();
  const dir = await mkdtemp(path.join(tmpdir(), 'moment-batch-'));
  try {
    const index = await writeBatch(dir, { encode: tooling.ffmpeg === true && tooling.vpx === true, tooling });
    assert.equal(index.situations, 40);
    assert.ok(index.categoryCount >= 6);
    if (!tooling.ffmpeg || !tooling.vpx) {
      assert.equal(index.clipCount, 0);
      return;
    }
    assert.equal(index.clipCount, 10);
    assert.equal(index.videoVerified, true);
    const shapes = new Set(index.clips.map((clip) => clip.shape));
    assert.ok(shapes.size >= 6);
    const tones = new Set(index.clips.map((clip) => clip.tone));
    assert.equal(tones.has('feat'), true);
    assert.equal(tones.has('side-effect'), true);
    const saved = JSON.parse(await readFile(path.join(dir, 'index.json'), 'utf8'));
    assert.equal(saved.clipCount, 10);
    assert.equal(index.clips.some((clip) => clip.mp4Encode && clip.mp4Encode.ok), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
