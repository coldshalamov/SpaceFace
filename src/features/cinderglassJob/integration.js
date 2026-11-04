// Browser reader adapters for the ordinary station/Contracts, chart and journal owners.
// Root supplies the small call-site hunks; all facts come from the bounded worker-safe view.
import { CINDERGLASS_JOB_STATION_ID, CINDERGLASS_JOB_SECTOR_ID } from './definition.js';

export function getCinderglassJobMapMarkers(state, sectorId) {
  return sectorId === CINDERGLASS_JOB_SECTOR_ID
    ? (state.cinderglassJobView?.markers || []).slice(0, 4) : [];
}
export function cinderglassJobJournalReceipt(state) {
  const journal = state.cinderglassJobView?.journal;
  if (!journal) return null;
  return { title: journal.title, body: [journal.objective, journal.summary].filter(Boolean).join(' '),
    meta: journal.facts.slice(-3).map(f => f.text).join(' '),
    outcome: journal.outcome?.id?.replaceAll('_', ' ') || 'in progress',
    tone: journal.outcome?.paidCr ? 'good' : 'neutral', featureId: 'cinderglassJob' };
}

export function mountCinderglassJobContracts(ctx, host) {
  const panel = document.createElement('section');
  panel.className = 'k-panel'; panel.dataset.cinderglassContracts = '';
  panel.setAttribute('aria-label', 'The Cinderglass Job');
  host.appendChild(panel);
  let signature = '', eventOffer = null, eventView = null, disposed = false;
  const consumed = new Set(), off = [];
  const node = (tag, text, className) => { const e = document.createElement(tag); if (text) e.textContent = text; if (className) e.className = className; return e; };
  function send(action, captured, extra = {}) {
    const p = { action, token: captured.token, operationId: captured.operationId,
      offerEpoch: captured.epoch, revision: captured.revision, ...extra, result: null };
    ctx.bus.emit('cinderglassJob:action', p);
    signature = ''; frame(ctx.state);
    return p.result?.ok !== false;
  }
  function button(label, action, captured, extra) {
    const b = node('button', label, 'k-key'); b.type = 'button';
    b.style.minHeight = '44px'; b.style.fontSize = '12px';
    b.addEventListener('click', () => send(action, captured, extra)); return b;
  }
  function frame(state = ctx.state) {
    if (disposed) return;
    const view = eventView || state.cinderglassJobView;
    const visible = state.ui?.dockedStationId === CINDERGLASS_JOB_STATION_ID && !!view?.contacts?.length;
    panel.hidden = !visible;
    if (!visible) return;
    const offer = view.offer || eventOffer;
    const next = JSON.stringify([view.token, view.contacts, view.journal, view.navigation, offer,
      view.refusal, [...consumed]]);
    if (signature === next) return;
    signature = next; panel.replaceChildren();
    const offerKey = offer && `${offer.token}:${offer.epoch}`;
    if (offer && !consumed.has(offerKey)) {
      panel.appendChild(node('h3', offer.title || 'Tala Rook · disputed consignment', 'k-caps'));
      panel.appendChild(node('p', offer.headline || offer.line, 'k-sentence'));
      panel.appendChild(node('p', offer.detail, 'k-sentence'));
      for (const a of (offer.choices || offer.actions || [])) {
        const b = button(a.label, a.id, offer);
        b.addEventListener('click', () => { consumed.add(offerKey); while (consumed.size > 8) consumed.delete(consumed.values().next().value); signature = ''; frame(ctx.state); });
        panel.appendChild(b);
      }
    } else for (const contact of view.contacts.slice(0, 3)) {
      const row = node('div', '', 'k-row');
      row.appendChild(node('h3', contact.title, 'k-caps'));
      row.appendChild(node('p', contact.line, 'k-sentence'));
      if (contact.detail) row.appendChild(node('p', contact.detail, 'k-sentence'));
      for (const a of contact.actions.slice(0, 2)) row.appendChild(button(a.label, a.id, contact, { actor: contact.actor }));
      panel.appendChild(row);
    }
    if (view.journal) panel.appendChild(node('p', view.journal.objective || view.journal.summary, 'k-sentence'));
    for (const marker of (view.navigation || []).slice(0, 4)) {
      panel.appendChild(button(`Track ${marker.label}`, 'track', marker.action, { markerId: marker.id }));
    }
    if (view.refusal) panel.appendChild(node('p', view.refusal.text || view.refusal.reason.replaceAll('_', ' '), 'k-sentence'));
  }
  for (const event of ['cinderglassJob:offer', 'cinderglassJob:close', 'cinderglassJob:refused']) {
    off.push(ctx.bus.on(event, p => { eventOffer = event === 'cinderglassJob:offer' ? p : null; signature = ''; frame(ctx.state); }));
  }
  off.push(ctx.bus.on('cinderglassJob:view', view => { eventView = view; signature = ''; frame(ctx.state); }));
  frame();
  return { frame, destroy() { if (disposed) return; disposed = true; for (const remove of off) remove?.(); panel.remove(); } };
}
