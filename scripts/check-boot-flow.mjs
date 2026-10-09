#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const argv = parseArgs(process.argv.slice(2));
const BAD_SAVE = !!argv.badSave || !!argv['bad-save'];
const STALE_MODAL = !!argv.staleModal || !!argv['stale-modal'];
const SHOT = argv.shot || `.devshots/perf/boot-flow${BAD_SAVE ? '-bad-save' : ''}.jpg`;
const WIDTH = Number(argv.width || 1280);
const HEIGHT = Number(argv.height || 800);

// D131: the spawned dev server must NOT mount the machine save drawer. Without an
// override, server.js falls back to the real player store (resolveMountedPlayerStoreDir)
// whose per-request readdirSync + readFileSync of every slot file can block the shared
// server event loop long enough for the boot contract fetch's own 15 s
// AbortSignal.timeout (main.js loadScenarioContract) to consume the whole overlay
// budget — the fresh-profile "boot overlay never hides, mode null" stall this check
// kept hitting on the shared host. A mounted-but-empty temp store keeps the production
// store code path while making the boot deterministic; mods stay unmounted.
const PLAYER_STORE_DIR = mkdtempSync(join(tmpdir(), 'sf-boot-flow-'));

const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
assert(chrome, 'Chrome or Edge must be installed for the boot-flow probe');

let server = null;
let browser = null;
let currentServerChild = null;

try {
  const baseUrl = argv.url || (await startFreshServer()).baseUrl;
  server = argv.url ? null : { kill: () => currentServerChild && currentServerChild.kill() };
  const url = new URL(baseUrl);
  if (argv.prod || argv['prod']) url.searchParams.set('prod', '1');

  browser = await launchChrome(String(url));
  const issues = [];
  const cdp = await connect(browser.debugPort, issues);
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  // Headless Chrome reports prefers-reduced-motion: reduce, so a fresh profile lands on the
  // first-boot motionAsk gate instead of the menu (and the whole flow would measure the
  // reduced-motion route). Emulate a normal player machine, same as probe-dod-crowded-scene.
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: bootSetupScript(BAD_SAVE) });
  await cdp.send('Page.navigate', { url: String(url) });
  // The contract fetch owns a hard 15 s abort (main.js loadScenarioContract) that surfaces
  // a visible .boot-error on a true failure — a merely-slow cold boot under shared-host
  // load must not be read as that failure, so the overlay wait runs well past the
  // contract's own cap. The abortIf arm fails fast when the overlay itself reports dead.
  await waitFor(cdp, () => snapshotExpression(), (snap) => snap.bootOverlayHidden, 45000,
    'boot overlay to hide', (snap) => !!snap.bootError);

  const menuSnap = await waitForUsableMenu(cdp);
  assert(!menuSnap.emptyPreGameHud,
    'boot should not strand player in empty pre-game HUD: ' + JSON.stringify(menuSnap)
    + ' issues=' + JSON.stringify(issues.slice(0, 8)));

  if (menuSnap.flightPlayable) {
    // Some dev sessions restore or start directly into flight. That is already enough for visual
    // lifecycle probes such as --stale-modal; don't make the harness depend on title-screen copy.
  } else if (BAD_SAVE) {
    assert.match(menuSnap.continueSummary || '', /^Continue: /,
      'bad-save seeded menu should show a concrete Continue summary: ' + JSON.stringify(menuSnap));
    assert.match(menuSnap.continueSummary || '', /123 CR/,
      'Continue summary should include save-index credit context: ' + JSON.stringify(menuSnap));
    assert.equal(menuSnap.continueDisabled, false,
      'bad-save seeded Continue should be enabled so the load-repair path is reachable');
    await clickButton(cdp, 'Continue');
  } else {
    await clickButton(cdp, 'New Game', menuSnap);
    await waitFor(cdp, () => snapshotExpression(), (snap) => snap.newGameVisible, 10000, 'New Game screen');
    await clickButton(cdp, 'Launch');
  }

  const midLoad = await evalJson(cdp, snapshotExpression());
  if (!midLoad.bootOverlayHidden) {
    assert.equal(midLoad.bootBarVisible, false, 'the retired 2px boot bar must stay hidden while the ring owns progress');
  }

  // The new-run transition does real work under headless SwiftShader — the witness trail shows
  // authored-visuals → gpu-resources climbing for ~50-70 s on this host — and the opening
  // package-admission settle behind it is itself bounded at 45 s
  // (pipelineReadiness REQUIRED_PACKAGE_SETTLE_TIMEOUT_MS). A loaded shared host can therefore
  // legitimately need ~110 s before flight publishes; 150 s keeps a true hang distinguishable
  // (the witness trail names the parked stage) without flaking on load variance.
  const flight = await waitFor(cdp, () => snapshotExpression(), (snap) => snap.flightPlayable, 150000, 'playable flight HUD');
  assert.equal(flight.emptyPreGameHud, false, 'flight should not be the empty pre-game HUD');

  if (STALE_MODAL) {
    await cdp.send('Runtime.evaluate', {
      expression: `document.body.classList.add('ui-modal-open')`,
      awaitPromise: true,
    });
    const healed = await waitFor(cdp, () => snapshotExpression(), (snap) => (
      snap.flightPlayable && snap.hudVisible && !snap.bodyModalOpen && !snap.backdropVisible
    ), 5000, 'stale modal blur to self-heal');
    assert.equal(healed.bodyModalOpen, false, 'stale ui-modal-open class should be removed in pure flight');
    assert.equal(healed.backdropVisible, false, 'modal backdrop should not stay visible in pure flight');
  }

  assert.equal(issues.filter((issue) => issue.level === 'error').length, 0,
    'boot-flow probe should not record page errors: ' + JSON.stringify(issues.slice(0, 5)));

  const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  mkdirSync(dirname(SHOT), { recursive: true });
  writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
  console.log(`Boot flow OK (${BAD_SAVE ? 'bad-save continue repaired' : 'new game launch'}): ${SHOT}`);
} finally {
  if (browser && browser.child) {
    try { browser.child.kill(); } catch (_) {}
  }
  if (currentServerChild) {
    try { currentServerChild.kill(); } catch (_) {}
  }
  try { rmSync(PLAYER_STORE_DIR, { recursive: true, force: true }); } catch (_) {}
}

async function startFreshServer() {
  const port = await findFreePort(8135);
  currentServerChild = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: {
      ...process.env,
      SPACEFACE_PLAYER_STORE_DIR: PLAYER_STORE_DIR,
      SPACEFACE_USER_CONTENT_DIR: '',
    },
  });
  // Drain the pipes: an undrained stdout/stderr can back-pressure a chatty child
  // (same reason launchChrome drains), and the server is the check's own static host.
  currentServerChild.stdout.on('data', () => {});
  currentServerChild.stderr.on('data', () => {});
  await waitReachable(`http://127.0.0.1:${port}/`, currentServerChild);
  return { baseUrl: `http://127.0.0.1:${port}/` };
}

async function launchChrome(url) {
  const debugPort = await findFreePort(9340);
  const profile = `${process.env.TEMP || process.env.TMP || ROOT}\\spaceface-boot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const child = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--window-size=${WIDTH},${HEIGHT}`,
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${debugPort}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  return { child, debugPort, url };
}

async function connect(debugPort, issues) {
  let wsUrl = null;
  for (let i = 0; i < 60; i++) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
      const page = tabs.find((t) => t.type === 'page');
      if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
    } catch (_) {}
    await sleep(200);
  }
  assert(wsUrl, 'Chrome DevTools target did not appear');
  assert(globalThis.WebSocket, 'Node global WebSocket is required');

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (msg.method === 'Runtime.exceptionThrown') {
      issues.push({ level: 'error', text: msg.params?.exceptionDetails?.text || 'exception' });
    }
    if (msg.method === 'Log.entryAdded') {
      const entry = msg.params && msg.params.entry;
      if (entry && (entry.level === 'error' || entry.level === 'warning')) issues.push({ level: entry.level, text: entry.text || '' });
    }
    if (msg.method === 'Network.responseReceived') {
      const response = msg.params && msg.params.response;
      if (response && response.status >= 400) {
        issues.push({ level: 'error', status: response.status, url: response.url });
      }
    }
    if (msg.method === 'Runtime.consoleAPICalled' && (msg.params?.type === 'error' || msg.params?.type === 'warning')) {
      issues.push({ level: msg.params.type, text: (msg.params.args || []).map((arg) => arg.value || arg.description || '').join(' ') });
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg.result || {});
    }
  });
  return {
    send(method, params = {}) {
      return new Promise((resolve) => {
        id++;
        pending.set(id, { resolve });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

async function waitForUsableMenu(cdp) {
  await sleep(300);
  let snap = await evalJson(cdp, snapshotExpression());
  if (snap.cinematicVisible) {
    await cdp.send('Runtime.evaluate', { expression: `document.getElementById('cinematic-splash')?.click()` });
  }
  const start = Date.now();
  let emptySince = 0;
  while (Date.now() - start < 12000) {
    snap = await evalJson(cdp, snapshotExpression());
    // The splash now mounts only after the boot overlay hands off, so it can appear (or still be
    // fading in) inside this window rather than before it — keep offering the dismissal click.
    if (snap.cinematicVisible) {
      await cdp.send('Runtime.evaluate', { expression: `document.getElementById('cinematic-splash')?.click()` });
      await sleep(200);
      continue;
    }
    // First-boot motionAsk gate: locked (no ESC), and it owns the screen stack while it is up, so
    // mainMenu never becomes visible until it is answered. Emulation should keep it off this route;
    // if it still appears (e.g. a profile whose motionAsked marker was not persisted) answer Full,
    // the primary choice, rather than stall the flow on an accessibility prompt a player answers.
    if (snap.motionAskVisible) {
      await cdp.send('Runtime.evaluate', {
        expression: `[...document.querySelectorAll('[data-screen="motionAsk"] button')]
          .find((b) => b.dataset && b.dataset.action === 'full')?.click()`,
      });
      await sleep(300);
      continue;
    }
    if (snap.mainMenuVisible || snap.flightPlayable) return snap;
    if (snap.emptyPreGameHud) {
      if (!emptySince) emptySince = Date.now();
      if (Date.now() - emptySince > 2200) return snap;
    } else {
      emptySince = 0;
    }
    await sleep(250);
  }
  return snap;
}

async function clickButton(cdp, label, snap = null) {
  // Exact-text match must be limited to VISIBLE buttons: several hidden screens
  // (gameOver, crucible, saveLoad) carry same-labeled buttons earlier in DOM order
  // than the live menu, and a DOM click on a hidden button still fires its handler
  // (gameOver "New Game" jumps straight into loading, so the New Game screen the
  // flow waits for never appears — the D131 fresh-profile stall signature).
  const expr = `(() => {
    const visible = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) > 0.05 && r.width > 2 && r.height > 2;
    };
    const all = [...document.querySelectorAll('button')].filter((b) => (b.textContent || '').trim() === ${JSON.stringify(label)});
    const button = all.find(visible);
    if (!button) {
      return {
        ok: false,
        matched: all.length,
        hiddenMatches: all.length,
        buttons: [...document.querySelectorAll('button')].filter(visible)
          .map((b) => (b.textContent || '').trim()).filter(Boolean).slice(0, 24),
      };
    }
    const where = (button.closest('[data-screen]') || {}).dataset
      ? button.closest('[data-screen]').dataset.screen : null;
    button.click();
    return { ok: true, screen: where, action: button.dataset ? button.dataset.action || null : null };
  })()`;
  const res = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
  const value = res.result?.value || {};
  assert.equal(value.ok, true, `visible button "${label}" should exist; matched=${value.matched || 0}; buttons=${JSON.stringify(value.buttons || [])}; snap=${JSON.stringify(snap)}`);
  return value;
}

async function waitFor(cdp, exprFactory, predicate, timeoutMs, label, abortIf = null) {
  const start = Date.now();
  let last = null;
  // Stall witness: a true hang must name its phase — whether window.SF exists yet,
  // which loading stage the overlay is parked on, and whether it already surfaced a
  // boot error. The trail records only changes so a slow boot and a dead boot read
  // differently at a glance.
  const trail = [];
  let lastKey = '';
  const witness = () => ({
    t: Math.round(Date.now() - start),
    sf: !!(last && last.sfPresent),
    mode: last && last.mode || null,
    stage: last && last.bootLoadingStage || null,
    pct: last && last.bootLoadingPct || null,
    bootError: last && last.bootError || null,
  });
  while (Date.now() - start < timeoutMs) {
    last = await evalJson(cdp, exprFactory());
    if (predicate(last)) return last;
    const key = JSON.stringify(witness());
    if (key !== lastKey) {
      lastKey = key;
      trail.push(witness());
    }
    if (typeof abortIf === 'function' && abortIf(last)) {
      throw new Error(`Aborted waiting for ${label} (fatal signal). Last snapshot: `
        + `${JSON.stringify(last)}. Witness trail: ${JSON.stringify(trail.slice(-24))}`);
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}. Last snapshot: ${JSON.stringify(last)}`
    + `. Witness trail: ${JSON.stringify(trail.slice(-24))}`);
}

async function evalJson(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return JSON.parse(res.result?.value || '{}');
}

function snapshotExpression() {
  return `JSON.stringify((() => {
    const visible = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) > 0.05 && r.width > 2 && r.height > 2;
    };
    const sf = window.SF || null;
    const state = sf && sf.state || null;
    const player = state && state.entities && state.entities.get(state.playerId) || null;
    const hud = document.getElementById('hud');
    const screens = document.getElementById('screens');
    const backdrop = document.getElementById('modal-backdrop');
    const mainMenu = document.querySelector('[data-screen="mainMenu"]');
    const newGame = document.querySelector('[data-screen="newGame"]');
    const continueButton = [...document.querySelectorAll('button')]
      .find((button) => (button.textContent || '').trim() === 'Continue') || null;
    const bootOverlay = document.getElementById('boot-overlay');
    const bootError = document.querySelector('#boot-overlay .boot-error');
    const hullText = [...document.querySelectorAll('.sf-barrow')].find((row) => /HULL/.test(row.textContent || ''))?.querySelector('.sf-barrow__num')?.textContent || '0';
    const weaponText = document.querySelector('[data-k="weapons"]')?.textContent || '';
    const classText = document.querySelector('[data-k="role"]')?.textContent || '';
    const hudPlayableDom = visible(hud)
      && Number(String(hullText).replace(/[^0-9.]/g, '')) > 0
      && weaponText.trim() && !/^[-—]$/.test(weaponText.trim())
      && classText.trim() && !/^[-—]$/.test(classText.trim());
    const flightPlayableState = !!(state && state.mode === 'flight' && player && player.alive && player.hull > 0
      && player.hullMax > 0 && player.capMax > 0 && player.data && player.data.weapons && player.data.weapons.length);
    const cinematicVisible = visible(document.getElementById('cinematic-splash'));
    const mainMenuVisible = visible(mainMenu);
    const newGameVisible = visible(newGame);
    const motionAskVisible = visible(document.querySelector('[data-screen="motionAsk"]'));
    const modalOpen = document.body.classList.contains('ui-modal-open');
    const hudVisible = visible(hud);
    const backdropVisible = visible(backdrop);
    const flightPlayable = flightPlayableState || hudPlayableDom;
    return {
      bootOverlayHidden: !bootOverlay || bootOverlay.classList.contains('hidden'),
      bootBarVisible: visible(document.querySelector('#boot-overlay .boot-progress')),
      sfPresent: !!sf,
      bootLoadingStage: bootOverlay && bootOverlay.dataset
        ? (bootOverlay.dataset.loadingStage || null) : null,
      bootLoadingPct: (document.querySelector('[data-loading-pct]') || {}).textContent || '',
      bootError: bootError ? (bootError.textContent || '') : '',
      cinematicVisible,
      mainMenuVisible,
      newGameVisible,
      motionAskVisible,
      flightPlayable,
      hudVisible,
      bodyModalOpen: modalOpen,
      backdropVisible,
      emptyPreGameHud: !cinematicVisible && !mainMenuVisible && !newGameVisible && !motionAskVisible && !flightPlayable && hudVisible && !modalOpen,
      mode: state && state.mode || null,
      playerId: state && state.playerId || null,
      entityCount: state && state.entityList && state.entityList.length || 0,
      screenStack: state && state.ui && state.ui.screenStack || [],
      screensDisplay: screens && getComputedStyle(screens).display,
      continueSummary: document.querySelector('.sf-menu-save-summary')?.textContent || '',
      continueDisabled: continueButton ? !!continueButton.disabled : null,
      hullText,
      weaponText,
      classText,
    };
  })())`;
}

function bootSetupScript(badSave) {
  return `(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
    if (${badSave ? 'true' : 'false'}) {
      const savedAt = new Date().toISOString();
      const env = {
        fmt: 'spaceface-save',
        version: 5,
        savedAt,
        playtimeS: 0,
        slot: 'bad-latest',
        data: {
          meta: { seed: 91, playtimeS: 0, createdAt: savedAt, lastSavedAt: savedAt },
          player: { credits: 123, ownedShips: [], activeShipIndex: 99 },
          cargo: { items: {}, capVolume: 0, capMass: 0 },
          economy: {},
          factions: {},
          world: { currentSectorId: null, fuel: { current: 0, max: 0 } },
          entities: { player: { type: 'ship', alive: false, pos: { x: 0, z: 0 }, data: {}, hull: 0, hullMax: 0, shield: 0, shieldMax: 0, cap: 0, capMax: 0 }, persistent: [], simTime: 0, tick: 0 },
          missions: { boards: {}, active: [], completedLog: [], nextId: 1, story: { beatIndex: 0 } },
          automation: {},
          crafting: { queues: {} },
          settings: {}
        }
      };
      localStorage.setItem('sf.save.bad-latest', JSON.stringify(env));
      localStorage.setItem('sf.save.index', JSON.stringify({ 'bad-latest': { slot: 'bad-latest', savedAt, playtimeS: 0, credits: 123, sectorName: '', shipName: '', version: 5 } }));
    }
  })()`;
}

async function waitReachable(url, child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error(`server exited before ${url} became reachable`);
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (_) {}
    await sleep(250);
  }
  throw new Error(`server did not become reachable: ${url}`);
}

async function findFreePort(start) {
  for (let port = start; port < start + 100; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('No free local port found');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) { out[key] = next; i++; }
    else out[key] = true;
  }
  return out;
}
