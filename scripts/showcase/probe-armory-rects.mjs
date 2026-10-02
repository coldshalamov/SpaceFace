// Measure armory visual-column boxes at a narrow viewport to find overlaps.
import { bootShowcase } from './lib/harness.mjs';

const { page, browser, server } = await bootShowcase({ viewport: { width: 1120, height: 660 } });
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
  const boxes = await sh(() => {
    const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x | 0, y: b.y | 0, w: b.width | 0, h: b.height | 0, bottom: b.bottom | 0 }; };
    const v = document.querySelector('video.orr-armory-clip');
    const cs = (sel, props) => { const el = document.querySelector(sel); if (!el) return null; const c = getComputedStyle(el); const o = {}; for (const p of props) o[p] = c[p]; return o; };
    return {
      csItem: cs('.orr-armory-item', ['display', 'height', 'minHeight', 'position', 'overflow', 'alignItems', 'justifyItems']),
      csClip: v ? cs('video.orr-armory-clip', ['display', 'position', 'width', 'height', 'minHeight', 'maxHeight', 'aspectRatio', 'objectFit', 'alignSelf', 'justifySelf']) : null,
      csVisual: cs('.orr-armory-visual', ['display', 'height', 'maxHeight', 'overflow']),
      csReading: cs('.orr-armory-reading', ['display', 'gridTemplateColumns', 'gridTemplateRows', 'overflow']),
      reading: r('.orr-armory-reading'),
      visual: r('.orr-armory-visual'),
      item: r('.orr-armory-item'),
      clip: r('video.orr-armory-clip'),
      clipVideoW: v && v.videoWidth, clipVideoH: v && v.videoHeight,
      label: r('.orr-armory-object-label'),
      build: r('.orr-armory-build'),
      summary: r('.orr-armory-build summary'),
      scrollTop: (document.querySelector('.orr-armory-reading') || {}).scrollTop,
      scrollH: (document.querySelector('.orr-armory-reading') || {}).scrollHeight,
      clientH: (document.querySelector('.orr-armory-reading') || {}).clientHeight,
    };
  });
  console.log(JSON.stringify(boxes, null, 2));
  await page.screenshot({ path: 'media/armory-rects-1120.png' });
} finally {
  await browser.close(); server.close();
}
