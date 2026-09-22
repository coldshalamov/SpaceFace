#!/usr/bin/env node
// Cold boot → first control (firstPlayableFrameAt), three runs, stage timeline.
// Report-only outbox helper. Does not change the live loader.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../../..');
const RUNS = Math.max(1, Number(process.env.BOOT_TIMES_RUNS || 3));
const OUT_JSON = join(HERE, 'raw-runs.json');

// Repo root is four levels up from design/program/vm-drop/boot-times/
// design/program/vm-drop/boot-times -> .. = vm-drop, ../.. = program, ../../.. = design, ../../../.. = root
const REPO = join(HERE, '..', '..', '..', '..');

const { loadPlaywright } = await import(join(REPO, 'scripts/lib/load-playwright.mjs'));
const { chromium } = await loadPlaywright();

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`server did not answer at ${url}`);
}

function hostBusyPct(a, b) {
  const total = b.total - a.total;
  return total > 0 ? 100 * (1 - (b.idle - a.idle) / total) : 0;
}

function cpuSnapshot() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    for (const value of Object.values(cpu.times)) total += value;
    idle += cpu.times.idle;
  }
  return { idle, total };
}

async function oneColdRun(baseUrl, runIndex) {
  const cpuBefore = cpuSnapshot();
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--window-size=1600,900',
      '--use-angle=swiftshader-webgl',
      '--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    // Cold: no prior HTTP cache / storage in this context.
  });
  const page = await context.newPage();
  const consoleNoise = [];
  page.on('pageerror', (err) => consoleNoise.push(`[pageerror] ${String(err).slice(0, 200)}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleNoise.push(`[console] ${msg.text().slice(0, 200)}`);
  });

  try {
    await page.addInitScript(() => {
      for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
        const original = console[method].bind(console);
        console[method] = (...args) => original(...args.map((arg) => (
          typeof arg === 'string' && arg.length > 4096
            ? `${arg.slice(0, 4096)}…[+${arg.length - 4096} chars]`
            : arg
        )));
      }
      try {
        // Skip intro cinematic so the clock measures boot→menu→flight, not the splash hold.
        sessionStorage.setItem('sf.cinematicSeen', '1');
      } catch { /* ok */ }
      window.__SF_BOOT_STAGES__ = [];
      const stamp = (id, extra) => {
        window.__SF_BOOT_STAGES__.push({
          id,
          t: performance.now(),
          wall: Date.now(),
          ...(extra || {}),
        });
      };
      window.__SF_BOOT_STAMP__ = stamp;
      stamp('init-script');
    });

    const navWall = Date.now();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.evaluate(() => window.__SF_BOOT_STAMP__('domcontentloaded'));

    await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 180_000 });
    await page.evaluate(() => {
      window.__SF_BOOT_STAMP__('sf-ready');
      // Subscribe to loading-stage bus events for stage attribution.
      try {
        const bus = window.SF.bus;
        const note = (id, p) => window.__SF_BOOT_STAMP__(id, {
          stageId: p && (p.id || p.stageId || p.name) || null,
          detail: p && (p.label || p.message || p.phase) || null,
        });
        for (const evt of [
          'ui:loading-stage',
          'loading:stage',
          'loading:progress',
          'loading:begin',
          'loading:end',
          'game:scenePrepared',
          'game:started',
        ]) {
          try {
            bus.on(evt, (p) => note(evt, p || {}));
          } catch { /* optional */ }
        }
        // loadingPresenter publishes via overlay dataset; poll as fallback.
        if (!window.__SF_BOOT_STAGE_POLL__) {
          window.__SF_BOOT_STAGE_POLL__ = setInterval(() => {
            const o = document.getElementById('boot-overlay');
            const sid = o && o.dataset && o.dataset.loadingStage;
            if (sid && sid !== window.__SF_BOOT_LAST_STAGE__) {
              window.__SF_BOOT_LAST_STAGE__ = sid;
              window.__SF_BOOT_STAMP__('loading-stage-poll', { stageId: sid });
            }
          }, 50);
        }
      } catch { /* ok */ }
    });

    // Dismiss splash if still present.
    const splash = page.locator('#cinematic-splash');
    if (await splash.isVisible().catch(() => false)) {
      await splash.click({ position: { x: 12, y: 12 }, timeout: 5_000 }).catch(() => {});
      await splash.waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => {});
      await page.evaluate(() => window.__SF_BOOT_STAMP__('intro-dismissed'));
    }

    await page.waitForFunction(() => {
      const visible = (el) => {
        if (!el || el.hidden) return false;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden'
          && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
      };
      const overlay = document.getElementById('boot-overlay') || document.querySelector('.boot-overlay');
      const overlayGone = !overlay || !visible(overlay)
        || overlay.classList.contains('hidden')
        || overlay.getAttribute('aria-hidden') === 'true';
      return overlayGone && visible(document.querySelector('[data-screen="mainMenu"]'));
    }, null, { timeout: 120_000 });
    await page.evaluate(() => window.__SF_BOOT_STAMP__('main-menu-visible'));

    // First control on title: first enabled menu word (Continue / New Game / Crucible…).
    const firstControl = await page.evaluate(() => {
      const menu = document.querySelector('[data-screen="mainMenu"]');
      const buttons = [...(menu ? menu.querySelectorAll('.k-word[data-action], button.k-word') : [])];
      const enabled = buttons.find((b) => b.getAttribute('aria-disabled') !== 'true' && !b.disabled);
      const pick = enabled || buttons[0] || null;
      window.__SF_BOOT_STAMP__('first-title-control', {
        action: pick && pick.getAttribute('data-action'),
        label: pick && (pick.getAttribute('aria-label') || pick.textContent || '').trim().slice(0, 40),
      });
      return pick ? {
        action: pick.getAttribute('data-action'),
        label: (pick.getAttribute('aria-label') || pick.textContent || '').trim().slice(0, 40),
      } : null;
    });

    // Path to ship control: New Game → Launch (ordinary cold open).
    await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 30_000 });
    await page.waitForSelector('[data-screen="newGame"]', { state: 'visible', timeout: 30_000 });
    await page.evaluate(() => window.__SF_BOOT_STAMP__('new-game-visible'));
    await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 30_000 });
    await page.evaluate(() => window.__SF_BOOT_STAMP__('launch-clicked'));

    await page.waitForFunction(() => {
      const state = window.SF && window.SF.state;
      return state && state.mode === 'flight'
        && Number.isFinite(state.render && state.render.firstPlayableFrameAt);
    }, null, { timeout: 560_000 });
    await page.evaluate(() => window.__SF_BOOT_STAMP__('first-playable'));

    const gpu = await page.evaluate(() => {
      try {
        const canvas = document.querySelector('#gl-canvas') || document.querySelector('canvas');
        const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
        if (!gl) return null;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
          renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        };
      } catch {
        return null;
      }
    });

    const stages = await page.evaluate(() => {
      try { clearInterval(window.__SF_BOOT_STAGE_POLL__); } catch { /* ok */ }
      return window.__SF_BOOT_STAGES__ || [];
    });

    const firstPlayableWall = Date.now();
    const totalMs = firstPlayableWall - navWall;
    const menuStage = stages.find((s) => s.id === 'main-menu-visible');
    const playableStage = stages.find((s) => s.id === 'first-playable');
    const t0 = stages.find((s) => s.id === 'domcontentloaded')?.t
      ?? stages.find((s) => s.id === 'init-script')?.t
      ?? 0;

    // Build contiguous phase list from key stamps + loading polls.
    const keyOrder = [
      'domcontentloaded',
      'sf-ready',
      'intro-dismissed',
      'main-menu-visible',
      'first-title-control',
      'new-game-visible',
      'launch-clicked',
    ];
    const marks = [];
    for (const id of keyOrder) {
      const hit = stages.find((s) => s.id === id);
      if (hit) marks.push({ name: id, t: hit.t, extra: hit });
    }
    for (const s of stages) {
      if (s.id === 'loading-stage-poll' || s.id === 'ui:loading-stage' || s.id === 'loading:stage') {
        marks.push({
          name: `loading:${s.stageId || s.detail || 'unknown'}`,
          t: s.t,
          extra: s,
        });
      }
    }
    const playable = stages.find((s) => s.id === 'first-playable');
    if (playable) marks.push({ name: 'first-playable', t: playable.t, extra: playable });
    marks.sort((a, b) => a.t - b.t);

    // Dedupe consecutive identical loading names.
    const deduped = [];
    for (const m of marks) {
      if (deduped.length && deduped[deduped.length - 1].name === m.name) continue;
      deduped.push(m);
    }

    const phases = [];
    for (let i = 0; i < deduped.length - 1; i++) {
      const from = deduped[i];
      const to = deduped[i + 1];
      const dur = to.t - from.t;
      if (dur < 0) continue;
      phases.push({
        name: `${from.name} → ${to.name}`,
        from: from.name,
        to: to.name,
        ms: Math.round(dur),
      });
    }

    let longest = null;
    for (const p of phases) {
      if (!longest || p.ms > longest.ms) longest = p;
    }

    const cpuAfter = cpuSnapshot();
    const result = {
      run: runIndex,
      navWallIso: new Date(navWall).toISOString(),
      totalMs,
      totalS: Number((totalMs / 1000).toFixed(2)),
      bootToMenuMs: menuStage ? Math.round(menuStage.t - t0) : null,
      bootToFirstControlMs: playableStage ? Math.round(playableStage.t - t0) : totalMs,
      firstTitleControl: firstControl,
      longestStage: longest,
      phases,
      marks: deduped.map((m) => ({ name: m.name, tMs: Math.round(m.t - t0) })),
      gpu,
      hostBusyPct: Number(hostBusyPct(cpuBefore, cpuAfter).toFixed(1)),
      consoleNoise: consoleNoise.slice(0, 12),
    };
    console.log(JSON.stringify({ run: runIndex, totalS: result.totalS, longest: longest && longest.name, longestMs: longest && longest.ms }, null, 0));
    return result;
  } finally {
    try { await context.close(); } catch { /* ok */ }
    try { await browser.close(); } catch { /* ok */ }
  }
}

const port = await freePort();
const server = spawn(process.execPath, ['server.js', String(port)], {
  cwd: REPO,
  stdio: 'ignore',
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' },
});
const baseUrl = `http://127.0.0.1:${port}/`;
const runs = [];
try {
  await waitForServer(baseUrl);
  console.log(`[boot-times] server ${baseUrl}; ${RUNS} cold runs`);
  for (let i = 1; i <= RUNS; i++) {
    console.log(`[boot-times] run ${i}/${RUNS} starting…`);
    const result = await oneColdRun(baseUrl, i);
    runs.push(result);
    // Brief idle between cold runs so the host settles.
    await new Promise((r) => setTimeout(r, 2000));
  }
} finally {
  try { server.kill(); } catch { /* ok */ }
}

mkdirSync(HERE, { recursive: true });
writeFileSync(OUT_JSON, JSON.stringify({
  when: new Date().toISOString(),
  host: os.hostname(),
  platform: `${os.type()} ${os.release()}`,
  cpus: os.cpus().length,
  model: os.cpus()[0]?.model,
  loadavg: os.loadavg(),
  node: process.version,
  runs,
}, null, 2));
console.log(`[boot-times] wrote ${OUT_JSON}`);
const times = runs.map((r) => r.totalS);
console.log(`[boot-times] totals (s): ${times.join(', ')}`);
