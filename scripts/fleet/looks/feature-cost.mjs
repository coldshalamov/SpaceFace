// Lead look (LIGHT): what each picture feature costs, in ms of frame time, from ONE boot of one Swarm round.
// GPU timers are invalid under contention, so this uses what always works: requestAnimationFrame intervals
// (p50/p95/p99) and long tasks over the same window. Every feature is toggled LIVE in A/B/A order (A = as
// shipped, B = feature off) so drift cancels; cost = mean(A) - B. Frozen mode (sim clock 0, renderer drawing)
// removes fight randomness; live mode keeps the sim running for effects that need motion (flipbooks).
//
//   SF_LOCK_URGENT=1 node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/feature-cost.mjs [outJson] [round] [windowSeconds]
//
import { chromium as rawChromium } from 'playwright';
import { quietChromium } from '../../lib/quietLaunch.mjs';
const chromium = quietChromium(rawChromium);
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const PORT = 8173;
const out = process.argv[2] || '.devshots/fleet/looks/featurecost/run.json';
const round = Number(process.argv[3] || 20);
const WIN = Number(process.argv[4] || 20);
mkdirSync(dirname(out), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
try {
  await sleep(2500);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist',
    // Uncapped presentation: with vsync on, frame intervals quantize to 16.7 ms steps and hide a 1 ms feature.
    '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 160)));
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  await page.goto(`http://127.0.0.1:${PORT}/?swarmRound=${round}`, { waitUntil: 'commit', timeout: 120_000 });
  const t0 = Date.now();
  while (Date.now() - t0 < 420_000) {
    const ok = page.locator('.sf-confirm__ok');
    if (await ok.first().isVisible().catch(() => false)) await ok.first().click().catch(() => {});
    const launch = page.getByText(/Launch round/i).first();
    if (await launch.isVisible().catch(() => false)) await launch.click({ force: true, timeout: 5000 }).catch(() => {});
    const live = await page.evaluate(() => {
      const s = window.SF && window.SF.state;
      return !!s && s.mode === 'flight'
        && (s.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship' && !e.isPlayer && e.team !== 0).length >= 3;
    }).catch(() => false);
    if (live) break;
    await sleep(1500);
  }
  await sleep(5000);

  // Page-side toggle table. Each entry: on() = as shipped, off() = feature removed.
  await page.evaluate(() => {
    const SF = window.SF, s = SF.state, n = s.render.nocturne, video = s.settings.video;
    const emit = (key, value) => { video[key] = value; SF.bus.emit('settings:changed', { section: 'video', key, value }); };
    const spots = () => n.director.slots.filter((sl) => sl.kind === 'spot').slice(1);
    const origContent = n.content.update.bind(n.content), origHead = n.headlights.update.bind(n.headlights);
    const saved = { bloom: video.bloom, levels: video.bloomLevels, atm: video.nocturneAtmosphere };
    window.__ft = {
      freeze: (on) => { if (on) SF.timeEffects.set('bench:freeze', { scale: 0 }); else SF.timeEffects.clear('bench:freeze'); },
      toggles: {
        'nocturne spots 3 vs 1': {
          on: () => spots().forEach((sl) => { sl.light.visible = true; }),
          off: () => spots().forEach((sl) => { sl.light.visible = false; }) },
        'headlamps (all)': {
          on: () => { n.headlights.update = origHead; },
          off: () => { n.headlights.update = (...a) => { origHead(...a); for (const r of n.headlights.rows) if (r.source) r.source.enabled = false; }; } },
        'arena/fixture lights': {
          on: () => { n.content.update = origContent; },
          off: () => { n.content.update = (...a) => { const r = origContent(...a);
            for (const src of n.registry.sources) if (String(src.id).startsWith('nocturne:entity')) src.enabled = false; return r; }; } },
        'haze (nocturne atmosphere)': { on: () => emit('nocturneAtmosphere', saved.atm), off: () => emit('nocturneAtmosphere', false) },
        'flipbook vfx draws': {
          on: () => s.render.scene.traverse((o) => { if (/^SF_VFX_flip/.test(o.name)) o.visible = true; }),
          off: () => s.render.scene.traverse((o) => { if (/^SF_VFX_flip/.test(o.name)) o.visible = false; }) },
        'bloom chain on vs off': { on: () => emit('bloom', saved.bloom), off: () => emit('bloom', false) },
        'bloom levels 2 vs 1': { on: () => emit('bloomLevels', saved.levels), off: () => emit('bloomLevels', 1) },
      },
    };
    window.__ftLong = [];
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__ftLong.push(e.duration); }).observe({ entryTypes: ['longtask'] }); } catch (_) {}
  });
  const names = await page.evaluate(() => Object.keys(window.__ft.toggles));
  const sample = (seconds) => page.evaluate(async (sec) => {
    window.__ftLong.length = 0;
    const iv = [];
    await new Promise((res) => {
      let last = performance.now(); const end = last + sec * 1000;
      const f = (t) => { iv.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else res(); };
      requestAnimationFrame(f);
    });
    iv.sort((a, b) => a - b);
    const q = (p) => iv[Math.min(iv.length - 1, Math.floor(iv.length * p))];
    const mean = iv.reduce((a, b) => a + b, 0) / iv.length;
    return { frames: iv.length, mean, p50: q(0.5), p95: q(0.95), p99: q(0.99), long: window.__ftLong.length, longMs: window.__ftLong.reduce((a, b) => a + b, 0) };
  }, seconds);
  const apply = (name, state) => page.evaluate(([n, st]) => { window.__ft.toggles[n][st](); }, [name, state]);
  const results = [];
  const run = async (mode, only) => {
    await page.evaluate((m) => window.__ft.freeze(m === 'frozen'), mode);
    await sleep(2500);
    for (const name of names) {
      if (only && !only.includes(name)) continue;
      const row = { mode, feature: name };
      for (const [label, state] of [['A1', 'on'], ['B', 'off'], ['A2', 'on']]) {
        await apply(name, state); await sleep(4000); // recompiles and history settle
        row[label] = await sample(WIN);
      }
      await apply(name, 'on'); await sleep(1500);
      const meanA = (k) => (row.A1[k] + row.A2[k]) / 2;
      row.cost = { mean: +(meanA('mean') - row.B.mean).toFixed(2), p50: +(meanA('p50') - row.B.p50).toFixed(2), p95: +(meanA('p95') - row.B.p95).toFixed(2), p99: +(meanA('p99') - row.B.p99).toFixed(2),
        drift50: +(row.A1.p50 - row.A2.p50).toFixed(2), longA: (row.A1.long + row.A2.long) / 2, longB: row.B.long };
      results.push(row);
      console.log(JSON.stringify({ mode, feature: name, A1: +row.A1.p50.toFixed(2), B: +row.B.p50.toFixed(2), A2: +row.A2.p50.toFixed(2), cost: row.cost }));
    }
  };
  await run('frozen');
  await run('live', ['flipbook vfx draws', 'headlamps (all)', 'haze (nocturne atmosphere)', 'nocturne spots 3 vs 1']);
  writeFileSync(out, JSON.stringify(results, null, 1));
  console.log('| mode | feature | cost mean ms | p50 | p95 | p99 | A drift p50 | long tasks A/B |');
  for (const r of results) console.log(`| ${r.mode} | ${r.feature} | ${r.cost.mean} | ${r.cost.p50} | ${r.cost.p95} | ${r.cost.p99} | ${r.cost.drift50} | ${r.cost.longA}/${r.cost.longB} |${(r.cost.p50 > 1 || r.cost.mean > 1) ? ' FLAG >1ms' : ''}`);
  await browser.close();
} finally { server.kill(); setTimeout(() => process.exit(0), 500); }
