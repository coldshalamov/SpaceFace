// PQ-210.08 demo-path witness: the fifteen-minute demo, played end to end in demo mode.
//
//   node scripts/probe-demo-path.mjs            (headed)
//   node scripts/probe-demo-path.mjs --headless
//
// Route: title -> Crucible door -> Quick play -> rounds until the player REALLY dies or clears
// round 5 (never the run-end API) -> results -> "Take it to the belt" -> adventure (dock, one
// job, undock, one physical problem en route, paid at the delivery dock, fit one upgrade at a
// shipyard, fly out) -> demo end card.
//
// Every step records: reached, wall time, frames over 100 ms, host CPU%, and one PNG under
// .devshots/demo-path/ for manual law-of-the-glass review. Host saturation makes frame numbers
// informational, not acceptance-grade. Saves are isolated (no player store mounted).
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = path.join(ROOT, '.devshots', 'demo-path');
const HEADLESS = process.argv.includes('--headless');
const { chromium } = await loadPlaywright();

function cpuSnapshot() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    for (const value of Object.values(cpu.times)) total += value;
    idle += cpu.times.idle;
  }
  return { idle, total };
}
function hostBusyPct(a, b) {
  const total = b.total - a.total;
  return total > 0 ? 100 * (1 - (b.idle - a.idle) / total) : 0;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`game server did not answer at ${url}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

fs.mkdirSync(OUT_DIR, { recursive: true });
const steps = [];

let page = null;

// Frame recorder lives in the page from the first init script; step() counts dt>100 ms inside
// each step's index window (performance.now deltas, paired wall clock for display only).
async function frameWindowCount(startIdx, endIdx) {
  return page.evaluate(([a, b]) => {
    const stamps = (window.__SF_DEMO_FRAMES__ && window.__SF_DEMO_FRAMES__.stamps) || [];
    let over = 0;
    for (let i = a; i < Math.min(b, stamps.length); i++) if (stamps[i].dt > 100) over++;
    return over;
  }, [startIdx, endIdx]);
}
async function frameCount() {
  return page.evaluate(() => ((window.__SF_DEMO_FRAMES__ && window.__SF_DEMO_FRAMES__.stamps) || []).length);
}

async function step(id, note, fn) {
  const rec = { id, note, reached: false, startedAt: Date.now() };
  const cpu0 = cpuSnapshot();
  const f0 = await frameCount().catch(() => 0);
  try {
    rec.detail = await fn();
    rec.reached = true;
  } catch (error) {
    rec.error = String((error && error.message) || error).slice(0, 500);
  }
  rec.seconds = +(((Date.now()) - rec.startedAt) / 1000).toFixed(1);
  rec.cpuPct = +hostBusyPct(cpu0, cpuSnapshot()).toFixed(0);
  const f1 = await frameCount().catch(() => f0);
  rec.framesOver100 = await frameWindowCount(f0, f1).catch(() => null);
  rec.frames = f1 - f0;
  try {
    rec.shot = path.join(OUT_DIR, `${String(steps.length).padStart(2, '0')}-${id}.png`);
    await page.screenshot({ path: rec.shot });
  } catch { rec.shot = null; }
  steps.push(rec);
  console.log(`[step] ${rec.reached ? 'OK  ' : 'FAIL'} ${id} ${rec.seconds}s cpu=${rec.cpuPct}% frames>100ms=${rec.framesOver100}/${rec.frames}${rec.error ? ' err=' + rec.error : ''}`);
  return rec;
}

async function waitScreen(id, timeoutMs = 60_000) {
  await page.waitForFunction((want) => document.body.dataset.kScreen === want
    || !!document.querySelector(`.screen[data-screen="${want}"]:not([hidden])`), id, { timeout: timeoutMs });
}

// Click a rendered word whose text matches `pattern` — the same actuation a player makes.
async function clickWord(pattern, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = await page.evaluate((rx) => {
      const re = new RegExp(rx, 'i');
      const words = [...document.querySelectorAll('.k-word, button, [role="button"]')]
        .filter((w) => w.offsetParent !== null && re.test(w.textContent || ''));
      const w = words[0];
      if (!w) return false;
      w.click();
      return (w.textContent || '').trim();
    }, pattern.source);
    if (hit) return hit;
    await sleep(250);
  }
  throw new Error(`no visible word matching ${pattern}`);
}

const port = await freePort();
const server = spawn(process.execPath, ['server.js', String(port)], {
  cwd: ROOT,
  stdio: 'ignore',
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' },
});
let browser = null;
const consoleErrors = [];
let shaderErrors = 0;
const t0 = Date.now();
try {
  const baseUrl = `http://127.0.0.1:${port}/?demo=1`;
  await waitForServer(`http://127.0.0.1:${port}/`);
  browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--window-size=1600,900',
    ],
  });
  page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (error) => consoleErrors.push(`[pageerror] ${String(error).slice(0, 300)}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // The isolated store has no save drawer mounted: that 404 is by design (scripts/lib/browser-issues.mjs).
    if (text.includes('404') && /__spaceface_player_store/.test(msg.location()?.url || text)) return;
    // A failed program link draws nothing: on 2026-09-24 one dropped GLSL declaration made every
    // hull and rock invisible for a whole adventure leg and the walk still "reached" each step.
    if (/Shader Error|Program Info Log|undeclared identifier|VALIDATE_STATUS false/i.test(text)) shaderErrors += 1;
    consoleErrors.push(`[console] ${text.slice(0, 300)}`);
  });
  await page.addInitScript(() => {
    window.__SF_DEMO_FRAMES__ = { stamps: [], lastT: null };
    const tick = (t) => {
      const f = window.__SF_DEMO_FRAMES__;
      f.stamps.push({ wall: Date.now(), dt: f.lastT == null ? 16.7 : t - f.lastT });
      f.lastT = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    try {
      sessionStorage.setItem('sf.cinematicSeen', '1');
      window.__SPACEFACE_PERF_COUNTERS__ = true;
      if (!localStorage.getItem('sf.settings.profile.v1')) {
        localStorage.setItem('sf.settings.profile.v1', JSON.stringify({
          version: 1,
          settings: { accessibility: { motionPreference: 'system' }, video: { motionReduce: true } },
        }));
      }
    } catch (_) { /* storage unavailable */ }
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 300_000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 150_000 });

  // Aim writer: the same input channel probe-smooth-flight used (aimX/aimZ + targetId are not
  // overwritten by the DOM adapter between ticks). Fire + movement go through real mouse/keys.
  await page.evaluate(() => {
    const P = window.__SF_DEMO_PILOT__ = { aim: true, log: [] };
    const say = (msg) => { P.log.push(msg); if (P.log.length > 300) P.log.shift(); };
    P.say = say;
    setInterval(() => {
      try {
        const st = window.SF && window.SF.state;
        if (!st || !P.aim) return;
        const p = st.entities && st.entities.get(st.playerId);
        if (!p || p.alive === false) return;
        let best = null; let bd = Infinity;
        for (const e of st.entities.values()) {
          if (!e || e.alive === false || e.id === p.id) continue;
          const hostile = (e.data && e.data.ai && e.data.ai.hostile === true)
            || (e.ai && e.ai.hostileToPlayer)
            || (e.team != null && e.team !== p.team && e.team !== 2 && e.team !== 0);
          if (!hostile) continue;
          const ep = e.pos || e; const pp = p.pos || p;
          const d = Math.hypot(ep.x - pp.x, ep.z - pp.z);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) {
          const st2 = st;
          if (st2.player) st2.player.targetId = best.id;
          const bp = best.pos || best;
          st2.input.aimX = bp.x; st2.input.aimZ = bp.z;
        }
      } catch (e) { /* transient */ }
    }, 120);
  });

  // ---------------------------------------------------------------- step 1: title
  await step('title', 'demo title screen; Crucible is the first verb', async () => {
    await page.waitForSelector('[data-action="crucible"]', { timeout: 60_000 });
    return page.evaluate(() => {
      const verbs = [...document.querySelectorAll('[data-action]')]
        .filter((w) => w.offsetParent !== null).map((w) => w.dataset.action);
      const crucible = document.querySelector('[data-action="crucible"]');
      if (!crucible) throw new Error('no Crucible verb on title');
      return { verbs, crucibleFirst: verbs[0] === 'crucible' };
    });
  });

  // ---------------------------------------------------------------- step 2: crucible door + launch
  await step('crucible-launch', 'title Crucible verb -> door -> Quick play', async () => {
    await page.click('[data-action="crucible"]');
    await waitScreen('crucible', 30_000);
    const seed = await clickWord(/Quick play/i, 20_000);
    return { clicked: seed };
  });

  // ---------------------------------------------------------------- step 3: first control
  const flightStep = await step('crucible-flight', 'launch -> first playable frame', async () => {
    await page.waitForFunction(() => {
      const st = window.SF.state;
      const p = st.entities && st.entities.get(st.playerId);
      return st.mode === 'flight' && !!p && p.alive !== false;
    }, null, { timeout: 240_000 });
    await page.waitForFunction(() => Number.isFinite(window.SF.state.render
      && window.SF.state.render.firstPlayableFrameAt), null, { timeout: 180_000 });
    return page.evaluate(() => ({
      simTime: +window.SF.state.simTime.toFixed(1),
      firstPlayableFrameAt: window.SF.state.render && window.SF.state.render.firstPlayableFrameAt,
      wave: window.SF.state.run && window.SF.state.run.wave,
    }));
  });
  const launchToControlS = flightStep.seconds;

  // ---------------------------------------------------------------- step 4: rounds until real death / round 5
  await step('crucible-rounds', 'weave+shoot until real death or round-5 clear', async () => {
    await page.mouse.move(800, 300);
    await page.mouse.down();
    let firing = true;
    await page.keyboard.down('w');
    let wHeld = true;
    let braking = false;
    const envNum = (name, fallback) => {
      const v = Number(process.env[name]);
      return Number.isFinite(v) ? v : fallback;
    };
    const deadline = Date.now() + envNum('SPACEFACE_DEMO_ROUND_MS', 20 * 60_000);
    // The honest-death contract: weave-and-shoot is play for a sim-time window (starved hosts
    // run the sim slower than wall time, so the phase is measured in sim seconds, not wall).
    const WEAVE_SIM_S = envNum('SPACEFACE_DEMO_WEAVE_SIM_S', 90);
    const DIE_SIM_S = envNum('SPACEFACE_DEMO_DIE_SIM_S', 300);
    let simStart = null;
    let dieStartSim = null;
    let weaveDir = 'a';
    let weaveHeld = false;
    let lastWeave = 0;
    let lastAimFail = null;
    let aimLoggedOnce = false;
    let dieTargetId = null;
    let yawHeld = false;
    let outcome = null;
    const waves = [];
    const snapTrace = [];
    while (Date.now() < deadline) {
      const now = Date.now();
      const snap = await page.evaluate(() => {
        const st = window.SF.state;
        const p = st.entities.get(st.playerId);
        let hostiles = 0, hostilesAlive = 0, nearestD = null;
        if (p) {
          for (const e of st.entities.values()) {
            if (!e || e.alive === false || e.id === p.id) continue;
            if (e.type && e.type !== 'ship' && e.type !== 'drone') continue;
            const hostile = (e.data && e.data.ai && e.data.ai.hostile === true)
              || (e.ai && e.ai.hostileToPlayer)
              || (e.team != null && e.team !== p.team && e.team !== 2 && e.team !== 0);
            if (!hostile) continue;
            hostilesAlive++;
            const ep = e.pos || e; const pp = p.pos || p;
            const d = Math.hypot(ep.x - pp.x, ep.z - pp.z);
            if (nearestD == null || d < nearestD) nearestD = d;
            if (d < 400) hostiles++;
          }
        }
        return {
          mode: st.mode, wave: st.run && st.run.wave, phase: st.run && st.run.phase,
          alive: p && p.alive !== false, hull: p && p.hull, shield: p && p.shield,
          speed: p ? +Math.hypot((p.vel || {}).x || 0, (p.vel || {}).z || 0).toFixed(1) : null,
          firing: st.input && st.input.fire, hostiles400: hostiles,
          hostilesAlive, nearestD: nearestD == null ? null : +nearestD.toFixed(0),
          simTime: +st.simTime.toFixed(1),
          screen: document.body.dataset.kScreen || null,
        };
      });
      if (simStart == null && snap.simTime != null && snap.mode === 'flight') simStart = snap.simTime;
      const weaving = dieStartSim == null && snap.mode === 'flight'
        && (simStart == null || snap.simTime - simStart < WEAVE_SIM_S)
        && now < deadline - 2 * 60_000;
      if (weaving) {
        if (now - lastWeave > 1600) {
          if (weaveHeld) await page.keyboard.up(weaveDir);
          weaveDir = weaveDir === 'a' ? 'd' : 'a';
          await page.keyboard.down(weaveDir);
          weaveHeld = true;
          lastWeave = now;
        }
      } else if (snap.mode === 'flight' && (weaveHeld || firing || !wHeld)) {
        // Die mode: release the trigger FIRST — a pilot that keeps shooting wins the attrition
        // war. Then orbit under full thrust inside the swarm: the nose follows the real mouse,
        // so a rotating cursor holds the ship turning in place — gunless, rammed and shot for
        // real. (Braking to rest stalemates: wave-1 shield regen can match ~12 wasps' DPS.)
        if (firing) { await page.mouse.up(); firing = false; }
        if (weaveHeld) { await page.keyboard.up('a'); await page.keyboard.up('d'); weaveHeld = false; }
        if (!wHeld) { await page.keyboard.down('w'); wHeld = true; }
        if (dieStartSim == null && snap.simTime != null) dieStartSim = snap.simTime;
      }
      if (dieStartSim != null && snap.mode === 'flight') {
        // Converge on the swarm. The default controlScheme is PILOT — the mouse aims guns,
        // it does NOT steer the nose; A/D yaw while coasting. So this is a bang-bang yaw
        // loop on real keys: pick a sticky hostile, read bearing-vs-nose error, hold the
        // yaw key toward it until inside ~0.35 rad, then W thrusts at it. Once any hostile
        // ship is inside 250 WU the brake settles into the pack — the verified killable
        // state (stationary target dies in ~10 sim-s). Prior die modes assumed cursor-steer
        // and flew ballistic away from the arena while the pack chased ~100 wu/s behind.
        const aim = await page.evaluate((preferId) => {
          const st = window.SF.state;
          const p = st.entities.get(st.playerId);
          if (!p || !p.pos) return { fail: 'no-player' };
          let best = null, bestD = Infinity, preferred = null, preferredD = null;
          for (const e of st.entities.values()) {
            if (!e || e.alive === false || e.id === p.id) continue;
            if (e.type && e.type !== 'ship' && e.type !== 'drone') continue;
            const hostile = (e.data && e.data.ai && e.data.ai.hostile === true)
              || (e.ai && e.ai.hostileToPlayer)
              || (e.team != null && e.team !== p.team && e.team !== 2 && e.team !== 0);
            if (!hostile || !e.pos) continue;
            const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
            if (e.id === preferId) { preferred = e; preferredD = d; }
            if (d < bestD) { bestD = d; best = e; }
          }
          const pick = preferred || best;
          const pickD = preferred ? preferredD : bestD;
          if (!pick) return { fail: 'no-hostile' };
          const bearing = Math.atan2(pick.pos.z - p.pos.z, pick.pos.x - p.pos.x);
          let err = bearing - (p.rot || 0);
          while (err > Math.PI) err -= Math.PI * 2;
          while (err < -Math.PI) err += Math.PI * 2;
          return { err, d: pickD, id: pick.id };
        }, dieTargetId).catch((e) => ({ fail: 'eval:' + String(e && e.message || e).slice(0, 80) }));
        if (aim && aim.fail && aim.fail !== lastAimFail) {
          lastAimFail = aim.fail;
          console.log(`  [rounds] die-mode aim failed: ${aim.fail} (sim=${snap.simTime})`);
        }
        if (aim && !aim.fail) {
          dieTargetId = aim.id;
          if (!aimLoggedOnce) {
            aimLoggedOnce = true;
            console.log(`  [rounds] die-mode converging on hostile ${aim.id} at d=${Math.round(aim.d)} (sim=${snap.simTime})`);
          }
          const nearestShip = snap.nearestD != null ? snap.nearestD : aim.d;
          const yawKey = aim.err > 0 ? 'd' : 'a';
          const offKey = aim.err > 0 ? 'a' : 'd';
          if (nearestShip < 250 && (snap.speed || 0) > 8) {
            // Inside the pack: brake into a stand-still so the swarm can finish.
            if (wHeld) { await page.keyboard.up('w'); wHeld = false; }
            if (yawHeld) { await page.keyboard.up('a'); await page.keyboard.up('d'); yawHeld = false; }
            await page.keyboard.down('s');
            await new Promise(r => setTimeout(r, 120));
            await page.keyboard.up('s');
          } else if (Math.abs(aim.err) > 0.35) {
            // Coast-yaw the nose onto the target (PILOT: A/D yaw while not thrusting).
            if (wHeld) { await page.keyboard.up('w'); wHeld = false; }
            await page.keyboard.up(offKey);
            if (!yawHeld) { await page.keyboard.down(yawKey); yawHeld = true; }
          } else {
            // Lined up: burn at it.
            if (yawHeld) { await page.keyboard.up('a'); await page.keyboard.up('d'); yawHeld = false; }
            if (!wHeld) { await page.keyboard.down('w'); wHeld = true; }
          }
        }
      }
      if (dieStartSim != null && snap.simTime - dieStartSim > DIE_SIM_S) {
        fs.writeFileSync(path.join(OUT_DIR, 'rounds-trace.json'), JSON.stringify(snapTrace.filter((_, i) => i % 5 === 0), null, 1));
        throw new Error(`rammed the swarm gunless for ${DIE_SIM_S} sim-s and lived — swarm could not finish; trace -> rounds-trace.json`);
      }
      snapTrace.push({ wall: Date.now() - t0, ...snap });
      if (snapTrace.length % 45 === 1) {
        console.log(`  [rounds] mode=${snap.mode} phase=${snap.phase} w${snap.wave} hull=${snap.hull} shield=${snap.shield} hostiles400=${snap.hostiles400} alive=${snap.hostilesAlive} nearestD=${snap.nearestD} speed=${snap.speed} firing=${snap.firing} sim=${snap.simTime}s`);
      }
      if (!waves.length || waves[waves.length - 1] !== snap.wave) waves.push(snap.wave);
      if (snap.screen === 'crucibleResults' || snap.phase === 'results') {
        outcome = { kind: snap.alive ? 'round5-or-ended' : 'death', ...snap };
        break;
      }
      if (snap.alive === false) outcome = { kind: 'death', ...snap };
      await sleep(400);
    }
    await page.keyboard.up('w'); await page.keyboard.up('a'); await page.keyboard.up('d');
    if (braking) await page.keyboard.up('s');
    if (firing) await page.mouse.up();
    if (!outcome) {
      fs.writeFileSync(path.join(OUT_DIR, 'rounds-trace.json'), JSON.stringify(snapTrace.filter((_, i) => i % 5 === 0), null, 1));
      throw new Error(`no death/results inside the cap; waves seen: ${waves.join(',')}; trace -> rounds-trace.json`);
    }
    // Results plate may mount a beat after the kill; wait for it.
    await waitScreen('crucibleResults', 60_000).catch(() => {});
    fs.writeFileSync(path.join(OUT_DIR, 'rounds-trace.json'), JSON.stringify(snapTrace.filter((_, i) => i % 5 === 0), null, 1));
    return { ...outcome, waves };
  });

  // ---------------------------------------------------------------- step 5: results plate
  await step('results', 'replay + trick names + Again + belt', async () => {
    await waitScreen('crucibleResults', 30_000);
    return page.evaluate(() => {
      const text = document.body.innerText || '';
      const words = [...document.querySelectorAll('.k-word')].map((w) => (w.textContent || '').trim());
      const st = window.SF.state;
      const result = st.ui && st.ui.crucibleResults;
      return {
        screen: document.body.dataset.kScreen,
        hasAgain: /run it again|again/i.test(text),
        hasBelt: /take it to the belt/i.test(text),
        hasSeed: /seed/i.test(text),
        hasReplay: /replay|played back/i.test(text) || words.some((w) => /replay/i.test(w)),
        bestLine: (st.stunts && st.stunts.combo && st.stunts.combo.bestLine) || (result && result.bestLine) || null,
        trickWords: words.filter((w) => w.length > 3 && w.length < 60).slice(0, 40),
        wavesCleared: result && result.wavesCleared, kills: result && result.kills, seed: result && result.seed,
      };
    });
  });

  // ---------------------------------------------------------------- step 6: take it to the belt
  await step('to-belt', '"Take it to the belt" -> adventure new game', async () => {
    await clickWord(/take it to the belt/i, 15_000);
    await page.waitForFunction(() => {
      const st = window.SF.state;
      const p = st.entities && st.entities.get(st.playerId);
      return st.mode === 'flight' && !!p && p.alive !== false
        && (!st.run || st.run.kind !== 'survival' || st.run.phase === 'inactive');
    }, null, { timeout: 240_000 });
    await page.waitForFunction(() => Number.isFinite(window.SF.state.render
      && window.SF.state.render.firstPlayableFrameAt), null, { timeout: 180_000 });
    return page.evaluate(() => ({ credits: window.SF.state.player.credits, simTime: +window.SF.state.simTime.toFixed(1) }));
  });

  // ------------------------------------------- in-page adventure helpers (real seams only)
  await page.evaluate(() => {
    const H = window.__SF_DEMO_HELPERS__ = {
      st: () => window.SF.state,
      player: () => window.SF.state.entities.get(window.SF.state.playerId),
      station: (id) => {
        for (const e of window.SF.state.entities.values()) {
          if (e.id === id || e.stationId === id || (e.data && e.data.stationId === id)) return e;
        }
        return null;
      },
      distTo: (id) => {
        const p = H.player(); const s = H.station(id);
        if (!p || !s) return Infinity;
        const pp = p.pos || p; const sp = s.pos || s;
        return Math.hypot(sp.x - pp.x, sp.z - pp.z);
      },
      dockRange: (id) => {
        const s = H.station(id);
        const dr = s && (s.dockRadius || (s.data && s.data.dockRadius));
        return dr || (s && s.r ? s.r * 0.9 : 120);
      },
      // Nearest station entity inside its own dock radius — the emergency shelter check.
      stationInRange: () => {
        const p = H.player(); if (!p) return null;
        for (const e of window.SF.state.entities.values()) {
          if (!e || e.type !== 'station') continue;
          const dr = e.dockRadius || (e.data && e.data.dockRadius) || (e.r || 90) * 0.9;
          const ep = e.pos || e; const pp = p.pos || p;
          const d = Math.hypot(ep.x - pp.x, ep.z - pp.z);
          if (d <= dr) return e.stationId || (e.data && e.data.stationId) || e.id;
        }
        return null;
      },
      autopilot: (id) => {
        const st = window.SF.state;
        const s = H.station(id);
        st.nav.autopilot = s
          ? { active: true, targetEntityId: s.id, target: null, label: 'demo', arrivalRadius: Math.max(30, H.dockRange(id) * 0.8), status: 'cruise' }
          : { active: false, target: null, targetEntityId: null, label: '', arrivalRadius: 36, status: 'idle' };
        return !!s;
      },
      dock: (id) => {
        const st = window.SF.state;
        window.SF.bus.emit('dock:attempt', { stationId: id });
        window.SF.bus.emit('dock:docked', { stationId: id });
        if (st.ui) { st.ui.docked = true; st.ui.dockedStationId = id; }
      },
      undock: (id) => {
        const st = window.SF.state;
        if (st.ui) { st.ui.docked = false; st.ui.dockedStationId = null; }
        window.SF.bus.emit('dock:undocked', { stationId: id });
      },
      docked: () => !!(window.SF.state.ui && window.SF.state.ui.docked),
      maxHull: () => { const p = H.player(); return p && (p.maxHull || p.ship && p.ship.hull || 140); },
      hostilesNear: (range) => {
        const p = H.player(); if (!p) return [];
        const out = [];
        for (const e of window.SF.state.entities.values()) {
          if (!e || e.alive === false || e.id === p.id) continue;
          const hostile = (e.data && e.data.ai && e.data.ai.hostile === true)
            || (e.ai && e.ai.hostileToPlayer)
            || (e.team != null && e.team !== p.team && e.team !== 2 && e.team !== 0);
          if (!hostile) continue;
          const ep = e.pos || e; const pp = p.pos || p;
          const d = Math.hypot(ep.x - pp.x, ep.z - pp.z);
          if (d <= range) out.push({ id: e.id, shipId: e.shipId, d: +d.toFixed(0) });
        }
        return out;
      },
      salvageNear: (range) => {
        const p = H.player(); if (!p) return [];
        const out = [];
        for (const e of window.SF.state.entities.values()) {
          if (!e || e.alive === false) continue;
          if (e.type !== 'pickup' && e.type !== 'wreck' && !(e.data && e.data.salvage)) continue;
          const ep = e.pos || e; const pp = p.pos || p;
          const d = Math.hypot(ep.x - pp.x, ep.z - pp.z);
          if (d <= range) out.push({ id: e.id, d: +d.toFixed(0) });
        }
        return out;
      },
      rockNear: (range) => {
        const p = H.player(); if (!p) return null;
        let best = null; let bd = range;
        for (const e of window.SF.state.entities.values()) {
          if (!e || e.alive === false) continue;
          if (e.type !== 'asteroid' && e.type !== 'rock') continue;
          const ep = e.pos || e; const pp = p.pos || p;
          const d = Math.hypot(ep.x - pp.x, ep.z - pp.z);
          if (d < bd) { bd = d; best = e; }
        }
        const bp = best && (best.pos || best);
        return best ? { id: best.id, x: bp.x, z: bp.z, d: +bd.toFixed(0) } : null;
      },
      credits: () => window.SF.state.player.credits,
    };
  });

  // Travel helper: autopilot to a station. RMB (mine beam, fireGroup 2) suppresses primary fire in
  // input.js, so the two buttons are mutually exclusive: hostiles near -> LMB fight; else RMB mine.
  async function travelTo(stationId, { timeoutMs = 6 * 60_000, solveProblem = true } = {}) {
    const inRun = await page.evaluate(() => {
      const r = window.SF.state.run;
      return !!(r && r.kind === 'survival' && r.phase !== 'inactive');
    });
    if (inRun) throw new Error('survival run still active — the belt leg never started');
    const exists = await page.evaluate((id) => !!window.__SF_DEMO_HELPERS__.station(id), stationId);
    if (!exists) throw new Error(`no ${stationId} entity in this world`);
    await page.evaluate((id) => window.__SF_DEMO_HELPERS__.autopilot(id), stationId);
    const problem = { mined: 0, fought: 0, salvaged: 0 };
    const deadline = Date.now() + timeoutMs;
    let left = false; let right = false;
    const setButtons = async (wantLeft, wantRight) => {
      if (wantLeft !== left) { left = wantLeft; await page.mouse[wantLeft ? 'down' : 'up'](); }
      if (wantRight !== right) { right = wantRight; await page.mouse[wantRight ? 'down' : 'up']({ button: 'right' }); }
    };
    try {
      let shelterUntil = 0;
      while (Date.now() < deadline) {
        const snap = await page.evaluate((id) => {
          const H = window.__SF_DEMO_HELPERS__;
          const p = H.player();
          return {
            d: +H.distTo(id).toFixed(0), range: H.dockRange(id),
            alive: p && p.alive !== false, hull: p && p.hull, maxHull: H.maxHull(),
            hostiles: H.hostilesNear(450), hostilesWide: H.hostilesNear(900),
            docked: H.docked(), shelter: H.stationInRange(),
            cargoTotal: p && p.cargo ? Object.values(p.cargo).reduce((a, b) => a + b, 0) : 0,
          };
        }, stationId);
        if (!snap.alive) throw new Error('player died during transit');
        if (snap.d <= snap.range && !snap.docked) break;
        // Emergency shelter: critically low hull under fire inside a dock ring -> dock, wait out
        // the threat behind the patrol, then resume the leg. The A6 slice's honest survival.
        if (snap.docked) {
          if (snap.hostilesWide.length === 0 || Date.now() > shelterUntil) {
            await page.evaluate((sid, id) => {
              window.__SF_DEMO_HELPERS__.undock(sid);
              window.__SF_DEMO_HELPERS__.autopilot(id);
            }, snap.shelter || 'station_helios', stationId);
          }
          await sleep(800);
          continue;
        }
        if (snap.shelter && snap.hostiles.length && snap.hull < 0.35 * snap.maxHull) {
          await page.evaluate((sid) => window.__SF_DEMO_HELPERS__.dock(sid), snap.shelter);
          shelterUntil = Date.now() + 60_000;
          problem.sheltered = (problem.sheltered || 0) + 1;
          continue;
        }
        const hostile = solveProblem && snap.hostiles.length > 0;
        await setButtons(hostile, solveProblem && !hostile);
        if (hostile) {
          problem.fought++;
        } else if (solveProblem) {
          const acted = await page.evaluate(() => {
            const H = window.__SF_DEMO_HELPERS__;
            const st = H.st();
            const salv = H.salvageNear(220);
            const rock = H.rockNear(200);
            if (rock) { st.input.aimX = rock.x; st.input.aimZ = rock.z; return 'mine'; }
            if (salv.length) return 'salvage';
            return null;
          });
          if (acted === 'mine') problem.mined++;
          else if (acted === 'salvage') problem.salvaged++;
        }
        await sleep(500);
      }
    } finally {
      await setButtons(false, false);
    }
    const arrived = await page.evaluate((id) => window.__SF_DEMO_HELPERS__.distTo(id) <= window.__SF_DEMO_HELPERS__.dockRange(id) + 5, stationId);
    if (!arrived) throw new Error(`never reached ${stationId}`);
    return problem;
  }

  async function dockAt(stationId) {
    await page.evaluate((id) => window.__SF_DEMO_HELPERS__.dock(id), stationId);
    await sleep(600);
  }
  async function undockFrom(stationId) {
    await page.evaluate((id) => window.__SF_DEMO_HELPERS__.undock(id), stationId);
    await sleep(600);
  }

  // ---------------------------------------------------------------- step 7: dock Helios, one job, undock
  const jobInfo = await step('adv-job', 'dock Helios -> accept one job -> undock', async () => {
    await travelTo('station_helios', { solveProblem: false });
    await dockAt('station_helios');
    const job = await page.evaluate(() => {
      const missions = window.SF.registry.get('missions');
      const board = missions.ensureBoard('station_helios');
      const offers = (board && board.slots ? board.slots : []).filter(Boolean);
      const first = offers.find((o) => o.source === 'firstTradeContract') || offers[0];
      if (!first) return null;
      window.SF.bus.emit('ui:acceptMission', { missionId: first.id });
      return { id: first.id, source: first.source, name: first.name || first.title, dest: first.destStationId || first.targetStationId || (first.delivery && first.delivery.stationId) };
    });
    if (!job) throw new Error('Helios board had no offers');
    // Payment listeners attach NOW: an emergency dock at the destination during the transit leg
    // can settle the delivery before the adv-paid step's own dock. __SF_DEMO_PAID__ accumulates.
    await page.evaluate(() => {
      window.__SF_DEMO_PAID__ = null;
      const seen = [];
      const mark = (v) => { seen.push(v); window.__SF_DEMO_PAID__ = seen; };
      window.SF.bus.on('economy:grantCredits', (p) => mark({ grant: p }));
      window.SF.bus.on('mission:completed', (p) => mark({ mission: p && p.missionId }));
      window.SF.bus.on('mission:settled', (p) => mark({ settled: p }));
    });
    await undockFrom('station_helios');
    return job;
  });

  // The delivery destination drives the rest of the leg.
  const destId = (jobInfo.detail && (jobInfo.detail.dest || 'station_ceres')) || 'station_ceres';

  // ---------------------------------------------------------------- step 8: transit + physical problem
  const problemStep = await step('adv-problem', `transit to ${destId}; mine/fight/salvage en route`, async () => {
    const problem = await travelTo(destId, { solveProblem: true });
    return problem;
  });

  // ---------------------------------------------------------------- step 9: dock destination, get paid
  await step('adv-paid', `dock ${destId}; delivery settles`, async () => {
    const alreadyDocked = await page.evaluate(() => window.__SF_DEMO_HELPERS__.docked());
    if (!alreadyDocked) await dockAt(destId);
    // The settle may already have landed during an emergency dock inside the transit leg.
    await page.waitForFunction(() => window.__SF_DEMO_PAID__ != null, null, { timeout: 30_000 });
    return page.evaluate(() => ({ paid: window.__SF_DEMO_PAID__, credits: window.SF.state.player.credits }));
  });

  // ---------------------------------------------------------------- step 10: fit one upgrade at a shipyard, fly out
  await step('adv-upgrade', 'return to Helios -> buy+fit -> undock -> fly out', async () => {
    await undockFrom(destId);
    await travelTo('station_helios', { solveProblem: false });
    await dockAt('station_helios');
    const fit = await page.evaluate(() => {
      const st = window.SF.state;
      const shipIndex = st.player.activeShipIndex | 0;
      const ship = st.player.ownedShips[shipIndex];
      const credits = st.player.credits;
      // Cheapest affordable def that fills an empty slot; prefer the Swing Drive first-haul toy.
      return window.SF.bus && (async () => {
        const { MODULES } = await import('/src/data/modules.js');
        const { SHIPS } = await import('/src/data/ships.js');
        const { buildSlotList, fits } = await import('/src/systems/ships.js');
        const slots = buildSlotList(SHIPS.find((def) => def.id === ship.defId));
        const fittings = ship.fittings || [];
        const candidates = Object.values(MODULES)
          .map((def) => ({ def, offer: (def.shopOffers && def.shopOffers.station_helios) || { price: def.price } }))
          .filter((c) => c.def && c.def.id && Number.isFinite(c.offer.price) && c.offer.price <= credits)
          // A free stock part is a swap, not an upgrade: paid parts first, stock only as a fallback.
          .sort((a, b) => (a.def.id === 'mod_swing_drive_s' ? -1 : 0) - (b.def.id === 'mod_swing_drive_s' ? -1 : 0)
            || (a.offer.price > 0 ? 0 : 1) - (b.offer.price > 0 ? 0 : 1)
            || a.offer.price - b.offer.price);
        // A starter hull arrives fully fitted, so a real first upgrade is a swap: fitModule returns
        // the displaced part to the hold. Prefer an empty slot; never "upgrade" to the same part.
        const fittedId = (i) => {
          const f = fittings[i];
          return f && typeof f === 'object' ? f.defId : f || null;
        };
        const pickSlot = (def) => {
          const empty = slots.findIndex((slot, i) => !fittedId(i) && fits(slot, def));
          if (empty >= 0) return empty;
          return slots.findIndex((slot, i) => fittedId(i) !== def.id && fits(slot, def));
        };
        for (const c of candidates) {
          const idx = pickSlot(c.def);
          if (idx >= 0) {
            const before = credits;
            window.SF.bus.emit('ui:buyModule', { defId: c.def.id, fitSlotIndex: idx, shipIndex });
            // A refused buy (research lock, fit blocker) charges nothing — try the next part.
            if (c.offer.price > 0 && window.SF.state.player.credits >= before) continue;
            return { defId: c.def.id, price: c.offer.price, slot: idx, creditsBefore: before, creditsAfter: window.SF.state.player.credits };
          }
        }
        return null;
      })();
    });
    if (!fit) throw new Error('no affordable module fit an empty slot');
    await undockFrom('station_helios');
    // Fly out: real thrust for a few seconds so the undock reads as a departure.
    await page.keyboard.down('w');
    await sleep(4000);
    await page.keyboard.up('w');
    return fit;
  });

  // ---------------------------------------------------------------- step 11: demo end card
  await step('end-card', 'demoEnd card after undock with fitted module', async () => {
    await waitScreen('demoEnd', 30_000);
    return page.evaluate(() => ({
      screen: document.body.dataset.kScreen,
      module: window.SF.state.ui && window.SF.state.ui.demoEnd,
    }));
  });
} catch (error) {
  console.log(`[fatal] ${String(error && error.stack || error).slice(0, 800)}`);
} finally {
  const report = {
    generatedAt: new Date().toISOString(),
    wallMinutes: +(((Date.now()) - t0) / 60000).toFixed(1),
    steps: steps.map((s) => ({
      id: s.id, reached: s.reached, seconds: s.seconds, cpuPct: s.cpuPct,
      framesOver100: s.framesOver100, frames: s.frames, note: s.note,
      detail: s.detail, error: s.error, shot: s.shot && path.basename(s.shot),
    })),
    shaderErrors,
    clean: shaderErrors === 0 && steps.length > 0 && steps.every((s) => s.reached),
    consoleErrors: consoleErrors.slice(0, 40),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  if (shaderErrors > 0) console.log(`\nFAIL: ${shaderErrors} shader compile/link error(s) — bodies with those programs drew nothing`);
  console.log(`\n${report.clean ? 'CLEAN PASS' : 'NOT CLEAN'} — report: ${path.join(OUT_DIR, 'report.json')}`);
  process.exitCode = report.clean ? 0 : 1;
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
