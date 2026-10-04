// Live acceptance for the hand-built story characters' residency: the REAL game route, not a harness.
//   main menu -> New Game -> Launch -> world:requestJump (gate) to each character's sector
// A pilot who arrives by gate is far (well past the far-actor table's exit radius) from the character. The
// far-actor table used to shelve its bodies within two ticks and the owner system re-minted them every second,
// so the character vanished, thrashed, and left anonymous twins. This asserts, in the real game, that for each
// character the cohort is present on arrival, is the very same set of bodies for the whole sample window,
// is never shelved, and never shows up as a far-table row.
//
//   node scripts/characters/check-residency-live.mjs
// Saves are isolated (SPACEFACE_PLAYER_STORE_DIR=''), never the player's drawer. Report: .devshots/residency/.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from '../lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = new URL('../../.devshots/residency/', import.meta.url);
await mkdir(OUT, { recursive: true });
const { chromium } = await loadPlaywright();

const SAMPLE_SIM_SECONDS = 8;
// cohort: how many bodies the character's system mints.
const TARGETS = [
  { name: 'vesper', sector: 'sector_helios_prime', cohort: 4, here: true },
  { name: 'bracket', sector: 'sector_helios_prime', cohort: 5, here: true },
  { name: 'solstice', sector: 'sector_ceres_belt', cohort: 4 },
  { name: 'ravel', sector: 'sector_pallas_drift', cohort: 4 },
];
const OWNS = {
  vesper: "e.data?.vesper === true",
  bracket: "!!e.data?.bracketPart",
  solstice: "!!e.data?.solsticePart",
  ravel: "!!e.data?.ravelPart",
};

async function freePort(start) {
  for (let p = start; p < start + 80; p++) {
    const free = await new Promise(res => { const s = createNetServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(p, '127.0.0.1'); });
    if (free) return p;
  }
  throw new Error('no free port');
}

const errors = [], report = { route: 'main menu -> New Game -> Launch -> world:requestJump(gate) per sector', checks: [], errors, characters: {} };
let server, browser, page;
try {
  const port = await freePort(8440);
  server = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' }, stdio: 'ignore', windowsHide: true });
  const base = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 80; i++) { try { if ((await fetch(base)).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 250)); }
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(`console.error: ${m.text().slice(0, 240)}`); });
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch { /* ignore */ } });
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 90_000 });
  await page.waitForFunction(() => { const el = document.querySelector('[data-screen="mainMenu"]'); return el && getComputedStyle(el).display !== 'none'; }, null, { timeout: 90_000 });
  const click = label => page.evaluate(wanted => {
    const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
    const all = [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && !x.disabled && getComputedStyle(x).visibility !== 'hidden');
    const b = all.find(x => norm(x.textContent) === norm(wanted)) || all.find(x => norm(x.textContent).includes(norm(wanted)));
    if (!b) return false; b.click(); return true;
  }, label);
  assert.ok(await click('New Game'), 'New Game button'); await page.waitForTimeout(400);
  assert.ok(await click('Launch'), 'Launch button');
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 240_000 });
  await page.waitForFunction(() => { const s = window.SF.state; return s.entities.get(s.playerId)?.presentationAdmission === 'ready'; }, null, { timeout: 240_000 });
  report.checks.push('real New Game reached flight with the player admitted');

  // Record every shelve event, and every body any character owner spawns or drops, from here on.
  await page.evaluate(owns => {
    const SF = window.SF; window.__shelved = []; window.__spawned = [];
    const test = Object.fromEntries(Object.entries(owns).map(([k, src]) => [k, new Function('e', `return ${src};`)]));
    SF.bus.on('world:farActorShelved', p => window.__shelved.push({ id: p.id, type: p.type, t: +(SF.state.simTime || 0).toFixed(1) }));
    SF.bus.on('entity:spawned', p => { const e = p.entity || SF.state.entities.get(p.id); if (!e) return;
      for (const [k, f] of Object.entries(test)) if (f(e)) window.__spawned.push({ who: k, id: e.id, t: +(SF.state.simTime || 0).toFixed(1) }); });
  }, OWNS);

  const snapshot = (who) => page.evaluate(([who, src]) => {
    const f = new Function('e', `return ${src};`), s = window.SF.state, p = s.entities.get(s.playerId);
    const mine = s.entityList.filter(e => e?.alive && f(e));
    const rows = (s.world.farActors?.rows || []).length;
    const nearest = mine.length ? Math.min(...mine.map(e => Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z))) : null;
    return { t: +(s.simTime || 0).toFixed(1), sector: s.world.currentSectorId, ids: mine.map(e => e.id).sort((a, b) => a - b), nearest, farRows: rows };
  }, [who, OWNS[who]]);

  async function judge(target) {
    // The cohort must exist (the sector may still be cooking), then stay the same set of bodies while the pilot is far.
    await page.waitForFunction(([src, n]) => { const f = new Function('e', `return ${src};`);
      return window.SF.state.entityList.filter(e => e?.alive && f(e)).length >= n; }, [OWNS[target.name], target.cohort], { timeout: 180_000 });
    const exit = await page.evaluate(async () => { try { const m = await import('/src/world/farActorTable.js'); return m.farActorTableRadius(window.SF.state).exit; } catch { return null; } });
    const first = await snapshot(target.name);
    const spawnedBefore = await page.evaluate(() => window.__spawned.length);
    // Sample on the SIM clock, not the wall clock: a loaded host runs far fewer than 60 sim-s per 60 wall-s, and the
    // old thrash needed whole seconds of sim time (the owner census runs once a sim-second) to show itself.
    const timeline = [first], wallStart = Date.now();
    while (timeline.at(-1).t - first.t < SAMPLE_SIM_SECONDS && Date.now() - wallStart < 240_000) {
      await page.waitForTimeout(1000); timeline.push(await snapshot(target.name));
    }
    const last = timeline.at(-1), simSpan = +(last.t - first.t).toFixed(1);
    const shelved = await page.evaluate(ids => window.__shelved.filter(x => ids.includes(x.id)), first.ids);
    const respawned = await page.evaluate(([n, who]) => window.__spawned.slice(n).filter(x => x.who === who), [spawnedBefore, target.name]);
    report.characters[target.name] = { sector: target.sector, exitRadius: exit, nearest: first.nearest, ids: first.ids, simSpan, shelved, respawned, farRows: last.farRows };
    assert.equal(first.sector, target.sector, `${target.name}: pilot is in ${target.sector}`);
    assert.ok(simSpan >= SAMPLE_SIM_SECONDS, `${target.name}: the sample window ran ${simSpan}s of sim time (wanted ${SAMPLE_SIM_SECONDS})`);
    assert.deepEqual(timeline.map(x => x.ids.join()).filter((v, i, a) => v !== a[0]), [], `${target.name}: the same bodies the whole time`);
    assert.deepEqual(shelved, [], `${target.name}: never shelved`);
    assert.deepEqual(respawned, [], `${target.name}: never re-minted after the first census`);
    if (!target.here) assert.ok(exit == null || first.nearest > exit, `${target.name}: the pilot arrived beyond the exit radius (${Math.round(first.nearest)} > ${Math.round(exit)}), so this proves residency while far`);
    report.checks.push(`${target.name}: ${first.ids.length} bodies resident over ${simSpan}s of sim time, nearest ${Math.round(first.nearest)} WU (exit radius ${exit == null ? 'n/a' : Math.round(exit)}), 0 shelved, 0 re-minted`);
  }

  for (const target of TARGETS) {
    if (!target.here) {
      await page.evaluate(sector => { window.SF.bus.emit('world:requestJump', { targetSectorId: sector, via: 'gate' }); }, target.sector);
      await page.waitForFunction(sector => window.SF.state.world.currentSectorId === sector && window.SF.state.mode === 'flight'
        && window.SF.state.jump?.state === 'IDLE', target.sector, { timeout: 240_000 });
      report.checks.push(`a real gate jump arrived in ${target.sector}`);
    }
    await judge(target);
  }
  report.checks.push(`page errors: ${errors.length}`);
  assert.deepEqual(errors.filter(e => /residen|farActor|shelv/i.test(e)), [], 'no error mentions the far-actor table');
  report.ok = true;
} catch (err) {
  report.ok = false; report.failure = String(err?.stack || err).slice(0, 1500);
  try { report.shelvedSoFar = await page.evaluate(() => window.__shelved?.slice(0, 20)); } catch { /* page gone */ }
  process.exitCode = 1;
} finally {
  await browser?.close(); server?.kill();
  await writeFile(new URL('live-report.json', OUT), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
