// special500Confessional.js — SP2-091 "The Confessional Booth" (special-500 Phase 2, batch 19,
// counter family).
//
// The Choir acolyte's side booth — "DISPOSAL OF GUILT, PROFESSIONAL" — finds the pilot at any
// berth. The real read is the moralMemory owner's own ledger digest (moralLedgerSummary,
// src/systems/moralMemory.js): the accounts the ledger holds against this pilot — trap debts,
// spared raiders that came back, witnesses still open — are the guilt the booth can file. No
// ledger, no booth: the acolyte does not invent guilt.
//
//   guilt_filed           { at, records, recordText, offerId } — one accepted, bounded record
//                         the flat tithe clears through the economy owner's exact-payment
//                         intent (economy:chargeCredits, requireFull — a short account files
//                         nothing). The read-back letter is the mail owner's flag row.
//   guilt_tithe_declined  simTime — the once-offered booth is declined; the Choir does not ask
//                         twice.
//
// Readers (live, on their owners): Choir standing +1 (faction:repDelta, the factions owner),
// the filing liturgy line in the comms feed, the flight decision deck card through the
// adapter (src/ui/special500ConfessionalPrompt.js — the special500Invoice prompt precedent),
// and the mail owner's late read-back letter (mail_guilt_read_back, triggered on the flag AND
// the story spine's saved, completed writtenFinale — "it will be read back to you once, at
// the end": one Choir liturgy, two sacraments, same receipt grammar as the buoy that
// absolves).
//
// Determinism: the digest is the ledger's own counts; the offer re-issues at each dock until
// answered; no rng, no wall time. A state without story or a ledger that never filed degrades
// to honest silence.

import { moralLedgerSummary } from './moralMemory.js';
import { normalizeWrittenFinale } from '../story/endings/finaleRuntime.js';
import { isRunSealed } from '../core/runSeal.js';
import { isRacingCorridorSession } from '../world/racingCorridor.js';

export const CONFESSIONAL_TITHE_CR = 40;
export const CONFESSIONAL_CHOICE_EVENT = 'ui:confessionalChoose';
export const CONFESSIONAL_RECORD_TEXT_MAX = 40000;

const label = (value) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80);
const activeCampaign = (state) => !isRunSealed(state) && !state.physicsVenueSession
  && !isRacingCorridorSession(state);
const validOffer = (offer) => offer && typeof offer.offerId === 'string' && offer.offerId.length <= 160
  && Number.isSafeInteger(offer.records) && offer.records > 0 && offer.records <= 192
  && typeof offer.recordText === 'string' && offer.recordText.length > 0
  && offer.recordText.length <= CONFESSIONAL_RECORD_TEXT_MAX;

function completedFinale(state) {
  const story = state.story;
  const finale = normalizeWrittenFinale(story && story.writtenFinale);
  return finale && story.endgameResolved === true && story.endgameChoice === finale.choiceId
    && finale.completedAtS != null ? finale : null;
}

// Both real readers use the exact accepted bytes. The canonical saved finale, rather than
// a second ending latch or the mail owner's evictable event log, establishes eligibility.
export function confessionalReadback(state) {
  const filed = state && state.story && state.story.flags && state.story.flags.guilt_filed;
  if (!filed || typeof filed.recordText !== 'string' || !filed.recordText.length
      || filed.recordText.length > CONFESSIONAL_RECORD_TEXT_MAX || !Number.isFinite(filed.at)) return null;
  const finale = completedFinale(state);
  if (!finale || filed.at > finale.completedAtS) return null;
  return { text: filed.recordText, offerId: filed.offerId, finaleReceiptId: finale.receiptId, choiceId: finale.choiceId };
}

/** Pure read, exported for the focused test: the ledger accounts the booth can file. */
export function confessionalRecords(state) {
  if (!state || !state.story || !state.story.moralMemory) return null;
  let s;
  try { s = moralLedgerSummary(state); } catch (e) { return null; }
  if (!s) return null;
  const records = (s.pending | 0) + (s.revealed | 0) + (s.returned | 0)
    + (s.settled | 0) + (s.forgiven | 0) + (s.remembered | 0) + (s.openWitnesses | 0);
  const memory = state.story.moralMemory;
  const lines = [`FILED RECORD · ${records} account${records === 1 ? '' : 's'}`];
  // The moral owner's normalized indices are bounded (128 debts, 64 witnesses). Never
  // disclose a pending debt's hidden disposition. These are the records the pilot accepts.
  for (const id of memory.order) {
    const debt = memory.debts[id];
    if (!debt || !['pending', 'revealed', 'returned', 'settled', 'forgiven', 'remembered'].includes(debt.status)
        || (debt.status === 'remembered' && debt.cause === 'lane_hauler_rescued')) continue;
    lines.push(`${label(debt.name || id)} — ${label(debt.cause)} · ${debt.status}`);
  }
  for (const id of memory.witnessOrder) {
    const witness = memory.witnesses[id];
    if (witness && witness.status === 'open') lines.push(`${label(witness.name || id)} — witness still open`);
  }
  return { records, pending: s.pending | 0, standing: s.standing, recordText: lines.join('\n') };
}

function flagsOf(state) {
  if (!state.story || typeof state.story !== 'object' || Array.isArray(state.story)) state.story = { flags: {} };
  if (!state.story.flags || typeof state.story.flags !== 'object' || Array.isArray(state.story.flags)) state.story.flags = {};
  return state.story.flags;
}

export function createSpecial500Confessional() {
  return {
    name: 'special500Confessional',

    init(ctx) {
      for (const off of this.off || []) { if (typeof off === 'function') off(); }
      this.state = ctx.state;
      this.bus = ctx.bus || null;
      this.generation = (this.generation || 0) + 1;
      this.loading = false;
      this.inFlight = false;
      this.off = this.bus ? [
        this.bus.on('dock:docked', () => this._onDocked()),
        this.bus.on('ui:confessionalChoose', (p) => this._onChoose(p || {})),
        this.bus.on('ui:confessionalReady', () => this._resume()),
        this.bus.on('game:load', () => {
          this.loading = true;
          this.generation += 1;
          this.bus.emit('special500:confessional', { reset: true, generation: this.generation });
        }),
        this.bus.on('save:restoring', () => {
          if (!this.loading) this.generation += 1;
          this.loading = true;
          this.bus.emit('special500:confessional', { reset: true, generation: this.generation });
        }),
        this.bus.on('save:error', () => {
          if (this.loading) { this.loading = false; this._resume(); }
        }),
        ...['save:loaded', 'game:started'].map(event => this.bus.on(event, () => {
          this.loading = false;
          this.generation += 1;
          this.bus.emit('special500:confessional', { reset: true, generation: this.generation });
          this._resume();
        })),
      ] : [];
    },

    destroy() {
      for (const off of this.off || []) { try { off(); } catch (e) { /* shutdown */ } }
      this.off = [];
      this.state = null;
      this.bus = null;
    },

    _receipt(outcome, offer, extra = {}) {
      this.bus.emit('special500:confessionalReceipt', {
        outcome,
        offerId: offer && offer.offerId,
        generation: offer && offer.generation,
        at: Number(this.state && this.state.simTime) || 0,
        ...extra,
      });
    },

    _resume() {
      if (!this.state || !this.bus || this.loading || !activeCampaign(this.state)) return;
      const pending = flagsOf(this.state).guilt_offer;
      if (validOffer(pending) && flagsOf(this.state).guilt_filed == null && flagsOf(this.state).guilt_tithe_declined == null) {
        this._offer(pending);
      } else {
        if (pending && !validOffer(pending)) delete flagsOf(this.state).guilt_offer;
        this.bus.emit('special500:confessional', { reset: true, generation: this.generation });
        if (this.state.ui && this.state.ui.dockedStationId) this._onDocked();
      }
    },

    _offer(pending) {
      if (!validOffer(pending)) return;
      this.bus.emit('special500:confessional', {
        ...pending, generation: this.generation,
        title: 'DISPOSAL OF GUILT, PROFESSIONAL', amount: CONFESSIONAL_TITHE_CR,
        memo: 'The acolyte offers filing, not absolution. This exact record will be read back '
          + 'once at the end. Flat tithe; no confession required.\n\n' + pending.recordText,
      });
    },

    _onDocked() {
      const state = this.state;
      const bus = this.bus;
      if (!state || !bus || this.loading || !activeCampaign(state) || completedFinale(state)) return;
      const flags = flagsOf(state);
      if (flags.guilt_filed != null || flags.guilt_tithe_declined != null) return;
      if (validOffer(flags.guilt_offer)) return this._offer(flags.guilt_offer);
      delete flags.guilt_offer; // tolerate legacy/corrupt pending shells without a second charge
      const read = confessionalRecords(state);
      if (!read || read.records <= 0) return; // the ledger holds nothing against this pilot
      flags.guilt_offer = {
        offerId: `confessional:${state.meta && state.meta.seed}:${Number(state.tick) || 0}`,
        records: read.records, recordText: read.recordText,
      };
      this._offer(flags.guilt_offer);
    },

    _onChoose(payload) {
      const state = this.state;
      const bus = this.bus;
      if (!state || !bus || this.loading || !activeCampaign(state) || this.inFlight) return;
      const flags = flagsOf(state);
      const offer = { offerId: payload.offerId, generation: payload.generation };
      const pending = flags.guilt_offer;
      if (!validOffer(pending) || payload.offerId !== pending.offerId || payload.generation !== this.generation)
        return this._receipt('ignored', offer);
      if (flags.guilt_filed != null || flags.guilt_tithe_declined != null) return this._receipt('closed', offer);
      if (completedFinale(state)) {
        delete flags.guilt_offer;
        return this._receipt('expired', offer);
      }
      if (payload.choice === 'decline') {
        flags.guilt_tithe_declined = Number(state.simTime) || 0;
        delete flags.guilt_offer;
        this._receipt('declined', offer);
        bus.emit('comms:log', {
          from: 'DISPOSAL OF GUILT, PROFESSIONAL',
          text: 'The acolyte nods once and closes the booth ledger. "The cabinet does not '
            + 'chase. The cabinet keeps the shelf empty." They will not ask twice.',
          kind: 'special500',
        });
        return { outcome: 'declined' };
      }
      if (payload.choice !== 'file') return this._receipt('ignored', offer);
      const credits = state.player && state.player.credits;
      if (!Number.isSafeInteger(credits) || credits < CONFESSIONAL_TITHE_CR) return this._receipt('short', offer);
      const req = {
        amount: CONFESSIONAL_TITHE_CR,
        reason: 'special500:confessional_tithe',
        requireFull: true,
        expectedCredits: credits,
        result: false,
        commit: () => {
          if (flagsOf(state) !== flags || flags.guilt_offer !== pending
              || flags.guilt_filed != null || flags.guilt_tithe_declined != null) return false;
          // The sole credit writer calls this before charging/notifications. Re-entrant
          // choices see a terminal record, so no second tithe or reward can be admitted.
          flags.guilt_filed = { at: Number(state.simTime) || 0, records: pending.records,
            recordText: pending.recordText, offerId: pending.offerId };
          delete flags.guilt_offer;
          return true;
        },
      };
      this.inFlight = true;
      try { bus.emit('economy:chargeCredits', req); }
      finally { this.inFlight = false; }
      if (req.result !== true) return this._receipt('unpaid', offer);
      bus.emit('faction:repDelta', {
        factionId: 'faction_choir',
        delta: 1,
        reason: 'special500:guilt_filed',
      });
      this._receipt('filed', offer, { records: pending.records, cr: CONFESSIONAL_TITHE_CR });
      bus.emit('comms:log', {
        from: 'DISPOSAL OF GUILT, PROFESSIONAL',
        text: `The acolyte takes the tithe without ceremony and files ${pending.records} record${pending.records === 1 ? '' : 's'} `
          + 'into the cabinet. No absolution is offered, none expected. "It will be read back '
          + 'to you once, at the end, and then it is ours." The receipt grammar is the buoy\u2019s.',
        kind: 'special500',
      });
      return { outcome: 'filed' };
    },
  };
}

export const special500Confessional = createSpecial500Confessional();
