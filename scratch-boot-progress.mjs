// Diagnostic: boot the game, poll mode + opening ledger until flight or timeout.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { loadPlaywright } from './scripts/lib/load-playwright.mjs';

const { chromium } = await loadPlaywright();
const port = await new Promise((resolve, reject) => {
  const probe = createNetServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});
const server = spawn(process.execPath, ['server.js', String(port)], {
  stdio: 'ignore',
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' },
});
const base = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 200; i++) {
  try { const r = await fetch(base); if (r.ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 150));
}
const browser = await chromium.launch({
  headless: false,
  args: [
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--window-size=1600,900',
  ],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.addInitScript(() => {
  try {
    sessionStorage.setItem('sf.cinematicSeen', '1');
    window.__SPACEFACE_PERF_COUNTERS__ = true;
    if (!localStorage.getItem('sf.settings.profile.v1')) {
      localStorage.setItem('sf.settings.profile.v1', JSON.stringify({
        version: 1,
        settings: { accessibility: { motionPreference: 'system' }, video: { motionReduce: true } },
      }));
    }
  } catch (_) { /* storage unavailable */ }
  if (window.__SF_BOOT_DISABLE_WIDENING__) window.__SF_DISABLE_COOK_WIDENING = true;
});
if (process.env.SF_DISABLE_COOK_WIDENING === '1') {
  await page.addInitScript(() => { window.__SF_DISABLE_COOK_WIDENING = true; });
}
const failed = [];
const errors = [];
const consoleLines = [];
page.on('requestfailed', (r) => failed.push(r.url()));
page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' || /frame error|STALLED|stall|fail|error/i.test(t)) {
    consoleLines.push(`[${m.type()}] ${t.slice(0, 240)}`);
  }
});
try {
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 150000 });
  console.log('[boot] SF up');
  await page.evaluate(() => {
    window.__BOOT_MODES__ = [];
    window.SF.bus.on('mode:changed', (p) => window.__BOOT_MODES__.push(`${p && p.mode}@${(performance.now() / 1000).toFixed(1)}`));
    window.SF.bus.emit('game:new', { name: 'BootProbe' });
  });
  const t0 = Date.now();
  let lastLog = '';
  while (Date.now() - t0 < 300000) {
    const snap = await page.evaluate(() => {
      const s = window.SF && window.SF.state;
      if (!s) return null;
      const d = (window.__SF_WITNESS__ && window.__SF_WITNESS__.latest) || {};
      const ledger = (s.render && s.render.openingCookLedger || []).map((e) => `${e.step}:${e.outcome || 'run'}`).slice(-8);
      return {
        mode: s.mode,
        firstFrame: !!(s.render && s.render.firstPlayableFrameAt),
        simTime: s.simTime,
        ledger,
        preSubmit: (() => {
          const v = s.render && s.render.openingSubmissionPreSubmitValidation;
          if (!v) return null;
          const slim = { ...v };
          for (const k of Object.keys(slim)) {
            if (Array.isArray(slim[k])) slim[k] = `[${slim[k].length}]`;
            else if (slim[k] && typeof slim[k] === 'object') {
              const inner = {};
              for (const kk of Object.keys(slim[k])) {
                inner[kk] = Array.isArray(slim[k][kk]) ? `[${slim[k][kk].length}]` : slim[k][kk];
              }
              slim[k] = inner;
            }
          }
          return slim;
        })(),
        shellAdm: !!(s.render && s.render.sectorShellAdmission),
        deferStream: !!(s.render && s.render.deferNoncriticalMeshStreaming),
        vfxFrozen: !!(s.render && s.render.openingVfxFrozen),
        docked: !!(s.ui && s.ui.docked),
        screens: s.ui && s.ui.screenStack && s.ui.screenStack.length,
        exec: d && d.executedFrames,
        req: d && d.requestedFrames,
        frameErr: d && d.frameErrorCount,
        consecErr: d && d.consecutiveFrameErrors,
        lastErr: d && d.lastFrameError,
        stalled: d && d.presentationStalled,
        suspended: d && d.suspended,
        lifecycle: d && d.lifecycle,
        firstDrawAt: s.render && s.render.openingSubmissionFirstDrawSubmittedAt,
        gpuCounts: !!(s.render && s.render.openingFirstVisibleGpuCounts),
        postVal: s.render && s.render.openingSubmissionValidation
          ? { ok: s.render.openingSubmissionValidation.ok, reason: s.render.openingSubmissionValidation.reason }
          : null,
        modes: (window.__BOOT_MODES__ || []).slice(-6),
        ctx: s.render && s.render.contextRecovery
          ? `L${s.render.contextRecovery.losses}/R${s.render.contextRecovery.restores}${s.render.contextRecovery.pending ? '/P' : ''}`
          : null,
        glLost: (() => {
          try {
            const r = s.render && s.render.renderer;
            const gl = r && typeof r.getContext === 'function' ? r.getContext() : null;
            return gl && typeof gl.isContextLost === 'function' ? gl.isContextLost() : 'n/a';
          } catch (e) { return `err:${e && e.message}`; }
        })(),
        rmod: (() => {
          try {
            const reg = window.SF && window.SF.registry;
            const mod = reg && (typeof reg.get === 'function' ? reg.get('render')
              : (reg.systems && reg.systems.find ? reg.systems.find((x) => x && x.name === 'render') : null));
            if (!mod) return 'no-mod';
            return {
              paintSched: mod._firstPlayablePaintScheduled === true,
              ctxLost: mod._contextLost === true,
              lcActive: mod._rendererLifecycle ? mod._rendererLifecycle.isActive() : 'null',
              lcGen: mod._rendererGeneration,
            };
          } catch (e) { return `err:${e && e.message}`; }
        })(),
        raf: (() => {
          try {
            if (window.__RAF_PING__ === undefined) {
              window.__RAF_PING__ = 0;
              const ping = () => { window.__RAF_PING__++; requestAnimationFrame(ping); };
              requestAnimationFrame(ping);
            }
            return window.__RAF_PING__;
          } catch (e) { return `err:${e && e.message}`; }
        })(),
        chain: (() => {
          try {
            if (window.__PAINT_CHAIN__ === undefined) {
              window.__PAINT_CHAIN__ = 'armed';
              requestAnimationFrame(() => {
                setTimeout(() => requestAnimationFrame(() => { window.__PAINT_CHAIN__ = 'fired'; }), 0);
              });
            }
            return window.__PAINT_CHAIN__;
          } catch (e) { return `err:${e && e.message}`; }
        })(),
        kick: (() => {
          // Once flight has run >30s with no first playable stamp and a stuck schedule flag,
          // re-arm it once — if the next frame then stamps, the original chain died.
          try {
            if (window.__PAINT_KICK__ || s.mode !== 'flight') return undefined;
            if (!(s.simTime > 30) || Number.isFinite(s.render && s.render.firstPlayableFrameAt)) return undefined;
            const reg = window.SF && window.SF.registry;
            const mod = reg && reg.systems && reg.systems.find
              ? reg.systems.find((x) => x && x.name === 'render') : null;
            if (!mod || mod._firstPlayablePaintScheduled !== true) return 'not-stuck';
            window.__PAINT_KICK__ = 'armed';
            mod._firstPlayablePaintScheduled = false;
            return 'reset';
          } catch (e) { return `err:${e && e.message}`; }
        })(),
        drawCalls: s.render && s.render.diagnostics && s.render.diagnostics.info
          && s.render.diagnostics.info.render && s.render.diagnostics.info.render.calls,
        vis: document.visibilityState,
      };
    }).catch(() => null);
    const line = JSON.stringify(snap);
    if (line !== lastLog) {
      console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, line);
      lastLog = line;
    }
    if (snap && snap.mode === 'flight' && snap.firstFrame) {
      console.log('FLIGHT REACHED');
      break;
    }
    await page.waitForTimeout(3000);
  }
  if (failed.length) console.log('FAILED REQUESTS:', failed.slice(0, 15));
  if (errors.length) console.log('PAGE ERRORS:', errors.slice(0, 10));
  if (consoleLines.length) console.log('CONSOLE:', consoleLines.slice(0, 15));
} finally {
  await browser.close().catch(() => {});
  server.kill();
}
