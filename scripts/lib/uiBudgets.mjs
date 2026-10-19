// scripts/lib/uiBudgets.mjs — PQ-184.00 "the budgets, measured": the per-surface UI frame-cost
// and DOM-node baseline, its aggregation from capture rows, and the fail-red judge.
//
// Law: the numbers live in scripts/ui-grammar-thresholds.mjs and nowhere else (INSTRUMENT_GRAMMAR
// §12.1) — this module cites them, never restates them. The baseline is renderer-scoped (headed
// Chromium on the host GPU; headless SwiftShader is explicitly not performance evidence) and
// carries a UI source digest so a stale baseline is itself a red, not a quiet pass.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';

import { MAX_UI_FRAME_MS, MAX_SURFACE_DOM_NODES } from '../ui-grammar-thresholds.mjs';
import { AUTOMATABLE_SURFACES } from '../ui-grammar-surfaces.mjs';

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

/** The UI layer the budget's staleness digest watches. The baseline measures synchronous UI-owner
 * CPU (`registry.get("ui").frame` + authored src/ui rAF) and each rendered surface's DOM node
 * count, so the only source that can move a measured number is the UI layer the matrix renders:
 * the surface owner modules, the UI owner, and what they import inside `src/ui/`. Everything the
 * old four-root walk hashed beyond that — `styles/`, all of `src/core/` and `src/render/`, data
 * and system catalogs, and every `src/ui` file no rendered surface can reach — could not move a
 * number yet re-drifted the digest on every unrelated commit (D222: 333 files, CI red on every
 * UI-source landing). Narrowing to the rendered layer is the ledger's own fix. */
export const UI_DIGEST_ROOT = 'src/ui/';

/** The seeds every digest shares: the document shell the surfaces mount into, and the measured
 * UI owner itself. Surface owner modules join through `uiDigestSeeds()`. `index.html` is hashed
 * for its own bytes only — it is scanned for import edges like any seed, but it has none: its
 * `<script>`/modulepreload tags are markup, not module specifiers, and following them would pull
 * the boot path (and through it the whole game graph) back into the digest. */
export const UI_DIGEST_SEEDS = Object.freeze(['index.html', 'src/ui/uiRoot.js']);

/** The rendered-file seed list: the shell, the measured owner, and the owner file of every
 * surface the matrix can actually open and measure (AUTOMATABLE_SURFACES — the same list the
 * check expects baseline rows for). A surface the harness cannot open renders nothing, so its
 * file is not a budget input. */
export function uiDigestSeeds(surfaces = AUTOMATABLE_SURFACES) {
  const seeds = new Set(UI_DIGEST_SEEDS);
  for (const surface of surfaces) {
    if (surface.ownerFile) seeds.add(surface.ownerFile);
  }
  return [...seeds].sort();
}

// Static module edges, matched on raw source: `import/export … from '…'`, bare `import '…'`,
// dynamic `import('…')` (screens register through literal dynamic imports — see uiRoot's loader
// table), and `new URL('…', import.meta.url)` (worker/asset modules). Over-matching (a specifier
// inside a comment or a string) is harmless: a resolved file is still real rendered input.
// Under-matching is the real risk, so the patterns stay permissive.
const UI_MODULE_SPECIFIER = new RegExp(
  "(?:import|export)\\b[^'\"`;]*?\\bfrom\\s*(['\"`])([^'\"`]+)\\1"
  + "|import\\s*(['\"`])([^'\"`]+)\\3"
  + "|import\\s*\\(\\s*(['\"`])([^'\"`]+)\\5\\)"
  + "|new\\s+URL\\s*\\(\\s*(['\"`])([^'\"`]+)\\7\\s*,\\s*import\\.meta\\.url\\s*\\)",
  'g',
);

function* moduleSpecifiers(sourceText) {
  for (const match of sourceText.matchAll(UI_MODULE_SPECIFIER)) {
    const spec = match[2] || match[4] || match[6] || match[8];
    if (spec) yield spec;
  }
}

/** Resolve a repo-local module specifier to a repo-relative path, or null. Bare specifiers
 * (node_modules, import-map names) are outside the repo contract; non-existent targets are not
 * files the matrix can render. `io.exists` answers "is a readable file" for the tree in play. */
function resolveModuleFile(fromFile, specifier, exists) {
  let base = null;
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    base = posix.normalize(posix.join(posix.dirname(fromFile), specifier));
  } else if (specifier.startsWith('/')) {
    base = posix.normalize(specifier.slice(1));
  } else {
    return null;
  }
  if (base.startsWith('../')) return null;
  for (const candidate of [base, `${base}.js`, `${base}.mjs`, `${base}.json`,
    `${base}/index.js`, `${base}/index.mjs`]) {
    if (exists(candidate)) return candidate;
  }
  return null;
}

/** Sort by path components, not whole-path strings: DFS visits `a/child` before `a.js`, and ICU
 * collation differs across host builds (the old localeCompare made one file set hash differently
 * on Windows and Linux). */
function comparePathComponents(a, b) {
  const left = a.split('/'), right = b.split('/');
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return left.length - right.length;
}

/** The rendered-file set: the seeds plus every repo-local module reachable from them. Edges are
 * followed through any directory (a UI helper imported only via a shared data module still
 * renders), but only files under the UI layer — and the two non-layer seeds — join the digest
 * set. `io` abstracts the tree: `{ exists(rel), readBytes(rel) }` over the working tree, a
 * frozen overlay, or a git commit. */
export function uiDigestFileSet({ io, seeds = uiDigestSeeds() }) {
  const rendered = new Set();
  const declaredSeeds = new Set(seeds);
  const visited = new Set();
  const queue = [...seeds];
  while (queue.length) {
    const file = queue.shift();
    if (visited.has(file) || !io.exists(file)) continue;
    visited.add(file);
    // A declared seed is rendered by definition; anything else must live on the UI layer.
    if (declaredSeeds.has(file) || file.startsWith(UI_DIGEST_ROOT)) rendered.add(file);
    // Only JavaScript modules can carry import edges to follow.
    if (!/\.(?:js|mjs|cjs)$/i.test(file)) continue;
    const text = io.readBytes(file).toString('utf8');
    for (const specifier of moduleSpecifiers(text)) {
      const target = resolveModuleFile(file, specifier, io.exists);
      if (target && !visited.has(target)) queue.push(target);
    }
  }
  return rendered;
}

/** Filesystem `io` over a repo root — the working tree. Exported so tests and tools can wrap
 * it (byte substitutions, commit readers) rather than rebuild the contract by hand. */
export function uiFilesystemIo(repoRoot) {
  return {
    exists: (rel) => {
      try { return statSync(join(repoRoot, rel)).isFile(); } catch (_) { return false; }
    },
    readBytes: (rel) => readFileSync(join(repoRoot, rel)),
  };
}

/** The sorted rendered-file list the digest hashes — the check's stale diagnostic names it. */
export function uiRenderedSourceFiles(repoRoot, { io = uiFilesystemIo(repoRoot), seeds } = {}) {
  return [...uiDigestFileSet({ io, seeds })].sort(comparePathComponents);
}

function canonicalBytes(bytes) {
  return bytes.includes('\r\n') ? Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n')) : bytes;
}

function hashUiFile(hash, file, bytes) {
  hash.update(file);
  hash.update('\0');
  hash.update(canonicalBytes(bytes));
  hash.update('\0');
}

/** Per-file sha256 of the canonical bytes, in digest order — the diagnostic manifest and the
 * baseline's own `uiSourceFiles` map, so a stale verdict can name exactly which input moved. */
export function uiSourceFileDigests(repoRoot, { io = uiFilesystemIo(repoRoot), seeds } = {}) {
  const out = {};
  for (const file of [...uiDigestFileSet({ io, seeds })].sort(comparePathComponents)) {
    out[file] = createHash('sha256').update(canonicalBytes(io.readBytes(file))).digest('hex');
  }
  return out;
}

/** Content digest of the UI source the budget covers — the baseline's staleness contract.
 * Line endings are canonicalised to LF before hashing: checkout eol policy (autocrlf, .gitattributes)
 * legitimately smudges text blobs to CRLF on Windows while `git status` stays clean, so hashing raw
 * working-tree bytes would make a baseline shot on one OS unmatchable on another. */
export function uiSourceDigest(repoRoot, { io = uiFilesystemIo(repoRoot), seeds } = {}) {
  const hash = createHash('sha256');
  for (const file of [...uiDigestFileSet({ io, seeds })].sort(comparePathComponents)) {
    hashUiFile(hash, file, io.readBytes(file));
  }
  return hash.digest('hex');
}

/** `io` over a validated frozen source overlay, after checking its completeness against the
 * pinned commit. --all-runtime alone omits non-JS UI files, so require every UI-root file too:
 * the served game needs them even though the digest now hashes only the rendered layer. */
function overlayIo(repoRoot, overlay) {
  const commit = overlay?.identity?.sourceCommit;
  if (!/^[a-f0-9]{40}$/i.test(commit || '') || !(overlay?.entries instanceof Map)) {
    throw new Error('UI budget source overlay requires a validated frozen manifest');
  }
  const listing = execFileSync('git', ['ls-tree', '-r', '-z', '--name-only', commit, '--',
    'index.html', 'src', 'scripts/lib', 'styles'], {
    cwd: repoRoot, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024,
  }).split('\0').filter(Boolean);
  const isUi = (file) => file.startsWith(UI_DIGEST_ROOT) || file.startsWith('styles/')
    || file.startsWith('src/core/') || file.startsWith('src/render/');
  const uiFiles = listing.filter(isUi);
  const required = listing.filter((file) => isUi(file) || file === 'index.html'
    || (file.startsWith('src/') && file.endsWith('.js'))
    || (file.startsWith('scripts/lib/') && /\.(?:js|mjs|cjs)$/i.test(file)));
  const missing = required.filter((file) => !overlay.entries.has(file));
  if (missing.length) throw new Error(`UI budget source overlay is incomplete at ${commit}: ${missing.slice(0, 8).join(', ')}`);
  const expectedUi = new Set(uiFiles);
  const extra = [...overlay.entries.keys()].filter((file) => isUi(file) && !expectedUi.has(file));
  if (extra.length) throw new Error(`UI budget source overlay includes UI files absent at ${commit}: ${extra.slice(0, 8).join(', ')}`);
  if (!uiFiles.length) throw new Error('UI budget source overlay has no frozen UI files');
  return {
    exists: (rel) => overlay.entries.has(rel),
    readBytes: (rel) => overlay.entries.get(rel).body,
  };
}

/** Hash the validated bytes an immutable overlay serves — the rendered-layer digest computed at
 * the frozen commit, so a baseline shot against a source overlay and the working-tree check read
 * the same contract. The frozen import graph comes from the overlay bytes themselves: a commit
 * whose rendered module graph differs is a different digest, not a quiet pass. */
export function uiSourceDigestFromOverlay(repoRoot, overlay, { seeds } = {}) {
  return uiSourceDigest(repoRoot, { io: overlayIo(repoRoot, overlay), seeds });
}

/** Per-file digests of the rendered layer inside a frozen overlay — the `uiSourceFiles` map for
 * a baseline shot with `--baseline-source`. */
export function uiSourceFileDigestsFromOverlay(repoRoot, overlay, { seeds } = {}) {
  return uiSourceFileDigests(repoRoot, { io: overlayIo(repoRoot, overlay), seeds });
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
 * Why a capture row did NOT become a budget row — the first rule it fails, in the words of the rule,
 * or null when it is accepted. `isUiBudgetSample` and the empty-window skip in
 * `aggregateBudgetRows` both answer only yes/no; a gap named "no usable samples" gave D201 nothing
 * to repair, so the capture's gap row quotes this instead.
 */
export function explainBudgetRejection(row) {
  const budget = row && row.budget;
  if (!budget) return 'the surface was opened but the probe returned no snapshot at all';
  if (!isUiBudgetSample(row)) {
    if (budget.measurementScope !== UI_BUDGET_MEASUREMENT_SCOPE
      || budget.frameTotalScope !== UI_FRAME_TOTAL_SCOPE
      || budget.knownUiRafScope !== UI_KNOWN_RAF_SCOPE
      || budget.auxiliaryRafScope !== UI_AUXILIARY_RAF_SCOPE
      || budget.domLayoutScope !== UI_DOM_LAYOUT_SCOPE) return 'the snapshot carries a stale or foreign measurement scope';
    if (budget.unbucketedUiRafMs && budget.unbucketedUiRafMs.n > 0) {
      return `${budget.unbucketedUiRafMs.n} authored src/ui animation callback(s) ran in frames the game did not present, so they cannot be charged to a present-frame budget`;
    }
    if (!Number.isFinite(budget.domNodes)) return 'the surface root could not be resolved to count its DOM nodes';
    return 'the snapshot is missing a statistics block';
  }
  if (!budget.uiFrameMs.n || !budget.frameTotalMs.n) {
    return `no presented game frame landed in the sampling window (ui samples ${budget.uiFrameMs.n}, game-frame samples ${budget.frameTotalMs.n})`;
  }
  return null;
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
    failures.push('baseline:stale — the rendered UI source changed since the baseline was shot; '
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
