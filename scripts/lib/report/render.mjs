import { resolve, relative, dirname, isAbsolute, basename } from 'node:path';
import { buildMeasureDiff } from '../../measure-fun-loop.mjs';
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

export function flattenSummaryRuns(summary) {
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

export function exactSourceIdentitiesEqual(a, b) {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  return a.gitHead === b.gitHead
    && a.gitTree === b.gitTree
    && a.productionDirty === b.productionDirty
    && a.productionDiffHash === b.productionDiffHash
    && typeof a.gitHead === 'string' && a.gitHead.length > 0
    && typeof b.gitHead === 'string' && b.gitHead.length > 0
    && typeof a.gitTree === 'string' && a.gitTree.length > 0
    && typeof b.gitTree === 'string' && b.gitTree.length > 0
    && typeof a.productionDirty === 'boolean'
    && typeof b.productionDirty === 'boolean'
    && typeof a.productionDiffHash === 'string' && a.productionDiffHash.length > 0
    && typeof b.productionDiffHash === 'string' && b.productionDiffHash.length > 0;
}

function structuredRealPathProof(run) {
  if (!run) return null;
  const candidates = [run.realPathProof, run.metrics?.realPathProof, run.metrics?.proof];
  if (typeof run.realPath === 'object' && run.realPath !== null) candidates.push(run.realPath);
  for (const proof of candidates) {
    if (proof && typeof proof === 'object') return proof;
  }
  return null;
}

export function hasRealPathProvenance(run) {
  const proof = structuredRealPathProof(run);
  if (!proof) return false;
  return proof.sg02Ready === true
    && proof.backend === 'rapier-dynamic'
    && proof.physicsBackend === 'rapier-dynamic'
    && proof.flightBackend === 'v3';
}

export function isRealPathRun(run, allowlist = null) {
  if (!run) return false;
  if (hasRealPathProvenance(run)) return true;
  if (!allowlist || typeof allowlist !== 'object' || Array.isArray(allowlist)) return false;
  if (Array.isArray(allowlist.includeBenches) && run.bench && allowlist.includeBenches.includes(run.bench)) {
    return true;
  }
  if (Array.isArray(allowlist.includeScenarios) && run.scenarioId && allowlist.includeScenarios.includes(run.scenarioId)) {
    return true;
  }
  return false;
}

function reportRelativeLink(absPath, reportOutPath) {
  if (!reportOutPath || !absPath) return null;
  const reportDir = dirname(resolve(reportOutPath));
  const abs = resolve(absPath);
  const rel = relative(reportDir, abs).replace(/\\/g, '/');
  if (!rel || isAbsolute(rel) || /^[A-Za-z]:/.test(rel) || rel.startsWith('/')) return null;
  return rel;
}

function listedFrameBasename(frame) {
  if (!frame || typeof frame.file !== 'string' || !frame.file) return null;
  if (basename(frame.file) !== frame.file) return null;
  return frame.file;
}

export function collectRealPathBars(diff, allowlist = null) {
  const real = [];
  const excludedTitles = [];
  const seenExcluded = new Set();
  const realTitles = new Set();
  for (const run of (diff && diff.runs) || []) {
    const isReal = isRealPathRun(run, allowlist);
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
  const cleanTitle = String(title || '')
    .replace(/\bPQ-\d+(?:\.\d+)?\b/gi, '')
    .replace(/^[\s:—–-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const label = (leaf && !/PQ-/i.test(leaf)) ? ` (${leaf})` : '';
  const moved = real.filter(({ bar }) => bar.direction && bar.direction !== 'unchanged');
  if (moved.length === 0) {
    return `This pass was "${cleanTitle}"${label}; nothing we measure moved yet, so the game plays the same as before.`;
  }
  const lead = moved.length === 1 ? 'one thing we measure moved' : `${countWord(moved.length)} things we measure moved`;
  return `This pass was "${cleanTitle}"${label}; ${lead}, and the rest held still.`;
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

export function framesSection(arg1, arg2, options = {}) {
  let beforeCritic = null;
  let afterCritic = null;
  let opts = options;
  if (arg1 && arg2 && typeof arg2 === 'object' && !arg2.beforeCritic && !arg2.afterCritic) {
    beforeCritic = arg1;
    afterCritic = arg2;
  } else if (arg1 && typeof arg1 === 'object' && (arg1.beforeCritic || arg1.afterCritic)) {
    beforeCritic = arg1.beforeCritic;
    afterCritic = arg1.afterCritic;
    opts = arg2 || options;
  }

  // Refuse if either critic is missing, rejected, or same artifact (refusing to split one critic)
  const usable = beforeCritic
    && afterCritic
    && beforeCritic !== afterCritic
    && beforeCritic.rejected !== true
    && afterCritic.rejected !== true
    && beforeCritic.strip
    && afterCritic.strip
    && Array.isArray(beforeCritic.answers) && beforeCritic.answers.length > 0
    && Array.isArray(afterCritic.answers) && afterCritic.answers.length > 0
    && Array.isArray(beforeCritic.strip.frames) && beforeCritic.strip.frames.length >= 6
    && Array.isArray(afterCritic.strip.frames) && afterCritic.strip.frames.length >= 6;

  if (!usable) {
    return { text: NO_EYES_SENTENCE, table: '' };
  }

  const buildRowUrls = (strip, name) => {
    const frames = strip.frames;
    const total = frames.length;
    const picks = evenlySpaced(6, 0, total - 1);
    const result = [];
    for (let n = 0; n < picks.length; n++) {
      const frame = frames[picks[n]];
      const file = listedFrameBasename(frame);
      if (!file) return [];
      let href = null;
      if (opts.reportOutPath) {
        href = reportRelativeLink(resolve(strip.stripDir || '.', file), opts.reportOutPath);
      } else {
        const dir = String(strip.stripDir || '').replace(/[\\/]+$/, '').replace(/\\/g, '/');
        if (!dir || isAbsolute(dir) || /^[A-Za-z]:/.test(dir)) return [];
        href = `${dir}/${file}`;
      }
      if (!href) return [];
      result.push(`![${name} picture ${n + 1}](${href})`);
    }
    return result;
  };

  const contactHref = (strip) => {
    if (!strip.contactSheet) return null;
    if (opts.reportOutPath) {
      const abs = isAbsolute(strip.contactSheet)
        ? resolve(strip.contactSheet)
        : resolve(strip.receiptDir || strip.stripDir || '.', strip.contactSheet);
      return reportRelativeLink(abs, opts.reportOutPath);
    }
    const raw = String(strip.contactSheet).replace(/\\/g, '/');
    if (!raw || isAbsolute(raw) || /^[A-Za-z]:/.test(raw)) return null;
    return raw;
  };

  const beforeCells = buildRowUrls(beforeCritic.strip, 'before');
  const afterCells = buildRowUrls(afterCritic.strip, 'after');
  if (beforeCells.length !== 6 || afterCells.length !== 6) {
    return { text: NO_EYES_SENTENCE, table: '' };
  }

  const tableLines = [];
  tableLines.push('| moment | 1 | 2 | 3 | 4 | 5 | 6 |');
  tableLines.push('|---|---|---|---|---|---|---|');
  tableLines.push(`| before | ${beforeCells.join(' | ')} |`);
  tableLines.push(`| after | ${afterCells.join(' | ')} |`);
  const beforeSheet = contactHref(beforeCritic.strip);
  const afterSheet = contactHref(afterCritic.strip);
  if (beforeSheet) tableLines.push('', `Before contact sheet: ![before contact sheet](${beforeSheet})`);
  if (afterSheet) tableLines.push(`After contact sheet: ![after contact sheet](${afterSheet})`);

  const passCount = Number.isFinite(Number(afterCritic.passCount)) ? Number(afterCritic.passCount) : 0;
  const verdictWords = afterCritic.pass ? 'thought it worked' : 'did not think it worked yet';
  const noted = (afterCritic.answers && afterCritic.answers.find((a) => a && typeof a.note === 'string' && a.note.trim()))
    || (beforeCritic.answers && beforeCritic.answers.find((a) => a && typeof a.note === 'string' && a.note.trim()));
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
    beforeCritic = null,
    afterCritic = null,
    includeBenches = [],
    includeScenarios = [],
    reportOutPath = null,
    generatedAt = null,
    inputs = {},
  } = options;
  const d = diff || buildMeasureDiff(beforeSummary, afterSummary, { timestamp: generatedAt || undefined });
  if (d && Array.isArray(d.runs)) {
    const afterRuns = flattenSummaryRuns(afterSummary);
    const beforeRuns = flattenSummaryRuns(beforeSummary);
    const runMap = new Map();
    for (const r of beforeRuns) {
      if (r.runRef) runMap.set(r.runRef, r);
      if (r.key) runMap.set(r.key, r);
    }
    for (const r of afterRuns) {
      if (r.runRef) runMap.set(r.runRef, r);
      if (r.key) runMap.set(r.key, r);
    }
    for (const r of d.runs) {
      const src = runMap.get(r.runRef) || runMap.get(r.key)
        || runMap.get(`${r.bench || ''}|${r.scenarioId || ''}|${r.seed ?? ''}`);
      if (src) {
        if (r.realPath === undefined && src.realPath !== undefined) r.realPath = src.realPath;
        if (r.realPathProof === undefined && src.realPathProof !== undefined) r.realPathProof = src.realPathProof;
        if (r.provenance === undefined && src.provenance !== undefined) r.provenance = src.provenance;
        if (r.scenarioId === undefined && src.scenarioId !== undefined) r.scenarioId = src.scenarioId;
        if (r.metrics === undefined && src.metrics !== undefined) r.metrics = src.metrics;
      }
    }
  }
  const allowlist = {
    includeBenches: [...(includeBenches || [])],
    includeScenarios: [...(includeScenarios || [])],
  };
  const { real } = collectRealPathBars(d, allowlist);
  const worst = worstRealPathBar(real, afterSummary);
  const cleanTitle = (title || 'SpaceFace feel pass')
    .replace(/\bPQ-\d+(?:\.\d+)?\b/gi, '')
    .replace(/^[\s:—–-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  let effBeforeCritic = null;
  let effAfterCritic = null;

  if (beforeCritic && afterCritic && beforeCritic !== afterCritic) {
    const valid = !beforeCritic.rejected && !afterCritic.rejected
      && beforeCritic.strip && afterCritic.strip
      && Array.isArray(beforeCritic.strip.frames) && beforeCritic.strip.frames.length > 0
      && Array.isArray(afterCritic.strip.frames) && afterCritic.strip.frames.length > 0
      && beforeCritic.strip.manifestPath && afterCritic.strip.manifestPath
      && resolve(beforeCritic.strip.manifestPath) !== resolve(afterCritic.strip.manifestPath);

    const digestsMatch = beforeCritic.strip?.harnessDigest && afterCritic.strip?.harnessDigest
      && beforeCritic.strip.harnessDigest === afterCritic.strip.harnessDigest
      && (!beforeSummary?.harnessDigest || beforeCritic.strip.harnessDigest === beforeSummary.harnessDigest)
      && (!afterSummary?.harnessDigest || afterCritic.strip.harnessDigest === afterSummary.harnessDigest);

    const sourceMatches = exactSourceIdentitiesEqual(beforeCritic.strip.sourceIdentity, beforeSummary?.sourceIdentity)
      && exactSourceIdentitiesEqual(afterCritic.strip.sourceIdentity, afterSummary?.sourceIdentity);

    const sameSource = exactSourceIdentitiesEqual(beforeCritic.strip.sourceIdentity, afterCritic.strip.sourceIdentity);
    const sameFrames = Array.isArray(beforeCritic.strip.frames) && Array.isArray(afterCritic.strip.frames)
      && beforeCritic.strip.frames.length === afterCritic.strip.frames.length
      && beforeCritic.strip.frames.length > 0
      && beforeCritic.strip.frames.every((f, i) => f.file === afterCritic.strip.frames[i].file && f.tick === afterCritic.strip.frames[i].tick);
    const sameContact = beforeCritic.strip.contactSheet && afterCritic.strip.contactSheet
      && resolve(beforeCritic.strip.contactSheet) === resolve(afterCritic.strip.contactSheet);
    const notCloned = !(sameSource && digestsMatch && (sameFrames || sameContact));

    if (valid && digestsMatch && sourceMatches && notCloned) {
      effBeforeCritic = beforeCritic;
      effAfterCritic = afterCritic;
    }
  }

  return {
    schema: 'spaceface.funReport.v1',
    title: cleanTitle,
    leaf,
    verdict: d.verdict,
    reason: d.reason,
    found: foundSection(effAfterCritic, worst),
    changed: changedSection(cleanTitle, leaf, real),
    feel: feelSection(real),
    numbers: numbersSection(d, allowlist),
    frames: framesSection(effBeforeCritic, effAfterCritic, { reportOutPath }),
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
    `before critic: ${model.inputs.beforeCritic || 'none provided'}`,
    `after critic: ${model.inputs.afterCritic || 'none provided'}`,
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
  const displayTitle = (model.title || 'SpaceFace feel pass')
    .replace(/\bPQ-\d+(?:\.\d+)?\b/gi, '')
    .replace(/^[\s:—–-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  lines.push(`# ${displayTitle}`);
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
