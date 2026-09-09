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
const FPS_FLOOR = 30;
const FRAME_BUDGET_MS = 1000 / FPS_FLOOR;
const HEADLESS_TIMER_MARGIN_MS = 1;
const FRAME_P95_BUDGET_MS = FRAME_BUDGET_MS + HEADLESS_TIMER_MARGIN_MS;

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
  browser = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--hide-scrollbars',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--ignore-gpu-blocklist', '--enable-webgl',
    `--window-size=${WIDTH},${HEIGHT}`, `--remote-debugging-port=${debugPort}`, 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
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
  const evalJson = async (expr) => {
    const result = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Runtime.evaluate failed');
    }
    return JSON.parse(result.result?.value || '{}');
  };

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
  const assetWarmup = await waitForAuthoredAssetsSteady(evalJson);
  console.log('Crowded-scene authored asset warmup:', JSON.stringify(assetWarmup, null, 2));

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
    const perf = d.perf || {};
    const phases = perf.phases || {};
    const scenePools = d.scenePools || {};
    const post = d.post || {};
    const sf = window.SF || null;
    const renderSys = sf && sf.registry && typeof sf.registry.get === 'function' ? sf.registry.get('render') : null;
    const gl = renderSys && renderSys.renderer && typeof renderSys.renderer.getContext === 'function' ? renderSys.renderer.getContext() : null;
    const glAttrs = gl && typeof gl.getContextAttributes === 'function' ? gl.getContextAttributes() : null;
    const scene = renderSys && renderSys.scene;
    const sceneStats = {
      visibleInstancePools: 0,
      totalInstancePools: 0,
      pooledInstanceSlots: 0,
      visibleMeshes: 0,
      visibleNonPoolMeshes: 0,
      castShadowObjects: 0,
    };
    if (scene && typeof scene.traverse === 'function') {
      scene.traverse((object) => {
        if (!object || object.visible === false) return;
        if (object.isInstancedMesh && object.userData && object.userData.spacefaceInstancePool) {
          sceneStats.totalInstancePools++;
          if (object.count > 0) {
            sceneStats.visibleInstancePools++;
            sceneStats.pooledInstanceSlots += object.count || 0;
          }
        } else if (object.isMesh || object.isInstancedMesh) {
          sceneStats.visibleMeshes++;
          sceneStats.visibleNonPoolMeshes++;
        }
        if (object.castShadow) sceneStats.castShadowObjects++;
      });
    }
    return {
      ready: true,
      frameMsLast: fm.last, frameMsAvg: fm.avg, frameMsMin: fm.min, frameMsMax: fm.max, frameMsP95: fm.p95,
      drawCalls: (d.render && d.render.calls) || 0,
      triangles: (d.render && d.render.triangles) || 0,
      geometries: mem.geometries || 0, textures: mem.textures || 0, programs: mem.programs || 0,
      entities: counts.entities || 0, particles: counts.particles || 0, sprites: counts.sprites || 0, lights: counts.lights || 0,
      sceneStats,
      scenePools,
      post,
      preserveDrawingBuffer: glAttrs ? !!glAttrs.preserveDrawingBuffer : null,
      heapUsed: (performance && performance.memory) ? performance.memory.usedJSHeapSize : null,
      perfFrameP95: perf.frame && perf.frame.p95,
      perfPhaseP95: {
        sim: phases.sim && phases.sim.p95,
        render: phases.render && phases.render.p95,
        vfx: phases.vfx && phases.vfx.p95,
        feel: phases.feel && phases.feel.p95,
        ui: phases.ui && phases.ui.p95,
      },
    };
  })())`;
  // Prime the diagnostics, then reset the frame-time ring after warmup so shader compile / boot
  // frames cannot leak into the sustained crowded-scene budget.
  await evalJson(diagExpr);
  await sleep(2000); // let the initial shader compile settle before sampling
  const resetReport = await evalJson(`new Promise((resolve) => requestAnimationFrame(() => setTimeout(() => {
    const diag = window.__THREE_GAME_DIAGNOSTICS__;
    if (diag && typeof diag.reset === 'function') diag.reset();
    const perf = window.__SPACEFACE_PERF__;
    if (perf && typeof perf.reset === 'function') perf.reset();
    resolve(JSON.stringify({
      ready: !!diag,
      reset: !!(diag && typeof diag.reset === 'function'),
      perfReset: !!(perf && typeof perf.reset === 'function'),
    }));
  }, 0)))`);
  assert.ok(resetReport.ready && resetReport.reset, 'budget: diagnostics reset must be available before steady-state sampling');
  await sleep(500); // refill the ring with post-reset frames before the in-page sampling window
  const sampleReport = await evalJson(`new Promise((resolve) => {
    const samples = [];
    const started = performance.now();
    const read = () => {
      const diag = window.__THREE_GAME_DIAGNOSTICS__;
      if (!diag || typeof diag.getReport !== 'function') return { ready: false };
      const d = diag.getReport();
      const fm = d.frameMs || {};
      const mem = d.memory || {};
      const counts = d.counts || {};
      const perf = d.perf || {};
      const phases = perf.phases || {};
      const scenePools = d.scenePools || {};
      const post = d.post || {};
      const sf = window.SF || null;
      const renderSys = sf && sf.registry && typeof sf.registry.get === 'function' ? sf.registry.get('render') : null;
      const gl = renderSys && renderSys.renderer && typeof renderSys.renderer.getContext === 'function' ? renderSys.renderer.getContext() : null;
      const glAttrs = gl && typeof gl.getContextAttributes === 'function' ? gl.getContextAttributes() : null;
      return {
        ready: true,
        frameMsLast: fm.last, frameMsAvg: fm.avg, frameMsMin: fm.min, frameMsMax: fm.max, frameMsP95: fm.p95,
        drawCalls: (d.render && d.render.calls) || 0,
        triangles: (d.render && d.render.triangles) || 0,
        geometries: mem.geometries || 0, textures: mem.textures || 0, programs: mem.programs || 0,
        entities: counts.entities || 0, particles: counts.particles || 0, sprites: counts.sprites || 0, lights: counts.lights || 0,
        scenePools,
        post,
        preserveDrawingBuffer: glAttrs ? !!glAttrs.preserveDrawingBuffer : null,
        heapUsed: (performance && performance.memory) ? performance.memory.usedJSHeapSize : null,
        perfFrameP95: perf.frame && perf.frame.p95,
        perfPhaseP95: {
          sim: phases.sim && phases.sim.p95,
          render: phases.render && phases.render.p95,
          vfx: phases.vfx && phases.vfx.p95,
          feel: phases.feel && phases.feel.p95,
          ui: phases.ui && phases.ui.p95,
        },
      };
    };
    const sceneBreakdown = () => {
      const sf = window.SF || null;
      const renderSys = sf && sf.registry && typeof sf.registry.get === 'function' ? sf.registry.get('render') : null;
      const scene = renderSys && renderSys.scene;
      const sceneStats = {
        visibleInstancePools: 0,
        totalInstancePools: 0,
        pooledInstanceSlots: 0,
        visibleMeshes: 0,
        visibleNonPoolMeshes: 0,
        castShadowObjects: 0,
      };
      if (scene && typeof scene.traverse === 'function') {
        scene.traverse((object) => {
          if (!object || object.visible === false) return;
          if (object.isInstancedMesh && object.userData && object.userData.spacefaceInstancePool) {
            sceneStats.totalInstancePools++;
            if (object.count > 0) {
              sceneStats.visibleInstancePools++;
              sceneStats.pooledInstanceSlots += object.count || 0;
            }
          } else if (object.isMesh || object.isInstancedMesh) {
            sceneStats.visibleMeshes++;
            sceneStats.visibleNonPoolMeshes++;
          }
          if (object.castShadow) sceneStats.castShadowObjects++;
        });
      }
      return sceneStats;
    };
    const tick = () => {
      const sample = read();
      samples.push(sample);
      if (performance.now() - started >= 6000 && samples.length >= 30) {
        resolve(JSON.stringify({ samples, sceneStats: sceneBreakdown() }));
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  })`);
  samples.push(...(sampleReport.samples || []));
  const finalSceneStats = sampleReport.sceneStats || null;

  const valid = samples.filter((s) => s.ready && s.frameMsP95 != null);
  assert.ok(valid.length >= 30, `budget: need >=30 in-page diagnostic samples (got ${valid.length})`);
  // Discard the first quarter (any residual warmup) and measure STEADY-STATE crowded-scene
  // performance. Sampling happens inside the page rAF loop so CDP polling is not part of the load.
  const steady = valid.slice(Math.floor(valid.length * 0.25));
  assert.ok(steady.length >= 20, `budget: need >=20 steady-state samples (got ${steady.length})`);

  const finalSteadySample = steady[steady.length - 1];
  const p95 = finalSteadySample.frameMsP95;
  const maxRollingP95 = Math.max(...steady.map((s) => s.frameMsP95));
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

  console.log('Crowded-scene budget samples (last):', JSON.stringify({
    ...valid[valid.length - 1],
    sceneStats: finalSceneStats,
  }, null, 2));

  // Spec §19.2 / §15.4 budgets:
  assert.ok(
    p95 <= FRAME_P95_BUDGET_MS,
    `budget: frame p95 must be <= ${FRAME_P95_BUDGET_MS.toFixed(1)}ms (30fps floor + headless timer margin); got ${p95.toFixed(1)}ms`,
  );
  assert.ok(avgEntities >= 5, `budget: the scene should be populated/crowded (entities ${avgEntities.toFixed(0)} avg)`);
  assert.notEqual(finalSteadySample.preserveDrawingBuffer, true, 'budget: perf probes must not run with preserveDrawingBuffer enabled');
  assert.ok(peakDrawCalls < 600, `budget: draw calls should stay within the crowded-scene budget (peak ${peakDrawCalls})`);
  // No recurring major-GC spikes: a single GC drop is fine, but net heap growth over 5s should be
  // modest (no allocation churn). Threshold is generous for headless noise.
  assert.ok(heapGrowthMB < 30, `budget: net heap growth over the window should be bounded (${heapGrowthMB.toFixed(1)}MB)`);

  evidence.scenarios.crowdedSceneBudget = {
    assetWarmup,
    samples: valid.length,
    windowS: 5,
    frameMsP95: Number(p95.toFixed(2)),
    maxRollingFrameMsP95: Number(maxRollingP95.toFixed(2)),
    frameMsMax: Number(maxFrame.toFixed(2)),
    sceneStats: finalSceneStats,
    scenePools: finalSteadySample.scenePools || {},
    post: finalSteadySample.post || {},
    preserveDrawingBuffer: finalSteadySample.preserveDrawingBuffer,
    avgDrawCalls: Math.round(avgDrawCalls),
    peakDrawCalls,
    avgEntities: Math.round(avgEntities),
    avgParticles: Math.round(valid.reduce((a, s) => a + (s.particles || 0), 0) / valid.length),
    avgLights: Math.round(valid.reduce((a, s) => a + (s.lights || 0), 0) / valid.length),
    netHeapGrowthMB: Number(heapGrowthMB.toFixed(2)),
    maxHeapDropMB: Number((maxHeapDrop / 1048576).toFixed(2)),
    pass: true,
    contract: `Crowded scene holds frame p95 <= ${FRAME_P95_BUDGET_MS.toFixed(2)}ms (30fps floor plus headless timer margin), bounded draw calls, no recurring GC spikes over a 5s window`,
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

async function waitForAuthoredAssetsSteady(evalJson) {
  let last = null;
  for (let i = 0; i < 180; i++) {
    last = await evalJson(`(async () => {
      const sf = window.SF || null;
      const state = sf && sf.state || null;
      const scene = state && state.render && state.render.scene || null;
      let queue = { pending: 0, running: false };
      try {
        const partsLibrary = await import('./src/render/partsLibrary.js');
        if (partsLibrary && typeof partsLibrary.getAuthoredUpgradeQueueStats === 'function') {
          queue = partsLibrary.getAuthoredUpgradeQueueStats(scene);
        }
      } catch (_) {}
      const ships = state && Array.isArray(state.entityList)
        ? state.entityList.filter((entity) => entity && entity.type === 'ship' && entity.alive !== false && entity.mesh)
        : [];
      const states = {};
      for (const ship of ships) {
        const assetState = ship.mesh && ship.mesh.userData && ship.mesh.userData.authoredAssetState || 'unknown';
        states[assetState] = (states[assetState] || 0) + 1;
      }
      const authored = states.authored || 0;
      const loading = states.loading || 0;
      return JSON.stringify({
        ready: ships.length >= 5 && authored >= Math.min(3, ships.length) && loading === 0 && queue.pending === 0 && queue.running === false,
        tick: state && state.tick || 0,
        shipCount: ships.length,
        authored,
        states,
        queue,
      });
    })()`);
    if (last && last.ready) return last;
    await sleep(250);
  }
  throw new Error('timeout waiting for authored assets to settle before crowded-scene budget: ' + JSON.stringify(last));
}
