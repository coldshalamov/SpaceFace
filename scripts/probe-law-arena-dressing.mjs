// scripts/probe-law-arena-dressing.mjs — PQ-133.08 live-route evidence.
//
// Boots the REAL game, enters live flight, then drives a real Survival wave-plan into both law
// arenas on the live event bus:
//   state.run -> lagrange_crucible + run:wavePlanned (real planWave) -> survivalArena installs the
//     room -> its survivalArena:installed payload now carries fieldSpecs/toySpecs -> the renderer's
//     lawArenaDressing builds pylons, a ridge shutter bar, and current mouths in the live scene.
//   materializeWaveBatch (the same path survivalWave dispatches through) spawns the wave-10
//     dreadnought -> req.arenaId stamps data.bossDressing -> tidal vane drums ride the hull.
//   run:waveCleared tears the room down; a cinder_sluice plan rebuilds the sluice room (mouth,
//     crusher press, lane shutter) and a chain_tug boss.
// Screenshots land under .devshots/law-arena-dressing/.
//
//   node scripts/probe-law-arena-dressing.mjs

import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SEED = 4242;

let server = null;
let browser = null;
const results = [];

function record(label, ok, detail) {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(12)} ${detail}`);
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) {
    const free = await new Promise((resolve) => {
      const s = createNetServer();
      s.once('error', () => resolve(false));
      s.once('listening', () => s.close(() => resolve(true)));
      s.listen(port, '127.0.0.1');
    });
    if (free) return port;
  }
  throw new Error('no free port');
}

async function startServer() {
  const port = await findFreePort(8471);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true,
    env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' },
  });
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error('dev server exited before it was reachable');
    try { if ((await fetch(url)).ok) return { baseUrl: url, kill: () => child.kill() }; } catch (_) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error('dev server never became reachable');
}

async function clickButton(page, label) {
  return page.evaluate((wanted) => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const all = [...document.querySelectorAll('#screens button')];
    const b = all.find((x) => norm(x.textContent) === norm(wanted));
    if (b) { b.click(); return true; }
    return false;
  }, label);
}

// Count render-owned law-room parts in the live scene.
function roomCensus(page) {
  return page.evaluate(() => {
    const scene = window.SF.state && window.SF.state.render && window.SF.state.render.scene;
    if (!scene) return null;
    const counts = { pylon: 0, shutter: 0, crusher: 0, mouth: 0, root: 0 };
    scene.traverse((n) => {
      if (n.name === 'law_arena_room') counts.root += 1;
      else if (n.name === 'law_pylon') counts.pylon += 1;
      else if (n.name === 'law_shutter') counts.shutter += 1;
      else if (n.name === 'law_crusher') counts.crusher += 1;
      else if (n.name === 'law_current_mouth') counts.mouth += 1;
    });
    return counts;
  });
}

// Install a law arena on the live route: real run state + real planWave + the real event.
async function installLawWave(page, arenaId, wave) {
  await page.evaluate(async ({ arenaId, wave }) => {
    const { createRunState } = await import('./src/core/runState.js');
    const { planWave } = await import('./src/systems/survivalWavePlanner.js');
    const st = window.SF.state;
    const run = createRunState({ kind: 'survival', ruleset: 'scored', seed: 7 });
    run.arenaId = arenaId;
    run.phase = 'wave_intro';
    run.wave = wave;
    st.run = run;
    const plan = planWave({ seed: 7, arenaId, wave });
    window.SF.bus.emit('run:wavePlanned', { wave, plan, tick: st.tick || 0 });
  }, { arenaId, wave });
  // survivalArena installs on the wavePlanned receipt; the renderer builds the room that frame.
  await page.waitForTimeout(700);
}

// Spawn the wave-10 boss through the real materialization seam (spawnBudget + makeEnemySpawnSpec
// + the law-arena dressing stamp), near the player so it is on camera.
async function spawnLawBoss(page, arenaId) {
  const spawned = await page.evaluate(async (arenaId) => {
    const { materializeWaveBatch } = await import('./src/systems/waveMaterialization.js');
    const st = window.SF.state;
    const receipt = materializeWaveBatch(
      { state: st, helpers: window.SF.helpers },
      {
        // spawnBudget only grants to survival-wave:* owners while a survival run is live.
        ownerId: `survival-wave:10:probe-${arenaId}`, enemyId: 'dreadnought_boss', level: 4, count: 1,
        seed: 7, wave: 10, role: 'elite', arenaId, distance: 120, gateGroup: 'front',
      });
    const id = receipt.spawnedIds[0];
    window.__lawBoss = id != null ? st.entities.get(id) : null;
    return { receipt, boss: window.__lawBoss
      ? { id, dressing: window.__lawBoss.data && window.__lawBoss.data.bossDressing, pos: window.__lawBoss.pos }
      : null };
  }, arenaId);
  return spawned;
}

function bossDressingState(page, groupName) {
  return page.evaluate((groupName) => {
    const e = window.__lawBoss;
    if (!e || !e.mesh || !e.mesh.parent) return { mesh: false };
    let group = null;
    e.mesh.traverse((n) => { if (n.name === groupName) group = n; });
    if (!group) return { mesh: true, group: false };
    const drums = [];
    group.traverse((n) => {
      if (n.name === 'tidal_vane_drum' || n.name === 'chain_winch_drum') drums.push(n.rotation.x);
    });
    const underHull = group.parent === (e.mesh.userData && e.mesh.userData.hull);
    return { mesh: true, group: true, underHull, drums };
  }, groupName);
}

async function main() {
  server = await startServer();
  const pw = await loadPlaywright();
  browser = await pw.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  // The player-store endpoint is intentionally unmounted under the isolated save drawer
  // (SPACEFACE_PLAYER_STORE_DIR=''), so its boot-time 404 is designed-optional noise — the same
  // filter probe-demo-path.mjs and check-game-playable.mjs apply.
  const ignorable = (text) => /__spaceface_player_store/.test(text);
  page.on('pageerror', (err) => {
    const text = String(err && err.message || err);
    if (!ignorable(text)) pageErrors.push(text);
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    const url = msg.location() && msg.location().url;
    if (text.includes('404') && /__spaceface_player_store/.test(url || text)) return;
    pageErrors.push(text);
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && !/__spaceface_player_store/.test(res.url())) {
      pageErrors.push(`HTTP ${res.status()} ${res.url()}`);
    }
  });

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 150000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-screen="mainMenu"]');
    return el && getComputedStyle(el).display !== 'none';
  }, null, { timeout: 150000 });
  record('BOOT', true, 'main menu reached');

  if (!(await clickButton(page, 'New Game'))) throw new Error('no New Game button');
  await page.waitForTimeout(400);
  if (!(await clickButton(page, 'Launch'))) throw new Error('no Launch button');
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 240000 });
  await page.waitForTimeout(1500);
  record('ROUTE', true, 'live flight route entered');

  mkdirSync(`${ROOT}.devshots/law-arena-dressing`, { recursive: true });

  // --- Lagrange Crucible ---
  await installLawWave(page, 'lagrange_crucible', 1);
  const lg = await roomCensus(page);
  record('LAGRANGE', !!(lg && lg.root === 1 && lg.pylon === 2 && lg.shutter === 1 && lg.mouth === 2),
    JSON.stringify(lg));

  const lgSpawn = await spawnLawBoss(page, 'lagrange_crucible');
  record('TIDAL SPAWN', !!(lgSpawn.boss && lgSpawn.boss.dressing && lgSpawn.boss.dressing.kind === 'tidal_engine'),
    JSON.stringify(lgSpawn.boss && lgSpawn.boss.dressing));
  await page.waitForFunction(() => {
    const e = window.__lawBoss;
    return e && e.mesh && e.mesh.parent;
  }, null, { timeout: 120000 });
  await page.waitForTimeout(1600); // build-in settles
  const tidal0 = await bossDressingState(page, 'tidal_engine_dressing');
  await page.waitForTimeout(1200);
  const tidal1 = await bossDressingState(page, 'tidal_engine_dressing');
  const drumsSpin = tidal1.drums.length === 2
    && tidal0.drums.length === 2
    && Math.abs(tidal1.drums[0] - tidal0.drums[0]) > 0.02
    && Math.sign(tidal1.drums[0]) !== Math.sign(tidal1.drums[1]);
  record('TIDAL RIG', !!(tidal1.group && tidal1.underHull && drumsSpin),
    `underHull=${tidal1.underHull} drums ${JSON.stringify(tidal0.drums)} -> ${JSON.stringify(tidal1.drums)}`);

  // Room machinery is visibly working: a pylon collar advances between frames.
  const collar0 = await page.evaluate(() => {
    let c = null;
    window.SF.state.render.scene.traverse((n) => { if (!c && n.name === 'law_pylon_collar') c = n; });
    return c ? c.rotation.y : null;
  });
  await page.waitForTimeout(800);
  const collar1 = await page.evaluate(() => {
    let c = null;
    window.SF.state.render.scene.traverse((n) => { if (!c && n.name === 'law_pylon_collar') c = n; });
    return c ? c.rotation.y : null;
  });
  record('ROOM MOVES', collar0 != null && collar1 != null && Math.abs(collar1 - collar0) > 0.005,
    `pylon collar ${Number(collar0).toFixed(3)} -> ${Number(collar1).toFixed(3)} rad`);

  await page.screenshot({ path: `${ROOT}.devshots/law-arena-dressing/lagrange.png` });
  console.log('  shot  .devshots/law-arena-dressing/lagrange.png');

  // --- teardown + Cinder Sluice ---
  await page.evaluate(() => {
    window.SF.bus.emit('run:waveCleared', { wave: 1 });
  });
  await page.waitForTimeout(500);
  const afterClear = await roomCensus(page);
  record('RELEASE', !!(afterClear && afterClear.root === 0), `post-clear census ${JSON.stringify(afterClear)}`);

  await installLawWave(page, 'cinder_sluice', 10);
  const cs = await roomCensus(page);
  record('CINDER', !!(cs && cs.root === 1 && cs.mouth === 1 && cs.crusher === 1 && cs.shutter === 1),
    JSON.stringify(cs));

  const csSpawn = await spawnLawBoss(page, 'cinder_sluice');
  record('CHAIN SPAWN', !!(csSpawn.boss && csSpawn.boss.dressing && csSpawn.boss.dressing.kind === 'chain_tug'),
    JSON.stringify(csSpawn.boss && csSpawn.boss.dressing));
  await page.waitForFunction(() => {
    const e = window.__lawBoss;
    return e && e.mesh && e.mesh.parent;
  }, null, { timeout: 120000 });
  await page.waitForTimeout(1600);
  const tug = await bossDressingState(page, 'chain_tug_dressing');
  const tugDrums = tug && Array.isArray(tug.drums) ? tug.drums.length : -1;
  record('CHAIN RIG', !!(tug && tug.group && tug.underHull && tugDrums === 2),
    `state=${JSON.stringify(tug)}`);

  await page.screenshot({ path: `${ROOT}.devshots/law-arena-dressing/cinder.png` });
  console.log('  shot  .devshots/law-arena-dressing/cinder.png');

  // Kill the chain tug: the dressing releases with the hull through the real damage path.
  await page.evaluate(() => {
    const e = window.__lawBoss;
    const st = window.SF.state;
    window.SF.bus.emit('projectile:hit', {
      targetId: e.id,
      ownerId: st.playerId,
      damage: (e.hull || 0) + (e.shield || 0) + (e.armorHp || 0) + 9999,
      damageType: 'kinetic',
      pos: { x: e.pos.x, z: e.pos.z },
      approach: { x: 1, z: 0 },
      normal: { x: -1, z: 0 },
      weaponId: 'wpn_concussion_cannon_m',
    });
  });
  const dressingGone = await page.waitForFunction(() => {
    const e = window.__lawBoss;
    if (!e || !e.mesh || !e.mesh.parent) return true;
    let group = null;
    e.mesh.traverse((n) => { if (n.name === 'chain_tug_dressing') group = n; });
    return !group;
  }, null, { timeout: 40000 }).then(() => true).catch(() => false);
  record('BOSS RELEASE', dressingGone === true, 'chain-tug dressing detached after the kill');

  // Leave the probe run clean: end it so the arena teardown contract owns the last word.
  await page.evaluate(() => { window.SF.bus.emit('run:ended', { kind: 'survival', outcome: 'probe' }); });
  await page.waitForTimeout(400);
  const finalCensus = await roomCensus(page);
  record('RUN END', !!(finalCensus && finalCensus.root === 0), `final census ${JSON.stringify(finalCensus)}`);
  record('CLEAN', pageErrors.length === 0, `${pageErrors.length} uncaught error(s)`);

  if (pageErrors.length) console.log('  pageerrors:', JSON.stringify(pageErrors.slice(0, 6)));
  const failed = results.filter((r) => !r.ok);
  console.log(failed.length === 0 ? '\nLaw-arena dressing live-route probe: PASS' : `\n${failed.length} check(s) failed`);
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(async () => {
    try { if (browser) await browser.close(); } catch (_) { /* best effort */ }
    try { if (server) server.kill(); } catch (_) { /* best effort */ }
  });
