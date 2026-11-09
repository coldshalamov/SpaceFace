// ORRERY composition owned by the Credits screen (design/frontend/ORRERY.md §6 Meta —
// "Credits: Scroll Reveal over the Drift Field"). Credits keeps its own orrery here because the
// emblem's geometry is section-count-driven: the shared settingsLayouts.credits orrery pinned a
// five-section step (72°), and credits now carries six sections — bodies 01 and 06 landed on the
// same angle and printed over each other (ui-bench credits, 2026-10-24). This one derives the step
// from the section list, so any section count spreads its bodies evenly on the orbit.
//
// The screen's own sheet (styles/credits.css) and the shared sheet injected by
// settingsLayouts.js style the classes used here; keep those class names stable.
//
// ui-polish-387: reel sections and third-party notices wear hairline cards (1px bone ~18% /
// radius 10 / faint fill) in the same family as the statistics empty-state promise-scale and
// Help terms, so the reel stops reading as unbound Newgrounds text over the drift field.
import { svg, arcD, ticksD, polar } from './svg.js';
import { createSpring } from './motion.js';

const STYLE_ID = 'sf-orrery-credits-layouts';
const BONE = '236 230 216';
const C = 'html body #screens > .k-screen.of-credits.orr-credits';

export const CREDITS_LAYOUT_CSS = `
/* reel sections (except the Notices wrapper) + each licence notice: hairline cards
   in the promise-scale family. Notices keep their own cards so the section does not
   double-box them. */
${C} .orr-cr-sec:not(:has(> .of-credits-notice)) {
  box-sizing:border-box;
  padding:clamp(12px, 1.5vh, 20px) clamp(14px, 1.5vw, 22px);
  border:1px solid rgb(${BONE} / .18);
  border-radius:10px;
  background:rgb(${BONE} / .025);
}
${C} .orr-cr-sec + .orr-cr-sec { margin-top:clamp(22px, 3.2vh, 48px); }
${C} .orr-cr-head { margin-bottom:14px !important; }
/* keep the Made-by display name inside the card on narrow frames */
${C} .of-credits-name {
  max-width:100% !important;
  overflow-wrap:anywhere !important;
  word-break:break-word !important;
}
${C} .of-credits-notice {
  box-sizing:border-box !important;
  padding:clamp(12px, 1.4vh, 18px) clamp(14px, 1.4vw, 20px) !important;
  margin:0 0 clamp(14px, 2vh, 22px) !important;
  border:1px solid rgb(${BONE} / .18) !important;
  border-radius:10px !important;
  background:rgb(${BONE} / .025) !important;
  border-image:none !important;
  box-shadow:none !important;
  clip-path:none !important;
}
/* bead sits inside the card padding instead of the old 30px left gutter */
${C} .of-credits-notice::before {
  left:clamp(12px, 1.4vw, 18px) !important;
  top:clamp(16px, 1.6vh, 22px) !important;
}
${C} .of-credits-rows {
  background:transparent !important;
  padding:2px 0 !important;
}
${C} .of-credits-rows .k-row::before {
  left:0 !important;
}

/* phone / narrow: shrink the Made-by display so SPACEFACE clears the hairline */
@media (max-width:700px) {
  ${C} .orr-cr-sec:not(:has(> .of-credits-notice)) {
    padding:12px 12px;
  }
  ${C} .of-credits-name {
    font-size:clamp(28px, 9.2vw, 48px) !important;
    line-height:.92 !important;
  }
}

/* short frames: compress card chrome with the existing densify bands */
@media (max-height:820px) {
  ${C} .orr-cr-sec:not(:has(> .of-credits-notice)) {
    padding:10px 12px;
    border-radius:8px;
  }
  ${C} .orr-cr-sec + .orr-cr-sec { margin-top:18px; }
  ${C} .of-credits-notice {
    padding:10px 12px !important;
    margin:0 0 12px !important;
    border-radius:8px !important;
  }
}
/* ui-polish-440: a short wide window (901+ wide, 461-640 tall, e.g. 960x540). The foot row ran
   under both columns, so the reel stage stopped at the BACK row's top and the next card (TYPE)
   peeked as an empty 35px hairline box under the fade (ui-bench credits, 2026-11-09). BACK only
   needs the hang column, so the stage now runs down beside it and the next card's head reads. */
@media (min-width:901px) and (min-height:461px) and (max-height:640px) {
  html:root body #screens > .k-screen.of-credits.orr-credits {
    grid-template-areas:"title title" "hang stage" "foot stage" !important; }
}
@media (max-height:460px) {
  ${C} .orr-cr-sec:not(:has(> .of-credits-notice)) {
    padding:8px 10px;
    border-radius:6px;
  }
  ${C} .orr-cr-sec + .orr-cr-sec { margin-top:12px; }
  ${C} .of-credits-notice {
    padding:8px 10px !important;
    margin:0 0 8px !important;
    border-radius:6px !important;
  }
}
`;

/** Inject Credits hairline-card overrides after settingsLayouts so cascade wins. */
export function injectCreditsLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return;
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CREDITS_LAYOUT_CSS;
  doc.head.appendChild(style);
}

/**
 * The Credits orrery (the screen's signature): the emblem, produced art, is turned by the reel. Each
 * section is a body on its one orbit, evenly spaced (360° / sections); the amber Hand is fixed,
 * pointing back at the reel, and the orrery turns so the body being read comes round under it.
 * `setPosition(s)` takes the reel's position in sections (0 = the first, fractional between them) and
 * swings there on the Hand's spring; reduced motion goes there at once. Returns null on a document
 * without SVG.
 */
export function createCreditsOrrery(doc = globalThis.document, sections = []) {
  if (!doc || typeof doc.createElementNS !== 'function' || typeof doc.createElement !== 'function') return null;
  const el = doc.createElement('div');
  el.className = 'orr-cr-orrery';
  el.setAttribute('aria-hidden', 'true');
  const art = doc.createElement('i');
  art.className = 'orr-cr-orrery__art';
  const litWrap = doc.createElement('i');
  litWrap.className = 'orr-cr-orrery__lit';
  const litArt = doc.createElement('i');
  litArt.className = 'orr-cr-orrery__art';
  litWrap.appendChild(litArt);
  const C0 = 500;
  const ORBIT = 400;
  const STEP = 360 / Math.max(1, sections.length);
  const HAND = 270;
  const s = svg('svg', { class: 'orr-svg orr-cr-orrery__svg', viewBox: '0 0 1000 1000' });
  const rotor = svg('g', { class: 'orr-cr-orrery__rotor' });
  // the orbit the sections ride: an annulus of light with its ticks cut through, a rim core over its bloom
  rotor.appendChild(svg('circle', { cx: C0, cy: C0, r: ORBIT, fill: 'none', stroke: 'rgb(236 230 216 / .3)', 'stroke-width': 16 }));
  rotor.appendChild(svg('path', { d: ticksD(C0, C0, ORBIT + 8, 90, { len: 16, major: 0 }), stroke: 'rgb(5 7 10)', 'stroke-width': 2.5, fill: 'none' }));
  rotor.appendChild(svg('circle', { cx: C0, cy: C0, r: ORBIT + 8, fill: 'none', stroke: 'rgb(236 230 216 / .14)', 'stroke-width': 10 }));
  rotor.appendChild(svg('circle', { cx: C0, cy: C0, r: ORBIT + 8, fill: 'none', stroke: 'rgb(236 230 216 / .62)', 'stroke-width': 2.5 }));
  const bodies = sections.map((sec, i) => {
    const a = HAND + STEP * i;
    const [bx, by] = polar(C0, C0, ORBIT, a);
    const g = svg('g', { class: 'orr-cr-body' });
    g.appendChild(svg('circle', { cx: bx.toFixed(1), cy: by.toFixed(1), r: 30, class: 'orr-cr-body__halo' }));
    g.appendChild(svg('circle', { cx: bx.toFixed(1), cy: by.toFixed(1), r: 14, class: 'orr-cr-body__disc', 'stroke-width': 3 }));
    const label = svg('g', { class: 'orr-cr-body__label' });
    const num = svg('text', { x: bx.toFixed(1), y: (by - 34).toFixed(1), 'text-anchor': 'middle', class: 'orr-cr-body__num' });
    num.textContent = String(i + 1).padStart(2, '0');
    const nm = svg('text', { x: bx.toFixed(1), y: (by + 54).toFixed(1), 'text-anchor': 'middle', class: 'orr-cr-body__name' });
    // the caption under the Hand carries the ladder's short word: the full name lives in the reel head
    // right beside it, and a wide caption would reach back into the reel's own column
    nm.textContent = sec.tab || sec.label;
    label.append(num, nm);
    g.appendChild(label);
    rotor.appendChild(g);
    return { g, label, bx, by };
  });
  s.appendChild(rotor);
  // the Hand: fixed, from the hub back toward the reel, holding the current body at its tip
  // the stretch of orbit under the Hand is lit (fixed while the plate turns under it)
  const catchArc = svg('g', { class: 'orr-cr-orrery__catch' });
  catchArc.appendChild(svg('path', { d: arcD(C0, C0, ORBIT, HAND - 20, HAND + 20), stroke: 'rgb(248 244 234 / .44)', 'stroke-width': 16, fill: 'none', 'stroke-linecap': 'butt' }));
  catchArc.appendChild(svg('path', { d: arcD(C0, C0, ORBIT + 8, HAND - 20, HAND + 20), stroke: 'rgb(255 253 248 / .95)', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }));
  catchArc.appendChild(svg('path', { d: arcD(C0, C0, ORBIT, HAND - 20, HAND + 20), stroke: 'rgb(255 250 236 / .16)', 'stroke-width': 34, fill: 'none', 'stroke-linecap': 'butt' }));
  s.insertBefore(catchArc, rotor);
  const hand = svg('g', { class: 'orr-cr-orrery__hand' });
  const [h0x, h0y] = polar(C0, C0, 34, HAND);
  const [h1x, h1y] = polar(C0, C0, ORBIT - 24, HAND);
  hand.appendChild(svg('path', { d: `M ${h0x} ${h0y} L ${h1x} ${h1y}`, stroke: 'rgb(242 185 80 / .3)', 'stroke-width': 14, fill: 'none' }));
  hand.appendChild(svg('path', { d: `M ${h0x} ${h0y} L ${h1x} ${h1y}`, stroke: 'var(--dp-hand, #f2b950)', 'stroke-width': 4, fill: 'none' }));
  hand.appendChild(svg('path', { d: `M ${h1x + 12} ${h1y - 11} L ${h1x} ${h1y} L ${h1x + 12} ${h1y + 11}`, stroke: 'var(--dp-hand-hot, #ffd98c)', 'stroke-width': 4, fill: 'none', 'stroke-linejoin': 'miter' }));
  hand.appendChild(svg('circle', { cx: C0, cy: C0, r: 26, fill: 'rgb(8 10 14 / .9)', stroke: 'var(--dp-hand, #f2b950)', 'stroke-width': 4 }));
  hand.appendChild(svg('circle', { cx: C0, cy: C0, r: 8, fill: 'var(--dp-hand-hot, #ffd98c)' }));
  s.appendChild(hand);
  el.append(art, litWrap, s);

  let current = -1;
  const apply = (deg) => {
    const t = `${deg.toFixed(2)}deg`;
    el.style.setProperty('--orr-cr-turn', t);
    rotor.setAttribute('transform', `rotate(${deg.toFixed(2)} ${C0} ${C0})`);
    // the words on each body stay upright while the orrery turns
    for (const b of bodies) b.label.setAttribute('transform', `rotate(${(-deg).toFixed(2)} ${b.bx.toFixed(1)} ${b.by.toFixed(1)})`);
  };
  const spring = createSpring({ value: 0, preset: 'swing', onUpdate: apply });
  apply(0);
  const mark = (i) => {
    if (i === current) return;
    current = i;
    bodies.forEach((b, k) => b.g.classList.toggle('is-current', k === i));
  };
  mark(0);
  return {
    el,
    setPosition(pos, { instant = false } = {}) {
      const p = Math.max(0, Math.min(bodies.length - 1, Number(pos) || 0));
      spring.set(-STEP * p, { instant });
      mark(Math.round(p));
    },
    dispose() { spring.stop(); },
  };
}
