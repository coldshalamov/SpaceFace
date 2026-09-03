// Crucible draft surface (PQ-133 / CRU-016) and refit surface (CRU-017).
//
// Both are pure DOM over receipts. They read the open offers, the re-roll price and the fittable
// spares from the survivalDraft owner and emit intents back to it; neither writes state.run,
// fittings, or the phase. A pick the fitting authority refuses is reported by the owner, not
// papered over here.
//
// WHY refresh() AND NOT JUST mount(). screenManager mounts a screen ONCE and caches it, calling
// refresh() on every push. Building the cards in mount meant the second draft of a run re-showed
// the first draft's three cards. Everything that changes between drafts — and between paid
// re-rolls within one draft — is built in refresh; the shell, the footer and the keydown listener
// are built once in mount so a re-render cannot destroy them.
//
// WHY THE REFIT ASKS THE OWNER FOR SPARES. It used to offer spares[spares.length - 1] for every
// empty hardpoint, so a player who had drafted five weapons could only ever re-fit the newest.
// The owner now returns every spare that legally fits each hardpoint, decided with the same
// buildSlotList/fits the fitting authority uses. The screen still never calls ships: it emits
// run:refitFitRequested / run:refitStripRequested and reads back what happened.
//
// A REFUSAL IS ALWAYS SAID. Both surfaces carry one aria-live line that reports the owner's last
// refusal in plain words, and the re-roll control is drawn dead — with the price and the balance
// beside it — when it cannot be bought. No control here is allowed to look live and do nothing.
//
// Both ids are in PAUSING_SCREENS: §12.2 adopts a FULL pause during a draft.

import { SURVIVAL_DRAFT_CHOICES } from '../../data/survivalDraft.js';
import { canExtract, requestSurvivalExtraction } from '../../systems/survivalExtraction.js';

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
    font-family:var(--mono); letter-spacing:.06em; font-size:20px; text-transform:uppercase; }
  .sf-menu.sf-crucible .sf-cru-sub { text-align:center; color:var(--ink-dim); font-size:13px;
    letter-spacing:.06em; margin-top:-8px; }
  .sf-menu.sf-crucible .sf-cru-cards { display:grid; gap:12px;
    grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); }
  .sf-menu.sf-crucible .sf-cru-card { display:flex; flex-direction:column; gap:8px; text-align:left;
    border:1px solid var(--line); border-radius:2px; background:rgba(255,255,255,.03);
    padding:14px 15px; cursor:pointer; color:var(--ink); font:inherit; }
  .sf-menu.sf-crucible .sf-cru-card:hover,
  .sf-menu.sf-crucible .sf-cru-card:focus-visible { border-color:var(--accent-3); outline:none; }
  .sf-menu.sf-crucible .sf-cru-verb { font-family:var(--mono); letter-spacing:.06em; font-size:15px;
    text-transform:uppercase; color:var(--accent-3); }
  .sf-menu.sf-crucible .sf-cru-name { font-family:var(--mono); font-size:12px; color:var(--ink-dim); }
  .sf-menu.sf-crucible .sf-cru-blurb { font-size:13px; line-height:1.5; color:var(--ink); }
  .sf-menu.sf-crucible .sf-cru-slot { font-family:var(--mono); font-size:12px; letter-spacing:.06em;
    color:var(--ink-dim); border-top:1px solid var(--line); padding-top:7px; margin-top:auto; }
  .sf-menu.sf-crucible .sf-cru-card { position:relative; }
  .sf-menu.sf-crucible .sf-cru-key { position:absolute; top:10px; right:11px;
    font-family:var(--mono); font-size:12px; letter-spacing:.06em; color:var(--ink-dim);
    border:1px solid var(--line); border-radius:2px; padding:0 5px; line-height:17px; }
  .sf-menu.sf-crucible .sf-cru-foot { display:flex; gap:10px; justify-content:center; margin-top:6px;
    align-items:center; flex-wrap:wrap; }
  .sf-menu.sf-crucible .sf-cru-hint { font-family:var(--mono); font-size:12px; color:var(--ink-dim);
    letter-spacing:.04em; }
  .sf-menu.sf-crucible .sf-cru-wallet { font-family:var(--mono); font-size:12px; letter-spacing:.06em;
    color:var(--ink); }
  .sf-menu.sf-crucible .sf-cru-note { font-size:13px; line-height:1.45; text-align:center;
    color:var(--warn, #dfa04e); }
  .sf-menu.sf-crucible .sf-cru-note:empty { display:none; }
  .sf-menu.sf-crucible .sf-cru-rows { display:grid; grid-template-columns:auto 1fr auto; gap:6px 16px;
    align-items:center; font-family:var(--mono); font-size:12px; }
  .sf-menu.sf-crucible .sf-cru-rows .k { color:var(--ink-dim); letter-spacing:.05em; }
  .sf-menu.sf-crucible .sf-cru-pick { font:inherit; font-size:12px; color:var(--ink);
    background:rgba(255,255,255,.04); border:1px solid var(--line); border-radius:2px;
    padding:4px 6px; max-width:100%; }
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

/**
 * The re-roll control, in words. Exported for the same reason offerCardLines is: a check can
 * assert that an unaffordable re-roll reads as unavailable, with the price and the balance on
 * screen, without standing up a DOM.
 *
 * The refusal sentence comes from the owner (`state.note`) rather than being written again here,
 * so the line a player reads before pressing is the line they read after pressing.
 */
export function rerollControlLines(state, notice = null) {
  const s = state && typeof state === 'object' ? state : {};
  const price = Number.isFinite(s.price) ? s.price : 0;
  const credits = Number.isFinite(s.credits) ? s.credits : 0;
  if (!s.open) {
    return { visible: false, label: '', wallet: '', draw: '', disabled: true, notice: notice || '' };
  }
  const exhausted = s.reason === 'pool_exhausted';
  return {
    visible: true,
    label: exhausted ? 'Re-roll' : `Re-roll · ${price} cr`,
    wallet: `Run wallet ${credits} cr`,
    draw: s.rerolls > 0 ? `Draw ${s.rerolls + 1}` : '',
    disabled: !s.available,
    notice: notice || s.note || '',
  };
}

/** One refit row, in words. `options` is every spare that legally fits this hardpoint. */
export function refitRowLines(row) {
  if (!row) return null;
  const slotIndex = Number.isInteger(row.slotIndex) ? row.slotIndex : 0;
  const label = `Hardpoint ${slotIndex + 1}`;
  if (row.defId) {
    return {
      label,
      value: row.name || prettyDefId(row.defId),
      action: 'Strip',
      disabled: false,
      options: [],
    };
  }
  const spares = Array.isArray(row.spares) ? row.spares : [];
  const options = spares.map((spare) => ({
    instanceId: spare.instanceId,
    label: spare.name || prettyDefId(spare.defId),
  }));
  return {
    label,
    value: options.length ? '' : 'Empty — no spare in the run inventory fits it',
    action: 'Fit',
    disabled: options.length === 0,
    options,
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
    this._root = rootEl;
    rootEl.innerHTML = '';
    rootEl.classList.add('panel', 'sf-menu', 'sf-crucible');
    rootEl.dataset.stamp = 'CRUCIBLE / REARM';
    rootEl.setAttribute('role', 'dialog');
    rootEl.setAttribute('aria-modal', 'true');
    rootEl.setAttribute('aria-labelledby', 'sf-crucible-draft-title');

    const h = document.createElement('h1');
    h.id = 'sf-crucible-draft-title';
    h.textContent = 'Rearm';
    rootEl.appendChild(h);

    const sub = document.createElement('div');
    sub.className = 'sf-cru-sub';
    rootEl.appendChild(sub);
    this._sub = sub;

    const cards = document.createElement('div');
    cards.className = 'sf-cru-cards';
    rootEl.appendChild(cards);
    this._cards = cards;

    // One line for everything that went wrong, announced politely rather than shouted. A refused
    // pick, a refused re-roll and an unaffordable price all land here.
    const note = document.createElement('div');
    note.className = 'sf-cru-note';
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    rootEl.appendChild(note);
    this._note = note;

    const foot = document.createElement('div');
    foot.className = 'sf-cru-foot';
    const skip = document.createElement('button');
    skip.className = 'sf-btn';
    skip.type = 'button';
    skip.textContent = 'Keep current loadout';
    skip.addEventListener('click', () => {
      ctx.bus.emit('run:draftPickRequested', { offerId: null });
    });
    foot.appendChild(skip);
    this._skip = skip;

    // The run wallet is filled by physical chips the player chased down. This is the one place it
    // buys something, so this is where the balance has to be legible.
    const reroll = document.createElement('button');
    reroll.className = 'sf-btn';
    reroll.type = 'button';
    reroll.textContent = 'Re-roll';
    reroll.addEventListener('click', () => this._requestReroll(ctx));
    foot.appendChild(reroll);
    this._rerollBtn = reroll;

    const wallet = document.createElement('span');
    wallet.className = 'sf-cru-wallet';
    foot.appendChild(wallet);
    this._wallet = wallet;

    const hint = document.createElement('span');
    hint.className = 'sf-cru-hint';
    foot.appendChild(hint);
    this._hint = hint;

    rootEl.appendChild(foot);

    // The run is fully paused on this choice, so it must be answerable from the keyboard: 1/2/3
    // pick, arrows move, R buys another draw, Escape keeps the current loadout. Escape is
    // otherwise dead here (the screen is locked so the manager will not pop it), which would
    // leave a paused player with a key that does nothing.
    rootEl.addEventListener('keydown', (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const all = [...cards.querySelectorAll('.sf-cru-card')];
      const index = '123'.indexOf(event.key);
      if (index >= 0 && all[index]) {
        event.preventDefault();
        all[index].click();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        skip.click();
        return;
      }
      // Not reroll.click(): the button is drawn dead when the price is out of reach, and a dead
      // button swallows a click. The owner is the authority on the refusal either way, and the
      // player gets told why instead of nothing happening.
      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        this._requestReroll(ctx);
        return;
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        const here = all.indexOf(document.activeElement);
        if (here < 0 || all.length === 0) return;
        event.preventDefault();
        const step = event.key === 'ArrowRight' ? 1 : -1;
        const next = all[(here + step + all.length) % all.length];
        if (next && typeof next.focus === 'function') next.focus();
      }
    });

    this.refresh(ctx);
  },

  _requestReroll(ctx) {
    const context = ctx || this._ctx;
    if (!context || !context.bus) return;
    // Intent out, then re-read. The bus is synchronous, so by the time this returns the owner has
    // either swapped the offers or recorded why it would not.
    context.bus.emit('run:draftRerollRequested', {});
    this.refresh(context);
  },

  refresh(ctx) {
    const context = ctx || this._ctx;
    const rootEl = this._root;
    const cards = this._cards;
    if (!context || !rootEl || !cards) return;
    this._ctx = context;

    const owner = draftOwner(context);
    const offers = owner && typeof owner.currentOffers === 'function' ? owner.currentOffers() : [];
    const wave = owner && typeof owner.currentWave === 'function' ? owner.currentWave() : 0;
    const notice = owner && typeof owner.lastNotice === 'function' ? owner.lastNotice() : null;
    const rerollState = owner && typeof owner.rerollState === 'function' ? owner.rerollState() : null;
    const lines = rerollControlLines(rerollState, notice);

    this._sub.textContent = offers.length
      ? `Wave ${wave} cleared. Choose one — it changes what your guns do, not what they score.`
      : `Wave ${wave} cleared. Nothing new fits this hull.`;

    cards.innerHTML = '';
    for (const offer of offers.slice(0, SURVIVAL_DRAFT_CHOICES)) {
      const card = this._buildCard(context, offer, cards.childElementCount + 1);
      cards.appendChild(card);
    }

    this._note.textContent = lines.notice || '';

    this._skip.textContent = offers.length ? 'Keep current loadout' : 'Continue';

    const reroll = this._rerollBtn;
    reroll.textContent = lines.label || 'Re-roll';
    reroll.disabled = !!lines.disabled;
    reroll.setAttribute('aria-disabled', lines.disabled ? 'true' : 'false');
    reroll.hidden = !lines.visible;
    reroll.style.display = lines.visible ? '' : 'none';
    // The balance, and which draw this is — a player who has paid twice should be able to see it.
    this._wallet.textContent = lines.visible
      ? (lines.draw ? `${lines.wallet} · ${lines.draw}` : lines.wallet)
      : '';
    this._hint.textContent = offers.length
      ? (lines.visible ? '1-3 choose · R re-roll · Esc keep' : '1-3 choose · Esc keep')
      : '';

    // Only claim focus when it is not already inside this surface. A refused re-roll must not
    // yank the player off the control they just used.
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (!active || !rootEl.contains || !rootEl.contains(active)) {
      const target = cards.firstElementChild || this._skip;
      if (target && typeof target.focus === 'function') {
        try { target.focus(); } catch { /* focus is best-effort */ }
      }
    }
  },

  _buildCard(ctx, offer, keyNumber) {
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

    const key = document.createElement('span');
    key.className = 'sf-cru-key';
    key.textContent = String(keyNumber);
    key.setAttribute('aria-hidden', 'true');
    card.appendChild(key);

    card.addEventListener('click', () => {
      ctx.bus.emit('run:draftPickRequested', { offerId: offer.id });
    });
    return card;
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
    sub.textContent = 'Strip a hardpoint, or choose any spare the run has earned and fit it.';
    rootEl.appendChild(sub);

    const rows = document.createElement('div');
    rows.className = 'sf-cru-rows';
    rootEl.appendChild(rows);
    this._rows = rows;

    const note = document.createElement('div');
    note.className = 'sf-cru-note';
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    rootEl.appendChild(note);
    this._note = note;

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

    // WALK AWAY WITH IT (PQ-135). Extraction has existed since PQ-133.10b and was reachable only
    // from a bus event — "No UI", says its own header — so no player has ever been offered it.
    // An endless run needs it more than the arc ever did: without a voluntary end, the ONLY way a
    // swarm run finishes is dying, and a good run's reward for being good is a worse ending. This
    // is the one surface that is open at a ten-wave boundary, which is exactly the window
    // extraction is legal in, so the offer belongs here and nowhere else.
    if (canExtract(ctx && ctx.state && ctx.state.run)) {
      const out = document.createElement('button');
      out.className = 'sf-btn';
      out.type = 'button';
      out.textContent = 'Extract — end the run here';
      out.title = 'Bank this run and stop, instead of flying on until something kills you.';
      out.addEventListener('click', () => {
        requestSurvivalExtraction(ctx.bus);
      });
      foot.appendChild(out);
    }

    const hint = document.createElement('span');
    hint.className = 'sf-cru-hint';
    hint.textContent = 'Enter or Esc launch';
    foot.appendChild(hint);
    rootEl.appendChild(foot);

    // Same reasoning as the draft: the run is paused here, so Escape must mean something.
    rootEl.addEventListener('keydown', (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== 'Escape') return;
      event.preventDefault();
      done.click();
    });

    if (typeof done.focus === 'function') {
      try { done.focus(); } catch { /* focus is best-effort */ }
    }
  },

  refresh(ctx) {
    const rows = this._rows;
    const context = ctx || this._ctx;
    if (!rows || !context) return;
    this._ctx = context;
    rows.innerHTML = '';

    for (const row of this._rows_data(context)) {
      const lines = refitRowLines(row);
      if (!lines) continue;

      const k = document.createElement('div');
      k.className = 'k';
      k.textContent = lines.label;
      rows.appendChild(k);

      const v = document.createElement('div');
      if (lines.options.length) {
        // Every compatible spare, not just the newest. A select keeps a long inventory answerable
        // from the keyboard without stacking one button per spare per hardpoint.
        const pick = document.createElement('select');
        pick.className = 'sf-cru-pick';
        pick.setAttribute('aria-label', `Spare for ${lines.label.toLowerCase()}`);
        for (const option of lines.options) {
          const opt = document.createElement('option');
          opt.value = String(option.instanceId);
          opt.textContent = option.label;
          pick.appendChild(opt);
        }
        v.appendChild(pick);
        row._pick = pick;
      } else {
        v.textContent = lines.value;
      }
      rows.appendChild(v);

      const action = document.createElement('button');
      action.className = 'sf-btn';
      action.type = 'button';
      action.textContent = lines.action;
      action.disabled = !!lines.disabled;
      if (!lines.disabled) {
        action.addEventListener('click', () => {
          // Routed through the run owner, which calls ships.unfitModule / ships.fitModule
          // directly. The ui:* intents are gated behind a real station berth and an arena has no
          // station.
          if (row.defId) {
            context.bus.emit('run:refitStripRequested', { slotIndex: row.slotIndex });
          } else {
            const chosen = this._chosenSpare(row);
            if (chosen) {
              context.bus.emit('run:refitFitRequested', {
                slotIndex: row.slotIndex, instanceId: chosen.instanceId,
              });
            }
          }
          this.refresh(context);
        });
      }
      rows.appendChild(action);
    }

    const owner = draftOwner(context);
    const notice = owner && typeof owner.lastNotice === 'function' ? owner.lastNotice() : null;
    if (this._note) this._note.textContent = notice || '';
  },

  /** Match the select back to the owner's own row data, so no id is retyped through a string. */
  _chosenSpare(row) {
    const spares = Array.isArray(row && row.spares) ? row.spares : [];
    if (spares.length === 0) return null;
    const value = row._pick ? String(row._pick.value) : null;
    if (value == null) return spares[0];
    return spares.find((spare) => String(spare.instanceId) === value) || spares[0];
  },

  /**
   * Hardpoint rows from the run owner. It knows which spares legally fit which hardpoint; falling
   * back to a bare fittings read keeps the surface honest (and closable) if the owner is absent,
   * with the fitting authority still the one that says no.
   */
  _rows_data(context) {
    const owner = draftOwner(context);
    if (owner && typeof owner.refitRows === 'function') {
      const rows = owner.refitRows();
      if (Array.isArray(rows) && rows.length) return rows;
    }
    const loadout = activeLoadout(context);
    return loadout.fittings.map((defId, slotIndex) => ({
      slotIndex, defId: defId || null, name: defId ? prettyDefId(defId) : null, spares: [],
    }));
  },
};
