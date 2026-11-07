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
//   previewId  the id a 3–5 s looping preview is filed under — null until that rig ships
//
// It reads `arsenalIdentity.js` and the data definitions. It invents no tuning and no second
// calculator: stat deltas are the Ship Sheet's own (`shipStats.shipStatDelta`).
//
// ORDERING TRUTH: `sortIdsByIntent` orders one already-selected list (the fitter passes the
// modules that fit ONE slot type). It is intent-first *within that list*, not a global ordering of
// every fittable part. A slot type is a fitting constraint, so the chooser has no cross-slot
// browse today; do not describe this as a catalogue-wide sort.

import { MODULES } from '../../data/modules.js';
import { WEAPONS } from '../../data/weapons.js';
import { BOMB_DEFS, BOMB_IDS } from '../../data/bombs.js';
import { ATTACK_TRAIT_BY_ID } from '../../data/attackTraits.js';
import { arsenalSentence, arsenalIdentity } from '../../data/arsenalIdentity.js';

const MODULE_BY_ID = new Map(MODULES.map((def) => [def.id, def]));
const WEAPON_BY_ID = new Map(WEAPONS.map((def) => [def.id, def]));
const BOMB_BY_ID = new Map(BOMB_IDS.map((id) => [id, BOMB_DEFS[id]]).filter(([, def]) => def));

/**
 * Preview clips are not built yet. The manifest is the reader every surface must call; an empty
 * manifest means every part honestly reports `previewId: null` instead of a `pv_<id>` string with
 * no clip behind it. When the Range capture rig lands, add `{ [id]: 'clips/<id>.webm' }` here and
 * the same reader starts resolving with no row changes.
 */
export const PART_PREVIEW_MANIFEST = Object.freeze({});

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

/** The intent a bare slot type implies when nothing more specific is authored. */
export const SLOT_DEFAULT_INTENT = Object.freeze({
  weapon: 'fight',
  shield: 'survive',
  engine: 'move',
  thruster: 'move',
  cargo: 'carry',
  mining: 'work',
  utility: 'work',
  bomb: 'fight',
});

const TIER_WORDS = Object.freeze({ 1: 'Mk I', 2: 'Mk I', 3: 'Mk II', 4: 'Mk III', 5: 'Mk III' });

/**
 * Six authored names still carry a `T2`/`Mk2`/`Mk1` token that duplicates the tier column the
 * catalogue now prints. The stable ids do not change; only the player-facing name loses the
 * redundant token. Add an entry here when a new name repeats the ladder.
 */
export const PART_DISPLAY_NAMES = Object.freeze({
  mod_jump_drive_m: 'Jump Drive M',
  mod_gravity_bumper_s_mk2: 'Gravity Bumper S',
  mod_fire_lance_s_mk2: 'Fire Lance S',
  mod_grip_bumper_s_mk2: 'Grip Bumper S',
  mod_cloak_mk1: 'Shroud Cloak',
  mod_cloak_mk2: 'Shroud Cloak',
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** Mk I / Mk II / Mk III for a numeric tier. Unknown tiers read as Mk I — never a bare digit. */
export function tierWordFor(tier) {
  const n = Math.round(finite(tier, 1));
  return TIER_WORDS[n] || (n <= 2 ? 'Mk I' : (n === 3 ? 'Mk II' : 'Mk III'));
}

/** The authored tier: modules/weapons use `tier`, ordnance uses `unlockTier`. */
export function tierNumberFor(def) {
  if (!def) return 1;
  return Math.round(finite(def.tier != null ? def.tier : def.unlockTier, 1));
}

function modsOf(def) {
  return (def && def.mods) || {};
}

function hasPositive(mods, key) {
  return finite(mods[key], 0) > 0;
}

/** A multiplier at 1 is the yard stock value: it changes nothing and must not name a role. */
function changesMultiplier(mods, key) {
  return mods[key] != null && finite(mods[key], 1) !== 1;
}

/**
 * The attack-rig family is authored in `attackTraits.js`, not under module `mods`, so the generic
 * modifier ladder below cannot see it. One shared taxonomy names what each rig does; every rig is
 * bought to put damage on something, so its intent is Fight.
 */
const ATTACK_TRAIT_ROLES = Object.freeze({
  mod_twin_mount: 'Mount rig',
  mod_triad_mount: 'Mount rig',
  mod_piercing_core: 'Piercing rig',
  mod_forked_core: 'Forked rig',
  mod_bank_shot: 'Bank rig',
  mod_smart_bank: 'Smart bank',
  mod_ion_payload: 'Warhead core',
  mod_incendiary_payload: 'Warhead core',
  mod_gravity_tag: 'Warhead core',
  mod_relay_arc: 'Relay rig',
  mod_bank_relay: 'Bank relay',
  mod_tether_capacitor: 'Tether amp',
  mod_conductive_path: 'Conductive path',
  mod_cryo_payload: 'Warhead core',
  mod_cryo_gyros: 'Cryo rig',
  mod_herald_fan: 'Spread rig',
  mod_storm_carom: 'Storm rig',
});

function attackTraitFor(def) {
  return def && ATTACK_TRAIT_BY_ID[def.id] ? ATTACK_TRAIT_BY_ID[def.id] : null;
}

/** The line-head / massline-head family reads as one authored role, not a generic utility. */
function lineRoleFor(mods) {
  if (mods.masslineHeadId === 'tractor' || hasPositive(mods, 'magnetRange') || mods.tractorWholeWrecks) return 'Tractor';
  if (mods.masslineHeadId === 'elastic_whip') return 'Snap line';
  if (mods.masslineHeadId === 'frame_coupler') return 'Hitch line';
  if (mods.masslineHeadId === 'monofilament_sweep') return 'Cutter line';
  if (mods.masslineHeadId === 'transverse_snare') return 'Snare line';
  if (mods.masslineHeadId === 'twin_bridle') return 'Twin bridle';
  if (mods.lineHeadId) return 'Line head';
  if (finite(mods.tetherSpoolMult, 1) > 1) return 'Long spool';
  if (finite(mods.tetherReelRateMult, 1) > 1) return 'Fast reel';
  if (mods.towFlail) return 'Mass flail';
  if (mods.resonantMassline) return 'Resonant line';
  return null;
}

/**
 * What the part is, in one or two words. Authored modifiers are read first, then the slot's own
 * family, then the item's own name for the handful of fittings whose identity is not a stat.
 */
export function roleForPart(def, kind) {
  if (!def) return '';
  const mods = modsOf(def);
  if (kind === 'weapon') {
    if (def.emergentPrimitive) {
      if (def.dmg > 0) return 'Special mount';
      return 'Tool mount';
    }
    if (def.continuous) return 'Beam weapon';
    if (def.tracking === 'homing') return 'Guided weapon';
    if (def.tracking === 'auto_turret') return 'Turret';
    if (finite(def.dmg, 0) <= 0) return 'Tool mount';
    return `Gun · ${String(def.size || 'S').toUpperCase()}`;
  }
  if (kind === 'bomb') {
    const id = String(def.id || '');
    if (/goo|tar/.test(id)) return 'Tar bomb';
    if (/anchor|ballast/.test(id)) return 'Ballast bomb';
    if (/emp|static|scrambler|havoc/.test(id)) return 'Disabler';
    if (/concussion|shove/.test(id)) return 'Shove bomb';
    if (/singularity|gravity/.test(id)) return 'Gravity bomb';
    return 'Damage bomb';
  }
  const attackTrait = attackTraitFor(def);
  if (attackTrait) return ATTACK_TRAIT_ROLES[def.id] || `Attack ${attackTrait.family}`;
  const lineRole = lineRoleFor(mods);
  if (lineRole) return lineRole;
  if (finite(mods.droneBay, 0) > 0 || mods.repairDockedDrones) return 'Drone bay';
  if (mods.jumpDriveTier) return 'Jump drive';
  if (hasPositive(mods, 'hullRepairOOC')) return 'Repair rig';
  if (hasPositive(mods, 'hiddenCargoPct')) return 'Hidden hold';
  if (hasPositive(mods, 'scannerCloak') || mods.cloakBaseRadius) return 'Cloak';
  if (mods.pointDefense) return 'Point defence';
  if (hasPositive(mods, 'damageReductionPct') || hasPositive(mods, 'hullFlat') || mods.hullPurgeRing) return 'Armour';
  if (hasPositive(mods, 'weaponRangePct')) return 'Range finder';
  if (hasPositive(mods, 'weaponDmgPct') || mods.piercingCore || mods.forkedCore || mods.bankShot || mods.smartBank
    || mods.ionPayload || mods.incendiaryPayload || mods.gravityTag || mods.relayArc || mods.bankRelay
    || mods.conductivePath || mods.cryoPayload || mods.cryoGyros || mods.heraldFan || mods.stormCarom) return 'Warhead core';
  if (hasPositive(mods, 'radarRangePct') || hasPositive(mods, 'scanRangeMult') || hasPositive(mods, 'scannerRadiusMult')
    || hasPositive(mods, 'revealCargo') || hasPositive(mods, 'bioScanTier') || mods.hostMapReveal
    || mods.marketIntel || hasPositive(mods, 'scanRpBonus') || mods.echoRecorder || mods.triangulation) return 'Sensor';
  if (hasPositive(mods, 'cargoFlat') || hasPositive(mods, 'cargoCapPct')) return 'Cargo pod';
  if (hasPositive(mods, 'shieldFlat') || hasPositive(mods, 'shieldRegenFlat')) return 'Shield booster';
  if (hasPositive(mods, 'weaponHeatDissipPct')) return 'Heat sink';
  if (hasPositive(mods, 'boostTopSpeedPct') || mods.boostDurS) return 'Afterburner';
  // An engine is a Drive first. Most engines author `turnMult: 1` (the stock value); treating that
  // as a positive manoeuvre multiplier named every engine "Manoeuvre kit" and hid the Drive family.
  if (def.slotType === 'engine') return 'Drive';
  if (changesMultiplier(mods, 'turnMult') || changesMultiplier(mods, 'strafeMult')
    || changesMultiplier(mods, 'brakeMult') || mods.heroManeuver) return 'Manoeuvre kit';
  if (hasPositive(mods, 'topSpeed') || hasPositive(mods, 'accelMult') || hasPositive(mods, 'travelCeilingMult')) return 'Drive tune';
  if (hasPositive(mods, 'loadCapacityMult') || hasPositive(mods, 'pylonPairs') || hasPositive(mods, 'impulseChargeCapacity')
    || mods.bombPropulsion) return 'Ordnance rack';
  if (hasPositive(mods, 'pullCollector') || hasPositive(mods, 'lootMagnetRange')) return 'Collector';
  if (hasPositive(mods, 'bioFilterMult') || mods.stealthBioMult || mods.quarantineLocker) return 'Bio filter';
  if (mods.coherenceMeter || mods.filamentContrast || mods.containmentSeal || mods.precursorHandshake
    || mods.latticeCoupler || mods.quietEquation) return 'Survey kit';
  if (mods.captureSurvivalMult) return 'Capture cradle';
  if (mods.relayNeedle || mods.heatLure) return 'Beacon';
  if (mods.repulsionTrap) return 'Repulsor trap';
  if (mods.swingDrive) return 'Swing drive';
  if (mods.phaseBlink) return 'Blink drive';
  if (mods.countermeasure) return 'Countermeasure';
  if (hasPositive(mods, 'ramDamageDealtMult')) return 'Ram plate';
  if (mods.hullBurst) return 'Hull burst';
  if (hasPositive(mods, 'richCoreRingPctBonus')) return 'Drill amp';
  if (mods.anomalyPingReduction || mods.pingPersistMult || mods.overusePingThreshold) return 'Survey kit';
  if (mods.starterSafe) return 'Starter kit';
  switch (def.slotType) {
    case 'engine': return 'Drive';
    case 'thruster': return 'Thrusters';
    case 'shield': return 'Shield';
    case 'cargo': return 'Hold';
    case 'mining': return 'Mining tool';
    case 'weapon': return 'Weapon';
    default: break;
  }
  // The remainder carry their identity in the authored name (claw anchor, twin mount, proof kit).
  const name = String(def.name || '');
  if (/anchor|claw/i.test(name)) return 'Anchor';
  if (/twin mount|triad mount|multi.?mount/i.test(name)) return 'Mount rig';
  if (/proof|evidence|recorder/i.test(name)) return 'Evidence kit';
  if (/intrusion|mask/i.test(name)) return 'Intrusion rig';
  if (/quarantine|seal/i.test(name)) return 'Seal kit';
  if (/cartograph|survey|cartography|spectral/i.test(name)) return 'Survey kit';
  if (/lure|decoy/i.test(name)) return 'Decoy beacon';
  if (/patch|purge/i.test(name)) return 'Repair rig';
  if (/afterburner|splitburner/i.test(name)) return 'Afterburner';
  if (/payload/i.test(name)) return 'Warhead core';
  if (/charge/i.test(name)) return 'Ordnance rack';
  if (/cloak/i.test(name)) return 'Cloak';
  if (/magnet/i.test(name)) return 'Collector';
  return 'Utility';
}

/** What you were looking for when you went to find this part. */
export function intentForPart(def, kind) {
  if (!def) return 'work';
  const mods = modsOf(def);
  if (kind === 'weapon') {
    if (finite(def.dmg, 0) <= 0 || def.utilityVerb) return 'work';
    return 'fight';
  }
  if (kind === 'bomb') {
    // Tar and ballast are area-control weapons, not stealth gear; only the EMP/Havoc family is a
    // sneak tool. A bomb you buy to change a fight belongs under Fight.
    if (/emp|static|scrambler|havoc/.test(String(def.id || ''))) return 'sneak';
    return 'fight';
  }
  // The attack-rig family changes what a hit does; that is Fight work even though it bolts into a
  // utility slot. Its own role map above says which part of the hit it changes.
  if (attackTraitFor(def)) return 'fight';
  // Jumping is travel: Move, not the utility slot's default Work. A heat sink exists to keep guns
  // firing; it is Fight support, not a work tool.
  if (mods.jumpDriveTier) return 'move';
  if (hasPositive(mods, 'weaponHeatDissipPct')) return 'fight';
  // Towing and line work is a job, not cargo: the Line is how you move someone else's hull.
  if (mods.lineHeadId || mods.masslineHeadId || hasPositive(mods, 'magnetRange') || hasPositive(mods, 'tetherSpoolMult')
    || hasPositive(mods, 'tetherReelRateMult') || mods.towFlail || mods.resonantMassline
    || mods.tractorWholeWrecks) return 'work';
  if (hasPositive(mods, 'damageReductionPct') || hasPositive(mods, 'shieldFlat') || hasPositive(mods, 'shieldRegenFlat')
    || hasPositive(mods, 'hullFlat') || hasPositive(mods, 'hullRepairOOC') || mods.hullBurst
    || mods.hullPurgeRing || mods.pointDefense || hasPositive(mods, 'bioFilterMult')
    || mods.quarantineLocker) return 'survive';
  if (hasPositive(mods, 'scannerCloak') || mods.countermeasure || hasPositive(mods, 'hiddenCargoPct')
    || mods.stealthBioMult || mods.heatLure || mods.relayNeedle || mods.cloakBaseRadius) return 'sneak';
  if (mods.swingDrive || mods.phaseBlink || hasPositive(mods, 'ramDamageDealtMult') || hasPositive(mods, 'boostTopSpeedPct')
    || hasPositive(mods, 'turnMult') || hasPositive(mods, 'strafeMult') || hasPositive(mods, 'brakeMult')
    || mods.heroManeuver) return 'move';
  if (hasPositive(mods, 'cargoFlat') || hasPositive(mods, 'cargoCapPct') || hasPositive(mods, 'pullCollector')
    || hasPositive(mods, 'lootMagnetRange') || hasPositive(mods, 'droneBay')) return 'carry';
  if (mods.piercingCore || mods.forkedCore || mods.bankShot || mods.smartBank || mods.ionPayload
    || mods.incendiaryPayload || mods.gravityTag || mods.relayArc || mods.bankRelay || mods.conductivePath
    || mods.cryoPayload || mods.cryoGyros || mods.heraldFan || mods.stormCarom || hasPositive(mods, 'weaponDmgPct')
    || hasPositive(mods, 'loadCapacityMult') || hasPositive(mods, 'impulseChargeCapacity') || hasPositive(mods, 'pylonPairs')
    || mods.pointDefense) return 'fight';
  const slotDefault = SLOT_DEFAULT_INTENT[def.slotType] || 'work';
  return slotDefault;
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
  if (mods.lineHeadId || mods.masslineHeadId) return 'Changes what the Line does when it takes hold.';
  if (hasPositive(mods, 'damageReductionPct') || hasPositive(mods, 'hullFlat')) return 'Takes the edge off every hit that lands on the hull.';
  if (hasPositive(mods, 'shieldFlat') || hasPositive(mods, 'shieldRegenFlat')) return 'Adds shield that keeps coming back while you fly.';
  if (hasPositive(mods, 'weaponHeatDissipPct')) return 'The guns shed heat faster, so a burst lasts longer.';
  if (hasPositive(mods, 'cargoFlat') || hasPositive(mods, 'cargoCapPct')) return 'Changes what the hold can carry.';
  if (hasPositive(mods, 'boostTopSpeedPct')) return 'One long burn, then a wait before the next.';
  if (hasPositive(mods, 'turnMult') || hasPositive(mods, 'strafeMult') || hasPositive(mods, 'brakeMult')) return 'Changes how the hull turns, slides and stops.';
  if (hasPositive(mods, 'topSpeed') || hasPositive(mods, 'accelMult')) return 'Changes how hard you push and how fast you can run.';
  if (hasPositive(mods, 'scannerCloak')) return 'Hides you from the instruments that would find you.';
  if (mods.pointDefense) return 'Shoots down what gets too close.';
  if (role === 'Anchor') return 'Holds the hull against a shove, a tow or a current.';
  if (role === 'Mount rig') return 'Carries more than one gun on the same hardpoint.';
  if (role === 'Warhead core') return 'Changes what a hit leaves behind.';
  if (role === 'Survey kit') return 'Finds what the ordinary instruments miss.';
  if (role === 'Evidence kit') return 'Records what happened, and who did it.';
  if (role === 'Intrusion rig') return 'Gets you in without announcing the door.';
  if (role === 'Seal kit') return 'Keeps the bad air, the spores or the law out.';
  if (role === 'Decoy beacon') return 'Puts a false reading where you are not.';
  if (role === 'Repair rig') return 'Puts the hull back together while you are out of the fight.';
  if (role === 'Ordnance rack') return 'Carries more of what you throw, or throws it further.';
  if (role === 'Collector') return 'Pulls what you fly past into the hold.';
  if (role === 'Afterburner') return 'One long burn, then a wait before the next.';
  if (role === 'Manoeuvre kit') return 'Changes how the hull answers the stick.';
  if (role === 'Drive tune') return 'Changes how hard you push and how fast you can run.';
  if (role === 'Sensor') return 'Lets you see further than the other hull can.';
  if (role === 'Drill amp') return 'Cuts the rich seam, not just the rock around it.';
  if (def.slotType === 'engine') return 'Changes how hard you push and how fast you can run.';
  if (def.slotType === 'thruster') return 'Changes how the hull turns, slides and stops.';
  if (finite(def.mass, 0) > 0) return `You carry its ${Math.round(finite(def.mass, 0))} tonnes, and that is what the ship feels.`;
  return `${role}. It does not change how the ship flies.`;
}

/**
 * Everything a surface needs to explain one part.
 *
 * @param {string} id
 * @returns {null | Readonly<{id, name, kind, role, sentence, tier, tierNumber, intent, intentLabel, previewId, previewState}>}
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
  const tierNumber = tierNumberFor(def);
  const previewId = PART_PREVIEW_MANIFEST[def.id] || null;
  return Object.freeze({
    id: def.id,
    name: PART_DISPLAY_NAMES[def.id] || def.name || def.id,
    kind,
    role: roleForPart(def, kind),
    sentence: sentenceForPart(def, kind),
    tierNumber,
    tier: tierWordFor(tierNumber),
    intent: intent.id,
    intentLabel: intent.label,
    previewId,
    previewState: previewId ? 'ready' : 'not-built',
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
 * The catalogue's own ordering for one selected list: what you want to DO first, then the ladder
 * (Mk I before Mk III), then name. A part with no intent sorts last rather than disappearing.
 * This does NOT order across slot types; the chooser passes one slot's compatible list.
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

/** Sort ids into the catalogue's order for one selected list (intent, then tier, then name). */
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

/** True when this part's intent is not the one its slot would imply. */
export function intentDiffersFromSlot(id) {
  const facts = partFacts(id);
  if (!facts) return false;
  const def = WEAPON_BY_ID.get(id) || MODULE_BY_ID.get(id) || BOMB_BY_ID.get(id);
  if (!def) return false;
  return facts.intent !== (SLOT_DEFAULT_INTENT[def.slotType] || 'work');
}

/**
 * A canonical signature over the authored fit facts and modifiers. Two parts with the same
 * signature really do the same thing to the sim AND cost the same slot; role + intent + tier does
 * NOT prove that (a claw anchor and a cargo scanner are both Utility/Work/Mk I). Size, mass, draw
 * and tier are part of the identity: a Swing Drive M and a Swing Drive S share their one modifier
 * but are not interchangeable fittings. Used by the duplicate probe, never to merge automatically.
 */
export function partSignature(id) {
  const def = WEAPON_BY_ID.get(id) || MODULE_BY_ID.get(id) || BOMB_BY_ID.get(id);
  if (!def) return null;
  const mods = modsOf(def);
  const keys = Object.keys(mods).sort();
  const body = keys.map((key) => {
    const value = mods[key];
    if (value && typeof value === 'object') return `${key}:${JSON.stringify(value)}`;
    return `${key}:${String(value)}`;
  }).join('|');
  const fitting = `size:${def.size || ''}|mass:${finite(def.mass, 0)}`
    + `|draw:${finite(def.energyDraw, 0)}|tier:${tierNumberFor(def)}`;
  // Weapons and ordnance carry their authored behaviour on the definition, not under `mods`; an
  // empty `mods` object would otherwise collapse every gun into one bogus "duplicate" group.
  if (def.slotType === 'weapon') {
    return `weapon|${fitting}|${finite(def.dmg, 0)}|${finite(def.rof, 0)}|${def.continuous ? 1 : 0}`
      + `|${def.tracking || 'fixed'}|${finite(def.range, 0)}|${finite(def.energyCost, 0)}`
      + `|${def.mount || ''}|${def.emergentPrimitive || ''}|${body}`;
  }
  if (BOMB_BY_ID.get(id) === def) {
    return `bomb|${fitting}|${finite(def.price, 0)}|${finite(def.magazine, 0)}|${finite(def.fuzeS, 0)}`
      + `|${finite(def.cooldownS, 0)}|${body}`;
  }
  // A module with no authored modifiers still has an authored slot, mass, draw and tier. It is
  // only grouped when those too match, and a no-mod part whose identity lives in a name or an
  // attack-trait record is never claimed as another part's duplicate.
  const trait = attackTraitFor(def);
  if (trait) return `${def.slotType || 'module'}|${fitting}|trait:${trait.id}`;
  return `${def.slotType || 'module'}|${fitting}|${body || `no-authored-mods|${def.id}`}`;
}

/** Group ids by their exact authored modifier signature. Groups are ordered by size, then key. */
export function duplicateGroups(ids = []) {
  const groups = new Map();
  for (const id of ids) {
    const signature = partSignature(id);
    if (!signature) continue;
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(id);
  }
  return [...groups.entries()]
    .map(([signature, members]) => Object.freeze({ signature, ids: Object.freeze(members.slice()) }))
    .sort((a, b) => b.ids.length - a.ids.length || a.signature.localeCompare(b.signature));
}

export { arsenalIdentity };
