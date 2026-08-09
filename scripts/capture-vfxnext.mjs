#!/usr/bin/env node
// VFX NEXT capture harness — matched condition sheets for every family.
//
// Drives _vfxlab.html in DETERMINISTIC mode (?t=<seconds>): the lab fixed-steps its simulation to
// the requested instant and renders exactly one frame, so the same URL always produces the same
// pixels. That is the property that makes these captures usable as evidence rather than
// screenshots — design/PHYSICS_AS_SPECTACLE_ART_BIBLE.md §5.1 rejects an unmatched cell outright,
// and a wall-clock capture of a particle system is unmatched by construction.
//
// CONDITIONS (§2 R1 camera bands + the brief's five required views):
//   normal-dark    cam 110, bg 0.03   <- THE ACCEPTANCE VIEW. Ordinary gameplay scale.
//   normal-bright  cam 110, bg 0.62      dark-effect-on-bright and bright-on-bright both fail here
//   near           cam  45, bg 0.03      diagnostic only; may not approve anything
//   sling          cam 155, bg 0.03      speed-revealed continuation band
//   dense          cam 110, bg 0.03, n=6 pool saturation and concurrent legibility
//
// USAGE
//   node scripts/capture-vfxnext.mjs                 # every family, every condition
//   node scripts/capture-vfxnext.mjs --fx reentry    # one family
//   node scripts/capture-vfxnext.mjs --condition normal-dark
//   node scripts/capture-vfxnext.mjs --list
//
// Output: .devshots/vfxnext/<family>__<condition>.png plus a manifest recording, for every cell,
// the exact URL, the pool occupancy at that instant, and the declared budget it must fit inside.
// Deliberately NOT wired into `npm run check`: it needs a GPU and a browser, and the repo keeps
// that class of probe opt-in.

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'vfxnext');
const VIEW = { width: 1280, height: 800 };
const READY_TIMEOUT_MS = 45_000;
const MIN_PNG_BYTES = 8_000;

/** `t` is the instant to freeze, on the LAB clock. Note that a one-shot scenario does not fire at
 *  lab t=0 — it fires at its scenario `at` offset — so these values are `at` plus the beat we want.
 *  Getting that wrong produces a technically-valid capture of an event that has not happened yet,
 *  which is exactly what the `emptyPools` check below exists to catch (it caught it once already).
 *
 *  The beat is chosen to carry the family's READ: the spall cone for a normal impact, the leading
 *  shock disc for a concussion, the breakup field under the pressure front for a heavy explosion. */
const FAMILIES = [
  { fx: 'impact_normal',          t: 0.22, note: 'spall cone at full extent (fires at 0.12)' },
  { fx: 'impact_concussion',      t: 0.22, note: 'leading shock disc + debris kick (fires at 0.15)' },
  { fx: 'impact_collision_axis',  t: 0.22, note: 'same family, UNORIENTED axis: symmetric response' },
  { fx: 'destruction_light',      t: 0.42, note: 'breakup pieces + engine flare-out, inheriting velocity' },
  { fx: 'explosion_heavy',        t: 0.62, note: 'breakup field under the pressure front, plume opening' },
  { fx: 'explosion_heavy',        t: 1.30, suffix: 'late', note: 'second secondary detonation over the established plume' },
  { fx: 'thruster_boost',         t: 3.60, note: 'boost knee: narrowed cone + shock beads' },
  { fx: 'speed_extreme',          t: 2.40, note: 'annulus streaks, playfield centre clear' },
  { fx: 'massline_latch',         t: 0.26, note: 'pulse mid-travel between both contact ends' },
  { fx: 'massline_tension',       t: 5.20, note: 'high load: shiver + shed sparks, width still a line' },
  { fx: 'massline_release',       t: 0.28, note: 'snap + burst along retained momentum' },
  { fx: 'field_attractor',        t: 4.00, note: 'inward spiral, crowding toward the sink' },
  { fx: 'field_repulsor',         t: 4.00, note: 'convex dome, clear centre, outward thinning' },
  { fx: 'reentry',                t: 9.00, suffix: 'peak', note: 'peak heating: long wake, no breakup yet' },
  { fx: 'reentry',                t: 18.0, suffix: 'breakup', note: 'breakup: shedding fragments with trails' },
];

const CONDITIONS = [
  { id: 'normal-dark',   cam: 110, bg: 0.03, n: 1, acceptance: true },
  { id: 'normal-bright', cam: 110, bg: 0.62, n: 1, acceptance: true },
  { id: 'near',          cam: 45,  bg: 0.03, n: 1, acceptance: false },
  { id: 'sling',         cam: 155, bg: 0.03, n: 1, acceptance: false },
  { id: 'dense',         cam: 110, bg: 0.03, n: 6, acceptance: false },
];

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : fallback;
}

function cellName(entry, condition) {
  const suffix = entry.suffix ? `-${entry.suffix}` : '';
  return `${entry.fx}${suffix}__${condition.id}`;
}

function systemBrowserPath() {
  return [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find((c) => existsSync(c)) || null;
}

async function main() {
  if (process.argv.includes('--list')) {
    for (const f of FAMILIES) console.log(`${f.fx}${f.suffix ? `-${f.suffix}` : ''}  t=${f.t}  ${f.note}`);
    console.log('\nconditions:', CONDITIONS.map((c) => c.id).join(', '));
    return;
  }

  const onlyFx = arg('fx');
  const onlyCondition = arg('condition');
  const families = onlyFx ? FAMILIES.filter((f) => f.fx === onlyFx) : FAMILIES;
  const conditions = onlyCondition ? CONDITIONS.filter((c) => c.id === onlyCondition) : CONDITIONS;
  if (!families.length) throw new Error(`no family matches --fx ${onlyFx}`);
  if (!conditions.length) throw new Error(`no condition matches --condition ${onlyCondition}`);

  await mkdir(OUT, { recursive: true });
  const server = await acquireVisualProbeServer({ root: ROOT });
  const { chromium } = await loadPlaywright();

  const launch = {
    args: [
      // Software rendering makes this harness produce black frames and misleading cost numbers.
      // The project's own perf history records a SwiftShader episode; force real GPU here.
      '--use-gl=angle', '--enable-gpu-rasterization', '--ignore-gpu-blocklist',
    ],
  };
  const exe = systemBrowserPath();
  if (exe) launch.executablePath = exe;

  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  const cells = [];
  let failures = 0;

  for (const entry of families) {
    for (const condition of conditions) {
      const params = new URLSearchParams({
        fx: entry.fx,
        t: String(entry.t),
        cam: String(condition.cam),
        bg: String(condition.bg),
        n: String(condition.n),
        w: String(VIEW.width),
        h: String(VIEW.height),
        seed: '392430',
      });
      const url = `${server.baseUrl}/_vfxlab.html?${params}`;
      const name = cellName(entry, condition);
      const file = path.join(OUT, `${name}.png`);

      const before = consoleErrors.length;
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__vfxlabReady === true, null, { timeout: READY_TIMEOUT_MS });
      const cost = await page.evaluate(() => window.__vfxlabCost);
      const buf = await page.screenshot({ path: file, type: 'png' });

      const errs = consoleErrors.slice(before);
      // A capture that renders nothing is the failure mode a screenshot harness hides best: the
      // file exists, the run is green, and the sheet is empty. Size and pool occupancy are both
      // checked so an all-black cell cannot pass as evidence.
      const emptyPools = cost && cost.sparks === 0 && cost.debris === 0
        && cost.fronts === 0 && cost.ribbons === 0;
      const bad = buf.length < MIN_PNG_BYTES || errs.length > 0 || emptyPools;
      if (bad) failures++;

      cells.push({
        cell: name, family: entry.fx, condition: condition.id,
        acceptanceView: condition.acceptance,
        t: entry.t, cam: condition.cam, bg: condition.bg, concurrent: condition.n,
        note: entry.note,
        url: url.replace(server.baseUrl, '{server}'),
        file: path.relative(ROOT, file).replace(/\\/g, '/'),
        bytes: buf.length,
        pools: cost,
        consoleErrors: errs,
        status: bad ? 'SUSPECT' : 'ok',
      });
      const flag = bad ? '  <-- SUSPECT' : '';
      console.log(`${name.padEnd(46)} ${String(buf.length).padStart(7)}B  sparks ${String(cost?.sparks ?? '?').padStart(4)}${flag}`);
    }
  }

  await browser.close();
  if (server.close) await server.close();

  const manifest = {
    schema: 'spaceface.vfxnext.captures.v1',
    viewport: VIEW,
    note: 'Deterministic captures: the lab fixed-steps to ?t= and renders one frame. Same URL, same pixels.',
    acceptanceView: 'normal-dark and normal-bright at cam 110 are the only cells that may APPROVE an effect; near/sling/dense are diagnostic.',
    cells,
    failures,
  };
  await writeFile(path.join(OUT, 'captures.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`\n${cells.length} cells -> ${path.relative(ROOT, OUT)}  (${failures} suspect)`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exit(1); });
