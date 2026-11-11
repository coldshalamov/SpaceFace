import test from 'node:test';
import assert from 'node:assert/strict';
import { startBenchServer } from '../scripts/lib/benchServer.mjs';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';

// Real screen and paused construction owner. This checks decision feedback, not live combat.
test('compact Fortify keeps purchase refusal and repair feedback readable', { timeout: 180000 }, async () => {
  const server = await startBenchServer();
  const { chromium } = await loadPlaywright();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--disable-webgl', '--mute-audio'] });
    const cases = [
      ...[{ width: 651, height: 461 }, { width: 700, height: 461 }, { width: 801, height: 461 },
        { width: 844, height: 390 }, { width: 390, height: 844 }, { width: 960, height: 540 }, { width: 1920, height: 1080 }]
        .map(viewport => ({ viewport, phone: false })),
      ...[{ width: 844, height: 390 }, { width: 390, height: 844 }].map(viewport => ({ viewport, phone: true })),
    ];
    for (const { viewport, phone } of cases) {
      const page = await browser.newPage({ viewport, reducedMotion: 'reduce',
        ...(phone ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
      try {
        const activate = locator => phone ? locator.tap() : locator.click();
        await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=crucible-fortify&chrome=0${phone ? '&phone=1' : ''}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__BENCH_READY, null, { timeout: 120000 });
        assert.equal(await page.evaluate(() => document.documentElement.dataset.sfMobile === '1'), phone,
          'phone regression must exercise the actual mobile CSS cascade, not only a narrow desktop');
        // Arrival is the claim: do not focus or scroll before measuring the positions/description.
        const arrival = await page.evaluate(() => {
          const inside = element => {
            const rect = element.getBoundingClientRect();
            if (!rect.width || !rect.height || rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight) return false;
            for (let parent = element.parentElement; parent; parent = parent.parentElement) {
              const style = getComputedStyle(parent), box = parent.getBoundingClientRect();
              if (style.overflowX !== 'visible' && (rect.left < box.left - 1 || rect.right > box.right + 1)) return false;
              if (style.overflowY !== 'visible' && (rect.top < box.top - 1 || rect.bottom > box.bottom + 1)) return false;
            }
            return rect.bottom <= document.querySelector('.sf-crucible-fortify > .k-foot').getBoundingClientRect().top;
          };
          const positions = [...document.querySelectorAll('[data-socket-id]')];
          const markers = [...document.querySelectorAll('.sf-fortify-plan text')];
          const readable = element => {
            const box = element.getBoundingClientRect();
            const range = document.createRange(); range.selectNodeContents(element);
            return parseFloat(getComputedStyle(element).fontSize) >= 12 && [...range.getClientRects()].every(line =>
              line.left >= box.left - 1 && line.right <= box.right + 1 && line.top >= box.top - 1 && line.bottom <= box.bottom + 1);
          };
          const hittable = element => {
            const box = element.getBoundingClientRect();
            const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            return hit === element || element.contains(hit);
          };
          return {
            positions: positions.length, hiddenPositions: positions.filter(element => !inside(element)).map(element => element.textContent),
            clippedPositionText: positions.filter(element => !readable(element)).map(element => element.textContent),
            unhittablePositions: positions.filter(element => !hittable(element)).map(element => element.textContent),
            markers: markers.length, hiddenMarkers: markers.filter(element => !inside(element)).map(element => element.textContent),
            defaultDescription: inside(document.querySelector('[data-device-id="gravity_beacon"] small')),
            mobileTitleSize: parseFloat(getComputedStyle(document.querySelector('#sf-fortify-title')).fontSize),
          };
        });
        const frame = `${phone ? 'phone' : 'desktop'} ${viewport.width}×${viewport.height}`;
        assert.equal(arrival.positions, 6, frame);
        assert.deepEqual(arrival.hiddenPositions, [], `${frame}: all six construction positions are visible before scrolling`);
        assert.deepEqual(arrival.clippedPositionText, [], `${frame}: all six position labels fit their control without clipping`);
        assert.deepEqual(arrival.unhittablePositions, [], `${frame}: all six positions have unobscured pointer targets`);
        assert.equal(arrival.markers, 6, frame);
        assert.deepEqual(arrival.hiddenMarkers, [], `${frame}: all six numbered markers are visible before scrolling`);
        assert.equal(arrival.defaultDescription, true, `${frame}: the default purchase is explained on arrival`);
        if (phone) assert.ok(arrival.mobileTitleSize <= 24, `${frame}: generic mobile hero type must not consume the decision space`);
        const socketIds = await page.locator('[data-socket-id]').evaluateAll(buttons => buttons.map(button => button.dataset.socketId));
        for (const socketId of socketIds) {
          const socket = page.locator(`[data-socket-id="${socketId}"]`);
          await activate(socket);
          assert.equal(await socket.getAttribute('aria-pressed'), 'true', `${frame}: position selection remains interactive`);
        }
        const devicesLink = page.locator('[aria-controls="sf-fortify-shelf"]');
        const fieldLink = page.locator('[aria-controls="sf-fortify-state"]');
        const position = page.locator('.sf-fortify-position');
        assert.match(await devicesLink.innerText(), /Devices · 5/);
        assert.match(await fieldLink.innerText(), /In the field · 1 · 1 needs service/);
        assert.equal(await page.locator('.sf-fortify-layout').evaluate(element => {
          const style = getComputedStyle(element);
          const foot = document.querySelector('.sf-crucible-fortify > .k-foot');
          return style.maskImage === 'none' && getComputedStyle(foot).boxShadow === 'none'
            && !['""', "''"].includes(getComputedStyle(foot, '::before').content)
            && element.getBoundingClientRect().bottom <= foot.getBoundingClientRect().top;
        }), true, 'the scrollport stops before the footer, without masking useful content');
        if (viewport.width >= 600) assert.equal(await page.locator('.sf-fortify-plan').evaluate(element =>
          element.getBoundingClientRect().right <= document.querySelector('.sf-fortify-shelf').getBoundingClientRect().left
        ), true, 'short landscape presents positions and devices side by side');
        await activate(fieldLink);
        assert.equal(await page.locator('.sf-fortify-state [data-repair-id]').first().evaluate(element =>
          document.activeElement === element && element.getBoundingClientRect().bottom <= document.querySelector('.k-foot').getBoundingClientRect().top
        ), true, 'the ordinary pointer shortcut reveals a service control above the footer');
        await devicesLink.focus(); await page.keyboard.press('Enter');
        assert.equal(await page.locator('[data-device-id="gravity_beacon"]').evaluate(element => document.activeElement === element), true,
          'keyboard activation returns to the selected device');
        for (const deviceId of ['gravity_beacon', 'repulsor_pylon', 'tesla_pair', 'kinetic_turret', 'reflector_fin']) {
          const device = page.locator(`[data-device-id="${deviceId}"]`);
          await activate(device);
          assert.equal(await device.getAttribute('aria-pressed'), 'true');
          const description = device.locator('small');
          await description.scrollIntoViewIfNeeded();
          assert.equal(await description.evaluate(element => {
            const style = getComputedStyle(element);
            const box = element.getBoundingClientRect();
            const range = document.createRange(); range.selectNodeContents(element);
            return style.webkitLineClamp === 'none' && box.height + 1 >= range.getBoundingClientRect().height
              && box.bottom <= document.querySelector('.k-foot').getBoundingClientRect().top;
          }), true, 'selected descriptions are complete and outside the action row');
          assert.equal(await position.evaluate(element => {
            const box = element.getBoundingClientRect();
            return box.top >= 0 && box.bottom <= innerHeight && element.parentElement.classList.contains('k-foot');
          }), true, 'selected placement remains in view while comparing all five devices');
          if (deviceId === 'reflector_fin') {
            const facingIds = await page.locator('[data-facing-id]').evaluateAll(buttons => buttons.map(button => button.dataset.facingId));
            assert.equal(facingIds.length, 4);
            for (const facingId of facingIds) {
              const facing = page.locator(`[data-facing-id="${facingId}"]`);
              await facing.scrollIntoViewIfNeeded();
              assert.equal(await facing.evaluate(element => {
                const box = element.getBoundingClientRect();
                const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
                const range = document.createRange(); range.selectNodeContents(element);
                const linesFit = [...range.getClientRects()].every(line => line.left >= box.left - 1 && line.right <= box.right + 1
                  && line.top >= box.top - 1 && line.bottom <= box.bottom + 1);
                const siblings = [...element.parentElement.children].filter(other => other !== element);
                return linesFit && (hit === element || element.contains(hit))
                  && box.top >= document.querySelector('.sf-fortify-layout').getBoundingClientRect().top
                  && box.bottom <= document.querySelector('.k-foot').getBoundingClientRect().top
                  && siblings.every(other => {
                    const rect = other.getBoundingClientRect();
                    return Math.min(box.right, rect.right) <= Math.max(box.left, rect.left)
                      || Math.min(box.bottom, rect.bottom) <= Math.max(box.top, rect.top);
                  });
              }), true, `${frame}: each reflector facing is readable and unobscured after intentional scroll`);
              await activate(facing);
              assert.equal(await facing.getAttribute('aria-pressed'), 'true');
            }
          }
        }
        await activate(page.locator('[data-device-id="gravity_beacon"]'));
        const note = page.locator('.sf-fortify-receipt');
        async function readableFeedback(pattern) {
          await page.waitForFunction(source => new RegExp(source).test(document.querySelector('.sf-fortify-receipt')?.textContent || ''), pattern.source);
          assert.equal(await note.isVisible(), true, 'the live receipt must not disappear on short frames');
          await note.scrollIntoViewIfNeeded();
          const visible = await note.evaluate(element => {
            const style = getComputedStyle(element), box = element.getBoundingClientRect();
            const foot = element.closest('.k-foot').getBoundingClientRect();
            const range = document.createRange(); range.selectNodeContents(element);
            const lines = [...range.getClientRects()];
            return element.getAttribute('role') === 'status' && element.getAttribute('aria-live') === 'polite'
              && parseFloat(style.fontSize) >= 12 && style.visibility === 'visible'
              && lines.length > 0 && lines.every(line => line.left >= Math.max(0, foot.left) - 1
                && line.right <= Math.min(innerWidth, foot.right) + 1
                && line.top >= Math.max(0, foot.top) - 1
                && line.bottom <= Math.min(innerHeight, foot.bottom) + 1)
              && box.height + 1 >= range.getBoundingClientRect().height;
          });
          assert.equal(visible, true, 'every line of the result fits the visible footer');
        }
        const build = page.locator('.sf-fortify-build');
        assert.equal(await build.isEnabled(), true, 'the ordinary paused fixture offers a clear position');
        // A competing spend after the screen read forces the real owner to refuse the stale offer.
        await page.evaluate(() => { BENCH.state.run.credits = 0; });
        await activate(build);
        await readableFeedback(/cannot cover/);
        assert.equal(await page.evaluate(() => BENCH.state.run.credits), 0);
        assert.equal(await build.isEnabled(), false, 'the refreshed purse explains the disabled purchase');
        await page.evaluate(() => BENCH.goto('crucible-fortify'));
        const repair = page.locator('.sf-fortify-state [data-repair-id]').first();
        await repair.scrollIntoViewIfNeeded();
        await activate(repair);
        await readableFeedback(/structure repaired and ready/);
        const close = page.locator('.sf-fortify-close');
        await close.focus(); await close.scrollIntoViewIfNeeded();
        assert.equal(await close.evaluate(button => {
          const box = button.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return document.activeElement === button && !!hit && (hit === button || button.contains(hit));
        }), true, 'the receipt does not bury the Return control');
      } finally { await page.close(); }
    }
  } finally { await browser?.close(); await server.close(); }
});
