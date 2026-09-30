// DIAG (worktree-only): deterministically test whether a save/load restore at a ring-edge
// pose leaves the player physically wedged. The release-soak dock stall showed entity.pos
// frozen while entity.vel stayed ~51: the signature of a body pinned against a collider
// while _applyPlayerStructuralGive restores thrust-predicted linvel each tick.
//
// Method: take a REAL quick-save, rewrite ONLY the player's pose/velocity to a computed
// hazard pose (ring-chain circle just outside the corridor gap, inbound velocity), write
// it back, then exercise the real F9 load path and observe whether the ship integrates.
// Only pos/vel are fabricated — the same class of state a manual flight there produces.
// Everything else (station proxy, records, physics owner) flows through the live path.
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { flightReadyInPage } from './lib/alphaLiveBaselineRoute.mjs';

const server = await acquireVisualProbeServer({ root: process.cwd() });
if (!server.ownsServer) throw new Error('expected an owned in-process server');
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const dist = (a, b) => Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.z ?? 0) - (b?.z ?? 0));

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
    window.__M6 = { loaded: false };
    window.SF.bus.on('save:loaded', () => { window.__M6.loaded = true; });
  });
  console.log('flight ready');

  // Undock and fly briefly so the save records a live flight state (a docked save restores
  // the station-hub mode and any pose edit is overridden by the berth).
  await page.keyboard.press('KeyE');
  const leftNow = await page.waitForFunction(() => window.SF?.state?.ui?.docked === false, null, { timeout: 1_500 }).then(() => true).catch(() => false);
  if (!leftNow) {
    const departureLaunch = page.locator('button[data-pop-launch]').and(page.getByRole('button', { name: /\blaunch\b/i }));
    if (await departureLaunch.isVisible().catch(() => false)) {
      await departureLaunch.click();
    } else {
      for (const c of [
        page.locator('button.sf-confirm__ok').and(page.getByRole('button', { name: /\bundock\b/i })),
        page.locator('button[data-act="undock"]').and(page.getByRole('button', { name: /\bundock\b/i })),
        page.locator('button.st-undock').and(page.getByRole('button', { name: /\bundock\b/i })),
      ]) {
        if (await c.isVisible().catch(() => false)) { await c.click(); break; }
      }
      const left2 = await page.waitForFunction(() => window.SF?.state?.ui?.docked === false, null, { timeout: 1_500 }).then(() => true).catch(() => false);
      if (!left2 && await departureLaunch.isVisible().catch(() => false)) await departureLaunch.click();
    }
    await page.waitForFunction(() => window.SF?.state?.ui?.docked === false, null, { timeout: 20_000 });
  }
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyW');
  // Produce a real quick-save envelope, then read station geometry.
  await page.keyboard.press('F5');
  await page.waitForFunction(() => !!localStorage.getItem('sf.save.quick'), null, { timeout: 20_000 });
  const geo = await page.evaluate(() => {
    const s = window.SF.state;
    const st = (s.entityList || []).find((e) => e?.type === 'station' && e?.data?.stationId === 'station_helios');
    const p = s.entities?.get?.(s.playerId);
    const env = JSON.parse(localStorage.getItem('sf.save.quick') || 'null');
    // dockingCorridor publishes the resolved world-space proxy primitives + effective berth.
    const proxies = s.physicsRuntime?.collisionProxies || [];
    const helios = proxies.find((r) => r?.stationId === 'station_helios') || null;
    return {
      playerRadius: p?.radius, playerPos: p?.pos, playerVel: p?.vel,
      station: st ? { pos: { x: st.pos.x, z: st.pos.z }, rot: st.rot, radius: st.radius, corridorBearingDeg: st.data?.corridorBearingDeg, dockRadius: st.data?.dockRadius } : null,
      berth: helios?.berth || null,
      corridorBearingEffective: helios?.corridorBearingDeg ?? null,
      primitives: helios ? helios.primitives : null,
      savePlayer: env?.data?.entities?.player ? { pos: env.data.entities.player.pos, vel: env.data.entities.player.vel, rot: env.data.entities.player.rot } : null,
      saveKeys: env?.data?.entities ? Object.keys(env.data.entities).slice(0, 12) : [],
    };
  });
  console.log('geometry:', JSON.stringify(geo));
  if (!geo.station) throw new Error('no helios station entity');

  const cands = [];
  const berth = geo.berth;
  if (berth) {
    // The observed failure pose class: ~6.7 WU off the berth, plus a dense grid around it and
    // the approach lane behind it (the post-load autopilot re-enters along the lane).
    for (const [ox, oz] of [[-5.8, -3.4], [-6.7, 0], [0, -6.7], [0, 6.7], [6.7, 0], [-4, -4], [-9, -6], [-12, 2], [-3, 10], [8, -8]]) {
      cands.push({ tag: `berth+(${ox},${oz})`, pos: { x: berth.x + ox, z: berth.z + oz } });
    }
  }
  // Collider-center and edge poses straight from the published world-space primitives: a ship
  // restored ON a chain circle center is the deepest-embedded wedge case; circle-pair midpoints
  // are the pinched-between-two-colliders case.
  const prims = Array.isArray(geo.primitives) ? geo.primitives : [];
  const circles = prims.filter((p) => p && p.kind === 'circle' && Number.isFinite(p.x) && Number.isFinite(p.z));
  for (const c of circles.slice(0, 40)) {
    cands.push({ tag: `center r${c.r?.toFixed?.(1)}`, pos: { x: c.x, z: c.z } });
    cands.push({ tag: `edge r${c.r?.toFixed?.(1)}`, pos: { x: c.x + (c.r || 0) + (geo.playerRadius || 14) * 0.5, z: c.z } });
  }
  for (let i = 0; i + 1 < Math.min(circles.length, 40); i += 1) {
    const a = circles[i], b = circles[i + 1];
    if (dist(a, b) < 60) cands.push({ tag: 'pair-mid', pos: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 } });
  }
  console.log(`testing ${cands.length} candidate poses (berth=${JSON.stringify(berth)}, prims=${prims.length}, circles=${circles.length})`);

  const results = [];
  for (const cand of cands) {
    // Velocity: 51 wu/s aimed at the published berth point (the restored-velocity class
    // from the soak failure — an accelerating undock departure saved mid-corridor).
    const bx = geo.berth ? geo.berth.x : geo.station.pos.x;
    const bz = geo.berth ? geo.berth.z : geo.station.pos.z;
    const dx = bx - cand.pos.x, dz = bz - cand.pos.z;
    const dl = Math.hypot(dx, dz) || 1;
    const speed = 51;
    const vel = { x: dx / dl * speed, z: dz / dl * speed };

    await page.evaluate(({ pos, vel }) => {
      // The envelope checksum covers data verbatim — a fabricated pose must be re-hashed or
      // the load path rejects the envelope before save:loaded.
      const fnv1a = (str) => {
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i += 1) {
          h ^= str.charCodeAt(i);
          h = Math.imul(h, 0x01000193);
        }
        return (h >>> 0).toString(16).padStart(8, '0');
      };
      const env = JSON.parse(localStorage.getItem('sf.save.quick') || 'null');
      if (!env?.data?.entities?.player) throw new Error('no player in save envelope');
      env.data.entities.player.pos = { x: pos.x, y: 0, z: pos.z };
      env.data.entities.player.vel = { x: vel.x, y: 0, z: vel.z };
      env.data.entities.player.rot = Math.atan2(vel.z, vel.x);
      if (env.checksum) env.checksum = fnv1a(JSON.stringify(env.data));
      localStorage.setItem('sf.save.quick', JSON.stringify(env));
    }, { pos: cand.pos, vel });

    await page.evaluate(() => { window.__M6.loaded = false; });
    await page.keyboard.press('F9');
    await page.waitForFunction(() => window.__M6.loaded === true && window.SF?.state?.mode === 'flight', null, { timeout: 90_000 });

    // Observe 10s: does entity.pos integrate away from the restored pose?
    const start = await page.evaluate(() => {
      const s = window.SF.state;
      const p = s.entities?.get?.(s.playerId);
      return p ? { pos: { x: p.pos.x, z: p.pos.z }, vel: { x: p.vel.x, z: p.vel.z } } : null;
    });
    let last = start;
    let minD = Infinity;
    const trace = [];
    for (let i = 0; i < 40; i += 1) {
      await page.waitForTimeout(250);
      last = await page.evaluate(() => {
        const s = window.SF.state;
        const p = s.entities?.get?.(s.playerId);
        const snaps = s.physicsRuntime?.sg02Snapshot || [];
        const snap = snaps.find((r) => r && r.id === s.playerId);
        const dc = s.dockingCorridor;
        return p ? {
          pos: { x: p.pos.x, z: p.pos.z }, vel: { x: p.vel.x, z: p.vel.z },
          snap: snap ? { x: snap.x, z: snap.z, vx: snap.vx, vz: snap.vz } : null,
          corridor: dc ? { phase: dc.phase, distToBerth: dc.distToBerth, inCapture: dc.inCapture } : null,
          docked: s.ui?.docked === true,
        } : null;
      });
      if (!last) break;
      trace.push(last);
      if (last.docked) break;
    }
    const moved = start?.pos && last?.pos ? dist(start.pos, last.pos) : -1;
    const endV = last?.vel ? Math.hypot(last.vel.x, last.vel.z) : -1;
    const wedged = moved >= 0 && moved < 1 && !last?.docked;
    results.push({ tag: cand.tag, moved: +moved.toFixed(2), endV: +endV.toFixed(1), docked: !!last?.docked, wedged });
    console.log(`${cand.tag} -> moved ${moved.toFixed(2)} WU, endV ${endV.toFixed(1)}${last?.docked ? ' DOCKED' : ''}${wedged ? '  <<<< WEDGED' : ''}`);
    if (wedged) {
      console.log('  trace tail:', JSON.stringify(trace.slice(-8).map((t) => ({ p: [t.pos.x.toFixed(1), t.pos.z.toFixed(1)], v: Math.hypot(t.vel.x, t.vel.z).toFixed(1), s: t.snap ? [t.snap.x.toFixed(1), t.snap.z.toFixed(1), Math.hypot(t.snap.vx, t.snap.vz).toFixed(1)] : null, ph: t.corridor?.phase, d: t.corridor?.distToBerth?.toFixed(1) }))));
      await page.screenshot({ path: `.devshots/spec2/diag-wedge-${cand.tag.replace(/[^a-z0-9]+/gi, '_')}.png` }).catch(() => {});
    }
    // Get back to a sane state for the next candidate: reload leaves us wherever we are —
    // that's fine, the next candidate overwrites the pose anyway.
  }
  const wedges = results.filter((r) => r.wedged);
  console.log(`\n=== RESULT: ${wedges.length}/${results.length} candidates wedged ===`);
  for (const w of wedges) console.log(`  WEDGE ${w.tag} moved=${w.moved}`);
} finally {
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
