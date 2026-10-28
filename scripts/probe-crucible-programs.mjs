// Shader-program census for a real Crucible (swarm) run.
//
// WHY: docs/design/program/ASSET_PERFORMANCE_PROGRAM.md ranks "driver program-link stalls at first sight"
// as the real frame-time pole, and a quiet-host Crucible gate run showed 46 'compiling-pipelines'
// swaps and 5 s freezes. Nothing yet says WHICH programs a Crucible run creates, what splits
// near-identical programs (light count? shadows? batching? vertex colour?), whether the enemy
// hulls are linked before round 1, or how long the main thread blocks on each link. This probe
// answers those with numbers, on the real game route, without touching game code.
//
// HOW: an init script wraps WebGL2 shaderSource / attachShader / linkProgram / getProgramParameter
// before the page runs. Every program is recorded with the #define set three.js generated, the
// moment it was linked, how long the FIRST LINK_STATUS read blocked (that read is where the driver
// makes the main thread wait), and the sim phase/wave/time/entity count at that moment. Long tasks
// and long animation frames are recorded beside them.
//
//   node scripts/probe-crucible-programs.mjs                 headed (the real GPU), 150 s after round 1 starts
//   node scripts/probe-crucible-programs.mjs --duration=240
//   node scripts/probe-crucible-programs.mjs --headless      software GL (timings are not the real GPU's)
//   node scripts/probe-crucible-programs.mjs --no-kills      do not force kills (default forces 2 every 12 s
//                                                            so death/hit VFX programs are exercised like real play)
//
// Output: .devshots/program-census/<stamp>.json (everything) + a printed analysis.
// The probe only observes; it never changes a game setting.

import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const HEADLESS = process.argv.includes('--headless');
const NO_KILLS = process.argv.includes('--no-kills');
const DURATION_S = Number(arg('duration', 150));
const SEED = 4242;
const { chromium } = await loadPlaywright();

// ---------------------------------------------------------------------------------------------
// Page-side instrumentation (runs before any page script).
// ---------------------------------------------------------------------------------------------
const INIT = `(() => {
  const proto = WebGL2RenderingContext.prototype;
  const srcOf = new WeakMap();
  const shadersOf = new WeakMap();
  const recOf = new WeakMap();
  const recs = []; const longTasks = []; const slowFrames = [];
  const counters = { completionPolls: 0, statusReads: 0 };
  window.__census = { recs, longTasks, slowFrames, counters };
  const now = () => performance.now();
  const ctx = () => {
    try {
      const st = window.SF && window.SF.state;
      if (!st) return null;
      const run = st.run || null;
      return { sim: st.simTime, phase: run && run.phase, wave: run && run.wave, mode: st.mode, ents: st.entityList ? st.entityList.length : null };
    } catch (_) { return null; }
  };
  const origSource = proto.shaderSource;
  proto.shaderSource = function (shader, src) {
    srcOf.set(shader, String(src).slice(0, 12000));
    return origSource.call(this, shader, src);
  };
  const origAttach = proto.attachShader;
  proto.attachShader = function (program, shader) {
    let list = shadersOf.get(program); if (!list) { list = []; shadersOf.set(program, list); }
    list.push(shader);
    return origAttach.call(this, program, shader);
  };
  const parseDefines = (text, into) => {
    const re = /^#define[ \\t]+([A-Za-z0-9_]+)(?:[ \\t]+([^\\r\\n]*))?$/gm;
    let m;
    while ((m = re.exec(text))) { const v = (m[2] || '').trim(); if (v.length <= 40) into[m[1]] = v; }
  };
  const origLink = proto.linkProgram;
  proto.linkProgram = function (program) {
    const t0 = now();
    const out = origLink.call(this, program);
    const callMs = now() - t0;
    const defines = {}; let shaderName = ''; let fsLen = 0; let vsLen = 0;
    for (const sh of (shadersOf.get(program) || [])) {
      const s = srcOf.get(sh) || '';
      parseDefines(s, defines);
      const m = /^#define[ \\t]+SHADER_NAME[ \\t]+(\\S+)[ \\t]*$/m.exec(s); if (m) shaderName = m[1];
      if (/gl_Position/.test(s)) vsLen = s.length; else fsLen = s.length;
    }
    const rec = { id: recs.length, tLink: t0, linkCallMs: callMs, shaderName, defines, ctx: ctx(), statusReadMs: null, statusReadAt: null, ctxAtRead: null };
    recs.push(rec); recOf.set(program, rec);
    return out;
  };
  const origParam = proto.getProgramParameter;
  proto.getProgramParameter = function (program, pname) {
    if (pname === 37297) counters.completionPolls++;
    if (pname === 35714) {
      counters.statusReads++;
      const rec = recOf.get(program);
      if (rec && rec.statusReadMs === null) {
        const a = now();
        const r = origParam.call(this, program, pname);
        rec.statusReadMs = now() - a; rec.statusReadAt = a; rec.ctxAtRead = ctx();
        return r;
      }
    }
    return origParam.call(this, program, pname);
  };
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) longTasks.push({ t: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true });
  } catch (_) { /* longtask unsupported */ }
  let last = now();
  const tick = () => { const t = now(); const dt = t - last; last = t; if (dt > 60) slowFrames.push({ t, dt, ctx: ctx() }); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
})();`;

// ---------------------------------------------------------------------------------------------
// Real-route driving (same public path check-crucible-route.mjs walks).
// ---------------------------------------------------------------------------------------------
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
  const port = await findFreePort(8540);
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
  const all = [...document.querySelectorAll('#screens button')];
  const b = all.find((x) => norm(x.textContent) === norm(wanted)) || all.find((x) => norm(x.textContent).includes(norm(wanted)));
  if (!b || b.disabled) return false;
  b.click();
  return true;
}, label);

async function waitForButton(page, label, timeout) {
  await page.waitForFunction((wanted) => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const b = [...document.querySelectorAll('#screens button')].find((x) => norm(x.textContent).includes(norm(wanted)));
    return !!b && !b.disabled;
  }, label, { timeout });
}

const killSome = (page, n) => page.evaluate((want) => {
  const st = window.SF.state;
  if (!(st.run && st.run.phase === 'active')) return 0;
  const targets = st.entityList.filter((e) => e.alive && e.data && e.data.runCohort === 'survival'
    && ['ship', 'drone', 'mine', 'station', 'massSeed', 'payload'].includes(e.type)).slice(0, want);
  for (const target of targets) {
    window.SF.bus.emit('projectile:hit', {
      targetId: target.id, ownerId: st.playerId,
      damage: (target.hull || 0) + (target.shield || 0) + (target.armorHp || 0) + 9999, damageType: 'kinetic',
      pos: { x: target.pos.x, z: target.pos.z }, approach: { x: 1, z: 0 }, normal: { x: -1, z: 0 },
      weaponId: 'wpn_concussion_cannon_m',
    });
  }
  return targets.length;
}, n);

// ---------------------------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------------------------
const LIGHT_RE = /^(NUM_(DIR|POINT|SPOT|HEMI|RECT_AREA)_LIGHTS|NUM_.*LIGHT.*|USE_LIGHTS?.*)$/;
const SHADOW_RE = /SHADOW/;
const sigWithout = (rec, drop) => {
  const keys = Object.keys(rec.defines).filter((k) => !drop(k)).sort();
  return `${rec.shaderName}|${keys.map((k) => `${k}=${rec.defines[k]}`).join(',')}`;
};
function analyze(data, tActive) {
  const recs = data.recs;
  const allKeys = new Set(recs.flatMap((r) => Object.keys(r.defines)));
  const constant = new Set([...allKeys].filter((k) => recs.every((r) => k in r.defines && r.defines[k] === recs[0].defines[k])));
  const varying = [...allKeys].filter((k) => !constant.has(k));
  const total = recs.length;
  const groups = (drop) => new Set(recs.map((r) => sigWithout(r, drop))).size;
  const gain = {};
  for (const k of varying) gain[k] = total - groups((x) => x === k);
  const families = {
    lights: total - groups((k) => LIGHT_RE.test(k)),
    shadows: total - groups((k) => SHADOW_RE.test(k)),
    batching: total - groups((k) => /BATCHING|INSTANCING/.test(k)),
    vertexColor: total - groups((k) => /^USE_COLOR|VERTEX_COLORS|USE_INSTANCING_COLOR/.test(k)),
    lightsPlusShadows: total - groups((k) => LIGHT_RE.test(k) || SHADOW_RE.test(k)),
  };
  const byName = {};
  for (const r of recs) byName[r.shaderName || '(unnamed)'] = (byName[r.shaderName || '(unnamed)'] || 0) + 1;
  const afterActive = recs.filter((r) => r.tLink >= tActive);
  const settled = afterActive.filter((r) => r.tLink >= tActive + 5000);
  const blockers = recs.filter((r) => r.statusReadMs != null).sort((a, b) => b.statusReadMs - a.statusReadMs);
  const sum = (arr, f) => arr.reduce((s, r) => s + (f(r) || 0), 0);
  // For each in-flight program, what differs from the closest earlier program of the same shader name?
  const splitReasons = [];
  for (const r of settled) {
    const earlier = recs.filter((e) => e.id < r.id && e.shaderName === r.shaderName);
    let best = null;
    for (const e of earlier) {
      const diff = [...new Set([...Object.keys(e.defines), ...Object.keys(r.defines)])].filter((k) => e.defines[k] !== r.defines[k]);
      if (!best || diff.length < best.length) best = diff;
    }
    splitReasons.push({ id: r.id, name: r.shaderName, atSim: r.ctx && r.ctx.sim, blockedMs: r.statusReadMs, differsFromEarlier: best === null ? '(first program of this name)' : best.slice(0, 6).join(',') || '(identical defines)' });
  }
  const reasonTally = {};
  for (const s of splitReasons) reasonTally[s.differsFromEarlier] = (reasonTally[s.differsFromEarlier] || 0) + 1;
  return {
    total, constantDefines: constant.size, varyingDefines: varying.length,
    uniqueSignatures: groups(() => false),
    gainIfDefineUnified: Object.fromEntries(Object.entries(gain).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 14)),
    gainIfFamilyUnified: families,
    perShaderName: Object.fromEntries(Object.entries(byName).sort((a, b) => b[1] - a[1]).slice(0, 12)),
    beforeActive: recs.length - afterActive.length,
    afterActive: afterActive.length,
    afterActivePlus5s: settled.length,
    blockedMsTotal: Math.round(sum(recs, (r) => r.statusReadMs)),
    blockedMsAfterActive: Math.round(sum(afterActive, (r) => r.statusReadMs)),
    blockedOver50ms: blockers.filter((r) => r.statusReadMs > 50).length,
    blockedOver250ms: blockers.filter((r) => r.statusReadMs > 250).length,
    topBlockers: blockers.slice(0, 8).map((r) => ({ id: r.id, name: r.shaderName, ms: Math.round(r.statusReadMs), phase: r.ctxAtRead && r.ctxAtRead.phase, sim: r.ctxAtRead && Math.round(r.ctxAtRead.sim) })),
    inFlightSplitReasons: Object.fromEntries(Object.entries(reasonTally).sort((a, b) => b[1] - a[1]).slice(0, 10)),
    inFlightFirstPrograms: splitReasons.slice(0, 12),
    longTasksOver250: data.longTasks.filter((t) => t.d >= 250).length,
    longestTaskMs: Math.round(Math.max(0, ...data.longTasks.map((t) => t.d))),
    slowFrames: data.slowFrames.length,
    completionPolls: data.counters.completionPolls,
    statusReads: data.counters.statusReads,
  };
}

function summarizeProfile(profile) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dts = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i++) self.set(profile.samples[i], (self.get(profile.samples[i]) || 0) + (dts[i] || 0));
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  const byFn = new Map(); const byFile = new Map();
  for (const [id, us] of self) {
    const n = nodes.get(id); const cf = n.callFrame;
    const file = (cf.url || '').replace(/^https?:\/\/[^/]+\//, '') || cf.functionName || '(native)';
    const fn = (cf.functionName || '(anonymous)') + ' ' + file + ':' + (cf.lineNumber + 1);
    byFn.set(fn, (byFn.get(fn) || 0) + us);
    byFile.set(file, (byFile.get(file) || 0) + us);
  }
  const top = (m, k) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([name, us]) => ({ name, ms: Math.round(us / 1000), pct: Math.round((us / total) * 1000) / 10 }));
  return { sampledMs: Math.round(total / 1000), topFiles: top(byFile, 14), topFunctions: top(byFn, 22) };
}

// ---------------------------------------------------------------------------------------------
async function main() {
  const server = await startServer();
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: HEADLESS ? [] : ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await context.addInitScript(INIT);
  const page = await context.newPage();
  const t0 = Date.now();
  const stamp = new Date(t0).toISOString().replace(/[:.]/g, '-');
  try {
    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 300000 });
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-screen="mainMenu"]');
      return el && getComputedStyle(el).display !== 'none';
    }, null, { timeout: 300000 });
    // First-run accessibility prompt ("First light"): answer Play like a stranger would.
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().toLowerCase() === 'play' && !x.disabled);
      if (b) b.click();
    });
    await waitForButton(page, 'Crucible', 60000);
    if (!(await clickButton(page, 'Crucible'))) throw new Error('Crucible button did not click');
    await page.waitForTimeout(500);
    await page.evaluate(() => { const c = [...document.querySelectorAll('#screens .sf-crd-mode')].find((b) => b.dataset.ruleset === 'swarm'); if (c) c.click(); });
    if (!(await clickButton(page, 'Choose ship & kit'))) throw new Error('Choose ship & kit did not click');
    await page.evaluate((seed) => {
      const hull = [...document.querySelectorAll('#screens .sf-crd-hull')].find((b) => b.textContent.includes('Ricochet Runner')) || document.querySelector('#screens .sf-crd-hull');
      hull.click();
      document.querySelector('#screens .sf-crd-seed input').value = String(seed);
    }, SEED);
    if (!(await clickButton(page, 'Open armory'))) throw new Error('Open armory did not click');
    await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 180000 });
    await waitForButton(page, 'Launch round 1', 180000);
    await clickButton(page, 'Launch round 1');
    await page.waitForFunction(() => window.SF.state.run && window.SF.state.run.phase === 'active', null, { timeout: 120000, polling: 100 });
    const tActive = await page.evaluate(() => performance.now());
    const cdp = await context.newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
    await cdp.send('Profiler.start');
    console.log(`[census] round 1 active after ${Math.round((Date.now() - t0) / 1000)} s wall; observing ${DURATION_S} s`);

    const endAt = Date.now() + DURATION_S * 1000;
    let nextKill = Date.now() + 12000;
    let killed = 0;
    while (Date.now() < endAt) {
      await page.waitForTimeout(2000);
      if (!NO_KILLS && Date.now() >= nextKill) { killed += await killSome(page, 2).catch(() => 0); nextKill = Date.now() + 12000; }
    }
    const { profile } = await cdp.send('Profiler.stop');
    mkdirSync('.devshots/program-census', { recursive: true });
    writeFileSync(`.devshots/program-census/${stamp}.cpuprofile`, JSON.stringify(profile));
    const cpu = summarizeProfile(profile);
    const rendererInfo = await page.evaluate(() => {
      // Look for a three.js WebGLRenderer.info anywhere shallow under window.SF.
      const seen = new Set(); const hits = [];
      const walk = (o, path, depth) => {
        if (!o || typeof o !== 'object' || seen.has(o) || depth > 3) return; seen.add(o);
        try {
          if (o.info && o.info.render && typeof o.info.render.calls === 'number') hits.push({ path, calls: o.info.render.calls, triangles: o.info.render.triangles, geometries: o.info.memory.geometries, textures: o.info.memory.textures, programs: o.info.programs ? o.info.programs.length : null });
          for (const k of Object.keys(o).slice(0, 60)) walk(o[k], path + '.' + k, depth + 1);
        } catch (_) { /* getters */ }
      };
      walk(window.SF, 'SF', 0);
      return hits.slice(0, 3);
    }).catch(() => []);
    const data = await page.evaluate(() => window.__census);
    const analysis = analyze(data, tActive);
    analysis.forcedKills = killed;
    analysis.cpuProfile = cpu;
    analysis.rendererInfo = rendererInfo;
    analysis.settings = { headless: HEADLESS, durationS: DURATION_S, seed: SEED };
    mkdirSync('.devshots/program-census', { recursive: true });
    const file = `.devshots/program-census/${stamp}.json`;
    writeFileSync(file, JSON.stringify({ analysis, programs: data.recs.map((r) => ({ id: r.id, name: r.shaderName, tLinkMs: Math.round(r.tLink - tActive), blockedMs: r.statusReadMs == null ? null : Math.round(r.statusReadMs * 10) / 10, ctx: r.ctx, defines: r.defines })), longTasks: data.longTasks, slowFrames: data.slowFrames }, null, 1));
    console.log(JSON.stringify(analysis, null, 2));
    console.log(`[census] wrote ${file}`);
  } finally {
    await browser.close().catch(() => {});
    server.kill();
  }
}

main().catch((err) => { console.error('[census] FAILED:', err && err.stack || err); process.exit(1); });
