// test/fun-report.test.mjs — PQ-173.03: the owner report renderer and the jargon lint.
//
// Vision sentence served (design/program/FUN_CONVERGENCE_LOOP.md §3.7): "Every cycle ends with a
// report a non-coder can use, and it is the only thing the owner reads."
// Fixtures are small inline summaries shaped like the committed receipt
// design/program/roadmap/receipts/fun-loop/2026-09-03-measure-summary.json. The bench is never run.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { JARGON_WORDS, REAL_PATH_BENCHES, SECTION_HEADINGS } from '../scripts/lib/report/constants.mjs';
import { lintJargon } from '../scripts/lib/report/lint.mjs';
import { buildReportModel, renderReport, framesSection } from '../scripts/lib/report/render.mjs';

const B2_TARGET = 'rest→cruise ≤ 1.5 s; 180° velocity reversal ≤ 3.0 s; turn radius at cruise ≤ 1 screen depth';
const B2_STATEMENT = 'From rest to cruise ≤ 1.5 s. Full 180° velocity reversal ≤ 3.0 s. Turn radius at cruise ≤ 1 screen depth.';
const B13_TARGET = '≤ 2 contact knocks per minute; largest ≤ 10 % of cruise; zero heading changes; no visible jitter';

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

function summary(b2Value, b2Met, b13Value, b13Met) {
  return {
    schema: 'spaceface.funMeasure.v1',
    timestamp: '2026-09-03T21:03:09.536Z',
    date: '2026-09-03',
    seeds: [13502, 4242],
    benches: {
      flight: {
        runs: [{
          runRef: 'flight flight-reversal seed 13502',
          bench: 'flight',
          scenarioId: 'flight-reversal',
          seed: 13502,
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
  };
}

function criticResult() {
  return {
    schema: 'spaceface.funCritic.v1',
    strip: {
      bench: 'crucible', scenarioId: 'swarm_run', seed: 4242,
      arenaId: 'helios_core', loadoutId: 'physics_toolkit',
      framesCount: 24, stripDir: '.devshots/strips/fix1', manifestPath: '.devshots/strips/fix1/manifest.json',
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
  };
}

function renderWith({ critic = criticResult(), before = summary(4.5, false, 5, false), after = summary(3.8, false, 4, false) } = {}) {
  const model = buildReportModel({
    title: 'Fix the shove feel',
    leaf: 'PQ-137.03',
    beforeSummary: before,
    afterSummary: after,
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
  for (const critic of [null, { ...criticResult(), rejected: true }, { ...criticResult(), answers: [] }]) {
    const { model, markdown } = renderWith({ critic });
    assert.match(model.frames.text, /No one has looked/, `critic ${JSON.stringify(critic && critic.rejected)} must not pretend anyone looked`);
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
  const critic = criticResult();
  const { text, table } = framesSection(critic);
  assert.match(text, /counted 8 of 9 good signs, so they thought it worked/);
  assert.match(text, /the shove finally sends the little ship tumbling away/);
  const rows = table.split('\n').filter((l) => l.startsWith('| before') || l.startsWith('| after'));
  assert.equal(rows.length, 2);
  for (const row of rows) {
    const images = row.match(/!\[[^\]]*\]\([^)]*\)/g) || [];
    assert.equal(images.length, 6, `expected six thumbnails per row, got ${images.length}`);
  }
  assert.ok(table.includes('(.devshots/strips/fix1/frame_000.png)'));
  assert.ok(table.includes('(.devshots/strips/fix1/frame_012.png)'));
  assert.ok(table.includes('(.devshots/strips/fix1/frame_023.png)'));
});

test('a cycle where nothing moved still renders all six sections and passes the lint', () => {
  const same = summary(4.5, false, 5, false);
  const { model, markdown } = renderWith({ before: same, after: same });
  assert.equal(model.verdict, 'REVERT');
  assert.match(model.changed, /nothing we measure moved yet/);
  assert.ok(SECTION_HEADINGS.every((h) => markdown.includes(`## ${h}`)));
  assert.equal(lintJargon(markdown).ok, true);
});
