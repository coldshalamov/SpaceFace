import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEVSHOTS = join(ROOT, '.devshots');
mkdirSync(DEVSHOTS, { recursive: true });

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('no free port');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

async function startFreshServer() {
  const port = await findFreePort(8170);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT, stdio: 'ignore', windowsHide: true,
  });
  
  // wait reachable
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error('server exited early');
    try {
      const res = await fetch(url);
      if (res.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return { baseUrl: url, kill: () => child.kill() };
}

async function main() {
  console.log('Starting server...');
  const server = await startFreshServer();
  console.log(`Server started at ${server.baseUrl}`);

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

  // Add error details trap
  await page.addInitScript(() => {
    window.addEventListener('error', (e) => {
      console.log(`[DETAILED ERROR] Message: ${e.message}, URL: ${e.filename}, Line: ${e.lineno}, Col: ${e.colno}`);
    });
  });

  page.on('console', (msg) => {
    console.log(`[PAGE CONSOLE] ${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    console.error(`[PAGE ERROR] ${err.stack || err.message}`);
  });
  page.on('requestfailed', (req) => {
    console.error(`[REQUEST FAILED] ${req.url()}: ${req.failure().errorText}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400) {
      console.error(`[HTTP ERROR] ${res.status()} ${res.url()}`);
    }
  });

  console.log('Loading game page...');
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  
  // Wait for window.SF with 90s timeout
  console.log('Waiting for window.SF...');
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 90000 });
  console.log('window.SF ready!');

  // wait for boot overlay gone with a generous 90s timeout
  console.log('Waiting for boot overlay...');
  await page.waitForFunction(() => {
    const o = document.getElementById('boot-overlay');
    if (!o) return true;
    const s = getComputedStyle(o);
    return o.classList.contains('hidden') || s.pointerEvents === 'none' || s.display === 'none';
  }, null, { timeout: 90000 });
  console.log('Boot overlay gone!');

  // click New Game
  console.log('Starting new game...');
  const newGameBtn = page.getByRole('button', { name: 'New Game', exact: true }).first();
  await newGameBtn.click();

  // wait for newGame screen
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-screen="newGame"]');
    if (!el) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }, null, { timeout: 30000 });

  // click Launch
  const launchBtn = page.getByRole('button', { name: 'Launch', exact: true }).first();
  await launchBtn.click();

  // wait for flight mode
  console.log('Entering flight mode...');
  await page.waitForFunction(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive);
  }, null, { timeout: 90000 });
  console.log('In flight mode!');

  // ensure flight screen is shown (dismiss onboarding/dialogs if any)
  await page.evaluate(() => {
    const sf = window.SF;
    if (sf.ctx.screenManager.top() !== 'flight') {
      sf.ctx.screenManager.popScreen();
    }
    // populate target for good visuals
    const player = sf.state.entities.get(sf.state.playerId);
    let target = null;
    for (const e of sf.state.entityList) {
      if (e && e.alive && e.id !== sf.state.playerId) {
        target = e;
        break;
      }
    }
    if (target) {
      sf.state.player.targetId = target.id;
    }
  });

  await page.waitForTimeout(2000);

  // 1. CAPTURE AFTER SCREENSHOTS (Our Revamped HUD)
  console.log('Capturing flight-hud-after.png...');
  await page.screenshot({ path: join(DEVSHOTS, 'flight-hud-after.png') });

  console.log('Opening starmap...');
  await page.evaluate(() => {
    window.SF.ctx.bus.emit('ui:toggleScreen', { id: 'starmap' });
  });
  await page.waitForTimeout(1000);
  console.log('Capturing starmap-after.png...');
  await page.screenshot({ path: join(DEVSHOTS, 'starmap-after.png') });

  console.log('Opening stationHub...');
  await page.evaluate(() => {
    window.SF.ctx.bus.emit('ui:toggleScreen', { id: 'stationHub' });
  });
  await page.waitForTimeout(1000);
  console.log('Capturing station-hub-after.png...');
  await page.screenshot({ path: join(DEVSHOTS, 'station-hub-after.png') });


  // 2. SIMULATE BEFORE STATE & CAPTURE BEFORE SCREENSHOTS
  console.log('Simulating legacy (before) styles...');
  await page.evaluate(() => {
    // Inject style to simulate old cockpit visor HUD + glow + backdrop-filter
    const style = document.createElement('style');
    style.id = 'before-simulation';
    style.innerHTML = `
      :root {
        --accent: #00F0FF !important;
        --warn: #FF9900 !important;
        --danger: #FF2A2A !important;
        --panel-edge: rgba(0, 240, 255, 0.4) !important;
      }
      .sf-card {
        background: rgba(8, 13, 24, 0.7) !important;
        backdrop-filter: blur(8px) !important;
        box-shadow: inset 0 0 10px rgba(0, 240, 255, 0.3) !important;
        border-radius: 4px !important;
      }
      .sf-schematic .sf-sch-ship {
        stroke: #00F0FF !important;
        filter: drop-shadow(0 0 8px rgba(0, 240, 255, 0.6)) !important;
      }
      .st-comms-panel {
        backdrop-filter: blur(8px) !important;
        background: rgba(8,14,26,0.7) !important;
      }
    `;
    document.head.appendChild(style);
  });

  await page.waitForTimeout(1000);

  console.log('Capturing station-hub-before.png...');
  await page.screenshot({ path: join(DEVSHOTS, 'station-hub-before.png') });

  console.log('Opening starmap for before...');
  await page.evaluate(() => {
    window.SF.ctx.bus.emit('ui:toggleScreen', { id: 'starmap' });
  });
  await page.waitForTimeout(1000);
  console.log('Capturing starmap-before.png...');
  await page.screenshot({ path: join(DEVSHOTS, 'starmap-before.png') });

  console.log('Opening flight-hud for before...');
  await page.evaluate(() => {
    window.SF.ctx.bus.emit('ui:toggleScreen', { id: 'flight' });
  });
  await page.waitForTimeout(1000);
  console.log('Capturing flight-hud-before.png...');
  await page.screenshot({ path: join(DEVSHOTS, 'flight-hud-before.png') });

  console.log('Closing browser and server...');
  await browser.close();
  server.kill();
  console.log('Devshots captured successfully!');
}

main().catch(console.error);
