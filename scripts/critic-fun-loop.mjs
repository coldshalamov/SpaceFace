#!/usr/bin/env node
// scripts/critic-fun-loop.mjs — Critic harness for the SpaceFace Fun Convergence Loop.
//
// Vision authority: design/program/FUN_CONVERGENCE_LOOP.md section 3.3.
// "A vision-capable model that did not make the change reads the frame strips and the metrics
// and answers ten yes/no questions, each with the frame index that proves the answer.
// Prose without a frame is not a verdict."
//
// Usage:
// node scripts/critic-fun-loop.mjs --strip <path to strip-manifest.json> \
//   [--model agy|kimi|manual] [--out <file.json>] [--timeout-ms N] [--verbose]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildCriticPrompt,
  executeModelRoute,
  extractBalancedJson,
  validateVerdict,
  validateStripAdmission,
  compareCritics,
  selectCriticFrames,
  matchesExpectedFundamental,
  KNOWN_FUNDAMENTALS,
  DEFAULT_MAX_FRAMES,
} from './lib/critic/index.mjs';
import { computeFunLoopHarnessDigest } from './measure-fun-loop.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../');

function isInside(child, parent) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function printUsage() {
  console.log(`
Usage:
  node scripts/critic-fun-loop.mjs --strip <path to strip-manifest.json> [options]

Options:
  --strip <path>         Path to frame strip manifest JSON (spaceface.frameStripManifest.v2).
                         Can be specified multiple times to evaluate multiple strips.
  --model <name>         Model route to evaluate: 'agy' (default), 'kimi', or 'manual'.
                         Can be specified multiple times (e.g. '--model agy --model kimi')
                         to evaluate with multiple models and print an agreement summary.
  --out <file.json>      Custom output path for the spaceface.funCritic.v1 verdict document.
                         Default: design/program/roadmap/receipts/fun-loop/critic/<bench>-<scenarioId>-s<seed>/<model>.json
  --metrics <file.json>  Provisional metrics file from headless bench (labelled provisional in prompt).
  --max-frames <N>       How many frames the critic is shown (default ${DEFAULT_MAX_FRAMES}).
                         Chosen before/at/after the biggest moments the ship was in, plus an even
                         spread. A verdict may cite only a frame it was shown.
  --timeout-ms <N>       Execution timeout in milliseconds.
  --repo-dir <path>      The source tree the strip was photographed from (default: this repo). The
                         model runs there, so a critic that reads code reads the code the frames show.
  --frames-only          The model sees ONLY the strip (frames + manifest): it runs in the strip's
                         own directory with no source and no design documents. This is what "from
                         frames alone" means; the verdict records framesOnly: true. The fundamental's
                         file may be "unknown" in this mode; the rule must still be named in the
                         critic's words. (A model with a memory of this repository can still recall
                         file names; the receipt says which verdicts came from which route.)
  --expect-fundamental <key|regex>
                         The finding this strip is expected to expose: a KNOWN_FUNDAMENTALS key
                         (${Object.keys(KNOWN_FUNDAMENTALS).join(', ')}) or a regular expression.
                         An accepted verdict whose fundamental does not name it exits 3.
  --verbose              Print verbose diagnostic output.
  --help, -h             Print this help message and exit.

Exit codes:
  0: Verdict accepted (or manual prompt written).
  2: Verdict rejected (missing frame index, content named in fundamental, bad format).
  3: Verdict accepted but its fundamental did not name --expect-fundamental.
  1: Harness error (missing strip manifest, dead route, etc.).
`);
}

function parseArgs(argv) {
  const options = {
    strips: [],
    models: [],
    out: null,
    metrics: null,
    maxFrames: DEFAULT_MAX_FRAMES,
    timeoutMs: null,
    repoDir: null,
    framesOnly: false,
    expectFundamental: null,
    verbose: false,
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--strip') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        options.strips.push(argv[++i]);
      }
    } else if (arg === '--model') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        options.models.push(argv[++i]);
      }
    } else if (arg === '--out') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        options.out = argv[++i];
      }
    } else if (arg === '--metrics') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        options.metrics = argv[++i];
      }
    } else if (arg === '--max-frames') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        options.maxFrames = parseInt(argv[++i], 10);
      }
    } else if (arg === '--timeout-ms') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        options.timeoutMs = parseInt(argv[++i], 10);
      }
    } else if (arg === '--repo-dir') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        options.repoDir = argv[++i];
      }
    } else if (arg === '--frames-only') {
      options.framesOnly = true;
    } else if (arg === '--expect-fundamental') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        options.expectFundamental = argv[++i];
      }
    } else {
      console.warn(`[critic] Warning: unknown argument '${arg}'`);
    }
  }

  if (options.models.length === 0) {
    options.models.push('agy');
  }

  return options;
}

export async function main(argv = process.argv) {
  const options = parseArgs(argv);

  if (options.help) {
    printUsage();
    return 0;
  }

  if (options.strips.length === 0) {
    console.error('Error: missing required --strip <path to strip-manifest.json>');
    printUsage();
    return 1;
  }

  const log = (...args) => {
    if (options.verbose) console.log('   [critic]', ...args);
  };

  let hadHarnessError = false;
  let hadRejectedVerdict = false;
  let hadUnreproducedFinding = false;

  let repoDir = options.repoDir ? resolve(process.cwd(), options.repoDir) : ROOT;
  if (!existsSync(repoDir)) {
    console.error(`Error: --repo-dir not found: ${repoDir}`);
    return 1;
  }
  if (options.framesOnly) {
    // The room the model runs in holds nothing but the strip. MEASURED 2026-09-05: with the repo
    // in its workspace the critic named the audit's own 1.15x clamp on the build where that clamp
    // is fixed — it had read design/FEEL_CONTRACT.md §A. A verdict "from frames alone" is only
    // that when the frames are all there is. The room is the strip's own directory (set per strip
    // below), because opencode refuses a non-interactive read outside its --dir, and an empty
    // temp directory therefore starved Kimi of the pictures entirely.
    log('frames-only: the model runs in the strip directory, with no source and no design documents');
  }

  // Read optional metrics file if provided
  let metricsData = null;
  if (options.metrics) {
    const absMetrics = resolve(process.cwd(), options.metrics);
    if (!existsSync(absMetrics)) {
      console.error(`Error: metrics file not found: ${absMetrics}`);
      return 1;
    }
    try {
      metricsData = JSON.parse(readFileSync(absMetrics, 'utf8'));
    } catch (e) {
      metricsData = readFileSync(absMetrics, 'utf8');
    }
  }

  for (const rawStripPath of options.strips) {
    const manifestPath = resolve(process.cwd(), rawStripPath);
    if (!existsSync(manifestPath)) {
      console.error(`Error: strip manifest not found at: ${manifestPath}`);
      hadHarnessError = true;
      continue;
    }

    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (err) {
      console.error(`Error parsing strip manifest at ${manifestPath}: ${err.message}`);
      hadHarnessError = true;
      continue;
    }

    const stripDir = manifest.stripDir || dirname(manifestPath);
    manifest.stripDir = stripDir;
    if (options.framesOnly) repoDir = stripDir;

    const bench = manifest.bench || 'bench';
    const scenarioId = manifest.scenarioId || 'scenario';
    const seed = manifest.seed ?? 0;
    const stripName = `${bench}-${scenarioId}-s${seed}`;

    log(`Loaded strip manifest for '${stripName}' with ${manifest.frames?.length ?? 0} frames`);

    // A strip must pass strict admission (schema, shipping camera, verified HUD, drawn hull,
    // normalSpeed, sourceIdentity, harnessDigest matching live digest, existent frame files, and no stale frames)
    // before any model is invoked. Missing proof is a hard refusal.
    const liveHarnessDigest = computeFunLoopHarnessDigest(ROOT);
    const admission = validateStripAdmission(manifest, {
      manifestPath,
      stripDir,
      receiptDir: manifest.receiptDir,
      expectedHarnessDigest: liveHarnessDigest,
    });
    if (!admission.ok) {
      console.error(`Error: strip '${stripName}' failed critic admission: ${admission.reason}. Recapture before grading.`);
      hadHarnessError = true;
      continue;
    }

    // Choose the frames the critic is shown, and let it cite nothing else.
    const selection = selectCriticFrames(manifest, { maxFrames: options.maxFrames });
    log(`showing ${selection.frames.length} frames: ${selection.reason}`);

    // Build prompt for critic
    let prompt;
    try {
      prompt = buildCriticPrompt(manifest, {
        metrics: metricsData,
        frames: selection.frames,
        selectionReason: selection.reason,
      });
      if (options.framesOnly) {
        prompt += [
          '',
          '# Frames only',
          "You have NO access to the game's source code or design documents in this review, and you must",
          'not guess at file names from memory of other projects. Judge from the pictures and the facts',
          'above. For question 10 name the rule in your own words (what the game appears to do, when), put',
          '"unknown" in the file field if you cannot name a file, and still give the frame that shows it.',
          '',
        ].join(String.fromCharCode(10));
      }
    } catch (err) {
      console.error(`Error building prompt for manifest: ${err.message}`);
      hadHarnessError = true;
      continue;
    }

    const stripResults = [];

    for (const modelName of options.models) {
      log(`Evaluating strip '${stripName}' with model '${modelName}'`);

      const defaultOutDir = join(ROOT, 'design/program/roadmap/receipts/fun-loop/critic', stripName);
      let outPath;
      if (options.out && options.strips.length === 1 && options.models.length === 1) {
        outPath = resolve(process.cwd(), options.out);
      } else {
        outPath = join(defaultOutDir, `${modelName}.json`);
      }

      const rawResponsePath = outPath.replace(/\.json$/, '.raw.txt');

      let routeResult;
      try {
        routeResult = await executeModelRoute(modelName, prompt, manifest, {
          timeoutMs: options.timeoutMs,
          verbose: options.verbose,
          log,
          repoDir,
          // The frames and the manifest may live outside the tree the critic runs in. Frames-only
          // adds the strip and nothing else — never the repo.
          addDirs: options.framesOnly
            ? [...new Set([stripDir, dirname(manifestPath)])]
            : [...new Set([stripDir, dirname(manifestPath), ROOT].filter((d) => !isInside(d, repoDir)))],
          newProject: options.framesOnly,
          manifestPath,
          stripName,
          manualOutPath: options.out && options.strips.length === 1 && options.models.length === 1
            ? outPath
            : join(defaultOutDir, 'manual-prompt.md'),
        });
      } catch (err) {
        console.error(`Harness error executing route '${modelName}': ${err.message}`);
        hadHarnessError = true;
        continue;
      }

      if (routeResult.manual) {
        console.log(`[critic] Manual review prompt written to:\n  ${routeResult.manualPromptPath}`);
        console.log('[critic] Exiting 0 for manual review route.');
        continue;
      }

      // Save raw response for audit
      try {
        mkdirSync(dirname(rawResponsePath), { recursive: true });
        writeFileSync(rawResponsePath, routeResult.rawOutput, 'utf8');
      } catch (err) {
        console.error(`Warning: could not save raw response to ${rawResponsePath}: ${err.message}`);
      }

      // Parse JSON from model output
      let parsed = null;
      let parseError = null;
      try {
        parsed = extractBalancedJson(routeResult.rawOutput);
      } catch (err) {
        parseError = err.message;
      }

      // Validate candidate verdict against manifest
      let verdict;
      if (parseError) {
        verdict = validateVerdict(null, manifest, {
          shownFrames: selection.frames,
          manifestPath,
          modelRoute: routeResult.route,
          modelLabel: routeResult.label,
          wallMs: routeResult.wallMs,
          rawResponsePath,
        });
        verdict.rejected = true;
        verdict.rejectReasons.unshift(`Failed to extract balanced JSON: ${parseError}`);
      } else {
        verdict = validateVerdict(parsed, manifest, {
          shownFrames: selection.frames,
          manifestPath,
          modelRoute: routeResult.route,
          modelLabel: routeResult.label,
          wallMs: routeResult.wallMs,
          rawResponsePath,
        });
      }

      if (verdict.rejected) {
        hadRejectedVerdict = true;
      }

      // The reproduction question: does an accepted verdict name the finding this strip was
      // captured to expose? Recorded on the verdict either way; a miss is exit 3, never silence.
      if (options.expectFundamental) {
        const rep = matchesExpectedFundamental(verdict.fundamental, options.expectFundamental);
        verdict.reproduction = {
          expected: options.expectFundamental,
          pattern: rep.pattern,
          matchedKeys: rep.matchedKeys,
          reproduced: !verdict.rejected && rep.matched,
        };
        if (!verdict.rejected && !rep.matched) hadUnreproducedFinding = true;
      }
      verdict.sourceTree = options.framesOnly ? '(frames only: no source, no design documents)' : repoDir;
      verdict.framesOnly = !!options.framesOnly;

      // Write verdict document to outPath
      try {
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, JSON.stringify(verdict, null, 2), 'utf8');
      } catch (err) {
        console.error(`Harness error writing verdict to ${outPath}: ${err.message}`);
        hadHarnessError = true;
        continue;
      }

      console.log(`[critic] Verdict written to: ${outPath}`);
      console.log(`[critic] Model: ${verdict.model.label} (${verdict.model.wallMs}ms)`);
      console.log(`[critic] Status: ${verdict.rejected ? 'REJECTED' : 'ACCEPTED'} | Pass: ${verdict.pass} (${verdict.passCount}/9 good answers)`);

      if (verdict.rejected) {
        console.log('[critic] Rejection reasons:');
        for (const reason of verdict.rejectReasons) {
          console.log(`  - ${reason}`);
        }
      }
      if (verdict.reproduction) {
        console.log(`[critic] Expected finding '${verdict.reproduction.expected}': `
          + `${verdict.reproduction.reproduced ? `REPRODUCED (${verdict.reproduction.matchedKeys.join(', ')})` : 'NOT reproduced'}`
          + ` (fundamental: ${verdict.fundamental?.rule || '-'} in ${verdict.fundamental?.file || '-'})`);
      }

      stripResults.push({ model: modelName, result: verdict });
    }

    // If multiple models evaluated this strip, print agreement summary
    if (stripResults.length > 1) {
      const { summaryText } = compareCritics(stripResults);
      console.log('\n' + summaryText + '\n');
    }
  }

  if (hadHarnessError) return 1;
  if (hadRejectedVerdict) return 2;
  if (hadUnreproducedFinding) return 3;
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  main().then((code) => {
    process.exit(code);
  }).catch((err) => {
    console.error(`Unexpected harness failure: ${err.stack || err.message}`);
    process.exit(1);
  });
}
