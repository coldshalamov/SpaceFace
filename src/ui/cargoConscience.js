// cargoConscience.js — BP-12 packet CARGO_REPUTATION_GLYPH ("Cargo Conscience").
//
// My hold has a moral color — medicine reads as goodwill to the Frontier, weapons as a Concord
// frown, contraband as Quiet favor. This is a PURE READ of the cargo manifest against the moralTag
// addendum (src/data/commodityMoralTags.js), surfaced as a per-faction LEAN glyph for the cargo
// panel. It is NOT a reputation change (the packet's named failure mode: implying a delta the sim
// won't apply). Actual rep deltas still come ONLY from contraband:scanned / mission:completed.
//
// CRITICAL DISCIPLINE (failure modes, enforced structurally):
//   • holdSentiment is PURE — no state mutation, no event emit, no roll, no clock. Read-only.
//   • The glyph is a LEAN ('warm'/'cool'/'neutral'), never a delta. The conscience never writes rep.
//   • Cosmetic only — it NEVER couples to factionId hostility (scanner.isHostileToPlayer owns that).
//     The faction ids it names are display keys (Frontier/Concord/Quiet/Meridian/Drift), nothing more.
//   • A commodity with no moralTag (the majority — ores, gases, salvage) contributes NOTHING. The
//     sentiment is the SUM of only the morally-tagged stacks; an empty/legal-neutral hold is neutral.
//
// noTouch honored: economy.js / cargo.js / factions.js are not imported at all — the conscience
// reads the cargo manifest (a plain object) and the commodity catalog directly. Budget: spawn:none ·
// voice:none · draw:none (a glyph within the existing cargo panel).

import { COMMODITIES } from '../data/commodities.js';
import { MORAL_TAGS } from '../data/commodityMoralTags.js';

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const SET_MORAL = new Set(MORAL_TAGS);

// The faction each moral tag leans toward (cosmetic display keys only — not hostility-coupled).
// `lean` is the sign of the sentiment that tag contributes to its faction: +1 warm, -1 cool.
// A tag can lean warm for one faction AND cool for another (e.g. weapons: Concord warm, Frontier cool).
const TAG_FACTION_LEAN = Object.freeze({
  humanitarian: Object.freeze({ faction_free: +1 }),               // Frontier goodwill
  military:     Object.freeze({ faction_scn: +1, faction_free: -1 }), // Concord approving, Frontier wary
  contraband:   Object.freeze({ faction_quiet: +1, faction_scn: -1 }), // Quiet favor, Concord hostile
  luxury:       Object.freeze({ faction_mts: +1 }),                 // Meridian approving
  industrial:   Object.freeze({ faction_dmc: +1 }),                 // Drift approving
});

/**
 * holdSentiment(cargo) -> { perFaction:{[factionId]:number}, leans:[{factionId,lean,label}], neutral:boolean }
 *
 * PURE. `cargo` is the player's cargo manifest (state.player.cargo) — an object with an `items`
 * map {commodityId: qty}. Returns the net moral lean per faction, summed over only the morally-
 * tagged stacks. A hold with no tagged cargo is NEUTRAL (neutral:true, empty leans). Never throws.
 *
 * The leans are sorted strongest-first so the cargo panel can show the dominant one as the glyph.
 * `lean` ∈ {'warm','cool','neutral'}; the magnitude is the absolute net sentiment (display weight).
 */
export function holdSentiment(cargo) {
  const perFaction = {};
  if (!cargo || typeof cargo !== 'object') {
    return { perFaction, leans: [], neutral: true };
  }
  const items = cargo.items || cargo;
  for (const id in items) {
    const qty = Number(items[id]) || 0;
    if (qty <= 0) continue;
    const def = CMDTY_BY_ID.get(id);
    const tag = def && def.moralTag;
    if (!tag || !SET_MORAL.has(tag)) continue; // enumerated tags only — neutral cargo ignored
    const leans = TAG_FACTION_LEAN[tag] || {};
    for (const fid in leans) {
      perFaction[fid] = (perFaction[fid] || 0) + leans[fid] * qty;
    }
  }

  const leans = Object.keys(perFaction)
    .map((factionId) => {
      const v = perFaction[factionId];
      return {
        factionId,
        lean: v > 0 ? 'warm' : v < 0 ? 'cool' : 'neutral',
        magnitude: Math.abs(v),
      };
    })
    .filter((l) => l.lean !== 'neutral')
    .sort((a, b) => b.magnitude - a.magnitude);

  return { perFaction, leans, neutral: leans.length === 0 };
}

/**
 * conscienceGlyph(cargo) -> { label, factionId, lean } | null — the DOMINANT lean as a single
 * glyph the cargo panel can render ("Quiet favor", "Concord risk", "Frontier goodwill", …).
 * null when the hold is neutral (no tagged cargo). PURE.
 */
export function conscienceGlyph(cargo) {
  const { leans } = holdSentiment(cargo);
  if (!leans.length) return null;
  const top = leans[0];
  return {
    factionId: top.factionId,
    lean: top.lean,
    label: GLYPHRASE[top.factionId] && GLYPHRASE[top.factionId][top.lean]
      ? GLYPHRASE[top.factionId][top.lean]
      : `${top.factionId} ${top.lean}`,
  };
}

// The one-line glyph label per (faction, lean). Cosmetic prose only.
const GLYPHRASE = Object.freeze({
  faction_free: Object.freeze({ warm: 'Frontier goodwill', cool: 'Frontier wary' }),
  faction_scn: Object.freeze({ warm: 'Concord approving', cool: 'Concord risk' }),
  faction_quiet: Object.freeze({ warm: 'Quiet favor', cool: 'Quiet disfavor' }),
  faction_mts: Object.freeze({ warm: 'Meridian approving', cool: 'Meridian wary' }),
  faction_dmc: Object.freeze({ warm: 'Drift approving', cool: 'Drift wary' }),
});

// ── registry SYSTEMS-only entry (no update; refreshes additive UI state; zero voice) ───────────
//
// The conscience refreshes state.ui.cargoConscience on cargo change + dock so the cargo panel can
// read a pre-computed glyph without re-scanning the manifest each frame. It NEVER mutates cargo/rep.
export const cargoConscience = {
  name: 'cargoConscience',

  init(ctx) {
    this._state = ctx && ctx.state;
    this._bus = ctx && ctx.bus;
    this._onCargo = () => this._refresh();
    this._onDock = () => this._refresh();
    if (this._bus && this._bus.on) {
      // cargo.js emits cargo:changed on any add/remove; dock:docked is a stable refresh point.
      this._bus.on('cargo:changed', this._onCargo);
      this._bus.on('dock:docked', this._onDock);
    }
    this._refresh();
  },

  _refresh() {
    const state = this._state;
    if (!state || !state.player) return;
    const cargo = state.player.cargo;
    const glyph = conscienceGlyph(cargo);
    const sentiment = holdSentiment(cargo);
    if (!state.ui || typeof state.ui !== 'object') state.ui = {};
    // Additive UI state (NOT in the sim snapshot hash) — readable by the cargo panel + tests.
    state.ui.cargoConscience = { ...glyph, leans: sentiment.leans, neutral: sentiment.neutral, t: state.simTime || 0 };
  },

  destroy() {
    if (this._bus && this._bus.off) {
      if (this._onCargo) this._bus.off('cargo:changed', this._onCargo);
      if (this._onDock) this._bus.off('dock:docked', this._onDock);
    }
    this._onCargo = null;
    this._onDock = null;
  },
};

export default cargoConscience;
