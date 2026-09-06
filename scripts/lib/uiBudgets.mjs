// scripts/lib/uiBudgets.mjs — PQ-184.00 "the budgets, measured": the per-surface UI frame-cost
// and DOM-node baseline, its aggregation from capture rows, and the fail-red judge.
//
// Law: the numbers live in scripts/ui-grammar-thresholds.mjs and nowhere else (INSTRUMENT_GRAMMAR
// §12.1) — this module cites them, never restates them. The baseline is renderer-scoped (headed
// Chromium on the host GPU; headless SwiftShader is explicitly not performance evidence) and
// carries a UI source digest so a stale baseline is itself a red, not a quiet pass.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { MAX_UI_FRAME_MS, MAX_SURFACE_DOM_NODES } from '../ui-grammar-thresholds.mjs';

export const UI_BUDGETS_SCHEMA = 'spaceface.ui-budget-baseline.v1';
export const UI_BUDGETS_FILE = 'test/ui-frame-references/budgets.json';

/** Directories whose content the UI frame/node budget covers: the DOM sources plus the modules
 * that run inside the measured rAF callback (sim presentation + render submission move the same
 * number), so a slowdown there stales the baseline instead of reading as a UI regression. */
const UI_SOURCE_ROOTS = ['src/ui', 'styles', 'src/core', 'src/render'];

/** Content digest of the UI source the budget covers — the baseline's staleness contract. */
export function uiSourceDigest(repoRoot) {
  const hash = createHash('sha256');
  const walk = (dir) => {
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        hash.update(relative(repoRoot, full).replaceAll('\\', '/'));
        hash.update('\0');
        hash.update(readFileSync(full));
        hash.update('\0');
      }
    }
  };
  for (const root of UI_SOURCE_ROOTS) walk(join(repoRoot, root));
  return hash.digest('hex');
}

/**
 * Aggregate per-frame capture rows ({ surface, budget: { frameMs, domNodes } }) into the
 * per-surface baseline: the budget is per surface, so a surface's number is the WORST frame
 * sample the run saw, not the average.
 */
export function aggregateBudgetRows(rows) {
  const surfaces = new Map();
  for (const row of rows || []) {
    if (!row || !row.surface || !row.budget || !row.budget.frameMs) continue;
    // A zero-sample read (throttled page, hidden tab) is not a zero cost — skip it rather than
    // commit a healthy-looking lie.
    if (!row.budget.frameMs.n) continue;
    const prior = surfaces.get(row.surface) || {
      domNodes: 0,
      frameMeanMs: 0,
      frameP95Ms: 0,
      frameMaxMs: 0,
      samples: 0,
    };
    prior.domNodes = Math.max(prior.domNodes, row.budget.domNodes || 0);
    prior.frameMeanMs = Math.max(prior.frameMeanMs, row.budget.frameMs.mean || 0);
    prior.frameP95Ms = Math.max(prior.frameP95Ms, row.budget.frameMs.p95 || 0);
    prior.frameMaxMs = Math.max(prior.frameMaxMs, row.budget.frameMs.max || 0);
    prior.samples = Math.max(prior.samples, row.budget.frameMs.n);
    surfaces.set(row.surface, prior);
  }
  return Object.fromEntries([...surfaces.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * The fail-red judge, in two layers:
 *  - REGRESSION (always red): a surface whose measured number is worse than its committed
 *    baseline row — the "regression fails red the day it lands" contract.
 *  - INTEGRITY (always red): a stale, headless, or empty baseline — a budget nobody measures is
 *    the same lie as a budget nobody meets.
 *  - GRAMMAR DEBT (reported, red only under strict): surfaces over the grammar's §12.1 thresholds
 *    are the measured debt PQ-184.01/.02 exist to pay; the instrument names them loudly so the
 *    debt cannot quietly become furniture. `strict: true` (the flag .01/.02 flip on) makes the
 *    debt itself red.
 */
export function judgeBudgets(baseline, { sourceDigest = null, current = null, strict = false, expectedSurfaceIds = null } = {}) {
  const failures = [];
  if (!baseline || baseline.schema !== UI_BUDGETS_SCHEMA) {
    failures.push(`baseline:${UI_BUDGETS_SCHEMA} schema missing or wrong`);
    return { ok: false, failures, breaches: [], debt: [], strictFailures: [] };
  }
  if (baseline.headed !== true) {
    failures.push('baseline:not-headed — headless SwiftShader numbers are not performance evidence; '
      + 're-shoot with --headed');
  }
  if (sourceDigest && baseline.uiSourceDigest !== sourceDigest) {
    failures.push('baseline:stale — the UI source changed since the baseline was shot; '
      + 're-run capture:ui-matrix --budgets-out');
  }
  const surfaces = baseline.surfaces || {};
  if (!Object.keys(surfaces).length) failures.push('baseline:empty — no per-surface rows');
  if (expectedSurfaceIds && expectedSurfaceIds.length) {
    // A NAMED gap (the capture run recorded the surface as a failure, with its reason, in the
    // baseline's `missing` list) is visible and accepted; an UNNAMED missing surface is a silent
    // shrink and red.
    const namedGaps = new Set((baseline.missing || []).map((m) => m && m.surface).filter(Boolean));
    const missing = expectedSurfaceIds.filter((id) => !surfaces[id] && !namedGaps.has(id));
    if (missing.length) {
      failures.push(`baseline:incomplete — ${missing.length} reachable surface(s) never measured `
        + `and never named as a capture failure: ${missing.slice(0, 6).join(', ')}`);
    }
  }

  const breaches = [];
  if (current) {
    // Regression layer: worse than the committed baseline is red the day it lands. A surface the
    // baseline never recorded is a NEW measured surface — recorded, not failed. max is excluded:
    // a single hitch is noise, the mean/p95 are the steady state the budget buys.
    for (const [id, row] of Object.entries(current.surfaces || {})) {
      const committed = surfaces[id];
      if (!committed) continue;
      for (const key of ['frameMeanMs', 'frameP95Ms', 'domNodes']) {
        if (row[key] > committed[key] * 1.05 + 0.05) {
          breaches.push(`${id}: ${key} ${row[key]} worse than committed ${committed[key]}`);
        }
      }
    }
  }

  const debt = [];
  for (const [id, row] of Object.entries(surfaces)) {
    if (!(row.frameMeanMs <= MAX_UI_FRAME_MS)) {
      debt.push(`${id}: mean UI frame cost ${row.frameMeanMs?.toFixed?.(3)} ms > ${MAX_UI_FRAME_MS} ms grammar budget (owed to PQ-184.01/.02)`);
    }
    if (!(row.domNodes <= MAX_SURFACE_DOM_NODES)) {
      debt.push(`${id}: ${row.domNodes} DOM nodes > ${MAX_SURFACE_DOM_NODES} grammar budget (owed to PQ-184.01)`);
    }
  }
  const strictFailures = strict
    ? debt.map((d) => `strict grammar budget: ${d}`)
    : [];
  return {
    ok: failures.length === 0 && breaches.length === 0 && strictFailures.length === 0,
    failures,
    breaches,
    debt,
    strictFailures,
  };
}
