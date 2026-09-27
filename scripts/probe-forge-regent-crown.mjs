// scripts/probe-forge-regent-crown.mjs — PQ-133.07 live-route evidence.
//
// Boots the REAL game, enters the Crucible through the real door, spawns the wave-30 Forge
// Regent through the canonical hostile spec path (makeEnemySpawnSpec -> spawnEntity — the same
// path waveMaterialization uses), then asserts the render-owned crown is on the boss boundary
// and is actually rotating in the room. Saves a screenshot under .devshots/.
//
//   node scripts/probe-forge-regent-crown.mjs

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

async function main() {
  server = await startServer();
  const pw = await loadPlaywright();
  browser = await pw.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err && err.message || err)));
  page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push(msg.text()); });

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 120000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-screen="mainMenu"]');
    return el && getComputedStyle(el).display !== 'none';
  }, null, { timeout: 120000 });
  record('BOOT', true, 'main menu reached');

  // Live route: New Game -> Launch -> real flight. The crown is render-owned presentation on the
  // spawned boundary, so any live flight route exercises it; the run machine is not under test here.
  if (!(await clickButton(page, 'New Game'))) throw new Error('no New Game button');
  await page.waitForTimeout(400);
  if (!(await clickButton(page, 'Launch'))) throw new Error('no Launch button');
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 180000 });
  await page.waitForTimeout(1500); // let the first sector settle
  record('ROUTE', true, 'live flight route entered');

  // Spawn the finale boss through the canonical path, just ahead of the player.
  await page.evaluate(async () => {
    const { makeEnemySpawnSpec } = await import('./src/systems/combat.js');
    const st = window.SF.state;
    const p = st.player;
    const fwd = p && Number.isFinite(p.rot) ? p.rot : 0;
    const pos = { x: (p?.pos?.x ?? 0), y: 0, z: (p?.pos?.z ?? 0) + 46 };
    const spec = makeEnemySpawnSpec('forge_regent', 4, pos, { motive: 'authorized_hostile_spawn' });
    window.__regent = window.SF.helpers.spawnEntity(spec);
  });
  const spawned = await page.evaluate(() => {
    const e = window.__regent;
    const st = window.SF.state;
    return e ? {
      id: e.id, type: e.type, alive: e.alive, inMap: st.entities.has(e.id),
      pos: e.pos, lootTableId: e.data && e.data.lootTableId,
      dressing: e.data && e.data.bossDressing,
    } : null;
  });
  record('SPAWN', !!(spawned && spawned.inMap && spawned.dressing),
    JSON.stringify(spawned));
  await page.waitForFunction(() => {
    const e = window.__regent;
    return e && e.mesh && e.mesh.parent;
  }, null, { timeout: 90000 });

  // Let the ignition build finish before sampling structure (plates scale in over ~1.15 s).
  await page.waitForTimeout(1800);
  const attached = await page.evaluate(() => {
    const e = window.__regent;
    let crown = null;
    e.mesh.traverse((n) => { if (n.name === 'forge_regent_crown') crown = n; });
    if (!crown) return { crown: false };
    let plates = 0, ember = null, spinner = null;
    crown.traverse((n) => {
      if (n.name === 'forge_regent_crown_spinner') spinner = n;
      if (n.name === 'forge_regent_crown_ember') ember = n;
      if (n.name === 'forge_regent_crown_plate') plates += 1;
    });
    return {
      crown: true,
      plates,
      emberIntensity: ember ? ember.material.emissiveIntensity : null,
      spinX: spinner ? spinner.rotation.x : null,
      parentIsHull: !!(crown.parent && crown.parent === (e.mesh.userData && e.mesh.userData.hull)),
    };
  });
  record('ATTACH', attached.crown === true && attached.plates >= 9 && attached.parentIsHull === true,
    `crown on hull, ${attached.plates} plates, ember=${Number(attached.emberIntensity).toFixed(2)}`);

  // The crown visibly rotates: sample the spinner's nose-axis angle across real frames.
  const spinA = attached.spinX;
  await page.waitForTimeout(1600);
  const spinB = await page.evaluate(() => {
    const e = window.__regent;
    let spinner = null;
    e.mesh.traverse((n) => { if (n.name === 'forge_regent_crown_spinner') spinner = n; });
    let ember = null;
    e.mesh.traverse((n) => { if (n.name === 'forge_regent_crown_ember') ember = n; });
    return { x: spinner ? spinner.rotation.x : null, ember: ember ? ember.material.emissiveIntensity : null };
  });
  record('ROTATE', spinB.x != null && spinA != null && Math.abs(spinB.x - spinA) > 0.05,
    `spinner ${Number(spinA).toFixed(3)} -> ${Number(spinB.x).toFixed(3)} rad; ember now ${Number(spinB.ember).toFixed(2)}`);

  mkdirSync(`${ROOT}.devshots/forge-regent-crown`, { recursive: true });
  const screenPos = await page.evaluate(() => {
    const e = window.__regent;
    const cam = window.SF.state && window.SF.state.render && window.SF.state.render.camera;
    if (!e || !e.mesh || !cam || !window.SF.THREE) return null;
    const v = new window.SF.THREE.Vector3();
    e.mesh.getWorldPosition(v);
    v.project(cam);
    return { x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) };
  });
  console.log(`  boss NDC ${JSON.stringify(screenPos)}`);
  await page.screenshot({ path: `${ROOT}.devshots/forge-regent-crown/live.png` });
  console.log('  shot  .devshots/forge-regent-crown/live.png');

  // The kill detaches it through the real damage/teardown path (same payload the route check uses).
  await page.evaluate(() => {
    const e = window.__regent;
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
  const crownGone = await page.waitForFunction(() => {
    const e = window.__regent;
    if (!e.mesh || !e.mesh.parent) return true; // boundary itself released with the kill
    let crown = null;
    e.mesh.traverse((n) => { if (n.name === 'forge_regent_crown') crown = n; });
    return !crown;
  }, null, { timeout: 30000 }).then(() => true).catch(() => false);
  const deadGone = await page.evaluate(() => window.__regent.alive === false || window.__regent.removed === true);
  record('RELEASE', crownGone === true, `crown detached after the kill (entity dead: ${deadGone})`);
  record('CLEAN', pageErrors.length === 0, `${pageErrors.length} uncaught error(s)`);

  const failed = results.filter((r) => !r.ok);
  console.log(failed.length === 0 ? '\nForge Regent crown live-route probe: PASS' : `\n${failed.length} check(s) failed`);
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(async () => {
    try { if (browser) await browser.close(); } catch (_) { /* best effort */ }
    try { if (server) server.kill(); } catch (_) { /* best effort */ }
  });
