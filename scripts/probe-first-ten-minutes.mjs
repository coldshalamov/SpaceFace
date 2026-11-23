#!/usr/bin/env node
// probe-first-ten-minutes.mjs — Adventure's first ten minutes, played the way a stranger plays them:
// New Game -> first look (hands off) -> rope the nearest rock and throw it -> E to the berth ->
// the station hub -> take the first job -> undock. Real keys and mouse only; it never writes game
// state. It writes frames, a census of who is in the opening sector, every line of text that
// appears on screen with its time, and a facts file. It asserts nothing: open the frames and judge.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/probe-first-ten-minutes.mjs [--out=dir] [--seed=n]
//     [--w=1280 --h=720] [--look-only]   (viewport; --look-only stops after the first 18 s hands-off)
//
// The browser launches quietly (no window, no focus taken) through loadPlaywright.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { launchChromium, installSessionSignalGuard } from './player-truth/browser.mjs';
import { startBenchServer } from './lib/benchServer.mjs';
import { bootToMenu, adventureToFlight } from './player-truth/routes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true];
}));
const OUT = path.resolve(ROOT, String(argv.out || '.devshots/first-ten'));
const SEED = argv.seed != null ? Number(argv.seed) : 4242;
const VIEW = { width: Number(argv.w || 1280), height: Number(argv.h || 720) };
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(`[first-ten] ${s}`);

let server = null; let browser = null; let page = null;
const facts = { steps: [], census: [], words: [], events: [] };
let t0 = 0;
const since = () => Math.round((Date.now() - t0) / 100) / 10;

async function shot(name) {
  const file = path.join(OUT, `${String(Math.round(since())).padStart(3, '0')}s-${name}.png`);
  await page.screenshot({ path: file }).catch((e) => log(`shot ${name} failed: ${e.message}`));
  log(`shot ${path.relative(ROOT, file)}`);
  return file;
}

function step(id, ok, detail) {
  facts.steps.push({ id, ok, detail, t: since() });
  log(`${ok ? 'ok ' : 'NO '} ${id}${detail ? ` - ${detail}` : ''}`);
}

// ---------- observers ----------
const census = (label) => page.evaluate((lbl) => {
  const st = window.SF?.state;
  const me = st?.entities?.get(st.playerId);
  if (!st || !me?.pos) return null;
  const byType = {}; const ships = []; const near = { r400: 0, r800: 0, r1600: 0 };
  let helios = null;
  for (const e of st.entityList || []) {
    if (!e || e.alive === false || !e.pos || e.id === me.id) continue;
    byType[e.type] = (byType[e.type] || 0) + 1;
    const d = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
    if (e.type === 'station' && /helios/i.test(String(e.data?.stationId || e.name || e.id))) helios = Math.round(d);
    if (e.type === 'ship' || e.type === 'drone') {
      if (d < 400) near.r400++; if (d < 800) near.r800++; if (d < 1600) near.r1600++;
      const dd = e.data || {};
      // Who put it here: the spawner keys, so a crowd fix lands in the right data.
      const spawner = dd.encounterId || dd.trafficRole || dd.npcJobKind || dd.jobKind || dd.spawnContext
        || dd.ai?.spawnContext || dd.rosterId || dd.castId || dd.fixtureId || dd.role || (dd.onboarding ? 'onboarding' : null)
        || `?${e.type}:${Object.keys(dd).filter((k) => /id$|Id$|kind|role|source|context|cast|origin|owner/i.test(k)).slice(0, 6).join(',')}`;
      ships.push({ d: Math.round(d), name: dd.name || e.name || e.defId || dd.defId || null, spawner,
        team: e.team, hostile: !!(dd.ai?.huntPlayer || dd.hostile), speed: Math.round(Math.hypot(e.vel?.x || 0, e.vel?.z || 0)) });
    }
  }
  ships.sort((a, b) => a.d - b.d);
  const bySpawner = {};
  for (const s of ships) bySpawner[s.spawner || '?'] = (bySpawner[s.spawner || '?'] || 0) + 1;
  const ob = st.onboarding || {};
  const tracker = document.querySelector('.sf-mission-tracker');
  return { label: lbl, simTime: Math.round((st.simTime || 0) * 10) / 10, sector: st.world?.currentSectorId,
    heliosD: helios, byType, nearShips: near, bySpawner, ships: ships.slice(0, 20), shipCount: ships.length,
    beat: ob.currentBeat, active: ob.active, finished: ob.finished, rescue: ob.rescue?.current || null,
    waypoint: st.nav?.waypoint?.reason || st.nav?.waypoint?.label || null,
    tracker: tracker ? tracker.innerText.replace(/\s+/g, ' ').trim().slice(0, 160) : null,
    speed: Math.round(Math.hypot(me.vel?.x || 0, me.vel?.z || 0)) };
}, label).catch((e) => ({ label, error: String(e.message || e) }));

async function installWordSampler() {
  await page.evaluate(() => {
    window.__ften = { seen: new Map(), log: [], events: [] };
    const bus = window.SF?.bus;
    for (const name of ['hud:firstUse', 'toast', 'news:headline', 'tutorial:say', 'onboarding:say',
      'mission:accepted', 'mission:offered', 'tether:latched', 'tether:released', 'tether:thrown',
      'tether:detached', 'dock:docked', 'station:docked', 'ui:docked', 'ui:undocked', 'player:docked',
      'player:undocked', 'onboarding:beat', 'onboarding:beatDone', 'level:up', 'xp:levelUp', 'story:beat']) {
      try { bus.on(name, (p) => window.__ften.events.push({ name, at: performance.now(),
        text: p && (p.text || p.line || p.message || p.title || p.verbId) || null })); } catch (_) {}
    }
  });
}

// Every visible line of text outside the station screens, with the first time it appeared.
const sampleWords = () => page.evaluate(() => {
  const out = [];
  const host = window.__ften; if (!host) return out;
  const docked = !!window.SF?.state?.ui?.docked;
  const lines = String(document.body.innerText || '').split('\n').map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s && s.length > 1 && s.length < 220);
  const now = performance.now();
  for (const line of lines) {
    if (!host.seen.has(line)) { host.seen.set(line, now); out.push({ line, at: now, docked }); }
  }
  return out;
}).catch(() => []);

let sampling = null;
function startSampling() {
  const loop = async () => {
    while (sampling) {
      const rows = await sampleWords();
      for (const r of rows) facts.words.push({ t: since(), line: r.line, docked: r.docked });
      await sleep(500);
    }
  };
  sampling = true; loop();
}

const readMe = () => page.evaluate(() => {
  const st = window.SF?.state; const me = st?.entities?.get(st?.playerId);
  return me ? { x: me.pos.x, z: me.pos.z, rot: me.rot, speed: Math.hypot(me.vel?.x || 0, me.vel?.z || 0),
    docked: !!st.ui?.docked, mode: st.mode, top: window.SF?.ctx?.screenManager?.top?.() ?? null,
    tether: st.player?.tether ? { phase: st.player.tether.phase, count: st.player.tether.count } : null } : null;
}).catch(() => null);

// The rock a stranger sees: the nearest small asteroid that is painted on the gameplay canvas.
const nearestRock = () => page.evaluate(() => {
  const st = window.SF?.state; const me = st?.entities?.get(st?.playerId);
  if (!me?.pos) return null;
  let best = null; let bd = Infinity;
  for (const e of st.entityList || []) {
    if (!e || e.alive === false || !e.pos || (e.type !== 'asteroid' && e.type !== 'wreck')) continue;
    const d = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
    const scr = window.SF.ctx?.helpers?.worldToScreen?.(e.pos);
    if (!scr || scr.onScreen !== true || scr.behind) continue;
    if (d < bd) { bd = d; best = { id: e.id, type: e.type, d, screen: scr, mass: e.mass || e.data?.mass || null,
      name: e.name || e.data?.name || null, lesson: !!(e.data?.trainingDerelict || e.data?.onboardingRole) }; }
  }
  return best;
}).catch(() => null);

async function ropeAndThrow() {
  // A stranger looks for the rock on screen; if none is painted, nudge forward a moment.
  let rock = await nearestRock();
  for (let i = 0; i < 6 && !rock; i++) {
    await page.keyboard.down('KeyW'); await sleep(500); await page.keyboard.up('KeyW'); await sleep(400);
    rock = await nearestRock();
  }
  if (!rock) { step('rope', false, 'no rock painted on screen'); return; }
  await page.mouse.move(Math.round(rock.screen.x), Math.round(rock.screen.y), { steps: 4 });
  await sleep(400);
  await shot('rope-aim');
  await page.mouse.click(Math.round(rock.screen.x), Math.round(rock.screen.y), { button: 'right' });
  const latched = await page.waitForFunction(() => {
    const t = window.SF?.state?.player?.tether;
    return !!(t && (t.count > 0 || t.phase === 'latched' || t.phase === 'carry'));
  }, null, { timeout: 6000 }).then(() => true, () => false);
  if (!latched) {
    await page.keyboard.press('KeyF');
    await sleep(800);
  }
  const me = await readMe();
  step('rope', !!(me?.tether && (me.tether.count > 0 || me.tether.phase)), `rock ${rock.type} ${Math.round(rock.d)}m · tether ${JSON.stringify(me?.tether)}`);
  await sleep(900);
  await shot('rope-latched');
  // Swing: fly a short arc with the line on, then fling and let go.
  await page.keyboard.down('KeyW');
  const c = { x: VIEW.width / 2, y: VIEW.height / 2 };
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 1.4;
    await page.mouse.move(Math.round(c.x + Math.cos(a) * 300), Math.round(c.y - Math.sin(a) * 220), { steps: 2 });
    await sleep(160);
  }
  await shot('rope-swing');
  await page.mouse.down({ button: 'right' });
  await sleep(200);
  await page.mouse.move(Math.round(c.x + 320), Math.round(c.y - 160), { steps: 6 });
  await sleep(250);
  await page.mouse.up({ button: 'right' });
  await page.keyboard.up('KeyW');
  await sleep(700);
  await shot('rope-thrown');
  const after = await readMe();
  step('throw', true, `tether after release ${JSON.stringify(after?.tether)} · speed ${Math.round(after?.speed || 0)}`);
  await sleep(4000);
  await shot('after-throw');
}

async function dockOnE() {
  await page.keyboard.press('Escape').catch(() => {}); // drop any open overlay a stranger would close
  await sleep(300);
  const top = (await readMe())?.top;
  if (top === 'pause' || top === 'pauseMenu') { await page.keyboard.press('Escape'); await sleep(400); }
  await page.keyboard.press('KeyE');
  const ok = await page.waitForFunction(() => !!window.SF?.state?.ui?.dockInRange || !!window.SF?.state?.ui?.docked,
    null, { timeout: 150000 }).then(() => true, () => false);
  await shot('dock-approach');
  if (ok && !(await readMe())?.docked) {
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => !!window.SF?.state?.ui?.docked, null, { timeout: 15000 }).catch(() => {});
  }
  const me = await readMe();
  // The station screen can take seconds to come up on a loaded machine: time it, then wait for it.
  const dockedAt = Date.now();
  const screenUp = await page.waitForFunction(() => [...document.querySelectorAll('[data-nav]')].some((el) => el.offsetParent),
    null, { timeout: 30000 }).then(() => true, () => false);
  step('dock', !!me?.docked && screenUp, `docked ${!!me?.docked} · station screen ${screenUp ? `up after ${((Date.now() - dockedAt) / 1000).toFixed(1)} s` : 'never appeared'}`);
  await sleep(1500);
  await shot('station-hub');
  facts.hub = await page.evaluate(() => String(document.querySelector('#screens')?.innerText || '').replace(/\n{2,}/g, '\n').slice(0, 2400)).catch(() => null);
}

async function takeJob() {
  const doors = await page.evaluate(() => [...document.querySelectorAll('[data-nav]')]
    .filter((el) => el.offsetParent).map((el) => ({ nav: el.dataset.nav, text: el.innerText.replace(/\s+/g, ' ').trim() }))).catch(() => []);
  facts.doors = doors;
  const tile = page.locator('[data-nav="contracts"]').first();
  if (await tile.isVisible().catch(() => false)) await tile.click();
  await sleep(1500);
  await shot('jobs-board');
  facts.board = await page.evaluate(() => String(document.querySelector('#screens')?.innerText || '').replace(/\n{2,}/g, '\n').slice(0, 3000)).catch(() => null);
  const accept = page.locator('#screens .sx-ct-commit[data-accept], #screens [data-accept]').first();
  let took = false;
  if (await accept.isVisible().catch(() => false)) {
    // Contracts may be hold-to-accept: hold the pointer like a player would.
    const box = await accept.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down(); await sleep(1400); await page.mouse.up();
      took = true;
    }
  }
  await sleep(1500);
  const active = await page.evaluate(() => (window.SF?.state?.missions?.active || [])
    .map((m) => ({ title: m.title, type: m.type, status: m.status, reward: m.reward_cr ?? m.rewardCr ?? null }))).catch(() => []);
  facts.activeMissions = active;
  step('job', took, `active ${JSON.stringify(active).slice(0, 400)}`);
  await shot('job-taken');
}

async function undock() {
  // A stranger backs out with Esc (the job board, then the hub asks for departure) or clicks UNDOCK.
  const outNow = () => page.evaluate(() => window.SF?.state?.mode === 'flight' && !window.SF?.state?.ui?.docked).catch(() => false);
  for (let i = 0; i < 2 && !(await outNow()); i++) {
    await page.keyboard.press('Escape');
    await sleep(1400);
    if (i === 0) await shot('departure');
    const launch = page.locator('[data-pop-launch]').first();
    if (await launch.isVisible().catch(() => false)) { await shot('departure-check'); await launch.click(); await sleep(1200); }
  }
  if (!(await outNow())) {
    const alt = page.getByRole('button', { name: /undock/i }).first();
    if (await alt.isVisible().catch(() => false)) {
      await alt.click(); await sleep(1200);
      const launch = page.locator('[data-pop-launch]').first();
      if (await launch.isVisible().catch(() => false)) { await shot('departure-check'); await launch.click(); }
    }
  }
  const left = await page.waitForFunction(() => window.SF?.state?.mode === 'flight' && !window.SF?.state?.ui?.docked,
    null, { timeout: 20000 }).then(() => true, () => false);
  step('undock', left, left ? 'back in flight' : 'never left');
  await sleep(3000);
  await shot('undocked');
  await sleep(6000);
  await shot('undocked-later');
}

async function main() {
  installSessionSignalGuard(process);
  server = await startBenchServer();
  const { chromium } = await loadPlaywright();
  ({ browser } = await launchChromium(chromium, {
    headless: false,
    args: [`--window-size=${VIEW.width},${VIEW.height}`, '--mute-audio'],
  }));
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.on('pageerror', (e) => facts.events.push({ kind: 'pageerror', text: String(e.message || e).slice(0, 300) }));
  const stepLog = (name, ok, detail) => log(`${ok ? 'ok ' : 'NO '} ${name}${detail ? ` - ${detail}` : ''}`);
  await bootToMenu(page, server.baseUrl, stepLog);
  await adventureToFlight(page, stepLog, { seed: SEED });
  t0 = Date.now();
  await installWordSampler();
  startSampling();
  // First look: hands off, the way a stranger takes in the screen.
  for (const at of [0.3, 2.5, 5, 8, 12, 18]) {
    const wait = at * 1000 - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
    await shot(`look-${String(at).replace('.', '_')}s`);
    if (at === 0.3 || at === 12 || at === 18) facts.census.push(await census(`look ${at}s`));
  }
  // --look-only: the first look and nothing else (a quick framing check at another viewport).
  if (argv['look-only']) { sampling = false; return; }
  await ropeAndThrow();
  facts.census.push(await census('after throw'));
  await dockOnE();
  facts.census.push(await census('docked'));
  await takeJob();
  await undock();
  facts.census.push(await census('undocked'));
  sampling = false;
  facts.events.push(...await page.evaluate(() => (window.__ften?.events || []).map((e) => ({ ...e, at: Math.round(e.at) }))).catch(() => []));
}

main().catch((e) => { log(`FAILED ${e.stack || e.message}`); facts.error = String(e.message || e); })
  .finally(async () => {
    sampling = false;
    if (page && !page.isClosed()) await shot('end').catch(() => {});
    writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(facts, null, 2));
    log(`facts ${path.relative(ROOT, path.join(OUT, 'facts.json'))}`);
    await browser?.close().catch(() => {});
    await server?.close?.().catch(() => {});
    process.exit(0);
  });
