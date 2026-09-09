#!/usr/bin/env node
// scripts/report-fun-loop.mjs — The Fun Convergence Loop owner-report renderer (PQ-173.03).
//
// Takes a BEFORE measure summary, an AFTER measure summary, an optional diff result and an
// optional critic result, and renders ONE Markdown page in the owner's words: the six fixed
// sections of FUN_CONVERGENCE_LOOP §3.7, filtered to real-game benches, and passed through a
// jargon lint that fails the run if any engineering word reaches the visible page.
//
// Usage:
//   node scripts/report-fun-loop.mjs --before <summary.json> --after <summary.json> \
//     [--diff <diff.json>] [--critic <critic.json>] [--leaf PQ-137.03] [--title "..."] \
//     [--include-bench <name>] [--out <path.md>] [--json]
//
// Exit 0 on success; exit 1 if an input file is missing or fails to parse, or the lint fails.
// Law: design/program/FUN_CONVERGENCE_LOOP.md §3.7 REPORT, §4. Bars: design/FEEL_CONTRACT.md §B.

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute, basename } from 'node:path';
import process from 'node:process';

import { buildMeasureDiff } from './measure-fun-loop.mjs';
import { buildReportModel, renderReport, flattenSummaryRuns, exactSourceIdentitiesEqual } from './lib/report/render.mjs';
import { lintJargon } from './lib/report/lint.mjs';

const FUN_CRITIC_SCHEMAS = new Set(['spaceface.funCritic.v1', 'spaceface.funCritic.v2']);

function isFunCriticDocument(doc) {
  return !!(doc && FUN_CRITIC_SCHEMAS.has(doc.schema));
}

function fail(message) {
  console.error(`Fun report error: ${message}`);
  process.exit(1);
}

function assertNonzeroFile(path, label) {
  let st;
  try {
    st = statSync(path);
  } catch (err) {
    fail(`${label} is missing (${path}): ${err.message}`);
  }
  if (!st.isFile() || st.size <= 0) {
    fail(`${label} is not a nonzero regular file: ${path}`);
  }
}

function assertCriticArtifacts(critic, label) {
  const strip = critic.strip || {};
  if (!strip.stripDir) fail(`${label} missing strip.stripDir`);
  const resolvedStrip = resolve(strip.stripDir);
  const frames = Array.isArray(strip.frames) ? strip.frames : [];
  if (frames.length === 0) fail(`${label} missing strip.frames`);
  for (const f of frames) {
    if (!f || typeof f.file !== 'string' || basename(f.file) !== f.file) {
      fail(`${label} has unsafe or missing frame filename`);
    }
    const framePath = resolve(resolvedStrip, f.file);
    const rel = relative(resolvedStrip, framePath);
    if (!rel || rel.startsWith('..') || isAbsolute(rel) || rel !== f.file || /^[A-Za-z]:/.test(rel)) {
      fail(`${label} frame "${f.file}" escaped stripDir`);
    }
    assertNonzeroFile(framePath, `${label} frame ${f.file}`);
  }
  if (!strip.contactSheet) fail(`${label} missing contactSheet`);
  const receiptRoot = strip.receiptDir ? resolve(strip.receiptDir) : resolvedStrip;
  const sheetPath = isAbsolute(strip.contactSheet)
    ? resolve(strip.contactSheet)
    : resolve(receiptRoot, strip.contactSheet);
  const sheetRel = relative(receiptRoot, sheetPath);
  if (!sheetRel || sheetRel.startsWith('..') || isAbsolute(sheetRel) || /^[A-Za-z]:/.test(sheetRel)) {
    fail(`${label} contactSheet escaped receiptDir`);
  }
  assertNonzeroFile(sheetPath, `${label} contact sheet`);
}

function printHelp() {
  console.log(`SpaceFace Fun Convergence Loop owner-report renderer (PQ-173.03)
Usage: node scripts/report-fun-loop.mjs --before <summary.json> --after <summary.json>
       [--diff <diff.json>] [--before-critic <critic.json> --after-critic <critic.json>]
       [--leaf PQ-137.03] [--title "..."] [--include-bench <name>] [--include-scenario <id>]
       [--out <path.md>] [--json]

Renders the one page the owner reads: WHAT I FOUND / WHAT I CHANGED / WHAT YOU WILL FEEL /
THE NUMBERS / THE FRAMES / NEXT, in plain words, then lints it for jargon.

Options:
  --before <summary.json>         REQUIRED: before measure summary (spaceface.funMeasure.v1)
  --after <summary.json>          REQUIRED: after measure summary (spaceface.funMeasure.v1)
  --diff <diff.json>              Use this diff result instead of computing it (funMeasureDiff.v1)
  --before-critic <critic.json>   Before critic result (spaceface.funCritic.v1 or v2)
  --after-critic <critic.json>    After critic result (spaceface.funCritic.v1 or v2)
  --critic <critic.json>          Legacy / single critic flag (fails if provided alone)
  --leaf PQ-137.03                Packet/leaf id for machine appendix (hidden from visible page)
  --title "..."                   Page title (default: "SpaceFace feel pass")
  --changed "..."                 One plain-words sentence saying what was changed (the data cannot
                                  know it; the page is still linted for jargon)
  --include-bench <name>          Admit runs whose bench equals <name> (repeatable). Default: only structured real-path proof.
  --include-scenario <id>         Admit runs whose scenarioId equals <id> (repeatable)
  --out <path.md>                 Write the page here (default: stdout)
  --json                          Also print the structured report model
  --help, -h                      Show this help text
`);
}

function parseArgs(list) {
  const args = {
    before: null, after: null, diff: null, critic: null,
    beforeCritic: null, afterCritic: null,
    leaf: 'PQ-000.00', title: null, changed: null, includeBenches: [], includeScenarios: [], out: null, json: false,
  };
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a === '--before') {
      args.before = list[++i];
      if (!args.before) fail('--before requires a summary JSON path');
    } else if (a === '--after') {
      args.after = list[++i];
      if (!args.after) fail('--after requires a summary JSON path');
    } else if (a === '--diff') {
      args.diff = list[++i];
      if (!args.diff) fail('--diff requires a diff JSON path');
    } else if (a === '--critic') {
      args.critic = list[++i];
      if (!args.critic) fail('--critic requires a critic JSON path');
    } else if (a === '--before-critic') {
      args.beforeCritic = list[++i];
      if (!args.beforeCritic) fail('--before-critic requires a critic JSON path');
    } else if (a === '--after-critic') {
      args.afterCritic = list[++i];
      if (!args.afterCritic) fail('--after-critic requires a critic JSON path');
    } else if (a === '--leaf') {
      args.leaf = list[++i] || args.leaf;
    } else if (a === '--title') {
      args.title = list[++i];
    } else if (a === '--changed') {
      args.changed = list[++i];
      if (!args.changed) fail('--changed requires one plain-words sentence');
    } else if (a === '--include-bench') {
      const name = list[++i];
      if (!name) fail('--include-bench requires a bench name');
      args.includeBenches.push(name);
    } else if (a === '--include-scenario') {
      const name = list[++i];
      if (!name) fail('--include-scenario requires a scenario id');
      args.includeScenarios.push(name);
    } else if (a === '--out') {
      args.out = list[++i];
      if (!args.out) fail('--out requires a file path');
    } else if (a === '--json') {
      args.json = true;
    } else {
      fail(`unknown argument: ${a} (see --help)`);
    }
  }
  return args;
}

function readJson(path, label) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    fail(`cannot read ${label} "${path}": ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    fail(`cannot parse ${label} "${path}": ${err.message}`);
  }
  return null;
}

function readSummary(path, label) {
  const parsed = readJson(path, label);
  if (!parsed || typeof parsed !== 'object' || !parsed.benches) {
    fail(`"${path}" is not a measure summary (expected schema spaceface.funMeasure.v1 with a benches block)`);
  }
  return parsed;
}

function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    printHelp();
    return;
  }
  const args = parseArgs(rawArgs);
  if (!args.before) fail('--before <summary.json> is required');
  if (!args.after) fail('--after <summary.json> is required');

  const before = readSummary(args.before, '--before');
  const after = readSummary(args.after, '--after');

  // Summary validation: refuse stale summaries without harnessDigest or sourceIdentity
  if (!before.harnessDigest || !after.harnessDigest) {
    fail('measure summary missing harnessDigest: refuse to compare unproven summaries');
  }
  if (before.harnessDigest !== after.harnessDigest) {
    fail(`harnessDigest mismatch (${before.harnessDigest} !== ${after.harnessDigest}): sweeps were not produced by the same harness`);
  }
  if (!before.sourceIdentity || !after.sourceIdentity) {
    fail('measure summary missing sourceIdentity: refuse to compare unproven summaries');
  }
  if (!exactSourceIdentitiesEqual(before.sourceIdentity, before.sourceIdentity)
    || typeof before.sourceIdentity.productionDirty !== 'boolean'
    || !before.sourceIdentity.gitHead || !before.sourceIdentity.gitTree || !before.sourceIdentity.productionDiffHash) {
    fail('measure summary missing complete sourceIdentity (gitHead, gitTree, productionDirty, productionDiffHash)');
  }
  if (!after.sourceIdentity.gitHead || !after.sourceIdentity.gitTree
    || typeof after.sourceIdentity.productionDirty !== 'boolean' || !after.sourceIdentity.productionDiffHash) {
    fail('measure summary missing complete sourceIdentity (gitHead, gitTree, productionDirty, productionDiffHash)');
  }

  // Check compatible run sets
  const beforeRuns = flattenSummaryRuns(before);
  const afterRuns = flattenSummaryRuns(after);
  if (beforeRuns.length === 0 || afterRuns.length === 0) {
    fail('measure summary has zero runs');
  }
  const keyForRun = (r) => `${r.bench || ''}|${r.scenarioId || [r.arenaId, r.loadoutId].filter(Boolean).join('/') || ''}|${r.seed ?? ''}`;
  const beforeKeys = new Set(beforeRuns.map(keyForRun));
  const afterKeys = new Set(afterRuns.map(keyForRun));
  if (beforeKeys.size !== afterKeys.size || [...beforeKeys].some((k) => !afterKeys.has(k))) {
    fail('incompatible bench/scenario/seed sets between before and after summaries');
  }

  let diff = null;
  if (args.diff) {
    diff = readJson(args.diff, '--diff');
    if (!diff || !Array.isArray(diff.runs)) {
      fail(`"${args.diff}" is not a measure diff (expected schema spaceface.funMeasureDiff.v1 with a runs array)`);
    }
  }

  let beforeCritic = null;
  let afterCritic = null;
  if (args.critic && !args.beforeCritic && !args.afterCritic) {
    fail('--critic was provided alone: report requires distinct --before-critic and --after-critic to prove progression; refusing to split one critic artifact');
  }
  if ((args.beforeCritic && !args.afterCritic) || (!args.beforeCritic && args.afterCritic)) {
    fail('both --before-critic and --after-critic are required when providing critic evidence');
  }
  if (args.beforeCritic && args.afterCritic) {
    if (args.beforeCritic === args.afterCritic) {
      fail('--before-critic and --after-critic must be distinct files; refusing to split one critic artifact');
    }
    beforeCritic = readJson(args.beforeCritic, '--before-critic');
    afterCritic = readJson(args.afterCritic, '--after-critic');
    if (!isFunCriticDocument(beforeCritic)) {
      fail(`"${args.beforeCritic}" is not a valid critic verdict (expected schema spaceface.funCritic.v1 or v2)`);
    }
    if (!isFunCriticDocument(afterCritic)) {
      fail(`"${args.afterCritic}" is not a valid critic verdict (expected schema spaceface.funCritic.v1 or v2)`);
    }
    if (beforeCritic.rejected || afterCritic.rejected) {
      fail('cannot render report with rejected critic verdicts');
    }
    const bs = beforeCritic.strip || {};
    const as = afterCritic.strip || {};
    if (!bs.harnessDigest || !as.harnessDigest) {
      fail('critic verdict missing strip.harnessDigest');
    }
    if (bs.harnessDigest !== as.harnessDigest) {
      fail(`mismatched harnessDigest between before-critic (${bs.harnessDigest}) and after-critic (${as.harnessDigest})`);
    }
    if (bs.harnessDigest !== before.harnessDigest) {
      fail(`critic harnessDigest (${bs.harnessDigest}) does not match measure summary harnessDigest (${before.harnessDigest})`);
    }
    if (as.harnessDigest !== after.harnessDigest) {
      fail(`after-critic harnessDigest (${as.harnessDigest}) does not match after measure summary harnessDigest (${after.harnessDigest})`);
    }
    if (!bs.sourceIdentity || !as.sourceIdentity) {
      fail('critic verdict missing strip.sourceIdentity');
    }

    if (!exactSourceIdentitiesEqual(bs.sourceIdentity, before.sourceIdentity)) {
      fail('before-critic sourceIdentity does not match before measure summary sourceIdentity');
    }
    if (!exactSourceIdentitiesEqual(as.sourceIdentity, after.sourceIdentity)) {
      fail('after-critic sourceIdentity does not match after measure summary sourceIdentity');
    }

    if (bs.bench !== as.bench || bs.scenarioId !== as.scenarioId || bs.seed !== as.seed) {
      fail(`mismatched before/after critic scenario: ${bs.bench}/${bs.scenarioId}/s${bs.seed} !== ${as.bench}/${as.scenarioId}/s${as.seed}`);
    }
    if (!bs.manifestPath || typeof bs.manifestPath !== 'string' || !bs.manifestPath.trim()) {
      fail('before-critic missing or empty strip.manifestPath');
    }
    if (!as.manifestPath || typeof as.manifestPath !== 'string' || !as.manifestPath.trim()) {
      fail('after-critic missing or empty strip.manifestPath');
    }
    const resolvedBeforeManifest = resolve(bs.manifestPath);
    const resolvedAfterManifest = resolve(as.manifestPath);
    if (resolvedBeforeManifest === resolvedAfterManifest) {
      fail('before-critic and after-critic evaluate equivalent or identical manifest paths; refusing cloned evidence');
    }

    // Refuse cloned/relabelled evidence: identical source identity + digest + exact frames or contact sheet
    const sameSource = exactSourceIdentitiesEqual(bs.sourceIdentity, as.sourceIdentity);
    const sameFrames = Array.isArray(bs.frames) && Array.isArray(as.frames) && bs.frames.length === as.frames.length && bs.frames.length > 0 && bs.frames.every((f, i) => f.file === as.frames[i].file && f.tick === as.frames[i].tick);
    const sameContact = bs.contactSheet && as.contactSheet && resolve(bs.contactSheet) === resolve(as.contactSheet);
    if (sameSource && bs.harnessDigest === as.harnessDigest && (sameFrames || sameContact)) {
      fail('refusing cloned or relabelled critic evidence: before and after present identical strip frames or contact sheet');
    }
    assertCriticArtifacts(beforeCritic, 'before-critic');
    assertCriticArtifacts(afterCritic, 'after-critic');
  }

  const model = buildReportModel({
    title: args.title || 'SpaceFace feel pass',
    leaf: args.leaf,
    changed: args.changed,
    beforeSummary: before,
    afterSummary: after,
    diff,
    beforeCritic,
    afterCritic,
    includeBenches: args.includeBenches,
    includeScenarios: args.includeScenarios,
    reportOutPath: args.out ? resolve(args.out) : null,
    generatedAt: new Date().toISOString(),
    inputs: {
      before: args.before,
      after: args.after,
      diff: args.diff || null,
      beforeCritic: args.beforeCritic || null,
      afterCritic: args.afterCritic || null,
    },
  });

  const markdown = renderReport(model);
  const lint = lintJargon(markdown);
  if (!lint.ok) {
    for (const v of lint.violations) {
      console.error(`jargon "${v.word}" on line ${v.line}: ${v.lineText}`);
    }
    fail(`the page says words the owner should never have to read (${lint.violations.length} found); `
      + 'rewrite the source, do not delete the information');
  }

  if (args.out) {
    writeFileSync(args.out, `${markdown}\n`, 'utf8');
    console.log(`Wrote ${args.out}`);
  } else {
    process.stdout.write(`${markdown}\n`);
  }
  if (args.json) {
    console.log(JSON.stringify(model, null, 2));
  }
}

main();
