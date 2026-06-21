import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedPath = resolve(ROOT, 'test/47a.presentation.expected.json');
const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));

assert.equal(expected.schema, 'spaceface.presentationGoldenTrace.v1', 'golden presentation trace schema should be pinned');
assert(Array.isArray(expected.cues) && expected.cues.length > 0, 'golden presentation trace should declare cues');

const args = [
  'scripts/sf-sim.mjs',
  'trace',
  expected.scenario,
  '--seed', String(expected.seed),
  '--ticks', String(expected.ticks),
  '--inputs', expected.inputTape,
  '--events', expected.events.join(','),
  '--limit', String(expected.traceLimit || 120),
];

const raw = execFileSync(process.execPath, args, {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});
const result = JSON.parse(raw);

assert.equal(result.schema, 'spaceface.sfSimTraceResult.v1', 'sf-sim trace should return the trace result schema');
assert.equal(result.deterministic, true, 'presentation golden trace run should be deterministic');
assert.equal(result.scenario, expected.scenario, 'trace scenario should match the golden file');
assert.equal(result.seed, expected.seed, 'trace seed should match the golden file');
assert.equal(result.ticks, expected.ticks, 'trace ticks should match the golden file');
assert.equal(result.inputTape, expected.inputTape, 'trace input tape should match the golden file');
assert.equal(result.sha256, expected.stateHash, 'golden presentation trace should pin the authoritative state hash');
assert(result.trace && result.trace.schema === 'spaceface.eventTrace.v1', 'trace result should include deterministic event records');

const records = result.trace.records || [];
assert(records.length > 0, 'trace result should include records');

for (const [type, count] of Object.entries(expected.summaryCounts || {})) {
  assert.equal(result.traceSummary.types[type], count, `trace summary count for ${type}`);
}

for (const cue of expected.cues) {
  checkCueWindow(records, cue);
}

console.log('SG-08 golden presentation trace checks OK');

function checkCueWindow(records, expectedCue) {
  const source = records.find((record) =>
    record.type === expectedCue.sourceEvent && record.tick === expectedCue.tick && sourceCarriesCue(record, expectedCue.id)
  );
  assert(source, `${expectedCue.id} source event should exist at tick ${expectedCue.tick}`);

  const cueRecord = records.find((record) => record.type === 'presentation:cue' && record.payload && record.payload.id === expectedCue.id);
  assert(cueRecord, `${expectedCue.id} presentation:cue should exist`);

  const windowRecords = records.filter((record) => {
    if (record.seq < source.seq || record.seq > cueRecord.seq) return false;
    if (record.seq === source.seq) return true;
    return recordCarriesCue(record, expectedCue.id);
  });
  assert.deepEqual(windowRecords.map((record) => record.type), expectedCue.orderedTypes, `${expectedCue.id} output order`);
  assert(windowRecords.every((record) => record.tick === source.tick), `${expectedCue.id} outputs should resolve on source tick`);

  const applied = findCueRecord(windowRecords, 'presentation:cueApplied', expectedCue.id);
  assert(applied, `${expectedCue.id} applied record should exist`);
  assert.equal(applied.tick - source.tick, expectedCue.sourceToAppliedTicks, `${expectedCue.id} source-to-applied tick delta`);
  assert.deepEqual(Object.keys(applied.payload.outputs || {}).sort(), [...expectedCue.outputLanes].sort(), `${expectedCue.id} output lanes`);

  const vfx = findCueRecord(windowRecords, 'presentation:vfxCue', expectedCue.id);
  assert(vfx, `${expectedCue.id} VFX output should exist`);
  assert.equal(vfx.payload.particles, expectedCue.particles, `${expectedCue.id} particle budget`);
  assert.equal(vfx.payload.lights, expectedCue.lights, `${expectedCue.id} light budget`);
  assert.equal(vfx.payload.flashReduced, false, `${expectedCue.id} default flash transform`);

  const audio = findCueRecord(windowRecords, 'audio:cue', expectedCue.id);
  assert(audio, `${expectedCue.id} audio output should exist`);
  assert.equal(audio.payload.id, expectedCue.audioId, `${expectedCue.id} audio cue id`);
  assert.equal(audio.payload.gain, expectedCue.audioGain, `${expectedCue.id} audio gain`);

  const ui = findCueRecord(windowRecords, 'alert', expectedCue.id);
  assert(ui, `${expectedCue.id} UI alert output should exist`);
  assert.equal(ui.payload.key, expectedCue.uiKey, `${expectedCue.id} UI key`);
  assert.equal(ui.payload.shape, expectedCue.shape, `${expectedCue.id} UI shape`);

  const caption = findCueRecord(windowRecords, 'presentation:caption', expectedCue.id);
  assert(caption, `${expectedCue.id} accessibility caption should exist`);
  assert.equal(caption.payload.shape, expectedCue.shape, `${expectedCue.id} caption shape`);
  assert.equal(caption.payload.reducedMotion, false, `${expectedCue.id} default motion transform`);

  const camera = findCueRecord(windowRecords, 'camera:shake', expectedCue.id);
  if (expectedCue.cameraAmount == null) {
    assert(!camera, `${expectedCue.id} should not emit camera shake without a camera budget`);
  } else {
    assert(camera, `${expectedCue.id} camera output should exist`);
    assert.equal(camera.payload.amount, expectedCue.cameraAmount, `${expectedCue.id} camera trauma amount`);
    assert.equal(camera.payload.reducedMotion, false, `${expectedCue.id} default camera motion transform`);
  }
}

function sourceCarriesCue(record, cueId) {
  if (record.type === 'scenario:beatEntered') return (record.payload.presentationEventIds || []).includes(cueId);
  if (record.type === 'tether:attached' && cueId === 'tether.attach') return true;
  if (record.type === 'tether:broken' && cueId === 'tether.break') return true;
  return recordCarriesCue(record, cueId);
}

function recordCarriesCue(record, cueId) {
  const payload = record && record.payload || {};
  return payload.id === cueId || payload.cueId === cueId;
}

function findCueRecord(records, type, cueId) {
  return records.find((record) => record.type === type && recordCarriesCue(record, cueId));
}
