// LOOK-05D look: the Swarm props and enemies, up close. Boots a Swarm round, then parks the player
// beside each floor pad (wall gun / crate / forge / tap), each fortify device and one of every
// hostile hull, and photographs what the player would see. Used for before/after of the model cleanup.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/props-d.mjs [outPrefix] [round]
//
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const PORT = 8165;
const out = process.argv[2] || '.devshots/look05d/props/p';
const round = Number(process.argv[3] || 3);
mkdirSync(dirname(out), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });

try {
  await sleep(2500);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
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
  console.log(`fight live: ${live} hostiles after ${Math.round((Date.now() - t0) / 1000)} s`);
  await sleep(1500);

  const targets = await page.evaluate(() => {
    const s = window.SF.state;
    const list = [];
    const seen = new Set();
    for (const e of s.entityList || []) {
      if (!e || e.alive === false || e.isPlayer) continue;
      let key = null;
      if (e.data && e.data.swarmFloorPad) key = `pad-${e.data.swarmFloorPad.kind}`;
      else if (e.data && e.data.swarmFortify) key = `fort-${e.data.swarmFortify.deviceId}`;
      else if (e.type === 'ship' && e.team !== 0) key = `ship-${e.defId || e.data?.shipClass || e.data?.lootTableId || 'x'}`;
      else if (e.type === 'payload') key = `payload-${e.data?.freight ? 'freight' : 'other'}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      list.push({ key, id: e.id });
    }
    return list;
  });
  console.log('targets', targets.map((t) => t.key).join(', '));
  const names = [];
  for (const t of targets.slice(0, 24)) {
    const ok = await page.evaluate((id) => {
      const s = window.SF.state;
      const me = s.entities.get(s.playerId); const e = s.entities.get(id);
      if (!me || !e) return false;
      me.pos.x = e.pos.x - 40; me.pos.z = e.pos.z;
      if (me.vel) { me.vel.x = 0; me.vel.z = 0; }
      return true;
    }, t.id);
    if (!ok) continue;
    await sleep(900);
    const p = `${out}-${t.key.replace(/[^\w-]+/g, '_')}.png`;
    await page.screenshot({ path: p });
    names.push(p);
  }
  writeFileSync(`${out}-targets.json`, JSON.stringify(targets, null, 2));
  console.log(`shots: ${names.length}`);
  await browser.close();
} finally {
  server.kill();
}
