// LOOK-05D look: the Ricochet Foundry's visible edge. Boots a Swarm round, shoots the room from beside
// the rim (looking out across the plates), a wide frame, and measures FRAME COST of the rim: requestAnimationFrame
// intervals (p50/p95) over a fixed window with the rim ON, then the rim bodies removed (alive=false), then a second
// window with it OFF again so the drift between two identical windows (noise) is visible next to the effect.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/rim-d.mjs <outPrefix> [round] [windowSeconds]
//
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const PORT = 8174;
const out = process.argv[2] || '.devshots/look05d/rim/r';
const round = Number(process.argv[3] || 20);
const WIN = Number(process.argv[4] || 10);
mkdirSync(dirname(out), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
try {
  await sleep(2500);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist',
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
    const live = await page.evaluate(() => { const s = window.SF && window.SF.state; return !!s && s.mode === 'flight'
      && (s.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship' && !e.isPlayer && e.team !== 0).length >= 3; }).catch(() => false);
    if (live) break;
    await sleep(1500);
  }
  await sleep(20000);
  const rim = await page.evaluate(() => {
    const s = window.SF.state; const plates = [];
    for (const e of s.entityList || []) if (e && e.alive !== false && e.data && /foundry_rim_/.test(String(e.data.roomToyId || ''))) plates.push({ id: e.id, x: e.pos.x, z: e.pos.z });
    const cx = plates.reduce((a, p) => a + p.x, 0) / (plates.length || 1), cz = plates.reduce((a, p) => a + p.z, 0) / (plates.length || 1);
    return { count: plates.length, cx, cz, ids: plates.map((p) => p.id) };
  });
  console.log('rim', JSON.stringify({ count: rim.count }));
  await page.screenshot({ path: `${out}-wide.png` });
  // Beside the rim: stand 330 WU out toward the first plate and look at it (the camera follows the player).
  await page.evaluate(({ cx, cz }) => {
    const s = window.SF.state; const me = s.entities.get(s.playerId);
    const a = 0.26; me.pos.x = cx + Math.cos(a) * 330; me.pos.z = cz + Math.sin(a) * 330; if (me.vel) { me.vel.x = 0; me.vel.z = 0; }
  }, rim);
  await sleep(3500);
  await page.screenshot({ path: `${out}-edge.png` });
  const measure = (seconds) => page.evaluate(async (seconds) => {
    const ts = []; let last = performance.now(); const end = last + seconds * 1000;
    await new Promise((res) => { const f = (t) => { ts.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    ts.sort((a, b) => a - b); const q = (p) => +ts[Math.min(ts.length - 1, Math.floor(p * ts.length))].toFixed(2);
    return { frames: ts.length, p50: q(0.5), p95: q(0.95), p99: q(0.99) };
  }, seconds);
  const A = await measure(WIN);
  await page.evaluate((ids) => { const s = window.SF.state; for (const id of ids) { const e = s.entities.get(id); if (e) e.alive = false; } }, rim.ids);
  await sleep(3000);
  const gone = await page.evaluate((ids) => ids.filter((id) => { const e = window.SF.state.entities.get(id); return e && e.alive !== false; }).length, rim.ids);
  const B = await measure(WIN);
  const B2 = await measure(WIN);
  const result = { rim: rim.count, rimStillAlive: gone, ON: A, OFF: B, OFF_repeat: B2,
    delta_p50: +(A.p50 - (B.p50 + B2.p50) / 2).toFixed(2), delta_p95: +(A.p95 - (B.p95 + B2.p95) / 2).toFixed(2),
    noise_p50: +Math.abs(B.p50 - B2.p50).toFixed(2), noise_p95: +Math.abs(B.p95 - B2.p95).toFixed(2) };
  console.log(JSON.stringify(result));
  writeFileSync(`${out}-cost.json`, JSON.stringify(result, null, 2));
  await browser.close();
} finally { server.kill(); setTimeout(() => process.exit(0), 500); }
