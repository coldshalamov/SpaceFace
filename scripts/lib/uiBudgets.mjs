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

export const UI_BUDGETS_SCHEMA = 'spaceface.ui-budget-baseline.v2';
export const UI_BUDGETS_FILE = 'test/ui-frame-references/budgets.json';
// The budget's frameMeanMs/frameP95Ms/frameMaxMs fields are deliberately kept for the existing
// checker, but these tags make their meaning explicit. A prior v1 row measured an arbitrary rAF
// callback (which could contain simulation, render, or another UI animation) and cannot be compared
// with this scoped sample. Known authored UI rAF callbacks are admitted only from an src/ui callsite
// and are bucketed into the same presentation timestamp as the UI owner.
export const UI_BUDGET_MEASUREMENT_SCOPE = 'registry.get("ui").frame+authored-src/ui-raf-by-presentation-timestamp';
export const UI_FRAME_TOTAL_SCOPE = 'presentation-runner.game-rAF-callback';
export const UI_KNOWN_RAF_SCOPE = 'window.requestAnimationFrame.authored-src-ui-callback';
export const UI_AUXILIARY_RAF_SCOPE = 'window.requestAnimationFrame.unclassified-non-game-callback';
export const UI_DOM_LAYOUT_SCOPE = 'ui-owner-synchronous-javascript-window';

/** Directories whose content the UI frame/node budget covers: the DOM sources plus the modules
 * that own the UI and its presentation context. The baseline carries separate scope tags for the
 * synchronous UI owner, authored UI rAF callbacks, the whole game rAF callback, and unknown rAF work. */
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

function hasStats(value, { allowEmpty = false } = {}) {
  return !!(value
    && Number.isFinite(value.mean) && value.mean >= 0
    && Number.isFinite(value.p95) && value.p95 >= 0
    && Number.isFinite(value.max) && value.max >= 0
    && Number.isInteger(value.n) && value.n >= 0
    && (allowEmpty || value.n > 0));
}

/**
 * A capture row is usable only when it carries the exact owner scopes. In particular, a v1-style
 * `{ frameMs }` sample is not allowed to masquerade as a UI-owner measurement, and a missing DOM
 * count is not converted into a healthy-looking zero.
 */
export function isUiBudgetSample(row) {
  const budget = row && row.budget;
  return !!(row && row.surface
    && budget
    && budget.measurementScope === UI_BUDGET_MEASUREMENT_SCOPE
    && budget.frameTotalScope === UI_FRAME_TOTAL_SCOPE
    && budget.knownUiRafScope === UI_KNOWN_RAF_SCOPE
    && budget.auxiliaryRafScope === UI_AUXILIARY_RAF_SCOPE
    && budget.domLayoutScope === UI_DOM_LAYOUT_SCOPE
    && hasStats(budget.uiFrameMs)
    && hasStats(budget.uiOwnerMs)
    && hasStats(budget.knownUiRafMs, { allowEmpty: true })
    && hasStats(budget.frameTotalMs)
    && hasStats(budget.auxiliaryRafMs, { allowEmpty: true })
    && hasStats(budget.unbucketedUiRafMs, { allowEmpty: true })
    && budget.unbucketedUiRafMs.n === 0
    && Number.isFinite(budget.domNodes) && budget.domNodes >= 0);
}

/**
 * Aggregate per-frame capture rows ({ surface, budget: { uiFrameMs, frameTotalMs, domNodes } })
 * into the per-surface baseline. The UI budget is per surface, so its number is the WORST combined
 * UI sample the run saw, not the average. Owner, authored-UI-rAF, whole-game, and unknown-rAF
 * diagnostics travel alongside it under their own names; only the first two feed the UI number.
 */
export function aggregateBudgetRows(rows) {
  const surfaces = new Map();
  for (const row of rows || []) {
    if (!isUiBudgetSample(row)) continue;
    const budget = row.budget;
    // A zero-sample read (throttled page, hidden tab) is not a zero cost — skip it rather than
    // commit a healthy-looking lie.
    if (!budget.uiFrameMs.n || !budget.frameTotalMs.n) continue;
    const prior = surfaces.get(row.surface) || {
      domNodes: 0,
      frameMeanMs: 0,
      frameP95Ms: 0,
      frameMaxMs: 0,
      uiOwnerMeanMs: 0,
      uiOwnerP95Ms: 0,
      uiOwnerMaxMs: 0,
      knownUiRafMeanMs: 0,
      knownUiRafP95Ms: 0,
      knownUiRafMaxMs: 0,
      unbucketedUiRafMeanMs: 0,
      unbucketedUiRafP95Ms: 0,
      unbucketedUiRafMaxMs: 0,
      frameTotalMeanMs: 0,
      frameTotalP95Ms: 0,
      frameTotalMaxMs: 0,
      auxiliaryRafMeanMs: 0,
      auxiliaryRafP95Ms: 0,
      auxiliaryRafMaxMs: 0,
      samples: 0,
      uiOwnerSamples: 0,
      knownUiRafSamples: 0,
      unbucketedUiRafSamples: 0,
      frameTotalSamples: 0,
      auxiliaryRafSamples: 0,
    };
    prior.domNodes = Math.max(prior.domNodes, budget.domNodes);
    prior.frameMeanMs = Math.max(prior.frameMeanMs, budget.uiFrameMs.mean);
    prior.frameP95Ms = Math.max(prior.frameP95Ms, budget.uiFrameMs.p95);
    prior.frameMaxMs = Math.max(prior.frameMaxMs, budget.uiFrameMs.max);
    prior.uiOwnerMeanMs = Math.max(prior.uiOwnerMeanMs, budget.uiOwnerMs.mean);
    prior.uiOwnerP95Ms = Math.max(prior.uiOwnerP95Ms, budget.uiOwnerMs.p95);
    prior.uiOwnerMaxMs = Math.max(prior.uiOwnerMaxMs, budget.uiOwnerMs.max);
    prior.knownUiRafMeanMs = Math.max(prior.knownUiRafMeanMs, budget.knownUiRafMs.mean);
    prior.knownUiRafP95Ms = Math.max(prior.knownUiRafP95Ms, budget.knownUiRafMs.p95);
    prior.knownUiRafMaxMs = Math.max(prior.knownUiRafMaxMs, budget.knownUiRafMs.max);
    prior.unbucketedUiRafMeanMs = Math.max(prior.unbucketedUiRafMeanMs, budget.unbucketedUiRafMs.mean);
    prior.unbucketedUiRafP95Ms = Math.max(prior.unbucketedUiRafP95Ms, budget.unbucketedUiRafMs.p95);
    prior.unbucketedUiRafMaxMs = Math.max(prior.unbucketedUiRafMaxMs, budget.unbucketedUiRafMs.max);
    prior.frameTotalMeanMs = Math.max(prior.frameTotalMeanMs, budget.frameTotalMs.mean);
    prior.frameTotalP95Ms = Math.max(prior.frameTotalP95Ms, budget.frameTotalMs.p95);
    prior.frameTotalMaxMs = Math.max(prior.frameTotalMaxMs, budget.frameTotalMs.max);
    prior.auxiliaryRafMeanMs = Math.max(prior.auxiliaryRafMeanMs, budget.auxiliaryRafMs.mean);
    prior.auxiliaryRafP95Ms = Math.max(prior.auxiliaryRafP95Ms, budget.auxiliaryRafMs.p95);
    prior.auxiliaryRafMaxMs = Math.max(prior.auxiliaryRafMaxMs, budget.auxiliaryRafMs.max);
    prior.samples = Math.max(prior.samples, budget.uiFrameMs.n);
    prior.uiOwnerSamples = Math.max(prior.uiOwnerSamples || 0, budget.uiOwnerMs.n);
    prior.knownUiRafSamples = Math.max(prior.knownUiRafSamples || 0, budget.knownUiRafMs.n);
    prior.unbucketedUiRafSamples = Math.max(prior.unbucketedUiRafSamples || 0, budget.unbucketedUiRafMs.n);
    prior.frameTotalSamples = Math.max(prior.frameTotalSamples, budget.frameTotalMs.n);
    prior.auxiliaryRafSamples = Math.max(prior.auxiliaryRafSamples, budget.auxiliaryRafMs.n);
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
  if (baseline.measurementScope !== UI_BUDGET_MEASUREMENT_SCOPE) {
    failures.push(`baseline:measurementScope must be ${UI_BUDGET_MEASUREMENT_SCOPE}`);
  }
  if (baseline.frameTotalScope !== UI_FRAME_TOTAL_SCOPE) {
    failures.push(`baseline:frameTotalScope must be ${UI_FRAME_TOTAL_SCOPE}`);
  }
  if (baseline.knownUiRafScope !== UI_KNOWN_RAF_SCOPE) {
    failures.push(`baseline:knownUiRafScope must be ${UI_KNOWN_RAF_SCOPE}`);
  }
  if (baseline.auxiliaryRafScope !== UI_AUXILIARY_RAF_SCOPE) {
    failures.push(`baseline:auxiliaryRafScope must be ${UI_AUXILIARY_RAF_SCOPE}`);
  }
  if (baseline.domLayoutScope !== UI_DOM_LAYOUT_SCOPE) {
    failures.push(`baseline:domLayoutScope must be ${UI_DOM_LAYOUT_SCOPE}`);
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
  const requiredSurfaceNumbers = [
    'domNodes',
    'frameMeanMs', 'frameP95Ms', 'frameMaxMs',
    'uiOwnerMeanMs', 'uiOwnerP95Ms', 'uiOwnerMaxMs',
    'knownUiRafMeanMs', 'knownUiRafP95Ms', 'knownUiRafMaxMs',
    'unbucketedUiRafMeanMs', 'unbucketedUiRafP95Ms', 'unbucketedUiRafMaxMs',
    'uiOwnerSamples', 'knownUiRafSamples', 'unbucketedUiRafSamples',
    'frameTotalMeanMs', 'frameTotalP95Ms', 'frameTotalMaxMs',
    'auxiliaryRafMeanMs', 'auxiliaryRafP95Ms', 'auxiliaryRafMaxMs',
    'samples', 'frameTotalSamples', 'auxiliaryRafSamples',
  ];
  for (const [id, row] of Object.entries(surfaces)) {
    for (const key of requiredSurfaceNumbers) {
      const value = row && row[key];
      if (!Number.isFinite(value) || value < 0) {
        failures.push(`baseline:${id} missing finite non-negative ${key}`);
      }
    }
    // Persisted rows are only evidence when the canonical present-frame sample and both owners
    // were actually observed. A zero count otherwise looks like a healthy zero-cost surface. Any
    // authored UI callback that could not be joined to a game presentation frame is a named gap,
    // never a row that can pass by carrying a few otherwise-valid summary numbers.
    for (const key of ['samples', 'uiOwnerSamples', 'frameTotalSamples']) {
      const value = row && row[key];
      if (!Number.isInteger(value) || value <= 0) {
        failures.push(`baseline:${id} requires positive ${key}`);
      }
    }
    if (Number.isFinite(row && row.unbucketedUiRafSamples) && row.unbucketedUiRafSamples > 0) {
      failures.push(`baseline:${id} has ${row.unbucketedUiRafSamples} unbucketed UI rAF sample(s)`);
    }
  }
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
