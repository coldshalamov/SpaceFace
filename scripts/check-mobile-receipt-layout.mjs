#!/usr/bin/env node
// Real receipt and touch-deck DOM only; no game, renderer, or player save drawer.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { startBenchServer } from './lib/benchServer.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

process.env.SPACEFACE_PLAYER_STORE_DIR = '';
const server = await startBenchServer();
const { webkit } = await loadPlaywright();
const out = path.resolve('.devshots/mobile-receipt-layout');
mkdirSync(out, { recursive: true });
const head = readFileSync('tools/ui-bench.html', 'utf8').split('</head>')[0]
  .replace('<base href="/" />', `<base href="${server.baseUrl}" />`);
const html = `${head}</head><body><div id="hud"><div id="toasts"><div id="toast-live" class="sr-only" role="status" aria-live="polite"></div></div></div><div id="screens" hidden></div></body></html>`;
const cases = [
  { width: 390, height: 664, layout: 'standard', scale: 1, safeBottom: 0 },
  { width: 390, height: 664, layout: 'lefty', scale: 1.6, safeBottom: 34 },
  { width: 844, height: 390, layout: 'standard', scale: 1, safeBottom: 0 },
  { width: 844, height: 390, layout: 'lefty', scale: 1.6, safeBottom: 21 },
];
const results = [];
let browser;
try {
  browser = await webkit.launch({ headless: true });
  for (const scenario of cases) {
    const context = await browser.newContext({ viewport: scenario, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/mobile-receipt-fixture', (route) => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto(`${server.baseUrl}mobile-receipt-fixture`);
    await page.evaluate(async ({ layout, scale, safeBottom }) => {
      const [{ mountMobileView }, { MobileGestures }, { injectHudCss }, { applyOrreryHudSkin }, { createToasts }, { resolveObjectiveHudLayout }] = await Promise.all([
        import('/src/systems/mobile/view.js'), import('/src/systems/mobile/model.js'),
        import('/src/ui/views/hudStyles.js'), import('/src/ui/orrery/hudSkin.js'),
        import('/src/ui/toasts.js'), import('/src/ui/hud.js'),
      ]);
      document.documentElement.dataset.sfMobile = '1';
      document.documentElement.classList.add('sf-reduce-motion');
      document.documentElement.style.setProperty('--sf-safe-bottom', `${safeBottom}px`);
      const player = { alive: true, hull: 100, hullMax: 100, shield: 100, shieldMax: 100, cap: 100, capMax: 100, boost: { energy: 100, max: 100 }, vel: { x: 0, z: 0 } };
      const state = { mode: 'flight', playerId: 1, player, entities: new Map([[1, player]]), ui: { screenStack: [] } };
      const config = () => ({ layout, scale, haptics: false });
      injectHudCss();
      applyOrreryHudSkin();
      const view = mountMobileView({ state, model: new MobileGestures(), activate() {}, reset() {}, config, saveConfig() {} });
      view.setDockReady(true);
      view.render();
      const receipt = document.getElementById('toasts');
      const lane = resolveObjectiveHudLayout(innerWidth, innerHeight).receipt;
      // The HUD continuously writes these desktop coordinates. Mobile placement must win.
      Object.assign(receipt.style, { left: `${lane.x}px`, width: `${lane.width}px`, bottom: `${lane.bottomInset}px`, top: 'auto', right: 'auto', transform: 'none' });
      const handlers = new Map();
      const bus = { on(name, fn) { const list = handlers.get(name) || []; list.push(fn); handlers.set(name, list); return () => {}; }, emit(name, payload) { for (const fn of handlers.get(name) || []) fn(payload); } };
      createToasts({ bus, state });
      bus.emit('toast', { text: 'Helios Freight Spine', kind: 'info', ttl: 60 });
      bus.emit('toast', { text: 'Survey: That bearing is a lamp, not a star. We look anyway.', kind: 'info', ttl: 60 });
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, scenario);
    assert.deepEqual(errors, [], 'Fixture has no page errors');
    const geometry = await page.evaluate(() => {
      const rect = (el) => { const { x, y, width, height, top, right, bottom, left } = el.getBoundingClientRect(); return { x, y, width, height, top, right, bottom, left }; };
      return {
        cards: [...document.querySelectorAll('.sf-toast')].map((el) => ({ ...rect(el), text: el.textContent, opacity: getComputedStyle(el).opacity, pointerEvents: getComputedStyle(el).pointerEvents })),
        controls: [...document.querySelectorAll('.mf-ghost svg,.mf-gun,.mf-tether,.mf-dock,.mf-edge')].map((el) => ({ ...rect(el), name: el.getAttribute('aria-label') || 'stick' })),
        announcement: document.getElementById('toast-live').textContent,
      };
    });
    assert.equal(geometry.cards.length, 2, 'Both world receipts remain rendered');
    for (const card of geometry.cards) {
      assert.equal(card.opacity, '1', 'Receipt remains visible');
      assert.equal(card.pointerEvents, 'none', 'Receipt does not capture flight touches');
      assert.ok(card.top >= 0 && card.left >= 0 && card.right <= scenario.width && card.bottom <= scenario.height, 'Complete receipt fits the phone viewport');
      for (const control of geometry.controls) {
        const overlaps = card.left < control.right && card.right > control.left && card.top < control.bottom && card.bottom > control.top;
        assert.ok(!overlaps, `Receipt clears ${control.name} in ${scenario.width}x${scenario.height} ${scenario.layout}`);
      }
    }
    assert.match(geometry.announcement, /Survey: That bearing is a lamp/, 'Polite announcement retains the bark');
    const name = `${scenario.width}x${scenario.height}-${scenario.layout}`;
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    results.push({ ...scenario, ...geometry });
    console.log(`PASS ${name}: two visible receipts clear the stick, Gun, Tether, Dock and Powers`);
    await context.close();
  }
  writeFileSync(path.join(out, 'geometry.json'), JSON.stringify(results, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
