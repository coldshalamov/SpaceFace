// SOLSTICE + RAVEL live acceptance: the REAL game route, not the bench. Template: check-rubric-live.mjs.
//   main menu -> New Game -> Launch -> world:requestJump (gate) to each character's sector
// Both characters stream their encounter by distance (the RUBRIC pattern): a pilot arriving by gate is
// far past the far-actor table's exit radius, so NOTHING may be minted yet — there is no body the table
// could shelve, and the old spawn/vanish/re-mint thrash cannot start. Approaching past the stream-in
// radius mints the cohort once; the sample window must show the very same bodies (no census thrash, no
// anonymous promoted twins), and a REAL key press (C) runs the real scanner and makes the character speak.
//
//   node scripts/characters/check-solstice-ravel-live.mjs [--keep-shots]
// Saves are isolated (SPACEFACE_PLAYER_STORE_DIR=''), never the player's drawer. Screenshots and the
// report land in .devshots/characters-streaming/ (not committed).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from '../lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = new URL('../../.devshots/characters-streaming/', import.meta.url);
await mkdir(OUT, { recursive: true });
const { chromium } = await loadPlaywright();

const SAMPLE_SIM_SECONDS = 8;
const OWNS = { solstice: '!!e.data?.solsticePart', ravel: '!!e.data?.ravelPart' };

async function freePort(start) {
  for (let p = start; p < start + 80; p++) {
    const free = await new Promise(res => { const s = createNetServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(p, '127.0.0.1'); });
    if (free) return p;
  }
  throw new Error('no free port');
}

const errors = [], shaderErrors = [], report = {
  route: 'main menu -> New Game -> Launch -> world:requestJump(gate) -> approach -> real scan, per sector',
  checks: [], characters: {}, errors,
};
let server, browser, page;
try {
  const port = await freePort(8460);
  server = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' }, stdio: 'ignore', windowsHide: true });
  const base = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 80; i++) { try { if ((await fetch(base)).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 250)); }
  // Same launch as check:playable. Software-GL flags make the sector-entry cook crawl for minutes; the
  // world-side assertions below never depend on the renderer finishing.
  browser = await chromium.launch({ headless: true, args: (process.env.CHARACTERS_LIVE_ARGS || '').split(' ').filter(Boolean) });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('crash', () => { report.crashedAt = report.progress?.at(-1) ?? 'before the hello wait'; });
  page.on('console', m => {
    if (m.type() !== 'error' || /Failed to load resource/i.test(m.text())) return;
    if (/THREE\.WebGLProgram: Shader Error|VALIDATE_STATUS\s+false|ERROR: 0:\d+:/i.test(m.text())) shaderErrors.push(m.text().slice(0, 300));
    errors.push(`console.error: ${m.text().slice(0, 240)}`);
  });
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

  // From here on, record every spawned/dropped body of either character, every shelve event, and every
  // voice line that takes the one-voice floor (a character line reaches the screen only through it).
  await page.evaluate(owns => {
    const SF = window.SF; window.__spawned = []; window.__shelved = []; window.__surfaced = [];
    const test = Object.fromEntries(Object.entries(owns).map(([k, src]) => [k, new Function('e', `return ${src};`)]));
    SF.bus.on('entity:spawned', p => { const e = p.entity || SF.state.entities.get(p.id); if (!e) return;
      for (const [k, f] of Object.entries(test)) if (f(e)) window.__spawned.push({ who: k, id: e.id, t: +(SF.state.simTime || 0).toFixed(1) }); });
    SF.bus.on('world:farActorShelved', p => window.__shelved.push({ id: p.id, type: p.type, t: +(SF.state.simTime || 0).toFixed(1) }));
    SF.bus.on('voice:surface', p => window.__surfaced.push({ text: String(p?.text || ''), t: +(SF.state.simTime || 0).toFixed(1) }));
    // A pilot this deep in the belt is past the tutorial; the arbiter otherwise holds every line back.
    if (SF.state.onboarding) { SF.state.onboarding.startedAt = (Number(SF.state.simTime) || 0) - 1000; SF.state.onboarding.finished = true; SF.state.onboarding.active = false; }
  }, OWNS);

  const gateJump = async sector => {
    await page.evaluate(s => {
      window.__jumpAborts = []; window.SF.bus.on('jump:chargeAbort', p => window.__jumpAborts.push(p));
      window.SF.bus.emit('world:requestJump', { targetSectorId: s, via: 'gate' });
    }, sector);
    try {
      await page.waitForFunction(s => window.SF.state.world.currentSectorId === s && window.SF.state.mode === 'flight'
        && window.SF.state.jump?.state === 'IDLE', sector, { timeout: 240_000 });
    } catch (err) {
      report.jumpState = await page.evaluate(() => ({ jump: JSON.parse(JSON.stringify(window.SF.state.jump || {})), aborts: window.__jumpAborts, sector: window.SF.state.world.currentSectorId, mode: window.SF.state.mode }));
      throw err;
    }
    report.checks.push(`a real gate jump arrived in ${sector}`);
  };

  const approach = async (systemUrl, anchorExport) => {
    await page.evaluate(async ([systemUrl, anchorExport]) => {
      const s = window.SF.state, p = s.entities.get(s.playerId);
      const m = await import(systemUrl);
      const a = m[anchorExport];
      const exit = (await import('/src/world/farActorTable.js')).farActorTableRadius(s).exit;
      const howClose = Math.max(260, exit - 450); // past the stream-in radius (exit - 350)
      const dx = p.pos.x - a.x, dz = p.pos.z - a.z, d = Math.hypot(dx, dz) || 1;
      if (typeof p.pos.set === 'function') p.pos.set(a.x + dx / d * howClose, 0, a.z + dz / d * howClose);
      else { p.pos.x = a.x + dx / d * howClose; p.pos.z = a.z + dz / d * howClose; }
      p.vel.x = 0; p.vel.z = 0;
    }, [systemUrl, anchorExport]);
  };

  const judge = async target => {
    const owns = OWNS[target.name];
    const far = await page.evaluate(src => {
      const f = new Function('e', `return ${src};`), s = window.SF.state, p = s.entities.get(s.playerId);
      const mine = s.entityList.filter(e => e?.alive && f(e));
      return { ids: mine.map(e => e.id), nearest: mine.length ? Math.min(...mine.map(e => Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z))) : null };
    }, owns);
    assert.equal(far.ids.length, 0, `${target.name}: a pilot arriving past the exit radius mints nothing (nothing to thrash)`);
    report.checks.push(`${target.name}: arriving far from the ${target.place} — the encounter is not minted`);

    await approach(target.system, target.anchor);
    await page.waitForFunction(([src, n]) => { const f = new Function('e', `return ${src};`);
      return window.SF.state.entityList.filter(e => e?.alive && f(e)).length >= n; }, [owns, target.cohort], { timeout: 120_000 });
    // Let the spawn events drain before baselining the re-mint counter: the bodies can be in the list a
    // beat before their queued entity:spawned records flush, and a baseline taken in between would count
    // the birth itself as a re-mint.
    await page.waitForTimeout(2000);
    report.checks.push(`${target.name}: approaching the ${target.place}, the cohort materialized whole (${target.cohort} bodies)`);

    // The sector is still settling when the cohort first appears; sample on the sim clock so a body that
    // flickers (removed and re-minted by the census) shows in the report as id churn, not as a race.
    report.characters[target.name] = await page.evaluate(async ([who, src, simSeconds]) => {
      const f = new Function('e', `return ${src};`), s = window.SF.state, p = s.entities.get(s.playerId);
      const snap = () => ({ t: +(s.simTime || 0).toFixed(1), ids: s.entityList.filter(e => e?.alive && f(e)).map(e => e.id).sort((a, b) => a - b),
        nearest: Math.min(...s.entityList.filter(e => e?.alive && f(e)).map(e => Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z))) });
      const out = { timeline: [], spawned: [], shelved: [] };
      const first = snap();
      out.timeline.push(first);
      const wallStart = Date.now();
      while (out.timeline.at(-1).t - first.t < simSeconds && Date.now() - wallStart < 240_000) {
        await new Promise(r => setTimeout(r, 1000));
        out.timeline.push(snap());
      }
      // A re-mint is a spawn whose id is not in the first snapshot: the birth records of the observed
      // cohort themselves can flush late (the sector-entry stall delays the bus), so counting array
      // positions would accuse the birth of being a re-mint. Entity ids are never recycled.
      out.spawned = window.__spawned.filter(x => x.who === who && !first.ids.includes(x.id));
      out.shelved = window.__shelved.filter(x => first.ids.includes(x.id));
      return out;
    }, [target.name, owns, SAMPLE_SIM_SECONDS]);
    const win = report.characters[target.name];
    const last = win.timeline.at(-1);
    assert.deepEqual(win.timeline.map(x => x.ids.join()).filter((v, i, a) => v !== a[0]), [], `${target.name}: the same bodies the whole window (no census thrash)`);
    assert.deepEqual(win.spawned, [], `${target.name}: nothing re-minted after the first census`);
    assert.deepEqual(win.shelved, [], `${target.name}: never shelved`);
    report.checks.push(`${target.name}: ${last.ids.length} bodies stable over ${+(last.t - win.timeline[0].t).toFixed(1)}s of sim time, 0 re-minted, 0 shelved`);
  };

  const realScan = async (metPath, greeting, who, place) => {
    await page.evaluate(() => { document.querySelector('canvas')?.focus(); });
    await page.keyboard.press('KeyC');
    await page.waitForFunction(p => p.split('.').reduce((o, k) => o?.[k], window.SF.state) === true, metPath, { timeout: 20_000 }).catch(async () => {
      await page.waitForTimeout(3500); await page.keyboard.press('KeyC');
      await page.waitForFunction(p => p.split('.').reduce((o, k) => o?.[k], window.SF.state) === true, metPath, { timeout: 20_000 });
    });
    report.checks.push(`a real key press ran the real scanner at the ${place} and the character answered`);
    // The words must reach the screen through the one-voice floor; judged in SIM time (a loaded host's
    // wall clock says nothing about the arbiter's queue). The greetings are unique strings, so a plain
    // match on the accumulated floor history cannot be a different speaker's line.
    for (let i = 0; i < 60; i++) {
      if (await page.evaluate(t => window.__surfaced.some(x => x.text.includes(t)), greeting)) break;
      await page.waitForTimeout(1500);
    }
    const said = await page.evaluate(t => window.__surfaced.find(x => x.text.includes(t)), greeting);
    assert.ok(said, `${who}: the greeting never took the floor: ${JSON.stringify(await page.evaluate(() => window.__surfaced.slice(-6)))}`);
    report.checks.push(`${place}: the greeting took the one-voice floor at sim ${said.t}s: "${said.text.slice(0, 70)}…"`);
  };

  // ----- Solstice / Ceres Belt -----
  await gateJump('sector_ceres_belt');
  await judge({ name: 'solstice', cohort: 4, place: 'lantern', system: '/src/systems/solstice.js', anchor: 'SOLSTICE_GLOBAL_ANCHOR' });
  // Stand in scanner range of the core, then press C for the real scanner.
  await page.evaluate(async () => {
    const s = window.SF.state, p = s.entities.get(s.playerId);
    const core = s.entityList.find(e => e?.alive && e.data?.solsticePart === 'core');
    if (typeof p.pos.set === 'function') p.pos.set(core.pos.x + 120, 0, core.pos.z); else { p.pos.x = core.pos.x + 120; p.pos.z = core.pos.z; }
    p.vel.x = 0; p.vel.z = 0;
  });
  await realScan('solstice.met', 'SOLSTICE: Traveler.', 'solstice', 'lantern');
  const solsticeDrawn = await page.evaluate(() => {
    const s = window.SF.state, rd = window.SF.registry.get('render');
    const core = s.entityList.find(e => e?.alive && e.data?.solsticePart === 'core');
    return { hasMesh: !!core?.mesh, inRenderer: !!(rd && rd._meshes && rd._meshes.get(core.id)), admission: core?.presentationAdmission ?? null };
  });
  assert.notEqual(solsticeDrawn.admission, 'pending', `nothing left staging: ${JSON.stringify(solsticeDrawn)}`);
  report.checks.push(`solstice core: admission ${solsticeDrawn.admission}, drawn=${solsticeDrawn.hasMesh}`);
  const solsticeSaved = await page.evaluate(() => JSON.parse(JSON.stringify(window.SF.registry.get('solstice').serialize())));
  assert.equal(solsticeSaved.met, true); assert.equal(solsticeSaved.version, 1);
  report.checks.push('state.solstice serializes through the real system');
  await page.screenshot({ path: fileURLToPath(new URL('live-01-solstice.png', OUT)) });

  // ----- Ravel / Pallas Drift -----
  await gateJump('sector_pallas_drift');
  await judge({ name: 'ravel', cohort: 4, place: 'loom', system: '/src/systems/ravel.js', anchor: 'RAVEL_GLOBAL_ANCHOR' });
  await page.evaluate(async () => {
    const s = window.SF.state, p = s.entities.get(s.playerId);
    const core = s.entityList.find(e => e?.alive && e.data?.ravelPart === 'core');
    if (typeof p.pos.set === 'function') p.pos.set(core.pos.x + 140, 0, core.pos.z); else { p.pos.x = core.pos.x + 140; p.pos.z = core.pos.z; }
    p.vel.x = 0; p.vel.z = 0;
  });
  await realScan('ravel.met', 'RAVEL: You are not the missing piece.', 'ravel', 'loom');
  const ravelSaved = await page.evaluate(() => JSON.parse(JSON.stringify(window.SF.registry.get('ravel').serialize())));
  assert.equal(ravelSaved.met, true); assert.equal(ravelSaved.version, 1);
  report.checks.push('state.ravel serializes through the real system');
  await page.screenshot({ path: fileURLToPath(new URL('live-02-ravel.png', OUT)) });

  assert.deepEqual(shaderErrors, [], 'no shader error'); assert.deepEqual(errors, [], 'no page error');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.stack || String(error); process.exitCode = 1;
  try {
    report.diagnostics = await page.evaluate(() => {
      const s = window.SF.state, p = s.entities.get(s.playerId);
      return { simTime: s.simTime, sector: s.world.currentSectorId, mode: s.mode,
        player: p ? { x: Math.round(p.pos.x), z: Math.round(p.pos.z) } : null,
        solstice: s.entityList.filter(e => e?.alive && e.data?.solsticePart).map(e => ({ part: e.data.solsticePart, id: e.id })),
        ravel: s.entityList.filter(e => e?.alive && e.data?.ravelPart).map(e => ({ part: e.data.ravelPart, id: e.id })),
        spawned: (window.__spawned || []).slice(-12), surfaced: (window.__surfaced || []).slice(-8) };
    });
  } catch { /* the page may already be gone */ }
} finally {
  await browser?.close(); server?.kill();
  await writeFile(new URL('live-report.json', OUT), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
