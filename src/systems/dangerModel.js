// Coupled offscreen world model: a deterministic reaction-diffusion field on the sector graph.
//
// This module is deliberately pure. It knows nothing about the event bus, DOM, entities, or saves.
// Given the same graph, field, impulses, seed, and elapsed simulated time, it returns the same next
// field. sectorSim.js is the runtime adapter; headless tools/tests can exercise this kernel directly.
//
// State variables per sector node:
//   danger        ∈ [0, 1]   aggregate hostile exposure / lane failure pressure
//   pricePressure ∈ [-1, 1]  scarcity (+) versus surplus (-)
//   influence[f]  ∈ simplex  faction territorial/economic influence shares
//
// The update is a bounded explicit integration of coupled graph-Laplacian flow plus local reaction
// terms. It is O((V + E) * factions * substeps), not a ship/agent simulation.
import { hash32 } from '../core/rng.js';
import { dangerIndex } from '../data/sectors.js';

export const SECTOR_FIELD_VERSION = 1;
export const MAX_MODEL_SUBSTEP_DAYS = 0.25;

const EPS = 1e-9;
const UINT32 = 4294967296;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// The coefficients are identities, not content events. They encode how a faction changes the medium:
// Concord projects order, Reach creates predatory feedback, Meridian increases trade conductivity,
// and Vael territory is dangerous and hydraulically closed. Other factions get conservative defaults.
export const FACTION_DYNAMICS = Object.freeze({
  faction_scn: Object.freeze({ mobility: 1.08, anchor: 1.12, tradeConductivity: 0.95, closure: 0.00 }),
  faction_mts: Object.freeze({ mobility: 1.02, anchor: 1.00, tradeConductivity: 1.85, closure: 0.00 }),
  faction_dmc: Object.freeze({ mobility: 0.86, anchor: 1.08, tradeConductivity: 1.05, closure: 0.00 }),
  faction_reach: Object.freeze({ mobility: 1.18, anchor: 0.92, tradeConductivity: 0.65, closure: 0.00 }),
  faction_quiet: Object.freeze({ mobility: 1.00, anchor: 0.82, tradeConductivity: 1.15, closure: 0.08 }),
  faction_vael: Object.freeze({ mobility: 0.16, anchor: 1.38, tradeConductivity: 0.24, closure: 0.84 }),
  faction_free: Object.freeze({ mobility: 0.92, anchor: 0.88, tradeConductivity: 1.00, closure: 0.00 }),
  faction_choir: Object.freeze({ mobility: 0.72, anchor: 1.12, tradeConductivity: 0.72, closure: 0.04 }),
});

const DEFAULT_DYNAMICS = Object.freeze({
  mobility: 0.82, anchor: 0.90, tradeConductivity: 0.90, closure: 0,
});

// Continuous-time coefficients, expressed per simulated day. Integration is split into bounded
// substeps, so a 4-day catch-up follows the same trajectory as sixteen 0.25-day headless steps.
const COEFF = Object.freeze({
  dangerDiffusion: 0.18,
  dangerReversion: 0.13,
  concordSuppression: 0.22,
  reachProduction: 0.27,
  vaelFrontierPull: 0.34,
  contestHeat: 0.085,
  scarcityHeat: 0.045,

  priceDiffusion: 0.28,
  priceDecay: 0.24,
  dangerToScarcity: 0.12,
  reachToScarcity: 0.045,
  dmcSupply: 0.035,
  vaelIsolationScarcity: 0.035,

  influenceDiffusion: 0.21,
  influenceAnchor: 0.13,
});

/**
 * Compile static sector data into a stable graph. Edges are undirected and sorted, making the result
 * independent of catalog iteration order. `wormholeTo` is represented as a low-conductance edge.
 */
export function buildSectorGraph(sectors) {
  const ordered = (Array.isArray(sectors) ? sectors : Object.values(sectors || {}))
    .filter((s) => s && s.id)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(ordered.map((s) => [s.id, s]));
  const nodes = ordered.map((s) => ({
    id: s.id,
    baseDanger: clamp(dangerIndex(s), 0, 1),
    tier: Number.isFinite(s.tier) ? s.tier : 0,
    stationCount: Array.isArray(s.stations) ? s.stations.length : 0,
    nativeFactionId: s.factionId || null,
    sector: s,
  }));
  const edgeMap = new Map();

  const addEdge = (aId, bId, kind) => {
    if (!aId || !bId || aId === bId || !byId.has(aId) || !byId.has(bId)) return;
    const lo = aId < bId ? aId : bId;
    const hi = aId < bId ? bId : aId;
    const key = `${lo}|${hi}`;
    const prev = edgeMap.get(key);
    if (prev && prev.kind === 'route') return; // authored route outranks a wormhole duplicate

    const a = byId.get(lo), b = byId.get(hi);
    const ap = a.position || { x: 0, y: 0 };
    const bp = b.position || { x: 0, y: 0 };
    const dx = (bp.x || 0) - (ap.x || 0);
    const dy = (bp.y || 0) - (ap.y || 0);
    const mapDistance = Math.sqrt(dx * dx + dy * dy);
    const infra = 0.82 + 0.06 * (((a.stations || []).length) + ((b.stations || []).length));
    const routeConductance = clamp(infra / (1 + mapDistance * 0.12), 0.22, 1.15);
    edgeMap.set(key, {
      id: key,
      a: lo,
      b: hi,
      kind,
      conductance: kind === 'wormhole' ? routeConductance * 0.20 : routeConductance,
      tradeConductance: kind === 'wormhole' ? routeConductance * 0.10 : routeConductance * infra,
    });
  };

  for (const s of ordered) {
    for (const nb of (s.neighbors || [])) addEdge(s.id, nb, 'route');
    if (s.wormholeTo && s.wormholeTo.sectorId) addEdge(s.id, s.wormholeTo.sectorId, 'wormhole');
  }

  const edges = Array.from(edgeMap.values()).sort((a, b) => a.id.localeCompare(b.id));
  const adjacency = Object.create(null);
  for (const n of nodes) adjacency[n.id] = [];
  for (const e of edges) {
    adjacency[e.a].push(e);
    adjacency[e.b].push(e);
  }
  for (const id of Object.keys(adjacency)) adjacency[id].sort((a, b) => a.id.localeCompare(b.id));

  return { nodes, edges, adjacency, byId };
}

/** Create the canonical field for a new game or a migrated save. */
export function createSectorField({ graph, sectors, factionMeta = [], ownerBySector = {}, seed = 1 } = {}) {
  graph = graph || buildSectorGraph(sectors || []);
  const factionIds = stableFactionIds(factionMeta);
  const metaById = new Map(factionMeta.map((f) => [f.id, f]));
  const nodes = Object.create(null);

  for (const node of graph.nodes) {
    const s = node.sector;
    const structuralBias = signedHash(seed, 'sector-field', node.id) * 0.024;
    const danger = clamp(node.baseDanger + structuralBias, 0.02, 0.98);
    const pricePressure = clamp((node.baseDanger - 0.45) * 0.055 + structuralBias * 0.7, -0.16, 0.16);
    const influence = seedInfluence(s, factionIds, metaById, ownerBySector[node.id], seed);
    const rank = rankInfluence(influence);
    nodes[node.id] = {
      danger,
      pricePressure,
      influence,
      dominantFactionId: rank.firstId,
      dominantInfluence: rank.first,
      contestMargin: rank.margin,
      trend: { danger: 0, pricePressure: 0, influence: 0 },
      driver: { danger: 'structural_baseline', pricePressure: 'market_balance', influence: 'territorial_anchor' },
    };
  }

  return { version: SECTOR_FIELD_VERSION, epochDays: 0, nodes };
}

/**
 * Advance the coupled field. This function does not mutate `field`, `graph`, or any external state.
 * Impulses are applied once at the start, in a stable order, then the ODE/map is integrated.
 */
export function stepSectorField({
  graph,
  field,
  sectors,
  factionMeta = [],
  ownerBySector = {},
  factionPower = {},
  impulses = [],
  seed = 1,
  dtDays = 1,
} = {}) {
  graph = graph || buildSectorGraph(sectors || []);
  const factionIds = stableFactionIds(factionMeta);
  const metaById = new Map(factionMeta.map((f) => [f.id, f]));
  const baseField = healField(field, { graph, factionMeta, ownerBySector, seed });
  const start = cloneNodes(baseField.nodes, factionIds);
  let work = cloneNodes(baseField.nodes, factionIds);
  const impulseKinds = latestImpulseKindBySector(impulses);

  applyImpulses(work, impulses, factionIds);

  const totalDays = Math.max(0, Number(dtDays) || 0);
  if (totalDays > 0) {
    const steps = Math.max(1, Math.ceil(totalDays / MAX_MODEL_SUBSTEP_DAYS));
    const h = totalDays / steps;
    for (let i = 0; i < steps; i++) {
      work = integrateSubstep({
        graph, nodes: work, factionIds, metaById, ownerBySector, factionPower, h, seed,
      });
    }
  }

  const out = Object.create(null);
  for (const node of graph.nodes) {
    const id = node.id;
    const next = work[id];
    const before = start[id] || next;
    const rank = rankInfluence(next.influence);
    // An instantaneous impulse has a finite reporting horizon; never manufacture a 1e9/day trend.
    const days = Math.max(totalDays, MAX_MODEL_SUBSTEP_DAYS);
    const oldDominant = before.dominantFactionId || rankInfluence(before.influence).firstId;
    const oldDominantShare = (before.influence && before.influence[rank.firstId]) || 0;
    const influenceTrend = (rank.first - oldDominantShare) / days;
    const trend = {
      danger: (next.danger - before.danger) / days,
      pricePressure: (next.pricePressure - before.pricePressure) / days,
      influence: influenceTrend,
    };
    out[id] = {
      danger: next.danger,
      pricePressure: next.pricePressure,
      influence: next.influence,
      dominantFactionId: rank.firstId,
      dominantInfluence: rank.first,
      contestMargin: rank.margin,
      trend,
      driver: classifyDrivers(next, trend, rank, oldDominant, impulseKinds[id]),
    };
  }

  return {
    version: SECTOR_FIELD_VERSION,
    epochDays: (Number(baseField.epochDays) || 0) + totalDays,
    nodes: out,
  };
}

/** Return a plain, stable read model for UI/gameplay consumers. */
export function readSectorField(field, sectorId) {
  const n = field && field.nodes && field.nodes[sectorId];
  if (!n) return null;
  return {
    danger: clamp(Number(n.danger) || 0, 0, 1),
    pricePressure: clamp(Number(n.pricePressure) || 0, -1, 1),
    influence: { ...(n.influence || {}) },
    dominantFactionId: n.dominantFactionId || rankInfluence(n.influence || {}).firstId,
    dominantInfluence: Number(n.dominantInfluence) || 0,
    contestMargin: Number(n.contestMargin) || 0,
    trend: { danger: 0, pricePressure: 0, influence: 0, ...(n.trend || {}) },
    driver: { danger: 'structural_baseline', pricePressure: 'market_balance', influence: 'territorial_anchor', ...(n.driver || {}) },
  };
}

/** Deterministic hash for audit snapshots; not used as simulation entropy. */
export function sectorFieldDigest(field) {
  const nodes = (field && field.nodes) || {};
  const parts = [];
  for (const id of Object.keys(nodes).sort()) {
    const n = nodes[id];
    parts.push(id, quantize(n.danger), quantize(n.pricePressure));
    for (const fid of Object.keys(n.influence || {}).sort()) parts.push(fid, quantize(n.influence[fid]));
  }
  return hash32(...parts) >>> 0;
}

function integrateSubstep({ graph, nodes, factionIds, metaById, ownerBySector, factionPower, h, seed }) {
  const dDanger = Object.create(null);
  const dPrice = Object.create(null);
  const dInfluence = Object.create(null);
  for (const node of graph.nodes) {
    dDanger[node.id] = 0;
    dPrice[node.id] = 0;
    dInfluence[node.id] = Object.fromEntries(factionIds.map((id) => [id, 0]));
  }

  // Conservative edge flows: every amount added to A is subtracted from B. Local reactions below are
  // the only sources/sinks. That distinction is what makes propagation a model rather than jitter.
  for (const edge of graph.edges) {
    const a = nodes[edge.a], b = nodes[edge.b];
    if (!a || !b) continue;
    const avgDanger = (a.danger + b.danger) * 0.5;
    const vael = Math.max(a.influence.faction_vael || 0, b.influence.faction_vael || 0);
    const closure = clamp(1 - vael * FACTION_DYNAMICS.faction_vael.closure, 0.10, 1);
    const open = edge.conductance * closure;

    const dangerFlux = COEFF.dangerDiffusion * open * (b.danger - a.danger);
    dDanger[edge.a] += dangerFlux;
    dDanger[edge.b] -= dangerFlux;

    const meridian = ((a.influence.faction_mts || 0) + (b.influence.faction_mts || 0)) * 0.5;
    const conductivity = edge.tradeConductance
      * closure
      * clamp(0.42 + meridian * FACTION_DYNAMICS.faction_mts.tradeConductivity, 0.30, 2.15)
      * clamp(1 - avgDanger * 0.55, 0.28, 1);
    const priceFlux = COEFF.priceDiffusion * conductivity * (b.pricePressure - a.pricePressure);
    dPrice[edge.a] += priceFlux;
    dPrice[edge.b] -= priceFlux;

    for (const fid of factionIds) {
      const dyn = dynamicsFor(fid);
      const power = powerScale(factionPower[fid]);
      let context = 0.72;
      if (fid === 'faction_scn') context = 0.48 + (1 - avgDanger) * 0.94;
      else if (fid === 'faction_reach') context = 0.44 + avgDanger * 1.12;
      else if (fid === 'faction_mts') context = 0.42 + conductivity * 0.84;
      else if (fid === 'faction_quiet') context = 0.62 + avgDanger * 0.42;
      else if (fid === 'faction_vael') context = 0.12;
      const mobility = dyn.mobility * context * power;
      const flux = COEFF.influenceDiffusion * open * mobility * ((b.influence[fid] || 0) - (a.influence[fid] || 0));
      dInfluence[edge.a][fid] += flux;
      dInfluence[edge.b][fid] -= flux;
    }
  }

  const next = Object.create(null);
  for (const node of graph.nodes) {
    const id = node.id;
    const n = nodes[id];
    const influence = n.influence;
    const scn = influence.faction_scn || 0;
    const reach = influence.faction_reach || 0;
    const mts = influence.faction_mts || 0;
    const dmc = influence.faction_dmc || 0;
    const vael = influence.faction_vael || 0;
    const rank = rankInfluence(influence);
    const contest = contestIntensity(rank.margin);
    const structuralBias = signedHash(seed, 'sector-structure', id) * 0.012;
    const structuralTarget = clamp(node.baseDanger + structuralBias, 0.02, 0.98);

    dDanger[id] += COEFF.dangerReversion * (structuralTarget - n.danger);
    dDanger[id] -= COEFF.concordSuppression * scn * Math.max(0, n.danger - 0.06);
    dDanger[id] += COEFF.reachProduction * reach * (1 - n.danger);
    dDanger[id] += COEFF.vaelFrontierPull * vael * Math.max(0, Math.max(0.82, node.baseDanger) - n.danger);
    dDanger[id] += COEFF.contestHeat * contest * (1 - n.danger);
    dDanger[id] += COEFF.scarcityHeat * Math.max(0, n.pricePressure) * (1 - n.danger);

    const priceDecay = COEFF.priceDecay * (1 - 0.38 * mts);
    dPrice[id] += -priceDecay * n.pricePressure;
    dPrice[id] += COEFF.dangerToScarcity * (n.danger - node.baseDanger);
    dPrice[id] += COEFF.reachToScarcity * reach * n.danger;
    dPrice[id] -= COEFF.dmcSupply * dmc * (0.6 + node.stationCount * 0.10);
    dPrice[id] += COEFF.vaelIsolationScarcity * vael * Math.max(0, n.danger - 0.45);

    const anchor = influenceAnchor(node.sector, factionIds, metaById, ownerBySector[id]);
    for (const fid of factionIds) {
      const dyn = dynamicsFor(fid);
      const p = powerScale(factionPower[fid]);
      dInfluence[id][fid] += COEFF.influenceAnchor * dyn.anchor * p * (anchor[fid] - (influence[fid] || 0));
    }

    const nextInfluence = Object.create(null);
    for (const fid of factionIds) nextInfluence[fid] = Math.max(EPS, (influence[fid] || 0) + h * dInfluence[id][fid]);
    normalizeInPlace(nextInfluence, factionIds);

    next[id] = {
      danger: clamp(n.danger + h * dDanger[id], 0.02, 1),
      pricePressure: clamp(n.pricePressure + h * dPrice[id], -1, 1),
      influence: nextInfluence,
    };
  }
  return next;
}

function healField(field, opts) {
  const fresh = createSectorField(opts);
  if (!field || typeof field !== 'object' || !field.nodes) return fresh;
  const factionIds = stableFactionIds(opts.factionMeta || []);
  const nodes = Object.create(null);
  for (const node of opts.graph.nodes) {
    const base = fresh.nodes[node.id];
    const old = field.nodes[node.id];
    if (!old) { nodes[node.id] = base; continue; }
    const influence = Object.create(null);
    for (const fid of factionIds) influence[fid] = Math.max(EPS, Number(old.influence && old.influence[fid]) || 0);
    normalizeInPlace(influence, factionIds);
    const rank = rankInfluence(influence);
    nodes[node.id] = {
      danger: clamp(Number.isFinite(Number(old.danger)) ? Number(old.danger) : base.danger, 0.02, 1),
      pricePressure: clamp(Number(old.pricePressure) || 0, -1, 1),
      influence,
      dominantFactionId: old.dominantFactionId || rank.firstId,
      dominantInfluence: Number(old.dominantInfluence) || rank.first,
      contestMargin: Number(old.contestMargin) || rank.margin,
      trend: { danger: 0, pricePressure: 0, influence: 0, ...(old.trend || {}) },
      driver: { danger: 'structural_baseline', pricePressure: 'market_balance', influence: 'territorial_anchor', ...(old.driver || {}) },
    };
  }
  return { version: SECTOR_FIELD_VERSION, epochDays: Number(field.epochDays) || 0, nodes };
}

function seedInfluence(sector, factionIds, metaById, runtimeOwner, seed) {
  const out = Object.create(null);
  for (const fid of factionIds) out[fid] = 0.003 + unsignedHash(seed, sector.id, fid) * 0.001;
  const owner = runtimeOwner || sector.factionId;
  if (owner && out[owner] != null) out[owner] += 0.50;
  if (sector.factionId && out[sector.factionId] != null) out[sector.factionId] += 0.12;
  for (const st of (sector.stations || [])) if (st.factionId && out[st.factionId] != null) out[st.factionId] += 0.075;
  for (const fid of factionIds) {
    const meta = metaById.get(fid);
    if (meta && (meta.homeSectors || []).includes(sector.id)) out[fid] += fid === 'faction_vael' ? 0.30 : 0.20;
  }
  normalizeInPlace(out, factionIds);
  return out;
}

function influenceAnchor(sector, factionIds, metaById, runtimeOwner) {
  const out = Object.fromEntries(factionIds.map((id) => [id, 0.006]));
  const owner = runtimeOwner || sector.factionId;
  if (owner && out[owner] != null) out[owner] += 0.42;
  if (sector.factionId && out[sector.factionId] != null) out[sector.factionId] += 0.09;
  for (const st of (sector.stations || [])) if (st.factionId && out[st.factionId] != null) out[st.factionId] += 0.055;
  for (const fid of factionIds) {
    const meta = metaById.get(fid);
    if (meta && (meta.homeSectors || []).includes(sector.id)) out[fid] += fid === 'faction_vael' ? 0.26 : 0.15;
  }
  normalizeInPlace(out, factionIds);
  return out;
}

function applyImpulses(nodes, impulses, factionIds) {
  const ordered = (Array.isArray(impulses) ? impulses : [])
    .filter((x) => x && x.sectorId && nodes[x.sectorId])
    .slice()
    .sort((a, b) => ((a.seq || 0) - (b.seq || 0)) || String(a.kind || '').localeCompare(String(b.kind || '')) || a.sectorId.localeCompare(b.sectorId));
  for (const impulse of ordered) {
    const n = nodes[impulse.sectorId];
    n.danger = clamp(n.danger + (Number(impulse.danger) || 0), 0.02, 1);
    n.pricePressure = clamp(n.pricePressure + (Number(impulse.pricePressure) || 0), -1, 1);
    const deltas = impulse.influence || (impulse.factionId ? { [impulse.factionId]: Number(impulse.influenceDelta) || 0 } : null);
    if (deltas) {
      for (const fid of factionIds) n.influence[fid] = Math.max(EPS, (n.influence[fid] || 0) + (Number(deltas[fid]) || 0));
      normalizeInPlace(n.influence, factionIds);
    }
  }
}


function latestImpulseKindBySector(impulses) {
  const out = Object.create(null);
  const ordered = (Array.isArray(impulses) ? impulses : [])
    .filter((x) => x && x.sectorId)
    .slice()
    .sort((a, b) => ((a.seq || 0) - (b.seq || 0)) || String(a.kind || '').localeCompare(String(b.kind || '')) || a.sectorId.localeCompare(b.sectorId));
  for (const impulse of ordered) out[impulse.sectorId] = String(impulse.kind || 'external');
  return out;
}

function classifyDrivers(n, trend, rank, oldDominant, impulseKind) {
  const scn = n.influence.faction_scn || 0;
  const reach = n.influence.faction_reach || 0;
  const mts = n.influence.faction_mts || 0;
  const vael = n.influence.faction_vael || 0;
  let danger = 'graph_flow';
  if (vael > 0.38 && n.danger > 0.62) danger = 'vael_frontier';
  else if (trend.danger < -0.0015 && scn > 0.20) danger = 'concord_patrols';
  else if (trend.danger > 0.0015 && reach > 0.18) danger = 'reach_pressure';
  else if (contestIntensity(rank.margin) > 0.55) danger = 'contested_space';
  else if (Math.abs(trend.danger) < 0.002) danger = 'structural_baseline';

  let pricePressure = 'market_balance';
  if (Math.abs(trend.pricePressure) > 0.008 && mts > 0.18) pricePressure = 'meridian_transmission';
  else if (n.pricePressure > 0.12) pricePressure = 'route_scarcity';
  else if (n.pricePressure < -0.12) pricePressure = 'route_surplus';

  let influence = rank.firstId !== oldDominant ? 'territorial_shift'
    : contestIntensity(rank.margin) > 0.55 ? 'contested_influence'
      : 'territorial_anchor';

  // Recent impulses are causal annotations, not alternate simulation rules. They make the public read
  // contract explain *why* a field moved while the reaction-diffusion kernel still owns the motion.
  if (impulseKind === 'trade') pricePressure = 'trade_shock';
  else if (impulseKind === 'territory_flip') influence = 'territory_flip';
  else if (impulseKind === 'hostile_kill') { danger = 'combat_suppression'; influence = 'combat_attrition'; }
  else if (impulseKind === 'lawful_kill') { danger = 'combat_disruption'; influence = 'combat_attrition'; }
  else if (impulseKind === 'infrastructure_loss' || impulseKind === 'base_destroyed') {
    danger = 'infrastructure_disruption'; pricePressure = 'infrastructure_disruption'; influence = 'combat_attrition';
  } else if (impulseKind === 'interdiction') danger = 'interdiction_wave';
  else if (impulseKind === 'transit_incident') danger = 'transit_incident';
  return { danger, pricePressure, influence };
}

function cloneNodes(nodes, factionIds) {
  const out = Object.create(null);
  for (const id of Object.keys(nodes || {})) {
    const n = nodes[id];
    const influence = Object.create(null);
    for (const fid of factionIds) influence[fid] = Math.max(EPS, Number(n.influence && n.influence[fid]) || 0);
    normalizeInPlace(influence, factionIds);
    out[id] = {
      danger: clamp(Number.isFinite(Number(n.danger)) ? Number(n.danger) : 0.5, 0.02, 1),
      pricePressure: clamp(Number(n.pricePressure) || 0, -1, 1),
      influence,
      dominantFactionId: n.dominantFactionId || null,
    };
  }
  return out;
}

function stableFactionIds(factionMeta) {
  return factionMeta.map((f) => f && f.id).filter(Boolean).sort();
}

function dynamicsFor(id) { return FACTION_DYNAMICS[id] || DEFAULT_DYNAMICS; }

function powerScale(power) {
  const p = Number(power);
  if (!Number.isFinite(p)) return 1;
  return clamp(0.62 + p / 45, 0.55, 1.65);
}

function contestIntensity(margin) { return clamp((0.32 - margin) / 0.32, 0, 1); }

function rankInfluence(influence) {
  const ranked = Object.entries(influence || {}).sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
  const firstId = ranked[0] ? ranked[0][0] : null;
  const first = ranked[0] ? ranked[0][1] : 0;
  const second = ranked[1] ? ranked[1][1] : 0;
  return { firstId, first, second, margin: Math.max(0, first - second) };
}

function normalizeInPlace(values, ids) {
  let sum = 0;
  for (const id of ids) sum += Math.max(EPS, Number(values[id]) || 0);
  if (!(sum > 0)) {
    const v = ids.length ? 1 / ids.length : 0;
    for (const id of ids) values[id] = v;
    return values;
  }
  for (const id of ids) values[id] = Math.max(EPS, Number(values[id]) || 0) / sum;
  return values;
}

function unsignedHash(...parts) { return (hash32(...parts) >>> 0) / UINT32; }
function signedHash(...parts) { return unsignedHash(...parts) * 2 - 1; }
function quantize(v) { return Math.round((Number(v) || 0) * 1e6); }
