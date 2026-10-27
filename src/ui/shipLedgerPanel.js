// Shared Ship Ledger panel for Station and Codex hosts. It mounts as a sibling panel (the station app and
// the Codex "Ledger" tab both mount this same factory) and renders exactly one bounded archive page
// at a time. Board changes go through the ledger owner; page and tie selection stay local.
//
// Host-safe: every DOM id is derived from `hostId`, so the same factory can mount in two hosts
// (station + codex) at once without colliding fixed IDs. Evidence rows open a single detail subtree
// with one visible image and an explicit, accessible failure state when media is not admitted.

import {
  buildShipLedger,
  SHIP_LEDGER_PAGE_SIZE,
  pinEvidence,
  unpinEvidence,
  linkEvidence,
  unlinkEvidence,
  shipLedgerBoard,
  ledgerEvidenceDetail,
  ledgerEvidencePageTitle,
} from '../systems/shipLedger.js';

export function shipLedgerEntryAriaLabel(entry) {
  if (!entry) return 'Empty ship ledger entry';
  const hand = entry.hand === 'vols' ? ' Captain Vols annotated this entry.' : '';
  return `${entry.cycleLabel}. ${entry.text}${hand}`;
}

function makeButton(label, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'k-word k-word--body st-btn st-ledger-page-btn';
  button.setAttribute('data-ledger-page', action);
  button.setAttribute('aria-label', label);
  button.textContent = label;
  return button;
}

function headingTag(level) {
  const n = Math.min(6, Math.max(1, Math.floor(Number(level)) || 2));
  return `h${n}`;
}

function removeAttr(node, name) {
  if (node && typeof node.removeAttribute === 'function') node.removeAttribute(name);
}

// The panel wears kit classes (styles/kit.css, global in both hosts): rows, words, sentences, caps.
// The evidence figure is the ONE place it needs its own injected rule — the Codex host does not load
// styles/station.css, and every authored Cathedral image is 1920x1080; left alone the figure renders
// at natural size and blows out the column. One image, no frame (Frontend Task C §1.4). Injected
// lazily, never at import time, so a headless projector-only import stays DOM-free.
const SHIP_LEDGER_CSS = `
.st-ledger .st-ledger-figure { margin: calc(16px * var(--k-s, 1)) 0 0; max-width: calc(720px * var(--k-s, 1)); }
.st-ledger .st-ledger-figure-img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; }
.st-ledger .st-ledger-figure[data-ledger-figure-state="failed"] .st-ledger-figure-img { aspect-ratio: auto; }
.st-ledger .st-ledger-figure-caption { margin-top: calc(6px * var(--k-s, 1)); color: var(--k-bone-38); font-size: var(--k-fs-fine); }
.st-ledger .st-ledger-entry-body { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; grid-template-areas: "time line type" "time note ev"; column-gap: var(--k-gap, 24px); align-items: baseline; }
.st-ledger .st-ledger-cycle { grid-area: time; }
.st-ledger .st-ledger-line { grid-area: line; margin: 0; }
.st-ledger .st-ledger-type { grid-area: type; text-align: right; }
.st-ledger .st-ledger-annotation { grid-area: note; margin: 0; }
.st-ledger .st-ledger-evidence-btn { grid-area: ev; justify-self: end; }
.st-ledger .st-ledger-nav { display: flex; align-items: baseline; gap: var(--k-gap, 24px); margin-top: calc(16px * var(--k-s, 1)); }
.st-ledger .st-ledger-detail > * + * { margin-top: calc(16px * var(--k-s, 1)); }
/* Row 444 — the case board. Kit classes do the voice; these rules only place the new pieces. */
.st-ledger .st-ledger-board { margin: calc(16px * var(--k-s, 1)) 0; padding: calc(10px * var(--k-s, 1)) 0; border-top: 1px solid var(--k-bone-12, rgba(237,230,214,.12)); border-bottom: 1px solid var(--k-bone-12, rgba(237,230,214,.12)); }
.st-ledger .st-ledger-board-pins { display: flex; flex-wrap: wrap; gap: calc(8px * var(--k-s, 1)); list-style: none; margin: calc(8px * var(--k-s, 1)) 0 0; padding: 0; }
.st-ledger .st-ledger-chip { display: inline-flex; align-items: baseline; gap: calc(8px * var(--k-s, 1)); }
.st-ledger .st-ledger-chip[data-ledger-anchor="1"] { outline: 1px solid var(--k-signal, #ffb454); outline-offset: calc(2px * var(--k-s, 1)); }
.st-ledger .st-ledger-board-links { list-style: none; margin: calc(8px * var(--k-s, 1)) 0 0; padding: 0; }
.st-ledger .st-ledger-board-links li { display: flex; align-items: baseline; gap: calc(8px * var(--k-s, 1)); }
.st-ledger .st-ledger-board-note { min-height: 1em; margin: calc(8px * var(--k-s, 1)) 0 0; color: var(--dp-ink-dim, #b7b4a6); }
.st-ledger .st-ledger-onboard { color: var(--dp-ink-dim, #b7b4a6); }
.st-ledger .st-ledger-detail-tools { display: flex; flex-wrap: wrap; gap: calc(8px * var(--k-s, 1)); }
.st-ledger .st-ledger-detail-note { min-height: 1em; margin: calc(8px * var(--k-s, 1)) 0 0; color: var(--dp-ink-dim, #b7b4a6); }
`;

let ledgerCssInjected = false;
function injectLedgerCss() {
  if (ledgerCssInjected || typeof document === 'undefined' || !document.head) return;
  if (typeof document.createElement !== 'function') return;
  ledgerCssInjected = true;
  const style = document.createElement('style');
  style.id = 'ui-ship-ledger-styles';
  style.textContent = SHIP_LEDGER_CSS;
  document.head.appendChild(style);
}

export function createShipLedgerPanel(ctx, options = {}) {
  injectLedgerCss();
  const rawHost = options.hostId != null ? String(options.hostId).trim() : '';
  const hostId = rawHost || 'ledger';
  const hostOptions = options.hostOptions && typeof options.hostOptions === 'object' ? options.hostOptions : {};
  const hTag = headingTag(options.headingLevel);
  const idp = (suffix) => `st-ledger-${hostId}-${suffix}`;
  const titleId = idp('title');
  const detailTitleId = idp('detail-title');

  const root = document.createElement('section');
  root.className = 'st-panel st-ledger';
  root.setAttribute('aria-labelledby', titleId);

  const heading = document.createElement(hTag);
  heading.id = titleId;
  heading.className = 'k-display k-t-title st-sub-h';
  heading.textContent = hostOptions.title || "The Ship's Ledger";

  const intro = document.createElement('p');
  intro.className = 'k-sentence st-ledger-intro';
  intro.textContent = hostOptions.intro || 'The Tessera keeps what the manifests leave out.';

  // FB-069 — the doing/then/so prose `buildShipLedger` already returns. Rendered once at the
  // head of both hosts through this shared panel; the UI never recomputes it.
  const story = document.createElement('p');
  story.className = 'k-sentence k-sentence--emph st-ledger-story';
  story.setAttribute('aria-label', 'The story so far');
  story.hidden = true;

  const status = document.createElement('p');
  status.className = 'k-caps st-ledger-status mono';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');

  // Row 444 — the case board. Always rendered (it is a player-facing surface, not state); it only
  // mirrors `state.shipLedger.board`, which the owner creates lazily on the first deliberate pin.
  const board = document.createElement('section');
  board.className = 'st-ledger-board';
  board.setAttribute('aria-label', 'Case board');

  const boardHead = document.createElement('p');
  boardHead.className = 'k-caps st-ledger-board-head mono';
  boardHead.textContent = 'Case board — pin what you found, tie what belongs together';

  const boardPins = document.createElement('ul');
  boardPins.className = 'st-ledger-board-pins';
  boardPins.setAttribute('aria-label', 'Pinned evidence');

  const boardEmpty = document.createElement('p');
  boardEmpty.className = 'k-t-fine k-38 st-ledger-board-empty';
  boardEmpty.textContent = 'Nothing pinned yet. Open an evidence page and pin it.';

  const boardLinks = document.createElement('ul');
  boardLinks.className = 'st-ledger-board-links';
  boardLinks.setAttribute('aria-label', 'Tied threads');

  const boardBanner = document.createElement('p');
  boardBanner.className = 'k-sentence k-sentence--emph st-ledger-board-banner';
  boardBanner.hidden = true;

  const boardCancel = document.createElement('button');
  boardCancel.type = 'button';
  boardCancel.className = 'k-word k-word--fine st-btn st-ledger-board-cancel';
  boardCancel.setAttribute('data-ledger-board-cancel', '1');
  boardCancel.textContent = 'Cancel tie';
  boardCancel.hidden = true;

  const boardNote = document.createElement('p');
  boardNote.className = 'k-t-fine st-ledger-board-note mono';
  boardNote.setAttribute('role', 'status');
  boardNote.setAttribute('aria-live', 'polite');

  board.append(boardHead, boardPins, boardEmpty, boardLinks, boardBanner, boardCancel, boardNote);

  const list = document.createElement('ol');
  list.className = 'k-rows st-ledger-list';
  list.setAttribute('aria-label', 'Ship ledger entries, newest first');

  const empty = document.createElement('p');
  empty.className = 'k-empty st-ledger-empty';
  empty.textContent = 'No receipts yet. The first line is still yours.';
  empty.hidden = true;

  const nav = document.createElement('nav');
  nav.className = 'st-ledger-nav';
  nav.setAttribute('aria-label', 'Ship ledger archive pages');
  const newer = makeButton('Newer entries', 'newer');
  const pageReadout = document.createElement('span');
  pageReadout.className = 'k-t-fine k-38 st-ledger-page mono';
  pageReadout.setAttribute('aria-hidden', 'true');
  const older = makeButton('Older entries', 'older');
  nav.append(newer, pageReadout, older);

  // One evidence detail subtree with one visible image. Hidden unless an evidence row is open.
  const detail = document.createElement('section');
  detail.className = 'st-ledger-detail';
  detail.setAttribute('aria-labelledby', detailTitleId);
  detail.hidden = true;

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'k-word k-word--body st-btn st-ledger-back';
  back.setAttribute('data-ledger-back', '1');
  back.textContent = 'Back to entries';

  const detailHeading = document.createElement('h3');
  detailHeading.id = detailTitleId;
  detailHeading.className = 'k-display k-t-title st-sub-h st-ledger-detail-title';

  const detailFragment = document.createElement('p');
  detailFragment.className = 'k-sentence k-sentence--emph st-ledger-detail-fragment';

  const detailBody = document.createElement('p');
  detailBody.className = 'k-sentence st-ledger-detail-body';

  const figure = document.createElement('figure');
  figure.className = 'st-ledger-figure';
  const image = document.createElement('img');
  image.className = 'st-ledger-figure-img';
  if ('loading' in image) image.loading = 'lazy';
  const caption = document.createElement('figcaption');
  caption.className = 'st-ledger-figure-caption';
  figure.append(image, caption);

  const provenance = document.createElement('p');
  provenance.className = 'k-t-fine k-38 st-ledger-provenance mono';

  // Row 444 — the deliberate board acts live on the open evidence page: pin/unpin and "start a
  // tie". Both are owner calls; the panel only renders the returned { ok, reason }.
  const detailTools = document.createElement('div');
  detailTools.className = 'st-ledger-detail-tools';
  const pinBtn = document.createElement('button');
  pinBtn.type = 'button';
  pinBtn.className = 'k-word k-word--body st-btn st-ledger-pin';
  pinBtn.setAttribute('data-ledger-pin', '1');
  pinBtn.textContent = 'Pin to board';
  const tieBtn = document.createElement('button');
  tieBtn.type = 'button';
  tieBtn.className = 'k-word k-word--body st-btn st-ledger-tie';
  tieBtn.setAttribute('data-ledger-tie', '1');
  tieBtn.textContent = 'Start a tie';
  detailTools.append(pinBtn, tieBtn);
  const detailNote = document.createElement('p');
  detailNote.className = 'k-t-fine st-ledger-detail-note mono';
  detailNote.setAttribute('role', 'status');
  detailNote.setAttribute('aria-live', 'polite');

  detail.append(back, detailHeading, detailFragment, detailBody, figure, provenance, detailTools, detailNote);

  root.append(heading, intro, story, status, board, list, empty, nav, detail);

  let page = 0;
  let lastModel = null;
  let openerEl = null;
  let linkAnchor = null;        // pageId armed as one end of a tie; null when no tie is in progress
  let detailPageId = null;      // pageId of the open evidence detail (board act target)

  function cue() {
    if (ctx && ctx.bus && ctx.bus.emit) ctx.bus.emit('audio:cue', { id: 'ui_click' });
  }

  // One refusal/confirmation voice for every board act — visible in whichever subtree is open.
  function boardSay(message) {
    boardNote.textContent = message || '';
    detailNote.textContent = message || '';
  }

  function boardState() {
    return shipLedgerBoard(ctx && ctx.state) || { pins: [], links: [] };
  }

  function renderDetailTools(current = boardState()) {
    pinBtn.textContent = current.pins.includes(detailPageId) ? 'Unpin from board' : 'Pin to board';
    tieBtn.textContent = linkAnchor === detailPageId && linkAnchor
      ? 'Cancel tie'
      : linkAnchor
        ? `Tie to “${ledgerEvidencePageTitle(ctx && ctx.state, linkAnchor)}”`
        : 'Start a tie';
  }

  // Rebuild the chips + threads from live board state. If the armed anchor was unpinned or the
  // run was loaded without it, the tie quietly disarms — the anchor is UI-only intent, never state.
  function renderBoard() {
    const state = ctx && ctx.state;
    const current = boardState();
    if (linkAnchor && !current.pins.includes(linkAnchor)) linkAnchor = null;
    renderDetailTools(current);

    const pinFrag = document.createDocumentFragment();
    for (const pinId of current.pins) {
      const li = document.createElement('li');
      li.className = 'st-ledger-chip';
      if (linkAnchor === pinId) li.setAttribute('data-ledger-anchor', '1');
      const title = ledgerEvidencePageTitle(state, pinId);
      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'k-word k-word--fine st-btn st-ledger-chip-open';
      openBtn.setAttribute('data-ledger-board-open', pinId);
      openBtn.setAttribute('aria-label', `Open pinned evidence: ${title}`);
      openBtn.textContent = title;
      const unpinBtn = document.createElement('button');
      unpinBtn.type = 'button';
      unpinBtn.className = 'k-word k-word--fine st-btn st-ledger-chip-unpin';
      unpinBtn.setAttribute('data-ledger-board-unpin', pinId);
      unpinBtn.setAttribute('aria-label', `Unpin ${title}`);
      unpinBtn.textContent = 'Unpin';
      li.append(openBtn);
      if (linkAnchor && linkAnchor !== pinId) {
        const tieTo = document.createElement('button');
        tieTo.type = 'button';
        tieTo.className = 'k-word k-word--fine st-btn st-ledger-chip-tie';
        tieTo.setAttribute('data-ledger-board-tie', pinId);
        tieTo.setAttribute('aria-label', `Tie ${title} to the armed page`);
        tieTo.textContent = 'Tie here';
        li.append(tieTo);
      }
      li.append(unpinBtn);
      pinFrag.appendChild(li);
    }
    boardPins.replaceChildren(pinFrag);
    boardEmpty.hidden = current.pins.length !== 0;
    boardPins.hidden = current.pins.length === 0;

    const linkFrag = document.createDocumentFragment();
    for (const pair of current.links) {
      if (!Array.isArray(pair) || pair.length !== 2) continue;
      const aTitle = ledgerEvidencePageTitle(state, pair[0]);
      const bTitle = ledgerEvidencePageTitle(state, pair[1]);
      const li = document.createElement('li');
      const thread = document.createElement('span');
      thread.className = 'k-t-fine st-ledger-thread';
      thread.textContent = `${aTitle} — ${bTitle}`;
      const cut = document.createElement('button');
      cut.type = 'button';
      cut.className = 'k-word k-word--fine st-btn st-ledger-thread-cut';
      cut.setAttribute('data-ledger-board-cut', `${pair[0]}|${pair[1]}`);
      cut.setAttribute('aria-label', `Cut thread between ${aTitle} and ${bTitle}`);
      cut.textContent = 'Cut thread';
      li.append(thread, cut);
      linkFrag.appendChild(li);
    }
    boardLinks.replaceChildren(linkFrag);
    boardLinks.hidden = current.links.length === 0;

    boardBanner.hidden = !linkAnchor;
    boardCancel.hidden = !linkAnchor;
    if (linkAnchor) {
      boardBanner.textContent = `Tying from “${ledgerEvidencePageTitle(state, linkAnchor)}” — pick another pinned page.`;
    } else {
      boardBanner.textContent = '';
    }
  }

  function renderEntry(entry) {
    const item = document.createElement('li');
    item.className = `k-row k-row--static st-ledger-entry st-ledger-entry--${entry.type}`;
    item.setAttribute('data-ledger-entry-type', entry.type);
    item.setAttribute('tabindex', '0'); // a row can be rested on by keyboard (the station reads it)

    const article = document.createElement('article');
    article.className = 'st-ledger-entry-body';
    article.setAttribute('aria-label', shipLedgerEntryAriaLabel(entry));

    const time = document.createElement('time');
    time.className = 'k-t-data k-38 st-ledger-cycle mono';
    time.textContent = entry.cycleLabel;

    const type = document.createElement('span');
    type.className = 'k-caps st-ledger-type mono' + (entry.type === 'rumor' ? ' k-signal' : '');
    type.textContent = entry.type.toUpperCase();

    const line = document.createElement('p');
    line.className = 'k-t-body st-ledger-line';
    line.textContent = entry.text;

    article.append(time, type, line);
    if (entry.annotation) {
      const annotation = document.createElement('aside');
      annotation.className = 'k-t-fine k-signal st-ledger-annotation st-ledger-annotation--vols';
      annotation.setAttribute('aria-label', 'Captain Vols annotation');
      annotation.setAttribute('data-ledger-hand', 'vols');
      annotation.textContent = entry.annotation;
      article.appendChild(annotation);
    }
    // Evidence rows carry an immutable evidencePage detail; the button opens the single detail view.
    if (entry.evidencePage) {
      const evidenceBtn = document.createElement('button');
      evidenceBtn.type = 'button';
      evidenceBtn.className = 'k-word k-word--fine st-ledger-evidence-btn';
      evidenceBtn.setAttribute('data-ledger-evidence', entry.evidencePage.pageId);
      evidenceBtn.setAttribute('aria-label', `Open evidence: ${entry.evidencePage.title}`);
      evidenceBtn.textContent = `Evidence — ${entry.evidencePage.title}`;
      article.appendChild(evidenceBtn);
      if (boardState().pins.includes(entry.evidencePage.pageId)) {
        const mark = document.createElement('span');
        mark.className = 'k-caps st-ledger-onboard mono';
        mark.setAttribute('data-ledger-onboard', '1');
        mark.textContent = 'On board';
        article.appendChild(mark);
      }
    }
    item.appendChild(article);
    return item;
  }

  function refresh(requestedPage = page) {
    const state = ctx && ctx.state || {};
    let model = buildShipLedger(state, { page: requestedPage, pageSize: SHIP_LEDGER_PAGE_SIZE });
    if (model.page !== requestedPage) model = buildShipLedger(state, { page: model.page, pageSize: SHIP_LEDGER_PAGE_SIZE });
    page = model.page;
    lastModel = model;

    // The story-so-far prose heads the page exactly like the shipped prose reads the log:
    // present means shown verbatim; absent means the line collapses, never a placeholder.
    const storyProse = model.storySoFar && model.storySoFar.prose ? String(model.storySoFar.prose) : '';
    story.textContent = storyProse;
    story.hidden = !storyProse;

    const fragment = document.createDocumentFragment();
    for (const entry of model.entries) fragment.appendChild(renderEntry(entry));
    list.replaceChildren(fragment);

    empty.hidden = model.total !== 0;
    list.hidden = model.total === 0;
    nav.hidden = model.pageCount <= 1;
    newer.disabled = !model.hasNewer;
    older.disabled = !model.hasOlder;
    pageReadout.textContent = `${model.page + 1} / ${model.pageCount}`;
    status.textContent = model.total === 0
      ? 'Ledger empty.'
      : `${model.total} entries. Archive page ${model.page + 1} of ${model.pageCount}.`;
    renderBoard();
    return model;
  }

  function clearDetailImage() {
    // Release the source and detach handlers so no hidden request can fire and no handler can run
    // after the detail is collapsed or the host is torn down.
    removeAttr(image, 'src');
    image.onload = null;
    image.onerror = null;
    removeAttr(image, 'alt');
  }

  function closeDetail(restoreFocus) {
    if (detail.hidden) return;
    clearDetailImage();
    detailHeading.textContent = '';
    detailFragment.textContent = '';
    detailBody.textContent = '';
    caption.textContent = '';
    provenance.textContent = '';
    detailNote.textContent = '';
    detailPageId = null;
    figure.setAttribute('data-ledger-figure-state', 'idle');
    detail.hidden = true;
    list.hidden = !!(lastModel && lastModel.total === 0);
    nav.hidden = !!(lastModel && lastModel.pageCount <= 1);
    empty.hidden = !!(lastModel && lastModel.total !== 0);
    story.hidden = !(lastModel && lastModel.storySoFar && lastModel.storySoFar.prose);
    board.hidden = false;
    const target = restoreFocus ? (openerEl || newer) : null;
    openerEl = null;
    if (target && typeof target.focus === 'function') target.focus();
  }

  function showEvidence(ev, originEl) {
    openerEl = originEl || null;
    detailPageId = ev.pageId || null;
    clearDetailImage(); // drop any prior request before arming the next
    detailHeading.textContent = ev.title;
    detailFragment.textContent = ev.fragment;
    detailBody.textContent = ev.body;
    caption.textContent = (ev.media && ev.media.caption) || '';
    provenance.textContent = ev.provenanceRef ? `Provenance: ${ev.provenanceRef}` : '';
    detailNote.textContent = '';
    figure.setAttribute('data-ledger-figure-state', 'admitted');
    image.setAttribute('alt', (ev.media && ev.media.alt) || ev.title || '');
    // Failure is an explicit, accessible state — never a silent substitute image.
    image.onerror = () => {
      removeAttr(image, 'src');
      image.setAttribute('alt', 'Evidence media not admitted or unavailable.');
      caption.textContent = 'Evidence media not admitted or unavailable.';
      figure.setAttribute('data-ledger-figure-state', 'failed');
    };
    image.onload = () => { figure.setAttribute('data-ledger-figure-state', 'admitted'); };
    if (ev.media && ev.media.path) image.setAttribute('src', ev.media.path);
    // The pin/tie affordance mirrors live board state: pinned pages offer Unpin, others Pin.
    renderDetailTools();
    // Hide the bounded list + archive nav + board while reading one evidence page.
    detail.hidden = false;
    list.hidden = true;
    nav.hidden = true;
    empty.hidden = true;
    story.hidden = true;
    board.hidden = true;
    if (typeof back.focus === 'function') back.focus();
  }

  function openEvidence(pageId, originEl) {
    const model = lastModel;
    if (!model) return;
    const entry = model.entries.find((candidate) => candidate.evidencePage
      && candidate.evidencePage.pageId === pageId);
    if (!entry) return;
    showEvidence(entry.evidencePage, originEl);
  }

  // Board chips open a pinned page even when its archive row lives on another leaf — the owner
  // resolves the same evidencePage detail shape from live state.
  function openEvidenceByPageId(pageId, originEl) {
    const model = lastModel;
    const entry = model && model.entries.find((candidate) => candidate.evidencePage
      && candidate.evidencePage.pageId === pageId);
    const ev = entry ? entry.evidencePage : ledgerEvidenceDetail(ctx && ctx.state, pageId);
    if (!ev) return;
    showEvidence(ev, originEl);
  }

  function onNavClick(event) {
    const button = event.target && event.target.closest && event.target.closest('[data-ledger-page]');
    if (!button || button.disabled || !lastModel) return;
    const direction = button.getAttribute('data-ledger-page');
    refresh(direction === 'older' ? page + 1 : page - 1);
    const focusTarget = direction === 'older' ? newer : older;
    focusTarget.focus();
    if (ctx && ctx.bus && ctx.bus.emit) ctx.bus.emit('audio:cue', { id: 'ui_click' });
  }

  function onListClick(event) {
    const btn = event.target && event.target.closest && event.target.closest('[data-ledger-evidence]');
    if (!btn) return;
    openEvidence(btn.getAttribute('data-ledger-evidence'), btn);
    if (ctx && ctx.bus && ctx.bus.emit) ctx.bus.emit('audio:cue', { id: 'ui_click' });
  }

  // Every board act is one owner call rendered honestly: { ok:true } confirms; { ok:false } shows
  // the owner's exact refusal reason — the panel never adjudicates admissibility itself.
  function runBoardAct(result, okMessage) {
    boardSay(result && result.ok ? (okMessage || 'Done.') : (result && result.reason) || 'The ledger refuses that.');
    if (result && result.ok) {
      // refresh() also un-hides the archive list — while an evidence page is open only the board
      // strip may rebuild; the detail subtree stays exactly where the player is reading.
      if (detail.hidden) refresh(page); else renderBoard();
    }
    cue();
    return !!(result && result.ok);
  }

  function submitTie(other) {
    const anchor = linkAnchor;
    linkAnchor = null;
    const ok = runBoardAct(linkEvidence(ctx && ctx.state, anchor, other), 'Thread tied.');
    if (!ok) linkAnchor = anchor;
    else if (ctx && ctx.bus && ctx.bus.emit) {
      ctx.bus.emit('ledger:evidenceLinked', { a: anchor, b: other });
    }
  }

  function onDetailClick(event) {
    const target = event.target;
    const closest = (sel) => target && target.closest && target.closest(sel);
    const backBtn = closest('[data-ledger-back]');
    if (backBtn) {
      closeDetail(true);
      cue();
      return;
    }
    const pin = closest('[data-ledger-pin]');
    if (pin && detailPageId) {
      const state = ctx && ctx.state;
      const pinned = boardState().pins.includes(detailPageId);
      const result = pinned ? unpinEvidence(state, detailPageId) : pinEvidence(state, detailPageId);
      runBoardAct(result, pinned ? 'Unpinned.' : 'Pinned to the board.');
      return;
    }
    const tie = closest('[data-ledger-tie]');
    if (tie && detailPageId) {
      const state = ctx && ctx.state;
      if (linkAnchor && linkAnchor !== detailPageId) {
        // Completing an armed tie against the open page IS the deliberate submission.
        submitTie(detailPageId);
        return;
      }
      if (linkAnchor === detailPageId) {
        linkAnchor = null;
        boardSay('Tie put down.');
        if (detail.hidden) refresh(page); else renderBoard();
        cue();
        return;
      }
      linkAnchor = detailPageId;
      boardSay(`Tying from “${ledgerEvidencePageTitle(state, linkAnchor)}” — pick another pinned page.`);
      renderBoard(); // re-arm the chips so the other pinned pages offer "Tie here"
      cue();
    }
  }

  function onBoardClick(event) {
    const target = event.target;
    const closest = (sel) => target && target.closest && target.closest(sel);
    const openBtn = closest('[data-ledger-board-open]');
    if (openBtn) {
      openEvidenceByPageId(openBtn.getAttribute('data-ledger-board-open'), openBtn);
      cue();
      return;
    }
    const tieTo = closest('[data-ledger-board-tie]');
    if (tieTo && linkAnchor) {
      submitTie(tieTo.getAttribute('data-ledger-board-tie'));
      return;
    }
    const unpin = closest('[data-ledger-board-unpin]');
    if (unpin) {
      runBoardAct(unpinEvidence(ctx && ctx.state, unpin.getAttribute('data-ledger-board-unpin')), 'Unpinned.');
      return;
    }
    const cut = closest('[data-ledger-board-cut]');
    if (cut) {
      const [a, b] = String(cut.getAttribute('data-ledger-board-cut') || '').split('|');
      runBoardAct(unlinkEvidence(ctx && ctx.state, a, b), 'Thread cut.');
      return;
    }
    if (closest('[data-ledger-board-cancel]')) {
      linkAnchor = null;
      boardSay('Tie put down.');
      renderBoard();
      cue();
    }
  }

  nav.addEventListener('click', onNavClick);
  list.addEventListener('click', onListClick);
  detail.addEventListener('click', onDetailClick);
  board.addEventListener('click', onBoardClick);

  return {
    el: root,
    get model() { return lastModel; },
    onShow() { refresh(page); },
    refresh,
    openEvidence,
    openEvidenceByPageId,
    closeDetail,
    onHide() {
      // No hidden refresh: collapse any open evidence detail and release the image request, but do
      // NOT rebuild the list while the host is hidden.
      closeDetail(false);
    },
    destroy() {
      nav.removeEventListener('click', onNavClick);
      list.removeEventListener('click', onListClick);
      detail.removeEventListener('click', onDetailClick);
      board.removeEventListener('click', onBoardClick);
      clearDetailImage();
    },
  };
}

export default createShipLedgerPanel;
