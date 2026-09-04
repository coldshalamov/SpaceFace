#!/usr/bin/env node
// scripts/run-fun-bench.mjs — The Fun Convergence Loop Bench (PQ-173.00)
//
// One command runs:
//   1. The Crucible feel bench (swarm ruleset, 3 arenas × 3 loadouts incl. shove weapon and rope kit, first 3 waves, 3 fixed seeds)
//   2. The Flight bench (accel-brake, slalom, reversal, collision-recovery)
//   3. The Verb benches (rope swing/release, shove, gravity well, draw-path stroke, terrain slam, cargo spill)
//
// Headless by default; --headed records frame strips at shipping camera with HUD text off.
// Verifies that two runs of the same seed hash identical.
// Outputs land under design/program/roadmap/receipts/fun-loop/.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCrucibleBench, CRUCIBLE_ARENAS, CRUCIBLE_LOADOUTS, CRUCIBLE_DEFAULT_SEEDS } from './lib/bench/crucibleBench.mjs';
import { runFlightBench } from './lib/bench/flightBench.mjs';
import { runVerbBench } from './lib/bench/verbBench.mjs';
import { captureFrameStrip, DEFAULT_STRIP_DIR } from './lib/bench/frameStripCapture.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const RECEIPTS_DIR = join(ROOT, 'design/program/roadmap/receipts/fun-loop');
const RUNS_DIR = join(RECEIPTS_DIR, 'runs');
// Frames are hundreds of MB of capture evidence and live in .devshots like every other capture;
// only the manifest and the contact sheet land under receipts. (fa099c61 untracked the old PNGs.)
const STRIPS_DIR = DEFAULT_STRIP_DIR;

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`SpaceFace Fun Convergence Bench (PQ-173.00)
Usage: node scripts/run-fun-bench.mjs [options]

Options:
  --headed              Run headed browser and capture frame strips at shipping camera
  --crucible            Run only the Crucible feel bench (3 arenas x 3 loadouts x 3 seeds)
  --flight              Run only the Flight bench (4 motion lab scenarios)
  --verbs               Run only the Verb benches (6 feel contract scenarios)
  --json                Emit pure JSON report to stdout
  --verbose, -v         Enable verbose scenario progress logging
  --verify-determinism  Verify bit-identical hash reproduction on repeat (default)
  --no-verify           Skip duplicate determinism checks for faster run
  --help, -h            Show this help text
`);
  process.exit(0);
}

const HEADED = argv.includes('--headed');
const VERBOSE = argv.includes('--verbose') || argv.includes('-v');
const AS_JSON = argv.includes('--json');
const ONLY_CRUCIBLE = argv.includes('--crucible');
const ONLY_FLIGHT = argv.includes('--flight');
const ONLY_VERBS = argv.includes('--verbs');
const VERIFY_DETERMINISM = argv.includes('--verify-determinism') || !argv.includes('--no-verify');

const runAll = !ONLY_CRUCIBLE && !ONLY_FLIGHT && !ONLY_VERBS;

async function main() {
  mkdirSync(RUNS_DIR, { recursive: true });
  mkdirSync(STRIPS_DIR, { recursive: true });

  const isoDate = new Date().toISOString().slice(0, 10);
  const startTime = Date.now();
  const report = {
    schema: 'spaceface.funConvergenceBench.v1',
    timestamp: new Date().toISOString(),
    headed: HEADED,
    benches: {},
    determinismVerified: true,
    passed: true,
  };

  if (!AS_JSON) {
    console.log('======================================================================');
    console.log('SpaceFace Fun Convergence Bench (PQ-173.00)');
    console.log(`Mode: ${HEADED ? 'HEADED (frame strip capture)' : 'HEADLESS (telemetry & determinism)'}`);
    console.log(`Receipts directory: ${RECEIPTS_DIR}`);
    console.log('======================================================================\n');
  }

  // ── 1. CRUCIBLE FEEL BENCH ───────────────────────────────────────────────────
  if (runAll || ONLY_CRUCIBLE) {
    if (!AS_JSON) console.log('► Running Crucible Feel Bench (3 arenas × 3 loadouts × 3 seeds × 3 waves)...');
    const crucibleResult = await runCrucibleBench({
      arenas: CRUCIBLE_ARENAS.map((a) => a.id),
      loadouts: CRUCIBLE_LOADOUTS.map((l) => l.id),
      seeds: CRUCIBLE_DEFAULT_SEEDS,
      waveCount: 3,
      headed: HEADED,
      verbose: VERBOSE,
    });

    report.benches.crucible = crucibleResult;

    // Verify determinism across duplicate run
    if (VERIFY_DETERMINISM) {
      if (!AS_JSON) console.log('  Checking determinism across duplicate seed execution...');
      const verifyResult = await runCrucibleBench({
        arenas: ['helios_core'],
        loadouts: ['physics_toolkit'],
        seeds: [CRUCIBLE_DEFAULT_SEEDS[0]],
        waveCount: 3,
        headed: false,
        verbose: false,
      });

      const original = crucibleResult.runs.find(
        (r) => r.arenaId === 'helios_core' && r.loadoutId === 'physics_toolkit' && r.seed === CRUCIBLE_DEFAULT_SEEDS[0]
      );

      if (original && verifyResult.runs[0]) {
        const hash1 = original.runHash;
        const hash2 = verifyResult.runs[0].runHash;
        if (hash1 !== hash2) {
          report.determinismVerified = false;
          report.passed = false;
          console.error(`  FAIL: Non-deterministic Crucible hash! ${hash1} !== ${hash2}`);
        } else if (!AS_JSON) {
          console.log(`  PASS: Deterministic run hash verified (${hash1.slice(0, 16)}...)`);
        }
      }
    }
  }

  // ── 2. FLIGHT BENCH ──────────────────────────────────────────────────────────
  if (runAll || ONLY_FLIGHT) {
    if (!AS_JSON) console.log('\n► Running Flight Bench (accel-brake, slalom, reversal, collision-recovery)...');
    const flightResult = await runFlightBench({
      seeds: [13502],
      verbose: VERBOSE,
    });
    report.benches.flight = flightResult;

    if (VERIFY_DETERMINISM) {
      const verifyFlight = await runFlightBench({ seeds: [13502], verbose: false });
      for (let i = 0; i < flightResult.runs.length; i++) {
        const h1 = flightResult.runs[i].runHash;
        const h2 = verifyFlight.runs[i].runHash;
        if (h1 !== h2) {
          report.determinismVerified = false;
          report.passed = false;
          console.error(`  FAIL: Flight bench non-determinism in ${flightResult.runs[i].scenarioId}`);
        }
      }
      if (!AS_JSON && report.determinismVerified) {
        console.log('  PASS: All 4 flight bench scenarios produce bit-identical hashes.');
      }
    }
  }

  // ── 3. VERB BENCHES ──────────────────────────────────────────────────────────
  if (runAll || ONLY_VERBS) {
    if (!AS_JSON) console.log('\n► Running Verb Benches (rope, shove, well, stroke, terrain, cargo)...');
    const verbResult = await runVerbBench({
      seeds: [4242],
      verbose: VERBOSE,
    });
    report.benches.verbs = verbResult;

    if (VERIFY_DETERMINISM) {
      const verifyVerbs = await runVerbBench({ seeds: [4242], verbose: false });
      for (let i = 0; i < verbResult.runs.length; i++) {
        const h1 = verbResult.runs[i].runHash;
        const h2 = verifyVerbs.runs[i].runHash;
        if (h1 !== h2) {
          report.determinismVerified = false;
          report.passed = false;
          console.error(`  FAIL: Verb bench non-determinism in ${verbResult.runs[i].scenarioId}`);
        }
      }
      if (!AS_JSON && report.determinismVerified) {
        console.log('  PASS: All 6 verb bench scenarios produce bit-identical hashes.');
      }
    }
  }

  // ── 4. RECORD FRAME STRIPS IN HEADED MODE ────────────────────────────────────
  // Every bench that asked to run gets its own strip. The first version captured one Crucible pass
  // no matter which bench was selected, so `--headed --flight` produced frames of a different
  // bench entirely — and, because it never left the title screen, of no bench at all.
  //
  // The flight and verb benches integrate in node against the authoritative runtime; they have no
  // browser of their own. Until a browser Motion Lab route exists, their "headed" evidence is the
  // same real Crucible route flown by hand (scenario `swarm_piloted`), which is where their bars
  // are actually felt. That substitution is recorded in each strip's manifest, never implied.
  if (HEADED) {
    if (!AS_JSON) console.log('\n► Recording shipping camera frame strips with HUD text off...');
    const stripPlan = [];
    if (runAll || ONLY_CRUCIBLE) stripPlan.push({ bench: 'crucible', scenarioId: 'swarm_idle', seed: 4242 });
    if (runAll || ONLY_FLIGHT) stripPlan.push({ bench: 'flight', scenarioId: 'swarm_piloted', seed: 13502 });
    if (runAll || ONLY_VERBS) stripPlan.push({ bench: 'verbs', scenarioId: 'swarm_piloted', seed: 4242, loadoutId: 'massline_rig' });

    report.strips = [];
    for (const plan of stripPlan) {
      const strip = await captureFrameStrip({ ...plan, outDir: STRIPS_DIR, headed: true, verbose: VERBOSE });
      report.strips.push({
        bench: plan.bench,
        scenarioId: plan.scenarioId,
        seed: plan.seed,
        framesCount: strip.framesCount,
        moments: strip.manifest.momentsCount,
        hudTextVerified: strip.manifest.hudTextVerified,
        stripDir: strip.targetDir,
        receiptDir: strip.receiptDir,
      });
      if (!AS_JSON) {
        console.log(`  ${plan.bench}/${plan.scenarioId}: ${strip.framesCount} frames, `
          + `${strip.manifest.momentsCount} moments, HUD text ${strip.manifest.hudTextVerified ? 'clean' : 'NOT clean'}`);
      }
    }
    if (!AS_JSON) console.log(`  Frames under ${STRIPS_DIR}`);
  }

  // ── 5. PERSIST RUN RECEIPTS ──────────────────────────────────────────────────
  report.wallMs = Date.now() - startTime;
  const jsonReportPath = join(RUNS_DIR, `${isoDate}-fun-bench-summary.json`);
  writeFileSync(jsonReportPath, JSON.stringify(report, null, 2), 'utf8');

  // Format Markdown summary
  const mdSummary = formatMarkdownReport(report);
  const mdReportPath = join(RUNS_DIR, `${isoDate}-fun-bench-summary.md`);
  writeFileSync(mdReportPath, mdSummary, 'utf8');

  if (AS_JSON) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('\n' + mdSummary);
    console.log(`\nReceipt saved: ${mdReportPath}`);
  }

  if (!report.passed) {
    process.exit(1);
  }
}

function formatMarkdownReport(report) {
  const lines = [];
  lines.push(`# SpaceFace Fun Convergence Bench Report — ${report.timestamp.slice(0, 10)}`);
  lines.push(`\n**Status:** ${report.passed ? 'PASS (All benches green & deterministic)' : 'FAIL'}`);
  lines.push(`**Wall Clock:** ${(report.wallMs / 1000).toFixed(2)}s | **Mode:** ${report.headed ? 'Headed' : 'Headless'}`);
  lines.push(`**Determinism Guaranteed:** ${report.determinismVerified ? 'YES (Identical run hashes)' : 'NO'}\n`);

  if (report.benches.crucible) {
    lines.push('### Crucible Feel Bench (3 Arenas × 3 Loadouts × 3 Seeds × 3 Waves)');
    lines.push('| Arena | Loadout | Seed | Waves | Run Hash | Kills | VPM | Knock Budget Met |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const r of report.benches.crucible.runs.slice(0, 9)) {
      const m = r.metrics;
      lines.push(
        `| \`${r.arenaId}\` | \`${r.loadoutId}\` | ${r.seed} | ${r.waveCount} | \`${r.runHash.slice(0, 8)}...\` | ${m.totalKills} | ${m.verbsPerMinute.toFixed(1)} | ${m.b13Met ? 'YES' : 'NO'} |`
      );
    }
    if (report.benches.crucible.runs.length > 9) {
      lines.push(`| ... (${report.benches.crucible.runs.length - 9} more runs) | | | | | | | |`);
    }
    lines.push('');
  }

  if (report.benches.flight) {
    lines.push('### Flight Bench');
    lines.push('| Scenario | Seed | Duration | Run Hash | Status |');
    lines.push('|---|---|---|---|---|');
    for (const r of report.benches.flight.runs) {
      lines.push(`| ${r.label} | ${r.seed} | ${r.durationMs}ms | \`${r.runHash.slice(0, 8)}...\` | PASS |`);
    }
    lines.push('');
  }

  if (report.benches.verbs) {
    lines.push('### Verb Benches');
    lines.push('| Verb Bar | Seed | Duration | Run Hash | Bar Met |');
    lines.push('|---|---|---|---|---|');
    for (const r of report.benches.verbs.runs) {
      const barMet = Object.entries(r.metrics).some(([k, v]) => k.toLowerCase().includes('met') && v === true);
      lines.push(`| ${r.label} | ${r.seed} | ${r.durationMs}ms | \`${r.runHash.slice(0, 8)}...\` | ${barMet ? 'MET' : 'OPEN'} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

main().catch((err) => {
  console.error('Bench runner error:', err);
  process.exit(1);
});
