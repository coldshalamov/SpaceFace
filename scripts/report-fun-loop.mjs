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

import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import { buildMeasureDiff } from './measure-fun-loop.mjs';
import { REAL_PATH_BENCHES } from './lib/report/constants.mjs';
import { buildReportModel, renderReport } from './lib/report/render.mjs';
import { lintJargon } from './lib/report/lint.mjs';

function fail(message) {
  console.error(`Fun report error: ${message}`);
  process.exit(1);
}

function printHelp() {
  console.log(`SpaceFace Fun Convergence Loop owner-report renderer (PQ-173.03)
Usage: node scripts/report-fun-loop.mjs --before <summary.json> --after <summary.json>
       [--diff <diff.json>] [--critic <critic.json>] [--leaf PQ-137.03] [--title "..."]
       [--include-bench <name>] [--out <path.md>] [--json]

Renders the one page the owner reads: WHAT I FOUND / WHAT I CHANGED / WHAT YOU WILL FEEL /
THE NUMBERS / THE FRAMES / NEXT, in plain words, then lints it for jargon.

Options:
  --before <summary.json>     REQUIRED: before measure summary (spaceface.funMeasure.v1)
  --after <summary.json>      REQUIRED: after measure summary (spaceface.funMeasure.v1)
  --diff <diff.json>          Use this diff result instead of computing it (funMeasureDiff.v1)
  --critic <critic.json>      Critic result (spaceface.funCritic.v1); optional
  --leaf PQ-137.03            Packet/leaf id for the WHAT I CHANGED line
  --title "..."               Page title (default: "SpaceFace feel pass <leaf>")
  --include-bench <name>      Treat <name> as a real-game bench (repeatable); default: ${REAL_PATH_BENCHES.join(', ')}
  --out <path.md>             Write the page here (default: stdout)
  --json                      Also print the structured report model
  --help, -h                  Show this help text
`);
}

function parseArgs(list) {
  const args = {
    before: null, after: null, diff: null, critic: null,
    leaf: 'PQ-000.00', title: null, includeBenches: [], out: null, json: false,
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
    } else if (a === '--leaf') {
      args.leaf = list[++i] || args.leaf;
    } else if (a === '--title') {
      args.title = list[++i];
    } else if (a === '--include-bench') {
      const name = list[++i];
      if (!name) fail('--include-bench requires a bench name');
      args.includeBenches.push(name);
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
  let diff = null;
  if (args.diff) {
    diff = readJson(args.diff, '--diff');
    if (!diff || !Array.isArray(diff.runs)) {
      fail(`"${args.diff}" is not a measure diff (expected schema spaceface.funMeasureDiff.v1 with a runs array)`);
    }
  }
  const critic = args.critic ? readJson(args.critic, '--critic') : null;

  const model = buildReportModel({
    title: args.title || `SpaceFace feel pass ${args.leaf}`,
    leaf: args.leaf,
    beforeSummary: before,
    afterSummary: after,
    diff,
    critic,
    realPathBenches: [...new Set([...REAL_PATH_BENCHES, ...args.includeBenches])],
    generatedAt: new Date().toISOString(),
    inputs: {
      before: args.before,
      after: args.after,
      diff: args.diff || null,
      critic: args.critic || null,
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
