// Lead look (LIGHT): what NOCTURNE's logical light sources are doing, and what lands. Boots a Swarm
// round (default 20) or a sector (helios_core), waits for it to be live, then prints the logical
// sources per kind/prefix, the resident slots (source, intensity, range), the real three.js light
// counts in the scene, the frame time over ~6 s, and saves a frame.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/light-census.mjs swarm|helios <outPrefix> [round|sector]
//
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const PORT = 8171;
const mode = process.argv[2] || 'swarm';
const out = process.argv[3] || `.devshots/fleet/looks/light/${mode}`;
const arg = process.argv[4];
mkdirSync(dirname(out), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });

try {
  await sleep(2500);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 160)));
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  const url = mode === 'swarm' ? `http://127.0.0.1:${PORT}/?swarmRound=${Number(arg || 20)}`
    : `http://127.0.0.1:${PORT}/?sector=${encodeURIComponent(arg || 'helios_core')}&shot=1`;
  await page.goto(url, { waitUntil: 'commit', timeout: 120_000 });
  const t0 = Date.now();
  let live = 0;
  while (Date.now() - t0 < 420_000) {
    const ok = page.locator('.sf-confirm__ok');
    if (await ok.first().isVisible().catch(() => false)) await ok.first().click().catch(() => {});
    const launch = page.getByText(/Launch round/i).first();
    if (mode === 'swarm' && await launch.isVisible().catch(() => false)) await launch.click({ force: true, timeout: 5000 }).catch(() => {});
    if (mode === 'swarm') {
      live = await page.evaluate(() => {
        const s = window.SF && window.SF.state;
        if (!s || s.mode !== 'flight') return 0;
        return (s.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship' && !e.isPlayer && e.team !== 0).length;
      }).catch(() => 0);
      if (live >= 3) break;
    } else {
      if (await page.evaluate(() => window.__sfShotReady === true).catch(() => false)) break;
    }
    await sleep(1500);
  }
  console.log(`live: ${live} after ${Math.round((Date.now() - t0) / 1000)} s`);
  await sleep(mode === 'swarm' ? 6000 : 4000);
  await page.screenshot({ path: `${out}-frame.png` });
  const report = await page.evaluate(async () => {
    const s = window.SF.state; const n = s.render && s.render.nocturne;
    if (!n) return { error: 'no nocturne' };
    const kinds = {}; const examples = {};
    for (const src of n.registry.sources) {
      const pre = String(src.id).split(':').slice(0, 2).join(':').replace(/\d+$/, '#');
      const k = `${src.type}/${pre}`;
      const o = kinds[k] || (kinds[k] = { n: 0, on: 0, gainSum: 0, maxI: 0, rng: 0 });
      o.n++; if (src.enabled && src.gain > 0 && src.intensity > 0) o.on++;
      o.gainSum += src.gain; o.maxI = Math.max(o.maxI, src.intensity * src.gain); o.rng = Math.max(o.rng, src.range);
    }
    const slots = n.director.slots.map((sl) => ({ kind: sl.kind, id: sl.source && sl.source.id, I: +sl.light.intensity.toFixed(1),
      range: sl.light.distance, lvl: +sl.level.toFixed(2), prio: sl.source && sl.source.priority }));
    let lights = 0, lit = 0; const byType = {};
    s.render.scene && s.render.scene.traverse && 0;
    const scene = n.scene;
    scene.traverse((o) => { if (o.isLight && !o.isAmbientLight) { lights++; byType[o.type] = (byType[o.type] || 0) + (o.visible ? 1 : 0); if (o.visible && o.intensity > 0) lit++; } });
    const d = n.director.getDiagnostics();
    const atm = n.atmosphere && n.atmosphere.getDiagnostics ? n.atmosphere.getDiagnostics() : null;
    // frame time
    const ts = []; await new Promise((res) => { let last = performance.now(); let c = 0; const f = (t) => { ts.push(t - last); last = t; if (++c < 240) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    ts.sort((a, b) => a - b);
    const ents = {}; for (const e of s.entityList || []) { if (e.alive !== false) ents[e.type] = (ents[e.type] || 0) + 1; }
    return { kinds, slots, lights, lit, byType, diag: { logical: d.logical, cand: d.candidates, active: d.active }, composition: n.content.compositionId, shadowsEnabled: n.shadowsEnabled, quality: n.quality, playerLamp: n._options && n._options.playerLamp,
      media: n.content.media && n.content.media.length, atm: atm && { enabled: atm.enabled, media: atm.media, lights: atm.lights, mode: atm.mode },
      frameMs: { med: +ts[120].toFixed(2), p95: +ts[228].toFixed(2) }, ents };
  });
  console.log(JSON.stringify(report, null, 1));
  // Legacy emulation, same session: the old system had no spot light resident with shadows off and
  // measured light from the camera. Hide every spot and drop the focus; shoot; then restore.
  if (process.argv.includes('--legacy')) {
    await page.evaluate(async () => {
      const n = window.SF.state.render.nocturne;
      n.__setFocus = n.director.setFocus;
      n.director.setFocus = () => { n.director._hasFocus = false; };
      n.director.slots.filter((sl) => sl.kind === 'spot').forEach((sl) => { sl.light.visible = false; });
      n.director.invalidate();
      await new Promise((r) => setTimeout(r, 4000));
    });
    await page.screenshot({ path: `${out}-legacy.png` });
    await page.evaluate(async () => {
      const n = window.SF.state.render.nocturne;
      n.director.setFocus = n.__setFocus;
      n.director.slots.filter((sl) => sl.kind === 'spot').forEach((sl) => { sl.light.visible = true; });
      n.director.invalidate();
      await new Promise((r) => setTimeout(r, 4000));
    });
    await page.screenshot({ path: `${out}-after2.png` });
  }
  // Cost of the extra real spot lights: same session, same scene. Hiding a SpotLight changes the
  // program light count (one recompile), so each phase waits, then samples GPU pass averages.
  if (process.argv.includes('--ab')) {
    const phase = async (hideExtra) => page.evaluate(async (hide) => {
      const n = window.SF.state.render.nocturne; const t = window.SF.state.render.gpuTimers;
      n.director.slots.filter((sl) => sl.kind === 'spot').slice(1).forEach((sl) => { sl.light.visible = !hide; });
      await new Promise((r) => setTimeout(r, 4000));
      t.reset(); t.setEnabled(true);
      await new Promise((r) => setTimeout(r, 6000));
      const rep = t.getReport(); t.setEnabled(false);
      const passes = {}; let total = 0;
      for (const [k, v] of Object.entries(rep.passes)) if (v.samples) { passes[k] = +v.avg.toFixed(3); total += v.avg; }
      return { hidExtraSpots: hide, valid: rep.captureValid, totalMs: +total.toFixed(3), passes };
    }, hideExtra);
    console.log('AB', JSON.stringify([await phase(true), await phase(false), await phase(true), await phase(false)]));
  }
  await browser.close();
} finally {
  server.kill();
  setTimeout(() => process.exit(0), 500);
}
