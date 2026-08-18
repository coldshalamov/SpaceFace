// scripts/check-game-playable.mjs — "is the game actually playable right now?"
//
// WHY THIS EXISTS
// ---------------
// This repo has ~400 npm checks and the game still shipped two days in a row where the player's
// ship did not render, the vitals all read 0, the contact roster was empty and the controls did
// nothing — while checks stayed green. Every one of those checks inspects a module in isolation.
// None of them boots the game and asks whether a person could play it.
//
// So this check is deliberately NOT a unit test and deliberately NOT thorough. It boots the real
// game through the real route and asserts the six things that are true of every playable session
// and false of every broken one:
//
//   1. BOOT      the main menu appears                  (catches: freeze on the loading screen)
//   2. LAUNCH    flight starts                          (catches: freeze after Launch)
//   3. PILOT     the player has a hull, fuel and a gun  (catches: entity built without data)
//   4. HULL      the player's ship mesh is in the scene (catches: invisible ship)
//   5. WORLD     other entities exist                   (catches: empty sector)
//   6. CONTROLS  a thrust key changes the ship's speed  (catches: dead input)
//   7. CLEAN     no uncaught exception during any of it (catches: a throw killing the frame)
//
// Run it before you stop working. If it is red, you broke the game, whatever else is green.
//
//   node scripts/check-game-playable.mjs            # New Game route
//   node scripts/check-game-playable.mjs --verbose  # also dump diagnostics on failure
//
// Deliberate non-goals: no screenshots, no pixel comparison, no golden files, no performance
// budget. Those belong to other checks. This one answers one question and stays fast enough
// (~60-90s) that there is no excuse for skipping it.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VERBOSE = process.argv.includes('--verbose');
const { chromium } = await loadPlaywright();

const results = [];
const NLPAD = String.fromCharCode(10) + '      ';
let server = null;
let browser = null;
const pageErrors = [];
const missingAssets = [];

function record(step, ok, detail) {
  results.push({ step, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${step.padEnd(9)} ${detail}`);
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
  const port = await findFreePort(8360);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error('dev server exited before it was reachable');
    try { if ((await fetch(url)).ok) return { baseUrl: url, kill: () => child.kill() }; } catch (_) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error('dev server never became reachable');
}

async function clickButton(page, label) {
  return page.evaluate((wanted) => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const all = [...document.querySelectorAll('button')];
    const b = all.find((x) => norm(x.textContent) === norm(wanted)) || all.find((x) => norm(x.textContent).includes(norm(wanted)));
    if (!b || b.disabled) return false;
    b.click();
    return true;
  }, label);
}

try {
  console.log('\nSpaceFace — playable check\n');
  server = await startServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (err) => pageErrors.push(String(err && err.message || err)));
  page.on('console', (m) => {
    // "Failed to load resource: 404" with no URL is not actionable, and the console event does not
    // carry one. The response listener below does, so drop the useless twin.
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/Failed to load resource/i.test(text)) return;
    pageErrors.push('console.error: ' + text.slice(0, 300));
  });
  page.on('response', (res) => {
    if (res.status() >= 400) missingAssets.push(res.status() + ' ' + res.url().replace(server.baseUrl, '/'));
  });
  page.on('requestfailed', (req) => {
    const f = req.failure();
    missingAssets.push(((f && f.errorText) || 'failed') + ' ' + req.url().replace(server.baseUrl, '/'));
  });

  // ── 1. BOOT ────────────────────────────────────────────────────────────────────────────────
  // Freezing here is the owner-reported "stuck on the loading screen". A timeout IS the finding.
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  let bootOk = true;
  try {
    await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 30000 });
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-screen="mainMenu"]');
      return el && getComputedStyle(el).display !== 'none';
    }, null, { timeout: 30000 });
    record('BOOT', true, 'main menu reached');
  } catch (err) {
    bootOk = false;
    const stuck = await page.evaluate(() => ({
      sf: !!window.SF,
      overlay: (() => { const o = document.getElementById('boot-overlay') || document.querySelector('.sf-loading, #sf-loading'); return o ? getComputedStyle(o).display : '(none found)'; })(),
      screens: [...document.querySelectorAll('[data-screen]')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.dataset.screen),
    })).catch(() => null);
    record('BOOT', false, `never reached the main menu in 30s — ${JSON.stringify(stuck)}`);
  }

  // ── 2. LAUNCH ──────────────────────────────────────────────────────────────────────────────
  let inFlight = false;
  if (bootOk) {
    try {
      if (!(await clickButton(page, 'New Game'))) throw new Error('no New Game button');
      await page.waitForTimeout(400);
      if (!(await clickButton(page, 'Launch'))) throw new Error('no Launch button');
      await page.waitForFunction(() => {
        const st = window.SF.state;
        return st && st.mode === 'flight';
      }, null, { timeout: 90000 });
      await page.waitForTimeout(2500);   // let the first sector settle
      inFlight = true;
      record('LAUNCH', true, 'flight mode entered');
    } catch (err) {
      record('LAUNCH', false, `never entered flight — ${err.message}`);
    }
  } else {
    record('LAUNCH', false, 'skipped (boot failed)');
  }

  if (inFlight) {
    // ── 3. PILOT ─────────────────────────────────────────────────────────────────────────────
    // The owner's broken frame showed ENGY/DRIVE/HEAT/FUEL all 0 and WPN "—". That is not a HUD
    // bug; it is a player entity that was created without its data. Assert the data, not the HUD.
    const pilot = await page.evaluate(() => {
      const st = window.SF.state;
      const p = st.entities.get(st.playerId);
      if (!p) return { missing: true };
      const d = p.data || {};
      return {
        missing: false,
        hasData: !!p.data,
        hull: p.hull, hullMax: p.hullMax,
        shieldMax: p.shieldMax,
        weapons: Array.isArray(d.weapons) ? d.weapons.length : null,
        fuel: d.fuel != null ? d.fuel : (p.fuel != null ? p.fuel : null),
        defId: d.defId || d.shipId || null,
        alive: !!p.alive,
      };
    });
    const pilotOk = !pilot.missing && pilot.hasData && pilot.hullMax > 0 && pilot.weapons > 0 && pilot.alive;
    record('PILOT', pilotOk, pilotOk
      ? `${pilot.defId} · hull ${Math.round(pilot.hull)}/${pilot.hullMax} · ${pilot.weapons} weapon(s)`
      : `player entity is not a flyable ship — ${JSON.stringify(pilot)}`);

    // ── 4. HULL ──────────────────────────────────────────────────────────────────────────────
    // renderer.js links an entity to its 3D object via `e.mesh` / `e.view.root`. No mesh, or a
    // mesh with nothing renderable under it, is the "ship is invisible, only the plume shows"
    // symptom exactly.
    const hull = await page.evaluate(() => {
      const st = window.SF.state;
      const p = st.entities.get(st.playerId);
      if (!p) return { noPlayer: true };
      const root = p.mesh || (p.view && p.view.root) || null;
      if (!root) return { noRoot: true };
      let meshCount = 0, visibleMeshes = 0, inScene = false;
      root.traverse((o) => {
        if (o.isMesh) { meshCount++; if (o.visible) visibleMeshes++; }
      });
      for (let n = root; n; n = n.parent) if (n.isScene) { inScene = true; break; }
      return { noPlayer: false, noRoot: false, meshCount, visibleMeshes, inScene, rootVisible: !!root.visible };
    });
    const hullOk = !hull.noPlayer && !hull.noRoot && hull.inScene && hull.visibleMeshes > 0 && hull.rootVisible;
    record('HULL', hullOk, hullOk
      ? `ship mesh attached to the scene (${hull.visibleMeshes}/${hull.meshCount} visible)`
      : `the player's ship is NOT rendering — ${JSON.stringify(hull)}`);

    // ── 5. WORLD ─────────────────────────────────────────────────────────────────────────────
    const world = await page.evaluate(() => {
      const st = window.SF.state;
      let ships = 0, rocks = 0, stations = 0, total = 0;
      for (const e of st.entities.values()) {
        if (!e || !e.alive || e.id === st.playerId) continue;
        total++;
        if (e.type === 'ship') ships++;
        else if (e.type === 'asteroid') rocks++;
        else if (e.type === 'station') stations++;
      }
      return { total, ships, rocks, stations };
    });
    const worldOk = world.total > 0 && (world.ships + world.rocks + world.stations) > 0;
    record('WORLD', worldOk, worldOk
      ? `${world.total} entities (${world.ships} ships, ${world.rocks} rocks, ${world.stations} stations)`
      : `the sector is empty — ${JSON.stringify(world)}`);

    // ── 6. CONTROLS ──────────────────────────────────────────────────────────────────────────
    // Real key events through the real input layer. The owner's report was "the controls do
    // nothing", which no module-level test can see: input, sim and entity all have to agree.
    const control = await page.evaluate(() => {
      const st = window.SF.state;
      const p = st.entities.get(st.playerId);
      const v = p && p.vel ? p.vel : { x: 0, z: 0 };
      return { speed: Math.hypot(v.x || 0, v.z || 0), x: p ? p.pos.x : null, z: p ? p.pos.z : null };
    });
    await page.mouse.move(720, 450);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1600);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => {
      const st = window.SF.state;
      const p = st.entities.get(st.playerId);
      const v = p && p.vel ? p.vel : { x: 0, z: 0 };
      return { speed: Math.hypot(v.x || 0, v.z || 0), x: p ? p.pos.x : null, z: p ? p.pos.z : null };
    });
    const moved = Math.hypot((after.x ?? 0) - (control.x ?? 0), (after.z ?? 0) - (control.z ?? 0));
    // Either the ship gained speed or it physically moved. Both are proof input reached the sim;
    // requiring only one of them would be defeated by a governor that caps speed at a constant.
    const controlsOk = after.speed > control.speed + 0.5 || moved > 1;
    record('CONTROLS', controlsOk, controlsOk
      ? `thrust responded (speed ${control.speed.toFixed(1)} -> ${after.speed.toFixed(1)}, moved ${moved.toFixed(1)} wu)`
      : `holding thrust for 1.6s did NOTHING (speed ${control.speed.toFixed(2)} -> ${after.speed.toFixed(2)}, moved ${moved.toFixed(2)} wu)`);
  } else {
    for (const step of ['PILOT', 'HULL', 'WORLD', 'CONTROLS']) record(step, false, 'skipped (never reached flight)');
  }

  // ── 7. CLEAN ───────────────────────────────────────────────────────────────────────────────
  // One throw inside a per-frame update aborts the rest of that tick — which is how a single
  // stale call signature can blank the vitals, the roster AND the input in one go.
  const unique = [...new Set(pageErrors)];
  record('CLEAN', unique.length === 0, unique.length === 0
    ? 'no uncaught errors'
    : `${unique.length} uncaught error(s):\n      ` + unique.slice(0, 8).map((e) => e.slice(0, 220)).join('\n      '));

  // -- 8. ASSETS ------------------------------------------------------------------------------
  // Separate from CLEAN on purpose. A 404 is a different failure from a thrown exception, it needs
  // a URL to be actionable, and in this build a missing model has historically meant a corrupt
  // asset rather than a code bug -- a distinction worth keeping in the output.
  // Endpoints that are OPTIONAL BY CONTRACT. src/save/sharedPlayerStore.js states in its own
  // header that an absent store must never break anything, and server.js only mounts it when
  // SPACEFACE_PLAYER_STORE_DIR is set. Reporting a designed-optional 404 as a failure is how a
  // check earns a reputation for crying wolf and stops being run at all.
  const OPTIONAL_ROUTES = [/__spaceface_player_store/];
  const assets = [...new Set(missingAssets)].filter((a) => !OPTIONAL_ROUTES.some((re) => re.test(a)));
  record('ASSETS', assets.length === 0, assets.length === 0
    ? 'every request served'
    : assets.length + ' failed request(s):' + NLPAD + assets.slice(0, 10).join(NLPAD));

  const failed = results.filter((r) => !r.ok);
  console.log('');
  if (failed.length) {
    console.log(`GAME IS BROKEN — ${failed.length}/${results.length} checks failed: ${failed.map((f) => f.step).join(', ')}`);
    if (VERBOSE) console.log('\nfull results:\n' + JSON.stringify(results, null, 2));
    process.exitCode = 1;
  } else {
    console.log(`Game is playable — ${results.length}/${results.length} checks passed.`);
  }
} catch (err) {
  console.error('\ncheck-game-playable could not run:', err && err.stack || err);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill();
}
