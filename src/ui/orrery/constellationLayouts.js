// src/ui/orrery/constellationLayouts.js — the ORRERY composition for the two meta screens built on the
// constellation instruments (design/frontend/ORRERY.md §6 Meta): Research (the Research Constellation,
// src/ui/orrery/constellation.js) and Achievements (the medal ring grid,
// src/ui/orrery/constellationMedals.js). Layout and type only: where the instrument, its reading and
// the foot sit, and how the words read. Nothing here draws a box: the reading stands on a pool of shade
// with soft edges, the verbs are words, the one filled shape is the Lamp Key. Scoped to each screen's
// root (#sf-techtree.con-research, .con-achievements) so nothing reaches another screen; `!important`
// only where the kit or the Deckplate bridge pins a property with it.

const BONE = '236 230 216';
const WARM = '248 244 234';
const STYLE_ID = 'orr-constellation-screens';

import { loadCssSidecar } from './cssSidecar.js';

export function injectConstellationScreens(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.createElement !== 'function') return Promise.resolve();
  return loadCssSidecar(doc, {
    id: STYLE_ID,
    path: 'styles/constellation.generated.css',
    fallback: () => import('./constellationCssSource.js').then((module) => module.CONSTELLATION_CSS),
  });
}

/** The legend's glyph: the star a node of that state is, drawn the way the dial draws it. */
export function legendStarSvg(kind, art = '') {
  const box = '<svg viewBox="-14 -14 28 28" aria-hidden="true" focusable="false">';
  const mark = 'M0 -3.4 L3.4 0 L0 3.4 L-3.4 0 Z';
  if (kind === 'available') {
    // open: the produced star's spikes behind a lit ring, its glyph lit
    return box + (art ? `<image href="${art}" x="-10.4" y="-10.4" width="20.8" height="20.8" opacity=".9"></image>` : '')
      + `<circle r="11" fill="rgb(${WARM})" opacity=".1"></circle><circle r="6.6" fill="rgb(5 7 10)" stroke="rgb(${WARM})" stroke-width="1.8"></circle>`
      + `<path d="${mark}" fill="none" stroke="rgb(${WARM})" stroke-width="1.3" stroke-linejoin="round"></path></svg>`;
  }
  if (kind === 'locked') {
    // locked: a dark body, its ring over a band of light, its glyph plain on it
    return box + `<circle r="6.8" fill="none" stroke="rgb(${BONE} / .31)" stroke-width="5"></circle>`
      + `<circle r="6.6" fill="rgb(44 43 40)" stroke="rgb(${BONE} / .56)" stroke-width="1.6"></circle>`
      + `<path d="${mark}" fill="none" stroke="rgb(${BONE} / .66)" stroke-width="1.3" stroke-linejoin="round"></path></svg>`;
  }
  if (art) {
    // the produced star itself, lit the way the dial lights it
    const k = kind === 'researched' ? 1 : kind === 'available' ? 0.74 : 0.5;
    const o = kind === 'researched' ? 1 : kind === 'available' ? 0.95 : 0.45;
    return `<svg viewBox="-14 -14 28 28" aria-hidden="true" focusable="false"><image href="${art}" x="${-14 * k}" y="${-14 * k}" width="${28 * k}" height="${28 * k}" opacity="${o}"></image></svg>`;
  }
  const open = '<svg viewBox="-8 -8 16 16" aria-hidden="true" focusable="false">';
  if (kind === 'researched') {
    return `${open}<circle r="6.5" fill="rgb(${WARM})" opacity=".18"></circle><path d="M-8 0H8M0-8V8" stroke="rgb(${WARM})" stroke-width="1" opacity=".7"></path>`
      + `<circle r="3.6" fill="rgb(${WARM})"></circle></svg>`;
  }
  if (kind === 'available') {
    return `${open}<circle r="4" fill="rgb(5 7 10)" stroke="rgb(${WARM})" stroke-width="1.5"></circle><circle r="1.7" fill="rgb(${WARM})"></circle></svg>`;
  }
  return `${open}<circle r="4" fill="rgb(5 7 10)" stroke="rgb(${BONE} / .45)" stroke-width="1" stroke-dasharray="2 2.2"></circle><circle r="1.4" fill="rgb(${BONE} / .6)"></circle></svg>`;
}
