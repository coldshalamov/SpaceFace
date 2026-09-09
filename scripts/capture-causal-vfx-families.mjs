#!/usr/bin/env node
// PQ-134.02 acceptance: the eight causal families, rendered by the live VFX owner, at play size.
//
// The map's "done when" is a capture reviewed at play size, not a unit test. A grammar that reads
// correctly in a table and is invisible on a 1440x900 frame during a fight has not been delivered —
// this is the check that a person can actually TELL these apart while playing.
//
// Boots a normal New Game, flies, then fires each family's cue through the real presentation path
// (`presentation:vfxCue`, the same event the live game uses) and captures the frame. Also captures a
// reduced-motion pass, because the plan requires that variant to still communicate the family.
//
// Usage: node scripts/capture-causal-vfx-families.mjs
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WIDTH = Math.max(1024, Number(process.env.SF_CAPTURE_WIDTH) || 1440);
const HEIGHT = Math.max(700, Number(process.env.SF_CAPTURE_HEIGHT) || 900);
const OUT = join(ROOT, '.devshots', 'causal-vfx');
mkdirSync(OUT, { recursive: true });

const FAMILIES = ['direct', 'bank', 'chain', 'collision', 'terrain', 'tether', 'field', 'reaction'];

function freePort() {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}
async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  const baseUrl = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(baseUrl); if (r.status) return { child, baseUrl }; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server start timeout');
}

let server = null;
let browser = null;
try {
  server = await startServer();
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch { /* ok */ } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e).slice(0, 200)));

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 60000 });
  await page.evaluate(() => { window.SF.bus.emit('game:new', { name: 'Causal VFX', seed: 47 }); window.SF.bus.emit('ui:closeAll', {}); });
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    const p = st && st.entities && st.entities.get(st.playerId);
    return !!(st && st.mode === 'flight' && p && p.alive !== false && p.hull > 0);
  }, null, { timeout: 120000 });
  await page.waitForTimeout(1200);

  const report = [];
  for (const reduced of [false, true]) {
    // Reduced motion is a SETTING the renderer reads (`state.settings.video.motionReduce`), not a
    // CSS class. Toggling the class captured an empty sky and read as "the reduced variant renders
    // nothing", which would have been a false defect report.
    await page.evaluate((on) => {
      const st = window.SF.state;
      st.settings = st.settings || {};
      st.settings.video = st.settings.video || {};
      st.settings.video.motionReduce = !!on;
      try { document.documentElement.classList.toggle('sf-reduce-motion', !!on); } catch { /* ok */ }
    }, reduced);
    for (const family of FAMILIES) {
      // Fire through the SAME event the live game uses, so this exercises the real admission path
      // rather than poking the pool directly.
      const stats = await page.evaluate((fam) => {
        const st = window.SF.state;
        const p = st.entities.get(st.playerId);
        const at = p && p.pos ? { x: p.pos.x + 26, z: p.pos.z + 8 } : { x: 0, z: 0 };
        for (let i = 0; i < 6; i++) {
          window.SF.bus.emit('presentation:vfxCue', {
            // `kind` is what routes a cue to the structural pool. Without it the handler takes the
            // generic particle path and the burst never appears — which looked exactly like the
            // grammar being broken, and was this capture being wrong.
            kind: 'vfx.arcade_structural', lane: 'vfx.arcade_structural',
            family: fam, cause: fam, id: `cap-${fam}-${i}`,
            pos: { x: at.x + i * 7, z: at.z + (i % 2 ? 6 : -6) },
            x: at.x + i * 7, z: at.z + (i % 2 ? 6 : -6),
            magnitude: 1, priority: 3,
          });
        }
        // The stats live wherever the render owner exposes inspect(); try the known holders.
        const holders = [window.SF.ctx && window.SF.ctx.vfx, window.SF.vfx,
          window.SF.ctx && window.SF.ctx.render && window.SF.ctx.render.vfx];
        for (const h of holders) {
          if (h && typeof h.inspect === 'function') {
            const s = h.inspect();
            if (s && s.arcadeStructuralFxStats) return s.arcadeStructuralFxStats;
          }
        }
        return null;
      }, family);
      // A 'fast-radial-short' burst is over in a couple of frames. Waiting 220ms photographed an
      // empty sky and looked exactly like the grammar not working. Capture on the next frame.
      await page.waitForTimeout(40);
      const name = `${reduced ? 'reduced-' : ''}${family}.png`;
      await page.screenshot({ path: join(OUT, name) });
      report.push({ family, reduced, stats });
      console.log(`${reduced ? 'reduced ' : '        '}${family.padEnd(10)} ${stats ? JSON.stringify(stats) : '(no stats)'}`);
    }
  }

  writeFileSync(join(OUT, 'causal-vfx-capture.json'), JSON.stringify({ width: WIDTH, height: HEIGHT, report, errors }, null, 2));
  console.log(`\ncaptured ${report.length} frames -> ${OUT}`);
  if (errors.length) { console.log('PAGE ERRORS:', errors.length); errors.slice(0, 3).forEach((e) => console.log('  ', e)); }
} catch (err) {
  console.error('capture-causal-vfx-families failed:', err && err.message ? err.message : err);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server && server.child) server.child.kill();
}
