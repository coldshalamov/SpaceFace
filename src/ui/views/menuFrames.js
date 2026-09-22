// Menu presentation only. The screen controllers retain save lookup, navigation and confirmations.
//
// Both frames are Deckplate assemblies as of 2026-09-22 (design/frontend/THE_BAR.md). They used to
// be Field Hardware kit assemblies, and the bench picture of what that produced is why they are
// not any more: a wordmark with naked text under it, a 64x787 painted-and-empty decorative rail
// down the left edge, an orphan status pill floating near the bottom, and a pause menu crammed
// into a quarter of the frame with a section header over nothing.
//
// The composition both frames now share, because a title and a pause that share a skeleton are the
// cheapest consistency this game can buy:
//
//     head   the one display element — an etched eyebrow that carries live state, the milled
//            nameplate, and a rule that runs out to the frame edge and anchors it
//     body   a standing left column (--dp-col) holding the verbs; the lit world keeps the rest
//     foot   the quiet line — fine words, build identity
//
// The decorative rail is gone rather than repaired. Its job was to put a piece of hardware beside
// the verbs; dp-menu__item's lamp rail does that with hardware that also carries STATE, which is
// the whole difference between an ornament and an instrument.

import { el } from '../kit/dom.js';

/**
 * The title's authored backdrop plate: the approved "Field at dusk" shot
 * (design/frontend/direction/approved/DECISIONS.md, 2026-09-10). Holds the frame while
 * `title-field` assembles on the main renderer, and is the whole picture if the stage cannot run.
 */
export const TITLE_PLATE_SRC = new URL('../../../assets/ui/backdrops/backdrop-title.jpg', import.meta.url).href;

export function createTitleFrame(root) {
  root.classList.add('of-title', 'dp-frame', 'dp-frame--screen', 'dp-frame--split');
  root.dataset.dp = '1';
  // `k-world` is the uiStage's own backdrop contract (absolute, z-index -2, behind the frame) and
  // stays: it is where the lit scene is drawn, not a UI treatment.
  const backdrop = el('div', 'k-world k-world--plate');
  backdrop.setAttribute('aria-hidden', 'true');

  const head = el('header', 'dp-frame__head');
  const title = el('div', 'dp-title');
  // The eyebrow does a job instead of decorating one: it is where the live contract line lives, so
  // the status strip that used to float loose near the bottom of the frame now sits in the one
  // place a reader is already looking. Its lamp bead is lit whenever there is something open.
  const status = el('p', 'dp-title__eyebrow');
  status.dataset.role = 'title-status';
  status.dataset.live = '1';
  status.textContent = 'Contract 47-A remains open';
  // The game's name is the DRAWN mark, not the nameplate face. The h1 keeps its text for the
  // accessibility tree and for forced colours; the mask paints over it.
  const name = el('h1', 'dp-logotype', 'SpaceFace');
  const rule = el('div', 'dp-title__rule');
  rule.setAttribute('aria-hidden', 'true');
  title.append(status, name, rule);
  head.appendChild(title);

  const body = el('div', 'dp-frame__body');
  const stage = el('nav', 'dp-frame__col of-title-actions');
  stage.setAttribute('aria-label', 'Main menu');
  body.appendChild(stage);

  for (const node of [backdrop, head, body]) root.appendChild(node);
  return { backdrop, title: head, stage, status };
}

export function createPauseFrame(root, { titleText = 'Paused' } = {}) {
  root.classList.add('of-pause', 'dp-frame', 'dp-frame--screen', 'dp-frame--split');
  root.dataset.dp = '1';

  const head = el('header', 'dp-frame__head');
  const title = el('div', 'dp-title');
  const eyebrow = el('p', 'dp-title__eyebrow');
  eyebrow.dataset.role = 'pause-eyebrow';
  eyebrow.textContent = 'Flight held';
  title.append(eyebrow, el('h1', 'dp-title__name', titleText), Object.assign(
    el('div', 'dp-title__rule'), { ariaHidden: 'true' },
  ));
  head.appendChild(title);

  // The brief is a plate on the deck, not a paragraph in the header: it is a READING (what you were
  // doing, what is next, when you last saved), so it gets the instrument treatment. `sf-pause-brief`
  // and the polite live region are an accessibility contract check:pause-brief asserts — the class
  // stays as a hook, the material comes from Deckplate.
  const brief = el('section', 'sf-pause-brief dp-plate dp-pad dp-stack');
  brief.setAttribute('aria-live', 'polite');
  const briefKicker = el('span', 'dp-etch sf-slot-sub');
  const briefObjective = el('p', 'dp-read sf-slot-name');
  const briefNext = el('p', 'dp-copy sf-muted');
  const briefSave = el('p', 'dp-copy dp-copy--fine sf-slot-sub');
  for (const node of [briefKicker, briefObjective, briefNext, briefSave]) brief.appendChild(node);

  const body = el('div', 'dp-frame__body');
  // The verbs and the brief share one scrolling column, so a long pause list ends inside the frame
  // instead of under the bezel — which is the entire reason styles/pause.css existed.
  const column = el('div', 'dp-frame__col dp-frame__scroll');
  column.appendChild(brief);
  body.appendChild(column);

  root.append(head, body);
  return { title: head, briefKicker, briefObjective, briefNext, briefSave, column, body };
}
