#!/usr/bin/env node
// HUD-2 item 15: does the flight HUD's frame path force layout or query the document?
// Mounts the real HUD on the ui-bench (no game boot), wraps the layout-reading and selector DOM
// APIs with counters, drives N HUD frames and prints calls per frame and milliseconds per frame.
//   node scripts/probe-hud-frame-cost.mjs [--shot=flight|crucibleHud] [--state=fight] [--frames=300]
import { loadPlaywright } from './lib/load-playwright.mjs';
import { startBenchServer } from './lib/benchServer.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const shot = arg('shot', 'crucibleHud');
const hudState = arg('state', 'fight');
const frames = Number(arg('frames', '300'));

const server = await startBenchServer();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=${shot}&chrome=0&hudState=${hudState}`);
  await page.waitForFunction(() => !!window.__benchHud && typeof window.__benchHud.frame === 'function', null, { timeout: 60000 });
  await page.waitForTimeout(800);
  // The other flight-HUD loops the game drives each frame beside hud.js: the Swarm round card,
  // the announcer, and the calm utility row (band, field build, race tape).
  await page.evaluate(async () => {
    const [sh, sj] = await Promise.all([import('/src/ui/survivalHud.js'), import('/src/ui/swarmJuiceHud.js')]);
    window.__probeLoops = [
      () => sh.survivalHud.state && sh.survivalHud.update(1 / 60, sh.survivalHud.state),
      () => sj.swarmJuiceHud.state && sj.swarmJuiceHud.update(1 / 60, sj.swarmJuiceHud.state),
      () => { const a = window.__benchAuxHud; if (!a) return; a.band?.update?.(); a.fb?.frame?.(1 / 60, { hudVisible: true }); if (a.race && sh.survivalHud.state) a.race.frame?.(sh.survivalHud.state); },
    ];
  });
  const result = await page.evaluate((n) => {
    const counts = {};
    const stacks = {};
    const wrap = (proto, name, kind = 'method') => {
      const key = name;
      if (kind === 'getter') {
        const d = Object.getOwnPropertyDescriptor(proto, name);
        if (!d || !d.get) return;
        Object.defineProperty(proto, name, { configurable: true, get() { counts[key] = (counts[key] || 0) + 1; if (!stacks[key]) stacks[key] = new Error().stack; return d.get.call(this); } });
      } else {
        const orig = proto[name];
        if (typeof orig !== 'function') return;
        proto[name] = function (...a) { counts[key] = (counts[key] || 0) + 1; if (!stacks[key]) stacks[key] = new Error().stack; return orig.apply(this, a); };
      }
    };
    // Warm up (first-frame mounts are not the steady state).
    const loops = window.__probeLoops || [];
    const tick = () => { window.__benchHud.frame(1 / 60); for (const f of loops) { try { f(); } catch {} } };
    for (let i = 0; i < 30; i++) tick();
    wrap(Element.prototype, 'getBoundingClientRect');
    wrap(Element.prototype, 'getClientRects');
    wrap(Element.prototype, 'querySelector');
    wrap(Element.prototype, 'querySelectorAll');
    wrap(Document.prototype, 'querySelector');
    wrap(Document.prototype, 'querySelectorAll');
    wrap(window, 'getComputedStyle');
    for (const g of ['offsetWidth', 'offsetHeight', 'offsetLeft', 'offsetTop']) wrap(HTMLElement.prototype, g, 'getter');
    for (const g of ['clientWidth', 'clientHeight', 'scrollWidth', 'scrollHeight']) wrap(Element.prototype, g, 'getter');
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      tick();
      document.body.offsetHeight; // flush style/layout each frame like a real frame would
    }
    const ms = (performance.now() - t0) / n;
    const trim = (s) => (s || '').split('\n').slice(2, 6).map((l) => l.trim().replace(/https?:\/\/[^/]+\//, '')).join(' <- ');
    return { ms, perFrame: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, +(v / n).toFixed(3)])), where: Object.fromEntries(Object.entries(stacks).map(([k, v]) => [k, trim(v)])) };
  }, frames);
  // The flush probe itself reads offsetHeight once per frame; report it net of that.
  if (result.perFrame.offsetHeight) result.perFrame.offsetHeight = +(result.perFrame.offsetHeight - 1).toFixed(3);
  console.log(JSON.stringify({ shot, hudState, frames, msPerFrame: +result.ms.toFixed(3), callsPerFrame: result.perFrame, firstCaller: result.where }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
