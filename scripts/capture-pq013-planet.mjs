#!/usr/bin/env node
// PQ-013 route evidence — THE full player sequence as one captured route (STEP 12 public route):
//   approach (atlas nav target + planet growth) → sling (field-bent path, measured deflection)
//   → skim harvest (collector, path×density, cargo owner) → hostile consequence (a REAL pirate
//   pursuing into the bands walks the staged Plunge; terminal through the ordinary kill path)
//   → player recovery (emergency burn out of Commit) → save/Continue mid-vertical → depart.
// Reduced-motion + reduced-flash variants captured for the skim + reentry beats.
//
// Numbered route log + screenshots (default chase camera; assertNotWhiteout gate on every PNG)
// into .devshots/pq013-planet/route/. Capture-rig teleports use the SG-02 pose-resync path
// (position writes reconcile the body); ALL forces/damage/cargo still flow through the real
// authorities — the rig only frames, it never fakes an outcome.

import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import { PNG } from 'pngjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'pq013-planet', 'route');
const WIDTH = 1440, HEIGHT = 900;
const HEADED = process.env.SF_ROUTE_HEADLESS !== '1';

await mkdir(OUT, { recursive: true });
const executablePath = findSystemBrowser();
if (!executablePath) throw new Error('Chrome or Edge required');

const ownedServer = await acquireVisualProbeServer({ explicitUrl: process.env.SF_PROBE_URL || '', root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: !HEADED, executablePath,
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion', `--window-size=${WIDTH},${HEIGHT + 120}`],
});
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
const page = await context.newPage();
const issues = [];
const captures = [];
const routeLog = [];
let step = 0;
function log(msg) { const line = `${String(step).padStart(2, '0')} ${msg}`; routeLog.push(line); console.log('[route] ' + line); step++; }
page.on('pageerror', (e) => { console.error('[browser error]', e); issues.push({ type: 'pageerror', text: e?.stack || String(e) }); });
page.on('console', (m) => { if (m.type() === 'error') { console.error('[browser console.error]', m.text()); issues.push({ type: 'console.error', text: m.text() }); } });

try {
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  await page.goto(ownedServer.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus), null, { timeout: 30_000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'PQ013 Route', seed: 47 }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf?.state?.entities?.get(sf.state.playerId);
    return sf?.state?.mode === 'flight' && player?.mesh && !!sf?.registry?.get?.('vfx')?._scene;
  }, null, { timeout: 90_000 });
  await dismissTutorial(page);
  await page.waitForTimeout(600);
  log('boot: New Game seed 47, flight mode reached (Helios)');

  // ---- 01 Atlas nav target: the identity is chart-addressable and course-able -----------------
  const nav = await page.evaluate(async () => {
    const SF = window.SF;
    const { PLANET_SITE } = await import('/src/data/planets.js');
    const { ZONE_TETHYS_ANVIL } = await import('/src/data/authoredPlaces.js');
    const { sectorLocalToGlobalForSector } = await import('/src/data/sectorCoordinates.js');
    const centre = sectorLocalToGlobalForSector(ZONE_TETHYS_ANVIL.center, PLANET_SITE.sectorId);
    SF.bus.emit('ui:setCourse', { pos: { x: centre.x, z: centre.z }, label: ZONE_TETHYS_ANVIL.name, id: PLANET_SITE.zoneId });
    const target = SF.state.nav && SF.state.nav.autopilot && SF.state.nav.autopilot.target;
    return { centre, zoneId: PLANET_SITE.zoneId, name: ZONE_TETHYS_ANVIL.name, navTarget: target ? { x: target.x, z: target.z } : null };
  });
  log(`atlas nav: course set to ${nav.zoneId} "${nav.name}" at global (${nav.centre.x}, ${nav.centre.z}); nav.autopilot.target=${JSON.stringify(nav.navTarget)}`);

  // ---- 02/03 approach: teleport to Tethys near the site; residency flips the sector -----------
  const setup = await page.evaluate(async ({ centre }) => {
    const SF = window.SF, state = SF.state, THREE = SF.THREE;
    const dir = new THREE.Vector3();
    state.render.camera.getWorldDirection(dir);
    const l = Math.hypot(dir.x, dir.z) || 1;
    const up = { x: dir.x / l, z: dir.z / l }; // up-screen world direction
    const p = state.entities.get(state.playerId);
    p.pos.x = centre.x - up.x * 2800;
    p.pos.z = centre.z - up.z * 2800;
    p.vel.x = 0; p.vel.z = 0;
    p.rot = Math.atan2(up.z, up.x);
    window.__pq013 = { up, centre };
    return { up };
  }, { centre: nav.centre });
  await page.waitForTimeout(2500); // residency switch + sector content + planet registration + bake
  const reg = await page.evaluate(() => {
    const s = window.SF.state;
    return { sector: s.world.currentSectorId, active: !!(s.planet && s.planet.active), zoneId: s.planet && s.planet.zoneId, entityId: s.planet && s.planet.entityId, fieldOnSnapshot: !!(s.fields.snapshot || []).find((f) => f.tag === 'external') };
  });
  log(`sector residency: ${reg.sector}; planet registered=${reg.active} zone=${reg.zoneId} entity=${reg.entityId} fieldOnPredictorSnapshot=${reg.fieldOnSnapshot}`);
  if (!reg.active) throw new Error('planet did not register — vertical cannot proceed');
  await capture('01-approach-far.png', 'approach at 2800 — the world on the horizon');

  await placeAt(1500, { face: true });
  await page.waitForTimeout(700);
  await capture('02-approach-mid.png', 'approach at 1500 — readable planet growth');
  log('approach: planet growth read at 2800 -> 1500 (shots 01/02)');

  // ---- 04 sling: tangential pass through the sling ring; the field bends the real path --------
  const sling = await page.evaluate(() => {
    const SF = window.SF, state = SF.state;
    const { up, centre } = window.__pq013;
    const p = state.entities.get(state.playerId);
    // Enter the sling ring tangentially: position on the camera-left of the ring, velocity along
    // +up-screen tangent so the pass crosses the visible face.
    const tX = -up.z, tZ = up.x; // tangent (perp to up)
    p.pos.x = centre.x - tX * 1400 - up.x * 400;
    p.pos.z = centre.z - tZ * 1400 - up.z * 400;
    const speed = 115; // fast pass: a correct "timed release" escapes with a bent heading
    p.vel.x = tX * speed * 0 + up.x * speed; // fly up-screen past the planet's flank
    p.vel.z = tZ * speed * 0 + up.z * speed;
    p.rot = Math.atan2(p.vel.z, p.vel.x);
    return { entry: { x: p.pos.x, z: p.pos.z }, vel: { x: p.vel.x, z: p.vel.z }, headingIn: Math.atan2(p.vel.z, p.vel.x) };
  });
  await page.waitForTimeout(900);
  await capture('03-sling-entry.png', 'sling entry — tangential pass at the sling ring');
  await page.waitForTimeout(5200); // let the annular field bend the pass (no rig forces)
  const slingOut = await page.evaluate(() => {
    const SF = window.SF, state = SF.state;
    const p = state.entities.get(state.playerId);
    const { centre } = window.__pq013;
    const r = Math.hypot(p.pos.x - centre.x, p.pos.z - centre.z);
    return { exit: { x: p.pos.x, z: p.pos.z }, headingOut: Math.atan2(p.vel.z, p.vel.x), speed: Math.hypot(p.vel.x, p.vel.z), r, region: state.planet.player.region };
  });
  const deflectionDeg = Math.abs(((slingOut.headingOut - sling.headingIn + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 180 / Math.PI;
  log(`sling: heading in ${sling.headingIn.toFixed(3)} -> out ${slingOut.headingOut.toFixed(3)} rad; DEFLECTION ${deflectionDeg.toFixed(1)} deg; exit speed ${slingOut.speed.toFixed(1)} wu/s; region=${slingOut.region} (the annular field bent a free-flight pass — no rig forces during the window)`);
  await capture('04-sling-exit.png', `sling exit — bent path, deflection ${deflectionDeg.toFixed(1)} deg`);
  if (deflectionDeg < 6) issues.push({ type: 'sling', text: `deflection ${deflectionDeg.toFixed(1)} deg below the 6 deg readability floor` });

  // ---- 05 skim harvest: collector on, working the band; yield through the cargo owner ---------
  const cargoBefore = await page.evaluate(() => ({ ...window.SF.state.player.cargo.items }));
  await page.evaluate(() => { window.__pq013.harvestEvents = []; window.SF.bus.on('planet:harvest', (p) => window.__pq013.harvestEvents.push(p)); });
  await placeAt(950, { tangential: 55 });
  await page.focus('body');
  // Real key edge: hold ~90ms so the fixed-tick input sampler sees the down state (an instantaneous
  // down+up inside one frame is missed — the capture-fields precedent holds its keys too).
  await page.keyboard.down('Digit8');
  await page.waitForTimeout(90);
  await page.keyboard.up('Digit8');
  await page.waitForTimeout(300);
  let scoopOn = await page.evaluate(() => window.SF.state.planet.player.collectorOn);
  log(`collector: Digit8 held 90ms -> collectorOn=${scoopOn} (ordinary input path)`);
  if (!scoopOn) {
    // Honest fallback (logged as such): drive the same action flag the key edge sets.
    await page.evaluate(() => { window.SF.state.input.actions.toggleSkimCollector = true; });
    await page.waitForTimeout(150);
    scoopOn = await page.evaluate(() => window.SF.state.planet.player.collectorOn);
    log(`collector FALLBACK: action flag driven directly -> collectorOn=${scoopOn} (key-edge path failed; note for input follow-up)`);
  }
  // Work the band ~9s; re-trim the orbit every 1.5s (capture-rig steering; harvest math reads the
  // REAL velocity + region each tick).
  for (let i = 0; i < 6; i++) {
    await placeAt(950, { tangential: 55, keepHeat: true });
    await page.waitForTimeout(1500);
  }
  const skimState = await page.evaluate(() => {
    const s = window.SF.state;
    return {
      region: s.planet.player.region, heat: s.planet.player.heat, harvested: s.planet.player.harvestedUnits,
      items: { ...s.player.cargo.items }, events: window.__pq013.harvestEvents.length,
      pill: (document.querySelector('.sf-planet-pill') || {}).textContent || '(hidden)',
    };
  });
  const dHydrogen = (skimState.items.cmdty_gas_hydrogen || 0) - (cargoBefore.cmdty_gas_hydrogen || 0);
  log(`skim harvest: region=${skimState.region} heat=${skimState.heat.toFixed(2)} harvestedUnits=${skimState.harvested} hydrogen +${dHydrogen} (cargo owner), ${skimState.events} planet:harvest events; band pill="${skimState.pill}"`);
  await capture('05-skim-harvest.png', 'working band skim, collector on, motes + band pill');
  if (skimState.harvested < 1) issues.push({ type: 'harvest', text: 'no units harvested on the skim beat' });

  // Reduced-motion + reduced-flash variants of the skim read.
  await setAccessibility(true, false);
  await page.waitForTimeout(500);
  await capture('05a-skim-reduced-motion.png', 'skim variant: reduced motion (bands hold static; info preserved)');
  await setAccessibility(false, true);
  await page.waitForTimeout(500);
  await capture('05b-skim-reduced-flash.png', 'skim variant: reduced flash (sheath capped at amber; staging preserved)');
  await setAccessibility(false, false);
  log('accessibility variants captured for the skim beat (05a motion / 05b flash)');

  // ---- 06 hostile consequence: a REAL pirate pursues into the bands and plunges ---------------
  const pirate = await page.evaluate(async () => {
    const SF = window.SF, state = SF.state;
    const { makeEnemySpawnSpec } = await import('/src/systems/combat.js');
    const { centre } = window.__pq013;
    const p = state.entities.get(state.playerId);
    const spec = makeEnemySpawnSpec('reaver_pirate', 3, { x: p.pos.x + 120, z: p.pos.z + 60 });
    spec.hull = spec.hullMax = 70; // a worn raider — the plunge finishes what the bait starts
    spec.shield = spec.shieldMax = 0;
    const e = SF.helpers.spawnEntity(spec);
    window.__pq013.pirateId = e.id;
    window.__pq013.stageEvents = [];
    SF.bus.on('planet:plungeStage', (ev) => window.__pq013.stageEvents.push({ id: ev.id, stage: ev.stage, isPlayer: ev.isPlayer }));
    return { id: e.id, team: e.team, hull: e.hull };
  });
  log(`hostile: reaver_pirate spawned (id=${pirate.id}, team=${pirate.team}, hull=${pirate.hull}) — REAL archetype AI, no scripted motion`);
  // Bait: the player dives across the danger band in slow chords; the pursuer follows and cooks.
  for (let i = 0; i < 26; i++) {
    const done = await page.evaluate(() => {
      const SF = window.SF, state = SF.state;
      const { centre, pirateId } = window.__pq013;
      const p = state.entities.get(state.playerId);
      const pirate = state.entities.get(pirateId);
      if (!pirate || pirate.alive === false) return { dead: true };
      // The bait path: player weaves along the danger/skim boundary; heat managed by the weave.
      const myR = Math.hypot(p.pos.x - centre.x, p.pos.z - centre.z);
      const ang = Math.atan2(p.pos.z - centre.z, p.pos.x - centre.x);
      const targetR = (state.planet.player.heat > 0.5) ? 985 : 835; // weave out when hot, in when cool
      const na = ang + 0.16;
      p.pos.x = centre.x + Math.cos(na) * targetR;
      p.pos.z = centre.z + Math.sin(na) * targetR;
      const tv = 52;
      p.vel.x = -Math.sin(na) * tv; p.vel.z = Math.cos(na) * tv;
      p.rot = Math.atan2(p.vel.z, p.vel.x);
      const pr = Math.hypot(pirate.pos.x - centre.x, pirate.pos.z - centre.z);
      const rec = state.planet.ships[pirateId] || null;
      return { dead: false, pirateR: pr, stage: rec && rec.stage, heat: rec && rec.heat, hull: pirate.hull };
    });
    if (done.dead) { log('hostile: pirate DESTROYED by the plunge'); break; }
    if (i % 3 === 0) log(`bait loop ${i}: pirate r=${done.pirateR ? done.pirateR.toFixed(0) : '?'} stage=${done.stage || '-'} heat=${done.heat ? done.heat.toFixed(2) : '-'} hull=${done.hull}`);
    if (done.stage === 'breakup' || done.stage === 'descent') {
      await capture('06-hostile-breakup.png', `pursuer in ${done.stage} — plasma sheath closed over a REAL AI pirate`);
    }
    await page.waitForTimeout(1600);
  }
  const plunge = await page.evaluate(() => {
    const { pirateId, stageEvents } = window.__pq013;
    const pirate = window.SF.state.entities.get(pirateId);
    return {
      alive: !!(pirate && pirate.alive !== false),
      stages: stageEvents.filter((e) => e.id === pirateId).map((e) => e.stage),
      wreckCount: [...window.SF.state.entities.values()].filter((e) => e.type === 'wreck' && e.alive !== false).length,
    };
  });
  log(`hostile plunge ladder: [${plunge.stages.join(' -> ')}]; pirate alive=${plunge.alive}; wrecks in scene=${plunge.wreckCount}`);
  if (!plunge.stages.includes('skim')) issues.push({ type: 'plunge', text: 'pursuer never entered the plunge ladder' });
  await capture('06a-hostile-aftermath.png', 'after the plunge — the band remembers, the machine goes on');

  // Reduced-flash variant of the reentry read (worst-case flash scene). Short dwell — the burn
  // damage is real now, and this rig is not allowed to casually kill the pilot for a photo.
  await setAccessibility(false, true);
  await placeAt(830, { tangential: 40 });
  await page.waitForTimeout(800);
  await capture('06b-reentry-reduced-flash.png', 'reentry read under reduced flash — stage silhouettes preserved, no white-hot peak');
  await setAccessibility(false, false);

  // ---- 07 player recovery: cool off, then take a REAL commit and burn OUT ---------------------
  try {
    await placeAt(1600, {}); // influence region: full cool rate, no drag, no burn
    const vitals = await page.evaluate(() => {
      const s = window.SF.state;
      const p = s.entities.get(s.playerId);
      return { alive: !!(p && p.alive !== false), hull: p && p.hull, heat: s.planet.player.heat, mode: s.mode };
    });
    log(`recovery pre-check: alive=${vitals.alive} hull=${vitals.hull} heat=${vitals.heat.toFixed(2)} mode=${vitals.mode}`);
    await page.waitForFunction(() => window.SF.state.planet.player.heat < 0.3, null, { timeout: 30000 });
    await page.evaluate(() => {
      const SF = window.SF, state = SF.state;
      const { centre, up } = window.__pq013;
      const p = state.entities.get(state.playerId);
      // Pin to the CAMERA-SOUTH point of the ring so world-outward == down-screen — the helm
      // scheme's mouse aim (parked at the bottom of the frame) then steers a genuine escape.
      const ang = Math.atan2(-up.z, -up.x);
      p.pos.x = centre.x + Math.cos(ang) * 845; // storm band: heat builds at the danger rate
      p.pos.z = centre.z + Math.sin(ang) * 845;
      p.vel.x = 0; p.vel.z = 0;
      p.rot = ang; // nose OUTWARD — the pilot is trying to leave
      window.__pq013.recoveryEvents = [];
      SF.bus.on('planet:recoveryBurn', (ev) => window.__pq013.recoveryEvents.push(ev));
    });
    await page.waitForFunction(() => window.SF.state.planet.player.stage === 'commit', null, { timeout: 15000 });
    const commitSnap = await page.evaluate(() => {
      const s = window.SF.state;
      return { stage: s.planet.player.stage, heat: s.planet.player.heat, pill: (document.querySelector('.sf-planet-pill') || {}).textContent || '(hidden)' };
    });
    log(`recovery setup: stage=${commitSnap.stage} heat=${commitSnap.heat.toFixed(2)} pill="${commitSnap.pill}" (one-voice BURN NOW routed at commit)`);
    await capture('07-commit-window.png', 'COMMIT — plasma sheath closing, the burn-now window');
    // The REAL escape inputs: the pilot scheme flies SCREEN-relative (keyboard flies, mouse
    // fights), so down-screen = S while the mouse (nose/aim) parks at the bottom of the frame —
    // both point outward from the camera-south ring point. Shift boosts the burn.
    await page.mouse.move(720, 850);
    await page.keyboard.down('KeyS');
    await page.keyboard.down('ShiftLeft');
    await page.waitForTimeout(700);
    const diag = await page.evaluate(() => {
      const s = window.SF.state;
      const p = s.entities.get(s.playerId);
      const { centre } = window.__pq013;
      const r = Math.hypot(p.pos.x - centre.x, p.pos.z - centre.z);
      return { r, rot: p.rot, vx: p.vel.x, vz: p.vel.z, boost: !!s.input.boost, moveX: s.input.moveX, moveZ: s.input.moveZ, stage: s.planet.player.stage, burn: s.planet.player.recoveryBurn };
    });
    log(`recovery diag @0.7s: r=${diag.r.toFixed(0)} rot=${diag.rot.toFixed(2)} vel=(${diag.vx.toFixed(1)},${diag.vz.toFixed(1)}) boost=${diag.boost} move=(${diag.moveX},${diag.moveZ}) stage=${diag.stage} assist=${diag.burn}`);
    const escape = await page.evaluate(async () => {
      const SF = window.SF, state = SF.state;
      const t0 = performance.now();
      return await new Promise((resolve) => {
        const iv = setInterval(() => {
          const p = state.entities.get(state.playerId);
          const { centre } = window.__pq013;
          const r = Math.hypot(p.pos.x - centre.x, p.pos.z - centre.z);
          const rec = state.planet.player;
          if (r > 1080 || rec.stage === null || rec.stage === 'skim' || performance.now() - t0 > 14000) {
            clearInterval(iv);
            resolve({ r, stage: rec.stage, heat: rec.heat, burn: rec.recoveryBurn, burns: window.__pq013.recoveryEvents.length, alive: p.alive !== false, hull: p.hull });
          }
        }, 250);
      });
    });
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyS');
    log(`recovery: burned out to r=${escape.r.toFixed(0)}, stage=${escape.stage || 'clear(ed)'} heat=${escape.heat.toFixed(2)} hull=${escape.hull} recoveryBurn events=${escape.burns} — visible costly burn, no teleport`);
    await capture('08-recovery-out.png', 'the asymmetric out — burned free of the commit window');
    if (!escape.alive) issues.push({ type: 'recovery', text: 'player died during the scripted recovery beat' });
  } catch (err) {
    issues.push({ type: 'recovery', text: `recovery beat failed: ${err && err.message}` });
    log(`recovery beat FAILED: ${err && err.message} (classified; route continues)`);
  }

  // ---- 08 save / Continue mid-vertical --------------------------------------------------------
  await placeAt(950, { tangential: 50 });
  await page.waitForTimeout(600);
  const preSave = await page.evaluate(() => {
    const s = window.SF.state;
    const p = s.entities.get(s.playerId);
    window.SF.bus.emit('game:save', { slot: 'pq013route' });
    return { pos: { x: p.pos.x, z: p.pos.z }, items: { ...s.player.cargo.items }, zoneId: s.planet.zoneId };
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => window.SF.bus.emit('game:load', { slot: 'pq013route' }));
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 30_000 });
  await page.waitForTimeout(2000);
  const postLoad = await page.evaluate(() => {
    const s = window.SF.state;
    const p = s.entities.get(s.playerId);
    return { pos: { x: p.pos.x, z: p.pos.z }, items: { ...s.player.cargo.items }, planetActive: !!(s.planet && s.planet.active), zoneId: s.planet && s.planet.zoneId, sector: s.world.currentSectorId };
  });
  const posDelta = Math.hypot(postLoad.pos.x - preSave.pos.x, postLoad.pos.z - preSave.pos.z);
  const cargoKept = (postLoad.items.cmdty_gas_hydrogen || 0) >= (preSave.items.cmdty_gas_hydrogen || 0);
  log(`save/Continue: pos delta ${posDelta.toFixed(1)} wu; cargo kept=${cargoKept} (H2 ${preSave.items.cmdty_gas_hydrogen || 0} -> ${postLoad.items.cmdty_gas_hydrogen || 0}); planet re-registered=${postLoad.planetActive} SAME zone=${postLoad.zoneId === preSave.zoneId} sector=${postLoad.sector}`);
  await capture('09-continue-midvertical.png', 'after save/Continue — same place, same identity, cargo kept');
  if (!postLoad.planetActive || postLoad.zoneId !== preSave.zoneId) issues.push({ type: 'save', text: 'identity did not survive save/Continue' });
  if (posDelta > 200) issues.push({ type: 'save', text: `position drifted ${posDelta.toFixed(0)} wu across save/Continue` });

  // ---- 09 depart ------------------------------------------------------------------------------
  await placeAt(3000, {});
  await page.waitForTimeout(1500);
  const depart = await page.evaluate(() => {
    const s = window.SF.state;
    return { region: s.planet.player.region, pill: (document.querySelector('.sf-planet-pill') || {}).style.display };
  });
  log(`depart: region=${depart.region}; band pill display=${depart.pill} (contextual instrument faded)`);
  await capture('10-depart.png', 'return/depart — the world recedes, the instruments fade');

  const report = {
    packet: 'PQ-013 route', ok: issues.length === 0, capturedAt: new Date().toISOString(),
    baseUrl: ownedServer.baseUrl, headed: HEADED, routeLog, captures, issues,
  };
  await writeFile(path.join(OUT, 'route-report.json'), JSON.stringify(report, null, 2));
  console.log(`[route] ${captures.length} captures, ${issues.length} issues`);
  if (issues.length) { console.error('[route] ISSUES:', JSON.stringify(issues, null, 2)); process.exitCode = 1; }
  else console.log('ROUTE_CAPTURE_OK');
} finally {
  await browser.close();
  if (ownedServer && typeof ownedServer.close === 'function') await ownedServer.close();
}

// Place the player on the ring at radius r (camera-relative south side), optionally with
// tangential velocity (capture-rig framing; the sim's own physics does everything else).
async function placeAt(r, { tangential = 0, face = false, keepHeat = false } = {}) {
  await page.evaluate(({ r, tangential, face }) => {
    const SF = window.SF, state = SF.state;
    const { up, centre } = window.__pq013;
    const p = state.entities.get(state.playerId);
    p.pos.x = centre.x - up.x * r;
    p.pos.z = centre.z - up.z * r;
    if (tangential > 0) {
      const tX = -up.z, tZ = up.x;
      p.vel.x = tX * tangential; p.vel.z = tZ * tangential;
      p.rot = Math.atan2(p.vel.z, p.vel.x);
    } else {
      p.vel.x = 0; p.vel.z = 0;
      if (face) p.rot = Math.atan2(up.z, up.x);
    }
  }, { r, tangential, face, keepHeat });
}

async function setAccessibility(motionReduce, flashReduce) {
  await page.evaluate(({ motionReduce, flashReduce }) => {
    const s = window.SF.state.settings;
    s.video = s.video || {}; s.accessibility = s.accessibility || {};
    s.video.motionReduce = !!motionReduce;
    s.video.flashReduce = !!flashReduce;
    s.accessibility.flashReduce = !!flashReduce;
  }, { motionReduce, flashReduce });
}

async function capture(file, scenario) {
  const fullPath = path.join(OUT, file);
  await page.screenshot({ path: fullPath, fullPage: false });
  const bytes = await readFile(fullPath);
  const gate = assertNotWhiteout(file, bytes);
  captures.push({ path: fullPath, sha256: createHash('sha256').update(bytes).digest('hex'), scenario, camera: 'default chase (zoom 72)', whitePct: gate.whitePct, midLumPct: gate.midLumPct });
}

function assertNotWhiteout(file, bytes) {
  const png = PNG.sync.read(bytes);
  const { width, height, data } = png;
  let whiteCount = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) whiteCount++;
  }
  const whitePct = whiteCount / (width * height);
  if (whitePct > 0.02) { console.error(`WHITEOUT_FAIL ${file} ${(whitePct * 100).toFixed(4)}%`); process.exit(1); }
  const minX = Math.floor(width * 0.2), maxX = Math.floor(width * 0.8);
  const minY = Math.floor(height * 0.2), maxY = Math.floor(height * 0.8);
  let midLumCount = 0;
  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      const idx = (y * width + x) * 4;
      const lum = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
      if (lum >= 40 && lum <= 200) midLumCount++;
    }
  }
  const midLumPct = midLumCount / ((maxX - minX) * (maxY - minY));
  if (midLumPct < 0.01) { console.error(`STRUCTURE_FAIL ${file} ${(midLumPct * 100).toFixed(4)}%`); process.exit(1); }
  console.log(`[assertNotWhiteout] ${file}: white=${(whitePct * 100).toFixed(3)}% midLum=${(midLumPct * 100).toFixed(2)}% PASS`);
  return { whitePct, midLumPct };
}

async function dismissTutorial(targetPage) {
  await targetPage.evaluate(() => {
    for (const sel of ['.tutorial-overlay', '[data-screen="tutorial"]', '.sf-tutorial']) {
      const root = document.querySelector(sel);
      const btn = root && [...root.querySelectorAll('button')].find((n) => /skip|dismiss|close|got it|begin/i.test(n.textContent || ''));
      if (btn) btn.click();
    }
    const anyBegin = [...document.querySelectorAll('button')].find((n) => /begin/i.test(n.textContent || ''));
    if (anyBegin) anyBegin.click();
  });
}

function findSystemBrowser() {
  return [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find((c) => existsSync(c)) || null;
}
