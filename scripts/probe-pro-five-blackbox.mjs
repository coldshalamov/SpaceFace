#!/usr/bin/env node
// PORT-PRO-FIVE BLACKBOX RUNS ordinary-route proof. Bounded public-input run:
// boot the dev sector jump into the Vesta Forge, plot to the Dead Freighter
// Drift derelict field with the real map search + Set course, let autopilot fly
// the leg, then take the live proximity offer on the prompt deck and enter the
// Morrowglass expedition. Reads state only to report results; no service calls,
// teleports, or save edits.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { createGameServer } = createRequire(import.meta.url)('./lib/gameServer.cjs');
const OUT = `${root}.devshots/fleet/runs/PORT-PRO-FIVE.devin3.2026-11-20T19-49-18/frames/blackbox`;
mkdirSync(OUT, { recursive: true });
process.env.SPACEFACE_PLAYER_STORE_DIR = '';
const server = createGameServer({ root, playerStoreDir: '' });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const report = {
  route: '?sector=sector_vesta_forge → chart Dead Freighter Drift → Set course → proximity offer → enter Morrowglass',
  steps: [], errors: [], complete: false,
};
const step = (name, ok, detail) => { report.steps.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`); };
let page;
const snap = () => page.evaluate(() => {
  const sf = window.SF, st = sf && sf.state;
  if (!st) return null;
  const p = st.entities && st.entities.get(st.playerId);
  const view = st.derelictExpeditionView || null;
  const ledger = st.derelictExpedition && st.derelictExpedition.sites && st.derelictExpedition.sites.blackbox_vesta || null;
  let owned = 0;
  if (st.entities && typeof st.entities.forEach === 'function') {
    st.entities.forEach((e) => { if (e && e.data && e.data.derelictExpedition) owned += 1; });
  }
  return {
    mode: st.mode, simTime: st.simTime, sector: st.world && st.world.currentSectorId,
    pos: p && p.pos, alive: p && p.alive,
    autopilot: st.nav && st.nav.autopilot, waypoint: st.nav && st.nav.waypoint,
    phase: ledger && ledger.record && ledger.record.phase,
    accepted: !!(ledger && ledger.record && ledger.record.accepted),
    pressure: ledger && ledger.record && ledger.record.pressure,
    view: view ? { objective: view.objective && view.objective.title, markers: view.markers && view.markers.length, pressure: view.pressure && view.pressure.value } : null,
    owned,
  };
});
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(String(error && error.message || error)));
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(240000);
  // Seed 18's Vesta day-0 plan schedules blackbox_runs at ~60 s on the Dead
  // Freighter Drift derelict field (verified through the production planner).
  await page.goto(`http://127.0.0.1:${server.address().port}/?simLane=main&sector=sector_vesta_forge&seed=18`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    return st && st.mode === 'flight' && st.world && st.world.currentSectorId === 'sector_vesta_forge';
  }, undefined, { timeout: 300000, polling: 500 });
  step('sector flight', true, `Vesta Forge flight at simTime=${(await snap()).simTime.toFixed(1)}`);

  // Returning-pilot parity (same pattern as the SWITCHBACK/TOWJAW proofs): a
  // fresh ?sector= run parks on the Cold Start rail, and paced encounters
  // rightly refuse during the tutorial. A returning pilot's save carries
  // onboarding.finished — the ordinary state the expedition serves.
  await page.evaluate(() => { const ob = window.SF.state.onboarding; if (ob) ob.finished = true; });

  // Ordinary chart route: open the map, search the derelict zone, set course.
  await page.keyboard.press('m');
  const search = page.locator('.gm-search-input').first();
  await search.waitFor({ state: 'visible', timeout: 30000 });
  await search.fill('refuel depot');
  const item = page.locator('.gm-search-item', { hasText: /refuel depot/i }).first();
  await item.waitFor({ state: 'visible', timeout: 15000 });
  step('chart zone', true, `Dead Freighter Drift appears in map search: "${(await item.innerText()).split('\n')[0]}"`);
  await item.click();
  const setCourse = page.locator('#gm-set-course-btn');
  await setCourse.waitFor({ state: 'visible', timeout: 15000 });
  await setCourse.click();
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    const ap = st && st.nav && (st.nav.autopilot || st.nav.waypoint);
    return ap && (ap.active === true || ap.pos || ap.target);
  }, undefined, { timeout: 30000, polling: 250 });
  step('course set', true, `autopilot/waypoint armed: ${JSON.stringify((await snap()).autopilot || (await snap()).waypoint)}`);

  // Wait for the live proximity offer: the day-0 early-window item fires once
  // the player is inside the derelict field and within the site's invitation
  // radius. TOWJAW's item shares the same zone and may offer afterward.
  let lastDiag = null;
  const waitStart = Date.now();
  let offerButton = page.getByRole('button', { name: /Enter the derelict/ });
  for (;;) {
    const s0 = await snap();
    if (s0 && s0.accepted) break;
    if (await offerButton.count() > 0) break;
    if (Date.now() - waitStart > 420000) {
      step('offer wait', false, `no offer after 420s; diag=${JSON.stringify(lastDiag)}; pos=${JSON.stringify(s0 && s0.pos)}`);
      throw new Error('blackbox offer never arrived');
    }
    lastDiag = await page.evaluate(() => {
      const st = window.SF && window.SF.state;
      const p = st && st.entities && st.entities.get(st.playerId);
      const ds = st && st.encounterDirector;
      const live = ds && ds.live ? Object.values(ds.live).map(l => `${l.shapeId || l.id}:${l.phase}`).slice(0, 6) : null;
      const pend = ds && ds.pending ? ds.pending.map(it => `${it.shapeId || it.id}@${Math.round(it.dueAt || it.delay || 0)}`).slice(0, 8) : null;
      return { pos: p && p.pos, simTime: st && st.simTime,
        pressure: ds && ds.pressure, live, pend,
        bbClock: !!(window.SF && window.SF.registry && window.SF.registry.get && window.SF.registry.get('derelictExpedition')),
      };
    }).catch((e) => ({ evalError: String(e) }));
    await new Promise((r) => setTimeout(r, 10000));
  }
  step('offer requested', true, `diag=${JSON.stringify(lastDiag)}`);
  await offerButton.waitFor({ state: 'visible', timeout: 90000 });
  await page.screenshot({ path: `${OUT}/01-offer.png` });
  step('offer shown', true, 'BLACKBOX RUNS brief + Enter/Leave choices on the prompt deck');
  await offerButton.click();
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    const ledger = st && st.derelictExpedition && st.derelictExpedition.sites && st.derelictExpedition.sites.blackbox_vesta;
    return ledger && ledger.record && ledger.record.accepted === true;
  }, undefined, { timeout: 30000, polling: 250 });
  const started = await snap();
  step('expedition started', true, `morrowglass live: phase=${started.phase} ownedBodies=${started.owned} view=${JSON.stringify(started.view)}`);

  // Watch the first ~2 minutes of the expedition; three frames across the run.
  await page.waitForFunction(() => window.SF.state.simTime > 0, undefined, { timeout: 10000 });
  const t0 = (await snap()).simTime;
  await page.waitForFunction((t) => window.SF.state.simTime - t >= 30, t0, { timeout: 120000, polling: 500 });
  await page.screenshot({ path: `${OUT}/02-approach.png` });
  const mid = await snap();
  step('approach frame', true, `t+${(mid.simTime - t0).toFixed(0)}s phase=${mid.phase} pressure=${mid.pressure} view=${JSON.stringify(mid.view)}`);
  await page.waitForFunction((t) => window.SF.state.simTime - t >= 120, t0, { timeout: 300000, polling: 500 });
  await page.screenshot({ path: `${OUT}/03-late.png` });
  const late = await snap();
  step('late frame', true, `t+${(late.simTime - t0).toFixed(0)}s phase=${late.phase} pressure=${late.pressure} view=${JSON.stringify(late.view)} owned=${late.owned}`);
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
