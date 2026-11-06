// P2 — a part that explains itself.
//
// THE PROBLEM. The owner's words: "a wall of names and no explanations". A row in the fitter read
// `Vector Reaction Drive M · M · T1 · ...` — a size letter, a tier digit and a sentence that changed
// by slot type. Nothing said what the part was FOR, nothing put two parts on one ladder, and the
// catalogue was ordered by slot letter, so a hull plate sat next to a tractor.
//
// THIS MODULE is the one place a part's player-facing facts come from:
//   role       one or two words — what the part is ("Tractor", "Heavy gun", "Field drive")
//   sentence   one plain sentence — what it does, never a restatement of its name
//   tier       Mk I / Mk II / Mk III, the ladder the owner allowed on 2026-10-21
//   intent     what you want to DO when you go looking for it (Fight / Survive / Move / Carry /
//              Work / Sneak) — the catalogue's organising axis
//   previewId  the id a 3–5 s looping preview is filed under
//
// It reads `arsenalIdentity.js` and the data definitions. It invents no tuning and no second
// calculator: stat deltas are the Ship Sheet's own (`shipStats.shipStatDelta`).

import { MODULES } from '../../data/modules.js';
import { WEAPONS } from '../../data/weapons.js';
import { BOMB_DEFS, BOMB_IDS } from '../../data/bombs.js';
import { arsenalSentence, arsenalIdentity } from '../../data/arsenalIdentity.js';

const MODULE_BY_ID = new Map(MODULES.map((def) => [def.id, def]));
const WEAPON_BY_ID = new Map(WEAPONS.map((def) => [def.id, def]));
const BOMB_BY_ID = new Map(BOMB_IDS.map((id) => [id, BOMB_DEFS[id]]).filter(([, def]) => def));

/** The six things a player goes to the yard wanting to do. Order is the catalogue's order. */
export const PART_INTENTS = Object.freeze([
  Object.freeze({ id: 'fight', label: 'Fight', gloss: 'Put damage on something.' }),
  Object.freeze({ id: 'survive', label: 'Survive', gloss: 'Take a hit and stay in the fight.' }),
  Object.freeze({ id: 'move', label: 'Move', gloss: 'Go faster, turn harder, break away.' }),
  Object.freeze({ id: 'carry', label: 'Carry', gloss: 'Move cargo and salvage.' }),
  Object.freeze({ id: 'work', label: 'Work', gloss: 'Do the job: mine, tow, sweep, see.' }),
  Object.freeze({ id: 'sneak', label: 'Sneak', gloss: 'Not be seen, not be hit.' }),
]);

const INTENT_BY_ID = new Map(PART_INTENTS.map((row) => [row.id, row]));

const TIER_WORDS = Object.freeze({ 1: 'Mk I', 2: 'Mk I', 3: 'Mk II', 4: 'Mk III', 5: 'Mk III' });

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** Mk I / Mk II / Mk III for a numeric tier. Unknown tiers read as Mk I — never a bare digit. */
export function tierWordFor(tier) {
  const n = Math.round(finite(tier, 1));
  return TIER_WORDS[n] || (n <= 2 ? 'Mk I' : (n === 3 ? 'Mk II' : 'Mk III'));
}

function modsOf(def) {
  return (def && def.mods) || {};
}

/**
 * What the part is, in one or two words. Derived from the part's own slot and modifiers, so a new
 * module cannot arrive without a role.
 */
export function roleForPart(def, kind) {
  if (!def) return '';
  const mods = modsOf(def);
  if (kind === 'weapon') {
    if (def.emergentPrimitive) return 'Special mount';
    if (def.continuous) return 'Beam weapon';
    if (def.tracking === 'homing') return 'Guided weapon';
    if (def.tracking === 'auto_turret') return 'Turret';
    if (finite(def.dmg, 0) <= 0) return 'Tool mount';
    return `Gun · ${String(def.size || 'S').toUpperCase()}`;
  }
  if (kind === 'bomb') return 'Ordnance';
  const head = String(mods.masslineHeadId || '');
  if (head === 'tractor' || mods.magnetRange) return 'Tractor';
  if (head === 'elastic_whip') return 'Snap line';
  if (head === 'frame_coupler') return 'Hitch line';
  if (head === 'monofilament_sweep') return 'Cutter line';
  if (head === 'transverse_snare') return 'Snare line';
  if (head === 'twin_bridle') return 'Twin bridle';
  if (finite(mods.tetherSpoolMult, 1) > 1) return 'Long spool';
  if (finite(mods.tetherReelRateMult, 1) > 1) return 'Fast reel';
  if (mods.swingDrive) return 'Swing drive';
  if (mods.phaseBlink) return 'Blink drive';
  if (mods.countermeasure) return 'Countermeasure';
  if (mods.repulsionTrap) return 'Repulsor trap';
  if (finite(mods.droneBay, 0) > 0) return 'Drone bay';
  if (mods.jumpDriveTier) return 'Jump drive';
  if (finite(mods.hullRepairOOC, 0) > 0) return 'Repair rig';
  if (finite(mods.hiddenCargoPct, 0) > 0) return 'Hidden hold';
  if (finite(mods.scannerCloak, 0) > 0) return 'Cloak';
  if (finite(mods.ramDamageDealtMult, 0) > 0) return 'Ram plate';
  if (mods.hullBurst) return 'Hull burst';
  if (finite(mods.damageReductionPct, 0) > 0) return 'Armour';
  if (finite(mods.weaponRangePct, 0) > 0) return 'Range finder';
  if (finite(mods.radarRangePct, 0) > 0) return 'Sensor';
  if (finite(mods.cargoFlat, 0) > 0 || finite(mods.cargoCapPct, 0) > 0) return 'Cargo pod';
  if (finite(mods.shieldFlat, 0) > 0) return 'Shield booster';
  if (finite(mods.weaponHeatDissipPct, 0) > 0) return 'Heat sink';
  switch (def.slotType) {
    case 'engine': return 'Drive';
    case 'thruster': return 'Thrusters';
    case 'shield': return 'Shield';
    case 'cargo': return 'Hold';
    case 'mining': return 'Mining tool';
    case 'weapon': return 'Weapon';
    default: return 'Utility';
  }
}

/** What you were looking for when you went to find this part. */
export function intentForPart(def, kind) {
  if (!def) return 'work';
  const mods = modsOf(def);
  if (kind === 'weapon') {
    if (def.emergentPrimitive) return 'fight';
    if (finite(def.dmg, 0) <= 0 || def.utilityVerb) return 'work';
    return 'fight';
  }
  if (kind === 'bomb') {
    if (/goo|emp|scrambler|anchor|static|havoc|tar/.test(String(def.id || ''))) return 'sneak';
    return 'fight';
  }
  if (finite(mods.damageReductionPct, 0) > 0 || finite(mods.shieldFlat, 0) > 0
    || finite(mods.hullRepairOOC, 0) > 0 || mods.hullBurst) return 'survive';
  if (finite(mods.scannerCloak, 0) > 0 || mods.countermeasure || finite(mods.hiddenCargoPct, 0) > 0) return 'sneak';
  if (mods.swingDrive || mods.phaseBlink || finite(mods.ramDamageDealtMult, 0) > 0) return 'move';
  if (finite(mods.cargoFlat, 0) > 0 || finite(mods.cargoCapPct, 0) > 0) return 'carry';
  if (finite(mods.magnetRange, 0) > 0 || finite(mods.droneBay, 0) > 0) return 'carry';
  if (def.slotType === 'engine' || def.slotType === 'thruster') return 'move';
  if (def.slotType === 'shield') return 'survive';
  if (def.slotType === 'cargo') return 'carry';
  if (def.slotType === 'weapon') return 'fight';
  return 'work';
}

/**
 * The one sentence a part gets. The arsenal identity catalogue already writes these for the
 * offensive kit; a module falls back to its own authored `sentence`, then to a role-led line that
 * says something the name does not.
 */
export function sentenceForPart(def, kind) {
  if (!def) return '';
  const arsenal = arsenalSentence(def);
  if (arsenal) return arsenal;
  const own = typeof def.sentence === 'string' ? def.sentence.trim() : '';
  if (own) return own;
  const role = roleForPart(def, kind);
  const mods = modsOf(def);
  if (finite(mods.damageReductionPct, 0) > 0) return 'Takes the edge off every hit that lands on the hull.';
  if (finite(mods.shieldFlat, 0) > 0) return 'Adds shield that keeps coming back while you fly.';
  if (finite(mods.weaponHeatDissipPct, 0) > 0) return 'The guns shed heat faster, so a burst lasts longer.';
  if (finite(mods.cargoFlat, 0) > 0 || finite(mods.cargoCapPct, 0) > 0) return 'Changes what the hold can carry.';
  if (def.slotType === 'engine') return 'Changes how hard you push and how fast you can run.';
  if (def.slotType === 'thruster') return 'Changes how the hull turns, slides and stops.';
  if (finite(def.mass, 0) > 0) return `You carry its ${Math.round(finite(def.mass, 0))} tonnes, and that is what the ship feels.`;
  return `${role}. It does not change how the ship flies.`;
}

function kindOf(def) {
  if (!def) return 'module';
  if (WHITELIST_WEAPON(def)) return 'weapon';
  if (def.magazine != null || def.fuzeS != null) return 'bomb';
  return 'module';
}

function WHITELIST_WEAPON(def) {
  return WEAPON_BY_ID.get(def.id) === def;
}

/**
 * Everything a surface needs to explain one part.
 *
 * @param {string} id
 * @returns {null | Readonly<{id, name, kind, role, sentence, tier, tierNumber, intent, intentLabel, previewId}>}
 */
export function partFacts(id) {
  if (!id) return null;
  const weapon = WEAPON_BY_ID.get(id);
  const moduleDef = MODULE_BY_ID.get(id);
  const bomb = BOMB_BY_ID.get(id);
  const def = weapon || moduleDef || bomb;
  if (!def) return null;
  const kind = weapon ? 'weapon' : (moduleDef ? 'module' : 'bomb');
  const intentId = intentForPart(def, kind);
  const intent = INTENT_BY_ID.get(intentId) || INTENT_BY_ID.get('work');
  return Object.freeze({
    id: def.id,
    name: def.name || def.id,
    kind,
    role: roleForPart(def, kind),
    sentence: sentenceForPart(def, kind),
    tierNumber: Math.round(finite(def.tier, 1)),
    tier: tierWordFor(def.tier),
    intent: intent.id,
    intentLabel: intent.label,
    previewId: `pv_${def.id}`,
  });
}

/** Facts for a list of ids, unknown ids dropped, order preserved. */
export function partFactsForIds(ids = []) {
  const rows = [];
  for (const id of ids) {
    const facts = partFacts(id);
    if (facts) rows.push(facts);
  }
  return Object.freeze(rows);
}

/**
 * The catalogue's own ordering: what you want to DO first, then the ladder (Mk I before Mk III),
 * then price. A part with no intent sorts last rather than disappearing.
 */
export function compareParts(left, right) {
  const li = PART_INTENTS.findIndex((row) => row.id === left.intent);
  const ri = PART_INTENTS.findIndex((row) => row.id === right.intent);
  const lo = li < 0 ? PART_INTENTS.length : li;
  const ro = ri < 0 ? PART_INTENTS.length : ri;
  if (lo !== ro) return lo - ro;
  if (left.tierNumber !== right.tierNumber) return left.tierNumber - right.tierNumber;
  return String(left.name).localeCompare(String(right.name));
}

/** Sort ids into the catalogue's order (intent, then tier, then name). */
export function sortIdsByIntent(ids = []) {
  return ids
    .map((id) => ({ id, facts: partFacts(id) }))
    .filter((row) => row.facts)
    .sort((a, b) => compareParts(a.facts, b.facts))
    .map((row) => row.id);
}

/** The intent a part id belongs to, or null. */
export function intentLabelFor(id) {
  const facts = partFacts(id);
  return facts ? facts.intentLabel : null;
}

export { arsenalIdentity };
