#!/usr/bin/env node
// REPRO — is the Engage control actually reachable on the chart after plotting a route?
//
// NOT A GATE. `check:journey:textile` step 6 reports "no Engage control is reachable on the chart
// for the plotted route", which directly contradicts W1-8 being marked `passing` and
// `check:route-engage` being 14/14 green. Exactly one of those is wrong, and the difference
// decides whether the route follower ever executed through a real player route.
//
// Two candidate explanations, with opposite owners:
//   P  PRODUCT — the control genuinely never becomes visible/enabled after a plot, so no player
//      can engage a route from the chart and W1-8 is not `passing`.
//   H  HARNESS — the control IS there and the journey's locator misses it. The journey looks for
//      the inspector via `.gm-inspector, [data-map-inspector], .gm-detail, .gm-selection`; the
//      chart actually renders `.gm-inspector-content` / `.gm-inspector-details`, which none of
//      those selectors match. A wrong selector and a missing feature look identical from outside.
//
// This probe reads the REAL DOM node (`#gm-engage-route-btn`) and the REAL state
// (`state.nav.route`) side by side, so the two separate outright. It asserts nothing and passes
// nothing — it prints what is there.
//
// ── RESULT (2026-07-19, HEAD 92a21766) — it was NEITHER of the above ──
// The Engage control is fine. Plotting DISMISSES the chart; reopening it shows the control enabled
// at 287x37 reading "2 legs plotted — ready to fly" with `nav.route.legs = 2`.
//
// An intermediate reading of this very probe nearly shipped a false P0. After clicking a primary
// action the button reported `disabled`, rect `0x0`, and "No route plotted" — which looks exactly
// like a control that fails to refresh. It is not: `getBoundingClientRect` returns 0x0 when any
// ANCESTOR is `display:none`, while `getComputedStyle` still reports the element's own
// `display:block`. That pair is the signature of a CLOSED SCREEN, and the stale reason text is just
// the last value written before the chart went away.
//
// The rule this bought, worth more than the finding: **never conclude anything about a control
// without first confirming its containing screen is open.** Hence `chartStillOpen` is captured and
// the verdict returns INCONCLUSIVE rather than guessing whenever it is false.
//
// Usage: node scripts/repro-engage-control-reachability.mjs

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { bootToAuthoredFlight, TRAVEL_PUBLIC_HELPERS } from './lib/professionalTravelPublicRoute.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const OUT = path.join(ROOT, '.devshots', 'repro-engage-control');
const log = (m) => console.log(`[repro-engage] ${m}`);

function findSystemBrowser() {
  const c = process.platform === 'win32'
    ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe']
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge'];
  return c.find((p) => existsSync(p)) || null;
}

/** Everything about the engage control and the inspector, read straight off the live DOM. */
const READ_CONTROL = () => {
  const state = window.SF?.state;
  const btn = document.querySelector('#gm-engage-route-btn');
  const box = btn ? btn.getBoundingClientRect() : null;
  const style = btn ? getComputedStyle(btn) : null;
  const sel = (s) => !!document.querySelector(s);
  return {
    navRoute: state?.nav?.route
      ? { legs: Array.isArray(state.nav.route.legs) ? state.nav.route.legs.length : null,
        totalFuel: state.nav.route.totalFuel ?? null }
      : null,
    executorStatus: state?.nav?.executor?.status ?? null,
    executorEngaged: state?.nav?.executor?.engaged ?? null,
    button: btn ? {
      exists: true,
      hiddenAttr: btn.hasAttribute('hidden'),
      disabled: btn.disabled === true,
      text: (btn.textContent || '').trim(),
      ariaDisabled: btn.getAttribute('aria-disabled'),
      display: style?.display, visibility: style?.visibility,
      rect: box ? { w: Math.round(box.width), h: Math.round(box.height) } : null,
      // Playwright's getByRole ignores nodes that are hidden by attribute or by layout.
      playwrightWouldSee: !btn.hasAttribute('hidden') && !!box && box.width > 0 && box.height > 0
        && style?.visibility !== 'hidden' && style?.display !== 'none',
    } : { exists: false },
    reasonText: (document.querySelector('#gm-engage-reason')?.textContent || '').trim(),
    // The journey's inspector selectors vs the ones the chart actually renders.
    journeySelectorsMatch: {
      '.gm-inspector': sel('.gm-inspector'),
      '[data-map-inspector]': sel('[data-map-inspector]'),
      '.gm-detail': sel('.gm-detail'),
      '.gm-selection': sel('.gm-selection'),
    },
    actualSelectorsMatch: {
      '.gm-inspector-content': sel('.gm-inspector-content'),
      '.gm-inspector-details': sel('.gm-inspector-details'),
      '#gm-tabpanel': sel('#gm-tabpanel'),
    },
  };
};

let server = null; let browser = null; let context = null; let page = null;
const report = { generatedAt: new Date().toISOString(), stages: {} };

try {
  await mkdir(OUT, { recursive: true });
  server = await acquireVisualProbeServer({ root: ROOT });
  log(`server ${server.baseUrl}`);
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({
    headless: false,
    executablePath: findSystemBrowser(),
    args: ['--incognito', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`, '--force-device-scale-factor=1'],
  });
  context = await browser.newContext({ viewport: VIEWPORT, screen: VIEWPORT, deviceScaleFactor: 1, locale: 'en-US', colorScheme: 'dark' });
  page = await context.newPage();
  page.setDefaultTimeout(30_000);
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.bringToFront();
  await bootToAuthoredFlight({ page, outputDir: null, log });

  await page.keyboard.press('KeyN');
  await TRAVEL_PUBLIC_HELPERS.waitVisibleSafe(page, '[data-screen="galaxyMap"]', 20_000);
  report.stages.beforePlot = await page.evaluate(READ_CONTROL);
  log(`before plot: ${JSON.stringify(report.stages.beforePlot.button)} route=${JSON.stringify(report.stages.beforePlot.navRoute)}`);

  // A NEIGHBOUR sector is the wrong experiment. `resolveGalaxyMapPrimaryAction` offers "Plot Course"
  // only for NON-neighbours; a one-hop destination offers solely "Set Course & Jump", which COMMITS
  // and dismisses the chart. Clicking that and then finding a 0x0 button proves only that the screen
  // closed — `getBoundingClientRect` zeroes out when any ANCESTOR is display:none, while
  // `getComputedStyle` still reports the element's own `display:block`. That is the signature of a
  // closed chart, not of a broken control, and reading it as a product defect would repeat exactly
  // the inference error that produced the misattributed approach P1.
  //
  // So: find a destination that is genuinely MULTI-HOP, plot with the plot-only action, and leave
  // the chart OPEN. Only that state separates the two live claims:
  //   A  the Engage control does not refresh after a plot            (product, P0)
  //   B  neighbour destinations conflate plot and commit, so the      (product, P1 — already proven)
  //      separate Engage step is unreachable on the default route
  const candidates = await page.evaluate(() => {
    const state = window.SF?.state;
    const world = state?.world;
    const here = world?.currentSectorId;
    const out = [];
    const ids = world?.sectors ? Object.keys(world.sectors) : [];
    for (const id of ids) {
      if (id === here) continue;
      try {
        const r = window.SF?.world?.computeRoute?.(state, here, id) || null;
        const hops = r && Array.isArray(r.legs) ? r.legs.length : null;
        if (hops && hops >= 2) out.push({ id, hops, name: world.sectors[id]?.name || id });
      } catch (e) { /* not all ids route */ }
    }
    return out.sort((a, b) => a.hops - b.hops).slice(0, 8);
  }).catch(() => []);
  report.stages.multiHopCandidates = candidates;
  log(`multi-hop candidates: ${JSON.stringify(candidates)}`);

  // Try each candidate until one actually offers the plot-only action.
  let plotted = false;
  const tryNames = candidates.length ? candidates.map((c) => c.name) : ['Tethys', 'Vesta', 'Ceres', 'Dione'];
  for (const nm of tryNames) {
    await TRAVEL_PUBLIC_HELPERS.searchAndSelect(page, nm, /sector|junction|belt|forge|hub/i).catch(() => {});
    await page.waitForTimeout(700);
    const plot = page.getByRole('button', { name: 'Plot Course', exact: true }).first();
    if (await plot.isVisible().catch(() => false)) {
      log(`"${nm}" offers PLOT COURSE (plot-only) — clicking it and leaving the chart open`);
      report.stages.primaryAction = 'Plot Course';
      report.stages.plottedTo = nm;
      await plot.click({ timeout: 8_000 }).catch(() => {});
      plotted = true;
      break;
    }
    log(`"${nm}" offers no plot-only action (neighbour or unreachable) — trying next`);
  }
  report.stages.foundPlotOnlyAction = plotted;
  await page.waitForTimeout(1500);
  report.stages.chartStillOpen = await page.locator('[data-screen="galaxyMap"]').first().isVisible().catch(() => false);
  report.stages.afterPlot = await page.evaluate(READ_CONTROL);

  // Does Playwright's role locator — what the journey uses — actually find it now?
  const loc = page.getByRole('button', { name: /^Engage$|Engage Route/i }).first();
  report.stages.playwrightRoleLocatorVisible = await loc.isVisible().catch(() => false);
  report.stages.playwrightRoleLocatorCount = await page.getByRole('button', { name: /^Engage$|Engage Route/i }).count().catch(() => -1);

  // THE DECIDER. Plotting dismisses the chart either way, so the control can only be judged with
  // the chart REOPENED and the route still on state. This separates the last two live claims:
  //   * Engage enabled on reopen  -> no refresh bug; the defect is "plot closes the chart, so plot
  //     and engage can never happen in one chart session" (a real but narrower UX defect).
  //   * Engage still says "No route plotted" on reopen -> the control genuinely does not reflect
  //     `nav.route`, and that is the P0.
  await page.locator('#gl-canvas').focus().catch(() => {});
  if (!report.stages.chartStillOpen) await page.keyboard.press('KeyN');
  report.stages.reopened = await TRAVEL_PUBLIC_HELPERS.waitVisibleSafe(page, '[data-screen="galaxyMap"]', 15_000);
  await page.waitForTimeout(1200);
  report.stages.afterReopen = await page.evaluate(READ_CONTROL);
  report.stages.reopenRoleLocatorVisible = await page.getByRole('button', { name: /^Engage$|Engage Route/i })
    .first().isVisible().catch(() => false);
} catch (e) {
  report.error = String(e && e.stack ? e.stack : e);
  log(`ERROR ${report.error}`);
} finally {
  await page?.close().catch(() => {});
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await server?.release?.().catch(() => {});
}

const ap = report.stages.afterPlot;
if (ap) {
  log(`── after plotting a course to ${report.stages.plottedTo || 'the selected destination'} ──`);
  log(`  state.nav.route      : ${JSON.stringify(ap.navRoute)}`);
  log(`  #gm-engage-route-btn : ${JSON.stringify(ap.button)}`);
  log(`  reason text          : "${ap.reasonText}"`);
  log(`  journey's inspector selectors match: ${JSON.stringify(ap.journeySelectorsMatch)}`);
  log(`  actual inspector selectors match   : ${JSON.stringify(ap.actualSelectorsMatch)}`);
  log(`  playwright getByRole sees Engage   : ${report.stages.playwrightRoleLocatorVisible} (count ${report.stages.playwrightRoleLocatorCount})`);
  log(`  chart still open      : ${report.stages.chartStillOpen}`);
  log(`  found plot-only action: ${report.stages.foundPlotOnlyAction}`);
  // The verdict is only meaningful in the state that discriminates the claims: chart OPEN, route
  // plotted via the plot-only action. Anything else is reported as INCONCLUSIVE rather than stamped,
  // because a confident wrong attribution is more expensive than no attribution.
  let verdict;
  if (!report.stages.foundPlotOnlyAction) {
    verdict = 'INCONCLUSIVE — no destination offered a plot-only action, so the refresh claim was never tested. '
      + 'What IS shown: every reachable destination conflates plot with commit.';
  } else if (!report.stages.chartStillOpen) {
    verdict = 'INCONCLUSIVE — the chart closed despite using the plot-only action; a 0x0 rect here measures '
      + 'a hidden ancestor, not a broken control.';
  } else if (!ap.navRoute) {
    verdict = 'PLOT ITSELF FAILED — no nav.route after the plot-only action; step 5 is the real failure.';
  } else if (ap.button.exists && ap.button.playwrightWouldSee && !ap.button.disabled) {
    verdict = 'REFRESH IS FINE — with the chart open and a route plotted, Engage is present, visible and enabled. '
      + 'The journey step-6 failure is then the NEIGHBOUR conflation, not a refresh bug.';
  } else {
    verdict = 'REFRESH BUG CONFIRMED — chart open, nav.route set, and the Engage control is still '
      + `disabled=${ap.button.disabled} visible=${ap.button.playwrightWouldSee} reason="${ap.reasonText}".`;
  }
  const ar = report.stages.afterReopen;
  if (ar) {
    log('── after REOPENING the chart with the route still plotted ──');
    log(`  reopened             : ${report.stages.reopened}`);
    log(`  state.nav.route      : ${JSON.stringify(ar.navRoute)}`);
    log(`  #gm-engage-route-btn : ${JSON.stringify(ar.button)}`);
    log(`  reason text          : "${ar.reasonText}"`);
    log(`  playwright sees it   : ${report.stages.reopenRoleLocatorVisible}`);
    const reopenVerdict = !report.stages.reopened
      ? 'INCONCLUSIVE — the chart did not reopen.'
      : !ar.navRoute
        ? 'ROUTE WAS DISCARDED — nav.route is gone after closing the chart; plotting does not persist.'
        : (!ar.button.disabled && ar.button.playwrightWouldSee)
          ? 'ENGAGE IS REACHABLE ON REOPEN — so there is NO refresh bug. The real defect is narrower: '
            + 'plotting dismisses the chart, so plot and engage cannot happen in one chart session.'
          : `ENGAGE STILL UNREACHABLE ON REOPEN — disabled=${ar.button.disabled}, `
            + `reason="${ar.reasonText}" while nav.route has ${ar.navRoute.legs} leg(s). The control does not reflect state.`;
    log(`  REOPEN VERDICT: ${reopenVerdict}`);
    report.reopenVerdict = reopenVerdict;
  }
  log(`  VERDICT: ${verdict}`);
  report.verdict = verdict;
}
const file = path.join(OUT, `engage-${Date.now()}.json`);
await writeFile(file, JSON.stringify(report, null, 2));
log(`report: ${path.relative(ROOT, file)}`);
process.exit(report.error ? 1 : 0);
