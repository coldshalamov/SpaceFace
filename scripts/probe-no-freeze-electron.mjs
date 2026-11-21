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
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
const require_ = () => nodeModule;
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
// Real-device conditions (owner, 2026-11-21: "maybe it has something to do with the physical keyboard"):
//   --pad=noisy|quiet   navigator.getGamepads reports a connected pad (drifting axes, or perfectly still)
//   --real-profile      the player's own settings profile and saves, COPIED read-only into this isolated
//                       profile's storage (the real store is never opened for writing)
//   --visible           a normal activated window; default is a never-activated window (showInactive)
const PAD = argv.pad ? String(argv.pad) : null;
const REAL_PROFILE = argv['real-profile'] === true;
const VISIBLE = argv.visible === true;
const OUT = resolve(ROOT, String(argv.out || `.devshots/no-freeze/${ROUTE}${LEGACY ? '-legacy' : ''}`));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { createIsolatedElectronLaunch } = await import('./lib/electronTestIsolation.mjs');
const { loadPlaywright } = await import('./lib/load-playwright.mjs');
const { installCspSafePlaywrightPolling } = await import('./lib/playwrightCspPolling.mjs');
const { installFirstLightPromptHandler } = await import('./player-truth/routes.mjs');
const { _electron: electron } = await loadPlaywright();
const launch = createIsolatedElectronLaunch({ root: ROOT, taskId: `no-freeze-${ROUTE}`, timeout: 180000, baseEnv: {
  ...process.env,
  // Never steal focus from what the owner is watching: shown inactive, never activated, and kept
  // un-throttled so it renders and measures like a foreground window.
  ...(VISIBLE ? {} : { SPACEFACE_EVIDENCE_SHOW_INACTIVE: '1', SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION: '1' }),
} });
function readPlayerProfilePairs() {
  const { createRequire } = require_();
  const req = createRequire(import.meta.url);
  const { resolvePlayerSaveDir } = req('./lib/playerSaveStore.cjs');
  const dir = resolvePlayerSaveDir(process.env);
  const pairs = {};
  for (const file of readdirSync(dir)) {
    if (!file.startsWith('sf.') || !file.endsWith('.json')) continue;
    pairs[file.slice(0, -'.json'.length)] = readFileSync(join(dir, file), 'utf8');
  }
  return { dir, pairs };
}

const report = { route: ROUTE, seconds: SECONDS, forced: FORCED, legacy: LEGACY, pad: PAD, realProfile: REAL_PROFILE, visible: VISIBLE, errors: [], phases: [], rows: [] };
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
  if (REAL_PROFILE) {
    const prof = readPlayerProfilePairs();
    report.realProfileKeys = Object.keys(prof.pairs);
    await page.evaluate((pairs) => { for (const [k, v] of Object.entries(pairs)) localStorage.setItem(k, v); }, prof.pairs);
    console.log('real profile copied (read-only) from', prof.dir, Object.keys(prof.pairs).join(','));
  }
  await page.evaluate((legacy) => {
    try {
      sessionStorage.setItem('sf.cinematicSeen', '1');
      if (legacy) sessionStorage.setItem('sf.laneLegacy', '1'); else sessionStorage.removeItem('sf.laneLegacy');
      localStorage.setItem('sf.simProfile', '1');
    } catch { /* storage gated */ }
  }, LEGACY);
  {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 240000 });
  }
  await page.waitForFunction(() => typeof window.SF.simLaneDiag === 'function', null, { timeout: 240000 })
    .catch(async () => { console.log('no simLaneDiag', await page.evaluate(() => Object.keys(window.SF || {}).join(','))); });
  const cdp0 = await page.context().newCDPSession(page);
  // The window is never activated; tell the page it has focus, as a player's window does.
  await cdp0.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  if (PAD) {
    await page.evaluate((mode) => {
      let t = 0;
      const pad = () => ({
        id: 'Probe HID pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(),
        axes: [0, 1, 2, 3].map(() => (mode === 'noisy' ? (Math.random() - 0.5) * 0.06 : 0)),
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      });
      navigator.getGamepads = () => { t++; return [pad(), null, null, null]; };
      try { window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad() })); } catch (_) {}
      window.__padCalls = () => t;
    }, PAD);
  }
  report.realm = await page.evaluate(() => ({
    coi: globalThis.crossOriginIsolated === true, sab: typeof SharedArrayBuffer === 'function',
    ua: navigator.userAgent.slice(0, 90), w: innerWidth, h: innerHeight,
  }));
  console.log('realm', JSON.stringify(report.realm));

  // ---- reach flight on the ordinary route's own launch seams (Electron forbids query strings) ----
  const launchSwarm = async () => {
    return page.evaluate(async (round) => {
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
  };

  const t0 = Date.now();
  if (ROUTE === 'swarm') {
    await page.waitForFunction(() => {
      const ui = window.SF.registry && window.SF.registry.get && window.SF.registry.get('ui');
      const m = ui && (ui.screenManager || ui.manager);
      return !!(m && typeof m.hasScreen === 'function' && m.hasScreen('crucibleDraft'));
    }, null, { timeout: 120000 }).catch(() => {});
    const launched = await launchSwarm();
    console.log('swarm launch', JSON.stringify(launched));
  } else if (REAL_PROFILE) {
    // The player's own campaign: press Continue on the title like he does.
    const ok = await page.getByRole('button', { name: /^Continue/i }).first().click({ timeout: 60000 }).then(() => true).catch(() => false);
    console.log('continue pressed', ok);
    if (!ok) await page.evaluate(() => window.SF.bus.emit('game:new', { seed: 4242 })).catch(() => {});
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
  await sleep(3000);
  report.lane0 = await page.evaluate(() => {
    const g = window.SF.simLaneDiag();
    return { poseTable: g.poseTable, sabEnvelope: g.sabEnvelopeActive, clockOwner: g.clockOwner };
  }).catch(() => null);
  console.log('lane', JSON.stringify(report.lane0));

  await page.evaluate(() => { window.__SF_LIFE_FORENSICS__ = []; window.__SF_PACK_ARRIVALS__ = []; });
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
        wSeq: pt ? pt.workerReplySequence : null, mSeq: pt ? pt.mainReceivedSequence : null, wUnacked: pt ? pt.workerUnacked : null, wRet: pt ? pt.workerRetained : null, tick: pt ? pt.tick : null,
      });
    }, 50);
  });
  const vp = { w: report.realm.w || 1280, h: report.realm.h || 720 };
  const cdp = cdp0;
  const hand = createHand(cdp, vp);
  hand.start();
  const setPhase = (name) => page.evaluate((n) => { window.__nf.phase = n; window.__SF_POSE_AGE__ && window.__SF_POSE_AGE__.reset(); }, name);
  const readAge = () => page.evaluate(() => (window.__SF_POSE_AGE__ ? window.__SF_POSE_AGE__.read() : null));
  const force = (opts) => page.evaluate((o) => (window.__SF_LANE_FORCE__ ? window.__SF_LANE_FORCE__(o) : null), opts);

  // A busy hand: thrust + turn held (+ strafe), the trigger held, powers tapped, fingers lifted.
  let notFlying = 0;
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
        const again = [...document.querySelectorAll('#screens button')].find((x) => x.offsetParent && !x.disabled
          && /^(Retry|Restart|Run it again|Run again|Play again|New run|Try again)/i.test(n(x.textContent)));
        if (again) { again.click(); return; }
        const b = [...document.querySelectorAll('#screens button')].find((x) => x.offsetParent && !x.disabled
          && /^(Launch round \d+|Launch|Keep current loadout|Continue|Start run|Retry|Restart|Respawn|Undock)/i.test(n(x.textContent)));
        if (b) b.click();
      }).catch(() => {});
      // A Swarm run that ended (death, results screen) is relaunched so every phase flies.
      const flying = await page.evaluate(() => window.SF.state.mode === 'flight').catch(() => true);
      notFlying = flying ? 0 : notFlying + 1;
      if (ROUTE === 'swarm' && notFlying >= 3) {
        notFlying = 0;
        report.relaunches = (report.relaunches || 0) + 1;
        await launchSwarm().catch(() => {});
      }
    }
    hand.releaseAll();
  };

  // Forced stalls first, while the run is young (a long dense phase often ends the run).
  const phases = [];
  if (FORCED) {
    phases.push(['forced: ACKs withheld 4 s', async () => { await force({ withholdAcksMs: 4000 }); await play(6000); }]);
    phases.push(['forced: replies held 3 s', async () => { await force({ holdRepliesMs: 3000 }); await play(6000); }]);
    phases.push(['forced: dense replies 2000 rows', async () => { await force({ padRows: 2000 }); await play(6000); await force({ padRows: 0 }); await play(2000); }]);
  }
  const ensureFlight = async () => {
    for (let i = 0; i < 60; i++) {
      const live = await page.evaluate(() => window.SF.state.mode === 'flight' && window.SF.state.timeScale > 0).catch(() => false);
      if (live) return true;
      await play(1500);
    }
    return false;
  };
  phases.push(['dense input', async () => play(SECONDS * 1000)]);
  for (const [name, run] of phases) {
    await ensureFlight();
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
  report.realmEnd = await page.evaluate(() => ({ hasFocus: document.hasFocus(), visibility: document.visibilityState,
    padCalls: window.__padCalls ? window.__padCalls() : null })).catch(() => null);
  const samples = await page.evaluate(() => { clearInterval(window.__nf.timer); return window.__nf.samples; });
  report.workerProbe = await page.evaluate(async () => { try { const r = await window.SF.laneRpc('probeState'); const q = r && (r.result || r); const g = window.SF.simLaneDiag(); const rr = window.SF.registry.get('render'); const samples = []; for (let i = 0; i < 20; i++) { const r2 = await window.SF.laneRpc('probeState'); const q2 = r2 && (r2.result || r2); samples.push({ worker: q2.committedJournalSequence, main: window.SF.simLaneDiag().journal.writeSequence, presented: rr && rr._presentationPublisher ? rr._presentationPublisher.getLastAppliedSequence() : null }); await new Promise((ok) => setTimeout(ok, 100)); } return { journalRebuildReasons: q.journalRebuildReasons, lag: samples }; } catch (e) { return String(e); } }).catch(() => null);
  console.log('worker journal rebuilds', JSON.stringify(report.workerProbe));
  // Identity forensics for the worst stale bodies: what the worker journaled vs what main applied.
  {
    const worstIds = [...new Set(report.phases.flatMap((ph) => (ph.age && ph.age.episodes) || [])
      .filter((e) => e.worst && e.poseAgeMs > 300).sort((x, y) => y.poseAgeMs - x.poseAgeMs).map((e) => e.worst.id))].slice(0, 4);
    if (worstIds.length) {
      report.lifeForensics = await page.evaluate(async (ids) => {
        const r = await window.SF.laneRpc('probeState', { lifeFor: ids });
        const q = r && (r.result || r);
        const main = (window.__SF_LIFE_FORENSICS__ || []).filter((x) => ids.includes(x[1]));
        const facade = ids.map((id) => { const e = window.SF.state.entities.get(id); return e ? { id, occ: e.occupantGeneration, type: e.type, alive: e.alive } : { id, missing: true }; });
        const w = window.SF.registry.get('render')._presentationWorld; const world = ids.map((id) => { const sl = w.getSlotForEntityId(id); return { id, slot: sl, gen: sl >= 0 ? w.sourceGenerations[sl] : null, occ: sl >= 0 ? w.occupantGenerations[sl] : null }; }); const arrivals = window.__SF_PACK_ARRIVALS__ || []; const arrivalOf = (seq) => { const a = arrivals.find((r) => seq > r[0] && seq <= r[1]); return a || null; }; const mainWithArrival = main.map((x) => [...x, arrivalOf(x[3])]); return { ids, worker: q && q.lifeLog, main: mainWithArrival, facade, world, now: Math.round(performance.now()), lastArrivals: arrivals.slice(-5) };
      }, worstIds).catch((e) => String(e));
      console.log('life forensics', JSON.stringify(report.lifeForensics).slice(0, 4000));
    }
  }
  report.end = await page.evaluate(() => {
    const g = window.SF.simLaneDiag();
    return { clock: g.workerClockLastDiagnostics, poseTable: g.poseTable, profile: g.workerSystemProfile || null,
      slowApplies: g.workerSlowApplies, publisher: (() => { try { const r = window.SF.registry.get('render'); const d = r && r._presentationPublisher && r._presentationPublisher.getDiagnostics(); return d ? JSON.parse(JSON.stringify(d)) : null; } catch (_) { return null; } })(),
      presentationRunner: (() => { try { const l = window.SF.loop && window.SF.loop.diagnostics ? window.SF.loop.diagnostics() : null; return l ? JSON.parse(JSON.stringify(l)) : null; } catch (_) { return null; } })(), replyLag: (g.replyLagEpisodes || []).slice(-8), maxApplyMs: g.workerApplyMaxMs };
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
      silentHoldMs: ph.age ? ph.age.worstSilentHoldMs : null,
      ghostMs: ph.age ? ph.age.worstGhostMs : null,
      freezeLog: ph.freezeEpisodes.length,
      maxUnacked: Math.max(0, ...s.map((d) => d.unacked || 0)),
      backpressuredSamples: s.filter((d) => d.bp).length,
      workP95: s.length ? s.at(-1).workP95 : null,
      ents: s.length ? s.at(-1).ents : null,
    });
  }
  writeFileSync(join(OUT, 'samples.json'), JSON.stringify(samples));
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  console.log(`no-freeze probe: ${ROUTE}${LEGACY ? ' LEGACY (fix off)' : ''}${PAD ? ` pad=${PAD}` : ''}${REAL_PROFILE ? ' real-profile' : ''}${VISIBLE ? ' visible' : ' inactive-window'} realmEnd ${JSON.stringify(report.realmEnd)}, load ${report.loadS}s, hand ${JSON.stringify(report.hand)}, page errors ${report.errors.length}`);
  for (const r of report.rows) {
    console.log(`  ${r.phase.padEnd(32)} poseAge ${String(r.poseAgeMaxMs).padStart(5)} ms (player ${r.playerPoseAgeMaxMs}, >100ms frames ${r.poseAgeOver100Frames}, tracked ${r.tracked}, worst ${r.worstId})  dataAge ${r.dataAgeMaxMs}  frameGap ${r.frameGapMaxMs}  world x${r.worldSpeed} (worst 10s ${r.worstWindow10s})  freezeLog ${r.freezeLog}  silentHold ${r.silentHoldMs}  ghost ${r.ghostMs}  unacked<=${r.maxUnacked} bp ${r.backpressuredSamples} workP95 ${r.workP95} ents ${r.ents}`);
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
