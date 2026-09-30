// DIAG (worktree-only): reproduce the post-save/load dock stall from the release soak and
// discriminate its mechanism. The soak's cycle is undock -> ~0.5s flight -> F5 -> ~0.7s
// divergence -> F9 -> arm Helios waypoint -> autopilot back to the berth. Intermittently the
// restored ship ends up reporting nonzero entity.vel while entity.pos never integrates.
// Two candidate mechanisms produce that signature:
//   A) the Rapier body is pinned (contact/joint) while _applyPlayerStructuralGive restores
//      thrust-predicted linvel each tick — entity bound, body frozen;
//   B) the body record never adopted the restored entity — stale rec.entity, entity orphaned.
// Reading state.physicsRuntime.sg02Snapshot (per-record body kinematics) against the entity
// fields separates them: a bound+wedged body shows snapshot pose == entity pose with frozen
// translation; a stale binding shows the snapshot flying elsewhere.
import { writeFile, mkdir } from 'node:fs/promises';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { flightReadyInPage } from './lib/alphaLiveBaselineRoute.mjs';

const CYCLES = Math.max(1, Number(process.env.DIAG_CYCLES || 60));
const OBSERVE_MS = Math.max(10_000, Number(process.env.DIAG_OBSERVE_MS || 75_000));

const server = await acquireVisualProbeServer({ root: process.cwd() });
if (!server.ownsServer) throw new Error('expected an owned in-process server');
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const dist = (a, b) => Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.z ?? 0) - (b?.z ?? 0));

async function undock() {
  await page.keyboard.press('KeyE');
  const left = await page.waitForFunction(() => window.SF?.state?.ui?.docked === false, null, { timeout: 1_500 }).then(() => true).catch(() => false);
  if (left) return;
  const departureLaunch = page.locator('button[data-pop-launch]').and(page.getByRole('button', { name: /\blaunch\b/i }));
  if (await departureLaunch.isVisible().catch(() => false)) {
    await departureLaunch.click();
  } else {
    const candidates = [
      page.locator('button.sf-confirm__ok').and(page.getByRole('button', { name: /\bundock\b/i })),
      page.locator('button[data-act="undock"]').and(page.getByRole('button', { name: /\bundock\b/i })),
      page.locator('button.st-undock').and(page.getByRole('button', { name: /\bundock\b/i })),
    ];
    for (const c of candidates) {
      if (await c.isVisible().catch(() => false)) { await c.click(); break; }
    }
    const left2 = await page.waitForFunction(() => window.SF?.state?.ui?.docked === false, null, { timeout: 1_500 }).then(() => true).catch(() => false);
    if (!left2 && await departureLaunch.isVisible().catch(() => false)) await departureLaunch.click();
  }
  await page.waitForFunction(() => window.SF?.state?.ui?.docked === false, null, { timeout: 20_000 });
}

async function armHeliosWaypoint() {
  const screen = page.locator('#sf-galaxymap');
  if (!(await screen.isVisible().catch(() => false))) {
    await page.keyboard.press('KeyN');
    await screen.waitFor({ state: 'visible', timeout: 20_000 });
  }
  await page.keyboard.press('/');
  await page.waitForFunction(() => document.activeElement?.matches('.gm-search-input') === true, null, { timeout: 5_000 });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Helios Station');
    const typed = await page.evaluate(() => document.activeElement?.value ?? null);
    if (typed === 'Helios Station') break;
  }
  const row = page.locator('.gm-search-item', {
    has: page.locator('.gm-search-item-name', { hasText: 'Helios Station' }),
    has: page.locator('.gm-search-item-detail', { hasText: 'STATION' }),
  }).first();
  await row.waitFor({ state: 'visible', timeout: 10_000 });
  await row.click({ timeout: 10_000 });
  const button = page.getByRole('button', { name: 'Set Waypoint', exact: true });
  await button.waitFor({ state: 'visible', timeout: 10_000 });
  await button.click();
  await page.waitForFunction(() => {
    const el = document.querySelector('#sf-galaxymap');
    const hidden = !el || el.hidden || getComputedStyle(el).display === 'none' || el.getBoundingClientRect().width < 2;
    return (window.SF?.state?.mode === 'flight' && hidden) || window.SF?.state?.ui?.docked === true;
  }, null, { timeout: 10_000 });
}

const sample = () => page.evaluate(() => {
  const state = window.SF?.state;
  const p = state?.entities?.get?.(state.playerId);
  const snaps = state?.physicsRuntime?.sg02Snapshot || [];
  const snap = snaps.find((r) => r && r.id === state?.playerId) || null;
  const dc = state?.dockingCorridor || null;
  const diag = state?.physicsRuntime?.diagnostics || null;
  const stations = (state?.entityList || []).filter((e) => e?.type === 'station').map((e) => ({
    id: e.id, stationId: e?.data?.stationId || null, alive: e?.alive !== false,
    pos: e?.pos ? { x: Math.round(e.pos.x), z: Math.round(e.pos.z) } : null,
    proxy: e?.data?.collisionProxy || null,
    dist: p?.pos && e?.pos ? Math.round(Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z)) : null,
  }));
  const near = p?.pos ? (state?.entityList || [])
    .filter((e) => e && e.id !== state.playerId && e.alive !== false && e.pos
      && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) <= 60)
    .map((e) => ({ id: e.id, type: e.type, r: e.radius, d: Math.round(Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z)) }))
    .slice(0, 16) : [];
  const listPlayer = (state?.entityList || []).find((e) => e?.id === state?.playerId) || null;
  return {
    t: Date.now(),
    pos: p?.pos ? { x: p.pos.x, z: p.pos.z } : null,
    vel: p?.vel ? { x: p.vel.x, z: p.vel.z } : null,
    flags: p?.flags ? { ...p.flags } : null,
    listPlayerSame: !!(p && listPlayer && p === listPlayer),
    listPlayerPos: listPlayer?.pos ? { x: listPlayer.pos.x, z: listPlayer.pos.z } : null,
    snap: snap ? { x: snap.x, z: snap.z, vx: snap.vx, vz: snap.vz, yaw: snap.yaw, wy: snap.wy } : null,
    snapCount: snaps.length,
    corridor: dc ? { phase: dc.phase, stationId: dc.stationId ?? null, distToBerth: dc.distToBerth, speed: dc.speed, inCorridor: dc.inCorridor, inCapture: dc.inCapture, headingOk: dc.headingOk, berthed: dc.berthed, berth: dc.berth } : null,
    docked: state?.ui?.docked === true,
    mode: state?.mode || null,
    ap: state?.nav?.autopilot ? { active: state.nav.autopilot.active, status: state.nav.autopilot.status } : null,
    stations,
    near,
    frameOrigin: state?.world?.frameOrigin ? { x: Math.round(state.world.frameOrigin.x), z: Math.round(state.world.frameOrigin.z), seq: state.world.frameOriginSeq } : null,
    camFocus: state?.camera?.focus ? { x: Math.round(state.camera.focus.x), z: Math.round(state.camera.focus.z) } : null,
    sectorId: state?.world?.currentSectorId || null,
    diag: diag ? {
      bodies: diag.bodies, dynamicBodies: diag.sg02DynamicBodies, attachments: diag.sg02Attachments,
      stepDisplacementRejects: diag.stepDisplacementRejects, velocitySanityClamps: diag.velocitySanityClamps,
      syncMode: diag.sg02SyncMode,
    } : null,
  };
}).catch(() => null);

try {
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!(window.SF && window.SF.state), null, { timeout: 60_000 });
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await page.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 10_000 });
  }
  await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 60_000 });
  await page.waitForFunction(flightReadyInPage, null, { timeout: 300_000 });
  await page.evaluate(() => {
    window.__SF_PUBLISH_SG02_SNAPSHOT__ = true;
    window.__M6_RELEASE_SOAK_EVENTS__ = { saved: false, loaded: false };
    window.SF.bus.on('save:completed', () => { window.__M6_RELEASE_SOAK_EVENTS__.saved = true; });
    window.SF.bus.on('save:loaded', () => { window.__M6_RELEASE_SOAK_EVENTS__.loaded = true; });
  });
  console.log('flight ready; snapshot publishing on');

  for (let cycle = 0; cycle < CYCLES; cycle += 1) {
    // The soak cycle shape: undock -> brief flight -> F5 -> diverge -> F9 -> arm waypoint.
    // To catch the ~1/250 wedge faster, vary the pre-save flight across the corridor-gap
    // edge band: strafe holds slide the hull off the lane axis without extending range, so
    // the post-load approach re-enters the gap off-axis and can clip a ring-chain circle.
    await undock();
    const pattern = cycle % 6;
    if (pattern === 0) { // soak baseline: 450ms forward
      await page.keyboard.down('KeyW'); await page.waitForTimeout(450); await page.keyboard.up('KeyW');
    } else if (pattern === 1 || pattern === 2) { // lateral slide off the lane axis
      const key = pattern === 1 ? 'KeyA' : 'KeyD';
      await page.keyboard.down(key); await page.waitForTimeout(350 + (cycle % 4) * 200); await page.keyboard.up(key);
    } else if (pattern === 3 || pattern === 4) { // short forward + lateral carve
      const key = pattern === 3 ? 'KeyA' : 'KeyD';
      await page.keyboard.down('KeyW'); await page.keyboard.down(key);
      await page.waitForTimeout(300 + (cycle % 3) * 200);
      await page.keyboard.up(key); await page.keyboard.up('KeyW');
    } else { // longer forward exit
      await page.keyboard.down('KeyW'); await page.waitForTimeout(800); await page.keyboard.up('KeyW');
    }
    await page.evaluate(() => { window.__M6_RELEASE_SOAK_EVENTS__.saved = false; });
    await page.keyboard.press('F5');
    await page.waitForFunction(() => window.__M6_RELEASE_SOAK_EVENTS__?.saved === true && !!localStorage.getItem('sf.save.quick'), null, { timeout: 20_000 });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(650);
    await page.keyboard.up('KeyW');
    await page.evaluate(() => { window.__M6_RELEASE_SOAK_EVENTS__.loaded = false; });
    await page.keyboard.press('F9');
    await page.waitForFunction(() => window.__M6_RELEASE_SOAK_EVENTS__?.loaded === true && window.SF?.state?.mode === 'flight', null, { timeout: 90_000 });
    await page.waitForFunction(() => window.SF?.state?.entityList?.some((e) => e?.type === 'station' && e?.data?.stationId === 'station_helios'), null, { timeout: 90_000 });
    const promptNow = await page.locator('.sf-alert--dock').isVisible().catch(() => false)
      && await page.evaluate(() => window.SF?.state?.dockingCorridor?.stationId === 'station_helios').catch(() => false);
    if (!promptNow) await armHeliosWaypoint();

    // Observe the approach: sample until docked or the observe window expires, tracking
    // whether entity.pos keeps integrating while speed stays nonzero. Mirrors the soak's
    // recovery: a dropped autopilot or a non-converging approach gets brake + re-arm, 3x.
    const samples = [];
    let froze = null;
    const start = Date.now();
    let docked = false;
    let lastPos = null;
    let stillSince = null;
    let rearms = 0;
    let closest = Infinity;
    let improveAt = Date.now();
    while (Date.now() - start < OBSERVE_MS) {
      const s = await sample();
      if (!s) { await page.waitForTimeout(250); continue; }
      samples.push(s);
      if (s.docked) { docked = true; break; }
      const dockPrompt = await page.evaluate(() => {
        const el = document.querySelector('.sf-alert--dock');
        return !!el && !el.hidden && getComputedStyle(el).display !== 'none' && window.SF?.state?.dockingCorridor?.stationId === 'station_helios';
      }).catch(() => false);
      if (dockPrompt) {
        await page.keyboard.down('Digit0');
        await page.waitForTimeout(900);
        await page.keyboard.up('Digit0');
        await page.keyboard.press('KeyE');
        continue;
      }
      if (s.pos && lastPos && dist(s.pos, lastPos) < 0.05) {
        if (stillSince == null) stillSince = s.t;
      } else {
        stillSince = null;
      }
      lastPos = s.pos;
      const speed = s.vel ? Math.hypot(s.vel.x, s.vel.z) : 0;
      if (stillSince != null && s.t - stillSince > 5_000 && speed > 1) {
        froze = { at: s.t, samples };
        break;
      }
      const d = s.corridor && Number.isFinite(s.corridor.distToBerth) ? s.corridor.distToBerth : null;
      if (d != null && d < closest) { closest = d; improveAt = Date.now(); }
      const apDropped = s.ap && s.ap.active === false;
      const stalled = s.corridor && s.corridor.inCapture === true && speed > 26 && stillSince == null
        ? false // capture-stall needs pos-frozen evidence; handled by freeze detector
        : (d != null && d < 250 && speed > 26 && Date.now() - improveAt > 8_000);
      if ((apDropped || stalled) && rearms < 3) {
        rearms += 1;
        console.log(`cycle ${cycle}: rearm ${rearms} (${apDropped ? 'autopilot dropped' : 'no convergence'}; d=${d?.toFixed(1)} v=${speed.toFixed(1)} ph=${s.corridor?.phase})`);
        await page.keyboard.down('Digit0');
        const brakeUntil = Date.now() + 9_000;
        while (Date.now() < brakeUntil) {
          const cur = await sample();
          if (!cur || cur.docked) break;
          if (cur.vel && Math.hypot(cur.vel.x, cur.vel.z) < 20) break;
          await page.waitForTimeout(250);
        }
        await page.keyboard.up('Digit0');
        await armHeliosWaypoint().catch((e) => console.log(`  rearm failed: ${e.message}`));
        closest = Infinity;
        improveAt = Date.now();
        stillSince = null;
      }
      await page.waitForTimeout(250);
    }

    if (froze) {
      const last = samples[samples.length - 1] || {};
      const entityVsSnap = last.pos && last.snap
        ? { poseDelta: dist(last.pos, last.snap), velDelta: Math.hypot(last.vel.x - last.snap.vx, last.vel.z - last.snap.vz) }
        : null;
      console.log(`\n=== FREEZE DETECTED at cycle ${cycle} ===`);
      console.log(`verdict: ${!last.snap ? 'NO SNAPSHOT REC — orphaned entity' : (entityVsSnap.poseDelta < 2 ? 'BOUND+WEDGED (snapshot tracks frozen entity)' : `STALE BINDING (body ${entityVsSnap.poseDelta.toFixed(1)} WU away)`) }`);
      console.log(`entityVsSnap: ${JSON.stringify(entityVsSnap)}`);
      console.log(`last: ${JSON.stringify(last)}`);
      console.log('recent samples:');
      for (const s of samples.slice(-25)) {
        const sp = s.vel ? Math.hypot(s.vel.x, s.vel.z).toFixed(1) : '?';
        const snapSp = s.snap ? Math.hypot(s.snap.vx, s.snap.vz).toFixed(1) : '-';
        console.log(`  pos=(${s.pos?.x.toFixed(2)},${s.pos?.z.toFixed(2)}) v=${sp} snap=(${s.snap?.x.toFixed(2)},${s.snap?.z.toFixed(2)}) sv=${snapSp} ph=${s.corridor?.phase} d=${s.corridor?.distToBerth?.toFixed(2)} cap=${s.corridor?.inCapture} h=${s.corridor?.headingOk} ap=${s.ap?.status} att=${s.diag?.attachments} rej=${s.diag?.stepDisplacementRejects}`);
      }
      await mkdir('.devshots/spec2', { recursive: true }).catch(() => {});
      await writeFile(
        `.devshots/spec2/diag-dock-stall-freeze-${cycle}.json`,
        `${JSON.stringify({ cycle, verdict: entityVsSnap, last, samples: samples.slice(-60) }, null, 2)}\n`,
        'utf8',
      ).catch(() => {});
      await page.screenshot({ path: `.devshots/spec2/diag-dock-stall-freeze-${cycle}.png` }).catch(() => {});
      // Manual-escape test: a player in this state would disengage the autopilot and fly
      // out by hand. Hold S (reverse) + brake for 8s — if pos never moves, the wedge is
      // not player-escapable and the restore genuinely strands the ship.
      console.log('manual-escape test: disengage autopilot + hold S/brake 8s…');
      await page.keyboard.press('KeyM').catch(() => {});
      const escStart = await sample();
      await page.keyboard.down('KeyS');
      await page.keyboard.down('Digit0');
      const escDeadline = Date.now() + 8_000;
      let escLast = escStart;
      while (Date.now() < escDeadline) {
        escLast = await sample() || escLast;
        await page.waitForTimeout(300);
      }
      await page.keyboard.up('KeyS');
      await page.keyboard.up('Digit0');
      const escMoved = escStart?.pos && escLast?.pos ? dist(escStart.pos, escLast.pos) : -1;
      console.log(`manual-escape result: moved ${escMoved.toFixed(2)} WU in 8s (v=${escLast?.vel ? Math.hypot(escLast.vel.x, escLast.vel.z).toFixed(1) : '?'}) — ${escMoved > 1 ? 'ESCAPABLE by player input' : 'PERMANENT WEDGE'}`);
      break;
    }
    if (!docked) {
      const last = samples[samples.length - 1];
      console.log(`cycle ${cycle}: observe expired without dock or freeze — last=${JSON.stringify({ pos: last?.pos, v: last?.vel ? Math.hypot(last.vel.x, last.vel.z).toFixed(1) : null, corridor: last?.corridor, ap: last?.ap })}`);
      break;
    }
    // Docked: wait for the station screen, then next cycle undocks.
    await page.locator('[data-screen="station"]').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
    console.log(`cycle ${cycle}: docked cleanly (${samples.length} samples)`);
  }
  console.log('diagnostic complete');
} finally {
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
