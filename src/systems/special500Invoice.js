// src/systems/special500Invoice.js — SP2-044 "The Bill For Nothing" (choice leg).
//
// The catalog entry SP2-044 (src/data/special500/entries-comms-a.js) fires once on the
// `frontier:debtSettled` receipt and writes flag `special500.SP2-044` through the director.
// This leg is that firing's invoice: the 4 cr standby-fee shakedown arrives on the comms
// surfaces, rides the flight decision deck (src/ui/promptDeck.js through the prompt adapter,
// src/ui/special500InvoicePrompt.js — the pirate-parley pattern) as a one-world-day
// pay-or-refuse card, and resolves through the owners:
//
//   pay within one day  → economy is charged exactly 4 cr (economy:chargeCredits, the sole
//                         credits writer), Hale respects it (faction:repDelta, Solar Concord
//                         Navy), and the flag `standby_fee_paid` delivers Hale's mail.
//   refuse / deadline   → the LATE FEE ON STANDBY FEE is assessed (4 cr out either way), the
//                         flag `standby_fee_refused` delivers the second bill's paper, and
//                         Hale rep +1 both ways.
//
// Durable state is plain-named story flags (the `special500.` namespace stays the director's):
//   standby_fee_due      simTime the invoice was issued; deadline is due + CAL_DAY_S
//   standby_fee_paid     simTime of the within-day payment (terminal)
//   standby_fee_refused  simTime of the refusal assessment (terminal)
//
// Determinism: the deadline and the expiry resolve off state.simTime only (CAL_DAY_S from the
// world calendar — never wall time). A save taken inside the response window resumes on
// Continue with the same deadline. The catalog firing's own flag gates issuance; the leg never
// re-evaluates the receipt trigger.

import { CAL_DAY_S } from '../data/worldCalendar.js';
import { SPECIAL500_ALL } from '../data/special500/index.js';

const ENTRY_ID = 'SP2-044';
const FIRED_FLAG = `special500.${ENTRY_ID}`;
const DUE_FLAG = 'standby_fee_due';
const PAID_FLAG = 'standby_fee_paid';
const REFUSED_FLAG = 'standby_fee_refused';

export const STANDBY_FEE_CR = 4;
export const INVOICE_BILL_ID = 'standby_fee';
// A firing counts as fresh for this long after its flag was stamped (one calendar cohort
// window plus hitch slack); a missed window is recovered on the next dock — the bill finds
// you at a berth, like every other invoice in this world.
export const FIRING_FRESH_S = 2;

const CATALOG_ENTRY = SPECIAL500_ALL.find((e) => e && e.id === ENTRY_ID) || null;
const INVOICE_TEXT = (CATALOG_ENTRY && CATALOG_ENTRY.payload && CATALOG_ENTRY.payload.text)
  || 'CONCORD TOWAGE — STANDBY FEE. NO TOW PERFORMED. READINESS IS THE SERVICE. Amount: 4 cr. The account line\'s memo field reads: "This is a shakedown. It is also legal. — H."';

const PAID_LOG_TEXT = 'CONCORD TOWAGE: payment received. Readiness remains the service.';
const REFUSED_LOG_TEXT = 'CONCORD TOWAGE: LATE FEE ON STANDBY FEE — assessed. Consistency is noted. — H.';

const CONCORD_FACTION = 'faction_scn'; // Hale files for Concord Patrol: the rep owner is factions.js
const REP_DELTA = 1;

function flag(state, key) {
  const v = (state.story && state.story.flags || {})[key];
  return Number.isFinite(Number(v)) ? Number(v) : null;
}

function writeFlag(state, key, value) {
  if (!state.story) state.story = { flags: {} };
  if (!state.story.flags || typeof state.story.flags !== 'object') state.story.flags = {};
  state.story.flags[key] = value;
}

export const special500Invoice = {
  name: 'special500Invoice',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this._off = [
      this.bus.on('ui:standbyFeeChoose', (payload) => this._onChoose(payload || {})),
      // A firing that outlived its fresh window still finds the player: the next dock issues.
      this.bus.on('dock:docked', () => this._onDocked()),
    ].filter((off) => typeof off === 'function');
  },

  destroy() {
    for (const off of this._off || []) {
      try { off(); } catch (_) { /* cleanup must not throw */ }
    }
    this._off = [];
  },

  update(dt, state) {
    if (!state) return;
    const now = Number(state.simTime) || 0;
    this.state = state;

    if (flag(state, PAID_FLAG) != null || flag(state, REFUSED_FLAG) != null) return; // resolved
    const firedAt = flag(state, FIRED_FLAG);
    if (firedAt == null) return; // unmet gate: the shakedown has not been earned yet

    const dueAt = flag(state, DUE_FLAG);
    if (dueAt == null) {
      // Fresh firing: the invoice arrives in the moment the last debt cleared.
      if (now - firedAt >= 0 && now - firedAt <= FIRING_FRESH_S) this._issue(now);
      return; // stale firings wait for the dock receipt; expiry needs a due stamp first
    }
    // The deadline is one world day, simTime only. Silence past it is the refusal.
    if (now >= dueAt + CAL_DAY_S) this._resolveRefusal(now);
  },

  _onDocked() {
    const state = this.state;
    if (!state) return;
    const now = Number(state.simTime) || 0;
    if (flag(state, PAID_FLAG) != null || flag(state, REFUSED_FLAG) != null) return;
    const firedAt = flag(state, FIRED_FLAG);
    if (firedAt == null || flag(state, DUE_FLAG) != null) return;
    // Only a firing the fresh window missed gets the berth-side recovery.
    if (now - firedAt >= 0 && now - firedAt <= FIRING_FRESH_S) return;
    this._issue(now);
  },

  _issue(now) {
    const state = this.state;
    if (!state) return;
    writeFlag(state, DUE_FLAG, now);
    const dueAt = now + CAL_DAY_S;
    // The comms surfaces the director itself uses: the live popup line and the backlog.
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('comms:popup', {
        id: `special500.${ENTRY_ID}.invoice`,
        category: 'ambient',
        sender: 'CONCORD TOWAGE',
        text: INVOICE_TEXT,
        ttl: 12,
      });
      this.bus.emit('comms:log', { from: 'CONCORD TOWAGE', text: INVOICE_TEXT, kind: 'special500' });
      // The flight decision deck offer (the prompt adapter renders it; the deck never
      // owns the deadline — this leg's simTime expiry stays authoritative).
      this.bus.emit('special500:invoice', {
        billId: INVOICE_BILL_ID,
        title: 'STANDBY FEE',
        amount: STANDBY_FEE_CR,
        dueAt,
        memo: 'NO TOW PERFORMED. READINESS IS THE SERVICE. Memo: "This is a shakedown. It is also legal. — H."',
      });
    }
  },

  _onChoose({ choice }) {
    const state = this.state;
    if (!state) return;
    const now = Number(state.simTime) || 0;
    const dueAt = flag(state, DUE_FLAG);
    if (dueAt == null) return; // no live invoice: an answer with no bill is nothing
    if (flag(state, PAID_FLAG) != null || flag(state, REFUSED_FLAG) != null) return; // resolved
    if (now >= dueAt + CAL_DAY_S) { this._resolveRefusal(now); return; }

    if (choice === 'pay') {
      // Exact-payment request (NXB-009): the sole credits writer authenticates the balance;
      // a short account rejects with result=false and the bill stays open for another try.
      const req = {
        amount: STANDBY_FEE_CR,
        reason: 'special500:standby_fee',
        requireFull: true,
        expectedCredits: Math.max(0, Math.round(Number(state.player && state.player.credits) || 0)),
        commit: () => true,
        result: false,
      };
      this.bus.emit('economy:chargeCredits', req);
      if (req.result !== true) {
        this.bus.emit('special500:invoiceReceipt', {
          billId: INVOICE_BILL_ID, outcome: 'short', amount: STANDBY_FEE_CR, dueAt,
        });
        return;
      }
      writeFlag(state, PAID_FLAG, now);
      this.bus.emit('special500:invoiceReceipt', {
        billId: INVOICE_BILL_ID, outcome: 'paid', amount: STANDBY_FEE_CR, dueAt,
      });
      this.bus.emit('faction:repDelta', { factionId: CONCORD_FACTION, delta: REP_DELTA, reason: 'standby_fee_settled' });
      this.bus.emit('comms:log', { from: 'CONCORD TOWAGE', text: PAID_LOG_TEXT, kind: 'special500' });
      return;
    }

    if (choice === 'refuse') this._resolveRefusal(now);
  },

  _resolveRefusal(now) {
    const state = this.state;
    if (!state) return;
    if (flag(state, PAID_FLAG) != null || flag(state, REFUSED_FLAG) != null) return;
    writeFlag(state, REFUSED_FLAG, now);
    // The late fee is the assessment, not an offer: 4 cr either way, exactly like the bill said.
    this.bus.emit('economy:chargeCredits', { amount: STANDBY_FEE_CR, reason: 'special500:standby_fee_late' });
    this.bus.emit('faction:repDelta', { factionId: CONCORD_FACTION, delta: REP_DELTA, reason: 'standby_fee_late_assessed' });
    this.bus.emit('comms:log', { from: 'CONCORD TOWAGE', text: REFUSED_LOG_TEXT, kind: 'special500' });
    this.bus.emit('special500:invoiceReceipt', {
      billId: INVOICE_BILL_ID, outcome: 'refused', amount: STANDBY_FEE_CR, dueAt: null,
    });
  },
};
