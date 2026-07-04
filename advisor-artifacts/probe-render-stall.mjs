// Pinpoint the multi-second scene-render stall. Monkey-patches renderer.render to log per-frame:
// render ms, JS heap (GC indicator), entity count, draw calls, programs, and whether a stall
// coincides with heap pressure (GC) or entity/asset growth. Runs ~15s and prints any frame >300ms.
import { spawn } from 'node:child_process';
const { chromium } = await import('playwright');

const PORT = 8123;
const server = spawn('node', ['server.js'], { cwd: process.cwd(), stdio: 'ignore' });
async function waitReachable(url, ms = 15000) {
  const d = Date.now() + ms;
  while (Date.now() < d) { try { const r = await fetch(url); if (r.ok) return; } catch {} await new Promise((r) => setTimeout(r, 300)); }
  throw new Error('unreachable');
}

try {
  await waitReachable(`http://127.0.0.1:${PORT}/`);
  const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1830, height: 973 } });
  const logs = [];
  page.on('console', (msg) => { const t = msg.text(); if (t.startsWith('SFSTALL|')) logs.push(t); });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.state.render && window.SF.state.render.renderer), { timeout: 30000 });

  // Patch renderer.render to time each call and log slow frames with full context.
  await page.evaluate(() => {
    const r = window.SF.state.render.renderer;
    const orig = r.render.bind(r);
    let prevHeap = performance.memory ? performance.memory.usedJSHeapSize : 0;
    let frameIdx = 0;
    window.__SF_RENDER_LOG = [];
    r.render = function (scene, camera) {
      const t0 = performance.now();
      const result = orig(scene, camera);
      const dt = performance.now() - t0;
      const heap = performance.memory ? performance.memory.usedJSHeapSize : 0;
      const heapDeltaMB = (heap - prevHeap) / 1048576;
      prevHeap = heap;
      const ents = window.SF.state.entityList ? window.SF.state.entityList.length : 0;
      const programs = r.info.programs ? r.info.programs.length : 0;
      const entry = { f: frameIdx++, ms: +dt.toFixed(1), heapMB: +(heap/1048576).toFixed(0), dMB: +heapDeltaMB.toFixed(1), calls: r.info.render.calls, prog: programs, ents };
      window.__SF_RENDER_LOG.push(entry);
      if (dt > 300 || heapDeltaMB > 20) {
        console.log(`SFSTALL|render=${dt.toFixed(0)}ms heap=${(heap/1048576).toFixed(0)}MB dMB=${heapDeltaMB.toFixed(1)} calls=${r.info.render.calls} prog=${programs} ents=${ents} f=${entry.f}`);
      }
      return result;
    };
  });

  await page.evaluate(() => { try { window.SF.bus.emit('game:new', { seed: 47 }); } catch (e) {} });
  await page.waitForFunction(() => { const s = window.SF.state; return s && s.mode === 'flight' && s.entities && s.entities.get(s.playerId); }, { timeout: 30000 }).catch(() => {});
  // collect stalls over 15s of real flight
  await page.waitForTimeout(15000);

  // pull the full per-frame log and summarize allocation pattern
  const fullLog = await page.evaluate(() => window.__SF_RENDER_LOG || []);
  await browser.close();

  console.log('=== STALLING FRAMES (>300ms render OR >20MB alloc) ===');
  if (!logs.length) console.log('(none >threshold)');
  for (const l of logs) console.log(l);

  // Find the single biggest allocation frame and show the surrounding context (5 frames before/after)
  const big = [...fullLog].sort((a, b) => b.dMB - a.dMB).slice(0, 3);
  console.log('\n=== TOP 3 ALLOCATION FRAMES ===');
  for (const f of big) console.log(JSON.stringify(f));
  console.log(`\ntotal frames logged: ${fullLog.length}`);
  const totalAllocMB = fullLog.reduce((s, f) => s + f.dMB, 0).toFixed(0);
  console.log(`total allocation across all frames: ${totalAllocMB} MB`);
  // Is programs count stable or growing? (shader compilation indicator)
  const progs = fullLog.map(f => f.prog);
  console.log(`programs: first=${progs[0]} last=${progs[progs.length-1]} max=${Math.max(...progs)} (growing = compile-on-demand)`);
} finally { server.kill(); }
