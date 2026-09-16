// check-ui-layout.mjs — geometric forensics over the live UI.
//
// Runs the same boot/open/close machinery as the UI grammar matrix, but instead of measuring
// type and budget it measures what the player's eye sees: text drawn under painted boxes,
// controls a click cannot reach, hover tooltips rendered UNDER the card that raised them,
// text clipped by its own container, and elements drawn off the viewport.
//
// Every finding names the surface, the victim element, and the element covering it, so a row
// is a work order, not a mood.
//
// Usage:
//   node scripts/check-ui-layout.mjs                  all automatable surfaces, 1920x1080
//   node scripts/check-ui-layout.mjs --only=title,flight
//   node scripts/check-ui-layout.mjs --json=.devshots/ui-layout/report.json
//   node scripts/check-ui-layout.mjs --pixels         also measure text against the drawn ground
//   node scripts/check-ui-layout.mjs --headed
//
// Exit: 1 when any reachable surface produced findings — the same expected-red queue contract
// as the grammar matrix. NOT in the `check` chain; run it by name.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTOMATABLE_SURFACES, auditManifest, orderForOneBoot, SURFACES } from './ui-grammar-surfaces.mjs';
import {
  dedupeFindings,
  hoverBegin,
  hoverDiff,
  hoverTriggers,
  layoutProbe,
  summarizeFindings,
} from './lib/ui-layout-measure.mjs';
import { LEGIBILITY_PROBE, legibilityFindings } from './lib/ui-legibility.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

const args = parseArgs(process.argv.slice(2));

const HOVER_SETTLE_MS = 320;
const SETTLE_MS = 500;
const PIXEL_DIR = path.resolve(ROOT, '.devshots/ui-layout');

try {
  const problems = auditManifest(SURFACES);
  if (problems.length) {
    console.error('FAIL check:ui:layout — the surface manifest itself is malformed:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
  } else {
    const selected = args.only
      ? AUTOMATABLE_SURFACES.filter((s) => args.only.includes(s.id))
      : AUTOMATABLE_SURFACES;
    if (args.only && selected.length !== args.only.length) {
      const missing = args.only.filter((id) => !selected.some((s) => s.id === id));
      throw new Error(`--only names unknown surface(s): ${missing.join(', ')}`);
    }
    const report = await auditAllSurfaces(selected);
    printReport(report);
    if (args.json) writeJson(args.json, report);
    process.exitCode = report.surfacesWithFindings > 0 ? 1 : 0;
  }
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
}

// ------------------------------------------------------------------ args

function parseArgs(argv) {
  const parsed = { headed: argv.includes('--headed'), json: null, only: null, pixels: argv.includes('--pixels') };
  for (const arg of argv) {
    if (arg.startsWith('--json=')) parsed.json = arg.slice('--json='.length);
    if (arg.startsWith('--only=')) parsed.only = arg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean);
  }
  return parsed;
}

// ------------------------------------------------------------------ runtime audit

async function auditAllSurfaces(surfaces) {
  const {
    closeSurface,
    ensureFlightIdle,
    openBootWithRetry,
    openSurface,
    startFreshServer,
  } = await import('./capture-ui-matrix.mjs');
  const { loadPlaywright } = await import('./lib/load-playwright.mjs');
  const { chromium } = await loadPlaywright();

  const viewport = { width: 1920, height: 1080 };
  const ordered = orderForOneBoot(surfaces);
  const preLaunchIds = new Set(ordered.filter((s) => s.entry.kind === 'boot' || s.entry.kind === 'boot-nested').map((s) => s.id));
  const destructive = ordered.filter((s) => s.destructive || s.isolatedBoot);
  const mainRun = ordered.filter((s) => !preLaunchIds.has(s.id) && !s.destructive && !s.isolatedBoot);

  const results = {};
  const record = (surface, result) => {
    result.findings = dedupeFindings(result.findings || []);
    results[surface.id] = result;
    const n = result.findings.length;
    const mark = !result.found ? 'no ' : n ? `${String(n).padStart(2)} ` : 'ok ';
    console.log(`  ${mark} ${surface.id.padEnd(24)}${result.found ? (n ? `findings` : '') : `— ${result.error || 'not opened'}`}`);
    for (const finding of result.findings.slice(0, 6)) {
      console.log(`       ${finding.rule.padEnd(17)} ${finding.victim}${finding.occluder ? `  under ${finding.occluder}` : ''}${finding.detail ? `  (${finding.detail})` : ''}`);
    }
    if (n > 6) console.log(`       … ${n - 6} more`);
  };

  const auditSurface = async (page, surface, context = {}) => {
    const opened = await openSurface(page, surface, context);
    if (!opened.ok) {
      return { surfaceId: surface.id, found: false, error: opened.reason, findings: [] };
    }
    // Async content (save strips, contract rows, populated lists) lands after the open latch —
    // a probe on the first paint measures a surface the player never sees.
    await page.waitForTimeout(SETTLE_MS);
    const probe = await page.evaluate(layoutProbe, {
      surfaceId: surface.id,
      selectors: surface.root || [],
    });
    const findings = probe.findings || [];
    // The rendered-pixel pass (`--pixels`): geometry cannot see text that is under nothing but
    // still unreadable because of what is DRAWN behind it. Only run on surfaces we opened.
    if (args.pixels && probe.found) {
      try {
        const shot = await page.screenshot({ type: 'png' });
        const candidates = await page.evaluate(LEGIBILITY_PROBE, { selectors: surface.root || [] });
        const pixelFindings = legibilityFindings(shot, candidates);
        if (pixelFindings.length) {
          // The gate emits the frame it judged: a finding without the picture is a rumour, and the
          // stills loop (docs/UI_VISUAL_ITERATION.md) is what an agent is supposed to look at.
          mkdirSync(PIXEL_DIR, { recursive: true });
          const file = path.join(PIXEL_DIR, `${surface.id}.pixels.png`);
          writeFileSync(file, shot);
          for (const finding of pixelFindings) finding.evidence = file;
        }
        findings.push(...pixelFindings);
      } catch (error) {
        findings.push({ rule: 'text-against-render', victim: surface.id, detail: `pixel pass failed: ${error && error.message ? error.message : String(error)}` });
      }
    }
    if (probe.found) {
      findings.push(...await hoverPass(page, surface, findings));
    }
    return { surfaceId: surface.id, found: probe.found, error: probe.error || null, findings };
  };

  // Hover pass: for each real pointer hover, whatever the hover reveals must be topmost at its
  // own centre. A tip hit-testing under its own panel is the "mouseover box under the box" bug.
  // A lit hover plate covering text that was clean at rest is caught by re-running the geometry
  // probe while the pointer is down and keeping only the findings the hover induced.
  const hoverPass = async (page, surface, restFindings) => {
    const findings = [];
    const restKeys = new Set((restFindings || []).map((f) => `${f.rule}|${f.victim}|${f.occluder || ''}`));
    const triggers = await page.evaluate(hoverTriggers, surface.root || []);
    for (const trigger of triggers) {
      try {
        await page.evaluate(hoverBegin);
        await page.mouse.move(trigger.x, trigger.y);
        await page.waitForTimeout(HOVER_SETTLE_MS);
        const revealed = await page.evaluate(hoverDiff);
        const underHover = await page.evaluate(layoutProbe, {
          surfaceId: surface.id,
          selectors: surface.root || [],
        });
        for (const finding of (underHover.findings || [])) {
          const key = `${finding.rule}|${finding.victim}|${finding.occluder || ''}`;
          if (restKeys.has(key)) continue;
          restKeys.add(key); // a hover defect reported once, not once per trigger
          findings.push({ ...finding, detail: `while hovering ${trigger.path}${trigger.text ? ` "${trigger.text}"` : ''}${finding.detail ? ` — ${finding.detail}` : ''}` });
        }
        for (const el of revealed) {
          if (el.buriedBy) {
            findings.push({
              rule: 'hover-buried',
              victim: `${el.path}${el.text ? ` "${el.text}"` : ''} (hover of ${trigger.path}${trigger.text ? ` "${trigger.text}"` : ''})`,
              occluder: el.buriedBy,
            });
          }
          if (el.clippedAway) {
            findings.push({
              rule: 'hover-clipped',
              victim: `${el.path}${el.text ? ` "${el.text}"` : ''} (hover of ${trigger.path}${trigger.text ? ` "${trigger.text}"` : ''})`,
              occluder: `clipped by ${el.clippedAway}`,
            });
          }
          if (el.offscreen) {
            findings.push({
              rule: 'hover-offscreen',
              victim: `${el.path}${el.text ? ` "${el.text}"` : ''} (hover of ${trigger.path})`,
              detail: `rect ${el.rect.left},${el.rect.top} ${el.rect.w}x${el.rect.h}`,
            });
          }
        }
        await page.mouse.move(0, 0);
        await page.waitForTimeout(60);
      } catch (error) {
        findings.push({ rule: 'hover-error', victim: `${trigger.path} on ${surface.id}`, detail: error.message });
      }
    }
    return findings;
  };

  let server = await startFreshServer();
  // The spawned static server can die mid-run (a wedged goto costs four 120 s retries of pure
  // waiting). Probe it before every boot and restart on a fresh port instead.
  const serverUrl = async () => {
    try {
      const response = await fetch(server.baseUrl, { signal: AbortSignal.timeout(8000) });
      if (response.ok) return server.baseUrl;
    } catch (_) {}
    console.warn('  !! dev server unresponsive — restarting it');
    server.kill();
    server = await startFreshServer();
    return server.baseUrl;
  };
  let browser = null;
  try {
    browser = await chromium.launch({ headless: !args.headed });
  } catch (error) {
    server.kill();
    throw new Error(`chromium.launch failed (server torn down): ${error.message}`);
  }

  console.log(`check:ui:layout — geometric forensics over ${surfaces.length} automatable surfaces`);
  console.log(`renderer: ${args.headed ? 'headed Chromium' : 'headless Chromium'} — viewport ${viewport.width}x${viewport.height}\n`);

  try {
    const menuPhase = async (page, stageId) => {
      for (const surface of ordered) {
        if (!preLaunchIds.has(surface.id)) continue;
        const isStage = surface.id === stageId;
        const isChildOfStage = surface.entry.kind === 'boot-nested' && surface.entry.parent === stageId;
        if (!isStage && !isChildOfStage) continue;
        try {
          if (isStage) await page.waitForTimeout(SETTLE_MS);
          const result = isStage
            ? {
              surfaceId: surface.id,
              found: true,
              findings: (await page.evaluate(layoutProbe, {
                surfaceId: surface.id, selectors: surface.root || [],
              })).findings || [],
            }
            : await auditSurface(page, surface, { stage: stageId });
          if (isStage) {
            result.findings.push(...await hoverPass(page, surface));
          }
          record(surface, result);
          if (!isStage) await closeSurface(page, surface).catch(() => {});
        } catch (error) {
          record(surface, { surfaceId: surface.id, found: false, error: `menu phase: ${error.message}`, findings: [] });
        }
      }
    };

    let boot = null;
    try {
      boot = await openBootWithRetry({
        browser, baseUrl: await serverUrl(), viewport, menuPhase,
      });
    } catch (error) {
      // A diagnostic audit reports what it saw — a failed boot is a row, not the end of the run.
      console.warn(`  !! main boot failed: ${error.message} — in-flight surfaces unaudited`);
      for (const surface of mainRun) {
        if (!results[surface.id]) {
          record(surface, { surfaceId: surface.id, found: false, error: `boot failed: ${error.message}`, findings: [] });
        }
      }
    }
    try {
      if (boot) for (const surface of mainRun) {
        try {
          record(surface, await auditSurface(boot.page, surface));
        } catch (error) {
          record(surface, { surfaceId: surface.id, found: false, error: error.message, findings: [] });
        }
        const closed = await closeSurface(boot.page, surface).catch((error) => ({ ok: false, reason: error.message }));
        if (!closed.ok) console.warn(`  !! ${closed.reason} — later surfaces may be measured through it`);
        try {
          await ensureFlightIdle(boot.page);
        } catch (error) {
          console.warn(`  !! could not return to idle flight after ${surface.id}: ${error.message}`);
        }
      }
    } finally {
      if (boot) await boot.close().catch(() => {});
    }

    for (const surface of destructive) {
      let isolated = null;
      try {
        isolated = await openBootWithRetry({ browser, baseUrl: await serverUrl(), viewport });
      } catch (error) {
        record(surface, { surfaceId: surface.id, found: false, error: `boot failed: ${error.message}`, findings: [] });
      }
      if (!isolated) continue;
      try {
        record(surface, await auditSurface(isolated.page, surface));
      } catch (error) {
        record(surface, { surfaceId: surface.id, found: false, error: error.message, findings: [] });
      } finally {
        await isolated.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
    server.kill();
  }

  let surfacesWithFindings = 0;
  let surfacesOpened = 0;
  let totalFindings = 0;
  const ruleCounts = {};
  for (const result of Object.values(results)) {
    if (result.found) surfacesOpened += 1;
    if (result.findings.length) surfacesWithFindings += 1;
    totalFindings += result.findings.length;
    for (const rule of Object.keys(summarizeFindings(result.findings))) {
      ruleCounts[rule] = (ruleCounts[rule] || 0) + summarizeFindings(result.findings)[rule];
    }
  }
  return { results, surfacesOpened, surfacesWithFindings, totalFindings, ruleCounts, viewport };
}

// ------------------------------------------------------------------ output

function printReport(report) {
  console.log('\nlayout forensics — summary');
  console.log(`  surfaces opened:    ${report.surfacesOpened}`);
  console.log(`  surfaces flagged:   ${report.surfacesWithFindings}`);
  console.log(`  findings (deduped): ${report.totalFindings}`);
  if (report.totalFindings) {
    console.log('  by rule:');
    for (const [rule, count] of Object.entries(report.ruleCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${rule.padEnd(18)} ${count}`);
    }
    console.log('\n  Each finding above names the victim and the element covering it.');
    console.log('  A surface that did not open is a reachability failure, not a clean row.');
  }
}

function writeJson(file, report) {
  const target = path.isAbsolute(file) ? file : path.join(ROOT, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(report, null, 2));
  console.log(`\njson: ${path.relative(ROOT, target)}`);
}
