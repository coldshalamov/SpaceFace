import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureStationHandoffScreenshot } from '../scripts/lib/stationHandoffDiagnostics.mjs';

// Normalize line endings: a Windows autocrlf checkout reads the script with CRLF and the block regex below is LF-anchored.
const source = (await readFile(new URL('../scripts/check-47a-live-cold-open.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const start = source.indexOf('  try {\n    const diagnostic = await captureFlightPicturePair');
const end = source.indexOf('\n\n  console.log(`47-A live cold open OK', start);
assert.ok(start >= 0 && end > start, 'the 47-A route owns its optional picture diagnostic');
const block = source.slice(start, end);
const run = new (Object.getPrototypeOf(async function(){}).constructor)(
  'captureFlightPicturePair', 'page', 'graphicsObserver', 'console', 'assert', 'issues',
  `return (async () => { ${block} })();`,
);

test('camera evidence is after original actor/safety assertions and before console acceptance', () => {
  assert.ok(start > source.indexOf('live cold open should not contain a hostile firing intent'));
  assert.ok(start < source.indexOf("assert.deepEqual(issues.errorIssues(), []"));
  assert.match(source, /captureFlightPicturePair, observeGraphicsMessages/);
});

test('capture failure remains diagnostic and does not mask the later acceptance gate', async () => {
  const warnings = [];
  await run(async () => { throw new Error('capture timeout'); }, {}, { snapshot: () => [] },
    { warn: value => warnings.push(value), log() {} }, { deepEqual() {} }, { errorIssues: () => [] });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /capture timeout/);
  assert.throws(() => assert.deepEqual(['original page error'], []));
});

test('capture reports actual artifact path without claiming the whole check passed', async () => {
  const logs = [], page = {};
  await run(async (actualPage, context) => { assert.equal(actualPage, page); assert.equal(typeof context.graphicsMessages, 'function'); return { path: '/artifact/pair.json', report: { status: 'telemetry-incomplete' } }; }, page, { snapshot: () => [] }, { log: value => logs.push(value), warn() { throw new Error('unexpected warning'); } }, { deepEqual() {} }, { errorIssues: () => [] });
  assert.deepEqual(logs, ['47-A game-camera diagnostic: /artifact/pair.json (telemetry-incomplete)']);
});

test('existing screenshot helper preserves default animation semantics and a two-second bound', async () => {
  const cwd = process.cwd(), directory = await mkdtemp(join(tmpdir(), 'spaceface-camera-diagnostic-'));
  try {
    process.chdir(directory);
    let options;
    const file = await captureStationHandoffScreenshot({ async screenshot(value) { options = value; } }, { boundary: '47a-actors-bound' });
    assert.equal(options.path, file); assert.equal(options.type, 'png'); assert.equal(options.timeout, 2000);
    assert.equal(Object.hasOwn(options, 'animations'), false); assert.equal(Object.hasOwn(options, 'style'), false);
    // Windows returns backslash separators; the contract is the path shape, not the separator.
    assert.match(file.replace(/\\/g, '/'), /scratch\/check-ci-report\/station-handoff\/\d+-47a-actors-bound\.png$/);
  } finally { process.chdir(cwd); await rm(directory, { recursive: true, force: true }); }
});
