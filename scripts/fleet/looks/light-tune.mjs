// Lead look (LIGHT): matched lamp A/B on ONE frozen frame. Boots Swarm round N (or a sector), freezes the sim
// clock (SF.timeEffects 'bench:freeze' scale 0, renderer keeps drawing), then on that same frame:
// lamps off, then each headlight intensity variant, shooting each and sampling GPU pass time.
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/light-tune.mjs swarm <outPrefix> 20 [i1,i2,...]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const PORT = 8172;
const mode = process.argv[2] || 'swarm';
const out = process.argv[3] || `.devshots/fleet/looks/light/tune-${mode}`;
const arg = process.argv[4];
// variants: intensity[:hexcolour[:angle[:penumbra]]], comma separated. Add --rock to park the player 50 WU off a big rock.
import { existsSync, readFileSync } from 'node:fs';
const variantFile = process.argv.find((a) => a.startsWith('--variants='))?.slice(11) || '.devshots/fleet/looks/t2-variants.txt';
const variants = (variantFile && existsSync(variantFile) ? readFileSync(variantFile, 'utf8').trim() : (process.argv[5] || '25200,12000,6000,3000')).split(',');
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
  while (Date.now() - t0 < 420_000) {
    const ok = page.locator('.sf-confirm__ok');
    if (await ok.first().isVisible().catch(() => false)) await ok.first().click().catch(() => {});
    const launch = page.getByText(/Launch round/i).first();
    if (mode === 'swarm' && await launch.isVisible().catch(() => false)) await launch.click({ force: true, timeout: 5000 }).catch(() => {});
    const ready = mode === 'swarm'
      ? await page.evaluate(() => { const s = window.SF && window.SF.state; return !!s && s.mode === 'flight'
          && (s.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship' && !e.isPlayer && e.team !== 0).length >= 3; }).catch(() => false)
      : await page.evaluate(() => window.__sfShotReady === true).catch(() => false);
    if (ready) break;
    await sleep(1500);
  }
  await sleep(5000);
  await page.evaluate((rock) => {
    const SF = window.SF; SF.timeEffects.set('bench:freeze', { scale: 0 });
    const n = SF.state.render.nocturne;
    if (rock) {
      const st = SF.state, p = st.entities.get(st.playerId);
      let best = null, bd = 1e9;
      for (const e of st.entityList) if (e.type === 'asteroid' && e.alive !== false && e.radius > 25) {
        const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z); if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        const gap = best.radius + 50, ang = Math.atan2(best.pos.z - p.pos.z, best.pos.x - p.pos.x);
        p.pos.x = best.pos.x - Math.cos(ang) * gap; p.pos.z = best.pos.z - Math.sin(ang) * gap; p.rot = ang;
        if (p.vel) { p.vel.x = 0; p.vel.z = 0; }
      }
    }
    n.__look = n.headlights.look; n.__update = n.headlights.update.bind(n.headlights);
  }, process.argv.includes('--rock'));
  await sleep(2500);
  const phase = async (label, spec) => {
    const [iStr, hex, ang, pen, dec] = String(spec).split(':'); const intensity = Number(iStr);
    const rep = await page.evaluate(async ({ intensity, hex, ang, pen, dec }) => {
      const n = window.SF.state.render.nocturne, t = window.SF.state.render.gpuTimers;
      if (intensity === 0) {
        n.headlights.update = (...a) => { n.__update(...a); for (const r of n.headlights.rows) if (r.source) r.source.enabled = false; };
      } else {
        n.headlights.update = n.__update;
        n.headlights.look = { ...n.__look, intensity };
        for (const r of n.headlights.rows) if (r.source) {
          if (hex) r.source.color.set('#' + hex); else r.source.color.set(n.__look.colorHex);
          if (ang) r.source.angle = ang; if (pen) r.source.penumbra = pen;
          r.source.decay = dec || n.__look.decay;
        }
      }
      n.director.invalidate();
      await new Promise((r) => setTimeout(r, 3500));
      t.reset(); t.setEnabled(true);
      await new Promise((r) => setTimeout(r, 4000));
      const rep = t.getReport(); t.setEnabled(false);
      let total = 0; const passes = {};
      for (const [k, v] of Object.entries(rep.passes)) if (v.samples) { passes[k] = +v.avg.toFixed(2); total += v.avg; }
      const spots = n.director.slots.filter((s) => s.kind === 'spot').map((s) => `${s.source && s.source.id}:${Math.round(s.light.intensity)}`);
      return { scale: window.SF.state.timeScale, valid: rep.captureValid, totalMs: +total.toFixed(2), passes, spots };
    }, { intensity, hex, ang: ang && Number(ang), pen: pen && Number(pen), dec: dec && Number(dec) });
    await page.screenshot({ path: `${out}-${label}.png` });
    console.log(label, JSON.stringify(rep));
  };
  await phase('off', '0');
  for (const v of variants) await phase(`i${v.replace(/:/g, '_')}`, v);
  await phase('off2', '0');
  await browser.close();
} finally { server.kill(); setTimeout(() => process.exit(0), 500); }
