// Read-only industry planning. This module never places machines, reserves cargo, runs a
// production tick, or writes saves. asteroidSites remains the only execution owner.
import { SITE_MACHINES, SITE_RECIPES, CONTACT_YIELD, SITE_BALANCE } from '../data/sites.js';

const EPS = 1e-9;
const MAX_QUANTITY = 1_000_000;
const MAX_EXPANSIONS = 4096;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const entries = (map) => Object.entries(map).sort(([a], [b]) => compare(a, b));
const own = (map, key) => Object.prototype.hasOwnProperty.call(map, key);
const dict = () => Object.create(null);
const safeId = (id) => typeof id === 'string' && /^[a-z][a-z0-9_]*$/.test(id)
  && !['__proto__', 'constructor', 'prototype'].includes(id);

function quantity(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_QUANTITY) {
    throw new RangeError(`${label}: quantity must be finite and between 0 and ${MAX_QUANTITY}`);
  }
  return value;
}
function copyAmounts(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label}: expected a quantity map`);
  const out = dict();
  for (const [id, n] of entries(value)) {
    if (!safeId(id)) throw new TypeError(`${label}: invalid id ${id}`);
    if (quantity(n, `${label}.${id}`) > 0) out[id] = n;
  }
  return out;
}
function add(map, id, n) {
  const total = (map[id] || 0) + n;
  quantity(total, id);
  if (total > EPS) map[id] = total;
}
function clean(map) {
  return Object.fromEntries(entries(map).filter(([, n]) => n > EPS));
}

// Per-asteroid, gross purchase manifests, not spatial blueprints or a promise of self-sufficiency.
// Keep initial controllers IMPORTED; a factory cannot manufacture the machine that bootstraps it.
export const INDUSTRY_KITS = Object.freeze([
  { id: 'first_claim', name: 'First working claim',
    machines: { sm_massline_core: 1, sm_extractor: 1 },
    note: 'Preserve an iron or silicate face beside a hollow, rover-accessible installation cell. Recover output with your ship.' },
  { id: 'refining', name: 'Refining outpost',
    machines: { sm_massline_core: 1, sm_extractor: 2, sm_gas_tap: 1, sm_refinery: 2 },
    note: 'One refinery smelts iron; the other fuses silica. Keep useful rock faces and sealed gas contacts intact.' },
  { id: 'courier', name: 'Courier production outpost',
    machines: { sm_massline_core: 1, sm_extractor: 2, sm_gas_tap: 2,
      sm_refinery: 2, sm_fabricator: 2, sm_cargo_port: 1 },
    note: 'Assign one fabricator to electronics and one to courier pods. Hold their feedstocks. This is a commissioning kit, not a guaranteed balanced factory.' },
]);

/** Gross installed kit and incremental packing list; caller must provide already-built truth. */
export function planSiteKit(kitId, { alreadyBuilt = {} } = {}) {
  const kit = INDUSTRY_KITS.find((k) => k.id === kitId);
  if (!kit) throw new RangeError(`Unknown industry kit: ${kitId}`);
  const built = copyAmounts(alreadyBuilt, 'alreadyBuilt');
  const defs = new Map(SITE_MACHINES.map((m) => [m.id, m]));
  for (const [id, n] of entries(built)) {
    if (!defs.has(id) || !Number.isInteger(n)) throw new RangeError(`Invalid installed machine count: ${id}`);
  }
  const manifest = dict();
  const missingMachines = dict();
  let drawMW = 0;
  let baseMW = 0;
  let machineCount = 0;
  for (const [id, count] of entries(kit.machines)) {
    const def = defs.get(id);
    if (!def) throw new Error(`Kit references missing machine: ${id}`);
    const missing = Math.max(0, count - (built[id] || 0));
    if (missing) missingMachines[id] = missing;
    for (const [good, qty] of entries(def.cost)) add(manifest, good, qty * missing);
    drawMW += Math.max(0, -def.power) * count;
    baseMW += Math.max(0, def.power) * count;
    machineCount += count;
  }
  return {
    id: kit.id, name: kit.name, note: kit.note,
    machines: { ...kit.machines }, missingMachines: clean(missingMachines),
    manifest: clean(manifest), machineCount,
    drawMW, baseMW,
    minimumGasContacts: Math.ceil(Math.max(0, drawMW - baseMW) / CONTACT_YIELD.gasPowerPerContact),
    laneThroughputPerMin: SITE_BALANCE.laneThroughputPerMin,
    // Placement and geology are intentionally NOT validated by a packing list.
    placementValidated: false,
  };
}

/** A visit's packing list: installed machines count once; only the ship's cargo offsets imports.
 * Disconnected site stores are deliberately not pooled into imaginary spendable stock. */
export function planSiteVisit(kitId, { machines = [], cargo = {} } = {}) {
  const alreadyBuilt = {};
  for (const machine of machines) {
    if (SITE_MACHINES.some((def) => def.id === machine.defId)) {
      alreadyBuilt[machine.defId] = (alreadyBuilt[machine.defId] || 0) + 1;
    }
  }
  const plan = planSiteKit(kitId, { alreadyBuilt });
  const packed = {};
  const missing = {};
  for (const [id, required] of Object.entries(plan.manifest)) {
    const available = Number(cargo[id]);
    const held = Number.isFinite(available) ? Math.max(0, available) : 0;
    if (held > 0) packed[id] = Math.min(required, held);
    if (held < required) missing[id] = required - held;
  }
  return { ...plan, packed, missing, ready: Object.keys(missing).length === 0 };
}

/**
 * Expand requested goods through the real recipe DAG (dependency graph).
 * A shared stock ledger prevents two branches spending the same ingot. Discrete builds round
 * up to whole batches and their surplus can fund later branches. Recipes never fund their own
 * inputs. Ambiguous producers require an explicit choice; cycles fail with their dependency path.
 *
 * `importGoods` cuts the graph at goods the player elects to bring, e.g. controllers at bootstrap.
 * `stock` is caller-selected inventory, NOT an automatic sum of disconnected site networks.
 * The ordered steps are a manufacturing plan, never commands to the simulation.
 */
export function planSiteProduction({ targets, stock = {}, importGoods = [], recipeChoice = {},
  recipes = SITE_RECIPES } = {}) {
  const demand = copyAmounts(targets, 'targets');
  const available = copyAmounts(stock, 'stock');
  const originalRemaining = { ...available };
  const usedStock = dict();
  const procurement = dict();
  const imported = new Set(importGoods);
  if ([...imported].some((id) => !safeId(id))) throw new TypeError('Invalid imported good');
  const byOutput = new Map();
  const ids = new Set();
  for (const r of recipes) {
    if (!safeId(r.id) || ids.has(r.id)) throw new Error(`Invalid or duplicate recipe: ${r.id}`);
    ids.add(r.id);
    const input = copyAmounts(r.inputs, `${r.id}.inputs`);
    const output = copyAmounts(r.output, `${r.id}.output`);
    if (!Object.keys(input).length || Object.keys(output).length !== 1) {
      throw new Error(`Recipe ${r.id} must have inputs and one output, matching the runtime`);
    }
    if (!(Number.isFinite(r.buildS) && r.buildS > 0)
      && !(Number.isFinite(r.inputRatePerMin) && r.inputRatePerMin > 0)) {
      throw new Error(`Recipe ${r.id} has no valid production rate`);
    }
    for (const good of Object.keys(output)) {
      if (!byOutput.has(good)) byOutput.set(good, []);
      byOutput.get(good).push(r);
    }
  }
  const steps = [];
  let expansions = 0;
  function consumeAvailable(good, requested) {
    const used = Math.min(requested, available[good] || 0);
    available[good] = Math.max(0, (available[good] || 0) - used);
    const fromOriginal = Math.min(used, originalRemaining[good] || 0);
    originalRemaining[good] = Math.max(0, (originalRemaining[good] || 0) - fromOriginal);
    add(usedStock, good, fromOriginal);
    return Math.max(0, requested - used);
  }
  function need(good, requested, path) {
    quantity(requested, good);
    if (++expansions > MAX_EXPANSIONS || path.length > 64) throw new RangeError('Production plan is too complex');
    const missing = consumeAvailable(good, requested);
    if (missing <= EPS) return;
    if (path.includes(good)) throw new Error(`Recipe cycle: ${[...path, good].join(' -> ')}`);
    const options = byOutput.get(good) || [];
    if (imported.has(good) || !options.length) { add(procurement, good, missing); return; }
    const chosenId = own(recipeChoice, good) ? recipeChoice[good] : null;
    const recipe = chosenId ? options.find((r) => r.id === chosenId)
      : (options.length === 1 ? options[0] : null);
    if (!recipe) throw new Error(`Choose a valid recipe for ${good}`);
    const perBatch = recipe.output[good];
    const discrete = Number.isFinite(recipe.buildS) && recipe.buildS > 0;
    const batches = discrete ? Math.ceil(missing / perBatch - EPS) : missing / perBatch;
    quantity(batches, 'batches');
    for (const [input, qty] of entries(recipe.inputs)) need(input, qty * batches, [...path, good]);
    const machineSeconds = discrete ? batches * recipe.buildS
      : batches * Object.values(recipe.inputs).reduce((sum, n) => sum + n, 0) / recipe.inputRatePerMin * 60;
    const outputQty = perBatch * batches;
    steps.push({ recipeId: recipe.id, machineId: recipe.machine, batches, machineSeconds,
      inputs: Object.fromEntries(entries(recipe.inputs).map(([id, n]) => [id, n * batches])),
      output: { [good]: outputQty } });
    add(available, good, Math.max(0, outputQty - missing));
  }
  // Reserve ALL final targets from initial inventory first. Otherwise a prerequisite of the
  // alphabetically first goal could spend inventory explicitly requested as a later final good.
  const unmet = dict();
  for (const [id, n] of entries(demand)) unmet[id] = consumeAvailable(id, n);
  for (const [id, n] of entries(unmet)) if (n > EPS) need(id, n, []);
  return {
    targets: clean(demand), procurement: clean(procurement), usedStock: clean(usedStock),
    remainingStock: clean(available), steps,
    machineSeconds: steps.reduce((total, s) => total + s.machineSeconds, 0),
    machineTypes: [...new Set(steps.map((s) => s.machineId))].sort(compare),
    executionValidated: false,
  };
}

/** Cargo/price metadata comes from the canonical commodity catalog supplied by the caller. */
export function summarizeIndustryCargo(amounts, commodities) {
  const values = copyAmounts(amounts, 'cargo');
  const catalog = new Map(commodities.map((c) => [c.id, c]));
  let units = 0;
  let mass = 0;
  let volume = 0;
  let nominalValue = 0;
  const unknownGoods = [];
  for (const [id, n] of entries(values)) {
    units += n;
    const c = catalog.get(id);
    if (!c || ![c.massPerU, c.volPerU, c.basePrice].every((v) => Number.isFinite(v) && v >= 0)) {
      unknownGoods.push(id); continue;
    }
    mass += c.massPerU * n;
    volume += c.volPerU * n;
    nominalValue += c.basePrice * n;
  }
  // A pod is fleet equipment, not an ordinary cargo commodity. Never silently price it at zero.
  return { units, mass, volume, nominalValue, unknownGoods, complete: !unknownGoods.length };
}
