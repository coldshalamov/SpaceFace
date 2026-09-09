#!/usr/bin/env node
// Source reachability ratchet.
//
// AGENTS.md §6 already states the invariant — "player-facing work must be reachable on the default
// route. A local candidate, report, or hidden flag is not completion" — and nothing enforced it. The
// result was measurable: ~27k LOC of src/ was unreachable from src/main.js. Most of that is
// legitimate tooling, but it also included modules named as FEATURES. At ratchet landing,
// src/systems/titles.js said the quiet part out loud in its own header:
//
//     "exposes semantic events for future morale, decal, ticker, and ledger integration.
//      No consumer is required for this reducer to remain deterministic and save-safe."
//
// It had zero importers and was invisible to the player. S4 later closed that exact exception through
// the production manifest, combat producer, morale/news/Ledger consumers, and live hull title stamp;
// the historical example remains here because preventing another isolated feature is this ratchet's job.
//
// This is a RATCHET, not a cleanup mandate. It does not demand that the existing orphans be wired —
// that is a scheduling decision, not a scripting one. It fails when a NEW orphan appears under the
// ratcheted directories, which is the cheap moment to catch it: while the author still remembers why
// the module exists and what was supposed to consume it.
//
// Design mirrors scripts/check-gate-reachability.mjs deliberately, including its stale-exception rule:
//   - `toolingRoots`  prefixes that are legitimately not part of the game (test labs, contracts,
//                     balance harnesses). Not reported at all.
//   - `ratchetRoots`  prefixes where a NEW orphan is a failure.
//   - `knownOrphans`  today's orphans inside the ratchet roots, each with a concrete reason. If one
//                     becomes reachable, its entry is STALE and must be removed — an exception list
//                     that silently accumulates resolved entries stops meaning anything.
//
// Reachability is import-graph only: static relative `import`/`export ... from` plus dynamic
// `import('./x.js')`. A module reached solely through a string built at runtime will read as an
// orphan, which is the correct default — if the graph cannot see the wiring, neither can a reader.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'src');
const ENTRY = resolve(SRC, 'main.js');
const BASELINE_PATH = resolve(ROOT, 'test/src-reachability.baseline.json');

const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(?\s*|\bexport\s+\*\s+from\s*)['"]([^'"]+)['"]/g;

export function listSourceFiles(dir = SRC) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.js')) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

/** Resolve a relative specifier the way the browser importmap does: exact path, else append .js. */
function resolveSpecifier(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), spec);
  if (base.endsWith('.js')) return base;
  return `${base}.js`;
}

export function collectReachable(entry = ENTRY) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    let src;
    try { src = readFileSync(file, 'utf8'); } catch { continue; }
    seen.add(file);
    IMPORT_RE.lastIndex = 0;
    let m;
    while ((m = IMPORT_RE.exec(src))) {
      const target = resolveSpecifier(file, m[1]);
      if (!target) continue;
      try { if (!statSync(target).isFile()) continue; } catch { continue; }
      if (!seen.has(target)) stack.push(target);
    }
  }
  return seen;
}

const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');

export function auditSourceReachability(baseline, { files = listSourceFiles(), reachable = collectReachable() } = {}) {
  const toolingRoots = baseline.toolingRoots || [];
  const ratchetRoots = baseline.ratchetRoots || [];
  const known = baseline.knownOrphans && typeof baseline.knownOrphans === 'object' ? baseline.knownOrphans : {};

  const orphans = files.map(rel).filter((f) => !reachable.has(resolve(ROOT, f)));
  const tooling = orphans.filter((f) => toolingRoots.some((p) => f.startsWith(p)));
  const ratcheted = orphans.filter((f) => ratchetRoots.some((p) => f.startsWith(p)));

  const newOrphans = ratcheted.filter((f) => !(f in known));
  const missingReason = ratcheted.filter((f) => (f in known) && !String(known[f] || '').trim());
  // Stale exception: baselined as an orphan but now reachable (or gone). Same rule the gate audit uses.
  const staleExceptions = Object.keys(known).filter((f) => !ratcheted.includes(f));

  return {
    totalFiles: files.length,
    reachableCount: [...reachable].filter((f) => f.startsWith(SRC)).length,
    orphanCount: orphans.length,
    toolingCount: tooling.length,
    ratchetedCount: ratcheted.length,
    ratcheted,
    newOrphans,
    missingReason,
    staleExceptions,
    ok: newOrphans.length === 0 && missingReason.length === 0 && staleExceptions.length === 0,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes('--write');
  const defaults = {
    schema: 'spaceface.srcReachability.baseline.v1',
    note: 'Ratchet, not a cleanup mandate. knownOrphans records what was already unreachable under '
      + 'ratchetRoots when this gate landed; each needs a concrete reason, and an entry that becomes '
      + 'reachable is STALE and must be deleted. New orphans under ratchetRoots fail the build.',
    toolingRoots: ['src/testing/', 'src/contracts/', 'src/balance/', 'src/observability/'],
    ratchetRoots: ['src/systems/', 'src/ui/'],
    knownOrphans: {},
  };
  let baseline = defaults;
  try { baseline = { ...defaults, ...JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) }; } catch { /* first run */ }

  if (write) {
    const probe = auditSourceReachability({ ...baseline, knownOrphans: {} });
    const knownOrphans = {};
    for (const f of probe.ratcheted) {
      knownOrphans[f] = baseline.knownOrphans[f]
        || 'Unreachable from src/main.js when the reachability ratchet landed; wire to the default route or retire.';
    }
    writeFileSync(BASELINE_PATH, `${JSON.stringify({ ...baseline, recordedAt: new Date().toISOString().slice(0, 10), knownOrphans }, null, 2)}\n`);
    console.log(`[src-reachability] wrote ${rel(BASELINE_PATH)} with ${probe.ratcheted.length} baselined orphan(s)`);
    process.exit(0);
  }

  const report = auditSourceReachability(baseline);
  console.log(`src files: ${report.totalFiles}  reachable from src/main.js: ${report.reachableCount}  orphans: ${report.orphanCount}`
    + `  (tooling ${report.toolingCount}, ratcheted ${report.ratchetedCount})`);

  if (report.newOrphans.length) {
    console.error('\nNEW unreachable module(s) under a ratcheted root — nothing on the default route imports these:');
    for (const f of report.newOrphans) console.error(`  - ${f}`);
    console.error('\nWire it to the default route, or, if it is genuinely staged work, add it to'
      + `\n${rel(BASELINE_PATH)} with a concrete reason. A module with a test and no consumer is not a feature.`);
  }
  if (report.missingReason.length) {
    console.error('\nBaselined orphan(s) with an empty reason:');
    for (const f of report.missingReason) console.error(`  - ${f}`);
  }
  if (report.staleExceptions.length) {
    console.error('\nSTALE exception(s) — baselined as unreachable but now reachable or deleted. Remove them:');
    for (const f of report.staleExceptions) console.error(`  - ${f}`);
  }

  if (!report.ok) { process.exitCode = 1; } else {
    console.log(`\nPASS check:src-reachability — ${report.ratchetedCount} baselined orphan(s), no new ones.`);
  }
}
