// The words of the arsenal: what each verb does, in plain mechanics, built from the numbers its OWNER
// defines (field defs, the mass seed, the Gyre's tuning, the bomb catalogue, the swarm call-ins, a cloak
// module's own `mods`). Pure text over data: no state, no input, no DOM, no systems — so the rail, the
// Help sheet, the phone deck and the armory can all read the SAME sentence for a verb without importing
// the live projection (and without an import cycle through the input owner).
// `arsenalPresentation.js` adds the live half: which variant is effective right now, the binding, readiness.
import { arsenalSentence } from './arsenalIdentity.js';
import { FIELD_DEFS, FIELD_ESCAPES } from './fields.js';
import { GRAVITY_MARK_FIELD_COUPLING } from './combatDefs.js';
import { MASS_SEED_DEF } from './massSeed.js';
import { GYRE_SNARE } from './gyreSnare.js';
import { BOMB_DEFS, BOMB_DRIFT } from './bombs.js';
import { IMPULSE_CHARGES } from './impulseCharges.js';
import { PLANET_REGION_RANK } from './planets.js';
import { swarmCallinById } from './swarmDraft.js';

export const finite = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
export const sec = (n) => `${Math.round(n * 10) / 10}s`;
export const wu = (n) => `${Math.round(n)} wu`;
export const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

/** A payload's short label: the catalogue's `shortName`, except two retired payloads whose short name is a power's name. */
export function payloadShortName(def) {
  return def.shortName === 'Pull' || def.shortName === 'Shove' ? def.name : def.shortName;
}

export function detonationText(counts) {
  const parts = [];
  if (counts.charges) parts.push(`${counts.charges} ${plural(counts.charges, 'charge')}`);
  if (counts.bombs) parts.push(`${counts.bombs} drift ${plural(counts.bombs, 'bomb')}`);
  if (counts.plants) parts.push(`${counts.plants} planted ${plural(counts.plants, 'charge')}`);
  return parts.join(' + ');
}

// ── per-verb static records (cached) ────────────────────────────────────────────────────────────

export function pullWords() {
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

export function shoveWords() {
  const rep = FIELD_DEFS.repulsor;
  return {
    name: 'Shove', verb: 'Repulse + detonate', role: 'Clear', glyph: 'field_repulsor_standard',
    sentence: `Push everything outward from your ship (${wu(rep.radius)} ring) and set off every armed charge and bomb you have out.`,
    limits: [`The ring recharges in ${sec(rep.cooldownS)}, but your armed explosives still go off while it does.`],
    target: 'your ship',
    range: { shape: 'ring', radiusWu: rep.radius, reachWu: 0 },
    cost: null, cooldownS: rep.cooldownS,
    combos: ['Throw a charge onto a body, then Shove sets it off to make the collision you want.'],
    sources: { range: 'data/fields.FIELD_DEFS.repulsor', cooldown: 'data/fields.FIELD_DEFS.repulsor.cooldownS',
      detonation: 'systems/impulseCharges + bombs.commandDetonate + emergentPrimitives.stickies' },
  };
}

export function pinWords() {
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

export function rigWords(target, on) {
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

export function bombWords(act) {
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
    name: 'Bomb', verb: 'Rack empty', role: 'Detonate', glyph: act && act.kind === 'dry' ? act.id : '',
    sentence: act && act.kind === 'dry'
      ? `Your ${act.name} socket is empty. Restock at a station shipworks; a charge in the hold is thrown instead.`
      : 'Your bomb rack is empty. Restock at a station shipworks; a charge in the hold is thrown instead.',
    limits: [], target: 'your aim', range: null, cost: { kind: 'stock', unit: 'bomb' }, cooldownS: 0, combos: [],
    sources: { stock: 'bombs.rack.cells' },
  };
}

/** The Line's bank phrase: one text for the rail's static description and the presentation. */
export const LINE_BANK = 'throw the tether line onto a body and haul it — tap to latch or cut';

export function lineWords() {
  return {
    name: 'Line', verb: 'Latch / cut', role: 'Haul', glyph: 'power_massline',
    sentence: `${LINE_BANK[0].toUpperCase()}${LINE_BANK.slice(1)}.`,
    limits: [arsenalSentence('power_massline')],
    target: 'body in reach', range: null, cost: null, cooldownS: 0,
    combos: ['Latch a body, then Pin an anchor and swing, or let go to throw it.'],
    sources: { sentence: 'data/arsenalWords.LINE_BANK', detail: 'data/arsenalIdentity.power_massline' },
  };
}

export function travelWords() {
  return {
    name: 'Burn', verb: 'Latch', role: 'Cruise', glyph: 'power_travel_burn',
    sentence: arsenalSentence('power_travel_burn'), limits: [], target: 'your ship', range: null, cost: null, cooldownS: 0,
    combos: [], sources: { sentence: 'data/arsenalIdentity.power_travel_burn' },
  };
}

export function gyreWords() {
  const g = GYRE_SNARE;
  return {
    name: 'Gyre', verb: 'Gather', role: 'Gather', glyph: 'power_gyre',
    sentence: `Hold to gather loose rocks and wrecks (${wu(g.basinRadius)} basin, ${wu(g.mawDist)} ahead) into one growing ball. Release to throw it ahead at up to ${Math.round(g.launchSpeed)} wu/s; a full-size ball leaves ${Math.round(g.launchMassPenalty * 100)}% slower.`,
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

export function cloakWords(read) {
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


// Baselines for the verbs whose meaning depends on state (the live projection says which variant is
// effective; a surface with no state says both).
const BOMB_BASELINE = 'Throws a sticky charge that Shove sets off. With none aboard it uses a swarm call-in or the drift bomb the cycle chose.';
const RIG_BASELINE = 'Opens the clearing cone in open space and the skim scoop inside a planet band. The socket names which one before you press.';

/**
 * One sentence for a verb with no live state — the DOM rail's bank, the Help sheet, the phone deck.
 * Built from the same words (and the same owners' numbers) as the live projection, never retyped.
 */
export function staticVerbSentence(id) {
  switch (id) {
    case 'travel': return travelWords().sentence;
    case 'pull': return pullWords().sentence;
    case 'shove': return shoveWords().sentence;
    case 'pin': return pinWords().sentence;
    case 'bomb': return BOMB_BASELINE;
    case 'rig': return RIG_BASELINE;
    case 'line': return lineWords().sentence;
    case 'gyre': return gyreWords().sentence;
    case 'cloak': return cloakWords({ module: null }).sentence;
    default: return '';
  }
}
