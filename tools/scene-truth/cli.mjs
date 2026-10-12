#!/usr/bin/env node
import path from 'node:path';
import { analyzePack } from './lib/analyze.mjs';
import { buildVerdict, LIMITATIONS, REPORT_SCHEMA, writeAtlas } from './lib/atlas.mjs';
import { runCritique } from './lib/critique.mjs';
import { buildInventory, readHeadCommit } from './lib/inventory.mjs';
import { repoRoot } from './lib/root.mjs';
import { coverageGaps, sceneCatalog } from './lib/scenarios.mjs';
import { witnessScenario } from './lib/witness.mjs';

function parseArgs(argv) {
  const out = { only: null, outDir: path.join(repoRoot, 'artifacts/scene-truth'), list: false, inventory: false, skipSim: false };
  for (const arg of argv) {
    if (arg === '--list') out.list = true;
    else if (arg === '--inventory') out.inventory = true;
    else if (arg === '--skip-sim') out.skipSim = true;
    else if (arg.startsWith('--only=')) out.only = arg.slice('--only='.length);
    else if (arg.startsWith('--out=')) out.outDir = path.resolve(arg.slice('--out='.length));
    else throw new Error(`unknown argument ${arg}`);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const catalog = sceneCatalog();
  const gaps = coverageGaps(catalog);
  if (gaps.length) throw new Error(`scene catalog is missing coverage: ${gaps.join(', ')}`);
  if (args.list) {
    for (const entry of catalog) console.log(`${entry.id}\t${entry.source}\t${entry.covers.join(',')}`);
    console.log(`scenarios ${catalog.length}`);
    return;
  }
  const started = performance.now();
  const inventory = buildInventory();
  if (args.inventory && args.skipSim) {
    console.log(JSON.stringify({ pilots: inventory.packages, ships: inventory.requiredShips.length, gpu: inventory.gpu }, null, 2));
    return;
  }
  const selected = args.only ? catalog.filter((entry) => entry.id === args.only) : catalog;
  if (!selected.length) throw new Error(`no scenario ${args.only}`);
  const packs = [];
  if (!args.skipSim) {
    for (const entry of selected) {
      process.stderr.write(`scene-truth ${entry.id}\n`);
      packs.push(await witnessScenario(entry));
    }
  }
  const simCostMs = performance.now() - started;
  const issues = [];
  const scenarioRows = [];
  for (const pack of packs) {
    const packIssues = analyzePack(pack);
    issues.push(...packIssues);
    scenarioRows.push({
      id: pack.id,
      source: pack.source || 'authored',
      sourcePath: pack.sourcePath || null,
      objectCount: pack.objectCount || 0,
      labStatus: pack.lab ? pack.lab.status : 'infra',
      labOk: !!(pack.lab && pack.lab.ok),
      highFails: packIssues.filter((row) => row.failBuild).length,
      tick: pack.tick ?? null,
      elapsedMs: Math.round(pack.elapsedMs || 0),
      covers: pack.covers || [],
    });
  }
  const critique = runCritique();
  const commit = readHeadCommit();
  const verdict = buildVerdict({
    commit,
    scenarioCount: selected.length,
    issues,
    reviews: inventory.reviews,
    critique,
    faults: critique.faults,
    benign: critique.benign,
  });
  const captureCostMs = performance.now() - started;
  const report = {
    schema: REPORT_SCHEMA,
    command: 'node tools/scene-truth/cli.mjs',
    commit,
    limitations: LIMITATIONS,
    scenarioCount: selected.length,
    scenarioRows,
    packs: packs.map((pack) => ({
      id: pack.id,
      source: pack.source,
      sourcePath: pack.sourcePath,
      covers: pack.covers,
      lab: pack.lab,
      tick: pack.tick,
      priorTick: pack.priorTick,
      focus: pack.focus,
      objectCount: pack.objectCount,
      elapsedMs: pack.elapsedMs,
      error: pack.error || null,
      views: pack.views,
    })),
    issues,
    reviews: inventory.reviews,
    faults: critique.faults,
    benign: critique.benign,
    critique: { ok: critique.ok, summary: critique.summary, attempts: critique.attempts },
    inventory,
    verdict,
    simCostMs,
    captureCostMs,
    runtimeFps: null,
  };
  const written = writeAtlas(args.outDir, report);
  console.log(JSON.stringify({
    verdict: report.verdict,
    outDir: written.outDir,
    scenarioCount: selected.length,
    highFailCount: verdict.highFailCount,
    simCostMs: Math.round(simCostMs),
    captureCostMs: Math.round(captureCostMs),
    runtimeFps: null,
  }, null, 2));
  if (!verdict.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
