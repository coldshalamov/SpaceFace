// THROW-01 staged fixture: one hostile at latch range in clear space per attempt, real mouse/keyboard
// input for every press, one boot, N attempts. Reports two separate numbers:
//   (a) press -> latch rate   (b) click -> throw rate given a live line
// and a cluster phase: a held body swung into 5 staged hostiles, kills while held vs after release.
// The sim runs on the main thread here (?simLane=main) so the page can stage bodies; staging only moves
// entities (teleport + heal); it never synthesises an input or a gameplay event.
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/throw-fixture.mjs <out.json> <round> <attempts> <clusterAttempts> [scale]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const out = process.argv[2] || '.devshots/fleet/looks/throw-fixture/run.json';
const round = Number(process.argv[3] || 2);
const N = Number(process.argv[4] || 40);
const NC = Number(process.argv[5] || 15);
const LANE = process.argv[6] === 'worker' ? 'worker' : 'main';   // worker: no staging (the page cannot reach the sim), aim at the nearest on-screen light hostile
const PORT = 8165;
mkdirSync(dirname(out), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
const rows = []; const cluster = [];
try {
  await sleep(2500);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', () => {});
  await page.goto(`http://127.0.0.1:${PORT}/?${LANE === 'main' ? 'simLane=main&' : ''}swarmRound=${round}`, { timeout: 120000 });
  const t0 = Date.now(); let live = 0;
  while (Date.now() - t0 < 420_000) {
    const ok = page.locator('.sf-confirm__ok');
    if (await ok.first().isVisible().catch(() => false)) await ok.first().click().catch(() => {});
    const launch = page.getByText(/Launch round/i).first();
    if (await launch.isVisible().catch(() => false)) await launch.click({ force: true, timeout: 5000 }).catch(() => {});
    live = await page.evaluate(() => { const s = window.SF && window.SF.state; if (!s || s.mode !== 'flight') return 0;
      return (s.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship' && !e.isPlayer && e.team !== 0).length; }).catch(() => 0);
    if (live >= (LANE === 'worker' ? 3 : 5)) break;
    await sleep(1500);
  }
  if (live < (LANE === 'worker' ? 3 : 5)) throw new Error('fight never went live');
  await page.evaluate(() => {
    const log = (window.__log = []); const bus = window.SF.bus;
    for (const ev of ['tether:latched', 'massline:throw', 'massline:selfSling', 'tether:cut', 'tether:broke', 'entity:killed', 'tether:latchDenied'])
      bus.on(ev, (p) => log.push({ ev, t: +window.SF.state.simTime.toFixed(2), tgt: p && p.targetId, id: p && (p.id ?? p.payloadId), br: p && (p.reason || p.breakReason), killer: p && p.killer }));
    // Staging only: teleport + heal. No projection helper is needed: the pointer's own aimWorld says
    // where a screen point is in the world, so the hostile is placed exactly under the pointer.
    window.__aimWorld = () => { const s = window.SF.state; const a = s.input && s.input.aimWorld; const me = s.entities.get(s.playerId);
      return a && me ? { x: a.x, z: a.z, mx: me.pos.x, mz: me.pos.z } : null; };
    // Pin the staged hostile in place (position + zero velocity every frame) until the press has resolved, so it
    // cannot drift out from under the pointer; released as soon as the line is up.
    window.__pin = null;
    const pinLoop = () => { const pn = window.__pin; if (pn) { const e = window.SF.state.entities.get(pn.id); if (e) { const aw = window.SF.state.input && window.SF.state.input.aimWorld; e.pos.x = aw ? aw.x : pn.x; e.pos.z = aw ? aw.z : pn.z; e.vel.x = 0; e.vel.z = 0; } } requestAnimationFrame(pinLoop); };
    requestAnimationFrame(pinLoop);
    window.__stage = (at, clusterAt, clusterCount) => {
      const s = window.SF.state, me = s.entities.get(s.playerId);
      const hs = (s.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship' && !e.isPlayer && e.team !== 0 && e.team !== 2 && !(e.data && e.data.ai && e.data.ai.passive));
      const light = hs.filter((e) => !(Number.isFinite(e.mass) && e.mass > 32));
      if (!light.length) return null;
      const target = light[0];
      const others = hs.filter((e) => e !== target);
      others.forEach((e, i) => { const a = i * 0.9; e.pos.x = me.pos.x + Math.cos(a) * 3800; e.pos.z = me.pos.z + Math.sin(a) * 3800; e.vel.x = 0; e.vel.z = 0; });
      target.pos.x = at.x; target.pos.z = at.z; target.vel.x = 0; target.vel.z = 0;
      if (Number.isFinite(target.hullMax)) target.hull = target.hullMax;
      if (Number.isFinite(target.shieldMax)) target.shield = target.shieldMax;
      const cl = [];
      if (clusterCount && clusterAt) others.slice(0, clusterCount).forEach((e, i) => { e.pos.x = clusterAt.x + (i - 2) * 38; e.pos.z = clusterAt.z + (i % 2) * 40; e.vel.x = 0; e.vel.z = 0; cl.push(e.id); });
      if (Number.isFinite(me.hull) && Number.isFinite(me.hullMax)) me.hull = me.hullMax;
      window.__pin = { id: target.id, x: at.x, z: at.z };
      return { id: target.id, cluster: cl };
    };
    window.__nearest = () => { const s = window.SF.state, h = window.SF.helpers, me = s.entities.get(s.playerId), c = [];
      for (const e of s.entityList || []) { if (!e || e.alive === false || e.type !== 'ship' || e.isPlayer || e.team === 0) continue; if (Number.isFinite(e.mass) && e.mass > 32) continue;
        const scr = h.worldToScreen ? h.worldToScreen({ x: e.pos.x, y: 0, z: e.pos.z }, {}) : null; if (!scr || !scr.onScreen || scr.x < 330 || scr.x > 950 || scr.y < 160 || scr.y > 580) continue;
        c.push({ id: e.id, d: Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z), scr: { x: scr.x, y: scr.y } }); }
      c.sort((x, y) => x.d - y.d); return c[0] || null; };
  });
  await page.mouse.click(640, 360);
  const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const logLen = () => page.evaluate(() => window.__log.length);
  const since = (m) => page.evaluate((k) => window.__log.slice(k), m);
  const press = async (ms = 120) => { await page.mouse.down({ button: 'right' }); await sleep(ms); await page.mouse.up({ button: 'right' }); };
  const release = async () => {            // make sure no line is held before the next attempt
    for (let i = 0; i < 3; i++) {
      if (!(await page.evaluate(() => !!window.SF.state.player.tether.active))) return;
      await sleep(700); await press(100); await sleep(500);
    }
  };
  for (let phase = 0; phase < 2; phase++) {
    const count = phase === 0 ? N : (LANE === 'worker' ? 0 : NC);
    for (let a = 0; a < count; a++) {
      await release();
      let st = null;
      if (LANE === 'worker') { const n = await page.evaluate(() => window.__nearest()); st = n ? { id: n.id, scr: n.scr, clusterScr: null } : null; }
      else {
        // Latch spot: a screen point ~170 wu from the player (read through the pointer's aimWorld); cluster spot on the far side.
        const P = [{ x: 800, y: 360 }, { x: 480, y: 360 }, { x: 640, y: 230 }, { x: 640, y: 490 }][a % 4];
        const Q = [{ x: 480, y: 360 }, { x: 800, y: 360 }, { x: 640, y: 490 }, { x: 640, y: 230 }][a % 4];
        await page.mouse.move(Q.x, Q.y, { steps: 2 }); await sleep(250);
        const qw = await page.evaluate(() => window.__aimWorld());
        await page.mouse.move(P.x, P.y, { steps: 2 }); await sleep(250);
        const pw = await page.evaluate(() => window.__aimWorld());
        const ok = await page.evaluate(([at, clusterAt, cc]) => window.__stage(at, clusterAt, cc), [pw, qw, phase === 1 ? 5 : 0]);
        st = ok && pw ? { id: ok.id, scr: P, clusterScr: phase === 1 ? Q : null, dist: Math.round(Math.hypot(pw.x - pw.mx, pw.z - pw.mz)) } : null;
      }
      if (!st) { (phase ? cluster : rows).push({ attempt: a, note: 'nothing to stage' }); await sleep(1500); continue; }
      await sleep(150);
      const mark = await logLen();
      const rec = { phase, attempt: a, held: st.id };
      await page.mouse.move(st.scr.x, st.scr.y, { steps: 3 });
      rec.pre = await page.evaluate(([x, y]) => { const pv = document.querySelector('#sf-ml2 .ml2-preview'); const q = document.elementFromPoint(x, y);
        const t = window.SF.state.player.tether; return { tag: pv ? (pv.textContent || '').slice(0, 30) : null, tagShown: pv ? getComputedStyle(pv).display !== 'none' : null, el: q ? `${q.tagName}.${String(q.className).slice(0, 30)}` : null, tetherActive: !!t.active }; }, [st.scr.x, st.scr.y]);
      await press(120);
      let L = null;
      for (let i = 0; i < 8 && !L; i++) { await sleep(150); L = (await since(mark)).find((e) => e.ev === 'tether:latched') || null; }
      await page.evaluate(() => { window.__pin = null; });
      rec.latched = !!L;
      rec.latchedBody = L ? L.tgt : null;
      rec.denials = (await since(mark)).filter((e) => e.ev === 'tether:latchDenied').map((e) => e.br);
      if (!L) { (phase ? cluster : rows).push(rec); continue; }
      // swing ~1 s under real thrust, then a real click aimed inside the playfield
      await page.keyboard.down('KeyW'); await page.keyboard.down('KeyD');
      await sleep(1000); await page.keyboard.up('KeyD');
      const live = await page.evaluate(() => !!window.SF.state.player.tether.active);
      rec.lineLive = live;
      rec.atClick = await page.evaluate(() => { const st = window.SF.state, t = st.player.tether, e = t && st.entities.get(t.targetId); return { tether: t && { active: t.active, target: t.targetId, att: t.attachmentId, phase: t.phase }, tgt: e && { type: e.type, team: e.team, mass: e.mass, ai: e.data && e.data.ai && { arch: e.data.ai.archetype, role: e.data.ai.role, passive: e.data.ai.passive, ctx: e.data.ai.spawnContext, lawful: e.data.ai.lawful }, enc: !!(e.data && e.data.encounter), chunk: !!(e.data && e.data.isChunk) } }; });
      const aim = phase === 1 && st.clusterScr ? st.clusterScr : { x: 640, y: 300 };
      await page.mouse.move(cl(aim.x, 330, 950), cl(aim.y, 160, 580), { steps: 2 });
      rec.clickT = await page.evaluate(() => +window.SF.state.simTime.toFixed(2));
      await press(120);
      await page.keyboard.up('KeyW');
      await sleep(1500);
      const ev = await since(mark);
      rec.throw = ev.some((e) => e.ev === 'massline:throw');
      rec.selfSling = ev.some((e) => e.ev === 'massline:selfSling');
      const br = ev.find((e) => e.ev === 'tether:broke' && e.tgt === L.tgt);
      rec.end = br ? br.br : (rec.throw ? 'thrown' : null);
      if (phase === 1) {
        rec.killsHeld = ev.filter((e) => e.ev === 'entity:killed' && e.id !== L.tgt && e.t >= L.t && e.t < rec.clickT).length;
        rec.killsAfter = ev.filter((e) => e.ev === 'entity:killed' && e.id !== L.tgt && e.t >= rec.clickT).length;
      }
      (phase ? cluster : rows).push(rec);
      writeFileSync(out, JSON.stringify({ rows, cluster }, null, 1));
    }
  }
  await browser.close();
} finally { server.kill(); }
writeFileSync(out, JSON.stringify({ rows, cluster }, null, 1));
const att = rows.filter((r) => r.held != null);
const latched = att.filter((r) => r.latched);
const rightBody = latched.filter((r) => r.latchedBody === r.held);
const live = rightBody.filter((r) => r.lineLive);
const thrown = live.filter((r) => r.throw);
console.log(`(a) press->latch: ${latched.length}/${att.length} (of which the staged hostile itself: ${rightBody.length}) (${att.length ? Math.round(100 * latched.length / att.length) : 0}%)`);
console.log(`(b) click->throw given a live line: ${thrown.length}/${live.length} (${live.length ? Math.round(100 * thrown.length / live.length) : 0}%) · line gone before click ${latched.length - live.length} · self-slings ${latched.filter((r) => r.selfSling).length}`);
const miss = att.filter((r) => !r.latched);
console.log(`failed presses: ${miss.length}; with tag "RMB · LATCH"/shown and no denial: ${miss.filter((r) => !r.denials.length && r.pre && r.pre.tagShown).length}; elements under pointer: ${JSON.stringify([...new Set(miss.map((r) => r.pre && r.pre.el))])}; tags: ${JSON.stringify([...new Set(miss.map((r) => r.pre && r.pre.tag))])}; denials: ${JSON.stringify([...new Set(miss.flatMap((r) => r.denials))])}`);
const cl2 = cluster.filter((r) => r.latched && r.lineLive);
const avg = (k) => (cl2.length ? (cl2.reduce((s, r) => s + (r[k] || 0), 0) / cl2.length).toFixed(2) : 'n/a');
console.log(`cluster (5 hostiles): samples ${cl2.length} · kills while held ${avg('killsHeld')} · kills in the 1.5 s after release ${avg('killsAfter')} · thrown ${cl2.filter((r) => r.throw).length}`);
