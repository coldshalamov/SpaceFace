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
import {
  SURVIVAL_DRAFT_CHOICES,
  auditDraftCatalog,
  auditDraftShapes,
  offerDraft,
  rerollPrice,
  swarmPurchasePrice,
} from '../data/survivalDraft.js';
import {
  bindSwarmRoleProblems,
  isSwarmDraftWave,
  isSwarmRefitWave,
  isSwarmRuleset,
  preferRoleCounterOffers,
  unbindSwarmRoleProblems,
} from './survivalSwarm.js';
import {
  EVOLUTION_OFFER_KIND,
  evolutionOffersFor,
} from '../data/survivalEvolutions.js';
import { WEAPONS } from '../data/weapons.js';
import { buildSlotList, fits, getDerivedStats } from './ships.js';
import { swarmHullPrice } from '../data/swarmCatalog.js';
import { addCargo } from './cargo.js';

export const CRUCIBLE_DRAFT_SCREEN_ID = 'crucibleDraft';
export const CRUCIBLE_REFIT_SCREEN_ID = 'crucibleRefit';

/** Offer kinds that are not fittings: the shelf's hull row and its service counter. */
export const SWARM_HULL_OFFER_KIND = 'hull';
export const SWARM_SERVICE_OFFER_KIND = 'service';

/** Wallet prices for the service counter, in the same short-round economy as the shelf. */
export const SWARM_WELD_PRICE = 40;
export const SWARM_ORDNANCE_PRICE = 15;
/** swarmSupply's own rack ceiling — the service tops up to what the mode already calls full. */
const SWARM_ORDNANCE_RACK_MAX = 6;

/**
 * Stamped on the wallet charge and checked on the way back. runSession echoes `reason` onto both
 * run:spent and run:spendRejected, so this is what tells our own receipt apart from anyone else's
 * — a re-roll can never be applied off a spend it did not ask for.
 */
export const CRUCIBLE_REROLL_SPEND_REASON = 'crucible:draftReroll';
export const CRUCIBLE_PURCHASE_SPEND_REASON = 'crucible:purchase';

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
    bindSwarmRoleProblems(ctx);
    this._unsubs.push(() => unbindSwarmRoleProblems());
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
    // A trial is a receipt for the copy in a slot the moment it stops being that copy. A purchase
    // over the slot, a manual refit, or any unfit lands the displaced demo in the hold on the SAME
    // synchronous emit — so it can be retired deterministically instead of guessed at next armory.
    this._unsubs.push(this.bus.on('module:equipped', () => this._retireDisplacedTrials()));
    this._unsubs.push(this.bus.on('module:unequipped', () => this._retireDisplacedTrials()));
    // The opening armory pushes while the loading gate is still up; the closeAll that rides
    // game:started then hides it, and the run waits on a draft receipt that can never come.
    // Re-open the live draft once the synchronous chain settles — a resolved or never-opened
    // draft makes this a no-op.
    this._unsubs.push(this.bus.on('game:started', () => this._onGameStarted()));
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
    const offers = this._offers ? this._offers.slice() : [];
    const run = liveSurvivalRun(this.state);
    if (!run || !isSwarmRuleset(run.ruleset) || !this._draftInput) return offers;
    // Preserve the stock, but re-evaluate fitting targets after each purchase. Two offers may
    // initially want the same empty slot; the second purchase must see the new loadout.
    const loadout = this._activeLoadout();
    const legal = offerDraft({ ...this._draftInput, ...loadout, count: 100 }).offers || [];
    const legalById = new Map(legal.map((entry) => [entry.id, entry]));
    // Evolutions are not seeded cards — they exist exactly when the build holds their parts, so
    // they re-evaluate against the live loadout the same way slot legality does after a purchase.
    // A part that arrives mid-armory (bought, then stripped at the refit) turns the row on
    // without waiting for the next wave's snapshot.
    for (const entry of this._evolutionOffers(loadout)) legalById.set(entry.id, entry);
    // Hull and service rows have no fitting legality — the extras loop prices and judges them
    // itself. Left through this map they would all read "No compatible slot" at a null price.
    const rows = offers
      .filter((offer) => offer.kind !== SWARM_HULL_OFFER_KIND && offer.kind !== SWARM_SERVICE_OFFER_KIND)
      .map(offer => {
      const purchased = this._purchased?.has(offer.id) === true;
      const current = legalById.get(offer.id);
      const demoed = Number.isInteger(offer.slotIndex)
        && this._trials?.get(offer.slotIndex)?.defId === offer.defId;
      // The live demo IS the legality — offerDraft drops a fitted support module, so the card
      // that seeded the trial would read "No compatible slot" while it is still wearing it.
      const legal = !!current || demoed;
      const price = offer.kind === EVOLUTION_OFFER_KIND ? offer.price : swarmPurchasePrice(offer.defId);
      return { ...offer, ...(current || {}), price, purchased, demoed,
        available: !purchased && legal && price != null && run.credits >= price,
        unavailableReason: purchased ? 'Fitted' : !legal ? 'No compatible slot' :
          run.credits < price ? `Save ${price - run.credits} more cr` : null };
    });
    const shown = new Set(rows.map((row) => row.id));
    for (const entry of this._evolutionOffers(loadout)) {
      if (shown.has(entry.id)) continue;
      const purchased = this._purchased?.has(entry.id) === true;
      rows.push({ ...entry, purchased,
        demoed: Number.isInteger(entry.slotIndex) && this._trials?.get(entry.slotIndex)?.defId === entry.defId,
        available: !purchased && run.credits >= entry.price,
        unavailableReason: purchased ? 'Fitted' : run.credits < entry.price ? `Save ${entry.price - run.credits} more cr` : null });
    }
    // Hull and service rows never come out of offerDraft's slot legality — each carries its own
    // live check, re-read on every refresh so a weld stops offering once the hull is sound and a
    // hull row goes quiet while you are standing in it.
    for (const entry of this._armoryExtras(loadout, run)) {
      if (shown.has(entry.id)) continue;
      const purchased = this._purchased?.has(entry.id) === true;
      const blocked = entry.kind === SWARM_HULL_OFFER_KIND && entry._flying
        ? 'In the cradle'
        : entry.kind === SWARM_HULL_OFFER_KIND && entry._cargoBlocked
          ? 'Cargo would overflow its hold'
          : entry.service === 'weld' && !entry._serviceHurt
          ? 'Hull already sound'
          : entry.service === 'ordnance' && (entry._serviceCharges || 0) >= SWARM_ORDNANCE_RACK_MAX
            ? 'Rack already full'
            : null;
      // A hull already on the manifest is a switch, not a sale — "bought this armory" must not
      // freeze it, or buying a second hull locks the first out of the cradle for the round.
      const spent = purchased && entry.kind !== SWARM_HULL_OFFER_KIND;
      rows.push({ ...entry, purchased,
        available: !spent && !blocked && run.credits >= entry.price,
        unavailableReason: spent ? 'Done' : blocked
          || (run.credits < entry.price ? `Save ${entry.price - run.credits} more cr` : null) });
    }
    return rows;
  },

  /** PQ-175.02 catalog audit. Pure data; does not touch the open draft. */
  catalogAudit(ruleset) {
    return auditDraftCatalog(ruleset);
  },

  /** Honest shape ratio: verb cards that change a verb, not a number. */
  catalogShapes(ruleset) {
    return auditDraftShapes(ruleset);
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
    this._pendingPurchase = null;
    this._purchased = new Set();
    this._trials = new Map();
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
      // Swarm is an armory: the player can plan and save for a known toy. Gauntlet keeps its
      // seeded three-card draft. Capacity and fitting authority still bound the eligible stock.
      count: isSwarmRuleset(run.ruleset) ? 100 : SURVIVAL_DRAFT_CHOICES,
      // The ruleset selects the POOL. A swarm run also draws attack traits and support modules,
      // because a three-slot weapon pool has nothing left to say after three picks.
      ruleset: run.ruleset,
    };
    this._rerolls = 0;
    this._pendingReroll = null;
    this._notice = null;
    this._pendingPurchase = null;
    this._purchased = new Set();
    // A trial fit lives exactly one round: what was demoed at the last armory comes off here,
    // before the offers draw, so the cards price the build as it stands.
    this._clearTrials();
    const result = offerDraft(this._draftInput);
    const offers = result && result.ok && Array.isArray(result.offers) ? result.offers : [];
    this._wave = run.wave;
    this._resolved = false;
    this._offers = preferRoleCounterOffers(offers, this.state);
    // Named syntheses ride the armory list, gated to swarm: the gauntlet draft grants its pick
    // outright and has no run wallet, so "explicit conversion and cost" cannot exist there.
    // The extras are appended BEFORE the empty check: a bare hull stocks an empty fitting shelf
    // but still has a cradle and a service counter, and that armory must open too.
    if (isSwarmRuleset(run.ruleset)) {
      this._offers = this._offers.concat(this._evolutionOffers(loadout), this._armoryExtras(loadout, run));
    }
    if (this._offers.length === 0) {
      // Nothing legal to offer on this hull. Resolve immediately rather than opening an empty
      // surface the player cannot dismiss.
      this._offers = null;
      this._emit('run:draftOffered', { wave: run.wave, offers: [], reason: result && result.reason });
      this._finish({ picked: null, applied: false, reason: 'no_legal_offer' });
      return;
    }
    this._emit('run:draftOffered', {
      wave: run.wave, offers: this._offers.map((o) => ({ ...o })), rerolls: 0,
    });
    this._openScreen(CRUCIBLE_DRAFT_SCREEN_ID);
  },

  /**
   * The synthesis rows a build can take right now. Empty on non-swarm rulesets and on hulls that
   * hold no complete part set — the absence is the offer state, never an error to report.
   */
  _evolutionOffers(loadout) {
    const player = this.state && this.state.player;
    const shipDef = loadout && loadout.hullId ? SHIP_DEF_BY_ID.get(loadout.hullId) : null;
    if (!shipDef) return [];
    return evolutionOffersFor({
      hullId: loadout.hullId,
      slots: buildSlotList(shipDef),
      fittings: loadout.fittings,
      moduleInventory: (player && player.moduleInventory) || [],
    });
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
    if (run && isSwarmRuleset(run.ruleset)) {
      return { open: false, credits: run.credits, available: false, reason: 'armory' };
    }
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
    if (payload?.reason === CRUCIBLE_PURCHASE_SPEND_REASON) {
      const pending = this._pendingPurchase;
      if (!pending || payload.credits !== pending.price) return;
      this._pendingPurchase = null;
      if (pending.kind === EVOLUTION_OFFER_KIND) {
        this._resolveEvolutionPurchase(pending);
        return;
      }
      if (pending.kind === SWARM_HULL_OFFER_KIND) {
        this._resolveHullPurchase(pending);
        return;
      }
      if (pending.kind === SWARM_SERVICE_OFFER_KIND) {
        this._resolveServicePurchase(pending);
        return;
      }
      // Fitting by definition is the existing ships-owner purchase route. There is no temporary
      // inventory grant to leak if fitting is refused after the wallet authorizes the purchase.
      // A slot still on trial retires BEFORE the paid copy lands, so the demo is destroyed in
      // place instead of being bumped into the hold disguised as a spare.
      if (Number.isInteger(pending.slotIndex)) this._retireTrial(pending.slotIndex);
      const fitted = !!this._ships()?.fitModule({ slotIndex: pending.slotIndex, defId: pending.defId });
      if (!fitted) {
        this._emit('run:awardRequested', { credits: pending.price, reason: 'crucible:purchaseRefund' });
        this._notice = `${pending.name} could not be fitted. ${pending.price} cr refunded.`;
        return;
      }
      this._purchased.add(pending.id);
      this._notice = `${pending.name} fitted. Buy again or launch the next round.`;
      this._emit('run:modifierRecordRequested', {
        record: { kind: 'weapon', offerId: pending.id, verb: pending.verb, defId: pending.defId,
          slotIndex: pending.slotIndex, replaced: pending.replaces || null, wave: this._wave },
        draft: { wave: this._wave, offered: this._offers.map(o => o.id), picked: pending.id },
        wave: this._wave,
      });
      this._emit('run:shopPurchased', { wave: this._wave, offerId: pending.id, price: pending.price });
      return;
    }
    const pending = this._pendingReroll;
    if (!pending) return;
    if (!payload || payload.reason !== CRUCIBLE_REROLL_SPEND_REASON) return;
    this._pendingReroll = null;
    const offers = this._peekOffers(pending.next);
    // Paid-for-nothing is not a state we ship. rerollState already refused an empty round, so this
    // is belt and braces: keep the standing offers rather than blanking a surface the run waits on.
    if (offers.length === 0) return;
    this._rerolls = pending.next;
    this._offers = preferRoleCounterOffers(offers, this.state);
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
    if (payload?.reason === CRUCIBLE_PURCHASE_SPEND_REASON && this._pendingPurchase) {
      this._pendingPurchase = null;
      this._notice = 'Not enough run credits. Save for the next round.';
      return;
    }
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
    const offers = result && result.ok && Array.isArray(result.offers) ? result.offers : [];
    return preferRoleCounterOffers(offers, this.state);
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
    if (isSwarmRuleset(run.ruleset) && offerId != null && request && request.demo === true) {
      return this._demoFit(offerId);
    }
    if (isSwarmRuleset(run.ruleset) && offerId != null) return this._purchase(offerId);
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

  _purchase(offerId) {
    if (this._pendingPurchase || this._pendingReroll) return false;
    const offer = this.currentOffers().find(entry => entry.id === offerId);
    if (!offer || !offer.available) {
      this._notice = offer?.unavailableReason || 'That offer is no longer available.';
      return false;
    }
    const ships = this._ships();
    if (!ships || typeof ships.fitModule !== 'function') {
      this._notice = 'Fitting is unavailable. Your money is safe.';
      return false;
    }
    // A manifest row never meets the wallet — the hull is already owned, the switch is free.
    if (offer.kind === SWARM_HULL_OFFER_KIND && Number.isInteger(offer._ownedIndex)) {
      return this._switchToOwnedHull(offer);
    }
    if (offer.kind === EVOLUTION_OFFER_KIND) {
      // Mounted parts come off BEFORE the blocker: the conversion frees their hardpoints, so the
      // fitting authority must judge the build as it will look after the trade, not before it.
      // A refused wallet then merely leaves the parts sitting in the hold — nothing is charged
      // and nothing is consumed.
      const fittings = this._activeLoadout().fittings;
      for (const defId of offer.consumes || []) {
        const slotIndex = fittings.indexOf(defId);
        if (slotIndex < 0) continue;
        if (!ships.unfitModule({ slotIndex })) {
          this._notice = 'A synthesis part would not come off. Nothing was charged.';
          return false;
        }
      }
    }
    // Hulls and services never meet the hardpoint blocker — their legality was judged live in
    // currentOffers, and their own resolvers know why they might refuse.
    if (offer.kind !== SWARM_HULL_OFFER_KIND && offer.kind !== SWARM_SERVICE_OFFER_KIND) {
      const blocker = ships.moduleFitBlocker?.({ slotIndex: offer.slotIndex, def: MODULE_DEF_BY_ID.get(offer.defId) });
      if (blocker) {
        this._notice = blocker.text || 'That item no longer fits. Your money is safe.';
        return false;
      }
    }
    this._pendingPurchase = offer;
    this._emit('run:spendRequested', { credits: offer.price, reason: CRUCIBLE_PURCHASE_SPEND_REASON });
    if (this._pendingPurchase) {
      this._pendingPurchase = null;
      this._notice = 'The run wallet did not answer. Nothing was charged.';
      return false;
    }
    return this._purchased.has(offer.id);
  },

  /**
   * The hull and service rows of the armory — every player ship on the shelf plus the counter
   * work no fitting slot can hold. They are offers like any other card: priced in the short-round
   * economy, bought through the wallet, and legality-judged live so a mid-shop hull swap
   * re-shelves the fittings the new hull can carry.
   */
  _armoryExtras(loadout, run) {
    if (!isSwarmRuleset(run.ruleset)) return [];
    const extras = [];
    const player = this.state && this.state.player;
    const entity = this._playerEntity();
    const hullMax = Number.isFinite(entity && entity.hullMax) ? entity.hullMax : 0;
    const armorMax = Number.isFinite(entity && entity.armorMax) ? entity.armorMax : 0;
    const hurt = !!entity && ((hullMax > 0 && (Number(entity.hull) || 0) < hullMax)
      || (armorMax > 0 && (Number(entity.armorHp) || 0) < armorMax));
    extras.push({
      id: 'svc_weld', kind: SWARM_SERVICE_OFFER_KIND, service: 'weld',
      verb: 'Weld', name: 'Hull weld',
      blurb: 'Plate, weld and rinse the scars. Back to full before the next pack.',
      price: SWARM_WELD_PRICE, category: 'Service', slotLabel: 'Hull & armor',
      _serviceHurt: hurt,
    });
    const held = player && player.cargo && player.cargo.items
      ? (player.cargo.items.cmdty_impulse_charge || 0) : 0;
    extras.push({
      id: 'svc_ordnance', kind: SWARM_SERVICE_OFFER_KIND, service: 'ordnance',
      verb: 'Rack', name: 'Ordnance top-up',
      blurb: 'Impulse charges racked to full for the charge-rack builds.',
      price: SWARM_ORDNANCE_PRICE, category: 'Service', slotLabel: 'Cargo',
      _serviceCharges: held,
    });
    const cargoUsed = player && player.cargo && Number.isFinite(player.cargo.usedVolume)
      ? player.cargo.usedVolume : 0;
    const ownedList = player && Array.isArray(player.ownedShips) ? player.ownedShips : [];
    for (const ship of SHIPS) {
      if (!ship || typeof ship.id !== 'string') continue;
      const ownedIndex = ownedList.findIndex((entry) => entry && entry.defId === ship.id);
      const owned = ownedIndex >= 0 ? ownedList[ownedIndex] : null;
      // setActiveShip refuses the swap when the run's hold is heavier than the new hull takes —
      // the row must say so up front, because the charge is real by the time the cradle would.
      // An owned hull is judged against ITS OWN capacity (the fittings it actually carries).
      const cargoCap = getDerivedStats(ship.id, owned && Array.isArray(owned.fittings)
        ? owned.fittings : [], player).cargoCap || 0;
      extras.push({
        id: `hull_${ship.id}`, kind: SWARM_HULL_OFFER_KIND, defId: ship.id,
        verb: owned ? 'Switch' : 'Hull', name: ship.name,
        blurb: owned
          ? `On your manifest · ${ship.role} · ${buildSlotList(ship).length} hardpoints`
          : `${ship.role} hull · tier ${ship.tier} · ${buildSlotList(ship).length} hardpoints`,
        price: owned ? 0 : swarmHullPrice(ship), category: 'Hulls', slotLabel: 'Ship cradle',
        _flying: ship.id === (loadout && loadout.hullId),
        _cargoBlocked: cargoUsed > cargoCap,
        _ownedIndex: ownedIndex >= 0 ? ownedIndex : null,
      });
    }
    return extras;
  },

  _playerEntity() {
    const state = this.state;
    if (!state || state.playerId == null || !state.entities) return null;
    return typeof state.entities.get === 'function' ? state.entities.get(state.playerId) : null;
  },

  /**
   * The named synthesis, after the wallet has already said yes.
   *
   * Order is the whole contract, because the charge is real by the time this runs:
   *   1. Unfit the consumed parts that are mounted — every failure aborts BEFORE anything is
   *      consumed, with unfitted parts simply waiting in the run inventory;
   *   2. the parts are removed from the run (conversion — they do not come back as spares);
   *   3. the evolved item fits where the offer said it would;
   *   4. on any post-consumption failure the parts are re-granted to the inventory and the wallet
   *      is refunded — a refused fit can never eat both the money and the build.
   */
  _resolveEvolutionPurchase(pending) {
    const ships = this._ships();
    const player = this.state && this.state.player;
    const inventory = (player && player.moduleInventory) || [];
    const refund = (text) => {
      for (const defId of pending.consumes) ships.grantModule({ defId, reason: 'crucible:evolutionRefund' });
      this._emit('run:awardRequested', { credits: pending.price, reason: 'crucible:purchaseRefund' });
      this._notice = text;
    };
    if (!ships || !player || !Array.isArray(inventory)) {
      refund('The synthesis could not run. Your parts and credits are safe.');
      return;
    }
    const fittings = this._activeLoadout().fittings;
    const mounted = pending.consumes
      .map((defId) => ({ defId, slotIndex: fittings.indexOf(defId) }))
      .filter((entry) => entry.slotIndex >= 0);
    for (const { slotIndex } of mounted) {
      if (!ships.unfitModule({ slotIndex })) {
        refund(`A part would not come off. ${pending.price} cr refunded — nothing was consumed.`);
        return;
      }
    }
    for (const defId of pending.consumes) {
      const index = inventory.findIndex((item) => item && item.defId === defId);
      if (index < 0) {
        refund('A synthesis part went missing mid-conversion. The run has been made whole.');
        return;
      }
      inventory.splice(index, 1);
    }
    const fitted = !!ships.fitModule({ slotIndex: pending.slotIndex, defId: pending.defId });
    if (!fitted) {
      refund(`${pending.name} could not be fitted. Parts returned and ${pending.price} cr refunded.`);
      return;
    }
    this._purchased.add(pending.id);
    const consumedNames = pending.consumes
      .map((defId) => (MODULE_DEF_BY_ID.get(defId) || {}).name || defId)
      .join(' + ');
    this._notice = `${pending.name} synthesized — ${consumedNames} consumed. Buy again or launch the next round.`;
    this._emit('run:modifierRecordRequested', {
      record: {
        kind: 'evolution', offerId: pending.id, verb: pending.verb, defId: pending.defId,
        slotIndex: pending.slotIndex, replaced: null, consumes: pending.consumes.slice(),
        wave: this._wave,
      },
      draft: { wave: this._wave, offered: (this._offers || []).map((o) => o.id), picked: pending.id },
      wave: this._wave,
    });
    this._emit('run:shopPurchased', { wave: this._wave, offerId: pending.id, price: pending.price });
  },

  /**
   * The hull row, after the wallet has said yes: a real hull grant through the ships owner,
   * set active so the armory's next refresh re-shelves every card against the new hardpoints.
   * The fittings a hull swap cannot carry stay in the run's hold — never lost, only unmounted.
   */
  _resolveHullPurchase(pending) {
    const ships = this._ships();
    const player = this.state && this.state.player;
    const refund = (text) => {
      this._emit('run:awardRequested', { credits: pending.price, reason: 'crucible:purchaseRefund' });
      this._notice = text;
    };
    if (!ships || typeof ships.buyShip !== 'function'
      || !player || !Array.isArray(player.ownedShips)) {
      refund(`The cradle could not answer. ${pending.price} cr refunded.`);
      return;
    }
    const ownedBefore = player.ownedShips.length;
    if (!ships.buyShip({ defId: pending.defId, setActive: true, grant: true })) {
      refund(`${pending.name} would not leave the cradle. ${pending.price} cr refunded.`);
      return;
    }
    const granted = player.ownedShips[player.ownedShips.length - 1];
    if (player.ownedShips[player.activeShipIndex] !== granted) {
      // buyShip grants the hull even when the cradle refuses the switch (a hold heavier than the
      // new hull takes). The armory has no surface for "owned but not flyable" — the grant comes
      // back off the manifest and the wallet is made whole.
      if (player.ownedShips.length > ownedBefore
        && granted && granted.defId === pending.defId) player.ownedShips.pop();
      refund(`Your cargo would overflow its hold. ${pending.price} cr refunded.`);
      return;
    }
    // Trials are receipts for the hull you are leaving — retire every unpaid copy now that the
    // swap has landed. Closing the ledger without stripping them would leave free parts bolted
    // to a hull that stays owned. A refused swap keeps its demos.
    this._retireAllTrials();
    this._purchased.add(pending.id);
    this._notice = `${pending.name} is yours for the run. The shelf just re-priced your hardpoints — build it.`;
    this._emit('run:modifierRecordRequested', {
      record: { kind: 'hull', offerId: pending.id, defId: pending.defId, wave: this._wave },
      draft: { wave: this._wave, offered: (this._offers || []).map((o) => o.id), picked: pending.id },
      wave: this._wave,
    });
    this._emit('run:shopPurchased', { wave: this._wave, offerId: pending.id, price: pending.price });
  },

  /**
   * The manifest row: a free switch back to a hull the run already owns — no grant, no charge.
   * setActiveShip is the one switch authority; its cargo refusal was priced into the row up
   * front, so landing here means the swap takes. Demos retire exactly as a bought swap does —
   * they were receipts for the hull being left.
   */
  _switchToOwnedHull(offer) {
    const ships = this._ships();
    const player = this.state && this.state.player;
    const owned = player && Array.isArray(player.ownedShips)
      ? player.ownedShips[offer._ownedIndex] : null;
    if (!ships || typeof ships.setActiveShip !== 'function'
      || !owned || owned.defId !== offer.defId) {
      this._notice = 'That hull is no longer on your manifest.';
      return false;
    }
    if (!ships.setActiveShip(offer._ownedIndex)
      || player.ownedShips[player.activeShipIndex] !== owned) {
      this._notice = 'Your cargo would overflow its hold.';
      return false;
    }
    this._retireAllTrials();
    this._notice = `${offer.name} back in the cradle — the shelf just re-priced your hardpoints.`;
    this._emit('run:modifierRecordRequested', {
      record: { kind: 'hull', offerId: offer.id, defId: offer.defId, wave: this._wave },
      draft: { wave: this._wave, offered: (this._offers || []).map((o) => o.id), picked: offer.id },
      wave: this._wave,
    });
    this._emit('run:shopPurchased', { wave: this._wave, offerId: offer.id, price: 0 });
    return true;
  },

  /**
   * The service counter: counter work, not a fitting. Weld restores the ENTITY's own numbers the
   * same way swarmSupply's repair cell does (there is no healing kernel; the clamp is the whole
   * contract), then reports the yard receipt on the shipped service channel so the living-hull
   * ledger patches the scars. Ordnance adds what the rack is missing, nothing more.
   */
  _resolveServicePurchase(pending) {
    const entity = this._playerEntity();
    const refund = (text) => {
      this._emit('run:awardRequested', { credits: pending.price, reason: 'crucible:purchaseRefund' });
      this._notice = text;
    };
    if (pending.service === 'weld') {
      if (!entity) {
        refund(`No hull in the cradle. ${pending.price} cr refunded.`);
        return;
      }
      const hullMax = Number.isFinite(entity.hullMax) ? entity.hullMax : 0;
      const armorMax = Number.isFinite(entity.armorMax) ? entity.armorMax : 0;
      const restoredHull = Math.max(0, hullMax - (Number(entity.hull) || 0));
      const restoredArmor = Math.max(0, armorMax - (Number(entity.armorHp) || 0));
      if (restoredHull <= 0 && restoredArmor <= 0) {
        refund(`The hull is already sound. ${pending.price} cr refunded.`);
        return;
      }
      entity.hull = hullMax;
      entity.armorHp = armorMax;
      this._emit('service:completed', { type: 'repair', restoredHull, restoredArmor });
      this._purchased.add(pending.id);
      this._notice = 'Welded to full — the scars read as patched, not new.';
      this._emit('run:shopPurchased', { wave: this._wave, offerId: pending.id, price: pending.price });
      return;
    }
    if (pending.service === 'ordnance') {
      const player = this.state && this.state.player;
      const held = player && player.cargo && player.cargo.items
        ? (player.cargo.items.cmdty_impulse_charge || 0) : 0;
      const missing = SWARM_ORDNANCE_RACK_MAX - held;
      if (missing <= 0) {
        refund(`The rack is already full. ${pending.price} cr refunded.`);
        return;
      }
      const added = addCargo(this.state, 'cmdty_impulse_charge', missing) || 0;
      if (added <= 0) {
        refund(`The rack would not take the charges. ${pending.price} cr refunded.`);
        return;
      }
      this._purchased.add(pending.id);
      this._notice = `${added} impulse charge${added === 1 ? '' : 's'} racked.`;
      this._emit('run:shopPurchased', { wave: this._wave, offerId: pending.id, price: pending.price });
      return;
    }
    refund(`The counter does not know that service. ${pending.price} cr refunded.`);
  },

  /**
   * The demo: a fitting you fly for one round without paying for it. Fits free through the same
   * ships owner the purchases use — if it would refuse the real fit it refuses the demo — then
   * comes off when the next armory opens, unless you bought it. Only fittings can be demoed:
   * a hull you fly is a hull you own, and a weld you use is used.
   */
  _demoFit(offerId) {
    const run = liveSurvivalRun(this.state);
    if (!run || run.phase !== 'draft' || this._resolved) return false;
    const offer = this.currentOffers().find(entry => entry.id === offerId);
    if (!offer || !Number.isInteger(offer.slotIndex) || typeof offer.defId !== 'string') {
      this._notice = 'That is not a part you can fly on trial.';
      return false;
    }
    const ships = this._ships();
    if (!ships || typeof ships.fitModule !== 'function') {
      this._notice = 'Fitting is unavailable.';
      return false;
    }
    if (this._trials.get(offer.slotIndex)?.defId === offer.defId) {
      this._notice = `${offer.name} is already on trial.`;
      return false;
    }
    const blocker = ships.moduleFitBlocker?.({ slotIndex: offer.slotIndex, def: MODULE_DEF_BY_ID.get(offer.defId) });
    if (blocker) {
      this._notice = blocker.text || 'That item no longer fits.';
      return false;
    }
    // One trial at a time: a fresh demo retires EVERY standing trial BEFORE the new fit lands —
    // the outgoing copies are destroyed in place rather than bumped into the hold as unpaid
    // spares, and a second demo cannot quietly refit the whole ship for free. Checked after the
    // blocker so a refused demo cannot cost the one you already had.
    for (const slotIndex of [...this._trials.keys()]) this._retireTrial(slotIndex);
    if (!ships.fitModule({ slotIndex: offer.slotIndex, defId: offer.defId })) {
      this._notice = `${offer.name} could not be fitted for the trial.`;
      return false;
    }
    this._trials.set(offer.slotIndex, {
      slotIndex: offer.slotIndex,
      shipIndex: this._activeLoadout().shipIndex,
      defId: offer.defId,
    });
    this._notice = `${offer.name} on trial — it comes off at the next armory unless you buy it.`;
    return true;
  },

  /**
   * Retire exactly one trial copy. If its slot still wears the demo, the copy dies in place —
   * never pushed to the hold. If something already displaced it, the demo is the NEWEST matching
   * inventory row by the same synchronous emit order that put it there — so a paid copy of the
   * same def is never the one spliced out.
   */
  _retireTrial(slotIndex) {
    const trial = this._trials instanceof Map ? this._trials.get(slotIndex) : null;
    if (!trial) return;
    this._trials.delete(slotIndex);
    const ships = this._ships();
    const player = this.state && this.state.player;
    const ownedShips = player && Array.isArray(player.ownedShips) ? player.ownedShips : [];
    const owned = ownedShips[trial.shipIndex];
    if (owned && Array.isArray(owned.fittings) && owned.fittings[trial.slotIndex] === trial.defId) {
      owned.fittings[trial.slotIndex] = null;
      if (ships && typeof ships.recomputeIfActive === 'function') {
        ships.recomputeIfActive(trial.shipIndex, owned.fittings);
      }
      return;
    }
    const inventory = Array.isArray(player && player.moduleInventory) ? player.moduleInventory : [];
    for (let i = inventory.length - 1; i >= 0; i--) {
      if (inventory[i] && inventory[i].defId === trial.defId) { inventory.splice(i, 1); break; }
    }
  },

  _retireAllTrials() {
    if (!(this._trials instanceof Map)) return;
    for (const slotIndex of [...this._trials.keys()]) this._retireTrial(slotIndex);
  },

  /**
   * module:equipped/unequipped arrive on the same synchronous breath that pushed the displaced
   * copy into the hold — a trial whose slot no longer wears its defId is over, whichever hand
   * moved it, and the copy to destroy is the newest matching one.
   */
  _retireDisplacedTrials() {
    if (!(this._trials instanceof Map) || this._trials.size === 0) return;
    const player = this.state && this.state.player;
    const ownedShips = player && Array.isArray(player.ownedShips) ? player.ownedShips : [];
    for (const trial of [...this._trials.values()]) {
      const owned = ownedShips[trial.shipIndex];
      if (!owned || !Array.isArray(owned.fittings)
        || owned.fittings[trial.slotIndex] !== trial.defId) {
        this._retireTrial(trial.slotIndex);
      }
    }
  },

  /** The draft pushed under the loading gate re-opens once the real flight handoff settles. */
  _onGameStarted() {
    queueMicrotask(() => {
      const run = liveSurvivalRun(this.state);
      if (run && run.phase === 'draft' && this._offers && !this._resolved) {
        this._openScreen(CRUCIBLE_DRAFT_SCREEN_ID);
      }
    });
  },

  /** Trials end where they began: at the next armory every unpaid copy leaves the run. */
  _clearTrials() {
    this._retireAllTrials();
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
    if (!run || (run.phase !== 'refit' && !(run.ruleset === 'swarm' && run.phase === 'draft'))) return false;
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
    if (!run || (run.phase !== 'refit' && !(run.ruleset === 'swarm' && run.phase === 'draft'))) return false;
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
