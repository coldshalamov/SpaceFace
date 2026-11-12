// Lead look: THE THROW. Start a Swarm round, latch the nearest light enemy with the Line (tap RMB on
// it), swing by flying an arc, release (tap RMB again = cut) toward the pack, and photograph a strip of
// frames from latch to two seconds after release. Also records what the game itself reports: latches,
// throws, kills and their causes. This is the acceptance look for anything about the throw, the camera
// beats, chain/kill callouts, drops and crush/applause credit.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/throw.mjs [outPrefix] [round]
//
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const PORT = 8162;
const out = process.argv[2] || '.devshots/fleet/looks/throw/run';
const round = Number(process.argv[3] || 2);
mkdirSync(dirname(out), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });

try {
  await sleep(2500);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 160)));
  await page.goto(`http://127.0.0.1:${PORT}/?swarmRound=${round}`);

  // Reach the fight: answer first-run prompt, launch the round from the armory, wait for live hostiles.
  const t0 = Date.now();
  let live = 0;
  while (Date.now() - t0 < 420_000) {
    const ok = page.locator('.sf-confirm__ok');
    if (await ok.first().isVisible().catch(() => false)) await ok.first().click().catch(() => {});
    const launch = page.getByText(/Launch round/i).first();
    if (await launch.isVisible().catch(() => false)) await launch.click({ force: true, timeout: 5000 }).catch(() => {});
    live = await page.evaluate(() => {
      const s = window.SF && window.SF.state;
      if (!s || s.mode !== 'flight') return 0;
      return (s.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship' && !e.isPlayer && e.team !== 0).length;
    }).catch(() => 0);
    if (live >= 3) break;
    await sleep(1500);
  }
  console.log(`fight live: ${live} hostiles after ${Math.round((Date.now() - t0) / 1000)} s`);

  // Listen to what the game reports.
  await page.evaluate(() => {
    const log = (window.__throwLog = []);
    const bus = window.SF && window.SF.bus;
    const sim = () => (window.SF && window.SF.state && window.SF.state.simTime) || 0;
    for (const ev of ['tether:latched', 'massline:throw', 'massline:selfSling', 'entity:killed', 'combat:collisionConsequence', 'tether:cut', 'swarm:drop:spawned', 'pickup:collected']) {
      bus && bus.on && bus.on(ev, (p) => {
        const s = window.SF && window.SF.state;
        const imp = p && p.impactorId != null && s && s.entities && s.entities.get(p.impactorId);
        log.push({ ev, t: +sim().toFixed(2), id: p && (p.id ?? p.payloadId ?? p.victimId), cause: p && (p.cause || p.source || (p.impactorId != null ? 'impactor' : undefined)), killer: p && p.killerId, type: p && p.type,
          impactor: imp ? `${imp.type}:${(imp.data && (imp.data.freight ? 'freight' : imp.data.shipClass || imp.data.kind)) || imp.defId || ''}` : (p && p.impactorId != null ? `gone:${p.impactorId}` : undefined),
          pos: p && p.pos ? [Math.round(p.pos.x), Math.round(p.pos.z)] : undefined });
      });
    }
  });

  await page.mouse.click(640, 360); // focus the canvas
  // The nearest LIGHT hostile that is on screen (inside the HUD-free middle of the frame).
  let pick = null;
  for (let tries = 0; tries < 40 && !pick; tries++) {
    pick = await page.evaluate(() => {
      const s = window.SF.state; const h = window.SF.helpers;
      const me = s.entities.get(s.playerId);
      const cands = [];
      for (const e of s.entityList || []) {
        if (!e || e.alive === false || e.type !== 'ship' || e.isPlayer || e.team === 0) continue;
        if (Number.isFinite(e.mass) && e.mass > 32) continue;
        const scr = h.worldToScreen({ x: e.pos.x, y: 0, z: e.pos.z }, {});
        if (!scr || !scr.onScreen || scr.x < 300 || scr.x > 980 || scr.y < 140 || scr.y > 600) continue;
        cands.push({ id: e.id, mass: e.mass, dist: Math.round(Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z)), scr });
      }
      cands.sort((a, b) => a.dist - b.dist);
      return cands[0] || null;
    });
    if (!pick) await sleep(500);
  }
  if (!pick) { console.log('no light hostile on screen to latch'); }
  const frames = [];
  const shot = async (label) => { const p = `${out}-${String(frames.length).padStart(2, '0')}-${label}.png`; await page.screenshot({ path: p }); frames.push(p); };
  const latchedCount = () => page.evaluate(() => (window.__throwLog || []).filter((e) => e.ev === 'tether:latched').length);

  // Latch: a real press (down, ~120 ms, up) on the target; confirm the game reports the latch, else re-pick.
  let latched = false;
  for (let attempt = 0; attempt < 4 && pick && !latched; attempt++) {
    console.log('target', JSON.stringify(pick));
    await page.mouse.move(pick.scr.x, pick.scr.y, { steps: 3 });
    await page.mouse.down({ button: 'right' }); await sleep(120); await page.mouse.up({ button: 'right' });
    for (let i = 0; i < 10 && !latched; i++) { await sleep(150); latched = (await latchedCount()) > 0; }
    if (!latched) {
      console.log('no latch on attempt', attempt + 1);
      pick = await page.evaluate(() => {
        const s = window.SF.state; const h = window.SF.helpers; const me = s.entities.get(s.playerId);
        const c = [];
        for (const e of s.entityList || []) {
          if (!e || e.alive === false || e.type !== 'ship' || e.isPlayer || e.team === 0) continue;
          if (Number.isFinite(e.mass) && e.mass > 32) continue;
          const scr = h.worldToScreen({ x: e.pos.x, y: 0, z: e.pos.z }, {});
          if (!scr || !scr.onScreen || scr.x < 300 || scr.x > 980 || scr.y < 140 || scr.y > 600) continue;
          c.push({ id: e.id, mass: e.mass, dist: Math.round(Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z)), scr });
        }
        c.sort((a, b) => a.dist - b.dist); return c[0] || null;
      });
    }
  }
  console.log(latched ? 'LATCHED' : 'never latched — the swing below is only flight');
  await shot('latch');
  // Swing: an arc — thrust and turn, aim sweeping around.
  await page.keyboard.down('KeyW'); await page.keyboard.down('KeyD');
  for (let i = 0; i < 6; i++) { await page.mouse.move(640 + 260 * Math.cos(i * 0.6), 360 + 200 * Math.sin(i * 0.6), { steps: 2 }); await sleep(200); if (i % 2 === 0) await shot('swing'); }
  await page.keyboard.up('KeyD');
  // Release toward the densest hostile cluster: tap RMB (a tap while attached cuts = throw).
  const aim = await page.evaluate(() => {
    const s = window.SF.state; const h = window.SF.helpers;
    const hs = (s.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship' && !e.isPlayer && e.team !== 0);
    if (!hs.length) return null;
    const c = hs.reduce((a, e) => ({ x: a.x + e.pos.x / hs.length, z: a.z + e.pos.z / hs.length }), { x: 0, z: 0 });
    return h.worldToScreen({ x: c.x, y: 0, z: c.z }, {});
  });
  if (aim && Number.isFinite(aim.x)) await page.mouse.move(aim.x, aim.y, { steps: 2 });
  await page.mouse.click(aim && Number.isFinite(aim.x) ? aim.x : 640, aim && Number.isFinite(aim.y) ? aim.y : 200, { button: 'right' });
  await page.keyboard.up('KeyW');
  for (let i = 0; i < 6; i++) await shot('release');      // back to back: the release beat
  for (let i = 0; i < 6; i++) { await sleep(300); await shot('after'); }

  const log = await page.evaluate(() => window.__throwLog || []);
  writeFileSync(`${out}-events.json`, JSON.stringify(log, null, 2));
  const count = (ev) => log.filter((e) => e.ev === ev).length;
  const kills = log.filter((e) => e.ev === 'entity:killed');
  console.log(`events: latched ${count('tether:latched')} · throws ${count('massline:throw')} · self-slings ${count('massline:selfSling')} · cuts ${count('tether:cut')} · kills ${kills.length} (${kills.map((k) => k.cause || '?').join(', ')}) · drops ${count('swarm:drop:spawned')}`);
  console.log(`frames: ${frames.length} → ${out}-NN-*.png`);
  await browser.close();
} finally {
  server.kill();
}
