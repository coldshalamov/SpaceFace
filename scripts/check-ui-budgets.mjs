#!/usr/bin/env node
// PQ-184.00 — check the committed per-surface UI budget baseline: every surface's measured mean
// frame cost and DOM node count against the grammar's thresholds, plus the baseline's own
// integrity (schema, headed renderer, current UI source digest). A stale or missing baseline is
// red, not a quiet pass — a budget nobody measures is the same lie as a budget nobody meets.
//
// The thresholds are cited, never restated: scripts/ui-grammar-thresholds.mjs is the one home of
// the numbers (design/frontend/INSTRUMENT_GRAMMAR.md §12.1).
//
// Re-shoot the baseline after UI changes:
//   node scripts/capture-ui-matrix.mjs --headed --mode=default --viewport=1920x1080 \
//     --budgets-out=test/ui-frame-references/budgets.json
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { MAX_UI_FRAME_MS, MAX_SURFACE_DOM_NODES } from './ui-grammar-thresholds.mjs';
import { UI_BUDGETS_FILE, judgeBudgets, uiSourceDigest } from './lib/uiBudgets.mjs';
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
      // A stale verdict means the digest over the working tree no longer matches the
      // committed baseline. Name the drift rather than guessing: the digest walks the
      // filesystem, so .gitignore'd strays (which `git status` never shows) move the hash
      // just as surely as tracked edits. Diff the walked set against the tracked set —
      // the strays ARE the drift.
      const roots = ['src/ui', 'styles', 'src/core', 'src/render'];
      const walked = new Set();
      const collect = (dir) => {
        let entries = [];
        try { entries = readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) collect(full);
          else walked.add(path.relative(ROOT, full).replaceAll('\\', '/'));
        }
      };
      for (const root of roots) collect(path.join(ROOT, root));
      const tracked = new Set(
        (spawnSync('git', ['ls-files', '--', ...roots], { cwd: ROOT, encoding: 'utf8' }).stdout || '')
          .split('\n').filter(Boolean),
      );
      const strays = [...walked].filter((p) => !tracked.has(p)).sort();
      const missing = [...tracked].filter((p) => !walked.has(p)).sort();
      console.error(`  digest computed: ${uiSourceDigest(ROOT)} vs baseline ${baseline.uiSourceDigest}`);
      console.error(`  digest inputs: ${walked.size} walked vs ${tracked.size} tracked`);
      if (strays.length) console.error(`  strays hashed but not tracked: ${strays.slice(0, 12).join(', ')}`);
      if (missing.length) console.error(`  tracked but absent: ${missing.slice(0, 12).join(', ')}`);
      if (!strays.length && !missing.length) {
        // Same file set — find the byte drift directly: hash every walked file and
        // diff it against the committed per-file manifest (test/ui-frame-references/
        // source-manifest.json), which names exactly which inputs moved the digest.
        const manifestPath = path.join(ROOT, 'test/ui-frame-references/source-manifest.json');
        if (existsSync(manifestPath)) {
          const expected = JSON.parse(readFileSync(manifestPath, 'utf8'));
          const changed = [];
          const { createHash } = await import('node:crypto');
          const { readFileSync: readBytes } = await import('node:fs');
          const canon = (buf) => (buf.includes('\r\n') ? Buffer.from(buf.toString('utf8').replaceAll('\r\n', '\n')) : buf);
          for (const rel of walked) {
            const digest = createHash('sha256').update(canon(readBytes(path.join(ROOT, rel)))).digest('hex');
            if (expected[rel] !== digest) changed.push(rel);
          }
          changed.sort();
          console.error(changed.length
            ? `  bytes diverge from manifest in ${changed.length} files: ${changed.slice(0, 12).join(', ')}`
            : '  per-file bytes identical to manifest — drift is inside the hash ordering');
        }
        const dirty = spawnSync('git', ['status', '--porcelain', '--', ...roots],
          { cwd: ROOT, encoding: 'utf8' }).stdout || '';
        console.error(`  tracked-byte drift vs index:\n${dirty.trim() || '    (none — content matches the index)'}`);
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
