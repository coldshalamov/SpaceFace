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
//   7b. SHADER   no shader compile/link error            (catches: a material drawing black)
//
// Run for affected boot/launch/live-hull/thrust/save-return claims at a coherent gameplay
// integration boundary, or to resolve a failed/conflicting route. Harmless docs/mechanical edits
// do not need a boot; owner tuning starts with focused tests/fixtures. A red route is a failure
// to handle, not proof that the latest edit caused it. See docs/VALIDATION_WORKFLOW.md.
//
//   node scripts/check-game-playable.mjs            # New Game route
//   node scripts/check-game-playable.mjs --circuit  # Temporary circuit, selected ship/drive
//   node scripts/check-game-playable.mjs --verbose  # also dump diagnostics on failure
//
// Deliberate non-goals: no screenshots, no pixel comparison, no golden files, no performance
// budget. Those belong to other checks. This checks basic route liveness, not every gameplay
// workflow, fun, appearance, or performance; choose an affected route for those claims.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { createIsolatedElectronLaunch, assertIsolatedElectronRootUrl } from './lib/electronTestIsolation.mjs';
import { installCspSafePlaywrightPolling } from './lib/playwrightCspPolling.mjs';
import { isExpectedNavigationTextureAbort } from './lib/browser-issues.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const requireCjs = createRequire(import.meta.url);

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VERBOSE = process.argv.includes('--verbose');
// --electron runs the SAME assertions through the route the player actually launches
// (SpaceFace-Desktop.bat -> scripts/launch-electron.mjs -> electron/main.cjs). The browser route
// passing proves nothing about it: Electron serves a different web root, enforces a strict CSP the
// dev server does not, and runs a real GPU. A green browser check while the desktop app was
// unplayable is exactly how this check earned its --electron mode.
const ELECTRON = process.argv.includes('--electron');
// --real-saves loads the PLAYER'S OWN save files into the isolated profile's localStorage and
// presses Continue on them. A save/load round trip inside one build proves the round trip; it
// says nothing about a save written by an OLDER build, which is the case that broke. Saves are
// READ ONLY here: they are copied into a throwaway profile, never opened for writing.
const REAL_SAVES = process.argv.includes('--real-saves');
const CIRCUIT = process.argv.includes('--circuit');
const PHYSICS_VENUE = process.argv.find(arg => arg.startsWith('--physics='))?.slice('--physics='.length);
const NO_ROUNDTRIP = CIRCUIT || !!PHYSICS_VENUE || process.argv.includes('--no-roundtrip');
// --player-profile launches Electron EXACTLY as SpaceFace-Desktop.bat does: the canonical port
// 41788, the player's own user-data directory, their real settings profile and their real GPU
// state. The isolated evidence profile differs in every one of those, so a green isolated run is
// not evidence about the app the player actually launches. Back up the save directory before using
// this: the running game autosaves into it.
const PLAYER_PROFILE = process.argv.includes('--player-profile');
// --sim-lane worker boots the game with ?simLane=worker — the whole authoritative
// sim runs in a module Worker and presentation consumes the wire journal
// (S1 stage-8 flip verification lane). Browser route only: the isolated
// Electron root-url contract requires a query-free URL, so the desktop route
// cannot forward the lane flag without main.cjs plumbing.
const SIM_LANE_ARG = (() => { const i = process.argv.indexOf('--sim-lane'); return i > 0 ? process.argv[i + 1] : null; })();
const SIM_LANE_QUERY = SIM_LANE_ARG ? `?simLane=${encodeURIComponent(SIM_LANE_ARG)}` : '';
const SLOT_ARG = (() => { const i = process.argv.indexOf('--slot'); return i > 0 ? process.argv[i + 1] : null; })();
const pw = await loadPlaywright();
const { chromium } = pw;

const results = [];
const NLPAD = String.fromCharCode(10) + '      ';
let server = null;
let browser = null;
let electronApp = null;
let electronLaunch = null;
let routeBaseUrl = '';
let report_realSaves = null;
// A page reload aborts in-flight requests too, so an ERR_ABORTED has to be attributable to a
// PHASE or the harness ends up blaming the game for its own navigation.
let phase = 'startup';
const pageErrors = [];
// Shader link/compile failures. three.js reports them through console.error (checkShaderErrors is on by
// default), so they already land in pageErrors and fail CLEAN; they get their own named step because a
// material that fails VALIDATE_STATUS draws black rather than throwing, and "CLEAN" does not say that.
// 2026-08-21: a GLSL function definition injected inside main() shipped for weeks because the only
// material carrying it was on an invisible collision hull and never compiled.
const shaderErrors = [];
const missingAssets = [];
const diagnostics = [];
const invisibleAuthoredShips = [];
const consoleWarningWork = [];

function record(step, ok, detail) {
  results.push({ step, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${step.padEnd(14)} ${detail}`);
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
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' },
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true,
  });
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
    const all = [...document.querySelectorAll('button')].filter(x =>
      x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden'
      && !x.disabled && x.getAttribute('aria-disabled') !== 'true');
    const b = all.find((x) => norm(x.textContent) === norm(wanted)) || all.find((x) => norm(x.textContent).includes(norm(wanted)));
    if (!b || b.disabled) return false;
    b.click();
    return true;
  }, label);
}

async function exerciseSaveScreen(page, { protectedSession = false } = {}) {
  await page.evaluate(() => {
    const slots = () => Object.keys(localStorage).filter(key => /^sf\.(save|recovery)\./.test(key))
      .sort().map(key => [key, localStorage.getItem(key)]);
    window.__playableSave = { before: JSON.stringify(slots()), completed: [], errors: [], refused: [], attempts: 0 };
    window.SF.bus.on('game:save', payload => { if (payload?.slot === 'quick') window.__playableSave.attempts++; });
    window.SF.bus.on('save:completed', payload => {
      if (payload?.slot === 'quick' && payload.reason === 'manual') window.__playableSave.completed.push(payload);
    });
    window.SF.bus.on('save:error', payload => {
      if (payload?.slot === 'quick') window.__playableSave.errors.push(payload);
    });
    window.SF.bus.on('toast', payload => {
      if (String(payload?.text || '').includes('campaign save slots are protected')) window.__playableSave.refused.push(payload.text);
    });
  });
  await page.keyboard.press('Escape');
  const pause = page.locator('[data-screen="pause"]');
  await pause.waitFor({ state: 'visible', timeout: 15000 });
  await pause.getByRole('button', { name: /^Save\b/ }).click();
  const saves = page.locator('[data-screen="saveLoad"]');
  await saves.waitFor({ state: 'visible', timeout: 15000 });
  await saves.locator('.sf-slot[data-id="quick"]').click();
  const overwrite = await page.evaluate(() => !!localStorage.getItem('sf.save.quick'));
  await saves.locator('button[data-action="save"]').click();
  if (overwrite) await page.getByRole('dialog', { name: 'Overwrite save?', exact: true })
    .getByRole('button', { name: 'Overwrite', exact: true }).click();
  try {
    await page.waitForFunction(() => {
      const result = window.__playableSave;
      return result.completed.length > 0 || result.errors.length > 0 || result.refused.length > 0;
    }, null, { timeout: 30000 });
  } catch (error) {
    const pending = await page.evaluate(() => ({ attempts: window.__playableSave.attempts,
      completed: window.__playableSave.completed.length, errors: window.__playableSave.errors,
      refused: window.__playableSave.refused, slotWritten: !!localStorage.getItem('sf.save.quick'),
      indexWritten: !!localStorage.getItem('sf.save.index'), mode: window.SF.state.mode,
      paused: window.SF.state.ui?.paused, save: window.SF.state.save,
      lane: window.SF.simLaneDiag?.() }));
    throw new Error(`Save UI receipt timed out: ${JSON.stringify(pending)} (${error.message})`);
  }
  const result = await page.evaluate(() => {
    const result = window.__playableSave;
    const after = Object.keys(localStorage).filter(key => /^sf\.(save|recovery)\./.test(key))
      .sort().map(key => [key, localStorage.getItem(key)]);
    const receipt = result.completed.at(-1);
    const index = JSON.parse(localStorage.getItem('sf.save.index') || '{}');
    return { attempts: result.attempts, saved: receipt?.ok === true && !!localStorage.getItem('sf.save.quick') && !!index.quick,
      completed: result.completed.length, errors: result.errors, refused: result.refused,
      slotsUnchanged: result.before === JSON.stringify(after) };
  });
  if (protectedSession) {
    await page.keyboard.press('Escape');
    await saves.waitFor({ state: 'hidden', timeout: 15000 });
    await page.keyboard.press('Escape');
    await pause.waitFor({ state: 'hidden', timeout: 15000 });
  }
  return result;
}

// Read the player's real saves off disk (READ ONLY) and hand back the localStorage pairs the game
// expects. Filenames map 1:1 to keys: sf.save.quick.json -> 'sf.save.quick' (saveSystem.js:48).
// Only sf.save.* is taken: recovery blobs and the settings profile are not part of the load path.
function readRealSaves(slotFilter) {
  const { resolvePlayerSaveDir } = requireCjs('./lib/playerSaveStore.cjs');
  const dir = resolvePlayerSaveDir(process.env);
  const pairs = {};
  const slots = [];
  for (const file of readdirSync(dir)) {
    if (!file.startsWith('sf.save.') || !file.endsWith('.json')) continue;
    const key = file.slice(0, -'.json'.length);
    const slot = key.slice('sf.save.'.length);
    if (slot !== 'index' && slotFilter && slot !== slotFilter) continue;
    pairs[key] = readFileSync(dir + '/' + file, 'utf8');
    if (slot !== 'index') slots.push(slot);
  }
  // When one slot is requested, the index must be trimmed to it or Continue picks the newest by
  // savedAt and quietly tests a different save than the one asked for.
  if (slotFilter && pairs['sf.save.index']) {
    try {
      const idx = JSON.parse(pairs['sf.save.index']);
      pairs['sf.save.index'] = JSON.stringify(idx[slotFilter] ? { [slotFilter]: idx[slotFilter] } : idx);
    } catch (_) {}
  }
  return { dir, pairs, slots };
}

// Bring up whichever route was asked for. Everything downstream is route-agnostic on purpose:
// the assertions are the contract, and they must be identical on both routes or a green browser
// run tells you nothing about the desktop app the player actually launches.
async function openBrowserRoute() {
  server = await startServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  return { page, baseUrl: server.baseUrl };
}

async function openElectronRoute() {
  const { _electron: electron } = pw;
  if (!electron) throw new Error('this Playwright build has no _electron; cannot drive the desktop route');
  // Isolated evidence profile: a second NON-isolated Electron shares the player's real save
  // directory and can autosave over their game. Never point this check at the live profile.
  if (PLAYER_PROFILE) {
    const env = { ...process.env };
    for (const key of ['SPACEFACE_ELECTRON_TEST_MODE', 'SPACEFACE_ELECTRON_TEST_PORT',
      'SPACEFACE_ELECTRON_TEST_USER_DATA', 'SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION']) delete env[key];
    electronLaunch = { options: { args: ['.'], cwd: ROOT, timeout: 180_000, env }, cleanup: () => true };
  } else {
    electronLaunch = createIsolatedElectronLaunch({
      root: ROOT,
      taskId: 'playable',
      timeout: 180_000,
      baseEnv: { ...process.env, SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION: '1' },
    });
  }
  electronApp = await electron.launch(electronLaunch.options);
  const page = await electronApp.firstWindow({ timeout: 180_000 });
  // Electron's CSP blocks Playwright's default injected polling, so waitForFunction never
  // resolves without it. That timeout would look exactly like a game hang and be a harness bug.
  installCspSafePlaywrightPolling(page);
  // Foreground the window. A backgrounded Chromium throttles timers and rAF, which can blow an
  // asset-preload budget and look exactly like a real load failure -- the harness must not
  // manufacture the bug it is hunting.
  try {
    const bw = await electronApp.browserWindow(page);
    await bw.evaluate((win) => { win.show(); win.focus(); if (win.moveTop) win.moveTop(); });
  } catch (_) {}
  await page.bringToFront().catch(() => {});
  await page.waitForLoadState('domcontentloaded', { timeout: 180_000 });
  if (!PLAYER_PROFILE) assertIsolatedElectronRootUrl(page.url());
  return { page, baseUrl: new URL(page.url()).origin + '/' };
}

if (ELECTRON && SIM_LANE_ARG) {
  console.error('  --sim-lane cannot run on the Electron route: the isolated root URL must be query-free.');
  console.error('  Run the browser lane: node scripts/check-game-playable.mjs --sim-lane ' + SIM_LANE_ARG);
  process.exit(2);
}

try {
  console.log('\nSpaceFace — playable check' + (SIM_LANE_ARG ? ` (simLane=${SIM_LANE_ARG})` : '') + '\n');
  const opened = ELECTRON ? await openElectronRoute() : await openBrowserRoute();
  const page = opened.page;
  routeBaseUrl = opened.baseUrl;
  page.on('pageerror', (err) => pageErrors.push(`[${phase}] ${String(err && err.message || err)}`));
  page.on('console', (m) => {
    // "Failed to load resource: 404" with no URL is not actionable, and the console event does not
    // carry one. The response listener below does, so drop the useless twin.
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/Failed to load resource/i.test(text)) return;
    if (/THREE\.WebGLProgram: Shader Error|VALIDATE_STATUS\s+false|ERROR: 0:\d+:/i.test(text)) shaderErrors.push(`[${phase}] ` + text.slice(0, 400));
    // Chromium aborts embedded GLB image requests when this harness deliberately destroys the
    // outgoing document. GLTFLoader logs those navigation cancellations before rejecting them;
    // the request listener below retains the matching ERR_ABORTED receipt. They are not errors in
    // the replacement game instance and must not contaminate its CLEAN result.
    if (isExpectedNavigationTextureAbort(text, phase)) return;
    pageErrors.push(`[${phase}] console.error: ` + text.slice(0, 300));
  });
  // Warnings carry the diagnosis for asset-preload failures ("authored part library was not
  // preloaded", KTX2/decoder complaints). They are not failures, but without them a preload timeout
  // is a symptom with no cause attached.
  page.on('console', (m) => {
    if (m.type() !== 'warning') return;
    const t = m.text();
    const isWholeShipLoaderMiss = /Loaded whole-ship hull records:|did not pass the live authored-asset loader|release mode requires \S*wholeships\//i.test(t);
    const isAuthoredFailClosed = /authored composition failed; no substitute visual published/i.test(t);
    // Fail only the missing-required-whole-ship class. Other fail-closed authored errors stay
    // diagnostics so a pipeline-admission stall cannot masquerade as this hull-record bug.
    if (isWholeShipLoaderMiss || isAuthoredFailClosed) {
      consoleWarningWork.push((async () => {
        let full = t;
        try {
          const parts = [];
          for (const arg of m.args()) {
            parts.push(await arg.evaluate((value) => (
              value instanceof Error ? value.message : String(value)
            )));
          }
          if (parts.length) full = parts.join('\n');
        } catch (_) { /* truncated Playwright text is still enough to classify the warning */ }
        const wholeShipMiss = /Loaded whole-ship hull records:|did not pass the live authored-asset loader|release mode requires \S*wholeships\//i.test(full);
        if (wholeShipMiss) {
          invisibleAuthoredShips.push(full);
          diagnostics.push('INVISIBLE SHIP: ' + full);
        } else {
          diagnostics.push('warn: ' + full.slice(0, 260));
        }
      })());
      return;
    }
    if (/authored|part library|asset|ktx|basis|decoder|preload|GPU|WebGL/i.test(t)) diagnostics.push('warn: ' + t.slice(0, 260));
  });
  page.on('response', (res) => {
    if (res.status() >= 400) missingAssets.push('[' + phase + '] ' + res.status() + ' ' + res.url().replace(routeBaseUrl, '/'));
  });
  page.on('requestfailed', (req) => {
    const f = req.failure();
    missingAssets.push('[' + phase + '] ' + ((f && f.errorText) || 'failed') + ' ' + req.url().replace(routeBaseUrl, '/'));
  });

  // ── 1. BOOT ────────────────────────────────────────────────────────────────────────────────
  // Freezing here is the owner-reported "stuck on the loading screen". A timeout IS the finding.
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  if (REAL_SAVES) {
    const real = readRealSaves(SLOT_ARG);
    const versions = {};
    for (const [k, v] of Object.entries(real.pairs)) {
      if (k === 'sf.save.index') continue;
      try { versions[k.slice(8)] = (JSON.parse(v).meta || {}).version ?? (JSON.parse(v).version ?? '?'); } catch (_) { versions[k.slice(8)] = 'unparseable'; }
    }
    // addInitScript alone is not enough on the desktop route: Electron hands back a page that has
    // ALREADY loaded, and init scripts only apply to later navigations. Write the keys directly
    // into the live page as well, then reload so the menu re-reads the save index.
    await page.addInitScript((pairs) => {
      try { for (const [k, v] of Object.entries(pairs)) localStorage.setItem(k, v); } catch (_) {}
    }, real.pairs);
    const wrote = await page.evaluate((pairs) => {
      try {
        for (const [k, v] of Object.entries(pairs)) localStorage.setItem(k, v);
        return Object.keys(pairs).filter((k) => localStorage.getItem(k)).length;
      } catch (err) { return 'error: ' + err.message; }
    }, real.pairs);
    console.log('  localStorage keys written: ' + wrote + ' of ' + Object.keys(real.pairs).length);
    phase = 'harness-reload';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 60000 });
    phase = 'menu';
    console.log('  real saves injected from ' + real.dir);
    console.log('  slots: ' + real.slots.join(', ') + '   versions: ' + JSON.stringify(versions));
    report_realSaves = { dir: real.dir, slots: real.slots, versions };
  }
  if (!ELECTRON) {
    // Transport budget, not an assertion: DCL waits on the whole ~1200-request static module
    // graph. Measured 14s on a quiet box, 110s+ while the ladder's own parallel checks saturate
    // the CPU (per-request wall time then starves in the renderer, not the network — the server
    // answers a 1.4MB file in 170ms while the box is pinned). 180s matches the budget this file
    // already grants the desktop route's waitForLoadState below; a real hang still fails here.
    await page.goto(routeBaseUrl + SIM_LANE_QUERY, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  } else {
    // The desktop route boots itself and may raise the cinematic splash, which swallows a scripted
    // .click(). A real key press is the only thing that dismisses it.
    const splash = page.locator('#cinematic-splash');
    if (await splash.isVisible().catch(() => false)) {
      await page.keyboard.press('Space');
      await splash.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    }
  }
  let bootOk = true;
  const menuWaitStarted = Date.now();
  try {
    await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 60000 });
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-screen="mainMenu"]');
      return el && getComputedStyle(el).display !== 'none';
    }, null, { timeout: 60000 });
    record('BOOT', true, `main menu reached after ${((Date.now() - menuWaitStarted) / 1000).toFixed(1)}s`);
  } catch (err) {
    bootOk = false;
    const stuck = await page.evaluate(() => ({
      sf: !!window.SF,
      overlay: (() => { const o = document.getElementById('boot-overlay') || document.querySelector('.sf-loading, #sf-loading'); return o ? getComputedStyle(o).display : '(none found)'; })(),
      screens: [...document.querySelectorAll('[data-screen]')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.dataset.screen),
    })).catch(() => null);
    record('BOOT', false, `never reached the main menu within its 60s readiness budget — ${JSON.stringify(stuck)}`);
  }

  // ── 2. LAUNCH ──────────────────────────────────────────────────────────────────────────────
  phase = 'launch';
  let inFlight = false;
  if (bootOk) {
    try {
      await page.evaluate(() => {
        window.__playableStart = {};
        // Stage-9 remediation proof: exactly-once game:started on the main bus.
        // The worker lane generates the receipt inside the worker — a count>1
        // means a duplicated replay/emit, 0 on a new game means the receipt
        // never bridged back to main-side subscribers.
        window.__gameStartedCount = 0;
        window.__playableRacingSession = false;
        window.SF.bus.on('game:new', opts => { window.__playableRacingSession = opts?.racingSession === true; });
        window.SF.bus.on('game:started', () => { window.__gameStartedCount += 1; });
        window.SF.bus.on('game:loadingProgress', stage => { window.__playableStart.stage = stage; });
        window.SF.bus.on('game:startFailed', error => { window.__playableStart.error = error; });
      });
      if (REAL_SAVES) {
        // Straight onto the load path — this is what the player was doing when it broke.
        if (!(await clickButton(page, 'Continue'))) throw new Error('Continue button absent or disabled with real saves present');
      } else if (PHYSICS_VENUE) {
        if (!['gallery', 'league'].includes(PHYSICS_VENUE)) throw new Error('unknown physics venue');
        await page.locator('[data-screen="mainMenu"] [data-action="physics"]').click({ timeout: 60000 });
        await page.locator('[data-screen="physicsVenues"] .race-board-course button')
          .nth(PHYSICS_VENUE === 'gallery' ? 0 : 1).click();
        await page.getByRole('dialog', { name: 'Launch a physics challenge?', exact: true })
          .getByRole('button', { name: 'Launch', exact: true }).click();
      } else if (CIRCUIT) {
        await page.locator('[data-screen="mainMenu"] [data-action="circuits"]').click({ timeout: 60000 });
        await page.getByRole('combobox', { name: 'Circuit ship', exact: true }).selectOption('starter_wasp');
        await page.getByRole('combobox', { name: 'Circuit drive', exact: true }).selectOption('sprint');
        await page.getByRole('button', { name: 'Practice: overhead', exact: true }).click();
        await page.locator('.race-board-launch').first().click();
        await page.getByRole('button', { name: 'Launch circuit', exact: true }).click();
      } else {
        if (!(await clickButton(page, 'New Game'))) throw new Error('no New Game button');
        await page.waitForTimeout(400);
        if (!(await clickButton(page, 'Launch'))) throw new Error('no Launch button');
      }
      await page.waitForFunction(() => {
        const st = window.SF.state;
        return st && st.mode === 'flight';
      }, null, { timeout: 180000 });
      await page.waitForTimeout(2500);   // let the first sector settle
      inFlight = true;
      phase = 'flight';
      record('LAUNCH', true, 'flight mode entered');
      if (PHYSICS_VENUE) {
        await page.waitForFunction(kind => window.SF.state.physicsVenuePublic?.active
          && window.SF.state.physicsVenuePublic.kind === kind, PHYSICS_VENUE, { timeout: 15000 });
        const venue = await page.evaluate(() => {
          const st = window.SF.state;
          return { view: st.physicsVenuePublic,
            ownedBodies: st.entityList.filter(entity => entity.alive !== false && entity.data?.physicsVenueId).length,
            inputOwner: st.physicsVenuePublic?.kind };
        });
        record('PHYSICS', venue.ownedBodies > 0 && !!venue.view.instruction,
          `public ${venue.inputOwner} flight: ${venue.ownedBodies} real bodies; ${venue.view.title}`);
      }
    } catch (err) {
      const detail = await page.evaluate(async (verbose) => {
        const state = window.SF?.state;
        const detail = {
          mode: state?.mode,
          start: window.__playableStart,
          screens: [...document.querySelectorAll('[data-screen]')]
            .filter(e => getComputedStyle(e).display !== 'none').map(e => e.dataset.screen),
          lane: window.SF?.simLaneDiag?.() || window.SF?.laneDiag || null,
        };
        if (!verbose || !state) return detail;
        const { authoredCriticalVisualReadiness, describeAuthoredUpgradeQueue } =
          await import('/src/render/partsLibrary.js');
        detail.readiness = authoredCriticalVisualReadiness(state);
        const scene = state.render?.scene;
        detail.queue = describeAuthoredUpgradeQueue(scene);
        detail.jobs = scene?.userData?.authoredUpgradeDiagnostics?.jobs || [];
        detail.critical = [detail.readiness.playerId, detail.readiness.startingHubId]
          .map((id) => {
            const entity = state.entities.get(id);
            const data = entity?.mesh?.userData || {};
            return { id, name: entity?.mesh?.name,
              status: data.authoredAssetState, failure: data.authoredFailureReason,
              readmission: data.authoredReadmissionReason, phase: data.authoredPreparePhase,
              upgrading: !!data.authoredUpgradePromise };
          });
        return detail;
      }, VERBOSE).catch(() => null);
      record('LAUNCH', false, `never entered flight — ${err.message} — ${JSON.stringify(detail)}`);
    }
  } else {
    record('LAUNCH', false, 'skipped (boot failed)');
  }

  // Hoisted so the SAME assertions can run twice: once on a New Game, and again after a real
  // save/load round trip. New Game was the only path anything tested, and the reported failure
  // was on a loaded save — a frame with no onboarding card and no mission tracker.
  async function assertPlayable(page, tag = '') {
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
    record('PILOT' + tag, pilotOk, pilotOk
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
    record('HULL' + tag, hullOk, hullOk
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
    record('WORLD' + tag, worldOk, worldOk
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
    record('CONTROLS' + tag, controlsOk, controlsOk
      ? `thrust responded (speed ${control.speed.toFixed(1)} -> ${after.speed.toFixed(1)}, moved ${moved.toFixed(1)} wu)`
      : `holding thrust for 1.6s did NOTHING (speed ${control.speed.toFixed(2)} -> ${after.speed.toFixed(2)}, moved ${moved.toFixed(2)} wu)`);

    // ── 6b. LANE-FWD (worker lane only) ──────────────────────────────────────────────────────
    // Stage 9: the main→sim bus forward set is census-driven (~108 types). Emitting on the
    // main-side bus must reach worker subscribers: a pos-typed ui:setCourse lands a mirrored
    // nav.waypoint and the worker's own nav:waypoint receipt bridges back; settings:changed
    // drives _writeProfileSettings in the worker whose localStorage write rides the storageOps
    // relay; a sector-typed setCourse + nav:engageRoute exercises the route executor.
    // Keyed off the live lane (simLaneDiag installs only under the worker runtime), so the
    // Stage-E default flip keeps this gate armed on bare runs too.
    const laneLive = await page.evaluate(() =>
      !!(window.SF && typeof window.SF.simLaneDiag === 'function'));
    if (SIM_LANE_ARG === 'worker' || laneLive) {
      try {
        await page.evaluate(() => {
          window.__laneFwdReceipts = { waypoint: 0, probe: 0, denied: 0, routeResponses: [], awaitingRoute: false };
          // The bridged nav:waypoint replay carries the worker's own emit; the
          // tracked mission re-owns nav.waypoint each tick, so match OUR emit by
          // reason+pos on the receipt rather than on state.nav.waypoint.
          window.SF.bus.on('nav:waypoint', (w) => {
            window.__laneFwdReceipts.waypoint++;
            if (w && w.reason === 'laneFwdCheck') window.__laneFwdReceipts.probe++;
          });
          window.SF.bus.on('nav:routeExecutorDenied', payload => {
            if (window.__laneFwdReceipts.awaitingRoute && payload?.reason) window.__laneFwdReceipts.denied++;
          });
          window.SF.bus.on('nav:routeExecutor', payload => {
            if (window.__laneFwdReceipts.awaitingRoute) window.__laneFwdReceipts.routeResponses.push(payload);
          });
          const st = window.SF.state;
          const p = st.entities.get(st.playerId);
          const pos = { x: (p ? p.pos.x : 0) + 4000, y: 0, z: (p ? p.pos.z : 0) + 4000 };
          window.SF.bus.emit('ui:setCourse', { pos, label: 'LANEPROBE', reason: 'laneFwdCheck' });
        });
        await page.waitForTimeout(900);
        const fwd = await page.evaluate(() => {
          const st = window.SF.state;
          const wp = st.nav && st.nav.waypoint;
          // settings:changed -> worker saveSystem._writeProfileSettings -> storageOps relay.
          window.SF.bus.emit('settings:changed', { section: 'playable', key: 'laneProbe' });
          const sid = st.world && st.world.currentSectorId;
          const sector = sid && st.world.sectors && st.world.sectors[sid];
          const hop = sector && Array.isArray(sector.neighbors)
            ? sector.neighbors.find((n) => st.world.discovery && st.world.discovery[n] && st.world.discovery[n].discovered)
            : null;
          return {
            waypointLabel: wp && wp.label,
            waypointReceipts: window.__laneFwdReceipts.waypoint,
            probeReceipts: window.__laneFwdReceipts.probe,
            hopSectorId: hop || null,
          };
        });
        await page.waitForTimeout(900);
        const fwd2 = await page.evaluate((hop) => {
          const st = window.SF.state;
          const profile = localStorage.getItem('sf.settings.profile.v1');
          let route = null;
          if (hop) {
            window.SF.bus.emit('ui:setCourse', { sectorId: hop, reason: 'laneFwdCheck' });
          }
          return { profileWritten: !!profile, hop };
        }, fwd.hopSectorId);
        await page.waitForTimeout(900);
        const fwd3 = await page.evaluate(() => {
          const st = window.SF.state;
          const route = st.nav && st.nav.route;
          let engaged = null;
          if (route && Array.isArray(route.legs) && route.legs.length) {
            window.__laneFwdReceipts.awaitingRoute = true;
            window.__laneFwdReceipts.routeResponses.length = 0;
            window.__laneFwdReceipts.denied = 0;
            window.SF.bus.emit('nav:engageRoute', {});
            engaged = 'sent';
          } else {
            engaged = 'no-route';
          }
          return { hasRoute: !!engaged && engaged === 'sent', engaged };
        });
        await page.waitForTimeout(900);
        const fwd4 = await page.evaluate(async () => {
          const st = window.SF.state;
          const diag = (window.SF.simLaneDiag && window.SF.simLaneDiag()) || {};
          // Worker-side ground truth: how many times the worker emitted
          // game:started (staged by newGameBoot, consumed at the post-boot
          // 'flight' apply). 1 = receipt fired once; 0 = never; >1 = duplicate.
          let workerGameStarted = null;
          try {
            const probe = window.SF.laneRpc && await window.SF.laneRpc('probeState', {});
            workerGameStarted = probe && probe.result ? probe.result.gameStartedEmits : null;
          } catch (_) { workerGameStarted = null; }
          return {
            executor: window.__laneFwdReceipts.routeResponses.some(response =>
              ['engaged', 'resumed'].includes(response?.transition))
              && ((st.nav?.executor?.engaged === true
                && ['acquiring', 'transiting', 'approaching'].includes(st.nav.executor.status))
                || window.__laneFwdReceipts.routeResponses.some(response =>
                  ['interrupted', 'arrived'].includes(response?.transition) && !!response.reason)),
            executorStatus: st.nav?.executor?.status, executorInterruptReason: st.nav?.executor?.interruptReason,
            routeResponses: window.__laneFwdReceipts.routeResponses,
            denied: window.__laneFwdReceipts.denied,
            unforwarded: diag.unforwardedEmitCount ?? null,
            unforwardedTypes: diag.unforwardedEmitTypes || null,
            gameStartedMain: window.__gameStartedCount,
            gameStartedWorker: workerGameStarted,
          };
        });
        // ui:setCourse crossed the lane iff the worker's own nav:waypoint receipt
        // (marked by our reason) bridged back — tracked missions legitimately
        // re-own state.nav.waypoint every tick, so the receipt is the proof.
        const courseOk = fwd.probeReceipts > 0 && fwd.waypointReceipts > 0;
        const settingsOk = fwd2.profileWritten === true;
        const routeOk = fwd3.engaged === 'no-route'
          || fwd4.executor === true || fwd4.denied > 0;
        const unforwardedForProbe = fwd4.unforwardedTypes
          ? ['ui:setCourse', 'settings:changed', 'nav:engageRoute'].filter((t) => t in fwd4.unforwardedTypes)
          : [];
        // Stage-9 remediation gates:
        //  (a) unforwardedEmitCount === 0 — an emit whose type escapes BOTH the
        //      forward set and KNOWN_UNFORWARDED fails loudly instead of
        //      dead-ending at the lane boundary.
        //  (b) game:started exactly once on BOTH lanes — the worker emits the
        //      receipt once post-boot (gameStartedWorker === 1 after a new
        //      game, === 0 after a save restore / ~LOAD pass) and its bridged
        //      replay fires main-side subscribers exactly once (never duplicated).
        const expectWorkerStarted = tag === '~LOAD' || REAL_SAVES ? 0 : 1;
        const coverageOk = fwd4.unforwarded === 0;
        const startedOk = fwd4.gameStartedWorker === expectWorkerStarted
          && fwd4.gameStartedMain === expectWorkerStarted;
        const ok = courseOk && settingsOk && routeOk && unforwardedForProbe.length === 0
          && coverageOk && startedOk;
        record('LANE-FWD' + tag, ok, ok
          ? `ui:setCourse -> nav.waypoint (${fwd.waypointReceipts} receipt), settings:changed -> profile write, engage=${fwd3.engaged}${fwd4.executor ? '/executor' : fwd4.denied ? '/denied' : ''}, unfwd=0, game:started=${fwd4.gameStartedWorker}/w+${fwd4.gameStartedMain}/m`
          : `waypoint=${JSON.stringify(fwd.waypointLabel)} receipts=${fwd.waypointReceipts} probeReceipts=${fwd.probeReceipts} profile=${fwd2.profileWritten} route=${fwd3.engaged} exec=${fwd4.executor} status=${fwd4.executorStatus} reason=${fwd4.executorInterruptReason} responses=${JSON.stringify(fwd4.routeResponses)} denied=${fwd4.denied} unfwd=${fwd4.unforwarded}/${JSON.stringify(unforwardedForProbe)} types=${JSON.stringify(fwd4.unforwardedTypes)} started w=${fwd4.gameStartedWorker} m=${fwd4.gameStartedMain}`);
      } catch (err) {
        record('LANE-FWD' + tag, false, 'forwarded-surface exercise threw: ' + err.message);
      }
    }
  }

  if (inFlight) {
    if (CIRCUIT) {
      const circuit = await page.evaluate(() => {
        const st = window.SF.state, ship = st.player.ownedShips[st.player.activeShipIndex || 0];
        const race = st.missions.active.find(m => m.status === 'active' && m.params?.racingContractId);
        return { hull:ship?.defId, sprint:ship?.fittings?.includes('mod_engine_sprint_m'),
          course:race?.params?.courseId, view:st.settings.gameplay.steeringView,
          temporarySession:window.__playableRacingSession === true,
          onboardingActive:!!st.onboarding?.active, tutorialWaypoint:!!st.nav?.waypoint?.onboarding,
          tutorialActors:[...st.entities.values()].filter(e => e.alive !== false
            && (e.data?.onboarding || e.data?.onboardingTraining || e.data?.rescue)).length };
      });
      record('CIRCUIT', circuit.hull === 'ship_wasp' && circuit.sprint
        && circuit.course === 'circuit_helios_belt' && circuit.view === 'racing' && circuit.temporarySession
        && !circuit.onboardingActive && !circuit.tutorialWaypoint && circuit.tutorialActors === 0,
      JSON.stringify(circuit));
      // The race deliberately suppresses propulsion during its simulation-clock countdown.
      // Wait for the actual release before asking whether flight controls work.
      await page.waitForFunction(() => {
        const st = window.SF.state;
        return st.missions.active.every(m => m.status !== 'active' || !m.params?.racingContractId
          || !Number.isFinite(m.params.gridUntilSimS) || st.simTime >= m.params.gridUntilSimS);
      }, null, { timeout: 60000 });
    }
    await assertPlayable(page);
    if (PHYSICS_VENUE) {
      try {
        await page.waitForFunction(() => {
          const rows = window.SF.state.entityList.filter(entity => entity.alive !== false && entity.data?.physicsVenueId);
          return rows.length > 0 && rows.every(entity => entity.mesh?.parent && entity.mesh.visible);
        }, null, { timeout: 60000 });
        const bodies = await page.evaluate(() => window.SF.state.entityList
          .filter(entity => entity.alive !== false && entity.data?.physicsVenueId)
          .map(entity => ({ id: entity.id, key: entity.data.physicsVenueKey, mass: entity.mass,
            meshes: (() => { let count = 0; entity.mesh.traverse(node => { if (node.isMesh && node.visible) count++; }); return count; })() })));
        record('PHYSICS-RENDER', bodies.every(body => body.meshes > 0), `${bodies.length} venue bodies mounted: ${JSON.stringify(bodies)}`);
        await page.evaluate(kind => {
          window.__venueRetryReceipts = 0;
          window.SF.bus.on(`${kind === 'gallery' ? 'orbital-gallery' : 'kinetic-league'}:started`, () => { window.__venueRetryReceipts++; });
        }, PHYSICS_VENUE);
        await page.locator('#physics-venue-instrument').getByRole('button', { name: 'Retry', exact: true }).click();
        await page.waitForFunction(() => window.__venueRetryReceipts > 0 && window.SF.state.physicsVenuePublic?.active,
          null, { timeout: 15000 });
        record('PHYSICS-RETRY', true, 'HUD Retry received a fresh authoritative started receipt');
        await page.locator('#physics-venue-instrument').getByRole('button', { name: 'Leave event', exact: true }).click();
        await page.waitForFunction(() => window.SF.state.physicsVenuePublic?.active === false
          && !window.SF.state.entityList.some(entity => entity.alive !== false && entity.data?.physicsVenueId),
        null, { timeout: 15000 });
        record('PHYSICS-LEAVE', true, 'HUD Leave reached worker and removed owned venue bodies');
      } catch (error) {
        record('PHYSICS-LIFECYCLE', false, error.message);
      }
    }
    if (CIRCUIT) {
      await page.waitForFunction(() => {
        const st = window.SF.state;
        const rivals = [...st.entities.values()].filter(e => e.data?.raceOpponent);
        return rivals.length === 2 && rivals.every(e => e.mesh?.parent && e.mesh.visible);
      }, null, { timeout: 60000 });
      const pack = await page.evaluate(() => {
        const st = window.SF.state;
        const race = st.missions.active.find(m => m.status === 'active' && m.params?.racingContractId);
        return { mode: race?.params.raceMode, entrants: race?.params.raceEntrants,
          anchors: [...st.entities.values()].filter(e => e.data?.raceSetPiece?.kind === 'anchor'
            && e.alive !== false && e.collides !== false).length,
          rivals: [...st.entities.values()].filter(e => e.data?.raceOpponent).map(e => ({
            name: e.data.name, speed: Math.hypot(e.vel?.x || 0, e.vel?.z || 0),
            assetState: e.mesh?.userData?.authoredAssetState, visible: !!e.mesh?.visible,
            renderedMeshes: (() => { let n = 0; e.mesh?.traverse(o => { if (o.isMesh && o.visible) n++; }); return n; })(),
          })) };
      });
      record('RIVALS', pack.mode === 'race' && pack.entrants === 3 && pack.rivals.length === 2 && pack.anchors === 2
        && pack.rivals.every(rival => rival.visible && rival.renderedMeshes > 0 && rival.speed > 1), JSON.stringify(pack));
      try {
        const refusal = await exerciseSaveScreen(page, { protectedSession: true });
        record('CIRCUIT-SAVE', refusal.attempts > 0 && refusal.refused.length > 0
          && refusal.completed === 0 && !refusal.saved && refusal.errors.length === 0 && refusal.slotsUnchanged,
        JSON.stringify(refusal));
      } catch (error) { record('CIRCUIT-SAVE', false, error.message); }
    }

    // -- 9-12. THE CONTINUE ROUND TRIP -------------------------------------------------------
    // Save, restart the page, load it back, and re-run every playability assertion. This is the
    // path a returning player is on and it was completely untested: the reported broken frame had
    // no onboarding card and no mission tracker, which is a LOADED save, not a new game. A check
    // that only ever presses New Game cannot see a load-path regression at all.
    // The round trip already happened on the way IN when booting from a real save, so re-saving
    // would only re-prove it and would write a throwaway slot for no information.
    let saved = false;
    let roundTrip = !REAL_SAVES && !NO_ROUNDTRIP;
    if (roundTrip) try {
      const save = await exerciseSaveScreen(page);
      saved = save.saved && save.errors.length === 0 && save.refused.length === 0;
      record('SAVE', saved, saved ? 'Save screen wrote the quick slot with an authoritative completed receipt'
        : `Save screen did not complete: ${JSON.stringify(save)}`);
    } catch (err) {
      record('SAVE', false, 'saving threw: ' + err.message);
    }

    if (roundTrip && saved) {
      let loaded = false;
      // Declared outside the try: the catch below names the stage the load died in.
      let continueStage = 'harness-reload';
      try {
        // Name the sub-stage in the failure line. A bare "did not return to flight" cannot
        // distinguish "the reloaded page never evaluated its module graph (window.SF absent)"
        // from "Continue's own load gates never released" — the 2026-09-30 capture was the
        // first kind and sat unconfirmed because the error did not say where it died.
        phase = 'harness-reload';
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 });
        continueStage = 'boot-graph (window.SF)';
        await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 60000 });
        continueStage = 'main-menu';
        await page.waitForFunction(() => {
          const el = document.querySelector('[data-screen="mainMenu"]');
          return el && getComputedStyle(el).display !== 'none';
        }, null, { timeout: 60000 });
        phase = 'menu';
        // Stage-9 remediation: a stray game:started on the restore path is the
        // crash class the worker-side receipt replaced — count any emit here
        // (must stay 0) before pressing Continue.
        await page.evaluate(() => {
          window.__gameStartedCount = 0;
          window.SF.bus.on('game:started', () => { window.__gameStartedCount += 1; });
        });
        // Press the real Continue button. mainMenu.js:254 reads the save index and emits
        // game:load with the latest slot; firing the event directly would skip the index lookup,
        // which is itself a place this can break.
        continueStage = 'continue-click';
        const clicked = await clickButton(page, 'Continue');
        if (!clicked) throw new Error('Continue button absent or disabled after saving');
        phase = 'launch';
        continueStage = 'load-gates→flight';
        await page.waitForFunction(() => {
          const st = window.SF.state;
          const p = st && st.entities && st.entities.get(st.playerId);
          return !!(st && st.mode === 'flight' && p && p.alive);
        }, null, { timeout: 120000 });
        continueStage = 'sim-resume';
        // mode flips ahead of the tick loop on the worker lane: the 'flight' mode
        // descriptor lands, then the host's tick cadence re-arms a beat later. A key
        // down+up landing entirely inside that gap is swallowed (held toggles with no
        // tick sampling it) — wait for the tick counter itself to advance so the
        // CONTROLS probe can never be swallowed by the resume window.
        const tickAtFlight = await page.evaluate(() => window.SF.state.tick);
        await page.waitForFunction((t0) => {
          const st = window.SF.state;
          return st && Number.isFinite(st.tick) && st.tick > t0;
        }, tickAtFlight, { timeout: 30000 });
        await page.waitForTimeout(3000);
        phase = 'flight';
        loaded = true;
        record('CONTINUE', true, 'loaded the save back into flight');
      } catch (err) {
        record('CONTINUE', false, `Continue did not return to flight (stage: ${continueStage}): ` + err.message);
      }
      if (loaded) await assertPlayable(page, '~LOAD');
      else for (const step of ['PILOT', 'HULL', 'WORLD', 'CONTROLS']) record(step + '~LOAD', false, 'skipped (Continue failed)');
    } else if (roundTrip) {
      for (const step of ['CONTINUE', 'PILOT~LOAD', 'HULL~LOAD', 'WORLD~LOAD', 'CONTROLS~LOAD']) record(step, false, 'skipped (save failed)');
    }
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
  // ── 7b. SHADER ─────────────────────────────────────────────────────────────────────────────
  // A program that fails to link is a console.error, not an exception: the mesh draws black and the
  // frame keeps running. Named separately so the failure reads as what it is, not as "CLEAN".
  const uniqueShader = [...new Set(shaderErrors)];
  record('SHADER', uniqueShader.length === 0, uniqueShader.length === 0
    ? 'no shader compile/link errors'
    : `${uniqueShader.length} shader error(s):\n      ` + uniqueShader.slice(0, 4).map((e) => e.slice(0, 300)).join('\n      '));
  const openingFailure = await page.evaluate(() => {
    const value = window.SF?.state?.render?.openingSubmissionPreSubmitValidation;
    if (!value || value.ok === true) return null;
    const geometryIds = new Set(value.uncapturedGeometryBufferIds || []);
    const textureIds = new Set(value.uncapturedTextureIds || []);
    const geometryOwners = [];
    const textureOwners = [];
    const instancedPbrCandidates = [];
    const renderSystem = window.SF?.registry?.get?.('render');
    const entityRoots = new Map();
    for (const [id, root] of renderSystem?._meshes || []) {
      if (root) entityRoots.set(root, String(id));
    }
    const plannedLeaves = new Set(
      window.SF?.state?.render?.openingSubmissionPlan?.compileSubjects || [],
    );
    const baselineProgramKeys = window.SF?.state?.render?.openingSubmissionReceipt
      ?.before?.programCacheKeys || [];
    const describeOwner = (object) => {
      let root = object;
      while (root?.parent && !entityRoots.has(root)) root = root.parent;
      const entityId = entityRoots.get(root) || null;
      let planned = false;
      for (let cursor = object; cursor; cursor = cursor.parent) {
        if (plannedLeaves.has(cursor)) {
          planned = true;
          break;
        }
        if (cursor === root) break;
      }
      const objectName = object.name || object.type || 'Object3D';
      return entityId == null
        ? objectName
        : `${entityId}:${root.name || root.type || 'entity-root'}:${planned ? 'planned-leaf' : 'late-leaf'}:${objectName}`;
    };
    renderSystem?.scene?.traverse?.((object) => {
      const geometryId = object?.geometry?.uuid ? `uuid:${object.geometry.uuid}` : null;
      if (geometryId && geometryIds.has(geometryId)) {
        geometryOwners.push({ id: geometryId, object: describeOwner(object) });
      }
      const materials = Array.isArray(object?.material)
        ? object.material
        : object?.material ? [object.material] : [];
      if (object?.isInstancedMesh && materials.some((material) => (
        material?.isMeshStandardMaterial || material?.isMeshPhysicalMaterial
      ))) {
        instancedPbrCandidates.push({
          name: object.name || object.type || 'InstancedMesh',
          parent: object.parent?.name || object.parent?.type || null,
          count: object.count || 0,
          visible: object.visible !== false,
          instanceColor: !!object.instanceColor,
          planned: plannedLeaves.has(object),
          producer: object.userData?.openingSubmissionPackage?.producer || null,
          material: materials.map((material) => material?.type || 'Material'),
        });
      }
      for (const material of materials) {
        for (const [slot, texture] of Object.entries(material || {})) {
          const textureId = texture?.isTexture && texture.uuid ? `uuid:${texture.uuid}` : null;
          if (textureId && textureIds.has(textureId)) {
            textureOwners.push({ id: textureId, object: describeOwner(object), slot });
          }
        }
      }
    });
    const uniqueOwnerSummary = (values, keyFn) => {
      const counts = new Map();
      for (const value of values) {
        const key = keyFn(value);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      return [...counts.entries()]
        .map(([owner, count]) => ({ owner, count }))
        .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner))
        .slice(0, 24);
    };
    return {
      reason: value.reason || null,
      uncaptured: value.uncaptured || [],
      counts: {
        uncapturedPrograms: value.uncapturedProgramKeys?.length || 0,
        uncapturedGeometries: value.uncapturedGeometryBufferIds?.length || 0,
        uncapturedTextures: value.uncapturedTextureIds?.length || 0,
        uncapturedShadows: value.uncapturedShadowResourceIds?.length || 0,
        missingPrograms: value.missingProgramKeys?.length || 0,
        missingGeometries: value.missingGeometryBufferIds?.length || 0,
        missingTextures: value.missingTextureIds?.length || 0,
        missingShadows: value.missingShadowResourceIds?.length || 0,
      },
      geometryOwners: uniqueOwnerSummary(geometryOwners, (entry) => entry.object),
      textureOwners: uniqueOwnerSummary(textureOwners, (entry) => `${entry.object}.${entry.slot}`),
      instancedPbrCandidates: instancedPbrCandidates
        .sort((a, b) => Number(b.visible) - Number(a.visible)
          || b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, 48),
      firstDrawInstancedPbrCandidates:
        window.SF?.state?.render?.openingSubmissionLateInstancedPbr || [],
      lifecycle: {
        firstDrawSubmittedAt:
          window.SF?.state?.render?.openingSubmissionFirstDrawSubmittedAt ?? null,
        firstPlayableFrameAt: window.SF?.state?.render?.firstPlayableFrameAt ?? null,
        preSubmitOk:
          window.SF?.state?.render?.openingSubmissionPreSubmitValidation?.ok ?? null,
        validationOk: window.SF?.state?.render?.openingSubmissionValidation?.ok ?? null,
        graphFrozen: window.SF?.state?.render?.openingGraphPublicationFrozen ?? null,
      },
      baselineInstancedPbrProgramKeys: baselineProgramKeys.filter((key) => (
        String(key).startsWith('physical,STANDARD,')
        && /,(8388625|8388627),/.test(String(key))
      )).slice(0, 24),
      sampleUncapturedProgramKeys: (value.uncapturedProgramKeys || []).slice(0, 8),
      sampleMissingProgramKeys: (value.missingProgramKeys || []).slice(0, 8),
    };
  }).catch(() => null);
  if (openingFailure) diagnostics.push(`opening submission: ${JSON.stringify(openingFailure)}`);

  // -- 8. ASSETS ------------------------------------------------------------------------------
  // Separate from CLEAN on purpose. A 404 is a different failure from a thrown exception, it needs
  // a URL to be actionable, and in this build a missing model has historically meant a corrupt
  // asset rather than a code bug -- a distinction worth keeping in the output.
  // Endpoints that are OPTIONAL BY CONTRACT. src/save/sharedPlayerStore.js states in its own
  // header that an absent store must never break anything, and server.js only mounts it when
  // SPACEFACE_PLAYER_STORE_DIR is set. Reporting a designed-optional 404 as a failure is how a
  // check earns a reputation for crying wolf and stops being run at all.
  const OPTIONAL_ROUTES = [
    /__spaceface_player_store/,
    // Packaged-build version receipt. The menu already falls back when it 404s in a local check.
    /spaceface-release-build\.json/,
  ];
  // ERR_ABORTED is not a missing asset. The streaming/LOD layer cancels requests it no longer needs,
  // and the harness's own reload cancels whatever was in flight. Neither is the game being broken,
  // and reporting them as such is how a check earns a reputation for crying wolf. What actually
  // matters -- "is the player's ship there" -- is asserted directly by HULL, which cannot be
  // satisfied by a cancelled request. Aborts are still printed, just not fatal.
  const all = [...new Set(missingAssets)].filter((a) => !OPTIONAL_ROUTES.some((re) => re.test(a)));
  const aborted = all.filter((a) => /ERR_ABORTED/.test(a));
  const assets = all.filter((a) => !/ERR_ABORTED/.test(a));
  if (aborted.length) console.log('  note   ' + aborted.length + ' cancelled request(s) (not a failure):' + NLPAD + aborted.slice(0, 5).join(NLPAD));
  record('ASSETS', assets.length === 0, assets.length === 0
    ? 'every request served'
    : assets.length + ' failed request(s):' + NLPAD + assets.slice(0, 10).join(NLPAD));

  await Promise.all(consoleWarningWork);
  record('AUTHORED HULL', invisibleAuthoredShips.length === 0, invisibleAuthoredShips.length === 0
    ? 'no live entity failed closed as an invisible authored ship'
    : invisibleAuthoredShips.join(NLPAD));

  if (diagnostics.length) console.log('  diagnostics:' + NLPAD + [...new Set(diagnostics)].slice(0, 12).join(NLPAD));

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
  const bootFailures = [...new Set([...pageErrors, ...missingAssets, ...diagnostics])];
  if (bootFailures.length) console.error('  boot diagnostics:\n  ' + bootFailures.slice(0, 16).join('\n  '));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill();
  if (electronApp) {
    await electronApp.close().catch(() => {});
    // cleanup() demands proof the runtime we owned is down before it will delete a profile.
    try { if (electronLaunch) electronLaunch.cleanup({ runtimeClosed: true }); } catch (_) {}
  }
}
