// Owner bug 2026-11-21: "as soon as you accelerate it bogs down, and when you hold the turn key and
// the accelerate button… the game just locks up completely… a blip of new locations, usually when
// you take your fingers off of the controls". This probe plays a Swarm round in the real game and
// holds keys the way a hand does (including the operating system's key auto-repeat), and measures
// whether the WORLD keeps moving: simulation time against the wall clock, the longest stretch with
// no new simulation time, and what the main-to-worker lane says during it.
//   node scripts/fleet/game-lock.mjs run -- node scripts/probe-held-keys.mjs [--round=2] [--phase-ms=8000] [--out=<dir>] [--query=a=b&c=d]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const ROUND = String(argv.round || '2');
const PHASE_MS = Number(argv['phase-ms'] || 8000);
const OUT = resolve(ROOT, String(argv.out || '.devshots/director/fable/freeze/run'));
const EXTRA = String(argv.query || '');
const ROUTE = String(argv.route || 'swarm');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

const { chromium } = await import('playwright');
const port = await freePort();
const server = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' } });
let browser;
const report = { round: ROUND, phaseMs: PHASE_MS, query: EXTRA, errors: [], phases: [] };
try {
  const q = new URLSearchParams();
  if (ROUTE === 'swarm') q.set('swarmRound', ROUND); else { q.set('sector', 'sector_helios_prime'); q.set('seed', '4242'); }
  for (const [k, v] of new URLSearchParams(EXTRA)) q.set(k, v);
  const url = `http://127.0.0.1:${port}/?${q}`;
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch { /* not up yet */ } await sleep(150); }
  browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { if (report.errors.length < 30) report.errors.push(String(e.message || e).slice(0, 300)); });
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch { /* private mode */ } });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 240000 });
  const t0 = Date.now();
  for (;;) {
    const st = await page.evaluate(() => { const s = window.SF.state; return { flight: s.mode === 'flight' && Number.isFinite(s.render && s.render.firstPlayableFrameAt), mode: s.mode }; }).catch(() => ({}));
    if (st.flight) break;
    await page.evaluate(() => {
      const n = (s) => String(s || '').replace(/\s+/g, ' ').trim();
      const b = [...document.querySelectorAll('#screens button')].find((x) => x.offsetParent && !x.disabled && /^(Launch round \d+|Launch|Keep current loadout|Continue|Start run)/.test(n(x.textContent)));
      if (b) b.click();
    }).catch(() => {});
    if (Date.now() - t0 > 400000) throw new Error(`no flight (mode ${st.mode})`);
    await sleep(1000);
  }
  report.loadS = +((Date.now() - t0) / 1000).toFixed(1);
  await page.bringToFront();
  await page.mouse.move(1100, 380);
  await sleep(4000);

  // 20 Hz sampler living in the page, so a stalled probe process cannot hide a stall in the game.
  await page.evaluate(() => {
    const samples = [];
    const w = { samples, raf: 0, phase: 'boot' };
    window.__held = w;
    const tick = () => { w.raf += 1; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const t0 = performance.now();
    w.timer = setInterval(() => {
      const s = window.SF.state; const p = s.player && s.entities && s.entities.get ? s.entities.get(s.player.entityId) : null;
      let lane = null;
      try {
        const g = window.SF.simLaneDiag ? window.SF.simLaneDiag() : null;
        if (g) {
          const c = g.workerClockLastDiagnostics || {};
          const pw = c.perfWindow || {};
          lane = {
            gap: g.msSinceLastAppliedReply ?? null,
            steps: c.steps ?? null, shed: c.shedSteps ?? null, owed: c.owedTicks ?? null, scale: c.scale ?? null,
            hbHeld: c.heartbeatHeld === true, hbHolds: c.heartbeatHolds ?? null, hbHeldMs: c.heartbeatHeldMs ?? null,
            cmds: c.commands ?? null, pend: c.pendingCommands ?? null, ack: c.awaitingAck === true, unacked: c.unacked ?? null,
            bp: c.backpressured === true, bpMs: c.backpressureMs ?? null,
            stepP50: pw.stepMsP50 ?? null, stepP95: pw.stepMsP95 ?? null, workP95: pw.workMsP95 ?? null,
            maxApply: g.maxApplyMs ?? null,
          };
          const lw = g.lastReplyWork || null;
          if (lw) lane.work = { ms: lw.workMs, steps: lw.stepsMs, n: lw.stepsExecuted, req: lw.stepsRequested, pack: lw.packMs, stall: lw.stallMs, ev: lw.events };
        }
      } catch (_) { lane = { err: true }; }
      samples.push({
        t: Math.round(performance.now() - t0), ph: w.phase, raf: w.raf, mode: s.mode, over: !!document.querySelector('#screens .run-over, #screens [data-screen="crucibleResults"], #screens [data-screen="gameOver"]'),
        hull: p && p.hull != null ? Math.round(p.hull) : (s.player && s.player.hull != null ? Math.round(s.player.hull) : null),
        sim: +(s.simTime || 0).toFixed(3), tick: s.tick ?? s.simTick ?? null,
        x: p && p.pos ? +p.pos.x.toFixed(1) : null, z: p && p.pos ? +p.pos.z.toFixed(1) : null,
        sp: p && p.vel ? +Math.hypot(p.vel.x, p.vel.z).toFixed(1) : null,
        ents: s.entities && s.entities.size != null ? s.entities.size : null, lane,
      });
    }, 50);
  });

  const setPhase = (name) => page.evaluate((n) => { window.__held.phase = n; }, name);
  // The operating system repeats the most recently pressed key about 30 times a second while it is
  // held. Playwright sends that as repeated keydown calls for a key that is already down.
  const holdWithRepeat = async (keys, ms, { fire = false } = {}) => {
    for (const k of keys) await page.keyboard.down(k);
    if (fire) await page.mouse.down();
    const last = keys[keys.length - 1];
    const end = Date.now() + ms;
    while (Date.now() < end) { await page.keyboard.down(last); await sleep(33); }
    if (fire) await page.mouse.up().catch(() => {});
    for (const k of [...keys].reverse()) await page.keyboard.up(k);
  };
  const holdOnce = async (keys, ms) => { for (const k of keys) await page.keyboard.down(k); await sleep(ms); for (const k of [...keys].reverse()) await page.keyboard.up(k); };

  // The default scheme points the nose at the cursor, so circling the cursor around the screen
  // centre while thrust is held flies the ship in a loop instead of into the arena wall.
  const circle = async (keys, ms, { fire = false } = {}) => {
    for (const k of keys) await page.keyboard.down(k);
    if (fire) await page.mouse.down();
    const last = keys[keys.length - 1];
    const start = Date.now(); const end = start + ms;
    while (Date.now() < end) {
      const a = (Date.now() - start) / 1000 * 1.6;
      await page.mouse.move(768 + Math.cos(a) * 330, 432 + Math.sin(a) * 250);
      await page.keyboard.down(last);
      await sleep(33);
    }
    if (fire) await page.mouse.up().catch(() => {});
    for (const k of [...keys].reverse()) await page.keyboard.up(k);
  };
  const circlePlan = [
    ['idle-1', () => sleep(Math.min(PHASE_MS, 6000))],
    ['W held, nose circling', () => circle(['KeyW'], PHASE_MS)],
    ['W + A held, circling', () => circle(['KeyW', 'KeyA'], PHASE_MS)],
    ['W + A + fire, circling', () => circle(['KeyW', 'KeyA'], PHASE_MS, { fire: true })],
    ['idle-2 (fingers off)', () => sleep(Math.min(PHASE_MS, 6000))],
  ];
  const plan = String(argv.plan || 'circle') === 'circle' ? circlePlan : [
    ['idle-1', () => sleep(PHASE_MS)],
    ['W held (one keydown)', () => holdOnce(['KeyW'], PHASE_MS)],
    ['idle-2', () => sleep(Math.min(PHASE_MS, 4000))],
    ['W held with key repeat', () => holdWithRepeat(['KeyW'], PHASE_MS)],
    ['idle-3', () => sleep(Math.min(PHASE_MS, 4000))],
    ['W + A held with key repeat', () => holdWithRepeat(['KeyW', 'KeyA'], PHASE_MS)],
    ['idle-4', () => sleep(Math.min(PHASE_MS, 4000))],
    ['W + A + fire, key repeat', () => holdWithRepeat(['KeyW', 'KeyA'], PHASE_MS, { fire: true })],
    ['idle-5 (fingers off)', () => sleep(PHASE_MS)],
  ];
  for (const [name, run] of plan) {
    await setPhase(name);
    await run();
    await page.screenshot({ path: join(OUT, `${String(report.phases.length).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-')}.png`) }).catch(() => {});
    report.phases.push(name);
  }
  const data = await page.evaluate(() => { clearInterval(window.__held.timer); return window.__held.samples; });
  report.end = await page.evaluate(() => { const g = window.SF.simLaneDiag ? window.SF.simLaneDiag() : null; return g ? { clock: g.workerClockLastDiagnostics, profile: g.workerSystemProfile || null, slowApplies: g.workerSlowApplies || null, slowEvents: g.workerSlowEvents || null } : null; }).catch(() => null);
  report.freezeLog = await page.evaluate(() => { try { return JSON.parse(JSON.stringify(window.__SF_FREEZE_LOG__ || [])); } catch (_) { return null; } }).catch(() => null);

  // Per phase: how fast the world ran, and the longest time it did not move at all.
  const rows = [];
  for (const name of report.phases) {
    const s = data.filter((d) => d.ph === name);
    if (s.length < 3) continue;
    const wall = (s[s.length - 1].t - s[0].t) / 1000;
    const sim = s[s.length - 1].sim - s[0].sim;
    let worst = 0; let cur = 0; let stalls = 0;
    for (let i = 1; i < s.length; i++) {
      if (s[i].sim === s[i - 1].sim) { cur += s[i].t - s[i - 1].t; } else { if (cur >= 250) stalls += 1; worst = Math.max(worst, cur); cur = 0; }
    }
    if (cur >= 250) stalls += 1; worst = Math.max(worst, cur);
    const frames = s[s.length - 1].raf - s[0].raf;
    const L0 = s[0].lane || {}; const L1 = s[s.length - 1].lane || {};
    const maxGap = Math.max(...s.map((d) => (d.lane && d.lane.gap) || 0));
    const maxUnacked = Math.max(...s.map((d) => (d.lane && d.lane.unacked) || 0));
    const bpSamples = s.filter((d) => d.lane && d.lane.bp).length; const hbSamples = s.filter((d) => d.lane && d.lane.hbHeld).length;
    rows.push({ phase: name, wallS: +wall.toFixed(1), worldSpeed: +(sim / wall).toFixed(2), fps: +(frames / wall).toFixed(0),
      longestFreezeMs: Math.round(worst), freezesOver250ms: stalls, maxReplyGapMs: Math.round(maxGap),
      commands: (L1.cmds ?? 0) - (L0.cmds ?? 0), steps: (L1.steps ?? 0) - (L0.steps ?? 0), shed: (L1.shed ?? 0) - (L0.shed ?? 0),
      hbHolds: (L1.hbHolds ?? 0) - (L0.hbHolds ?? 0), hbHeldSamples: hbSamples, backpressuredSamples: bpSamples, maxUnacked,
      stepP95: L1.stepP95, workP95: L1.workP95, speedEnd: s[s.length - 1].sp, ents: s[s.length - 1].ents,
      maxWorkMs: Math.round(Math.max(...s.map((d) => (d.lane && d.lane.work && d.lane.work.ms) || 0))),
      maxSpeed: Math.max(...s.map((d) => d.sp || 0)), hullEnd: s[s.length - 1].hull, modeEnd: s[s.length - 1].mode, overEnd: s[s.length - 1].over });
  }
  report.rows = rows;
  writeFileSync(join(OUT, 'samples.json'), JSON.stringify(data));
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  console.log(`held-keys probe (${ROUTE} round ${ROUND}${EXTRA ? `, ${EXTRA}` : ''}) load ${report.loadS}s, page errors ${report.errors.length}`);
  for (const r of rows) console.log(`${r.phase.padEnd(28)} world x${String(r.worldSpeed).padEnd(5)} fps ${String(r.fps).padEnd(3)} longest freeze ${String(r.longestFreezeMs).padStart(5)} ms  freezes>250ms ${r.freezesOver250ms}  maxReplyGap ${r.maxReplyGapMs}  cmds ${r.commands} steps ${r.steps} shed ${r.shed} hbHolds ${r.hbHolds}/${r.hbHeldSamples} bp ${r.backpressuredSamples} unacked<=${r.maxUnacked} stepP95 ${r.stepP95} workP95 ${r.workP95} speed ${r.speedEnd} ents ${r.ents}`);
  for (const r of rows) console.log(`   ${r.phase.padEnd(26)} maxWork ${r.maxWorkMs} ms  maxSpeed ${r.maxSpeed}  hull ${r.hullEnd}  mode ${r.modeEnd}${r.overEnd ? ' RUN-OVER' : ''}`);
  const fl = report.freezeLog || [];
  console.log(`freeze log: ${fl.length} episode(s)`);
  for (const f of fl.slice(-8)) console.log('  ', JSON.stringify({ ms: Math.round(f.durationMs || 0), gapAtOpen: Math.round(f.gapAtOpenMs || 0), open: f.snapshot, close: f.closingSnapshot }).slice(0, 700));
  const prof = report.end && report.end.profile;
  if (prof) console.log('system profile:', JSON.stringify(prof).slice(0, 1500));
  if (report.errors.length) console.log('errors:', report.errors.slice(0, 5).join(' | '));
} catch (e) {
  console.log('PROBE FAILED', String(e && e.stack || e).slice(0, 600));
  process.exitCode = 1;
} finally {
  try { if (browser) await browser.close(); } catch { /* already gone */ }
  try { server.kill(); } catch { /* already gone */ }
}
