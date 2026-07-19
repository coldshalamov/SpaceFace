#!/usr/bin/env node
// Capture visual evidence for the Travel Burn instrument (atlas W1-5 / W1-6 / W1-9):
// the contextual velocity tape with its V-MAX ceiling line, the earned-cap caret, the stopping arc
// and the BRAKE NOW cue. Writes stills under .devshots/travel-tape/ — evidence only.
//
// Two known environment hazards are handled explicitly rather than hoped away:
//   1. Boot-to-flight currently exceeds every budget in the suite (ledger: 91.4 s / 121.0 s /
//      134.5 s measured). The flight timeout here is deliberately generous, and a boot failure is
//      reported as an ENVIRONMENT result rather than being silently retried.
//   2. rAF is throttled in a backgrounded tab, so the HUD's own frame loop cannot be relied on to
//      repaint. After mutating state we tick the render/UI loop explicitly and settle in real time.

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'travel-tape');
const WIDTH = 1440;
const HEIGHT = 900;
const FLIGHT_TIMEOUT_MS = 240_000;

async function shoot(page, name, note) {
  await mkdir(OUT, { recursive: true });
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  wrote ${path.relative(ROOT, file)}${note ? `  — ${note}` : ''}`);
  return file;
}

/** Read back what the instrument is actually showing, so the still is not the only evidence. */
async function readTape(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.sf-vtape');
    if (!el) return { present: false };
    const cs = getComputedStyle(el);
    const q = (sel) => { const n = el.querySelector(sel); return n ? n.textContent.trim() : null; };
    const left = (sel) => { const n = el.querySelector(sel); return n ? n.style.left : null; };
    return {
      present: true,
      visible: cs.visibility !== 'hidden' && Number(cs.opacity) > 0.01,
      opacity: cs.opacity,
      driveState: el.dataset.state,
      classes: el.className,
      stateText: q('.sf-vtape__state'),
      spoolText: q('.sf-vtape__spool'),
      vmaxText: q('.sf-vtape__vmaxlabel'),
      vmaxLeft: left('.sf-vtape__vmax'),
      capLeft: left('.sf-vtape__cap'),
      arcLabel: q('.sf-vtape__arclabel'),
      brakeShown: getComputedStyle(el.querySelector('.sf-vtape__brake')).display !== 'none',
    };
  });
}

/**
 * Tap the travel-burn latch on its DEFAULT binding, as a real keyboard event.
 *
 * Dispatched on `window` because that is where input.js registers its listeners, and a window
 * target sidesteps the text-entry/UI-command guards without bypassing them (window has no
 * `.closest`, so both guards read false — the same result a canvas-focused player gets).
 * A released tick follows the press so the edge detector re-arms.
 */
async function pressLatch(page, code = 'NumLock') {
  await page.evaluate((c) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true }));
  }, code);
  await sleep(120);
  await page.evaluate((c) => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: c, key: c, bubbles: true }));
  }, code);
  await sleep(120);
}

/**
 * Hold a world condition true while waiting for the instrument to reach a state.
 *
 * Fixed sleeps are useless here: under SwiftShader software rendering this page runs at a few FPS
 * while the sim uses a fixed timestep, so several wall-clock seconds can be under one sim frame.
 * (The first revision of this harness slept 2.6 s for a 1.6 s spool and never left `spooling`.)
 * Re-applying `mutate` each poll also survives the governor bleeding off the velocity we set.
 */
async function pumpUntil(page, mutate, predicate, { timeout = 90_000, label = '' } = {}) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    if (mutate) await page.evaluate(mutate);
    last = await readTape(page);
    if (predicate(last)) return last;
    await sleep(200);
  }
  console.log(`  (timed out waiting for ${label || 'condition'})`);
  return last;
}

async function main() {
  const { chromium } = await loadPlaywright();
  const server = await acquireVisualProbeServer({ root: ROOT });
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const results = {};

  try {
    await page.goto(`${server.baseUrl}/?debug=flight`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!(window.SF && window.SF.state), null, { timeout: 60_000 });

    // Public boot path: New Game, exactly as a player reaches flight.
    await page.evaluate(() => {
      const SF = window.SF;
      if (SF.state.mode === 'flight') return;
      const btn = document.querySelector('[data-action="new-game"], #btn-new-game, button[data-id="newGame"]');
      if (btn) btn.click();
      if (SF.bus && SF.bus.emit) SF.bus.emit('game:new', { seed: 47 });
    });

    try {
      await page.waitForFunction(() => window.SF && window.SF.state && window.SF.state.mode === 'flight',
        null, { timeout: FLIGHT_TIMEOUT_MS });
    } catch (err) {
      console.log(`\nENVIRONMENT: boot-to-flight did not complete within ${FLIGHT_TIMEOUT_MS / 1000}s.`);
      console.log('This is the pre-existing boot-budget blocker recorded in the atlas ledger, not a');
      console.log('regression from this packet. No tape stills captured.');
      await shoot(page, '00-boot-timeout', 'state at timeout');
      process.exitCode = 2;
      return;
    }
    console.log('booted to flight.');
    await sleep(3000);

    // --- 1. baseline: ordinary flight, drive off. The instrument must be ABSENT (D9.9). -------
    results.off = await readTape(page);
    await shoot(page, '01-drive-off', 'instrument absent during ordinary flight');

    // --- 2. engaged burn: V-MAX line + earned-cap caret on the tape -------------------------
    // Reach the drive THE WAY A PLAYER DOES: a real Num Lock keypress on the default binding.
    // (An earlier revision of this harness wrote `state.input.travelDrive` directly and saw
    // nothing happen — correctly, because the latch owns that address and republishes it every
    // tick. Driving the keybind is both the honest path and much stronger evidence.)
    await pressLatch(page);
    results.engaged = await pumpUntil(
      page,
      () => {
        const p = window.SF.state.entities.get(window.SF.state.playerId);
        if (p) { p.vel.x = 380; p.vel.z = 0; p.rot = 0; }
      },
      (r) => r && r.driveState === 'engaged',
      { label: 'drive to reach engaged' },
    );
    await shoot(page, '02-engaged-vmax', 'V-MAX ceiling line + earned-cap caret');

    // --- 3. manual approach: stopping arc + BRAKE NOW ----------------------------------------
    // Hand-flown (autopilot OFF) approach to a plotted waypoint placed well inside the ship's own
    // stopping distance, so the solution has already overrun the arrival ring.
    results.brake = await pumpUntil(
      page,
      () => {
        const s = window.SF.state;
        const p = s.entities.get(s.playerId);
        p.vel.x = 380; p.vel.z = 0; p.rot = 0;
        // Re-anchor the waypoint ahead of the ship each poll so it stays inside the stopping
        // distance even as the ship travels; this is a still, not a flight test.
        const ahead = { x: p.pos.x + 260, z: p.pos.z };
        s.nav.waypoint = { kind: 'local', label: 'TETHYS JUNCTION', reason: 'capture', pos: ahead };
        s.nav.autopilot = { active: false, target: ahead, targetEntityId: null, label: 'TETHYS JUNCTION', arrivalRadius: 40, status: 'idle' };
      },
      (r) => r && r.brakeShown,
      { label: 'BRAKE NOW cue' },
    );
    await shoot(page, '03-brake-now', 'stopping arc + BRAKE NOW cue');

    // --- 4. retire: the instrument must fade back out COMPLETELY -----------------------------
    // Press the latch again (pilot disengage -> cooldown), clear the waypoint, and bleed off speed.
    await pressLatch(page);
    results.retired = await pumpUntil(
      page,
      () => {
        const s = window.SF.state;
        s.nav.waypoint = null;
        s.nav.autopilot = { active: false, target: null, targetEntityId: null, label: '', arrivalRadius: 36, status: 'idle' };
        const p = s.entities.get(s.playerId);
        if (p) { p.vel.x = 10; p.vel.z = 0; }
      },
      (r) => r && !r.visible,
      { label: 'instrument to retire' },
    );
    await shoot(page, '04-retired', 'instrument fully retired again');

    await mkdir(OUT, { recursive: true });
    await writeFile(path.join(OUT, 'readback.json'), JSON.stringify(results, null, 2));
    console.log('\n--- instrument readback ---');
    console.log(JSON.stringify(results, null, 2));

    // Assertions on the readback, so a green run means something.
    const problems = [];
    if (!results.off.present) problems.push('tape element was never built');
    if (results.off.visible) problems.push('D9.9: instrument visible during ordinary flight');
    if (!results.engaged.visible) problems.push('instrument did not reveal for an engaged burn');
    if (!/V-MAX \d+/.test(results.engaged.vmaxText || '')) problems.push('V-MAX line carries no numeric ceiling');
    if (!results.brake.brakeShown) problems.push('BRAKE NOW cue did not appear on a closing manual approach');
    if (results.retired.visible) problems.push('instrument did not retire (permanent panel with extra steps)');
    if (problems.length) {
      console.log('\nPROBLEMS:'); for (const p of problems) console.log('  - ' + p);
      process.exitCode = 1;
    } else {
      console.log('\nTravel tape capture OK — reveal, V-MAX, BRAKE NOW and retire all verified in-browser.');
    }
  } finally {
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
