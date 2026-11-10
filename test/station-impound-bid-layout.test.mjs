import test from 'node:test';
import assert from 'node:assert/strict';
import { startBenchServer } from '../scripts/lib/benchServer.mjs';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';

// The real station stage and lot/economy owners; only the loss and wallet are arranged.
test('compact lot bid keeps its focused label clear and reaches its owner', { timeout: 120000 }, async () => {
  const server = await startBenchServer();
  const { chromium } = await loadPlaywright();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--disable-webgl', '--mute-audio'] });
    for (const [width, height] of [[390, 844], [960, 540]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=station-market&chrome=0`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__BENCH_READY, null, { timeout: 120000 });
        const seeded = await page.evaluate(async () => {
          const state = BENCH.state, bus = BENCH.bus;
          BENCH.registry.get('economy');
          state.world.currentSectorId = 'sector_helios_prime';
          state.lossLedger = {};
          state.player.credits = 100000;
          const lot = await import('/src/systems/impoundLot.js');
          let listing;
          for (let i = 0; i < 400; i++) {
            const entity = { id: 90000 + i, alive: true, type: 'ship', factionId: 'faction_reach',
              data: { defId: 'ship_wasp', callsign: 'Marrow', sectorId: 'sector_helios_prime' } };
            const candidate = lot.postImpoundListing(state, bus, { entity, entry: {
              lossId: `loss_bench_${i}`, sectorId: 'sector_helios_prime', factionId: 'faction_reach',
              victimCallsign: 'Marrow', killedByPlayer: true, killerId: state.playerId,
            } });
            if (candidate?.stationId === state.ui.dockedStationId && candidate.dispute && candidate.redeem) {
              listing = candidate;
              break;
            }
            delete state.lossLedger.impound;
          }
          if (!listing) return false;
          listing.auction.open = true;
          window.__lotAnswers = [];
          bus.on('impoundLot:deskAnswered', answer => window.__lotAnswers.push(answer));
          return true;
        });
        assert.ok(seeded, 'the canonical owner posted a lot at this berth');
        await page.locator('.sxb-ops [data-nav="shipworks"]:visible').first().click();
        await page.locator('[data-mode="buy"]').first().click();
        const hull = page.locator('[data-buy="ship_wasp"]').first();
        await hull.scrollIntoViewIfNeeded();
        await hull.click();
        const input = page.locator('[data-lot-bid]').first();
        const bid = page.locator('[data-lot-verb="bid"]').first();
        await input.scrollIntoViewIfNeeded();
        await input.fill('0');
        assert.equal(await bid.isDisabled(), true);
        await input.fill('100001');
        assert.equal(await bid.isDisabled(), true);
        const strike = await page.evaluate(() => BENCH.state.lossLedger.impound.auction.strike);
        await input.fill(String(strike + 10));
        assert.equal(await bid.isDisabled(), false);
        const gap = await input.evaluate(el => {
          const labelText = document.createRange();
          labelText.selectNodeContents(el.parentElement.firstChild);
          return el.getBoundingClientRect().left - labelText.getBoundingClientRect().right;
        });
        assert.ok(gap >= 5, `${width}: focused input must clear the label, gap ${gap}`);
        if (width === 390) await input.press('Enter');
        else { await bid.scrollIntoViewIfNeeded(); await bid.click(); }
        assert.equal(await page.evaluate(() => window.__lotAnswers.at(-1)?.ok), true);
        assert.equal(await page.evaluate(() => window.__lotAnswers.at(-1)?.verb), 'bid');
        assert.equal(await page.evaluate(() => BENCH.state.lossLedger.impound.hold?.kind), 'bid');
        assert.deepEqual(errors, []);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser?.close();
    await server.close();
  }
});

test('phone station chooser can confirm a real fitting purchase inside safe insets', { timeout: 120000 }, async () => {
  const server = await startBenchServer();
  const { chromium } = await loadPlaywright();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--disable-webgl', '--mute-audio'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34, left: 0, right: 0 } });
    await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=station-shipworks&chrome=0&phone=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__BENCH_READY, null, { timeout: 120000 });
    await page.evaluate(async () => {
      const state = BENCH.state, bus = BENCH.bus;
      const { ships } = await import('/src/systems/ships.js');
      const owner = Object.assign({}, ships, { _instSeq: 0 });
      owner.init({ state, bus, helpers: {}, registry: BENCH.registry });
      owner.newGame();
      BENCH.registry.get('economy');
      window.__purchases = [];
      bus.on('module:purchased', receipt => window.__purchases.push(receipt));
      __benchRefresh();
    });
    const hardpoint = page.locator('[data-spatial-slot="0"] .sx-hardpoint__copy').first();
    await hardpoint.scrollIntoViewIfNeeded();
    await hardpoint.click();
    const buy = page.locator('[data-buyfit="wpn_autocannon_s"]').first();
    await buy.scrollIntoViewIfNeeded();
    await buy.click({ timeout: 7000 });
    await page.locator('.sf-confirm__cancel').click();
    assert.equal(await page.evaluate(() => BENCH.state.player.credits), 18400);
    assert.equal(await page.evaluate(() => BENCH.state.player.ownedShips[0].fittings[0]), 'wpn_pulse_laser_s');
    assert.equal(await page.evaluate(() => window.__purchases.length), 0);
    await buy.click({ timeout: 7000 });
    const dialog = page.locator('.sf-confirm');
    const box = await dialog.boundingBox();
    assert.ok(box && box.y >= 47 && box.y + box.height <= 844 - 34, 'confirmation remains within safe vertical bounds');
    await page.locator('.sf-confirm__ok').click();
    await page.waitForFunction(() => window.__purchases.length === 1);
    assert.equal(await page.evaluate(() => BENCH.state.player.credits), 13200);
    assert.equal(await page.evaluate(() => BENCH.state.player.ownedShips[0].fittings[0]), 'wpn_autocannon_s');
    assert.equal(await page.evaluate(() => BENCH.state.player.moduleInventory.some(item => item.defId === 'wpn_pulse_laser_s')), true);
    assert.deepEqual(errors, []);
    await page.close();
  } finally {
    await browser?.close();
    await server.close();
  }
});
