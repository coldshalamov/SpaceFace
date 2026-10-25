// One presentation projection for the player's arsenal (combat-convergence packet 01).
//
// Every surface that names a power, support verb or fitted weapon — the flight rail, its tips, the
// Help sheet, the armory — asks THIS module what the verb is RIGHT NOW. It extends the identity
// table (arsenalIdentity.js: stable id → glyph + sentence); it does not fork it, and it is not a
// rules engine: every number is read from the owner that defines it (field defs, the mass seed,
// the Gyre's tuning, the bomb catalogue, the cloak module's own `mods`) and every entry records WHICH
// owner supplied each value in `sources`, so a reviewer can follow any figure to its writer.
//
// What it does decide is the EFFECTIVE verb: the one thing a button will do on the next press, from
// the authoritative state — the rig that is a cone here and a scoop in a planet band, the bomb that
// throws a sticky charge, calls in a swarm charge or drops a drift bomb, the Shove that will also
// set off N armed explosives. The input layer composes those decisions from the same helpers
// (powerVerbs.js) and `test/arsenal-presentation-*.test.mjs` drives the real input owner to prove
// the projection and the press agree.
//
// Pure reads: no bus, no DOM, no writes to `state`. Cached on the fitting / mode / binding
// signature (`createArsenalPresentation`); readiness is live and recomputed on every read.
import { arsenalIdentity, arsenalSentence } from './arsenalIdentity.js';
import { FIELD_DEFS, FIELD_ESCAPES } from './fields.js';
import { GRAVITY_MARK_FIELD_COUPLING } from './combatDefs.js';
import { MASS_SEED_DEF } from './massSeed.js';
import { GYRE_SNARE } from './gyreSnare.js';
import { BOMB_DEFS, BOMB_DRIFT, bombDef } from './bombs.js';
import { IMPULSE_CHARGES } from './impulseCharges.js';
import { WEAPONS } from './weapons.js';
import { MODULES } from './modules.js';
import { PLANET_REGION_RANK } from './planets.js';
import { massline2Flag } from './featureFlags.js';
import { swarmCallinById, swarmCallinCount } from './swarmDraft.js';
import { ATTACK_TRAIT_BY_ID } from './attackTraits.js';
import {
  bombUsesCharge, playerImpulseCharges, resolveRigTarget, swarmBombSelection, powersFireOnPress,
} from '../systems/powerVerbs.js';
import { cloakTimeS, fittedCloakModule } from '../systems/cloak.js';
import { resolveImpulseChargeCapacity } from '../systems/impulseCharges.js';
import { resolveActionCodes, formatBindingCode } from '../systems/input.js';
import { collectAttackModifiers } from '../systems/adventureMigration.js';
import { compileAttackSpec, describeAttackMetrics } from '../combat/attackSpec.js';
import { indexedTypeScan } from '../world/livingWorldViews.js';
import { arsenalGlyphSource } from '../ui/orrery/arsenalGlyphs.js';

/** Rail / number-row order of the verbs this projection speaks for. */
export const ARSENAL_VERB_ORDER = Object.freeze(['travel', 'pull', 'shove', 'pin', 'bomb', 'rig', 'line', 'gyre', 'cloak']);

/** The binding-table actions each verb is driven by (the rail's `RAIL_SLOTS.action`, plus the supports). */
export const ARSENAL_VERB_ACTIONS = Object.freeze({
  travel: 'travelBurn', pull: 'pull', shove: 'shove', pin: 'pin', bomb: 'bomb', rig: 'rig',
  line: 'tether', gyre: 'gyreSnare', cloak: 'cloak',
});

/** Every action whose binding the projection reads (also the bindings table a caller may pre-resolve). */
export const ARSENAL_BINDING_ACTIONS = Object.freeze([...Object.values(ARSENAL_VERB_ACTIONS), 'cycleBomb', 'fire']);

// The power verbs whose own number-row digit is preferred as the displayed key (rail convention).
const OWN_DIGIT = Object.freeze({ pull: 'Digit1', shove: 'Digit2', pin: 'Digit3', bomb: 'Digit4', rig: 'Digit5' });
const LOCK_KEYS = new Set(['NumLock', 'CapsLock', 'ScrollLock']);

const finite = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const sec = (n) => `${Math.round(n * 10) / 10}s`;
const wu = (n) => `${Math.round(n)} wu`;
const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);
const simNow = (state) => (Number.isFinite(state && state.simTime) ? state.simTime : finite(state && state.tick) / 60);

// ── bindings ────────────────────────────────────────────────────────────────────────────────────

/**
 * Resolve every action the projection reads from the remappable binding owner (input.js's table,
 * which already merges legacy saved aliases such as `deployWell` → `pull`, and keeps an action the
 * pilot deliberately unbound as an empty list). Returns `{ [action]: codes[] }`.
 */
export function readArsenalBindings(state) {
  const out = {};
  for (const action of ARSENAL_BINDING_ACTIONS) out[action] = resolveActionCodes(state || {}, action).slice();
  return out;
}

function bindingFor(bindings, action, ownDigit) {
  const raw = bindings && bindings[action];
  const codes = Array.isArray(raw) ? raw.filter(Boolean) : (raw ? [raw] : []);
  if (!codes.length) {
    // `fire` with no keyboard code is the left mouse button (mouse buttons are not remappable).
    return action === 'fire'
      ? { action, codes, label: 'LMB', all: ['LMB'], bound: true }
      : { action, codes, label: '', all: [], bound: false };
  }
  const preferred = (ownDigit && codes.includes(ownDigit) ? ownDigit : null)
    || codes.find((c) => !LOCK_KEYS.has(c)) || codes[0];
  const all = Array.from(new Set(codes.map((c) => formatBindingCode(c)).filter(Boolean)));
  return { action, codes, label: formatBindingCode(preferred), all, bound: true };
}

const keyText = (b) => (b.bound ? b.all.join(' / ') : 'unbound');

// ── armed explosives (what a Shove press will set off) ──────────────────────────────────────────

/**
 * Count the explosives a Shove press will detonate, by the owners' own predicates:
 * armed sticky impulse charges (impulseCharges `_handleDetonate`), armed drift bombs
 * (bombs `commandDetonate`: phase 'drift', not retired, past its arming time) and planted
 * sticky-detonator charges (emergentPrimitives `detonateStickies`).
 */
export function armedOrdnanceCounts(state, nowS = simNow(state)) {
  const owner = state && state.playerId;
  let charges = 0;
  for (const e of indexedTypeScan(state, 'charges')) {
    if (e && e.alive && e.type === 'charge' && e.data && e.data.ownerId === owner && e.data.armed) charges += 1;
  }
  let bombs = 0;
  const index = state && state.entityIndex;
  const source = index && index.__spacefaceEntityIndexV1 && index.ready === true && Array.isArray(index.bombs)
    ? index.bombs : ((state && state.entityList) || []);
  for (const e of source) {
    if (!e || !e.alive || e.type !== 'bomb' || !e.data) continue;
    if (e.data.ownerId === owner && e.data.phase === 'drift' && !e.data.retired && nowS >= e.data.armedAt) bombs += 1;
  }
  let plants = 0;
  const stickies = state && state.emergent && state.emergent.stickies;
  if (Array.isArray(stickies)) for (const s of stickies) if (s && s.armed && s.ownerId === owner) plants += 1;
  return { charges, bombs, plants, total: charges + bombs + plants };
}

function detonationText(counts) {
  const parts = [];
  if (counts.charges) parts.push(`${counts.charges} ${plural(counts.charges, 'charge')}`);
  if (counts.bombs) parts.push(`${counts.bombs} drift ${plural(counts.bombs, 'bomb')}`);
  if (counts.plants) parts.push(`${counts.plants} planted ${plural(counts.plants, 'charge')}`);
  return parts.join(' + ');
}

// ── the effective BOMB action ───────────────────────────────────────────────────────────────────

/**
 * What the Bomb key does on the NEXT press — the same precedence input.js uses: the sticky charge
 * while one is aboard (unless a bay bomb was explicitly chosen), then a stocked swarm call-in,
 * then the chosen drift bomb. `action` is 'throw' | 'callin' | 'drop' | 'empty'.
 */
export function resolveBombAction(state) {
  const charges = playerImpulseCharges(state);
  if (bombUsesCharge(state)) {
    return { action: 'throw', kind: 'charge', id: 'power_charge', name: 'Impulse charge', short: 'Charge', stock: charges,
      capacity: resolveImpulseChargeCapacity(state), owner: 'cargo.items.cmdty_impulse_charge' };
  }
  const callin = swarmBombSelection(state);
  if (callin) {
    const row = swarmCallinById(callin);
    return { action: 'callin', kind: callin, id: `callin_${callin}`, name: row ? row.name : callin, short: row ? row.name : callin,
      stock: swarmCallinCount(state && state.run, callin), capacity: null, owner: 'run.modifiers swarm_callin' };
  }
  const bays = state && state.bombs ? state.bombs : {};
  const cells = bays.rack && Array.isArray(bays.rack.cells) ? bays.rack.cells : null;
  const loaded = cells ? cells.filter((c) => c && c.count > 0) : null;
  const cell = loaded ? (loaded.find((c) => c.id === bays.selectedId) || loaded[0]) : null;
  const id = cell ? cell.id : (cells ? null : bays.selectedId);
  const def = id && BOMB_DEFS[id] ? BOMB_DEFS[id] : (cells ? null : bombDef(bays.selectedId));
  if (!def) return { action: 'empty', kind: 'none', id: '', name: 'Bomb rack', short: 'Rack', stock: 0, capacity: null, owner: 'bombs.rack' };
  return { action: 'drop', kind: 'bay', id: def.id, name: def.name, short: payloadShortName(def), stock: cell ? cell.count : null,
    capacity: def.magazine || null, owner: 'bombs.rack.cells' };
}

/** A payload's short label: the catalogue's `shortName`, except two retired payloads whose short name is a power's name. */
function payloadShortName(def) {
  return def.shortName === 'Pull' || def.shortName === 'Shove' ? def.name : def.shortName;
}

// ── gyre / cloak live reads ─────────────────────────────────────────────────────────────────────

function gyreRead(state) {
  const g = (state && state.gyreSnare) || {};
  const phase = typeof g.phase === 'string' ? g.phase : 'off';
  return {
    phase,
    holding: phase === 'holding',
    gathering: phase === 'beaming',
    launching: phase === 'launching',
    ballAway: finite(g.liveBalls) > 0,
    full: g.full === true,
    tooHeavy: finite(g.tooHeavyCount),
    towing: finite(g.towCount),
    refusal: g.refusal || null,
  };
}

/** The cloak's live state from its own runtime and module. `unavailable` | `ready` | `active` | `revealed` | `depleted`. */
export function readCloakState(state) {
  const rt = state && state.massline2 && state.massline2.cloak;
  const flagOn = massline2Flag('cloak', state && state.runtime && state.runtime.features);
  const mod = fittedCloakModule(state);
  if (!mod) return { state: 'unavailable', reason: 'No cloak fitted', module: null, flagOn, rt };
  if (!flagOn) return { state: 'unavailable', reason: 'Cloak is off in this mode', module: mod, flagOn, rt };
  const energy = finite(rt && rt.energy, 1);
  if (rt && rt.active === true) {
    const burned = Number.isFinite(rt.revealUntil) && cloakTimeS(state) < rt.revealUntil;
    return burned
      ? { state: 'revealed', reason: 'A scanner pulse burned the cloak open', module: mod, flagOn, rt }
      : { state: 'active', reason: 'Hidden to anything outside your signature ring', module: mod, flagOn, rt };
  }
  if (energy < 0.12) return { state: 'depleted', reason: 'Cloak charge too low — it is recharging', module: mod, flagOn, rt };
  return { state: 'ready', reason: 'Ready', module: mod, flagOn, rt };
}

// ── per-verb static records (cached) ────────────────────────────────────────────────────────────

function pullRecord() {
  const well = FIELD_DEFS.well;
  return {
    name: 'Pull', verb: 'Well', role: 'Gather', glyph: 'field_well_standard',
    sentence: `Place a gravity well at your aim point, up to ${wu(well.deployRange)} out. Light bodies, loose rocks and shots gather inside the ring; a locked hostile or object in the ring grips ${GRAVITY_MARK_FIELD_COUPLING}x as hard.`,
    limits: [`Lasts ${sec(well.durationS)}, recharges in ${sec(well.cooldownS)}. Heavy hulls shrug it off. ${FIELD_ESCAPES.well.sentence}`],
    target: 'aim point',
    range: { shape: 'ring', radiusWu: well.radius, reachWu: well.deployRange },
    cost: null, cooldownS: well.cooldownS,
    combos: ['Pull piles loose rocks together, then Gyre scoops the pile into one ball you can throw.'],
    sources: { range: 'data/fields.FIELD_DEFS.well', cooldown: 'data/fields.FIELD_DEFS.well.cooldownS',
      grip: 'data/combatDefs.GRAVITY_MARK_FIELD_COUPLING', sentence: 'data/fields.FIELD_DEFS.well' },
  };
}

function shoveRecord() {
  const rep = FIELD_DEFS.repulsor;
  return {
    name: 'Shove', verb: 'Repulse + detonate', role: 'Clear', glyph: 'field_repulsor_standard',
    sentence: `Push everything outward from your ship (${wu(rep.radius)} ring) and set off every armed charge and drift bomb you have out.`,
    limits: [`The ring recharges in ${sec(rep.cooldownS)}, but your armed explosives still go off while it does.`],
    target: 'your ship',
    range: { shape: 'ring', radiusWu: rep.radius, reachWu: 0 },
    cost: null, cooldownS: rep.cooldownS,
    combos: ['Throw a charge onto a body, then Shove sets it off to make the collision you want.'],
    sources: { range: 'data/fields.FIELD_DEFS.repulsor', cooldown: 'data/fields.FIELD_DEFS.repulsor.cooldownS',
      detonation: 'systems/impulseCharges + bombs.commandDetonate + emergentPrimitives.stickies' },
  };
}

function pinRecord() {
  const travel = MASS_SEED_DEF.travelSpeed * MASS_SEED_DEF.travelTimeS;
  return {
    name: 'Pin', verb: 'Anchor', role: 'Anchor', glyph: 'field_seed_standard',
    sentence: `Fire an anchor that locks in place about ${wu(travel)} out and holds for ${sec(MASS_SEED_DEF.anchorTtlS)}. Latch your Line to it to swing or haul; it does not hold or root enemies.`,
    limits: [`One anchor at a time. It recharges ${sec(MASS_SEED_DEF.cooldownS)} after the last one ends, and it can be shot down (${MASS_SEED_DEF.hull} hull).`],
    target: 'ahead of your nose',
    range: { shape: 'line', radiusWu: FIELD_DEFS.seed.radius, reachWu: travel },
    cost: null, cooldownS: MASS_SEED_DEF.cooldownS,
    combos: ['Pin an anchor, hitch your Line to it, then swing or release to throw yourself or a hauled body.'],
    sources: { range: 'data/massSeed.MASS_SEED_DEF', cooldown: 'data/massSeed.MASS_SEED_DEF.cooldownS',
      lifetime: 'data/massSeed.MASS_SEED_DEF.anchorTtlS' },
  };
}

function rigRecord(target, on) {
  const cone = FIELD_DEFS.cone;
  const skim = FIELD_DEFS.skim;
  if (target === 'skim') {
    return {
      name: 'Rig', verb: on ? 'Scoop on' : 'Scoop', role: 'Harvest', glyph: 'field_skim_standard',
      sentence: on
        ? 'The skim scoop is open. Press to close it.'
        : `You are in a planet band, so Rig opens the skim scoop (${wu(skim.radius)} sheet) and harvests by grazing. Open space has nothing to collect.`,
      limits: ['Outside a planet band this same key opens the clearing cone instead. Hitch heavy mass and the scoop shrugs.'],
      target: 'along your flight line',
      range: { shape: 'sheet', radiusWu: skim.radius, reachWu: skim.originGap },
      cost: null, cooldownS: 0,
      combos: [],
      sources: { range: 'data/fields.FIELD_DEFS.skim', target: 'systems/powerVerbs.resolveRigTarget',
        band: `data/planets.PLANET_REGION_RANK.skim=${PLANET_REGION_RANK.skim}` },
      other: 'cone',
    };
  }
  return {
    name: 'Rig', verb: on ? 'Cone on' : 'Cone', role: 'Clear', glyph: 'field_cone_standard',
    sentence: on
      ? 'The clearing cone is open. Press to fold it.'
      : `Open a forward plow (${wu(cone.radius)}, ${Math.round(cone.halfAngleRad * 2 * 180 / Math.PI)} degree wedge) that sweeps loose bodies into each other. Press again to fold it.`,
    limits: ['In a planet band this same key opens the skim scoop instead. Strafe out of the wedge to escape it.'],
    target: 'ahead of your nose',
    range: { shape: 'wedge', radiusWu: cone.radius, reachWu: cone.originGap },
    cost: null, cooldownS: 0,
    combos: ['Sweep a lane with the cone so loose rocks bunch up, then Pull or Gyre collects them.'],
    sources: { range: 'data/fields.FIELD_DEFS.cone', target: 'systems/powerVerbs.resolveRigTarget' },
    other: 'skim',
  };
}

function bombRecord(act) {
  if (act.action === 'throw') {
    const c = IMPULSE_CHARGES.charge_standard;
    return {
      name: 'Bomb', verb: 'Throw charge', role: 'Detonate', glyph: 'power_charge',
      sentence: `Throws a sticky impulse charge that sticks where it lands (${wu(c.radius)} blast). Shove sets it off, so the shove lands where you choose.`,
      limits: [`Up to ${act.capacity} deployed at once; a new throw needs ${sec(c.armTimeS)} between lobs. Cycle the ordnance to reach your drift bombs.`],
      target: 'your aim', range: { shape: 'ring', radiusWu: c.radius, reachWu: c.throwSpeed * 3 },
      cost: { kind: 'stock', unit: 'charge' }, cooldownS: c.armTimeS,
      combos: ['Throw a charge onto a body or rock, then Shove: the blast shoves it into the next thing.'],
      sources: { payload: 'data/impulseCharges.IMPULSE_CHARGES.charge_standard', stock: 'cargo.items.cmdty_impulse_charge',
        selection: 'systems/powerVerbs.bombUsesCharge' },
    };
  }
  if (act.action === 'callin') {
    const row = swarmCallinById(act.kind);
    return {
      name: 'Bomb', verb: act.kind === 'orbital_lance' ? 'Call in lance' : 'Call in smart bomb', role: 'Detonate',
      glyph: act.id, sentence: row ? row.blurb : 'A swarm call-in charge.',
      limits: ['A swarm call-in spends one charge from this run. With none left, Bomb falls back to your drift bomb.'],
      target: 'your aim', range: null, cost: { kind: 'stock', unit: 'call-in' }, cooldownS: 0,
      combos: [], sources: { payload: 'data/swarmDraft.SWARM_CALLIN_CATALOG', selection: 'systems/powerVerbs.swarmBombSelection' },
    };
  }
  if (act.action === 'drop') {
    const def = BOMB_DEFS[act.id];
    return {
      name: 'Bomb', verb: `Drop ${payloadShortName(def)}`, role: 'Detonate', glyph: def.id,
      sentence: `${arsenalSentence(def)} Drops behind you, arms after ${sec(BOMB_DRIFT.armS)}; proximity (${wu(def.triggerRadius)}) or a ${sec(def.fuzeS)} fuze sets it off.`,
      limits: [`${wu(def.radius)} blast, friendly fire applies. Shove sets off every armed drift bomb. At most ${BOMB_DRIFT.maxActive} out at once.`],
      target: 'behind your ship', range: { shape: 'ring', radiusWu: def.radius, reachWu: 0 },
      cost: { kind: 'stock', unit: 'bomb' }, cooldownS: def.cooldownS,
      combos: [], sources: { payload: `data/bombs.BOMB_DEFS.${def.id}`, stock: 'bombs.rack.cells', selection: 'bombs.selectedId' },
    };
  }
  return {
    name: 'Bomb', verb: 'Rack empty', role: 'Detonate', glyph: '',
    sentence: 'Your bomb rack is empty. Restock at a station shipworks; a charge in the hold is thrown instead.',
    limits: [], target: 'your aim', range: null, cost: { kind: 'stock', unit: 'bomb' }, cooldownS: 0, combos: [],
    sources: { stock: 'bombs.rack.cells' },
  };
}

function lineRecord() {
  return {
    name: 'Line', verb: 'Latch / cut', role: 'Haul', glyph: 'power_massline',
    sentence: arsenalSentence('power_massline'),
    limits: ['Tap to latch the body in reach, tap again to cut. Hold for line control.'],
    target: 'body in reach', range: null, cost: null, cooldownS: 0,
    combos: ['Latch a body, then Pin an anchor and swing, or let go to throw it.'],
    sources: { sentence: 'data/arsenalIdentity.power_massline' },
  };
}

function travelRecord() {
  return {
    name: 'Burn', verb: 'Latch', role: 'Cruise', glyph: 'power_travel_burn',
    sentence: arsenalSentence('power_travel_burn'), limits: [], target: 'your ship', range: null, cost: null, cooldownS: 0,
    combos: [], sources: { sentence: 'data/arsenalIdentity.power_travel_burn' },
  };
}

function gyreRecord() {
  const g = GYRE_SNARE;
  return {
    name: 'Gyre', verb: 'Gather', role: 'Gather', glyph: 'power_gyre',
    sentence: `Hold to gather loose rocks and wrecks (${wu(g.basinRadius)} basin, ${wu(g.mawDist)} ahead) into one growing ball. Release to throw it ahead at about ${Math.round(g.launchSpeed)} wu/s.`,
    limits: [`Needs ${g.capActivateMin} charge to start and drains it while held. Cargo, quest wrecks and anchored scenery are towed or skipped, never swallowed; bodies wider than ${wu(g.maxClumpRadius)} do not fit.`],
    target: 'ahead of your nose',
    range: { shape: 'basin', radiusWu: g.basinRadius, reachWu: g.mawDist },
    cost: { kind: 'energy', activate: g.capActivateMin, perSecond: g.capDrainPerS },
    cooldownS: 0,
    combos: ['Pull piles rocks together, Gyre scoops the pile into a ball, release to throw it through the pack.'],
    sources: { range: 'data/gyreSnare.GYRE_SNARE', cost: 'data/gyreSnare.GYRE_SNARE.capActivateMin/capDrainPerS',
      sentence: 'data/gyreSnare.GYRE_SNARE' },
  };
}

function cloakRecord(read) {
  const mod = read.module;
  const base = mod && mod.mods ? finite(mod.mods.cloakBaseRadius) : 0;
  return {
    name: 'Cloak', verb: 'Toggle', role: 'Conceal', glyph: mod ? mod.id : '',
    sentence: `Go dark: anything outside your signature ring${base ? ` (${wu(base)} at rest)` : ''} loses you. Thrust, boost and reeling widen the ring; coasting shrinks it.`,
    limits: ['Firing, a hull breach, a drive spool or dumping cargo drops it, and a scanner pulse burns it open. Concealment depends on distance and what you do, not on the cloak alone.'],
    target: 'your ship', range: base ? { shape: 'ring', radiusWu: base, reachWu: 0 } : null,
    cost: mod ? { kind: 'charge', drainPerS: finite(mod.mods.cloakDrainPerS), rechargePerS: finite(mod.mods.cloakRechargePerS) } : null,
    cooldownS: 0, combos: [],
    sources: { range: `data/modules.${mod ? mod.id : 'cloak module'}.mods.cloakBaseRadius`, state: 'state.massline2.cloak',
      flag: 'data/featureFlags.massline2.cloak' },
  };
}

// ── fitted weapons ──────────────────────────────────────────────────────────────────────────────

const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));
const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));

function fittedIds(state) {
  const p = state && state.player;
  const index = Number.isInteger(p && p.activeShipIndex) && p.activeShipIndex >= 0 ? p.activeShipIndex : 0;
  const ship = p && Array.isArray(p.ownedShips) ? p.ownedShips[index] : null;
  if (ship && Array.isArray(ship.fittings)) return ship.fittings;
  const e = state && state.entities && typeof state.entities.get === 'function' ? state.entities.get(state.playerId) : null;
  return Array.isArray(e && e.data && e.data.fittings) ? e.data.fittings : [];
}

/**
 * What the fitted modifiers actually change for one weapon, in plain mechanics, from the COMPILED
 * attack (the same compiler weapons.js fires with) — never the base weapon's sentence. A chain module
 * describes its hop rule; a bank module its bounces; a mount its extra shots.
 */
export function describeCompiledChanges(state, def) {
  const ship = { data: { fittings: fittedIds(state) } };
  const modifiers = collectAttackModifiers(state, ship, def);
  if (!modifiers.length) return [];
  const compiled = compileAttackSpec({ weapon: def, modifiers });
  if (!compiled || !compiled.spec) return [];
  const m = describeAttackMetrics(compiled.spec);
  const out = [];
  if (m.rootCount > 1) out.push(`Fires ${m.rootCount} shots at once${m.spreadDeg ? ` in a ${Math.round(m.spreadDeg)} degree fan` : ''}.`);
  if (m.pierce > 0) out.push(`Passes through ${m.pierce} extra ${plural(m.pierce, 'body', 'bodies')}.`);
  if (m.splitCount > 0) out.push(`Splits into ${m.splitCount} weaker shots on the first hit.`);
  if (m.bounces > 0) out.push(`Bounces off up to ${m.bounces} ${plural(m.bounces, 'surface')}.`);
  if (m.afterBounceSteer) out.push('After a bounce it steers toward the nearest hostile ahead of it.');
  if (m.chainCount > 0) {
    const chain = compiled.spec.propagation && compiled.spec.propagation.chain;
    const rule = chain && chain.requireBounce ? 'After a bounce, a hit' : 'A hit';
    out.push(`${rule} jumps to up to ${m.chainCount} more ${plural(m.chainCount, 'hull')} within ${wu(m.chainRange)}, never the same one twice.`);
  }
  for (const entry of compiled.spec.payload || []) {
    if (entry && entry.kind === 'status' && entry.statusId) out.push(`Hits leave the target ${String(entry.statusId).replace(/^status_/, '').replace(/_/g, ' ')}.`);
  }
  return out;
}

function weaponEntries(state, bindings) {
  const fire = bindingFor(bindings, 'fire');
  const out = [];
  for (const id of fittedIds(state)) {
    const def = WEAPON_BY_ID.get(id);
    if (!def) continue;
    out.push({
      id: `weapon:${id}`, kind: 'weapon', defId: id, name: def.name, verb: 'Fire', role: 'Weapon',
      glyph: id, glyphSource: arsenalGlyphSource(id),
      label: def.name, sentence: arsenalSentence(def), limits: [], combos: [],
      changes: describeCompiledChanges(state, def),
      binding: fire, target: 'your aim', range: def.range ? { shape: 'line', radiusWu: 0, reachWu: finite(def.range) } : null,
      cost: def.energyCost ? { kind: 'energy', perShot: finite(def.energyCost) } : null,
      cooldownS: def.rof ? 1 / finite(def.rof, 1) : 0,
      sources: { weapon: `data/weapons.${id}`, sentence: 'data/arsenalIdentity', changes: 'combat/attackSpec.compileAttackSpec',
        binding: 'systems/input.resolveActionCodes' },
    });
  }
  return out;
}

/** The weapons a ship fits, their modifiers' compiled results folded into one entry apiece. */
export function resolveFittedWeapons(state, bindings = readArsenalBindings(state)) {
  return weaponEntries(state, bindings);
}

// ── combination example ─────────────────────────────────────────────────────────────────────────

/**
 * The armory / Help example: Pull → Gyre → throw. Built from the SAME entries and live bindings, so
 * it cannot teach a key the pilot unbound, and it states a physical proposition, not a rotation.
 */
export function combinationExample(entries) {
  const pull = entries.pull;
  const gyre = entries.gyre;
  const key = (e) => (e && e.binding && e.binding.bound ? e.binding.label : 'unbound');
  const steps = [
    { id: 'pull', key: key(pull), text: `Pull (${key(pull)}) drops a well on a pile of loose rocks and they gather.` },
    { id: 'gyre', key: key(gyre), text: `Hold Gyre (${key(gyre)}) over the pile: it scoops the rocks into one growing ball.` },
    { id: 'throw', key: key(gyre), text: `Release Gyre to throw the ball through the pack. The collision does the damage.` },
  ];
  return {
    id: 'pull-gyre-throw',
    title: 'Pull, Gyre, throw',
    order: ['pull', 'gyre', 'throw'],
    steps,
    text: steps.map((s) => s.text).join(' '),
    note: 'Solve it any way the room allows: a Shove into a wall or a Line swing works too.',
    sources: { pull: 'arsenalPresentation.pull', gyre: 'arsenalPresentation.gyre' },
  };
}

// ── the live projection ─────────────────────────────────────────────────────────────────────────

function readyOf(state, id, ctx) {
  const { nowS, rail } = ctx;
  const railSlot = rail && ctx.railIndex ? rail[ctx.railIndex[id]] : null;
  if (railSlot && railSlot.state) {
    return { state: railSlot.state, reason: railSlot.why || '', cooldownMs: finite(railSlot.cooldownMs) };
  }
  if (id === 'gyre') {
    const g = gyreRead(state);
    const cap = finite(state && state.entities && state.entities.get && state.entities.get(state.playerId) && state.entities.get(state.playerId).cap, GYRE_SNARE.capActivateMin);
    if (g.holding) return { state: 'armed', reason: 'Holding a ball — release to throw it', cooldownMs: 0 };
    if (g.gathering) return { state: 'armed', reason: 'Gathering — keep holding, release to stop', cooldownMs: 0 };
    if (cap < GYRE_SNARE.capActivateMin) return { state: 'unaffordable', reason: `Needs ${GYRE_SNARE.capActivateMin} charge to start`, cooldownMs: 0 };
    return { state: 'ready', reason: 'Ready', cooldownMs: 0 };
  }
  if (id === 'cloak') {
    const c = readCloakState(state);
    const map = { unavailable: 'locked', ready: 'ready', active: 'armed', revealed: 'armed', depleted: 'unaffordable' };
    return { state: map[c.state] || 'ready', reason: c.reason, cooldownMs: 0 };
  }
  return { state: 'ready', reason: 'Ready', cooldownMs: 0, nowS };
}

function bindingSignature(bindings) {
  return ARSENAL_BINDING_ACTIONS.map((a) => `${a}=${(bindings && bindings[a] ? [].concat(bindings[a]) : []).join('+')}`).join(';');
}

function fitSignature(state) {
  return fittedIds(state).join(',');
}

function assemble(id, rec, binding) {
  const arsenalId = rec.glyph || '';
  return {
    id, kind: id === 'gyre' || id === 'cloak' || id === 'line' || id === 'travel' ? 'support' : 'power',
    name: rec.name, verb: rec.verb, role: rec.role,
    label: `${rec.name} · ${rec.verb}`,
    glyph: arsenalId, glyphSource: arsenalId ? arsenalGlyphSource(arsenalId) : 'none',
    sentence: rec.sentence, limits: rec.limits.slice(), combos: rec.combos.slice(),
    binding, target: rec.target, range: rec.range, cost: rec.cost,
    cooldown: rec.cooldownS ? { seconds: rec.cooldownS } : null,
    sources: { ...rec.sources, binding: 'systems/input.resolveActionCodes' },
  };
}

/**
 * Build a presentation reader. `read(state, { bindings, rail, nowS })` returns
 * `{ entries, weapons, order, combo, signature }`; `rail` is `readRailModel(state, nowS)` when the
 * caller already has it (readiness is a read of the rail's model — it is not recomputed here).
 * The static part (text, glyph, binding labels) is rebuilt only when the fitting, the mode, the
 * binding table or the effective verb changes; the live part is cheap and fresh every call.
 */
export function createArsenalPresentation() {
  let lastSig = '';
  let cache = null;
  const records = new Map();
  const recordOf = (key, make) => {
    let rec = records.get(key);
    if (!rec) { rec = make(); records.set(key, rec); }
    return rec;
  };
  let builds = 0;

  function read(state, { bindings = null, rail = null, nowS = simNow(state) } = {}) {
    const table = bindings || readArsenalBindings(state);
    const rigTarget = resolveRigTarget(state);
    const rigOn = rigTarget === 'cone' ? !!(state && state.fields && state.fields.coneActive)
      : !!(state && state.planet && state.planet.player && state.planet.player.collectorOn === true);
    const bomb = resolveBombAction(state);
    const cloakRead = readCloakState(state);
    const mode = `${state && state.mode || ''}|${state && state.run && state.run.kind || ''}|${state && state.run && state.run.ruleset || ''}`;
    const sig = [fitSignature(state), mode, bindingSignature(table), rigTarget, rigOn ? 1 : 0,
      `${bomb.action}:${bomb.id}`, cloakRead.state === 'unavailable' ? 'nocloak' : (cloakRead.module && cloakRead.module.id),
      powersFireOnPress(state) ? 'press' : 'hold'].join('||');
    if (sig !== lastSig || !cache) {
      builds += 1;
      lastSig = sig;
      cache = {
        pull: assemble('pull', recordOf('pull', pullRecord), bindingFor(table, 'pull', OWN_DIGIT.pull)),
        shove: assemble('shove', recordOf('shove', shoveRecord), bindingFor(table, 'shove', OWN_DIGIT.shove)),
        pin: assemble('pin', recordOf('pin', pinRecord), bindingFor(table, 'pin', OWN_DIGIT.pin)),
        bomb: assemble('bomb', recordOf(`bomb:${bomb.action}:${bomb.id}`, () => bombRecord(bomb)), bindingFor(table, 'bomb', OWN_DIGIT.bomb)),
        rig: assemble('rig', recordOf(`rig:${rigTarget}:${rigOn}`, () => rigRecord(rigTarget, rigOn)), bindingFor(table, 'rig', OWN_DIGIT.rig)),
        line: assemble('line', recordOf('line', lineRecord), bindingFor(table, 'tether')),
        travel: assemble('travel', recordOf('travel', travelRecord), bindingFor(table, 'travelBurn')),
        gyre: assemble('gyre', recordOf('gyre', gyreRecord), bindingFor(table, 'gyreSnare')),
        cloak: assemble('cloak', recordOf(`cloak:${cloakRead.module ? cloakRead.module.id : ''}`, () => cloakRecord(cloakRead)),
          bindingFor(table, 'cloak')),
      };
      cache.weapons = weaponEntries(state, table);
      cache.cycle = bindingFor(table, 'cycleBomb');
      cache.combo = combinationExample(cache);
    }
    return live(state, cache, { nowS, rail, bomb, cloakRead, rigTarget, rigOn });
  }

  function live(state, base, { nowS, rail, bomb, cloakRead, rigTarget, rigOn }) {
    const ctx = { nowS, rail, railIndex: { travel: 0, pull: 1, shove: 2, pin: 3, bomb: 4, rig: 5, line: 6 } };
    const entries = {};
    for (const id of ARSENAL_VERB_ORDER) {
      const e = { ...base[id] };
      e.ready = readyOf(state, id, ctx);
      entries[id] = e;
    }
    // — Shove: how many armed explosives the press will set off.
    const counts = armedOrdnanceCounts(state, nowS);
    const shove = entries.shove;
    shove.detonates = counts;
    shove.label = counts.total > 0 ? `Shove · Repulse + ${counts.total} detonate` : 'Shove · Repulse';
    if (counts.total > 0) {
      shove.sentence += ` Armed now: ${detonationText(counts)} will go off.`;
      shove.ready = { state: 'armed', reason: `Armed — sets off ${detonationText(counts)}`, cooldownMs: shove.ready.cooldownMs };
    }
    // — Bomb: the exact payload, its stock, and whether the next use throws, calls in or drops.
    const b = entries.bomb;
    b.payload = { id: bomb.id, name: bomb.name, stock: bomb.stock, capacity: bomb.capacity, next: bomb.action };
    b.charges = bomb.stock == null ? null : { count: bomb.stock, capacity: bomb.capacity };
    const stockText = bomb.stock == null ? '' : ` ×${bomb.stock}`;
    b.next = bomb.action === 'throw' ? 'throw' : bomb.action === 'callin' ? 'call in' : bomb.action === 'drop' ? 'drop' : '';
    b.label = bomb.action === 'empty' ? 'Bomb · Rack empty' : `Bomb · ${bomb.short}${stockText} · ${b.next}`;
    if (bomb.action !== 'empty') b.sentence = `Next press: ${b.next} ${bomb.name}${stockText}. ${b.sentence}`;
    // — Rig: the CURRENT function before use.
    const rig = entries.rig;
    rig.on = rigOn;
    rig.label = `Rig · ${rigTarget === 'skim' ? 'Scoop' : 'Cone'}${rigOn ? ' on' : ''}`;
    // — Gyre: gather / release.
    const g = gyreRead(state);
    const gyre = entries.gyre;
    gyre.phase = g.phase;
    gyre.verb = g.holding ? 'Release' : g.gathering ? 'Gathering' : g.launching || g.ballAway ? 'Thrown' : 'Gather';
    gyre.label = `Gyre · ${g.holding ? 'Release' : g.gathering ? 'Gathering' : g.launching || g.ballAway ? 'Thrown' : 'Gather'}`;
    if (g.holding) gyre.sentence = 'Holding a ball. Release to throw it ahead along the nose; a hard hit or a heavy ball does the damage.';
    else if (g.gathering) gyre.sentence = `Gathering: loose rocks and wrecks in the basin are being pulled in. Keep holding to build the ball; release to stop.${g.tooHeavy ? ` ${g.tooHeavy} too big to take whole.` : ''}`;
    const refusal = g.refusal;
    if (refusal && refusal.text) gyre.denial = { code: refusal.code || '', short: refusal.short || '', text: refusal.text };
    // — Cloak: ready / active / depleted / revealed.
    const cloak = entries.cloak;
    cloak.cloakState = cloakRead.state;
    cloak.label = cloakRead.state === 'unavailable' ? (cloakRead.module ? 'Cloak · off here' : 'Cloak · none fitted')
      : `Cloak · ${cloakRead.state === 'ready' ? 'Ready' : cloakRead.state === 'active' ? 'Active' : cloakRead.state === 'revealed' ? 'Revealed' : 'Depleted'}`;
    if (cloakRead.state === 'active') {
      cloak.sentence = `Cloak is on: you are hidden from anything outside your signature ring (${wu(finite(cloakRead.rt && cloakRead.rt.radius))} now). Thrust, boost and reeling widen it; firing drops it.`;
    } else if (cloakRead.state === 'revealed') {
      cloak.sentence = 'A scanner pulse burned your cloak open: everything in its sweep can see you for a moment. Concealment depends on signature, observers and what you do.';
    } else if (cloakRead.state === 'depleted') {
      cloak.sentence = 'The cloak has too little charge to engage. It recharges while off. Concealment depends on signature, observers and what you do.';
    }
    const weapons = base.weapons;
    return {
      entries, weapons, order: ARSENAL_VERB_ORDER, cycle: base.cycle, combo: base.combo,
      signature: lastSig, builds, nowS,
    };
  }

  return { read, get builds() { return builds; }, reset() { lastSig = ''; cache = null; records.clear(); } };
}

/** One-shot convenience for callers that do not keep a reader (tests, Help). */
export function resolveArsenalPresentation(state, options = {}) {
  return createArsenalPresentation().read(state, options);
}

/** Display id → the trait name a fitted module carries (kept for armory text). */
export function isAttackModifier(id) {
  return !!ATTACK_TRAIT_BY_ID[id];
}
