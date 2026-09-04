import { buildMeasureDiff } from '../../measure-fun-loop.mjs';
import { REAL_PATH_BENCHES } from './constants.mjs';
import {
  capitalize,
  countWord,
  ensurePeriod,
  fmtNumber,
  plainSentence,
  plainValue,
} from './plainWords.mjs';

const MOVED_RANK = { toward: 0, away: 1, unknown: 2, unchanged: 3 };
const UNMEASURED_SENTENCE = 'Nothing in this cycle was measured on the real game yet.';
const NO_EYES_SENTENCE = 'No one has looked at the pictures from this pass yet, so there is nothing to see here.';

function flattenSummaryRuns(summary) {
  const runs = [];
  for (const benchName of Object.keys((summary && summary.benches) || {})) {
    for (const run of ((summary.benches[benchName] && summary.benches[benchName].runs) || [])) {
      runs.push({ bench: run.bench || benchName, ...run });
    }
  }
  return runs;
}

function headlineRow(bar) {
  return (Array.isArray(bar.rows) && bar.rows[0]) || {};
}

export function formatMeasure(value, unit, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  if (unit === 'fraction') {
    const pct = `${fmtNumber(value * 100)}%`;
    return /cruise|speed/i.test(String(label || '')) ? `${pct} of top speed` : pct;
  }
  return String(plainValue(value, unit));
}

function targetWords(target) {
  return plainSentence(String(target ?? ''));
}

function barTitle(bar) {
  return plainSentence((bar && bar.title) || 'A thing we measure');
}

function barDistance(bar) {
  const firstClause = String(bar.target ?? '').split(';')[0];
  const match = firstClause.match(/\d+(?:\.\d+)?/);
  const threshold = match ? Number(match[0]) : NaN;
  let value = Number(bar.after);
  if (!Number.isFinite(threshold) || !Number.isFinite(value)) return 0;
  if (Math.abs(value) <= 1 && threshold > 1) value *= 100;
  return Math.abs(value - threshold) / Math.max(1, threshold);
}

export function collectRealPathBars(diff, allowlist) {
  const real = [];
  const excludedTitles = [];
  const seenExcluded = new Set();
  const realTitles = new Set();
  for (const run of (diff && diff.runs) || []) {
    const isReal = allowlist.includes(run.bench);
    for (const bar of run.bars || []) {
      if (isReal) {
        real.push({ run, bar });
        realTitles.add(bar.title);
      } else if (!seenExcluded.has(bar.title)) {
        seenExcluded.add(bar.title);
        excludedTitles.push(bar.title);
      }
    }
  }
  return { real, excludedTitles: excludedTitles.filter((t) => !realTitles.has(t)) };
}

function sortedRows(real) {
  const rows = real.map(({ bar }) => {
    const head = headlineRow(bar);
    return {
      title: barTitle(bar),
      before: bar.before,
      after: bar.after,
      target: bar.target,
      unit: head.unit || '',
      label: head.label || '',
      direction: bar.direction,
    };
  });
  const deduped = [];
  const seen = new Set();
  for (const row of rows) {
    const key = `${row.title}|${row.before}|${row.after}|${row.target}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(row);
    }
  }
  deduped.sort((a, b) =>
    ((MOVED_RANK[a.direction] ?? 2) - (MOVED_RANK[b.direction] ?? 2)) || a.title.localeCompare(b.title));
  return deduped;
}

function excludedSentence(excludedTitles) {
  const n = excludedTitles.length;
  if (n === 0) return '';
  const lead = n === 1 ? 'One other thing was' : `${capitalize(countWord(n))} other things were`;
  return `${lead} measured on a practice rig instead of the real game, so they are not counted here yet: `
    + `${excludedTitles.join('; ')}.`;
}

export function numbersSection(diff, allowlist) {
  const { real, excludedTitles } = collectRealPathBars(diff, allowlist);
  const exclusion = excludedSentence(excludedTitles);
  if (real.length === 0) {
    const text = exclusion ? `${exclusion}\n\n${UNMEASURED_SENTENCE}` : UNMEASURED_SENTENCE;
    return { text, rows: [], excludedTitles };
  }
  const rows = sortedRows(real);
  const lines = [];
  lines.push('| What we measured | Before | After | What it should be |');
  lines.push('|---|---|---|---|');
  for (const row of rows) {
    const before = formatMeasure(row.before, row.unit, row.label);
    const after = formatMeasure(row.after, row.unit, row.label);
    lines.push(`| ${row.title} | ${before} | ${after} | ${targetWords(row.target)} |`);
  }
  const text = lines.join('\n') + (exclusion ? `\n\n${exclusion}` : '');
  return { text, rows, excludedTitles };
}

function feelSection(real) {
  const rows = sortedRows(real);
  const toward = rows.filter((r) => r.direction === 'toward');
  const first = toward.length === 0
    ? 'Nothing is different when you play yet.'
    : `When you play, ${toward
      .map((r) => `${r.title} went from ${formatMeasure(r.before, r.unit, r.label)} to ${formatMeasure(r.after, r.unit, r.label)}`)
      .join(', and ')}.`;
  const unmetTitles = [...new Set(real
    .filter(({ bar }) => bar.metAfter !== 'yes')
    .map(({ bar }) => barTitle(bar)))];
  const second = unmetTitles.length === 0
    ? 'Everything this pass measured now hits its target.'
    : `Still not right: ${unmetTitles.join('; ')}.`;
  return `${first} ${second}`;
}

function changedSection(title, leaf, real) {
  const label = leaf ? ` (${leaf})` : '';
  const moved = real.filter(({ bar }) => bar.direction && bar.direction !== 'unchanged');
  if (moved.length === 0) {
    return `This pass was "${title}"${label}; nothing we measure moved yet, so the game plays the same as before.`;
  }
  const lead = moved.length === 1 ? 'one thing we measure moved' : `${countWord(moved.length)} things we measure moved`;
  return `This pass was "${title}"${label}; ${lead}, and the rest held still.`;
}

function foundSection(critic, worst) {
  const f = critic && critic.fundamental;
  if (f && (f.does || f.breaksSentence)) {
    const does = plainSentence(f.does || 'the cause has not been named yet').replace(/\.+$/, '');
    const breaks = plainSentence(f.breaksSentence || '').replace(/\.+$/, '');
    const parts = [`The one thing to fix this week: ${does}`];
    if (breaks) parts.push(`it breaks the promise "${breaks}"`);
    return ensurePeriod(parts.join(' — '));
  }
  if (worst && worst.statement) {
    return ensurePeriod(capitalize(plainSentence(worst.statement)));
  }
  return 'Nothing was measured this week yet, so the problem has not been named.';
}

function nextSection(worst) {
  if (!worst) return 'Nothing is left unfinished among the things this pass measured.';
  const words = worst.statement
    ? plainSentence(worst.statement)
    : plainSentence((worst.bar && worst.bar.title) || 'the next thing to fix');
  return ensurePeriod(`Next worst thing: ${words}`);
}

function worstRealPathBar(real, afterSummary) {
  if (real.length === 0) return null;
  const statements = new Map();
  for (const run of flattenSummaryRuns(afterSummary)) {
    for (const bar of run.bars || []) {
      if (!statements.has(bar.id) && bar.statement) statements.set(bar.id, bar.statement);
    }
  }
  const ranked = real
    .map(({ bar }) => ({
      bar,
      statement: statements.get(bar.id) || '',
      distance: barDistance(bar),
    }))
    .sort((a, b) => ((a.bar.metAfter === 'yes') - (b.bar.metAfter === 'yes')) || (b.distance - a.distance));
  return ranked[0];
}

function evenlySpaced(count, start, end) {
  if (end < start) return Array.from({ length: count }, () => Math.max(0, start));
  return Array.from({ length: count }, (_, i) => start + Math.round(((end - start) * i) / (count - 1)));
}

function frameUrl(stripDir, index) {
  const dir = String(stripDir || '').replace(/[\\/]+$/, '').replace(/\\/g, '/');
  return `${dir}/frame_${String(index).padStart(3, '0')}.png`;
}

export function framesSection(critic) {
  const strip = critic && critic.rejected !== true ? critic.strip : null;
  const answers = Array.isArray(critic && critic.answers) ? critic.answers : [];
  const usable = strip
    && Number.isFinite(Number(strip.framesCount))
    && Number(strip.framesCount) >= 2
    && answers.length > 0;
  if (!usable) {
    return { text: NO_EYES_SENTENCE, table: '' };
  }
  const total = Number(strip.framesCount);
  const half = Math.floor(total / 2);
  const beforeIdx = evenlySpaced(6, 0, Math.max(0, half - 1));
  const afterIdx = evenlySpaced(6, Math.min(total - 1, half), total - 1);
  const rows = [
    { name: 'before', indices: beforeIdx },
    { name: 'after', indices: afterIdx },
  ];
  const tableLines = [];
  tableLines.push('| moment | 1 | 2 | 3 | 4 | 5 | 6 |');
  tableLines.push('|---|---|---|---|---|---|---|');
  for (const row of rows) {
    const cells = row.indices.map((i, n) => `![${row.name} picture ${n + 1}](${frameUrl(strip.stripDir, i)})`);
    tableLines.push(`| ${row.name} | ${cells.join(' | ')} |`);
  }
  const passCount = Number.isFinite(Number(critic.passCount)) ? Number(critic.passCount) : 0;
  const verdictWords = critic.pass ? 'thought it worked' : 'did not think it worked yet';
  const noted = answers.find((a) => a && typeof a.note === 'string' && a.note.trim());
  const quote = noted ? `; on one of the pictures they wrote: "${plainSentence(noted.note)}"` : '';
  const text = `The person who looked at the pictures counted ${passCount} of 9 good signs, `
    + `so they ${verdictWords}${quote}.`;
  return { text, table: tableLines.join('\n') };
}

export function buildReportModel(options) {
  const {
    title,
    leaf = '',
    beforeSummary,
    afterSummary,
    diff = null,
    critic = null,
    realPathBenches = REAL_PATH_BENCHES,
    generatedAt = null,
    inputs = {},
  } = options;
  const d = diff || buildMeasureDiff(beforeSummary, afterSummary, { timestamp: generatedAt || undefined });
  const allowlist = [...realPathBenches];
  const { real } = collectRealPathBars(d, allowlist);
  const worst = worstRealPathBar(real, afterSummary);
  return {
    schema: 'spaceface.funReport.v1',
    title,
    leaf,
    verdict: d.verdict,
    reason: d.reason,
    found: foundSection(critic, worst),
    changed: changedSection(title, leaf, real),
    feel: feelSection(real),
    numbers: numbersSection(d, allowlist),
    frames: framesSection(critic),
    next: nextSection(worst),
    runRefs: (d.runs || []).map((r) => r.runRef || r.key),
    notes: d.notes || [],
    inputs,
    generatedAt,
  };
}

function appendixBlock(model) {
  const lines = [
    '<!-- Engineering appendix — not part of the owner\'s page',
    `leaf: ${model.leaf || 'n/a'}`,
    `before: ${model.inputs.before || 'n/a'}`,
    `after: ${model.inputs.after || 'n/a'}`,
    `diff input: ${model.inputs.diff || 'computed from before and after'}`,
    `critic input: ${model.inputs.critic || 'none provided'}`,
    `verdict: ${model.verdict || 'n/a'} — ${model.reason || ''}`,
  ];
  for (const ref of model.runRefs || []) lines.push(`run: ${ref}`);
  for (const note of model.notes || []) lines.push(`note: ${plainSentence(note)}`);
  if (model.generatedAt) lines.push(`generated: ${model.generatedAt}`);
  lines.push('-->');
  return lines.join('\n');
}

export function renderReport(model) {
  const lines = [];
  lines.push(`# ${model.title}`);
  const topSections = [
    ['WHAT I FOUND', model.found],
    ['WHAT I CHANGED', model.changed],
    ['WHAT YOU WILL FEEL', model.feel],
  ];
  for (const [heading, body] of topSections) {
    lines.push('', `## ${heading}`, '', body || '');
  }
  lines.push('', '## THE NUMBERS', '', model.numbers.text, '');
  lines.push('## THE FRAMES', '', model.frames.text, '');
  if (model.frames.table) lines.push(model.frames.table, '');
  lines.push('## NEXT', '', model.next, '');
  lines.push(appendixBlock(model));
  return lines.join('\n');
}
