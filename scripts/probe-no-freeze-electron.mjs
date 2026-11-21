// NO-FREEZE probe (owner bug 2026-11-21): the DESKTOP build, driven the way a hand drives it, and
// forced stalls produced on demand. It measures what the player sees, not simulation counters:
//   presented-pose age  — how long since the drawn pose of the player's ship / moving bodies last
//                         changed while unpaused and moving (src/render/poseAgeRecorder.js);
//   data age            — how old the newest simulation sample behind the frame is;
//   frame gap           — the longest presented-frame interval (a main-thread hitch);
//   world speed         — simulation seconds per wall second over every 10 s window;
//   freeze log          — the lane's own recorder (window.__SF_FREEZE_LOG__).
//
// Input is dispatched through the Chrome DevTools protocol directly (Input.dispatchMouseEvent /
// dispatchKeyEvent): the mouse moves continuously at ~125 Hz, held keys auto-repeat at ~30 Hz like
// an operating system, the trigger is held, and powers are pressed.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/probe-no-freeze-electron.mjs \
//     [--route=swarm|adventure] [--seconds=180] [--forced] [--legacy] [--round=3] [--out=<dir>]
//
// --legacy turns the 2026-11-21 fix off in the same build (localStorage sf.laneLegacy=1: the old
// stop-and-wait worker clock, no shared pose table) so before/after can be measured in one minute.
// Writes <out>/report.json and prints one table row per phase. Exit code 0; the gate judges.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const ROUTE = String(argv.route || 'swarm');
const SECONDS = Number(argv.seconds || 180);
const FORCED = argv.forced === true || argv.forced === '1';
const LEGACY = argv.legacy === true || argv.legacy === '1';
const ROUND = Number(argv.round || 3);
const OUT = resolve(ROOT, String(argv.out || `.devshots/no-freeze/${ROUTE}${LEGACY ? '-legacy' : ''}`));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { createIsolatedElectronLaunch } = await import('./lib/electronTestIsolation.mjs');
const { loadPlaywright } = await import('./lib/load-playwright.mjs');
const { installCspSafePlaywrightPolling } = await import('./lib/playwrightCspPolling.mjs');
const { installFirstLightPromptHandler } = await import('./player-truth/routes.mjs');
const { _electron: electron } = await loadPlaywright();
const launch = createIsolatedElectronLaunch({ root: ROOT, taskId: `no-freeze-${ROUTE}`, timeout: 180000, baseEnv: { ...process.env } });

const report = { route: ROUTE, seconds: SECONDS, forced: FORCED, legacy: LEGACY, errors: [], phases: [], rows: [] };
let app = null;

// ---- the hand: CDP input ---------------------------------------------------------------------
const KEYS = {
  KeyW: { key: 'w', vk: 87 }, KeyA: { key: 'a', vk: 65 }, KeyS: { key: 's', vk: 83 }, KeyD: { key: 'd', vk: 68 },
  Digit1: { key: '1', vk: 49 }, Digit2: { key: '2', vk: 50 }, Digit3: { key: '3', vk: 51 },
  Digit4: { key: '4', vk: 52 }, Digit5: { key: '5', vk: 53 }, ShiftLeft: { key: 'Shift', vk: 16 },
  Space: { key: ' ', vk: 32 },
};
function createHand(cdp, viewport) {
  const held = new Set();
  let mouseDown = false;
  let mx = viewport.w / 2; let my = viewport.h / 2;
  let timer = null; let repeatTimer = null; let t0 = Date.now();
  let moves = 0; let repeats = 0;
  const fire = (method, params) => { cdp.send(method, params).catch(() => {}); };
  const keyEvent = (type, code, autoRepeat = false) => {
    const k = KEYS[code];
    fire('Input.dispatchKeyEvent', {
      type, code, key: k.key, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, autoRepeat,
      ...(type === 'keyDown' && k.key.length === 1 ? { text: k.key } : {}),
    });
  };
  return {
    start() {
      t0 = Date.now();
      // ~125 Hz continuous mouse: a loose circle around the screen centre with a little jitter,
      // so the default nose-to-cursor scheme flies loops instead of into a wall.
      timer = setInterval(() => {
        const a = (Date.now() - t0) / 1000 * 1.7;
        mx = viewport.w / 2 + Math.cos(a) * viewport.w * 0.22 + Math.sin(a * 7.3) * 6;
        my = viewport.h / 2 + Math.sin(a) * viewport.h * 0.22 + Math.cos(a * 5.1) * 6;
        fire('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mx, y: my, buttons: mouseDown ? 1 : 0,
          ...(mouseDown ? { button: 'left' } : {}) });
        moves++;
      }, 8);
      // OS key repeat: the most recently pressed held key repeats ~30 times a second.
      repeatTimer = setInterval(() => {
        const last = [...held].at(-1);
        if (last) { keyEvent('keyDown', last, true); repeats++; }
      }, 33);
    },
    stop() { clearInterval(timer); clearInterval(repeatTimer); },
    down(code) { if (!held.has(code)) { held.add(code); keyEvent('keyDown', code); } },
    up(code) { if (held.delete(code)) keyEvent('keyUp', code); },
    releaseAll() { for (const c of [...held]) this.up(c); this.trigger(false); },
    tap(code) { keyEvent('keyDown', code); setTimeout(() => keyEvent('keyUp', code), 60); },
    trigger(on) {
      if (on === mouseDown) return;
      mouseDown = on;
      fire('Input.dispatchMouseEvent', { type: on ? 'mousePressed' : 'mouseReleased', x: mx, y: my, button: 'left', clickCount: 1, buttons: on ? 1 : 0 });
    },
    counts: () => ({ moves, repeats }),
  };
}

try {
  app = await electron.launch(launch.options);
  const page = await app.firstWindow({ timeout: 180000 });
  installCspSafePlaywrightPolling(page);
  await installFirstLightPromptHandler(page, () => {});
  page.on('pageerror', (e) => { if (report.errors.length < 30) report.errors.push(String(e.message || e).slice(0, 300)); });
  await page.waitForLoadState('domcontentloaded', { timeout: 180000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 240000 });
  // A/B switch and first-run state live in this isolated profile's storage; reload to apply.
  await page.evaluate((legacy) => {
    try {
      sessionStorage.setItem('sf.cinematicSeen', '1');
      if (legacy) localStorage.setItem('sf.laneLegacy', '1'); else localStorage.removeItem('sf.laneLegacy');
      localStorage.setItem('sf.simProfile', '1');
    } catch { /* storage gated */ }
  }, LEGACY);
  {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 240000 });
  }
  await page.waitForFunction(() => typeof window.SF.simLaneDiag === 'function', null, { timeout: 240000 })
    .catch(async () => { console.log('no simLaneDiag', await page.evaluate(() => Object.keys(window.SF || {}).join(','))); });
  report.realm = await page.evaluate(() => ({
    coi: globalThis.crossOriginIsolated === true, sab: typeof SharedArrayBuffer === 'function',
    ua: navigator.userAgent.slice(0, 90), w: innerWidth, h: innerHeight,
  }));
  console.log('realm', JSON.stringify(report.realm));

  // ---- reach flight on the ordinary route's own launch seams (Electron forbids query strings) ----
  const t0 = Date.now();
  if (ROUTE === 'swarm') {
    await page.waitForFunction(() => {
      const ui = window.SF.registry && window.SF.registry.get && window.SF.registry.get('ui');
      const m = ui && (ui.screenManager || ui.manager);
      return !!(m && typeof m.hasScreen === 'function' && m.hasScreen('crucibleDraft'));
    }, null, { timeout: 120000 }).catch(() => {});
    const launched = await page.evaluate(async (round) => {
      const { swarmStartAtRound, swarmArcadeSeedFor } = await import('/src/data/swarmLadder.js');
      const L = await import('/src/ui/crucibleLaunch.js');
      const { SWARM_RULESET } = await import('/src/data/swarmMode.js');
      const start = swarmStartAtRound(String(round));
      const arenaId = L.CRUCIBLE_ARENA_ID;
      const setup = L.crucibleSetupFor({ starterId: L.CRUCIBLE_DEFAULT_STARTER_ID,
        seed: swarmArcadeSeedFor(arenaId) || L.freshSeed(), arenaId, ruleset: SWARM_RULESET, startWave: start.startWave });
      if (!setup.ok) return { ok: false, issues: (setup.issues || []).map((i) => i.message) };
      const access = window.SF.state.settings && window.SF.state.settings.accessibility;
      if (access) access.firstLightOffered = true;
      L.requestCrucibleRun(window.SF.bus, setup, SWARM_RULESET);
      return { ok: true, wave: start.startWave };
    }, ROUND).catch((e) => ({ ok: false, error: String(e).slice(0, 200) }));
    console.log('swarm launch', JSON.stringify(launched));
  } else {
    await page.evaluate(() => window.SF.bus.emit('game:new', { seed: 4242 })).catch(() => {});
  }
  for (;;) {
    const st = await page.evaluate(() => {
      const s = window.SF.state;
      return { flight: s.mode === 'flight' && Number.isFinite(s.render && s.render.firstPlayableFrameAt) && s.timeScale > 0, mode: s.mode };
    }).catch(() => ({}));
    if (st.flight) break;
    await page.evaluate(() => {
      const n = (s) => String(s || '').replace(/\s+/g, ' ').trim();
      const b = [...document.querySelectorAll('#screens button')].find((x) => x.offsetParent && !x.disabled
        && /^(Launch round \d+|Launch|Keep current loadout|Continue|Start run|Begin|Undock|Skip)/i.test(n(x.textContent)));
      if (b) b.click();
    }).catch(() => {});
    if (Date.now() - t0 > 300000) {
      await page.screenshot({ path: join(OUT, 'no-flight.png') }).catch(() => {});
      throw new Error(`no flight (mode ${st.mode})`);
    }
    await sleep(1000);
  }
  report.loadS = +((Date.now() - t0) / 1000).toFixed(1);
  await page.bringToFront().catch(() => {});
  await sleep(3000);
  report.lane0 = await page.evaluate(() => {
    const g = window.SF.simLaneDiag();
    return { poseTable: g.poseTable, sabEnvelope: g.sabEnvelopeActive, clockOwner: g.clockOwner };
  }).catch(() => null);
  console.log('lane', JSON.stringify(report.lane0));

  // ---- in-page sampler: 20 Hz, so a stalled probe process cannot hide a stall in the game ----
  await page.evaluate(() => {
    const w = { samples: [], phase: 'boot' };
    window.__nf = w;
    w.timer = setInterval(() => {
      const s = window.SF.state;
      let g = null; try { g = window.SF.simLaneDiag(); } catch (_) {}
      const pt = g && g.poseTable;
      const c = (g && g.workerClockLastDiagnostics) || {};
      const sim = pt && pt.active ? pt.simTime : s.simTime;
      w.samples.push({
        t: performance.now(), ph: w.phase, mode: s.mode, ts: s.timeScale, docked: !!(s.ui && s.ui.docked),
        sim, replySim: s.simTime, ents: s.entities && s.entities.size,
        unacked: c.unacked ?? null, bp: c.backpressured === true, stale: c.staleAckRecoveries ?? null,
        workP95: c.perfWindow ? c.perfWindow.workMsP95 : null, dil: c.dilation ?? null,
        held: g ? g.heldReplies : 0,
      });
    }, 50);
  });
  const vp = { w: report.realm.w || 1280, h: report.realm.h || 720 };
  const cdp = await page.context().newCDPSession(page);
  const hand = createHand(cdp, vp);
  hand.start();
  const setPhase = (name) => page.evaluate((n) => { window.__nf.phase = n; window.__SF_POSE_AGE__ && window.__SF_POSE_AGE__.reset(); }, name);
  const readAge = () => page.evaluate(() => (window.__SF_POSE_AGE__ ? window.__SF_POSE_AGE__.read() : null));
  const force = (opts) => page.evaluate((o) => (window.__SF_LANE_FORCE__ ? window.__SF_LANE_FORCE__(o) : null), opts);

  // A busy hand: thrust + turn held (+ strafe), the trigger held, powers tapped, fingers lifted.
  const play = async (ms) => {
    const end = Date.now() + ms;
    let beat = 0;
    while (Date.now() < end) {
      const phase = beat % 6;
      hand.down('KeyW');
      if (phase === 1 || phase === 2) hand.down('KeyA'); else hand.up('KeyA');
      if (phase === 3) hand.down('KeyD'); else hand.up('KeyD');
      hand.trigger(phase !== 4);
      if (phase === 2) hand.tap(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'][Math.floor(beat / 6) % 5]);
      if (phase === 5) { hand.releaseAll(); } // fingers off the controls
      beat++;
      await sleep(Math.min(1500, Math.max(0, end - Date.now())));
      // Respawn / next round / take a level-up pick if the run paused on a screen.
      await page.evaluate(() => {
        const n = (s) => String(s || '').replace(/\s+/g, ' ').trim();
        const take = [...document.querySelectorAll('#screens button, #screens [role="button"]')]
          .find((x) => x.offsetParent && !x.disabled && /TAKE$/i.test(n(x.textContent)));
        if (take) { take.click(); return; }
        const b = [...document.querySelectorAll('#screens button')].find((x) => x.offsetParent && !x.disabled
          && /^(Launch round \d+|Launch|Keep current loadout|Continue|Start run|Retry|Restart|Respawn|Undock)/i.test(n(x.textContent)));
        if (b) b.click();
      }).catch(() => {});
    }
    hand.releaseAll();
  };

  const phases = [['dense input', async () => play(SECONDS * 1000)]];
  if (FORCED) {
    phases.push(['forced: ACKs withheld 4 s', async () => { await force({ withholdAcksMs: 4000 }); await play(6000); }]);
    phases.push(['forced: replies held 3 s', async () => { await force({ holdRepliesMs: 3000 }); await play(6000); }]);
    phases.push(['forced: dense replies 2000 rows', async () => { await force({ padRows: 2000 }); await play(6000); await force({ padRows: 0 }); await play(2000); }]);
  }
  for (const [name, run] of phases) {
    await setPhase(name);
    const freezeBefore = await page.evaluate(() => (window.__SF_FREEZE_LOG__ || []).length).catch(() => 0);
    await run();
    const age = await readAge();
    const freezeAfter = await page.evaluate(() => JSON.parse(JSON.stringify(window.__SF_FREEZE_LOG__ || []))).catch(() => []);
    await page.screenshot({ path: join(OUT, `${String(report.phases.length).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-')}.png`) }).catch(() => {});
    report.phases.push({ name, age, freezeEpisodes: freezeAfter.slice(freezeBefore) });
  }
  hand.stop();
  report.hand = hand.counts();
  const samples = await page.evaluate(() => { clearInterval(window.__nf.timer); return window.__nf.samples; });
  report.end = await page.evaluate(() => {
    const g = window.SF.simLaneDiag();
    return { clock: g.workerClockLastDiagnostics, poseTable: g.poseTable, profile: g.workerSystemProfile || null,
      slowApplies: g.workerSlowApplies, replyLag: (g.replyLagEpisodes || []).slice(-8), maxApplyMs: g.workerApplyMaxMs };
  }).catch(() => null);

  // ---- per-phase table ----
  for (const ph of report.phases) {
    const s = samples.filter((d) => d.ph === ph.name && d.mode === 'flight' && d.ts > 0 && !d.docked);
    let minWin = null;
    // World speed over every 10 s window (slid by 1 s).
    for (let i = 0; i < s.length; i += 20) {
      const j = s.findIndex((d, k) => k > i && d.t - s[i].t >= 10000);
      if (j < 0) break;
      const v = (s[j].sim - s[i].sim) / ((s[j].t - s[i].t) / 1000);
      if (v >= 0 && (minWin == null || v < minWin)) minWin = v;
    }
    const wall = s.length > 1 ? (s.at(-1).t - s[0].t) / 1000 : 0;
    const speed = wall > 0 ? (s.at(-1).sim - s[0].sim) / wall : null;
    report.rows.push({
      phase: ph.name,
      wallS: +wall.toFixed(1),
      worldSpeed: speed == null ? null : +speed.toFixed(3),
      worstWindow10s: minWin == null ? null : +minWin.toFixed(3),
      poseAgeMaxMs: ph.age ? ph.age.worstPoseAgeMs : null,
      playerPoseAgeMaxMs: ph.age ? ph.age.worstPlayerPoseAgeMs : null,
      dataAgeMaxMs: ph.age ? ph.age.worstDataAgeMs : null,
      frameGapMaxMs: ph.age ? ph.age.worstFrameGapMs : null,
      poseAgeOver100Frames: ph.age ? ph.age.poseAgeOver100Frames : null,
      tracked: ph.age ? ph.age.tracked : null,
      worstId: ph.age ? ph.age.worstId : null,
      freezeLog: ph.freezeEpisodes.length,
      maxUnacked: Math.max(0, ...s.map((d) => d.unacked || 0)),
      backpressuredSamples: s.filter((d) => d.bp).length,
      workP95: s.length ? s.at(-1).workP95 : null,
      ents: s.length ? s.at(-1).ents : null,
    });
  }
  writeFileSync(join(OUT, 'samples.json'), JSON.stringify(samples));
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  console.log(`no-freeze probe: ${ROUTE}${LEGACY ? ' LEGACY (fix off)' : ''}, load ${report.loadS}s, hand ${JSON.stringify(report.hand)}, page errors ${report.errors.length}`);
  for (const r of report.rows) {
    console.log(`  ${r.phase.padEnd(32)} poseAge ${String(r.poseAgeMaxMs).padStart(5)} ms (player ${r.playerPoseAgeMaxMs}, >100ms frames ${r.poseAgeOver100Frames}, tracked ${r.tracked}, worst ${r.worstId})  dataAge ${r.dataAgeMaxMs}  frameGap ${r.frameGapMaxMs}  world x${r.worldSpeed} (worst 10s ${r.worstWindow10s})  freezeLog ${r.freezeLog}  unacked<=${r.maxUnacked} bp ${r.backpressuredSamples} workP95 ${r.workP95} ents ${r.ents}`);
  }
  if (report.errors.length) console.log('page errors:', report.errors.slice(0, 5).join(' | '));
} catch (e) {
  console.log('PROBE FAILED', String((e && e.stack) || e).slice(0, 800));
  report.failed = String((e && e.message) || e);
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  process.exitCode = 2;
} finally {
  try { if (app) await app.close(); } catch { /* already gone */ }
  try { launch.cleanup({ runtimeClosed: true }); } catch { /* profile cleanup best-effort */ }
}
