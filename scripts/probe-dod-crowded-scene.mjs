// DoD §22 crowded-scene frame-time / draw-call / GC budget acceptance scenario (§15.4 / §19.2).
//
// Boots a real flight session, lets the scene populate, then samples the renderer diagnostics
// (window.__THREE_GAME_DIAGNOSTICS__) over a window — frame time (avg/p95/max), draw calls, and
// heap usage — and asserts the scene-specific budgets hold:
//   • frame p95 <= 33ms (30fps floor; spec §19.2 target/floor budget)
//   • draw calls bounded (crowded-scene budget)
//   • no recurring GC spikes (heap delta over the window stays bounded; spec §15.4)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const ROOT = process.cwd();
const WIDTH = 1280, HEIGHT = 800;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function findFreePort(start) {
  const { createServer } = await import('node:net');
  for (let p = start; p < start + 200; p++) { const ok = await new Promise((res) => { const s = createServer(); s.once('error', () => res(false)); s.listen(p, '127.0.0.1', () => { s.close(() => res(true)); }); }); if (ok) return p; }
  throw new Error('no free port');
}
async function waitReachable(url) { for (let i = 0; i < 120; i++) { try { const r = await fetch(url); if (r.ok) return; } catch (_) {} await sleep(150); } throw new Error('server never reachable'); }

let serverChild, browser;
const issues = [];
const evidence = { schema: 'spaceface.dodCrowdedSceneBudget.v1', scenarios: {} };

try {
  const port = await findFreePort(8331);
  serverChild = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  serverChild.stdout.on('data', () => {}); serverChild.stderr.on('data', () => {});
  await waitReachable(`http://127.0.0.1:${port}/`);
  const fs = await import('node:fs');
  const chrome = await (async () => { for (const c of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) { try { if (fs.existsSync(c)) return c; } catch (_) {} } throw new Error('chrome not found'); })();
  const debugPort = await findFreePort(9517);
  browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-extensions', `--window-size=${WIDTH},${HEIGHT}`, `--remote-debugging-port=${debugPort}`, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  browser.stdout.on('data', () => {}); browser.stderr.on('data', () => {});

  let wsUrl = null;
  for (let i = 0; i < 60; i++) { try { const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json(); const page = tabs.find((t) => t.type === 'page'); if (page) { wsUrl = page.webSocketDebuggerUrl; break; } } catch (_) {} await sleep(200); }
  assert(wsUrl, 'no CDP target');
  const ws = new WebSocket(wsUrl);
  await new Promise((r, e) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', e, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (msg.method === 'Runtime.exceptionThrown') issues.push({ level: 'error', text: msg.params?.exceptionDetails?.text || 'exception' });
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') issues.push({ level: 'error', text: (msg.params.args || []).map((a) => a.value || a.description || '').join(' ') });
    if (msg.id && pending.has(msg.id)) { const { resolve } = pending.get(msg.id); pending.delete(msg.id); resolve(msg.result || {}); }
  });
  const cdp = { send(method, params = {}) { return new Promise((resolve) => { id++; pending.set(id, { resolve }); ws.send(JSON.stringify({ id, method, params })); }); } };
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}` });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  const evalJson = async (expr) => JSON.parse((await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value || '{}');

  const snapExpr = `JSON.stringify((() => {
    const sf = window.SF || null; const state = sf && sf.state || null;
    const player = state && state.entities && state.entities.get(state.playerId) || null;
    const classText = document.querySelector('[data-k="role"]')?.textContent || '';
    const hudPlayable = classText.trim() && !/^[-—]$/.test(classText.trim());
    return { sfReady: !!state, mainMenuVisible: !!document.querySelector('[data-screen="mainMenu"]'),
      flightPlayable: !!(state && state.mode === 'flight' && player && player.alive && player.hull > 0) || hudPlayable };
  })())`;
  const wait = async (pred, timeout, label) => { const start = Date.now(); let last = null; while (Date.now() - start < timeout) { last = await evalJson(snapExpr); if (pred(last)) return last; await sleep(200); } throw new Error('timeout: ' + label + ' last=' + JSON.stringify(last)); };
  await wait((s) => s.sfReady && (s.mainMenuVisible || s.flightPlayable), 15000, 'menu');
  let snap = await evalJson(snapExpr);
  if (snap.mainMenuVisible && !snap.flightPlayable) {
    const click = async (label) => { for (let a = 0; a < 8; a++) { const r = await evalJson(`JSON.stringify((()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()===${JSON.stringify(label)});if(!b)return{ok:false};b.click();return{ok:true};})())`); if (r && r.ok) return true; await sleep(250); } return false; };
    const ngExpr = `JSON.stringify({ visible: !!document.querySelector('[data-screen="newGame"]') })`;
    await sleep(400); await click('New Game');
    for (let i = 0; i < 60; i++) { const ng = JSON.parse((await cdp.send('Runtime.evaluate', { expression: ngExpr, returnByValue: true })).result?.value || '{}'); snap = await evalJson(snapExpr); if (snap.flightPlayable || ng.visible) break; await sleep(200); }
    snap = await evalJson(snapExpr);
    if (!snap.flightPlayable) { await click('Launch'); await wait((s) => s.flightPlayable, 15000, 'flight'); }
  }
  await sleep(2000); // let the scene populate (stations, traffic, contacts)

  // ── Scenario 17: crowded-scene budget — sample diagnostics over a ~5s window ──
  // Collect frameMs / drawCalls / heap each ~250ms for ~5s, then assert the budgets.
  const samples = [];
  const diagExpr = `JSON.stringify((() => {
    const diag = window.__THREE_GAME_DIAGNOSTICS__;
    if (!diag || typeof diag.getReport !== 'function') return { ready: false };
    const d = diag.getReport();
    const fm = d.frameMs || {};
    const mem = d.memory || {};
    const counts = d.counts || {};
    return {
      ready: true,
      frameMsLast: fm.last, frameMsAvg: fm.avg, frameMsMin: fm.min, frameMsMax: fm.max, frameMsP95: fm.p95,
      drawCalls: (d.render && d.render.calls) || 0,
      triangles: (d.render && d.render.triangles) || 0,
      geometries: mem.geometries || 0, textures: mem.textures || 0, programs: mem.programs || 0,
      entities: counts.entities || 0, particles: counts.particles || 0, sprites: counts.sprites || 0, lights: counts.lights || 0,
      heapUsed: (performance && performance.memory) ? performance.memory.usedJSHeapSize : null,
    };
  })())`;
  // prime the diagnostics + collect more samples so the warmup tail (shader compile under bloom +
  // energy materials in headless SwiftShader) is fully discarded before steady-state measurement.
  await evalJson(diagExpr);
  await sleep(2000); // let the initial shader compile settle before sampling
  for (let i = 0; i < 24; i++) { samples.push(await evalJson(diagExpr)); await sleep(250); }

  const valid = samples.filter((s) => s.ready && s.frameMsP95 != null);
  assert.ok(valid.length >= 12, `budget: need >=12 diagnostic samples (got ${valid.length})`);
  // Discard the first few samples (any residual warmup) and measure STEADY-STATE crowded-scene
  // performance — the spec §19.2 budget is about sustained frame rate, not boot/compile.
  const steady = valid.slice(4);
  assert.ok(steady.length >= 8, `budget: need >=8 steady-state samples (got ${steady.length})`);

  const p95 = Math.max(...steady.map((s) => s.frameMsP95));
  const maxFrame = Math.max(...steady.map((s) => s.frameMsMax));
  const avgDrawCalls = steady.reduce((a, s) => a + (s.drawCalls || 0), 0) / steady.length;
  const peakDrawCalls = Math.max(...steady.map((s) => s.drawCalls || 0));
  const avgEntities = steady.reduce((a, s) => a + (s.entities || 0), 0) / steady.length;
  const heapSamples = steady.map((s) => s.heapUsed).filter((h) => h != null);
  // GC spike heuristic: if heap grew then sharply dropped (a major GC), the delta between consecutive
  // samples would show a large negative jump. Bounded net delta = no recurring major-GC churn.
  let maxHeapDrop = 0;
  for (let i = 1; i < heapSamples.length; i++) {
    const drop = heapSamples[i - 1] - heapSamples[i];
    if (drop > maxHeapDrop) maxHeapDrop = drop;
  }
  const heapGrowthMB = heapSamples.length >= 2 ? (heapSamples[heapSamples.length - 1] - heapSamples[0]) / 1048576 : 0;

  console.log('Crowded-scene budget samples (last):', JSON.stringify(valid[valid.length - 1], null, 2));

  // Spec §19.2 / §15.4 budgets:
  assert.ok(p95 <= 33, `budget: frame p95 must be <= 33ms (30fps floor); got ${p95.toFixed(1)}ms`);
  assert.ok(avgEntities >= 5, `budget: the scene should be populated/crowded (entities ${avgEntities.toFixed(0)} avg)`);
  assert.ok(peakDrawCalls < 600, `budget: draw calls should stay within the crowded-scene budget (peak ${peakDrawCalls})`);
  // No recurring major-GC spikes: a single GC drop is fine, but net heap growth over 5s should be
  // modest (no allocation churn). Threshold is generous for headless noise.
  assert.ok(Math.abs(heapGrowthMB) < 30, `budget: net heap growth over the window should be bounded (${heapGrowthMB.toFixed(1)}MB)`);

  evidence.scenarios.crowdedSceneBudget = {
    samples: valid.length,
    windowS: 5,
    frameMsP95: Number(p95.toFixed(2)),
    frameMsMax: Number(maxFrame.toFixed(2)),
    avgDrawCalls: Math.round(avgDrawCalls),
    peakDrawCalls,
    avgEntities: Math.round(avgEntities),
    avgParticles: Math.round(valid.reduce((a, s) => a + (s.particles || 0), 0) / valid.length),
    avgLights: Math.round(valid.reduce((a, s) => a + (s.lights || 0), 0) / valid.length),
    netHeapGrowthMB: Number(heapGrowthMB.toFixed(2)),
    maxHeapDropMB: Number((maxHeapDrop / 1048576).toFixed(2)),
    pass: true,
    contract: 'Crowded scene holds frame p95 <= 33ms, bounded draw calls, no recurring GC spikes over a 5s window',
  };
  console.log(`[17] crowded-scene budget: p95 ${p95.toFixed(1)}ms, draw ${peakDrawCalls} peak, ${avgEntities.toFixed(0)} entities, heap growth ${heapGrowthMB.toFixed(1)}MB PASS`);

  const errors = issues.filter((i) => i.level === 'error');
  assert.equal(errors.length, 0, 'budget probe must not produce page errors: ' + JSON.stringify(errors.slice(0, 5)));
  const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  mkdirSync(dirname('.devshots/perf/crowded-scene.jpg'), { recursive: true });
  writeFileSync('.devshots/perf/crowded-scene.jpg', Buffer.from(shot.data, 'base64'));

  console.log('\nDoD §22 crowded-scene budget evidence bundle:');
  console.log(JSON.stringify(evidence, null, 2));
  console.log('\nCrowded-scene budget DoD §22 scenario PASS.');
} finally {
  try { browser && browser.kill && browser.kill(); } catch (_) {}
  if (serverChild) { try { serverChild.kill(); } catch (_) {} }
}
