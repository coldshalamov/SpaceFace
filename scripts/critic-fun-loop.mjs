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
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildCriticPrompt,
  executeModelRoute,
  extractBalancedJson,
  validateVerdict,
  compareCritics,
  selectCriticFrames,
  DEFAULT_MAX_FRAMES,
} from './lib/critic/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../');

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
  --verbose              Print verbose diagnostic output.
  --help, -h             Print this help message and exit.

Exit codes:
  0: Verdict accepted (or manual prompt written).
  2: Verdict rejected (missing frame index, content named in fundamental, bad format).
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

    const bench = manifest.bench || 'bench';
    const scenarioId = manifest.scenarioId || 'scenario';
    const seed = manifest.seed ?? 0;
    const stripName = `${bench}-${scenarioId}-s${seed}`;

    log(`Loaded strip manifest for '${stripName}' with ${manifest.frames?.length ?? 0} frames`);

    // A strip that photographed an empty arena must never be graded: the critic would answer
    // nine questions about a planet and a star field, and the verdict would look like a verdict.
    const hullDrawn = manifest.hullDrawn;
    if (hullDrawn && hullDrawn.framesTotal > 0 && (hullDrawn.medianPartsPerFrame || 0) <= 0) {
      console.error(`Error: strip '${stripName}' has no ship in it `
        + `(${hullDrawn.framesWithHull} of ${hullDrawn.framesTotal} frames drew the hull). `
        + 'Recapture before grading.');
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
          repoDir: ROOT,
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
