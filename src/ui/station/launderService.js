// Separate papers service: presentation reads owner quotes and submits opaque tokens only.
import { canLaunderSalvageAtStation } from '../../data/salvageLegality.js';
import { FACTION_LABELS } from '../../data/encounters.js';
import { COMMODITIES } from '../../data/commodities.js';
const names = new Map(COMMODITIES.map(row => [row.id, row.name]));
let nextContext = 0;
const reasons = {
  payment_unavailable: 'Payment unavailable. No papers were washed; request a fresh quote.',
  short: 'Not enough credits. Review a fresh quote.',
  price_changed: 'The cut changed. Review the new quote before paying.',
  cargo_changed: 'That cargo changed. Review the nearby pods again.',
  stale_quote: 'That quote expired. Review a fresh quote.',
  out_of_range: 'That pod moved beyond 200 units.',
  not_docked: 'Dock at this berth to use the papers service.',
  black_market_locked: 'Complete this berth’s entrance run first.',
  station_changed: 'The berth changed. Reopen Market for a fresh quote.',
  unavailable: 'This berth does not wash papers.',
};
export function requestLaunderQuote(bus, state, contextId, requestId) {
  const stationId = state?.ui?.dockedStationId;
  if (!bus?.emit || !stationId || !canLaunderSalvageAtStation(stationId)) return false;
  bus.emit('dock:launder', { action: 'quote', stationId, contextId, requestId });
  return true;
}
export function createLaunderService({ bus, getState, document }) {
  const el = document.createElement('section');
  el.className = 'k-rows';
  el.setAttribute('aria-label', 'Papers service');
  el.setAttribute('data-launder-service', '');
  el.hidden = true;
  let contextId = null, stationId = null, requestId = null, seq = 0;
  let visible = false, disposed = false, busy = false, quotes = [], message = '';
  function node(tag, text, className) {
    const n = document.createElement(tag);
    if (text) n.textContent = text;
    if (className) n.className = className;
    return n;
  }
  function current() {
    const state = getState();
    return visible && !disposed && state?.ui?.docked === true && state.ui.dockedStationId === stationId;
  }
  function render() {
    while (el.firstChild) el.removeChild(el.firstChild);
    el.hidden = !visible;
    if (!visible) return;
    el.appendChild(node('p', 'Papers service', 'k-caps'));
    el.appendChild(node('p', 'Choose a hot cargo pod within 200 units. Only the pod you confirm is washed; ownership stays unchanged.', 'k-t-fine'));
    const status = node('p', message || (busy ? 'Requesting papers quote…' : 'No nearby hot pods. Held cargo is not washed here.'), 'k-t-fine');
    status.setAttribute('role', 'status');
    el.appendChild(status);
    for (const quote of quotes) {
      const row = node('div', '', 'k-row');
      row.style.gridTemplateColumns = 'minmax(0, 1fr)';
      const label = node('span', `${quote.label || names.get(quote.commodityId) || 'Cargo pod'} · ${quote.amount} u · ${quote.distance ?? '?'} u · title: ${quote.ownerName || 'unnamed owner'}${quote.factionId ? ' · cargo faction: ' + (FACTION_LABELS[quote.factionId] || quote.factionId.replace(/^faction_/, '').replaceAll('_', ' ')) : ''} · pod reference ${quote.podId} · cut ${Math.round(quote.cutFrac * 100)}%`);
      label.style.minWidth = '0';
      label.style.overflowWrap = 'anywhere';
      row.appendChild(label);
      const button = node('button', `Wash this pod · ${quote.cut} cr`, 'k-word k-word--body');
      button.type = 'button';
      button.style.whiteSpace = 'normal';
      button.style.minWidth = '0';
      button.style.minHeight = '44px';
      button.setAttribute('data-launder-confirm', quote.quoteId);
      button.disabled = busy || quote.affordable === false;
      button.addEventListener('click', () => {
        if (!current()) { hide(); return; }
        if (busy || !quotes.includes(quote) || quote.affordable === false) return;
        busy = true;
        message = 'Checking this pod and its quoted cut…';
        requestId = `${contextId}:${++seq}`;
        render();
        bus.emit('dock:launder', { action: 'confirm', stationId, contextId, requestId, quoteId: quote.quoteId });
      });
      row.appendChild(button);
      el.appendChild(row);
    }
    const refresh = node('button', 'Refresh nearby pods', 'k-word k-word--body');
    refresh.type = 'button';
    refresh.style.whiteSpace = 'normal';
    refresh.style.minWidth = '0';
    refresh.style.minHeight = '44px';
    refresh.setAttribute('data-launder-refresh', '');
    refresh.disabled = busy;
    refresh.addEventListener('click', () => { if (!busy) request(); });
    el.appendChild(refresh);
  }
  function request() {
    if (!current()) { hide(); return; }
    busy = true; quotes = []; requestId = `${contextId}:${++seq}`;
    render();
    requestLaunderQuote(bus, getState(), contextId, requestId);
  }
  function matches(reply) {
    return current() && reply?.contextId === contextId && reply.requestId === requestId && reply.stationId === stationId;
  }
  function onQuote(reply) {
    if (!matches(reply)) return;
    busy = false;
    quotes = reply.accepted && Array.isArray(reply.quotes) ? reply.quotes : [];
    message = reply.accepted ? (quotes.length ? (reply.truncated ? 'Showing the nearest 32 eligible pods. Move other cargo closer and refresh. ' : '') + 'Review the exact cut, then choose one pod.' : '') : (reasons[reply.reason] || 'Papers quote unavailable.');
    render();
  }
  function onResult(reply) {
    if (!matches(reply)) return;
    busy = false;
    message = reply.accepted ? `Papers washed. Paid ${reply.cut} cr.` : (reasons[reply.reason] || 'Papers request refused.');
    quotes = [];
    // Keep the verdict visible. A new explicit refresh obtains replacement quotes.
    render();
  }
  function hide() {
    const old = contextId;
    visible = false; busy = false; quotes = []; contextId = requestId = null;
    render();
    if (old) bus?.emit?.('dock:launder', { action: 'close', stationId, contextId: old });
  }
  const resets = ['dock:undocked', 'sector:exit', 'sector:enter', 'game:new', 'game:newGame', 'game:load', 'save:restoring', 'save:loaded'];
  bus?.on?.('cargo:launderQuoted', onQuote);
  bus?.on?.('cargo:laundered', onResult);
  for (const event of resets) bus?.on?.(event, hide);
  return {
    el,
    show() {
      if (disposed) return;
      hide();
      const state = getState();
      stationId = state?.ui?.dockedStationId;
      if (state?.ui?.docked !== true || !canLaunderSalvageAtStation(stationId)) return;
      contextId = `papers-ui:${++nextContext}`;
      visible = true; message = ''; request();
    },
    hide,
    dispose() {
      hide(); disposed = true;
      bus?.off?.('cargo:launderQuoted', onQuote);
      bus?.off?.('cargo:laundered', onResult);
      for (const event of resets) bus?.off?.(event, hide);
    },
  };
}
