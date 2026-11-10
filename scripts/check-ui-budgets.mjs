#!/usr/bin/env node
// PQ-184.00 — check the committed per-surface UI budget baseline: every surface's measured mean
// frame cost and DOM node count against the grammar's thresholds, plus the baseline's own
// integrity (schema, headed renderer, rendered-UI source digest). A stale or missing baseline is
// red, not a quiet pass — a budget nobody measures is the same lie as a budget nobody meets.
//
// The digest covers only the UI layer the matrix renders (D222 — uiBudgets.mjs): the surface
// owner modules, the measured UI owner, index.html, and their import graph inside src/ui/.
// A commit to styles, render, core, data, or an unmounted UI file no longer re-drifts it.
//
// The thresholds are cited, never restated: scripts/ui-grammar-thresholds.mjs is the one home of
// the numbers (design/frontend/INSTRUMENT_GRAMMAR.md §12.1).
//
// Re-shoot the baseline after UI changes:
//   node scripts/capture-ui-matrix.mjs --headed --mode=default --viewport=1920x1080 \
//     --budgets-out=test/ui-frame-references/budgets.json
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { MAX_UI_FRAME_MS, MAX_SURFACE_DOM_NODES } from './ui-grammar-thresholds.mjs';
import { UI_BUDGETS_FILE, judgeBudgets, uiRenderedSourceFiles, uiSourceDigest } from './lib/uiBudgets.mjs';
import { AUTOMATABLE_SURFACES } from './ui-grammar-surfaces.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const baselinePath = path.join(ROOT, UI_BUDGETS_FILE);

// Optional live re-measurement: --current=<path> judges a fresh capture against the committed
// rows (the regression layer the tests exercise). Without it the check enforces baseline
// integrity and names the grammar debt.
const currentArg = (process.argv.find((a) => a.startsWith('--current=')) || '').slice('--current='.length);
let current = null;
if (currentArg) {
  const currentPath = path.resolve(currentArg);
  current = JSON.parse(readFileSync(currentPath, 'utf8'));
}

if (!existsSync(baselinePath)) {
  console.error(`FAIL check:ui:budgets — ${UI_BUDGETS_FILE} does not exist. `
    + 'Shoot it: node scripts/capture-ui-matrix.mjs --headed --mode=default --viewport=1920x1080 '
    + `--budgets-out=${UI_BUDGETS_FILE}`);
  process.exitCode = 1;
}

let baseline = null;
if (!process.exitCode) {
  try {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  } catch (error) {
    console.error(`FAIL check:ui:budgets — ${UI_BUDGETS_FILE} is not valid JSON: ${error.message}`);
    process.exitCode = 1;
  }
}

if (baseline) {
  const verdict = judgeBudgets(baseline, {
    sourceDigest: uiSourceDigest(ROOT),
    current,
    strict: process.argv.includes('--strict'),
    expectedSurfaceIds: AUTOMATABLE_SURFACES.map((s) => s.id),
  });

  const surfaces = baseline.surfaces || {};
  const worst = Object.entries(surfaces)
    .sort(([, a], [, b]) => b.frameMeanMs - a.frameMeanMs)[0];
  console.log(`check:ui:budgets — ${Object.keys(surfaces).length} surfaces, renderer: ${baseline.renderer}`);
  if (worst) {
    const byDom = Object.entries(surfaces).sort(([, a], [, b]) => b.domNodes - a.domNodes)[0];
    console.log(`  worst mean frame cost: ${worst[0]} ${worst[1].frameMeanMs.toFixed(3)} ms `
      + `(grammar budget ${MAX_UI_FRAME_MS} ms) · worst DOM count: ${byDom[0]} ${byDom[1].domNodes} `
      + `(grammar budget ${MAX_SURFACE_DOM_NODES})`);
  }
  for (const failure of verdict.failures) {
    console.error(`  FAIL ${failure}`);
    if (failure.startsWith('baseline:stale')) {
      // A stale verdict means the digest over the working tree's rendered UI layer no longer
      // matches the committed baseline. Name the drift rather than guessing: the digest walks
      // the rendered module set, so an untracked module (which `git status` never shows) moves
      // the hash just as surely as a tracked edit. Diff the rendered set against the tracked
      // set, then per-file bytes against the manifest — the moved inputs ARE the drift.
      const rendered = uiRenderedSourceFiles(ROOT);
      const tracked = new Set(
        (spawnSync('git', ['ls-files', '--', ...rendered], { cwd: ROOT, encoding: 'utf8' }).stdout || '')
          .split('\n').filter(Boolean),
      );
      const strays = rendered.filter((p) => !tracked.has(p));
      const missing = [...tracked].filter((p) => !rendered.includes(p)).sort();
      console.error(`  digest computed: ${uiSourceDigest(ROOT)} vs baseline ${baseline.uiSourceDigest}`);
      console.error(`  digest inputs: ${rendered.length} rendered files (${tracked.size} tracked)`);
      if (strays.length) console.error(`  rendered but untracked: ${strays.slice(0, 12).join(', ')}`);
      if (missing.length) console.error(`  tracked but absent from tree: ${missing.slice(0, 12).join(', ')}`);
      if (!strays.length && !missing.length) {
        // Same file set — find the byte drift directly. The baseline's own uiSourceFiles map
        // (written by every --budgets-out run) is authoritative; the committed per-file
        // manifest at test/ui-frame-references/source-manifest.json is the fallback for
        // baselines shot before the map existed.
        const manifestPath = path.join(ROOT, 'test/ui-frame-references/source-manifest.json');
        const expected = baseline.uiSourceFiles
          || (existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null);
        if (expected) {
          const changed = [];
          const { createHash } = await import('node:crypto');
          const { readFileSync: readBytes } = await import('node:fs');
          const canon = (buf) => (buf.includes('\r\n') ? Buffer.from(buf.toString('utf8').replaceAll('\r\n', '\n')) : buf);
          for (const rel of rendered) {
            const digest = createHash('sha256').update(canon(readBytes(path.join(ROOT, rel)))).digest('hex');
            if (expected[rel] !== digest) changed.push(rel);
          }
          changed.sort();
          console.error(changed.length
            ? `  rendered bytes moved in ${changed.length} files: ${changed.slice(0, 12).join(', ')}`
            : '  per-file rendered bytes identical to baseline map — drift is inside the hash ordering');
        }
        const dirty = spawnSync('git', ['status', '--porcelain', '--', ...rendered],
          { cwd: ROOT, encoding: 'utf8' }).stdout || '';
        console.error(`  tracked-byte drift vs index:\n${dirty.trim() || '    (none — rendered source matches the index)'}`);
      }
    }
  }
  for (const breach of verdict.breaches) console.error(`  REGRESSION ${breach}`);
  for (const debt of verdict.debt) console.log(`  GRAMMAR DEBT ${debt} (red under --strict)`);
  for (const strict of verdict.strictFailures) console.error(`  FAIL ${strict}`);

  if (!verdict.ok) {
    console.error('FAIL check:ui:budgets');
    process.exitCode = 1;
  } else {
    console.log('PASS check:ui:budgets');
  }
}
