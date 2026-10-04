// Verify the offer rail never degenerates to a slit: at short viewports the clipped
// rail must show at least one (nearly) whole card row, not just a divider sliver.
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
  await settle(800); // let the fonts-ready re-clip land
  const out = await sh(() => {
    const cards = document.querySelector('.sf-cru-cards');
    const firstCard = cards && cards.querySelector('.sf-cru-card');
    const rect = (el) => el && el.getBoundingClientRect();
    const cardsRect = rect(cards);
    const cardRect = rect(firstCard);
    const stage = rect(document.querySelector('.sf-cru-stage'));
    const filters = rect(document.querySelector('.sf-cru-filters'));
    // fraction of the first card actually visible inside the rail
    const cardVisible = cardsRect && cardRect
      ? Math.max(0, Math.min(cardRect.bottom, cardsRect.bottom) - Math.max(cardRect.top, cardsRect.top))
      : 0;
    return {
      viewport: { w: innerWidth, h: innerHeight },
      stageH: stage && stage.height | 0,
      filtersH: filters && filters.height | 0,
      railClientH: cards && cards.clientHeight,
      railScrollH: cards && cards.scrollHeight,
      railMaxH: cards && getComputedStyle(cards).maxHeight,
      firstCardH: cardRect && cardRect.height | 0,
      firstCardVisible: cardVisible | 0,
      deadSpace: cardsRect ? (stage ? stage.bottom - cardsRect.bottom : 0) | 0 : null,
      pass: !!(firstCard && cardVisible >= (cardRect.height - 4)),
    };
  });
  console.log(JSON.stringify(out, null, 1));
} finally {
  await browser.close();
  await server.close();
}
