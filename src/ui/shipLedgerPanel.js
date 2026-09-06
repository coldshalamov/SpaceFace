// Shared Ship Ledger panel for Station and Codex hosts. It mounts as a sibling panel (the station app and
// the Codex "Ledger" tab both mount this same factory) and renders exactly one bounded archive page
// at a time. Source state is never written; only this panel's local page cursor moves.
//
// Host-safe: every DOM id is derived from `hostId`, so the same factory can mount in two hosts
// (station + codex) at once without colliding fixed IDs. Evidence rows open a single detail subtree
// with one visible image and an explicit, accessible failure state when media is not admitted.

import {
  buildShipLedger,
  SHIP_LEDGER_PAGE_SIZE,
} from '../systems/shipLedger.js';

export function shipLedgerEntryAriaLabel(entry) {
  if (!entry) return 'Empty ship ledger entry';
  const hand = entry.hand === 'vols' ? ' Captain Vols annotated this entry.' : '';
  return `${entry.cycleLabel}. ${entry.text}${hand}`;
}

function makeButton(label, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'st-btn st-ledger-page-btn';
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

// The evidence figure is the ONE place this panel needs its own injected styling. The full
// `.st-ledger-*` family is now styled in styles/station.css (sx-* tokens), but the Codex host does
// NOT load station.css — so this scoped injection is the only styling the figure subtree receives
// there, and it remains the authoritative image-sizing rule in both hosts. Every authored Cathedral
// image is 1920x1080; left alone the figure renders at natural size and blows out the column
// (measured: 1920px wide inside a 700px column).
//
// Scoped under `.st-ledger` so it cannot reach `.st-ledger-list` / `.st-ledger-row`, which the market
// screen reuses under `.st-market-ledger`. Sizes in `em` so the figure tracks the shipped `--ui-scale`
// text-scale path (ui.css:13/45, plus the .sx-app base) instead of pinning its own. Injected lazily,
// never at import time, so a headless projector-only import stays DOM-free.
const SHIP_LEDGER_CSS = `
.st-ledger .st-ledger-figure { margin: 10px 0 0; max-width: 720px; }
.st-ledger .st-ledger-figure-img {
  display: block; width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover;
  border-radius: 6px; border: 1px solid var(--panel-edge, #1d3350); background: var(--panel, #0b1220);
}
.st-ledger .st-ledger-figure[data-ledger-figure-state="failed"] .st-ledger-figure-img {
  aspect-ratio: auto; border-style: dashed; padding: 10px;
}
.st-ledger .st-ledger-figure-caption { margin-top: 6px; color: var(--ink-dim, #84a0c8); font-size: 0.85em; }
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
  heading.className = 'st-sub-h';
  heading.textContent = hostOptions.title || "The Ship's Ledger";

  const intro = document.createElement('p');
  intro.className = 'st-ledger-intro';
  intro.textContent = hostOptions.intro || 'The Tessera keeps what the manifests leave out.';

  const status = document.createElement('p');
  status.className = 'st-ledger-status mono';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');

  const list = document.createElement('ol');
  list.className = 'st-ledger-list';
  list.setAttribute('aria-label', 'Ship ledger entries, newest first');

  const empty = document.createElement('p');
  empty.className = 'st-ledger-empty';
  empty.textContent = 'No receipts yet. The first line is still yours.';
  empty.hidden = true;

  const nav = document.createElement('nav');
  nav.className = 'st-ledger-nav';
  nav.setAttribute('aria-label', 'Ship ledger archive pages');
  const newer = makeButton('Newer entries', 'newer');
  const pageReadout = document.createElement('span');
  pageReadout.className = 'st-ledger-page mono';
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
  back.className = 'st-btn st-ledger-back';
  back.setAttribute('data-ledger-back', '1');
  back.textContent = 'Back to entries';

  const detailHeading = document.createElement('h3');
  detailHeading.id = detailTitleId;
  detailHeading.className = 'st-sub-h st-ledger-detail-title';

  const detailFragment = document.createElement('p');
  detailFragment.className = 'st-ledger-detail-fragment';

  const detailBody = document.createElement('p');
  detailBody.className = 'st-ledger-detail-body';

  const figure = document.createElement('figure');
  figure.className = 'st-ledger-figure';
  const image = document.createElement('img');
  image.className = 'st-ledger-figure-img';
  if ('loading' in image) image.loading = 'lazy';
  const caption = document.createElement('figcaption');
  caption.className = 'st-ledger-figure-caption';
  figure.append(image, caption);

  const provenance = document.createElement('p');
  provenance.className = 'st-ledger-provenance mono';

  detail.append(back, detailHeading, detailFragment, detailBody, figure, provenance);

  root.append(heading, intro, status, list, empty, nav, detail);

  let page = 0;
  let lastModel = null;
  let openerEl = null;

  function renderEntry(entry) {
    const item = document.createElement('li');
    item.className = `st-ledger-entry st-ledger-entry--${entry.type}`;
    item.setAttribute('data-ledger-entry-type', entry.type);

    const article = document.createElement('article');
    article.className = 'st-ledger-entry-body';
    article.setAttribute('aria-label', shipLedgerEntryAriaLabel(entry));

    const time = document.createElement('time');
    time.className = 'st-ledger-cycle mono';
    time.textContent = entry.cycleLabel;

    const type = document.createElement('span');
    type.className = 'st-ledger-type mono';
    type.textContent = entry.type.toUpperCase();

    const line = document.createElement('p');
    line.className = 'st-ledger-line';
    line.textContent = entry.text;

    article.append(time, type, line);
    if (entry.annotation) {
      const annotation = document.createElement('aside');
      annotation.className = 'st-ledger-annotation st-ledger-annotation--vols';
      annotation.setAttribute('aria-label', 'Captain Vols annotation');
      annotation.setAttribute('data-ledger-hand', 'vols');
      annotation.textContent = entry.annotation;
      article.appendChild(annotation);
    }
    // Evidence rows carry an immutable evidencePage detail; the button opens the single detail view.
    if (entry.evidencePage) {
      const evidenceBtn = document.createElement('button');
      evidenceBtn.type = 'button';
      evidenceBtn.className = 'st-ledger-evidence-btn';
      evidenceBtn.setAttribute('data-ledger-evidence', entry.evidencePage.pageId);
      evidenceBtn.setAttribute('aria-label', `Open evidence: ${entry.evidencePage.title}`);
      evidenceBtn.textContent = `Evidence — ${entry.evidencePage.title}`;
      article.appendChild(evidenceBtn);
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
    figure.setAttribute('data-ledger-figure-state', 'idle');
    detail.hidden = true;
    list.hidden = !!(lastModel && lastModel.total === 0);
    nav.hidden = !!(lastModel && lastModel.pageCount <= 1);
    empty.hidden = !!(lastModel && lastModel.total !== 0);
    const target = restoreFocus ? (openerEl || newer) : null;
    openerEl = null;
    if (target && typeof target.focus === 'function') target.focus();
  }

  function openEvidence(pageId, originEl) {
    const model = lastModel;
    if (!model) return;
    const entry = model.entries.find((candidate) => candidate.evidencePage
      && candidate.evidencePage.pageId === pageId);
    if (!entry) return;
    const ev = entry.evidencePage;
    openerEl = originEl || null;
    clearDetailImage(); // drop any prior request before arming the next
    detailHeading.textContent = ev.title;
    detailFragment.textContent = ev.fragment;
    detailBody.textContent = ev.body;
    caption.textContent = (ev.media && ev.media.caption) || '';
    provenance.textContent = ev.provenanceRef ? `Provenance: ${ev.provenanceRef}` : '';
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
    // Hide the bounded list + archive nav while reading one evidence page.
    detail.hidden = false;
    list.hidden = true;
    nav.hidden = true;
    empty.hidden = true;
    if (typeof back.focus === 'function') back.focus();
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

  function onDetailClick(event) {
    const btn = event.target && event.target.closest && event.target.closest('[data-ledger-back]');
    if (!btn) return;
    closeDetail(true);
    if (ctx && ctx.bus && ctx.bus.emit) ctx.bus.emit('audio:cue', { id: 'ui_click' });
  }

  nav.addEventListener('click', onNavClick);
  list.addEventListener('click', onListClick);
  detail.addEventListener('click', onDetailClick);

  return {
    el: root,
    get model() { return lastModel; },
    onShow() { refresh(page); },
    refresh,
    openEvidence,
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
      clearDetailImage();
    },
  };
}

export default createShipLedgerPanel;
