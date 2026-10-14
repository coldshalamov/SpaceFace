// Public routes: main menu → mode select → preparation/loadout → spawn → play, through the DOM
// controls a player clicks. No game service is called to skip a step.

import { quoteLoadError } from './environment.mjs';

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Page text that is a load failure, or null. The sentence is the player's, quoted unchanged. */
export async function readLoadError(page) {
  const text = await page.evaluate(() => (document.body && document.body.innerText) || '').catch(() => '');
  return quoteLoadError(text);
}

function environmentError(quote) {
  const err = new Error(quote);
  err.environmentQuote = quote;
  return err;
}

export async function bootToMenu(page, baseUrl, step) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const quote = await readLoadError(page);
    if (quote) throw environmentError(quote);
    const ready = await page.evaluate(() => {
      const el = document.querySelector('[data-screen="mainMenu"]');
      return !!(window.SF && window.SF.state && window.SF.bus && el && getComputedStyle(el).display !== 'none');
    }).catch(() => false);
    if (ready) { step('main menu', true, 'menu visible'); return; }
    await page.waitForTimeout(400);
  }
  const quote = await readLoadError(page);
  if (quote) throw environmentError(quote);
  throw new Error('main menu did not appear');
}

/** Flight, or a quoted load error. `active` also requires the run phase to be active. */
export async function waitUntilFlight(page, { timeout = 600000, active = false } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const quote = await readLoadError(page);
    if (quote) throw environmentError(quote);
    const flight = await page.evaluate((needActive) => {
      const st = window.SF && window.SF.state;
      if (!st || st.mode !== 'flight') return false;
      if (!needActive) return true;
      return !!(st.run && st.run.phase === 'active');
    }, active).catch(() => false);
    if (flight) return;
    await page.waitForTimeout(400);
  }
  const quote = await readLoadError(page);
  if (quote) throw environmentError(quote);
  throw new Error(active ? 'flight did not become active before the timeout' : 'flight did not start before the timeout');
}

/** Click a visible, enabled button in #screens whose text contains `text`. */
export async function clickText(page, text, { timeout = 240000, exact = false } = {}) {
  await page.waitForFunction(([t, ex]) => {
    const n = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const b = [...document.querySelectorAll('#screens button')].find((x) => x.offsetParent && (ex ? n(x.textContent) === t : n(x.textContent).includes(t)));
    return !!b && !b.disabled;
  }, [text, exact], { timeout });
  const loc = page.locator('#screens button:visible').filter({ hasText: exact ? new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) : text }).first();
  await loc.click();
}

export async function waitBootOverlayGone(page, timeout = 300000) {
  await page.waitForFunction(() => {
    const o = document.getElementById('boot-overlay'); if (!o) return true;
    const cs = getComputedStyle(o); return cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05 || o.hidden;
  }, null, { timeout });
}

export async function listDoorArenas(page) {
  return page.evaluate(() => [...document.querySelectorAll('#screens .sf-crd-row--arena button')]
    .map((b) => ({ name: b.textContent.replace(/\s+/g, ' ').trim(), disabled: !!b.disabled || b.getAttribute('aria-disabled') === 'true', pressed: b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-checked') === 'true' })));
}

/** Every hull tile the Crucible ship step offers: starter id, face word, locked flag. */
export async function listHulls(page) {
  return page.evaluate(() => [...document.querySelectorAll('#screens .sf-crd-hull')].map((b) => ({ id: b.dataset.starterId, face: b.textContent.replace(/\s+/g, ' ').trim().slice(0, 40), locked: b.dataset.locked === '1' || !!b.disabled })));
}

/** Crucible door → ruleset → arena → seed → ship & kit → armory. Returns what the door showed.
 *  `hooks.onShip(doorPrep)` runs after the hull is selected and before the launch click, so a
 *  caller can photograph the ship step. Gauntlet never opens an armory; the door sentence is the preparation. */
export async function crucibleToArmory(page, { ruleset, arena, seed, hull: wantHull = null }, step, hooks = {}) {
  await clickText(page, 'Crucible', { exact: true });
  await page.waitForFunction(() => window.SF.ctx.screenManager.top() === 'crucible', null, { timeout: 60000 });
  await page.locator(`#screens .sf-crd-mode[data-ruleset="${ruleset}"]`).click();
  const arenas = await listDoorArenas(page);
  if (arena) {
    const a = page.locator('#screens .sf-crd-row--arena button').filter({ hasText: arena }).first();
    await a.click({ timeout: 15000 });
  }
  let seedSet = false;
  const seedInput = page.locator('#screens .sf-crd-seed input').first();
  const trySeed = async () => {
    if (seed == null || seedSet) return;
    // The seed is a settings row on the door, often below the fold at 960x540. Scroll it into
    // the centre the way a player does, then replace the digits. A collapsed disclosure is the
    // older door; open that too if it is still there.
    const closed = page.locator('#screens details:not([open]):has(.sf-crd-seed) > summary').first();
    if (await closed.count().catch(() => 0)) await closed.click({ timeout: 15000 }).catch(() => {});
    if (!(await seedInput.count().catch(() => 0))) return;
    await seedInput.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' })).catch(() => {});
    const want = String(seed);
    try {
      await seedInput.fill(want, { timeout: 5000 });
      await seedInput.press('Tab');
    } catch {
      // The row is in the DOM but Playwright still calls it hidden (overflow clip). Click the
      // centre and type, which is what a player does once the row is on screen.
      const bb = await seedInput.boundingBox().catch(() => null);
      if (!bb) return;
      await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type(want, { delay: 15 });
      await page.keyboard.press('Tab');
    }
    const got = await seedInput.inputValue().catch(() => '');
    if (String(got).trim() === want) seedSet = true;
  };
  await trySeed();
  const chosen = await listDoorArenas(page);
  step('mode select', true, `Crucible · ${ruleset} · arena ${(chosen.find((x) => x.pressed) || {}).name || arena || 'default'} · seed ${seedSet ? seed : 'field not visible'}`);
  await clickText(page, 'Choose ship');
  await trySeed();
  const hulls = await listHulls(page);
  if (wantHull) {
    const pick = hulls.find((h) => h.id === wantHull || h.face.toLowerCase() === String(wantHull).toLowerCase());
    if (!pick) throw new Error(`hull "${wantHull}" not offered (offered: ${hulls.map((h) => h.id).join(', ')})`);
    if (pick.locked) throw new Error(`hull "${wantHull}" is locked for this profile`);
    // The tile idles in a perpetual CSS motion, so Playwright's "stable" wait never settles under
    // software GL. Click it the way a player does: a trusted mouse click at the tile's centre.
    const tile = page.locator(`#screens .sf-crd-hull[data-starter-id="${pick.id}"]`).first();
    await tile.scrollIntoViewIfNeeded({ timeout: 15000 }).catch(() => {});
    const bb = await tile.boundingBox();
    if (!bb) throw new Error(`hull "${pick.id}" tile has no box on screen`);
    const picked = (id) => { const t = document.querySelector(`#screens .sf-crd-hull[data-starter-id="${id}"]`); return !!t && t.getAttribute('aria-pressed') === 'true'; };
    await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    let ok = await page.waitForFunction(picked, pick.id, { timeout: 4000 }).then(() => true, () => false);
    if (!ok) {
      // Mouse missed (the tile is covered or reflowing): Tab-focus the tile and press Enter, as a keyboard player does.
      const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 3).join('.')}` : 'nothing'; }, [bb.x + bb.width / 2, bb.y + bb.height / 2]);
      await tile.focus();
      await page.keyboard.press('Enter');
      ok = await page.waitForFunction(picked, pick.id, { timeout: 8000 }).then(() => true, () => false);
      if (!ok) throw new Error(`hull "${pick.id}" did not select by mouse (centre hits ${hit}) or keyboard`);
    }
    await page.waitForTimeout(400);
  }
  const hull = await page.evaluate(() => { const b = [...document.querySelectorAll('#screens .sf-crd-hull')].find((x) => x.getAttribute('aria-pressed') === 'true' || x.getAttribute('aria-checked') === 'true' || x.classList.contains('is-selected')); return b ? b.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) : null; });
  const doorPrep = await readDoorPreparation(page);
  if (hooks && typeof hooks.onShip === 'function') await hooks.onShip(doorPrep);
  if (ruleset === 'swarm') {
    await clickText(page, 'Open armory');
    // #318: a Training Derelict fallthrough fails immediately. Any other non-draft
    // world still gets the 60 s named miss (mode, kind, phase, top, helios_core spawn).
    await waitForArmory(page, { failOnTutorial: true });
  } else {
    // Gauntlet does not stop on the draft screen. A survival run is the landing.
    // The same adventure/inactive flight that swallows Swarm is still a miss.
    await clickText(page, 'Enter the Gauntlet');
    await waitForArmory(page, { acceptSurvival: true, verb: 'Enter the Gauntlet' });
  }
  const runSeed = await readLaunchedRunSeed(page);
  if (seedSet && Number.isSafeInteger(seed) && runSeed !== seed) {
    throw new Error(`Crucible seed mismatch: requested ${seed}, launched ${runSeed}`);
  }
  return { arenas, seedSet, seed, runSeed, hull, hulls, doorPrep };
}

/** A non-draft world may sit this long after Open armory before the route is lost. */
export const ARMORY_WORLD_GRACE_MS = 60000;

/** #318's worker-lane regression: OPEN ARMORY staged the Adventure tutorial instead of the armory. */
export const SWARM_TUTORIAL_MISS = 'Swarm OPEN ARMORY did not open the armory: launch fell into the Adventure tutorial (Training Derelict)';

/**
 * After Open armory the next public screen is crucibleDraft. The world may boot
 * first; survivalDraft re-opens the draft once the run phase is draft. A flight
 * or loading world that is not in draft, held past the grace, missed the armory.
 * With failOnTutorial, a flight that already shows the tutorial or a rescue cast
 * is lost immediately (the #318 predicate).
 * @returns {'ready'|'wait'|'lost'}
 */
export function classifyArmoryArrival(snap, flightForMs, opts = {}) {
  if (!snap || typeof snap !== 'object') return 'wait';
  if (snap.top === 'crucibleDraft') return 'ready';
  // Gauntlet never opens the draft screen. A live survival run is the landing.
  if (opts.acceptSurvival && snap.kind === 'survival' && snap.phase && snap.phase !== 'inactive') return 'ready';
  // Same predicate as #318's route check: flight, tutorial or rescue cast, and no live survival run.
  if (opts.failOnTutorial && snap.mode === 'flight' && (snap.tutorial || snap.rescue)
      && !(snap.kind === 'survival' && snap.phase && snap.phase !== 'inactive')) return 'lost';
  const inWorld = snap.mode === 'flight' || snap.mode === 'loading';
  if (!inWorld) return 'wait';
  if (snap.phase === 'draft') return 'wait';
  if (Number(flightForMs) >= ARMORY_WORLD_GRACE_MS) return 'lost';
  return 'wait';
}

/** First line of a route failure. formatRouteFailure keeps 180 characters of it. */
export function formatArmoryMiss(snap, verb = 'Open armory') {
  const top = snap && snap.top ? snap.top : 'none';
  const mode = snap && snap.mode ? snap.mode : 'none';
  const kind = snap && snap.kind ? snap.kind : 'none';
  const phase = snap && snap.phase ? snap.phase : 'none';
  const hud = String(snap && snap.hud || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  let pos = '';
  if (snap && Number.isFinite(snap.x) && Number.isFinite(snap.z)) {
    pos = ` at ${Math.round(snap.x)},${Math.round(snap.z)}`;
    // combatLabSetups.js helios_core. The door relocates here even when survival does not begin.
    if (Math.round(snap.x) === -1900 && Math.round(snap.z) === -2200) pos += ' helios_core spawn';
  }
  const line = `${verb} missed the draft: mode=${mode} kind=${kind} phase=${phase} top=${top}${pos}${hud ? ` hud="${hud}"` : ''}`;
  return line.length > 179 ? line.slice(0, 179) : line;
}

/** #318 sentence plus the named miss. formatRouteFailure keeps 180 characters of the first line. */
export function formatSwarmTutorialMiss(snap) {
  const mode = snap && snap.mode ? snap.mode : 'none';
  const kind = snap && snap.kind ? snap.kind : 'none';
  const phase = snap && snap.phase ? snap.phase : 'none';
  let pos = '';
  if (snap && Number.isFinite(snap.x) && Number.isFinite(snap.z)) {
    pos = ` at ${Math.round(snap.x)},${Math.round(snap.z)}`;
    if (Math.round(snap.x) === -1900 && Math.round(snap.z) === -2200) pos += ' helios_core spawn';
  }
  const line = `${SWARM_TUTORIAL_MISS} mode=${mode} kind=${kind} phase=${phase}${pos}`;
  return line.length > 179 ? line.slice(0, 179) : line;
}

async function readArmorySnap(page) {
  return page.evaluate(() => {
    const st = window.SF && window.SF.state;
    const run = st && st.run;
    const hudEl = document.querySelector('.sf-crun') || document.querySelector('#hud');
    const sm = window.SF && window.SF.ctx && window.SF.ctx.screenManager;
    const player = st && st.entityList && st.entityList.find((e) => e.id === st.playerId);
    return {
      top: sm && typeof sm.top === 'function' ? sm.top() : null,
      mode: st ? st.mode : null,
      kind: run ? run.kind : null,
      phase: run ? run.phase : null,
      x: player && player.pos && Number.isFinite(player.pos.x) ? player.pos.x : null,
      z: player && player.pos && Number.isFinite(player.pos.z) ? player.pos.z : null,
      tutorial: !!(st && st.onboarding && st.onboarding.active === true),
      rescue: !!(st && st.entityList && st.entityList.some((e) => e && e.alive !== false && e.data && e.data.rescue === true)),
      hud: hudEl && hudEl.innerText ? hudEl.innerText.replace(/\s+/g, ' ').trim().slice(0, 80) : '',
    };
  }).catch(() => null);
}

/** Poll the live page. Ready on crucibleDraft. Lost when the world is not a draft. */
async function waitForArmory(page, { timeoutMs = 300000, graceMs = ARMORY_WORLD_GRACE_MS, acceptSurvival = false, failOnTutorial = false, verb = 'Open armory' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let flightSince = null;
  let last = null;
  while (Date.now() < deadline) {
    last = await readArmorySnap(page);
    if (last) {
      const survivalLive = acceptSurvival && last.kind === 'survival' && last.phase && last.phase !== 'inactive';
      const inWorld = (last.mode === 'flight' || last.mode === 'loading') && last.phase !== 'draft' && last.top !== 'crucibleDraft' && !survivalLive;
      if (inWorld) {
        if (flightSince == null) flightSince = Date.now();
      } else if (last.phase !== 'draft') {
        flightSince = null;
      }
      const flightFor = flightSince == null ? 0 : Date.now() - flightSince;
      const status = classifyArmoryArrival(last, flightFor >= graceMs ? graceMs : flightFor, { acceptSurvival, failOnTutorial });
      if (status === 'ready') return last;
      if (status === 'lost') {
        const tutorial = failOnTutorial && last.mode === 'flight' && (last.tutorial || last.rescue)
          && !(last.kind === 'survival' && last.phase && last.phase !== 'inactive');
        throw new Error(tutorial ? formatSwarmTutorialMiss(last) : formatArmoryMiss(last, verb));
      }
    }
    await page.waitForTimeout(500);
  }
  throw new Error(last ? formatArmoryMiss(last, verb) : `${verb}: page had no SF state before the draft opened`);
}

const IRRELEVANT = {
  swarm: [
    [/cargo/i, 'cargo kit — Swarm has no cargo loop'],
    [/market|trade|uplink/i, 'market/trade kit — Swarm has no market'],
    [/drill|prospect|bio-?spectral|biofilm|survey|refin|mining/i, 'prospecting/mining kit — Swarm has no ore economy'],
  ],
};
IRRELEVANT.gauntlet = IRRELEVANT.swarm;

/** "4/8 fitted" or "4 hardpoints fitted" from a door or shelf sentence. 0 when the screen states no count. */
export function fittedClaimFromText(text) {
  const s = String(text || '').replace(/\s+/g, ' ');
  const ratio = s.match(/(\d+)\s*\/\s*(\d+)\s*fitted/i);
  if (ratio) return Number(ratio[1]);
  const hard = s.match(/(\d+)\s+hardpoints?\s+fitted/i);
  return hard ? Number(hard[1]) : 0;
}

/**
 * Why an armory read returned no cards.
 * `cards` — the selector saw offer cards.
 * `game-empty` — the shelf itself says nothing is offered (zero count, empty node, or the wave sentence).
 * `harness-miss` — the screen claims offers or prints names the card selector did not return.
 */
export function classifyOfferRead({ cards = [], allCount = null, strayNames = [], sub = '', emptyText = '' } = {}) {
  if (cards.length > 0) return { offerSource: 'cards', offerQuote: null };
  const quote = [sub, emptyText].map((s) => String(s || '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · ').slice(0, 240);
  const stray = (strayNames || []).filter(Boolean);
  if ((Number(allCount) > 0) || stray.length > 0) {
    return { offerSource: 'harness-miss', offerQuote: quote || `category count ${allCount}; names on screen were not .sf-cru-card` };
  }
  if (allCount === 0 || /nothing new fits|no equipment matches/i.test(quote)) {
    return { offerSource: 'game-empty', offerQuote: quote || 'shelf empty' };
  }
  return { offerSource: 'harness-miss', offerQuote: quote || 'armory showed no cards and no empty-shelf sentence' };
}

/** The selected hull's face and the door's hull sentence, before the launch click. */
export async function readDoorPreparation(page) {
  const snap = await page.evaluate(() => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const hull = [...document.querySelectorAll('#screens .sf-crd-hull')].find((x) => x.getAttribute('aria-pressed') === 'true' || x.getAttribute('aria-checked') === 'true' || x.classList.contains('is-selected'));
    const sub = document.querySelector('#screens .sf-crd-hull-sub');
    return { face: hull ? norm(hull.textContent).slice(0, 120) : '', sub: sub ? norm(sub.textContent).slice(0, 240) : '' };
  });
  const quote = [snap.face, snap.sub].filter(Boolean).join(' · ');
  return { ...snap, quote, fittedClaimed: fittedClaimFromText(quote) };
}

/** Offer cards plus the shelf census that says whether zero cards is the game or the harness. */
export async function readArmoryShelf(page) {
  const cards = await readArmory(page);
  const census = await page.evaluate(() => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const allBtn = [...document.querySelectorAll('#screens button')].find((b) => {
      const word = b.querySelector('.sf-cru-filter-word');
      return word && norm(word.textContent) === 'All';
    });
    let allCount = null;
    if (allBtn) {
      const c = allBtn.querySelector('.sf-cru-count');
      if (c && /^\d+$/.test(norm(c.textContent))) allCount = Number(norm(c.textContent));
      const aria = allBtn.getAttribute('aria-label') || '';
      const m = aria.match(/All,\s*(\d+)/);
      if (allCount == null && m) allCount = Number(m[1]);
    }
    const sub = norm((document.querySelector('#screens .k-title .sf-cru-sub') || document.querySelector('#screens .sf-cru-sub') || {}).textContent || '');
    const empty = document.querySelector('#screens .orr-armory-empty');
    const emptyText = empty ? norm(empty.textContent) : '';
    const strayNames = [...document.querySelectorAll('#screens .sf-cru-name')].filter((n) => !n.closest('.sf-cru-card')).map((n) => norm(n.textContent)).filter(Boolean);
    return { allCount, sub, emptyText, strayNames };
  });
  return { cards, ...census, fittedClaimed: fittedClaimFromText(`${census.sub} ${census.emptyText}`) };
}

/**
 * Open Rearrange loadout, read each fitted row's name and any explanation that is not the name,
 * then Back to armory (draft pop, not a launch). Throws when the control is missing; the caller
 * records that as a harness read failure and still launches.
 */
export async function readFittedRows(page) {
  await clickText(page, 'Rearrange loadout', { timeout: 15000 });
  await page.waitForFunction(() => window.SF.ctx.screenManager.top() === 'crucibleRefit', null, { timeout: 20000 });
  await page.waitForTimeout(300);
  const rows = await page.evaluate(() => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    return [...document.querySelectorAll('#screens .sf-cru-row.orr-hp.is-fitted, #screens li.sf-cru-row.is-fitted')].map((row) => {
      const r = row.getBoundingClientRect();
      const name = norm((row.querySelector('.orr-hp__value') || {}).textContent);
      const label = norm((row.querySelector('.orr-hp__label') || {}).textContent);
      const contrastEl = row.querySelector('.orr-hp__contrast');
      const contrast = norm(contrastEl ? contrastEl.textContent : '');
      const clipped = !!(contrastEl && contrastEl.classList.contains('orr-hp__contrast--drawn'));
      let contrastVisible = false;
      if (contrastEl && !clipped) {
        const cs = getComputedStyle(contrastEl);
        const cr = contrastEl.getBoundingClientRect();
        contrastVisible = cs.display !== 'none' && cs.visibility !== 'hidden' && cr.width > 2 && cr.height > 2;
      }
      const slot = norm((row.querySelector('.sf-cru-slottag') || {}).textContent);
      return {
        name: name || label, contrast: contrast !== (name || label) ? contrast : '', clipped, contrastVisible,
        lit: row.classList.contains('is-lit'),
        category: slot || 'fitted', role: 'fitted', text: norm(row.textContent).slice(0, 200),
        box: [r.left, r.top, r.right, r.bottom], visible: r.width > 0 && r.height > 0,
      };
    });
  });
  try {
    await clickText(page, 'Back to armory', { timeout: 8000 });
    await page.waitForFunction(() => window.SF.ctx.screenManager.top() === 'crucibleDraft', null, { timeout: 8000 });
  } catch (err) {
    // During a draft, Escape pops the refit and does not launch.
    await page.keyboard.press('Escape').catch(() => {});
    const back = await page.waitForFunction(() => window.SF.ctx.screenManager.top() === 'crucibleDraft', null, { timeout: 8000 }).then(() => true, () => false);
    if (!back) throw err;
  }
  // A lit row that is showing its own contrast proves selection paints the sentence.
  // Other rows' hidden contrast then counts, and the verdict labels that credit inferred.
  const selectedShowsOwn = rows.some((row) => row.lit && row.contrastVisible && row.contrast);
  return {
    rows: rows.map((row) => {
      const seen = fittedSentenceThePlayerSees({
        contrast: row.contrast, clipped: row.clipped, visible: row.contrastVisible, selectedShowsOwn,
      });
      return { ...row, desc: seen.desc, explanationSurface: seen.surface };
    }),
  };
}

/**
 * The sentence a player can read for one armory offer.
 * The Swarm rail hides `.sf-cru-blurb`. The explanation is the reading panel
 * (`.orr-armory-reading__blurb`) for the lit row, and only when that panel's
 * words are the lit row's own blurb (or the lit row has no blurb to compare).
 * A visible panel that names a different sentence is a mismatch, not an
 * explanation. Another row's hidden blurb counts only once that match holds.
 */
export function explanationThePlayerSees({ blurb = '', blurbVisible = false, lit = false, reading = '', readingVisible = false, litBlurb = '' } = {}) {
  const text = norm(blurb);
  const shown = norm(reading);
  const litText = norm(litBlurb);
  if (blurbVisible) return { desc: text, surface: 'card' };
  if (lit && readingVisible) {
    if (shown.length > 0 && (litText === '' || shown === litText)) return { desc: shown, surface: 'reading' };
    if (shown.length > 0 && litText !== '') return { desc: '', surface: 'reading-mismatch', panel: shown, expected: litText };
  }
  const panelWired = readingVisible && shown.length > 0 && litText === shown;
  if (panelWired && text.length > 0) return { desc: text, surface: 'reading' };
  return { desc: '', surface: 'none' };
}

/**
 * The sentence a player can read on a refit row.
 * A contrast marked `--drawn` is clipped for the screen reader; the row draws scales, not that sentence.
 * A contrast on screen counts. A hidden contrast counts only when a lit row is
 * showing its own contrast, which is the proof that selection paints the sentence.
 * That credit is inferred for the unselected row (`row-on-select`).
 */
export function fittedSentenceThePlayerSees({ contrast = '', clipped = false, visible = false, selectedShowsOwn = false } = {}) {
  const text = norm(contrast);
  if (clipped) return { desc: '', surface: 'clipped' };
  if (visible && text) return { desc: text, surface: 'row' };
  if (selectedShowsOwn && text) return { desc: text, surface: 'row-on-select' };
  return { desc: '', surface: 'none' };
}

/** Read every armory offer. `desc` is only the sentence the player can read. */
export async function readArmory(page) {
  const raw = await page.evaluate(() => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const shown = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    };
    const wrap = document.querySelector('#screens .orr-armory-reading');
    const readingEl = document.querySelector('#screens .orr-armory-reading__blurb');
    const readingVisible = shown(wrap) && shown(readingEl);
    const reading = readingEl ? norm(readingEl.textContent) : '';
    const cards = [...document.querySelectorAll('#screens .sf-cru-card')].map((c, i) => {
      const r = c.getBoundingClientRect();
      const q = (sel) => { const n = c.querySelector(sel); return n ? norm(n.textContent) : ''; };
      const blurbEl = c.querySelector('.sf-cru-blurb');
      const text = norm(c.textContent);
      const name = q('.sf-cru-name') || (c.getAttribute('aria-label') || '').split('. ')[1] || text.slice(0, 40);
      const cat = q('.sf-cru-verb') || null;
      return {
        i, role: cat || '', name, blurb: q('.sf-cru-blurb'), blurbVisible: shown(blurbEl),
        lit: c.classList.contains('is-lit') || c.getAttribute('aria-pressed') === 'true',
        category: cat, unavailable: c.classList.contains('is-unavail'), text: text.slice(0, 200),
        box: [r.left, r.top, r.right, r.bottom], visible: r.width > 0 && r.height > 0,
      };
    });
    return { reading, readingVisible, cards };
  });
  const lit = raw.cards.find((c) => c.lit);
  return raw.cards.map((c) => {
    const seen = explanationThePlayerSees({
      blurb: c.blurb, blurbVisible: c.blurbVisible, lit: c.lit,
      reading: raw.reading, readingVisible: raw.readingVisible, litBlurb: lit ? lit.blurb : '',
    });
    return {
      ...c, desc: seen.desc, explanationSurface: seen.surface,
      ...(seen.surface === 'reading-mismatch' ? { panel: seen.panel, expected: seen.expected } : {}),
    };
  });
}

export function auditItems(mode, items) {
  const rules = IRRELEVANT[mode] || [];
  const irrelevant = []; const undescribed = [];
  for (const it of items) {
    const hit = rules.find(([re]) => re.test(it.name));
    if (hit) irrelevant.push({ ...it, reason: hit[1] });
    if (norm(it.desc).length < 12) undescribed.push(it);
  }
  return { irrelevant, undescribed };
}

const readBuild = (page) => page.evaluate(() => [...document.querySelectorAll('#screens .orr-armory-build li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()));
const readReading = (page) => page.evaluate(() => { const b = document.querySelector('#screens .orr-armory-purchase'); let n = b; for (let i = 0; i < 6 && n && n.parentElement; i++) n = n.parentElement; return (n ? n.textContent : '').replace(/\s+/g, ' ').trim(); });

/**
 * Silent-replacement probe: install up to `maxBuys` offers (real clicks) and compare the
 * "Current build" list before/after. A part that disappears while the reading never said
 * swap/replace/spares or named the removed part is a silent replacement.
 */
export async function swapProbe(page, maxBuys = 3) {
  const out = { silentSwaps: [], announcedSwaps: 0, buys: 0, swapProbe: 'not-run' };
  const items = await readArmory(page);
  const cand = items.filter((x) => !x.unavailable && x.visible && x.category && !/service/i.test(x.category));
  // Prefer utility/rig offers first: their small slots are the ones a starter kit already fills.
  cand.sort((a, b) => (/rigs/i.test(b.category) ? 1 : 0) - (/rigs/i.test(a.category) ? 1 : 0));
  for (const it of cand.slice(0, 8)) {
    if (out.buys >= maxBuys) break;
    const card = page.locator('#screens .sf-cru-card').nth(it.i);
    await card.click().catch(() => {});
    await page.waitForTimeout(250);
    const buy = page.locator('#screens .orr-armory-purchase').first();
    if (!(await buy.isEnabled().catch(() => false))) continue;
    const before = await readBuild(page); const said = await readReading(page);
    const t = await page.evaluate(() => performance.now());
    await buy.click().catch(() => {});
    await page.waitForTimeout(600);
    const after = await readBuild(page);
    if (JSON.stringify(after) === JSON.stringify(before)) continue;
    out.buys++;
    const nameOf = (row) => row.replace(/^\d+\s*\/\s*\w+\s+\w+\s*/, '');
    const removed = before.filter((row, i) => after[i] !== row && !/^Empty|Empty$/.test(nameOf(row)) && nameOf(row) && nameOf(row) !== 'Empty').map(nameOf);
    if (removed.length) {
      const announced = /swap|replace|spares/i.test(said) || removed.some((r) => said.includes(r));
      if (announced) out.announcedSwaps++; else out.silentSwaps.push({ bought: it.name, removed, said, t });
    }
  }
  out.swapProbe = out.buys ? `${out.buys} installs, ${out.announcedSwaps} announced swaps, ${out.silentSwaps.length} silent` : 'no install possible';
  return out;
}

/** A wrong preparation screen may stay up this long before the route fails. The expected armory still has the long budget. */
export const PREPARATION_UNEXPECTED_MS = 30000;

function prepText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/**
 * Name painted on a preparation screen that is not the swarm armory.
 * The draft stamp stays "CRUCIBLE / REARM" on the Armory screen too, so the heading wins.
 */
export function preparationScreenName(snap) {
  const title = prepText(snap && snap.title);
  if (/^rearm$/i.test(title)) return 'REARM';
  if (title) return title.toUpperCase();
  const stamp = prepText(snap && snap.stamp);
  if (/\brearm\b/i.test(stamp)) return 'REARM';
  if (snap && snap.top) return String(snap.top);
  return 'unknown';
}

/**
 * Swarm preparation is ready when an enabled "Launch round 1" is on screen.
 * The opening armory (heading Armory, or "Fit out before round 1") is that same
 * screen while the button is still warming, so it keeps waiting. A different
 * #screens screen, such as Rearm after "Wave 0 cleared", is unexpected.
 * Nothing visible yet is waiting.
 * @returns {{ status: 'ready'|'waiting'|'unexpected', name?: string }}
 */
export function classifyPreparationScreen(snap) {
  if (!snap || typeof snap !== 'object') return { status: 'waiting' };
  if (snap.launch === true) return { status: 'ready' };
  if (snap.visible !== true) return { status: 'waiting' };
  const title = prepText(snap.title);
  const sub = prepText(snap.sub);
  if (/^armory$/i.test(title)) return { status: 'waiting' };
  if (/fit out before round 1/i.test(sub)) return { status: 'waiting' };
  if (!title && !sub) return { status: 'waiting' };
  return { status: 'unexpected', name: preparationScreenName(snap) };
}

/**
 * Hold an unexpected preparation screen until `unexpectedMs`. A return to waiting,
 * or a different name, starts the clock over.
 * @returns {{ status: 'ready'|'waiting'|'unexpected', name: string|null, since: number|null, due: boolean }}
 */
export function notePreparationWait(hold, snap, now, unexpectedMs = PREPARATION_UNEXPECTED_MS) {
  const cls = classifyPreparationScreen(snap);
  if (cls.status !== 'unexpected') return { status: cls.status, name: null, since: null, due: false };
  const since = hold && hold.name === cls.name && Number.isFinite(hold.since) ? hold.since : now;
  return { status: 'unexpected', name: cls.name, since, due: now - since >= unexpectedMs };
}

/** DOM snap for the preparation wait. Null when the page cannot be read. */
export async function readPreparationSnap(page) {
  return page.evaluate(() => {
    const n = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const root = document.getElementById('screens');
    const visible = !!(root && root.style.display !== 'none' && root.getAttribute('aria-hidden') !== 'true');
    const titleEl = document.querySelector('#screens #sf-crucible-draft-title, #screens h1');
    const subEl = document.querySelector('#screens .sf-cru-sub');
    const screen = document.querySelector('#screens .k-screen');
    const stamp = screen && screen.dataset ? screen.dataset.stamp || '' : '';
    const launch = [...document.querySelectorAll('#screens button')].some((x) => x.offsetParent && !x.disabled && /Launch round 1/.test(n(x.textContent)));
    const sm = window.SF && window.SF.ctx && window.SF.ctx.screenManager;
    return {
      visible,
      title: titleEl ? n(titleEl.textContent) : '',
      sub: subEl ? n(subEl.textContent) : '',
      stamp: n(stamp),
      top: sm && typeof sm.top === 'function' ? sm.top() : null,
      launch,
    };
  }).catch(() => null);
}

/**
 * Wait for swarm preparation's Launch round 1. The expected armory may use the
 * full timeout. A different #screens screen held for about 30s throws
 * `unexpected screen: <NAME>` so the route fails with that name.
 */
export async function waitForPreparationLaunch(page, {
  timeoutMs = 600000,
  unexpectedMs = PREPARATION_UNEXPECTED_MS,
  pollMs = 250,
  now = Date.now,
  read = null,
} = {}) {
  const deadline = now() + timeoutMs;
  let hold = null;
  let last = null;
  const load = read || (() => readPreparationSnap(page));
  while (now() < deadline) {
    last = await load();
    const note = notePreparationWait(hold, last, now(), unexpectedMs);
    if (note.status === 'ready') return last;
    if (note.due) throw new Error(`unexpected screen: ${note.name}`);
    hold = note.status === 'unexpected' ? { name: note.name, since: note.since } : null;
    const left = deadline - now();
    if (left <= 0) break;
    await page.waitForTimeout(Math.min(pollMs, left));
  }
  const name = last && (last.title || last.top) ? preparationScreenName(last) : '';
  throw new Error(name ? `preparation: Launch round 1 did not appear (screen ${name})` : 'preparation: Launch round 1 did not appear');
}

export async function armoryLaunchWord(page) {
  return page.evaluate(() => {
    const n = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const b = [...document.querySelectorAll('#screens button')].find((x) => x.offsetParent && !x.disabled && /^(Launch round \d+|Keep current loadout|Continue)/.test(n(x.textContent)));
    return b ? n(b.textContent).replace(/Esc$/, '').trim() : null;
  });
}

/** Choose a positive worker run seed before the lagging UI mirror or a zero sentinel. */
export function selectAuthoritativeRunSeed(probe = {}, fallback = null) {
  const candidates = [probe && probe.runSeed, probe && probe.seed, fallback];
  return candidates.find((value) => Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff) ?? null;
}

export async function readLaunchedRunSeed(page) {
  const probe = await page.evaluate(async () => {
    const { laneCommandSink, laneRpc } = await import('/src/core/simLaneCommands.js');
    if (laneCommandSink()) {
      const response = await laneRpc('probeState', {});
      const result = response?.result;
      if (!response?.ok) throw new Error('Authoritative run seed unavailable');
      return { runSeed: result?.runSeed ?? null, seed: result?.seed ?? null };
    }
    const state = window.SF.state;
    return { runSeed: state?.run?.seed ?? null, seed: state?.meta?.seed ?? null };
  });
  const seed = selectAuthoritativeRunSeed(probe);
  if (seed == null) throw new Error('Authoritative run seed unavailable');
  return seed;
}

export async function adventureToFlight(page, step, { seed = null } = {}) {
  await clickText(page, 'New Game', { exact: true });
  await page.waitForFunction(() => window.SF.ctx.screenManager.top() === 'newGame', null, { timeout: 60000 });
  const tutorials = await page.evaluate(() => window.SF.state.settings && window.SF.state.settings.gameplay ? window.SF.state.settings.gameplay.tutorialHints : null);
  step('mode select', true, `New Game (Adventure) · tutorial hints ${tutorials}`);
  if (seed != null) {
    if (!Number.isSafeInteger(seed) || seed <= 0 || seed > 0xffffffff) throw new Error('Invalid universe seed');
    await page.locator('#sf-ng-seed').fill(String(seed));
  }
  await clickText(page, 'Launch', { exact: true });
  await waitUntilFlight(page, { timeout: 600000 });
  await waitBootOverlayGone(page);
  step('preparation', true, 'default pilot/ship (no changes), Launch');
  const runSeed = await readLaunchedRunSeed(page);
  if (seed != null && runSeed !== seed) throw new Error(`Universe seed mismatch: requested ${seed}, launched ${runSeed}`);
  return { tutorials, seedSet: seed != null, runSeed };
}

export async function racingToFlight(page, step) {
  await clickText(page, 'Circuits', { exact: true });
  await page.waitForFunction(() => window.SF.ctx.screenManager.top() === 'raceBoard', null, { timeout: 60000 });
  const course = await page.evaluate(() => { const c = document.querySelector('#screens .race-board-course h2'); return c ? c.textContent.trim() : null; });
  step('mode select', true, `Circuits · first course ${course}`);
  await page.waitForFunction(() => { const b = document.querySelector('#screens .race-board-launch'); return b && !b.disabled; }, null, { timeout: 60000 });
  const word = await page.evaluate(() => document.querySelector('#screens .race-board-launch').textContent.trim());
  await page.locator('#screens .race-board-launch').first().click();
  // The board asks "Launch a temporary circuit flight?" before it leaves the menu: answer it like a player.
  const ok = page.locator('.sf-confirm .sf-confirm__ok').first();
  let confirmed = null;
  try { await ok.waitFor({ state: 'visible', timeout: 15000 }); confirmed = (await ok.textContent()).trim(); await ok.click(); } catch { /* no confirm on this build */ }
  await waitUntilFlight(page, { timeout: 600000 });
  await waitBootOverlayGone(page);
  step('preparation', true, `"${word}" on ${course}${confirmed ? ` → confirm "${confirmed}"` : ''}`);
  const runSeed = await readLaunchedRunSeed(page);
  return { course, runSeed };
}
