// scripts/probe-lattice-warden.mjs — Lattice Warden live-route evidence.
//
// Boots the REAL game, enters live flight, then drives the real capital-score stack:
//   a lattice_warden enemy hull spawns through makeEnemySpawnSpec (+ the forge assetRef the
//     mission decorator would stamp), a contract-shaped mission row goes active, and the live
//     capitalBossEncounters system (production registry wiring) runs capital_boss_lattice_warden:
//     act I stakes three lattice_node actors around the PLAYER, the survey holds fire, and the
//     latticeWardenTethers tracker draws the teal collar ring, three world-space beams and the
//     node glints on camera.
// Screenshots land under .devshots/lattice-warden/.
//
//   node scripts/probe-lattice-warden.mjs

import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

let server = null;
let browser = null;
const results = [];

function record(label, ok, detail) {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(14)} ${detail}`);
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
  const port = await findFreePort(8481);
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

// Scene census for the lattice field: collar on the hull, beams + glints at world level.
function latticeCensus(page) {
  return page.evaluate(() => {
    const scene = window.SF.state && window.SF.state.render && window.SF.state.render.scene;
    if (!scene) return null;
    const counts = { collar: 0, beam: 0, glint: 0, field: 0 };
    scene.traverse((n) => {
      if (n.name === 'lattice_warden_collar') counts.collar += 1;
      else if (n.name === 'lattice_warden_tether' && n.visible) counts.beam += 1;
      else if (n.name === 'lattice_warden_node_glint' && n.visible) counts.glint += 1;
      else if (n.name === 'lattice_warden_lattice_field') counts.field += 1;
    });
    return counts;
  });
}

async function main() {
  server = await startServer();
  const pw = await loadPlaywright();
  const executablePath = process.env.SPACEFACE_BROWSER_EXE || null;
  browser = await pw.chromium.launch(executablePath
    ? { headless: true, executablePath, args: ['--ignore-gpu-blocklist', '--enable-webgl'] }
    : { headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const pageErrors = [];
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

  mkdirSync(`${ROOT}.devshots/lattice-warden`, { recursive: true });

  // --- the real fight: lattice_warden hull + live mission row + production score system ---
  const setup = await page.evaluate(async () => {
    const { makeEnemySpawnSpec } = await import('./src/systems/combat.js');
    const st = window.SF.state;
    const helpers = window.SF.helpers;
    const player = st.entities.get(st.playerId);
    const fightId = 'contract:capital_boss_lattice_warden';
    st.missions.active.push({
      id: fightId, status: 'active',
      destSectorId: st.world.currentSectorId, type: 'capital_boss',
      params: { capitalBossId: 'capital_boss_lattice_warden' },
      targetEntityIds: [],
    });
    // The hull lands ~190 WU off the player's bow — on camera, inside engage range.
    const pos = { x: player.pos.x + 190, z: player.pos.z + 60 };
    const spec = makeEnemySpawnSpec('lattice_warden', 6, pos, {
      startedTick: st.tick || 0,
      motive: 'capital_boss_contract',
      engagementTrigger: 'capital_boss_contract',
    });
    spec.data = {
      ...(spec.data || {}),
      assetRef: 'asset.slice.lattice_warden',
      capitalBossEncounterId: 'capital_boss_lattice_warden',
      capitalBossActorKey: `${fightId}/capital_hull/0`,
      missionTag: fightId,
      missionPinned: true,
      capitalScoreOwned: true,
    };
    spec.flags = { ...(spec.flags || {}), persistent: true, invuln: false };
    const boss = helpers.spawnEntity(spec);
    window.__latticeBoss = boss;
    window.SF.bus.emit('capitalBoss:start', {
      encounterId: 'capital_boss_lattice_warden',
      fightId,
      bossId: boss.id,
      targetId: st.playerId,
    });
    return { bossId: boss.id, playerPos: { ...player.pos }, bossPos: { ...boss.pos } };
  });
  record('FIGHT', setup.bossId != null, `boss ${setup.bossId} at ${JSON.stringify(setup.bossPos)}`);

  // Act I: intro + transition + deploy tell, then the survey holds. ~10s of sim is the
  // authored window; poll the fight record until the lattice binds three live stakes.
  const bound = await page.waitForFunction(() => {
    const st = window.SF.state;
    const fights = st.capitalBossEncounters && st.capitalBossEncounters.fights;
    const r = fights && fights['contract:capital_boss_lattice_warden'];
    if (!r || !r.lattice) return false;
    if (r.lattice.nodeIds.filter((id) => id != null).length === 3) return true;
    return false;
  }, null, { timeout: 120000 }).catch(() => null);
  record('STAKES', !!bound, 'three lattice stakes bound to the fight record');

  const nodes = await page.evaluate(() => {
    const st = window.SF.state;
    const fights = st.capitalBossEncounters.fights;
    const r = fights['contract:capital_boss_lattice_warden'];
    const list = (r.lattice.nodeIds || []).map((id) => st.entities.get(id));
    return {
      deploys: r.lattice.deploys,
      intact: r.lattice.intact,
      phase: r.phase,
      nodeCount: list.filter((e) => e && e.alive !== false).length,
      roles: list.map((e) => e && e.data && e.data.physicalRole),
    };
  });
  record('CELL', !!(nodes.deploys >= 1 && nodes.nodeCount === 3), JSON.stringify(nodes));

  // Wait for the mesh + the presentation field (collar build-in), then census + shoot.
  await page.waitForFunction(() => {
    const e = window.__latticeBoss;
    return e && e.mesh && e.mesh.parent;
  }, null, { timeout: 120000 });
  await page.waitForTimeout(2200);
  const fx0 = await latticeCensus(page);
  record('FIELD', !!(fx0 && fx0.collar === 1 && fx0.beam === 3 && fx0.glint === 3),
    JSON.stringify(fx0));

  await page.screenshot({ path: `${ROOT}.devshots/lattice-warden/lattice-deployed.png` });
  console.log('  shot  .devshots/lattice-warden/lattice-deployed.png');

  // Break a stake through the real kill channel: the armed/liveness facts move on the record.
  const broke = await page.evaluate(() => {
    const st = window.SF.state;
    const r = st.capitalBossEncounters.fights['contract:capital_boss_lattice_warden'];
    const id = r.lattice.nodeIds[0];
    const node = st.entities.get(id);
    if (!node) return { node: false };
    node.hull = 0;
    window.SF.bus.emit('entity:killed', { id, killerId: st.playerId });
    node.alive = false;
    return { node: true, id };
  });
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => {
    const st = window.SF.state;
    const r = st.capitalBossEncounters.fights['contract:capital_boss_lattice_warden'];
    return { intact: r.lattice.intact, phase: r.phase };
  });
  const fx1 = await latticeCensus(page);
  record('STAKE BREAK', !!(broke.node && after.intact === false && fx1 && fx1.beam === 2),
    `record=${JSON.stringify(after)} census=${JSON.stringify(fx1)}`);

  await page.screenshot({ path: `${ROOT}.devshots/lattice-warden/stake-broken.png` });
  console.log('  shot  .devshots/lattice-warden/stake-broken.png');

  const errors = pageErrors.slice(0, 6);
  record('CONSOLE', errors.length === 0, errors.length ? errors.join(' | ') : 'clean');

  const fails = results.filter((r) => !r.ok);
  console.log(`\n${fails.length ? 'FAIL' : 'PASS'} — ${results.length - fails.length}/${results.length} checks`);
  await browser.close();
  browser = null;
  await server.kill();
  server = null;
  process.exit(fails.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  try { if (browser) await browser.close(); } catch (_) {}
  try { if (server) await server.kill(); } catch (_) {}
  process.exit(1);
});
