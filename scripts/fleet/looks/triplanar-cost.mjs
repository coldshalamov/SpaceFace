// LOOK-05A cost: a frozen top-down frame of 60 rocks (the Swarm count), flat authored material vs the triplanar
// surface, each wrapped in the real illustrated-surface governor. Times render + GPU sync (readPixels), alternating
// A/B four times. Standalone three scene, no game boot.
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/triplanar-cost.mjs
import { chromium as rawChromium } from 'playwright';
import { quietChromium } from '../../lib/quietLaunch.mjs';
const chromium = quietChromium(rawChromium);
import { spawn } from 'node:child_process';
const PORT = 8174;
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await sleep(2500);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('console error', m.text().slice(0, 500)); });
  await page.goto(`http://127.0.0.1:${PORT}/.devshots/fleet/looks/look05a/cost.html`, { waitUntil: 'commit', timeout: 120_000 });
  await page.waitForFunction(() => window.__cost, null, { timeout: 240000 });
  console.log(JSON.stringify(await page.evaluate(() => window.__cost)));
  await page.screenshot({ path: '.devshots/fleet/looks/look05a/cost-last.png' });
  await browser.close();
} finally { server.kill(); }
