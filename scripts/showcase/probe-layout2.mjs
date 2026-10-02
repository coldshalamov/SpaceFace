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
  const cs = (sel, props) => { const el = document.querySelector(sel); if (!el) return null; const s = getComputedStyle(el); const o = {}; for (const p of props) o[p] = s[p]; return o; };
  return {
    reading: cs('.orr-armory-reading', ['display','gridTemplateColumns','position','width','left','overflow']),
    visual: cs('.orr-armory-visual', ['display','gridColumn','gridRow','position','width','flexDirection','flexWrap']),
    words: cs('.orr-armory-reading__words', ['gridColumn','gridRow','position','overflow']),
    item: cs('.orr-armory-item', ['width','height','minHeight']),
    jig: cs('.orr-armory-reading__jig', ['width','height','minHeight']),
    build: cs('.orr-armory-build', ['position','width']),
    screen: cs('.k-screen', ['display','gridTemplateColumns','gridTemplateRows']),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close(); server.close();
