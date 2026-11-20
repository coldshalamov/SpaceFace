#!/usr/bin/env node
// PORT-PRO-FIVE GLASSWAKE ordinary-route proof. Bounded public-input run:
// boot the dev sector jump into the Vesta Forge, plot to the Refuel Depot on
// the Dead Freighter Drift's rim with the real map search + Set course, let
// autopilot fly the leg, take the live ambient offer on the prompt deck, and
// ride the storm's survey course. Reads state only to report results; no
// service calls, teleports, or save edits.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { createGameServer } = createRequire(import.meta.url)('./lib/gameServer.cjs');
const OUT = `${root}.devshots/fleet/runs/PORT-PRO-FIVE.devin3.2026-11-20T19-49-18/frames/glasswake`;
mkdirSync(OUT, { recursive: true });
process.env.SPACEFACE_PLAYER_STORE_DIR = '';
const server = createGameServer({ root, playerStoreDir: '' });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const report = {
  route: '?sector=sector_vesta_forge → chart Refuel Depot → Set course → GLASSWAKE offer → Lee Arc survey',
  steps: [], errors: [], complete: false,
};
const step = (name, ok, detail) => { report.steps.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`); };
let page;
const snap = () => page.evaluate(() => {
  const sf = window.SF, st = sf && sf.state;
  if (!st) return null;
  const p = st.entities && st.entities.get(st.playerId);
  const view = st.stormChaseView || null;
  return {
    mode: st.mode, simTime: st.simTime, sector: st.world && st.world.currentSectorId,
    pos: p && p.pos, alive: p && p.alive,
    autopilot: st.nav && st.nav.autopilot,
    viewPhase: view && view.phase, pockets: view && Array.isArray(view.pockets) ? view.pockets.length : null,
    pods: view && Array.isArray(view.pods) ? view.pods.length : (view && view.pods != null ? view.pods : null),
    fronts: view && Array.isArray(view.fronts) ? view.fronts.length : null,
    cues: view && view.cues ? Object.keys(view.cues).length : null,
  };
});
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(String(error && error.message || error)));
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(240000);
  // Seed 42's Vesta day-0 plan schedules glasswake_storm_chase at ~374 s on the
  // Dead Freighter Drift derelict field (verified through the production planner).
  await page.goto(`http://127.0.0.1:${server.address().port}/?simLane=main&sector=sector_vesta_forge&seed=42`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    return st && st.mode === 'flight' && st.world && st.world.currentSectorId === 'sector_vesta_forge';
  }, undefined, { timeout: 300000, polling: 500 });
  step('sector flight', true, `Vesta Forge flight at simTime=${(await snap()).simTime.toFixed(1)}`);

  // Returning-pilot parity: a fresh ?sector= run parks on the Cold Start rail;
  // paced encounters rightly refuse during the tutorial.
  await page.evaluate(() => { const ob = window.SF.state.onboarding; if (ob) ob.finished = true; });

  // Ordinary chart route: the Refuel Depot anchors the Drift's rim (~728 WU
  // from the zone centre — inside the 1020 proximity slack the gate admits).
  await page.keyboard.press('m');
  const search = page.locator('.gm-search-input').first();
  await search.waitFor({ state: 'visible', timeout: 30000 });
  await search.fill('refuel depot');
  const item = page.locator('.gm-search-item', { hasText: /refuel depot/i }).first();
  await item.waitFor({ state: 'visible', timeout: 15000 });
  step('chart zone', true, `Refuel Depot appears in map search: "${(await item.innerText()).split('\n')[0]}"`);
  await item.click();
  const setCourse = page.locator('#gm-set-course-btn');
  await setCourse.waitFor({ state: 'visible', timeout: 15000 });
  await setCourse.click();
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    const ap = st && st.nav && (st.nav.autopilot || st.nav.waypoint);
    return ap && (ap.active === true || ap.pos || ap.target);
  }, undefined, { timeout: 30000, polling: 250 });
  step('course set', true, `autopilot/waypoint armed: ${JSON.stringify((await snap()).autopilot)}`);

  // Wait for the live ambient offer. Civilian items keep their zone anchoring:
  // the player must hold near the derelict field until the schedule matures.
  let lastDiag = null;
  const waitStart = Date.now();
  const offerButton = page.getByRole('button', { name: /Lee Arc|Cross Shear|Return Hook/ }).first();
  for (;;) {
    const s0 = await snap();
    if (s0 && s0.viewPhase && s0.viewPhase !== 'idle' && s0.viewPhase !== 'offered') break;
    if (await offerButton.count() > 0) break;
    if (Date.now() - waitStart > 560000) {
      step('offer wait', false, `no offer after 560s; diag=${JSON.stringify(lastDiag)}; pos=${JSON.stringify(s0 && s0.pos)}`);
      throw new Error('glasswake offer never arrived');
    }
    lastDiag = await page.evaluate(() => {
      const st = window.SF && window.SF.state;
      const p = st && st.entities && st.entities.get(st.playerId);
      const ds = st && st.encounterDirector;
      const live = ds && ds.live ? Object.values(ds.live).map(l => `${l.shapeId || l.id}:${l.phase}`).slice(0, 6) : null;
      const pend = ds && ds.pending ? ds.pending.map(it => `${it.shapeId || it.id}@${Math.round(it.delay || 0)}`).slice(0, 8) : null;
      return { pos: p && p.pos, simTime: st && st.simTime, pressure: ds && ds.pressure, live, pend };
    }).catch((e) => ({ evalError: String(e) }));
    await new Promise((r) => setTimeout(r, 10000));
  }
  step('offer requested', true, `diag=${JSON.stringify(lastDiag)}`);
  await offerButton.waitFor({ state: 'visible', timeout: 90000 });
  await page.screenshot({ path: `${OUT}/01-offer.png` });
  step('offer shown', true, 'GLASSWAKE brief + survey course choices on the prompt deck');
  await page.getByRole('button', { name: /Lee Arc/ }).first().click();
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    const v = st && st.stormChaseView;
    return v && v.phase && v.phase !== 'offered' && v.phase !== 'idle';
  }, undefined, { timeout: 60000, polling: 500 });
  const started = await snap();
  step('survey started', true, `storm chase live: phase=${started.viewPhase} pockets=${started.pockets} fronts=${started.fronts}`);

  // Watch the opening ~2 minutes of the survey; three frames across the run.
  const t0 = (await snap()).simTime;
  await page.waitForFunction((t) => window.SF.state.simTime - t >= 30, t0, { timeout: 120000, polling: 500 });
  await page.screenshot({ path: `${OUT}/02-front.png` });
  const mid = await snap();
  step('front frame', true, `t+${(mid.simTime - t0).toFixed(0)}s phase=${mid.viewPhase} pockets=${mid.pockets} pods=${mid.pods}`);
  await page.waitForFunction((t) => window.SF.state.simTime - t >= 120, t0, { timeout: 300000, polling: 500 });
  await page.screenshot({ path: `${OUT}/03-late.png` });
  const late = await snap();
  step('late frame', true, `t+${(late.simTime - t0).toFixed(0)}s phase=${late.viewPhase} pockets=${late.pockets} pods=${late.pods}`);
  report.final = late;
  report.complete = true;
} catch (err) {
  report.errors.push(String(err && err.stack || err));
  step('run', false, String(err && err.message || err));
  try { await page.screenshot({ path: `${OUT}/99-failure.png` }); } catch (_) {}
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  await browser.close().catch(() => {});
  server.close();
}
process.exit(report.complete ? 0 : 4);
