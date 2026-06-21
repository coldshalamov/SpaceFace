import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const outDir = join(ROOT, '.devshots');
const { chromium } = await loadPlaywright();

const requestedBaseUrl = process.env.SF_PROBE_URL || '';
const server = requestedBaseUrl ? await ensureServer(requestedBaseUrl) : await startFreshServer();
const baseUrl = requestedBaseUrl || server.baseUrl;
const browser = await chromium.launch({ headless: true });
const viewports = [
  { name: 'desktop', width: 1280, height: 720, deviceScaleFactor: 1 },
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
];
const results = [];

try {
  for (const viewport of viewports) {
    results.push(await runViewportProbe(browser, viewport));
  }
} finally {
  await browser.close();
  if (server && server.kill) server.kill();
}

const ok = results.every((r) => r.ok);
console.log(JSON.stringify({ ok, baseUrl, results }, null, 2));
if (!ok) process.exitCode = 1;

async function runViewportProbe(browser, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: viewport.deviceScaleFactor, isMobile: !!viewport.isMobile });
  const issues = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') issues.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (err) => issues.push({ type: 'pageerror', text: String(err && err.message || err) }));

  const url = withDebugFlight(baseUrl);
  await gotoWithRetry(page, url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 15000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Flight Probe' }));
  await page.waitForFunction(
    () => window.SF.state.mode === 'flight'
      && window.SF.state.playerId
      && window.SF.state.entities.get(window.SF.state.playerId)
      && window.SF.state.entities.get(window.SF.state.playerId).mesh,
    null,
    { timeout: 15000 },
  );
  await page.waitForTimeout(500);
  await dismissTutorial(page);
  await page.waitForTimeout(250);

  const initial = await sampleShip(page);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(500);
  const right = await sampleShip(page);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(100);
  const releaseStart = await sampleShip(page);
  const releaseStartRot = releaseStart.rot;
  await page.waitForTimeout(700);
  const release = await sampleShip(page, releaseStartRot);

  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(500);
  const left = await sampleShip(page);
  await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(700);
  const leftRelease = await sampleShip(page);
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(350);
  const strafe = await sampleShip(page);
  await page.keyboard.up('KeyE');
  await page.waitForTimeout(150);

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(650);
  const throttle = await sampleShip(page);
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(650);
  const boost = await sampleShip(page);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(900);
  const reverse = await sampleShip(page);
  await page.keyboard.up('KeyS');
  await page.waitForTimeout(150);

  await resetPlayerForProbe(page, { mode: 'assisted', rot: 0, vel: { x: 0, z: 0 }, boostEnergy: 100 });
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(80);
  await page.keyboard.up('ShiftLeft');
  await page.waitForTimeout(250);
  const tapDash = await sampleShip(page);

  await resetPlayerForProbe(page, { mode: 'assisted', rot: 0, vel: { x: 0, z: 95 }, boostEnergy: 100 });
  await page.waitForTimeout(750);
  const assistedMode = await sampleShip(page);
  await resetPlayerForProbe(page, { mode: 'newtonian', rot: 0, vel: { x: 0, z: 95 }, boostEnergy: 100 });
  await page.waitForTimeout(750);
  const newtonianMode = await sampleShip(page);
  const modeDiagnostics = await getFlightDiagnostics(page);
  await resetPlayerForProbe(page, { mode: 'assisted', rot: 0, vel: { x: 0, z: 0 }, boostEnergy: 100 });
  await page.waitForTimeout(150);

  const diagnostics = await getFlightDiagnostics(page);
  const rapierDiagnostics = await enableRapierBackend(page);
  const pixels = await sampleCanvas(page);
  await mkdir(outDir, { recursive: true });
  const screenshot = join(outDir, `flight-probe-${viewport.name}.png`);
  await writeFile(screenshot, await page.screenshot({ type: 'png' }));
  await page.close();

  const checks = {
    rightBanksRight: right.bank > 0 && right.hullRotX > 0,
    leftBanksLeft: left.bank < 0 && left.hullRotX < 0,
    releaseStopsSpin: Math.abs(release.angVel) < 0.02 && Math.abs(release.rotDeltaAfterRelease) < 0.16,
    strafeDoesNotYaw: Math.abs(strafe.rot - leftRelease.rot) < 0.08,
    throttleMovesShip: throttle.forwardSpeed > 18 && throttle.speed > strafe.speed,
    boostAccelerates: boost.speed > throttle.speed + 8 && boost.boosting === true,
    reverseBrakes: reverse.speed < boost.speed * 0.78,
    tapDashFires: tapDash.speed > 55 && tapDash.dashCdT > 1 && tapDash.boosting === false && tapDash.boostEnergy < tapDash.boostMax * 0.5,
    runtimeModeSwitchAffectsAssist: !!modeDiagnostics
      && modeDiagnostics.mode === 'newtonian'
      && assistedMode.flightMode === 'assisted'
      && newtonianMode.flightMode === 'newtonian'
      && !!diagnostics
      && diagnostics.mode === 'assisted'
      && modeDiagnostics.assistStrength < diagnostics.assistStrength * 0.25,
    diagnosticsAvailable: !!diagnostics && diagnostics.mode === 'assisted',
    rapierBackendReady: !!rapierDiagnostics && rapierDiagnostics.backend === 'rapier' && rapierDiagnostics.rapierReady && rapierDiagnostics.bodies > 0,
    canvasNonBlank: pixels.nonDark > 0 && pixels.maxLum > 45 && pixels.dataUrlLen > 10000,
    noPageErrors: issues.length === 0,
  };

  return {
    viewport: viewport.name,
    ok: Object.values(checks).every(Boolean),
    checks,
    initial,
    right,
    releaseStart,
    release,
    left,
    leftRelease,
    strafe,
    throttle,
    boost,
    reverse,
    tapDash,
    assistedMode,
    newtonianMode,
    modeDiagnostics,
    diagnostics,
    rapierDiagnostics,
    pixels,
    issues,
    screenshot,
  };
}

async function dismissTutorial(page) {
  try {
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('button')).some((b) => /begin/i.test(b.textContent || '')),
      null,
      { timeout: 3000 },
    );
    const clicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => /begin/i.test(b.textContent || ''));
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (clicked) {
      await page.waitForFunction(
        () => !Array.from(document.querySelectorAll('button')).some((b) => /begin/i.test(b.textContent || '')),
        null,
        { timeout: 5000 },
      );
    }
  } catch (_) {
    // Some save states or future onboarding flows may skip the modal; the probe still samples the game below.
  }
}

async function resetPlayerForProbe(page, { mode = 'assisted', rot = 0, vel = { x: 0, z: 0 }, boostEnergy = 100 } = {}) {
  await page.evaluate(({ mode, rot, vel, boostEnergy }) => {
    const sf = window.SF;
    const state = sf.state;
    const p = state.entities.get(state.playerId);
    if (!p) return;
    state.settings.controls.flightMode = mode;
    Object.assign(state.input, {
      moveX: 0,
      moveZ: 0,
      turnIntent: 0,
      boost: false,
      fire: false,
      fireGroup: null,
    });
    p.rot = rot;
    p.prevRot = rot;
    p.angVel = 0;
    p.bank = 0;
    p.prevBank = 0;
    p.bankVel = 0;
    p.flags.boosting = false;
    p.vel.x = vel.x;
    p.vel.y = 0;
    p.vel.z = vel.z;
    if (p.pos) {
      if (typeof p.pos.set === 'function') p.pos.set(0, 0, 0);
      else {
        p.pos.x = 0;
        p.pos.y = 0;
        p.pos.z = 0;
      }
    }
    if (p.prevPos) {
      if (typeof p.prevPos.copy === 'function' && p.pos) p.prevPos.copy(p.pos);
      else {
        p.prevPos.x = 0;
        p.prevPos.y = 0;
        p.prevPos.z = 0;
      }
    }
    p.boost = Object.assign(p.boost || {}, {
      energy: boostEnergy,
      max: 100,
      drainRate: 38,
      regenRate: 22,
      dashImpulse: 150,
      dashCd: 2,
      dashCdT: 0,
      _boostArmed: true,
      _boostHoldT: 0,
      _dashCandidate: false,
    });
    const flight = sf.registry && typeof sf.registry.get === 'function' ? sf.registry.get('flight') : null;
    if (flight) {
      flight._prevBoost = false;
      flight._suppressBoostUntilRelease = false;
    }
  }, { mode, rot, vel, boostEnergy });
  await page.waitForTimeout(80);
}

async function getFlightDiagnostics(page) {
  return page.evaluate(() => {
    const diag = window.__SF_FLIGHT_DIAGNOSTICS__;
    return diag && typeof diag.getReport === 'function' ? diag.getReport() : null;
  });
}

async function enableRapierBackend(page) {
  await page.evaluate(() => {
    window.SF.state.settings.gameplay.physicsBackend = 'rapier';
  });
  try {
    await page.waitForFunction(
      () => {
        const diag = window.SF && window.SF.state && window.SF.state.physicsRuntime && window.SF.state.physicsRuntime.diagnostics;
        return !!(diag && diag.backend === 'rapier' && diag.rapierReady && diag.bodies > 0);
      },
      null,
      { timeout: 15000 },
    );
  } catch (_) {
    // Return the best diagnostics snapshot below so the failing report shows why readiness did not land.
  }
  return page.evaluate(() => {
    const diag = window.SF && window.SF.state && window.SF.state.physicsRuntime && window.SF.state.physicsRuntime.diagnostics;
    return diag ? { ...diag } : null;
  });
}

async function sampleShip(page, releaseStartRot = null) {
  return page.evaluate((startRot) => {
    const p = window.SF.state.entities.get(window.SF.state.playerId);
    return {
      rot: p.rot,
      rotDeltaAfterRelease: startRot == null ? 0 : p.rot - startRot,
      angVel: p.angVel,
      bank: p.bank,
      hullRotX: p.mesh && p.mesh.userData.hull && p.mesh.userData.hull.rotation.x,
      speed: Math.hypot(p.vel.x, p.vel.z),
      forwardSpeed: p.vel.x * Math.cos(p.rot) + p.vel.z * Math.sin(p.rot),
      lateralSpeed: p.vel.x * -Math.sin(p.rot) + p.vel.z * Math.cos(p.rot),
      boosting: !!(p.flags && p.flags.boosting),
      boostEnergy: p.boost && p.boost.energy,
      boostMax: p.boost && p.boost.max,
      dashCdT: p.boost && p.boost.dashCdT,
      flightMode: window.SF.state.settings && window.SF.state.settings.controls && window.SF.state.settings.controls.flightMode,
      vel: { x: p.vel.x, z: p.vel.z },
    };
  }, releaseStartRot);
}

async function sampleCanvas(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('gl-canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const w = canvas.width;
    const h = canvas.height;
    const px = new Uint8Array(4);
    let nonDark = 0;
    let maxLum = 0;
    let samples = 0;
    for (let yi = 0; yi < 12; yi++) {
      for (let xi = 0; xi < 12; xi++) {
        const x = Math.floor((xi + 0.5) * w / 12);
        const y = Math.floor((yi + 0.5) * h / 12);
        gl.readPixels(x, h - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const lum = px[0] + px[1] + px[2];
        if (lum > 45) nonDark++;
        if (lum > maxLum) maxLum = lum;
        samples++;
      }
    }
    return { width: w, height: h, samples, nonDark, maxLum, dataUrlLen: canvas.toDataURL('image/png').length };
  });
}

async function ensureServer(url) {
  if (await reachable(url)) return null;
  const u = new URL(url);
  const port = u.port || '8124';
  const child = spawnProbeServer(port);
  await waitForReachable(url, child);
  return child;
}

async function startFreshServer() {
  const port = await findFreePort(8124);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawnProbeServer(String(port));
  await waitForReachable(url, child);
  return { baseUrl: url, kill: () => child.kill() };
}

function spawnProbeServer(port) {
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const capture = (chunk) => {
    output = (output + String(chunk)).slice(-4000);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.probeOutput = () => output.trim();
  return child;
}

async function waitForReachable(url, child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) {
      throw new Error(`Dev server exited before becoming reachable at ${url}\n${child.probeOutput ? child.probeOutput() : ''}`);
    }
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error('Dev server did not become reachable at ' + url);
}

async function findFreePort(start) {
  for (let port = start; port < start + 60; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('No free local port found for flight visual probe');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function reachable(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    return !!res.ok;
  } catch (_) {
    return false;
  }
}

function withDebugFlight(url) {
  const u = new URL(url);
  u.searchParams.set('debug', 'flight');
  return String(u);
}

async function gotoWithRetry(page, url, opts) {
  let lastErr = null;
  for (let i = 0; i < 3; i++) {
    try {
      return await page.goto(url, opts);
    } catch (err) {
      lastErr = err;
      if (!String(err && err.message || err).includes('ERR_CONNECTION_REFUSED') || i === 2) throw err;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw lastErr;
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (err) {
    const bundledNodeModules = join(
      process.env.USERPROFILE || '',
      '.cache',
      'codex-runtimes',
      'codex-primary-runtime',
      'dependencies',
      'node',
      'node_modules',
    );
    const require = createRequire(join(
      bundledNodeModules,
      '.pnpm',
      'playwright@1.60.0',
      'node_modules',
      'playwright',
      'index.js',
    ));
    return require('playwright');
  }
}
