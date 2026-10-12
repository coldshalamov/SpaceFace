// Public routes: main menu → mode select → preparation/loadout → spawn → play, through the DOM
// controls a player clicks. No game service is called to skip a step.

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

export async function bootToMenu(page, baseUrl, step) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 180000 });
  await page.waitForFunction(() => { const el = document.querySelector('[data-screen="mainMenu"]'); return el && getComputedStyle(el).display !== 'none'; }, null, { timeout: 180000 });
  step('main menu', true, 'menu visible');
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

/** Crucible door → ruleset → arena → seed → ship & kit → armory. Returns what the door showed. */
export async function crucibleToArmory(page, { ruleset, arena, seed }, step) {
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
    // The seed sits inside the door's collapsed prep disclosure: open it the way a player does.
    const closed = page.locator('#screens details:not([open]):has(.sf-crd-seed) > summary').first();
    if (await closed.count().catch(() => 0)) await closed.click({ timeout: 15000 }).catch(() => {});
    try { await seedInput.scrollIntoViewIfNeeded({ timeout: 10000 }); await seedInput.fill(String(seed), { timeout: 3000 }); await seedInput.press('Tab'); seedSet = true; } catch { /* not on this step */ }
  };
  await trySeed();
  const chosen = await listDoorArenas(page);
  step('mode select', true, `Crucible · ${ruleset} · arena ${(chosen.find((x) => x.pressed) || {}).name || arena || 'default'} · seed ${seedSet ? seed : 'field not visible'}`);
  await clickText(page, 'Choose ship');
  await trySeed();
  const hull = await page.evaluate(() => { const b = [...document.querySelectorAll('#screens .sf-crd-hull')].find((x) => x.getAttribute('aria-pressed') === 'true' || x.getAttribute('aria-checked') === 'true' || x.classList.contains('is-selected')); return b ? b.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) : null; });
  if (ruleset === 'swarm') {
    await clickText(page, 'Open armory');
    await page.waitForFunction(() => window.SF.ctx.screenManager.top() === 'crucibleDraft', null, { timeout: 300000 });
  } else {
    await clickText(page, 'Enter the Gauntlet');
  }
  return { arenas, seedSet, hull };
}

const IRRELEVANT = {
  swarm: [
    [/cargo/i, 'cargo kit — Swarm has no cargo loop'],
    [/market|trade|uplink/i, 'market/trade kit — Swarm has no market'],
    [/drill|prospect|bio-?spectral|biofilm|survey|refin|mining/i, 'prospecting/mining kit — Swarm has no ore economy'],
  ],
};
IRRELEVANT.gauntlet = IRRELEVANT.swarm;

/** Read every armory offer and its words. Pure DOM. */
export async function readArmory(page) {
  return page.evaluate(() => [...document.querySelectorAll('#screens .sf-cru-card')].map((c, i) => {
    const r = c.getBoundingClientRect();
    const q = (sel) => { const n = c.querySelector(sel); return n ? n.textContent.replace(/\s+/g, ' ').trim() : ''; };
    const text = c.textContent.replace(/\s+/g, ' ').trim();
    const name = q('.sf-cru-name') || (c.getAttribute('aria-label') || '').split('. ')[1] || text.slice(0, 40);
    const cat = q('.sf-cru-verb') || null;
    return { i, role: cat || '', name, desc: q('.sf-cru-blurb'), category: cat, unavailable: c.classList.contains('is-unavail'), text: text.slice(0, 200), box: [r.left, r.top, r.right, r.bottom], visible: r.width > 0 && r.height > 0 };
  }));
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

export async function armoryLaunchWord(page) {
  return page.evaluate(() => {
    const n = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const b = [...document.querySelectorAll('#screens button')].find((x) => x.offsetParent && !x.disabled && /^(Launch round \d+|Keep current loadout|Continue)/.test(n(x.textContent)));
    return b ? n(b.textContent).replace(/Esc$/, '').trim() : null;
  });
}

export async function adventureToFlight(page, step) {
  await clickText(page, 'New Game', { exact: true });
  await page.waitForFunction(() => window.SF.ctx.screenManager.top() === 'newGame', null, { timeout: 60000 });
  const tutorials = await page.evaluate(() => window.SF.state.settings && window.SF.state.settings.gameplay ? window.SF.state.settings.gameplay.tutorialHints : null);
  step('mode select', true, `New Game (Adventure) · tutorial hints ${tutorials}`);
  await clickText(page, 'Launch', { exact: true });
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 600000 });
  await waitBootOverlayGone(page);
  step('preparation', true, 'default pilot/ship (no changes), Launch');
  return { tutorials };
}

export async function racingToFlight(page, step) {
  await clickText(page, 'Circuits', { exact: true });
  await page.waitForFunction(() => window.SF.ctx.screenManager.top() === 'raceBoard', null, { timeout: 60000 });
  const course = await page.evaluate(() => { const c = document.querySelector('#screens .race-board-course h2'); return c ? c.textContent.trim() : null; });
  step('mode select', true, `Circuits · first course ${course}`);
  await page.waitForFunction(() => { const b = document.querySelector('#screens .race-board-launch'); return b && !b.disabled; }, null, { timeout: 60000 });
  const word = await page.evaluate(() => document.querySelector('#screens .race-board-launch').textContent.trim());
  await page.locator('#screens .race-board-launch').first().click();
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 600000 });
  await waitBootOverlayGone(page);
  step('preparation', true, `"${word}" on ${course}`);
  return { course };
}
