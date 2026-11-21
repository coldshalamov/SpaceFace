// BEAT FIXTURE SHOTS: stand the Adventure opening rail at a beat (raid | claimed | seam | dock) through the dev URL
// fixture `?sector=sector_helios_prime&beat=<key>&shot=1` (src/systems/devSectorJump.js -> onboarding.devJumpToBeat),
// then shoot the screen a few times so beats 5-10 can be judged without playing the first minutes.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/beat-shots.mjs --beat=raid --out=.devshots/fleet/beats/raid
//
// Writes <out>/beat-<key>-<n>.png and <out>/beat-<key>.json (current beat, objective line, nearby entities).
import { chromium as rawChromium } from 'playwright';
import { quietChromium } from '../../lib/quietLaunch.mjs';
const chromium = quietChromium(rawChromium);
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true]; }));
const BEAT = String(argv.beat || 'raid');
const OUT = String(argv.out || `.devshots/fleet/beats/${BEAT}`);
const PORT = 8191;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
let browser;
try {
  await sleep(2500);
  browser = await chromium.launch({ headless: argv.headed !== true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('console', (m) => { const t = m.text(); if (/dev beat jump|dev sector|unknown sector|SpaceFace\]/.test(t)) console.log('console:', t.slice(0, 200)); });
  await page.goto(`http://127.0.0.1:${PORT}/?simLane=main&sector=sector_helios_prime&beat=${BEAT}&shot=1`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__sfShotReady === true, null, { timeout: 240_000 });
  const report = { beat: BEAT, shots: [] };
  for (let i = 0; i < 4; i++) {
    await sleep(i === 0 ? 1500 : 4000);
    const info = await page.evaluate(() => {
      const s = window.SF.state; const ob = s.onboarding || {}; const me = s.entities.get(s.playerId);
      const near = (s.entityList || []).filter((e) => e && e.alive !== false && me && e !== me && Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z) < 500)
        .slice(0, 12).map((e) => ({ type: e.type, name: e.name || null, d: Math.round(Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z)) }));
      return { sim: +s.simTime.toFixed(1), currentBeat: ob.currentBeat, beatAction: ob.beatAction || null, done: Object.keys(ob.beatDoneAt || {}), near };
    });
    const file = `beat-${BEAT}-${i}.png`;
    await page.screenshot({ path: join(OUT, file) });
    report.shots.push({ file, ...info });
    console.log(file, JSON.stringify(info).slice(0, 300));
  }
  writeFileSync(join(OUT, `beat-${BEAT}.json`), JSON.stringify(report, null, 2));
} finally {
  try { if (browser) await browser.close(); } catch { /* closed */ }
  server.kill();
}
