// src/systems/special500Question.js — SP2-012 "The Question, Answered Wrong" (Phase 2 leg).
//
// The catalog entry SP2-012 (src/data/special500/entries-comms-a.js) fires once on the first
// sector entry to sector_sedna_dark and writes flag `special500.SP2-012` through the director.
// This leg is that firing's reply-listen interpreter — it never re-evaluates the trigger; it
// reads the flag (and the retry design the entry's consensus trigger names: "hash-seeded 50%
// per day thereafter until fired") and runs the exchange on the comms surfaces the director
// already uses:
//
//   the voice asks one question and waits;
//   any transmission on the band (contactHail:request / contactHail:choice — the comms radial's
//   offer/receipt path) inside ten seconds answers "No. Try again next cycle.";
//   ten seconds of silence answers "Correct," and closes the channel forever.
//
// Durable state is plain-named story flags (the `special500.` namespace stays the director's):
//   the_question_answered   simTime the silence window expired — terminal, channel closed forever
//   the_question_asked_at   simTime of the current ask; the ten-second window is [askedAt, askedAt+10)
//   the_question_refused_at simTime of the last wrong answer — "try again next cycle" gate
//
// Determinism: windows resolve off state.simTime only; the re-ask hash is the director's own
// seededChance over (entry id, world day, save seed). Runtime bookkeeping (last sector seen)
// is a WeakMap off state — nothing here touches the save schema beyond the three flags above.

import { CAL_DAY_S } from '../data/worldCalendar.js';
import { seededChance } from './special500Director.js';
import { SPECIAL500_ALL } from '../data/special500/index.js';

const ENTRY_ID = 'SP2-012';
const FIRED_FLAG = `special500.${ENTRY_ID}`;
const ANSWERED_FLAG = 'the_question_answered';
const ASKED_FLAG = 'the_question_asked_at';
const REFUSED_FLAG = 'the_question_refused_at';

// The catalog entry's authored noticing line is the question itself — one source of copy.
const CATALOG_ENTRY = SPECIAL500_ALL.find((e) => e && e.id === ENTRY_ID) || null;
const QUESTION_TEXT = (CATALOG_ENTRY && CATALOG_ENTRY.payload && CATALOG_ENTRY.payload.text)
  || 'On an empty band, a voice that does not use a callsign asks one question — "What did the mass weigh?" — and waits.';

export const QUESTION_WINDOW_S = 10;
// A firing counts as fresh for this long after its flag was stamped: the leg's calendar pass
// may land up to a cohort window behind the director's, and a longer hitch hands the exchange
// to the entry's designed recovery (the hash-seeded re-ask on a later Sedna day).
export const FIRING_FRESH_S = 2;
// The consensus trigger's "hash-seeded 50% per day thereafter until fired".
export const RETRY_DAILY_CHANCE = 0.5;
const RETRY_SECTOR = 'sector_sedna_dark';

const CORRECT_TEXT = '"Correct," the voice says. Nothing else — no callsign, no repeat. The band empties and stays empty.';
const REFUSED_TEXT = '"No. Try again next cycle." The band empties.';

const RUNTIME = new WeakMap();

function runtime(state) {
  let rt = RUNTIME.get(state);
  if (!rt) {
    rt = { lastSectorId: null };
    RUNTIME.set(state, rt);
  }
  return rt;
}

// Same live-world read the director uses: state.world.currentSectorId is the live sector.
function currentSectorId(state) {
  const w = state && state.world;
  return (w && w.currentSectorId) || (state && state.player && state.player.sectorId) || null;
}

function flag(state, key) {
  const flags = (state.story && state.story.flags) || {};
  const v = flags[key];
  return Number.isFinite(Number(v)) ? Number(v) : null;
}

function writeFlag(state, key, value) {
  if (!state.story) state.story = { flags: {} };
  if (!state.story.flags || typeof state.story.flags !== 'object') state.story.flags = {};
  state.story.flags[key] = value;
}

function clearFlag(state, key) {
  const flags = state.story && state.story.flags;
  if (flags && typeof flags === 'object') delete flags[key];
}

function say(bus, id, text) {
  // The two comms surfaces the director itself dispatches through (comms:popup is the live
  // feed line, comms:log the backlog the player can re-read).
  if (bus && typeof bus.emit === 'function') {
    bus.emit('comms:popup', { id, category: 'ambient', sender: 'no callsign', text });
    bus.emit('comms:log', { from: 'no callsign', text, kind: 'special500' });
  }
}

export const special500Question = {
  name: 'special500Question',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    // A transmission is the comms radial's offer/receipt path itself: opening a hail
    // (contactHail:request) or answering an offer (contactHail:choice). Any one of them
    // while the question hangs is an answer — the voice wanted silence.
    this._off = [
      this.bus.on('contactHail:request', () => this._onTransmission()),
      this.bus.on('contactHail:choice', () => this._onTransmission()),
    ].filter((off) => typeof off === 'function');
  },

  destroy() {
    for (const off of this._off || []) {
      try { off(); } catch (_) { /* cleanup must not throw */ }
    }
    this._off = [];
  },

  // The transmission listener reads the live window off the system's own state reference.
  _onTransmission() {
    const state = this.state;
    if (!state) return;
    const askedAt = flag(state, ASKED_FLAG);
    if (askedAt == null) return; // no open window: a hail is just a hail
    const now = Number(state.simTime) || 0;
    if (now >= askedAt + QUESTION_WINDOW_S) return; // the silence already answered
    // Wrong answer: the window closes on the first transmission; a duplicate is inert
    // because the ask flag is gone.
    clearFlag(state, ASKED_FLAG);
    writeFlag(state, REFUSED_FLAG, now);
    say(this.bus, `special500.${ENTRY_ID}.refused`, REFUSED_TEXT);
  },

  update(dt, state) {
    if (!state) return;
    const now = Number(state.simTime) || 0;
    const rt = runtime(state);
    const sector = currentSectorId(state);
    const sectorChanged = !!(sector && rt.lastSectorId !== sector);
    if (sector) rt.lastSectorId = sector;

    if (flag(state, ANSWERED_FLAG) != null) return; // the channel closed forever
    const firedAt = flag(state, FIRED_FLAG);
    if (firedAt == null) return; // unmet gate: the catalog has not fired yet

    // An open window resolves off simTime alone: silence to expiry is the correct answer,
    // and the resolution lands on the first pass past the window — including after a
    // save/Continue inside the window (the ask flag is save-carried).
    const askedAt = flag(state, ASKED_FLAG);
    if (askedAt != null) {
      if (now >= askedAt + QUESTION_WINDOW_S) {
        writeFlag(state, ANSWERED_FLAG, now);
        say(this.bus, `special500.${ENTRY_ID}.correct`, CORRECT_TEXT);
      }
      return;
    }

    // Fresh firing: ask now — the exchange belongs to the moment the band went quiet.
    if (now - firedAt >= 0 && now - firedAt <= FIRING_FRESH_S) {
      this._ask(now);
      return;
    }

    // Recovery: the entry's own design — re-ask on a sector entry to the dark margin,
    // hash-seeded 50% per world day, never twice in one day, until it is answered.
    if (!sectorChanged || sector !== RETRY_SECTOR) return;
    const day = Math.floor(now / CAL_DAY_S);
    const lastTouch = Math.max(
      firedAt,
      flag(state, REFUSED_FLAG) || 0,
    );
    if (day <= Math.floor(lastTouch / CAL_DAY_S)) return;
    const seed = (state.meta && state.meta.seed) || 0;
    if (seededChance(`${ENTRY_ID}|${day}|${seed}`) >= RETRY_DAILY_CHANCE) return;
    this._ask(now);
  },

  _ask(now) {
    const state = this.state;
    if (!state) return;
    writeFlag(state, ASKED_FLAG, now);
    say(this.bus, `special500.${ENTRY_ID}.ask`, QUESTION_TEXT);
  },
};
