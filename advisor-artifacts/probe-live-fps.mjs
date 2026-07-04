// Measure the TRUE frame rate exactly as the player sees it: boot via server.js (the bat file path),
// read the game's own loop frameDt (frameDt = (now - last rAF) / 1000) from window.__SPACEFACE_PERF__
// and the diagnostics FPS, sampled live for several seconds. This is the real visible framerate,
// not the perf-probe's possibly-stale statistics.
import { spawn } from 'node:child_process';

const { chromium } = await import('playwright');

const PORT = 8123;
// Boot exactly like SpaceFace.bat does (plain server.js, no debug flags).
const server = spawn('node', ['server.js'], { cwd: process.cwd(), stdio: 'ignore' });

async function waitReachable(url, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('server unreachable');
}

try {
  await waitReachable(`http://127.0.0.1:${PORT}/`);
  // Launch with the SAME args the perf probe uses, but ALSO try without --use-gl to match a plain browser.
  const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1830, height: 973 } });
  page.on('console', () => {});
  page.on('pageerror', (e) => console.error('pageerror:', e.message));

  // Load the plain game URL (no ?debug=flight) — exactly what SpaceFace.bat opens.
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.state.render && window.SF.state.render.renderer), { timeout: 30000 });
  await page.evaluate(() => { try { window.SF.bus.emit('game:new', { seed: 47 }); } catch (e) {} });

  // Wait for flight.
  await page.waitForFunction(() => {
    const s = window.SF && window.SF.state;
    return s && s.mode === 'flight' && s.entities && s.entities.get(s.playerId);
  }, { timeout: 30000 }).catch(() => {});
  // settle
  await page.waitForTimeout(3000);

  // Read the GL renderer string + sample the live FPS for 6 seconds.
  const glInfo = await page.evaluate(() => {
    const r = window.SF.state.render.renderer;
    const gl = r.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: gl.getParameter(gl.VENDOR),
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '(no debug ext)',
      version: gl.getParameter(gl.VERSION),
      antialias: r.capabilities && r.capabilities.antialias,
    };
  });

  // Sample the game's OWN diagnostics FPS every 500ms for 6s — this is the visible framerate.
  const fpsSamples = [];
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(500);
    const snap = await page.evaluate(() => {
      const d = window.__THREE_GAME_DIAGNOSTICS__ && window.__THREE_GAME_DIAGNOSTICS__.getReport();
      const p = window.__SPACEFACE_PERF__ && window.__SPACEFACE_PERF__.getReport();
      return {
        diagFps: d ? d.fpsEma : null,
        diagFrameMs: d ? (d.frameMs && d.frameMs.last) : null,
        loopFrameDtMs: p && p.loop ? (p.loop.lastFrameDtMs) : null,
        mode: window.SF.state.mode,
      };
    });
    fpsSamples.push(snap);
  }

  await browser.close();

  console.log(JSON.stringify({
    gl: glInfo,
    liveSamples: fpsSamples,
    visibleFpsRange: {
      min: Math.min(...fpsSamples.map(s => s.diagFps || 9999)),
      max: Math.max(...fpsSamples.map(s => s.diagFps || 0)),
    },
  }, null, 2));
} finally {
  server.kill();
}
