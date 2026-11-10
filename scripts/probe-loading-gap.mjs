// Loading-animation gap probe — M0 instrument (b) of the Finish Program Lane 1 board.
//
// The owner watches the loading screen hitch. The artwork already draws inside workers
// (loadingTerminalArt.js GL/2D engine, orrery/bootRingWorker.js) — so this probe timestamps
// the ANIMATION'S OWN frames, not the main thread's: it rewrites every worker Blob whose
// source drives a canvas loop, wrapping self.requestAnimationFrame so each worker tick is
// timestamped worker-side and shipped back in batches. Worker timestamps plus the worker's
// own performance.timeOrigin reconstruct the wall-clock epoch of every drawn animation frame.
//
// Alongside, the probe records the presentation blockers the board's hypothesis names:
// main-thread rAF intervals, long tasks (>=50 ms) and the GL/driver events between the
// Launch click and the first playable flight frame. When animation production is steady
// but the screen still freezes, the gap is presentation (GPU-process stalls), not drawing.
//
//   node scripts/probe-loading-gap.mjs                  headed, real buttons
//   node scripts/probe-loading-gap.mjs --settle=0 --headless
//
// Output: .devshots/loading-gap/<stamp>.json + printed report. Observation only.

import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const HEADLESS = process.argv.includes('--headless');
const browserPath = process.env.SF_PROBE_BROWSER
  || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find((candidate) => existsSync(candidate));
const { chromium } = await loadPlaywright();

const INIT = `(() => {
  const anim = window.__loadAnim = {
    // worker frame epochs: one row per drawn animation frame { w: workerTag, t: epochMs }
    frames: [],
    mainRaf: [],   // main-thread rAF intervals { t, dt }
    longTasks: [], // { t, d }
    marks: {},     // named wall-clock marks the probe stamps (launchClick, firstFlight…)
    workers: 0,
  };
  const SNIPPET = \`
    ;(() => {
      const __sfTs = [];
      const raf = self.requestAnimationFrame && self.requestAnimationFrame.bind(self);
      const flush = () => { if (__sfTs.length) { const s = __sfTs.splice(0); try { postMessage({ __sfFrames: s, w0: performance.timeOrigin }); } catch (_) {} } };
      if (raf) {
        const inner = self.requestAnimationFrame;
        self.requestAnimationFrame = (cb) => inner((t) => { __sfTs.push(t); if (__sfTs.length >= 30) flush(); return cb(t); });
      }
      self.__sfFlush = flush;
      try { postMessage({ __sfHello: true, w0: performance.timeOrigin }); } catch (_) {}
    })();
  \`;
  // Capture worker-ish blob sources at construction so createObjectURL can serve an
  // instrumented twin instead. Only sources that drive an animation loop get wrapped.
  const RealBlob = window.Blob;
  const sources = new Map();
  window.Blob = class extends RealBlob {
    constructor(parts, opts) {
      super(parts, opts);
      try {
        const s = parts && parts[0];
        if (typeof s === 'string' && s.length > 400 && /requestAnimationFrame|onmessage/.test(s)) sources.set(this, s);
      } catch (_) {}
    }
  };
  const realCreate = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (obj) => {
    const src = sources.get(obj);
    if (src) return realCreate(new RealBlob([SNIPPET, src], { type: 'application/javascript' }));
    return realCreate(obj);
  };
  const RealWorker = window.Worker;
  let workerSeq = 0;
  window.Worker = class extends RealWorker {
    constructor(url, opts) {
      super(url, opts);
      const tag = (opts && opts.name) || ('w' + (++workerSeq));
      anim.workers++;
      let w0 = null;
      this.addEventListener('message', (e) => {
        const d = e && e.data;
        if (!d) return;
        if (d.__sfHello) { w0 = d.w0; return; }
        if (d.__sfFrames && Array.isArray(d.__sfFrames)) {
          const base = d.w0 != null ? d.w0 : (w0 != null ? w0 : 0);
          for (const t of d.__sfFrames) anim.frames.push({ w: tag, t: base + t });
        }
      });
    }
  };
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) anim.longTasks.push({ t: e.startTime + performance.timeOrigin, d: e.duration }); }).observe({ type: 'longtask', buffered: true });
  } catch (_) { /* unsupported */ }
  let last = 0;
  const rafTick = (t) => {
    if (last) anim.mainRaf.push({ t: t + performance.timeOrigin, dt: t - last });
    last = t;
    if (anim.mainRaf.length > 40000) anim.mainRaf.splice(0, anim.mainRaf.length - 40000);
    requestAnimationFrame(rafTick);
  };
  requestAnimationFrame(rafTick);
  window.__sfMark = (name) => { anim.marks[name] = performance.timeOrigin + performance.now(); };
})();`;

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) {
    const free = await new Promise((resolve) => {
      const s = createNetServer();
      s.once('error', () => resolve(false));
      s.once('listening', () => s.close(() => resolve(true)));
      s.listen(port, '127.0.0.1');
    });
    if (free) return port;
  }
  throw new Error('no free port');
}
async function startServer() {
  const port = await findFreePort(8660);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true,
    env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' },
  });
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error('dev server exited before it was reachable');
    try { if ((await fetch(url)).ok) return { baseUrl: url, kill: () => child.kill() }; } catch (_) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error('dev server never became reachable');
}
const clickButton = (page, label) => page.evaluate((wanted) => {
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const all = [...document.querySelectorAll('#screens button, #screens [role="button"], #ui-root button')];
  const b = all.find((x) => norm(x.textContent) === norm(wanted)) || all.find((x) => norm(x.textContent).includes(norm(wanted)));
  if (!b || b.disabled) return false;
  b.click();
  return true;
}, label);
async function waitForButton(page, label, timeout) {
  await page.waitForFunction((wanted) => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const b = [...document.querySelectorAll('#screens button, #screens [role="button"], #ui-root button')].find((x) => norm(x.textContent).includes(norm(wanted)));
    return !!b && !b.disabled;
  }, label, { timeout });
}

const pct = (arr, p) => { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y); return Math.round(a[Math.min(a.length - 1, Math.floor(a.length * p))] * 100) / 100; };

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({
    headless: HEADLESS,
    executablePath: browserPath || undefined,
    args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'],
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript(INIT);
  const page = await context.newPage();
  let shown = 0;
  page.on('pageerror', (e) => { if (shown++ < 10) console.log('[page error]', String(e && e.message || e).slice(0, 300)); });
  page.on('console', (m) => { if (m.type() === 'error' && shown++ < 10) console.log('[console error]', m.text().slice(0, 300)); });
  // Byte tally for the load bars (local server measure; deployed numbers differ by gzip/CDN).
  const bytes = { total: 0, js: 0, glb: 0, other: 0, responses: 0 };
  page.on('response', async (res) => {
    try {
      const len = Number((res.headers()['content-length'] || '0')) || 0;
      bytes.total += len; bytes.responses++;
      const url = res.url();
      if (/\.(m?js)(\?|$)/.test(url)) bytes.js += len;
      else if (/\.(glb|ktx2|bin)(\?|$)/.test(url)) bytes.glb += len;
      else bytes.other += len;
    } catch (_) { /* ignore */ }
  });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const report = { marks: {}, loadingAnim: {}, mainThread: {}, longTasks: [], bytes, hostBusy: { cpus: cpus().length } };
  try {
    const t0 = Date.now();
    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 240000 });
    report.marks.gotoAt = 0;
    await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 300000 });
    report.marks.sfReadyAt = Date.now() - t0;
    await page.waitForFunction(() => { const el = document.querySelector('[data-screen="mainMenu"]'); return el && getComputedStyle(el).display !== 'none'; }, null, { timeout: 300000 });
    report.marks.menuAt = Date.now() - t0;
    await page.waitForTimeout(800);

    // The real path a player takes: New Game screen -> Launch.
    if (!(await clickButton(page, 'New Game'))) {
      await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().toLowerCase() === 'play' && !x.disabled); if (b) b.click(); });
      await waitForButton(page, 'New Game', 60000);
      if (!(await clickButton(page, 'New Game'))) throw new Error('New Game button did not click');
    }
    await waitForButton(page, 'Launch', 120000);
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__sfMark('launchClick'));
    const launchAt = Date.now();
    if (!(await clickButton(page, 'Launch'))) throw new Error('Launch button did not click');
    // First playable flight frame is the game's own receipt, not a mode guess.
    await page.waitForFunction(() => {
      const st = window.SF && window.SF.state;
      return st && st.mode === 'flight' && Number.isFinite(st.render && st.render.firstPlayableFrameAt);
    }, null, { timeout: 600000 });
    await page.evaluate(() => window.__sfMark('firstFlight'));
    report.marks.launchToFirstFlightMs = Date.now() - launchAt;
    await page.waitForTimeout(2000); // let trailing animation frames land

    const data = await page.evaluate(() => window.__loadAnim);
    const launchEpoch = data.marks.launchClick, flightEpoch = data.marks.firstFlight;
    const inWindow = data.frames.filter((f) => launchEpoch && f.t >= launchEpoch - 2000 && f.t <= (flightEpoch || Infinity) + 1000);
    const gaps = [];
    const byWorker = new Map();
    for (const f of inWindow.sort((a, b) => a.t - b.t)) {
      if (!byWorker.has(f.w)) byWorker.set(f.w, []);
      byWorker.get(f.w).push(f.t);
    }
    const perWorker = {};
    for (const [w, ts] of byWorker) {
      const g = [];
      for (let i = 1; i < ts.length; i++) g.push(ts[i] - ts[i - 1]);
      perWorker[w] = { frames: ts.length, gapP50: pct(g, 0.5), gapP95: pct(g, 0.95), gapP99: pct(g, 0.99), longestGapMs: g.length ? Math.round(Math.max(...g)) : null };
      gaps.push(...g);
    }
    // The screen-level gap a player sees: worst stall across all animation workers.
    const screenGaps = gaps.sort((a, b) => a - b);
    report.loadingAnim = {
      instrumentedWorkers: Object.keys(perWorker).length,
      framesInWindow: inWindow.length,
      perWorker,
      gapP50: pct(screenGaps, 0.5), gapP95: pct(screenGaps, 0.95), gapP99: pct(screenGaps, 0.99),
      longestGapMs: screenGaps.length ? Math.round(screenGaps[screenGaps.length - 1]) : null,
      gapsOver100ms: screenGaps.filter((g) => g > 100).length,
      gapsOver1000ms: screenGaps.filter((g) => g > 1000).length,
    };
    const raf = data.mainRaf.filter((r) => launchEpoch && r.t >= launchEpoch - 2000 && r.t <= (flightEpoch || Infinity));
    const rafDt = raf.map((r) => r.dt);
    report.mainThread = {
      rafFrames: raf.length,
      frameP50: pct(rafDt, 0.5), frameP95: pct(rafDt, 0.95), frameP99: pct(rafDt, 0.99),
      longestFrameMs: rafDt.length ? Math.round(Math.max(...rafDt)) : null,
    };
    report.longTasks = data.longTasks
      .filter((l) => launchEpoch && l.t >= launchEpoch - 2000 && l.t <= (flightEpoch || Infinity) + 1000 && l.d >= 50)
      .map((l) => ({ at: Math.round(l.t - launchEpoch), ms: Math.round(l.d) }))
      .sort((a, b) => b.ms - a.ms).slice(0, 30);
    report.marks.animWorkerCount = data.workers;
    mkdirSync('.devshots/loading-gap', { recursive: true });
    const file = `.devshots/loading-gap/${stamp}.json`;
    writeFileSync(file, JSON.stringify(report, null, 1));
    console.log(JSON.stringify(report, null, 2));
    console.log(`[loading-gap] wrote ${file}`);
  } finally {
    await browser.close().catch(() => {});
    server.kill();
  }
}
main().catch((err) => { console.error('[loading-gap] FAILED:', (err && err.stack) || err); process.exit(1); });
