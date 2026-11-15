// THROW-01 rate boot: N latch-and-release attempts per Swarm round, releasing ~1 s after each latch with the
// click inside the playfield. Per attempt it records the tether's own end reason, the held body and its
// fate (killer/cause), and whether massline:throw fired. Mode `hammer` (default) or `nohammer` (the
// held-body contact rule is switched off by rewriting the served module in this browser only).
//   SF_LOCK_URGENT=1 node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/throw-rate.mjs <out.json> <hammer|nohammer> <rounds e.g. 1,2,3> <attemptsPerRound>
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const out = process.argv[2] || '.devshots/fleet/looks/throw-rate/run.json';
const mode = process.argv[3] || 'hammer';
const rounds = (process.argv[4] || '1,2,3').split(',').map(Number);
const per = Number(process.argv[5] || 8);
const PORT = mode === 'nohammer' ? 8164 : 8163;
mkdirSync(dirname(out), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
const results = [];
let patched = 0;
try {
  await sleep(2500);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  if (mode === 'nohammer') {
    await ctx.route(/\.m?js(\?.*)?$/, async (route) => {
      if (!/collisionConsequences|simLane|wholeSim|chunk|bundle/i.test(route.request().url())) return route.continue();
      const res = await route.fetch();
      let body = await res.text();
      if (/function isHeldOnPlayerLine\(state, body\) \{/.test(body)) {
        patched += 1; body = body.replace(/function isHeldOnPlayerLine\(state, body\) \{/, 'function isHeldOnPlayerLine(state, body) { return false;');
      }
      await route.fulfill({ response: res, body });
    });
  }
  for (const round of rounds) {
    const page = await ctx.newPage();
    page.on('pageerror', () => {});
    await page.goto(`http://127.0.0.1:${PORT}/?swarmRound=${round}`, { timeout: 120000 });
    const t0 = Date.now(); let live = 0;
    while (Date.now() - t0 < 420_000) {
      const ok = page.locator('.sf-confirm__ok');
      if (await ok.first().isVisible().catch(() => false)) await ok.first().click().catch(() => {});
      const launch = page.getByText(/Launch round/i).first();
      if (await launch.isVisible().catch(() => false)) await launch.click({ force: true, timeout: 5000 }).catch(() => {});
      live = await page.evaluate(() => { const s = window.SF && window.SF.state; if (!s || s.mode !== 'flight') return 0;
        return (s.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship' && !e.isPlayer && e.team !== 0).length; }).catch(() => 0);
      if (live >= 3) break;
      await sleep(1500);
    }
    if (!(await page.evaluate(() => !!(window.SF && window.SF.bus)).catch(() => false))) { console.log(`round ${round}: game never reached flight`); await page.close(); continue; }
    await page.evaluate(() => {
      const log = (window.__log = []);
      const bus = window.SF.bus; const sim = () => window.SF.state.simTime;
      for (const ev of ['tether:latched', 'massline:throw', 'massline:selfSling', 'tether:cut', 'tether:broke', 'entity:killed', 'combat:damage'])
        bus.on(ev, (p) => log.push({ ev, t: +sim().toFixed(2), tgt: p && p.targetId, id: p && (p.id ?? p.payloadId), br: p && (p.reason || p.breakReason), killer: p && p.killer, cause: p && p.cause, dmg: p && p.applied, origin: p && p.origin && (p.origin.kind || p.origin.id), weapon: p && p.weaponId, victim: p && p.targetId }));
    });
    await page.mouse.click(640, 360);
    const pickTarget = () => page.evaluate(() => {
      const s = window.SF.state, h = window.SF.helpers, me = s.entities.get(s.playerId), c = [];
      for (const e of s.entityList || []) {
        if (!e || e.alive === false || e.type !== 'ship' || e.isPlayer || e.team === 0) continue;
        if (Number.isFinite(e.mass) && e.mass > 32) continue;
        const scr = h.worldToScreen({ x: e.pos.x, y: 0, z: e.pos.z }, {});
        if (!scr || !scr.onScreen || scr.x < 300 || scr.x > 980 || scr.y < 140 || scr.y > 600) continue;
        c.push({ id: e.id, mass: e.mass, dist: Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z), scr });
      }
      c.sort((a, b) => a.dist - b.dist); return c[0] || null; });
    for (let a = 0; a < per; a++) {
      const rec = { round, attempt: a, mode, latched: false, held: null, heldMass: null, throw: false, selfSling: false, cut: false, endReason: null, heldFate: null, secondClick: false };
      const mark = await page.evaluate(() => window.__log.length);
      let pick = null;
      for (let i = 0; i < 10 && !pick; i++) { pick = await pickTarget(); if (!pick) await sleep(500); }
      if (!pick) { rec.note = 'no light hostile on screen'; results.push(rec); continue; }
      rec.heldMass = pick.mass;
      await page.mouse.move(pick.scr.x, pick.scr.y, { steps: 3 });
      await page.mouse.down({ button: 'right' }); await sleep(120); await page.mouse.up({ button: 'right' });
      let L = null;
      for (let i = 0; i < 10 && !L; i++) { await sleep(150); L = await page.evaluate((m) => window.__log.slice(m).find((e) => e.ev === 'tether:latched') || null, mark); }
      if (!L) { rec.note = 'no latch'; results.push(rec); await sleep(800); continue; }
      rec.latched = true; rec.held = L.tgt;
      await page.keyboard.down('KeyW'); await page.keyboard.down('KeyD');
      await sleep(1000);
      await page.keyboard.up('KeyD');
      const active = await page.evaluate(() => !!window.SF.state.player.tether.active);
      rec.atClick = await page.evaluate(() => { const st = window.SF.state, t = st.player.tether, e = t && st.entities.get(t.targetId); return { tether: t && { active: t.active, target: t.targetId, att: t.attachmentId, phase: t.phase }, tgt: e && { type: e.type, team: e.team, alive: e.alive, ai: e.data && e.data.ai && { arch: e.data.ai.archetype, role: e.data.ai.role, passive: e.data.ai.passive, ctx: e.data.ai.spawnContext, lawful: e.data.ai.lawful }, enc: !!(e.data && e.data.encounter) } }; });
      rec.clickT = await page.evaluate(() => +window.SF.state.simTime.toFixed(2));
      if (active) {
        const aim = await page.evaluate(() => { const s = window.SF.state, h = window.SF.helpers;
          const hs = (s.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship' && !e.isPlayer && e.team !== 0);
          if (!hs.length) return null; const c = hs.reduce((q, e) => ({ x: q.x + e.pos.x / hs.length, z: q.z + e.pos.z / hs.length }), { x: 0, z: 0 });
          return h.worldToScreen({ x: c.x, y: 0, z: c.z }, {}); });
        const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        await page.mouse.move(cl(aim && Number.isFinite(aim.x) ? aim.x : 640, 300, 980), cl(aim && Number.isFinite(aim.y) ? aim.y : 200, 140, 600), { steps: 2 });
        await page.mouse.down({ button: 'right' }); await sleep(120); await page.mouse.up({ button: 'right' });
      } else rec.note = 'line already gone before the click';
      await page.keyboard.up('KeyW');
      await sleep(1500);
      const ev = await page.evaluate((m) => window.__log.slice(m), mark);
      rec.throw = ev.some((e) => e.ev === 'massline:throw');
      rec.selfSling = ev.some((e) => e.ev === 'massline:selfSling');
      rec.cut = ev.some((e) => e.ev === 'tether:cut');
      const br = ev.find((e) => e.ev === 'tether:broke' && e.tgt === rec.held);
      rec.endReason = br ? br.br : (rec.throw ? 'thrown' : (rec.cut ? 'cut' : null));
      const k = ev.find((e) => e.ev === 'entity:killed' && e.id === rec.held);
      rec.killsWhileHeld = ev.filter((e) => e.ev === 'entity:killed' && e.id !== rec.held && e.t >= L.t && e.t < rec.clickT).length;
      rec.killsAfterRelease = ev.filter((e) => e.ev === 'entity:killed' && e.id !== rec.held && e.t >= rec.clickT).length;
      rec.damageToHeld = ev.filter((e) => e.ev === 'combat:damage' && (e.victim === rec.held || e.tgt === rec.held)).map((e) => `${e.origin}/${e.weapon}:${Math.round(e.dmg)}`).slice(-4);
      rec.heldFate = k ? { t: k.t, killer: k.killer, cause: k.cause ?? null, afterLatch: +(k.t - L.t).toFixed(2) } : 'alive';
      if (await page.evaluate(() => !!window.SF.state.player.tether.active)) {
        rec.secondClick = true; await page.mouse.down({ button: 'right' }); await sleep(120); await page.mouse.up({ button: 'right' }); await sleep(600);
      }
      results.push(rec);
      writeFileSync(out, JSON.stringify(results, null, 1));
    }
    await page.close();
  }
  await browser.close();
} finally { server.kill(); }
writeFileSync(out, JSON.stringify(results, null, 1));
const att = results.filter((r) => r.latched);
const thrown = att.filter((r) => r.throw).length;
const gone = att.filter((r) => r.note === 'line already gone before the click').length;
const killers = {};
for (const r of att) if (r.heldFate && r.heldFate !== 'alive') { const k = String(r.heldFate.killer); killers[k] = (killers[k] || 0) + 1; }
const avg = (k) => (att.length ? (att.reduce((a, r) => a + (r[k] || 0), 0) / att.length).toFixed(2) : 0);
console.log(`kills per attempt: while held ${avg('killsWhileHeld')} · in the 1.5 s after the click ${avg('killsAfterRelease')}`);
console.log(`modules patched for no-hammer: ${patched}`);
console.log(`mode ${mode}: attempts ${results.length} · latched ${att.length} · throws ${thrown} (${att.length ? Math.round(100 * thrown / att.length) : 0}%) · line gone before click ${gone} · self-slings ${att.filter((r) => r.selfSling).length} · held killed by ${JSON.stringify(killers)}`);
