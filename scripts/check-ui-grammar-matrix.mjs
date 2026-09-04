#!/usr/bin/env node
// check-ui-grammar-matrix.mjs — PQ-180: the frontend definition of done, applied to every surface.
//
// Prints ONE table: every surface in scripts/ui-grammar-surfaces.mjs × every rule of the grammar,
// measured from the RUNNING GAME. A surface below any floor in scripts/ui-grammar-thresholds.mjs is
// red and the process exits non-zero.
//
// EXIT POLICY (no loophole). The check fails whenever any cell is not a pass, whenever fewer than
// the floor number of real surfaces were measured, and whenever the manifest itself is malformed.
// `test/ui-grammar-baseline.json` is an OBSERVATION RECORD: it says which reds are new. It can never
// make a failing run exit zero. This check is expected to be red until PQ-162/168/181/182/130/183/184
// clear their cells — the matrix IS the frontend queue.
//
//   node scripts/check-ui-grammar-matrix.mjs                     boot and measure (headless SwiftShader)
//   node scripts/check-ui-grammar-matrix.mjs --headed            boot and measure on the real GPU
//   node scripts/check-ui-grammar-matrix.mjs --static            manifest + reference-frame audit only
//   node scripts/check-ui-grammar-matrix.mjs --update-baseline   record what was observed
//   node scripts/check-ui-grammar-matrix.mjs --json=<path>       full matrix + ownership rows as JSON
//   node scripts/check-ui-grammar-matrix.mjs --only=ship,chart
//
// Headless Chromium renders through SwiftShader (software). Anything timing- or GPU-related measured
// in that mode is NOT acceptance evidence; the run records which renderer produced it.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ADMITTED_OWNER_PACKETS,
  REACHABLE_CANDIDATES,
  SHIPPING_SURFACES,
  SURFACES,
  auditManifest,
  orderForOneBoot,
} from './ui-grammar-surfaces.mjs';
import { THRESHOLDS } from './ui-grammar-thresholds.mjs';
import {
  MEASUREMENT_PASSES,
  RULES,
  RULE_IDS,
  cellGlyph,
  evaluateMatrix,
  ownershipRows,
  surfaceProbe,
} from './lib/ui-grammar-measure.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const BASELINE_PATH = path.join(ROOT, 'test', 'ui-grammar-baseline.json');

const args = parseArgs(process.argv.slice(2));

try {
  const problems = auditManifest(SURFACES);
  if (problems.length) {
    console.error('FAIL check:ui:grammar-matrix — the manifest itself is malformed:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
  } else {
    const selected = args.only
      ? SHIPPING_SURFACES.filter((s) => args.only.includes(s.id))
      : SHIPPING_SURFACES;
    if (args.only && selected.length !== args.only.length) {
      const missing = args.only.filter((id) => !selected.some((s) => s.id === id));
      throw new Error(`--only names unknown surface(s): ${missing.join(', ')}`);
    }

    const frames = await readFrameCoverage();
    const run = args.static
      ? { measurements: {}, renderer: 'none (static run)', budgetViolations: [] }
      : await measureAllSurfaces(selected);

    const matrix = evaluateMatrix({
      surfaces: selected,
      measurements: run.measurements,
      thresholds: THRESHOLDS,
      frames,
    });
    const ownership = ownershipRows(matrix);

    printMatrix(matrix, { static: args.static, renderer: run.renderer });
    printBudgetReport(run.budgetViolations);
    const baseline = readBaseline();
    printDrift(compareToBaseline(matrix, baseline), baseline);
    printOwnerQueue(ownership);

    if (args.json) writeJson(args.json, matrix, ownership, run);
    if (args.updateBaseline) writeBaseline(matrix, ownership, run, { measured: !args.static });

    process.exitCode = decideExit(matrix, run);
  }
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
}

// ------------------------------------------------------------------ args

function parseArgs(argv) {
  const parsed = {
    static: argv.includes('--static'),
    headed: argv.includes('--headed'),
    updateBaseline: argv.includes('--update-baseline'),
    json: null,
    only: null,
    passes: null,
  };
  for (const arg of argv) {
    if (arg.startsWith('--json=')) parsed.json = arg.slice('--json='.length);
    if (arg.startsWith('--passes=')) parsed.passes = arg.slice('--passes='.length).split(',').filter(Boolean);
    if (arg.startsWith('--only=')) parsed.only = arg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean);
  }
  return parsed;
}

// ------------------------------------------------------------------ reference frame coverage

async function readFrameCoverage() {
  // Imported lazily so --static needs no Playwright module resolution at all.
  const { buildFramePlan, frameFileName, UI_FRAME_REFERENCE_DIR } = await import('./capture-ui-matrix.mjs');
  const coverage = {};
  for (const entry of buildFramePlan()) {
    const bucket = coverage[entry.surface] || (coverage[entry.surface] = { expected: 0, present: 0, missing: [] });
    bucket.expected += 1;
    const file = path.join(UI_FRAME_REFERENCE_DIR, frameFileName(entry));
    if (existsSync(file)) bucket.present += 1;
    else if (bucket.missing.length < 4) bucket.missing.push(frameFileName(entry));
  }
  return coverage;
}

// ------------------------------------------------------------------ runtime measurement

async function measureAllSurfaces(surfaces) {
  const {
    closeOpenScreens,
    closeSurface,
    ensureFlightIdle,
    openBootWithRetry,
    openSurface,
    startFreshServer,
  } = await import('./capture-ui-matrix.mjs');
  const { loadPlaywright } = await import('./lib/load-playwright.mjs');
  const { chromium } = await loadPlaywright();

  const measurements = {};
  const budgetViolations = [];
  const ordered = orderForOneBoot(surfaces);
  const preLaunchIds = new Set(ordered.filter((s) => s.entry.kind === 'boot' || s.entry.kind === 'boot-nested').map((s) => s.id));
  const destructive = ordered.filter((s) => s.destructive);
  const mainRun = ordered.filter((s) => !s.destructive && !preLaunchIds.has(s.id));

  const record = (surface, passId, probe, elapsedMs) => {
    probe.elapsedMs = elapsedMs;
    if (!measurements[surface.id]) measurements[surface.id] = {};
    measurements[surface.id][passId] = probe;
    if (elapsedMs > THRESHOLDS.maxSurfaceMeasureMs) {
      budgetViolations.push({ surface: surface.id, pass: passId, elapsedMs });
    }
    const mark = probe.found ? 'ok ' : 'no ';
    console.log(`  ${mark} ${passId.padEnd(15)} ${surface.id.padEnd(22)} ${elapsedMs}ms${probe.found ? '' : ` — ${probe.error || 'not opened'}`}`);
  };

  const probeSurface = async (page, surface, passId) => {
    const started = Date.now();
    let probe = null;
    try {
      const opened = await openSurface(page, surface);
      probe = opened.ok
        ? await page.evaluate(surfaceProbe, {
          surfaceId: surface.id,
          screenId: surface.screenId || null,
          selectors: surface.root || [],
        })
        : { surfaceId: surface.id, found: false, error: opened.reason };
    } catch (error) {
      probe = {
        surfaceId: surface.id,
        found: false,
        error: `probe threw: ${error && error.message ? error.message : String(error)}`,
      };
    }
    record(surface, passId, probe, Date.now() - started);
    // Cleanup is NOT best-effort silence, and it is VERIFIED: `closeOpenScreens` cannot see a radial
    // or a drawer, so an overlay left open would still be on screen for the next surface and would
    // eat the Escape that opens pause. `closeSurface` proves the surface is gone.
    const closed = await closeSurface(page, surface).catch((error) => ({ ok: false, reason: error.message }));
    if (!closed.ok) {
      console.warn(`  !! ${closed.reason} — later rows in this pass may be measured through it`);
    }
    try {
      await ensureFlightIdle(page);
    } catch (error) {
      console.warn(`  !! could not return to idle flight after ${surface.id}: ${error.message}`);
    }
  };

  // Server first, browser second: if the browser fails to launch, the server must still be killed.
  const server = await startFreshServer();
  let browser = null;
  try {
    browser = await chromium.launch({ headless: !args.headed });
  } catch (error) {
    server.kill();
    throw new Error(`chromium.launch failed (server torn down): ${error.message}`);
  }

  const renderer = args.headed
    ? 'headed Chromium (host GPU)'
    : 'headless Chromium (SwiftShader software rendering — not performance acceptance evidence)';
  console.log(`renderer: ${renderer}\n`);

  try {
    const selectedPasses = args.passes ? MEASUREMENT_PASSES.filter((pass) => args.passes.includes(pass.id)) : MEASUREMENT_PASSES;
    if (!selectedPasses.length || (args.passes && selectedPasses.length !== args.passes.length)) throw new Error("unknown or empty --passes selection");
    for (const pass of selectedPasses) {
      const viewport = { width: pass.width, height: pass.height };
      console.log(`pass ${pass.id} — ${pass.width}x${pass.height} ${pass.mode}${pass.locale ? ` locale=${pass.locale}` : ''}`);

      // The title, new-game and Crucible-door surfaces only exist before Launch, so they are probed
      // in the menu phase of this same boot rather than being written off as unreachable.
      const menuPhase = async (page, stageId) => {
        await page.emulateMedia(modeEmulation(pass.mode));
        for (const surface of ordered) {
          if (!preLaunchIds.has(surface.id)) continue;
          // This stage itself, or a surface opened by a button ON this stage (the Crucible door).
          const isStage = surface.id === stageId;
          const isChildOfStage = surface.entry.kind === 'boot-nested' && surface.entry.parent === stageId;
          if (!isStage && !isChildOfStage) continue;
          const started = Date.now();
          let probe;
          try {
            if (isStage) {
              probe = await page.evaluate(surfaceProbe, {
                surfaceId: surface.id, screenId: surface.screenId || null, selectors: surface.root || [],
              });
            } else {
              const opened = await openSurface(page, surface, { stage: stageId });
              probe = opened.ok
                ? await page.evaluate(surfaceProbe, {
                  surfaceId: surface.id, screenId: surface.screenId || null, selectors: surface.root || [],
                })
                : { surfaceId: surface.id, found: false, error: opened.reason };
              if (opened.ok) await closeSurface(page, surface).catch(() => {});
            }
          } catch (error) {
            probe = { surfaceId: surface.id, found: false, error: `menu phase: ${error.message}` };
          }
          record(surface, pass.id, probe, Date.now() - started);
        }
      };

      const boot = await openBootWithRetry({
        browser, baseUrl: server.baseUrl, viewport, locale: pass.locale, menuPhase,
      });
      try {
        await boot.page.emulateMedia(modeEmulation(pass.mode));
        for (const surface of mainRun) await probeSurface(boot.page, surface, pass.id);
      } finally {
        await boot.close().catch(() => {});
      }

      // A destructive surface ends the run, so it gets its OWN boot. Sharing one would make every
      // later row in this pass report a false red.
      for (const surface of destructive) {
        const isolated = await openBootWithRetry({ browser, baseUrl: server.baseUrl, viewport, locale: pass.locale });
        try {
          await isolated.page.emulateMedia(modeEmulation(pass.mode));
          await probeSurface(isolated.page, surface, pass.id);
        } finally {
          await isolated.close().catch(() => {});
        }
      }
    }
  } finally {
    await browser.close().catch(() => {});
    server.kill();
  }
  return { measurements, renderer, budgetViolations };
}

function modeEmulation(mode) {
  if (mode === 'reduced-motion') return { reducedMotion: 'reduce', forcedColors: 'none' };
  if (mode === 'forced-colors') return { reducedMotion: 'no-preference', forcedColors: 'active' };
  return { reducedMotion: 'no-preference', forcedColors: 'none' };
}

// ------------------------------------------------------------------ output

function printMatrix(matrix, opts) {
  console.log('\nUI grammar matrix — PQ-180');
  console.log(`surfaces: ${matrix.total}   green: ${matrix.green}   red: ${matrix.red}`);
  console.log(`measured: ${matrix.measuredSurfaces}   opened on a public route: ${matrix.openedOnPublicRoute}   floor: ${THRESHOLDS.minManifestSurfaces} real surfaces measured`);
  console.log(`renderer: ${opts.renderer}`);
  if (opts.static) {
    console.log('MODE: --static — no game was booted, so every runtime cell reads UNP (unproven).');
    console.log('      A static run can only prove the manifest and the reference-frame coverage.');
  }
  console.log('');
  const head = ['surface'.padEnd(22), ...RULE_IDS.map((id) => shortRule(id))].join(' ');
  console.log(head);
  for (const row of matrix.rows) {
    const cells = RULE_IDS.map((id) => cellGlyph(row.cells[id].status).padEnd(shortRule(id).length));
    console.log([row.id.padEnd(22), ...cells].join(' '));
  }

  console.log('\nlegend: OK measured and at/above the floor · - not applicable · RED measured, below the floor');
  console.log('        UNM no seam exists to measure it · UNP not directly exercised (detail carries the observation)');
  console.log('rules:');
  for (const rule of RULES) console.log(`  ${shortRule(rule.id).padEnd(5)} ${rule.id.padEnd(19)} ${rule.label}  [${rule.source}]`);

  console.log('\nfailing cells (status · rule · owner packet/leaf · what was actually observed)');
  for (const row of matrix.rows) {
    if (row.status === 'green') continue;
    console.log(`\n  ${row.id} — ${row.title}`);
    for (const ruleId of row.failing) {
      const c = row.cells[ruleId];
      const owner = c.owner ? `${c.owner.packet} ${c.owner.leaf}` : 'UNOWNED';
      console.log(`    ${c.status.toUpperCase().padEnd(10)} ${ruleId.padEnd(19)} ${owner.padEnd(22)} ${c.detail}`);
    }
  }
}

function printBudgetReport(violations) {
  if (!violations || !violations.length) return;
  console.log(`\nper-surface measurement budget exceeded (${THRESHOLDS.maxSurfaceMeasureMs}ms):`);
  for (const v of violations) console.log(`  ${v.surface.padEnd(22)} ${v.pass.padEnd(15)} ${v.elapsedMs}ms`);
}

function shortRule(id) {
  const map = {
    reachable: 'rch', 'type-floor': '12p', 'tabular-numerals': 'tnm', 'dom-budget': 'dom',
    'safe-frame': 'sfr', 'pseudo-loc': 'ploc', 'reference-frames': 'ref', 'type-roles': 'rol',
    'colour-on-state': 'col', 'motion-contract': 'mot', 'reduce-motion': 'rdm', 'forced-colors': 'fcl',
    'layout-skeleton': 'lay', 'disclosure-tiers': 'dis', 'load-bearing-names': 'nam',
    'data-states': 'dst', 'screen-memory': 'mem', keyboard: 'kbd', gamepad: 'gpd',
    contrast: 'con', 'entity-links': 'lnk', 'ui-frame-ms': 'ms',
  };
  return map[id] || id.slice(0, 3);
}

function printOwnerQueue(ownership) {
  console.log('\nred cells by owner packet and leaf (PQ-180 .02 — the matrix is the frontend queue)');
  const byKey = new Map();
  for (const row of ownership) {
    const key = `${row.packet || 'UNOWNED'} ${row.leaf || '?'}`;
    byKey.set(key, (byKey.get(key) || 0) + 1);
  }
  for (const [key, count] of [...byKey.entries()].sort()) {
    console.log(`  ${key.padEnd(26)} ${String(count).padStart(4)} cell(s)`);
  }
  const unowned = ownership.filter((r) => !r.packet);
  if (unowned.length) {
    console.error(`\n  ${unowned.length} failing cell(s) with NO owner — that is a PQ-180 .02 violation:`);
    for (const r of unowned.slice(0, 12)) console.error(`    ${r.surface}.${r.rule}`);
  }
  const foreign = ownership.filter((r) => r.packet && !ADMITTED_OWNER_PACKETS.includes(r.packet));
  if (foreign.length) {
    console.error(`  ${foreign.length} cell(s) assigned to a packet that is not admitted.`);
  }
}

// ------------------------------------------------------------------ baseline (observation only)

function readBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch (error) {
    console.warn(`baseline unreadable (${error.message}); treating as absent — this does not change the exit code`);
    return null;
  }
}

function compareToBaseline(matrix, baseline) {
  const drift = { newRed: [], newGreen: [], unknown: [] };
  if (!baseline || !baseline.surfaces) return drift;
  const pass = (s) => s === 'green' || s === 'n/a';
  for (const row of matrix.rows) {
    const prior = baseline.surfaces[row.id];
    if (!prior) { drift.unknown.push(row.id); continue; }
    for (const ruleId of RULE_IDS) {
      const now = row.cells[ruleId].status;
      const was = prior.cells ? prior.cells[ruleId] : undefined;
      if (was === undefined) continue;
      if (pass(was) && !pass(now)) drift.newRed.push(`${row.id}.${ruleId}: ${was} -> ${now}`);
      if (!pass(was) && pass(now)) drift.newGreen.push(`${row.id}.${ruleId}: ${was} -> ${now}`);
    }
  }
  return drift;
}

function printDrift(drift, baseline) {
  if (!baseline) {
    console.log('\nno committed baseline yet — every row is reported as-is (this does not change the exit code)');
    return;
  }
  console.log(`\nbaseline: ${baseline.capturedAt || 'never measured'} (${baseline.provenance || 'unknown provenance'})`);
  if (drift.newRed.length) {
    console.log('  REGRESSIONS (were passing, now failing):');
    for (const line of drift.newRed) console.log(`    ${line}`);
  }
  if (drift.newGreen.length) {
    console.log('  cleared since the baseline:');
    for (const line of drift.newGreen) console.log(`    ${line}`);
  }
  if (drift.unknown.length) console.log(`  new surfaces not in the baseline: ${drift.unknown.join(', ')}`);
  if (!drift.newRed.length && !drift.newGreen.length && !drift.unknown.length) {
    console.log('  no drift against the baseline');
  }
}

function writeBaseline(matrix, ownership, run, { measured }) {
  const surfaces = {};
  for (const row of matrix.rows) {
    surfaces[row.id] = {
      owner: row.owner,
      ownerFile: row.ownerFile,
      status: row.status,
      measured: row.measured,
      openedOnPublicRoute: row.openedOnPublicRoute,
      cells: Object.fromEntries(RULE_IDS.map((id) => [id, row.cells[id].status])),
    };
  }
  const payload = {
    packet: 'PQ-180',
    note: 'OBSERVATION RECORD of the grammar matrix. It never suppresses an exit code and a status '
      + 'here is not an allowance; it exists so the check can say which reds are new.',
    capturedAt: new Date().toISOString(),
    provenance: measured ? `measured from a booted game — ${run.renderer}` : 'static run — runtime cells are unproven, not passing',
    measured,
    renderer: run.renderer,
    thresholds: THRESHOLDS,
    totals: {
      total: matrix.total,
      green: matrix.green,
      red: matrix.red,
      measuredSurfaces: matrix.measuredSurfaces,
      openedOnPublicRoute: matrix.openedOnPublicRoute,
      failingCells: ownership.length,
    },
    surfaces,
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`\nbaseline written: ${path.relative(ROOT, BASELINE_PATH)}`);
}

function writeJson(target, matrix, ownership, run) {
  const dest = path.resolve(target);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, `${JSON.stringify({
    packet: 'PQ-180',
    renderer: run.renderer,
    totals: {
      total: matrix.total, green: matrix.green, red: matrix.red,
      measuredSurfaces: matrix.measuredSurfaces, openedOnPublicRoute: matrix.openedOnPublicRoute,
    },
    ownership,
    rows: matrix.rows,
    budgetViolations: run.budgetViolations,
  }, null, 2)}\n`);
  console.log(`matrix json: ${dest}`);
}

function decideExit(matrix, run) {
  const failures = [];
  if (matrix.red > 0) failures.push(`${matrix.red}/${matrix.total} surfaces below the floor`);
  if (matrix.measuredSurfaces < THRESHOLDS.minManifestSurfaces) {
    failures.push(
      `only ${matrix.measuredSurfaces} surfaces were actually measured; the floor is `
      + `${THRESHOLDS.minManifestSurfaces} (the manifest lists ${REACHABLE_CANDIDATES.length} real candidates)`,
    );
  }
  if (run.budgetViolations && run.budgetViolations.length) {
    failures.push(`${run.budgetViolations.length} surface measurement(s) over the ${THRESHOLDS.maxSurfaceMeasureMs}ms budget`);
  }
  if (failures.length) {
    console.error(`\nFAIL check:ui:grammar-matrix — ${failures.join('; ')}`);
    return 1;
  }
  console.log('\nPASS check:ui:grammar-matrix — every surface meets every rule');
  return 0;
}

