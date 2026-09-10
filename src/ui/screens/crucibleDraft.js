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
//
// Both are built on the frontend kit (styles/kit.css, src/ui/kit/) — Frontend Task D §1.2. This
// file owns no CSS. The draft is three offers across on the sky, each a verb, a name and one line,
// with its key in fine print; the focused one bright. The refit is a column of hardpoint rows.

import { SURVIVAL_DRAFT_CHOICES } from '../../data/survivalDraft.js';
import { canExtract, requestSurvivalExtraction } from '../../systems/survivalExtraction.js';
import { el, settle, cue } from '../kit/index.js';

/** A kit word (`button.k-word`). The caller appends it. */
function word(label, className) {
  const button = el('button', 'k-word' + (className ? ' ' + className : ''), label);
  button.type = 'button';
  return button;
}

/** Append a word to a `.k-words` list, in its `li`. */
function addWord(list, button) {
  const li = el('li');
  li.appendChild(button);
  list.appendChild(li);
  return button;
}

/** Guarded kit motion: the unit tests import this module under node with no frame clock. */
function canAnimate() {
  return typeof requestAnimationFrame === 'function' && typeof document !== 'undefined'
    && typeof document.createElement === 'function' && typeof HTMLElement === 'function';
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
    this._ctx = ctx;
    this._root = rootEl;
    rootEl.innerHTML = '';
    rootEl.classList.add('k-screen', 'k-screen--stage', 'sf-crucible', 'sf-crucible-draft');
    rootEl.dataset.kReady = '0';
    rootEl.dataset.stamp = 'CRUCIBLE / REARM';
    rootEl.setAttribute('role', 'dialog');
    rootEl.setAttribute('aria-modal', 'true');
    rootEl.setAttribute('aria-labelledby', 'sf-crucible-draft-title');

    // .k-title — "Rearm" and the sub sentence (refresh writes it: which wave, and what a pick does).
    const title = el('header', 'k-title');
    const h = el('h1', 'k-display k-t-title', 'Rearm');
    this._title = h;
    h.id = 'sf-crucible-draft-title';
    title.appendChild(h);
    const sub = el('p', 'k-t-emph k-62 sf-cru-sub', '');
    title.appendChild(sub);
    rootEl.appendChild(title);
    this._sub = sub;

    // .k-stage — the three offers across on the sky, then the one status line.
    const stage = el('section', 'k-stage sf-cru-stage');
    const filters = el('div', 'k-words k-words--row sf-cru-filters');
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', 'Armory category');
    this._category = 'All';
    for (const category of ['All', 'Weapons', 'Rigs', 'Survival']) {
      const button = word(category, 'k-word--fine');
      button.dataset.category = category;
      button.addEventListener('click', () => { this._category = category; this.refresh(ctx); });
      filters.appendChild(button);
    }
    this._filters = filters;
    stage.appendChild(filters);
    const cards = el('div', 'sf-cru-cards');
    cards.setAttribute('role', 'group');
    cards.setAttribute('aria-label', 'Offers');
    stage.appendChild(cards);
    this._cards = cards;

    // One line for everything that went wrong, announced politely rather than shouted. A refused
    // pick, a refused re-roll and an unaffordable price all land here.
    const note = el('p', 'k-sentence sf-cru-note', '');
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    stage.appendChild(note);
    this._note = note;
    rootEl.appendChild(stage);

    // .k-foot — Keep current loadout, Re-roll (with the wallet beside it), the keys in fine print.
    const foot = el('footer', 'k-foot sf-cru-foot');
    const words = el('ul', 'k-words k-words--row');
    words.setAttribute('aria-label', 'Rearm');
    const skip = addWord(words, word('Keep current loadout', 'k-word--emph'));
    skip.addEventListener('click', () => {
      ctx.bus.emit('run:draftPickRequested', { offerId: null });
    });
    this._skip = skip;
    const refit = addWord(words, word('Rearrange loadout', 'k-word--emph'));
    refit.addEventListener('click', () => ctx.bus.emit('ui:pushScreen', { id: 'crucibleRefit' }));
    this._refitBtn = refit;

    // The run wallet is filled by physical chips the player chased down. This is the one place it
    // buys something, so this is where the balance has to be legible.
    const reroll = addWord(words, word('Re-roll', 'k-word--emph'));
    reroll.addEventListener('click', () => this._requestReroll(ctx));
    this._rerollBtn = reroll;
    foot.appendChild(words);

    const fine = el('p', 'k-t-fine k-38 sf-cru-fine');
    const wallet = el('span', 'sf-cru-wallet', '');
    fine.appendChild(wallet);
    this._wallet = wallet;
    const hint = el('span', 'sf-cru-hint', '');
    fine.appendChild(hint);
    this._hint = hint;
    foot.appendChild(fine);
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

    this._regions = { title: h, stage, foot };
    this.refresh(ctx);
    rootEl.dataset.kReady = '1';
  },

  onShow() {
    const r = this._regions;
    if (!r || !canAnimate()) return;
    cue('open');
    try {
      settle(r.stage, { from: 'left', delay: 60, state: 'crucibleDraft:open' });
      settle(r.foot, { from: 'bottom', delay: 120, state: 'crucibleDraft:open' });
    } catch { /* motion is cosmetic */ }
  },

  onHide() {
    if (canAnimate()) cue('close');
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
    const shop = context.state?.run?.ruleset === 'swarm';
    rootEl.classList.toggle('sf-crucible-armory', shop);
    this._title.textContent = shop ? 'Armory' : 'Rearm';
    this._filters.hidden = !shop;
    this._refitBtn.hidden = !shop;
    for (const button of this._filters.children) {
      button.setAttribute('aria-pressed', String(button.dataset.category === this._category));
    }

    this._sub.textContent = offers.length
      ? (shop ? `Round ${wave} cleared. Buy a new toy, or save for something bigger.`
        : `Wave ${wave} cleared. Choose a new weapon.`)
      : `Wave ${wave} cleared. Nothing new fits this hull.`;

    cards.innerHTML = '';
    const categoryFor = offer => offer.defId.startsWith('wpn_') ? 'Weapons'
      : /engine|shield|thermal|afterburner|chaff/.test(offer.defId) ? 'Survival' : 'Rigs';
    const visibleOffers = shop
      ? offers.filter(offer => this._category === 'All' || categoryFor(offer) === this._category)
        .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name))
      : offers.slice(0, SURVIVAL_DRAFT_CHOICES);
    for (const offer of visibleOffers) {
      const card = this._buildCard(context, offer, cards.childElementCount + 1);
      cards.appendChild(card);
    }

    this._note.textContent = notice || lines.notice || '';

    this._skip.textContent = shop ? `Launch round ${wave + 1}` : (offers.length ? 'Keep current loadout' : 'Continue');

    const reroll = this._rerollBtn;
    reroll.textContent = lines.label || 'Re-roll';
    reroll.disabled = !!lines.disabled;
    reroll.setAttribute('aria-disabled', lines.disabled ? 'true' : 'false');
    reroll.hidden = !lines.visible;
    reroll.style.display = lines.visible ? '' : 'none';
    // The balance, and which draw this is — a player who has paid twice should be able to see it.
    this._wallet.textContent = shop ? `${context.state.run.credits} cr to spend` : lines.visible
      ? (lines.draw ? `${lines.wallet} · ${lines.draw}` : lines.wallet)
      : '';
    const keys = offers.length
      ? (shop ? 'Buy and fit · Tab browse · Esc launch' : (lines.visible ? '1-3 choose · R re-roll · Esc keep' : '1-3 choose · Esc keep'))
      : '';
    this._hint.textContent = keys && this._wallet.textContent ? ` · ${keys}` : keys;

    // Only claim focus when it is not already inside this surface. A refused re-roll must not
    // yank the player off the control they just used.
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (!active || !rootEl.contains || !rootEl.contains(active)) {
      const target = cards.querySelector('button:not(:disabled)') || this._skip;
      if (target && typeof target.focus === 'function') {
        try { target.focus(); } catch { /* focus is best-effort */ }
      }
    }
  },

  // One offer: the key numeral in fine print, the verb as the one permitted caps label, the name
  // at sub-title size, the blurb as a sentence, the slot in fine print. The whole block is the button.
  _buildCard(ctx, offer, keyNumber) {
    const lines = offerCardLines(offer);
    const card = el('button', 'sf-cru-card');
    card.type = 'button';
    card.dataset.offerId = offer.id;
    card.setAttribute('aria-label', `${lines.verb}. ${lines.name}. ${lines.blurb} ${lines.slot}`);

    const key = el('p', 'k-t-fine k-38 sf-cru-key', keyNumber <= 3 ? String(keyNumber) : '');
    key.setAttribute('aria-hidden', 'true');
    card.appendChild(key);
    card.appendChild(el('p', 'k-caps sf-cru-verb', lines.verb));
    card.appendChild(el('h2', 'k-display k-t-sub sf-cru-name', lines.name));
    card.appendChild(el('p', 'k-sentence sf-cru-blurb', lines.blurb));
    if (Number.isFinite(offer.price)) {
      card.appendChild(el('p', 'k-t-emph sf-cru-price', offer.purchased ? 'FITTED' : `${offer.price} cr`));
      if (offer.unavailableReason && !offer.purchased) {
        card.appendChild(el('p', 'k-t-fine sf-cru-afford', offer.unavailableReason));
      }
      card.disabled = !offer.available;
      card.setAttribute('aria-label', `${lines.verb}. ${lines.name}. ${lines.blurb} ${offer.price} credits. ${offer.unavailableReason || lines.slot}`);
    }
    card.appendChild(el('p', 'k-t-fine k-38 sf-cru-slot', lines.slot));

    card.addEventListener('click', () => {
      ctx.bus.emit('run:draftPickRequested', { offerId: offer.id });
      if (ctx.state?.run?.ruleset === 'swarm' && ctx.state.run.phase === 'draft') this.refresh(ctx);
    });
    return card;
  },
};

export const crucibleRefitScreen = {
  id: 'crucibleRefit',
  data: { locked: true },

  mount(rootEl, ctx) {
    rootEl.innerHTML = '';
    rootEl.classList.add('k-screen', 'k-screen--stage', 'sf-crucible', 'sf-crucible-refit');
    rootEl.dataset.kReady = '0';
    rootEl.dataset.stamp = 'CRUCIBLE / REFIT';
    rootEl.setAttribute('role', 'dialog');
    rootEl.setAttribute('aria-modal', 'true');
    rootEl.setAttribute('aria-labelledby', 'sf-crucible-refit-title');

    const title = el('header', 'k-title');
    const h = el('h1', 'k-display k-t-title', 'Refit');
    h.id = 'sf-crucible-refit-title';
    title.appendChild(h);
    title.appendChild(el('p', 'k-t-emph k-62 sf-cru-sub',
      'Strip a hardpoint, or choose any spare the run has earned and fit it.'));
    rootEl.appendChild(title);

    // .k-stage — one row per hardpoint: its name, what is fitted beneath, the spare picker and the
    // verb on the right.
    const stage = el('section', 'k-stage k-stage--scroll sf-cru-stage');
    const rows = el('ul', 'k-rows sf-cru-rows');
    rows.style.setProperty('--k-row-cols', 'minmax(0, 1fr) auto');
    rows.setAttribute('aria-label', 'Hardpoints');
    stage.appendChild(rows);
    this._rows = rows;

    const note = el('p', 'k-sentence sf-cru-note', '');
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    stage.appendChild(note);
    this._note = note;
    rootEl.appendChild(stage);

    this._ctx = ctx;
    this.refresh(ctx);

    const foot = el('footer', 'k-foot sf-cru-foot');
    const words = el('ul', 'k-words k-words--row');
    words.setAttribute('aria-label', 'Refit');
    const done = addWord(words, word('Launch next block', 'k-word--emph k-word--primary'));
    done.addEventListener('click', () => {
      if (ctx.state.run?.phase === 'draft') ctx.bus.emit('ui:popScreen', {});
      else ctx.bus.emit('run:refitCloseRequested', {});
    });
    this._done = done;
    done.textContent = ctx.state.run?.phase === 'draft' ? 'Back to armory' : 'Launch next round';

    // WALK AWAY WITH IT (PQ-135). Extraction has existed since PQ-133.10b and was reachable only
    // from a bus event — "No UI", says its own header — so no player has ever been offered it.
    // An endless run needs it more than the arc ever did: without a voluntary end, the ONLY way a
    // swarm run finishes is dying, and a good run's reward for being good is a worse ending. This
    // is the one surface that is open at a ten-wave boundary, which is exactly the window
    // extraction is legal in, so the offer belongs here and nowhere else.
    {
      const out = addWord(words, word('Extract — end the run here', 'k-word--emph'));
      this._extract = out;
      out.hidden = !canExtract(ctx?.state?.run);
      out.title = 'Bank this run and stop, instead of flying on until something kills you.';
      out.addEventListener('click', () => {
        requestSurvivalExtraction(ctx.bus);
      });
    }
    foot.appendChild(words);
    this._refitHint = el('p', 'k-t-fine k-38 sf-cru-fine sf-cru-hint',
      ctx.state.run?.phase === 'draft' ? 'Esc back to armory' : 'Esc launch');
    foot.appendChild(this._refitHint);
    rootEl.appendChild(foot);

    // Same reasoning as the draft: the run is paused here, so Escape must mean something.
    rootEl.addEventListener('keydown', (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== 'Escape') return;
      event.preventDefault();
      done.click();
    });

    this._regions = { title: h, stage, foot };
    rootEl.dataset.kReady = '1';
    if (typeof done.focus === 'function') {
      try { done.focus(); } catch { /* focus is best-effort */ }
    }
  },

  onShow() {
    const r = this._regions;
    if (!r || !canAnimate()) return;
    cue('open');
    try {
      settle(r.stage, { from: 'left', delay: 60, state: 'crucibleRefit:open' });
      settle(r.foot, { from: 'bottom', delay: 120, state: 'crucibleRefit:open' });
    } catch { /* motion is cosmetic */ }
  },

  onHide() {
    if (canAnimate()) cue('close');
  },

  refresh(ctx) {
    const rows = this._rows;
    const context = ctx || this._ctx;
    if (!rows || !context) return;
    this._ctx = context;
    if (this._done) this._done.textContent = context.state.run?.phase === 'draft' ? 'Back to armory' : 'Launch next round';
    if (this._extract) this._extract.hidden = !canExtract(context.state.run);
    if (this._refitHint) this._refitHint.textContent = context.state.run?.phase === 'draft' ? 'Esc back to armory' : 'Esc launch';
    rows.innerHTML = '';

    for (const row of this._rows_data(context)) {
      const lines = refitRowLines(row);
      if (!lines) continue;

      const item = el('li', 'k-row k-row--static sf-cru-row');
      const left = el('div');
      left.appendChild(el('span', 'k-row__name', lines.label));
      if (lines.options.length) {
        // Every compatible spare, not just the newest. A select keeps a long inventory answerable
        // from the keyboard without stacking one button per spare per hardpoint.
        const pick = el('select', 'k-select sf-cru-pick');
        pick.setAttribute('aria-label', `Spare for ${lines.label.toLowerCase()}`);
        for (const option of lines.options) {
          const opt = el('option', '', option.label);
          opt.value = String(option.instanceId);
          pick.appendChild(opt);
        }
        const sub = el('div', 'k-row__sub');
        sub.appendChild(pick);
        left.appendChild(sub);
        row._pick = pick;
      } else {
        left.appendChild(el('div', 'k-row__sub', lines.value));
      }
      item.appendChild(left);

      const action = word(lines.action, lines.action === 'Strip' ? 'k-word--body k-word--danger' : 'k-word--body');
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
      item.appendChild(action);
      rows.appendChild(item);
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
