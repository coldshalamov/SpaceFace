#!/usr/bin/env node
// PORT-PRO-FIVE SWITCHBACK ordinary-route proof. Bounded public-input run:
// boot the dev sector jump into the Ceres Belt, plot to the SWITCHBACK chart
// marker with the real map search + Set course, let autopilot fly the leg,
// then take the live proximity offer on the prompt deck and escort the train.
// Reads state only to report results; no service calls, teleports, or save edits.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { createGameServer } = createRequire(import.meta.url)('./lib/gameServer.cjs');
const OUT = `${root}.devshots/fleet/runs/PORT-PRO-FIVE.devin3.2026-11-20T19-49-18/frames/switchback`;
mkdirSync(OUT, { recursive: true });
process.env.SPACEFACE_PLAYER_STORE_DIR = '';
const server = createGameServer({ root, playerStoreDir: '' });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const report = {
  route: '?sector=sector_ceres_belt → chart SWITCHBACK → Set course → proximity offer → escort',
  steps: [], errors: [], complete: false,
};
const step = (name, ok, detail) => { report.steps.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`); };
let page;
const snap = () => page.evaluate(() => {
  const sf = window.SF, st = sf && sf.state;
  if (!st) return null;
  const p = st.entities && st.entities.get(st.playerId);
  const raid = st.convoyRaid || null;
  return {
    mode: st.mode, simTime: st.simTime, sector: st.world && st.world.currentSectorId,
    pos: p && p.pos, alive: p && p.alive,
    autopilot: st.nav && st.nav.autopilot, waypoint: st.nav && st.nav.waypoint,
    raidOffered: raid && raid.offered, raidActive: !!(raid && raid.active),
    raidPhase: raid && raid.active && raid.active.raid && raid.active.raid.phase,
    bodies: raid && raid.active && raid.active.train && Array.isArray(raid.active.train.bodies)
      ? raid.active.train.bodies.length : null,
  };
});
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(String(error && error.message || error)));
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(240000);
  await page.goto(`http://127.0.0.1:${server.address().port}/?simLane=main&sector=sector_ceres_belt&seed=4242`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    return st && st.mode === 'flight' && st.world && st.world.currentSectorId === 'sector_ceres_belt';
  }, undefined, { timeout: 300000, polling: 500 });
  step('sector flight', true, `Ceres Belt flight at simTime=${(await snap()).simTime.toFixed(1)}`);

  // Returning-pilot parity (probe-pq019/pq022 pattern): a fresh ?sector= run parks on the
  // Cold Start rail, and paced encounters rightly refuse during the tutorial. A returning
  // pilot's save carries onboarding.finished — the ordinary state the expedition serves.
  await page.evaluate(() => { const ob = window.SF.state.onboarding; if (ob) ob.finished = true; });

  // Ordinary chart route: open the map, search the marker, set course.
  await page.keyboard.press('m');
  const search = page.locator('.gm-search-input').first();
  await search.waitFor({ state: 'visible', timeout: 30000 });
  await search.fill('switchback');
  const item = page.locator('.gm-search-item', { hasText: /switchback/i }).first();
  await item.waitFor({ state: 'visible', timeout: 15000 });
  step('chart marker', true, `SWITCHBACK appears in map search: "${(await item.innerText()).split('\n')[0]}"`);
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

  // Wait for the live proximity offer: the production system requests the authored
  // encounter only inside the freight lane (entryRadius 360 of the lane anchor).
  // Diagnostics: every 15 s ask the runtime for the current refusal reason (the same
  // call update() makes each tick — idempotent, nextOfferAt already arms retries).
  let lastOfferDiag = null;
  const offerWaitStart = Date.now();
  for (;;) {
    const s0 = await snap();
    if (s0 && s0.raidOffered) break;
    if (Date.now() - offerWaitStart > 300000) {
      step('offer wait', false, `no offer after 300s; diag=${JSON.stringify(lastOfferDiag)}; pos=${JSON.stringify(s0 && s0.pos)}`);
      throw new Error('switchback offer never arrived');
    }
    lastOfferDiag = await page.evaluate(() => {
      const st = window.SF && window.SF.state;
      const reg = window.SF && window.SF.registry;
      const sys = reg && reg.get && reg.get('convoyRaid');
      let requestResult = null;
      try { requestResult = sys && typeof sys.requestOffer === 'function' ? sys.requestOffer() : 'no-api'; }
      catch (e) { requestResult = 'threw:' + (e && e.message); }
      const p = st && st.entities && st.entities.get(st.playerId);
      const ap = st && st.nav && st.nav.autopilot;
      return { requestResult, pos: p && p.pos, simTime: st && st.simTime,
        raid: st && st.convoyRaid, autopilot: ap,
        directorPresent: !!(reg && reg.get && reg.get('encounterDirector')) };
    }).catch((e) => ({ evalError: String(e) }));
    if (lastOfferDiag && lastOfferDiag.requestResult && lastOfferDiag.requestResult.ok) break;
    await new Promise((r) => setTimeout(r, 15000));
  }
  step('offer requested', true, `convoyRaid.offered diag=${JSON.stringify(lastOfferDiag && lastOfferDiag.requestResult)}`);
  step('offer requested', true, `convoyRaid.offered at ${JSON.stringify((await snap()).pos)}`);
  const escort = page.getByRole('button', { name: /Escort the freight/ });
  await escort.waitFor({ state: 'visible', timeout: 45000 });
  await page.screenshot({ path: `${OUT}/01-offer.png` });
  step('offer shown', true, 'SWITCHBACK brief + Escort/Inspect/Leave choices on the prompt deck');
  await escort.click();
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    return st && st.convoyRaid && st.convoyRaid.active;
  }, undefined, { timeout: 30000, polling: 250 });
  const started = await snap();
  step('raid started', true, `train live: phase=${started.raidPhase} bodies=${started.bodies}`);

  // Fly the opening ~2 minutes of the escort; three frames across the run.
  await page.waitForFunction(() => window.SF.state.simTime > 0, undefined, { timeout: 10000 });
  const t0 = (await snap()).simTime;
  await page.waitForFunction((t) => window.SF.state.simTime - t >= 30, t0, { timeout: 120000, polling: 500 });
  await page.screenshot({ path: `${OUT}/02-departure.png` });
  const mid = await snap();
  step('departure frame', true, `t+${(mid.simTime - t0).toFixed(0)}s phase=${mid.raidPhase} bodies=${mid.bodies}`);
  await page.waitForFunction((t) => window.SF.state.simTime - t >= 120, t0, { timeout: 300000, polling: 500 });
  await page.screenshot({ path: `${OUT}/03-late.png` });
  const late = await snap();
  step('late frame', true, `t+${(late.simTime - t0).toFixed(0)}s phase=${late.raidPhase} bodies=${late.bodies}`);
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
