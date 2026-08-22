// Survival draft owner (PQ-133 / CRU-016) and refit host (CRU-017).
//
// When the run enters `draft`, this offers three seeded choices and opens the draft surface. When
// the player picks, the choice is applied through the REAL ships fitting APIs — grantModule then
// fitModule — exactly as any other module reaches a hull. Nothing here writes fittings by hand and
// nothing here writes state.run: the immutable pick record goes to runSession, which owns that
// envelope.
//
// It also guarantees the run never stalls. A draft with no legal offer, a refused fit, or a missing
// ships owner all still emit run:draftResolved, because survivalRun waits on that receipt forever.
//
// Init-order only: event-driven, never registered in PRODUCTION_UPDATE_ORDER, never ticks.

import { validateRunState } from '../core/runState.js';
import { SURVIVAL_DRAFT_CHOICES, offerDraft } from '../data/survivalDraft.js';

export const CRUCIBLE_DRAFT_SCREEN_ID = 'crucibleDraft';
export const CRUCIBLE_REFIT_SCREEN_ID = 'crucibleRefit';

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

  _reset() {
    this._offers = null;
    this._wave = 0;
    this._resolved = true;
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
    const loadout = this._activeLoadout();
    const result = offerDraft({
      seed: run.seed,
      wave: run.wave,
      hullId: loadout.hullId,
      fittings: loadout.fittings,
      pickCount: Array.isArray(run.draftHistory) ? run.draftHistory.length : 0,
      count: SURVIVAL_DRAFT_CHOICES,
    });
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
    this._emit('run:draftOffered', { wave: run.wave, offers: offers.map((o) => ({ ...o })) });
    this._openScreen(CRUCIBLE_DRAFT_SCREEN_ID);
  },

  _openRefit() {
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    this._wave = run.wave;
    this._emit('run:refitOffered', { wave: run.wave, loadout: this._activeLoadout() });
    this._openScreen(CRUCIBLE_REFIT_SCREEN_ID);
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
      this._emit('run:draftPickRejected', {
        wave: run.wave, offerId: offer.id, reason: applied.reason,
      });
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
    const ok = !!ships.fitModule({ slotIndex, instanceId });
    this._emit('run:refitChanged', { wave: run.wave, slotIndex, action: 'fit', ok });
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
    const ok = !!ships.unfitModule({ slotIndex });
    this._emit('run:refitChanged', { wave: run.wave, slotIndex, action: 'strip', ok });
    return ok;
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
