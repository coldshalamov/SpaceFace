// A01-05 — swarm Forge/Tap run-modifier reads and upkeep.
//
// ONE seam for every number the Foundry floor sells. A `swarm_tap` / `swarm_forge`
// record lands in `run.modifiers` through the ordinary run:modifierRecordRequested
// receipt; this module folds that ledger into the multiplier bag every read site
// consumes, so no site ever walks the ledger itself and no two sites can disagree
// about what a mod does.
//
// Two consumption patterns:
//
//   * PURE READ SITES — weapons (rof/heat/damage/impulse), tetherGameplay (reel
//     rate), fields (power radius/cooldown), mining (pickup magnet), mines (mine
//     drift), propulsionCatalog (registered scaler). They call the small scale
//     helpers below inside their own writes — nothing is stamped.
//   * UPKEEP — stateful copies the player entity already carries (hullMax, mass +
//     physicsBody, boost envelope, derived tether spool / ram-taken stamp, the
//     forged name on the live weapon runtimes, the Hot Core hull burn). Those are
//     maintained by maintainSwarmPlayerMods(), hosted on swarmElites' per-tick
//     slot beside the plated-hull passive it already keeps.
//
// Maintained fields follow the elite hull-stack pattern: the first value seen is
// the base, the multiplier re-applies against it, and a foreign rewrite (a refit
// republish, the passive stack's own add) is re-adopted as the new base rather
// than fought. Every clock is sim time; the ledger is the only write.

import { validateRunState } from '../core/runState.js';
import { isSwarmRuleset } from './survivalSwarm.js';
import { buildSlotList } from './ships.js';
import { SHIPS } from '../data/ships.js';
import { WEAPONS } from '../data/weapons.js';
import {
  SWARM_FORGE_DMG_MULT,
  SWARM_FORGE_IMPULSE_MULT,
  SWARM_FORGE_RECORD_KIND,
  SWARM_TAP_MODS,
  SWARM_TAP_RECORD_KIND,
  SWARM_TAP_MAX_PURCHASES,
  swarmTapModById,
  swarmForgeFormName,
  swarmForgePierceRank,
} from '../data/swarmMods.js';
import { syncDerivedPhysicsMass } from '../core/physicsAuthority.js';
import { registerPropulsionScaler, resolvePropulsionProfile } from '../core/flight/propulsionCatalog.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';

const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
const WEAPON_BY_ID = new Map(WEAPONS.map((def) => [def.id, def]));

export function liveSwarmRun(state) {
  if (!state) return null;
  const run = state.run;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
  if (run.kind !== 'survival') return null;
  if (run.phase === 'inactive') return null;
  if (!isSwarmRuleset(run.ruleset)) return null;
  if (!validateRunState(run).ok) return null;
  return run;
}

// ---- the aggregate ----------------------------------------------------------

const AGG_MULT_KEYS = [
  'knockMult', 'rofMult', 'heatMult', 'tetherLenMult', 'reelRateMult',
  'boostDurMult', 'boostDrainMult', 'massMult', 'accelMult', 'turnMult',
  'hullMaxMult', 'ramDealtMult', 'ramTakenMult', 'topSpeedMult',
  'powerRadiusMult', 'powerCdMult',
];
const AGG_PEAK_KEYS = ['magnetPickupRange', 'mineMagnetRange', 'hotCoreBurnPerS'];

const EMPTY_MODS = Object.freeze({
  count: 0, ids: Object.freeze([]), forged: new Map(),
  knockMult: 1, rofMult: 1, heatMult: 1, tetherLenMult: 1, reelRateMult: 1,
  boostDurMult: 1, boostDrainMult: 1, massMult: 1, accelMult: 1, turnMult: 1,
  hullMaxMult: 1, ramDealtMult: 1, ramTakenMult: 1, topSpeedMult: 1,
  powerRadiusMult: 1, powerCdMult: 1,
  magnetPickupRange: 0, mineMagnetRange: 0, hotCoreBurnPerS: 0,
});

function aggregateModifiers(run) {
  const agg = {
    count: 0, ids: [], forged: new Map(),
    knockMult: 1, rofMult: 1, heatMult: 1, tetherLenMult: 1, reelRateMult: 1,
    boostDurMult: 1, boostDrainMult: 1, massMult: 1, accelMult: 1, turnMult: 1,
    hullMaxMult: 1, ramDealtMult: 1, ramTakenMult: 1, topSpeedMult: 1,
    powerRadiusMult: 1, powerCdMult: 1,
    magnetPickupRange: 0, mineMagnetRange: 0, hotCoreBurnPerS: 0,
  };
  for (const rec of run.modifiers || []) {
    if (!rec || typeof rec !== 'object') continue;
    if (rec.kind === SWARM_TAP_RECORD_KIND) {
      const def = swarmTapModById(rec.offerId);
      if (!def || agg.ids.includes(def.id)) continue;
      agg.ids.push(def.id);
      agg.count = agg.ids.length;
      for (const side of [def.give, def.take]) {
        for (const [key, value] of Object.entries(side || {})) {
          if (!Number.isFinite(value)) continue;
          if (AGG_PEAK_KEYS.includes(key)) agg[key] = Math.max(agg[key], value);
          else if (AGG_MULT_KEYS.includes(key)) agg[key] *= value;
        }
      }
    } else if (rec.kind === SWARM_FORGE_RECORD_KIND && typeof rec.defId === 'string') {
      agg.forged.set(rec.defId, {
        form: typeof rec.form === 'string' && rec.form ? rec.form : swarmForgeFormName(rec.defId, null),
        pierce: swarmForgePierceRank(rec.defId),
        dmgMult: SWARM_FORGE_DMG_MULT,
        impulseMult: SWARM_FORGE_IMPULSE_MULT,
      });
    }
  }
  return Object.freeze(agg);
}

// run.modifiers is cloned by the wallet on every commit, so identity changes the
// moment a purchase lands — the aggregate caches on the array, never on a tick.
const AGG_CACHE = new WeakMap();

/** The folded multiplier bag for the live swarm run (or the all-1 empty bag). */
export function swarmPlayerMods(state) {
  const run = liveSwarmRun(state);
  if (!run || !Array.isArray(run.modifiers)) return EMPTY_MODS;
  let hit = AGG_CACHE.get(run);
  if (!hit || hit.modifiers !== run.modifiers) {
    hit = { modifiers: run.modifiers, agg: aggregateModifiers(run) };
    AGG_CACHE.set(run, hit);
  }
  return hit.agg;
}

/** Mods not yet owned on this run — the pool a tap may draw from. */
export function swarmTapAvailable(run, excludeIds = []) {
  const mods = Array.isArray(run && run.modifiers) ? run.modifiers : [];
  const owned = new Set();
  for (const rec of mods) {
    if (rec && rec.kind === SWARM_TAP_RECORD_KIND && typeof rec.offerId === 'string') {
      owned.add(rec.offerId);
    }
  }
  const excluded = new Set(excludeIds);
  return SWARM_TAP_MODS.filter((mod) => !owned.has(mod.id) && !excluded.has(mod.id));
}

/** How many tap purchases this run has committed — the price step index. */
export function swarmTapCount(run) {
  const mods = Array.isArray(run && run.modifiers) ? run.modifiers : [];
  let n = 0;
  for (const rec of mods) if (rec && rec.kind === SWARM_TAP_RECORD_KIND) n += 1;
  return n;
}

/** Whether the till will sell another mod at all this run. */
export function swarmTapsSoldOut(run) {
  return swarmTapCount(run) >= SWARM_TAP_MAX_PURCHASES;
}

/** Owned tap mods in purchase order — the HUD's small row reads these. */
export function swarmOwnedTapMods(state) {
  const run = liveSwarmRun(state);
  if (!run || !Array.isArray(run.modifiers)) return [];
  const out = [];
  for (const rec of run.modifiers) {
    if (rec && rec.kind === SWARM_TAP_RECORD_KIND) {
      const def = swarmTapModById(rec.offerId);
      if (def && !out.includes(def)) out.push(def);
    }
  }
  return out;
}

// ---- forge reads ------------------------------------------------------------

/** The forge receipt for a gun, or null — once per gun defId per run. */
export function swarmForgeRecord(state, defId) {
  return swarmPlayerMods(state).forged.get(defId) || null;
}

/**
 * "The gun you hold" — the primary mount: the lowest-index weapon fitting on the
 * active hull, the same slot the floor's own fit order treats as primary.
 */
export function swarmHeldWeaponDefId(state) {
  const player = state && state.player;
  const owned = player && Array.isArray(player.ownedShips)
    ? player.ownedShips[(player.activeShipIndex) || 0] : null;
  const shipDef = owned && SHIP_BY_ID.get(owned.defId);
  if (!shipDef || !Array.isArray(owned.fittings)) return null;
  const slots = buildSlotList(shipDef);
  for (const slot of slots) {
    if (!slot || slot.type !== 'weapon') continue;
    const id = owned.fittings[slot.index];
    if (id && WEAPON_BY_ID.has(id)) return id;
  }
  return null;
}

/** Forge damage scale for one shot: ×1.4 when this exact defId carries the receipt. */
export function swarmWeaponDamageScale(state, entity, defId) {
  if (!entity || entity.id !== state.playerId) return 1;
  return swarmForgeRecord(state, defId) ? SWARM_FORGE_DMG_MULT : 1;
}

/** Knockback scale for one hit: tap knockback × forge ×1.35, player only. */
export function swarmWeaponImpulseScale(state, entity, defId) {
  if (!entity || entity.id !== state.playerId) return 1;
  const mods = swarmPlayerMods(state);
  const forge = mods.forged.get(defId) ? SWARM_FORGE_IMPULSE_MULT : 1;
  return mods.knockMult * forge;
}

/** Pierce rank a forged slug carries into the attack spec (Wrecking Ball = 2). */
export function swarmWeaponPierceRank(state, entity, defId) {
  if (!entity || entity.id !== state.playerId) return 0;
  const rec = swarmForgeRecord(state, defId);
  return rec ? rec.pierce : 0;
}

/** The name a gun reads as — the forged form when the ledger says so. */
export function swarmWeaponDisplayName(state, w) {
  const rec = w && swarmForgeRecord(state, w.defId);
  return rec ? rec.form : (w && w.name) || 'weapon';
}

// ---- pure read-site scales (player only; 1 outside a live swarm run) ---------

export function swarmModFireRateScale(state) {
  return swarmPlayerMods(state).rofMult;
}
export function swarmModHeatScale(state) {
  return swarmPlayerMods(state).heatMult;
}
export function swarmReelRateScale(state) {
  return swarmPlayerMods(state).reelRateMult;
}
export function swarmFieldRadiusScale(state) {
  return swarmPlayerMods(state).powerRadiusMult;
}
export function swarmFieldCooldownScale(state) {
  return swarmPlayerMods(state).powerCdMult;
}
export function swarmMineMagnetRange(state) {
  return swarmPlayerMods(state).mineMagnetRange;
}
/** Bumper Rails take: contact/ram damage the player's hull pays, ×0.5 when owned. */
export function swarmRamTakenScale(state) {
  return swarmPlayerMods(state).ramTakenMult;
}
/** Bumper Rails give: authored ram packets (the swarm plate perk) pay ×2. */
export function swarmRamDealtScale(state) {
  return swarmPlayerMods(state).ramDealtMult;
}
/** Magnet Hull give: additive scrap reach on the resolved magnet number. */
export function swarmMagnetPickupBonus(state) {
  return swarmPlayerMods(state).magnetPickupRange;
}

// ---- propulsion scaler -------------------------------------------------------

// The resolver caches merged profiles per entity and is a core lib — it cannot
// reach the swarm ledger itself. playerModifiers registers one scaler; the
// catalog applies it for the player craft alongside its own translation feel.
const PROP_ACCEL_KEYS = [
  'mainAccel', 'reverseAccel', 'strafeAccel', 'brakeAccel', 'brakeStrafeAccel',
  'maxAccel', 'maxBrakeAccel', 'rcsForwardAccel', 'rcsReverseAccel',
  'rcsStrafeAccel', 'fieldAccel', 'trimAccel',
];
const PROP_TURN_KEYS = ['maxYawRate', 'yawAccel', 'yawBrake'];
// The governed top speed lives in combat/precision/travel ceilings; the derived
// boost ceiling and solver bound scale too — absent keys (catalog profiles) skip.
const PROP_SPEED_KEYS = [
  'combatSpeed', 'precisionSpeed', 'travelCeiling',
  'boostMaxSpeed', 'solverSpeedLimit',
];
const SCALED_PROFILE_CACHE = new WeakMap(); // profile -> { sig, scaled }

registerPropulsionScaler((profile, entity, state) => {
  if (!profile || !entity || !state || entity.id !== state.playerId) return profile;
  const mods = swarmPlayerMods(state);
  const a = mods.accelMult, t = mods.turnMult, s = mods.topSpeedMult;
  if (a === 1 && t === 1 && s === 1) return profile;
  const sig = `${a}|${t}|${s}`;
  const hit = SCALED_PROFILE_CACHE.get(profile);
  if (hit && hit.sig === sig) return hit.scaled;
  const scaled = { ...profile };
  for (const key of PROP_ACCEL_KEYS) if (Number.isFinite(scaled[key])) scaled[key] *= a;
  for (const key of PROP_TURN_KEYS) if (Number.isFinite(scaled[key])) scaled[key] *= t;
  for (const key of PROP_SPEED_KEYS) if (Number.isFinite(scaled[key])) scaled[key] *= s;
  Object.freeze(scaled);
  SCALED_PROFILE_CACHE.set(profile, { sig, scaled });
  return scaled;
});

// ---- upkeep ------------------------------------------------------------------

/**
 * One scalar maintained against a captured base: the first read is truth, the
 * multiplier re-writes against it, and a value moved by a foreign writer (a refit
 * republish, the passive stack's own add) is re-adopted as the new base.
 */
function maintainScalar(rec, read, write, mult) {
  const current = read();
  if (!Number.isFinite(current)) return;
  const expected = rec.base * rec.mult;
  if (Math.abs(current - expected) > Math.max(1e-6, Math.abs(expected) * 1e-9)) {
    rec.base = current;
    rec.mult = 1;
  }
  if (rec.mult !== mult) {
    rec.mult = mult;
    write(rec.base * mult);
  }
}

/**
 * The ONE seam for an additive max-hull contribution (the plated-hull passive stack) on a
 * hull that may carry the Glass Cannon multiplier. `delta` is an authored, unmodified
 * amount: it joins the captured base and the live max moves by delta x the multiplier
 * already applied, so upkeep never re-reads the sum as a fresh unmodified base and
 * halves it a second time. `floorBase` keeps the unmodified base from sinking under a
 * floor on a removal. Returns the live max-hull change.
 */
export function addSwarmHullMaxBonus(player, delta, floorBase = 0) {
  if (!player || !Number.isFinite(player.hullMax) || !Number.isFinite(delta)) return 0;
  const before = player.hullMax;
  const marks = player.data && player.data.swarmMods;
  const rec = marks && marks.hullMax;
  if (!rec || !Number.isFinite(rec.base) || !Number.isFinite(rec.mult)) {
    player.hullMax = Math.max(floorBase, before + delta);
    return player.hullMax - before;
  }
  const expected = rec.base * rec.mult;
  if (Math.abs(before - expected) > Math.max(1e-6, Math.abs(expected) * 1e-9)) {
    rec.base = before; // a foreign rewrite: adopt it, exactly as the upkeep does
    rec.mult = 1;
  }
  rec.base = Math.max(floorBase, rec.base + delta);
  player.hullMax = rec.base * rec.mult;
  return player.hullMax - before;
}

function playerEntity(state) {
  const id = state && state.playerId;
  if (id == null || !state.entities || typeof state.entities.get !== 'function') return null;
  const entity = state.entities.get(id);
  return entity && entity.alive !== false ? entity : null;
}

/**
 * Per-tick upkeep for the stateful copies mods bend: hullMax, mass + physicsBody,
 * the boost envelope, the derived tether/ram stamps, the forged names on the live
 * weapon runtimes, and the Hot Core self-burn. Called from swarmElites' update —
 * the slot that already maintains the plated-hull passive on the same entity.
 */
export function maintainSwarmPlayerMods(state, helpers, dt) {
  const run = liveSwarmRun(state);
  const player = playerEntity(state);
  if (!run || !player || !player.data) return;
  const mods = swarmPlayerMods(state);
  const marks = player.data.swarmMods || (player.data.swarmMods = {});

  // glass_cannon — max hull ×0.5. hull clamps inside the new max, never heals.
  const hullRec = marks.hullMax || (marks.hullMax = { base: player.hullMax, mult: 1 });
  maintainScalar(hullRec,
    () => player.hullMax,
    (v) => {
      player.hullMax = Math.max(1, v);
      player.hull = Math.min(Number.isFinite(player.hull) ? player.hull : player.hullMax, player.hullMax);
    },
    mods.hullMaxMult);

  // ballast/stripped — mass rides the canonical writer so physicsBody.mass,
  // inertia and the flat field move together.
  const massRec = marks.mass || (marks.mass = { base: player.mass, mult: 1 });
  maintainScalar(massRec,
    () => player.mass,
    (v) => { player.mass = v; },
    mods.massMult);
  const body = player.physicsBody;
  if (body && typeof body === 'object' && Number.isFinite(body.mass)) {
    // Inertia is mass×shape: the same multiplier bends both through the one writer.
    let rec = marks.body;
    if (!rec) rec = marks.body = { base: body.mass, iBase: body.inertiaY, mult: 1 };
    const expected = rec.base * rec.mult;
    if (Math.abs(body.mass - expected) > Math.max(1e-6, Math.abs(expected) * 1e-9)) {
      rec.base = body.mass;
      rec.iBase = body.inertiaY;
      rec.mult = 1;
    }
    if (rec.mult !== mods.massMult) {
      rec.mult = mods.massMult;
      syncDerivedPhysicsMass(player, rec.base * rec.mult,
        Number.isFinite(rec.iBase) ? rec.iBase * rec.mult : undefined, body.radius);
    }
  }

  // bumper_rails — ram dealt ×N is the body's own impactDamageScale (what a
  // striker pays for touching this hull); ram taken rides a derived stamp the
  // damage router reads on collision packets only.
  if (body && typeof body === 'object') {
    const scaleRec = marks.impactScale || (marks.impactScale = {
      base: Number.isFinite(body.impactDamageScale) ? body.impactDamageScale : 1, mult: 1,
    });
    maintainScalar(scaleRec,
      () => Number.isFinite(body.impactDamageScale) ? body.impactDamageScale : 1,
      (v) => { body.impactDamageScale = v; if (Number.isFinite(body.revision)) body.revision += 1; },
      mods.ramDealtMult);
  }
  // Read-site stamps ride the marks bag, never entity.data.derived — ships.js
  // freezes that descriptor. attachments.js folds tetherLenMult into the fitted
  // spool rating; damage.js folds ramDamageTakenMult into collision-family hits.
  marks.ramDamageTakenMult = mods.ramTakenMult;
  marks.tetherLenMult = mods.tetherLenMult;

  // hot_core — the burner's envelope is a runtime copy; duration and drain scale
  // on it directly, and at boosted top speed the core burns 2 hull/s.
  const boost = player.boost;
  if (boost && typeof boost === 'object') {
    const durRec = marks.burnDur || (marks.burnDur = { base: boost.burnDurS, mult: 1 });
    maintainScalar(durRec, () => boost.burnDurS, (v) => { boost.burnDurS = v; }, mods.boostDurMult);
    const drainRec = marks.burnDrain || (marks.burnDrain = { base: boost.drainRate, mult: 1 });
    maintainScalar(drainRec, () => boost.drainRate, (v) => { boost.drainRate = v; }, mods.boostDrainMult);
  }

  // The forged form reads on the live runtimes: name and a forgeForm marker for
  // HUD/probes. The ledger stays canonical; this is the same stamp reapplied
  // after any refit republishes the weapon list.
  const weapons = Array.isArray(player.weapons) ? player.weapons : [];
  for (const w of weapons) {
    const rec = w && mods.forged.get(w.defId);
    if (!rec) continue;
    if (w.name !== rec.form) w.name = rec.form;
    if (w.forgeForm !== rec.form) w.forgeForm = rec.form;
  }

  // hot_core take: boosting at the boosted ceiling burns hull through the
  // ordinary damage route — accumulated so the router hears whole points.
  if (mods.hotCoreBurnPerS > 0 && boost) {
    marks.hotCoreCarry = Number.isFinite(marks.hotCoreCarry) ? marks.hotCoreCarry : 0;
    // The flight owner's own resource-gated flag: true while the ship is sustaining boost,
    // with or without a fitted afterburner window.
    const burning = !!(player.flags && player.flags.boosting === true);
    const speed = Math.hypot(
      Number(player.vel && player.vel.x) || 0, Number(player.vel && player.vel.z) || 0);
    let cap = 0;
    if (burning) {
      const profile = resolvePropulsionProfile(player, state);
      cap = (Number.isFinite(profile && profile.combatSpeed) ? profile.combatSpeed : 0)
        * (Number.isFinite(profile && profile.boostSpeedMult) ? profile.boostSpeedMult : 1)
        * (1 + (Number.isFinite(boost.topSpeedPct) ? boost.topSpeedPct : 0));
    }
    if (burning && cap > 0 && speed >= cap * 0.98) {
      marks.hotCoreCarry += mods.hotCoreBurnPerS * Math.max(0, Number(dt) || 0);
    } else if (!burning) {
      marks.hotCoreCarry = 0;
    }
    const burn = Math.floor(marks.hotCoreCarry);
    if (burn >= 1) {
      marks.hotCoreCarry -= burn;
      const route = helpers && typeof helpers.routeCombatDamage === 'function'
        ? helpers.routeCombatDamage.bind(helpers) : null;
      if (route) {
        const packet = scalarHitToDamagePacket({
          damage: burn,
          damageType: 'thermal',
          subsystemShare: 0, // the burn lands on the hull, never diverted into a component
          pos: player.pos ? { x: player.pos.x, z: player.pos.z } : null,
          source: { kind: 'swarm_tap_hot_core', chargeId: 'hot_core' },
        });
        // Structural hull loss (combat/damage.js): the amount IS the hull removed, so shields,
        // armor and difficulty scaling cannot absorb the stated trade.
        packet.shieldBypass = 1;
        packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true, structuralHull: true };
        route({
          attackerId: player.id,
          targetId: player.id,
          packet,
          origin: { kind: 'swarm_tap_hot_core', id: player.id },
        });
      }
    }
  }
}
