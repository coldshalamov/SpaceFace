// PQ-033.02 — evaluate the named min-spec floors against the newest release-soak
// evidence per host. Exit 0 = floors green on both hosts, 1 = floor miss,
// 2 = evidence absent (pending). Every number is recomputed from raw evidence;
// a claimed pass in the file is never trusted.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  discoverMinSpecEvidence,
  evaluateMinSpecFloors,
  loadMinSpec,
} from './lib/minSpecFloors.mjs';
import { validateReleaseSoakEvidence } from './lib/releaseSoakContracts.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function parseArgs(argv) {
  const args = { evidenceRoot: null, runtime: 'both', evidence: {} };
  const seen = new Set();
  for (const argument of argv) {
    const match = /^--([a-z][a-z0-9-]*)=(.+)$/i.exec(argument);
    if (!match) throw new Error(`unknown argument: ${argument}`);
    const [, name, value] = match;
    if (seen.has(name)) throw new Error(`duplicate argument: --${name}`);
    seen.add(name);
    if (name === 'evidence-root') args.evidenceRoot = value;
    else if (name === 'runtime') args.runtime = value;
    else if (name === 'evidence-browser') args.evidence.browser = value;
    else if (name === 'evidence-electron') args.evidence.electron = value;
    else throw new Error(`unknown argument: --${name}`);
  }
  if (!['both', 'browser', 'electron'].includes(args.runtime)) {
    throw new Error('--runtime must be browser, electron, or both');
  }
  if (args.evidenceRoot != null) args.evidenceRoot = containedDir(args.evidenceRoot, '--evidence-root');
  for (const runtime of Object.keys(args.evidence)) {
    args.evidence[runtime] = containedDir(args.evidence[runtime], `--evidence-${runtime}`);
  }
  return args;
}

function containedDir(candidate, label) {
  const resolved = path.resolve(ROOT, candidate);
  const relative = path.relative(ROOT, resolved);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must name a directory inside the repository`);
  }
  return resolved;
}

function fmtMs(value) { return value == null ? 'n/a' : `${Number(value).toFixed(1)} ms`; }

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const spec = loadMinSpec(ROOT);
  const runtimes = args.runtime === 'both' ? spec.soak.hosts : [args.runtime];

  console.log(`[min-spec] floors for ${spec.hardware.gpu.name} (${spec.hardware.gpu.tier})`);
  console.log(`[min-spec] floors: median <=${spec.floors.medianFrameMs} ms | gameplay hitches >${spec.floors.hitchThresholdMs} ms <=${spec.floors.maxHitchesPerMinute}/min | boot <=${spec.floors.bootToMenuMs} ms | heap <${spec.floors.maxHeapGrowthBytesPer30Min / (1024 * 1024)} MB/30min`);
  console.log(`[min-spec] soak: >=${spec.soak.durationMinutes} min on ${spec.soak.hosts.join(' + ')} | >=${spec.soak.minSaveLoadCycles} save/load cycles`);

  let pending = false;
  let failed = false;

  for (const runtime of runtimes) {
    const discovered = args.evidence[runtime]
      ? { dir: args.evidence[runtime], evidencePath: path.join(args.evidence[runtime], 'evidence.json') }
      : discoverMinSpecEvidence({ root: ROOT, runtime, evidenceRoot: args.evidenceRoot });
    if (!discovered) {
      console.log(`[min-spec:${runtime}] PENDING — no soak evidence under ${args.evidenceRoot || '.devshots/spec2'} matching soak-${runtime}-*`);
      pending = true;
      continue;
    }
    let evidence;
    try {
      evidence = JSON.parse(readFileSync(discovered.evidencePath, 'utf8'));
    } catch (error) {
      console.log(`[min-spec:${runtime}] FAIL — unreadable evidence at ${discovered.evidencePath}: ${error.message}`);
      failed = true;
      continue;
    }
    const contract = validateReleaseSoakEvidence(evidence, { requireArtifacts: false });
    const verdict = evaluateMinSpecFloors(evidence, spec);
    const failures = [...new Set([...contract.failures, ...verdict.failures])];
    const floors = verdict.floors;
    console.log(`[min-spec:${runtime}] evidence ${path.relative(ROOT, discovered.dir)}`);
    console.log(`[min-spec:${runtime}]   gpu: ${floors.gpu.renderer || 'unknown'} (tier=${floors.gpu.tier || '?'}, matched=${floors.gpu.matched})`);
    console.log(`[min-spec:${runtime}]   soak ${floors.soakDurationMinutes?.toFixed(1) ?? 'n/a'} min | cycles ${floors.cycles ?? 0} | save/load ${floors.saveLoadCycles ?? 0}`);
    console.log(`[min-spec:${runtime}]   median frame ${fmtMs(floors.medianFrameMs)} (${floors.medianFps?.toFixed(1) ?? 'n/a'} fps, ${floors.medianFrameMsSource}) | hitches ${floors.hitchCount ?? 0} total, ${floors.gameplayHitchCount ?? 0} gameplay (${floors.gameplayHitchesPerMinute?.toFixed(2) ?? 'n/a'}/min)`);
    console.log(`[min-spec:${runtime}]   boot ${fmtMs(floors.bootToMenuMs)} | heap ${floors.heapGrowthMbPer30Min?.toFixed(1) ?? 'n/a'} MB/30min`);
    if (failures.length === 0) {
      console.log(`[min-spec:${runtime}] PASS`);
    } else {
      failed = true;
      for (const failure of failures) console.log(`[min-spec:${runtime}]   FAIL ${failure}`);
    }
  }

  if (pending) {
    const minDurationMs = spec.soak.durationMinutes * 60_000;
    console.log(`[min-spec] PENDING — run scripts/check-release-soak-{browser,electron}.mjs with --min-duration-ms=${minDurationMs} --cycles=${spec.soak.minSaveLoadCycles} --cycle-screenshots=0 --task-id=min-spec-soak-<runtime>`);
    return 2;
  }
  console.log(failed ? '[min-spec] FAIL' : '[min-spec] PASS — floors green on all required hosts');
  return failed ? 1 : 0;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((error) => {
    console.error(`[min-spec] FAIL: ${error?.stack || error}`);
    process.exitCode = 1;
  });
