// M5 thirteen-ship role lattice — deterministic contract check.
// Run: node scripts/check-ship-role-lattice.mjs
// Proves: 13 mapped hulls, tier/role coverage, real stat/slot differences,
// adjacency/unlock truth, no dominated same-tier hull, save/load continuity,
// ships-owner derived-stat authority, and 20 representative loadouts/seeds.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { SHIPS } from '../src/data/ships.js';
import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import { TECH_NODES } from '../src/data/tech.js';
import {
  CAREER_IDS,
  LATTICE_DIMENSIONS,
  LATTICE_SCHEMA_ID,
  LATTICE_SHIP_IDS,
  SHIP_ROLE_LATTICE,
  compareHulls,
  computeHullDimensions,
  describeHullRole,
  findDominatedSameTierHulls,
  flightClassForHull,
  getLatticeRow,
  roleOperationalBiases,
  validateRoleLattice,
} from '../src/data/shipRoleLattice.js';
import {
  fittingsFromDefaultModules,
  getDerivedStats,
  getShipRoleIdentity,
  buildSlotList,
} from '../src/systems/ships.js';
import {
  describeShipyardHullCompare,
  describeShipyardPurchase,
} from '../src/ui/screens/shipyard.js';

const TECH_BY_ID = new Map(TECH_NODES.map((t) => [t.id, t]));
const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const FAIL = [];
function check(cond, msg) {
  if (!cond) FAIL.push(msg);
}

// ---- 1. Exactly 13 mapped hulls ------------------------------------------------
check(SHIPS.length === 13, 'SHIPS catalog must be 13 hulls, got ' + SHIPS.length);
check(LATTICE_SHIP_IDS.length === 13, 'lattice must map 13 hulls');
const validation = validateRoleLattice(SHIPS);
check(validation.ok, 'validateRoleLattice: ' + validation.errors.join('; '));
for (const def of SHIPS) {
  check(!!SHIP_ROLE_LATTICE[def.id], 'missing lattice for ' + def.id);
  check(getLatticeRow(def.id).role === def.role, 'role mismatch ' + def.id);
}

// ---- 2. Tier / role coverage ---------------------------------------------------
const tiers = new Set(SHIPS.map((s) => s.tier));
for (let t = 0; t <= 5; t++) check(tiers.has(t), 'missing tier T' + t);
const roles = new Set(SHIPS.map((s) => s.role));
check(roles.size === 13, 'expected 13 distinct roles, got ' + roles.size);
check(LATTICE_SCHEMA_ID === 'spaceface.shipRoleLattice.v1', 'schema id drift');
check(LATTICE_DIMENSIONS.length === 7, 'dimension count');

// Career coverage: every career is a primary fit for at least one hull
for (const career of CAREER_IDS) {
  const hit = LATTICE_SHIP_IDS.some((id) => {
    const row = getLatticeRow(id);
    return row.primaryCareers.includes(career) || (row.careerFit[career] || 0) >= 0.9;
  });
  check(hit, 'career ' + career + ' has no strong hull fit');
}

// ---- 3. Real stat / slot differences (same-tier pairs must differ) -------------
const byTier = new Map();
for (const def of SHIPS) {
  if (!byTier.has(def.tier)) byTier.set(def.tier, []);
  byTier.get(def.tier).push(def);
}
for (const [tier, group] of byTier) {
  if (group.length < 2) continue;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i];
      const b = group[j];
      const dimA = computeHullDimensions(a);
      const dimB = computeHullDimensions(b);
      const differs = LATTICE_DIMENSIONS.some((k) => Math.abs(dimA[k] - dimB[k]) > 1e-6)
        || a.mass !== b.mass
        || a.handling !== b.handling
        || a.cargo !== b.cargo
        || JSON.stringify(a.slots) !== JSON.stringify(b.slots);
      check(differs, 'T' + tier + ' ' + a.id + ' vs ' + b.id + ' are not distinct');
      // Derived behavior must also diverge under empty fit
      const da = getDerivedStats(a.id, [], null);
      const db = getDerivedStats(b.id, [], null);
      const flightDiff =
        da.flightClass !== db.flightClass
        || Math.abs(da.thrust - db.thrust) > 0.5
        || Math.abs(da.turnRate - db.turnRate) > 0.05
        || Math.abs(da.maxSpeed - db.maxSpeed) > 0.5
        || da.cargoCap !== db.cargoCap
        || Math.abs((da.operationalFeelMass || da.mass) - (db.operationalFeelMass || db.mass)) > 0.5;
      check(flightDiff, 'T' + tier + ' ' + a.id + '/' + b.id + ' derived flight identical');
    }
  }
}

// ---- 4. No dominated same-tier hull --------------------------------------------
const dominated = findDominatedSameTierHulls(SHIPS);
check(dominated.length === 0, 'dominated same-tier hulls: ' + JSON.stringify(dominated));

// ---- 5. Adjacency / unlock truth -----------------------------------------------
for (const def of SHIPS) {
  const row = getLatticeRow(def.id);
  for (const nextId of row.upgradeAdjacency) {
    const next = SHIP_BY_ID.get(nextId);
    check(!!next, def.id + ' adjacency unknown ' + nextId);
    if (!next) continue;
    check((next.tier || 0) >= (def.tier || 0), def.id + ' adjacency drops tier → ' + nextId);
    // If next requires tech, that tech must unlock the ship (or ship is free of tech gate)
    if (next.requiresTech) {
      const tech = TECH_BY_ID.get(next.requiresTech);
      check(!!tech, next.id + ' requires unknown tech ' + next.requiresTech);
      if (tech) {
        const unlocked = (tech.unlocks && tech.unlocks.ships) || [];
        check(unlocked.includes(next.id), next.id + ' not listed in ' + tech.id + ' unlocks.ships');
      }
    }
  }
  // Counter-roles must be non-empty for non-flagship progression readability
  check(Array.isArray(row.counterRoles) && row.counterRoles.length > 0,
    def.id + ' needs at least one counter-role');
}

// ---- 6. Roles affect real derived behavior (not labels only) -------------------
const starter = getDerivedStats('ship_kestrel', [], null);
const wasp = getDerivedStats('ship_wasp', [], null);
const mule = getDerivedStats('ship_mule', [], null);
const hornet = getDerivedStats('ship_hornet', [], null);
const ironback = getDerivedStats('ship_ironback', [], null);

check(starter.roleIdentity && starter.roleIdentity.role === 'starter', 'starter roleIdentity');
check(starter.flightClass === 'scout', 'starter flightClass');
check(wasp.flightClass === 'fighter', 'wasp flightClass');
check(mule.flightClass === 'hauler', 'mule flightClass');
check(hornet.turnRate > wasp.turnRate, 'hornet should turn harder than wasp');
check(mule.operationalFeelMass > starter.operationalFeelMass, 'mule feel-mass > starter');
check(ironback.operationalFeelMass > mule.operationalFeelMass, 'ironback feel-mass > mule');
check(wasp.maxSpeed > mule.maxSpeed, 'fighter speed > freighter');
check(hornet.maxSpeed > ironback.maxSpeed, 'interceptor speed > barge');
// Starter remains forgiving: thrust/turn not worse than a bare mid hauler empty
check(starter.thrust > mule.thrust * 0.9, 'starter must stay thrust-forgiving vs mule');
check(starter.roleBiases.thrustBias >= 1.0, 'starter thrustBias must be >= 1');
check(starter.roleBiases.handlingBias >= 1.0, 'starter handlingBias must be >= 1');

// ships owner is sole derived authority
check(typeof getShipRoleIdentity === 'function', 'getShipRoleIdentity export');
const identity = getShipRoleIdentity('ship_wasp');
check(identity && identity.shortWhy && identity.dimensions, 'getShipRoleIdentity packet');
check(flightClassForHull(SHIP_BY_ID.get('ship_atlas')) === 'hauler', 'atlas flight class');

// ---- 7. Shipyard why + compare (real stats) ------------------------------------
const purchase = describeShipyardPurchase(SHIP_BY_ID.get('ship_pelican'), { credits: 22000 }, true);
check(purchase.state === 'available', 'pelican purchase available');
check(/mining|ore|drill|hardpoint/i.test(purchase.title + ' ' + describeHullRole('ship_pelican').shortWhy),
  'purchase/why must explain mining role');

const player = {
  credits: 100000,
  activeShipIndex: 0,
  ownedShips: [{ defId: 'ship_kestrel', fittings: fittingsFromDefaultModules('ship_kestrel', []) }],
  cargo: { usedMass: 0 },
};
const cmp = describeShipyardHullCompare(SHIP_BY_ID.get('ship_mule'), player);
check(cmp && cmp.kind === 'compare', 'shipyard compare vs owned');
check(cmp.compare && cmp.compare.rows.length >= 5, 'compare has real rows');
check(cmp.compare.rows.every((r) => Number.isFinite(r.candidate) && Number.isFinite(r.current)),
  'compare rows must be finite real stats');
const selfCmp = describeShipyardHullCompare(SHIP_BY_ID.get('ship_kestrel'), player);
check(selfCmp && selfCmp.kind === 'current', 'active hull compare is self');

const pureCmp = compareHulls('ship_hornet', 'ship_kestrel',
  getDerivedStats('ship_hornet', [], null),
  getDerivedStats('ship_kestrel', [], null));
check(pureCmp.rows.some((r) => r.label === 'Max speed' && r.tone === 'better'),
  'hornet should beat hitch on max speed in compare');

// ---- 8. Save/load continuity (fittings + derived recompute, no lattice serialize) -
function fingerprint(defId, fittings, cargoMass) {
  const p = { cargo: { usedMass: cargoMass }, efficiencyMods: {} };
  const d = getDerivedStats(defId, fittings, p);
  return {
    defId,
    fittings: fittings.slice(),
    hullMax: d.hullMax,
    shieldMax: d.shieldMax,
    cargoCap: d.cargoCap,
    thrust: round4(d.thrust),
    turnRate: round4(d.turnRate),
    maxSpeed: round4(d.maxSpeed),
    operationalMass: round4(d.operationalMass),
    operationalFeelMass: round4(d.operationalFeelMass),
    flightClass: d.flightClass,
    role: d.roleIdentity && d.roleIdentity.role,
  };
}
function round4(n) { return Math.round(Number(n) * 1e4) / 1e4; }

const saveBlob = {
  activeShipIndex: 0,
  ownedShips: [
    {
      defId: 'ship_drifter',
      fittings: fittingsFromDefaultModules('ship_drifter', [
        'wpn_pulse_laser_m', 'mod_engine_ion_m', 'mod_shield_booster_s',
      ]),
    },
  ],
};
// "Save" is only ownedShips + fittings; lattice is recomputed
const before = fingerprint(saveBlob.ownedShips[0].defId, saveBlob.ownedShips[0].fittings, 12);
const restored = JSON.parse(JSON.stringify(saveBlob));
const after = fingerprint(restored.ownedShips[0].defId, restored.ownedShips[0].fittings, 12);
assert.deepEqual(after, before, 'derived fingerprint must match across save/load roundtrip');
check(after.role === 'multirole', 'restored role identity');

// ---- 9. Twenty representative loadouts / seeds ---------------------------------
const ENGINE = 'mod_engine_ion_m';
const SHIELD_S = 'mod_shield_booster_s';
const SHIELD_M = 'mod_shield_capacitor_m';
const CARGO_M = MODULES.find((m) => m.id.includes('cargo') && m.size === 'M')?.id
  || MODULES.find((m) => m.slotType === 'cargo')?.id;
const MINE_S = MODULES.find((m) => m.slotType === 'mining' && m.size === 'S')?.id || 'mod_mining_laser_s';
const MINE_M = MODULES.find((m) => m.slotType === 'mining' && (m.size === 'M' || m.size === 'L'))?.id || MINE_S;
const WPN_S = 'wpn_pulse_laser_s';
const WPN_M = WEAPONS.find((w) => w.size === 'M')?.id || 'wpn_pulse_laser_m';
const WPN_L = WEAPONS.find((w) => w.size === 'L')?.id || WPN_M;

const LOADOUTS = [
  { seed: 1, defId: 'ship_kestrel', modules: [WPN_S, ENGINE, SHIELD_S, MINE_S], cargo: 0 },
  { seed: 2, defId: 'ship_kestrel', modules: [WPN_S, ENGINE, SHIELD_S, MINE_S], cargo: 20 },
  { seed: 3, defId: 'ship_pelican', modules: [WPN_S, ENGINE, SHIELD_S, MINE_S, MINE_M], cargo: 0 },
  { seed: 4, defId: 'ship_pelican', modules: [WPN_S, ENGINE, SHIELD_S, MINE_S, MINE_M], cargo: 40 },
  { seed: 5, defId: 'ship_wasp', modules: [WPN_S, WPN_S, ENGINE, SHIELD_M], cargo: 0 },
  { seed: 6, defId: 'ship_mule', modules: [WPN_S, ENGINE, SHIELD_M, CARGO_M].filter(Boolean), cargo: 0 },
  { seed: 7, defId: 'ship_mule', modules: [WPN_S, ENGINE, SHIELD_M, CARGO_M].filter(Boolean), cargo: 80 },
  { seed: 8, defId: 'ship_drifter', modules: [WPN_M, WPN_M, ENGINE, SHIELD_M, MINE_M], cargo: 10 },
  { seed: 9, defId: 'ship_hornet', modules: [WPN_M, WPN_M, WPN_M, ENGINE, SHIELD_M], cargo: 0 },
  { seed: 10, defId: 'ship_ironback', modules: [WPN_M, ENGINE, SHIELD_M, MINE_M, MINE_M], cargo: 60 },
  { seed: 11, defId: 'ship_bastion', modules: [WPN_L, WPN_L, WPN_L, ENGINE, SHIELD_M], cargo: 0 },
  { seed: 12, defId: 'ship_atlas', modules: [WPN_M, ENGINE, SHIELD_M, CARGO_M].filter(Boolean), cargo: 0 },
  { seed: 13, defId: 'ship_atlas', modules: [WPN_M, ENGINE, SHIELD_M, CARGO_M].filter(Boolean), cargo: 200 },
  { seed: 14, defId: 'ship_ranger', modules: [WPN_M, WPN_M, ENGINE, SHIELD_M], cargo: 15 },
  { seed: 15, defId: 'ship_warden', modules: [WPN_L, WPN_L, WPN_L, ENGINE, SHIELD_M], cargo: 0 },
  { seed: 16, defId: 'ship_colossus', modules: [WPN_L, WPN_L, WPN_L, ENGINE, SHIELD_M], cargo: 40 },
  { seed: 17, defId: 'ship_leviathan', modules: [WPN_L, WPN_L, WPN_L, ENGINE, SHIELD_M], cargo: 0 },
  { seed: 18, defId: 'ship_wasp', modules: [WPN_S, ENGINE], cargo: 5 },
  { seed: 19, defId: 'ship_hornet', modules: [WPN_M, ENGINE, SHIELD_S], cargo: 0 },
  { seed: 20, defId: 'ship_drifter', modules: [ENGINE, SHIELD_S, CARGO_M].filter(Boolean), cargo: 30 },
];

check(LOADOUTS.length === 20, 'need exactly 20 loadout cases');

const digests = [];
for (const case_ of LOADOUTS) {
  const fittings = fittingsFromDefaultModules(case_.defId, case_.modules);
  const slots = buildSlotList(SHIP_BY_ID.get(case_.defId));
  check(fittings.length === slots.length, case_.defId + ' fittings parallel slots');
  const a = fingerprint(case_.defId, fittings, case_.cargo);
  const b = fingerprint(case_.defId, fittings, case_.cargo);
  assert.deepEqual(a, b, 'loadout seed ' + case_.seed + ' non-deterministic');
  // Re-fit path: stringify fittings like a save
  const re = fingerprint(case_.defId, JSON.parse(JSON.stringify(fittings)), case_.cargo);
  assert.deepEqual(re, a, 'loadout seed ' + case_.seed + ' save continuity');
  check(a.flightClass === flightClassForHull(case_.defId), 'flightClass authority seed ' + case_.seed);
  check(!!a.role, 'role present seed ' + case_.seed);
  check(a.thrust > 0 && a.turnRate > 0 && a.maxSpeed > 0, 'positive flight seed ' + case_.seed);
  // Loaded haulers/miners must feel heavier
  if (case_.cargo > 0) {
    const empty = fingerprint(case_.defId, fittings, 0);
    check(a.operationalMass > empty.operationalMass, 'cargo raises mass seed ' + case_.seed);
    check(a.thrust <= empty.thrust + 1e-6, 'cargo must not raise thrust seed ' + case_.seed);
  }
  digests.push(createHash('sha256').update(JSON.stringify(a)).digest('hex').slice(0, 12));
}
check(new Set(digests).size === digests.length, 'all 20 loadout digests must be unique');

// Biases band safety
for (const id of LATTICE_SHIP_IDS) {
  const b = roleOperationalBiases(id);
  for (const k of Object.keys(b)) {
    check(b[k] >= 0.8 && b[k] <= 1.2, id + ' bias ' + k + ' out of band');
  }
}

// Visuals untouched: every hull still has visuals block with family
for (const def of SHIPS) {
  check(def.visuals && def.visuals.family, def.id + ' must retain authored visuals.family');
}

// ---- report --------------------------------------------------------------------
if (FAIL.length) {
  console.error('FAIL ship role lattice (' + FAIL.length + '):');
  for (const f of FAIL) console.error('  - ' + f);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  schema: LATTICE_SCHEMA_ID,
  hulls: 13,
  roles: roles.size,
  tiers: [...tiers].sort((a, b) => a - b),
  dominated: 0,
  loadouts: LOADOUTS.length,
  uniqueDigests: digests.length,
  starterThrustBias: starter.roleBiases.thrustBias,
  sample: {
    hitch: { flightClass: starter.flightClass, thrust: round4(starter.thrust) },
    wasp: { flightClass: wasp.flightClass, maxSpeed: round4(wasp.maxSpeed) },
    mule: { flightClass: mule.flightClass, feelMass: round4(mule.operationalFeelMass) },
  },
}, null, 2));
console.log('Ship role lattice OK — 13 hulls, no same-tier domination, 20 loadouts deterministic.');
