// Live-compile probe (GPU engineer, 2026-11-22). Plays a Swarm run in the Ricochet Foundry the way
// a hand does (fire held, turning, level-up picks taken, the armory launched between rounds) and
// reports everything that should have happened behind the loading veil but happened in flight:
//
//   programs      every shader program created after the first playable frame, with the object,
//                 scene root and material that own it, and whether it was created inside a presented
//                 scene pass (globalThis.__SF_LIVE_PROGRAMS__, src/render/bloom.js)
//   tasks         every background task over 4 ms, by the file:line that armed it
//                 (globalThis.__SF_BG_TASKS__, src/render/compilePresentSlice.js)
//   long frames   long-animation-frame entries over 50 ms while the world was live, with scripts
//   gaps          presented-frame intervals over 100 ms while the world was live
//   bricks        the renderer's own "[GPU brick]" first-use warnings
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/probe-live-compile.mjs \
//     [--round=1] [--arena=helios_core] [--secs=300] [--tag=live-compile] [--query=rfx=...]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const { loadPlaywright } = await import(pathToFileURL(path.join(ROOT, 'scripts/lib/load-playwright.mjs')).href);
const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const ROUND = arg('round', '1');
const ARENA = arg('arena', 'helios_core');
const SECS = Number(arg('secs', 300));
const TAG = arg('tag', 'live-compile');
const QUERY = String(arg('query', ''));
const OUT = path.join(ROOT, '.devshots', 'gpu', TAG);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => { const p = createNetServer(); p.once('error', rej); p.listen(0, '127.0.0.1', () => { const { port } = p.address(); p.close(() => res(port)); }); });

const report = { round: ROUND, arena: ARENA, secs: SECS, errors: [], bricks: [], picks: 0, launches: 0 };
const port = await freePort();
const server = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' } });
const { chromium } = await loadPlaywright();
let browser;
try {
  const q = new URLSearchParams(QUERY);
  q.set('swarmRound', ROUND);
  if (ARENA) q.set('swarmArena', ARENA);
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch {} await sleep(150); }
  browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    // Owner rule: probe windows never steal focus. Off-screen, never brought to front.
    '--window-position=-32000,-32000', '--no-first-run'] });
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { if (report.errors.length < 20) report.errors.push(String(e.message || e).slice(0, 300)); });
  page.on('console', (m) => {
    const t = m.text();
    if (/GPU brick/.test(t) && report.bricks.length < 60) report.bricks.push({ at: Date.now(), text: t.slice(0, 900) });
    if (/\[render\] (GPU:|parallel shader compile)/.test(t)) (report.bootLines || (report.bootLines = [])).push(t.slice(0, 300));
  });
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch {}
    globalThis.__SF_TASK_TRACE__ = true;
    globalThis.__lc = { loaf: [], gaps: [], programs: [], last: 0, live: false, liveSince: 0, seenPrograms: -1, frames: 0, liveFrames: 0 };
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.duration < 50) continue;
          const L = globalThis.__lc;
          if (L.loaf.length >= 400) continue;
          L.loaf.push({ at: Math.round(e.startTime), ms: Math.round(e.duration), blocking: Math.round(e.blockingDuration || 0), live: L.live && e.startTime > L.liveSince + 1500,
            scripts: (e.scripts || []).map((s) => ({ ms: Math.round(s.duration), fn: s.sourceFunctionName || '', inv: String(s.invoker || '').slice(0, 60), url: String(s.sourceURL || '').replace(/^.*\/src\//, 'src/').replace(/\?.*$/, '') })).filter((s) => s.ms >= 4).sort((a, b) => b.ms - a.ms).slice(0, 5) });
        }
      }).observe({ type: 'long-animation-frame', buffered: true });
    } catch (_) { globalThis.__lc.loafUnsupported = true; }
  });
  await page.goto(`http://127.0.0.1:${port}/?${q}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 180000 });
  const pressScreens = () => page.evaluate(() => {
    const n = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const buttons = [...document.querySelectorAll('#screens button, #screens [role="button"]')].filter((x) => x.offsetParent && !x.disabled);
    const take = buttons.find((x) => /TAKE$/i.test(n(x.textContent)));
    if (take) { take.click(); return 'pick'; }
    const again = buttons.find((x) => /^(Retry|Restart|Run it again|Run again|Play again|New run|Try again)/i.test(n(x.textContent)));
    if (again) { again.click(); return 'retry'; }
    const b = buttons.find((x) => /^(Launch round \d+|Launch|Keep current loadout|Continue|Start round|Begin|Fight|Respawn)/i.test(n(x.textContent)));
    if (b) { const label = n(b.textContent); b.click(); return /^Launch/i.test(label) ? 'launch' : 'continue'; }
    return null;
  }).catch(() => null);
  const t0 = Date.now();
  for (;;) {
    const st = await page.evaluate(() => { const s = window.SF.state; const d = window.__THREE_GAME_DIAGNOSTICS__; return { flight: s.mode === 'flight' && Number.isFinite(s.render && s.render.firstPlayableFrameAt), mode: s.mode, calls: d && d.info ? d.info.calls : 0 }; }).catch(() => ({}));
    if (st.flight && st.calls > 0) break;
    await pressScreens();
    if (Date.now() - t0 > 400000) throw new Error(`no flight (mode ${st.mode})`);
    await sleep(1000);
  }
  report.loadS = +((Date.now() - t0) / 1000).toFixed(1);
  await page.mouse.move(1000, 380);
  // ---- in-page recorder: starts at the first playable frame ----
  await page.evaluate(() => {
    const S = window.SF.state;
    const r = S.render.renderer;
    const L = globalThis.__lc;
    L.startedAt = performance.now();
    L.seenPrograms = r.info.programs.length;
    L.programsAtStart = L.seenPrograms;
    const ownersOf = (wrappers) => {
      const set = new Set(wrappers);
      const rows = [];
      const scene = S.render.scene;
      scene.traverse((o) => {
        if (rows.length >= 40 || !o.material) return;
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
          let rec = null;
          try { rec = r.properties.get(m); } catch (_) { continue; }
          if (!rec) continue;
          let hit = rec.currentProgram && set.has(rec.currentProgram) ? rec.currentProgram : null;
          if (!hit && rec.programs && rec.programs.values) for (const v of rec.programs.values()) if (set.has(v)) { hit = v; break; }
          if (!hit) continue;
          let root = o; while (root.parent && root.parent !== scene) root = root.parent;
          rows.push({ program: hit.id, object: String(o.name || o.type).slice(0, 48), root: String(root.name || root.type).slice(0, 60), material: String(m.name || m.type).slice(0, 40), type: m.type, inst: !!o.isInstancedMesh, visible: o.visible });
          break;
        }
      });
      return rows;
    };
    const loop = () => {
      const now = performance.now();
      const live = S.mode === 'flight' && !S.paused && Number(S.timeScale) > 0 && S.render.flightVeilHoldsSim !== true;
      if (live && !L.live) L.liveSince = now;
      if (L.last && live && L.live && now - L.liveSince > 1500 && now - L.last > 100 && L.gaps.length < 300) L.gaps.push({ at: Math.round(now), ms: Math.round(now - L.last) });
      L.live = live;
      L.last = now;
      L.frames++;
      if (live) L.liveFrames++;
      const n = r.info.programs.length;
      if (n > L.seenPrograms) {
        const fresh = r.info.programs.slice(L.seenPrograms);
        L.seenPrograms = n;
        if (L.programs.length < 300) {
          L.programs.push({ at: Math.round(now), live, count: fresh.length, ids: fresh.map((p) => p.id), names: fresh.map((p) => String(p.name || '') + '|' + String(p.cacheKey || '').split(',').slice(0, 2).join(',')).slice(0, 8), owners: ownersOf(fresh) });
        }
      } else if (n < L.seenPrograms) L.seenPrograms = n;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  // ---- the hand ----
  const end = Date.now() + SECS * 1000;
  let i = 0;
  let firing = false;
  while (Date.now() < end) {
    const mode = await page.evaluate(() => { const s = window.SF.state; return { mode: s.mode, paused: !!s.paused, ts: Number(s.timeScale), screen: !!document.querySelector('#screens button') }; }).catch(() => ({}));
    const pressed = await pressScreens();
    if (pressed === 'pick') report.picks++;
    if (pressed === 'launch') report.launches++;
    if (pressed === 'retry') report.retries = (report.retries || 0) + 1;
    if (mode.mode === 'flight' && !pressed) {
      if (!firing) { await page.mouse.down().catch(() => {}); firing = true; }
      const key = i % 4 === 3 ? 'KeyA' : 'KeyD';
      await page.keyboard.down(key); await sleep(450); await page.keyboard.up(key);
      if (i % 3 === 0) { const power = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'][(i / 3) % 5 | 0]; await page.keyboard.press(power).catch(() => {}); }
      await page.mouse.move(600 + ((i * 137) % 700), 250 + ((i * 71) % 380)).catch(() => {});
    } else if (firing) { await page.mouse.up().catch(() => {}); firing = false; }
    i++;
    await sleep(900);
  }
  if (firing) await page.mouse.up().catch(() => {});
  await page.screenshot({ path: path.join(OUT, `${TAG}-end.png`) }).catch(() => {});
  const data = await page.evaluate(() => {
    const S = window.SF.state;
    const L = globalThis.__lc;
    const out = { loaf: L.loaf, gaps: L.gaps, programs: L.programs, frames: L.frames, liveFrames: L.liveFrames, programsAtStart: L.programsAtStart, programsAtEnd: S.render.renderer.info.programs.length, loafUnsupported: !!L.loafUnsupported, startedAt: Math.round(L.startedAt) };
    try { out.tasks = globalThis.__SF_BG_TASKS__ ? globalThis.__SF_BG_TASKS__() : null; } catch (e) { out.tasksErr = String(e); }
    try { out.onGlass = globalThis.__SF_LIVE_PROGRAMS__ ? globalThis.__SF_LIVE_PROGRAMS__() : null; } catch (e) { out.onGlassErr = String(e); }
    out.render = { dynResScale: S.render.dynResScale, frameCap: S.render.frameCap, autoPresentCap: S.render.autoPresentCap, gpuFrameMs: S.render.gpuFrameMs, caps: S.render.gpuCapabilities || null,
      refusals: S.render.renderer.__sfCompileRefusalCount | 0, fallbacks: S.render.renderer.__sfCompileFallbacks | 0, failOpen: S.render.renderer.__sfCompileFailOpen | 0 };
    try { const run = S.run || S.swarm || null; out.wave = run && (run.wave || run.round) || null; } catch (_) {}
    try { const g = S.render.gpuTimers; if (g) { const rep = g.getReport(); out.gpu = rep.passes; } } catch (_) {}
    return out;
  });
  Object.assign(report, data);
} catch (e) {
  report.errors.push(`probe: ${e && (e.stack || e.message)}`);
} finally {
  try { await browser?.close(); } catch {}
  try { server.kill(); } catch {}
}
// ---- summary ----
const liveLoaf = (report.loaf || []).filter((f) => f.live);
const startedAt = report.startedAt || 0;
const tasks = ((report.tasks && report.tasks.rows) || []).filter((t) => t.at >= startedAt);
const byLabel = {};
for (const t of tasks) { const row = byLabel[t.label] || (byLabel[t.label] = { label: t.label, n: 0, maxMs: 0, sumMs: 0 }); row.n++; row.sumMs += t.ms; row.maxMs = Math.max(row.maxMs, t.ms); }
const programsLive = (report.programs || []).filter((p) => p.live);
const ownerRoots = {};
for (const p of report.programs || []) for (const o of p.owners || []) { const k = `${o.root} / ${o.material} (${o.type}${o.inst ? ', instanced' : ''})`; ownerRoots[k] = (ownerRoots[k] || 0) + 1; }
report.summary = {
  picks: report.picks, launches: report.launches, retries: report.retries || 0,
  programsCreatedAfterFirstPlayable: (report.programs || []).reduce((s, p) => s + p.count, 0),
  programsCreatedWhileLive: programsLive.reduce((s, p) => s + p.count, 0),
  programsCreatedInsidePresentedPass: report.onGlass ? report.onGlass.programs : null,
  owners: Object.entries(ownerRoots).sort((a, b) => b[1] - a[1]).slice(0, 30),
  backgroundTasksOver4ms: tasks.length, backgroundTasksOver50ms: tasks.filter((t) => t.ms >= 50).length,
  worstTasks: Object.values(byLabel).sort((a, b) => b.maxMs - a.maxMs).slice(0, 15).map((r) => ({ ...r, sumMs: +r.sumMs.toFixed(0) })),
  longFramesOver50Live: liveLoaf.length, longFramesOver100Live: liveLoaf.filter((f) => f.ms > 100).length,
  worstLongFrames: liveLoaf.sort((a, b) => b.ms - a.ms).slice(0, 12),
  gapsOver100Live: (report.gaps || []).length, worstGaps: (report.gaps || []).sort((a, b) => b.ms - a.ms).slice(0, 10),
  bricks: report.bricks.length, render: report.render, errors: report.errors.length,
};
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report.summary, null, 1));
