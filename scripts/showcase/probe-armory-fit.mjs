// Verify the tall-viewport fold: at 1920x1080 the full dossier must fit inside the
// reading pane's scroll viewport — every offer on the rail, worst case reported.
import { bootShowcase } from './lib/harness.mjs';

const vp = {
  width: Number(process.env.PROBE_W) || 1920,
  height: Number(process.env.PROBE_H) || 1080,
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
  const ids = await sh(() => [...document.querySelectorAll('.sf-cru-card')].map((c) => c.dataset.offerId || '').filter(Boolean));
  const rows = [];
  for (const id of ids) {
    await sh((offerId) => {
      const card = document.querySelector(`.sf-cru-card[data-offer-id="${offerId}"]`);
      if (card) { card.focus(); card.dispatchEvent(new Event('focusin', { bubbles: true })); }
    }, id);
    await settle(120);
    const row = await sh((offerId) => {
      const main = document.querySelector('.orr-armory-reading__main');
      return {
        id: offerId,
        scrollH: main ? main.scrollHeight : 0,
        clientH: main ? main.clientHeight : 0,
        over: main ? main.scrollHeight - main.clientHeight : 0,
      };
    }, id);
    rows.push(row);
  }
  rows.sort((a, b) => b.over - a.over);
  const worst = rows[0];
  const overflowing = rows.filter((r) => r.over > 0);
  console.log(JSON.stringify({
    viewport: vp,
    cards: rows.length,
    overflowing: overflowing.length,
    worst,
    top5: rows.slice(0, 5),
    pass: overflowing.length === 0,
  }, null, 1));
} finally {
  await browser.close();
  await server.close();
}
