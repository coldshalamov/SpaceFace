// PQ-176.03 — what the fit screen says before the player commits.
//
// Sustained fire is the gun's own energy draw, heat and cooling, read off the same weapon
// runtime buildWeaponList hands the sim. Module energyDraw is summed into continuousDrain for
// the power band, but combat never subtracts it from the capacitor, so it is not part of how
// long the gun keeps firing. A heatsink changes this only because it scales heatDissip on that
// runtime. No weapon or hull number is retuned here.

import { MODULES } from '../../data/modules.js';
import { WEAPONS } from '../../data/weapons.js';
import { SHIPS } from '../../data/ships.js';
import { buildWeaponList, getDerivedStats } from '../../systems/ships.js';

const MODULE_BY_ID = new Map(MODULES.map((moduleDef) => [moduleDef.id, moduleDef]));
const WEAPON_BY_ID = new Map(WEAPONS.map((weaponDef) => [weaponDef.id, weaponDef]));
const SHIP_BY_ID = new Map(SHIPS.map((shipDef) => [shipDef.id, shipDef]));

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round3(value) {
  if (!Number.isFinite(value)) return value;
  return Math.round(value * 1000) / 1000;
}

/** One player line, or '' when the text is blank or would wrap to a second line. */
export function oneLineSentence(value) {
  if (typeof value !== 'string') return '';
  const line = value.trim();
  if (!line || /[\r\n]/.test(line)) return '';
  return line;
}

function rateText(value) {
  const number = Math.round(finite(value, 0) * 10) / 10;
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

/**
 * Seconds for a reservoir `max` that fills at `rateIn` and empties at `rateOut`.
 * Infinity when the outflow keeps up. The gun's heat and the shared capacitor both use this.
 */
function secondsUntilEmpty(max, rateIn, rateOut) {
  if (!(rateIn > 0)) return Infinity;
  if (!(max > 0)) return 0;
  const net = rateIn - Math.max(0, rateOut);
  if (!(net > 0)) return Infinity;
  return max / net;
}

function gunFlows(runtime, def) {
  if (!runtime || !def || def.emergentPrimitive) return null;
  const cooling = finite(runtime.heatDissip, finite(def.heatDissip, 0));
  const heatMax = finite(runtime.heatMax, finite(def.heatMax, 0));
  const continuous = runtime.continuous != null ? !!runtime.continuous : !!def.continuous;
  if (continuous) {
    const energyPerS = finite(runtime.energyCost, finite(def.energyCost, 0));
    const heatPerS = finite(def.heatPerSec, finite(runtime.heat, 0));
    return {
      energyPerS,
      heatPerS,
      cooling,
      heatMax,
      heatSeconds: heatPerS > 0 ? secondsUntilEmpty(heatMax, heatPerS, cooling) : Infinity,
    };
  }
  const rof = finite(runtime.rof, finite(def.rof, 0));
  if (!(rof > 0)) return null;
  // A homing mount cannot shoot again until the lock the sim just spent has climbed back.
  // Lock builds during the cooldown, so the wait is the longer of the two, not the sum.
  const lockS = (runtime.tracking || def.tracking) === 'homing'
    ? Math.max(0, finite(runtime.lockTimeS, finite(def.lockTimeS, 0)))
    : 0;
  const shotsPerS = 1 / Math.max(1 / rof, lockS);
  const energyCost = finite(runtime.energyCost, finite(def.energyCost, 0));
  const heatPerShot = finite(runtime.heat, 0) > 0 ? finite(runtime.heat, 0) : finite(def.heatPerShot, 0);
  const heatPerS = heatPerShot * shotsPerS;
  return {
    energyPerS: energyCost * shotsPerS,
    heatPerS,
    cooling,
    heatMax,
    heatSeconds: heatPerShot > 0 ? secondsUntilEmpty(heatMax, heatPerS, cooling) : Infinity,
  };
}

function sustainSentence(packet) {
  if (packet.limit === 'none') return 'No gun is fitted, so there is no burst to time.';
  const head = `Draws ${rateText(packet.energyDrawPerS)}/s against ${rateText(packet.capRegenPerS)} back. `
    + `Heat climbs at ${rateText(packet.heatPerS)} and cooling takes ${rateText(packet.coolingPerS)}`;
  if (packet.limit === 'open') return `${head}, so the gun can keep firing.`;
  const noun = packet.gunCount > 1 ? 'guns hold' : 'gun holds';
  const why = packet.limit === 'energy' ? 'the capacitor runs dry' : 'the heat stops it';
  return `${head}, so the ${noun} for ${rateText(packet.seconds)} s before ${why}.`;
}

/**
 * How long the fitted guns keep firing from a cold, full capacitor, holding the trigger.
 * `seconds` is Infinity when draw and heat both stay under what comes back.
 */
export function sustainedFireForFit(shipId, fittings = [], player = null) {
  const shipDef = SHIP_BY_ID.get(shipId);
  const derived = shipDef ? getDerivedStats(shipId, fittings, player) : null;
  const runtimes = shipDef ? buildWeaponList(shipDef, fittings, true, derived) : [];
  const guns = [];
  for (const runtime of runtimes) {
    const def = WEAPON_BY_ID.get(runtime.defId) || null;
    const flows = gunFlows(runtime, def);
    if (flows) guns.push(flows);
  }
  if (!guns.length) {
    const empty = {
      seconds: null,
      limit: 'none',
      gunCount: 0,
      energyDrawPerS: 0,
      capRegenPerS: finite(derived && derived.capRegen, 0),
      capMax: finite(derived && derived.capMax, 0),
      heatPerS: 0,
      coolingPerS: 0,
      heatMax: 0,
      heatSeconds: null,
      energySeconds: null,
      sentence: '',
    };
    empty.sentence = sustainSentence(empty);
    return Object.freeze(empty);
  }

  let energyDrawPerS = 0;
  let binding = guns[0];
  for (const gun of guns) {
    energyDrawPerS += gun.energyPerS;
    if (gun.heatSeconds < binding.heatSeconds) binding = gun;
  }
  const capRegenPerS = finite(derived && derived.capRegen, 0);
  const capMax = finite(derived && derived.capMax, 0);
  const energySeconds = secondsUntilEmpty(capMax, energyDrawPerS, capRegenPerS);
  const heatSeconds = binding.heatSeconds;
  const seconds = Math.min(energySeconds, heatSeconds);
  let limit = 'open';
  if (Number.isFinite(seconds)) limit = energySeconds <= heatSeconds ? 'energy' : 'heat';
  const packet = {
    seconds: round3(seconds),
    limit,
    gunCount: guns.length,
    energyDrawPerS: round3(energyDrawPerS),
    capRegenPerS: round3(capRegenPerS),
    capMax: round3(capMax),
    heatPerS: round3(binding.heatPerS),
    coolingPerS: round3(binding.cooling),
    heatMax: round3(binding.heatMax),
    heatSeconds: round3(heatSeconds),
    energySeconds: round3(energySeconds),
    sentence: '',
  };
  packet.sentence = sustainSentence(packet);
  return Object.freeze(packet);
}

/** The turn the profile already predicts, as one line. Empty when the profile has no radius. */
export function turnRadiusSentence(predictions) {
  const radius = predictions && predictions.turnRadiusWu;
  if (!(radius > 0)) return '';
  return `At fight speed the turn radius is ${Math.round(radius)} m.`;
}

/** The reversal the profile already predicts, as one line. Empty when it was not computed. */
export function reversalSentence(predictions) {
  const seconds = predictions && predictions.reversalTimeS;
  if (!(seconds > 0)) return '';
  return `A full reversal takes ${rateText(seconds)} s.`;
}

function composeWeaponLine(def) {
  if (def.emergentPrimitive) return 'Fires without drawing power or heat.';
  if (def.continuous) return 'Holds a beam for as long as power and heat allow.';
  if (def.tracking === 'homing') return 'Locks, then flies the shot in.';
  if (def.tracking === 'auto_turret') return 'Aims itself and fires into its arc.';
  return 'Fires for as long as power and heat allow.';
}

function composeModuleLine(def) {
  const mods = def.mods || {};
  if (mods.masslineHeadId === 'tractor' || mods.magnetRange) return 'Picks up what you fly over without stopping on it.';
  if (mods.masslineHeadId === 'elastic_whip') return 'Stores the stretch of a swing and gives it back as a snap.';
  if (mods.masslineHeadId === 'frame_coupler') return 'Holds a tow on a hitch so the load turns with you.';
  if (mods.masslineHeadId === 'monofilament_sweep') return 'A taut swing cuts a hostile line.';
  if (mods.masslineHeadId === 'transverse_snare') return 'A hull that crosses your line gets snatched.';
  if (mods.masslineHeadId === 'twin_bridle') return 'Anchors two points at once.';
  if (mods.weaponHeatDissipPct) return 'The guns shed heat faster, so a burst lasts longer.';
  if (mods.swingDrive) return 'A dash on a taut line swings you around the anchor.';
  if (mods.countermeasure && mods.countermeasure.kind === 'chaff') return 'Breaks a missile lock and pulls the shot off you.';
  if (mods.countermeasure && mods.countermeasure.kind === 'ecm') return 'Jams a missile so it stops turning toward you.';
  if (mods.countermeasure && mods.countermeasure.kind === 'decoy') return 'Puts a false contact in the water and missiles go for it.';
  if (mods.repulsionTrap) return 'Drops a charge behind you that shoves whoever flies into it.';
  if (def.slotType === 'mining') return 'Cuts ore while you hold it on the rock.';
  if (def.slotType === 'engine') return 'Changes how hard you push and how fast you can run.';
  if (def.slotType === 'thruster') return 'Changes how the hull turns, slides and stops.';
  if (def.slotType === 'shield' || mods.shieldFlat) return 'Adds shield that keeps coming back while you fly.';
  if (mods.cargoFlat || mods.hiddenCargoPct) return 'Changes what the hold can carry.';
  if (finite(def.mass, 0) > 0) return 'You carry its mass, and that is what the ship feels.';
  return 'Fitted, and it does not change how the ship flies.';
}

/** The one line the fit row shows for a module or a gun the player can put on the ship. */
export function airSentenceForId(id) {
  const moduleDef = MODULE_BY_ID.get(id);
  if (moduleDef) return oneLineSentence(moduleDef.sentence) || composeModuleLine(moduleDef);
  const weaponDef = WEAPON_BY_ID.get(id);
  if (weaponDef) return oneLineSentence(weaponDef.sentence) || composeWeaponLine(weaponDef);
  return '';
}

/** One sentence per fitted id, in fit order, duplicates collapsed. */
export function moduleSentencesForFittings(fittings = []) {
  const rows = [];
  const seen = new Set();
  for (const id of fittings) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push(Object.freeze({ id, sentence: airSentenceForId(id) }));
  }
  return Object.freeze(rows);
}
