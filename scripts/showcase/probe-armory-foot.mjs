// Verify the docked armory footer: Install must be inside the reading pane at scrollTop=0.
import { bootShowcase } from './lib/harness.mjs';

const vp = {
  width: Number(process.env.PROBE_W) || 960,
  height: Number(process.env.PROBE_H) || 540,
};
const { page, browser, server } = await bootShowcase({ viewport: vp });
const sh = (expr, arg) => page.evaluate(expr, arg);
const settle = (ms) => page.waitForTimeout(ms);

try {
  await sh(() => window.SF.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: 77, arenaId: 'helios_core' }));
  await settle(2500);
  await sh(() => window.SF.bus.emit('run:transitionRequested', { expectedPhase: 'loadout', nextPhase: 'draft', reason: 'probe', tick: 0 }));
  await settle(2500);
  await page.waitForSelector('.sf-cru-card', { timeout: 10000 });
  await sh(() => {
    const cards = [...document.querySelectorAll('.sf-cru-card')];
    const w = cards.find((c) => (c.dataset.offerId || '').includes('wpn')) || cards[0];
    w.focus(); w.dispatchEvent(new Event('focusin', { bubbles: true }));
  });
  await settle(1200);
  const out = await sh(() => {
    const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x | 0, y: b.y | 0, w: b.width | 0, h: b.height | 0, bottom: b.bottom | 0 }; };
    const reading = document.querySelector('.orr-armory-reading');
    const main = document.querySelector('.orr-armory-reading__main');
    const foot = document.querySelector('.orr-armory-reading__foot');
    const buy = document.querySelector('.orr-armory-purchase');
    const budget = document.querySelector('.orr-armory-reading__budget');
    const word = document.querySelector('.orr-armory-budget__word');
    return {
      reading: r('.orr-armory-reading'),
      main: r('.orr-armory-reading__main'),
      foot: r('.orr-armory-reading__foot'),
      buy: r('.orr-armory-purchase'),
      budget: r('.orr-armory-reading__budget'),
      buyText: buy && buy.textContent,
      mainScrollTop: main && main.scrollTop,
      mainScrollH: main && main.scrollHeight,
      mainClientH: main && main.clientHeight,
      mainOverflow: main && getComputedStyle(main).overflowY,
      readingOverflow: reading && getComputedStyle(reading).overflow,
      buyInsidePane: !!(reading && buy) && buy.getBoundingClientRect().bottom <= reading.getBoundingClientRect().bottom + 1,
      walletWordX: word && word.getAttribute('x'),
      walletWordLen: word && word.getComputedTextLength && word.getComputedTextLength(),
    };
  });
  console.log(JSON.stringify(out, null, 2));
  // scroll the dossier deep — the footer must stay pinned
  await sh(() => { const m = document.querySelector('.orr-armory-reading__main'); if (m) m.scrollTop = m.scrollHeight; });
  await settle(400);
  const deep = await sh(() => {
    const buy = document.querySelector('.orr-armory-purchase');
    const reading = document.querySelector('.orr-armory-reading');
    return { buyBottom: buy && (buy.getBoundingClientRect().bottom | 0), paneBottom: reading && (reading.getBoundingClientRect().bottom | 0) };
  });
  console.log('deep-scroll:', JSON.stringify(deep));
  await page.screenshot({ path: `media/armory-foot-${vp.width}x${vp.height}.png` });
} finally {
  await browser.close(); server.close();
}
