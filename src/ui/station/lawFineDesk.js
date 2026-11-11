import { wantedTierFor, WANTED_TIER } from '../../systems/heat.js';
// Docked presentation only. The law and economy owners validate and settle every answer.
export function mountLawFineDesk(host, ctx) {
  const doc = host.ownerDocument || globalThis.document;
  const panel = doc.createElement('section');
  panel.className = 'sxb-law-fine';
  panel.setAttribute('aria-label', 'Law desk');
  panel.style.display = 'flex';
  panel.style.flexWrap = 'wrap';
  panel.style.gap = '8px';
  const status = doc.createElement('span');
  status.setAttribute('role', 'status');
  panel.appendChild(status);
  const buttons = {};
  let rendered = null, active = true, disposed = false, pending = false, pendingStation = null;
  function current() {
    const s = ctx.state;
    const offer = s?.lawSecurity?.fineOffer;
    const tier = wantedTierFor(Number(s?.player?.heat) || 0);
    return (tier === WANTED_TIER.SCAN || tier === WANTED_TIER.BOUNTY) && active && !disposed && s?.ui?.docked === true && offer
      && String(s.ui.dockedStationId) === String(offer.stationId)
      && ['offered', 'working'].includes(offer.status) ? offer : null;
  }
  const labels = { pay: 'Pay fine', work: 'Work the debt', leave: 'Carry the warrant' };
  for (const choice of Object.keys(labels)) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'k-word k-word--fine fh-key fh-key--small';
    button.setAttribute('data-law-fine-choice', choice);
    button.textContent = labels[choice];
    button.addEventListener('click', () => {
      const offer = current();
      // An old rendered control cannot answer a new station, warrant, or shift.
      if (!offer || !rendered || offer.status !== 'offered'
        || offer.causeId !== rendered.causeId || offer.stationId !== rendered.stationId
        || offer.amount !== rendered.amount || offer.wantedTier !== rendered.wantedTier
        || offer.offerSerial !== rendered.offerSerial
        || button.disabled || pending) { refresh(); return; }
      pending = true; pendingStation = offer.stationId;
      for (const b of Object.values(buttons)) b.disabled = true;
      ctx.bus?.emit('law:fineChoice', { choice, stationId: offer.stationId,
        expectedFine: { ...rendered } });
      refresh();
    });
    buttons[choice] = button;
    panel.appendChild(button);
  }
  host.appendChild(panel);
  function refresh() {
    const offer = current();
    panel.hidden = !offer;
    // Explicit display is necessary because this compact region has an inline flex layout.
    panel.style.display = offer ? 'flex' : 'none';
    if (!offer) { rendered = null; return; }
    rendered = { causeId: offer.causeId, stationId: offer.stationId, amount: offer.amount, wantedTier: offer.wantedTier, offerSerial: offer.offerSerial };
    const working = offer.status === 'working';
    const statusText = working
      ? `Law desk · Working ${Math.min(Number(offer.workS) || 0, Number(offer.workNeedS) || 4).toFixed(1)} / ${Number(offer.workNeedS) || 4}s · Stay docked`
      : `Law desk · Fine ${Math.max(0, Math.round(Number(offer.amount) || 0))} cr`;
    if (status.textContent !== statusText) status.textContent = statusText;
    for (const [choice, button] of Object.entries(buttons)) {
      button.hidden = working;
      button.disabled = pending || working || (choice === 'pay' && Number(ctx.state.player?.credits || 0) < Number(offer.amount));
      button.textContent = choice === 'pay' ? `Pay ${offer.amount} cr` : labels[choice];
    }
  }
  const subscriptions = [];
  function listen(event, handler) {
    ctx.bus?.on?.(event, handler);
    subscriptions.push([event, handler]);
  }
  function onFineResponse(payload = {}) {
    if (String(payload.stationId) === String(pendingStation || rendered?.stationId)) {
      pending = false; pendingStation = null;
    }
    refresh();
  }
  for (const event of ['law:fineAssessed', 'law:fineRefused']) listen(event, onFineResponse);
  listen('credits:changed', refresh); // A balance update is not an acknowledgment of our answer.
  for (const event of ['dock:undocked', 'save:loaded']) listen(event, () => {
    pending = false; pendingStation = null;
    refresh();
  });
  refresh();
  return {
    el: panel, refresh,
    setActive(value) { active = !!value; refresh(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [event, handler] of subscriptions) ctx.bus?.off?.(event, handler);
      panel.remove();
    },
  };
}
