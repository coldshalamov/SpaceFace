// Flight CPU profile: launch a route, fly, and name where the frame and the load go.
//
//   node scripts/probe-flight-profile.mjs                 Crucible swarm, seed 4242
//   node scripts/probe-flight-profile.mjs --open          open-route New Game
//   options: --ms=10000 (flight profile window) --label=NAME --profile-launch (also profile
//            launch -> first playable frame) --systems (per-system sim timing, full coverage)
//
// Prints: boot and launch seconds with whole-machine CPU beside them, fps and frame-time
// percentiles, median phase costs, a scene census (total / visible-reachable nodes — a hidden
// subtree still costs updateMatrixWorld every frame), the loading cook ledger, top self and
// inclusive functions, and warnings. Writes .devshots/flight-profile/NAME/{report.txt,*.cpuprofile}
// (the .cpuprofile opens in DevTools' Performance panel). Diagnosis instrument, not a gate; host
// load swings results — never compare two runs without the busy % printed beside them.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { loadPlaywright } = await import(pathToFileURL(path.join(ROOT, 'scripts/lib/load-playwright.mjs')).href);
const OPEN = process.argv.includes('--open');
const PROFILE_LAUNCH = process.argv.includes('--profile-launch');
const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const PROFILE_MS = Number(arg('ms', 10000));
const LABEL = arg('label', OPEN ? 'open' : 'crucible');
const OUT = path.join(ROOT, '.devshots', 'flight-profile', LABEL);
fs.mkdirSync(OUT, { recursive: true });

function cpuSnapshot() { let idle = 0, total = 0; for (const c of os.cpus()) { for (const v of Object.values(c.times)) total += v; idle += c.times.idle; } return { idle, total }; }
const busy = (a, b) => 100 * (1 - (b.idle - a.idle) / (b.total - a.total));
const freePort = () => new Promise((res, rej) => { const p = createNetServer(); p.once('error', rej); p.listen(0, '127.0.0.1', () => { const { port } = p.address(); p.close(() => res(port)); }); });

function summarize(profile, windowMs, nSelf = 45, nIncl = 70) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas; let totalUs = 0;
  for (let i = 0; i < profile.samples.length; i++) { const id = profile.samples[i]; const d = dt[i] || 0; totalUs += d; self.set(id, (self.get(id) || 0) + d); }
  const parent = new Map(); for (const n of profile.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
  const key = (n) => `${n.callFrame.functionName || '(anon)'} ${String(n.callFrame.url).replace(/^.*\/(src|vendor)\//, '$1/')}:${n.callFrame.lineNumber + 1}`;
  const selfAgg = new Map(); const inclAgg = new Map();
  for (const [id, us] of self) {
    const n = byId.get(id); selfAgg.set(key(n), (selfAgg.get(key(n)) || 0) + us);
    const seen = new Set(); let cur = id;
    while (cur != null) { const k = key(byId.get(cur)); if (!seen.has(k)) { seen.add(k); inclAgg.set(k, (inclAgg.get(k) || 0) + us); } cur = parent.get(cur); }
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => `${(100 * us / totalUs).toFixed(1).padStart(5)}%  ${(us / 1000).toFixed(0).padStart(7)} ms  ${(us / 1000 / (windowMs / 1000)).toFixed(2).padStart(7)} ms/s  ${k}`);
  return ['TOP SELF', ...top(selfAgg, nSelf), '', 'TOP INCLUSIVE', ...top(inclAgg, nIncl)];
}

const port = await freePort();
const server = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' } });
const { chromium } = await loadPlaywright();
let browser;
const logs = [];
try {
  const base = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 200; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 150)); }
  browser = await chromium.launch({ headless: false, args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--window-size=1600,900'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning' || /asteroid-pool/.test(t)) logs.push(`[${m.type()}] ${t.slice(0, 600)}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e).slice(0, 400)}`));
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch {} });
  const tBoot = Date.now();
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 150000 });
  const bootS = (Date.now() - tBoot) / 1000;
  let launchCdp = null;
  if (PROFILE_LAUNCH) {
    launchCdp = await page.context().newCDPSession(page);
    await launchCdp.send('Profiler.enable');
    await launchCdp.send('Profiler.setSamplingInterval', { interval: 500 });
    await launchCdp.send('Profiler.start');
  }
  const cl0 = cpuSnapshot();
  const t0 = Date.now();
  if (OPEN) await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Profile' }));
  else await page.evaluate(async () => { const l = await import('/src/ui/crucibleLaunch.js'); const s = l.crucibleSetupFor({ seed: 4242 }); l.requestCrucibleRun(window.SF.bus, s.value, s.ruleset); });
  await page.waitForFunction(() => { const s = window.SF.state; return s.mode === 'flight' && Number.isFinite(s.render && s.render.firstPlayableFrameAt); }, null, { timeout: 560000 });
  const launchS = (Date.now() - t0) / 1000;
  const launchBusy = busy(cl0, cpuSnapshot());
  let launchSummary = [];
  if (launchCdp) {
    const { profile: lp } = await launchCdp.send('Profiler.stop');
    fs.writeFileSync(path.join(OUT, 'launch.cpuprofile'), JSON.stringify(lp));
    launchSummary = ['', `LAUNCH PROFILE (${launchS.toFixed(1)} s)`, ...summarize(lp, launchS * 1000, 50, 90)];
    await launchCdp.detach();
  }
  await page.bringToFront();
  await page.mouse.move(1100, 300);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(4000);
  const census = await page.evaluate(() => {
    const render = window.SF.state.render; const scene = render.scene;
    let total = 0, visibleReach = 0, meshes = 0;
    scene.traverse((o) => { total++; if (o.isMesh || o.isInstancedMesh || o.isPoints || o.isLine || o.isSprite) meshes++; });
    scene.traverseVisible(() => { visibleReach++; });
    const ledger = (render.openingCookLedger || []).filter((r) => r && r.step !== 'lane' && r.step !== 'begin')
      .map((r) => `${r.step} ${r.ms}ms ${r.outcome}${Object.keys(r).filter((k) => !['step', 'ms', 'outcome', 't'].includes(k)).map((k) => ` ${k}=${typeof r[k] === 'object' ? JSON.stringify(r[k]).slice(0, 80) : String(r[k]).slice(0, 80)}`).join('')}`);
    const info = render.renderer && render.renderer.info;
    return { total, visibleReach, meshes, programs: info && info.programs && info.programs.length, geometries: info && info.memory && info.memory.geometries, textures: info && info.memory && info.memory.textures, entities: window.SF.state.entityList.length, ledger };
  });
  const SYSTEMS = process.argv.includes('--systems');
  if (SYSTEMS) {
    await page.evaluate(() => {
      const p = window.SF.state.perfRuntime;
      p.setSystemTimingEnabled(true);
      p.setSystemTimingFullCoverage(true);
      if (typeof p.reset === 'function') p.reset();
    });
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await page.evaluate(() => { window.__pf = { dts: [], costs: [] }; let last = 0; const sc = {}; const tick = (now) => { if (last) { window.__pf.dts.push(now - last); const p = window.SF.state.perfRuntime; if (p && p.readFrameSample) { p.readFrameSample(sc); window.__pf.costs.push([sc.callbackMs || 0, sc.simFrameMs || 0, sc.renderMs || 0, sc.vfxMs || 0, sc.uiMs || 0]); } } last = now; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  const c0 = cpuSnapshot();
  await cdp.send('Profiler.start');
  await page.waitForTimeout(PROFILE_MS);
  const { profile } = await cdp.send('Profiler.stop');
  const hostBusy = busy(c0, cpuSnapshot());
  fs.writeFileSync(path.join(OUT, 'profile.cpuprofile'), JSON.stringify(profile));
  const pf = await page.evaluate(() => window.__pf);
  let systemLines = [];
  if (SYSTEMS) {
    const sys = await page.evaluate(() => {
      const r = window.SF.state.perfRuntime.getReport();
      return Object.entries(r.systems || {}).map(([name, s]) => ({ name, p50: s.p50, p95: s.p95, p99: s.p99, max: s.max, count: s.count, total: s.total }));
    });
    const fmt = (s) => `${String(s.name).padEnd(34)} p50 ${Number(s.p50 || 0).toFixed(2).padStart(6)}  p95 ${Number(s.p95 || 0).toFixed(2).padStart(6)}  p99 ${Number(s.p99 || 0).toFixed(2).padStart(6)}  max ${Number(s.max || 0).toFixed(1).padStart(6)}  n ${s.count}`;
    systemLines = ['', 'SYSTEMS by p50', ...[...sys].sort((a, b) => (b.p50 || 0) - (a.p50 || 0)).slice(0, 25).map(fmt),
      '', 'SYSTEMS by max', ...[...sys].sort((a, b) => (b.max || 0) - (a.max || 0)).slice(0, 20).map(fmt)];
  }
  const sorted = [...pf.dts].sort((x, y) => x - y);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] || 0;
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] || 0; };
  const colMed = (i) => med(pf.costs.map((c) => c[i]));
  const over = (ms) => pf.dts.filter((d) => d > ms).length;
  const report = [
    `route ${OPEN ? 'OPEN' : 'CRUCIBLE 4242'}  boot ${bootS.toFixed(1)} s  launch ${launchS.toFixed(1)} s (host busy ${launchBusy.toFixed(0)} %)  flight host busy ${hostBusy.toFixed(0)} %`,
    `frames ${pf.dts.length} in ${PROFILE_MS} ms  fps ${(1000 * pf.dts.length / PROFILE_MS).toFixed(1)}  dt p50/p95/p99/max ${pct(0.5).toFixed(1)}/${pct(0.95).toFixed(1)}/${pct(0.99).toFixed(1)}/${sorted[sorted.length - 1].toFixed(1)}  >33 ${over(33.4)} >50 ${over(50)} >100 ${over(100)}`,
    `median callback ${colMed(0).toFixed(1)} sim ${colMed(1).toFixed(1)} render ${colMed(2).toFixed(1)} vfx ${colMed(3).toFixed(1)} ui ${colMed(4).toFixed(1)}`,
    `census ${JSON.stringify({ ...census, ledger: undefined })}`,
    'LEDGER', ...census.ledger, ...systemLines,
    '', ...summarize(profile, PROFILE_MS), ...launchSummary, '', 'LOGS', ...logs.slice(-60),
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'report.txt'), report);
  console.log(report);
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
