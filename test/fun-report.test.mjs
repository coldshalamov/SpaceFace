// test/fun-report.test.mjs — PQ-173.03: the owner report renderer and the jargon lint.
//
// Vision sentence served (design/program/FUN_CONVERGENCE_LOOP.md §3.7): "Every cycle ends with a
// report a non-coder can use, and it is the only thing the owner reads."
// Fixtures are small inline summaries shaped like the committed receipt
// design/program/roadmap/receipts/fun-loop/2026-09-03-measure-summary.json. The bench is never run.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';

import { JARGON_WORDS, REAL_PATH_BENCHES, SECTION_HEADINGS } from '../scripts/lib/report/constants.mjs';
import { lintJargon } from '../scripts/lib/report/lint.mjs';
import { buildReportModel, renderReport, framesSection, isRealPathRun, hasRealPathProvenance } from '../scripts/lib/report/render.mjs';

const B2_TARGET = 'rest→cruise ≤ 1.5 s; 180° velocity reversal ≤ 3.0 s; turn radius at cruise ≤ 1 screen depth';
const B2_STATEMENT = 'From rest to cruise ≤ 1.5 s. Full 180° velocity reversal ≤ 3.0 s. Turn radius at cruise ≤ 1 screen depth.';
const B13_TARGET = '≤ 2 contact knocks per minute; largest ≤ 10 % of cruise; zero heading changes; no visible jitter';

const PRODUCTION_PROOF = {
  sg02Ready: true,
  backend: 'rapier-dynamic',
  physicsBackend: 'rapier-dynamic',
  flightBackend: 'v3',
  profileId: 'production',
};

function b2Bar(value, met) {
  return {
    id: 'B2',
    key: 'feel.reversal_course',
    title: 'Nimble regime',
    statement: B2_STATEMENT,
    target: B2_TARGET,
    reachable: true,
    met,
    values: [{ label: 'full 180° velocity reversal', value, unit: 's', met }],
  };
}

function b13Bar(value, met) {
  return {
    id: 'B13',
    key: 'feel.knock_budget',
    title: 'The player is never knocked around',
    statement: 'Contact changes the player\'s velocity at most twice per minute and never by more than a tenth of cruise.',
    target: B13_TARGET,
    reachable: true,
    met,
    values: [{ label: 'contact knocks per minute on the player', value, unit: 'events/min', met }],
  };
}

function summary(b2Value, b2Met, b13Value, b13Met, overrides = {}) {
  return {
    schema: 'spaceface.funMeasure.v1',
    timestamp: '2026-09-03T21:03:09.536Z',
    date: '2026-09-03',
    seeds: [13502, 4242],
    harnessDigest: 'sha256-fun-harness-digest-test-0123456789abcdef',
    sourceIdentity: {
      gitHead: '4691400baf96ffa5abb7f3df9ab9e1c83c55221a',
      gitTree: 'tree12345',
      productionDiffHash: '0'.repeat(64),
      productionDirty: false,
    },
    benches: {
      flight: {
        runs: [{
          runRef: 'flight flight-reversal seed 13502',
          bench: 'flight',
          scenarioId: 'flight-reversal',
          seed: 13502,
          realPathProof: PRODUCTION_PROOF,
          bars: [b2Bar(b2Value, b2Met)],
          funMetrics: {},
        }],
      },
      crucible: {
        runs: [{
          runRef: 'crucible helios_core/physics_toolkit seed 4242',
          bench: 'crucible',
          arenaId: 'helios_core',
          loadoutId: 'physics_toolkit',
          seed: 4242,
          bars: [b13Bar(b13Value, b13Met)],
          funMetrics: {},
        }],
      },
    },
    ...overrides,
  };
}

function criticResult(dir = '.devshots/strips/fix1', overrides = {}) {
  const frameCount = 24;
  const frames = Array.from({ length: frameCount }, (_, i) => ({
    index: i,
    file: `frame_${String(i).padStart(3, '0')}.jpg`,
    tick: i * 10,
    simTime: Number((i * 0.25).toFixed(3)),
  }));
  const { strip: stripOverrides, ...rest } = overrides;
  return {
    schema: 'spaceface.funCritic.v1',
    strip: {
      bench: 'crucible', scenarioId: 'swarm_run', seed: 4242,
      arenaId: 'helios_core', loadoutId: 'physics_toolkit',
      framesCount: frameCount,
      stripDir: dir,
      receiptDir: dir,
      manifestPath: `${dir}/manifest.json`,
      frameFormat: 'jpeg',
      contactSheet: `${dir}/contact_sheet.png`,
      harnessDigest: 'sha256-fun-harness-digest-test-0123456789abcdef',
      sourceIdentity: {
        gitHead: '4691400baf96ffa5abb7f3df9ab9e1c83c55221a',
        gitTree: 'tree12345',
        productionDiffHash: '0'.repeat(64),
        productionDirty: false,
      },
      frames,
      ...stripOverrides,
    },
    model: { route: 'agy/gemini-3.8-flash-high', label: 'Gemini 3.8 Flash High', wallMs: 41230 },
    answers: [
      { q: 1, question: 'Can I tell what the player did from the frames alone?', answer: 'yes', frameIndex: 7, note: 'the shove finally sends the little ship tumbling away' },
      { q: 2, question: 'Did the world answer within a third of a second?', answer: 'yes', frameIndex: 8, note: '' },
    ],
    fundamental: {
      rule: 'the knock budget is not enforced on the player hull',
      file: 'src/systems/someRule.js',
      does: 'a bump still shoves your hull around like a ghost pushing you',
      breaksSentence: 'A controllable mass, not a cursor',
      frameIndex: 11,
    },
    passCount: 8, pass: true, rejected: false, rejectReasons: [],
    ...rest,
  };
}

function beforeCriticResult(dir = '.devshots/strips/before', overrides = {}) {
  const { strip: stripOverrides, ...rest } = overrides;
  const frames = Array.from({ length: 24 }, (_, i) => ({
    index: i,
    file: `frame_${String(i).padStart(3, '0')}.jpg`,
    tick: i * 10,
    simTime: Number((i * 0.25).toFixed(3)),
  }));
  return criticResult(dir, {
    strip: {
      contactSheet: `${dir}/before_contact_sheet.png`,
      frames,
      ...stripOverrides,
    },
    answers: [
      { q: 1, question: 'Can I tell what the player did from the frames alone?', answer: 'yes', frameIndex: 5, note: 'before shove' },
    ],
    ...rest,
  });
}

function afterCriticResult(dir = '.devshots/strips/after', overrides = {}) {
  const { strip: stripOverrides, ...rest } = overrides;
  const frames = Array.from({ length: 24 }, (_, i) => ({
    index: i,
    file: `frame_${String(i).padStart(3, '0')}.jpg`,
    tick: i * 10 + 20,
    simTime: Number(((i * 10 + 20) / 60).toFixed(3)),
  }));
  return criticResult(dir, {
    strip: {
      contactSheet: `${dir}/after_contact_sheet.png`,
      frames,
      ...stripOverrides,
    },
    answers: [
      { q: 1, question: 'Can I tell what the player did from the frames alone?', answer: 'yes', frameIndex: 7, note: 'the shove finally sends the little ship tumbling away' },
    ],
    ...rest,
  });
}

function renderWith({
  beforeCritic = beforeCriticResult(),
  afterCritic = afterCriticResult(),
  critic = null,
  before = summary(4.5, false, 5, false),
  after = summary(3.8, false, 4, false),
  leaf = 'PQ-137.03',
  title = 'Fix the shove feel',
} = {}) {
  const model = buildReportModel({
    title,
    leaf,
    beforeSummary: before,
    afterSummary: after,
    beforeCritic,
    afterCritic,
    critic,
    generatedAt: '2026-09-03T22:00:00.000Z',
    inputs: { before: 'before.json', after: 'after.json' },
  });
  return { model, markdown: renderReport(model) };
}

function sectionBetween(markdown, heading, nextHeading) {
  const start = markdown.indexOf(`## ${heading}`);
  const end = markdown.indexOf(`## ${nextHeading}`);
  return markdown.slice(start, end);
}

test('the rendered report has exactly the six owner sections in the fixed order', () => {
  const { markdown } = renderWith();
  const positions = SECTION_HEADINGS.map((h) => markdown.indexOf(`## ${h}`));
  assert.ok(positions.every((p) => p > 0), 'Every cycle ends with a report a non-coder can use, and it is the only thing the owner reads.');
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'Every cycle ends with a report a non-coder can use, and it is the only thing the owner reads.');
  const others = [...markdown.matchAll(/^## /gm)].map((m) => m.index);
  assert.deepEqual(others, positions, 'Every cycle ends with a report a non-coder can use, and it is the only thing the owner reads.');
});

test('the jargon lint rejects a body carrying source paths and tuning words', () => {
  const { markdown } = renderWith();
  const poisoned = `${markdown.replace(/ Nimble regime /g, ' clamp regime ')}\nsee src/render/foo.js for the truth\n`;
  const result = lintJargon(poisoned);
  assert.equal(result.ok, false, 'Every cycle ends with a report a non-coder can use, and it is the only thing the owner reads.');
  const words = result.violations.map((v) => v.word);
  assert.ok(words.includes('clamp'), `expected "clamp" flagged, got ${JSON.stringify(words)}`);
  assert.ok(words.includes('src/'), `expected "src/" flagged, got ${JSON.stringify(words)}`);
  assert.ok(JARGON_WORDS.includes('clamp') && JARGON_WORDS.includes('src/'));
});

test('the rendered report passes the jargon lint with no rewrite', () => {
  const { markdown } = renderWith();
  const result = lintJargon(markdown);
  assert.deepEqual(result.violations, [], 'Every cycle ends with a report a non-coder can use, and it is the only thing the owner reads.');
  assert.equal(result.ok, true);
});

test('a missing or rejected critic result still renders THE FRAMES saying nobody has looked', () => {
  for (const criticConfig of [
    { beforeCritic: null, afterCritic: null },
    { beforeCritic: beforeCriticResult(), afterCritic: null },
    { beforeCritic: null, afterCritic: afterCriticResult() },
    { beforeCritic: { ...beforeCriticResult(), rejected: true }, afterCritic: afterCriticResult() },
    { beforeCritic: beforeCriticResult(), afterCritic: { ...afterCriticResult(), rejected: true } },
    { beforeCritic: { ...beforeCriticResult(), answers: [] }, afterCritic: afterCriticResult() },
  ]) {
    const { model, markdown } = renderWith(criticConfig);
    assert.match(model.frames.text, /No one has looked/, `critic config ${JSON.stringify(criticConfig)} must not pretend anyone looked`);
    assert.match(sectionBetween(markdown, 'THE FRAMES', 'NEXT'), /No one has looked/);
    assert.equal(model.frames.table, '');
    assert.ok(SECTION_HEADINGS.every((h) => markdown.includes(`## ${h}`)));
  }
});

test('a stand-in bench bar never reaches THE NUMBERS table; the practice-rig sentence names it instead', () => {
  assert.deepEqual(REAL_PATH_BENCHES, ['flight']);
  const { model, markdown } = renderWith();
  const numbers = sectionBetween(markdown, 'THE NUMBERS', 'THE FRAMES');
  const tableRows = numbers.split('\n').filter((l) => l.startsWith('| Nimble') || l.startsWith('| The player'));
  assert.ok(tableRows.some((l) => l.includes('Nimble regime')), 'the real-flight bar belongs in the table');
  assert.ok(tableRows.every((l) => !l.includes('The player is never knocked around')), 'Every cycle ends with a report a non-coder can use, and it is the only thing the owner reads.');
  assert.match(numbers, /practice rig instead of the real game/);
  assert.match(numbers, /The player is never knocked around/);
  assert.equal(model.numbers.rows.length, 1);
  assert.deepEqual(model.numbers.excludedTitles, ['The player is never knocked around']);
});

test('THE NUMBERS rows carry the moved bar first, player units, and the target in plain words', () => {
  const { model } = renderWith();
  const [row] = model.numbers.rows;
  assert.equal(row.title, 'Nimble regime');
  assert.equal(row.direction, 'toward');
  assert.equal(row.before, 4.5);
  assert.equal(row.after, 3.8);
  const markdown = renderReport({ ...model, frames: { text: model.frames.text, table: '' } });
  assert.match(markdown, /\| Nimble regime \| 4\.5 seconds \| 3\.8 seconds \|/);
});

test('WHAT YOU WILL FEEL and NEXT speak in player words about what moved and what is still unmet', () => {
  const { model, markdown } = renderWith();
  assert.equal(model.feel, 'When you play, Nimble regime went from 4.5 seconds to 3.8 seconds. Still not right: Nimble regime.');
  assert.match(model.next, /^Next worst thing: From rest to cruise ≤ 1\.5 seconds/);
  assert.match(sectionBetween(markdown, 'WHAT YOU WILL FEEL', 'THE NUMBERS'), /Nothing is different|When you play/);
});

test('WHAT I FOUND names the critic fundamental in plain words without the file name', () => {
  const { model, markdown } = renderWith();
  assert.match(model.found, /a bump still shoves your hull around like a ghost pushing you/);
  assert.match(model.found, /A controllable mass, not a cursor/);
  assert.doesNotMatch(sectionBetween(markdown, 'WHAT I FOUND', 'WHAT I CHANGED'), /someRule|\.js|src\//);
});

test('THE FRAMES builds two rows of six evenly spaced picture links and quotes the looker', () => {
  const before = beforeCriticResult('.devshots/strips/before');
  const after = afterCriticResult('.devshots/strips/after', { passCount: 8, pass: true });
  const { text, table } = framesSection(before, after);
  assert.match(text, /counted 8 of 9 good signs, so they thought it worked/);
  assert.match(text, /the shove finally sends the little ship tumbling away/);
  const rows = table.split('\n').filter((l) => l.startsWith('| before') || l.startsWith('| after'));
  assert.equal(rows.length, 2);
  for (const row of rows) {
    const images = row.match(/!\[[^\]]*\]\([^)]*\)/g) || [];
    assert.equal(images.length, 6, `expected six thumbnails per row, got ${images.length}`);
  }
  assert.ok(table.includes('(.devshots/strips/before/frame_000.jpg)'));
  assert.ok(table.includes('(.devshots/strips/before/frame_014.jpg)'));
  assert.ok(table.includes('(.devshots/strips/before/frame_023.jpg)'));
  assert.ok(table.includes('(.devshots/strips/after/frame_000.jpg)'));
  assert.ok(table.includes('(.devshots/strips/after/frame_023.jpg)'));
  assert.ok(table.includes('before_contact_sheet.png'));
  assert.ok(table.includes('after_contact_sheet.png'));
});

test('framesSection refuses single critic or splitting one critic artifact', () => {
  const critic = criticResult();
  const single = framesSection(critic);
  assert.equal(single.text, 'No one has looked at the pictures from this pass yet, so there is nothing to see here.');
  assert.equal(single.table, '');

  const duplicate = framesSection(critic, critic);
  assert.equal(duplicate.text, 'No one has looked at the pictures from this pass yet, so there is nothing to see here.');
  assert.equal(duplicate.table, '');
});

test('report sanitizes visible PQ-* leaf IDs and jargon lint fails on any leak', () => {
  const { markdown, model } = renderWith({ leaf: 'PQ-173.03', title: 'PQ-173.03: Fix the shove feel' });
  // Visible headings/text do not contain PQ-173.03
  assert.equal(model.title, 'Fix the shove feel');
  assert.doesNotMatch(markdown.split('<!--')[0], /\bPQ-\d+/);
  // HTML comment appendix keeps the leaf ID
  assert.match(markdown, /<!--\s*Engineering appendix[\s\S]*?leaf:\s*PQ-173\.03/);
  // Jargon lint passes
  assert.equal(lintJargon(markdown).ok, true);

  // If PQ- is leaked in visible text, jargon lint fails
  const leaked = markdown.replace('When you play', 'When you play PQ-173.03');
  const lint = lintJargon(leaked);
  assert.equal(lint.ok, false);
  assert.ok(lint.violations.some((v) => v.word === 'PQ-'));
});

test('real-path labeling is evaluated per run rather than whole-bench blanket inclusion', () => {
  const b = summary(4.5, false, 5, false);
  const a = summary(3.8, false, 4, false);

  a.benches.crucible.runs.push({
    runRef: 'crucible helios_core/laser seed 4242',
    bench: 'crucible',
    arenaId: 'helios_core',
    loadoutId: 'laser',
    seed: 4242,
    realPathProof: PRODUCTION_PROOF,
    bars: [b2Bar(3.5, false)],
    funMetrics: {},
  });
  b.benches.crucible.runs.push({
    runRef: 'crucible helios_core/laser seed 4242',
    bench: 'crucible',
    arenaId: 'helios_core',
    loadoutId: 'laser',
    seed: 4242,
    realPathProof: PRODUCTION_PROOF,
    bars: [b2Bar(4.0, false)],
    funMetrics: {},
  });

  const { model, markdown } = renderWith({ before: b, after: a });
  assert.ok(model.numbers.rows.length >= 1);
  assert.ok(model.numbers.excludedTitles.includes('The player is never knocked around'));
  assert.match(sectionBetween(markdown, 'THE NUMBERS', 'THE FRAMES'), /practice rig/);
});

async function materializeCriticStrip(critic) {
  await mkdir(critic.strip.stripDir, { recursive: true });
  if (critic.strip.receiptDir) await mkdir(critic.strip.receiptDir, { recursive: true });
  for (const f of critic.strip.frames) {
    await writeFile(join(critic.strip.stripDir, f.file), 'jpeg-bytes', 'utf8');
  }
  await writeFile(critic.strip.contactSheet, 'png-bytes', 'utf8');
}

test('report CLI refuses single critic, mismatched harness, or missing provenance', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sf-report-test-'));
  try {
    const beforeFile = join(tmp, 'before.json');
    const afterFile = join(tmp, 'after.json');
    const criticBeforeFile = join(tmp, 'critic-before.json');
    const criticAfterFile = join(tmp, 'critic-after.json');
    const beforeDir = join(tmp, 'before-strip');
    const afterDir = join(tmp, 'after-strip');

    const bSummary = summary(4.5, false, 5, false);
    const aSummary = summary(3.8, false, 4, false);
    const bCritic = beforeCriticResult(beforeDir);
    const aCritic = afterCriticResult(afterDir);
    await materializeCriticStrip(bCritic);
    await materializeCriticStrip(aCritic);

    await writeFile(beforeFile, JSON.stringify(bSummary, null, 2), 'utf8');
    await writeFile(afterFile, JSON.stringify(aSummary, null, 2), 'utf8');
    await writeFile(criticBeforeFile, JSON.stringify(bCritic, null, 2), 'utf8');
    await writeFile(criticAfterFile, JSON.stringify(aCritic, null, 2), 'utf8');

    const runCli = (args) => spawnSync(process.execPath, ['scripts/report-fun-loop.mjs', ...args], {
      encoding: 'utf8',
      cwd: resolve('.'),
    });

    // Valid invocation succeeds
    const okRes = runCli([
      '--before', beforeFile,
      '--after', afterFile,
      '--before-critic', criticBeforeFile,
      '--after-critic', criticAfterFile,
    ]);
    assert.equal(okRes.status, 0, `expected 0, got error: ${okRes.stderr}`);

    // Refuses single --critic
    const singleCriticRes = runCli([
      '--before', beforeFile,
      '--after', afterFile,
      '--critic', criticBeforeFile,
    ]);
    assert.notEqual(singleCriticRes.status, 0);
    assert.match(singleCriticRes.stderr, /refusing to split one critic artifact/);

    // Refuses when only --before-critic is provided
    const missingAfterRes = runCli([
      '--before', beforeFile,
      '--after', afterFile,
      '--before-critic', criticBeforeFile,
    ]);
    assert.notEqual(missingAfterRes.status, 0);
    assert.match(missingAfterRes.stderr, /both --before-critic and --after-critic are required/);

    // Refuses when before and after critic are the same file
    const sameFileRes = runCli([
      '--before', beforeFile,
      '--after', afterFile,
      '--before-critic', criticBeforeFile,
      '--after-critic', criticBeforeFile,
    ]);
    assert.notEqual(sameFileRes.status, 0);
    assert.match(sameFileRes.stderr, /must be distinct files/);

    // Refuses when summaries have mismatched harnessDigest
    const badHarnessSummary = { ...aSummary, harnessDigest: 'sha256-mismatched-digest' };
    const badHarnessFile = join(tmp, 'after-bad-harness.json');
    await writeFile(badHarnessFile, JSON.stringify(badHarnessSummary, null, 2), 'utf8');
    const mismatchHarnessRes = runCli([
      '--before', beforeFile,
      '--after', badHarnessFile,
    ]);
    assert.notEqual(mismatchHarnessRes.status, 0);
    assert.match(mismatchHarnessRes.stderr, /harnessDigest mismatch/);

    // Refuses when summaries are missing sourceIdentity
    const noSourceSummary = { ...aSummary, sourceIdentity: null };
    const noSourceFile = join(tmp, 'after-no-source.json');
    await writeFile(noSourceFile, JSON.stringify(noSourceSummary, null, 2), 'utf8');
    const noSourceRes = runCli([
      '--before', beforeFile,
      '--after', noSourceFile,
    ]);
    assert.notEqual(noSourceRes.status, 0);
    assert.match(noSourceRes.stderr, /missing sourceIdentity/);

    // Refuses when critics have mismatched harnessDigest
    const badCritic = {
      ...aCritic,
      strip: { ...aCritic.strip, harnessDigest: 'sha256-other-harness' },
    };
    const badCriticFile = join(tmp, 'critic-bad.json');
    await writeFile(badCriticFile, JSON.stringify(badCritic, null, 2), 'utf8');
    const mismatchCriticHarnessRes = runCli([
      '--before', beforeFile,
      '--after', afterFile,
      '--before-critic', criticBeforeFile,
      '--after-critic', badCriticFile,
    ]);
    assert.notEqual(mismatchCriticHarnessRes.status, 0);
    assert.match(mismatchCriticHarnessRes.stderr, /mismatched harnessDigest/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('a cycle where nothing moved still renders all six sections and passes the lint', () => {
  const same = summary(4.5, false, 5, false);
  const { model, markdown } = renderWith({ before: same, after: same });
  assert.equal(model.verdict, 'REVERT');
  assert.match(model.changed, /nothing we measure moved yet/);
  assert.ok(SECTION_HEADINGS.every((h) => markdown.includes(`## ${h}`)));
  assert.equal(lintJargon(markdown).ok, true);
});

test('a legacy critic object never authors WHAT I FOUND or THE FRAMES', () => {
  const { model } = renderWith({
    beforeCritic: null,
    afterCritic: null,
    critic: afterCriticResult(),
  });
  assert.doesNotMatch(model.found, /a bump still shoves your hull/);
  assert.match(model.frames.text, /No one has looked/);
  assert.equal(model.frames.table, '');
});

test('framesSection refuses synthesized names, absent frames, and absolute links without --out', () => {
  const before = beforeCriticResult('.devshots/strips/before');
  const counted = { ...before, strip: { ...before.strip, frames: [], framesCount: 24 } };
  const after = afterCriticResult('.devshots/strips/after');
  const missing = framesSection(counted, after);
  assert.match(missing.text, /No one has looked/);
  assert.equal(missing.table, '');

  const absBefore = beforeCriticResult('C:/abs/before');
  const absAfter = afterCriticResult('C:/abs/after');
  const abs = framesSection(absBefore, absAfter);
  assert.match(abs.text, /No one has looked/);
});

test('toy verbs with realPath true and unproved flight rows are not real-path', () => {
  assert.equal(hasRealPathProvenance({ realPath: true }), false);
  assert.equal(hasRealPathProvenance({
    bench: 'flight',
    realPath: true,
    realPathProof: 'shipping_chase camera + sg02 sim',
  }), false);
  assert.equal(isRealPathRun({ bench: 'flight', realPath: true }), false);
  assert.equal(isRealPathRun({
    bench: 'verb',
    scenarioId: 'feel.toy',
    realPath: true,
  }), false);
  assert.equal(isRealPathRun({
    bench: 'flight',
    realPathProof: PRODUCTION_PROOF,
  }), true);
  assert.equal(isRealPathRun({ bench: 'crucible' }, { includeBenches: ['crucible'] }), true);
  assert.equal(isRealPathRun({ bench: 'crucible', scenarioId: 'swarm_idle' }, { includeScenarios: ['swarm_idle'] }), true);
  assert.equal(isRealPathRun({ bench: 'crucible' }, { includeScenarios: ['crucible'] }), false);
  assert.equal(isRealPathRun({ bench: 'flight' }, ['flight']), false);

  const unproved = summary(4.5, false, 5, false);
  unproved.benches.flight.runs[0].realPath = true;
  unproved.benches.flight.runs[0].realPathProof = 'sg02 substring is not proof';
  const proved = summary(3.8, false, 4, false);
  proved.benches.flight.runs[0].realPath = true;
  proved.benches.flight.runs[0].realPathProof = 'sg02 substring is not proof';
  const { model } = renderWith({ before: unproved, after: proved });
  assert.equal(model.numbers.rows.length, 0);
  assert.ok(model.numbers.excludedTitles.includes('Nimble regime'));
});

test('report CLI default path excludes unproved flight; include-bench and include-scenario stay distinct', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sf-report-cli-path-'));
  try {
    const unproved = summary(4.5, false, 5, false);
    unproved.benches.flight.runs[0].realPathProof = 'sg02';
    const unprovedAfter = summary(3.8, false, 4, false);
    unprovedAfter.benches.flight.runs[0].realPathProof = 'sg02';
    const beforeFile = join(tmp, 'before.json');
    const afterFile = join(tmp, 'after.json');
    await writeFile(beforeFile, JSON.stringify(unproved), 'utf8');
    await writeFile(afterFile, JSON.stringify(unprovedAfter), 'utf8');
    const runCli = (args) => spawnSync(process.execPath, ['scripts/report-fun-loop.mjs', ...args], {
      encoding: 'utf8',
      cwd: resolve('.'),
    });

    const def = runCli(['--before', beforeFile, '--after', afterFile]);
    assert.equal(def.status, 0, def.stderr);
    assert.match(def.stdout, /practice rig/);
    assert.doesNotMatch(def.stdout.split('## THE FRAMES')[0], /\| Nimble regime \|/);

    const byBench = runCli(['--before', beforeFile, '--after', afterFile, '--include-bench', 'crucible']);
    assert.equal(byBench.status, 0, byBench.stderr);
    assert.match(byBench.stdout, /\| The player is never knocked around \|/);

    const byScenario = runCli(['--before', beforeFile, '--after', afterFile, '--include-scenario', 'flight-reversal']);
    assert.equal(byScenario.status, 0, byScenario.stderr);
    assert.match(byScenario.stdout, /\| Nimble regime \|/);
    assert.match(byScenario.stdout, /practice rig/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('report CLI refuses cloned critics, empty manifest paths, cross-candidate identity, and dead links', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sf-report-cli-clone-'));
  try {
    const beforeFile = join(tmp, 'before.json');
    const afterFile = join(tmp, 'after.json');
    const beforeDir = join(tmp, 'before-strip');
    const afterDir = join(tmp, 'after-strip');
    const bCritic = beforeCriticResult(beforeDir);
    const aCritic = afterCriticResult(afterDir);
    await materializeCriticStrip(bCritic);
    await materializeCriticStrip(aCritic);
    await writeFile(beforeFile, JSON.stringify(summary(4.5, false, 5, false)), 'utf8');
    await writeFile(afterFile, JSON.stringify(summary(3.8, false, 4, false)), 'utf8');
    const runCli = (args) => spawnSync(process.execPath, ['scripts/report-fun-loop.mjs', ...args], {
      encoding: 'utf8',
      cwd: resolve('.'),
    });

    const clone = {
      ...aCritic,
      strip: {
        ...bCritic.strip,
        manifestPath: join(afterDir, 'relabelled-manifest.json'),
      },
    };
    const cloneFile = join(tmp, 'clone.json');
    const beforeCriticFile = join(tmp, 'b.json');
    await writeFile(cloneFile, JSON.stringify(clone), 'utf8');
    await writeFile(beforeCriticFile, JSON.stringify(bCritic), 'utf8');
    const cloned = runCli(['--before', beforeFile, '--after', afterFile, '--before-critic', beforeCriticFile, '--after-critic', cloneFile]);
    assert.notEqual(cloned.status, 0);
    assert.match(cloned.stderr, /cloned or relabelled|identical strip frames|contact sheet/);

    const emptyPath = {
      ...aCritic,
      strip: { ...aCritic.strip, manifestPath: '' },
    };
    const emptyFile = join(tmp, 'empty-manifest.json');
    await writeFile(emptyFile, JSON.stringify(emptyPath), 'utf8');
    const emptyRes = runCli(['--before', beforeFile, '--after', afterFile, '--before-critic', beforeCriticFile, '--after-critic', emptyFile]);
    assert.notEqual(emptyRes.status, 0);
    assert.match(emptyRes.stderr, /manifestPath/);

    const otherHead = {
      ...aCritic,
      strip: {
        ...aCritic.strip,
        sourceIdentity: { ...aCritic.strip.sourceIdentity, gitHead: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      },
    };
    const otherFile = join(tmp, 'other-head.json');
    await writeFile(otherFile, JSON.stringify(otherHead), 'utf8');
    const cross = runCli(['--before', beforeFile, '--after', afterFile, '--before-critic', beforeCriticFile, '--after-critic', otherFile]);
    assert.notEqual(cross.status, 0);
    assert.match(cross.stderr, /sourceIdentity/);

    const ghost = afterCriticResult(join(tmp, 'ghost-strip'));
    const ghostFile = join(tmp, 'ghost.json');
    await writeFile(ghostFile, JSON.stringify(ghost), 'utf8');
    const dead = runCli(['--before', beforeFile, '--after', afterFile, '--before-critic', beforeCriticFile, '--after-critic', ghostFile]);
    assert.notEqual(dead.status, 0);
    assert.match(dead.stderr, /missing|nonzero regular file|escaped/);

    const outFile = join(tmp, 'out', 'report.md');
    await mkdir(join(tmp, 'out'));
    const afterCriticFile = join(tmp, 'a.json');
    await writeFile(afterCriticFile, JSON.stringify(aCritic), 'utf8');
    const okOut = runCli([
      '--before', beforeFile,
      '--after', afterFile,
      '--before-critic', beforeCriticFile,
      '--after-critic', afterCriticFile,
      '--out', outFile,
    ]);
    assert.equal(okOut.status, 0, okOut.stderr);
    const { readFile } = await import('node:fs/promises');
    const page = await readFile(outFile, 'utf8');
    assert.match(page, /!\[before picture 1\]\(\.\.\/before-strip\/frame_000\.jpg\)/);
    assert.doesNotMatch(page.split('<!--')[0], /C:\\\\|C:\//);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
