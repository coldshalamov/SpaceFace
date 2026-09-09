// Menu presentation only. The screen controllers retain save lookup, navigation and confirmations.
import { el } from '../kit/dom.js';

export const TITLE_PLATE_SRC = new URL('../../../assets/ui/orbital/orbit-plate.svg', import.meta.url).href;
export function createTitleFrame(root) {
  root.classList.add('of-title');
  const backdrop = el('div', 'k-world of-title-art');
  backdrop.setAttribute('aria-hidden', 'true');
  const ship = el('img', 'of-title-art__ship');
  ship.src = new URL('../../../assets/ui/hud/ship-condition-scout.png', import.meta.url).href;
  ship.alt = ''; ship.draggable = false; ship.decoding = 'async';
  backdrop.appendChild(ship);
  const title = el('header', 'k-title');
  const brand = el('div', 'of-brand-mark'); brand.setAttribute('aria-hidden', 'true');
  title.appendChild(brand); title.appendChild(el('h1', 'k-display k-t-name', 'SpaceFace'));
  title.appendChild(el('p', 'of-title-line', 'Make a living. Leave a mark.'));
  const stage = el('nav', 'k-stage of-title-actions');
  stage.setAttribute('aria-label', 'Main menu');
  const signature = el('div', 'of-title-caption');
  signature.setAttribute('aria-hidden', 'true');
  signature.appendChild(el('span', '', 'Trade. Fight. Build.')); signature.appendChild(el('span', '', 'The belt is yours to cross.'));
  for (const node of [backdrop, title, stage, signature]) root.appendChild(node);
  return { backdrop, title, stage };
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
