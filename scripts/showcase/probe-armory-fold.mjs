// Verify the short-viewport fold: at <=1150w/<=720h the 'when it pays' line must
// start above the reading pane's scroll fold (the fold = name + tip, not the clip).
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
    const r = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { top: b.top | 0, bottom: b.bottom | 0, h: b.height | 0, text: (el.textContent || '').slice(0, 60) };
    };
    const main = document.querySelector('.orr-armory-reading__main');
    const mb = main && main.getBoundingClientRect();
    const fold = mb && (mb.bottom | 0); // visible bottom of the scroll viewport
    const parts = {};
    for (const k of ['verb', 'name', 'blurb', 'act', 'tip', 'detail']) {
      parts[k] = r(`.orr-armory-reading__${k}`);
    }
    const tip = parts.tip;
    return {
      viewport: { w: innerWidth, h: innerHeight },
      fold,
      parts,
      tipAboveFold: !!(tip && fold) && tip.top < fold,
      tipFullyVisible: !!(tip && fold) && tip.bottom <= fold + 1,
      nameAboveFold: !!(parts.name && fold) && parts.name.top < fold,
      mainClientH: main && main.clientHeight,
    };
  });
  console.log(JSON.stringify(out, null, 1));
  await page.screenshot({ path: 'media/armory-fold-960.png' });
} finally {
  await browser.close();
  await server.close();
}
