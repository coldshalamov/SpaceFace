// moralTrapPrompt.js — the trap's answer. moralTrap._maybeReveal fires `moralTrap:revealed`
// once mid-run and stashes the live fork on state.ui.moralTrap; until this module nothing
// consumed either, so every trap played its reveal line into silence.
//
// This thin adapter normalizes the reveal into the ONE flight decision surface (promptDeck):
// each trap option becomes a deck verb whose choice emits `moralTrap:choose {missionId,
// optionId}` — the intent moralTrap._resolveChoice has always listened for. Consequences stay
// in the system (rep/credits channels); this adapter never applies outcomes itself.
//
// The fork has no clock — it stands until answered. The deck voids every entry on
// sector:exit / dock:docked / game transitions and the system's reveal is once-only, so any
// edge that can follow a deck clear re-derives the pending fork from the mission record
// (mission.trap + the _trapRevealed/_trapResolved flags serialize; state.ui.moralTrap does
// not). A settled or ended job cannot answer later: resolved/ended missions fail the scan.
//
// Registry SYSTEMS-only entry (no update; event-driven), same posture as customsPrompt.

import { getPromptDeck } from './promptDeck.js';

const DECK_ID = 'moral-trap';
// Missions that left the board — status flips before mission:completed/failed emits, so the
// scan never re-offers a fork whose job is over. Anything else (incl. missing status on
// legacy rows) is treated as live.
const DEAD = new Set(['completed', 'failed', 'expired']);

export const moralTrapPrompt = {
  name: 'moralTrapPrompt',

  init(ctx) {
    this._ctx = ctx;
    this._bus = ctx && ctx.bus;
    this._state = ctx && ctx.state;
    this._missionId = null;
    this._onRevealed = (p) => this._offer(p);
    this._onRestore = () => this._restore();
    if (this._bus && this._bus.on) {
      this._bus.on('moralTrap:revealed', this._onRevealed);
      this._bus.on('moralTrap:resolved', this._onRestore);
      this._bus.on('mission:completed', this._onRestore);
      this._bus.on('mission:failed', this._onRestore);
      this._bus.on('sector:enter', this._onRestore);
      this._bus.on('dock:undocked', this._onRestore);
      this._bus.on('save:loaded', this._onRestore);
      this._bus.on('game:new', this._onRestore);
    }
    this._restore();
  },

  _offer(p) {
    const choice = p && p.choice;
    const options = choice && Array.isArray(choice.options) ? choice.options.filter((o) => o && o.id) : [];
    if (!p || !p.missionId || !options.length) return;
    const deck = typeof getPromptDeck === 'function' ? getPromptDeck() : null;
    if (!deck) return;
    this._missionId = p.missionId;
    deck.offerDecision({
      id: DECK_ID,
      kind: 'warn',
      sender: 'THE JOB',
      statusFlag: 'MANIFEST',
      headline: 'NOT WHAT IT SAID',
      detail: String(choice.prompt || 'The job is not what it said.'),
      choices: options.map((o) => ({
        id: String(o.id),
        label: String(o.label || o.id),
        title: o.blurb != null ? String(o.blurb) : undefined,
      })),
      onChoose: (optionId) => this.choose(optionId),
      onExpire: () => this._dismiss(),
    });
  },

  choose(optionId) {
    const bus = this._bus;
    const missionId = this._missionId;
    this._dismiss();
    if (!bus || !bus.emit || !missionId || !optionId) return;
    bus.emit('moralTrap:choose', { missionId, optionId });
  },

  _restore() {
    const active = (this._state && this._state.missions && this._state.missions.active) || [];
    const m = active.find((m) => m && !DEAD.has(m.status)
      && m.trap && m.trap.choice && m._trapRevealed && !m._trapResolved);
    if (m) { this._offer({ missionId: m.id, choice: m.trap.choice }); return; }
    if (this._missionId) this._dismiss();
  },

  _dismiss() {
    this._missionId = null;
    const deck = typeof getPromptDeck === 'function' ? getPromptDeck() : null;
    if (deck) deck.resolveDecision(DECK_ID);
  },

  destroy() {
    if (this._bus && this._bus.off) {
      if (this._onRevealed) this._bus.off('moralTrap:revealed', this._onRevealed);
      if (this._onRestore) {
        this._bus.off('moralTrap:resolved', this._onRestore);
        this._bus.off('mission:completed', this._onRestore);
        this._bus.off('mission:failed', this._onRestore);
        this._bus.off('sector:enter', this._onRestore);
        this._bus.off('dock:undocked', this._onRestore);
        this._bus.off('save:loaded', this._onRestore);
        this._bus.off('game:new', this._onRestore);
      }
    }
    this._onRevealed = null;
    this._onRestore = null;
    this._dismiss();
  },
};

export default moralTrapPrompt;
