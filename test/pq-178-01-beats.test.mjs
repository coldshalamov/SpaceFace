// PQ-178.01 — leftover beats 1–3 re-expressed in the leftover beat standard.
// Headless. No soak. No headed capture. Live settle remains PQ-032.00.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { EMBODIED_MISSIONS } from '../src/story/campaign47a/embodiedMissions.js';
import { BEAT_COMMS } from '../src/story/campaign47a/embodiedDialogue.js';
import {
  BEAT_SCHEMA,
  BEAT_SHEET_DIR,
  LEFTOVER_SPINE_ACTORS,
  LEFTOVER_SPINE_BEAT_IDS,
  LEFTOVER_SPINE_HEADLINES,
  LEFTOVER_SPINE_LIVE_SETTLE_REL,
  LEFTOVER_SPINE_SEED,
  LEFTOVER_SPINE_SHEET_IDS,
  OPENER_47A_ID,
  REQUIRED_47A_ACTORS,
  loadBeatSheet,
  leftoverSpineMethods,
  leftoverSpinePlaces,
  validateBeatCorpus,
  validateBeatSheet,
} from '../src/story/beatStandard.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CHECK = join(ROOT, 'scripts', 'check-beat-standard.mjs');
const TEMPLATE_PATH = join(BEAT_SHEET_DIR, 'TEMPLATE.beat.json');

const SHEET_FILES = Object.freeze({
  honest_work: join(BEAT_SHEET_DIR, '47a-honest-work.beat.json'),
  first_blood: join(BEAT_SHEET_DIR, '47a-first-blood.beat.json'),
  bigger_boat: join(BEAT_SHEET_DIR, '47a-bigger-boat.beat.json'),
});

function runCheck(args = []) {
  return spawnSync(process.execPath, [CHECK, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 20_000,
    windowsHide: true,
  });
}

function writeTempSheet(name, value) {
  const dir = mkdtempSync(join(tmpdir(), 'pq178-01-'));
  const path = join(dir, name);
  writeFileSync(path, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

test('leftover beats 1–3 are written, staged on the leftover template, and name two leftover solutions that exist', () => {
  const template = loadBeatSheet(TEMPLATE_PATH);
  assert.equal(template.schema, BEAT_SCHEMA);
  assert.ok(template.leftoverSpine && Array.isArray(template.leftoverSpine.beats));
  assert.equal(template.leftoverSpine.seed, LEFTOVER_SPINE_SEED);
  assert.equal(template.leftoverSpine.liveSettle, LEFTOVER_SPINE_LIVE_SETTLE_REL);

  const seeded = new Map(template.leftoverSpine.beats.map((row) => [row.id, row]));
  for (const beatId of LEFTOVER_SPINE_BEAT_IDS) {
    const seed = seeded.get(beatId);
    assert.ok(seed, `leftover template must seed leftover ${beatId}`);
    assert.equal(seed.sheetId, LEFTOVER_SPINE_SHEET_IDS[beatId]);
    assert.equal(seed.headlineVerb, LEFTOVER_SPINE_HEADLINES[beatId]);

    const leftoverMethods = leftoverSpineMethods(beatId);
    assert.equal(leftoverMethods.length, 2, `leftover ${beatId} has two leftover solutions`);
    assert.deepEqual(seed.solutions, leftoverMethods);

    const sheet = loadBeatSheet(SHEET_FILES[beatId]);
    assert.equal(sheet.id, LEFTOVER_SPINE_SHEET_IDS[beatId]);
    assert.equal(sheet.kind, 'leftover_spine');
    assert.equal(sheet.leftoverSource.beatId, beatId);
    assert.equal(sheet.leftoverSource.liveSettle, LEFTOVER_SPINE_LIVE_SETTLE_REL);
    assert.equal(sheet.setPiece.headlineVerb, LEFTOVER_SPINE_HEADLINES[beatId]);
    assert.equal(sheet.seedCapture.seed, LEFTOVER_SPINE_SEED);
    assert.equal(sheet.seedCapture.headedCapture, 'peeled');
    assert.equal(sheet.honesty.liveSettleIsPq03200, true);
    assert.equal(sheet.honesty.doesNotRecutLiveSettle, true);

    const named = new Set(sheet.setPiece.actors.map((actor) => actor.id));
    for (const id of LEFTOVER_SPINE_ACTORS[beatId]) {
      assert.ok(named.has(id), `leftover ${beatId} must name leftover actor ${id}`);
    }

    const placeBlob = `${sheet.setPiece.place} ${JSON.stringify(sheet.leftoverSource)}`;
    const leftoverPlaces = leftoverSpinePlaces(beatId);
    assert.ok(
      leftoverPlaces.some((token) => placeBlob.includes(token)),
      `leftover ${beatId} must cite leftover place`,
    );

    const blob = JSON.stringify(sheet);
    assert.doesNotMatch(blob, /mine 10u|Veldspar|mine and dock/i);

    const solutionMech = sheet.setPiece.solutions.map((row) => row.leftoverMechanic);
    assert.equal(sheet.setPiece.solutions.length, 2, `${beatId} names two leftover solutions`);
    for (const mech of leftoverMethods) {
      assert.ok(solutionMech.includes(mech), `${beatId} leftover solution ${mech} exists`);
    }

    const embodied = EMBODIED_MISSIONS.find((row) => row.id === beatId);
    assert.ok(embodied, `leftover ${beatId} exists on leftover sidecar`);
    assert.deepEqual(embodied.missionBoardContract.params.completionMethods, leftoverMethods);

    const issues = validateBeatSheet(sheet);
    assert.deepEqual(issues, [], `${beatId}: ${JSON.stringify(issues)}`);
  }

  // Leftover verbs: knock/whip, pull/pod, tow/core.
  const honest = loadBeatSheet(SHEET_FILES.honest_work);
  const first = loadBeatSheet(SHEET_FILES.first_blood);
  const bigger = loadBeatSheet(SHEET_FILES.bigger_boat);
  assert.equal(honest.setPiece.headlineVerb, 'knock');
  assert.ok(honest.setPiece.solutions.some((row) => row.verb === 'whip' && row.leftoverMechanic === 'wrecking_ball'));
  assert.ok(honest.setPiece.solutions.some((row) => row.leftoverMechanic === 'cut_down'));
  assert.equal(first.setPiece.headlineVerb, 'pull');
  assert.ok(first.setPiece.actors.some((row) => row.id === 'life_pod'));
  assert.ok(first.setPiece.solutions.some((row) => row.leftoverMechanic === 'stage_tow'));
  assert.ok(first.setPiece.solutions.some((row) => row.leftoverMechanic === 'corridor_pull'));
  assert.equal(bigger.setPiece.headlineVerb, 'tow');
  assert.ok(bigger.setPiece.actors.some((row) => row.id === 'slag_core'));
  assert.ok(bigger.setPiece.solutions.some((row) => row.leftoverMechanic === 'tow_in'));
  assert.ok(bigger.setPiece.solutions.some((row) => row.leftoverMechanic === 'sling_in'));
});

test('47-A opener stays without-loss; leftover corpus and CLI pass; hollow leftover sheet still fails', () => {
  const opener = loadBeatSheet(join(BEAT_SHEET_DIR, '47a-opener.beat.json'));
  assert.equal(opener.id, OPENER_47A_ID);
  const named = new Set(opener.setPiece.actors.map((actor) => actor.id));
  for (const id of REQUIRED_47A_ACTORS) {
    assert.ok(named.has(id), `47-A without-loss still names leftover actor ${id}`);
  }
  assert.doesNotMatch(JSON.stringify(opener), /mine 10u|Veldspar/i);

  const reports = validateBeatCorpus();
  assert.ok(reports.length >= 5, 'template + opener + leftover 1–3');
  for (const report of reports) {
    assert.deepEqual(report.issues, [], report.rel);
  }

  const cli = runCheck();
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.match(cli.stdout, /check-beat-standard: PASS/);

  const hollow = {
    schema: BEAT_SCHEMA,
    kind: 'template',
    id: 'beat.template',
    title: 'B1 wrecking-ball contract',
    leftoverSource: { beatId: 'honest_work' },
    canon: { whoWantsWhat: [] },
    register: { speakers: [] },
    setPiece: {
      place: '', actors: [], headlineVerb: '', twist: '', solutions: [], provingFrame: '',
    },
    barks: [],
    voiceNotes: {},
    seedCapture: {},
    forbidden: {},
  };
  const hollowIssues = validateBeatSheet(hollow);
  assert.ok(hollowIssues.some((row) => row.code === 'template'), JSON.stringify(hollowIssues));
  assert.ok(hollowIssues.some((row) => row.code === 'no_physical_verb'), 'hollow leftover still fails content');
  assert.ok(hollowIssues.some((row) => row.code === 'single_solution'), 'hollow leftover still fails two-solutions');

  const hollowFile = writeTempSheet('b1-wrecking-ball.beat.json', hollow);
  const hollowCli = runCheck(['--file', hollowFile]);
  assert.notEqual(hollowCli.status, 0, 'a hollow leftover sheet must fail the gate');
});

test('leftover comms are cited, not rewritten; invented leftover solutions fail', () => {
  const leftoverLines = new Map(BEAT_COMMS.map((row) => [row.id, String(row.text || '')]));
  let compared = 0;
  for (const beatId of LEFTOVER_SPINE_BEAT_IDS) {
    const sheet = loadBeatSheet(SHEET_FILES[beatId]);
    for (const bark of sheet.barks) {
      const leftover = leftoverLines.get(bark.id);
      if (leftover === undefined) continue;
      compared += 1;
      assert.equal(bark.line.trim(), leftover.trim(), `leftover bark ${bark.id} must not be rewritten`);
    }
  }
  assert.ok(compared >= 6, `expected leftover B1–B3 comms cited, compared ${compared}`);

  const honest = structuredClone(loadBeatSheet(SHEET_FILES.honest_work));
  honest.barks[0].line = 'Mine 10u Veldspar and dock.';
  const driftIssues = validateBeatSheet(honest);
  assert.ok(driftIssues.some((row) => row.code === 'rewritten_bark'), JSON.stringify(driftIssues));

  const invented = structuredClone(loadBeatSheet(SHEET_FILES.honest_work));
  invented.setPiece.solutions = [
    { verb: 'hitch', leftoverMechanic: 'massline.attach', how: 'invented hitch' },
    { verb: 'cut', leftoverMechanic: 'massline.cut', how: 'invented cut' },
  ];
  const inventedIssues = validateBeatSheet(invented);
  assert.ok(inventedIssues.some((row) => row.code === 'invented_solution'), JSON.stringify(inventedIssues));
});

test.after(() => {
  setImmediate(() => process.exit(process.exitCode ?? 0));
});
