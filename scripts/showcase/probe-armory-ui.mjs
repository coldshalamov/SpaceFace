// Armory dossier UI probe: boots the game, opens a swarm run's draft armory, focuses a
// weapon card, and reports whether the reading panel carries the dossier (detail/tip/stats)
// and the video clip block. Screenshots land in media/.
import { writeFile } from 'node:fs/promises';
import { bootShowcase } from './lib/harness.mjs';

const { page, browser, server } = await bootShowcase();
const sh = (expr, arg) => page.evaluate(expr, arg);
const settle = (ms) => page.waitForTimeout(ms);

try {
  // launch a swarm run, confirm the loadout, and wait for the draft/armory screen
  await sh(() => window.SF.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: 77, arenaId: 'helios_core' }));
  await settle(2500);
  // walk the phase machine to draft directly (the test-harness path): the run landed in
  // loadout, ask for the draft transition so survivalDraft's card row opens.
  await sh(() => window.SF.bus.emit('run:transitionRequested', { expectedPhase: 'loadout', nextPhase: 'draft', reason: 'probe', tick: 0 }));
  await settle(2500);
  const phase = await sh(() => window.SF.state && window.SF.state.run && window.SF.state.run.phase);
  console.log('phase:', phase);
  // the armory is the draft screen in swarm; force a first reading paint by focusing a card
  await page.waitForSelector('.sf-cru-card', { timeout: 10000 });
  const cardInfo = await sh(() => {
    const cards = [...document.querySelectorAll('.sf-cru-card')];
    const w = cards.find((c) => (c.dataset && (c.dataset.offerId || '')).includes('wpn')) || cards[0];
    if (w) { w.focus(); w.dispatchEvent(new Event('focusin', { bubbles: true })); }
    return { total: cards.length, chosen: w && w.dataset ? w.dataset.offerId : null };
  });
  console.log('cards:', cardInfo.total, 'focused:', cardInfo.chosen);
  await settle(900);
  const reading = await sh(() => {
    const q = (sel) => document.querySelector(sel);
    const text = (sel) => { const el = q(sel); return el ? el.textContent.trim().slice(0, 220) : null; };
    return {
      verb: text('.orr-armory-reading__verb'),
      name: text('.orr-armory-reading__name'),
      blurb: text('.orr-armory-reading__blurb'),
      act: text('.orr-armory-reading__act'),
      detail: text('.orr-armory-reading__detail'),
      tip: text('.orr-armory-reading__tip'),
      stats: [...document.querySelectorAll('.orr-armory-stat')].map((s) => s.textContent.trim()).slice(0, 8),
      video: (() => { const v = q('video.orr-armory-clip'); return v ? { src: v.src, readyState: v.readyState, error: v.error && v.error.code } : null; })(),
      jig: !!q('.orr-armory-reading__jig'),
      item: !!q('.orr-armory-item'),
    };
  });
  console.log(JSON.stringify(reading, null, 2));
  await page.screenshot({ path: 'media/armory-reading.png' });
  // a second pass: pick a module card to see countermeasure/utility dossier
  const second = await sh(() => {
    const cards = [...document.querySelectorAll('.sf-cru-card')];
    const m = cards.find((c) => (c.dataset.offerId || '').includes('mod_'));
    if (m) { m.focus(); m.dispatchEvent(new Event('focusin', { bubbles: true })); }
    return m ? m.dataset.offerId : null;
  });
  await settle(700);
  const reading2 = await sh(() => {
    const q = (sel) => document.querySelector(sel);
    return { detail: q('.orr-armory-reading__detail') ? q('.orr-armory-reading__detail').textContent.slice(0, 160) : null,
      stats: document.querySelectorAll('.orr-armory-stat').length };
  });
  console.log('module card:', second, JSON.stringify(reading2));
  await page.screenshot({ path: 'media/armory-reading2.png' });
} finally {
  await browser.close(); server.close();
}
console.log('done');
