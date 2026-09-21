// Menu presentation only. The screen controllers retain save lookup, navigation and confirmations.
import { el } from '../kit/dom.js';

/**
 * The title's authored backdrop plate: the approved "Field at dusk" shot
 * (design/frontend/direction/approved/DECISIONS.md, 2026-09-10). Holds the frame while
 * `title-field` assembles on the main renderer, and is the whole picture if the stage cannot run.
 */
export const TITLE_PLATE_SRC = new URL('../../../assets/ui/backdrops/backdrop-title.jpg', import.meta.url).href;
export function createTitleFrame(root) {
  root.classList.add('of-title');
  root.setAttribute('data-fh-register', 'poster');
  // Authored still while the uiStage assembles (and the whole picture if the stage cannot run).
  const backdrop = el('div', 'k-world k-world--plate');
  backdrop.setAttribute('aria-hidden', 'true');
  const title = el('header', 'k-title');
  const brand = el('div', 'of-brand-mark'); brand.setAttribute('aria-hidden', 'true');
  title.appendChild(brand); title.appendChild(el('h1', 'k-display k-t-name', 'SpaceFace'));
  // Frame status strip — produced `plate.legend.strip`, not a slogan under the wordmark.
  // It is a child of the screen root (not the settling `.k-title`) so `position:absolute`
  // resolves against the POSTER frame, not a transformed header.
  const status = el('p', 'of-title-line fh-legend');
  status.dataset.role = 'title-status';
  status.dataset.fhLit = 'on';
  status.textContent = 'Contract 47-A remains open';
  const stage = el('nav', 'k-stage of-title-actions');
  stage.setAttribute('aria-label', 'Main menu');
  for (const node of [backdrop, title, status, stage]) root.appendChild(node);
  return { backdrop, title, stage, status };
}

export function createPauseFrame(root, { titleText = 'Paused' } = {}) {
  root.classList.add('of-pause');
  const title = el('header', 'k-title');
  title.appendChild(el('h1', 'k-display k-t-title', titleText));
  const brief = el('section', 'sf-pause-brief');
  brief.setAttribute('aria-live', 'polite');
  // Structure only: the kicker's words are the screen's copy (check:pause-brief asserts the screen
  // renders them from the localized core copy), the same way every other label on the sheet is.
  const briefKicker = el('span', 'k-caps sf-slot-sub');
  const briefObjective = el('p', 'k-sentence k-sentence--emph sf-slot-name');
  const briefNext = el('p', 'k-sentence sf-muted');
  const briefSave = el('p', 'k-t-fine k-38 sf-slot-sub');
  for (const node of [briefKicker, briefObjective, briefNext, briefSave]) brief.appendChild(node);
  title.appendChild(brief); root.appendChild(title);
  return { title, briefKicker, briefObjective, briefNext, briefSave };
}
