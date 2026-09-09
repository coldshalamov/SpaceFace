#!/usr/bin/env node
// PQ-016 evidence capture script — industrial beam verb contexts (cut, extract, repair, transfer)
// and reduced-motion/flash variants captured at default camera in .devshots/pq016-beam/

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'pq016-beam');
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });

function systemBrowserPath() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  return candidates.find((c) => existsSync(c)) || null;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const server = await acquireVisualProbeServer({ root: ROOT });
  const playwright = await loadPlaywright();
  const execPath = systemBrowserPath();

  const browser = await playwright.chromium.launch({
    executablePath: execPath || undefined,
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
  });

  const page = await browser.newPage({ viewport: VIEWPORT });

  try {
    console.log(`Navigating to ${server.baseUrl}...`);
    await page.goto(server.baseUrl, { waitUntil: 'load' });

    await page.waitForFunction(() => window.SF && window.SF.bus && window.SF.state, { timeout: 30_000 });

    // Start new game flight mode
    await page.evaluate(() => {
      window.SF.bus.emit('game:new', { name: 'BeamTester' });
    });

    await page.waitForFunction(() => window.SF.state && window.SF.state.mode === 'flight', { timeout: 30_000 });

    // Dismiss tutorial if present
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => /begin|dismiss|skip/i.test(b.textContent));
      if (btn) btn.click();
    });

    // Helper to trigger beam verbs and capture screenshots
    const contexts = [
      { name: '01_cut_verb.png', verb: 'cut', mode: 'cut' },
      { name: '02_extract_verb.png', verb: 'extract', mode: 'extract' },
      { name: '03_repair_verb.png', verb: 'repair', mode: 'repair' },
      { name: '04_transfer_verb.png', verb: 'transfer', mode: 'transfer' },
      { name: '05_reduced_motion.png', verb: 'extract', mode: 'extract', motionReduce: true },
      { name: '06_reduced_flash.png', verb: 'cut', mode: 'cut', flashReduce: true },
    ];

    for (const ctx of contexts) {
      await page.evaluate((c) => {
        const state = window.SF.state;
        if (!state) return;
        state.ui = state.ui || {};
        state.ui.beamMode = c.mode;
        if (c.motionReduce) {
          state.settings = state.settings || {};
          state.settings.video = state.settings.video || {};
          state.settings.video.motionReduce = true;
        }
        if (c.flashReduce) {
          state.settings = state.settings || {};
          state.settings.video = state.settings.video || {};
          state.settings.video.flashReduce = true;
        }
        // Emit mining/beam start for visual rendering
        const player = state.entities.get(state.playerId);
        let target = Array.from(state.entities.values()).find((e) => e.type === 'asteroid' || e.type === 'wreck' || e.type === 'ship');
        if (!target) {
          target = { id: 999, type: 'asteroid', alive: true, pos: { x: 50, z: 0 }, radius: 15, data: {} };
          state.entities.set(999, target);
        }
        window.SF.bus.emit('mining:start', { minerId: player ? player.id : 1, targetId: target.id, verb: c.verb, position: { x: target.pos.x, z: target.pos.z } });
      }, ctx);

      await page.waitForTimeout(500);

      const filePath = path.join(OUT, ctx.name);
      await page.screenshot({ path: filePath, type: 'png' });
      const st = await stat(filePath);
      assert.ok(st.size > 5000, `Screenshot ${ctx.name} must be > 5KB (got ${st.size} bytes)`);
      console.log(`Captured ${ctx.name} (${st.size} bytes)`);
    }

    console.log('All PQ-016 beam context captures completed successfully.');
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error('Capture script error:', err);
  process.exit(1);
});
