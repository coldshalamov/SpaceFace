#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const SHOT_DIR = '.devshots/pirate-parley';
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 800, height: 600 },
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort(start = 8370) {
  for (let port = start; port < start + 100; port++) {
    const free = await new Promise((resolve) => {
      const server = createServer();
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error('No free pirate parley browser-check port');
}

async function waitReachable(url) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return; } catch (_) {}
    await sleep(100);
  }
  throw new Error(`Fixture server did not become reachable: ${url}`);
}

let child = null;
let browser = null;
try {
  mkdirSync(SHOT_DIR, { recursive: true });
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}/`;
  child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  await waitReachable(baseUrl);
  browser = await chromium.launch({ headless: true });

  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error && error.message || error)));
    await page.goto(`${baseUrl}test/pirate-parley-prompt-fixture.html`, { waitUntil: 'networkidle' });
    await page.locator('#sf-pirate-parley').waitFor({ state: 'visible' });

    const proof = await page.evaluate(() => {
      const root = document.getElementById('sf-pirate-parley');
      const rect = root.getBoundingClientRect();
      return {
        text: root.textContent.replace(/\s+/g, ' ').trim(),
        role: root.getAttribute('role'),
        modal: root.getAttribute('aria-modal'),
        aria: root.getAttribute('aria-label'),
        buttonCount: root.querySelectorAll('button').length,
        areaRatio: (rect.width * rect.height) / (innerWidth * innerHeight),
        centerCovered: rect.left < innerWidth * 0.60 && rect.right > innerWidth * 0.40
          && rect.top < innerHeight * 0.60 && rect.bottom > innerHeight * 0.40,
      };
    });
    assert.match(proof.text, /CUTLASS-7.*CRIMSON REACH/i);
    assert.match(proof.text, /JETTISON 3 METALS/i);
    assert.match(proof.text, /Profit motive.*weapons held/i);
    assert.match(proof.text, /RESPONSE 8\.0 S/i);
    assert.match(proof.text, /COMPLY.*REFUSE.*RUN 1\.2 KM/i);
    assert.equal(proof.role, 'region');
    assert.equal(proof.modal, null, 'parley strip is non-modal');
    assert.match(proof.aria, /Choose comply, refuse, or run/i);
    assert.equal(proof.buttonCount, 3);
    assert.ok(proof.areaRatio < 0.20, `parley covers ${(proof.areaRatio * 100).toFixed(1)}% of viewport`);
    assert.equal(proof.centerCovered, false, 'parley never covers the central combat read');

    await page.evaluate(() => window.sfParleyFixture.advance(1.25));
    await page.waitForFunction(() => document.querySelector('[data-k=timer]')?.textContent.includes('6.8 S'));
    await page.screenshot({ path: `${SHOT_DIR}/${viewport.width}x${viewport.height}.png`, fullPage: true });
    assert.deepEqual(errors, [], 'fixture has no browser errors');
    await page.close();
  }

  // Click path: run acknowledges intent without pausing, then a sim-owned evasion event produces a receipt.
  const clickPage = await browser.newPage({ viewport: VIEWPORTS[0] });
  await clickPage.goto(`${baseUrl}test/pirate-parley-prompt-fixture.html`, { waitUntil: 'networkidle' });
  await clickPage.locator('[data-choice=run]').click();
  let clickProof = await clickPage.evaluate(() => ({
    mode: window.sfParleyFixture.state.mode,
    event: window.sfParleyFixture.emitted.filter((e) => e.name === 'pirateParley:choose').at(-1),
    running: document.getElementById('sf-pirate-parley').classList.contains('sf-parley--running'),
  }));
  assert.equal(clickProof.mode, 'flight');
  assert.equal(clickProof.event.payload.choice, 'run');
  assert.equal(clickProof.event.payload.source, 'click');
  assert.equal(clickProof.running, true);
  await clickPage.evaluate(() => window.sfParleyFixture.resolve('evaded'));
  await clickPage.waitForFunction(() => document.querySelector('[data-k=receipt]')?.textContent.includes('intercept radius'));
  const receiptProof = await clickPage.evaluate(() => ({
    actionsVisible: getComputedStyle(document.querySelector('[data-k=actions]')).display !== 'none',
    whyVisible: getComputedStyle(document.querySelector('[data-k=why]')).display !== 'none',
  }));
  assert.equal(receiptProof.actionsVisible, false, 'resolved receipt retires obsolete choices');
  assert.equal(receiptProof.whyVisible, false, 'resolved receipt retires obsolete motive instructions');
  await clickPage.screenshot({ path: `${SHOT_DIR}/receipt-1920x1080.png`, fullPage: true });
  await clickPage.close();

  // Keyboard path: the visible numeric binding emits the same canonical event.
  const keyPage = await browser.newPage({ viewport: VIEWPORTS[1] });
  await keyPage.goto(`${baseUrl}test/pirate-parley-prompt-fixture.html`, { waitUntil: 'networkidle' });
  await keyPage.keyboard.press('Digit2');
  const keyChoice = await keyPage.evaluate(() => window.sfParleyFixture.emitted
    .filter((e) => e.name === 'pirateParley:choose').at(-1));
  assert.equal(keyChoice.payload.choice, 'refuse');
  assert.equal(keyChoice.payload.source, 'keyboard');
  await keyPage.close();

  // Controller path: existing gamepad action authority (A/accept) emits canonical comply.
  const padPage = await browser.newPage({ viewport: VIEWPORTS[1] });
  await padPage.goto(`${baseUrl}test/pirate-parley-prompt-fixture.html`, { waitUntil: 'networkidle' });
  const padChoice = await padPage.evaluate(() => {
    const fixture = window.sfParleyFixture;
    fixture.gamepad.actions.accept = { pressed:true, held:true, released:false, value:1 };
    fixture.prompt.tick();
    return fixture.emitted.filter((e) => e.name === 'pirateParley:choose').at(-1);
  });
  assert.equal(padChoice.payload.choice, 'comply');
  assert.equal(padChoice.payload.source, 'gamepad');
  await padPage.close();

  console.log('Pirate parley browser proof OK: 3 responsive viewports, click + keyboard + controller, deterministic timer, zero browser errors.');
} finally {
  if (browser) await browser.close().catch(() => {});
  if (child && !child.killed) child.kill();
}
