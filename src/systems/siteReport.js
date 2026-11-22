// src/systems/siteReport.js: what a worked rock amounts to, seen from outside.
//
// PURE. No state writes, no rng, no clock, no Three.js, no DOM. Everything here is derived from
// the saved site record and its contact rings, so nothing new is saved and a claim made before
// this file existed reads the same as one made after.
//
// Two questions, the ones the belt view and the rover's way out both ask:
//   1. How well was this rock dug?  `siteSeating`: the share of the rock each machine could be
//      touching that it does touch. Careless digging lowers it for good; packed fill buys it back.
//   2. What do its neighbours do for it?  `neighbourLift`: every rock of ANOTHER trade joined to
//      this one by a cargo or power line speeds its machines, by more the better that neighbour
//      was dug. A belt of five identical extractor rocks earns nothing here; a mixed, well-dug
//      cluster does. This is the outside half of the board's puzzle.
import {
  CONTACT_RULES, CONTACT_YIELD, NEIGHBOUR_RULES, SITE_BALANCE, SITE_MACHINE_BY_ID, SITE_RECIPE_BY_ID,
  classifySiteSpecialization,
} from '../data/sites.js';

const round3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

/** Share (0..1) of its useful rock one machine is touching, or null when it reads no rock. */
export function machineSeating(machine, profile) {
  const def = machine && SITE_MACHINE_BY_ID.get(machine.defId);
  if (!def || !profile) return null;
  if (def.id === 'sm_extractor') {
    return clamp01((profile.solid || 0) / NEIGHBOUR_RULES.fullSeat.extractor);
  }
  if (def.id === 'sm_gas_tap') {
    const gas = (profile.gas || 0) + (profile.vented || 0) * CONTACT_YIELD.ventedGasFraction;
    return clamp01(gas / NEIGHBOUR_RULES.fullSeat.gasTap);
  }
  const recipe = SITE_RECIPE_BY_ID.get(machine.mode);
  const reads = recipe && recipe.machine === def.id
    && ((recipe.contactKinds || []).length || (recipe.contactOres || []).length);
  const cooled = CONTACT_RULES.cooledMachines.includes(def.id);
  if (!reads && !cooled) return null;
  const ores = profile.ores || {};
  const matched = reads
    ? (recipe.contactKinds || []).reduce((n, kind) => n + (profile[kind] || 0), 0)
      + (recipe.contactOres || []).reduce((n, ore) => n + (ores[ore] || 0), 0)
    : 0;
  const ice = cooled ? (ores[CONTACT_RULES.coolantOre] || 0) : 0;
  // Full marks at the matched faces that max the bonus, or at two ice cells, or a mix of both.
  const fullFaces = SITE_BALANCE.maxProcessBonus / SITE_BALANCE.processBonusPerContact;
  return clamp01((matched + ice * (fullFaces / 2)) / fullFaces);
}

export function seatingGrade(share) {
  if (share == null) return null;
  const table = NEIGHBOUR_RULES.grades;
  for (const row of table) if (share >= row.min) return row.id;
  return table[table.length - 1].id;
}

/**
 * How well a whole rock was dug.
 * @param site           saved site record (machines)
 * @param geoByMachine   contact profile per machine id (the runtime's `geo`)
 * @returns {{ share:number|null, grade:string|null, counted:number, machines:Array }}
 */
export function siteSeating(site, geoByMachine = {}) {
  const rows = [];
  for (const m of (site && Array.isArray(site.machines)) ? site.machines : []) {
    const share = machineSeating(m, geoByMachine[m.id]);
    if (share != null) rows.push({ id: m.id, defId: m.defId, share: round3(share) });
  }
  if (!rows.length) return { share: null, grade: null, counted: 0, machines: rows };
  const share = round3(rows.reduce((s, r) => s + r.share, 0) / rows.length);
  return { share, grade: seatingGrade(share), counted: rows.length, machines: rows };
}

const NO_LIFT = Object.freeze({ mult: 1, rows: Object.freeze([]), linked: 0 });

/**
 * What this rock's neighbours do for it.
 * A neighbour is a claimed rock in the same sector joined to this one by an active line in either
 * direction. Each TRADE (role) other than this rock's own counts once, at its best-dug example.
 * @param site        saved site record
 * @param sitesById   state.sites.byId
 * @param shareOf     (otherSite) => seating share 0..1 or null
 * @returns {{ mult:number, linked:number, rows:Array<{siteId,asteroidId,roleId,label,share,grade,lift}> }}
 */
export function neighbourLift(site, sitesById, shareOf) {
  if (!site || !sitesById) return NO_LIFT;
  const linkedIds = new Set();
  for (const l of Array.isArray(site.links) ? site.links : []) {
    if (l && l.active !== false && l.targetSiteId) linkedIds.add(l.targetSiteId);
  }
  for (const id of Object.keys(sitesById)) {
    const other = sitesById[id];
    if (!other || other.id === site.id) continue;
    for (const l of Array.isArray(other.links) ? other.links : []) {
      if (l && l.active !== false && l.targetSiteId === site.id) { linkedIds.add(other.id); break; }
    }
  }
  if (!linkedIds.size) return NO_LIFT;
  const ownRole = classifySiteSpecialization(site).id;
  const bestByRole = new Map();
  let linked = 0;
  for (const id of [...linkedIds].sort()) {
    const other = sitesById[id];
    if (!other || !other.anchored) continue;
    if (site.sectorId && other.sectorId && other.sectorId !== site.sectorId) continue;
    linked++;
    const role = classifySiteSpecialization(other);
    if (role.id === ownRole || role.id === 'outpost') continue;
    const raw = shareOf ? shareOf(other) : null;
    const share = raw == null ? NEIGHBOUR_RULES.plainShare : clamp01(raw);
    const prev = bestByRole.get(role.id);
    if (!prev || share > prev.share) {
      bestByRole.set(role.id, {
        siteId: other.id, asteroidId: other.asteroidId ?? null, roleId: role.id, label: role.label,
        share: round3(share), grade: raw == null ? null : seatingGrade(share),
        lift: round3(NEIGHBOUR_RULES.liftPerTrade * share),
      });
    }
  }
  const rows = [...bestByRole.values()]
    .sort((a, b) => (b.lift - a.lift) || (a.siteId < b.siteId ? -1 : 1))
    .slice(0, NEIGHBOUR_RULES.maxTrades);
  const mult = round3(1 + rows.reduce((s, r) => s + r.lift, 0));
  return { mult, rows, linked };
}

/**
 * The one summary of a worked rock: its trade, how well it was dug, what it makes and wants each
 * minute, the power it can spare, what its neighbours add, and the first thing holding it back.
 * `matrixRow` is this rock's row from computeSectorSupplyMatrix (the one flow ledger); the report
 * re-reads it and never recomputes a rate.
 */
export function buildRockReport({ specialization, seating, lift, matrixRow, machines = [], defenses = [] } = {}) {
  const prod = (matrixRow && matrixRow.prodByGood) || {};
  const cons = (matrixRow && matrixRow.consByGood) || {};
  const makes = [];
  const wants = [];
  for (const goodId of [...new Set([...Object.keys(prod), ...Object.keys(cons)])].sort()) {
    const net = round3((Number(prod[goodId]) || 0) - (Number(cons[goodId]) || 0));
    if (net > 0.04) makes.push({ goodId, perMin: net });
    else if (net < -0.04) wants.push({ goodId, perMin: round3(-net) });
  }
  makes.sort((a, b) => b.perMin - a.perMin || (a.goodId < b.goodId ? -1 : 1));
  wants.sort((a, b) => b.perMin - a.perMin || (a.goodId < b.goodId ? -1 : 1));
  const netMw = round3(matrixRow ? matrixRow.netMw : 0);
  let limit = null;
  for (const m of machines) {
    const l = m && m.status && m.status.limit;
    if (!l) continue;
    const kind = String(l).startsWith('input:') ? 'input' : l;
    if (!limit || (LIMIT_RANK[kind] || 9) < (LIMIT_RANK[limit.kind] || 9)) {
      limit = { kind, goodId: String(l).startsWith('input:') ? String(l).slice(6) : null };
    }
  }
  return {
    role: specialization || null,
    seating: seating || { share: null, grade: null, counted: 0, machines: [] },
    makes,
    wants,
    netMw,
    lift: lift || NO_LIFT,
    limit,
    defended: (matrixRow && Number(matrixRow.defenseRating)) || 0,
    guards: defenses.length,
  };
}

// Which stall a card names first: no power beats a missing input beats a full store.
const LIMIT_RANK = { power: 1, lane: 2, input: 3, export: 4 };
