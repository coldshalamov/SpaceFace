// A2 dock-screen surface for the Ship's Ledger. It mounts as a sibling panel (the station hub
// integration seam can register it without changing this module) and renders exactly one bounded
// archive page at a time. Source state is never written; only this panel's local page cursor moves.

import {
  buildShipLedger,
  SHIP_LEDGER_PAGE_SIZE,
} from '../../systems/shipLedger.js';

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

export function createShipLedgerPanel(ctx) {
  const root = document.createElement('section');
  root.className = 'st-panel st-ledger';
  root.setAttribute('aria-labelledby', 'st-ledger-title');

  const heading = document.createElement('h2');
  heading.id = 'st-ledger-title';
  heading.className = 'st-sub-h';
  heading.textContent = "The Ship's Ledger";

  const intro = document.createElement('p');
  intro.className = 'st-ledger-intro';
  intro.textContent = 'The Tessera keeps what the manifests leave out.';

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

  root.append(heading, intro, status, list, empty, nav);

  let page = 0;
  let lastModel = null;

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

  function onNavClick(event) {
    const button = event.target && event.target.closest && event.target.closest('[data-ledger-page]');
    if (!button || button.disabled || !lastModel) return;
    const direction = button.getAttribute('data-ledger-page');
    refresh(direction === 'older' ? page + 1 : page - 1);
    const focusTarget = direction === 'older' ? newer : older;
    focusTarget.focus();
    if (ctx && ctx.bus && ctx.bus.emit) ctx.bus.emit('audio:cue', { id: 'ui_click' });
  }

  nav.addEventListener('click', onNavClick);

  return {
    el: root,
    get model() { return lastModel; },
    onShow() { refresh(page); },
    refresh,
    destroy() { nav.removeEventListener('click', onNavClick); },
  };
}

export default createShipLedgerPanel;
