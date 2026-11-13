// LOOK-05D look: what a Swarm round looks like as a PLACE. For each round (default 1, 3, 20) it boots
// the round, waits for the fight, then shoots (a) the wide default frame, (b) beside each floor pad
// (forge, crate, wall guns, taps), (c) beside the furnace/plates if the round has them, and writes a
// JSON of where every pad, plate, rock and hostile sat relative to the room centre.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/arena-rounds.mjs <outDir> [1,3,20]
//
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const PORT = 8166;
const outDir = process.argv[2] || '.devshots/look05d/arena';
const rounds = String(process.argv[3] || '1,3,20').split(',').map(Number);
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });

async function runRound(browser, round) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 160)));
  await page.goto(`http://127.0.0.1:${PORT}/?swarmRound=${round}`);
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
  console.log(`round ${round}: fight live (${live} hostiles) after ${Math.round((Date.now() - t0) / 1000)} s`);
  await sleep(3000);
  const tag = `${outDir}/r${round}`;
  await page.screenshot({ path: `${tag}-wide.png` });
  const layout = await page.evaluate(() => {
    const s = window.SF.state;
    const me = s.entities.get(s.playerId);
    const rel = (e) => ({ x: Math.round(e.pos.x - me.pos.x), z: Math.round(e.pos.z - me.pos.z) });
    const out = { player: { x: Math.round(me.pos.x), z: Math.round(me.pos.z) }, pads: [], room: [], rocks: [], hostiles: 0 };
    for (const e of s.entityList || []) {
      if (!e || e.alive === false || e.isPlayer) continue;
      if (e.data && e.data.swarmFloorPad) out.pads.push({ id: e.id, kind: e.data.swarmFloorPad.kind, padId: e.data.swarmFloorPad.padId, ...rel(e), r: e.radius });
      else if (e.data && e.data.roomKind) out.room.push({ id: e.id, kind: e.data.roomKind, ...rel(e), r: e.radius });
      else if (e.type === 'asteroid') out.rocks.push({ ...rel(e), r: Math.round(e.radius) });
      else if (e.type === 'ship' && e.team !== 0) out.hostiles++;
    }
    return out;
  });
  writeFileSync(`${tag}-layout.json`, JSON.stringify(layout, null, 2));
  const stops = [];
  const seen = new Set();
  for (const p of layout.pads) { if (!seen.has(p.kind)) { seen.add(p.kind); stops.push({ label: `pad-${p.kind}`, id: p.id }); } }
  for (const r of layout.room) { if (r.kind === 'furnace' || (r.kind === 'plate' && !seen.has('plate'))) { seen.add(r.kind); stops.push({ label: `room-${r.kind}`, id: r.id }); } }
  for (const stop of stops) {
    const ok = await page.evaluate((id) => {
      const s = window.SF.state; const me = s.entities.get(s.playerId); const e = s.entities.get(id);
      if (!me || !e) return false;
      me.pos.x = e.pos.x - 55; me.pos.z = e.pos.z + 20;
      if (me.vel) { me.vel.x = 0; me.vel.z = 0; }
      return true;
    }, stop.id);
    if (!ok) continue;
    await sleep(1100);
    await page.screenshot({ path: `${tag}-${stop.label}.png` });
  }
  await page.close();
}

try {
  await sleep(2500);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  for (const round of rounds) await runRound(browser, round);
  await browser.close();
  console.log('done');
} finally {
  server.kill();
}
