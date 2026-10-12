// Owner-playtest reproduction for Swarm (Crucible · Ricochet Foundry by default).
//
// Boots the real dev server and page, walks the PUBLIC door with real pointer clicks
// (menu → Crucible → arena card → Choose ship & kit → Open armory → Launch round 1), then
// watches the rendered route: what dies and why in the first seconds with no input, how often
// entity visuals swap or vanish, whether the player hull stays on the glass at its hero body,
// and whether round 2 answers the keyboard. Contact sheet frames land in --out.
//
//   node scripts/probe-crucible-playtest.mjs [--arena=helios_core] [--seed=4242]
//        [--out=.devshots/crucible-playtest] [--idle=20] [--rounds=2] [--headed] [--json=path]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] == null ? true : m[2]] : [a, true];
}));
const ARENA = String(argv.arena || 'helios_core');
const SEED = Number(argv.seed || 4242);
const OUT = path.resolve(ROOT, String(argv.out || '.devshots/crucible-playtest'));
const IDLE_S = Number(argv.idle || 20);
const ROUNDS = Number(argv.rounds || 2);
const HEADED = !!argv.headed;
mkdirSync(OUT, { recursive: true });

const { chromium } = await loadPlaywright();

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) {
    const free = await new Promise((resolve) => {
      const s = createNetServer();
      s.once('error', () => resolve(false));
      s.once('listening', () => s.close(() => resolve(true)));
      s.listen(port, '127.0.0.1');
    });
    if (free) return port;
  }
  throw new Error('no free port');
}

const port = await findFreePort(8520);
const url = `http://127.0.0.1:${port}/`;
const server = spawn(process.execPath, ['server.js', String(port)], {
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' },
  cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true,
});
for (let i = 0; i < 120; i++) {
  try { if ((await fetch(url)).ok) break; } catch (_) {}
  await new Promise((r) => setTimeout(r, 250));
}
const browser = await chromium.launch({
  headless: !HEADED,
  args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: Number(argv.w || 1440), height: Number(argv.h || 900) }, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e).slice(0, 240)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(`[console] ${m.text().slice(0, 240)}`); });

const report = { arena: ARENA, seed: SEED, rounds: [], errors: pageErrors };
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

async function clickText(text, { exact = false, timeout = 60000 } = {}) {
  const loc = page.locator('#screens button:visible').filter({ hasText: text });
  const handle = exact
    ? page.locator('#screens button:visible', { hasText: new RegExp(`^\\s*${text}\\s*$`) })
    : loc;
  await handle.first().waitFor({ state: 'visible', timeout });
  await page.waitForFunction((t) => [...document.querySelectorAll('#screens button')]
    .some((b) => b.offsetParent && !b.disabled && b.textContent.replace(/\s+/g, ' ').includes(t)), text, { timeout });
  await handle.first().click({ timeout });
}

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 90000 });
await page.waitForFunction(() => {
  const el = document.querySelector('[data-screen="mainMenu"]');
  return el && getComputedStyle(el).display !== 'none';
}, null, { timeout: 90000 });
log('menu up');
await clickText('Crucible', { exact: true });
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(OUT, '00-door.png') });
const arenaCard = page.locator(`#screens [data-arena-id="${ARENA}"]`).first();
if (await arenaCard.count()) await arenaCard.click();
await page.waitForTimeout(200);
report.door = await page.evaluate(() => [...document.querySelectorAll('#screens button')]
  .filter((b) => b.offsetParent).map((b) => b.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean));
await clickText('Choose ship & kit');
await page.waitForTimeout(400);
await page.evaluate((seed) => {
  const input = document.querySelector('#screens .sf-crd-seed input');
  if (input) { input.value = String(seed); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }
}, SEED);
await page.screenshot({ path: path.join(OUT, '01-kit.png') });
report.kit = await page.evaluate(() => ({
  text: (document.querySelector('#screens [data-screen="crucible"]') || document.querySelector('#screens')).innerText.slice(0, 4000),
}));
await clickText('Open armory');
await page.waitForFunction(() => window.SF.state.mode === 'flight' && window.SF.state.run
  && window.SF.state.run.phase === 'draft', null, { timeout: 120000 });
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, '02-armory.png') });
report.armory = await page.evaluate(() => (document.querySelector('#screens').innerText || '').slice(0, 5000));
log('armory up');

await page.evaluate(() => {
  const SF = window.SF;
  const st = SF.state;
  const sysChain = SF.registry && SF.registry.get && SF.registry.get('swarmChain');
  const bus = (sysChain && sysChain.bus) || SF.bus;
  const pt = window.__pt = { kills: [], phases: [], cleared: [], frames: 0, swaps: [], vanish: [], playerFrames: [], spawns: [], hits: [], busSame: bus === SF.bus, brood: [], announce: [], toasts: [], awards: [], playerImpacts: [], chain: [] };
  const tick = () => ({ tick: st.tick, simTime: +(st.simTime || 0).toFixed(3) });
  bus.on('entity:killed', (p) => {
    const e = st.entities.get(p.id);
    const killer = p.killerId != null ? st.entities.get(p.killerId) : null;
    pt.kills.push({ ...tick(), wave: st.run && st.run.wave, phase: st.run && st.run.phase, id: p.id, type: p.type,
      victimClass: p.victimClass, cohort: e && e.data && e.data.runCohort, killerId: p.killerId,
      killerType: killer ? killer.type : null, killerIsPlayer: p.killerId === st.playerId,
      cause: p.presentation && p.presentation.cause, surface: p.presentation && p.presentation.surface,
      impact: p.presentation && p.presentation.impact });
  });
  bus.on('swarm:broodKills', (p) => pt.brood.push({ ...tick(), phase: st.run && st.run.phase, count: p.count, cause: p.cause, score: p.score, credits: p.credits }));
  bus.on('swarm:announce', (p) => pt.announce.push({ ...tick(), text: p.text, kind: p.kind }));
  bus.on('toast', (p) => pt.toasts.push({ ...tick(), text: p && p.text }));
  bus.on('swarm:chain', (p) => pt.chain.push({ ...tick(), chain: p.chain, cause: p.cause }));
  bus.on('run:awardRequested', (p) => pt.awards.push({ ...tick(), score: p.score, credits: p.credits, reason: p.reason }));
  bus.on('physics:impact', (p) => { if (p && (p.aId === st.playerId || p.bId === st.playerId)) {
    const other = st.entities.get(p.aId === st.playerId ? p.bId : p.aId);
    pt.playerImpacts.push({ ...tick(), other: other && other.type, otherR: other && other.radius, otherMass: other && other.mass, speed: p.preSolveClosingSpeed, dp: p.dp }); } });
  bus.on('run:transitioned', (p) => pt.phases.push({ ...tick(), phase: p && p.phase, wave: st.run && st.run.wave }));
  bus.on('run:waveCleared', (p) => pt.cleared.push({ ...tick(), ...p }));
  bus.on('entity:spawned', (p) => {
    const e = p && st.entities.get(p.id);
    if (e && e.data && e.data.runCohort === 'survival') {
      const pl = st.entities.get(st.playerId);
      const d = pl ? Math.hypot(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z) : null;
      pt.spawns.push({ ...tick(), id: e.id, def: e.data.enemyId || e.defId, d: d && Math.round(d),
        speed: Math.round(Math.hypot(e.vel ? e.vel.x : 0, e.vel ? e.vel.z : 0)) });
    }
  });
  // Per-frame visual identity census: what object stands for each entity, is it drawn.
  const sig = new Map();
  const visState = new Map();
  const signature = (obj) => {
    if (!obj) return 'none';
    const ud = obj.userData || {};
    const kids = obj.children ? obj.children.map((c) => c.uuid.slice(0, 6) + (c.visible ? '' : '-')).join(',') : '';
    return `${obj.uuid.slice(0, 8)}|${ud.authoredAssetState || ''}|${ud.lod ? ud.lod.level : ''}|${kids}`;
  };
  const visibleChain = (obj) => {
    let o = obj; while (o) { if (!o.visible) return false; o = o.parent; } return !!obj && !!obj.parent;
  };
  const frame = () => {
    pt.frames += 1;
    const meshes = st.render && st.render.meshes;
    const now = performance.now();
    if (meshes) {
      for (const [id, obj] of meshes) {
        const s = signature(obj);
        const prev = sig.get(id);
        if (prev != null && prev !== s) {
          const e = st.entities.get(id);
          pt.swaps.push({ t: now, id, type: e && e.type, isPlayer: id === st.playerId, from: prev, to: s });
        }
        sig.set(id, s);
        const v = visibleChain(obj);
        const pv = visState.get(id);
        if (pv === true && v === false) {
          const e = st.entities.get(id);
          pt.vanish.push({ t: now, id, type: e && e.type, alive: e && e.alive, isPlayer: id === st.playerId });
        }
        visState.set(id, v);
      }
    }
    const pl = st.entities.get(st.playerId);
    const pm = meshes && meshes.get(st.playerId);
    if (pl && pt.playerFrames.length < 20000) {
      let size = null;
      if (pm && SF.THREE) {
        const box = new SF.THREE.Box3().setFromObject(pm);
        const v = new SF.THREE.Vector3(); box.getSize(v); size = [+(v.x.toFixed(1)), +(v.y.toFixed(1)), +(v.z.toFixed(1))];
      }
      pt.playerFrames.push({ t: Math.round(now), simTime: +(st.simTime || 0).toFixed(2), phase: st.run && st.run.phase,
        x: +pl.pos.x.toFixed(1), z: +pl.pos.z.toFixed(1),
        vx: +(pl.vel ? pl.vel.x : 0).toFixed(1), vz: +(pl.vel ? pl.vel.z : 0).toFixed(1),
        ang: +(pl.angle || pl.rot || 0).toFixed(2), angVel: +(pl.angVel || 0).toFixed(2),
        vis: visibleChain(pm), asset: pm && pm.userData ? pm.userData.authoredAssetState : null, size,
        helm: pl.data && pl.data.helmLostUntil != null ? pl.data.helmLostUntil : null });
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
});

async function census(label) {
  return page.evaluate((label) => {
    const st = window.SF.state;
    const pl = st.entities.get(st.playerId);
    const rows = st.entityList.filter((e) => e.alive !== false).map((e) => ({
      id: e.id, type: e.type, def: (e.data && (e.data.enemyId || e.data.propId || e.data.kind)) || e.defId || null,
      cohort: e.data && e.data.runCohort, r: e.radius, mass: e.mass, typeId: e.data && e.data.typeId, tags: e.data ? Object.keys(e.data).filter((k) => /lesson|swarm|debris|wall|reef|record|toy|room|arena|site/i.test(k)).join(',') : '',
      d: pl ? Math.round(Math.hypot(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z)) : null,
      speed: Math.round(Math.hypot(e.vel ? e.vel.x : 0, e.vel ? e.vel.z : 0)),
    }));
    const byType = {};
    for (const r of rows) byType[r.type] = (byType[r.type] || 0) + 1;
    return { label, tick: st.tick, simTime: st.simTime, phase: st.run && st.run.phase, wave: st.run && st.run.wave,
      byType, near: rows.filter((r) => r.d != null && r.d < 400).sort((a, b) => a.d - b.d).slice(0, 40) };
  }, label);
}

for (let round = 1; round <= ROUNDS; round++) {
  const r = { round };
  report.rounds.push(r);
  await page.waitForFunction(() => window.SF.ctx.screenManager.top() === 'crucibleDraft'
    && window.SF.state.run && window.SF.state.run.phase === 'draft', null, { timeout: 120000 });
  await clickText(`Launch round ${round}`, { timeout: 90000 });
  const launchWall = Date.now();
  await page.waitForFunction(() => window.SF.state.run && window.SF.state.run.phase === 'active', null, { timeout: 120000 });
  const activeAt = await page.evaluate(() => ({ simTime: window.SF.state.simTime, tick: window.SF.state.tick, mark: window.__pt.kills.length, swaps: window.__pt.swaps.length, frames: window.__pt.frames, pf: window.__pt.playerFrames.length, vanish: window.__pt.vanish.length }));
  r.activeAt = activeAt;
  r.census0 = await census('active+0');
  log(`round ${round} active at sim ${activeAt.simTime.toFixed(1)}s`);
  const idle = round === 1;
  if (!idle) {
    // Real keyboard: hold thrust, sweep the pointer, fire.
    await page.mouse.move(900, 300);
    await page.keyboard.down('KeyW');
  }
  let shot = 0;
  const deadline = Date.now() + IDLE_S * 1000;
  while (Date.now() < deadline) {
    const status = await page.evaluate(() => ({ phase: window.SF.state.run && window.SF.state.run.phase, simTime: window.SF.state.simTime, alive: window.SF.state.entities.get(window.SF.state.playerId)?.alive }));
    if (shot < 30) {
      await page.screenshot({ path: path.join(OUT, `r${round}-${String(shot).padStart(2, '0')}.png`) });
      shot++;
    }
    if (status.phase !== 'active') { log(`round ${round} left active → ${status.phase} at sim ${status.simTime.toFixed(1)}`); break; }
    if (!idle && shot % 4 === 0) { await page.mouse.down(); await page.waitForTimeout(250); await page.mouse.up(); }
    if (!idle && shot === 6) { await page.keyboard.up('KeyW'); await page.keyboard.down('KeyD'); }
    if (!idle && shot === 10) { await page.keyboard.up('KeyD'); await page.keyboard.down('KeyW'); }
    await page.waitForTimeout(500);
  }
  if (!idle) { await page.keyboard.up('KeyW'); await page.keyboard.up('KeyD'); }
  r.census1 = await census('end');
  r.wallSeconds = (Date.now() - launchWall) / 1000;
  const data = await page.evaluate((a) => {
    const pt = window.__pt;
    return {
      kills: pt.kills.slice(a.mark), brood: pt.brood.slice(0, 200), announce: pt.announce.slice(0, 100), toasts: pt.toasts.slice(0, 100), awards: pt.awards.slice(0, 50), chain: pt.chain.slice(0, 50), playerImpacts: pt.playerImpacts.slice(0, 50), phases: pt.phases.slice(-6), cleared: pt.cleared.slice(-2),
      frames: pt.frames - a.frames, swaps: pt.swaps.slice(a.swaps), vanish: pt.vanish.slice(a.vanish),
      playerFrames: pt.playerFrames.slice(a.pf), spawns: pt.spawns.filter((s) => s.tick >= a.tick).slice(0, 80),
      busSame: pt.busSame, top: window.SF.ctx.screenManager.top(), simTime: window.SF.state.simTime,
    };
  }, activeAt);
  const span = Math.max(0.001, (data.playerFrames.length ? (data.playerFrames.at(-1).t - data.playerFrames[0].t) / 1000 : r.wallSeconds));
  r.kills = data.kills;
  r.killsBeforeInput = idle ? data.kills.filter((k) => k.cohort === 'survival' || k.type === 'ship').length : null;
  r.killCauses = data.kills.reduce((m, k) => { const key = `${k.killerIsPlayer ? 'player' : (k.killerType || 'none')}:${k.cause || '?'}`; m[key] = (m[key] || 0) + 1; return m; }, {});
  r.phases = data.phases; r.cleared = data.cleared;
  r.simSeconds = data.simTime - activeAt.simTime;
  r.frames = data.frames; r.fps = +(data.frames / span).toFixed(1);
  r.swapsTotal = data.swaps.length; r.swapsPerSecond = +(data.swaps.length / span).toFixed(2);
  r.playerSwaps = data.swaps.filter((s) => s.isPlayer).slice(0, 20);
  r.swapByType = data.swaps.reduce((m, s) => { m[s.type] = (m[s.type] || 0) + 1; return m; }, {});
  r.swapSample = data.swaps.slice(0, 12);
  r.vanishTotal = data.vanish.length; r.vanishAlive = data.vanish.filter((v) => v.alive !== false).length;
  r.vanishSample = data.vanish.slice(0, 12);
  const pf = data.playerFrames;
  r.player = {
    framesInvisible: pf.filter((f) => !f.vis).length, frames: pf.length,
    assetStates: [...new Set(pf.map((f) => f.asset))],
    sizes: [...new Set(pf.map((f) => JSON.stringify(f.size)))].slice(0, 8),
    start: pf[0], end: pf.at(-1),
    maxAngVel: Math.max(0, ...pf.map((f) => Math.abs(f.angVel))),
    displacement: pf.length ? Math.round(Math.hypot(pf.at(-1).x - pf[0].x, pf.at(-1).z - pf[0].z)) : 0,
  };
  r.spawns = data.spawns;
  r.top = data.top;
  log(`round ${round}: sim ${r.simSeconds.toFixed(1)}s, kills ${r.kills.length} ${JSON.stringify(r.killCauses)}, swaps/s ${r.swapsPerSecond}, vanish(alive) ${r.vanishAlive}, player invisible ${r.player.framesInvisible}/${r.player.frames}, disp ${r.player.displacement}, fps ${r.fps}`);
  await page.screenshot({ path: path.join(OUT, `r${round}-end.png`) });
  const phase = await page.evaluate(() => window.SF.state.run && window.SF.state.run.phase);
  if (phase === 'ended' || phase === 'victory') break;
  if (round < ROUNDS) {
    // Let the round finish on its own if it has not (idle round 1 may still be active).
    try {
      await page.waitForFunction(() => window.SF.state.run && window.SF.state.run.phase === 'draft', null, { timeout: 5000 });
    } catch {
      log(`round ${round} still ${phase}; stopping`);
      break;
    }
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, `r${round}-result.png`) });
  }
}

writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
if (argv.json) writeFileSync(path.resolve(ROOT, String(argv.json)), JSON.stringify(report, null, 1));
log('report →', path.join(OUT, 'report.json'), `errors ${pageErrors.length}`);
await browser.close();
server.kill();
