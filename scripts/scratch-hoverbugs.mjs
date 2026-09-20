const { startFreshServer, openBootWithRetry } = await import('./capture-ui-matrix.mjs');
const { loadPlaywright } = await import('./lib/load-playwright.mjs');
const { chromium } = await loadPlaywright();
const server = await startFreshServer();
const browser = await chromium.launch({ headless: true });
const shot = (page, n) => page.screenshot({ path: `.devshots/ui-layout/diag-${n}.png` });
try {
  const boot = await openBootWithRetry({ browser, baseUrl: server.baseUrl, viewport: { width: 1920, height: 1080 } });
  const { page } = boot;
  await page.waitForTimeout(1000);

  // --- 1. comms-radial: open the fan (the audit's radial entry), then hover the hub ---
  const commsInfo = await page.evaluate(() => {
    const hub = document.querySelector('button.sf-commsfan__hub');
    const comms = document.querySelector('#sf-comms');
    return { hub: !!hub, comms: !!comms, commsRect: comms && comms.getBoundingClientRect().toJSON() };
  });
  console.log('comms pre:', JSON.stringify(commsInfo));
  // open the comms radial like the audit does — find its entry
  const commsOpen = await page.evaluate(() => {
    const b = document.querySelector('button.sf-commsfan__hub');
    if (b) { b.click(); return 'clicked hub'; }
    return 'no hub';
  });
  console.log('comms open:', commsOpen);
  await page.waitForTimeout(600);
  const hub = await page.evaluate(() => {
    const h = document.querySelector('button.sf-commsfan__hub');
    const r = h && h.getBoundingClientRect();
    return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (hub) {
    await page.mouse.move(hub.x, hub.y);
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => {
      const items = [...document.querySelectorAll('#sf-comms .sf-comm')].map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          cls: el.className, op: cs.opacity, tf: cs.transform.slice(0, 60), anim: cs.animationName, trans: cs.transitionProperty.slice(0, 40) };
      });
      const feed = document.querySelector('#sf-comms');
      return { count: items.length, items: items.slice(0, 6), feedRect: feed && feed.getBoundingClientRect().toJSON(), feedOverflow: feed && getComputedStyle(feed).overflow };
    });
    console.log('comms after hover:', JSON.stringify(after, null, 1).slice(0, 2200));
    await shot(page, 'commsfan-hover');
  }
} finally { await browser.close().catch(() => {}); server.kill(); }
