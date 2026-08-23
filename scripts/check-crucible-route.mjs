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
//   MENU     the Crucible door is on the main menu
//   DOOR     it offers hulls and a seed
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
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VERBOSE = process.argv.includes('--verbose');
const SEED = 4242;
// --full walks all ten waves to a victory instead of stopping at wave 2 and dying.
const FULL = process.argv.includes('--full');
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
    const targets = st.entityList.filter((e) => e.alive && e.data && e.data.runCohort === 'survival');
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

async function waitForPhase(page, phase, timeout = 30000) {
  await page.waitForFunction(
    (want) => window.SF.state.run && window.SF.state.run.phase === want,
    phase,
    { timeout },
  );
}

async function main() {
  server = await startServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err && err.message || err)));
  page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push(msg.text()); });

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
    seed: (document.querySelector('#screens .sf-crd-seed input') || {}).value,
  }));
  record('DOOR', door.top === 'crucible' && door.hulls.length >= 2 && !!door.seed,
    `${door.hulls.length} hulls, seed field present`);

  // ── LAUNCH ──────────────────────────────────────────────────────────────────────────────────
  await page.evaluate((seed) => {
    const hull = [...document.querySelectorAll('#screens .sf-crd-hull')]
      .find((b) => b.textContent.includes('Physics Toolkit'))
      || document.querySelector('#screens .sf-crd-hull');
    hull.click();
    document.querySelector('#screens .sf-crd-seed input').value = String(seed);
  }, SEED);
  if (!(await clickButton(page, 'Enter the Crucible'))) throw new Error('Enter the Crucible did not click');

  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 90000 });
  await waitForPhase(page, 'active', 60000);
  const launched = await page.evaluate(() => {
    const st = window.SF.state;
    return {
      mode: st.mode, kind: st.run.kind, phase: st.run.phase, wave: st.run.wave,
      seed: st.run.seed, arenaId: st.run.arenaId, sector: st.world && st.world.currentSectorId,
    };
  });
  record('LAUNCH',
    launched.mode === 'flight' && launched.kind === 'survival' && launched.wave === 1
      && launched.seed === SEED,
    `${launched.arenaId} · wave ${launched.wave} · seed ${launched.seed} · mode ${launched.mode}`);

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
  record('ARSENAL', arsenal.fitted.length >= 1,
    `${arsenal.hullId} carries ${arsenal.fitted.length} fitted: ${arsenal.fitted.join(', ') || '(nothing)'}`);

  // ── WAVE ────────────────────────────────────────────────────────────────────────────────────
  await page.waitForFunction(
    () => window.SF.state.entityList.some((e) => e.alive && e.data && e.data.runCohort === 'survival'),
    null, { timeout: 30000 },
  );
  const wave = await page.evaluate(() => {
    const st = window.SF.state;
    const cohort = st.entityList.filter((e) => e.alive && e.data && e.data.runCohort === 'survival');
    return {
      count: cohort.length,
      ids: [...new Set(cohort.map((e) => e.data.lootTableId))],
      hull: cohort[0] && cohort[0].hull,
      budgetUsed: st.spawnBudget && st.spawnBudget.used,
      budgetMax: st.spawnBudget && st.spawnBudget.max,
    };
  });
  record('WAVE', wave.count > 0 && wave.budgetUsed <= wave.budgetMax && wave.hull > 0,
    `${wave.count} live hostiles (${wave.ids.join(', ')}), budget ${wave.budgetUsed}/${wave.budgetMax}`);

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
  record('HUD',
    hud.present && hud.visible && String(hud.wave).indexOf('WAVE 1 / 30') === 0
      && hud.phase === 'FIGHT' && hud.role === 'status' && hud.minFontPx >= 12,
    hud.present
      ? `"${hud.label}" · ${hud.wave} · ${hud.phase} · figures ${hud.figs.join(' ')} · `
        + `smallest text ${hud.minFontPx}px · hosted in .${hud.host}`
      : 'no run readout on screen at all');

  // ── CLEAR ───────────────────────────────────────────────────────────────────────────────────
  const campaignCreditsBefore = await page.evaluate(() => window.SF.state.player.credits);
  // Trace the chip economy for this wave so a shortfall is a reported number, not a mystery.
  await page.evaluate(() => {
    window.__chipTrace = { dropped: 0, droppedCredits: 0, killed: 0, spawned: 0 };
    window.SF.bus.on('entity:killed', (p) => {
      const victim = window.SF.state.entities.get(p && p.id);
      if (victim && victim.data && victim.data.runCohort === 'survival') window.__chipTrace.killed += 1;
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
  const killed = await killWaveCohort(page);
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
  const walletOk = wallet.runCredits > 0 && !wallet.campaignMoved
    && t.dropped === t.killed && t.spawned === t.dropped
    && wallet.runCredits === t.droppedCredits;
  record('WALLET', walletOk,
    `run wallet ${wallet.runCredits} cr from ${t.dropped}/${t.killed} chips (${t.spawned} bodies, ${t.droppedCredits} cr dropped); campaign unchanged at ${wallet.campaignCredits}`);
  if (!walletOk || VERBOSE) {
    console.log('        chip ledger:', JSON.stringify({
      spawnedIds: t.spawnedIds, collected: t.collected, destroyed: t.destroyed, awards: t.awards,
    }));
  }

  // ── DRAFT ───────────────────────────────────────────────────────────────────────────────────
  const cards = await page.evaluate(() => ({
    top: window.SF.ctx.screenManager.top(),
    verbs: [...document.querySelectorAll('#screens .sf-cru-card .sf-cru-verb')].map((n) => n.textContent.trim()),
    before: (() => {
      const p = window.SF.state.player;
      return (p.ownedShips[p.activeShipIndex].fittings || []).slice();
    })(),
  }));
  let draftDetail = `screen ${cards.top}, offers: ${cards.verbs.join(' / ')}`;
  let draftOk = cards.top === 'crucibleDraft' && cards.verbs.length === 3;

  // The paid re-roll is the only thing run credits buy. Prove it exists, that spending it actually
  // draws different cards, and that the wallet paid for it — in the real screen, not in node.
  if (draftOk) {
    const before = await page.evaluate(() => ({
      credits: window.SF.state.run.credits,
      verbs: [...document.querySelectorAll('#screens .sf-cru-card .sf-cru-verb')].map((n) => n.textContent.trim()),
      label: (() => {
        const b = [...document.querySelectorAll('#screens button')]
          .find((x) => /re-?roll/i.test(x.textContent));
        return b ? { text: b.textContent.replace(/\s+/g, ' ').trim(), disabled: b.disabled } : null;
      })(),
    }));
    if (before.label && !before.label.disabled) {
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('#screens button')].find((x) => /re-?roll/i.test(x.textContent));
        if (b) b.click();
      });
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => ({
        credits: window.SF.state.run.credits,
        verbs: [...document.querySelectorAll('#screens .sf-cru-card .sf-cru-verb')].map((n) => n.textContent.trim()),
      }));
      const paid = before.credits - after.credits;
      const drew = JSON.stringify(after.verbs) !== JSON.stringify(before.verbs);
      record('REROLL', paid > 0 && drew && after.verbs.length === 3,
        `"${before.label.text}" · ${before.verbs.join('/')} -> ${after.verbs.join('/')} · `
        + `wallet ${before.credits} -> ${after.credits} cr`);
    } else {
      record('REROLL', !!before.label,
        before.label
          ? `control present and correctly unaffordable at ${before.credits} cr: "${before.label.text}"`
          : 'no re-roll control on the draft at all');
    }
  }

  if (draftOk) {
    // Re-read the cards: a re-roll above replaced them, and reporting the pre-roll verb would
    // name a card the player never saw.
    const onScreen = await page.evaluate(
      () => [...document.querySelectorAll('#screens .sf-cru-card .sf-cru-verb')].map((n) => n.textContent.trim()),
    );
    cards.verbs = onScreen.length ? onScreen : cards.verbs;
    await page.evaluate(() => { document.querySelector('#screens .sf-cru-card').click(); });
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => {
      const p = window.SF.state.player;
      return {
        fittings: (p.ownedShips[p.activeShipIndex].fittings || []).slice(),
        modifiers: window.SF.state.run.modifiers.length,
        phase: window.SF.state.run.phase,
      };
    });
    const changed = JSON.stringify(after.fittings) !== JSON.stringify(cards.before);
    draftOk = changed && after.modifiers === 1;
    draftDetail = `picked ${cards.verbs[0]}; hull now ${after.fittings.filter(Boolean).join(', ')}`;
  }
  record('DRAFT', draftOk, draftDetail);

  // ── VICTORY (--full) ────────────────────────────────────────────────────────────────────────
  // The one claim nothing else proves: that a player who keeps winning actually REACHES the end.
  // Ten waves is slow (each carries a 180-240 tick cleanup), so it is opt-in.
  if (FULL) {
    const log = [];
    let guard = 0;
    // Ten waves each carry a 180-240 tick cleanup plus a draft, so this needs room to breathe.
    while (guard++ < 400) {
      const phase = await page.evaluate(() => window.SF.state.run.phase);
      if (phase === 'victory' || phase === 'ended') break;
      if (phase === 'active') {
        await page.waitForFunction(
          () => window.SF.state.entityList.some((e) => e.alive && e.data && e.data.runCohort === 'survival')
            || window.SF.state.run.phase !== 'active',
          null, { timeout: 40000 },
        ).catch(() => {});
        const n = await killWaveCohort(page);
        const wave = await page.evaluate(() => window.SF.state.run.wave);
        if (n > 0) log.push(`w${wave}:${n}`);
        // A batched wave owes more bodies after the first group; keep clearing until it resolves.
        await page.waitForFunction(
          () => window.SF.state.run.phase !== 'active'
            || window.SF.state.entityList.some((e) => e.alive && e.data && e.data.runCohort === 'survival'),
          null, { timeout: 40000 },
        ).catch(() => {});
        continue;
      }
      if (phase === 'draft') {
        await page.evaluate(() => {
          const card = document.querySelector('#screens .sf-cru-card');
          if (card) card.click();
          else window.SF.bus.emit('run:draftPickRequested', { offerId: null });
        });
        await page.waitForTimeout(300);
        continue;
      }
      if (phase === 'refit') {
        await page.evaluate(() => window.SF.bus.emit('run:refitCloseRequested', {}));
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
    record('VICTORY',
      won.phase === 'victory' && won.wave === 10 && won.outcome === 'victory'
        && won.top === 'crucibleResults',
      `phase ${won.phase} wave ${won.wave} · "${won.title}" — ${won.headline} · `
      + `${won.kills} kills, ${won.score} score, ${won.credits} cr, level ${won.level}, `
      + `build: ${won.picks.join('/') || '(none)'} · cleared ${log.join(' ')}`);
    // A won run is terminal; the death path below cannot run on the same session.
    return;
  }

  // ── RESULTS ─────────────────────────────────────────────────────────────────────────────────
  await page.waitForFunction(() => window.SF.state.run.phase === 'active', null, { timeout: 40000 });
  await page.waitForFunction(
    () => window.SF.state.entityList.some((e) => e.alive && e.data && e.data.runCohort === 'survival'),
    null, { timeout: 30000 },
  );
  // Kill the player through the real damage route so combat builds its real defeat receipt.
  await page.evaluate(() => {
    const st = window.SF.state;
    const killer = st.entityList.find((e) => e.alive && e.data && e.data.runCohort === 'survival');
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
  const noisy = pageErrors.filter((t) => !/favicon|KHR_parallel_shader_compile|partsLibrary/i.test(t));
  record('CLEAN', noisy.length === 0, noisy.length ? noisy.slice(0, 3).join(' | ') : 'no uncaught errors');
  if (VERBOSE && pageErrors.length) console.log('  page messages:', pageErrors.slice(0, 20));
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
  console.log(`Crucible route is playable — ${results.length}/${results.length} checks passed.`);
} else {
  console.log(`Crucible route FAILED — ${failed.length} of ${results.length} checks: ${failed.map((f) => f.label).join(', ')}`);
  exitCode = 1;
}
process.exit(exitCode);
