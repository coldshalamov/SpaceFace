// Hit-answer audit (PQ-210.04): on the real Crucible route, seed 4242, default kit, every hit the
// player lands must answer on four channels within 100 ms of contact (6 ticks at 60 Hz):
//   hit-stop — feel._applyKineticCrunch runs for the receipt (hsDur>0 dips also hit timeEffects)
//   light    — vfx._weaponPresenter.handleHit admits a WeaponLightPool slot
//   mass     — combat:hitstunImpulse publishes for the victim with deltaV>0
//   sound    — audio.play() is invoked for the layer cue (page is unmuted by default and
//              __SF_CAPTURE_AUDIO opts the webdriver-mute out so the request is real)
//
//   node scripts/probe-hit-answer.mjs              (headed, ~30 s)
//   node scripts/probe-hit-answer.mjs --headless
//   SPACEFACE_HIT_ANSWER_MS=45000 node scripts/probe-hit-answer.mjs
//
// The instrument only observes: it wraps render-side seams and bus receipts, never mutates the sim.
// Firing uses public controls — G (auto-target) plus held LMB, exactly the default-kit route.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SAMPLE_MS = Math.max(10_000, Number(process.env.SPACEFACE_HIT_ANSWER_MS || 30_000));
const HEADLESS = process.argv.includes('--headless');
const MAX_ANSWER_TICKS = 6; // 100 ms at 60 Hz
// The audited weapons are the fitted guns of CRUCIBLE_DEFAULT_STARTER_ID (ricochet_runner), not a
// frozen list — the starter loadout moved to bank_stream when the ricochet kit became the default.
const DEFAULT_KIT = ['wpn_bank_stream_m', 'wpn_concussion_cannon_m'];
const { chromium } = await loadPlaywright();

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, timeoutMs = 30_000) {
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

const port = await freePort();
const server = spawn(process.execPath, ['server.js', String(port)], {
  cwd: ROOT,
  stdio: 'ignore',
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' },
});
let browser = null;
const consoleErrors = [];
try {
  const baseUrl = `http://127.0.0.1:${port}/`;
  await waitForServer(baseUrl);
  browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--window-size=1600,900',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (error) => consoleErrors.push(`[pageerror] ${String(error).slice(0, 300)}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[console.error] ${msg.text().slice(0, 300)}`);
  });
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('sf.cinematicSeen', '1');
      // The headed fight-tape opt-in: Playwright's navigator.webdriver otherwise force-mutes
      // audio regardless of settings, and this audit must see play() actually run.
      window.__SF_CAPTURE_AUDIO = true;
      // No profile write: the default-route settings path (fresh boot -> migrations) is the thing
      // under audit. muted must resolve false on its own.
    } catch (_) { /* storage unavailable */ }
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 150_000 });

  // The Crucible button's own route: default starter kit (ricochet_runner), fixed seed 4242.
  const launched = await page.evaluate(async () => {
    const launch = await import('/src/ui/crucibleLaunch.js');
    const setup = launch.crucibleSetupFor({ seed: 4242 });
    if (!setup || !setup.ok) return false;
    return launch.requestCrucibleRun(window.SF.bus, setup.value, setup.ruleset) !== false;
  });
  if (!launched) throw new Error('Crucible run did not launch');
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    return state && state.mode === 'flight'
      && Number.isFinite(state.render && state.render.firstPlayableFrameAt);
  }, null, { timeout: 180_000 });

  const settingsCheck = await page.evaluate(() => {
    const audio = window.SF.state.settings && window.SF.state.settings.audio || {};
    return { muted: audio.muted, version: audio.defaultMuteVersion };
  });

  await page.evaluate(() => {
    const SF = window.SF;
    const state = SF.state;
    const record = {
      damage: [],       // combat:damage where the player is the attacker
      hitstun: [],      // combat:hitstunImpulse
      lights: [],       // presenter.handleHit observations {tick, weaponId, spawned}
      crunch: [],       // feel._applyKineticCrunch applications {tick, id, hsDur}
      dips: [],         // timeEffects.set('feel:hit-stop') {tick}
      sounds: [],       // audio.play invocations {tick, cueId}
      errors: [],
    };
    window.__SF_HIT_ANSWER__ = record;
    const tick = () => state.tick;

    SF.bus.on('combat:damage', (p) => {
      if (p && p.attackerId === state.playerId) {
        record.damage.push({
          tick: tick(), weaponId: p.weaponId || null, targetId: p.targetId,
          shieldHit: !!p.shieldHit, armorHit: !!p.armorHit, hullHit: !!p.hullHit,
          dominantLayer: p.dominantLayer || null,
        });
      }
    });
    SF.bus.on('combat:hitstunImpulse', (p) => {
      record.hitstun.push({
        tick: tick(), victimId: p.victimId, deltaV: p.deltaV,
        weaponId: p.provenance && p.provenance.weaponId || null,
      });
    });

    const feel = SF.registry && SF.registry.get('feel');
    if (feel && typeof feel._applyKineticCrunch === 'function') {
      const inner = feel._applyKineticCrunch.bind(feel);
      feel._applyKineticCrunch = (crunch, scales) => {
        record.crunch.push({ tick: tick(), id: crunch && crunch.id, hsDur: crunch && crunch.hsDur });
        return inner(crunch, scales);
      };
    } else {
      record.errors.push('feel._applyKineticCrunch not reachable');
    }
    if (feel && feel.timeEffects && typeof feel.timeEffects.set === 'function') {
      const set = feel.timeEffects.set.bind(feel.timeEffects);
      feel.timeEffects.set = (source, req) => {
        if (source === 'feel:hit-stop') record.dips.push({ tick: tick() });
        return set(source, req);
      };
    }

    const vfx = SF.registry && SF.registry.get('vfx');
    const presenter = vfx && vfx._weaponPresenter;
    if (presenter && typeof presenter.handleHit === 'function' && presenter.lights) {
      const inner = presenter.handleHit.bind(presenter);
      presenter.handleHit = (payload, hitShield) => {
        const before = presenter.lights.live;
        const out = inner(payload, hitShield);
        record.lights.push({
          tick: tick(),
          weaponId: payload && payload.weaponId || null,
          spawned: presenter.lights.live > before,
        });
        return out;
      };
    } else {
      record.errors.push('vfx._weaponPresenter not reachable');
    }

    const audio = SF.registry && SF.registry.get('audio');
    if (audio && typeof audio.play === 'function') {
      const inner = audio.play.bind(audio);
      audio.play = (cueId, opts) => {
        record.sounds.push({ tick: tick(), cueId });
        return inner(cueId, opts);
      };
    } else {
      record.errors.push('audio.play not reachable');
    }
  });

  // Drive with public controls: G latches auto-target on the nearest hostile; held LMB fires.
  await page.bringToFront();
  await page.keyboard.press('KeyG');
  const started = Date.now();
  await page.mouse.down();
  while (Date.now() - started < SAMPLE_MS) {
    // If the locked target died or drifted out, re-acquire the nearest hostile so the trigger
    // keeps producing hits; KeyG toggling is safe because autoFire only turns off when pressed
    // while already on — we instead nudge selection directly when the lock is empty.
    const needsTarget = await page.evaluate(() => {
      const s = window.SF.state;
      const sel = s.player && s.player.targetId;
      const e = sel != null && s.entities ? s.entities.get(sel) : null;
      if (e && e.alive !== false) return false;
      let best = null;
      let bestD = Infinity;
      const p = s.entities.get(s.playerId);
      for (const candidate of s.entities.values()) {
        if (!candidate || candidate.alive === false || candidate.type !== 'ship' || candidate.id === s.playerId) continue;
        if (!candidate.pos || !p || !p.pos) continue;
        const d = Math.hypot(candidate.pos.x - p.pos.x, candidate.pos.z - p.pos.z);
        if (d < bestD) { bestD = d; best = candidate; }
      }
      if (best) s.player.targetId = best.id; // UI-owned selection; legal direct write
      return !best;
    });
    if (needsTarget) await page.waitForTimeout(400); // between waves — nothing to shoot yet
    await page.waitForTimeout(300);
  }
  await page.mouse.up();

  const audit = await page.evaluate(() => window.__SF_HIT_ANSWER__);

  const byWeapon = new Map();
  for (const row of audit.damage) {
    if (!row.weaponId) continue;
    if (!byWeapon.has(row.weaponId)) byWeapon.set(row.weaponId, []);
    byWeapon.get(row.weaponId).push(row);
  }

  const within = (list, tick, pred) => list.some((entry) => (
    Math.abs(entry.tick - tick) <= MAX_ANSWER_TICKS && (!pred || pred(entry))
  ));

  const lines = [];
  let allPass = true;
  for (const id of DEFAULT_KIT) {
    const hits = byWeapon.get(id) || [];
    if (hits.length === 0) {
      lines.push(`  ${id}  NO HITS LANDED — channel coverage unproven`);
      allPass = false;
      continue;
    }
    const channels = {
      hitstop: hits.filter((h) => within(audit.crunch, h.tick)).length,
      light: hits.filter((h) => within(audit.lights, h.tick, (l) => l.weaponId === id && l.spawned)).length,
      mass: hits.filter((h) => within(audit.hitstun, h.tick, (s) => s.victimId === h.targetId)).length,
      sound: hits.filter((h) => within(audit.sounds, h.tick)).length,
    };
    const weaponPass = Object.values(channels).every((n) => n === hits.length);
    if (!weaponPass) allPass = false;
    lines.push(
      `  ${id}  ${hits.length} hit(s):`
      + `  hit-stop ${channels.hitstop}/${hits.length}`
      + `  light ${channels.light}/${hits.length}`
      + `  mass ${channels.mass}/${hits.length}`
      + `  sound ${channels.sound}/${hits.length}`
      + (weaponPass ? '  PASS' : '  FAIL'),
    );
  }

  const dips = audit.dips.length;
  const crunchHolds = audit.crunch.filter((c) => c.hsDur > 0).length;
  console.log('\nPQ-210.04 hit-answer audit — Crucible seed 4242, default kit');
  console.log(`  audio profile: muted=${settingsCheck.muted} defaultMuteVersion=${settingsCheck.version}`);
  console.log(`  receipts: ${audit.damage.length} player damage events, ${audit.hitstun.length} hitstun impulses,`
    + ` ${audit.lights.length} presenter hits, ${audit.crunch.length} crunch beats (${crunchHolds} with hold),`
    + ` ${dips} hit-stop dips, ${audit.sounds.length} play() calls`);
  for (const line of lines) console.log(line);
  if (audit.errors.length) console.log(`  instrument errors: ${audit.errors.join('; ')}`);
  if (consoleErrors.length) {
    console.log(`  page errors (${consoleErrors.length}):`);
    for (const e of consoleErrors.slice(0, 8)) console.log(`    ${e}`);
  }
  console.log(allPass && settingsCheck.muted === false
    ? 'RESULT: PASS — every landed default-kit hit answered on all four channels'
    : 'RESULT: FAIL');
} finally {
  if (browser) await browser.close();
  server.kill();
}
