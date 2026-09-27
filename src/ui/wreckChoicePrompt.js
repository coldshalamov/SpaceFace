// wreckChoicePrompt.js — the wreck communicator's answer. salvage._offerFromPoint emits
// `mission:offered` (a full board offer — missions boards it through _onExternalBoardOffer) and
// then `salvage:communicatorFound`; the authored binary `choice` on wreck-mission templates
// (src/data/wreckMissions.js) and the survivor pod's rescue/strip fork rode those payloads
// with no in-flight surface, so the player only ever met them as silent board rows.
//
// This thin adapter normalizes the boarded offer into the ONE flight decision surface
// (promptDeck): authored options become deck verbs whose pick emits the owning system's intent —
//   • a survivor pod (params.survivorPodId) → `survivorPod:choose {salvagePointId, optionId}`
//     (survivorPod owns the tether gate and the strip payout),
//   • any other authored choice → `wreckMission:choose {offerId, choiceId}` (missions stamps
//     params.wreckChoiceId and runs the canonical accept seam),
//   • a plain communicator offer → a TAKE/LEAVE card; TAKE is the same wreckMission:choose seam
//     without an authored option.
//
// LEAVE is a dismissal, never an outcome — the offer stays on the station board.
// Consequences stay in the systems; this adapter never applies outcomes itself. Terminal pod
// events (rescueSelected / stripped / rescueBlocked) resolve or annotate the card; sector exit,
// docking, and save:loaded re-derive or clear tracked cards. Registry SYSTEMS-only entry
// (no update; event-driven), same posture as moralTrapPrompt/customsPrompt.

import { getPromptDeck } from './promptDeck.js';

const DECK_PREFIX = 'wreck-choice:';

function deckIdFor(offerId) { return DECK_PREFIX + String(offerId); }

export const wreckChoicePrompt = {
  name: 'wreckChoicePrompt',

  init(ctx) {
    this._ctx = ctx;
    this._bus = ctx && ctx.bus;
    this._state = ctx && ctx.state;
    // deckId → { offerId, salvagePointId, pod } — the live cards this adapter owns.
    this._live = new Map();
    this._onFound = (p) => this._offerForPointEvent(p);
    this._onAccepted = (p) => this._resolveOnAccepted(p);
    this._onPodTerminal = (p) => this._resolveForPoint(p && p.salvagePointId);
    this._onPodBlocked = (p) => this._annotateBlocked(p);
    this._onClear = () => this._resolveAll();
    this._onRestore = () => this._restore();
    if (this._bus && this._bus.on) {
      this._bus.on('salvage:communicatorFound', this._onFound);
      this._bus.on('mission:accepted', this._onAccepted);
      this._bus.on('survivorPod:rescueSelected', this._onPodTerminal);
      this._bus.on('survivorPod:stripped', this._onPodTerminal);
      this._bus.on('survivorPod:rescueBlocked', this._onPodBlocked);
      this._bus.on('sector:exit', this._onClear);
      this._bus.on('dock:docked', this._onClear);
      this._bus.on('save:loaded', this._onRestore);
      this._bus.on('game:new', this._onClear);
    }
  },

  // ── offer lookup ─────────────────────────────────────────────────────────────────────────

  /** Boarded salvage offer for one point. The communicator's offer is on a station board by the
   *  time `salvage:communicatorFound` fires (mission:offered listeners ran first). */
  _boardedOffer(salvagePointId) {
    const boards = (this._state && this._state.missions && this._state.missions.boards) || {};
    for (const board of Object.values(boards)) {
      const offer = (board && board.slots || []).find((o) => o && o.source === 'salvage' && (
        o.salvagePointId === salvagePointId
        || (o.params && (o.params.salvagePointId === salvagePointId || o.params.survivorPodId === salvagePointId))
      ));
      if (offer) return offer;
    }
    return null;
  },

  _offerForPointEvent(payload) {
    const pointId = payload && payload.salvagePointId;
    if (!pointId) return;
    const offer = this._boardedOffer(pointId);
    if (offer) this._offerCard(offer);
  },

  // ── card ────────────────────────────────────────────────────────────────────────────────

  _offerCard(offer) {
    const deck = typeof getPromptDeck === 'function' ? getPromptDeck() : null;
    if (!deck || !offer || !offer.id) return false;
    const isPod = !!(offer.params && offer.params.survivorPodId) || !!offer.survivorPod;
    const authored = offer.choice && Array.isArray(offer.choice.options)
      ? offer.choice.options.filter((o) => o && o.id) : [];
    const choices = (authored.length ? authored.map((o) => ({
      id: String(o.id),
      label: String(o.label || o.id).toUpperCase(),
      title: o.blurb != null ? String(o.blurb) : undefined,
      danger: String(o.id) === 'strip',
    })) : [{
      id: 'take', label: 'TAKE THE CONTRACT', title: 'Commit to the claim and fly the recovery.',
    }]).concat([{ id: 'leave', label: 'LEAVE IT', cancel: true }]);
    const podDueAt = isPod && offer.survivorPod && Number.isFinite(offer.survivorPod.oxygenDueAt)
      ? offer.survivorPod.oxygenDueAt : null;
    const deckId = deckIdFor(offer.id);
    this._live.set(deckId, {
      offerId: offer.id,
      salvagePointId: offer.salvagePointId || (offer.params && offer.params.salvagePointId) || null,
      pod: isPod,
    });
    return deck.offerDecision({
      id: deckId,
      kind: isPod ? 'warn' : 'info',
      sender: String(offer.giver || 'WRECK TRANSMITTER'),
      statusFlag: isPod ? 'LIFE SIGNS · CHOOSE' : 'CONTRACT SIGNAL',
      headline: String(offer.title || 'Wreck claim'),
      detail: String((offer.choice && offer.choice.prompt) || offer.summary || 'A contract rides on this wreck.'),
      // The pod's oxygen clock is the real deadline (producer-owned); other offers stand.
      deadlineAt: podDueAt,
      choices,
      onChoose: (choiceId, source) => this._choose(offer.id, choiceId, source),
      onExpire: () => { this._live.delete(deckId); },
    });
  },

  _choose(offerId, choiceId, source) {
    const deckId = deckIdFor(offerId);
    const tracked = this._live.get(deckId);
    const deck = typeof getPromptDeck === 'function' ? getPromptDeck() : null;
    if (choiceId === 'leave') {
      this._live.delete(deckId);
      if (deck) deck.resolveDecision(deckId);
      return;
    }
    const bus = this._bus;
    if (!bus || !bus.emit) return;
    if (tracked && tracked.pod) {
      // survivorPod validates the tether gate; a refused rescue emits survivorPod:rescueBlocked
      // and the card stays up with the latch instruction.
      bus.emit('survivorPod:choose', {
        salvagePointId: tracked.salvagePointId,
        offerId,
        optionId: choiceId,
        source: source || 'deck',
      });
      return;
    }
    this._live.delete(deckId);
    bus.emit('wreckMission:choose', {
      offerId,
      salvagePointId: tracked && tracked.salvagePointId || null,
      choiceId,
      source: source || 'deck',
    });
    if (deck) deck.resolveDecision(deckId);
  },

  // ── lifecycle ────────────────────────────────────────────────────────────────────────────

  _resolveOnAccepted(payload) {
    // Missions accepted a tracked offer through any seam — its card is done.
    const offerId = payload && (payload.sourceOfferId || payload.offerId);
    if (!offerId) return;
    const deckId = deckIdFor(offerId);
    if (!this._live.has(deckId)) return;
    this._live.delete(deckId);
    const deck = typeof getPromptDeck === 'function' ? getPromptDeck() : null;
    if (deck) deck.resolveDecision(deckId);
  },

  _resolveForPoint(salvagePointId) {
    if (!salvagePointId) return;
    const deck = typeof getPromptDeck === 'function' ? getPromptDeck() : null;
    for (const [deckId, rec] of [...this._live]) {
      if (rec.salvagePointId !== salvagePointId) continue;
      this._live.delete(deckId);
      if (deck) deck.resolveDecision(deckId);
    }
  },

  _annotateBlocked(payload) {
    if (!payload || !payload.salvagePointId) return;
    const deck = typeof getPromptDeck === 'function' ? getPromptDeck() : null;
    if (!deck) return;
    for (const [deckId, rec] of [...this._live]) {
      if (rec.salvagePointId !== payload.salvagePointId) continue;
      deck.updateDecision(deckId, {
        statusFlag: 'TETHER REQUIRED',
        detail: 'Latch the pod to your massline first, then tow it out.',
      });
    }
  },

  _resolveAll() {
    const deck = typeof getPromptDeck === 'function' ? getPromptDeck() : null;
    for (const deckId of this._live.keys()) {
      if (deck) deck.resolveDecision(deckId);
    }
    this._live.clear();
  },

  /** Continue / sector re-entry: a live pod offer still on the board deserves its card back. */
  _restore() {
    this._resolveAll();
    const boards = (this._state && this._state.missions && this._state.missions.boards) || {};
    const sectorId = this._state && this._state.world && this._state.world.currentSectorId;
    for (const board of Object.values(boards)) {
      for (const offer of (board && board.slots || [])) {
        if (!offer || offer.source !== 'salvage') continue;
        const podId = offer.params && offer.params.survivorPodId;
        if (!podId) continue;
        // Only a pod still aboard in THIS sector re-prompts; a stripped/rescued record's offer
        // is gone already (missions withdrew it on survivorPod:stripped / accept).
        const rec = this._state.survivorPod && this._state.survivorPod.promotedByPoint
          && this._state.survivorPod.promotedByPoint[podId];
        if (!rec || rec.stripped || rec.rescueSelected) continue;
        if (rec.sectorId && sectorId && rec.sectorId !== sectorId) continue;
        this._offerCard(offer);
      }
    }
  },

  destroy() {
    if (this._bus && this._bus.off) {
      if (this._onFound) this._bus.off('salvage:communicatorFound', this._onFound);
      if (this._onAccepted) this._bus.off('mission:accepted', this._onAccepted);
      if (this._onPodTerminal) {
        this._bus.off('survivorPod:rescueSelected', this._onPodTerminal);
        this._bus.off('survivorPod:stripped', this._onPodTerminal);
      }
      if (this._onPodBlocked) this._bus.off('survivorPod:rescueBlocked', this._onPodBlocked);
      if (this._onClear) {
        this._bus.off('sector:exit', this._onClear);
        this._bus.off('dock:docked', this._onClear);
        this._bus.off('game:new', this._onClear);
      }
      if (this._onRestore) this._bus.off('save:loaded', this._onRestore);
    }
    this._resolveAll();
    this._onFound = this._onAccepted = this._onPodTerminal = this._onPodBlocked = null;
    this._onClear = this._onRestore = null;
  },
};

export default wreckChoicePrompt;
