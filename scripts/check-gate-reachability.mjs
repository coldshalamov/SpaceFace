#!/usr/bin/env node
// Gate reachability audit.
//
// A check nobody runs is indistinguishable from a check that does not exist. This program shipped
// fourteen green atlas gates that no aggregate referenced, so the suite could report health it had
// never measured. This script makes that failure mode loud and keeps it from returning.
//
// The reachable set is computed from the SAME roots `scripts/check-ci-report.mjs` expands to build
// the CI matrix (`scripts.precheck` + `scripts.check`), so "reachable" here means exactly "executed
// and gated by `npm run check:ci`". If that matrix source changes, change ROOTS with it.
//
// The baseline governs the program gates in this packet, not every historical npm script:
//   - `mustGate` entries MUST stay reachable. Every direct check:atlas member must be pinned here.
//   - `manualGates` entries MUST stay declared and unreachable, with a non-empty reason explaining
//     why they cannot join the blocking matrix yet. If one becomes reachable, its exception is stale.
//
// The repository-wide orphan count remains useful inventory, but it is informational until every
// historical check has been adjudicated. This audit does not pretend 200+ unexplained names are
// reasoned debt.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CI_MATRIX_ROOT_SCRIPTS,
  collectReachable,
  directNpmDependencies,
} from './lib/ciGateGraph.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The walker and the matrix-source list both live in scripts/lib/ciGateGraph.mjs now — one
// definition of "reachable from the CI roots", shared with check-ci-report.mjs and with the gates
// that assert a specific check is wired in. Do not re-copy either here.
const ROOTS = CI_MATRIX_ROOT_SCRIPTS;
const BASELINE_PATH = resolve(ROOT, 'test/gate-reachability.baseline.json');

// Re-exported for existing importers (test/gate-reachability-contract.test.mjs).
export { collectReachable, directNpmDependencies };

export function auditReachability(scripts, baseline) {
  const declared = Object.keys(scripts).filter((name) => name.startsWith('check:'));
  const declaredSet = new Set(declared);
  const reachable = collectReachable(scripts);
  const orphans = declared.filter((name) => !reachable.has(name));
  const orphanSet = new Set(orphans);
  const mustGate = baseline.mustGate || [];
  const mustGateSet = new Set(mustGate);
  const manualGates = baseline.manualGates && typeof baseline.manualGates === 'object'
    ? baseline.manualGates
    : {};
  const atlasMembers = directNpmDependencies(scripts['check:atlas'])
    .filter((name) => name.startsWith('check:'));
  const failures = [];

  for (const name of mustGate) {
    if (!declaredSet.has(name)) {
      failures.push(`mustGate "${name}" is not a declared npm script`);
    } else if (!reachable.has(name)) {
      failures.push(`mustGate "${name}" is UNREACHABLE from [${ROOTS.join(', ')}] — it gates nothing`);
    }
  }
  if (mustGateSet.size !== mustGate.length) {
    failures.push('mustGate contains duplicate entries');
  }
  for (const name of atlasMembers) {
    if (!mustGateSet.has(name)) {
      failures.push(`check:atlas member "${name}" is reachable but not pinned in mustGate`);
    }
  }
  for (const [name, reason] of Object.entries(manualGates)) {
    if (typeof reason !== 'string' || reason.trim().length < 20) {
      failures.push(`manualGates "${name}" needs a concrete reason of at least 20 characters`);
    }
    if (!declaredSet.has(name)) {
      failures.push(`manualGates lists "${name}", which is no longer a declared script — prune it`);
    } else if (!orphanSet.has(name)) {
      failures.push(`manualGates lists "${name}", but it is now reachable — remove the stale exception`);
    }
    if (mustGateSet.has(name)) {
      failures.push(`"${name}" cannot be both mustGate and manualGates`);
    }
  }

  return {
    schema: 'spaceface.gateReachability.v2',
    roots: ROOTS,
    declared: declared.length,
    reachable: reachable.size,
    orphans: orphans.length,
    mustGate: mustGate.length,
    manualGates: Object.keys(manualGates).length,
    atlasMembers: atlasMembers.length,
    orphanList: orphans,
    failures,
    ok: failures.length === 0,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const scripts = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).scripts || {};
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const report = auditReachability(scripts, baseline);

  const artifact = resolve(ROOT, 'scratch/gate-reachability/report.json');
  mkdirSync(dirname(artifact), { recursive: true });
  writeFileSync(artifact, `${JSON.stringify(report, null, 2)}\n`);

  console.log(
    `gate reachability: ${report.declared} declared, ${report.reachable} reachable, `
    + `${report.orphans} repository-wide orphans (inventory only), `
    + `${report.mustGate} pinned must-gate, ${report.manualGates} reasoned manual`,
  );
  console.log(`inventory artifact: ${artifact}`);
  if (!report.ok) {
    console.error('\ngate reachability FAILED:');
    for (const failure of report.failures) console.error(`  - ${failure}`);
    console.error(
      '\nIf a governed check is intentionally manual, add it to manualGates in'
      + '\ntest/gate-reachability.baseline.json with a concrete reason. Do not baseline unrelated orphans.',
    );
    process.exit(1);
  }
  console.log('\nGate reachability OK — every pinned program gate is reachable and every manual exception is reasoned.');
}
