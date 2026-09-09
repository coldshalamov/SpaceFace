// PQ-178.00 — beat standard. Headless. No soak. No headed capture.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BEAT_SCHEMA,
  BEAT_SHEET_DIR,
  B0_CHAPTER_REL,
  OPENER_47A_ID,
  REQUIRED_47A_ACTORS,
  SCENARIO_47A_REL,
  load47aScenario,
  loadBeatSheet,
  leftover47aMechanics,
  validateBeatCorpus,
  validateBeatSheet,
} from '../src/story/beatStandard.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OPENER_PATH = join(BEAT_SHEET_DIR, '47a-opener.beat.json');
const TEMPLATE_PATH = join(BEAT_SHEET_DIR, 'TEMPLATE.beat.json');
const CHECK = join(ROOT, 'scripts', 'check-beat-standard.mjs');

function runCheck(args = []) {
  return spawnSync(process.execPath, [CHECK, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 20_000,
    windowsHide: true,
  });
}

function writeTempSheet(name, value) {
  const dir = mkdtempSync(join(tmpdir(), 'pq178-'));
  const path = join(dir, name);
  writeFileSync(path, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

test('live corpus and leftover 47-A opener pass the standard without B0 collapse', () => {
  const template = loadBeatSheet(TEMPLATE_PATH);
  assert.equal(template.schema, BEAT_SCHEMA);
  assert.equal(template.kind, 'template');

  const opener = loadBeatSheet(OPENER_PATH);
  assert.equal(opener.id, OPENER_47A_ID);
  assert.equal(opener.leftoverSource.scenario, SCENARIO_47A_REL);
  assert.equal(opener.leftoverSource.notTheOpener, B0_CHAPTER_REL);

  const named = new Set(opener.setPiece.actors.map((actor) => actor.id));
  for (const id of REQUIRED_47A_ACTORS) {
    assert.ok(named.has(id), `47-A sheet must name leftover actor ${id}`);
  }

  const blob = JSON.stringify(opener);
  assert.doesNotMatch(blob, /mine 10u|Veldspar/i);
  assert.notEqual(String(opener.setPiece.headlineVerb).toLowerCase(), 'mine');

  const scenario = load47aScenario();
  const leftoverMech = leftover47aMechanics(scenario);
  assert.ok(leftoverMech.has('massline.attach'));
  assert.ok(leftoverMech.has('massline.cut'));
  const solutionMech = opener.setPiece.solutions.map((row) => row.leftoverMechanic);
  assert.ok(solutionMech.includes('massline.attach'), 'hitch leftover');
  assert.ok(solutionMech.includes('massline.cut'), 'cut leftover');

  const reports = validateBeatCorpus();
  assert.ok(reports.length >= 2, 'template + opener');
  for (const report of reports) {
    assert.deepEqual(report.issues, [], report.rel);
  }

  const cli = runCheck();
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.match(cli.stdout, /check-beat-standard: PASS/);
});

test('validator fails prose-only, choice menu, cutscene, single solution, and no physical verb', () => {
  const proseIssues = validateBeatSheet({
    kind: 'prose',
    prose: 'Mine 10u Veldspar and dock. The player reads a menu.',
  });
  assert.ok(proseIssues.some((row) => row.code === 'prose_only'), JSON.stringify(proseIssues));

  const menuIssues = validateBeatSheet({
    schema: BEAT_SCHEMA,
    id: 'beat.bad.menu',
    title: 'Menu',
    kind: 'choice_menu',
    choiceMenu: true,
    choices: [{ label: 'Talk', next: 'tree' }],
    canon: { whoWantsWhat: [{ actorId: 'player_kestrel', wants: 'pick a line' }] },
    register: { speakers: [{ id: 'npc', rule: 'talks', example: 'hello' }] },
    setPiece: {
      place: 'a room',
      actors: [{ id: 'player_kestrel' }, { id: 'npc' }],
      headlineVerb: 'choose',
      twist: 'a fork',
      solutions: [
        { verb: 'hitch', leftoverMechanic: 'massline.attach', how: 'a' },
        { verb: 'cut', leftoverMechanic: 'massline.cut', how: 'b' },
      ],
      provingFrame: 'a still',
    },
    barks: [{ line: 'Pick one.', consequence: 'a menu' }],
    voiceNotes: { direction: 'none' },
    seedCapture: { seed: 1, captureContract: 'none' },
    forbidden: { dialogueTree: false, choiceMenu: true, cutsceneTakesStick: false },
  });
  assert.ok(menuIssues.some((row) => row.code === 'choice_menu'), JSON.stringify(menuIssues));
  assert.ok(menuIssues.some((row) => row.code === 'no_physical_verb'), JSON.stringify(menuIssues));

  const cutsceneIssues = validateBeatSheet({
    schema: BEAT_SCHEMA,
    id: 'beat.bad.cutscene',
    title: 'Watch',
    kind: 'cutscene',
    takesStick: true,
    canon: { whoWantsWhat: [{ actorId: 'player_kestrel', wants: 'watch' }] },
    register: { speakers: [{ id: 'npc', rule: 'orates', example: 'behold' }] },
    setPiece: {
      place: 'a theater',
      actors: [{ id: 'player_kestrel' }, { id: 'npc' }],
      headlineVerb: 'watch',
      twist: 'credits',
      solutions: [
        { verb: 'hitch', leftoverMechanic: 'massline.attach', how: 'a' },
        { verb: 'cut', leftoverMechanic: 'massline.cut', how: 'b' },
      ],
      provingFrame: 'a movie',
    },
    barks: [{ line: 'Sit still.', consequence: 'stick taken' }],
    voiceNotes: { direction: 'none' },
    seedCapture: { seed: 1, captureContract: 'none' },
    forbidden: { dialogueTree: false, choiceMenu: false, cutsceneTakesStick: true },
  });
  assert.ok(cutsceneIssues.some((row) => row.code === 'cutscene_takes_stick'), JSON.stringify(cutsceneIssues));

  const singleIssues = validateBeatSheet({
    schema: BEAT_SCHEMA,
    id: 'beat.bad.single',
    title: 'One way',
    canon: { whoWantsWhat: [{ actorId: 'player_kestrel', wants: 'hitch' }] },
    register: { speakers: [{ id: 'kessler', rule: 'clerk', example: 'hitch it' }] },
    setPiece: {
      place: 'wreck field',
      actors: [{ id: 'player_kestrel' }, { id: 'evidence_spindle_47a' }],
      headlineVerb: 'hitch',
      twist: 'false mass',
      solutions: [{ verb: 'hitch', leftoverMechanic: 'massline.attach', how: 'attach only' }],
      provingFrame: 'one attach',
    },
    barks: [{ line: 'Hitch it.', consequence: 'attached' }],
    voiceNotes: { direction: 'clerk' },
    seedCapture: { seed: 47, captureContract: 'headless' },
    forbidden: { dialogueTree: false, choiceMenu: false, cutsceneTakesStick: false },
  });
  assert.ok(singleIssues.some((row) => row.code === 'single_solution'), JSON.stringify(singleIssues));

  const noVerbIssues = validateBeatSheet({
    schema: BEAT_SCHEMA,
    id: 'beat.bad.noverb',
    title: 'Talk',
    canon: { whoWantsWhat: [{ actorId: 'player_kestrel', wants: 'talk' }] },
    register: { speakers: [{ id: 'npc', rule: 'talks', example: 'hello' }] },
    setPiece: {
      place: 'a corridor',
      actors: [{ id: 'player_kestrel' }, { id: 'npc' }],
      headlineVerb: '',
      twist: 'words',
      solutions: [
        { verb: 'talk', leftoverMechanic: 'dialogue', how: 'tree' },
        { verb: 'decide', leftoverMechanic: 'menu', how: 'menu' },
      ],
      provingFrame: 'subtitles',
    },
    barks: [{ line: 'Hello.', consequence: 'nothing physical' }],
    voiceNotes: { direction: 'none' },
    seedCapture: { seed: 1, captureContract: 'none' },
    forbidden: { dialogueTree: false, choiceMenu: false, cutsceneTakesStick: false },
  });
  assert.ok(noVerbIssues.some((row) => row.code === 'no_physical_verb'), JSON.stringify(noVerbIssues));

  const proseFile = writeTempSheet('prose-only.beat.json', { prose: 'Once upon a time the player mined Veldspar.' });
  const proseCli = runCheck(['--file', proseFile]);
  assert.notEqual(proseCli.status, 0);
  assert.match(`${proseCli.stderr}\n${proseCli.stdout}`, /prose_only/);
});

test.after(() => {
  setImmediate(() => process.exit(process.exitCode ?? 0));
});
