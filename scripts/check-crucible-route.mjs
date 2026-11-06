// scripts/check-crucible-route.mjs — "can a person actually play a Crucible run?"
//
// WHY THIS EXISTS
// ---------------
// check:playable proves the game boots and that a person can fly. It says NOTHING about the
// Crucible: it never opens that door. Every Crucible slice can be green in node and still leave a
// player staring at an empty arena, because the node tests drive the phase machine by hand and
// never ask the real game to spawn anything.
//
// So this boots the REAL game in a real browser, clicks the REAL buttons, and asserts the route
// the player was promised:
//
// The Crucible has TWO rulesets behind one door, so this checks both:
//
//   node scripts/check-crucible-route.mjs              the Swarm ruleset (the default the button plays)
//   node scripts/check-crucible-route.mjs --gauntlet   the authored thirty-wave arc
//
//   MENU     the Crucible door is on the main menu
//   DOOR     it offers both modes, hulls and a seed
//   LAUNCH   entering starts a survival run in flight mode
//   ARSENAL  the chosen loadout is actually ON the hull (the research gate silently ate it before)
//   WAVE     live hostiles arrive, stamped as the run's, inside the spawn budget
//   CLEAR    killing them advances the phase — no phase inferred from entity counts
//   DRAFT    three cards appear and picking one puts a real weapon on the hull
//   WALLET   the run earns its own credits, and campaign credits never move
//   RESULTS  dying ends the run and names what killed you
//   RESTART  the same seed runs again and plans the same wave
//   CLEAN    no uncaught exception during any of it
//
// WHAT IT DOES NOT PROVE: that the fight is fun, that the AI fights well, or that a human can
// survive ten waves. Enemies die to a scripted lethal projectile:hit rather than to a shot the
// player aimed, because a headless dogfight is not something a check can win — but it IS the real
// damage route, so combat publishes its real kill receipt and the rewards that follow are real.
//
//   node scripts/check-crucible-route.mjs
//   node scripts/check-crucible-route.mjs --verbose
//   node scripts/check-crucible-route.mjs --headed --starter=veil_step
//   node scripts/check-crucible-route.mjs --headed   a real visible window on the native GPU —
//                                                  distinguishes native-GPU evidence from
//                                                  software-GL evidence when a headless run
//                                                  stalls; the exact cause still needs a
//                                                  diagnostic, not this flag alone
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { collectPageIssues } from './lib/browser-issues.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VERBOSE = process.argv.includes('--verbose');
// --headed runs the real windowed browser on the host GPU with backgrounding disabled; default
// stays headless for CI. Headed distinguishes native-GPU evidence from software-GL evidence —
// a headed failure is not itself proof of a production defect; the exact cause still needs a
// diagnostic to separate a real stall from a slow render environment.
const HEADED = process.argv.includes('--headed');
const SEED = 4242;
const STARTER_OVERRIDE = process.argv.find((arg) => arg.startsWith('--starter='))?.slice('--starter='.length) || null;
const STARTER_ID = STARTER_OVERRIDE || 'ricochet_runner';
const VEIL_STEP_ROUTE = STARTER_ID === 'veil_step';
// --full walks to round 10 extraction in Swarm, or the complete 30-wave Gauntlet victory.
const FULL = process.argv.includes('--full');
// Which ruleset to walk. Swarm is the default because it is what the main-menu button plays.
const GAUNTLET = process.argv.includes('--gauntlet');
const MODE = GAUNTLET ? 'scored' : 'swarm';
// The door's launch word belongs to step two (Ship & kit) and is the ruleset's own voice:
// the swarm's verb opens the armory, the arc's enters it.
const MODE_VERB = GAUNTLET ? 'Enter the Gauntlet' : 'Open armory';
const pw = await loadPlaywright();
const { chromium } = pw;

const results = [];
let server = null;
let browser = null;

function record(label, ok, detail) {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(9)} ${detail}`);
}

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

async function startServer() {
  const port = await findFreePort(8440);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true,
    // An unset store env mounts the real shared save drawer — browser checks run isolated.
    env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' },
  });
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error('dev server exited before it was reachable');
    try { if ((await fetch(url)).ok) return { baseUrl: url, kill: () => child.kill() }; } catch (_) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error('dev server never became reachable');
}

async function clickButton(page, label) {
  return page.evaluate((wanted) => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const all = [...document.querySelectorAll('#screens button')];
    const b = all.find((x) => norm(x.textContent) === norm(wanted))
      || all.find((x) => norm(x.textContent).includes(norm(wanted)));
    if (!b || b.disabled) return false;
    b.click();
    return true;
  }, label);
}

/** Public-input Crucible exercise for the fitted Veil Step starter. */
async function exerciseVeilStep(page) {
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box || box.width < 1 || box.height < 1) {
    return { ok: false, detail: 'no visible authored world canvas for pointer aim' };
  }
  // Let the ordinary pointer preview establish a valid public aim before taking the baseline.
  await page.mouse.move(box.x + box.width * 0.78, box.y + box.height * 0.48);
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state.playerId);
    const readiness = state?.render?.authoredVisualReadiness?.()
      || window.SF?.authoredVisualReadiness?.();
    const authoredPlayer = player?.mesh?.userData?.authoredAssetState;
    const playerMeshAuthored = ['authored', 'authored-prepared', 'authored-with-cleanup-error']
      .includes(authoredPlayer);
    const hero = document.querySelector('.sf-crun__hero');
    return state?.mode === 'flight' && state?.run?.phase === 'active'
      && readiness?.ready === true && player?.mesh?.visible !== false && playerMeshAuthored
      && Number(state?.render?.worldSubmittedFrames) > 0
      && !!hero && !hero.hidden && hero.dataset.state === 'armed'
      && /VEIL STEP/i.test(hero.textContent) && /ready/i.test(hero.textContent);
  }, null, { timeout: 10000 });
  const before = await page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state.playerId);
    const readiness = state?.render?.authoredVisualReadiness?.()
      || window.SF?.authoredVisualReadiness?.();
    let loop = null;
    try { loop = window.SF?.loop?.getDiagnostics?.() || null; } catch (_) { /* diagnostic only */ }
    const hero = document.querySelector('.sf-crun__hero');
    const canvas = [...document.querySelectorAll('canvas')].find((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== 'hidden';
    });
    return {
      playerId: state?.playerId ?? null,
      mode: state?.mode ?? null,
      runPhase: state?.run?.phase ?? null,
      authoredReadiness: readiness?.ready === true,
      playerAssetState: player?.mesh?.userData?.authoredAssetState || null,
      playerMeshVisible: player?.mesh?.visible === true,
      worldSubmittedFrames: Number(state?.render?.worldSubmittedFrames) || 0,
      fitted: state?.player?.ownedShips?.[state?.player?.activeShipIndex || 0]?.fittings?.includes('mod_veil_step') === true,
      pos: player?.pos ? { x: player.pos.x, z: player.pos.z } : null,
      energy: Number.isFinite(player?.boost?.energy) ? player.boost.energy : null,
      simTime: Number.isFinite(state?.simTime) ? state.simTime : null,
      heroVisible: !!hero && !hero.hidden && getComputedStyle(hero).display !== 'none',
      heroText: hero?.textContent?.trim() || '',
      canvasVisible: !!canvas,
      displayHz: Number(state?.render?.displayHz) || null,
      renderFrameCap: Number.isFinite(state?.render?.frameCap) ? state.render.frameCap : null,
      videoVsync: typeof state?.video?.vsync === 'boolean' ? state.video.vsync : null,
      videoFrameCap: Number.isFinite(state?.video?.frameCap) ? state.video.frameCap : null,
      frameCapSkips: Number.isFinite(loop?.frameCapSkips) ? loop.frameCapSkips : null,
      liveWorldBodies: state?.entityList?.filter((entity) => entity.alive
        && entity.data?.runCohort === 'survival'
        && ['ship', 'drone', 'mine', 'station', 'massSeed', 'payload'].includes(entity.type)).length || 0,
    };
  });
  if (before.mode !== 'flight' || before.runPhase !== 'active' || !before.authoredReadiness
    || !before.playerMeshVisible || !before.playerAssetState?.startsWith('authored')
    || before.worldSubmittedFrames < 1 || !before.fitted
    || !before.pos || before.energy == null || before.simTime == null || !before.heroVisible
    || !before.canvasVisible || before.liveWorldBodies < 1) {
    return { ok: false, detail: `Veil Step public flight is not ready: ${JSON.stringify(before)}` };
  }

  let inputReleased = false;
  const releaseShift = async () => {
    await page.keyboard.up('Shift');
    inputReleased = true;
  };
  let observerInstalled = false;
  try {
    // Pointer aim is the same public helm input used in flight; choose clear space to the right
    // and wait above for the visible Veil cue to say that the preview has a valid landing.
    await page.evaluate(() => {
      const state = window.SF.state;
      const proof = { playerId: state.playerId, receipt: null, off: null };
      proof.off = window.SF.bus.on('ship:phaseBlink', (payload) => {
        if (!payload || payload.shipId !== proof.playerId) return;
        const player = window.SF.state.entities.get(proof.playerId);
        proof.receipt = {
          shipId: payload.shipId,
          from: payload.from && { x: payload.from.x, z: payload.from.z },
          to: payload.to && { x: payload.to.x, z: payload.to.z },
          dist: payload.dist,
          playerPos: player?.pos ? { x: player.pos.x, z: player.pos.z } : null,
          energy: Number.isFinite(player?.boost?.energy) ? player.boost.energy : null,
          simTime: Number.isFinite(window.SF.state.simTime) ? window.SF.state.simTime : null,
        };
      });
      window.__sfVeilStepRouteProof = proof;
    });
    observerInstalled = true;
    await page.keyboard.down('Shift');
    try {
      await page.waitForFunction(() => {
        const hero = document.querySelector('.sf-crun__hero');
        return !!hero && !hero.hidden && hero.dataset.state === 'armed'
          && /VEIL STEP/i.test(hero.textContent) && /release to step/i.test(hero.textContent);
      }, null, { timeout: 8000 });
    } finally {
      await releaseShift();
    }
    await page.waitForFunction(() => !!window.__sfVeilStepRouteProof?.receipt,
      null, { timeout: 8000 });
    const receipt = await page.evaluate(() => window.__sfVeilStepRouteProof.receipt);
    const moved = receipt?.from && receipt?.to
      ? Math.hypot(receipt.to.x - receipt.from.x, receipt.to.z - receipt.from.z) : 0;
    const poseDelta = receipt?.playerPos && before.pos
      ? Math.hypot(receipt.playerPos.x - before.pos.x, receipt.playerPos.z - before.pos.z) : 0;
    const destinationError = receipt?.playerPos && receipt?.to
      ? Math.hypot(receipt.playerPos.x - receipt.to.x, receipt.playerPos.z - receipt.to.z) : Infinity;
    // The worker-delivered event can arrive after the next ordinary movement tick. Require the
    // live player pose to have made the authored jump and remain within 1 WU of its destination;
    // exact equality would mistake normal post-commit drift for a failed teleport.
    const poseMatches = poseDelta >= 20 && destinationError <= 1;
    const physicalCommit = receipt?.shipId === before.playerId && moved >= 20
      && Number.isFinite(receipt.dist) && receipt.dist >= 20 && poseMatches
      && Number.isFinite(receipt.energy) && receipt.energy < before.energy;
    if (!physicalCommit || !Number.isFinite(receipt.simTime)) {
      return { ok: false, detail: `Veil Step receipt did not match a physical commit: ${JSON.stringify({ before, receipt, moved, poseDelta, destinationError, poseMatches })}` };
    }

    await page.waitForFunction(() => {
      const hero = document.querySelector('.sf-crun__hero');
      return !!hero && !hero.hidden && hero.dataset.state === 'blocked'
        && /phase recharging|cooling/i.test(hero.textContent);
    }, null, { timeout: 8000 });
    await page.waitForFunction(() => {
      const hero = document.querySelector('.sf-crun__hero');
      return !!hero && !hero.hidden && hero.dataset.state === 'armed'
        && /ready/i.test(hero.textContent);
    }, null, { timeout: 15000 });
    const recovered = await page.evaluate((at) => {
      const hero = document.querySelector('.sf-crun__hero');
      const state = window.SF.state;
      return {
        simElapsed: state.simTime - at,
        heroText: hero?.textContent?.trim() || '',
        heroState: hero?.dataset.state || null,
        mode: state.mode,
        runPhase: state.run?.phase,
        canvasVisible: [...document.querySelectorAll('canvas')].some((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== 'hidden';
        }),
      };
    }, receipt.simTime);
    const ok = recovered.simElapsed >= 1.05 && recovered.heroState === 'armed'
      && /ready/i.test(recovered.heroText) && recovered.mode === 'flight'
      && recovered.runPhase === 'active' && recovered.canvasVisible;
    const renderContext = JSON.stringify({
      displayHz: before.displayHz,
      renderFrameCap: before.renderFrameCap,
      videoVsync: before.videoVsync,
      videoFrameCap: before.videoFrameCap,
      frameCapSkips: before.frameCapSkips,
    });
    return { ok, detail: `public Shift release moved ${moved.toFixed(1)} WU; capacitor ${before.energy.toFixed(1)}→${receipt.energy.toFixed(1)}; cooldown recovery ${recovered.simElapsed.toFixed(2)} sim s · ${recovered.heroText}; render context ${renderContext}` };
  } catch (error) {
    return { ok: false, detail: `public Veil Step input failed: ${error?.message || error}` };
  } finally {
    let keyReleaseError = null;
    if (!inputReleased) {
      // A failed first keyup is an actor failure, not evidence that the input was released.
      // Retry once in cleanup and preserve a second failure as a route error.
      try { await releaseShift(); } catch (error) { keyReleaseError = error; }
    }
    if (observerInstalled) await page.evaluate(() => {
      const proof = window.__sfVeilStepRouteProof;
      if (typeof proof?.off === 'function') proof.off();
      delete window.__sfVeilStepRouteProof;
    }).catch(() => {});
    if (keyReleaseError) throw new Error(`Shift keyup failed during cleanup: ${keyReleaseError?.message || keyReleaseError}`);
  }
}

// Cohort membership alone does not mean "killable": since e01a87854 a Crucible kill leaves the
// victim's WRECK on the field, and the wreck carries the same `runCohort: 'survival'` tag so the
// arena census and Massline eligibility still read it as a body of this run. Wrecks are alive,
// tagged, and forever — a filter that does not exclude them re-targets the same undamageable
// bodies every pass and reports them as survivors. The hostile census is cohort bodies the damage
// router would actually accept — the type list mirrors its `damage` verb membership.

/**
 * Kill every live hostile this wave admitted, through the REAL damage route.
 *
 * The console `entity:kill` seam would be simpler, but it only flips `alive` — it never reaches
 * combat.kill(), so no entity:killed receipt is published and no reward, chip or score would
 * follow. That would have made this check pass while a player earned nothing. A lethal
 * projectile:hit is the same event a fired shot produces.
 */
async function killWaveCohort(page) {
  return page.evaluate(() => {
    const st = window.SF.state;
    const targets = st.entityList.filter((e) => e.alive && e.data && e.data.runCohort === 'survival'
      && ['ship', 'drone', 'mine', 'station', 'massSeed', 'payload'].includes(e.type));
    for (const target of targets) {
      const lethal = (target.hull || 0) + (target.shield || 0) + (target.armorHp || 0) + 9999;
      window.SF.bus.emit('projectile:hit', {
        targetId: target.id,
        ownerId: st.playerId,
        damage: lethal,
        damageType: 'kinetic',
        pos: { x: target.pos.x, z: target.pos.z },
        approach: { x: 1, z: 0 },
        normal: { x: -1, z: 0 },
        weaponId: 'wpn_concussion_cannon_m',
      });
    }
    return targets.length;
  });
}

/**
 * Kill N live cohort bodies through the same real damage route, so the check clears at a rate a
 * player could plausibly manage. Vaporising the whole room at once would out-pace the swarm
 * reinforcement stream and then report the emptiness it caused as a defect. Returns the phase and
 * simTime beside the kill count: one round-trip a pass keeps the check's own CDP traffic off the
 * starved main thread, and the sim clock is how a frozen fight is told apart from a slow one.
 */
async function killSome(page, n) {
  return page.evaluate((want) => {
    const st = window.SF.state;
    const phase = st.run && st.run.phase;
    let killed = 0;
    if (phase === 'active') {
      const targets = st.entityList
        .filter((e) => e.alive && e.data && e.data.runCohort === 'survival'
          && ['ship', 'drone', 'mine', 'station', 'massSeed', 'payload'].includes(e.type))
        .slice(0, want);
      for (const target of targets) {
        const lethal = (target.hull || 0) + (target.shield || 0) + (target.armorHp || 0) + 9999;
        window.SF.bus.emit('projectile:hit', {
          targetId: target.id,
          ownerId: st.playerId,
          damage: lethal,
          damageType: 'kinetic',
          pos: { x: target.pos.x, z: target.pos.z },
          approach: { x: 1, z: 0 },
          normal: { x: -1, z: 0 },
          weaponId: 'wpn_concussion_cannon_m',
        });
      }
      killed = targets.length;
    }
    return { killed, phase, simTime: st.simTime };
  }, n);
}

async function waitForPhase(page, phase, timeout = 30000) {
  // Sim-state readiness, not visible pixels: poll on an interval so a stalled rAF cadence
  // cannot keep an already-true predicate unevaluated.
  await page.waitForFunction(
    (want) => window.SF.state.run && window.SF.state.run.phase === want,
    phase,
    { timeout, polling: 100 },
  );
}

/**
 * Swarm's opening stop is the armory, not the arena: the run enters `draft` at wave 0 and waits
 * on the player's "Launch round N". Click through the real control — the warm hold can leave the
 * key disabled for a breath while the next wave's program batch links (KNOWN D24/D38/D44), so
 * wait for it to arm rather than racing the click.
 */
async function launchArmoryRound(page, round) {
  const label = `Launch round ${round}`;
  try {
    await page.waitForFunction(
      () => window.SF.ctx.screenManager.top() === 'crucibleDraft'
        && window.SF.state.run && window.SF.state.run.phase === 'draft',
      null, { timeout: 60000 });
    await page.waitForFunction((wanted) => {
      const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
      const b = [...document.querySelectorAll('#screens button')]
        .find((x) => norm(x.textContent).includes(norm(wanted)));
      return !!b && !b.disabled;
    }, label, { timeout: 30000 });
  } catch (err) {
    // A timeout that only says "waitForFunction" cannot tell a real stall from a relabelled
    // key or a draft that resolved early — dump what the armory is actually showing.
    const diag = await page.evaluate(() => ({
      top: window.SF.ctx.screenManager.top(),
      phase: window.SF.state.run && window.SF.state.run.phase,
      wave: window.SF.state.run && window.SF.state.run.wave,
      warmPending: !!(window.SF.state.render && window.SF.state.render.swarmDeferredWarm
        && window.SF.state.render.swarmDeferredWarm.pending),
      buttons: [...document.querySelectorAll('#screens button')]
        .map((b) => b.textContent.replace(/\s+/g, ' ').trim() + (b.disabled ? ' [disabled]' : '')),
    })).catch(() => null);
    throw new Error(`armory round ${round} wait failed: ${err && err.message} · now ${JSON.stringify(diag)}`);
  }
  if (!(await clickButton(page, label))) throw new Error(`"${label}" did not click`);
}

async function main() {
  if (STARTER_OVERRIDE && STARTER_OVERRIDE !== 'veil_step') {
    throw new Error(`unsupported --starter=${STARTER_OVERRIDE}; supported override: veil_step`);
  }
  if (VEIL_STEP_ROUTE && !HEADED) {
    throw new Error('--starter=veil_step requires --headed so the public flight and aim are visible');
  }
  server = await startServer();
  browser = await chromium.launch({
    headless: !HEADED,
    args: HEADED
      ? ['--disable-renderer-backgrounding', '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows']
      : [],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

  // Shared issue ledger: it already knows the optional unmounted player-store 404, generic
  // resource-load console twins of HTTP responses, and expected-navigation aborts — CLEAN reads
  // errorIssues() below rather than a raw pageerror/console bag.
  const pageIssues = collectPageIssues(page, { playerStoreMounted: false });
  let loggedErrors = 0;
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (VERBOSE && loggedErrors++ < 5) console.log('  browser error:', msg.text());
  });

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-screen="mainMenu"]');
    return el && getComputedStyle(el).display !== 'none';
  }, null, { timeout: 60000 });

  // ── MENU ────────────────────────────────────────────────────────────────────────────────────
  const menuButtons = await page.evaluate(
    () => [...document.querySelectorAll('#screens button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
  );
  record('MENU', menuButtons.includes('Crucible'), `main menu offers: ${menuButtons.join(' / ')}`);

  // ── DOOR ────────────────────────────────────────────────────────────────────────────────────
  // Menu buttons stay disabled until their screen module finishes its dynamic import (the same
  // pattern New Game uses). Wait for it rather than racing it.
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('#screens button')]
      .find((x) => x.textContent.replace(/\s+/g, ' ').trim() === 'Crucible');
    return !!b && !b.disabled;
  }, null, { timeout: 30000 });
  if (!(await clickButton(page, 'Crucible'))) throw new Error('Crucible button did not click');
  await page.waitForTimeout(400);
  const door = await page.evaluate(() => ({
    top: window.SF.ctx.screenManager.top(),
    hulls: [...document.querySelectorAll('#screens .sf-crd-hull')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
    modes: [...document.querySelectorAll('#screens .sf-crd-mode')].map((b) => ({
      ruleset: b.dataset.ruleset,
      pressed: b.getAttribute('aria-pressed') === 'true',
    })),
    seed: (document.querySelector('#screens .sf-crd-seed input') || {}).value,
  }));
  // Swarm must be the DEFAULT selection: the owner judges the Crucible from the main menu, and a
  // swarm game hidden behind a second click is a swarm game nobody plays.
  const defaultMode = (door.modes.find((m) => m.pressed) || {}).ruleset;
  record('DOOR',
    door.top === 'crucible' && door.hulls.length >= 2 && !!door.seed
      && door.modes.length === 2 && defaultMode === 'swarm',
    `${door.hulls.length} hulls, modes ${door.modes.map((m) => m.ruleset).join('/')} `
    + `(default ${defaultMode}), seed field present`);

  // Select the ruleset under test.
  await page.evaluate((want) => {
    const card = [...document.querySelectorAll('#screens .sf-crd-mode')]
      .find((b) => b.dataset.ruleset === want);
    if (card) card.click();
  }, MODE);
  await page.waitForTimeout(150);

  // ── LAUNCH ──────────────────────────────────────────────────────────────────────────────────
  // The door is a two-step preparation (Encounter, then Ship & kit): the hull cards and the
  // launch word live on step two, so a player clicks through "Choose ship & kit" first. The seed
  // field sits in the step-one disclosure; writing it stays valid either way.
  if (!(await clickButton(page, 'Choose ship & kit'))) {
    throw new Error('door continue control ("Choose ship & kit →") did not click');
  }
  await page.evaluate(({ seed, starterId }) => {
    const wanted = starterId;
    const hull = wanted
      ? [...document.querySelectorAll('#screens .sf-crd-hull')]
        .find((b) => b.dataset.starterId === wanted && !b.disabled)
      : [...document.querySelectorAll('#screens .sf-crd-hull')]
        .find((b) => b.textContent.includes('Ricochet Runner'))
        || document.querySelector('#screens .sf-crd-hull');
    if (!hull || hull.disabled || hull.getBoundingClientRect().width <= 0) {
      throw new Error(`public starter card not selectable: ${wanted || 'ricochet_runner'}`);
    }
    hull.click();
    document.querySelector('#screens .sf-crd-seed input').value = String(seed);
  }, { seed: SEED, starterId: STARTER_OVERRIDE });
  if (!(await clickButton(page, MODE_VERB))) throw new Error(`"${MODE_VERB}" did not click`);

  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 90000 });
  // Swarm launches into its armory (phase `draft`, wave 0) and waits on "Launch round 1";
  // the Gauntlet's opening phases run themselves straight to active.
  if (!GAUNTLET) await launchArmoryRound(page, 1);
  await waitForPhase(page, 'active', 60000);
  const launched = await page.evaluate(() => {
    const st = window.SF.state;
    return {
      mode: st.mode, kind: st.run.kind, phase: st.run.phase, wave: st.run.wave,
      seed: st.run.seed, arenaId: st.run.arenaId, ruleset: st.run.ruleset,
      sector: st.world && st.world.currentSectorId,
    };
  });
  record('LAUNCH',
    launched.mode === 'flight' && launched.kind === 'survival' && launched.wave === 1
      && launched.seed === SEED && launched.ruleset === MODE,
    `${launched.arenaId} · ${launched.ruleset} · wave ${launched.wave} · seed ${launched.seed} `
    + `· mode ${launched.mode}`);

  // ── ARSENAL ─────────────────────────────────────────────────────────────────────────────────
  const arsenal = await page.evaluate(() => {
    const p = window.SF.state.player;
    const owned = p.ownedShips[p.activeShipIndex];
    return {
      hullId: owned && owned.defId,
      fitted: (owned && owned.fittings || []).filter(Boolean),
      researched: (p.researchedNodes || []).length,
    };
  });
  record('ARSENAL', arsenal.fitted.length >= 1
    && (!VEIL_STEP_ROUTE || arsenal.fitted.includes('mod_veil_step')),
    `${arsenal.hullId} carries ${arsenal.fitted.length} fitted: ${arsenal.fitted.join(', ') || '(nothing)'}`);

  // ── WAVE ────────────────────────────────────────────────────────────────────────────────────
  await page.waitForFunction(
    () => window.SF.state.entityList.some((e) => e.alive && e.data && e.data.runCohort === 'survival'
        && ['ship', 'drone', 'mine', 'station', 'massSeed', 'payload'].includes(e.type)),
    null, { timeout: 30000 },
  );
  const wave = await page.evaluate(() => {
    const st = window.SF.state;
    const cohort = st.entityList.filter((e) => e.alive && e.data && e.data.runCohort === 'survival'
        && ['ship', 'drone', 'mine', 'station', 'massSeed', 'payload'].includes(e.type));
    return {
      count: cohort.length,
      ids: [...new Set(cohort.map((e) => e.data.lootTableId))],
      hull: cohort[0] && cohort[0].hull,
      admitted: st.run && st.run.spawnedThreat,
      planned: st.run && st.run.threatBudget,
    };
  });
  record('WAVE', wave.count > 0 && wave.hull > 0
    && Number.isFinite(wave.admitted) && Number.isFinite(wave.planned) && wave.admitted <= wave.planned,
    `${wave.count} live hostiles (${wave.ids.join(', ')}), admitted ${wave.admitted}/${wave.planned}`);

  // ── HUD ─────────────────────────────────────────────────────────────────────────────────────
  // Everything above can be true while the player still sees nothing. This asks what is on glass.
  const hud = await page.evaluate(() => {
    const root = document.querySelector('.sf-crun');
    if (!root) return { present: false };
    const cs = getComputedStyle(root);
    const text = (sel) => { const n = root.querySelector(sel); return n ? n.textContent.trim() : null; };
    return {
      present: true,
      visible: !root.hidden && cs.display !== 'none' && cs.visibility !== 'hidden',
      host: root.parentElement && root.parentElement.className,
      label: text('.sf-crun__label'),
      wave: text('.sf-crun__wave'),
      phase: text('.sf-crun__phase'),
      figs: [...root.querySelectorAll('.sf-crun__fig')].map((n) => n.textContent.trim()),
      role: root.getAttribute('role'),
      // The 12px floor is a hard rule in the instrument grammar; measure it, do not trust it.
      minFontPx: Math.min(...[...root.querySelectorAll('*')]
        .map((n) => parseFloat(getComputedStyle(n).fontSize) || 99)
        .filter((v) => v < 99)),
    };
  });
  const waveTextOk = MODE === 'swarm'
    ? hud.wave === 'ROUND 01'
    : String(hud.wave).indexOf('WAVE 1 / 30') === 0;
  record('HUD',
    hud.present && hud.visible && waveTextOk
      && hud.phase === 'FIGHT' && hud.role === 'status' && hud.minFontPx >= 12,
    hud.present
      ? `"${hud.label}" · ${hud.wave} · ${hud.phase} · figures ${hud.figs.join(' ')} · `
        + `smallest text ${hud.minFontPx}px · hosted in .${hud.host}`
      : 'no run readout on screen at all');

  if (VEIL_STEP_ROUTE) {
    const veil = await exerciseVeilStep(page);
    record('VEIL', veil.ok, veil.detail);

    // The optional Veil route ends at its public ability/cooldown check. The legacy Crucible
    // smoke path below deliberately applies scripted lethal hits; they are useful fixture-level
    // phase/reward coverage, but they are not part of a player-input ability route.
    const errorTexts = pageIssues.errorIssues().map((issue) => issue.text);
    const noisy = errorTexts.filter((t) => !(
      /favicon|KHR_parallel_shader_compile|partsLibrary/i.test(t)
      || /opening submission pre-submit gate failed closed/i.test(t)
    ));
    record('CLEAN', noisy.length === 0, noisy.length ? noisy.slice(0, 3).join(' | ') : 'no uncaught errors');
    if (VERBOSE && errorTexts.length) console.log('  page messages:', errorTexts.slice(0, 20));
    return;
  }

  // ── CLEAR ───────────────────────────────────────────────────────────────────────────────────
  const campaignCreditsBefore = await page.evaluate(() => window.SF.state.player.credits);
  // Trace the chip economy for this wave so a shortfall is a reported number, not a mystery.
  await page.evaluate(() => {
    window.__chipTrace = { dropped: 0, droppedCredits: 0, killed: 0, spawned: 0 };
    // Remember cohort ids as they arrive. Asking `entities.get(id)` at kill time under-counts:
    // a body can already be out of the map by the time the receipt is delivered, and on a long
    // swarm walk that shortfall reads as "more chips dropped than kills happened" — a phantom
    // defect in the check, not in the economy.
    window.__cohortIds = new Set();
    window.SF.bus.on('entity:spawned', (p) => {
      const e = p && p.entity;
      if (e && e.data && e.data.runCohort === 'survival') window.__cohortIds.add(e.id);
    });
    for (const e of window.SF.state.entityList) {
      if (e && e.data && e.data.runCohort === 'survival') window.__cohortIds.add(e.id);
    }
    window.SF.bus.on('entity:killed', (p) => {
      if (p && window.__cohortIds.has(p.id)) window.__chipTrace.killed += 1;
    });
    window.SF.bus.on('loot:drop', (p) => {
      for (const item of (p && p.items) || []) {
        if (item && item.wallet === 'run') {
          window.__chipTrace.dropped += 1;
          window.__chipTrace.droppedCredits += Number(item.credits) || 0;
        }
      }
    });
    window.__chipTrace.spawnedIds = [];
    window.__chipTrace.awards = [];
    window.__chipTrace.collected = [];
    window.__chipTrace.destroyed = [];
    window.SF.bus.on('entity:spawned', (p) => {
      const e = p && p.entity;
      if (e && e.type === 'pickup' && e.data && e.data.wallet === 'run') {
        window.__chipTrace.spawned += 1;
        window.__chipTrace.spawnedIds.push(`${e.id}=${e.data.credits}cr/${e.data.amount}`);
      }
    });
    // NO wallet filter: physics' contact-collect payload has no wallet field, so filtering on it
    // hides exactly the collections a moving player produces.
    window.SF.bus.on('pickup:collected', (p) => {
      if (p && p.kind === 'credit_chip') {
        window.__chipTrace.collected.push(`${p.pickupId}:${p.amount}:${p.wallet || 'nowallet'}`);
      }
    });
    window.SF.bus.on('entity:destroyed', (p) => {
      if (p && window.__chipTrace.spawnedIds.includes(p.id)) window.__chipTrace.destroyed.push(p.id);
    });
    window.SF.bus.on('run:awardRequested', (p) => {
      if (p && p.credits > 0) window.__chipTrace.awards.push(p.credits + ':' + p.reason);
    });
  });
  let killed = 0;
  if (GAUNTLET) {
    killed = await killWaveCohort(page);
    await waitForPhase(page, 'cleanup', 30000);
    await waitForPhase(page, 'draft', 30000);
    const cleared = await page.evaluate(() => ({
      phase: window.SF.state.run.phase,
      wave: window.SF.state.run.wave,
      xp: window.SF.state.run.xp,
      score: window.SF.state.run.score,
    }));
    record('CLEAR', cleared.phase === 'draft' && cleared.xp > 0,
      `killed ${killed}; reached ${cleared.phase} with ${cleared.xp} xp / ${cleared.score} score`);
  } else {
    // Clear the finite first cohort through real damage receipts. Early shopping is part of
    // Swarm's loop; neither a lingering boss nor a timer may silently waive the remaining fight.
    // The stream is sim-tick paced and the fixed-step sim sheds backlog past 4 steps/frame, so a
    // software-GL host runs the fight in slow motion — bound the wait generously in wall time,
    // and treat a sim clock that stops while the fight is still active as the real defect it is.
    const clearDeadline = Date.now() + 480_000;
    let simLast = null;
    let simStallSince = null;
    while (Date.now() < clearDeadline) {
      const step = await killSome(page, 6);
      killed += step.killed;
      if (step.phase === 'draft' || step.phase === 'ended') break;
      if (simLast == null || step.simTime > simLast) {
        simLast = step.simTime;
        simStallSince = null;
      } else if (step.phase === 'active') {
        if (simStallSince == null) simStallSince = Date.now();
        else if (Date.now() - simStallSince > 120_000) break;
      }
      await page.waitForTimeout(500);
    }
    const cleared = await page.evaluate(() => ({
      phase: window.SF.state.run.phase, wave: window.SF.state.run.wave, xp: window.SF.state.run.xp,
      simTime: Math.round(window.SF.state.simTime),
      alive: window.SF.state.entityList.filter(e => e.alive && e.data?.runCohort === 'survival'
        && ['ship', 'drone', 'mine', 'station', 'massSeed', 'payload'].includes(e.type)).length,
    }));
    record('CLEAR', cleared.phase === 'draft' && cleared.wave === 1 && cleared.xp > 0 && cleared.alive === 0,
      'round 1 resolved: ' + killed + ' scripted kills, ' + cleared.alive + ' survivors, phase '
      + cleared.phase + ' at sim ' + cleared.simTime + 's');
  }

  // ── WALLET ──────────────────────────────────────────────────────────────────────────────────
  const wallet = await page.evaluate((before) => ({
    runCredits: window.SF.state.run.credits,
    campaignCredits: window.SF.state.player.credits,
    campaignMoved: window.SF.state.player.credits !== before,
    trace: window.__chipTrace,
  }), campaignCreditsBefore);
  const t = wallet.trace || {};
  // Every cohort kill must drop a chip, every chip must become a body, and every body must be
  // paid. A shortfall here is earnings the player never receives.
  // The invariant is the same in both rulesets — every cohort kill drops a chip, every chip becomes
  // a body, campaign money never moves. The EQUALITY of wallet and chips only holds on the arc's
  // single-wave walk; a swarm walk crosses four wave-clear payouts, so the wallet is legitimately
  // larger than the chips alone and the check asks for `at least` instead of `exactly`.
  const walletOk = wallet.runCredits > 0 && !wallet.campaignMoved
    && t.dropped === t.killed && t.spawned === t.dropped
    && (GAUNTLET ? wallet.runCredits === t.droppedCredits : wallet.runCredits >= t.droppedCredits);
  record('WALLET', walletOk,
    `run wallet ${wallet.runCredits} cr from ${t.dropped}/${t.killed} chips (${t.spawned} bodies, ${t.droppedCredits} cr dropped); campaign unchanged at ${wallet.campaignCredits}`);
  if (!walletOk || VERBOSE) {
    console.log('        chip ledger:', JSON.stringify({
      spawnedIds: t.spawnedIds, collected: t.collected, destroyed: t.destroyed, awards: t.awards,
    }));
  }

  // ── ARMORY / DRAFT ────────────────────────────────────────────────────────────────────────
  // CLEAR saw the phase flip; the screen push rides the same seam but may land a beat later.
  await page.waitForFunction(
    () => window.SF.ctx.screenManager.top() === 'crucibleDraft'
      || window.SF.state.run.phase !== 'draft',
    null, { timeout: 30000 },
  ).catch(() => {});
  const offer = await page.evaluate(() => {
    const owner = window.SF.registry.get('survivalDraft');
    const choices = owner.currentOffers();
    // The route asserts a FIT: a hull-switch or service counter (kind hull/service, no
    // slotIndex) buys something the fittings readout cannot express. Pick a fittable offer.
    const candidate = choices.find(o => o.available !== false && Number.isInteger(o.slotIndex));
    const player = window.SF.state.player;
    return { candidate, count: choices.length, screen: window.SF.ctx.screenManager.top(),
      credits: window.SF.state.run.credits,
      fittings: player.ownedShips[player.activeShipIndex].fittings.slice() };
  });
  record('OFFERS', offer.screen === 'crucibleDraft' && (GAUNTLET ? offer.count === 3 : offer.count > 3),
    offer.count + (GAUNTLET ? ' draft choices' : ' purchasable armory choices'));
  if (!offer.candidate) throw new Error('The first clear must afford a fittable purchase');
  // The armory rail clips its fold to whole rows: a mounted card below the clip is not visible,
  // and Playwright's locator click (a user-level actuation) cannot scroll into a clipped row.
  // The card's own listener is the same one its digit-key path fires, so dispatch a DOM click.
  const cardClicked = await page.evaluate((offerId) => {
    const card = document.querySelector('#screens [data-offer-id="' + offerId + '"]');
    if (!card) return false;
    card.click();
    return true;
  }, offer.candidate.id);
  if (!cardClicked) throw new Error('Offer card missing from the armory rail: ' + offer.candidate.id);
  // The Swarm armory's card click only INSPECTS the offer (the reading pane); the transaction
  // is the pane's explicit purchase key ("Install · N cr"). The Gauntlet's card is the pick.
  if (!GAUNTLET) {
    const buy = page.locator('#screens .orr-armory-purchase');
    await buy.waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(
      () => { const b = document.querySelector('#screens .orr-armory-purchase'); return b && !b.disabled; },
      null, { timeout: 15000 },
    );
    await page.evaluate(() => document.querySelector('#screens .orr-armory-purchase').click());
  }
  const purchased = await page.evaluate(() => {
    const p = window.SF.state.player;
    return { credits: window.SF.state.run.credits, phase: window.SF.state.run.phase,
      fittings: p.ownedShips[p.activeShipIndex].fittings.slice() };
  });
  record('FITTED', purchased.fittings[offer.candidate.slotIndex] === offer.candidate.defId
    && JSON.stringify(purchased.fittings) !== JSON.stringify(offer.fittings), offer.candidate.name);
  if (!GAUNTLET) {
    record('PURCHASE', offer.credits - purchased.credits === offer.candidate.price && purchased.phase === 'draft',
      'paid ' + offer.candidate.price + ' cr; armory stays open for another purchase or saving');
    const saved = purchased.credits;
    if (!(await clickButton(page, 'Rearrange loadout'))) throw new Error('Round refit control missing');
    await page.waitForFunction(() => window.SF.ctx.screenManager.top() === 'crucibleRefit');
    const row = page.locator('.sf-crucible-refit .sf-cru-row').first();
    // The lit row prints its key hint inside the verb ("Strip Enter"), so the accessible name is
    // not exactly "Strip". Substring match still lands on the one action the row offers.
    await row.getByRole('button', { name: 'Strip' }).click();
    await row.getByRole('button', { name: 'Fit' }).click();
    if (!(await clickButton(page, 'Back to armory'))) throw new Error('Refit return control missing');
    record('REFIT', await page.evaluate(() => window.SF.ctx.screenManager.top() === 'crucibleDraft'
      && window.SF.state.run.phase === 'draft'), 'strip and refit between rounds; return to armory');
    await launchArmoryRound(page, 2);
    // The next round debuts a new archetype; the deferred warm compiles its program batch during
    // wave_intro, which is seconds on hardware GL and much longer on a serialized SwiftShader
    // host. Give the same patience the first launch gets.
    await waitForPhase(page, 'active', 90000);
    const next = await page.evaluate(() => ({ wave: window.SF.state.run.wave, credits: window.SF.state.run.credits }));
    record('SAVE', next.wave === 2 && next.credits === saved, 'unspent ' + saved + ' cr carried to round 2');
  }

  // ── VICTORY (--full) ────────────────────────────────────────────────────────────────────────
  // The one claim nothing else proves: that a player who keeps winning actually REACHES the end.
  // The long progression route is opt-in; ordinary checks exercise a buy, refit and retry.
  if (FULL) {
    const log = [];
    let guard = 0;
    let lastProgress = '';
    const startedAt = Date.now();
    while (guard++ < 400 && Date.now() - startedAt < 600000) {
      const progress = await page.evaluate(() => ({ phase: window.SF.state.run.phase,
        wave: window.SF.state.run.wave,
        alive: window.SF.state.entityList.filter(e => e.alive && e.data?.runCohort === 'survival'
          && ['ship', 'drone', 'mine', 'station', 'massSeed', 'payload'].includes(e.type)).length }));
      const phase = progress.phase;
      const progressKey = `${progress.wave}:${phase}`;
      if (VERBOSE && progressKey !== lastProgress) console.log(`  WALK      wave ${progress.wave} · ${phase} · ${progress.alive} live`);
      lastProgress = progressKey;
      if (phase === 'victory' || phase === 'ended') break;
      if (phase === 'active') {
        await page.waitForFunction(
          () => window.SF.state.entityList.some((e) => e.alive && e.data && e.data.runCohort === 'survival'
        && ['ship', 'drone', 'mine', 'station', 'massSeed', 'payload'].includes(e.type))
            || window.SF.state.run.phase !== 'active',
          null, { timeout: 40000 },
        ).catch(() => {});
        const n = await killWaveCohort(page);
        const wave = await page.evaluate(() => window.SF.state.run.wave);
        if (n > 0) log.push(`w${wave}:${n}`);
        // A batched wave owes more bodies after the first group; keep clearing until it resolves.
        await page.waitForFunction(
          () => window.SF.state.run.phase !== 'active'
            || window.SF.state.entityList.some((e) => e.alive && e.data && e.data.runCohort === 'survival'
        && ['ship', 'drone', 'mine', 'station', 'massSeed', 'payload'].includes(e.type)),
          null, { timeout: 40000 },
        ).catch(() => {});
        continue;
      }
      if (phase === 'draft') {
        await page.evaluate((gauntlet) => {
          if (!gauntlet) { window.SF.bus.emit('run:draftPickRequested', { offerId: null }); return; }
          const card = document.querySelector('#screens .sf-cru-card:not(:disabled)');
          if (card) card.click();
          else window.SF.bus.emit('run:draftPickRequested', { offerId: null });
        }, GAUNTLET);
        await page.waitForTimeout(300);
        continue;
      }
      if (phase === 'refit') {
        await page.evaluate((gauntlet) => window.SF.bus.emit(!gauntlet && window.SF.state.run.wave >= 10
          ? 'run:extractionRequested' : 'run:refitCloseRequested', {}), GAUNTLET);
        await page.waitForTimeout(300);
        continue;
      }
      // cleanup / wave_intro / arena_intro: nothing to do but let the phase machine advance.
      await page.waitForFunction(
        (was) => window.SF.state.run.phase !== was,
        phase,
        { timeout: 30000 },
      ).catch(() => {});
    }
    const won = await page.evaluate(() => {
      const owner = window.SF.registry.get('survivalResults');
      const result = owner && owner.lastResult ? owner.lastResult() : null;
      return {
        phase: window.SF.state.run.phase,
        wave: window.SF.state.run.wave,
        top: window.SF.ctx.screenManager.top(),
        // The results plate, not whatever h1 sits lowest in the stack.
        title: (() => {
          const root = document.querySelector('#screens .sf-crucible-results');
          return root ? (root.querySelector('h1') || {}).textContent : null;
        })(),
        headline: (() => {
          const root = document.querySelector('#screens .sf-crucible-results');
          return root ? (root.querySelector('.sf-crd-headline') || {}).textContent : null;
        })(),
        outcome: result && result.outcome,
        score: result && result.score,
        credits: result && result.credits,
        kills: result && result.kills,
        level: result && result.level,
        picks: result && result.picks ? result.picks.map((p) => p.verb).filter(Boolean) : [],
      };
    });
    record(GAUNTLET ? 'VICTORY' : 'EXTRACT',
      (GAUNTLET ? won.phase === 'victory' && won.wave === 30 && won.outcome === 'victory'
        : won.phase === 'ended' && won.wave === 10 && won.outcome === 'extracted')
      && won.top === 'crucibleResults',
      `phase ${won.phase} wave ${won.wave} · "${won.title}" — ${won.headline} · `
      + `${won.kills} kills, ${won.score} score, ${won.credits} cr, level ${won.level}, `
      + `build: ${won.picks.join('/') || '(none)'} · cleared ${log.join(' ')}`);
    const noisy = pageIssues.errorIssues().map((issue) => issue.text)
      .filter(t => !/favicon|KHR_parallel_shader_compile|partsLibrary|opening submission pre-submit gate failed closed/i.test(t));
    record('CLEAN', noisy.length === 0, noisy.length ? noisy.slice(0, 3).join(' | ') : 'no uncaught errors');
    // A won run is terminal; the death path below cannot run on the same session.
    return;
  }

  // ── RESULTS ─────────────────────────────────────────────────────────────────────────────────
  await page.waitForFunction(() => window.SF.state.run.phase === 'active', null, { timeout: 90000 });
  await page.waitForFunction(
    () => window.SF.state.entityList.some((e) => e.alive && e.data && e.data.runCohort === 'survival'
        && ['ship', 'drone', 'mine', 'station', 'massSeed', 'payload'].includes(e.type)),
    null, { timeout: 60000 },
  );
  // Kill the player through the real damage route so combat builds its real defeat receipt.
  await page.evaluate(() => {
    const st = window.SF.state;
    const killer = st.entityList.find((e) => e.alive && e.data && e.data.runCohort === 'survival'
        && ['ship', 'drone', 'mine', 'station', 'massSeed', 'payload'].includes(e.type));
    const player = st.entities.get(st.playerId);
    window.SF.bus.emit('projectile:hit', {
      targetId: st.playerId,
      ownerId: killer ? killer.id : null,
      damage: (player.hull || 100) + (player.shield || 0) + (player.armorHp || 0) + 9999,
      damageType: 'kinetic',
      pos: { x: player.pos.x, z: player.pos.z },
      approach: { x: 1, z: 0 },
      normal: { x: -1, z: 0 },
      weaponId: 'wpn_autocannon_m',
    });
  });
  await page.waitForFunction(
    () => window.SF.ctx.screenManager.top() === 'crucibleResults',
    null, { timeout: 30000 },
  );
  const resultsView = await page.evaluate(() => {
    const root = document.querySelector('#screens [data-stamp="CRUCIBLE / FLIGHT RECORD"]')
      || document.querySelector('#screens .sf-crucible-results');
    const owner = window.SF.registry.get('survivalResults');
    return {
      headline: root ? (root.querySelector('.sf-crd-headline') || {}).textContent : null,
      rows: root ? [...root.querySelectorAll('.sf-crd-grid > *')].map((n) => n.textContent.trim()) : [],
      result: owner && owner.lastResult ? owner.lastResult() : null,
      runPhase: window.SF.state.run.phase,
    };
  });
  const headline = String(resultsView.headline || '');
  // A plate that mounts but explains nothing is the failure this screen exists to prevent, so
  // read what is actually on it rather than trusting that it rendered.
  const plate = await page.evaluate(() => {
    const root = document.querySelector('#screens .sf-crucible-results');
    if (!root) return { present: false };
    const text = root.textContent.replace(/\s+/g, ' ').trim();
    return {
      present: true,
      chars: text.length,
      saysKilledBy: /Killed by/i.test(text),
      saysWeapon: /Its weapon/i.test(text),
      saysDirection: /It came from/i.test(text),
      saysLayer: /It got in/i.test(text),
      minFontPx: Math.min(...[...root.querySelectorAll('*')]
        .map((n) => parseFloat(getComputedStyle(n).fontSize) || 99)
        .filter((v) => v < 99)),
      buttons: [...root.querySelectorAll('button')].map((b) => b.textContent.trim()),
    };
  });
  const explains = plate.present && plate.saysKilledBy && plate.saysWeapon
    && plate.saysDirection && plate.saysLayer && plate.minFontPx >= 12;
  record('RESULTS',
    resultsView.runPhase === 'ended' && /killed you/.test(headline) && explains,
    `"${headline}" · explains who/weapon/bearing/layer: ${explains} · `
    + `${plate.chars} chars, smallest ${plate.minFontPx}px · ${(plate.buttons || []).join(' | ')}`);

  // ── RESTART ─────────────────────────────────────────────────────────────────────────────────
  if (!(await clickButton(page, 'Run it again'))) throw new Error('restart button did not click');
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 90000 });
  // A restart re-enters Swarm through the same opening armory — dismiss it like the first launch.
  if (!GAUNTLET) await launchArmoryRound(page, 1);
  await waitForPhase(page, 'active', 60000);
  const restarted = await page.evaluate(() => ({
    seed: window.SF.state.run.seed,
    wave: window.SF.state.run.wave,
    kind: window.SF.state.run.kind,
    planId: window.SF.state.run.wavePlanId,
  }));
  record('RESTART', restarted.seed === SEED && restarted.wave === 1 && restarted.kind === 'survival',
    `same seed ${restarted.seed}, wave ${restarted.wave}, plan ${restarted.planId}`);

  // ── CLEAN ───────────────────────────────────────────────────────────────────────────────────
  // KNOWN PRE-EXISTING BOOT NOISE, not a Crucible defect. The renderer's first-draw capture gate
  // logs `opening submission pre-submit gate failed closed` on this headless target, where
  // KHR_parallel_shader_compile is unavailable and the opening program set is compiled late. It
  // appears identically on the `--gauntlet` walk, which touches none of the swarm code, so it is
  // filtered here rather than left to fail every Crucible run forever. If it ever stops appearing
  // on the Gauntlet path, delete this and investigate.
  const errorTexts = pageIssues.errorIssues().map((issue) => issue.text);
  const noisy = errorTexts.filter((t) => !(
    /favicon|KHR_parallel_shader_compile|partsLibrary/i.test(t)
    || /opening submission pre-submit gate failed closed/i.test(t)
  ));
  record('CLEAN', noisy.length === 0, noisy.length ? noisy.slice(0, 3).join(' | ') : 'no uncaught errors');
  if (VERBOSE && errorTexts.length) console.log('  page messages:', errorTexts.slice(0, 20));
}

let exitCode = 0;
try {
  await main();
} catch (err) {
  record('ROUTE', false, `threw: ${err && err.message}`);
  if (VERBOSE) console.error(err);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill();
}

const failed = results.filter((r) => !r.ok);
console.log('');
if (failed.length === 0) {
  console.log(VEIL_STEP_ROUTE
    ? `Veil Step public ability route passed — ${results.length}/${results.length} checks passed.`
    : `Crucible route is playable — ${results.length}/${results.length} checks passed.`);
} else {
  const routeName = VEIL_STEP_ROUTE ? 'Veil Step public ability route' : 'Crucible route';
  console.log(`${routeName} FAILED — ${failed.length} of ${results.length} checks: ${failed.map((f) => f.label).join(', ')}`);
  exitCode = 1;
}
process.exit(exitCode);
