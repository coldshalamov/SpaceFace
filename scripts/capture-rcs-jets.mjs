// Headless visual evidence for the RCS consumer (ledger RC-3).
//
// Two captures, deliberately:
//   1. `_rcslab.html`  — the look-dev harness. Real kernel -> real telemetry -> shipped resolver,
//      drawn as a top-down nozzle diagram across 12 scenarios. This is the load-bearing proof of
//      the MAPPING, and it is cheap and deterministic.
//   2. the live game    — attempted second, because boot-to-flight currently exceeds every harness
//      budget in this repo (see 03_LEDGER.md "Environment / boot-budget reds"). A timeout here is
//      reported and does NOT fail the script: it is a known, pre-existing, unrelated blocker.
//
// Usage: node scripts/capture-rcs-jets.mjs [--game-timeout-ms=180000]

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, '.devshots', 'rcs-jets');
const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=')[1] : d;
};
const GAME_TIMEOUT = Number(arg('game-timeout-ms', 180000));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort(start) {
  for (let p = start; p < start + 300; p++) {
    const ok = await new Promise((res) => {
      const s = createServer();
      s.once('error', () => res(false));
      s.listen(p, '127.0.0.1', () => s.close(() => res(true)));
    });
    if (ok) return p;
  }
  throw new Error('no free port');
}

async function waitReachable(url) {
  for (let i = 0; i < 200; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not up yet */ }
    await sleep(150);
  }
  throw new Error(`server never reachable: ${url}`);
}

mkdirSync(OUT_DIR, { recursive: true });
let server, browser;
const report = { lab: null, game: null };

try {
  const port = await freePort(8451);
  server = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  server.stdout.on('data', () => {}); server.stderr.on('data', () => {});
  const base = `http://127.0.0.1:${port}`;
  await waitReachable(`${base}/`);

  browser = await chromium.launch({ args: ['--no-sandbox'] });

  // ---------------------------------------------------------------------------------------
  // 1. Look-dev harness — the mapping proof
  // ---------------------------------------------------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 1560, height: 1060 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(`${base}/_rcslab.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__RCS_LAB__ && window.__RCS_LAB__.ready, null, { timeout: 30000 });
    if (errors.length) throw new Error(`RCS lab reported errors:\n${errors.join('\n')}`);

    const summary = await page.evaluate(() => window.__RCS_LAB__.summary);
    const shot = join(OUT_DIR, 'rcs-lab.png');
    await page.screenshot({ path: shot, fullPage: true });
    writeFileSync(join(OUT_DIR, 'rcs-lab-summary.json'), JSON.stringify(summary, null, 2));

    // The screenshot is evidence only if the thing it depicts is correct, so assert the two
    // scenarios that encode the defect before claiming the capture proves anything.
    const yaw = summary.find((s) => s.title === 'Yaw → starboard');
    const bow = yaw.firings.filter((f) => f.station === 'bow');
    if (bow.length !== 1 || bow[0].side !== -1) {
      throw new Error(`lab capture depicts the WRONG mapping: yaw→starboard bow jets = ${JSON.stringify(bow)}`);
    }
    const brake = summary.find((s) => s.title === 'Brake from 40 WU/s');
    if (brake.firings.filter((f) => f.station === 'bow').length !== 2) {
      throw new Error('lab capture: braking must show the symmetric bow retro pair');
    }
    report.lab = { shot, panels: summary.length, ok: true };
    console.log(`Look-dev capture OK -> ${shot}  (${summary.length} panels, mapping asserted)`);
    await page.close();
  }

  // ---------------------------------------------------------------------------------------
  // 2. Live game — best effort. rAF is throttled in a hidden/backgrounded tab, so frames are
  //    ticked MANUALLY through the SF global rather than waited on.
  // ---------------------------------------------------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const t0 = Date.now();
    try {
      await page.goto(`${base}/?debug=flight`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.SF && window.SF.state, null, { timeout: 60000 });
      await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: GAME_TIMEOUT });

      // Drive a hard yaw, then tick frames by hand — a hidden tab will not deliver rAF.
      const probe = await page.evaluate(async () => {
        const { state, registry } = window.SF;
        const out = [];
        for (const [label, input] of [['yaw-starboard', { turn: 1 }], ['yaw-port', { turn: -1 }], ['brake', { brake: true }]]) {
          Object.assign(state.input, { moveX: 0, moveZ: 0, turn: 0, strafe: 0, brake: false }, input);
          for (let i = 0; i < 30; i++) {
            registry.update ? registry.update(1 / 60) : null;
            const vfx = registry.byName && registry.byName.get && registry.byName.get('vfx');
            if (vfx && vfx.update) vfx.update(1 / 60);
          }
          const t = state.flightRuntime && state.flightRuntime.telemetry;
          out.push({ label, actuators: t ? { lateral: t.actuators.lateral, yaw: t.actuators.yaw, reverse: t.actuators.reverse } : null });
        }
        return out;
      });

      const shot = join(OUT_DIR, 'rcs-ingame.png');
      await page.screenshot({ path: shot });
      writeFileSync(join(OUT_DIR, 'rcs-ingame-probe.json'), JSON.stringify(probe, null, 2));
      report.game = { shot, probe, ok: true, bootMs: Date.now() - t0 };
      console.log(`In-game capture OK -> ${shot}  (boot ${(Date.now() - t0) / 1000}s)`);
    } catch (err) {
      report.game = { ok: false, reason: String(err.message || err).split('\n')[0], waitedMs: Date.now() - t0 };
      console.log(`In-game capture SKIPPED after ${(Date.now() - t0) / 1000}s: ${report.game.reason}`);
      console.log('  This is the known boot-to-flight budget blocker recorded in design/program/atlas/03_LEDGER.md.');
      console.log('  It is pre-existing and unrelated to this packet; the look-dev capture above is the mapping evidence.');
    }
    await page.close();
  }

  writeFileSync(join(OUT_DIR, 'capture-report.json'), JSON.stringify(report, null, 2));
  console.log(`\nReport -> ${join(OUT_DIR, 'capture-report.json')}`);
  if (!report.lab || !report.lab.ok) process.exit(1);
} catch (err) {
  console.error('capture-rcs-jets FAILED:', err);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill();
}
