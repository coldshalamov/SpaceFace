import { bootShowcase } from './lib/harness.mjs';
const { page, browser, server } = await bootShowcase();
const sh = (expr, arg) => page.evaluate(expr, arg);
await sh(() => window.SF.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: 77, arenaId: 'helios_core' }));
await page.waitForTimeout(2500);
await sh(() => window.SF.bus.emit('run:transitionRequested', { expectedPhase: 'loadout', nextPhase: 'draft', reason: 'probe', tick: 0 }));
await page.waitForTimeout(2500);
await page.waitForSelector('.sf-cru-card', { timeout: 10000 });
await sh(() => { const c = document.querySelector('.sf-cru-card'); c.focus(); c.dispatchEvent(new Event('focusin', { bubbles: true })); });
await page.waitForTimeout(800);
const boxes = await sh(() => {
  const box = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  return {
    reading: box('.orr-armory-reading'),
    visual: box('.orr-armory-visual'),
    item: box('.orr-armory-item'),
    label: box('.orr-armory-object-label'),
    jig: box('.orr-armory-reading__jig'),
    build: box('.orr-armory-build'),
    words: box('.orr-armory-reading__words'),
    detail: box('.orr-armory-reading__detail'),
    tip: box('.orr-armory-reading__tip'),
    stats: box('.orr-armory-reading__stats'),
    compare: box('.orr-armory-reading__compare'),
    fitline: box('.orr-armory-fitline'),
  };
});
console.log(JSON.stringify(boxes, null, 1));
await browser.close(); server.close();
