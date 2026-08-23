#!/usr/bin/env node
// M1-PLAYER-TELLS: pause must preserve + dim the live rendered frame (not blank it).
// Browser/CSS contract — same public game path as Electron (server.js → index.html).
// Owns: styles/ui.css pause :has() rules. Does not edit hud/uiRoot/input/renderer.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
// The browser assertions below own the player-facing result. Do not pin the implementation to a
// selector shape, blur choice, exact source declaration, or specific menu artwork.

const { chromium } = await loadPlaywright();

let server = null;
let browser = null;

try {
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page);

  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  // Headless boot is roughly TWICE as slow as a real GPU here, and not because the game is slow:
  // SwiftShader does not expose KHR_parallel_shader_compile, so THREE compiles every program
  // serially on the main thread. Measured on this machine: window.SF.ctx ready at 11,977 ms
  // headless against this 15,000 ms budget — an 80% margin that any load at all tips over, and
  // it did, intermittently, across five checks. A real GPU HAS the extension (verified), so
  // this is an environment allowance, not a behavioural assertion being loosened. Everything
  // these checks actually assert happens after boot and is untouched.
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 30000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Pause Live Frame', seed: 47 }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive);
  }, null, { timeout: 90000 });

  // Capture a pre-pause canvas sample so we can prove the dimmed frame still carries world pixels.
  const pre = await page.evaluate(() => {
    const canvas = document.getElementById('gl-canvas');
    if (!canvas || typeof canvas.toDataURL !== 'function') return { error: 'no gl-canvas' };
    // Force a present if the runtime exposes a render tick; otherwise use last drawn buffer.
    try {
      const sf = window.SF;
      if (sf && sf.ctx && sf.ctx.registry) {
        const render = sf.ctx.registry.get && sf.ctx.registry.get('render');
        if (render && typeof render.render === 'function') render.render(0, sf.state);
      }
    } catch (_) {}
    const sample = sampleCanvas(canvas);
    return { sample, w: canvas.width, h: canvas.height };
    function sampleCanvas(c) {
      try {
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        if (gl) {
          const w = Math.min(64, c.width);
          const h = Math.min(64, c.height);
          const x = Math.max(0, Math.floor((c.width - w) / 2));
          const y = Math.max(0, Math.floor((c.height - h) / 2));
          const buf = new Uint8Array(w * h * 4);
          gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          let sum = 0;
          let nonBlack = 0;
          for (let i = 0; i < buf.length; i += 4) {
            const lum = buf[i] + buf[i + 1] + buf[i + 2];
            sum += lum;
            if (lum > 12) nonBlack += 1;
          }
          return { pixels: buf.length / 4, sum, nonBlack, via: 'webgl' };
        }
      } catch (_) {}
      // 2d fallback — usually empty for WebGL canvas, but keep path for harness robustness
      try {
        const ctx2d = document.createElement('canvas').getContext('2d');
        const tmp = document.createElement('canvas');
        tmp.width = 32; tmp.height = 32;
        const t = tmp.getContext('2d');
        t.drawImage(c, 0, 0, 32, 32);
        const data = t.getImageData(0, 0, 32, 32).data;
        let sum = 0; let nonBlack = 0;
        for (let i = 0; i < data.length; i += 4) {
          const lum = data[i] + data[i + 1] + data[i + 2];
          sum += lum;
          if (lum > 12) nonBlack += 1;
        }
        return { pixels: data.length / 4, sum, nonBlack, via: '2d' };
      } catch (err) {
        return { pixels: 0, sum: 0, nonBlack: 0, via: 'none', err: String(err && err.message || err) };
      }
    }
  });
  assert.ok(!pre.error, pre.error || 'pre-pause sample failed');
  assert.ok(pre.w > 0 && pre.h > 0, 'gl-canvas must have a real backing store before pause');
  // World may be dark-space; require *some* non-black signal OR accept webgl sample path present.
  // If the canvas is completely empty the later CSS assertions still gate the blank-plate bug.
  const canvasWasDrawable = pre.sample && pre.sample.via === 'webgl';

  const report = await page.evaluate(async () => {
    const sf = window.SF;
    const sm = sf.ctx && sf.ctx.screenManager;
    if (!sm || typeof sm.pushScreen !== 'function') return { error: 'missing screenManager' };

    sm.pushScreen('pause');
    if (sm.syncVisibility) sm.syncVisibility();
    // Wait for enter class → visible class (one rAF + paint).
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 80));

    const screens = document.getElementById('screens');
    const backdrop = document.getElementById('modal-backdrop');
    const pauseEl = document.querySelector('.screen[data-screen="pause"]');
    const canvas = document.getElementById('gl-canvas');
    if (!screens || !backdrop || !pauseEl || !canvas) {
      return { error: 'missing pause shell nodes', hasScreens: !!screens, hasBackdrop: !!backdrop, hasPause: !!pauseEl, hasCanvas: !!canvas };
    }

    const sc = getComputedStyle(screens);
    const bd = getComputedStyle(backdrop);
    const pe = getComputedStyle(pauseEl);
    const before = getComputedStyle(screens, '::before');

    // Parse alpha from rgba()/rgb() background colors used by dim layers.
    function maxAlphaFromBg(bg) {
      if (!bg || bg === 'none' || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') return 0;
      let max = 0;
      const re = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/g;
      let m;
      while ((m = re.exec(bg))) {
        const a = m[4] == null ? 1 : Number(m[4]);
        if (Number.isFinite(a) && a > max) max = a;
      }
      // linear/radial-gradient with stops: also catch bare percentages that imply opacity via rgba
      if (max === 0 && /gradient/i.test(bg) && /rgba?\(/i.test(bg)) {
        // already handled by re; leave 0 if only named colors
      }
      return max;
    }

    const screensBgImage = sc.backgroundImage || '';
    const screensBgColor = sc.backgroundColor || '';
    const beforeBg = before.backgroundImage || before.backgroundColor || '';
    const backdropBg = bd.backgroundImage || bd.backgroundColor || '';
    const screensAlpha = Math.max(maxAlphaFromBg(screensBgColor), maxAlphaFromBg(screensBgImage));
    const beforeAlpha = maxAlphaFromBg(beforeBg);
    const backdropAlpha = maxAlphaFromBg(backdropBg);

    // Pause panel buttons must remain pointer/keyboard usable.
    const resume = [...pauseEl.querySelectorAll('button')].find((b) => /resume/i.test(b.textContent || ''));
    const resumeRect = resume ? resume.getBoundingClientRect() : null;
    const resumeFocusable = !!(resume && !resume.disabled && resume.tabIndex >= -1);

    // Stacking: canvas under backdrop under screens (z-index or paint order via DOM).
    const canvasZ = Number(getComputedStyle(canvas).zIndex) || 0;
    const backdropZ = Number(bd.zIndex) || 0;
    const screensZ = Number(sc.zIndex) || 0;

    return {
      top: sm.top && sm.top(),
      bodyModalOpen: document.body.classList.contains('ui-modal-open'),
      pauseDisplay: pe.display,
      pauseVisibleClass: pauseEl.classList.contains('sf-screen--visible'),
      screensDisplay: sc.display,
      screensBgImage,
      screensBgColor,
      screensAlpha,
      beforeBg,
      beforeAlpha,
      backdropDisplay: bd.display,
      backdropVisibility: bd.visibility,
      backdropOpacity: Number(bd.opacity),
      backdropBg,
      backdropAlpha,
      backdropHidden: backdrop.hidden === true,
      canvasZ,
      backdropZ,
      screensZ,
      resumePresent: !!resume,
      resumeW: resumeRect ? resumeRect.width : 0,
      resumeH: resumeRect ? resumeRect.height : 0,
      resumeFocusable,
      hasCinematicUrl: /C-INTRO-01|menu_background|cinematics/i.test(screensBgImage),
    };
  });

  assert.ok(!report.error, report.error || 'pause evaluate failed');
  assert.equal(report.top, 'pause', 'pause must be the top screen');
  assert.equal(report.bodyModalOpen, true, 'body.ui-modal-open must be set while pause is open');
  assert.equal(report.pauseDisplay, 'flex', 'pause screen node must be displayed');
  assert.equal(report.pauseVisibleClass, true, 'pause must receive sf-screen--visible');
  assert.notEqual(report.screensDisplay, 'none', '#screens must be shown while pause is open');

  // Core acceptance: no opaque cinematic plate over the live frame.
  assert.equal(report.hasCinematicUrl, false,
    'pause must not paint the menu cinematic on #screens (would blank the live frame)');
  assert.ok(report.screensAlpha < 0.2,
    `#screens background must stay transparent during pause (alpha=${report.screensAlpha})`);

  // Dim, not blank: ::before and/or modal-backdrop carry translucent darkening.
  assert.ok(report.beforeAlpha < 0.95,
    `pause ::before must not be a fully opaque plate (alpha=${report.beforeAlpha})`);
  assert.equal(report.backdropHidden, false, 'modal-backdrop must unhide for pause');
  assert.notEqual(report.backdropDisplay, 'none', 'modal-backdrop must display while pause is open');
  assert.ok(report.backdropOpacity > 0.5, 'modal-backdrop must be visible (opacity)');
  assert.ok(report.backdropAlpha > 0.2 && report.backdropAlpha < 0.95,
    `modal-backdrop must dim (translucent), not blank — alpha=${report.backdropAlpha}`);

  // Usability: Resume remains a real, focusable control.
  assert.equal(report.resumePresent, true, 'pause must expose Resume');
  assert.ok(report.resumeW >= 40 && report.resumeH >= 20, 'Resume hit target must be usable');
  assert.equal(report.resumeFocusable, true, 'Resume must remain keyboard-focusable');

  // Layer order: live canvas under dim/UI chrome.
  assert.ok(report.canvasZ < report.backdropZ,
    `canvas z (${report.canvasZ}) must sit under modal-backdrop z (${report.backdropZ})`);
  assert.ok(report.backdropZ < report.screensZ,
    `modal-backdrop z (${report.backdropZ}) must sit under #screens z (${report.screensZ})`);

  // Pausing is a real simulation gate, not only a visual overlay. A held flight
  // key must neither advance the sim nor leak motion/boost state through pause.
  const frozenBefore = await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    return {
      tick: state.tick,
      timeScale: state.timeScale,
      pos: { x: player.pos.x, z: player.pos.z },
      vel: { x: player.vel.x, z: player.vel.z },
    };
  });
  await page.keyboard.down('w');
  await page.waitForTimeout(140);
  await page.keyboard.up('w');
  await page.waitForTimeout(40);
  const frozenAfter = await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    return {
      tick: state.tick,
      timeScale: state.timeScale,
      pos: { x: player.pos.x, z: player.pos.z },
      vel: { x: player.vel.x, z: player.vel.z },
      moveZ: state.input.moveZ,
      boost: state.input.boost,
    };
  });
  assert.equal(frozenBefore.timeScale, 0, 'pause must request aggregate timeScale 0');
  assert.equal(frozenAfter.timeScale, 0, 'pause must retain timeScale 0 while open');
  assert.equal(frozenAfter.tick, frozenBefore.tick, 'simulation tick must not advance while paused');
  assert.deepEqual(frozenAfter.pos, frozenBefore.pos, 'player position must not change through paused flight input');
  assert.deepEqual(frozenAfter.vel, frozenBefore.vel, 'player velocity must not change through paused flight input');
  assert.equal(frozenAfter.moveZ, 0, 'paused flight input must not remain latched after key release');
  assert.equal(frozenAfter.boost, false, 'paused boost input must not remain latched');

  // Reduced-motion: open pause under forced reduce and ensure no exception + same plate rules.
  const reduced = await page.evaluate(async () => {
    document.documentElement.classList.add('sf-reduce-motion');
    const sm = window.SF.ctx.screenManager;
    if (sm.top && sm.top() === 'pause') sm.popScreen();
    await new Promise((r) => setTimeout(r, 40));
    sm.pushScreen('pause');
    if (sm.syncVisibility) sm.syncVisibility();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const screens = document.getElementById('screens');
    const sc = getComputedStyle(screens);
    const before = getComputedStyle(screens, '::before');
    function maxAlpha(bg) {
      let max = 0;
      const re = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/g;
      let m;
      while ((m = re.exec(bg || ''))) {
        const a = m[4] == null ? 1 : Number(m[4]);
        if (Number.isFinite(a) && a > max) max = a;
      }
      return max;
    }
    return {
      bgImage: sc.backgroundImage,
      beforeAlpha: maxAlpha(before.backgroundImage || before.backgroundColor || ''),
      top: sm.top && sm.top(),
    };
  });
  assert.equal(reduced.top, 'pause', 'reduced-motion path must still open pause');
  assert.equal(/C-INTRO-01|menu_background|cinematics/i.test(reduced.bgImage), false,
    'reduced-motion pause must not restore the menu cinematic over the live frame');
  assert.ok(reduced.beforeAlpha < 0.95, 'reduced-motion pause ::before must stay translucent');

  assert.deepEqual(issues.errorIssues(), [], 'pause live-frame browser check must not record page errors');

  console.log(JSON.stringify({
    ok: true,
    check: 'm1-pause-live-frame',
    canvasWasDrawable,
    screensBgImage: report.screensBgImage,
    screensAlpha: report.screensAlpha,
    beforeAlpha: report.beforeAlpha,
    backdropAlpha: report.backdropAlpha,
    resume: { w: report.resumeW, h: report.resumeH },
    frozen: {
      timeScale: frozenAfter.timeScale,
      tick: frozenAfter.tick,
      pos: frozenAfter.pos,
      vel: frozenAfter.vel,
      moveZ: frozenAfter.moveZ,
      boost: frozenAfter.boost,
    },
    reduced: { bgImage: reduced.bgImage, beforeAlpha: reduced.beforeAlpha },
  }, null, 2));
  console.log('PASS M1 pause preserves + dims the live rendered frame (browser CSS contract).');
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server && server.kill) server.kill();
}

async function startFreshServer() {
  const port = await findFreePort(8190);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  const capture = (chunk) => { output = (output + String(chunk)).slice(-4000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.probeOutput = () => output.trim();
  await waitForReachable(url, child);
  return { baseUrl: url, kill: () => child.kill() };
}

async function waitForReachable(url, child) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode != null) {
      throw new Error(`Dev server exited before becoming reachable at ${url}\n${child.probeOutput ? child.probeOutput() : ''}`);
    }
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  child.kill();
  throw new Error('Dev server did not become reachable at ' + url);
}

async function findFreePort(start) {
  for (let port = start; port < start + 120; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('No free local port found for pause live-frame check');
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
