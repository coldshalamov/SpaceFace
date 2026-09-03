// Survival draft owner (PQ-133 / CRU-016) and refit host (CRU-017).
//
// When the run enters `draft`, this offers three seeded choices and opens the draft surface. When
// the player picks, the choice is applied through the REAL ships fitting APIs — grantModule then
// fitModule — exactly as any other module reaches a hull. Nothing here writes fittings by hand and
// nothing here writes state.run: the immutable pick record goes to runSession, which owns that
// envelope.
//
// It also guarantees the run never stalls. A draft with no legal offer, a refused fit, a refused
// re-roll, or a missing ships owner all still end in exactly one run:draftResolved, because
// survivalRun waits on that receipt forever. Buying a re-roll is never a resolution: it re-draws
// and leaves the surface open, so the pick or the skip is still owed.
//
// THE RUN WALLET BUYS SOMETHING (CRU-016b). Credits are earned physically — chips drop, magnetise
// and settle — and until now the only consumer was a row on the results screen. Here they buy one
// thing: another draw. The charge goes out as run:spendRequested and the swap only happens on the
// run:spent receipt that comes back, because runSession is the sole writer of state.run and it is
// the authority on whether the wallet could stand it. Nothing here decrements a balance.
//
// Refusals are SAID, not swallowed. A refused fit, a refused pick and a refused re-roll each set a
// plain-language notice the open surface reads back, so the player is never told "no" by a button
// that simply did nothing.
//
// Init-order only: event-driven, never registered in PRODUCTION_UPDATE_ORDER, never ticks.

import { validateRunState } from '../core/runState.js';
import { MODULES } from '../data/modules.js';
import { SHIPS } from '../data/ships.js';
import { SURVIVAL_DRAFT_CHOICES, offerDraft, rerollPrice } from '../data/survivalDraft.js';
import { isSwarmDraftWave, isSwarmRefitWave, isSwarmRuleset } from './survivalSwarm.js';
import { WEAPONS } from '../data/weapons.js';
import { buildSlotList, fits } from './ships.js';

export const CRUCIBLE_DRAFT_SCREEN_ID = 'crucibleDraft';
export const CRUCIBLE_REFIT_SCREEN_ID = 'crucibleRefit';

/**
 * Stamped on the wallet charge and checked on the way back. runSession echoes `reason` onto both
 * run:spent and run:spendRejected, so this is what tells our own receipt apart from anyone else's
 * — a re-roll can never be applied off a spend it did not ask for.
 */
export const CRUCIBLE_REROLL_SPEND_REASON = 'crucible:draftReroll';

const MODULE_DEF_BY_ID = new Map([
  ...MODULES.map((def) => [def.id, def]),
  ...WEAPONS.map((def) => [def.id, def]),
]);
const SHIP_DEF_BY_ID = new Map(SHIPS.map((def) => [def.id, def]));

function prettyDefId(defId) {
  if (!defId) return 'empty';
  return String(defId).replace(/^(wpn|mod)_/, '').replace(/_/g, ' ');
}

function liveSurvivalRun(state) {
  if (!state) return null;
  const run = state.run;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
  if (run.kind !== 'survival') return null;
  if (run.phase === 'inactive') return null;
  if (!validateRunState(run).ok) return null;
  return run;
}

export const survivalDraft = {
  name: 'survivalDraft',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || null;
    this.registry = ctx.registry || null;
    this._unsubs = [];
    this._reset();
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._unsubs.push(this.bus.on('run:transitioned', (p) => this._onTransitioned(p)));
    this._unsubs.push(this.bus.on('run:draftPickRequested', (p) => this.resolvePick(p)));
    this._unsubs.push(this.bus.on('run:refitCloseRequested', (p) => this.closeRefit(p)));
    this._unsubs.push(this.bus.on('run:refitFitRequested', (p) => this.refitFit(p)));
    this._unsubs.push(this.bus.on('run:refitStripRequested', (p) => this.refitStrip(p)));
    this._unsubs.push(this.bus.on('run:draftRerollRequested', () => this.requestReroll()));
    // The wallet's own receipts. We never read a balance and decide it was fine — runSession says
    // whether the charge landed, and only then do the cards change.
    this._unsubs.push(this.bus.on('run:spent', (p) => this._onSpent(p)));
    this._unsubs.push(this.bus.on('run:spendRejected', (p) => this._onSpendRejected(p)));
    this._unsubs.push(this.bus.on('run:ended', () => this._reset()));
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
  },

  newGame() {
    this._reset();
  },

  /** Live offers for the draft surface. Empty when no draft is open. */
  currentOffers() {
    return this._offers ? this._offers.slice() : [];
  },

  currentWave() {
    return this._wave;
  },

  /** Paid re-rolls taken in the OPEN draft. Resets with every draft, not with the run. */
  rerollCount() {
    return this._rerolls || 0;
  },

  /**
   * The last refusal, in words a player can read. The surfaces poll this instead of subscribing,
   * so a re-render months after the event still says what happened rather than going quiet.
   */
  lastNotice() {
    return this._notice || null;
  },

  _reset() {
    this._offers = null;
    this._wave = 0;
    this._resolved = true;
    this._rerolls = 0;
    this._pendingReroll = null;
    this._draftInput = null;
    this._notice = null;
  },

  _onTransitioned(payload) {
    const phase = payload && payload.phase;
    if (phase === 'draft') {
      this._openDraft();
      return;
    }
    if (phase === 'refit') {
      this._openRefit();
      return;
    }
    // Any other phase closes whatever surface was open; the screens are pausing surfaces and a
    // stale one would hold the world still.
    if (this._offers != null) this._offers = null;
    this._closeScreen(CRUCIBLE_DRAFT_SCREEN_ID);
    this._closeScreen(CRUCIBLE_REFIT_SCREEN_ID);
  },

  _openDraft() {
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    // A swarm run passes THROUGH `draft` between every wave, because cleanup has no legal edge
    // straight back to wave_intro. On the four waves in five that are not upgrade waves, that
    // pass-through must be invisible: resolve it here rather than opening a surface for one frame.
    // Without this the player would see a menu flash on every single wave boundary.
    if (isSwarmRuleset(run.ruleset) && !isSwarmDraftWave(run.wave) && !isSwarmRefitWave(run.wave)) {
      this._offers = null;
      this._wave = run.wave;
      this._resolved = false;
      this._finish({ picked: null, applied: false, reason: 'swarm_continuous' });
      return;
    }
    const loadout = this._activeLoadout();
    // Snapshot every input this draft was drawn from, INCLUDING count. A paid re-roll replays the
    // same inputs with a higher round number; re-deriving them live would let a peek disagree with
    // what the player gets after paying, and that equality is the whole determinism contract.
    this._draftInput = {
      seed: run.seed,
      wave: run.wave,
      hullId: loadout.hullId,
      fittings: loadout.fittings,
      pickCount: Array.isArray(run.draftHistory) ? run.draftHistory.length : 0,
      count: SURVIVAL_DRAFT_CHOICES,
      // The ruleset selects the POOL. A swarm run also draws attack traits and support modules,
      // because a three-slot weapon pool has nothing left to say after three picks.
      ruleset: run.ruleset,
    };
    this._rerolls = 0;
    this._pendingReroll = null;
    this._notice = null;
    const result = offerDraft(this._draftInput);
    const offers = result && result.ok && Array.isArray(result.offers) ? result.offers : [];
    this._wave = run.wave;
    this._resolved = false;
    if (offers.length === 0) {
      // Nothing legal to offer on this hull. Resolve immediately rather than opening an empty
      // surface the player cannot dismiss.
      this._offers = null;
      this._emit('run:draftOffered', { wave: run.wave, offers: [], reason: result && result.reason });
      this._finish({ picked: null, applied: false, reason: 'no_legal_offer' });
      return;
    }
    this._offers = offers;
    this._emit('run:draftOffered', {
      wave: run.wave, offers: offers.map((o) => ({ ...o })), rerolls: 0,
    });
    this._openScreen(CRUCIBLE_DRAFT_SCREEN_ID);
  },

  _openRefit() {
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    this._notice = null;
    this._wave = run.wave;
    this._emit('run:refitOffered', { wave: run.wave, loadout: this._activeLoadout() });
    this._openScreen(CRUCIBLE_REFIT_SCREEN_ID);
  },

  /**
   * Everything a surface needs to draw the re-roll control, including WHY it is unavailable.
   *
   * `available:false` is never silence: the reason travels with it so the button can be drawn
   * plainly dead with the price and the balance beside it, rather than looking live and doing
   * nothing when it is pressed.
   */
  rerollState() {
    const run = liveSurvivalRun(this.state);
    const offers = this._offers || [];
    const rerolls = this._rerolls || 0;
    if (!run || run.phase !== 'draft' || this._resolved || offers.length === 0 || !this._draftInput) {
      return {
        open: false, wave: this._wave, rerolls, price: 0, credits: 0,
        available: false, reason: 'no_draft', note: '',
      };
    }
    // Priced off the SNAPSHOT wave, the same one the cards were drawn from, so the price and the
    // offers can never come from two different waves.
    const wave = this._draftInput.wave;
    const price = rerollPrice(wave, rerolls);
    const credits = Number.isFinite(run.credits) ? run.credits : 0;
    const base = { open: true, wave, rerolls, price, credits };
    // Peek at the round the money would buy. Refusing to charge for cards the player has already
    // been shown is the difference between a price and a tax.
    const next = this._peekOffers(rerolls + 1);
    const changes = next.some((entry) => !offers.some((shown) => shown.id === entry.id));
    // The unavailable wording is built HERE so the sentence a player reads before pressing is the
    // same sentence they read after pressing. Two spellings of one refusal is how a surface starts
    // sounding like it is arguing with itself.
    if (!changes) {
      const info = { ...base, available: false, reason: 'pool_exhausted' };
      return { ...info, note: this._rerollRefusalText(info) };
    }
    if (credits < price) {
      const info = { ...base, available: false, reason: 'insufficient_credits' };
      return { ...info, note: this._rerollRefusalText(info) };
    }
    return { ...base, available: true, reason: null, note: '' };
  },

  /**
   * Buy another draw.
   *
   * The order matters: ASK the wallet, then act on its receipt. We do not read run.credits and
   * decide the charge was fine — runSession owns that envelope and its refusal is authoritative.
   * A re-roll never resolves the draft, so the pick or the skip is still owed afterwards and the
   * run cannot stall on a purchase.
   */
  requestReroll() {
    const info = this.rerollState();
    if (!info.open) return false;
    if (!info.available) {
      this._notice = this._rerollRefusalText(info);
      this._emit('run:draftRerollRejected', {
        wave: info.wave, price: info.price, credits: info.credits, reason: info.reason,
      });
      return false;
    }
    // One charge, one token. The token is what stops a re-entrant or foreign run:spent from
    // applying a second draw off a single payment.
    this._pendingReroll = { price: info.price, next: info.rerolls + 1, wave: info.wave };
    this._emit('run:spendRequested', {
      credits: info.price, reason: CRUCIBLE_REROLL_SPEND_REASON,
    });
    if (this._pendingReroll) {
      // No receipt came back at all — no run owner listening. Nothing was charged, so nothing
      // changes and the draft is still answerable.
      this._pendingReroll = null;
      this._notice = 'The run wallet did not answer. Nothing was charged.';
      this._emit('run:draftRerollRejected', {
        wave: info.wave, price: info.price, credits: info.credits, reason: 'no_receipt',
      });
      return false;
    }
    return (this._rerolls || 0) === info.rerolls + 1;
  },

  _onSpent(payload) {
    const pending = this._pendingReroll;
    if (!pending) return;
    if (!payload || payload.reason !== CRUCIBLE_REROLL_SPEND_REASON) return;
    this._pendingReroll = null;
    const offers = this._peekOffers(pending.next);
    // Paid-for-nothing is not a state we ship. rerollState already refused an empty round, so this
    // is belt and braces: keep the standing offers rather than blanking a surface the run waits on.
    if (offers.length === 0) return;
    this._rerolls = pending.next;
    this._offers = offers;
    this._notice = null;
    this._emit('run:draftRerolled', {
      wave: pending.wave,
      rerolls: pending.next,
      price: pending.price,
      credits: Number.isFinite(payload.totalCredits) ? payload.totalCredits : null,
    });
    this._emit('run:draftOffered', {
      wave: pending.wave, offers: offers.map((o) => ({ ...o })), rerolls: pending.next,
    });
  },

  _onSpendRejected(payload) {
    const pending = this._pendingReroll;
    if (!pending) return;
    if (!payload || payload.reason !== CRUCIBLE_REROLL_SPEND_REASON) return;
    this._pendingReroll = null;
    const credits = Number.isFinite(payload.available) ? payload.available : 0;
    this._notice = this._rerollRefusalText({
      reason: 'insufficient_credits', price: pending.price, credits,
    });
    this._emit('run:draftRerollRejected', {
      wave: pending.wave, price: pending.price, credits, reason: 'insufficient_credits',
    });
  },

  _rerollRefusalText(info) {
    if (info && info.reason === 'pool_exhausted') {
      return 'Nothing else in the pool fits this hull — a re-roll would deal the same three.';
    }
    const price = (info && info.price) || 0;
    const credits = (info && info.credits) || 0;
    return `A re-roll costs ${price} cr. The run wallet holds ${credits} cr.`;
  },

  /** Replay the draft's own inputs at a given round. Pure: no state is touched by a peek. */
  _peekOffers(rerollCount) {
    if (!this._draftInput) return [];
    const result = offerDraft({ ...this._draftInput, rerollCount });
    return result && result.ok && Array.isArray(result.offers) ? result.offers : [];
  },

  /**
   * Resolve the open draft. `offerId` null (or unknown) is a legal skip — the run moves on either
   * way. Applying goes through ships.grantModule + ships.fitModule; a refusal is reported and the
   * draft still resolves.
   */
  resolvePick(request) {
    const run = liveSurvivalRun(this.state);
    if (!run || run.phase !== 'draft') return false;
    if (this._resolved) return false;
    const offers = this._offers || [];
    const offerId = request && request.offerId;
    const offer = offers.find((entry) => entry.id === offerId) || null;
    this._offers = null;
    this._pendingReroll = null;
    this._closeScreen(CRUCIBLE_DRAFT_SCREEN_ID);

    if (!offer) {
      this._finish({ picked: null, applied: false, reason: 'skipped', offers });
      return true;
    }
    const applied = this._applyOffer(offer);
    if (applied.ok) {
      // The record is a NOTE about what the player chose. The live effect is the real fitting on
      // the run's own ephemeral hull; nothing run-shaped is written into a persistent fitting.
      this._emit('run:modifierRecordRequested', {
        record: {
          kind: 'weapon',
          offerId: offer.id,
          verb: offer.verb,
          defId: offer.defId,
          slotIndex: offer.slotIndex,
          replaced: offer.replaces || null,
          wave: run.wave,
        },
        draft: {
          wave: run.wave,
          offered: offers.map((entry) => entry.id),
          picked: offer.id,
        },
        wave: run.wave,
      });
    } else {
      // The surface has already closed and the run is moving on, so an inline notice would never
      // be read. Say it on the shipped toast channel instead — a refusal the player never hears
      // reads as a card that silently did nothing.
      this._notice = `${offer.verb} could not be fitted. Your loadout is unchanged.`;
      this._emit('run:draftPickRejected', {
        wave: run.wave, offerId: offer.id, reason: applied.reason,
      });
      this._emit('toast', { text: this._notice, kind: 'error', ttl: 4 });
    }
    this._finish({
      picked: applied.ok ? offer.id : null,
      applied: applied.ok,
      reason: applied.ok ? 'picked' : applied.reason,
      offers,
    });
    return true;
  },

  /**
   * Refit: fit a spare from the run's own inventory into a hardpoint.
   *
   * Goes to ships.fitModule DIRECTLY, not through the ui:fitModule intent — that intent is gated
   * behind shipworksStationAccess (a real berth with an outfitting service), and an arena has no
   * station. This is the same internal-owner route the Combat Lab setup and crafting rewards take,
   * so the fitting authority, its slot/size/capacity validation and its receipts are unchanged.
   */
  refitFit(request) {
    const run = liveSurvivalRun(this.state);
    if (!run || run.phase !== 'refit') return false;
    const ships = this._ships();
    if (!ships || typeof ships.fitModule !== 'function') return false;
    const slotIndex = request && request.slotIndex;
    const instanceId = request && request.instanceId;
    if (!Number.isInteger(slotIndex) || instanceId == null) return false;
    // Read the def BEFORE the fit: a successful fit takes the spare out of inventory, and the
    // refusal wording needs its name.
    const def = this._spareDef(instanceId);
    const ok = !!ships.fitModule({ slotIndex, instanceId });
    const reason = ok ? null : this._fitRefusalText(ships, slotIndex, def);
    this._notice = reason;
    this._emit('run:refitChanged', { wave: run.wave, slotIndex, action: 'fit', ok, reason });
    return ok;
  },

  /** Refit: strip a hardpoint back to the run's inventory, through the same owner. */
  refitStrip(request) {
    const run = liveSurvivalRun(this.state);
    if (!run || run.phase !== 'refit') return false;
    const ships = this._ships();
    if (!ships || typeof ships.unfitModule !== 'function') return false;
    const slotIndex = request && request.slotIndex;
    if (!Number.isInteger(slotIndex)) return false;
    const held = this._activeLoadout().fittings[slotIndex] || null;
    const ok = !!ships.unfitModule({ slotIndex });
    const reason = ok ? null : this._stripRefusalText(slotIndex, held);
    this._notice = reason;
    this._emit('run:refitChanged', { wave: run.wave, slotIndex, action: 'strip', ok, reason });
    return ok;
  },

  /**
   * Every hardpoint on the run's hull, with EVERY spare that could legally go in it.
   *
   * The surface used to reach one spare — the newest — so a player who had drafted five weapons
   * could only ever refit the last one. Compatibility is decided here with the same buildSlotList
   * and fits() the fitting authority uses, so the list a player is shown and the list ships will
   * accept are the same list.
   */
  refitRows() {
    const loadout = this._activeLoadout();
    const shipDef = loadout.hullId ? SHIP_DEF_BY_ID.get(loadout.hullId) : null;
    if (!shipDef) return [];
    const slots = buildSlotList(shipDef);
    const player = this.state && this.state.player;
    const inventory = Array.isArray(player && player.moduleInventory) ? player.moduleInventory : [];
    return slots.map((slot, slotIndex) => {
      const defId = loadout.fittings[slotIndex] || null;
      const spares = [];
      if (!defId) {
        for (const item of inventory) {
          if (!item || item.instanceId == null) continue;
          const def = MODULE_DEF_BY_ID.get(item.defId);
          if (!def || !fits(slot, def)) continue;
          spares.push({
            instanceId: item.instanceId,
            defId: item.defId,
            name: def.name || prettyDefId(item.defId),
          });
        }
      }
      const heldDef = defId ? MODULE_DEF_BY_ID.get(defId) : null;
      return {
        slotIndex,
        slotType: slot.type,
        slotSize: slot.size,
        defId,
        name: defId ? ((heldDef && heldDef.name) || prettyDefId(defId)) : null,
        spares,
      };
    });
  },

  _spareDef(instanceId) {
    const player = this.state && this.state.player;
    const inventory = Array.isArray(player && player.moduleInventory) ? player.moduleInventory : [];
    for (const item of inventory) {
      if (item && item.instanceId === instanceId) return MODULE_DEF_BY_ID.get(item.defId) || null;
    }
    return null;
  },

  /**
   * Why the fitting authority said no, in its own words where it has them. moduleFitBlocker is the
   * same check fitModule ran, so this reports the real reason rather than a guess made out here.
   */
  _fitRefusalText(ships, slotIndex, def) {
    if (!def) return 'That spare is no longer in the run inventory.';
    const blocker = typeof ships.moduleFitBlocker === 'function'
      ? ships.moduleFitBlocker({ slotIndex, def })
      : null;
    if (blocker && blocker.text) return blocker.text;
    return `${def.name || 'That spare'} cannot go in hardpoint ${slotIndex + 1}.`;
  },

  _stripRefusalText(slotIndex, held) {
    if (!held) return `Hardpoint ${slotIndex + 1} is already empty.`;
    return `${prettyDefId(held)} could not come off — the hold has no room for it.`;
  },

  /** Close the refit surface. survivalRun waits on run:refitClosed before the next wave. */
  closeRefit() {
    const run = liveSurvivalRun(this.state);
    if (!run || run.phase !== 'refit') return false;
    this._closeScreen(CRUCIBLE_REFIT_SCREEN_ID);
    this._emit('run:refitClosed', { wave: run.wave });
    return true;
  },

  _finish(detail) {
    this._resolved = true;
    this._emit('run:draftResolved', {
      wave: this._wave,
      picked: detail.picked,
      applied: !!detail.applied,
      reason: detail.reason || null,
    });
  },

  /**
   * Grant then fit through the ships owner. This is the same route the outfitting UI and the
   * Combat Lab setup take; there is no Survival-only fitting path.
   */
  _applyOffer(offer) {
    const ships = this._ships();
    if (!ships || typeof ships.grantModule !== 'function' || typeof ships.fitModule !== 'function') {
      return { ok: false, reason: 'no_ships_owner' };
    }
    if (!ships.grantModule({ defId: offer.defId, reason: 'crucible:draft' })) {
      return { ok: false, reason: 'grant_refused' };
    }
    const player = this.state && this.state.player;
    const inventory = (player && player.moduleInventory) || [];
    let instance = null;
    for (let i = inventory.length - 1; i >= 0; i--) {
      if (inventory[i] && inventory[i].defId === offer.defId) {
        instance = inventory[i];
        break;
      }
    }
    if (!instance || instance.instanceId == null) return { ok: false, reason: 'grant_missing' };
    const fitted = ships.fitModule({ slotIndex: offer.slotIndex, instanceId: instance.instanceId });
    if (!fitted) return { ok: false, reason: 'fit_refused' };
    return { ok: true, reason: null };
  },

  _ships() {
    return this.registry && typeof this.registry.get === 'function'
      ? this.registry.get('ships')
      : null;
  },

  _activeLoadout() {
    const player = this.state && this.state.player;
    const ships = Array.isArray(player && player.ownedShips) ? player.ownedShips : [];
    const index = Number.isInteger(player && player.activeShipIndex) ? player.activeShipIndex : 0;
    const owned = ships[index] || null;
    return {
      hullId: owned && typeof owned.defId === 'string' ? owned.defId : null,
      fittings: Array.isArray(owned && owned.fittings) ? owned.fittings.slice() : [],
      shipIndex: index,
    };
  },

  _openScreen(id) {
    this._emit('ui:pushScreen', { id });
  },

  _closeScreen(id) {
    this._emit('ui:closeScreen', { id });
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },
};
