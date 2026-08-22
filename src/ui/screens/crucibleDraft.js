// Crucible draft surface (PQ-133 / CRU-016) and refit surface (CRU-017).
//
// Both are pure DOM over receipts. They read the open offers from the survivalDraft owner and emit
// intents back to it; neither writes state.run, fittings, or the phase. A pick that the fitting
// authority refuses is reported by the owner, not papered over here.
//
// Both ids are in PAUSING_SCREENS: §12.2 adopts a FULL pause during a draft.

import { SURVIVAL_DRAFT_CHOICES } from '../../data/survivalDraft.js';

const STYLE_ID = 'sf-crucible-draft-style';

function injectStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  // Sits on the shared menu fascia (styles/menu.css owns plate, buttons, tokens). Only the
  // three-card row and the slot readout are this screen's own.
  s.textContent = `
  .sf-menu.sf-crucible { gap:16px; padding:30px 34px; min-width:420px; max-width:min(94vw,980px); }
  #screens .sf-menu.sf-crucible h1 { justify-content:center; margin:0; padding-bottom:10px;
    font-family:var(--mono); letter-spacing:.26em; font-size:20px; text-transform:uppercase; }
  .sf-menu.sf-crucible .sf-cru-sub { text-align:center; color:var(--ink-dim); font-size:13px;
    letter-spacing:.06em; margin-top:-8px; }
  .sf-menu.sf-crucible .sf-cru-cards { display:grid; gap:12px;
    grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); }
  .sf-menu.sf-crucible .sf-cru-card { display:flex; flex-direction:column; gap:8px; text-align:left;
    border:1px solid var(--line); border-radius:2px; background:rgba(255,255,255,.03);
    padding:14px 15px; cursor:pointer; color:var(--ink); font:inherit; }
  .sf-menu.sf-crucible .sf-cru-card:hover,
  .sf-menu.sf-crucible .sf-cru-card:focus-visible { border-color:var(--accent-3); outline:none; }
  .sf-menu.sf-crucible .sf-cru-verb { font-family:var(--mono); letter-spacing:.2em; font-size:15px;
    text-transform:uppercase; color:var(--accent-3); }
  .sf-menu.sf-crucible .sf-cru-name { font-family:var(--mono); font-size:12px; color:var(--ink-dim); }
  .sf-menu.sf-crucible .sf-cru-blurb { font-size:13px; line-height:1.5; color:var(--ink); }
  .sf-menu.sf-crucible .sf-cru-slot { font-family:var(--mono); font-size:11px; letter-spacing:.06em;
    color:var(--ink-dim); border-top:1px solid var(--line); padding-top:7px; margin-top:auto; }
  .sf-menu.sf-crucible .sf-cru-foot { display:flex; gap:10px; justify-content:center; margin-top:6px; }
  .sf-menu.sf-crucible .sf-cru-rows { display:grid; grid-template-columns:auto 1fr auto; gap:6px 16px;
    align-items:center; font-family:var(--mono); font-size:12px; }
  .sf-menu.sf-crucible .sf-cru-rows .k { color:var(--ink-dim); letter-spacing:.05em; }
  `;
  document.head.appendChild(s);
}

function draftOwner(ctx) {
  const registry = ctx && ctx.registry;
  if (!registry || typeof registry.get !== 'function') return null;
  return registry.get('survivalDraft') || null;
}

function activeLoadout(ctx) {
  const player = ctx && ctx.state && ctx.state.player;
  const ships = Array.isArray(player && player.ownedShips) ? player.ownedShips : [];
  const index = Number.isInteger(player && player.activeShipIndex) ? player.activeShipIndex : 0;
  const owned = ships[index] || null;
  return {
    hullId: owned && owned.defId ? owned.defId : null,
    fittings: Array.isArray(owned && owned.fittings) ? owned.fittings : [],
  };
}

function prettyDefId(defId) {
  if (!defId) return 'empty';
  return String(defId).replace(/^(wpn|mod)_/, '').replace(/_/g, ' ');
}

/** Card text for one offer. Exported so a check can assert the wording without a DOM. */
export function offerCardLines(offer) {
  if (!offer) return null;
  return {
    verb: offer.verb || offer.id || '',
    name: offer.name || offer.defId || '',
    blurb: offer.blurb || '',
    slot: offer.replaces
      ? `Hardpoint ${offer.slotIndex + 1} — replaces ${prettyDefId(offer.replaces)}`
      : `Hardpoint ${offer.slotIndex + 1} — empty`,
  };
}

export const crucibleDraftScreen = {
  id: 'crucibleDraft',
  // Locked: the run is paused on this choice, and Escape must not leave the phase machine
  // waiting on a receipt that will never arrive.
  data: { locked: true },

  mount(rootEl, ctx) {
    injectStyle();
    this._ctx = ctx;
    rootEl.innerHTML = '';
    rootEl.classList.add('panel', 'sf-menu', 'sf-crucible');
    rootEl.dataset.stamp = 'CRUCIBLE / REARM';
    rootEl.setAttribute('role', 'dialog');
    rootEl.setAttribute('aria-modal', 'true');
    rootEl.setAttribute('aria-labelledby', 'sf-crucible-draft-title');

    const owner = draftOwner(ctx);
    const offers = owner && typeof owner.currentOffers === 'function' ? owner.currentOffers() : [];
    const wave = owner && typeof owner.currentWave === 'function' ? owner.currentWave() : 0;

    const h = document.createElement('h1');
    h.id = 'sf-crucible-draft-title';
    h.textContent = 'Rearm';
    rootEl.appendChild(h);

    const sub = document.createElement('div');
    sub.className = 'sf-cru-sub';
    sub.textContent = offers.length
      ? `Wave ${wave} cleared. Choose one — it changes what your guns do, not what they score.`
      : `Wave ${wave} cleared. Nothing new fits this hull.`;
    rootEl.appendChild(sub);

    const cards = document.createElement('div');
    cards.className = 'sf-cru-cards';
    let first = null;
    for (const offer of offers.slice(0, SURVIVAL_DRAFT_CHOICES)) {
      const lines = offerCardLines(offer);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'sf-cru-card';
      card.dataset.offerId = offer.id;
      card.setAttribute('aria-label', `${lines.verb}. ${lines.name}. ${lines.blurb} ${lines.slot}`);

      const verb = document.createElement('div');
      verb.className = 'sf-cru-verb';
      verb.textContent = lines.verb;
      card.appendChild(verb);

      const name = document.createElement('div');
      name.className = 'sf-cru-name';
      name.textContent = lines.name;
      card.appendChild(name);

      const blurb = document.createElement('div');
      blurb.className = 'sf-cru-blurb';
      blurb.textContent = lines.blurb;
      card.appendChild(blurb);

      const slot = document.createElement('div');
      slot.className = 'sf-cru-slot';
      slot.textContent = lines.slot;
      card.appendChild(slot);

      card.addEventListener('click', () => {
        ctx.bus.emit('run:draftPickRequested', { offerId: offer.id });
      });
      if (!first) first = card;
      cards.appendChild(card);
    }
    rootEl.appendChild(cards);

    const foot = document.createElement('div');
    foot.className = 'sf-cru-foot';
    const skip = document.createElement('button');
    skip.className = 'sf-btn';
    skip.type = 'button';
    skip.textContent = offers.length ? 'Keep current loadout' : 'Continue';
    skip.addEventListener('click', () => {
      ctx.bus.emit('run:draftPickRequested', { offerId: null });
    });
    foot.appendChild(skip);
    rootEl.appendChild(foot);

    const focusTarget = first || skip;
    if (focusTarget && typeof focusTarget.focus === 'function') {
      try { focusTarget.focus(); } catch { /* focus is best-effort */ }
    }
  },
};

export const crucibleRefitScreen = {
  id: 'crucibleRefit',
  data: { locked: true },

  mount(rootEl, ctx) {
    injectStyle();
    rootEl.innerHTML = '';
    rootEl.classList.add('panel', 'sf-menu', 'sf-crucible');
    rootEl.dataset.stamp = 'CRUCIBLE / REFIT';
    rootEl.setAttribute('role', 'dialog');
    rootEl.setAttribute('aria-modal', 'true');
    rootEl.setAttribute('aria-labelledby', 'sf-crucible-refit-title');

    const h = document.createElement('h1');
    h.id = 'sf-crucible-refit-title';
    h.textContent = 'Refit';
    rootEl.appendChild(h);

    const sub = document.createElement('div');
    sub.className = 'sf-cru-sub';
    sub.textContent = 'Strip a hardpoint or put a spare back on before the next block.';
    rootEl.appendChild(sub);

    const rows = document.createElement('div');
    rows.className = 'sf-cru-rows';
    rootEl.appendChild(rows);
    this._rows = rows;
    this._ctx = ctx;
    this.refresh(ctx);

    const foot = document.createElement('div');
    foot.className = 'sf-cru-foot';
    const done = document.createElement('button');
    done.className = 'sf-btn';
    done.type = 'button';
    done.textContent = 'Launch next block';
    done.addEventListener('click', () => {
      ctx.bus.emit('run:refitCloseRequested', {});
    });
    foot.appendChild(done);
    rootEl.appendChild(foot);
    if (typeof done.focus === 'function') {
      try { done.focus(); } catch { /* focus is best-effort */ }
    }
  },

  refresh(ctx) {
    const rows = this._rows;
    const context = ctx || this._ctx;
    if (!rows || !context) return;
    rows.innerHTML = '';
    const loadout = activeLoadout(context);
    const player = context.state && context.state.player;
    const spares = Array.isArray(player && player.moduleInventory) ? player.moduleInventory : [];

    loadout.fittings.forEach((defId, slotIndex) => {
      const k = document.createElement('div');
      k.className = 'k';
      k.textContent = `Slot ${slotIndex + 1}`;
      rows.appendChild(k);

      const v = document.createElement('div');
      v.textContent = prettyDefId(defId);
      rows.appendChild(v);

      const action = document.createElement('button');
      action.className = 'sf-btn';
      action.type = 'button';
      if (defId) {
        action.textContent = 'Strip';
        action.addEventListener('click', () => {
          // Routed through the run owner, which calls ships.unfitModule directly. The ui:* intents
          // are gated behind a real station berth and an arena has no station.
          context.bus.emit('run:refitStripRequested', { slotIndex });
          this.refresh(context);
        });
      } else {
        const spare = spares[spares.length - 1] || null;
        action.textContent = spare ? `Fit ${prettyDefId(spare.defId)}` : 'Empty';
        action.disabled = !spare;
        if (spare) {
          action.addEventListener('click', () => {
            context.bus.emit('run:refitFitRequested', { slotIndex, instanceId: spare.instanceId });
            this.refresh(context);
          });
        }
      }
      rows.appendChild(action);
    });
  },
};
