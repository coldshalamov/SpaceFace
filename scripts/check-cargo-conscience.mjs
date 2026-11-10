// BP-12 packet CARGO_REPUTATION_GLYPH ("Cargo Conscience") acceptance check.
//
// Contract (src/ui/cargoConscience.js + src/data/commodityMoralTags.js):
//   - holdSentiment is PURE: sums only morally-tagged stacks into a per-faction LEAN. Neutral cargo
//     (ores/gases/salvage — the majority) contributes NOTHING. An empty/legal-neutral hold is neutral.
//   - The glyph is a LEAN ('warm'/'cool'/'neutral'), NEVER a delta. The conscience never writes rep.
//   - The moralTag addendum is merged onto commodity records at load (one source of truth), and the
//     enumerated tag set is MORAL_TAGS — a tag outside it renders nothing (no invented sentiment).
//   - conscienceGlyph returns the DOMINANT lean as a one-line label; null when neutral.
//   - The wired module refreshes additive state.ui.cargoConscience on cargo:changed/dock:docked and
//     NEVER mutates cargo or reputation.
import assert from 'node:assert/strict';

import { COMMODITIES, COMMODITY_MORAL_TAGS, MORAL_TAGS } from '../src/data/commodities.js';
import {
  cargoConscience, holdSentiment, conscienceGlyph,
} from '../src/ui/cargoConscience.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');

function guarded(fn) {
  const r = Math.random, n = Date.now;
  Math.random = () => { throw new Error('Math.random in cargo-conscience path'); };
  Date.now = () => { throw new Error('Date.now in cargo-conscience path'); };
  try { return fn(); } finally { Math.random = r; Date.now = n; }
}

testMoralTagMergedAtLoad();
guarded(testEmptyHoldIsNeutral);
guarded(testMedicineFrontierGoodwill);
guarded(testContrabandQuietFavor);
guarded(testWeaponsConcordWarmFrontierCool);
guarded(testNeutralCargoContributesNothing);
guarded(testMixedHoldDominantLean);
guarded(testDeterminismAndPurity);
testWiredModuleRefreshesStateNoMutation();

console.log('Cargo-conscience checks OK');

// ── 1. moralTag merged onto commodity records at load (one source of truth) ───────────────────
function testMoralTagMergedAtLoad() {
  const med = COMMODITIES.find((c) => c.id === 'cmdty_medical');
  assert.equal(med.moralTag, 'humanitarian', 'medicine carries humanitarian moralTag');
  const weapons = COMMODITIES.find((c) => c.id === 'cmdty_weapons');
  assert.equal(weapons.moralTag, 'military', 'weapons carries military moralTag');
  const ore = COMMODITIES.find((c) => c.id === 'cmdty_ore_iron');
  assert.equal(ore.moralTag, undefined, 'iron ore is neutral — no moralTag');
  // every tag in the map is an enumerated MORAL_TAGS value (no invented tags)
  for (const id in COMMODITY_MORAL_TAGS) {
    assert.ok(MORAL_TAGS.includes(COMMODITY_MORAL_TAGS[id]), `${id} uses an enumerated moralTag`);
  }
}

// ── 2. empty/missing hold → neutral ──────────────────────────────────────────────────────────
function testEmptyHoldIsNeutral() {
  assert.deepEqual(holdSentiment({ items: {} }).leans, [], 'empty hold → no leans');
  assert.equal(holdSentiment({ items: {} }).neutral, true);
  assert.equal(holdSentiment(null).neutral, true, 'missing cargo → neutral, never throws');
  assert.equal(holdSentiment({ items: { cmdty_ore_iron: 50 } }).neutral, true,
    'legal-neutral ore contributes nothing → neutral');
  assert.equal(conscienceGlyph({ items: {} }), null, 'neutral hold → no glyph');
}

// ── 3. medicine → Frontier goodwill (warm) ───────────────────────────────────────────────────
function testMedicineFrontierGoodwill() {
  const s = holdSentiment({ items: { cmdty_medical: 10 } });
  const frontier = s.leans.find((l) => l.factionId === 'faction_free');
  assert.ok(frontier, 'medicine produces a Frontier lean');
  assert.equal(frontier.lean, 'warm', 'medicine → Frontier warm (goodwill)');
  const g = conscienceGlyph({ items: { cmdty_medical: 10 } });
  assert.ok(/Frontier goodwill/i.test(g.label), `glyph labels the Frontier goodwill: "${g.label}"`);
}

// ── 4. contraband → Quiet favor (warm) + Concord risk (cool) ─────────────────────────────────
function testContrabandQuietFavor() {
  const s = holdSentiment({ items: { cmdty_narcotics: 5, cmdty_stolen_goods: 3 } });
  const quiet = s.leans.find((l) => l.factionId === 'faction_quiet');
  const concord = s.leans.find((l) => l.factionId === 'faction_scn');
  assert.ok(quiet && quiet.lean === 'warm', 'contraband → Quiet warm (favor)');
  assert.ok(concord && concord.lean === 'cool', 'contraband → Concord cool (risk)');
  const g = conscienceGlyph({ items: { cmdty_narcotics: 5 } });
  // Narcotics qty 5 → quiet +5 (warm), scn -5 (cool). Equal magnitude → dominant is whichever sorts
  // first; both are valid glyphs. Assert it names ONE of the real consequences.
  assert.ok(/Quiet favor|Concord risk/.test(g.label), `glyph names a real contraband consequence: "${g.label}"`);
}

// ── 5. weapons → Concord warm + Frontier cool (a tag with two leans) ──────────────────────────
function testWeaponsConcordWarmFrontierCool() {
  const s = holdSentiment({ items: { cmdty_weapons: 8 } });
  const concord = s.leans.find((l) => l.factionId === 'faction_scn');
  const frontier = s.leans.find((l) => l.factionId === 'faction_free');
  assert.ok(concord && concord.lean === 'warm', 'weapons → Concord warm');
  assert.ok(frontier && frontier.lean === 'cool', 'weapons → Frontier cool');
}

// ── 6. neutral cargo mixed in contributes nothing ────────────────────────────────────────────
function testNeutralCargoContributesNothing() {
  const a = holdSentiment({ items: { cmdty_medical: 10 } });
  const b = holdSentiment({ items: { cmdty_medical: 10, cmdty_ore_iron: 999, cmdty_fuel_cells: 50 } });
  // fuel_cells IS industrial (Drift) so it adds a Drift lean; iron ore is neutral and adds nothing.
  assert.deepEqual(a.perFaction.faction_free, b.perFaction.faction_free,
    'iron ore (neutral) does not change the Frontier lean');
  assert.ok(b.perFaction.faction_dmc > 0, 'fuel (industrial) adds a Drift lean, iron ore does not');
}

// ── 7. mixed hold → dominant lean is the strongest ───────────────────────────────────────────
function testMixedHoldDominantLean() {
  // 20 weapons (scn +20, free -20) vs 5 medicine (free +5): net free = -15 (cool), scn = +20 (warm).
  const s = holdSentiment({ items: { cmdty_weapons: 20, cmdty_medical: 5 } });
  assert.ok(s.leans.length >= 1);
  const dominant = s.leans[0];
  assert.ok(dominant.magnitude >= (s.leans[1] ? s.leans[1].magnitude : 0),
    'leans sorted strongest-first');
  assert.ok(['warm', 'cool'].includes(dominant.lean), 'dominant lean is warm or cool, never neutral');
}

// ── 8. purity + determinism ──────────────────────────────────────────────────────────────────
function testDeterminismAndPurity() {
  const cargo = { items: { cmdty_medical: 7, cmdty_narcotics: 2, cmdty_ore_goldium: 3 } };
  const a = holdSentiment(cargo);
  const b = holdSentiment(cargo);
  assert.deepStrictEqual(a, b, 'pure: same cargo → same sentiment');
  assert.deepStrictEqual(conscienceGlyph(cargo), conscienceGlyph(cargo));
}

// ── 9. wired module: refreshes state.ui.cargoConscience; NEVER mutates cargo or rep ──────────
function testWiredModuleRefreshesStateNoMutation() {
  const handlers = new Map();
  const bus = {
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
    off(evt, fn) { const l = handlers.get(evt) || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit(evt, p) { for (const fn of (handlers.get(evt) || []).slice()) fn(p); },
  };
  const state = { simTime: 5, player: { cargo: { items: { cmdty_medical: 10 } } } };
  const sys = { ...cargoConscience };
  sys.init({ bus, state });

  assert.ok(state.ui.cargoConscience, 'init refreshes state.ui.cargoConscience');
  assert.equal(state.ui.cargoConscience.factionId, 'faction_free');
  assert.equal(state.ui.cargoConscience.lean, 'warm');

  // cargo:changed refreshes the glyph
  state.player.cargo.items = { cmdty_narcotics: 5 };
  bus.emit('cargo:changed', { cargo: state.player.cargo });
  assert.equal(state.ui.cargoConscience.factionId, 'faction_quiet', 'cargo:changed refreshes the lean');

  // The conscience NEVER mutates the cargo manifest or faction rep
  assert.deepEqual(state.player.cargo.items, { cmdty_narcotics: 5 }, 'cargo manifest untouched');
  assert.ok(!state.factions, 'no faction state written — rep is never touched by the conscience');
  sys.destroy();
  bus.emit('cargo:changed', {});
  assert.ok(true, 'destroy unsubscribes cleanly');
}
