// src/systems/special500Sommelier.js — SP2-065 "The Sommelier of Coolant" (vendor leg runtime).
//
// The purchase verb is the bar contact's authored choice (src/ui/station/barContacts.js,
// canonical row at the Refuel Depot); the sim settles it here. The Thursday is a small credits
// purchase poured at the bar: 12 cr through the economy owner's exact-payment intent (the sole
// credits writer authenticates the balance — a short account buys nothing), the pour itself is
// two unsealed fuel cells into the hold through the cargo owner's public addCargo (they ride
// the ordinary cell path the world owner already serves: crack one into the tank, or feed the
// tender's pump), and the censer remembers patronage — Choir rep +1 through the factions
// owner's repDelta intent. Once per game: the flag `the_thursday_poured` gates the rail.
//
// Single writers: no credits, cargo, or rep is written here directly — every consequence is
// an intent to its canonical owner. Determinism: the settlement reads live state only; the
// one-time gate is the save-carried plain flag.

import { addCargo, cargoUnitVolume } from './cargo.js';
import { SOMMELIER } from '../data/special500/sommelier.js';

export const special500Sommelier = {
  name: 'special500Sommelier',

  init(ctx) {
    this.state = ctx.state || null;
    this.bus = ctx.bus;
    this._off = [
      this.bus.on('ui:talkContact', (payload) => this._onTalkContact(payload || {})),
      this.bus.on('dock:undocked', () => {
        const service = this.state?.story?.flags?.eris_choir_bar_service;
        if (service?.active) service.active = false;
      }),
    ].filter((off) => typeof off === 'function');
  },

  destroy() {
    for (const off of this._off || []) {
      try { off(); } catch (_) { /* cleanup must not throw */ }
    }
    this._off = [];
  },

  _emitReceipt(outcome, extra = {}) {
    this.bus.emit(SOMMELIER.receiptEvent, {
      outcome, stationId: SOMMELIER.stationId,
      at: Number(this.state && this.state.simTime) || 0,
      ...extra,
    });
  },

  _onTalkContact(payload) {
    const { canonicalKey, stationId, choiceId } = payload;
    const state = this.state || null;
    if (!state) return null;
    if (canonicalKey === 'eris_choir_chair') return this._onErisChair(payload);
    if (canonicalKey !== SOMMELIER.contactKey
      || stationId !== SOMMELIER.stationId
      || choiceId !== SOMMELIER.choiceId) return null;
    const ui = state.ui || {};
    const dockedAt = ui.docked !== false && typeof ui.dockedStationId === 'string' ? ui.dockedStationId : null;
    if (dockedAt !== SOMMELIER.stationId) return null;

    const flags = (state.story && state.story.flags) || {};
    if (flags[SOMMELIER.pourFlag]) {
      this._emitReceipt('already');
      return { outcome: 'already' };
    }

    const credits = Math.max(0, Math.round(Number(state.player && state.player.credits) || 0));
    if (credits < SOMMELIER.pourCr) {
      this._emitReceipt('short');
      return { outcome: 'short' };
    }
    // The pour must fit the hold: the censer does not half-pour a vintage.
    const cargo = state.player && state.player.cargo;
    const unitVol = cargoUnitVolume(state, SOMMELIER.pourCommodity);
    const free = cargo && Number.isFinite(cargo.capVolume) && Number.isFinite(cargo.usedVolume)
      ? cargo.capVolume - cargo.usedVolume
      : Infinity;
    const need = SOMMELIER.pourCells * unitVol;
    if (!(free >= need)) {
      this._emitReceipt('no_room');
      return { outcome: 'no_room' };
    }

    // Exact-payment request (NXB-009): the cargo grant rides the validated commit, the sole
    // credits writer performs the charge, and nothing mutates when the balance moved.
    const req = {
      amount: SOMMELIER.pourCr,
      reason: 'special500:the_thursday',
      requireFull: true,
      expectedCredits: credits,
      commit: () => addCargo(state, SOMMELIER.pourCommodity, SOMMELIER.pourCells) === SOMMELIER.pourCells,
      result: false,
    };
    this.bus.emit('economy:chargeCredits', req);
    if (req.result !== true) {
      this._emitReceipt('short');
      return { outcome: 'short' };
    }
    if (!state.story) state.story = { flags: {} };
    if (!state.story.flags || typeof state.story.flags !== 'object') state.story.flags = {};
    state.story.flags[SOMMELIER.pourFlag] = Number(state.simTime) || 0;
    this.bus.emit('faction:repDelta', {
      factionId: 'faction_choir',
      delta: SOMMELIER.choirRepDelta,
      reason: 'sommelier_patronage',
    });
    this._emitReceipt('settled', { cells: SOMMELIER.pourCells, cr: SOMMELIER.pourCr });
    this.bus.emit('comms:log', {
      from: 'The Sommelier of Coolant',
      text: 'The censer hums its burn down to beverage temperature and pours the vintage cell — '
        + '"Cast on a Thursday. You will taste the Thursday." Two more for the road, unsealed. '
        + 'The Choir remembers patronage.',
      kind: 'special500',
    });
    return { outcome: 'settled' };
  },

  _onErisChair({ stationId, choiceId, visitId, requestId }) {
    const state = this.state;
    const flags = state?.story?.flags;
    if (stationId !== 'station_eris_margin' || state?.ui?.docked === false
      || state?.ui?.dockedStationId !== stationId || flags?.eris_choir_chair_claimed == null) return null;
    let service = flags.eris_choir_bar_service;
    if (choiceId === 'bar_enter') {
      if (!Number.isSafeInteger(visitId) || requestId !== `eris:${visitId}:bar_enter`) return null;
      if (!service || !Number.isSafeInteger(service.visitId) || service.visitId < 1) {
        if (visitId !== 1) return null;
        service = flags.eris_choir_bar_service = { visitId: 1, active: true, served: false };
      } else if (!service.active) {
        if (visitId !== service.visitId + 1) return null;
        service.visitId += 1;
        service.active = true;
        service.served = false;
      } else if (visitId !== service.visitId) return null;
      return { outcome: 'entered', visitId: service.visitId };
    }
    if (!service?.active || !Number.isSafeInteger(visitId) || visitId !== service.visitId
      || requestId !== `eris:${visitId}:${choiceId}`) return null;
    if (choiceId === 'bar_leave') {
      service.active = false;
      return { outcome: 'left', visitId };
    }
    if (choiceId !== 'free_drink') return null;
    const receipt = (outcome) => {
      this.bus.emit('erisChoir:drinkReceipt', { stationId, visitId, requestId, outcome });
      return { outcome, visitId };
    };
    if (service.served) return receipt('already');
    const credits = Math.max(0, Math.round(Number(state.player?.credits) || 0));
    const req = { amount: 0, reason: 'special500:eris_choir_drink', requireFull: true,
      expectedCredits: credits, commit: () => service.active && !service.served && service.visitId === visitId,
      result: false };
    this.bus.emit('economy:chargeCredits', req);
    if (req.result !== true) {
      this.bus.emit('comms:log', { from: 'Margin Fence', kind: 'special500',
        source: 'eris_choir_chair', stationId, visitId, outcome: 'refused',
        text: 'The barkeep cannot pour just now. Try again shortly.' });
      return receipt('pending');
    }
    service.served = true;
    this.bus.emit('comms:log', { from: 'Margin Fence', kind: 'special500',
      source: 'eris_choir_chair', stationId, visitId, outcome: 'settled',
      text: 'The room stands. The barkeep sets your free beer at the chair.' });
    return receipt('settled');
  },
};
