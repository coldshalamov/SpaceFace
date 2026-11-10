// PULSE-HISTORY — the ship and the world wear the player's history.
//
// Four visible consequences, all projected from receipts other owners already signed:
//   • the cockpit shelf gains a keepsake the first time each kind of real deed is recorded
//     (pod rescue → a medic's tag, an ace defeat → their sigil, a burned base → a slag coin);
//   • the yard paints the hull decal the record argues for (law work → concord, outlaw work →
//     frontier, industry → industrial, an ace kill → borrowed_time);
//   • a memorial array holds the named dead the loss ledger actually filed — including the ones
//     the player killed, marked as such;
//   • docking in a sector that knows the player puts a line of graffiti about the loudest deed
//     on the station airlock, once per story worth telling.
//
// Writers honored: trinkets and decals are emitted as intents — ships.js remains the single
// writer of livingHull (history:trinket → livingHullWithTrinket) and of ship appearance
// (history:decal → setShipAppearance). The memorial array lives under state.story, which is
// saved whole; nothing here touches factions, heat, credits, or spawns. No update() — this
// system subscribes at init and never ticks.

import {
  HISTORY_DEAD_CAP,
  HISTORY_WEAR_VERSION,
  historyTrinketsFor,
  historyDecalFor,
  historyGraffitiFor,
  memorialEntryForLoss,
} from '../data/historyWear.js';

/** Saved record under state.story — created lazily so an empty career serializes unchanged. */
export function ensureHistoryWear(state) {
  const story = state.story || (state.story = { flags: {} });
  let rec = story.historyWear;
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
    rec = story.historyWear = { schemaVersion: HISTORY_WEAR_VERSION, dead: [], graffitiShown: {} };
  }
  if (!Array.isArray(rec.dead)) rec.dead = [];
  if (!rec.graffitiShown || typeof rec.graffitiShown !== 'object') rec.graffitiShown = {};
  if (rec.schemaVersion !== HISTORY_WEAR_VERSION) rec.schemaVersion = HISTORY_WEAR_VERSION;
  return rec;
}

/** Read-only accessor: never creates the key. The memorial array, oldest first. */
export function historyWearDead(state) {
  const rec = state && state.story && state.story.historyWear;
  return rec && Array.isArray(rec.dead) ? rec.dead : [];
}

export const historyWear = {
  name: 'historyWear',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._subs = [];

    // Memorial arrays — the dead are the ledger's, not ours: every row is a filed
    // lossLedger:recorded entry that named its victim. The player's own kills carry byPlayer so
    // the array can say "you put them there" without recomputing anything.
    this._listen('lossLedger:recorded', (p) => {
      const row = memorialEntryForLoss(p);
      if (!row) return;
      const rec = ensureHistoryWear(this.state);
      if (rec.dead.some((d) => d.id === row.id)) return;
      rec.dead.push(row);
      if (rec.dead.length > HISTORY_DEAD_CAP) rec.dead.splice(0, rec.dead.length - HISTORY_DEAD_CAP);
      this.bus.emit('history:deadNoted', { id: row.id, name: row.name, byPlayer: row.byPlayer });
    });

    // Dock = the moment the world gets to react: keepsakes get shelved, the yard reads which
    // decal the record argues for, and a sector that knows the player says so on the wall.
    this._listen('dock:docked', (p) => this._onDocked(p));
  },

  _listen(evt, fn) {
    const off = this.bus && this.bus.on(evt, fn);
    if (typeof off === 'function') this._subs.push(off);
  },

  _onDocked(payload) {
    const state = this.state;
    if (!state) return;

    // Keepsakes + decal are projections of the deed ledger — no new history is written here;
    // new deed kinds since last dock simply grant their keepsake now.
    for (const trinket of historyTrinketsFor(state)) {
      this.bus.emit('history:trinket', {
        id: trinket.id, label: trinket.label, deedId: trinket.deedId, t: trinket.atT,
      });
    }
    const decalId = historyDecalFor(state);
    if (decalId) this.bus.emit('history:decal', { decalId });

    // Graffiti in sectors where the player is known: one line per story worth telling. A new
    // louder deed re-arms the sector; the same wall never repeats itself.
    const sectorId = (payload && payload.sectorId)
      || (state.world && state.world.currentSectorId)
      || null;
    const piece = historyGraffitiFor(state, sectorId);
    if (!piece) return;
    const rec = ensureHistoryWear(state);
    const shownKey = String(sectorId);
    if (rec.graffitiShown[shownKey] === piece.deedId) return;
    rec.graffitiShown[shownKey] = piece.deedId;
    this.bus.emit('graffiti:show', {
      line: piece.line,
      where: 'airlock',
      author: 'a stranger',
      stationId: payload && payload.stationId || null,
      sectorId,
    });
  },

  destroy() {
    if (Array.isArray(this._subs)) {
      for (const off of this._subs) { try { off(); } catch (e) { /* shutdown */ } }
    }
    this._subs = [];
    this.state = null;
    this.bus = null;
  },
};

export default historyWear;
