// Menu presentation only. The screen controllers retain save lookup, navigation and confirmations.
import { el } from '../kit/dom.js';

/**
 * The title's authored backdrop plate: the approved "Field at dusk" shot
 * (design/frontend/direction/approved/DECISIONS.md, 2026-09-10), rendered from the same geometry
 * the live stage assembles. It is the FALLBACK, not the picture — `src/render/uiStage.js` draws
 * that world in three dimensions on the game's own context, and `styles/kit.css` fades this plate
 * out the moment the stage reports live. A screen is never black and never *only* a photograph.
 */
export const TITLE_PLATE_SRC = new URL('../../../assets/ui/backdrops/backdrop-title.jpg', import.meta.url).href;
export function createTitleFrame(root) {
  root.classList.add('of-title');
  // The old title art was a rotated PNG of a scout hull on a flat ground — the exact fake this
  // packet names. The world behind the words is now a lit scene in the renderer.
  const backdrop = el('div', 'k-world k-world--plate');
  backdrop.setAttribute('aria-hidden', 'true');
  const title = el('header', 'k-title');
  const brand = el('div', 'of-brand-mark'); brand.setAttribute('aria-hidden', 'true');
  title.appendChild(brand); title.appendChild(el('h1', 'k-display k-t-name', 'SpaceFace'));
  // Frame status strip — produced legend plate, not a slogan under the wordmark.
  const status = el('p', 'of-title-line');
  status.dataset.role = 'title-status';
  title.appendChild(status);
  const stage = el('nav', 'k-stage of-title-actions');
  stage.setAttribute('aria-label', 'Main menu');
  for (const node of [backdrop, title, stage]) root.appendChild(node);
  return { backdrop, title, stage, status };
}

export function createPauseFrame(root, { titleText = 'Paused', briefLabel = 'Flight brief' } = {}) {
  root.classList.add('of-pause');
  const title = el('header', 'k-title');
  title.appendChild(el('h1', 'k-display k-t-title', titleText));
  const brief = el('section', 'sf-pause-brief');
  brief.setAttribute('aria-live', 'polite');
  const briefKicker = el('span', 'k-caps sf-slot-sub', briefLabel);
  const briefObjective = el('p', 'k-sentence k-sentence--emph sf-slot-name');
  const briefNext = el('p', 'k-sentence sf-muted');
  const briefSave = el('p', 'k-t-fine k-38 sf-slot-sub');
  for (const node of [briefKicker, briefObjective, briefNext, briefSave]) brief.appendChild(node);
  title.appendChild(brief); root.appendChild(title);
  return { title, briefObjective, briefNext, briefSave };
}
