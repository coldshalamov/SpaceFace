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
const out = await sh(() => {
  const r = document.querySelector('.orr-armory-reading');
  const vis = r.querySelector('.orr-armory-visual');
  const words = r.querySelector('.orr-armory-reading__words');
  return {
    readingChildren: [...r.children].map((c) => c.className),
    visualChildren: [...vis.children].map((c) => c.className),
    wordsParent: words.parentElement.className,
    wordsTop: words.getBoundingClientRect().top,
    readingScrollTop: r.scrollTop,
    readingGridRows: getComputedStyle(r).gridTemplateRows,
    visGridRow: getComputedStyle(vis).gridRowStart + '/' + getComputedStyle(vis).gridRowEnd,
    wordsGridRow: getComputedStyle(words).gridRowStart + '/' + getComputedStyle(words).gridRowEnd,
    visBox: vis.getBoundingClientRect().toJSON ? vis.getBoundingClientRect() : {},
    buildParent: r.querySelector('.orr-armory-build').parentElement.className,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close(); server.close();
