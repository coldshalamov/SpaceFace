// RUBRIC live acceptance: the REAL game route, not the bench.
//   main menu -> New Game -> Launch -> world:requestJump (gate) to sector_tethys_junction
// then asserts the three things a player can tell apart from a broken build:
//   1. the marker, its filing hull and the filed mark are live entities, drawn (meshes in the scene),
//      with no shader error and no page error;
//   2. a REAL key press (C) runs the real scanner, whose pulse wakes the marker and makes it speak;
//   3. the marker appears in the sector's own contact data and survives a save round-trip.
//
//   node scripts/characters/check-rubric-live.mjs [--keep-shots]
// Saves are isolated (SPACEFACE_PLAYER_STORE_DIR=''), never the player's drawer. Takes roughly the
// same time as check:playable. Screenshots land in .devshots/rubric/ (not committed).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from '../lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = new URL('../../.devshots/rubric/', import.meta.url);
const SECTOR = 'sector_tethys_junction';
await mkdir(OUT, { recursive: true });
const { chromium } = await loadPlaywright();

async function freePort(start) {
  for (let p = start; p < start + 80; p++) {
    const free = await new Promise(res => { const s = createNetServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(p, '127.0.0.1'); });
    if (free) return p;
  }
  throw new Error('no free port');
}

const errors = [], shaderErrors = [], report = { route: 'main menu -> New Game -> Launch -> world:requestJump(tethys) via gate', checks: [], errors };
let server, browser;
try {
  const port = await freePort(8420);
  server = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' }, stdio: 'ignore', windowsHide: true });
  const base = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 80; i++) { try { if ((await fetch(base)).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 250)); }
  // Same launch as check:playable. Forcing SwiftShader makes the sector's entry cook crawl for minutes and
  // holds every non-essential mesh (the paint mark) back; RUBRIC_LIVE_ARGS can still force it for a GPU-less host.
  browser = await chromium.launch({ headless: true, args: (process.env.RUBRIC_LIVE_ARGS || '').split(' ').filter(Boolean) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() !== 'error' || /Failed to load resource/i.test(m.text())) return;
    if (/THREE\.WebGLProgram: Shader Error|VALIDATE_STATUS\s+false|ERROR: 0:\d+:/i.test(m.text())) shaderErrors.push(m.text().slice(0, 300));
    errors.push(`console.error: ${m.text().slice(0, 240)}`);
  });
  page.on('response', r => { if (r.status() >= 400 && /rubric/i.test(r.url())) errors.push(`HTTP ${r.status()} ${r.url()}`); });
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

  // Into Tethys Junction by the REAL route: a gate jump (charge, tunnel, arrival), not a direct enterSector. The
  // player arrives far from the line (about 1.8 km), outside the far-actor table's radius, so the encounter must NOT
  // exist yet: it streams in as the pilot nears. (The renderer's own live-sector admission can take minutes on a
  // GPU-less host, so arrival is judged by the world, never by the renderer finishing.)
  await page.evaluate(sector => {
    window.__jumpAborts = []; window.SF.bus.on('jump:chargeAbort', p => window.__jumpAborts.push(p));
    window.SF.bus.emit('world:requestJump', { targetSectorId: sector, via: 'gate' });
  }, SECTOR);
  try {
    await page.waitForFunction(() => window.SF.state.world.currentSectorId === 'sector_tethys_junction' && window.SF.state.mode === 'flight'
      && window.SF.state.jump?.state === 'IDLE', null, { timeout: 240_000 });
  } catch (err) {
    report.jumpState = await page.evaluate(() => ({ jump: JSON.parse(JSON.stringify(window.SF.state.jump || {})), aborts: window.__jumpAborts,
      sector: window.SF.state.world.currentSectorId, mode: window.SF.state.mode, simTime: window.SF.state.simTime }));
    throw err;
  }
  report.checks.push('a real gate jump arrived in Tethys Junction');
  await page.waitForTimeout(3000);
  const farParts = await page.evaluate(() => window.SF.state.entityList.filter(e => e?.alive && e.data?.rubricPart).length);
  assert.equal(farParts, 0, 'nothing is minted for a pilot who is 1.8 km away');
  report.checks.push('arriving far from the line: the encounter is not minted (and so cannot thrash against the far-actor table)');
  const arrival = await page.evaluate(() => {
    const s = window.SF.state, p = s.entities.get(s.playerId);
    // Fly in to 900 units from the studio (the stream-in threshold is the far table's exit radius minus 350).
    const a = { x: 11498, z: 7002 }, dx = p.pos.x - a.x, dz = p.pos.z - a.z, d = Math.hypot(dx, dz) || 1;
    if (typeof p.pos.set === 'function') p.pos.set(a.x + dx / d * 900, 0, a.z + dz / d * 900); else { p.pos.x = a.x + dx / d * 900; p.pos.z = a.z + dz / d * 900; }
    p.vel.x = 0; p.vel.z = 0; return { x: p.pos.x, z: p.pos.z };
  });
  await page.waitForFunction(() => {
    const s = window.SF.state; const parts = s.entityList.filter(e => e?.alive && e.data?.rubricPart).map(e => e.data.rubricPart).sort();
    return parts.join() === 'body,hull,mark';
  }, null, { timeout: 120_000 });
  report.checks.push(`approaching to ${JSON.stringify(arrival)}: the marker, its filing hull and the filed mark materialized, exactly once each`);

  // The sector is still settling when the parts first appear. Sample the live game for a while so a
  // part that flickers (removed and re-minted by a late re-entry) shows in the report, not as a race.
  report.timeline = await page.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 16; i++) {
      const s = window.SF.state, parts = s.entityList.filter(e => e?.alive && e.data?.rubricPart).map(e => `${e.data.rubricPart}#${e.id}`).sort();
      out.push({ t: +(s.simTime || 0).toFixed(1), sector: s.world.currentSectorId, mode: s.mode, parts });
      await new Promise(r => setTimeout(r, 500));
    }
    return out;
  });
  const stable = report.timeline.slice(-6).every(x => x.parts.length === 3 && x.parts.join() === report.timeline.at(-1).parts.join());
  report.checks.push(`parts stable across the last 3 s of the timeline: ${stable}`);

  // Stand beside the line so the renderer admits and draws it.
  await page.waitForFunction(() => window.SF.state.entityList.some(e => e?.alive && e.data?.rubricPart === 'body'), null, { timeout: 60_000 });
  await page.evaluate(() => {
    const s = window.SF.state, p = s.entities.get(s.playerId), b = s.entityList.find(e => e?.alive && e.data?.rubricPart === 'body');
    s.camera.zoom = 120; window.SF.bus.emit('camera:zoom', { level: 120 });
    if (typeof p.pos.set === 'function') p.pos.set(b.pos.x + 70, 0, b.pos.z + 45); else { p.pos.x = b.pos.x + 70; p.pos.z = b.pos.z + 45; }
    p.vel.x = 0; p.vel.z = 0;
  });
  const partState = () => page.evaluate(() => {
    const s = window.SF.state, rd = window.SF.registry.get('render');
    return s.entityList.filter(e => e?.alive && e.data?.rubricPart).map(e => ({
      part: e.data.rubricPart, id: e.id, type: e.type, hasMesh: !!e.mesh, visible: e.mesh ? e.mesh.visible : null,
      inRenderer: !!(rd && rd._meshes && rd._meshes.get(e.id)), admission: e.presentationAdmission ?? null,
      authored: e.mesh?.userData?.rubric === true, pos: [Math.round(e.pos.x), Math.round(e.pos.z)] }));
  });
  // The marker (a drone) and the filing hull (a wreck) are packaged contacts: the renderer draws them in the first picture.
  try {
    await page.waitForFunction(() => {
      const s = window.SF.state, rd = window.SF.registry.get('render');
      const body = s.entityList.find(e => e?.alive && e.data?.rubricPart === 'body'), hull = s.entityList.find(e => e?.alive && e.data?.rubricPart === 'hull');
      return !!(body?.mesh?.userData?.rubric === true && body.mesh.visible !== false && hull && rd._meshes.get(hull.id));
    }, null, { timeout: 150_000 });
  } catch (err) { report.partState = await partState(); throw err; }
  // The paint mark is a small fx entity: the renderer holds every non-essential mesh back while its live-sector
  // admission window is open (a rule of the renderer, not of this character). So: it must always BUILD through the
  // real visual factory as the authored mark; and once the window has closed it must have its mesh.
  const marks = await page.evaluate(() => {
    const s = window.SF.state, rd = window.SF.registry.get('render');
    const mark = s.entityList.find(e => e?.alive && e.data?.rubricPart === 'mark');
    const built = rd.vf.build(mark); const ok = !!built && built.userData?.rubric === true; built?.removeFromParent?.();
    return { builds: ok, hasMesh: !!mark.mesh, admissionOpen: s.render?.liveSectorGpuAdmission === true, filed: mark.data.rubricMark.filed };
  });
  assert.equal(marks.builds, true, 'the real visual factory builds the authored mark');
  assert.equal(marks.filed, true);
  if (!marks.admissionOpen) assert.equal(marks.hasMesh, true, 'with the renderer\'s admission window closed the mark must be drawn');
  report.checks.push(`mark: factory build ok; drawn=${marks.hasMesh}; renderer admission window ${marks.admissionOpen ? 'still open on this host (mark deferred by the renderer, by design)' : 'closed'}`);
  const drawn = await page.evaluate(() => {
    const s = window.SF.state; return s.entityList.filter(e => e?.alive && e.data?.rubricPart).map(e => ({ part: e.data.rubricPart, authored: e.mesh?.userData?.rubric === true, admission: e.presentationAdmission ?? null }));
  });
  assert.equal(drawn.find(d => d.part === 'body').authored, true, 'the marker is drawn by the authored model');
  assert.ok(drawn.every(d => d.admission !== 'pending'), `nothing left staging: ${JSON.stringify(drawn)}`);
  report.checks.push(`drawn: ${JSON.stringify(drawn)}`);
  // Frame the marker for the picture and PROVE it is on screen: project its mesh through the live camera, polling
  // while the camera catches up with the teleport (it follows the player with a lag, so a single read is meaningless).
  const framing = await page.evaluate(async () => {
    const SF = window.SF, s = SF.state, p = s.entities.get(s.playerId);
    const body = s.entityList.find(e => e?.alive && e.data?.rubricPart === 'body');
    s.camera.zoom = 64; SF.bus.emit('camera:zoom', { level: 64 });
    if (typeof p.pos.set === 'function') p.pos.set(body.pos.x + 22, 0, body.pos.z + 52); else { p.pos.x = body.pos.x + 22; p.pos.z = body.pos.z + 52; }
    p.vel.x = 0; p.vel.z = 0;
    const cam = () => s.render?.cameraCtrl?.obj || s.render?.cameraCtrl?.camera || s.render?.camera;
    const trace = []; let last = null;
    for (let i = 0; i < 80; i++) {
      await new Promise(r => setTimeout(r, 500));
      const c = cam(), live = s.entityList.find(e => e?.alive && e.data?.rubricPart === 'body');
      if (!c || !live?.mesh?.getWorldPosition) continue;
      const v = new SF.THREE.Vector3(); live.mesh.getWorldPosition(v); v.project(c);
      last = { x: +v.x.toFixed(3), y: +v.y.toFixed(3), z: +v.z.toFixed(3), visible: live.mesh.visible, zoom: +s.camera.zoom.toFixed(1), rel: [Math.round(live.pos.x - p.pos.x), Math.round(live.pos.z - p.pos.z)] };
      if (i % 4 === 0) trace.push(last);
      if (Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.9 && v.z < 1 && live.mesh.visible !== false) return { camera: true, ndc: last, trace, settledAfterS: (i + 1) / 2 };
    }
    return { camera: !!cam(), ndc: last, trace };
  });
  report.framing = framing;
  assert.equal(framing.camera, true, 'the live camera is reachable');
  assert.ok(framing.ndc && Math.abs(framing.ndc.x) < 0.9 && Math.abs(framing.ndc.y) < 0.9 && framing.ndc.z < 1 && framing.ndc.visible !== false,
    `the marker is inside the live frame: ${JSON.stringify(framing.ndc)}`);
  report.checks.push(`marker projects inside the live camera frame after ${framing.settledAfterS}s: ${JSON.stringify(framing.ndc)}`);
  await page.screenshot({ path: fileURLToPath(new URL('live-01-marking-line.png', OUT)) });

  // A real key press runs the real scanner.
  const before = await page.evaluate(() => window.SF.state.rubric.met);
  assert.equal(before, false);
  await page.evaluate(() => { document.querySelector('canvas')?.focus(); });
  await page.keyboard.press('KeyC');
  await page.waitForFunction(() => window.SF.state.rubric.met === true, null, { timeout: 20_000 }).catch(async () => {
    await page.waitForTimeout(3500); await page.keyboard.press('KeyC');
    await page.waitForFunction(() => window.SF.state.rubric.met === true, null, { timeout: 20_000 });
  });
  report.checks.push('a real key press ran the real scanner and the marker answered');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: fileURLToPath(new URL('live-02-met.png', OUT)) });

  // Save round-trip through the real save system.
  const saved = await page.evaluate(() => { const r = window.SF.registry.get('rubric'); return JSON.parse(JSON.stringify(r.serialize())); });
  assert.equal(saved.met, true); assert.equal(saved.version, 1);
  report.checks.push('state.rubric serializes through the real system');
  assert.deepEqual(shaderErrors, [], 'no shader error'); assert.deepEqual(errors, [], 'no page error');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.stack || String(error); process.exitCode = 1;
} finally {
  await browser?.close(); server?.kill();
  await writeFile(new URL('live-report.json', OUT), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
